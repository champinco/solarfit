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

// MongoDB Connection
mongoose
    .connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/solarApp')
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error:', err));

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
    residential: [],
    commercial: [],
    industrial: [],
};

// Cache
const cache = {};

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
            const result = { lat: parseFloat(lat), lon: parseFloat(lon) };
            cache[cacheKey] = result;
            return result;
        }
        throw new Error(`Location '${location}' not found.`);
    } catch (error) {
        console.error(`Geocoding error for "${location}":`, error.message);
        if (error.response)
            throw new Error(`Geocoding service error: ${error.response.status} ${error.response.statusText}`);
        else if (error.request) throw new Error('Geocoding service did not respond.');
        else throw error;
    }
}

async function getSolarIrradiance(lat, lon, tilt, azimuth, shadingLoss) {
    const cacheKey = `pvgis:${lat}:${lon}:${tilt}:${azimuth}:${shadingLoss}`;
    if (cache[cacheKey]) return cache[cacheKey];

    const pvgisAspect = azimuth - 180;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error('Invalid coordinates provided.');
    tilt = Math.max(0, Math.min(90, tilt));
    shadingLoss = Math.max(0, Math.min(100, shadingLoss));
    const internalSystemLoss = 14;
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
        if (!response.data.outputs || !response.data.outputs.monthly || !response.data.outputs.totals) {
            throw new Error('PVGIS returned incomplete or invalid solar data.');
        }
        const result = {
            monthly: response.data.outputs.monthly,
            totals: response.data.outputs.totals,
            inputsUsed: response.data.inputs,
        };
        cache[cacheKey] = result;
        return result;
    } catch (error) {
        console.error('PVGIS API Error:', error.response ? JSON.stringify(error.response.data) : error.message);
        if (error.response)
            throw new Error(
                `PVGIS API Error: ${error.response.status} ${error.response.data?.message || error.response.statusText}`
            );
        else if (error.request) throw new Error('PVGIS API did not respond.');
        else throw new Error(`Error fetching solar irradiance: ${error.message}`);
    }
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
    const variance = location.toLowerCase().includes('nairobi') ? 1.0 : 1.05;
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

    const requiredFields = ['location', 'systemType', 'userType'];
    for (const field of requiredFields) {
        if (!params[field]) return res.status(400).json({ message: `Missing required field: ${field}` });
    }
    if (
        !params.avgMonthlyKwh &&
        !params.avgMonthlyBill &&
        (!params.appliances || params.appliances.length === 0)
    ) {
        return res
            .status(400)
            .json({ message: 'Please provide energy usage (Avg. kWh, Avg. Bill, or appliances).' });
    }
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

    const panelWattage = params.panelWattage || 450;
    const autonomyDays = params.systemType !== 'on-grid' ? parseInt(params.autonomyDays, 10) || 1 : null;
    const depthOfDischarge = params.systemType !== 'on-grid' ? parseFloat(params.depthOfDischarge) || 0.8 : null;
    const tilt = parseFloat(params.tilt) || 15;
    const azimuth = parseFloat(params.azimuth) || 180;
    const shadingLoss = parseFloat(params.shading) || 0;
    const electricityPricePerKwh = parseFloat(params.electricityPricePerKwh) || null;
    const targetBudget = params.budget ? parseFloat(params.budget) : null;

    try {
        const { lat, lon } = await getCoordinates(params.location);
        console.log(`Coordinates for ${params.location}:`, { lat, lon });

        const irradianceData = await getSolarIrradiance(lat, lon, tilt, azimuth, shadingLoss);
        const monthlyIrradianceDetails = irradianceData.monthly;
        const annualEnergyPerKwP = irradianceData.totals.E_y;
        const avgDailyEnergyPerKwP = monthlyIrradianceDetails.reduce((sum, month) => sum + month.E_d, 0) / 12;
        const dailyPeakSunHours = avgDailyEnergyPerKwP;
        console.log(`PVGIS Annual Yield (E_y): ${annualEnergyPerKwP.toFixed(2)} kWh/kWp/year`);
        console.log(`Avg Daily Energy (E_d): ${avgDailyEnergyPerKwP.toFixed(2)} kWh/kWp/day`);

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
        if (dailyKwh <= 0) throw new Error('Could not determine daily energy consumption.');
        console.log(`Estimated Daily Consumption: ${dailyKwh.toFixed(2)} kWh (Source: ${energySource})`);

        const pvSystemDerateFactor = 1.0;
        let requiredPvSizeKwP = dailyKwh / (dailyPeakSunHours * pvSystemDerateFactor);
        console.log(`Initial Required PV Size: ${requiredPvSizeKwP.toFixed(2)} kWp`);

        let numberOfPanels = Math.ceil((requiredPvSizeKwP * 1000) / panelWattage);
        let actualPvSizeKwP = (numberOfPanels * panelWattage) / 1000;
        const inverterSizingFactor = params.systemType === 'off-grid' ? 1.0 : 1.15;
        let inverterSizeKva = actualPvSizeKwP * inverterSizingFactor;
        console.log(`Actual PV Size: ${actualPvSizeKwP.toFixed(2)} kWp (${numberOfPanels} x ${panelWattage}W)`);
        console.log(`Inverter Size: ${inverterSizeKva.toFixed(2)} kVA`);

        let batterySizeKwh = 0;
        let numberOfBatteries = 0;
        let targetBatteryCapacityKwh = 0;
        const batteryUnitCapacityKwh = 5;
        if (params.systemType !== 'on-grid') {
            if (!autonomyDays || !depthOfDischarge) throw new Error('Autonomy Days and Depth of Discharge required.');
            const usableEnergyNeeded = dailyKwh * autonomyDays;
            targetBatteryCapacityKwh = usableEnergyNeeded / depthOfDischarge;
            numberOfBatteries = Math.ceil(targetBatteryCapacityKwh / batteryUnitCapacityKwh);
            batterySizeKwh = numberOfBatteries * batteryUnitCapacityKwh;
            console.log(`Battery Target Capacity: ${targetBatteryCapacityKwh.toFixed(2)} kWh`);
            console.log(
                `Battery Actual Size: ${batterySizeKwh.toFixed(2)} kWh (${numberOfBatteries} x ${batteryUnitCapacityKwh} kWh)`
            );

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
                if (finalNumberOfBatteries < 0) finalNumberOfBatteries = 0;
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

        const finalAnnualProduction = finalPvSizeKwP * annualEnergyPerKwP;
        const monthlyProduction = monthlyIrradianceDetails.map((month) => ({
            month: month.month,
            production: month.E_m * finalPvSizeKwP,
        }));

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
                pvgisLossParam: `${totalLoss.toFixed(1)}%`,
                prices: prices,
            },
        };

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
    calcResult.monthlyProduction?.forEach((m) => {
        const y = doc.y;
        doc.text(monthNames[m.month - 1], col1X, y, { width: 100 });
        doc.text(m.production.toFixed(1), col2X, y, { width: 150, align: 'right' });
        doc.moveDown(0.5);
    });
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