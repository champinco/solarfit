const express = require('express');
const axios = require('axios');
const cors = require('cors');
const PDFDocument = require('pdfkit');
// Multer setup remains the same as your original code
const multer = require('multer');
const path = require('path');
const fs = require('fs');
// Mongoose, User, Calculation Schemas, Auth Middleware remain the same
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const port = process.env.PORT || 5000; // Use environment variable for port

// Middleware
app.use(express.json());
app.use(cors()); // Consider more restrictive CORS settings for production

// --- MongoDB Connection (Same as before) ---
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/solarApp') // Use env var for connection string
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- User Schema, Calculation Schema (Same as before) ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});
// Add pre-save hook for hashing password if not already done
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});
const User = mongoose.model('User', userSchema);

const calculationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    calculationData: Object, // Store the input params AND the result for reproducibility
    resultData: Object,
    createdAt: { type: Date, default: Date.now },
});
const Calculation = mongoose.model('Calculation', calculationSchema);

// --- Multer Setup (Same as before) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            try {
                fs.mkdirSync(uploadDir, { recursive: true });
            } catch (err) {
                console.error("Error creating upload directory:", err);
                return cb(err);
            }
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error('Validation Error: Only JPEG, JPG, and PNG files are allowed!'));
        }
    },
}).single('billImage'); // Ensure field name matches frontend if using Multer for OCR upload


// --- Appliance List (Same as before) ---
const appliances = {
    residential: [ /* ...same data ... */ ],
    commercial: [ /* ...same data ... */ ],
    industrial: [ /* ...same data ... */ ]
};


// --- Cache (Same as before) ---
const cache = {}; // Simple in-memory cache, consider Redis/Memcached for production

// --- Authentication Middleware (Same as before) ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretKey'); // Use env var for JWT secret
        req.user = decoded; // Add decoded user payload to request
        next();
    } catch (ex) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};


// --- Endpoints ---

// Get Appliances
app.get('/api/appliances', (req, res) => res.json(appliances));

// --- User Signup (Enhanced error handling) ---
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }
    try {
        let user = await User.findOne({ username });
        if (user) return res.status(400).json({ message: 'Username already exists' });

        // Hashing is handled by pre-save hook now
        user = new User({ username, password });
        await user.save();
        res.status(201).json({ message: 'User created successfully' }); // Use 201 for resource creation
    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: 'Server error during signup', error: error.message });
    }
});

// --- User Login (Enhanced error handling) ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }
    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' }); // Avoid specifying which is wrong
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        // Use environment variable for secret, set expiry
        const token = jwt.sign({ userId: user._id, username: user.username }, process.env.JWT_SECRET || 'secretKey', { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: 'Server error during login', error: error.message });
    }
});


// --- Save Calculation (Protected, save input params too) ---
app.post('/api/save-calculation', authenticateToken, async (req, res) => {
    const { calculationParams, resultData } = req.body; // Expecting both input and result
    if (!calculationParams || !resultData) {
         return res.status(400).json({ message: 'Missing calculation parameters or results.' });
    }
    try {
        const calculation = new Calculation({
             userId: req.user.userId,
             calculationData: calculationParams, // Save the inputs used
             resultData: resultData            // Save the results
         });
        await calculation.save();
        res.status(201).json({ message: 'Calculation saved successfully', id: calculation._id });
    } catch (error) {
        console.error("Save Calculation Error:", error);
        res.status(500).json({ message: 'Error saving calculation', error: error.message });
    }
});


// --- Get User Calculations (Protected) ---
app.get('/api/calculations', authenticateToken, async (req, res) => {
    try {
        const calculations = await Calculation.find({ userId: req.user.userId }).sort({ createdAt: -1 });
        res.json(calculations);
    } catch (error) {
        console.error("Fetch Calculations Error:", error);
        res.status(500).json({ message: 'Error fetching calculations', error: error.message });
    }
});

// --- Geocoding Function (Improved Error Handling) ---
async function getCoordinates(location) {
    const cacheKey = `coords:${location}`;
    if (cache[cacheKey]) return cache[cacheKey];
    try {
        // Added timeout and improved error handling
        const response = await axios.get(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`,
            {
                headers: { 'User-Agent': 'SolarSizingApp/1.0 (Contact: your-email@example.com)' }, // Be polite
                timeout: 5000 // 5 second timeout
            }
        );
        if (response.data && response.data.length > 0) {
            const { lat, lon } = response.data[0];
            const result = { lat: parseFloat(lat), lon: parseFloat(lon) };
            cache[cacheKey] = result;
            return result;
        }
        throw new Error(`Location '${location}' not found by Nominatim.`);
    } catch (error) {
         console.error(`Geocoding error for "${location}":`, error.message);
         // Distinguish between API errors and not found
         if (error.response) {
            throw new Error(`Geocoding service error: ${error.response.status} ${error.response.statusText}`);
         } else if (error.request) {
            throw new Error('Geocoding service did not respond.');
         } else if (error.message.includes('not found')) {
            throw error; // Re-throw the specific "not found" error
         }
         else {
            throw new Error(`Geocoding failed: ${error.message}`);
         }
    }
}


// --- Solar Irradiance with PVGIS (Improved Error Handling) ---
async function getSolarIrradiance(lat, lon, tilt, azimuth, shadingLoss) {
     const cacheKey = `pvgis:${lat}:${lon}:${tilt}:${azimuth}:${shadingLoss}`;
     if (cache[cacheKey]) return cache[cacheKey];

    // PVGIS uses aspect angle relative to South (0=S, -90=E, 90=W). Nominatim Azimuth might need conversion if different.
    // Assuming input 'azimuth' IS relative to South (180 deg = North). PVGIS aspect: 0=S, 90=W, -90=E, 180=N
    // Convert typical Azimuth (0=N, 90=E, 180=S, 270=W) to PVGIS Aspect:
    // Let's stick to the common 180=South input for Azimuth for simplicity from the UI. PVGIS 'aspect' = azimuth - 180.
    const pvgisAspect = azimuth - 180;

    // Basic input validation
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error("Invalid coordinates provided.");
    }
    tilt = Math.max(0, Math.min(90, tilt)); // Clamp tilt
    // pvgisAspect will be calculated from azimuth
    shadingLoss = Math.max(0, Math.min(100, shadingLoss)); // Clamp shading

    // PVGIS recommends 14% default loss, we add shading loss on top. System loss = 14% base + user defined shading. Let's clarify this.
    // OR interpret PVGIS 'loss' parameter as total losses, and use a base loss + shading loss. Let's assume 10% base internal loss + user % shading
    const internalSystemLoss = 10; // Base efficiency loss % (cables, inverter, dirt, temp etc.) - Simplified
    const totalLoss = internalSystemLoss + shadingLoss;

    const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc`;
    const params = {
        lat: lat.toFixed(4),
        lon: lon.toFixed(4),
        outputformat: 'json',
        pvcalculation: 1,       // Use PV calculation mode
        peakpower: 1,           // Calculate for 1 kWp
        mountingplace: 'building', // Or 'free' if ground mount is common
        loss: totalLoss.toFixed(1), // System losses (%)
        angle: tilt.toFixed(1),     // Tilt angle
        aspect: pvgisAspect.toFixed(1),   // Azimuth relative to South
        // Add more specific params if needed, e.g., pvtechchoice='crystSi'
    };

    try {
        console.log("Requesting PVGIS:", url, params); // Log the request
        const response = await axios.get(url, { params, timeout: 10000 }); // 10s timeout

        if (response.data && response.data.outputs && response.data.outputs.monthly && Array.isArray(response.data.outputs.monthly.fixed)) {
            const result = {
                monthly: response.data.outputs.monthly.fixed, // Monthly specific production kWh/kWp
                totals: response.data.outputs.totals.fixed,   // Annual totals
                inputsUsed: response.data.inputs // Include inputs PVGIS used for clarity
            };
             cache[cacheKey] = result; // Cache successful result
             return result;
        } else {
            console.error("PVGIS response missing expected data structure:", response.data);
            throw new Error('PVGIS returned incomplete or invalid solar data.');
        }
    } catch (error) {
        console.error("PVGIS API Error:", error.response ? JSON.stringify(error.response.data) : error.message);
         if (error.response) {
            throw new Error(`PVGIS API Error: ${error.response.status} ${error.response.data?.message || error.response.statusText}`);
         } else if (error.request) {
             throw new Error('PVGIS API did not respond.');
         }
        else {
            throw new Error(`Error fetching solar irradiance: ${error.message}`);
        }
    }
}


// --- Dynamic Pricing - Mock Function (Slightly adjusted, STILL A PLACEHOLDER) ---
async function getComponentPrices(location) {
    // In reality, this would involve DB lookups, external APIs, regional adjustments.
    // Base prices (example - adjust for your market)
    const basePrices = {
        panelCostPerWatt: 70,    // Cost per WATT of panel (e.g., 70 KSh/W)
        inverterCostPerKva: 12000, // Cost per KVA of inverter
        batteryCostPerKwh: 25000,  // Cost per KWH of LFP battery storage
        chargeControllerCostPerKw: 5000, // Cost scaled roughly with PV system size
        mountingStructureCostPerPanel: 3000, // Per panel estimate
        installationLaborCostFactor: 0.15, // % of hardware cost for labor
    };

    // Add minor location variance (mock)
    const variance = (location.toLowerCase().includes('nairobi')) ? 1.0 : 1.05;

    return {
        panelCostPerWatt: basePrices.panelCostPerWatt * variance,
        inverterCostPerKva: basePrices.inverterCostPerKva * variance,
        batteryCostPerKwh: basePrices.batteryCostPerKwh * variance,
        chargeControllerCostPerKw: basePrices.chargeControllerCostPerKw * variance,
        mountingStructureCostPerPanel: basePrices.mountingStructureCostPerPanel * variance,
        installationLaborCostFactor: basePrices.installationLaborCostFactor, // Labor less variable for mock
    };
}

// --- Calculation Endpoint (Enhanced Logic & Financials) ---
app.post('/api/calculate', async (req, res) => {
    const params = req.body;
    console.log("Calculation Params Received:", params);

    // --- Input Validation ---
    const requiredFields = ['location', 'systemType', 'userType'];
    for (const field of requiredFields) {
        if (!params[field]) {
            return res.status(400).json({ message: `Missing required field: ${field}` });
        }
    }
    if (!params.avgMonthlyKwh && !params.avgMonthlyBill && (!params.appliances || params.appliances.length === 0)) {
         return res.status(400).json({ message: 'Please provide energy usage (Avg. kWh, Avg. Bill, or detailed appliances).' });
    }
    if (params.systemType !== 'on-grid' && (!params.autonomyDays || params.autonomyDays < 1)) {
        return res.status(400).json({ message: 'Autonomy days (>= 1) are required for off-grid/hybrid systems.' });
    }
     if (params.systemType !== 'on-grid' && (!params.depthOfDischarge || params.depthOfDischarge <= 0 || params.depthOfDischarge > 1)) {
         return res.status(400).json({ message: 'Valid Battery Depth of Discharge (0-1, e.g., 0.8 for 80%) is required for off-grid/hybrid systems.' });
     }
     if (!params.electricityPricePerKwh || params.electricityPricePerKwh <= 0) {
         console.warn("Warning: Electricity price per kWh not provided or invalid, payback calculation skipped.");
         // Allow calculation without price, but payback will be null
         // return res.status(400).json({ message: 'Current Electricity Price (per kWh) is required for financial calculations.' });
     }


    // --- Default values ---
    const panelWattage = params.panelWattage || 450; // Default panel wattage (Wp), now from params
    const autonomyDays = params.systemType !== 'on-grid' ? parseInt(params.autonomyDays, 10) || 1 : null;
    const depthOfDischarge = params.systemType !== 'on-grid' ? parseFloat(params.depthOfDischarge) || 0.8 : null; // Default 80% DoD
    const tilt = parseFloat(params.tilt) || 15; // Default tilt - could be location dependent
    const azimuth = parseFloat(params.azimuth) || 180; // Default Azimuth (180=South facing)
    const shadingLoss = parseFloat(params.shading) || 0; // User input Shading % ON TOP of base losses
    const electricityPricePerKwh = parseFloat(params.electricityPricePerKwh) || null;
    const targetBudget = params.budget ? parseFloat(params.budget) : null;


    try {
        // 1. Geocoding
        const { lat, lon } = await getCoordinates(params.location);
        console.log(`Coordinates for ${params.location}:`, { lat, lon });

        // 2. Solar Irradiance
        const irradianceData = await getSolarIrradiance(lat, lon, tilt, azimuth, shadingLoss);
        const monthlyIrradianceDetails = irradianceData.monthly; // Array of {month, E_d, E_m, H(i)_d, H(i)_m, SD_m} kWh/kWp/day|month
        const annualEnergyPerKwP = irradianceData.totals.E_y; // Total annual energy production per kWp installed (kWh/kWp/year)
        // Calculate Average Daily Peak Sun Hours (PSH) from annual average daily irradiation
        // G(i)_d_avg = Sum(H(i)_m * days_in_month) / 365  (Avg Daily horizontal irradiation kWh/m2/day)
        // PSH can be roughly E_d (daily energy from 1kWp) -> Let's use average E_d
        const avgDailyEnergyPerKwP = monthlyIrradianceDetails.reduce((sum, month) => sum + month.E_d, 0) / 12;
        // Peak Sun Hours is effectively this E_d value in this PVGIS context (kWh/kWp/day = hours equivalent of peak sun)
        const dailyPeakSunHours = avgDailyEnergyPerKwP; // Use avg daily kWh/kWp from PVGIS

        console.log(`PVGIS Annual Yield (E_y): ${annualEnergyPerKwP.toFixed(2)} kWh/kWp/year`);
        console.log(`Avg Daily Energy (E_d): ${avgDailyEnergyPerKwP.toFixed(2)} kWh/kWp/day (Effective PSH)`);


        // 3. Daily Energy Consumption Calculation
        let dailyKwh = 0;
        let energySource = '';
        if (params.appliances && params.appliances.length > 0) {
            dailyKwh = params.appliances.reduce((sum, appliance) => {
                const powerKW = (appliance.power || 0) / 1000;
                const quantity = appliance.quantity || 1;
                const hours = appliance.hoursPerDay || 0;
                return sum + (powerKW * quantity * hours);
            }, 0);
             energySource = 'Appliances';
        } else if (params.avgMonthlyKwh && params.avgMonthlyKwh > 0) {
             dailyKwh = parseFloat(params.avgMonthlyKwh) / 30.4; // Avg days per month
             energySource = 'Monthly kWh';
        } else if (params.avgMonthlyBill && params.avgMonthlyBill > 0 && electricityPricePerKwh > 0) {
            // Estimate kWh from bill only if price is known
            dailyKwh = (parseFloat(params.avgMonthlyBill) / electricityPricePerKwh) / 30.4;
             energySource = 'Monthly Bill Estimate';
        } else if (params.avgMonthlyBill && params.avgMonthlyBill > 0 ) {
            // Fallback if price unknown: VERY rough estimate using a generic price (e.g., 20 KSh/kWh)
            const roughPrice = 20;
            dailyKwh = (parseFloat(params.avgMonthlyBill) / roughPrice) / 30.4;
            energySource = `Monthly Bill Estimate (Assumed ${roughPrice} KSh/kWh)`;
            console.warn("Estimating kWh from bill using assumed price - provide exact price for better accuracy.");
        }
        if (dailyKwh <= 0) {
             throw new Error("Could not determine daily energy consumption from inputs.");
        }
         console.log(`Estimated Daily Consumption: ${dailyKwh.toFixed(2)} kWh (Source: ${energySource})`);

        // 4. PV System Sizing (kWp)
        // System efficiency here accounts for conversion losses AFTER panel production (DC -> AC, battery charge/discharge if applicable)
        // PVGIS already accounts for panel-level losses (temp, dirt, mismatch etc within its 'loss' param).
        // Let's use a simpler approach: size PV based on energy needed / PSH, considering overall efficiency
        // Overall system efficiency (panel-to-load, excluding battery charge/discharge for PV sizing directly)
        const pvSystemDerateFactor = 0.80; // Further derating beyond PVGIS loss: cabling, inverter eff, potential mismatch
        // Calculate raw kWp needed based *only* on consumption and PSH/irradiance
        let requiredPvSizeKwP = dailyKwh / (dailyPeakSunHours * pvSystemDerateFactor);


        console.log(`Initial Required PV Size: ${requiredPvSizeKwP.toFixed(2)} kWp`);

        // 5. Component Sizing
        const numberOfPanels = Math.ceil((requiredPvSizeKwP * 1000) / panelWattage);
        const actualPvSizeKwP = (numberOfPanels * panelWattage) / 1000; // Recalculate based on whole panels

        // Inverter Size: Typically 1.0x to 1.25x of PV kWp for On-Grid/Hybrid. Off-grid might match load closer.
        const inverterSizingFactor = (params.systemType === 'off-grid') ? 1.0 : 1.15;
        let inverterSizeKva = actualPvSizeKwP * inverterSizingFactor; // kVA often used, assume power factor near 1 for sizing simplicity

         console.log(`Actual PV Size (based on panels): ${actualPvSizeKwP.toFixed(2)} kWp (${numberOfPanels} x ${panelWattage}W panels)`);
         console.log(`Inverter Size: ${inverterSizeKva.toFixed(2)} kVA`);


        // Battery Sizing (Off-Grid / Hybrid)
        let batterySizeKwh = 0;
        let numberOfBatteries = 0;
        let targetBatteryCapacityKwh = 0; // Define before the if block
        const batteryVoltage = 48; // Common system voltage (V) - needed for some calcs/component selection later maybe
        const batteryUnitCapacityKwh = 5; // Assumed capacity of a single battery unit (e.g., 5kWh LFP module)

        if (params.systemType !== 'on-grid') {
             if (!autonomyDays || !depthOfDischarge) {
                 throw new Error("Autonomy Days and Depth of Discharge are required for battery sizing.");
             }
            // Usable energy needed = Daily Load * Autonomy Days
            const usableEnergyNeeded = dailyKwh * autonomyDays;
            // Total battery capacity needed = Usable Energy / Depth of Discharge
            targetBatteryCapacityKwh = usableEnergyNeeded / depthOfDischarge;
            numberOfBatteries = Math.ceil(targetBatteryCapacityKwh / batteryUnitCapacityKwh);
            batterySizeKwh = numberOfBatteries * batteryUnitCapacityKwh; // Actual installed capacity based on whole units

            console.log(`Battery Target Capacity: ${targetBatteryCapacityKwh.toFixed(2)} kWh (for ${autonomyDays} days, ${dailyKwh.toFixed(2)} kWh/day, ${depthOfDischarge*100}% DoD)`);
            console.log(`Battery Actual Size: ${batterySizeKwh.toFixed(2)} kWh (${numberOfBatteries} x ${batteryUnitCapacityKwh} kWh units)`);

            // Re-evaluate PV size for Off-Grid: Ensure PV can recharge battery AND supply daily load
            // Minimum daily production needed = Daily Load + (Battery Recharge / Sunny hours) - This gets complex.
            // Simplified Off-Grid check: Increase PV size to cover battery charging. Assume 5 PSH charge battery?
             // PV must produce enough to cover daily load AND recharge battery depletion within sun hours.
             // Recharge needed = Daily Load / DoD (roughly, amount drawn from batt daily)
             // Total daily PV generation needed approx = Daily Load + (Recharge Needed / PSH)? This isn't quite right.
             // Let's use a simpler rule of thumb: Increase PV size by 20-30% for off-grid charging needs.
             const offGridSizingFactor = 1.25; // Increase PV size by 25% for battery charging buffer
             requiredPvSizeKwP = (dailyKwh * offGridSizingFactor) / (dailyPeakSunHours * pvSystemDerateFactor);
             const revisedNumberOfPanels = Math.ceil((requiredPvSizeKwP * 1000) / panelWattage);
             if(revisedNumberOfPanels > numberOfPanels){
                 console.log(`Increasing PV size for Off-Grid battery charging: ${numberOfPanels} -> ${revisedNumberOfPanels} panels`);
                 numberOfPanels = revisedNumberOfPanels;
                 actualPvSizeKwP = (numberOfPanels * panelWattage) / 1000;
                 // Re-calculate inverter size based on potentially larger PV array for off-grid
                 inverterSizeKva = actualPvSizeKwP * inverterSizingFactor; // Adjust inverter too
                 console.log(`Revised Actual PV Size: ${actualPvSizeKwP.toFixed(2)} kWp`);
                 console.log(`Revised Inverter Size: ${inverterSizeKva.toFixed(2)} kVA`);

             }

        }

        // 6. Cost Calculation
        const prices = await getComponentPrices(params.location);
        const totalPanelCost = numberOfPanels * panelWattage * prices.panelCostPerWatt; // Based on actual panel watts
        const totalInverterCost = inverterSizeKva * prices.inverterCostPerKva;
        const totalBatteryCost = (params.systemType !== 'on-grid') ? numberOfBatteries * batteryUnitCapacityKwh * prices.batteryCostPerKwh : 0; // Based on actual capacity * price/kWh
        // Charge controller often needed for off-grid/hybrid with battery banks
        const totalChargeControllerCost = (params.systemType !== 'on-grid' && totalBatteryCost > 0) ? actualPvSizeKwP * prices.chargeControllerCostPerKw : 0;
        const totalMountingCost = numberOfPanels * prices.mountingStructureCostPerPanel;
        const hardwareCost = totalPanelCost + totalInverterCost + totalBatteryCost + totalChargeControllerCost + totalMountingCost;
        const installationCost = hardwareCost * prices.installationLaborCostFactor;
        let totalCost = hardwareCost + installationCost;

         console.log(`Estimated Costs (KSh): Panels=${totalPanelCost.toFixed(0)}, Inverter=${totalInverterCost.toFixed(0)}, Batteries=${totalBatteryCost.toFixed(0)}, CC=${totalChargeControllerCost.toFixed(0)}, Mounting=${totalMountingCost.toFixed(0)}, Install=${installationCost.toFixed(0)}`);
         console.log(`Estimated Total Cost: ${totalCost.toFixed(0)} KSh`);


        // 7. Budget Constraint Handling
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
            console.log(`Budget constraint applied: Initial cost ${totalCost.toFixed(0)} > budget ${targetBudget.toFixed(0)}`);
            // Simple scaling - reduces everything proportionally. A more complex logic would prioritize components.
            const scaleFactor = targetBudget / totalCost;

            // Scale PV Size (indirectly by scaling panels)
            finalNumberOfPanels = Math.floor(numberOfPanels * scaleFactor); // Reduce panels first
            if (finalNumberOfPanels < 1) finalNumberOfPanels = 1; // Ensure at least 1 panel if budget allows anything
            finalPvSizeKwP = (finalNumberOfPanels * panelWattage) / 1000;

            // Scale Inverter (based on scaled PV)
            finalInverterSizeKva = finalPvSizeKwP * inverterSizingFactor; // Resize inverter to match smaller PV

             // Scale Battery (if applicable)
             if (params.systemType !== 'on-grid' && numberOfBatteries > 0) {
                 const scaledTargetCapacity = targetBatteryCapacityKwh * scaleFactor;
                 finalNumberOfBatteries = Math.floor(scaledTargetCapacity / batteryUnitCapacityKwh); // Use floor as budget is limit
                  if(finalNumberOfBatteries < 0) finalNumberOfBatteries = 0; // Can't have negative batteries
                 finalBatterySizeKwh = finalNumberOfBatteries * batteryUnitCapacityKwh;
             } else {
                 finalNumberOfBatteries = 0;
                 finalBatterySizeKwh = 0;
             }


             // Recalculate costs based on scaled components
             finalTotalPanelCost = finalNumberOfPanels * panelWattage * prices.panelCostPerWatt;
             finalTotalInverterCost = finalInverterSizeKva * prices.inverterCostPerKva;
             finalTotalBatteryCost = (params.systemType !== 'on-grid' && finalNumberOfBatteries > 0) ? finalNumberOfBatteries * batteryUnitCapacityKwh * prices.batteryCostPerKwh : 0;
             finalTotalChargeControllerCost = (params.systemType !== 'on-grid' && finalTotalBatteryCost > 0) ? finalPvSizeKwP * prices.chargeControllerCostPerKw : 0;
             finalTotalMountingCost = finalNumberOfPanels * prices.mountingStructureCostPerPanel;
             const finalHardwareCost = finalTotalPanelCost + finalTotalInverterCost + finalTotalBatteryCost + finalTotalChargeControllerCost + finalTotalMountingCost;
             finalInstallationCost = finalHardwareCost * prices.installationLaborCostFactor;
             finalTotalCost = finalHardwareCost + finalInstallationCost; // This should be close to budget

              console.log(`Scaled System: PV=${finalPvSizeKwP.toFixed(2)}kWp, Panels=${finalNumberOfPanels}, Inv=${finalInverterSizeKva.toFixed(2)}kVA, Batt=${finalBatterySizeKwh.toFixed(2)}kWh`);
              console.log(`Scaled Final Cost: ${finalTotalCost.toFixed(0)} KSh`);
        }

        // 8. Production & Financial Calculation
        // Use the potentially budget-scaled PV size for production estimate
        const finalAnnualProduction = finalPvSizeKwP * annualEnergyPerKwP;
        const monthlyProduction = monthlyIrradianceDetails.map(month => ({
            month: month.month, // Month number (1-12)
            // E_m is kWh/month/kWp. Multiply by final PV size.
            production: (month.E_m * finalPvSizeKwP),
        }));

        let simplePaybackYears = null;
         if (electricityPricePerKwh && electricityPricePerKwh > 0 && finalAnnualProduction > 0) {
            const annualSavings = finalAnnualProduction * electricityPricePerKwh;
            if (annualSavings > 0 && finalTotalCost > 0) {
                 simplePaybackYears = finalTotalCost / annualSavings;
                 console.log(`Financials: Annual Prod=${finalAnnualProduction.toFixed(0)} kWh, Annual Savings=${annualSavings.toFixed(0)} KSh, Payback=${simplePaybackYears.toFixed(1)} years`);
            } else {
                console.warn("Payback cannot be calculated: Zero savings or zero cost.");
            }
         } else {
             console.warn("Payback calculation skipped: Missing electricity price, zero production, or zero cost.");
         }


        // 9. Prepare Result Object
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
            dailyPeakSunHours: dailyPeakSunHours, // Effective PSH based on PVGIS E_d
            budgetConstrained: budgetConstraintApplied,
            targetBudget: targetBudget, // Include budget if provided
            simplePaybackYears: simplePaybackYears, // Can be null
            monthlyProduction: monthlyProduction, // Array of { month, production }
            estimatedCost: {
                panels: Math.round(finalTotalPanelCost),
                inverter: Math.round(finalTotalInverterCost),
                batteries: Math.round(finalTotalBatteryCost),
                chargeController: Math.round(finalTotalChargeControllerCost),
                mounting: Math.round(finalTotalMountingCost),
                installation: Math.round(finalInstallationCost),
                total: Math.round(finalTotalCost),
            },
            assumptions: { // Add assumptions used
                panelWattageUsed: panelWattage,
                systemDerateFactor: pvSystemDerateFactor,
                inverterSizingFactor: inverterSizingFactor,
                pvgisLossParam: `${(10 + shadingLoss).toFixed(1)}%`, // Show combined loss used for PVGIS call
                prices: prices, // Include the mock prices used
            },
        };

        if (params.systemType !== 'on-grid') {
             result.autonomyDays = autonomyDays;
             result.battery = {
                 sizeKwh: finalBatterySizeKwh,
                 numberOfUnits: finalNumberOfBatteries,
                 unitCapacityKwh: batteryUnitCapacityKwh,
                 depthOfDischarge: depthOfDischarge,
                 targetCapacityKwh: targetBatteryCapacityKwh // Show the ideal target before rounding
             }
        }

        res.json(result);

    } catch (error) {
        console.error("Calculation Endpoint Error:", error);
        res.status(500).json({ message: `Error calculating solar system: ${error.message}` });
    }
});


// --- PDF Generation (Adjust to use fields from the new result structure) ---
app.post('/api/generate-pdf', (req, res) => {
    const calcResult = req.body; // Expecting the full result object from /calculate
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=SolarSizingReport.pdf');
    doc.pipe(res);

    // Helper function for text
    const writeText = (label, value, size = 12, space = 1) => {
        doc.fontSize(size).text(`${label}: ${value || 'N/A'}`, { continued: false });
        doc.moveDown(space);
    };

    // --- Report Content ---
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
    writeText('Est. Simple Payback Period', calcResult.simplePaybackYears ? `${calcResult.simplePaybackYears.toFixed(1)} years` : 'N/A (Check inputs)');
     if(calcResult.targetBudget){
         writeText('Target Budget Provided', `KSh ${calcResult.targetBudget.toLocaleString()}`);
         writeText('Budget Constraint Applied?', calcResult.budgetConstrained ? 'Yes' : 'No');
     }

    doc.fontSize(14).text('Estimated Cost Breakdown (KSh):');
    const costs = calcResult.estimatedCost;
    writeText('  Solar Panels', costs?.panels?.toLocaleString(), 10, 0.5);
    writeText('  Inverter', costs?.inverter?.toLocaleString(), 10, 0.5);
    if (costs?.batteries > 0) writeText('  Batteries', costs.batteries.toLocaleString(), 10, 0.5);
    if (costs?.chargeController > 0) writeText('  Charge Controller', costs.chargeController.toLocaleString(), 10, 0.5);
    writeText('  Mounting & Racking', costs?.mounting?.toLocaleString(), 10, 0.5);
    writeText('  Installation Labor', costs?.installation?.toLocaleString(), 10, 0.5);
    doc.moveDown(0.5);
    doc.fontSize(14).text(`Total Estimated System Cost: KSh ${costs?.total?.toLocaleString()}`, { underline: true });
    doc.moveDown(1);


    // Monthly Production Table (Optional - could get long)
    doc.addPage(); // Put on new page maybe
    doc.fontSize(16).text('Estimated Monthly Production', { underline: true });
    doc.moveDown();
    doc.fontSize(10);
    const tableTop = doc.y;
    const col1X = 50;
    const col2X = 200;

    doc.text('Month', col1X, tableTop, {width: 100});
    doc.text('Production (kWh)', col2X, tableTop, {width: 150, align: 'right'});
    doc.y = tableTop + 15; // Move below header

     const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    calcResult.monthlyProduction?.forEach(m => {
        const y = doc.y;
         doc.text(monthNames[m.month - 1], col1X, y, {width: 100});
         doc.text(m.production.toFixed(1), col2X, y, {width: 150, align: 'right'});
         doc.moveDown(0.5);
    });
    doc.moveDown();

    // Disclaimer / Footer
     doc.fontSize(8).text(`Report generated on ${new Date().toLocaleDateString()}. Estimates are based on provided inputs and standardized models (PVGIS, mock pricing). Actual performance and costs may vary. Consult a qualified solar professional for detailed site assessment and quotes.`, 50, doc.page.height - 60, {align: 'center', width: doc.page.width - 100});


    doc.end();
});

// Global error handler middleware (add at the end)
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err);
  // Handle Multer errors specifically
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: `File upload error: ${err.message}` });
  }
  // Handle file filter errors
  if (err.message.startsWith('Validation Error:')) {
      return res.status(400).json({message: err.message})
  }

  res.status(500).json({ message: err.message || 'Something went wrong!' });
});


app.listen(port, () => console.log(`Server running on http://localhost:${port}`));