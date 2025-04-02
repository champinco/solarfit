const express = require('express');
const axios = require('axios');
const cors = require('cors');
const PDFDocument = require('pdfkit');

const app = express();
const port = 5000;

// Middleware
app.use(express.json());
app.use(cors());

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

// Geocoding function using Nominatim
async function getCoordinates(location) {
  if (cache[location]) {
    console.log(`Using cached coordinates for ${location}`);
    return cache[location];
  }

  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`
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
    if (params.appliances && params.userType) {
      dailyKwh = params.appliances.reduce((sum, appliance) => {
        const applianceData = appliances[params.userType]?.find(a => a.name === appliance.name);
        if (applianceData) {
          const powerKW = applianceData.power / 1000; // Convert to kW
          return sum + (powerKW * appliance.quantity * appliance.hoursPerDay);
        }
        return sum;
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
    const inverterSize = pvSize * 0.9;
    const totalInverterCost = inverterSize * inverterCostPerKva;

    const chargeControllerCost = 30000; // KSh

    // System type calculations
    const autonomyDays = params.autonomyDays || 1;

    // On-grid (no batteries)
    const onGridCost = totalPanelCost + totalInverterCost + chargeControllerCost;

    // Off-grid (full battery backup)
    const batterySizeOffGrid = dailyKwh * autonomyDays * 1.25; // kWh, 25% oversizing
    const costPerBattery = 127500; // KSh for 5 kWh battery
    const numberOfBatteriesOffGrid = Math.ceil(batterySizeOffGrid / 5);
    const totalBatteryCostOffGrid = numberOfBatteriesOffGrid * costPerBattery;
    const offGridCost = totalPanelCost + totalInverterCost + totalBatteryCostOffGrid + chargeControllerCost;

    // Hybrid (half battery backup)
    const batterySizeHybrid = dailyKwh * autonomyDays * 0.5; // kWh
    const numberOfBatteriesHybrid = Math.ceil(batterySizeHybrid / 5);
    const totalBatteryCostHybrid = numberOfBatteriesHybrid * costPerBattery;
    const hybridCost = totalPanelCost + totalInverterCost + totalBatteryCostHybrid + chargeControllerCost;

    // Annual grid cost and savings
    const monthlyBill = params.avgMonthlyBill || (dailyKwh * 30 * 20); // 20 KSh/kWh
    const annualGridCost = monthlyBill * 12;
    const annualConsumption = dailyKwh * 365;
    const rate = annualGridCost / annualConsumption;

    const annualSavingsGridTied = Math.min(annualProduction, annualConsumption) * rate;
    const annualSavingsOffGrid = annualGridCost; // No grid usage
    const annualSavingsHybrid = annualSavingsGridTied; // Simplified assumption

    // Results for selected system type
    const selectedType = params.systemType || 'on-grid';
    let selectedCost, batterySize, numberOfBatteries, totalBatteryCost;
    if (selectedType === 'on-grid') {
      selectedCost = onGridCost;
      batterySize = null;
      numberOfBatteries = 0;
      totalBatteryCost = 0;
    } else if (selectedType === 'off-grid') {
      selectedCost = offGridCost;
      batterySize = batterySizeOffGrid;
      numberOfBatteries = numberOfBatteriesOffGrid;
      totalBatteryCost = totalBatteryCostOffGrid;
    } else {
      selectedCost = hybridCost;
      batterySize = batterySizeHybrid;
      numberOfBatteries = numberOfBatteriesHybrid;
      totalBatteryCost = totalBatteryCostHybrid;
    }

    const costBreakdown = {
      panels: Math.round(totalPanelCost),
      inverter: Math.round(totalInverterCost),
      batteries: selectedType !== 'on-grid' ? Math.round(totalBatteryCost) : 0,
      chargeController: chargeControllerCost,
      total: Math.round(selectedCost)
    };

    const results = {
      pvSizeKwP: parseFloat(pvSize.toFixed(2)),
      inverterSizeKva: parseFloat(inverterSize.toFixed(2)),
      batterySizeKwh: batterySize ? parseFloat(batterySize.toFixed(2)) : null,
      dailyPeakSunHours: parseFloat(dailyPeakSunHours.toFixed(2)),
      annualProductionKwh: parseFloat(annualProduction.toFixed(2)),
      estimatedCost: costBreakdown,
      numberOfPanels,
      panelWattage,
      numberOfBatteries,
      systemComparisons: {
        onGrid: { cost: Math.round(onGridCost), annualSavings: parseFloat(annualSavingsGridTied.toFixed(2)) },
        offGrid: { cost: Math.round(offGridCost), annualSavings: parseFloat(annualSavingsOffGrid.toFixed(2)) },
        hybrid: { cost: Math.round(hybridCost), annualSavings: parseFloat(annualSavingsHybrid.toFixed(2)) }
      }
    };

    console.log('Calculation results:', results);
    res.status(200).json(results);
  } catch (error) {
    console.error('Calculation error:', error.message);
    res.status(500).json({ message: 'Calculation failed', error: error.message });
  }
});

// PDF generation endpoint
app.post('/api/generate-pdf', (req, res) => {
  const data = req.body;
  const doc = new PDFDocument();
  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {
    const pdfData = Buffer.concat(buffers);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="solar_report.pdf"');
    res.send(pdfData);
  });

  doc.fontSize(16).text('Solar Sizing Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12)
    .text(`Location: ${data.location}`)
    .text(`System Type: ${data.systemType}`)
    .text(`PV Size: ${data.pvSizeKwP} kWp`)
    .text(`Inverter Size: ${data.inverterSizeKva} kVA`);
  if (data.batterySizeKwh) {
    doc.text(`Battery Size: ${data.batterySizeKwh} kWh`);
  }
  doc.text(`Number of Panels: ${data.numberOfPanels} (${data.panelWattage}W each)`)
    .text(`Estimated Total Cost: KSh ${data.estimatedCost.total.toLocaleString()}`)
    .moveDown()
    .text('Cost Breakdown:')
    .text(`- Panels: KSh ${data.estimatedCost.panels.toLocaleString()}`)
    .text(`- Inverter: KSh ${data.estimatedCost.inverter.toLocaleString()}`)
    .text(`- Charge Controller: KSh ${data.estimatedCost.chargeController.toLocaleString()}`);
  if (data.estimatedCost.batteries > 0) {
    doc.text(`- Batteries: KSh ${data.estimatedCost.batteries.toLocaleString()}`);
  }
  doc.end();
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});