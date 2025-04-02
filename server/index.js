const express = require('express');
const axios = require('axios');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 5000;

// Middleware
app.use(express.json());
app.use(cors());

// Set up multer for handling file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    // Create the directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only JPEG, JPG, and PNG files are allowed"));
    }
  }
});

// Cache for geocoding results
const cache = {};

// Extensive appliance list
const appliances = {
  residential: [
    { name: "TV", power: 100 },
    { name: "Fridge", power: 200 },
    { name: "Iron Box", power: 1000 },
    { name: "Washing Machine", power: 500 },
    { name: "Microwave", power: 1200 },
    { name: "Ceiling Fan", power: 75 },
    { name: "Air Conditioner", power: 1500 },
    { name: "Electric Kettle", power: 1800 },
    { name: "Water Heater", power: 2000 },
    { name: "Desktop Computer", power: 200 },
    { name: "Laptop", power: 60 },
    { name: "LED Bulb", power: 10 },
    { name: "Vacuum Cleaner", power: 800 }
  ],
  commercial: [
    { name: "Computer", power: 150 },
    { name: "Printer", power: 300 },
    { name: "Cash Register", power: 50 },
    { name: "Refrigerator", power: 400 },
    { name: "Air Conditioner", power: 1500 },
    { name: "Server", power: 500 },
    { name: "Coffee Machine", power: 1000 },
    { name: "Photocopier", power: 600 },
    { name: "Electric Sign", power: 200 },
    { name: "POS Terminal", power: 30 },
    { name: "Security Camera", power: 20 },
    { name: "Water Dispenser", power: 350 }
  ],
  industrial: [
    { name: "Motor", power: 1000 },
    { name: "Welder", power: 5000 },
    { name: "Compressor", power: 2000 },
    { name: "Conveyor Belt", power: 3000 },
    { name: "Industrial Oven", power: 5000 },
    { name: "Pump", power: 1500 },
    { name: "CNC Machine", power: 10000 },
    { name: "Industrial Fan", power: 800 },
    { name: "Crane", power: 7500 },
    { name: "Injection Molding Machine", power: 12000 },
    { name: "Drill Press", power: 2000 }
  ]
};

// Endpoint to provide the list of appliances
app.get('/api/appliances', (req, res) => {
  res.json(appliances);
});

// Endpoint to handle bill uploads
app.post('/api/upload', upload.single('bill'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  try {
    // This is where you would typically send the file to an OCR service
    // For now, we'll return mock data
    const mockData = {
      extractedData: {
        consumptionKwh: 320,
        totalAmount: 6400
      }
    };

    // In a real implementation, delete the file after processing
    // fs.unlinkSync(req.file.path);

    res.json(mockData);
  } catch (error) {
    console.error('Error processing uploaded file:', error);
    res.status(500).json({ message: 'Error processing bill', error: error.message });
  }
});

// Geocoding function using Nominatim
async function getCoordinates(location) {
  if (cache[location]) {
    console.log(`Using cached coordinates for ${location}`);
    return cache[location];
  }

  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`,
      {
        headers: { 'User-Agent': 'SolarSizingApp/1.0' }
      }
    );
    if (response.data.length > 0) {
      const { lat, lon } = response.data[0];
      cache[location] = { lat, lon };
      console.log(`Fetched coordinates for ${location}: lat=${lat}, lon=${lon}`);
      return { lat, lon };
    } else {
      throw new Error('Location not found');
    }
  } catch (error) {
    throw new Error(`Geocoding error: ${error.message}`);
  }
}

// Solar irradiance function with corrected data access
async function getSolarIrradiance(lat, lon) {
  try {
    const response = await axios.get(
      `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat}&lon=${lon}&outputformat=json&peakpower=1&loss=14&mountingplace=free`
    );
    if (response.data.outputs && response.data.outputs.monthly && Array.isArray(response.data.outputs.monthly.fixed)) {
      console.log(`Fetched solar irradiance for lat=${lat}, lon=${lon}`);
      return {
        monthly: response.data.outputs.monthly.fixed,
        totals: response.data.outputs.totals.fixed
      };
    } else {
      console.log('Unexpected API response:', response.data);
      throw new Error('Invalid solar data: monthly.fixed data missing or not an array');
    }
  } catch (error) {
    throw new Error(`Solar irradiance error: ${error.message}`);
  }
}

// Calculation endpoint with enhancements
app.post('/api/calculate', async (req, res) => {
  const params = req.body;
  const panelWattage = params.panelWattage || 400; // Default to 400W

  try {
    // Fetch coordinates
    const { lat, lon } = await getCoordinates(params.location);

    // Fetch solar irradiance data
    const irradianceData = await getSolarIrradiance(lat, lon);
    const monthlyIrradiance = irradianceData.monthly;
    const E_y = irradianceData.totals.E_y; // Annual production for 1 kWp

    // Calculate daily peak sun hours
    const annualIrradiance = monthlyIrradiance.reduce((sum, month) => sum + month.E_d, 0);
    const dailyPeakSunHours = annualIrradiance / 365;

    // Estimate daily energy consumption
    let dailyKwh = 0;
    
    if (params.appliances && params.appliances.length > 0) {
      dailyKwh = params.appliances.reduce((sum, appliance) => {
        const powerKW = appliance.power / 1000; // Convert to kW
        return sum + (powerKW * appliance.quantity * appliance.hoursPerDay);
      }, 0);
    } else {
      const monthlyKwh = params.avgMonthlyKwh || (params.avgMonthlyBill / 20); // Assuming 20 KSh/kWh
      dailyKwh = monthlyKwh / 30;
    }

    // Solar sizing formulas
    const systemEfficiency = 0.8; // 80% efficiency
    const pvSize = dailyKwh / (dailyPeakSunHours * systemEfficiency); // PV size in kWp
    const annualProduction = pvSize * E_y; // Annual production in kWh

    // Cost estimation
    const costPerWatt = 95; // KSh per watt
    const totalWatts = pvSize * 1000;
    const totalPanelCost = totalWatts * costPerWatt;
    const numberOfPanels = Math.ceil(totalWatts / panelWattage);

    const inverterCostPerKva = 10000; // KSh per kVA
    const inverterSize = pvSize * 1.2; // Inverter should be 20% larger than PV size
    const totalInverterCost = inverterSize * inverterCostPerKva;

    const chargeControllerCost = params.systemType !== 'on-grid' ? 30000 : 0; // KSh, only for off-grid and hybrid

    // System type calculations
    const autonomyDays = params.autonomyDays || 1;
    let batterySizeKwh = 0;
    let numberOfBatteries = 0;
    let totalBatteryCost = 0;
    let totalCost = 0;

    // Different system type calculations
    if (params.systemType === 'on-grid') {
      // On-grid (no batteries)
      totalCost = totalPanelCost + totalInverterCost;
    } else {
      // Off-grid or hybrid (with batteries)
      batterySizeKwh = dailyKwh * autonomyDays * 1.25; // kWh, 25% oversizing
      const batteryCapacity = 5; // kWh per battery
      const costPerBattery = 127500; // KSh for 5 kWh battery
      
      numberOfBatteries = Math.ceil(batterySizeKwh / batteryCapacity);
      totalBatteryCost = numberOfBatteries * costPerBattery;
      
      totalCost = totalPanelCost + totalInverterCost + totalBatteryCost + chargeControllerCost;
    }

    // Apply budget constraints if provided
    let budgetConstraint = false;
    if (params.budget && parseFloat(params.budget) > 0) {
      const budget = parseFloat(params.budget);
      if (totalCost > budget) {
        // Scale down the system to fit budget
        const scaleFactor = budget / totalCost;
        pvSize = pvSize * scaleFactor;
        totalWatts = pvSize * 1000;
        numberOfPanels = Math.ceil(totalWatts / panelWattage);
        inverterSize = pvSize * 1.2;
        
        // Recalculate costs
        totalPanelCost = totalWatts * costPerWatt;
        totalInverterCost = inverterSize * inverterCostPerKva;
        
        if (params.systemType !== 'on-grid') {
          batterySizeKwh = batterySizeKwh * scaleFactor;
          numberOfBatteries = Math.ceil(batterySizeKwh / 5);
          totalBatteryCost = numberOfBatteries * costPerBattery;
        }
        
        totalCost = totalPanelCost + totalInverterCost + totalBatteryCost + chargeControllerCost;
        budgetConstraint = true;
      }
    }

    // Prepare the result
    const result = {
      pvSizeKwP: pvSize,
      panelWattage: panelWattage,
      numberOfPanels: numberOfPanels,
      inverterSizeKva: inverterSize,
      dailyEnergyConsumption: dailyKwh,
      annualProduction: annualProduction,
      dailyPeakSunHours: dailyPeakSunHours,
      budgetConstrained: budgetConstraint,
      systemType: params.systemType,
      estimatedCost: {
        panels: Math.round(totalPanelCost),
        inverter: Math.round(totalInverterCost),
        batteries: Math.round(totalBatteryCost),
        chargeController: chargeControllerCost,
        total: Math.round(totalCost)
      }
    };

    // Add battery info only for off-grid and hybrid systems
    if (params.systemType !== 'on-grid') {
      result.batterySizeKwh = batterySizeKwh;
      result.numberOfBatteries = numberOfBatteries;
    }

    res.json(result);
  } catch (error) {
    console.error('Calculation error:', error);
    res.status(500).json({ message: 'Error calculating solar system', error: error.message });
  }
});

// PDF Generation endpoint
app.post('/api/generate-pdf', (req, res) => {
  const calculationResult = req.body;
  
  try {
    const doc = new PDFDocument();
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=solar_report.pdf');
    
    // Pipe the PDF directly to the response
    doc.pipe(res);
    
    // Add content to PDF
    doc.fontSize(20).text('Solar System Sizing Report', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(16).text('System Specifications:');
    doc.fontSize(12).text(`PV Size: ${calculationResult.pvSizeKwP.toFixed(2)} kWp`);
    doc.text(`Number of Panels: ${calculationResult.numberOfPanels} (${calculationResult.panelWattage}W each)`);
    doc.text(`Inverter Size: ${calculationResult.inverterSizeKva.toFixed(2)} kVA`);
    
    if (calculationResult.batterySizeKwh) {
      doc.text(`Battery Storage: ${calculationResult.batterySizeKwh.toFixed(2)} kWh`);
      doc.text(`Number of Batteries: ${calculationResult.numberOfBatteries}`);
    }
    
    doc.moveDown();
    doc.fontSize(16).text('Energy Analysis:');
    doc.fontSize(12).text(`Daily Energy Consumption: ${calculationResult.dailyEnergyConsumption.toFixed(2)} kWh`);
    doc.text(`Annual Energy Production: ${calculationResult.annualProduction.toFixed(2)} kWh`);
    doc.text(`Daily Peak Sun Hours: ${calculationResult.dailyPeakSunHours.toFixed(2)} hours`);
    
    doc.moveDown();
    doc.fontSize(16).text('Cost Breakdown:');
    doc.fontSize(12).text(`Solar Panels: ${calculationResult.estimatedCost.panels.toLocaleString()} KSh`);
    doc.text(`Inverter: ${calculationResult.estimatedCost.inverter.toLocaleString()} KSh`);
    
    if (calculationResult.estimatedCost.batteries > 0) {
      doc.text(`Batteries: ${calculationResult.estimatedCost.batteries.toLocaleString()} KSh`);
    }
    
    if (calculationResult.estimatedCost.chargeController > 0) {
      doc.text(`Charge Controller: ${calculationResult.estimatedCost.chargeController.toLocaleString()} KSh`);
    }
    
    doc.moveDown();
    doc.fontSize(14).text(`Total Estimated Cost: ${calculationResult.estimatedCost.total.toLocaleString()} KSh`, { underline: true });
    
    // Add system type specific notes
    doc.moveDown();
    doc.fontSize(16).text('System Notes:');
    
    if (calculationResult.systemType === 'on-grid') {
      doc.fontSize(12).text('This on-grid system will connect to your existing utility power and can reduce your electricity bills through net metering where available.');
    } else if (calculationResult.systemType === 'off-grid') {
      doc.fontSize(12).text('This off-grid system is designed to be completely independent from the utility grid with battery storage for energy during non-sunlight hours.');
    } else if (calculationResult.systemType === 'hybrid') {
      doc.fontSize(12).text('This hybrid system combines grid connection with battery storage, providing backup power during outages while still allowing grid connection for stability.');
    }
    
    if (calculationResult.budgetConstrained) {
      doc.moveDown();
      doc.fontSize(12).text('Note: System has been scaled to fit within your budget constraints.');
    }
    
    // Add footer
    doc.moveDown(2);
    doc.fontSize(10).text(`Generated on ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.text('This is an estimate only. Please consult with a solar professional for a detailed assessment.', { align: 'center' });
    
    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ message: 'Error generating PDF report', error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});