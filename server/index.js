const express = require('express');
const axios = require('axios');
const cors = require('cors');
const PDFDocument = require('pdfkit');
// const multer = require('multer'); // Keep if you want bill image upload beyond OCR
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config(); // Use environment variables for secrets

const app = express();
const port = process.env.PORT || 5000;

// --- Middleware ---
app.use(express.json());
app.use(cors()); // Configure CORS properly for production

// --- Configuration ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://SolarFitAdmin:solarFIT1994@solarfit.qmdgeww.mongodb.net/solarApp?retryWrites=true&w=majority&appName=SolarFit'; // Use ENV var
const JWT_SECRET = process.env.JWT_SECRET || 'YOUR_REALLY_SECRET_KEY'; // Use ENV var - CHANGE THIS!
const DEFAULT_SYSTEM_LOSS = 14; // % - Base internal system losses (cables, inverter inefficiency, dirt, temp default) fed to PVGIS
const DEFAULT_PANEL_WATTS = 450;
const DEFAULT_BATTERY_UNIT_KWH = 5; // Capacity of a standard battery module
const DEFAULT_BATTERY_EFFICIENCY = 0.85; // Round-trip efficiency
const DEFAULT_INVERTER_EFFICIENCY = 0.95;
const DEFAULT_DOD = 0.8; // Depth of Discharge
const OFFGRID_PV_OVERSIZE_FACTOR = 1.25; // Factor to oversize PV for reliable off-grid charging
const INVERTER_LOAD_SAFETY_FACTOR = 1.25; // Safety factor for inverter sizing based on load
const INVERTER_PV_LINK_FACTOR = 1.1; // Max ratio of Inverter kVA to PV kWp (especially for Grid-Tied)

// --- Database Connection ---
mongoose
    .connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch((err) => console.error('MongoDB Atlas connection error:', err));

// --- Schemas ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
});
// Hash password before saving
userSchema.pre('save', async function (next) {
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

const calculationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    calculationParams: Object, // Store the inputs used
    resultData: Object,        // Store the calculated results
    createdAt: { type: Date, default: Date.now },
});
const Calculation = mongoose.model('Calculation', calculationSchema);

// --- Appliance Data ---
// (Keep your existing appliance data structure)
const appliances = {
    residential: [
        { name: 'LED Light Bulb', power: 10 }, { name: 'Ceiling Fan', power: 75 }, { name: 'Television (32" LED)', power: 50 }, { name: 'Refrigerator (Energy Star)', power: 150, peakFactor: 3 }, { name: 'Laptop Computer', power: 50 }, { name: 'Microwave Oven', power: 1000 }, { name: 'Phone Charger', power: 5 }, { name: 'Wi-Fi Router', power: 10 }, // Added peakFactor estimate
        // ... Add more from your list
    ],
    commercial: [
        { name: 'Office Lighting (per 100 sq ft)', power: 100 }, { name: 'Desktop Computer with Monitor', power: 200 }, { name: 'Laser Printer', power: 500, peakFactor: 2 },
        // ... Add more
    ],
    industrial: [
        { name: 'Industrial Lighting (per 1000 sq ft)', power: 500 }, { name: 'Electric Motor (1 HP)', power: 750, peakFactor: 4 },
        // ... Add more
    ]
};

// --- Cache ---
const cache = {}; // Simple in-memory cache for API calls

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Add user payload ({ userId, username }) to request object
        next();
    } catch (ex) {
        console.error("Invalid Token:", ex.message);
        res.status(400).json({ message: 'Invalid token.' });
    }
};

// --- Helper Functions ---

/** Get Lat/Lon from Location Name using Nominatim */
async function getCoordinates(location) {
    if (!location || typeof location !== 'string') throw new Error('Invalid location provided');
    const cacheKey = `coords:${location.toLowerCase().trim()}`;
    if (cache[cacheKey]) return cache[cacheKey];

    try {
        console.log(`Geocoding location: ${location}`);
        const response = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`, {
            headers: { 'User-Agent': 'SolarFitApp/1.0 (NodeJS)' }, // Nominatim requires a User-Agent
            timeout: 7000, // 7 second timeout
        });

        if (response.data && response.data.length > 0) {
            const { lat, lon } = response.data[0];
            if (lat && lon) {
                const result = { lat: parseFloat(lat), lon: parseFloat(lon) };
                cache[cacheKey] = result; // Cache successful result
                return result;
            }
        }
        throw new Error(`Location '${location}' not found or coordinates invalid.`);
    } catch (error) {
        console.error(`Geocoding error for "${location}":`, error.message);
        if (error.response) throw new Error(`Geocoding service error: ${error.response.status}`);
        else if (error.request) throw new Error('Geocoding service did not respond.');
        else throw error; // Rethrow original error
    }
}

/** Create mock PVGIS data if API fails */
function createMockSolarData(lat) {
    console.warn("PVGIS API failed or returned invalid data. Using mock solar data.");
    // Simple model: Higher yield near equator, adjust monthly slightly
    const baseAnnualYield = 1500; // kWh/kWp/year (conservative base)
    const latitudeFactor = 1 - (Math.abs(lat) / 90) * 0.4; // Less yield further from equator
    const annualYield = baseAnnualYield * latitudeFactor;
    const avgDailyYield = annualYield / 365; // kWh/kWp/day

    const monthly = [];
    const monthFactors = [0.9, 0.95, 1.05, 1.1, 1.1, 1.05, 1.0, 0.95, 0.9, 0.85, 0.8, 0.85]; // Rough seasonal variation
    for (let i = 0; i < 12; i++) {
        const daysInMonth = new Date(2023, i + 1, 0).getDate();
        const monthlyEnergy = (annualYield / 12) * monthFactors[i];
        monthly.push({
            month: i + 1,
            E_d: monthlyEnergy / daysInMonth, // Avg Daily energy this month
            E_m: monthlyEnergy, // Total monthly energy
            // H_d: (monthlyEnergy / daysInMonth) / (1 - DEFAULT_SYSTEM_LOSS / 100), // Approximate daily irradiation
            SD_m: monthlyEnergy * 0.15, // Mock standard deviation
        });
    }

    return {
        monthly: monthly,
        totals: {
            E_d: avgDailyYield, // Avg Daily Energy (per kWp)
            E_y: annualYield, // Total Annual Energy (per kWp)
            SD_y: annualYield * 0.1 // Mock standard deviation
        },
        inputsUsed: { // Mimic PVGIS structure
            location: { latitude: lat, longitude: 'N/A' },
            meteo_data: { radiation_db: "MOCK", meteo_db: "MOCK" },
            pv_module: {},
            mounting_system: { fixed: { slope: { value: 'N/A' }, azimuth: { value: 'N/A' } } },
            loss: DEFAULT_SYSTEM_LOSS // Use default loss
        },
        isMockData: true // Flag to indicate mock data usage
    };
}

/** Get Solar Irradiance Data from PVGIS */
async function getSolarIrradiance(lat, lon, tilt = 15, azimuth = 180, shadingLoss = 0) {
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error('Invalid coordinates provided.');
    }
    tilt = Math.max(0, Math.min(90, Number(tilt) || 15));
    azimuth = Math.max(0, Math.min(359, Number(azimuth) || 180));
    shadingLoss = Math.max(0, Math.min(99, Number(shadingLoss) || 0)); // Cap shading loss

    // PVGIS aspect: 0=South, -90=East, 90=West. Our Azimuth: 180=South, 90=East, 270=West.
    const pvgisAspect = azimuth - 180;
    const totalLoss = Math.min(100, DEFAULT_SYSTEM_LOSS + shadingLoss); // Combined loss percentage for PVGIS

    const cacheKey = `pvgis:${lat.toFixed(3)}:${lon.toFixed(3)}:${tilt}:${azimuth}:${shadingLoss}`;
    if (cache[cacheKey]) return cache[cacheKey];

    const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc`;
    const params = {
        lat: lat.toFixed(4),
        lon: lon.toFixed(4),
        peakpower: 1, // Calculate for 1 kWp system
        pvcalculation: 1,
        mountingplace: 'building', // Or 'free'
        loss: totalLoss.toFixed(1),
        angle: tilt.toFixed(1),
        aspect: pvgisAspect.toFixed(1),
        outputformat: 'json'
    };

    try {
        console.log(`Requesting PVGIS data for ${lat}, ${lon}, tilt=${tilt}, azimuth=${azimuth}, loss=${totalLoss}%`);
        const response = await axios.get(url, { params, timeout: 15000 }); // 15 sec timeout

        // Validate PVGIS response structure
        if (response.data && response.data.outputs && response.data.outputs.totals && response.data.outputs.monthly && Array.isArray(response.data.outputs.monthly)) {
            console.log(`PVGIS Success: Avg Daily Yield (E_d) = ${response.data.outputs.totals?.E_d?.toFixed(3)} kWh/kWp/day`);
            const result = {
                monthly: response.data.outputs.monthly,
                totals: response.data.outputs.totals,
                inputsUsed: response.data.inputs,
                pvgisLossParamUsed: totalLoss // Record the loss parameter sent
            };
            cache[cacheKey] = result;
            return result;
        } else {
            console.error("PVGIS returned unexpected data format:", JSON.stringify(response.data));
            // Fallback to mock data if structure is wrong
            return createMockSolarData(lat);
        }
    } catch (error) {
        console.error(`PVGIS API Error for ${lat}, ${lon}:`, error.response ? `Status ${error.response.status} - ${JSON.stringify(error.response.data)}` : error.message);
        // Fallback to mock data on any API error
        return createMockSolarData(lat);
    }
}


/** Get Estimated Component Prices (Mock Implementation) */
async function getComponentPrices(location = "") {
    // Base prices in KES (These should ideally come from a database or config)
    const basePrices = {
        panelCostPerWatt: 65,       // KES per Wp
        inverterCostPerKva: 11000,  // KES per kVA (Hybrid/Offgrid might be higher)
        batteryCostPerKwh: 28000,   // KES per kWh (LiFePO4 estimate)
        chargeControllerCostPerKw: 4500,  // KES per kW (MPPT estimate)
        mountingStructureCostPerPanel: 3500, // KES per panel
        installationLaborCostFactor: 0.18, // % of hardware cost
    };

    // Very basic regional variation example
    let variance = 1.0;
    const lowerLocation = location.toLowerCase();
    if (lowerLocation.includes("nairobi")) variance = 1.0;
    else if (lowerLocation.includes("mombasa") || lowerLocation.includes("kisumu")) variance = 1.05;
    else variance = 1.10; // Assume higher costs elsewhere

    return {
        panelCostPerWatt: basePrices.panelCostPerWatt * variance,
        inverterCostPerKva: basePrices.inverterCostPerKva * variance,
        batteryCostPerKwh: basePrices.batteryCostPerKwh * variance,
        chargeControllerCostPerKw: basePrices.chargeControllerCostPerKw * variance,
        mountingStructureCostPerPanel: basePrices.mountingStructureCostPerPanel * variance,
        installationLaborCostFactor: basePrices.installationLaborCostFactor,
        currency: "KES"
    };
}

// --- API Endpoints ---

app.get('/api/appliances', (req, res) => res.json(appliances)); // Keep this

// --- Auth Endpoints ---
app.post('/api/signup', async (req, res) => {
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

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password are required.' });
    try {
        const user = await User.findOne({ username: username.toLowerCase() });
        if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ message: 'Invalid credentials.' });

        // Generate JWT Token
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            JWT_SECRET,
            { expiresIn: '2h' } // Token expires in 2 hours
        );
        res.json({ token });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login.', error: error.message });
    }
});

// --- Calculation Endpoints ---

app.post('/api/calculate', async (req, res) => {
    const params = req.body;
    console.log('Calculation Params Received:', params);

    // --- Validation ---
    const errors = [];
    if (!params.location) errors.push("Project Location is required.");
    if (!['on-grid', 'off-grid', 'hybrid'].includes(params.systemType)) errors.push("Valid System Type is required.");
    if (!['residential', 'commercial', 'industrial'].includes(params.userType)) errors.push("Valid User Type is required.");

    const energyProvided = params.avgMonthlyKwh || params.avgMonthlyBill || (params.appliances && params.appliances.length > 0);
    if (!energyProvided) errors.push("Please provide energy usage (Avg. Monthly kWh, Avg. Monthly Bill, or detailed appliances).");
    if (params.avgMonthlyBill && !params.electricityPricePerKwh) errors.push("Electricity Price (KES/kWh) is required when using Avg. Monthly Bill for estimation.");
    if (!params.electricityPricePerKwh || parseFloat(params.electricityPricePerKwh) <= 0) errors.push("Valid Electricity Price (KES/kWh) > 0 is required for financial calculations.");

    const panelWattage = parseInt(params.panelWattage) || DEFAULT_PANEL_WATTS;
    if (isNaN(panelWattage) || panelWattage <= 50 || panelWattage > 1000) errors.push("Panel Wattage must be a number between 50 and 1000 Wp.");

    const systemVoltage = parseInt(params.systemVoltage); // Now required for batteries
    let depthOfDischarge = parseFloat(params.depthOfDischarge);
    let autonomyDays = parseInt(params.autonomyDays);

    if (params.systemType !== 'on-grid') {
        if (!autonomyDays || isNaN(autonomyDays) || autonomyDays < 0.5) errors.push("Autonomy days (>= 0.5) are required for off-grid/hybrid systems.");
        if (!depthOfDischarge || isNaN(depthOfDischarge) || depthOfDischarge <= 0.1 || depthOfDischarge > 1) errors.push("Valid Battery Depth of Discharge (0.1-1.0, e.g., 0.8) is required.");
        if (![12, 24, 48].includes(systemVoltage)) errors.push("Valid System Voltage (12, 24, or 48 V) is required for battery calculations.");
        // Use defaults if valid numbers were not provided initially (handle potentially empty strings etc.)
        depthOfDischarge = depthOfDischarge || DEFAULT_DOD;
        autonomyDays = autonomyDays || 1;
    } else {
        // Set defaults for on-grid, even though not used in main calcs
        autonomyDays = 0;
        depthOfDischarge = null; // Explicitly null for on-grid
        // systemVoltage not strictly needed for on-grid calc, but maybe useful later
    }

    // Optional values
    const tilt = parseFloat(params.tilt) || 15; // Default tilt if not provided
    const azimuth = parseFloat(params.azimuth) || 180; // Default South if not provided
    const shadingLoss = parseFloat(params.shading) || 0; // Default 0%
    const targetBudget = params.budget ? parseFloat(params.budget) : null;

    if (errors.length > 0) {
        console.log("Validation Errors:", errors);
        return res.status(400).json({ message: errors.join(' ') });
    }

    // --- Calculation Steps ---
    try {
        // 1. Get Coordinates
        const { lat, lon } = await getCoordinates(params.location);
        console.log(`Coordinates for ${params.location}: Lat=${lat}, Lon=${lon}`);

        // 2. Get Solar Irradiance Data from PVGIS
        const irradianceData = await getSolarIrradiance(lat, lon, tilt, azimuth, shadingLoss);
        if (!irradianceData || !irradianceData.totals || !irradianceData.totals.E_d || irradianceData.totals.E_d <= 0) {
            console.error("Invalid irradiance data received:", irradianceData);
            throw new Error("Failed to retrieve valid solar irradiance data for the location. Please check location or try again.");
        }
        const avgDailyEnergyPerKwP_kWh = irradianceData.totals.E_d; // PVGIS: Average daily electricity production from 1kWp system [kWh/kWp/day]
        const annualEnergyPerKwP_kWh = irradianceData.totals.E_y; // PVGIS: Average yearly electricity production [kWh/kWp/year]
        const monthlyProductionData = irradianceData.monthly || []; // Array of {month, E_d, E_m, SD_m}
        const pvgisLossParamUsed = irradianceData.pvgisLossParamUsed ?? (DEFAULT_SYSTEM_LOSS + shadingLoss);
        const isMockPVGISData = irradianceData.isMockData || false;
        console.log(`Using Avg Daily Yield (E_d): ${avgDailyEnergyPerKwP_kWh.toFixed(3)} kWh/kWp/day`);

        // 3. Calculate Daily Energy Consumption (kWh/day)
        let dailyKwh = 0;
        let maxContinuousPowerW = 0;
        let peakPowerEstimateW = 0;
        let energySource = '';

        if (params.appliances && params.appliances.length > 0) {
            let totalWh = 0;
            params.appliances.forEach(app => {
                const powerW = Number(app.power) || 0;
                const quantity = Number(app.quantity) || 1;
                const hours = Number(app.hoursPerDay) || 0;
                const peakFactor = Number(app.peakFactor) || 1.5; // Default peak factor if not specified

                totalWh += powerW * quantity * hours;
                maxContinuousPowerW = Math.max(maxContinuousPowerW, powerW * quantity);
                peakPowerEstimateW += powerW * quantity * peakFactor; // Sum of peaks (conservative for inverter surge) - better: find MAX peak appliance
            });
            dailyKwh = totalWh / 1000;
            energySource = 'Appliance List';
            // Refine peak estimate - Take the largest single appliance peak need
            let maxSinglePeakW = 0;
             params.appliances.forEach(app => {
                 const powerW = Number(app.power) || 0;
                 const quantity = Number(app.quantity) || 1;
                 const peakFactor = Number(app.peakFactor) || 1.5;
                 maxSinglePeakW = Math.max(maxSinglePeakW, powerW * quantity * peakFactor);
             });
             // More realistic peak might be largest continuous + largest single surge, but let's keep it simpler
             peakPowerEstimateW = maxContinuousPowerW * INVERTER_LOAD_SAFETY_FACTOR * 1.5 // Simplified overall peak guess
             peakPowerEstimateW = Math.max(peakPowerEstimateW, maxSinglePeakW * 1.1); // Ensure it covers largest single peak


        } else if (params.avgMonthlyKwh) {
            dailyKwh = parseFloat(params.avgMonthlyKwh) / 30.4; // Avg days per month
            energySource = 'Avg. Monthly kWh Input';
            // Estimate continuous power if needed for inverter (highly approximate)
            maxContinuousPowerW = (dailyKwh * 1000) / 6; // Assuming major load over 6 hours avg
            peakPowerEstimateW = maxContinuousPowerW * 2.5; // Rough peak guess
        } else if (params.avgMonthlyBill && params.electricityPricePerKwh) {
            dailyKwh = parseFloat(params.avgMonthlyBill) / parseFloat(params.electricityPricePerKwh) / 30.4;
            energySource = `Avg. Monthly Bill / Price (${params.electricityPricePerKwh} KES/kWh)`;
            maxContinuousPowerW = (dailyKwh * 1000) / 6;
            peakPowerEstimateW = maxContinuousPowerW * 2.5;
        }

        if (isNaN(dailyKwh) || dailyKwh <= 0) {
            throw new Error('Could not calculate valid daily energy consumption (> 0 kWh). Check inputs.');
        }
        console.log(`Estimated Daily Consumption: ${dailyKwh.toFixed(2)} kWh (Source: ${energySource})`);
        console.log(`Estimated Max Continuous Power: ${maxContinuousPowerW.toFixed(0)} W`);
        console.log(`Estimated Peak Power: ${peakPowerEstimateW.toFixed(0)} W`);

        // 4. Battery Sizing (for Off-Grid / Hybrid)
        let targetBatteryCapacityKwh = 0;
        let actualBatterySizeKwh = 0;
        let numberOfBatteryUnits = 0;
        let batteryBankAh = 0;

        if (params.systemType !== 'on-grid') {
            const dailyWh = dailyKwh * 1000;
            const usableEnergyNeededWh = dailyWh * autonomyDays;
            const totalEnergyNeededWh = usableEnergyNeededWh / (depthOfDischarge * DEFAULT_BATTERY_EFFICIENCY); // Account for DoD and efficiency losses
            targetBatteryCapacityKwh = totalEnergyNeededWh / 1000;
            batteryBankAh = totalEnergyNeededWh / systemVoltage;

            // Calculate number of standard units
            numberOfBatteryUnits = Math.ceil(targetBatteryCapacityKwh / DEFAULT_BATTERY_UNIT_KWH);
            if (numberOfBatteryUnits < 1) numberOfBatteryUnits = 1; // Minimum 1 unit
            actualBatterySizeKwh = numberOfBatteryUnits * DEFAULT_BATTERY_UNIT_KWH;

            console.log(`Battery: Usable Wh=${usableEnergyNeededWh.toFixed(0)}, Total Wh needed=${totalEnergyNeededWh.toFixed(0)}, Target=${targetBatteryCapacityKwh.toFixed(2)} kWh, Actual=${actualBatterySizeKwh.toFixed(2)} kWh (${numberOfBatteryUnits} units), Ah=${batteryBankAh.toFixed(1)}Ah @${systemVoltage}V`);
        }

        // 5. PV Array Sizing (kWp)
        let requiredEnergyFromPV_kWh = dailyKwh;
        if (params.systemType !== 'on-grid') {
            requiredEnergyFromPV_kWh = dailyKwh / DEFAULT_BATTERY_EFFICIENCY; // PV must cover daily load + battery charging losses
        }

        let requiredPvSizeKwP = requiredEnergyFromPV_kWh / avgDailyEnergyPerKwP_kWh;
        console.log(`PV Initial Calc: Required Energy = ${requiredEnergyFromPV_kWh.toFixed(2)} kWh/day. Required PV = ${requiredPvSizeKwP.toFixed(2)} kWp`);

        if (params.systemType !== 'on-grid') {
            requiredPvSizeKwP *= OFFGRID_PV_OVERSIZE_FACTOR; // Oversize for reliable battery charging
             console.log(`PV Off-grid Oversized: Required PV = ${requiredPvSizeKwP.toFixed(2)} kWp (Factor: ${OFFGRID_PV_OVERSIZE_FACTOR}x)`);
        }

        let numberOfPanels = Math.ceil((requiredPvSizeKwP * 1000) / panelWattage);
        if (numberOfPanels < 1) numberOfPanels = 1; // Min 1 panel
        let actualPvSizeKwP = (numberOfPanels * panelWattage) / 1000;
        console.log(`PV Final: ${numberOfPanels} panels * ${panelWattage} Wp = ${actualPvSizeKwP.toFixed(2)} kWp`);


        // 6. Inverter Sizing (kVA or kW)
        // Size based on max of (oversized peak load, PV size limit)
        // Convert estimated peak Watts to kVA (assume PF ~0.9 if needed, but often use kW/kVA interchangeably for simple sizing)
        let requiredInverterSizeKva = Math.max(
             (peakPowerEstimateW / 1000) * INVERTER_LOAD_SAFETY_FACTOR, // Sized based on estimated peak load
             actualPvSizeKwP * INVERTER_PV_LINK_FACTOR // Ensure inverter can handle PV output (esp. grid-tied)
             );

         // Round up to common inverter sizes (e.g., 3, 5, 8, 10 kVA) - Simplification: just use calculated value for now
        requiredInverterSizeKva = Math.max(1.0, requiredInverterSizeKva); // Minimum 1 kVA maybe?
        let inverterSizeKva = requiredInverterSizeKva; // Use calculated value directly for now

        // Alternative: Base purely on PV size (simpler, common for grid-tie focus)
        // inverterSizeKva = actualPvSizeKwP * (params.systemType === 'on-grid' ? 1.1 : 1.0); // Slightly larger for grid-tied

        console.log(`Inverter Size Estimate: Based on Peak=${(peakPowerEstimateW / 1000 * INVERTER_LOAD_SAFETY_FACTOR).toFixed(2)} kVA, Based on PV=${(actualPvSizeKwP * INVERTER_PV_LINK_FACTOR).toFixed(2)} kVA. Chosen: ${inverterSizeKva.toFixed(2)} kVA`);

        // 7. Charge Controller Sizing (Amps) - Basic Estimate for Off-Grid/Hybrid
        let chargeControllerAmps = 0;
        let chargeControllerType = null;
        if (params.systemType !== 'on-grid' && actualBatterySizeKwh > 0) {
            // Estimate max current from PV array: P = V * I => I = P / V
            chargeControllerAmps = (actualPvSizeKwP * 1000 / systemVoltage) * 1.20; // Amps = (Total PV Watts / Battery Voltage) * safety factor
            chargeControllerType = "MPPT Recommended"; // Always recommend MPPT for efficiency
            console.log(`Charge Controller Estimate: ${chargeControllerAmps.toFixed(1)} A @ ${systemVoltage}V (${chargeControllerType})`);
        }

        // 8. Cost Estimation
        const prices = await getComponentPrices(params.location);
        let panelCost = numberOfPanels * panelWattage * prices.panelCostPerWatt;
        let inverterCost = inverterSizeKva * prices.inverterCostPerKva;
        let batteryCost = actualBatterySizeKwh * prices.batteryCostPerKwh; // Cost based on actual kWh
        let chargeControllerCost = params.systemType !== 'on-grid' && batteryCost > 0 ? (chargeControllerAmps * systemVoltage / 1000) * prices.chargeControllerCostPerKw : 0; // Cost based on estimated kW throughput
        let mountingCost = numberOfPanels * prices.mountingStructureCostPerPanel;
        let hardwareCost = panelCost + inverterCost + batteryCost + chargeControllerCost + mountingCost;
        let installationCost = hardwareCost * prices.installationLaborCostFactor;
        let totalCost = hardwareCost + installationCost;

        console.log(`Initial Cost Estimate (KES): Panels=${panelCost.toFixed(0)}, Inv=${inverterCost.toFixed(0)}, Bat=${batteryCost.toFixed(0)}, CC=${chargeControllerCost.toFixed(0)}, Mount=${mountingCost.toFixed(0)}, HW=${hardwareCost.toFixed(0)}, Inst=${installationCost.toFixed(0)}, Total=${totalCost.toFixed(0)}`);

        // 9. Apply Budget Constraint (if applicable)
        let budgetConstraintApplied = false;
        let initialCalculatedCost = totalCost; // Store the original cost

        if (targetBudget && totalCost > targetBudget) {
            budgetConstraintApplied = true;
            console.log(`Budget constraint activated: Initial Cost ${totalCost.toFixed(0)} > Budget ${targetBudget.toFixed(0)}`);
            // --- Scaling Logic ---
            // Prioritize essential components. Reduce Panels first, then Batteries. Keep Inverter/CC linked?
            // Simple proportional scaling of PV and Battery down based on cost overrun vs budget

            // Calculate how much to scale hardware cost to fit budget (leaving installation ratio same)
            const targetHardwareCost = targetBudget / (1 + prices.installationLaborCostFactor);
            let scaleFactor = targetHardwareCost / hardwareCost;
            if (scaleFactor > 1) scaleFactor = 1; // Should not happen here, but safety check
            if (scaleFactor <= 0) scaleFactor = 0.01; // Avoid zero/negative

            console.log(`Scaling hardware cost by factor: ${scaleFactor.toFixed(3)}`);

            // Scale Panels
            let scaledNumberOfPanels = Math.floor(numberOfPanels * scaleFactor);
            if (scaledNumberOfPanels < 1) scaledNumberOfPanels = 1; // Minimum 1 panel

            // Scale Battery (if applicable) - Scale the number of units
            let scaledNumberOfBatteryUnits = numberOfBatteryUnits; // Start with initial value
            if (params.systemType !== 'on-grid' && numberOfBatteryUnits > 0) {
                // This scaling is tricky. Let's scale the *cost contribution* down proportionally.
                // We need to see how much cost room is left after scaling panels & inverter.
                 let remainingBudgetForHardware = targetHardwareCost;
                 panelCost = scaledNumberOfPanels * panelWattage * prices.panelCostPerWatt;
                 actualPvSizeKwP = (scaledNumberOfPanels * panelWattage) / 1000;
                 // Re-link inverter to the scaled PV size maybe? Or keep slightly larger? Let's re-link for simplicity.
                 inverterSizeKva = Math.max(1.0, actualPvSizeKwP * INVERTER_PV_LINK_FACTOR); // Recalc inverter size
                 inverterCost = inverterSizeKva * prices.inverterCostPerKva;
                 mountingCost = scaledNumberOfPanels * prices.mountingStructureCostPerPanel;
                 // Re-calc CC amps and cost based on scaled PV
                 chargeControllerAmps = (actualPvSizeKwP * 1000 / systemVoltage) * 1.20;
                 chargeControllerCost = params.systemType !== 'on-grid' ? (chargeControllerAmps * systemVoltage / 1000) * prices.chargeControllerCostPerKw : 0;


                 remainingBudgetForHardware -= (panelCost + inverterCost + chargeControllerCost + mountingCost);

                 // Now, how many batteries can fit in remaining budget?
                if (remainingBudgetForHardware > 0 && prices.batteryCostPerKwh > 0 && DEFAULT_BATTERY_UNIT_KWH > 0) {
                     const costPerBatteryUnit = DEFAULT_BATTERY_UNIT_KWH * prices.batteryCostPerKwh;
                     scaledNumberOfBatteryUnits = Math.floor(remainingBudgetForHardware / costPerBatteryUnit);
                     if (scaledNumberOfBatteryUnits < 0) scaledNumberOfBatteryUnits = 0; // Cant have negative
                     if (numberOfBatteryUnits > 0 && scaledNumberOfBatteryUnits == 0){
                         // If scaling removes batteries entirely but they were needed, maybe flag issue?
                         // For now, allow it to scale to 0 if budget requires.
                     }
                 } else {
                     scaledNumberOfBatteryUnits = 0; // No budget left for batteries
                 }

            } else {
                scaledNumberOfBatteryUnits = 0; // No batteries for on-grid anyway
            }


            // Update final variables based on scaling
            numberOfPanels = scaledNumberOfPanels;
            actualPvSizeKwP = (numberOfPanels * panelWattage) / 1000;
             // Inverter size updated above
             // Inverter Cost updated above
            numberOfBatteryUnits = scaledNumberOfBatteryUnits;
            actualBatterySizeKwh = numberOfBatteryUnits * DEFAULT_BATTERY_UNIT_KWH;
            batteryCost = actualBatterySizeKwh * prices.batteryCostPerKwh;
            // CC amps/cost updated above
            // Mounting cost updated above
            panelCost = numberOfPanels * panelWattage * prices.panelCostPerWatt; // Re-calc panel cost with final panel count

            // Recalculate final total cost
            hardwareCost = panelCost + inverterCost + batteryCost + chargeControllerCost + mountingCost;
            installationCost = hardwareCost * prices.installationLaborCostFactor;
            totalCost = hardwareCost + installationCost;

            console.log(`Scaled System: Panels=${numberOfPanels}, PV=${actualPvSizeKwP.toFixed(2)}kWp, Inv=${inverterSizeKva.toFixed(2)}kVA, Bat Units=${numberOfBatteryUnits}, Bat Size=${actualBatterySizeKwh.toFixed(2)}kWh`);
            console.log(`Scaled Cost (KES): Total=${totalCost.toFixed(0)} (Target: ${targetBudget.toFixed(0)})`);

            // Ensure final cost doesn't exceed budget due to rounding/minimums
            if (totalCost > targetBudget * 1.01) { // Allow 1% wiggle room
               console.warn("Scaled cost slightly exceeds budget. Re-check scaling logic or component minimums.");
               // Could implement further minor reduction if needed, but keep simple for now.
            }
        }

        // 10. Calculate Financial Metrics (Based on Final System Size)
        const finalAnnualProductionKwh = actualPvSizeKwP * annualEnergyPerKwP_kWh;
        let annualSavings = 0;
        let simplePaybackYears = null;
        const electricityPrice = parseFloat(params.electricityPricePerKwh);

        if (electricityPrice > 0 && finalAnnualProductionKwh > 0) {
            annualSavings = finalAnnualProductionKwh * electricityPrice;
            if (annualSavings > 0 && totalCost > 0) {
                simplePaybackYears = totalCost / annualSavings;
            }
        }
         console.log(`Financials: Annual Prod=${finalAnnualProductionKwh.toFixed(0)} kWh, Annual Savings=${annualSavings.toFixed(0)} KES, Payback=${simplePaybackYears ? simplePaybackYears.toFixed(1) + ' years' : 'N/A'}`);

        // 11. Prepare Monthly Production Breakdown
        const monthlyProduction = monthlyProductionData.map(monthData => ({
            month: monthData.month,
            // E_m is monthly energy per kWp, scale by actual system size
            production: (monthData.E_m || (monthData.E_d * 30.4)) * actualPvSizeKwP
        })).filter(m => m.month >= 1 && m.month <= 12); // Ensure valid months


        // 12. Structure Result Object
        const result = {
            // Inputs Echo
            location: params.location,
            coordinates: { lat: lat.toFixed(5), lon: lon.toFixed(5) },
            systemType: params.systemType,
            userType: params.userType,
            dailyEnergyConsumptionKwh: dailyKwh,
            energyConsumptionSource: energySource,

            // PV System
            pvSystem: {
                sizeKwP: parseFloat(actualPvSizeKwP.toFixed(2)),
                panelWattage: panelWattage,
                numberOfPanels: numberOfPanels,
                tilt: tilt,
                azimuth: azimuth,
                estimatedAnnualProductionKwh: parseFloat(finalAnnualProductionKwh.toFixed(0)),
            },

            // Inverter
            inverter: {
                sizeKva: parseFloat(inverterSizeKva.toFixed(2)),
            },

             // Battery System (if applicable)
            batterySystem: params.systemType !== 'on-grid' ? {
                targetCapacityKwh: parseFloat(targetBatteryCapacityKwh.toFixed(2)), // Theoretical needed
                actualCapacityKwh: parseFloat(actualBatterySizeKwh.toFixed(2)),   // Based on units fitted
                numberOfUnits: numberOfBatteryUnits,
                unitCapacityKwh: DEFAULT_BATTERY_UNIT_KWH,
                voltage: systemVoltage,
                ampHourCapacity: parseFloat(batteryBankAh.toFixed(1)), // Target Ah
                autonomyDays: autonomyDays,
                depthOfDischarge: depthOfDischarge,
            } : null, // Set to null if not off-grid/hybrid

            // Charge Controller (if applicable)
             chargeController: chargeControllerType ? {
                estimatedAmps: parseFloat(chargeControllerAmps.toFixed(1)),
                voltage: systemVoltage,
                type: chargeControllerType,
             } : null,

            // Financials
            financial: {
                estimatedTotalCost: parseFloat(totalCost.toFixed(0)),
                currency: prices.currency,
                simplePaybackYears: simplePaybackYears ? parseFloat(simplePaybackYears.toFixed(1)) : null,
                estimatedAnnualSavings: parseFloat(annualSavings.toFixed(0)),
                costBreakdown: {
                    panels: parseFloat(panelCost.toFixed(0)),
                    inverter: parseFloat(inverterCost.toFixed(0)),
                    batteries: parseFloat(batteryCost.toFixed(0)),
                    chargeController: parseFloat(chargeControllerCost.toFixed(0)),
                    mounting: parseFloat(mountingCost.toFixed(0)),
                    installation: parseFloat(installationCost.toFixed(0)),
                    hardwareTotal: parseFloat(hardwareCost.toFixed(0))
                },
                budget: {
                    target: targetBudget,
                    constraintApplied: budgetConstraintApplied,
                    initialCalculatedCost: parseFloat(initialCalculatedCost.toFixed(0))
                }
            },

            // Production & Assumptions
            productionAnalysis: {
                avgDailyEnergyPerKwP_kWh: parseFloat(avgDailyEnergyPerKwP_kWh.toFixed(3)), // From PVGIS E_d
                annualEnergyPerKwP_kWh: parseFloat(annualEnergyPerKwP_kWh.toFixed(2)), // From PVGIS E_y
                monthlyProductionKwh: monthlyProduction, // Array [{month, production}]
                 pvgisLossParamUsed: pvgisLossParamUsed,
                 isMockPVGISData: isMockPVGISData
            },
            assumptions: {
                 systemVoltage: params.systemType !== 'on-grid' ? systemVoltage : null,
                 panelWattageUsed: panelWattage,
                 batteryDoD: depthOfDischarge,
                 batteryEfficiency: DEFAULT_BATTERY_EFFICIENCY,
                 inverterEfficiencyImplicit: DEFAULT_INVERTER_EFFICIENCY, // Note: This isn't explicitly used everywhere yet
                 offGridPvOversizeFactor: params.systemType !== 'on-grid' ? OFFGRID_PV_OVERSIZE_FACTOR : null,
                 componentPrices: prices, // Include prices used
                 pvgisSystemLossParam: `${pvgisLossParamUsed}% (Base ${DEFAULT_SYSTEM_LOSS}% + Shading ${shadingLoss}%)`,

            }
        };

        res.json(result);

    } catch (error) {
        console.error('Calculation Endpoint Error:', error);
        // Give more specific feedback if possible
        let statusCode = 500;
        let message = `Error calculating solar system: ${error.message}`;
        if (error.message.includes("Location") || error.message.includes("Geocoding")) {
            statusCode = 400; // Bad request due to location issue
        } else if (error.message.includes("irradiance")) {
             statusCode = 502; // Bad Gateway (issue talking to PVGIS maybe) or 400 if coords bad
        } else if (error.message.includes("consumption")) {
             statusCode = 400;
        }

        res.status(statusCode).json({ message });
    }
});


// --- PDF Generation Endpoint ---
app.post('/api/generate-pdf', (req, res) => {
    const result = req.body; // Expecting the calculation result object

    // Basic validation of the result object
    if (!result || !result.location || !result.pvSystem || !result.financial || !result.productionAnalysis) {
        return res.status(400).json({ message: 'Invalid calculation result data provided for PDF generation.' });
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
        let pdfData = Buffer.concat(buffers);
        res.writeHead(200, {
            'Content-Length': Buffer.byteLength(pdfData),
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="SolarFit_Report_${result.location.replace(/[^a-z0-9]/gi, '_')}.pdf"`,
        }).end(pdfData);
    });

    // --- PDF Content ---
    const write = (text, size = 10, options = {}) => doc.fontSize(size).text(text, options);
    const writeBold = (text, size = 10, options = {}) => doc.font('Helvetica-Bold').fontSize(size).text(text, options).font('Helvetica');
    const writeLine = (label, value, size = 10, boldLabel = true) => {
         doc.font(boldLabel ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).text(label + ': ', { continued: true }).font('Helvetica').text(value || 'N/A');
         doc.moveDown(0.5);
    };

    // Header
    write('SolarFit System Sizing Report', 18, { align: 'center' });
    doc.moveDown(2);

    // Overview Section
    writeBold('Project Overview', 14);
    doc.lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke().moveDown(0.5);
    writeLine('Location', result.location);
    writeLine('Coordinates', `Lat: ${result.coordinates?.lat}, Lon: ${result.coordinates?.lon}`);
    writeLine('System Type', result.systemType?.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()));
    writeLine('User Type', result.userType?.charAt(0).toUpperCase() + result.userType?.slice(1));
    writeLine('Est. Daily Consumption', `${result.dailyEnergyConsumptionKwh?.toFixed(2)} kWh (Source: ${result.energyConsumptionSource})`);
    doc.moveDown(1);

    // System Design Section
    writeBold('System Design Recommendation', 14);
     doc.lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke().moveDown(0.5);
     writeLine('PV System Size', `${result.pvSystem?.sizeKwP} kWp`);
     writeLine('Panel Configuration', `${result.pvSystem?.numberOfPanels} x ${result.pvSystem?.panelWattage} Wp Panels`);
     writeLine('Assumed Panel Tilt', `${result.pvSystem?.tilt}°`);
     writeLine('Assumed Panel Azimuth', `${result.pvSystem?.azimuth}° (180°=South)`);
     writeLine('Inverter Size', `${result.inverter?.sizeKva} kVA`);

     if (result.systemType !== 'on-grid' && result.batterySystem) {
         doc.moveDown(0.5);
         writeBold('Battery System Details', 12);
         writeLine('Actual Battery Capacity', `${result.batterySystem.actualCapacityKwh} kWh`);
         writeLine('Configuration', `${result.batterySystem.numberOfUnits} x ${result.batterySystem.unitCapacityKwh} kWh units`);
         writeLine('System Voltage', `${result.batterySystem.voltage} V`);
         writeLine('Target Ah Capacity', `${result.batterySystem.ampHourCapacity} Ah`);
         writeLine('Days of Autonomy', `${result.batterySystem.autonomyDays}`);
         writeLine('Depth of Discharge (DoD)', `${(result.batterySystem.depthOfDischarge * 100).toFixed(0)}%`);
          if(result.chargeController) {
              writeLine('Charge Controller', `${result.chargeController.estimatedAmps} A (MPPT Recommended)`);
          }
     }
    doc.moveDown(1);

    // Energy & Financials Section
     writeBold('Energy Production & Financials', 14);
     doc.lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke().moveDown(0.5);
     writeLine('Est. Annual Production', `${result.pvSystem?.estimatedAnnualProductionKwh} kWh`);
     writeLine('PVGIS Avg. Daily Yield Used', `${result.productionAnalysis?.avgDailyEnergyPerKwP_kWh} kWh/kWp/day` + (result.productionAnalysis?.isMockPVGISData ? ' (MOCK DATA)' : ''));
     writeLine('PVGIS System Loss Parameter', result.assumptions?.pvgisSystemLossParam);
     doc.moveDown(0.5);
     writeBold('Cost & Payback', 12);
     const currency = result.financial?.currency || 'KES';
     writeLine('Total Estimated Cost', `${currency} ${result.financial?.estimatedTotalCost?.toLocaleString()}`);
     if (result.financial?.budget?.constraintApplied) {
          writeLine('Budget Status', `System scaled down to meet budget of ${currency} ${result.financial.budget.target.toLocaleString()}`, 10, false);
          writeLine('Original Est. Cost', `${currency} ${result.financial.budget.initialCalculatedCost.toLocaleString()}`, 10, false);
     } else if (result.financial?.budget?.target) {
           writeLine('Budget Status', `Within budget of ${currency} ${result.financial.budget.target.toLocaleString()}`, 10, false);
     }
      writeLine('Estimated Annual Savings', `${currency} ${result.financial?.estimatedAnnualSavings?.toLocaleString()}`);
      writeLine('Simple Payback Period', result.financial?.simplePaybackYears ? `${result.financial.simplePaybackYears} years` : 'N/A');
      doc.moveDown(1);
      writeBold('Cost Breakdown', 12);
      const costs = result.financial?.costBreakdown;
       write(`   Solar Panels: ${currency} ${costs?.panels?.toLocaleString()}`, 9); doc.moveDown(0.4);
       write(`   Inverter: ${currency} ${costs?.inverter?.toLocaleString()}`, 9); doc.moveDown(0.4);
      if(costs?.batteries > 0) write(`   Batteries: ${currency} ${costs.batteries.toLocaleString()}`, 9); doc.moveDown(0.4);
      if(costs?.chargeController > 0) write(`   Charge Controller: ${currency} ${costs.chargeController.toLocaleString()}`, 9); doc.moveDown(0.4);
       write(`   Mounting & Racking: ${currency} ${costs?.mounting?.toLocaleString()}`, 9); doc.moveDown(0.4);
       write(`   Installation Labor: ${currency} ${costs?.installation?.toLocaleString()}`, 9); doc.moveDown(0.4);
      doc.moveDown(1);

     // Monthly Production Chart (Basic Table in PDF)
     doc.addPage();
     writeBold('Estimated Monthly Production', 14);
      doc.lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke().moveDown(1);

      const tableTop = doc.y;
      const col1X = 60;
      const col2X = 200;
      const col3X = 340; // Example for adding daily avg if needed

      doc.font('Helvetica-Bold');
      write('Month', 10, { x: col1X });
      write('Est. Production (kWh)', 10, { x: col2X, width: 150, align: 'right' });
      // write('Avg. Daily (kWh)', 10, { x: col3X, width: 150, align: 'right'}); // Optional extra column
      doc.font('Helvetica');
      doc.moveDown(1.5);

      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthlyProd = result.productionAnalysis?.monthlyProductionKwh || [];
      monthlyProd.sort((a, b) => a.month - b.month); // Ensure sorted

      monthlyProd.forEach(m => {
         const y = doc.y;
         const monthName = monthNames[m.month - 1] || `M${m.month}`;
         const production = m.production?.toFixed(0) || 'N/A';
         // const dailyAvg = (m.production / new Date(2023, m.month, 0).getDate())?.toFixed(1) || 'N/A'; // Example calc

         write(monthName, 10, { x: col1X });
         write(production, 10, { x: col2X, width: 150, align: 'right' });
         // write(dailyAvg, 10, { x: col3X, width: 150, align: 'right'});
         doc.moveDown(0.7);
      });
      doc.moveDown(1);


    // Footer / Disclaimer
    doc.fontSize(8).text(`Report generated: ${new Date().toLocaleDateString()}. Currency: ${currency}.`, 50, doc.page.height - 50, { align: 'center', width: 500 });
    doc.text('Disclaimer: These calculations are estimates based on provided data and public tools (PVGIS). Actual performance and costs may vary. Consult a certified installer for a detailed quote.', 50, doc.page.height - 40, { align: 'center', width: 500 });

    doc.end();
});

// --- User Data Endpoints ---
app.post('/api/save-calculation', authenticateToken, async (req, res) => {
    const { calculationParams, resultData } = req.body;
    if (!calculationParams || !resultData || !resultData.location) {
        return res.status(400).json({ message: 'Missing or invalid calculation parameters or results data.' });
    }
    try {
        const calculation = new Calculation({
            userId: req.user.userId, // Get userId from authenticated token
            calculationData: calculationParams,
            resultData: resultData,
        });
        await calculation.save();
        res.status(201).json({ message: 'Calculation saved successfully!', id: calculation._id });
    } catch (error) {
        console.error('Save Calculation Error:', error);
        res.status(500).json({ message: 'Error saving calculation.', error: error.message });
    }
});

app.get('/api/calculations', authenticateToken, async (req, res) => {
    try {
        const calculations = await Calculation.find({ userId: req.user.userId }).sort({ createdAt: -1 });
        res.json(calculations);
    } catch (error) {
        console.error('Fetch Calculations Error:', error);
        res.status(500).json({ message: 'Error fetching calculations.', error: error.message });
    }
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err.stack || err);
    // if (err instanceof multer.MulterError) return res.status(400).json({ message: `File upload error: ${err.message}` });
    // if (err.message.startsWith('Validation Error:')) return res.status(400).json({ message: err.message });
    res.status(err.status || 500).json({ message: err.message || 'An unexpected server error occurred.' });
});


// --- Start Server ---
app.listen(port, () => {
    console.log(`SolarFit server running on http://localhost:${port}`);
    if (JWT_SECRET === 'YOUR_REALLY_SECRET_KEY') {
        console.warn("WARNING: JWT_SECRET is using a default value. Set a strong secret in your environment variables for production!");
    }
});