const express = require('express');
const axios = require('axios');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const path = require('path'); // Corrected path import
const fs = require('fs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// --- Configuration ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://SolarFitAdmin:solarFIT1994@solarfit.qmdgeww.mongodb.net/solarApp?retryWrites=true&w=majority&appName=SolarFit';
const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_REALLY_SECRET_KEY_CHANGE_ME'; // CRITICAL: Use ENV VAR!
const DEFAULT_SYSTEM_LOSS = 14;
const DEFAULT_PANEL_WATTS = 550;
const DEFAULT_BATTERY_UNIT_KWH = 5;
const DEFAULT_BATTERY_EFFICIENCY = 0.90;
const DEFAULT_INVERTER_EFFICIENCY = 0.96;
const DEFAULT_DOD = 0.85;
const OFFGRID_PV_OVERSIZE_FACTOR = 1.30;
const HYBRID_PV_OVERSIZE_FACTOR = 1.15;
const INVERTER_LOAD_SAFETY_FACTOR = 1.25;
const INVERTER_PEAK_LOAD_FACTOR = 2.0;
const INVERTER_PV_LINK_FACTOR = 1.2;
const MIN_BATTERY_BACKUP_WH = 500;

// --- Database Connection ---
mongoose
    .connect(MONGODB_URI)
    .then(() => console.log('Successfully connected to MongoDB Atlas'))
    .catch((err) => console.error('MongoDB Atlas connection error:', err));

// --- Schemas ---
// User Schema (Keep as is, including pre-save hook)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
});
userSchema.pre('save', async function (next) { /* ... as before ... */
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});
const User = mongoose.model('User', userSchema);

// Calculation Schema (Keep as is)
const calculationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    calculationParams: Object,
    resultData: Object,
    createdAt: { type: Date, default: Date.now },
});
const Calculation = mongoose.model('Calculation', calculationSchema);

// --- Appliance Data (Keep enhanced structure) ---
const appliancePresets = {
    residential: [
        { name: 'LED Bulb (10W)', power: 10, peakFactor: 1.1 }, { name: 'Ceiling Fan', power: 75, peakFactor: 1.5 }, { name: 'Television (42" LED)', power: 60, peakFactor: 1.2 }, { name: 'Refrigerator (Modern Energy Star)', power: 120, peakFactor: 3.5 }, { name: 'Freezer Chest (Medium)', power: 100, peakFactor: 3.5 }, { name: 'Laptop + Charger', power: 65, peakFactor: 1.1 }, { name: 'Microwave Oven', power: 1100, peakFactor: 1.2 }, { name: 'Phone Charger', power: 7, peakFactor: 1.1 }, { name: 'Wi-Fi Router & Modem', power: 15, peakFactor: 1.1 }, { name: 'Washing Machine (cycle avg)', power: 500, peakFactor: 2.5 }, { name: 'Water Pump (0.5 HP)', power: 375, peakFactor: 3.0 }, { name: 'Iron Box', power: 1200, peakFactor: 1.1 }, { name: 'Instant Shower', power: 3500, peakFactor: 1.05 },
    ],
    commercial: [ { name: 'Office LED Panel', power: 40, peakFactor: 1.1 }, { name: 'Desktop Computer + Monitor', power: 150, peakFactor: 1.2 }, { name: 'Laser Printer (Idle/Printing Avg)', power: 300, peakFactor: 2 }, { name: 'Office Fan', power: 60, peakFactor: 1.5 }, { name: 'Server (Small)', power: 250, peakFactor: 1.2 }, { name: 'Point of Sale (POS) System', power: 40, peakFactor: 1.1 }, { name: 'Commercial Refrigerator (Display)', power: 350, peakFactor: 3 }, { name: 'Air Conditioner (1 Ton)', power: 1200, peakFactor: 2.5 },
    ],
    industrial: [ { name: 'High Bay LED Light', power: 150, peakFactor: 1.1 }, { name: 'Electric Motor (1 HP / 0.75 kW)', power: 750, peakFactor: 4 }, { name: 'Electric Motor (5 HP / 3.7 kW)', power: 3700, peakFactor: 4 }, { name: 'Welding Machine (Small Inverter)', power: 3000, peakFactor: 1.5 }, { name: 'Compressor (Medium)', power: 2200, peakFactor: 3.5 }, { name: 'Industrial Fan (Large)', power: 500, peakFactor: 2 },
    ]
};

// --- Cache ---
const cache = {};

// --- Authentication Middleware (Keep as is) ---
const authenticateToken = (req, res, next) => { /* ... as before ... */
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (ex) {
        console.error("Invalid Token:", ex.message);
        res.status(400).json({ message: 'Invalid token.' });
    }
};

// --- Helper Functions ---

// getCoordinates (Keep enhanced version)
async function getCoordinates(location) { /* ... as before ... */
    if (!location || typeof location !== 'string') throw new Error('Invalid location provided');
    const cacheKey = `coords:${location.toLowerCase().trim()}`;
    if (cache[cacheKey]) return cache[cacheKey];

    try {
        console.log(`Geocoding location: ${location}`);
        const response = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`, {
            headers: { 'User-Agent': 'SolarFitApp/1.1 (NodeJS; +https://solarfit.app/about)' },
            timeout: 8000,
        });
        if (response.data && response.data.length > 0) {
            const { lat, lon, display_name } = response.data[0];
            if (lat && lon) {
                const result = { lat: parseFloat(lat), lon: parseFloat(lon), displayName: display_name };
                cache[cacheKey] = result;
                console.log(`Geocoded "${location}" to: ${display_name} (${lat}, ${lon})`);
                return result;
            }
        }
        throw new Error(`Location '${location}' not found or coordinates invalid.`);
    } catch (error) {
        console.error(`Geocoding error for "${location}":`, error.message);
        if (error.response) throw new Error(`Geocoding service error: ${error.response.status} for ${location}. Try a different phrasing?`);
        else if (error.request) throw new Error('Geocoding service did not respond. Check network or try again later.');
        else throw new Error(`Could not determine coordinates for ${location}. ${error.message}`);
    }
}


// createMockSolarData (Keep as is)
function createMockSolarData(lat) { /* ... as before ... */
    console.warn("PVGIS API failed or returned invalid data. Using MOCK solar data based on latitude.");
    // ... rest of the mock data generation ...
        const baseAnnualYield = 1650;
        const latitudeFactor = Math.cos(Math.abs(lat) * Math.PI / 180);
        const annualYield = baseAnnualYield * latitudeFactor * 0.9;
        const avgDailyYield = annualYield / 365;

        // (Monthly breakdown logic here if needed for mock)
        const monthly = Array.from({length: 12}, (_, i) => ({
            month: i + 1,
            E_d: avgDailyYield * (1 + 0.2 * Math.cos((i - 6) * Math.PI / 6)), // Simple seasonal variation mock
            E_m: avgDailyYield * (1 + 0.2 * Math.cos((i - 6) * Math.PI / 6)) * (new Date(2023, i+1, 0).getDate()),
            SD_m: avgDailyYield * 0.15 * (new Date(2023, i+1, 0).getDate()),
        }));

        return {
        monthly: monthly.map(m => ({ ...m, E_d: parseFloat(m.E_d.toFixed(3)), E_m: parseFloat(m.E_m.toFixed(2)), SD_m: parseFloat(m.SD_m.toFixed(2)) })),
        totals: {
            E_d: parseFloat(avgDailyYield.toFixed(3)), // Avg Daily Energy (per kWp)
            E_y: parseFloat(annualYield.toFixed(2)), // Total Annual Energy (per kWp)
            SD_y: parseFloat((annualYield * 0.1).toFixed(2)) // Mock standard deviation
        },
        inputsUsed: { // Mimic PVGIS structure
            location: { latitude: lat, longitude: 'N/A (Mock)' },
            meteo_data: { radiation_db: "MOCK", meteo_db: "MOCK" },
            loss: DEFAULT_SYSTEM_LOSS // Use default loss for mock
        },
        isMockData: true // Flag
    };
}


// getSolarIrradiance (Keep enhanced version)
async function getSolarIrradiance(lat, lon, tilt = 15, azimuth = 180, shadingLoss = 0) { /* ... same logic as enhanced version before ... */
    tilt = Math.max(0, Math.min(90, Number(tilt) || 15));
    azimuth = Math.max(0, Math.min(359, Number(azimuth) || 180));
    shadingLoss = Math.max(0, Math.min(99, Number(shadingLoss) || 0));
    const pvgisAspect = azimuth - 180;
    const totalLoss = Math.min(100, DEFAULT_SYSTEM_LOSS + shadingLoss);
    const cacheKey = `pvgis:v5.2:${lat.toFixed(3)}:${lon.toFixed(3)}:${tilt}:${pvgisAspect}:${totalLoss.toFixed(1)}`;
    if (cache[cacheKey]) {
        console.log("PVGIS Cache Hit");
        return cache[cacheKey];
    }
    const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc`;
    const params = { lat: lat.toFixed(4), lon: lon.toFixed(4), peakpower: 1, pvcalculation: 1, mountingplace: 'building', loss: totalLoss.toFixed(1), angle: tilt.toFixed(1), aspect: pvgisAspect.toFixed(1), outputformat: 'json', browser: 0 };
    try {
        console.log(`Requesting PVGIS data: Lat=${params.lat}, Lon=${params.lon}, Tilt=${params.angle}, Aspect=${params.aspect}, Loss=${params.loss}%`);
        const response = await axios.get(url, { params, timeout: 15000 });
        if (response.data?.outputs?.totals?.E_d > 0 && Array.isArray(response.data.outputs?.monthly)) {
             const result = { /* structure as before */
                monthly: response.data.outputs.monthly,
                totals: {
                   E_d: parseFloat(response.data.outputs.totals.E_d), E_m: parseFloat(response.data.outputs.totals.E_m), E_y: parseFloat(response.data.outputs.totals.E_y),
                   SD_m: parseFloat(response.data.outputs.totals.SD_m), SD_y: parseFloat(response.data.outputs.totals.SD_y),
                   l_i: parseFloat(response.data.outputs.totals.l_i || 0), l_t: parseFloat(response.data.outputs.totals.l_t || 0), l_total: parseFloat(response.data.outputs.totals.l_total || totalLoss)
               },
                inputsUsed: response.data.inputs, pvgisLossParamSent: totalLoss, isMockData: false
            };
            cache[cacheKey] = result;
            console.log(`PVGIS Success: Avg Daily Yield (E_d) = ${result.totals.E_d.toFixed(3)} kWh/kWp/day`);
            return result;
        } else {
             console.error("PVGIS returned unusable data format:", JSON.stringify(response.data).substring(0, 500));
             return createMockSolarData(lat);
        }
    } catch (error) {
        let pvgisErrorMsg = `PVGIS API Error for ${lat}, ${lon}: `;
        if (error.response) { pvgisErrorMsg += `Status ${error.response.status}. Data: ${JSON.stringify(error.response.data)?.substring(0, 200)}`; }
        else if (error.request) { pvgisErrorMsg += 'No response received from PVGIS server.'; }
        else { pvgisErrorMsg += error.message; }
        console.error(pvgisErrorMsg);
        return createMockSolarData(lat);
    }
}

// getComponentPrices (Keep enhanced simulation)
async function getComponentPrices(location = "", userType = 'residential', pvKwP = 1, inverterKva = 1) { /* ... same enhanced simulation logic ... */
     const basePrices = {
        panelCostPerWatt_Low: 55, panelCostPerWatt_Mid: 65, panelCostPerWatt_High: 80,
        inverterCostPerKva_GT: 9000, inverterCostPerKva_Hybrid_Low: 10500, inverterCostPerKva_Hybrid_Mid: 13000, inverterCostPerKva_Hybrid_High: 18000,
        batteryCostPerKwh_Low: 25000, batteryCostPerKwh_Mid: 30000, batteryCostPerKwh_High: 40000,
        chargeControllerCostPerKw_MPPT_Mid: 4000, chargeControllerCostPerKw_MPPT_High: 6000,
        mountingStructureCostPerPanel_Mabati: 3000, mountingStructureCostPerPanel_Tile: 4500,
        installationLaborCostFactor: 0.15, installationComplexityMultiplier: 1.0
    };
    let panelPriceTier = basePrices.panelCostPerWatt_Mid;
    let inverterPriceTier = basePrices.inverterCostPerKva_Hybrid_Mid;
    let batteryPriceTier = basePrices.batteryCostPerKwh_Mid;
    let ccPriceTier = basePrices.chargeControllerCostPerKw_MPPT_Mid;
    let mountingPrice = basePrices.mountingStructureCostPerPanel_Mabati;
    if (userType === 'commercial' || userType === 'industrial') {
        panelPriceTier = (basePrices.panelCostPerWatt_Low + basePrices.panelCostPerWatt_Mid) / 2;
        inverterPriceTier = basePrices.inverterCostPerKva_Hybrid_Low;
        batteryPriceTier = (basePrices.batteryCostPerKwh_Low + basePrices.batteryCostPerKwh_Mid) / 2;
    }
    if (pvKwP > 10) { panelPriceTier *= 0.95; inverterPriceTier *= 0.95; batteryPriceTier *= 0.98; }
    let variance = 1.0;
    const lowerLocation = location.toLowerCase();
    if (lowerLocation.includes("nairobi")) variance = 1.0;
    else if (lowerLocation.includes("mombasa") || lowerLocation.includes("kisumu")) variance = 1.03;
    else variance = 1.08;

    console.log(`Price Simulation Note: Using estimated KES price tiers targeting brands commonly available (e.g., via Chloride Exide, Davis & Shirtliff, Solinc, etc.). These are NOT real-time quotes.`);

    return {
        panelCostPerWatt: panelPriceTier * variance, inverterCostPerKva: inverterPriceTier * variance, batteryCostPerKwh: batteryPriceTier * variance,
        chargeControllerCostPerKw: ccPriceTier * variance, mountingStructureCostPerPanel: mountingPrice * variance,
        installationLaborCostFactor: basePrices.installationLaborCostFactor, currency: "KES",
        simulationNote: "Prices are simulated estimates based on common Kenyan market tiers (e.g., reflecting brands from suppliers like Chloride Exide, Davis & Shirtliff, Suntech/local distributors). Not real-time quotes."
    };
}


// --- API Endpoints ---

app.get('/api/appliances', (req, res) => res.json(appliancePresets));

// --- Auth Endpoints (Keep as is) ---
app.post('/api/signup', async (req, res) => { /* ... as before ... */
    // ... (validation and user creation/saving logic) ...
    const { username, password } = req.body;
    if (!username || !password || password.length < 6) {
        return res.status(400).json({ message: 'Username and password (min 6 chars) are required.' });
    }
    try {
        let user = await User.findOne({ username: username.toLowerCase() });
        if (user) return res.status(400).json({ message: 'Username already exists.' });
        user = new User({ username, password });
        await user.save();
        res.status(201).json({ message: 'User created successfully. Please login.' });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'Server error during signup.', error: error.message });
    }
});

app.post('/api/login', async (req, res) => { /* ... as before ... */
    // ... (validation, user find, password compare, JWT generation) ...
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password are required.' });
    try {
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) return res.status(401).json({ message: 'Invalid credentials.' });
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ message: 'Invalid credentials.' });
        const token = jwt.sign({ userId: user._id, username: user.username }, JWT_SECRET, { expiresIn: '2h' });
        res.json({ token });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login.', error: error.message });
    }
});

// --- Calculation Endpoint (Keep MAJOR UPDATES from enhanced version) ---
app.post('/api/calculate', async (req, res) => {
    const params = req.body;
    console.log('Calculation Request Received:', params);

    // --- Enhanced Validation ---
    const errors = [];
    if (!params.location) errors.push("Project Location is required.");
    // ... (all other validations for systemType, userType, energy inputs, price, panel wattage) ...
    if (!['on-grid', 'off-grid', 'hybrid'].includes(params.systemType)) errors.push("Valid System Type (On-Grid, Off-Grid, Hybrid) is required.");
    if (!['residential', 'commercial', 'industrial'].includes(params.userType)) errors.push("Valid User Type (Residential, Commercial, Industrial) is required.");
    const energyProvided = params.avgMonthlyKwh || params.avgMonthlyBill || (params.appliances && params.appliances.length > 0);
    if (!energyProvided) errors.push("Please provide energy usage (Avg. Monthly kWh, Avg. Monthly Bill, or detailed appliances).");
    if (params.avgMonthlyBill && (!params.electricityPricePerKwh || parseFloat(params.electricityPricePerKwh) <= 0)) errors.push("Electricity Price (KES/kWh > 0) is required when using Avg. Monthly Bill.");
    if (!params.electricityPricePerKwh || parseFloat(params.electricityPricePerKwh) <= 0) errors.push("Valid Electricity Price (KES/kWh > 0) is required for financial calculations.");
    const panelWattage = parseInt(params.panelWattage) || DEFAULT_PANEL_WATTS;
    if (isNaN(panelWattage) || panelWattage <= 50 || panelWattage > 1000) errors.push("Panel Wattage must be a number between 50 and 1000 Wp.");


    let systemVoltage = parseInt(params.systemVoltage) || 48;
    let depthOfDischarge = parseFloat(params.depthOfDischarge);
    let autonomyDays = 0; // Used only for off-grid
    let backupDurationHours = 0; // Used only for hybrid

    // Specific validation for Off-Grid and Hybrid
    if (params.systemType === 'off-grid') {
        autonomyDays = parseFloat(params.autonomyDays);
        if (isNaN(autonomyDays) || autonomyDays < 0.5) errors.push("Autonomy days (>= 0.5) required for Off-Grid.");
        if (isNaN(depthOfDischarge) || depthOfDischarge <= 0.1 || depthOfDischarge > 1) errors.push("Valid DoD (0.1-1.0) required for Off-Grid.");
        if (![12, 24, 48].includes(systemVoltage)) errors.push("Valid System Voltage (12, 24, or 48 V) required for Off-Grid.");
        depthOfDischarge = depthOfDischarge || DEFAULT_DOD;
    } else if (params.systemType === 'hybrid') {
        backupDurationHours = parseFloat(params.backupDurationHours); // Use backupDurationHours for Hybrid
        if (isNaN(backupDurationHours) || backupDurationHours < 0) errors.push("Valid Backup Duration (>= 0 hours) required for Hybrid.");
        if (backupDurationHours > 0) { // Only validate DoD/Voltage if backup is needed
             if (isNaN(depthOfDischarge) || depthOfDischarge <= 0.1 || depthOfDischarge > 1) errors.push("Valid DoD (0.1-1.0) required for Hybrid with backup.");
             if (![24, 48].includes(systemVoltage)) errors.push("Valid System Voltage (24V or 48V recommended) required for Hybrid.");
        }
        depthOfDischarge = depthOfDischarge || DEFAULT_DOD; // Default even if backup=0
    } else { depthOfDischarge = null; systemVoltage = null; }

    // Optional values
    const tilt = parseFloat(params.tilt) || 15;
    const azimuth = parseFloat(params.azimuth) || 180;
    const shadingLoss = parseFloat(params.shading) || 0;
    const targetBudget = params.budget ? parseFloat(params.budget) : null;

    if (errors.length > 0) {
        console.warn("Validation Errors:", errors);
        return res.status(400).json({ message: `Input validation failed: ${errors.join('; ')}` });
    }

    // --- Calculation Steps ---
    try {
        // 1. Coordinates
        const { lat, lon, displayName } = await getCoordinates(params.location);
        const validatedLocation = displayName || params.location;

        // 2. Solar Irradiance
        const irradianceData = await getSolarIrradiance(lat, lon, tilt, azimuth, shadingLoss);
        // ... (check irradianceData validity) ...
        if (!irradianceData?.totals?.E_d > 0) {
            throw new Error("Failed to retrieve valid solar irradiance data. Using Mock Data if possible.");
        }
        const avgDailyEnergyPerKwP_kWh = irradianceData.totals.E_d;
        const annualEnergyPerKwP_kWh = irradianceData.totals.E_y;
        const monthlyProductionData = irradianceData.monthly || [];
        const pvgisLossParamUsed = irradianceData.pvgisLossParamSent ?? (DEFAULT_SYSTEM_LOSS + shadingLoss);
        const isMockPVGISData = irradianceData.isMockData || false;


        // 3. Daily Energy Consumption & Load Profile
        let dailyKwh = 0;
        let totalContinuousPowerW = 0;
        let maxSingleAppliancePeakW = 0;
        let totalPeakFactorSumW = 0; // Upper bound check
        let estimatedPeakW = 0; // Peak for inverter sizing
        let energySource = '';
        // ... (logic to calculate dailyKwh, totalContinuousPowerW, maxSingleAppliancePeakW, estimatedPeakW based on appliances OR avg kWh/Bill) ...
         if (params.appliances && params.appliances.length > 0) {
            // Calculate from list, estimate peaks
             let totalWh = 0;
            const validAppliances = params.appliances.filter(a => a.power > 0 && a.quantity > 0);
            validAppliances.forEach(app => {
                const powerW = Number(app.power) || 0;
                const quantity = Number(app.quantity) || 1;
                const hours = Number(app.hoursPerDay) || 0;
                const peakFactor = Number(app.peakFactor) || 1.5;
                totalWh += powerW * quantity * hours;
                 if(hours > 4) { totalContinuousPowerW += powerW * quantity; } // Simple continuous estimate
                 maxSingleAppliancePeakW = Math.max(maxSingleAppliancePeakW, powerW * quantity * peakFactor);
                totalPeakFactorSumW += powerW * quantity * peakFactor;
             });
            dailyKwh = totalWh / 1000;
            energySource = 'Appliance List';
             if (totalContinuousPowerW === 0 && dailyKwh > 0) { totalContinuousPowerW = (dailyKwh * 1000) / 16; }
             estimatedPeakW = Math.max(totalContinuousPowerW * INVERTER_LOAD_SAFETY_FACTOR, maxSingleAppliancePeakW);
             estimatedPeakW = Math.min(estimatedPeakW, totalPeakFactorSumW * 0.8); // Sanity check
        } else {
            // Calculate from avg kWh or Bill, estimate peaks crudely
            if (params.avgMonthlyKwh) { dailyKwh = parseFloat(params.avgMonthlyKwh) / 30.4; energySource = 'Avg. Monthly kWh'; }
             else if (params.avgMonthlyBill && params.electricityPricePerKwh) { dailyKwh = parseFloat(params.avgMonthlyBill) / parseFloat(params.electricityPricePerKwh) / 30.4; energySource = `Avg. Bill (${params.avgMonthlyBill} KES)`; }
            totalContinuousPowerW = (dailyKwh * 1000) / 8; // Assume spread over 8 hrs
            estimatedPeakW = totalContinuousPowerW * INVERTER_PEAK_LOAD_FACTOR; // Crude peak guess
        }
        if (isNaN(dailyKwh) || dailyKwh <= 0) { throw new Error('Could not calculate valid daily energy consumption (> 0 kWh).'); }
        console.log(`Load Calc: Daily ${dailyKwh.toFixed(2)}kWh (${energySource}). Est. Continuous ~${totalContinuousPowerW.toFixed(0)}W. Est. Peak ~${estimatedPeakW.toFixed(0)}W.`);

        // --- BATTERY SIZING (Refined for Off-Grid vs Hybrid backupDurationHours) ---
        let targetBatteryCapacityKwh = 0;
        let totalBatteryCapacityKwh = 0;
        let actualBatterySizeKwh = 0;
        let numberOfBatteryUnits = 0;
        let batteryRequirementReason = "";
        // ... (logic for Off-Grid using autonomyDays OR Hybrid using backupDurationHours) ...
        if (params.systemType === 'off-grid' && autonomyDays > 0) {
             const usableEnergyNeededWh = (dailyKwh * 1000) * autonomyDays;
            totalBatteryCapacityKwh = usableEnergyNeededWh / (depthOfDischarge * DEFAULT_BATTERY_EFFICIENCY * 1000);
            targetBatteryCapacityKwh = usableEnergyNeededWh / 1000;
            batteryRequirementReason = `${autonomyDays} days autonomy`;
        } else if (params.systemType === 'hybrid' && backupDurationHours > 0) {
             const averageHourlyWh = (dailyKwh * 1000) / 24;
             const usableEnergyNeededWh = Math.max(averageHourlyWh * backupDurationHours, MIN_BATTERY_BACKUP_WH);
            totalBatteryCapacityKwh = usableEnergyNeededWh / (depthOfDischarge * DEFAULT_BATTERY_EFFICIENCY * 1000);
            targetBatteryCapacityKwh = usableEnergyNeededWh / 1000;
             batteryRequirementReason = `${backupDurationHours} hours backup`;
         }
        if(totalBatteryCapacityKwh > 0) {
            numberOfBatteryUnits = Math.ceil(totalBatteryCapacityKwh / DEFAULT_BATTERY_UNIT_KWH);
            if (numberOfBatteryUnits < 1) numberOfBatteryUnits = 1;
            actualBatterySizeKwh = numberOfBatteryUnits * DEFAULT_BATTERY_UNIT_KWH;
            console.log(`Battery (${params.systemType}): Target Use ${targetBatteryCapacityKwh.toFixed(2)} kWh, Needs Nominal ${totalBatteryCapacityKwh.toFixed(2)} kWh. Fitted: ${actualBatterySizeKwh.toFixed(2)} kWh (${numberOfBatteryUnits} units) for ${batteryRequirementReason}.`);
        }

        // --- PV ARRAY SIZING ---
        let requiredEnergyFromPV_kWh = dailyKwh;
        let pvOversizeFactor = 1.0;
        // ... (apply oversize factors for off-grid/hybrid as before) ...
         if (params.systemType === 'off-grid') { pvOversizeFactor = OFFGRID_PV_OVERSIZE_FACTOR; requiredEnergyFromPV_kWh = dailyKwh / DEFAULT_BATTERY_EFFICIENCY; }
         else if (params.systemType === 'hybrid' && actualBatterySizeKwh > 0) { pvOversizeFactor = HYBRID_PV_OVERSIZE_FACTOR; requiredEnergyFromPV_kWh = dailyKwh / DEFAULT_BATTERY_EFFICIENCY; }

        let requiredPvSizeKwP = requiredEnergyFromPV_kWh / avgDailyEnergyPerKwP_kWh;
        let oversizedPvSizeKwP = requiredPvSizeKwP * pvOversizeFactor;
        // ... (calculate numberOfPanels and actualPvSizeKwP) ...
        let numberOfPanels = Math.ceil((oversizedPvSizeKwP * 1000) / panelWattage);
        if (numberOfPanels < 1 && dailyKwh > 0) numberOfPanels = 1; else if (dailyKwh <= 0) numberOfPanels = 0;
        let actualPvSizeKwP = (numberOfPanels * panelWattage) / 1000;
         console.log(`PV Calc: Base Need ${requiredPvSizeKwP.toFixed(2)} kWp. Oversized Aim ${oversizedPvSizeKwP.toFixed(2)} kWp. Fitted: ${actualPvSizeKwP.toFixed(2)} kWp (${numberOfPanels} panels).`);


        // --- INVERTER SIZING ---
        let chosenInverterSizeKva = 0;
        if (dailyKwh > 0) {
             // ... (logic comparing load-based and PV-based requirements, choose max, round up) ...
            let requiredInverterSizeKva_LoadBased = (totalContinuousPowerW / 1000) * INVERTER_LOAD_SAFETY_FACTOR;
             let pvLinkFactorInv = (params.systemType === 'on-grid') ? INVERTER_PV_LINK_FACTOR : 1.05;
            let requiredInverterSizeKva_PVBased = actualPvSizeKwP / pvLinkFactorInv; // Max PV suggests this *minimum* inverter size
             chosenInverterSizeKva = Math.max(requiredInverterSizeKva_LoadBased, requiredInverterSizeKva_PVBased, 0.5); // Ensure min 0.5 kVA
            // Rounding logic
             if (chosenInverterSizeKva < 2) chosenInverterSizeKva = Math.ceil(chosenInverterSizeKva * 2) / 2;
             else if (chosenInverterSizeKva < 10) chosenInverterSizeKva = Math.ceil(chosenInverterSizeKva);
             else chosenInverterSizeKva = Math.ceil(chosenInverterSizeKva / 2) * 2;
            console.log(`Inverter Calc: Load ~${requiredInverterSizeKva_LoadBased.toFixed(2)}kVA, PV Min ~${requiredInverterSizeKva_PVBased.toFixed(2)}kVA. Chosen: ${chosenInverterSizeKva.toFixed(1)} kVA.`);
         }

        // --- CHARGE CONTROLLER (Off-Grid Separate Only) ---
        let chargeControllerDetails = null;
        let chargeControllerAmps = 0; // Store amps for cost calculation
        // ... (logic to calculate MPPT amps based on PV and voltage, round up) ...
         if (params.systemType === 'off-grid' && actualBatterySizeKwh > 0 && systemVoltage) {
            const maxPvCurrent = (actualPvSizeKwP * 1000) / systemVoltage;
            let requiredAmps = maxPvCurrent * 1.25;
            const standardSizes = [10, 20, 30, 40, 60, 80, 100, 150];
            chargeControllerAmps = standardSizes.find(size => size >= requiredAmps) || standardSizes[standardSizes.length-1];
             chargeControllerDetails = { estimatedAmps: chargeControllerAmps, voltage: systemVoltage, type: "MPPT Recommended" };
             console.log(`CC Calc (Off-Grid): PV Max ~${maxPvCurrent.toFixed(1)}A. MPPT Size: ${chargeControllerAmps}A @ ${systemVoltage}V.`);
        }

        // --- COST ESTIMATION (Using Enhanced Pricing) ---
        const prices = await getComponentPrices(validatedLocation, params.userType, actualPvSizeKwP, chosenInverterSizeKva);
        let panelCost = numberOfPanels * panelWattage * prices.panelCostPerWatt;
        let inverterCost = chosenInverterSizeKva * prices.inverterCostPerKva;
        let batteryCost = actualBatterySizeKwh * prices.batteryCostPerKwh;
        // Use stored CC amps for cost:
        let chargeControllerCost = chargeControllerDetails ? (chargeControllerDetails.estimatedAmps * systemVoltage / 1000) * prices.chargeControllerCostPerKw : 0;
        let mountingCost = numberOfPanels * prices.mountingStructureCostPerPanel;
        let hardwareCost = panelCost + inverterCost + batteryCost + chargeControllerCost + mountingCost;
        let installationCost = hardwareCost * prices.installationLaborCostFactor;
        let totalCost = hardwareCost + installationCost;
        console.log(`Cost Est (KES): Total=${totalCost.toFixed(0)}. Note: ${prices.simulationNote}`);

        // --- BUDGET CONSTRAINT ADJUSTMENT ---
        let budgetConstraintApplied = false;
        let initialCalculatedCost = totalCost;
        let scaledSystemDescription = "";
        // ... (Keep the refined budget scaling logic from the previous enhanced version) ...
         if (targetBudget && totalCost > targetBudget && targetBudget > 0) {
             budgetConstraintApplied = true;
            console.log(`Budget constraint activated: Initial Cost ${totalCost.toFixed(0)} KES > Budget ${targetBudget.toFixed(0)} KES. Scaling down...`);
            const targetHardwareCost = targetBudget / (1 + prices.installationLaborCostFactor);
            let scaleFactor = targetHardwareCost / hardwareCost; if(scaleFactor<0) scaleFactor=0;
             // Scale Panels & Mounting
            let scaledPanelCost = panelCost * scaleFactor;
            numberOfPanels = Math.floor((scaledPanelCost / prices.panelCostPerWatt) / panelWattage);
             if (numberOfPanels < 1 && initialCalculatedCost > 0) numberOfPanels = 1;

            if(numberOfPanels < 1) {
                // Budget too low scenario
                 actualPvSizeKwP=0; numberOfPanels=0; panelCost=0; mountingCost=0; chosenInverterSizeKva=0; inverterCost=0;
                actualBatterySizeKwh=0; numberOfBatteryUnits=0; batteryCost=0; chargeControllerDetails=null; chargeControllerCost=0;
                 hardwareCost=0; installationCost=0; totalCost=0;
                 scaledSystemDescription = "Budget too low for a minimum system.";
            } else {
                 actualPvSizeKwP = (numberOfPanels * panelWattage) / 1000;
                 panelCost = numberOfPanels * panelWattage * prices.panelCostPerWatt;
                 mountingCost = numberOfPanels * prices.mountingStructureCostPerPanel;
                let availableHardwareBudget = targetHardwareCost - (panelCost + mountingCost);

                 // Scale Inverter (Re-size, check budget)
                 let pvLinkFactorInv = (params.systemType === 'on-grid') ? INVERTER_PV_LINK_FACTOR : 1.05;
                let requiredInverterSizeKva_PVBased = actualPvSizeKwP / pvLinkFactorInv;
                 let scaledInverterSizeKva = requiredInverterSizeKva_PVBased; // Simplify: base on PV
                 scaledInverterSizeKva = Math.max(0.5, scaledInverterSizeKva);
                 // Rounding...
                if (scaledInverterSizeKva < 2) scaledInverterSizeKva = Math.ceil(scaledInverterSizeKva * 2) / 2; else if (scaledInverterSizeKva < 10) scaledInverterSizeKva = Math.ceil(scaledInverterSizeKva); else scaledInverterSizeKva = Math.ceil(scaledInverterSizeKva / 2) * 2;
                 let tempInverterCost = scaledInverterSizeKva * prices.inverterCostPerKva;
                 if (tempInverterCost <= availableHardwareBudget && availableHardwareBudget > 0) { chosenInverterSizeKva = scaledInverterSizeKva; inverterCost = tempInverterCost; availableHardwareBudget -= inverterCost; }
                 else { chosenInverterSizeKva = 0; inverterCost = 0; console.warn("Budget too low for inverter.")}

                 // Scale CC (Re-size, check budget)
                 chargeControllerDetails = null; chargeControllerCost = 0;
                 if (params.systemType === 'off-grid' && actualPvSizeKwP > 0 && systemVoltage && chosenInverterSizeKva > 0 && availableHardwareBudget > 0) {
                    const maxPvCurrent = (actualPvSizeKwP * 1000) / systemVoltage; let requiredAmps = maxPvCurrent * 1.25;
                    const standardSizes = [10, 20, 30, 40, 60, 80, 100, 150]; chargeControllerAmps = standardSizes.find(size => size >= requiredAmps) || standardSizes[standardSizes.length-1];
                     let tempCCCost = (chargeControllerAmps * systemVoltage / 1000) * prices.chargeControllerCostPerKw;
                     if (tempCCCost <= availableHardwareBudget) { chargeControllerCost = tempCCCost; availableHardwareBudget -= chargeControllerCost; chargeControllerDetails = { estimatedAmps: chargeControllerAmps, voltage: systemVoltage, type: "MPPT Recommended" };}
                     else { chargeControllerAmps = 0; console.warn("Budget too low for charge controller.")} // Reset amps if cannot afford
                 } else { chargeControllerAmps = 0; } // Ensure CC amps reset if not applicable

                // Scale Battery (Remaining budget)
                batteryCost = 0; actualBatterySizeKwh = 0; numberOfBatteryUnits = 0;
                 if (params.systemType !== 'on-grid' && chosenInverterSizeKva > 0 && availableHardwareBudget > 0 && prices.batteryCostPerKwh > 0 && DEFAULT_BATTERY_UNIT_KWH > 0) {
                     const costPerBatteryUnit = DEFAULT_BATTERY_UNIT_KWH * prices.batteryCostPerKwh;
                     numberOfBatteryUnits = Math.floor(availableHardwareBudget / costPerBatteryUnit); if (numberOfBatteryUnits < 0) numberOfBatteryUnits = 0;
                    actualBatterySizeKwh = numberOfBatteryUnits * DEFAULT_BATTERY_UNIT_KWH; batteryCost = actualBatterySizeKwh * prices.batteryCostPerKwh;
                 }

                 // Recalculate final costs
                 hardwareCost = panelCost + inverterCost + batteryCost + chargeControllerCost + mountingCost;
                 installationCost = hardwareCost * prices.installationLaborCostFactor; totalCost = hardwareCost + installationCost;
                 scaledSystemDescription = `System scaled: ${numberOfPanels} Panels (${actualPvSizeKwP.toFixed(2)} kWp), ${chosenInverterSizeKva.toFixed(1)} kVA Inv, ${actualBatterySizeKwh.toFixed(2)} kWh Batt.`;
                 if(totalCost > targetBudget * 1.02){ scaledSystemDescription += " (Note: Final cost may slightly exceed budget due to component minimums.)"; }
             }
             console.log(scaledSystemDescription);
             console.log(`Scaled Cost (KES): Total=${totalCost.toFixed(0)}`);
         }

        // --- FINANCIAL METRICS ---
        const finalAnnualProductionKwh = actualPvSizeKwP * annualEnergyPerKwP_kWh;
        let annualSavings = 0; let simplePaybackYears = null;
        const electricityPrice = parseFloat(params.electricityPricePerKwh);
        if (electricityPrice > 0 && finalAnnualProductionKwh > 0 && totalCost > 0) {
            // ... (Savings and Payback calculation as before) ...
            let kwhDisplacedFromGrid = 0;
            if (params.systemType === 'on-grid' || params.systemType === 'hybrid') { kwhDisplacedFromGrid = Math.min(finalAnnualProductionKwh, dailyKwh * 365); }
             else { kwhDisplacedFromGrid = dailyKwh * 365; } // Off-grid value
            annualSavings = kwhDisplacedFromGrid * electricityPrice;
             if (annualSavings > 0) { simplePaybackYears = totalCost / annualSavings; }
        }
        console.log(`Financials: Final Prod=${finalAnnualProductionKwh.toFixed(0)} kWh. Savings=${annualSavings.toFixed(0)} KES. Payback=${simplePaybackYears ? simplePaybackYears.toFixed(1) + ' yrs' : 'N/A'}`);

        // --- MONTHLY PRODUCTION ---
        const monthlyProduction = monthlyProductionData.map(m => ({ month: m.month, production: (m.E_m || (m.E_d * 30.4)) * actualPvSizeKwP })).filter(m => m.month >= 1 && m.month <= 12);

        // --- FINAL RESULT OBJECT (Structure remains same as enhanced) ---
        const result = {
            // ... (All sections: location, coordinates, systemType, userType, dailyEnergy, energySource, inputParameters, pvSystem, inverter, batterySystem, chargeController, financial, productionAnalysis, assumptions) ...
             // Use the structure from the *previous* enhanced version here, ensuring backupDurationHours is in batterySystem for hybrid
             location: validatedLocation, coordinates: { lat: lat.toFixed(5), lon: lon.toFixed(5) },
             systemType: params.systemType, userType: params.userType,
             dailyEnergyConsumptionKwh: dailyKwh, energyConsumptionSource: energySource, inputParameters: params,
             pvSystem: { sizeKwP: parseFloat(actualPvSizeKwP.toFixed(2)), panelWattage: panelWattage, numberOfPanels: numberOfPanels, tilt: tilt, azimuth: azimuth, estimatedAnnualProductionKwh: parseFloat(finalAnnualProductionKwh.toFixed(0)) },
             inverter: { sizeKva: parseFloat(chosenInverterSizeKva.toFixed(1)) /* Add peak estimate if available */ },
             batterySystem: actualBatterySizeKwh > 0 ? {
                targetCapacityKwh: parseFloat(targetBatteryCapacityKwh.toFixed(2)), actualCapacityKwh: parseFloat(actualBatterySizeKwh.toFixed(2)), numberOfUnits: numberOfBatteryUnits, unitCapacityKwh: DEFAULT_BATTERY_UNIT_KWH, voltage: systemVoltage, ampHourCapacity: systemVoltage ? parseFloat(((actualBatterySizeKwh * 1000) / systemVoltage).toFixed(1)) : null, autonomyDays: params.systemType === 'off-grid' ? autonomyDays : null, backupDurationHours: params.systemType === 'hybrid' ? backupDurationHours : null, depthOfDischarge: depthOfDischarge, requirementReason: batteryRequirementReason,
            } : null,
             chargeController: chargeControllerDetails,
            financial: {
                 estimatedTotalCost: parseFloat(totalCost.toFixed(0)), currency: prices.currency, simplePaybackYears: simplePaybackYears ? parseFloat(simplePaybackYears.toFixed(1)) : null, estimatedAnnualSavings: parseFloat(annualSavings.toFixed(0)),
                 costBreakdown: { panels: parseFloat(panelCost.toFixed(0)), inverter: parseFloat(inverterCost.toFixed(0)), batteries: parseFloat(batteryCost.toFixed(0)), chargeController: parseFloat(chargeControllerCost.toFixed(0)), mounting: parseFloat(mountingCost.toFixed(0)), installation: parseFloat(installationCost.toFixed(0)), hardwareTotal: parseFloat(hardwareCost.toFixed(0)) },
                 budget: { target: targetBudget, constraintApplied: budgetConstraintApplied, initialCalculatedCost: parseFloat(initialCalculatedCost.toFixed(0)), scaledSystemNote: budgetConstraintApplied ? scaledSystemDescription : "System designed to meet needs within budget.", },
                 pricingNote: prices.simulationNote
             },
             productionAnalysis: { avgDailyEnergyPerKwP_kWh: parseFloat(avgDailyEnergyPerKwP_kWh.toFixed(3)), annualEnergyPerKwP_kWh: parseFloat(annualEnergyPerKwP_kWh.toFixed(2)), monthlyProductionKwh: monthlyProduction, pvgisLossParamUsed: pvgisLossParamUsed, isMockPVGISData: isMockPVGISData },
             assumptions: { locationLatLon: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, pvgisDataSource: isMockPVGISData ? `MOCK Data` : `PVGIS v5.2`, systemLossAssumed: `${DEFAULT_SYSTEM_LOSS}% Base + ${shadingLoss}% Shading = ${pvgisLossParamUsed}% Total`, panelWattageUsed: panelWattage, batteryTypeAssumption: "LiFePO4", batteryDoD: depthOfDischarge, batteryEfficiency: DEFAULT_BATTERY_EFFICIENCY, pvOversizeFactorApplied: pvOversizeFactor > 1.0 ? parseFloat(pvOversizeFactor.toFixed(2)) : null, componentPricing: "Simulated Kenyan Tiers", systemVoltage: systemVoltage }
        };

        res.json(result);

    } catch (error) { // Keep enhanced error handling
        console.error('Calculation Endpoint Error:', error);
        let statusCode = 500; let message = `Calculation error: ${error.message}`;
        if (error.message.includes("Location") || error.message.includes("coordinates")) { statusCode = 400; }
        else if (error.message.includes("PVGIS") || error.message.includes("irradiance")) { statusCode = 502; }
        else if (error.message.includes("consumption")) { statusCode = 400; }
        else if (error.message.includes("Validation failed")) { statusCode = 400; message = error.message; }
        res.status(statusCode).json({ message });
    }
});

// --- PDF Generation Endpoint (Keep Enhanced version) ---
// Uses hardcoded English strings directly now.
app.post('/api/generate-pdf', (req, res) => {
    const result = req.body;
    // ... (validation of result object) ...
     if (!result?.location || !result?.pvSystem || !result?.financial || !result?.productionAnalysis) {
         return res.status(400).json({ message: 'Invalid/incomplete result data for PDF generation.' });
     }

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    let buffers = []; doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => { /* Send PDF response */
         let pdfData = Buffer.concat(buffers);
         res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="SolarFit_Estimate_${result.location.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf"`, 'Content-Length': Buffer.byteLength(pdfData) }).end(pdfData);
    });

    // --- PDF Styling & Helpers ---
    const lightText = '#6b7280'; const mediumText = '#374151'; const darkText = '#1f2937';
    const primaryColor = '#2563eb'; const accentColor = '#16a34a';
    doc.font('Helvetica'); // Use standard font
    const write = (text, size = 10, options = {}) => { /* ... styling ... */ doc.fillColor(options.color || mediumText).fontSize(size).text(text, options); return doc; };
    const writeBold = (text, size = 10, options = {}) => { /* ... styling ... */ doc.font('Helvetica-Bold'); write(text, size, { color: options.color || darkText, ...options }); doc.font('Helvetica'); return doc; };
    const writeLine = (label, value, size = 9, labelColor = darkText, valueColor = mediumText) => { /* ... as before */ doc.font('Helvetica-Bold').fillColor(labelColor).fontSize(size).text(label + ': ', { continued: true }); doc.font('Helvetica').fillColor(valueColor).text(value !== null && value !== undefined ? String(value) : 'N/A'); doc.moveDown(0.4);};
    const writeSectionHeader = (text, subtext = null) => { /* ... section styling ... */ doc.moveDown(1.5); writeBold(text, 14, { color: primaryColor }); doc.lineWidth(0.5).moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.x, doc.y).strokeColor(primaryColor).stroke().moveDown(0.5); if (subtext) write(subtext, 8, { color: lightText }).moveDown(0.5); };
    const addLogo = () => { /* ... attempts to add logo or fallback text ... */ writeBold("SolarFit", 20, { x: 50, y: 50, color: primaryColor}); doc.moveDown(2);}; // Simplified fallback

    // --- PDF Content Structure ---
    // Page 1
    addLogo();
    writeBold('Preliminary Solar System Sizing Estimate', 16, { align: 'right', x: 200, y: 65, width: doc.page.width - 250});
    write(`Generated: ${new Date().toLocaleDateString('en-GB')}`, 9, { align: 'right', color: lightText});
    doc.moveDown(3);

    writeSectionHeader('Project Overview');
    // ... (Write Location, Coordinates, System Type, User Type, Daily Load using writeLine and result data) ...
     writeLine('Location', result.location); writeLine('Coordinates', `${result.coordinates?.lat}, ${result.coordinates?.lon}`);
     writeLine('System Type', result.systemType?.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()));
     writeLine('User Category', result.userType?.charAt(0).toUpperCase() + result.userType?.slice(1));
     writeLine('Est. Daily Load', `${result.dailyEnergyConsumptionKwh?.toFixed(2)} kWh`);
     writeLine('Load Source', `${result.energyConsumptionSource}`, 9, lightText, lightText);

    writeSectionHeader('Recommended System Configuration');
    // ... (Write PV Size, Panels, Annual Yield, Inverter Size, Orientation) ...
    writeLine('PV Array Size', `${result.pvSystem?.sizeKwP} kWp`); writeLine('Panels', `${result.pvSystem?.numberOfPanels} x ${result.pvSystem?.panelWattage} Wp`); writeLine('Est. Annual Yield', `${result.pvSystem?.estimatedAnnualProductionKwh} kWh`); writeLine('Inverter Size', `${result.inverter?.sizeKva} kVA`); writeLine('PV Orientation', `Tilt: ${result.pvSystem?.tilt}°, Azimuth: ${result.pvSystem?.azimuth}°`);


    if (result.batterySystem) {
         doc.moveDown(0.5); writeBold('Energy Storage Details', 11);
         // ... (Write Battery details: Nominal/Usable Capacity, Voltage, Config, Design goal - Autonomy/Backup) ...
         writeLine('Nominal Capacity', `${result.batterySystem.actualCapacityKwh} kWh`); writeLine('Usable Capacity', `${result.batterySystem.targetCapacityKwh} kWh (at ${result.batterySystem.depthOfDischarge * 100}% DoD)`); writeLine('System Voltage', `${result.batterySystem.voltage} V` ); writeLine('Configuration', `${result.batterySystem.numberOfUnits} x ${result.batterySystem.unitCapacityKwh} kWh Units`); if (result.batterySystem.autonomyDays) writeLine('Designed For', `${result.batterySystem.autonomyDays} Days Autonomy (Off-Grid)`); if (result.batterySystem.backupDurationHours) writeLine('Designed For', `${result.batterySystem.backupDurationHours} Hours Backup (Hybrid)`);
     }
    if (result.chargeController) {
         doc.moveDown(0.5); writeBold('Charge Controller (Off-Grid)', 11);
         // ... (Write CC details) ...
         writeLine('Recommended Type', result.chargeController.type); writeLine('Estimated Size', `${result.chargeController.estimatedAmps} A @ ${result.chargeController.voltage}V`);
     }

    // Page 2
    doc.addPage(); addLogo(); doc.moveDown(3);
    writeSectionHeader('Financial Estimate');
    const currency = result.financial?.currency || 'KES';
    // ... (Write Total Cost, Savings, Payback) ...
    writeLine('Total Estimated System Cost', `${currency} ${result.financial?.estimatedTotalCost?.toLocaleString()}`, 11, darkText, accentColor); writeLine('Est. Annual Savings', `${currency} ${result.financial?.estimatedAnnualSavings?.toLocaleString()}`); writeLine('Simple Payback Period', result.financial?.simplePaybackYears ? `${result.financial.simplePaybackYears} years` : 'Requires grid usage/cost comparison');

    if (result.financial?.budget?.constraintApplied) { doc.fillColor(lightText).fontSize(8).text(`Note: ${result.financial.budget.scaledSystemNote}`).moveDown(0.5); }

    // Cost Breakdown Table
    doc.moveDown(0.5); writeBold('Cost Breakdown (Estimates)', 11);
    const tableStartY = doc.y + 5; const itemX = 60; const costX = 300; const rowHeight = 15; let currentY = tableStartY;
    const drawLine = (y) => doc.strokeColor('#e5e7eb').lineWidth(0.5).moveTo(itemX - 10, y).lineTo(costX + 150, y).stroke();
    const breakdown = result.financial?.costBreakdown;
    // ... (Define items array with hardcoded English labels) ...
    const items = [ { label: 'Solar Panels', cost: breakdown?.panels }, { label: 'Inverter', cost: breakdown?.inverter }, { label: 'Batteries', cost: breakdown?.batteries }, { label: 'Charge Controller', cost: breakdown?.chargeController }, { label: 'Mounting Structure', cost: breakdown?.mounting }, { label: 'Hardware Subtotal', cost: breakdown?.hardwareTotal, bold: true }, { label: 'Installation Labor', cost: breakdown?.installation }, { label: 'TOTAL ESTIMATE', cost: result.financial?.estimatedTotalCost, bold: true }];

    doc.font('Helvetica-Bold').fontSize(8); doc.text('Component / Item', itemX, currentY); doc.text('Estimated Cost (KES)', costX, currentY, { width: 150, align: 'right' }); currentY += rowHeight * 0.8; drawLine(currentY); currentY += rowHeight * 0.5;
    doc.fontSize(9);
    items.forEach(item => { /* ... logic to draw table rows as before ... */ if (item.cost !== null && item.cost !== undefined && item.cost > 0) { if (item.bold) doc.font('Helvetica-Bold'); doc.text(item.label, itemX, currentY); doc.text(item.cost.toLocaleString(), costX, currentY, { width: 150, align: 'right' }); if (item.bold) doc.font('Helvetica'); currentY += rowHeight; } else if (item.bold && item.label.includes('TOTAL') && result.financial?.estimatedTotalCost > 0) { doc.font('Helvetica-Bold'); doc.text(item.label, itemX, currentY); doc.text(item.cost.toLocaleString(), costX, currentY, { width: 150, align: 'right' }); doc.font('Helvetica'); currentY += rowHeight; } });
    drawLine(currentY - (rowHeight * 0.5)); doc.y = currentY; doc.moveDown(0.5);
    write(result.financial?.pricingNote || '', 7, { color: lightText });

    // Monthly Production (Potentially add Page 3 if needed)
    // Use addPage() before this if content runs long
     doc.addPage(); addLogo(); doc.moveDown(3);
     writeSectionHeader('Estimated Monthly Energy Production');
     const prodTableStartY = doc.y + 5; const monthX = 60; const prodX = 200; const prodRowHeight = 14; let prodCurrentY = prodTableStartY;
     const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; // English months
    const drawProdLine = (y) => doc.strokeColor('#e5e7eb').lineWidth(0.5).moveTo(monthX - 10, y).lineTo(prodX + 150, y).stroke();
     // ... (Draw table headers: Month, Est. Production (kWh)) ...
    doc.font('Helvetica-Bold').fontSize(8); doc.text('Month', monthX, prodCurrentY); doc.text('Est. Production (kWh)', prodX, prodCurrentY, { width: 150, align: 'right' }); prodCurrentY += prodRowHeight * 0.8; drawProdLine(prodCurrentY); prodCurrentY += prodRowHeight * 0.5;
    doc.font('Helvetica').fontSize(9);
     // ... (Loop through monthlyProduction data and draw rows) ...
     (result.productionAnalysis?.monthlyProductionKwh || []).sort((a, b) => a.month - b.month).forEach(m => { const monthName = monthNames[m.month - 1] || `M${m.month}`; const production = m.production?.toFixed(0) || 'N/A'; doc.text(monthName, monthX, prodCurrentY); doc.text(production, prodX, prodCurrentY, { width: 150, align: 'right' }); prodCurrentY += prodRowHeight; });
    drawProdLine(prodCurrentY - (prodRowHeight * 0.5)); doc.y = prodCurrentY;

    // Assumptions
    writeSectionHeader('Key Assumptions');
    const assump = result.assumptions || {};
     // ... (Write assumptions using writeLine with hardcoded English labels) ...
    writeLine('PVGIS Data Source', assump.pvgisDataSource, 8); writeLine('System Losses for PVGIS', assump.systemLossAssumed, 8); writeLine('Panel Wattage', `${assump.panelWattageUsed} Wp`, 8); writeLine('Battery Type', assump.batteryTypeAssumption || 'N/A', 8); if (assump.batteryDoD) writeLine('Battery Depth of Discharge', `${(assump.batteryDoD * 100)}%`, 8); if (assump.batteryEfficiency) writeLine('Battery Round-Trip Efficiency', `${assump.batteryEfficiency * 100}%`, 8); if (assump.pvOversizeFactorApplied) writeLine('PV Oversize Factor', `${assump.pvOversizeFactorApplied}x`, 8); writeLine('Pricing Basis', assump.componentPricing, 8);

    // Disclaimer
    doc.moveDown(2); writeBold('Disclaimer & Next Steps', 10);
     // ... (Write disclaimer text in English) ...
    doc.fontSize(8).fillColor(lightText).text('This report provides preliminary estimates... consult a qualified professional...', { align: 'justify'}); // Abridged example

    // Page Numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) { /* ... Add page numbers ... */ doc.switchToPage(i); doc.fontSize(7).fillColor(lightText).text(`Page ${i + 1} of ${range.count}`, 50, doc.page.height - 30, { align: 'center', width: doc.page.width - 100 }); }

    doc.end();
});

// --- User Data Endpoints (Keep Save/Fetch as is) ---
app.post('/api/save-calculation', authenticateToken, async (req, res) => { /* ... as before ... */
    const { calculationParams, resultData } = req.body;
     if (!calculationParams || !resultData?.location) { return res.status(400).json({ message: 'Missing or invalid calculation data to save.' }); }
     try {
         const calculation = new Calculation({ userId: req.user.userId, calculationParams: calculationParams, resultData: resultData, });
         await calculation.save();
        res.status(201).json({ message: 'Calculation saved successfully!', id: calculation._id });
     } catch (error) {
        console.error('Save Calculation Error:', error); res.status(500).json({ message: 'Server error saving calculation.', error: error.message });
     }
});
app.get('/api/calculations', authenticateToken, async (req, res) => { /* ... as before, fetch user's calculations */
    try {
        const calculations = await Calculation.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(50);
        res.json(calculations);
     } catch (error) {
        console.error('Fetch Calculations Error:', error); res.status(500).json({ message: 'Error fetching calculations.', error: error.message });
     }
});

// --- Global Error Handler (Keep as is) ---
app.use((err, req, res, next) => { /* ... as before ... */
     console.error("Unhandled Error:", err.stack || err);
     res.status(err.status || 500).json({ message: err.message || 'An unexpected server error occurred.' });
});

// --- Start Server ---
app.listen(port, () => {
    console.log(`SolarFit server enhanced (EN only) listening on http://localhost:${port}`);
     if (JWT_SECRET === 'YOUR_REALLY_SECRET_KEY_CHANGE_ME' || JWT_SECRET.length < 32) { console.warn("\nWARNING: JWT_SECRET is weak! Set a strong secret in .env!\n"); }
});