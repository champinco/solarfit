const express = require('express');
const axios = require('axios');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://SolarFitAdmin:solarFIT1994@solarfit.qmdgeww.mongodb.net/solarApp?retryWrites=true&w=majority&appName=SolarFit';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here'; // Replace in production
const DEFAULT_SYSTEM_LOSS = 14;
const DEFAULT_PANEL_WATTS = 550;
const DEFAULT_BATTERY_UNIT_KWH = 5;
const DEFAULT_BATTERY_EFFICIENCY = 0.90;
const DEFAULT_DOD = 0.85;
const OFFGRID_PV_OVERSIZE_FACTOR = 1.30;
const HYBRID_PV_OVERSIZE_FACTOR = 1.15;
const INVERTER_LOAD_SAFETY_FACTOR = 1.25;

// Database
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB error:', err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
});
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});
const User = mongoose.model('User', userSchema);

const calculationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  calculationParams: Object,
  resultData: Object,
  createdAt: { type: Date, default: Date.now },
});
const Calculation = mongoose.model('Calculation', calculationSchema);

// Appliance Presets
const appliancePresets = {
  residential: [
    { name: 'LED Bulb', power: 10, peakFactor: 1.1 },
    { name: 'Fan', power: 75, peakFactor: 1.5 },
    { name: 'TV', power: 60, peakFactor: 1.2 },
  ],
  commercial: [
    { name: 'Office Light', power: 40, peakFactor: 1.1 },
    { name: 'Computer', power: 150, peakFactor: 1.2 },
  ],
  industrial: [
    { name: 'Motor', power: 750, peakFactor: 4 },
  ],
};

// Cache
const cache = {};

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(400).json({ message: 'Invalid token' });
  }
};

// Helpers
async function getCoordinates(location) {
  const cacheKey = `coords:${location.toLowerCase()}`;
  if (cache[cacheKey]) return cache[cacheKey];
  try {
    const response = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`, {
      headers: { 'User-Agent': 'SolarFit/1.0' },
      timeout: 8000,
    });
    if (response.data.length > 0) {
      const { lat, lon } = response.data[0];
      cache[cacheKey] = { lat: parseFloat(lat), lon: parseFloat(lon), displayName: response.data[0].display_name };
      return cache[cacheKey];
    }
    throw new Error('Location not found');
  } catch (error) {
    throw new Error(`Geocoding failed: ${error.message}`);
  }
}

async function getSolarIrradiance(lat, lon) {
  const cacheKey = `solar:${lat}:${lon}`;
  if (cache[cacheKey]) return cache[cacheKey];
  try {
    const response = await axios.get(`https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat}&lon=${lon}&peakpower=1&loss=${DEFAULT_SYSTEM_LOSS}`, { timeout: 15000 });
    cache[cacheKey] = response.data.outputs;
    return response.data.outputs;
  } catch (error) {
    console.error('Solar data error:', error);
    return { totals: { E_d: 5, E_y: 1800 }, monthly: [] }; // Mock data
  }
}

async function getComponentPrices() {
  return {
    panelCostPerWatt: 65,
    inverterCostPerKva: 13000,
    batteryCostPerKwh: 30000,
    chargeControllerCostPerKw: 4000,
    mountingStructureCostPerPanel: 3000,
    installationLaborCostFactor: 0.15,
    currency: 'KES',
  };
}

// Endpoints
app.get('/api/appliances', (req, res) => res.json(appliancePresets));

app.post('/api/signup', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  try {
    const user = new User({ username, password });
    await user.save();
    res.status(201).json({ message: 'Signup successful' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
  try {
    const user = await User.findOne({ username });
    if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ message: 'Invalid credentials' });
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/calculate', async (req, res) => {
  const params = req.body;
  try {
    const { lat, lon } = await getCoordinates(params.location);
    const solarData = await getSolarIrradiance(lat, lon);
    const dailyKwh = params.avgMonthlyKwh ? params.avgMonthlyKwh / 30 : params.appliances?.reduce((sum, a) => sum + (a.power * a.quantity * a.hoursPerDay / 1000), 0) || 0;
    const pvSizeKwP = dailyKwh / solarData.totals.E_d;
    const numberOfPanels = Math.ceil(pvSizeKwP * 1000 / params.panelWattage);
    const actualPvSizeKwP = numberOfPanels * params.panelWattage / 1000;
    const inverterSizeKva = actualPvSizeKwP * 1.2;
    let batterySizeKwh = 0, numberOfBatteryUnits = 0;
    if (params.systemType === 'off-grid') {
      batterySizeKwh = (dailyKwh * params.autonomyDays) / (params.depthOfDischarge * DEFAULT_BATTERY_EFFICIENCY);
      numberOfBatteryUnits = Math.ceil(batterySizeKwh / DEFAULT_BATTERY_UNIT_KWH);
    } else if (params.systemType === 'hybrid' && params.backupDurationHours) {
      batterySizeKwh = (dailyKwh / 24 * params.backupDurationHours) / (params.depthOfDischarge * DEFAULT_BATTERY_EFFICIENCY);
      numberOfBatteryUnits = Math.ceil(batterySizeKwh / DEFAULT_BATTERY_UNIT_KWH);
    }
    const prices = await getComponentPrices();
    const totalCost = (numberOfPanels * params.panelWattage * prices.panelCostPerWatt) + (inverterSizeKva * prices.inverterCostPerKva) + (batterySizeKwh * prices.batteryCostPerKwh);

    const result = {
      location: params.location,
      systemType: params.systemType,
      dailyEnergyConsumptionKwh: dailyKwh,
      pvSystem: { sizeKwP: actualPvSizeKwP, numberOfPanels, panelWattage: params.panelWattage },
      inverter: { sizeKva: inverterSizeKva },
      batterySystem: batterySizeKwh > 0 ? { actualCapacityKwh: numberOfBatteryUnits * DEFAULT_BATTERY_UNIT_KWH, numberOfUnits: numberOfBatteryUnits } : null,
      financial: { estimatedTotalCost: totalCost, currency: prices.currency, costBreakdown: { panels: numberOfPanels * params.panelWattage * prices.panelCostPerWatt, inverter: inverterSizeKva * prices.inverterCostPerKva, batteries: batterySizeKwh * prices.batteryCostPerKwh } },
    };
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/save-calculation', authenticateToken, async (req, res) => {
  const { calculationParams, resultData } = req.body;
  try {
    const calculation = new Calculation({ userId: req.user.userId, calculationParams, resultData });
    await calculation.save();
    res.status(201).json({ message: 'Saved' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/calculations', authenticateToken, async (req, res) => {
  try {
    const calculations = await Calculation.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(calculations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/generate-pdf', (req, res) => {
  const result = req.body;
  const doc = new PDFDocument();
  let buffers = [];
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {
    const pdfData = Buffer.concat(buffers);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="SolarFit.pdf"' }).end(pdfData);
  });

  doc.text('SolarFit Kenya', { align: 'center', fontSize: 20 });
  doc.moveDown();
  doc.text(`Location: ${result.location}`);
  doc.text(`System Type: ${result.systemType}`);
  doc.text(`PV Size: ${result.pvSystem.sizeKwP} kWp`);
  doc.text(`Total Cost: ${result.financial.estimatedTotalCost} ${result.financial.currency}`);
  doc.end();
});

app.listen(port, () => console.log(`Server running on port ${port}`));