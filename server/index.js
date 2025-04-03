const express = require('express');
const axios = require('axios');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const port = 5000;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB Connection (Updated)
mongoose.connect('mongodb://127.0.0.1:27017/solarApp')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model('User', userSchema);

// Calculation Schema
const calculationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  calculationData: Object,
  createdAt: { type: Date, default: Date.now },
});
const Calculation = mongoose.model('Calculation', calculationSchema);

// Multer Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) cb(null, true);
    else cb(new Error('Only JPEG, JPG, and PNG files are allowed'));
  },
});

// Appliance List
const appliances = {
  residential: [
    { name: 'TV', power: 100 },
    { name: 'Fridge', power: 200 },
    { name: 'Iron Box', power: 1000 },
    { name: 'Washing Machine', power: 500 },
    { name: 'Microwave', power: 1200 },
    { name: 'Ceiling Fan', power: 75 },
    { name: 'Air Conditioner', power: 1500 },
    { name: 'Electric Kettle', power: 1800 },
    { name: 'Water Heater', power: 2000 },
    { name: 'Desktop Computer', power: 200 },
    { name: 'Laptop', power: 60 },
    { name: 'LED Bulb', power: 10 },
    { name: 'Vacuum Cleaner', power: 800 },
  ],
  commercial: [
    { name: 'Computer', power: 150 },
    { name: 'Printer', power: 300 },
    { name: 'Cash Register', power: 50 },
    { name: 'Refrigerator', power: 400 },
    { name: 'Air Conditioner', power: 1500 },
    { name: 'Server', power: 500 },
    { name: 'Coffee Machine', power: 1000 },
    { name: 'Photocopier', power: 600 },
    { name: 'Electric Sign', power: 200 },
    { name: 'POS Terminal', power: 30 },
    { name: 'Security Camera', power: 20 },
    { name: 'Water Dispenser', power: 350 },
  ],
  industrial: [
    { name: 'Motor', power: 1000 },
    { name: 'Welder', power: 5000 },
    { name: 'Compressor', power: 2000 },
    { name: 'Conveyor Belt', power: 3000 },
    { name: 'Industrial Oven', power: 5000 },
    { name: 'Pump', power: 1500 },
    { name: 'CNC Machine', power: 10000 },
    { name: 'Industrial Fan', power: 800 },
    { name: 'Crane', power: 7500 },
    { name: 'Injection Molding Machine', power: 12000 },
    { name: 'Drill Press', power: 2000 },
  ],
};

// Cache
const cache = {};

// Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  jwt.verify(token, 'secretKey', (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Endpoints
app.get('/api/appliances', (req, res) => res.json(appliances));

// User Signup
app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    await user.save();
    res.json({ message: 'User created' });
  } catch (error) {
    res.status(500).json({ message: 'Signup failed', error: error.message });
  }
});

// User Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id }, 'secretKey');
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

// Save Calculation (Protected)
app.post('/api/save-calculation', authenticateToken, async (req, res) => {
  try {
    const calculation = new Calculation({ userId: req.user.userId, calculationData: req.body });
    await calculation.save();
    res.json({ message: 'Calculation saved' });
  } catch (error) {
    res.status(500).json({ message: 'Error saving calculation', error: error.message });
  }
});

// Get User Calculations (Protected)
app.get('/api/calculations', authenticateToken, async (req, res) => {
  try {
    const calculations = await Calculation.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(calculations);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching calculations', error: error.message });
  }
});

// Geocoding Function
async function getCoordinates(location) {
  if (cache[location]) return cache[location];
  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}`,
      { headers: { 'User-Agent': 'SolarSizingApp/1.0' } }
    );
    if (response.data.length > 0) {
      const { lat, lon } = response.data[0];
      cache[location] = { lat, lon };
      return { lat, lon };
    }
    throw new Error('Location not found');
  } catch (error) {
    throw new Error(`Geocoding error: ${error.message}`);
  }
}

// Solar Irradiance with PVGIS
async function getSolarIrradiance(lat, lon, tilt, azimuth, shading) {
  try {
    const response = await axios.get(
      `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat}&lon=${lon}&outputformat=json&peakpower=1&loss=14&mountingplace=free&angle=${tilt}&aspect=${azimuth}&loss_shading=${shading}`
    );
    if (response.data.outputs && response.data.outputs.monthly && Array.isArray(response.data.outputs.monthly.fixed)) {
      return {
        monthly: response.data.outputs.monthly.fixed,
        totals: response.data.outputs.totals.fixed,
      };
    }
    throw new Error('Invalid solar data');
  } catch (error) {
    throw new Error(`Solar irradiance error: ${error.message}`);
  }
}

// Dynamic Pricing - Mock Function
async function getComponentPrices(location) {
  return {
    panelCostPerWatt: 95,
    inverterCostPerKva: 10000,
    batteryCost: 127500,
    chargeControllerCost: 30000,
  };
}

// Calculation Endpoint
app.post('/api/calculate', async (req, res) => {
  const params = req.body;
  const panelWattage = params.panelWattage || 400;

  try {
    const { lat, lon } = await getCoordinates(params.location);
    const irradianceData = await getSolarIrradiance(lat, lon, params.tilt || 0, params.azimuth || 180, params.shading || 0);
    const monthlyIrradiance = irradianceData.monthly;
    const E_y = irradianceData.totals.E_y;

    const annualIrradiance = monthlyIrradiance.reduce((sum, month) => sum + month.E_d, 0);
    const dailyPeakSunHours = annualIrradiance / 365;

    let dailyKwh = 0;
    if (params.appliances && params.appliances.length > 0) {
      dailyKwh = params.appliances.reduce((sum, appliance) => {
        const powerKW = appliance.power / 1000;
        return sum + powerKW * appliance.quantity * appliance.hoursPerDay;
      }, 0);
    } else {
      const monthlyKwh = params.avgMonthlyKwh || params.avgMonthlyBill / 20;
      dailyKwh = monthlyKwh / 30;
    }

    const systemEfficiency = 0.8;
    const pvSize = dailyKwh / (dailyPeakSunHours * systemEfficiency);
    const annualProduction = pvSize * E_y;

    const prices = await getComponentPrices(params.location);
    const totalWatts = pvSize * 1000;
    const totalPanelCost = totalWatts * prices.panelCostPerWatt;
    const numberOfPanels = Math.ceil(totalWatts / panelWattage);

    const inverterSize = pvSize * 1.2;
    const totalInverterCost = inverterSize * prices.inverterCostPerKva;

    const chargeControllerCost = params.systemType !== 'on-grid' ? prices.chargeControllerCost : 0;

    let batterySizeKwh = 0, numberOfBatteries = 0, totalBatteryCost = 0, totalCost = 0;
    const autonomyDays = params.autonomyDays || 1;

    if (params.systemType === 'on-grid') {
      totalCost = totalPanelCost + totalInverterCost;
    } else {
      batterySizeKwh = dailyKwh * autonomyDays * 1.25;
      const batteryCapacity = 5;
      numberOfBatteries = Math.ceil(batterySizeKwh / batteryCapacity);
      totalBatteryCost = numberOfBatteries * prices.batteryCost;
      totalCost = totalPanelCost + totalInverterCost + totalBatteryCost + chargeControllerCost;
    }

    let budgetConstraint = false;
    if (params.budget && parseFloat(params.budget) > 0) {
      const budget = parseFloat(params.budget);
      if (totalCost > budget) {
        const scaleFactor = budget / totalCost;
        pvSize *= scaleFactor;
        totalWatts = pvSize * 1000;
        numberOfPanels = Math.ceil(totalWatts / panelWattage);
        inverterSize = pvSize * 1.2;
        totalPanelCost = totalWatts * prices.panelCostPerWatt;
        totalInverterCost = inverterSize * prices.inverterCostPerKva;
        if (params.systemType !== 'on-grid') {
          batterySizeKwh *= scaleFactor;
          numberOfBatteries = Math.ceil(batterySizeKwh / 5);
          totalBatteryCost = numberOfBatteries * prices.batteryCost;
        }
        totalCost = totalPanelCost + totalInverterCost + totalBatteryCost + chargeControllerCost;
        budgetConstraint = true;
      }
    }

    const monthlyProduction = monthlyIrradiance.map(month => ({
      month: month.month,
      production: (pvSize * month.E_d * 30),
    }));

    const result = {
      pvSizeKwP: pvSize,
      panelWattage,
      numberOfPanels,
      inverterSizeKva: inverterSize,
      dailyEnergyConsumption: dailyKwh,
      annualProduction,
      dailyPeakSunHours,
      budgetConstrained: budgetConstraint,
      systemType: params.systemType,
      monthlyProduction,
      estimatedCost: {
        panels: Math.round(totalPanelCost),
        inverter: Math.round(totalInverterCost),
        batteries: Math.round(totalBatteryCost),
        chargeController: chargeControllerCost,
        total: Math.round(totalCost),
      },
    };

    if (params.systemType !== 'on-grid') {
      result.batterySizeKwh = batterySizeKwh;
      result.numberOfBatteries = numberOfBatteries;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Error calculating solar system', error: error.message });
  }
});

// PDF Generation
app.post('/api/generate-pdf', (req, res) => {
  const calculationResult = req.body;
  const doc = new PDFDocument();
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename=solar_report.pdf');
  doc.pipe(res);

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

  doc.moveDown();
  doc.fontSize(16).text('Monthly Production Estimate:');
  calculationResult.monthlyProduction.forEach(m => {
    doc.fontSize(12).text(`Month ${m.month}: ${m.production.toFixed(2)} kWh`);
  });

  doc.moveDown();
  doc.fontSize(10).text(`Generated on ${new Date().toLocaleDateString()}`, { align: 'center' });
  doc.end();
});

app.listen(port, () => console.log(`Server running on port ${port}`));