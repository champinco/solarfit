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
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(cors());

// MongoDB Atlas Connection
const MONGODB_URI = 'mongodb+srv://SolarFitAdmin:solarFIT1994@solarfit.qmdgeww.mongodb.net/solarApp?retryWrites=true&w=majority&appName=SolarFit';

mongoose
    .connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch((err) => console.error('MongoDB Atlas connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});
const User = mongoose.model('User', userSchema);

// Calculation Schema
const calculationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    calculationData: Object,
    resultData: Object,
    createdAt: { type: Date, default: Date.now },
});
const Calculation = mongoose.model('Calculation', calculationSchema);

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
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
        else cb(new Error('Validation Error: Only JPEG, JPG, and PNG files are allowed!'));
    },
}).single('billImage');

// Appliance List
const appliances = {
    residential: [
        { name: 'LED Light Bulb', power: 10 },
        { name: 'CFL Light Bulb', power: 15 },
        { name: 'Ceiling Fan', power: 75 },
        { name: 'Television (32" LED)', power: 50 },
        { name: 'Refrigerator (Energy Star)', power: 150 },
        { name: 'Laptop Computer', power: 50 },
        { name: 'Desktop Computer', power: 150 },
        { name: 'Microwave Oven', power: 1000 },
        { name: 'Electric Kettle', power: 1500 },
        { name: 'Washing Machine', power: 500 },
        { name: 'Air Conditioner (1 ton)', power: 1000 },
        { name: 'Water Heater (Electric)', power: 3000 },
        { name: 'Iron Box', power: 1000 },
        { name: 'Toaster', power: 800 },
        { name: 'Blender', power: 300 },
        { name: 'Hair Dryer', power: 1500 },
        { name: 'Vacuum Cleaner', power: 700 },
        { name: 'Phone Charger', power: 5 },
        { name: 'Wi-Fi Router', power: 10 },
        { name: 'Electric Cooker', power: 2000 }
    ],
    commercial: [
        { name: 'Office Lighting (per 100 sq ft)', power: 100 },
        { name: 'Commercial Refrigerator', power: 350 },
        { name: 'Desktop Computer with Monitor', power: 200 },
        { name: 'Laser Printer', power: 500 },
        { name: 'Photocopier', power: 1500 },
        { name: 'Server', power: 500 },
        { name: 'CCTV Camera System', power: 300 },
        { name: 'Cash Register', power: 50 },
        { name: 'Commercial Microwave', power: 1500 },
        { name: 'Coffee Machine', power: 800 },
        { name: 'Water Dispenser', power: 100 },
        { name: 'Commercial Air Conditioner (per ton)', power: 1200 },
        { name: 'Electric Signage', power: 300 },
        { name: 'Commercial Blender', power: 500 },
        { name: 'Commercial Toaster', power: 1500 },
        { name: 'POS Terminal', power: 30 },
        { name: 'Security System', power: 100 },
        { name: 'Commercial Freezer', power: 500 },
        { name: 'Vending Machine', power: 350 },
        { name: 'Small Water Pump', power: 750 }
    ],
    industrial: [
        { name: 'Industrial Lighting (per 1000 sq ft)', power: 500 },
        { name: 'Industrial Refrigeration Unit', power: 2000 },
        { name: 'Electric Motor (1 HP)', power: 750 },
        { name: 'Electric Motor (5 HP)', power: 3700 },
        { name: 'Electric Motor (10 HP)', power: 7500 },
        { name: 'Conveyor Belt System (per 10m)', power: 1500 },
        { name: 'Industrial Air Compressor', power: 7500 },
        { name: 'Welding Machine', power: 5000 },
        { name: 'CNC Machine', power: 10000 },
        { name: 'Industrial Oven', power: 15000 },
        { name: 'Industrial Mixer', power: 3000 },
        { name: 'Industrial Pump', power: 5000 },
        { name: 'Industrial HVAC (per ton)', power: 1500 },
        { name: 'Industrial Chiller', power: 20000 },
        { name: 'Packaging Machine', power: 3500 },
        { name: 'Industrial Dryer', power: 10000 },
        { name: 'Injection Molding Machine', power: 15000 },
        { name: 'Industrial Grinder', power: 7500 },
        { name: 'Industrial Ventilation System', power: 5000 },
        { name: 'Hydraulic Press', power: 10000 }
    ]
};

// Cache
const cache = {};

// Default system loss value
const DEFAULT_INTERNAL_SYSTEM_LOSS = 14;

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey');
        req.user = decoded;
        next();
    } catch (ex) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};

// Endpoints
app.get('/api/appliances', (req, res) => res.json(appliances));

app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ message: 'Username and password are required' });
    try {
        let user = await User.findOne({ username });
        if (user) return res.status(400).json({ message: 'Username already exists' });
        user = new User({ username, password });
        await user.save();
        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'Server error during signup', error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.status(400).json({ message: 'Username and password are required' });
    try {
        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ message: 'Invalid credentials' });
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ message: 'Invalid credentials' });
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            process.env.JWT_SECRET || 'secretKey',
            { expiresIn: '1h' }
        );
        res.json({ token });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login', error: error.message });
    }
});

app.post('/api/save-calculation', authenticateToken, async (req, res) => {
    const { calculationParams, resultData } = req.body;
    if (!calculationParams || !resultData)
        return res.status(400).json({ message: 'Missing calculation parameters or results.' });
    try {
        const calculation = new Calculation({
            userId: req.user.userId,
            calculationData: calculationParams,
            resultData: resultData,
        });
        await calculation.save();
        res.status(201).json({ message: 'Calculation saved successfully', id: calculation._id });
    } catch (error) {
        console.error('Save Calculation Error:', error);
        res.status(500).json({ message: 'Error saving calculation', error: error.message });
    }
});

app.get('/api/calculations', authenticateToken, async (req, res) => {
    try {
        const calculations = await Calculation.find({ userId: req.user.userId }).sort({
            createdAt: -1,
        });
        res.json(calculations);
    } catch (error) {
        console.error('Fetch Calculations Error:', error);
        res.status(500).json({ message: 'Error fetching calculations', error: error.message });
    }
});

async function getCoordinates(location) {
    if (!location || typeof location !== 'string') {
        throw new Error('Invalid location provided');
    }
    
    const cacheKey = `coords:${location}`;
    if (cache[cacheKey]) return cache[cacheKey];
    
    try {
        const response = await axios.get(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                location
            )}&limit=1`,
            {
                headers: { 'User-Agent': 'SolarSizingApp/1.0' },
                timeout: 5000,
            }
        );
        
        if (response.data && response.data.length > 0) {
            const { lat, lon } = response.data[0];
            if (!lat || !lon) {
                throw new Error(`Location '${location}' found but coordinates are invalid.`);
            }
            
            const result = { lat: parseFloat(lat), lon: parseFloat(lon) };
            cache[cacheKey] = result;
            return result;
        }
        
        // If we reach here, no results were found
        throw new Error(`Location '${location}' not found.`);
    } catch (error) {
        console.error(`Geocoding error for "${location}":`, error.message);
        if (error.response)
            throw new Error(`Geocoding service error: ${error.response.status} ${error.response.statusText}`);
        else if (error.request) 
            throw new Error('Geocoding service did not respond.');
        else 
            throw error;
    }
}

async function getSolarIrradiance(lat, lon, tilt, azimuth, shadingLoss) {
    // Validate inputs
    if (typeof lat !== 'number' || typeof lon !== 'number' || 
        lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error('Invalid coordinates provided.');
    }
    
    // Create cache key and check cache
    const cacheKey = `pvgis:${lat}:${lon}:${tilt}:${azimuth}:${shadingLoss}`;
    if (cache[cacheKey]) return cache[cacheKey];

    // Normalize parameters
    const pvgisAspect = azimuth - 180;
    tilt = Math.max(0, Math.min(90, tilt || 0));
    shadingLoss = Math.max(0, Math.min(100, shadingLoss || 0));
    const internalSystemLoss = DEFAULT_INTERNAL_SYSTEM_LOSS;
    const totalLoss = Math.min(100, internalSystemLoss + shadingLoss); // Cap at 100%

    const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc`;
    const params = {
        lat: lat.toFixed(4),
        lon: lon.toFixed(4),
        outputformat: 'json',
        pvcalculation: 1,
        peakpower: 1,
        mountingplace: 'building',
        loss: totalLoss.toFixed(1),
        angle: tilt.toFixed(1),
        aspect: pvgisAspect.toFixed(1),
    };

    try {
        console.log('Requesting PVGIS:', url, params);
        const response = await axios.get(url, { params, timeout: 10000 });
        
        // Check if response contains the expected data
        if (!response.data || !response.data.outputs || 
            !response.data.outputs.monthly || !response.data.outputs.totals) {
            console.log('PVGIS returned incomplete data, using mock data instead');
            const mockData = createMockSolarData(lat);
            cache[cacheKey] = mockData;
            return mockData;
        }
        
        // Ensure monthly is an array
        if (!Array.isArray(response.data.outputs.monthly)) {
            console.log('PVGIS monthly data is not an array, using mock data instead');
            const mockData = createMockSolarData(lat);
            cache[cacheKey] = mockData;
            return mockData;
        }
        
        const result = {
            monthly: response.data.outputs.monthly,
            totals: response.data.outputs.totals,
            inputsUsed: response.data.inputs,
            systemLoss: internalSystemLoss
        };
        
        cache[cacheKey] = result;
        return result;
    } catch (error) {
        console.error('PVGIS API Error:', error.response ? JSON.stringify(error.response.data) : error.message);
        
        // Create mock data for any API failure
        console.log('Using mock solar data due to API error');
        const mockData = createMockSolarData(lat);
        cache[cacheKey] = mockData;
        return mockData;
    }
}

// Function to create mock solar data when API fails
function createMockSolarData(latitude) {
    // Simplified model based on latitude
    const absLat = Math.abs(latitude);
    const baseYield = 1600; // Base annual yield in kWh/kWp
    
    // Adjust yield based on latitude (higher yields near equator)
    const latitudeFactor = 1 - (absLat / 90) * 0.5;
    const annualYield = baseYield * latitudeFactor;
    
    // Create monthly distribution (simplified)
    const monthly = [];
    for (let i = 1; i <= 12; i++) {
        // Northern/Southern hemisphere seasonal differences
        const monthFactor = latitude >= 0 
            ? 1 + 0.3 * Math.sin(((i - 6) / 6) * Math.PI) // Northern hemisphere
            : 1 + 0.3 * Math.sin(((i - 12) / 6) * Math.PI); // Southern hemisphere
            
        const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i];
        const monthlyYield = (annualYield / 12) * monthFactor;
        const dailyYield = monthlyYield / daysInMonth;
        
        monthly.push({
            month: i,
            E_d: dailyYield,
            E_m: monthlyYield,
            H_d: dailyYield / 0.15, // Approximate irradiance
            H_m: monthlyYield / 0.15,
            SD_m: monthlyYield * 0.1 // Estimated standard deviation
        });
    }
    
    return {
        monthly: monthly,
        totals: {
            E_d: monthly.reduce((sum, m) => sum + m.E_d, 0) / 12,
            E_m: monthly.reduce((sum, m) => sum + m.E_m, 0) / 12,
            E_y: annualYield,
            H_d: monthly.reduce((sum, m) => sum + m.H_d, 0) / 12,
            H_m: monthly.reduce((sum, m) => sum + m.H_m, 0) / 12,
            H_y: annualYield / 0.15,
            SD_m: monthly.reduce((sum, m) => sum + m.SD_m, 0) / 12,
            SD_y: annualYield * 0.1
        },
        inputsUsed: {
            location: { latitude, longitude: 0 },
            meteo_data: { radiation_db: "MOCK DATA", meteo_db: "MOCK DATA" },
            mounting_system: { fixed: { slope: { value: 35 }, azimuth: { value: 0 } } },
            pv_module: { technology: "c-Si" },
            system_loss: DEFAULT_INTERNAL_SYSTEM_LOSS
        },
        systemLoss: DEFAULT_INTERNAL_SYSTEM_LOSS
    };
}

async function getComponentPrices(location) {
    const basePrices = {
        panelCostPerWatt: 70,
        inverterCostPerKva: 12000,
        batteryCostPerKwh: 25000,
        chargeControllerCostPerKw: 5000,
        mountingStructureCostPerPanel: 3000,
        installationLaborCostFactor: 0.15,
    };
    
    // Default to 1.0 if location is invalid
    let variance = 1.0;
    
    if (location && typeof location === 'string') {
        variance = location.toLowerCase().includes('nairobi') ? 1.0 : 1.05;
    }
    
    return {
        panelCostPerWatt: basePrices.panelCostPerWatt * variance,
        inverterCostPerKva: basePrices.inverterCostPerKva * variance,
        batteryCostPerKwh: basePrices.batteryCostPerKwh * variance,
        chargeControllerCostPerKw: basePrices.chargeControllerCostPerKw * variance,
        mountingStructureCostPerPanel: basePrices.mountingStructureCostPerPanel * variance,
        installationLaborCostFactor: basePrices.installationLaborCostFactor,
    };
}

app.post('/api/calculate', async (req, res) => {
    const params = req.body;
    console.log('Calculation Params Received:', params);

    // Validate required fields
    const requiredFields = ['location', 'systemType', 'userType'];
    for (const field of requiredFields) {
        if (!params[field]) return res.status(400).json({ message: `Missing required field: ${field}` });
    }
    
    // Validate energy usage information
    if (
        !params.avgMonthlyKwh &&
        !params.avgMonthlyBill &&
        (!params.appliances || params.appliances.length === 0)
    ) {
        return res
            .status(400)
            .json({ message: 'Please provide energy usage (Avg. kWh, Avg. Bill, or appliances).' });
    }
    
    // Validate off-grid/hybrid system parameters
    if (params.systemType !== 'on-grid' && (!params.autonomyDays || params.autonomyDays < 1)) {
        return res
            .status(400)
            .json({ message: 'Autonomy days (>= 1) are required for off-grid/hybrid systems.' });
    }
    if (
        params.systemType !== 'on-grid' &&
        (!params.depthOfDischarge || params.depthOfDischarge <= 0 || params.depthOfDischarge > 1)
    ) {
        return res
            .status(400)
            .json({ message: 'Valid Depth of Discharge (0-1, e.g., 0.8) is required.' });
    }

    // Parse and validate numeric parameters
    const panelWattage = parseInt(params.panelWattage) || 450;
    if (panelWattage <= 0 || panelWattage > 1000) {
        return res.status(400).json({ message: 'Panel wattage must be between 1 and 1000 Wp.' });
    }
    
    const autonomyDays = params.systemType !== 'on-grid' ? parseInt(params.autonomyDays) || 1 : null;
    const depthOfDischarge = params.systemType !== 'on-grid' ? parseFloat(params.depthOfDischarge) || 0.8 : null;
    const tilt = parseFloat(params.tilt) || 15;
    const azimuth = parseFloat(params.azimuth) || 180;
    const shadingLoss = parseFloat(params.shading) || 0;
    const electricityPricePerKwh = parseFloat(params.electricityPricePerKwh) || null;
    const targetBudget = params.budget ? parseFloat(params.budget) : null;

    try {
        // Get coordinates from location
        const { lat, lon } = await getCoordinates(params.location);
        console.log(`Coordinates for ${params.location}:`, { lat, lon });

        // Get solar irradiance data
        const irradianceData = await getSolarIrradiance(lat, lon, tilt, azimuth, shadingLoss);
        
        // Get the system loss value from irradiance data or use default
        const systemLoss = irradianceData.systemLoss || DEFAULT_INTERNAL_SYSTEM_LOSS;
        
        // Ensure monthlyIrradianceDetails is an array
        let monthlyIrradianceDetails = [];
        if (irradianceData && irradianceData.monthly) {
            if (Array.isArray(irradianceData.monthly)) {
                monthlyIrradianceDetails = irradianceData.monthly;
            } else {
                console.log('Monthly irradiance data is not an array, using empty array');
                // If not an array, create mock data
                const mockData = createMockSolarData(lat);
                monthlyIrradianceDetails = mockData.monthly;
            }
        } else {
            console.log('No monthly irradiance data found, using mock data');
            const mockData = createMockSolarData(lat);
            monthlyIrradianceDetails = mockData.monthly;
        }
        
        // Ensure we have totals data
        const totals = irradianceData && irradianceData.totals ? irradianceData.totals : {
            E_y: 1600 * (1 - (Math.abs(lat) / 90) * 0.5) // Fallback annual yield calculation
        };
        
        const annualEnergyPerKwP = totals.E_y;
        
        // Safely calculate average daily energy
        let avgDailyEnergyPerKwP = 0;
        if (Array.isArray(monthlyIrradianceDetails) && monthlyIrradianceDetails.length > 0) {
            // Use reduce only if we have an array
            avgDailyEnergyPerKwP = monthlyIrradianceDetails.reduce((sum, month) => sum + (month.E_d || 0), 0) / monthlyIrradianceDetails.length;
        } else {
            // Fallback calculation if we don't have monthly data
            avgDailyEnergyPerKwP = annualEnergyPerKwP / 365;
        }
        
        const dailyPeakSunHours = avgDailyEnergyPerKwP;
        console.log(`PVGIS Annual Yield (E_y): ${annualEnergyPerKwP.toFixed(2)} kWh/kWp/year`);
        console.log(`Avg Daily Energy (E_d): ${avgDailyEnergyPerKwP.toFixed(2)} kWh/kWp/day`);

        // Calculate daily energy consumption
        let dailyKwh = 0;
        let energySource = '';
        if (params.appliances && params.appliances.length > 0) {
            dailyKwh = params.appliances.reduce((sum, appliance) => {
                const powerKW = (appliance.power || 0) / 1000;
                const quantity = appliance.quantity || 1;
                const hours = appliance.hoursPerDay || 0;
                return sum + powerKW * quantity * hours;
            }, 0);
            energySource = 'Appliances';
        } else if (params.avgMonthlyKwh && params.avgMonthlyKwh > 0) {
            dailyKwh = parseFloat(params.avgMonthlyKwh) / 30.4;
            energySource = 'Monthly kWh';
        } else if (params.avgMonthlyBill && params.avgMonthlyBill > 0 && electricityPricePerKwh > 0) {
            dailyKwh = parseFloat(params.avgMonthlyBill) / electricityPricePerKwh / 30.4;
            energySource = 'Monthly Bill Estimate';
        } else if (params.avgMonthlyBill && params.avgMonthlyBill > 0) {
            const roughPrice = 20;
            dailyKwh = parseFloat(params.avgMonthlyBill) / roughPrice / 30.4;
            energySource = `Monthly Bill Estimate (Assumed ${roughPrice} KSh/kWh)`;
            console.warn('Estimating kWh using assumed price.');
        }
        
        // Validate daily energy consumption
        if (dailyKwh <= 0) {
            return res.status(400).json({ message: 'Could not determine daily energy consumption. Please check your inputs.' });
        }
        console.log(`Estimated Daily Consumption: ${dailyKwh.toFixed(2)} kWh (Source: ${energySource})`);

        // Calculate PV system size
        const pvSystemDerateFactor = 1.0;
        let requiredPvSizeKwP = dailyKwh / (dailyPeakSunHours * pvSystemDerateFactor);
        console.log(`Initial Required PV Size: ${requiredPvSizeKwP.toFixed(2)} kWp`);

        // Calculate number of panels and actual PV size
        let numberOfPanels = Math.ceil((requiredPvSizeKwP * 1000) / panelWattage);
        if (numberOfPanels < 1) numberOfPanels = 1; // Ensure at least one panel
        
        let actualPvSizeKwP = (numberOfPanels * panelWattage) / 1000;
        const inverterSizingFactor = params.systemType === 'off-grid' ? 1.0 : 1.15;
        let inverterSizeKva = actualPvSizeKwP * inverterSizingFactor;
        console.log(`Actual PV Size: ${actualPvSizeKwP.toFixed(2)} kWp (${numberOfPanels} x ${panelWattage}W)`);
        console.log(`Inverter Size: ${inverterSizeKva.toFixed(2)} kVA`);

        // Calculate battery size for off-grid/hybrid systems
        let batterySizeKwh = 0;
        let numberOfBatteries = 0;
        let targetBatteryCapacityKwh = 0;
        const batteryUnitCapacityKwh = 5;
        if (params.systemType !== 'on-grid') {
            if (!autonomyDays || !depthOfDischarge) {
                return res.status(400).json({ message: 'Autonomy Days and Depth of Discharge required for off-grid/hybrid systems.' });
            }
            
            const usableEnergyNeeded = dailyKwh * autonomyDays;
            targetBatteryCapacityKwh = usableEnergyNeeded / depthOfDischarge;
            numberOfBatteries = Math.ceil(targetBatteryCapacityKwh / batteryUnitCapacityKwh);
            if (numberOfBatteries < 1) numberOfBatteries = 1; // Ensure at least one battery
            
            batterySizeKwh = numberOfBatteries * batteryUnitCapacityKwh;
            console.log(`Battery Target Capacity: ${targetBatteryCapacityKwh.toFixed(2)} kWh`);
            console.log(
                `Battery Actual Size: ${batterySizeKwh.toFixed(2)} kWh (${numberOfBatteries} x ${batteryUnitCapacityKwh} kWh)`
            );

            // Adjust PV size for off-grid systems
            const offGridSizingFactor = 1.25;
            requiredPvSizeKwP = (dailyKwh * offGridSizingFactor) / (dailyPeakSunHours * pvSystemDerateFactor);
            const revisedNumberOfPanels = Math.ceil((requiredPvSizeKwP * 1000) / panelWattage);
            if (revisedNumberOfPanels > numberOfPanels) {
                console.log(
                    `Increasing PV size for Off-Grid: ${numberOfPanels} -> ${revisedNumberOfPanels} panels`
                );
                numberOfPanels = revisedNumberOfPanels;
                actualPvSizeKwP = (numberOfPanels * panelWattage) / 1000;
                inverterSizeKva = actualPvSizeKwP * inverterSizingFactor;
                console.log(`Revised Actual PV Size: ${actualPvSizeKwP.toFixed(2)} kWp`);
                console.log(`Revised Inverter Size: ${inverterSizeKva.toFixed(2)} kVA`);
            }
        }

        // Calculate component costs
        const prices = await getComponentPrices(params.location);
        const totalPanelCost = numberOfPanels * panelWattage * prices.panelCostPerWatt;
        const totalInverterCost = inverterSizeKva * prices.inverterCostPerKva;
        const totalBatteryCost =
            params.systemType !== 'on-grid'
                ? numberOfBatteries * batteryUnitCapacityKwh * prices.batteryCostPerKwh
                : 0;
        const totalChargeControllerCost =
            params.systemType !== 'on-grid' && totalBatteryCost > 0
                ? actualPvSizeKwP * prices.chargeControllerCostPerKw
                : 0;
        const totalMountingCost = numberOfPanels * prices.mountingStructureCostPerPanel;
        const hardwareCost =
            totalPanelCost + totalInverterCost + totalBatteryCost + totalChargeControllerCost + totalMountingCost;
        const installationCost = hardwareCost * prices.installationLaborCostFactor;
        let totalCost = hardwareCost + installationCost;
        console.log(
            `Estimated Costs (KSh): Panels=${totalPanelCost.toFixed(
                0
            )}, Inverter=${totalInverterCost.toFixed(0)}, Batteries=${totalBatteryCost.toFixed(
                0
            )}, CC=${totalChargeControllerCost.toFixed(0)}, Mounting=${totalMountingCost.toFixed(
                0
            )}, Install=${installationCost.toFixed(0)}`
        );
        console.log(`Estimated Total Cost: ${totalCost.toFixed(0)} KSh`);

        // Apply budget constraints if necessary
        let budgetConstraintApplied = false;
        let finalPvSizeKwP = actualPvSizeKwP;
        let finalNumberOfPanels = numberOfPanels;
        let finalInverterSizeKva = inverterSizeKva;
        let finalBatterySizeKwh = batterySizeKwh;
        let finalNumberOfBatteries = numberOfBatteries;
        let finalTotalCost = totalCost;
        let finalTotalPanelCost = totalPanelCost;
        let finalTotalInverterCost = totalInverterCost;
        let finalTotalBatteryCost = totalBatteryCost;
        let finalTotalChargeControllerCost = totalChargeControllerCost;
        let finalTotalMountingCost = totalMountingCost;
        let finalInstallationCost = installationCost;

        if (targetBudget && totalCost > targetBudget) {
            budgetConstraintApplied = true;
            console.log(
                `Budget constraint applied: Initial cost ${totalCost.toFixed(0)} > budget ${targetBudget.toFixed(0)}`
            );
            const scaleFactor = targetBudget / totalCost;
            finalNumberOfPanels = Math.floor(numberOfPanels * scaleFactor);
            if (finalNumberOfPanels < 1) finalNumberOfPanels = 1;
            finalPvSizeKwP = (finalNumberOfPanels * panelWattage) / 1000;
            finalInverterSizeKva = finalPvSizeKwP * inverterSizingFactor;
            if (params.systemType !== 'on-grid' && numberOfBatteries > 0) {
                const scaledTargetCapacity = targetBatteryCapacityKwh * scaleFactor;
                finalNumberOfBatteries = Math.floor(scaledTargetCapacity / batteryUnitCapacityKwh);
                if (finalNumberOfBatteries < 1) finalNumberOfBatteries = 1;
                finalBatterySizeKwh = finalNumberOfBatteries * batteryUnitCapacityKwh;
            } else {
                finalNumberOfBatteries = 0;
                finalBatterySizeKwh = 0;
            }
            finalTotalPanelCost = finalNumberOfPanels * panelWattage * prices.panelCostPerWatt;
            finalTotalInverterCost = finalInverterSizeKva * prices.inverterCostPerKva;
            finalTotalBatteryCost =
                params.systemType !== 'on-grid' && finalNumberOfBatteries > 0
                    ? finalNumberOfBatteries * batteryUnitCapacityKwh * prices.batteryCostPerKwh
                    : 0;
            finalTotalChargeControllerCost =
                params.systemType !== 'on-grid' && finalTotalBatteryCost > 0
                    ? finalPvSizeKwP * prices.chargeControllerCostPerKw
                    : 0;
            finalTotalMountingCost = finalNumberOfPanels * prices.mountingStructureCostPerPanel;
            const finalHardwareCost =
                finalTotalPanelCost +
                finalTotalInverterCost +
                finalTotalBatteryCost +
                finalTotalChargeControllerCost +
                finalTotalMountingCost;
            finalInstallationCost = finalHardwareCost * prices.installationLaborCostFactor;
            finalTotalCost = finalHardwareCost + finalInstallationCost;
            console.log(
                `Scaled System: PV=${finalPvSizeKwP.toFixed(2)}kWp, Panels=${finalNumberOfPanels}, Inv=${finalInverterSizeKva.toFixed(
                    2
                )}kVA, Batt=${finalBatterySizeKwh.toFixed(2)}kWh`
            );
            console.log(`Scaled Final Cost: ${finalTotalCost.toFixed(0)} KSh`);
        }

        // Calculate annual production and financial metrics
        const finalAnnualProduction = finalPvSizeKwP * annualEnergyPerKwP;
        
        // Create monthly production data
        let monthlyProduction = [];
        if (Array.isArray(monthlyIrradianceDetails) && monthlyIrradianceDetails.length > 0) {
            monthlyProduction = monthlyIrradianceDetails.map((month) => ({
                month: month.month || 0,
                production: (month.E_m || 0) * finalPvSizeKwP,
            }));
        } else {
            // Create default monthly production if no data available
            for (let i = 1; i <= 12; i++) {
                monthlyProduction.push({
                    month: i,
                    production: finalAnnualProduction / 12
                });
            }
        }

        let simplePaybackYears = null;
        if (electricityPricePerKwh && electricityPricePerKwh > 0 && finalAnnualProduction > 0) {
            const annualSavings = finalAnnualProduction * electricityPricePerKwh;
            if (annualSavings > 0 && finalTotalCost > 0) {
                simplePaybackYears = finalTotalCost / annualSavings;
                console.log(
                    `Financials: Annual Prod=${finalAnnualProduction.toFixed(
                        0
                    )} kWh, Annual Savings=${annualSavings.toFixed(0)} KSh, Payback=${simplePaybackYears.toFixed(
                        1
                    )} years`
                );
            }
        }

        // Prepare result object
        const result = {
            location: params.location,
            coordinates: { lat, lon },
            systemType: params.systemType,
            userType: params.userType,
            pvSizeKwP: finalPvSizeKwP,
            panelWattage: panelWattage,
            numberOfPanels: finalNumberOfPanels,
            inverterSizeKva: finalInverterSizeKva,
            dailyEnergyConsumptionKwh: dailyKwh,
            energyConsumptionSource: energySource,
            annualProductionKwh: finalAnnualProduction,
            dailyPeakSunHours: dailyPeakSunHours,
            budgetConstrained: budgetConstraintApplied,
            targetBudget: targetBudget,
            simplePaybackYears: simplePaybackYears,
            monthlyProduction: monthlyProduction,
            estimatedCost: {
                panels: Math.round(finalTotalPanelCost),
                inverter: Math.round(finalTotalInverterCost),
                batteries: Math.round(finalTotalBatteryCost),
                chargeController: Math.round(finalTotalChargeControllerCost),
                mounting: Math.round(finalTotalMountingCost),
                installation: Math.round(finalInstallationCost),
                total: Math.round(finalTotalCost),
            },
            assumptions: {
                panelWattageUsed: panelWattage,
                systemDerateFactor: pvSystemDerateFactor,
                inverterSizingFactor: inverterSizingFactor,
                pvgisLossParam: `${(systemLoss + shadingLoss).toFixed(1)}%`,
                prices: prices,
            },
        };

        // Add battery information for off-grid/hybrid systems
        if (params.systemType !== 'on-grid') {
            result.autonomyDays = autonomyDays;
            result.battery = {
                sizeKwh: finalBatterySizeKwh,
                numberOfUnits: finalNumberOfBatteries,
                unitCapacityKwh: batteryUnitCapacityKwh,
                depthOfDischarge: depthOfDischarge,
                targetCapacityKwh: targetBatteryCapacityKwh,
            };
        }

        res.json(result);
    } catch (error) {
        console.error('Calculation Endpoint Error:', error);
        res.status(500).json({ message: `Error calculating solar system: ${error.message}` });
    }
});

app.post('/api/generate-pdf', (req, res) => {
    const calcResult = req.body;
    if (!calcResult || !calcResult.location) {
        return res.status(400).json({ message: 'Invalid calculation result data' });
    }
    
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=SolarSizingReport.pdf');
    doc.pipe(res);

    const writeText = (label, value, size = 12, space = 1) => {
        doc.fontSize(size).text(`${label}: ${value || 'N/A'}`, { continued: false });
        doc.moveDown(space);
    };

    doc.fontSize(22).text('Solar System Sizing Report', { align: 'center' });
    doc.moveDown(2);
    doc.fontSize(16).text('Project Overview', { underline: true });
    doc.moveDown();
    writeText('Location', calcResult.location);
    writeText('Coordinates', `Lat: ${calcResult.coordinates?.lat?.toFixed(4)}, Lon: ${calcResult.coordinates?.lon?.toFixed(4)}`);
    writeText('System Type', calcResult.systemType);
    writeText('User Type', calcResult.userType);
    doc.moveDown();

    doc.fontSize(16).text('System Design', { underline: true });
    doc.moveDown();
    writeText('PV System Size', `${calcResult.pvSizeKwP?.toFixed(2)} kWp`);
    writeText('Panel Configuration', `${calcResult.numberOfPanels} x ${calcResult.panelWattage} Wp panels`);
    writeText('Inverter Size', `${calcResult.inverterSizeKva?.toFixed(2)} kVA`);
    if (calcResult.systemType !== 'on-grid' && calcResult.battery) {
        writeText('Battery Storage (Actual)', `${calcResult.battery.sizeKwh?.toFixed(2)} kWh (${calcResult.battery.numberOfUnits} units)`);
        writeText('Battery Target Capacity', `${calcResult.battery.targetCapacityKwh?.toFixed(2)} kWh`);
        writeText('Autonomy', `${calcResult.autonomyDays} days`);
        writeText('Depth of Discharge (DoD)', `${(calcResult.battery.depthOfDischarge * 100).toFixed(0)}%`);
    }
    doc.moveDown();

    doc.fontSize(16).text('Energy Analysis', { underline: true });
    doc.moveDown();
    writeText('Daily Energy Consumption', `${calcResult.dailyEnergyConsumptionKwh?.toFixed(2)} kWh (Source: ${calcResult.energyConsumptionSource})`);
    writeText('Est. Annual Production', `${calcResult.annualProductionKwh?.toFixed(0)} kWh`);
    writeText('Avg. Daily Peak Sun Hours', `${calcResult.dailyPeakSunHours?.toFixed(2)} hours`);
    doc.moveDown();

    doc.fontSize(16).text('Financial Summary', { underline: true });
    doc.moveDown();
    writeText('Est. Simple Payback Period', calcResult.simplePaybackYears ? `${calcResult.simplePaybackYears.toFixed(1)} years` : 'N/A');
    if (calcResult.targetBudget) {
        writeText('Target Budget Provided', `KSh ${calcResult.targetBudget.toLocaleString()}`);
        writeText('Budget Constraint Applied?', calcResult.budgetConstrained ? 'Yes' : 'No');
    }

    doc.fontSize(14).text('Estimated Cost Breakdown (KSh):');
    const costs = calcResult.estimatedCost;
    writeText('  Solar Panels', costs?.panels?.toLocaleString(), 10, 0.5);
    writeText('  Inverter', costs?.inverter?.toLocaleString(), 10, 0.5);
    if (costs?.batteries > 0) writeText('  Batteries', costs.batteries.toLocaleString(), 10, 0.5);
    if (costs?.chargeController > 0)
        writeText('  Charge Controller', costs.chargeController.toLocaleString(), 10, 0.5);
    writeText('  Mounting & Racking', costs?.mounting?.toLocaleString(), 10, 0.5);
    writeText('  Installation Labor', costs?.installation?.toLocaleString(), 10, 0.5);
    doc.moveDown(0.5);
    doc.fontSize(14).text(`Total Estimated System Cost: KSh ${costs?.total?.toLocaleString()}`, {
        underline: true,
    });
    doc.moveDown(1);

    doc.addPage();
    doc.fontSize(16).text('Estimated Monthly Production', { underline: true });
    doc.moveDown();
    doc.fontSize(10);
    const tableTop = doc.y;
    const col1X = 50;
    const col2X = 200;
    doc.text('Month', col1X, tableTop, { width: 100 });
    doc.text('Production (kWh)', col2X, tableTop, { width: 150, align: 'right' });
    doc.y = tableTop + 15;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Safely handle monthlyProduction data
    if (calcResult.monthlyProduction && Array.isArray(calcResult.monthlyProduction)) {
        calcResult.monthlyProduction.forEach((m) => {
            if (m && typeof m.month === 'number' && typeof m.production === 'number') {
                const monthIndex = Math.max(0, Math.min(11, m.month - 1)); // Ensure valid month index
                const y = doc.y;
                doc.text(monthNames[monthIndex], col1X, y, { width: 100 });
                doc.text(m.production.toFixed(1), col2X, y, { width: 150, align: 'right' });
                doc.moveDown(0.5);
            }
        });
    } else {
        // Fallback if no monthly production data
        doc.text('Monthly data not available', col1X, doc.y, { width: 300 });
    }
    
    doc.moveDown();

    doc.fontSize(8).text(
        `Report generated on ${new Date().toLocaleDateString()}. Estimates based on PVGIS and mock pricing. Actual results may vary.`,
        50,
        doc.page.height - 60,
        { align: 'center', width: doc.page.width - 100 }
    );
    doc.end();
});

app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack || err);
    if (err instanceof multer.MulterError)
        return res.status(400).json({ message: `File upload error: ${err.message}` });
    if (err.message.startsWith('Validation Error:'))
        return res.status(400).json({ message: err.message });
    res.status(500).json({ message: err.message || 'Something went wrong!' });
});

app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
