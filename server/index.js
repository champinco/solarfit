const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = 5000;

// Middleware
app.use(express.json());
app.use(cors());

// Cache for geocoding results
const cache = {};

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

// Solar irradiance function with validation
async function getSolarIrradiance(lat, lon) {
  try {
    const response = await axios.get(
      `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat}&lon=${lon}&outputformat=json&peakpower=1&loss=14&mountingplace=free`
    );
    // Safely access monthly.fixed using optional chaining
    const monthlyData = response.data.outputs?.monthly?.fixed;
    if (Array.isArray(monthlyData)) {
      console.log(`Fetched solar irradiance for lat=${lat}, lon=${lon}`);
      return monthlyData;
    } else {
      console.log('Unexpected API response:', response.data);
      throw new Error('Invalid solar data: monthly.fixed data missing or not an array');
    }
  } catch (error) {
    console.error('API call error:', error.message);
    throw new Error(`Solar irradiance error: ${error.message}`);
  }
}

// Calculation endpoint
app.post('/api/calculate', async (req, res) => {
  const params = req.body;

  try {
    // Fetch coordinates
    const { lat, lon } = await getCoordinates(params.location);

    // Fetch solar irradiance data
    const monthlyIrradiance = await getSolarIrradiance(lat, lon);

    // Validate monthlyIrradiance data structure
    if (!Array.isArray(monthlyIrradiance) || !monthlyIrradiance.every(month => typeof month.E_d === 'number')) {
      console.log('Invalid monthlyIrradiance data:', monthlyIrradiance);
      throw new Error('Invalid monthly irradiance data: missing or malformed E_d values');
    }

    // Calculate daily peak sun hours
    const annualIrradiance = monthlyIrradiance.reduce((sum, month) => sum + month.E_d, 0);
    const dailyPeakSunHours = annualIrradiance / 365;

    // Estimate daily energy consumption
    const monthlyKwh = params.avgMonthlyKwh || (params.avgMonthlyBill / 20); // Assuming 20 units/kWh
    const dailyKwh = monthlyKwh / 30;

    // Solar sizing
    const systemEfficiency = 0.8;
    const pvSize = dailyKwh / (dailyPeakSunHours * systemEfficiency);

    let batterySize = null;
    if (params.systemType === 'off-grid' || params.systemType === 'hybrid') {
      const autonomyDays = params.autonomyDays || 1;
      batterySize = dailyKwh * autonomyDays * 1.25; // 25% buffer
    }

    const inverterSize = pvSize * 0.9;

    // Results
    const results = {
      pvSizeKwP: parseFloat(pvSize.toFixed(2)),
      inverterSizeKva: parseFloat(inverterSize.toFixed(2)),
      batterySizeKwh: batterySize ? parseFloat(batterySize.toFixed(2)) : null,
      dailyPeakSunHours: parseFloat(dailyPeakSunHours.toFixed(2)),
    };

    console.log('Calculation results:', results);
    res.status(200).json(results);
  } catch (error) {
    console.error('Calculation error:', error.message);
    res.status(500).json({ message: 'Calculation failed', error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});