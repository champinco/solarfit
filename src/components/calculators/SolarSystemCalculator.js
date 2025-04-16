import React, { useState } from 'react';
import { 
  CalculatorIcon, 
  SunIcon, 
  CurrencyDollarIcon,
  LightningBoltIcon,
  ClockIcon,
  ChartPieIcon
} from '@heroicons/react/outline';
import BillUploader from './BillUploader';

const SolarSystemCalculator = () => {
  const [formData, setFormData] = useState({
    monthlyBill: '',
    monthlyConsumption: '',
    location: 'Nairobi',
    roofType: 'concrete',
    roofOrientation: 'north',
    shading: 'none',
    appliances: [
      { name: 'Refrigerator', watts: 150, hours: 24, quantity: 1 },
      { name: 'TV', watts: 100, hours: 4, quantity: 1 },
      { name: 'Lights', watts: 10, hours: 6, quantity: 5 },
      { name: 'Water Pump', watts: 750, hours: 2, quantity: 1 }
    ],
    usageProfile: 'standard' // New field for energy demand profile
  });

  const [results, setResults] = useState(null);
  const [showDemandProfile, setShowDemandProfile] = useState(false);
  const [calculationMethod, setCalculationMethod] = useState('appliances');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleApplianceChange = (index, field, value) => {
    const newAppliances = [...formData.appliances];
    newAppliances[index][field] = value;
    setFormData(prev => ({
      ...prev,
      appliances: newAppliances
    }));
  };

  const addAppliance = () => {
    setFormData(prev => ({
      ...prev,
      appliances: [...prev.appliances, { name: '', watts: 0, hours: 0, quantity: 1 }]
    }));
  };

  const removeAppliance = (index) => {
    const newAppliances = [...formData.appliances];
    newAppliances.splice(index, 1);
    setFormData(prev => ({
      ...prev,
      appliances: newAppliances
    }));
  };

  const handleBillDataExtracted = (data) => {
    setFormData(prev => ({
      ...prev,
      monthlyBill: data.monthlyBill || prev.monthlyBill,
      monthlyConsumption: data.monthlyConsumption || prev.monthlyConsumption
    }));
    
    // Switch to consumption-based calculation
    setCalculationMethod('consumption');
  };

  const calculateSystem = () => {
    // Calculate daily energy consumption
    let dailyConsumption = 0;
    
    if (calculationMethod === 'appliances') {
      // Calculate from appliances list
      dailyConsumption = formData.appliances.reduce((total, appliance) => {
        return total + (appliance.watts * appliance.hours * appliance.quantity) / 1000;
      }, 0);
    } else {
      // Calculate from monthly consumption
      dailyConsumption = parseFloat(formData.monthlyConsumption) / 30 || 0;
    }

    // Factor in system losses (typically 20%)
    const systemLosses = 0.2;
    const totalDailyConsumption = dailyConsumption * (1 + systemLosses);

    // Apply profile factors based on usage profile
    let profileFactor = 1;
    switch(formData.usageProfile) {
      case 'low':
        profileFactor = 0.8;
        break;
      case 'high':
        profileFactor = 1.3;
        break;
      case 'commercial':
        profileFactor = 1.5;
        break;
      default: // standard
        profileFactor = 1;
    }
    
    const adjustedConsumption = totalDailyConsumption * profileFactor;

    // Calculate required system size based on Kenya's average sun hours
    const sunHours = getSunHoursForLocation(formData.location);
    const requiredSystemSize = adjustedConsumption / sunHours;

    // Calculate battery storage (2 days autonomy)
    const batteryCapacity = (adjustedConsumption * 2) / 0.8; // 80% depth of discharge

    // Calculate estimated cost (KES)
    const costPerWatt = 150; // Average cost per watt in Kenya
    const estimatedCost = requiredSystemSize * 1000 * costPerWatt;

    // Calculate monthly savings
    const currentMonthlyBill = parseFloat(formData.monthlyBill) || 0;
    const monthlySavings = currentMonthlyBill * 0.8; // Assuming 80% reduction

    // Calculate ROI
    const roiMonths = estimatedCost / monthlySavings;

    // Generate hourly usage data for the profile
    const hourlyUsage = generateHourlyUsageData(formData.usageProfile, adjustedConsumption);

    setResults({
      dailyConsumption: adjustedConsumption.toFixed(2),
      unadjustedConsumption: totalDailyConsumption.toFixed(2),
      requiredSystemSize: requiredSystemSize.toFixed(2),
      batteryCapacity: batteryCapacity.toFixed(2),
      estimatedCost: estimatedCost.toLocaleString(),
      monthlySavings: monthlySavings.toLocaleString(),
      roiMonths: roiMonths.toFixed(1),
      profileFactor,
      hourlyUsage,
      calculationMethod
    });
  };

  const getSunHoursForLocation = (location) => {
    const sunHoursByLocation = {
      'Nairobi': 5.5,
      'Mombasa': 6.0,
      'Kisumu': 5.3,
      'Nakuru': 5.6
    };
    return sunHoursByLocation[location] || 5.0;
  };

  const generateHourlyUsageData = (profile, totalDailyUsage) => {
    const hourlyData = [];
    
    // Different patterns based on profile
    const patterns = {
      'low': [0.01, 0.01, 0.01, 0.01, 0.02, 0.05, 0.07, 0.08, 0.06, 0.04, 0.03, 0.03, 0.04, 0.03, 0.03, 0.04, 0.05, 0.08, 0.09, 0.09, 0.07, 0.04, 0.02, 0.01],
      'standard': [0.01, 0.01, 0.01, 0.01, 0.02, 0.06, 0.08, 0.07, 0.05, 0.04, 0.04, 0.05, 0.06, 0.05, 0.04, 0.05, 0.06, 0.08, 0.10, 0.09, 0.08, 0.05, 0.03, 0.01],
      'high': [0.02, 0.01, 0.01, 0.01, 0.02, 0.05, 0.07, 0.08, 0.07, 0.06, 0.05, 0.06, 0.07, 0.06, 0.05, 0.06, 0.07, 0.09, 0.11, 0.10, 0.08, 0.06, 0.03, 0.02],
      'commercial': [0.01, 0.01, 0.01, 0.01, 0.02, 0.03, 0.05, 0.08, 0.09, 0.09, 0.09, 0.08, 0.08, 0.08, 0.08, 0.08, 0.07, 0.05, 0.03, 0.02, 0.02, 0.01, 0.01, 0.01]
    };
    
    const selectedPattern = patterns[profile] || patterns.standard;
    
    for (let hour = 0; hour < 24; hour++) {
      hourlyData.push({
        hour,
        usage: (selectedPattern[hour] * totalDailyUsage).toFixed(2)
      });
    }
    
    return hourlyData;
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center mb-6">
        <CalculatorIcon className="h-8 w-8 text-blue-600 mr-2" />
        <h2 className="text-2xl font-bold text-gray-800">Solar System Calculator</h2>
      </div>

      <BillUploader onDataExtracted={handleBillDataExtracted} />
      
      <div className="mb-6">
        <div className="flex space-x-2 border-b border-gray-200">
          <button
            className={`py-2 px-4 font-medium text-sm focus:outline-none ${
              calculationMethod === 'appliances' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setCalculationMethod('appliances')}
          >
            Calculate by Appliances
          </button>
          <button
            className={`py-2 px-4 font-medium text-sm focus:outline-none ${
              calculationMethod === 'consumption' 
                ? 'text-blue-600 border-b-2 border-blue-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setCalculationMethod('consumption')}
          >
            Calculate by Consumption
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Monthly Electricity Bill (KES)</label>
              <input
                type="number"
                name="monthlyBill"
                value={formData.monthlyBill}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {calculationMethod === 'consumption' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Monthly Consumption (kWh)</label>
                <input
                  type="number"
                  name="monthlyConsumption"
                  value={formData.monthlyConsumption}
                  onChange={handleChange}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700">Location</label>
              <select
                name="location"
                value={formData.location}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="Nairobi">Nairobi</option>
                <option value="Mombasa">Mombasa</option>
                <option value="Kisumu">Kisumu</option>
                <option value="Nakuru">Nakuru</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Roof Type</label>
              <select
                name="roofType"
                value={formData.roofType}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="concrete">Concrete</option>
                <option value="metal">Metal</option>
                <option value="tile">Tile</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Energy Demand Profile</label>
              <select
                name="usageProfile"
                value={formData.usageProfile}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="low">Low Usage (Conservative)</option>
                <option value="standard">Standard Usage (Typical Home)</option>
                <option value="high">High Usage (Power Intensive)</option>
                <option value="commercial">Commercial Usage</option>
              </select>
              <div className="mt-2">
                <button 
                  type="button"
                  onClick={() => setShowDemandProfile(!showDemandProfile)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  {showDemandProfile ? 'Hide profile details' : 'Show profile details'}
                </button>
              </div>
              {showDemandProfile && (
                <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-3 rounded">
                  <p className="font-medium">Profile Descriptions:</p>
                  <ul className="list-disc pl-5 mt-1 space-y-1">
                    <li><span className="font-medium">Low Usage:</span> Basic appliances, energy efficient, limited use during peak hours</li>
                    <li><span className="font-medium">Standard Usage:</span> Typical household with regular appliance usage patterns</li>
                    <li><span className="font-medium">High Usage:</span> Power-intensive appliances, high consumption throughout the day</li>
                    <li><span className="font-medium">Commercial:</span> Business hours operation, higher daytime usage</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        {calculationMethod === 'appliances' && (
          <div>
            <h3 className="text-lg font-semibold mb-4">Appliance Usage</h3>
            
            <div className="space-y-4">
              {formData.appliances.map((appliance, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Appliance</label>
                      <input
                        type="text"
                        value={appliance.name}
                        onChange={(e) => handleApplianceChange(index, 'name', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Watts</label>
                      <input
                        type="number"
                        value={appliance.watts}
                        onChange={(e) => handleApplianceChange(index, 'watts', parseInt(e.target.value))}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Hours/Day</label>
                      <input
                        type="number"
                        value={appliance.hours}
                        onChange={(e) => handleApplianceChange(index, 'hours', parseInt(e.target.value))}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Quantity</label>
                      <input
                        type="number"
                        value={appliance.quantity}
                        onChange={(e) => handleApplianceChange(index, 'quantity', parseInt(e.target.value))}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  {formData.appliances.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeAppliance(index)}
                      className="mt-2 text-sm text-red-600 hover:text-red-800"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addAppliance}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Add another appliance
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <button
          onClick={calculateSystem}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Calculate System Requirements
        </button>
      </div>

      {results && (
        <div className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">System Requirements</h3>
              <div className="space-y-4">
                <div className="flex items-center">
                  <SunIcon className="h-6 w-6 text-yellow-500 mr-2" />
                  <div>
                    <p className="text-sm text-gray-600">Required System Size</p>
                    <p className="text-lg font-semibold">{results.requiredSystemSize} kW</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <LightningBoltIcon className="h-6 w-6 text-blue-500 mr-2" />
                  <div>
                    <p className="text-sm text-gray-600">Daily Consumption</p>
                    <p className="text-lg font-semibold">{results.dailyConsumption} kWh</p>
                    <p className="text-xs text-gray-500">Base: {results.unadjustedConsumption} kWh × {results.profileFactor.toFixed(1)} (profile factor)</p>
                    <p className="text-xs text-gray-500">Calculated using {results.calculationMethod === 'appliances' ? 'appliance list' : 'bill consumption data'}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <BatteryIcon className="h-6 w-6 text-green-500 mr-2" />
                  <div>
                    <p className="text-sm text-gray-600">Battery Capacity</p>
                    <p className="text-lg font-semibold">{results.batteryCapacity} kWh</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">Financial Analysis</h3>
              <div className="space-y-4">
                <div className="flex items-center">
                  <CurrencyDollarIcon className="h-6 w-6 text-green-500 mr-2" />
                  <div>
                    <p className="text-sm text-gray-600">Estimated System Cost</p>
                    <p className="text-lg font-semibold">KES {results.estimatedCost}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <CurrencyDollarIcon className="h-6 w-6 text-blue-500 mr-2" />
                  <div>
                    <p className="text-sm text-gray-600">Monthly Savings</p>
                    <p className="text-lg font-semibold">KES {results.monthlySavings}</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <ClockIcon className="h-6 w-6 text-purple-500 mr-2" />
                  <div>
                    <p className="text-sm text-gray-600">ROI Period</p>
                    <p className="text-lg font-semibold">{results.roiMonths} months</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-gray-50 p-6 rounded-lg">
            <div className="flex items-center mb-4">
              <ChartPieIcon className="h-6 w-6 text-indigo-500 mr-2" />
              <h3 className="text-lg font-semibold">Energy Demand Profile</h3>
            </div>
            
            <div className="overflow-x-auto">
              <div className="min-w-full">
                <div className="h-64 relative">
                  {/* Hourly usage chart bars */}
                  <div className="absolute inset-0 flex items-end">
                    {results.hourlyUsage.map((hourData, index) => (
                      <div key={index} className="flex-1 flex flex-col items-center">
                        <div 
                          className="w-full bg-blue-500 rounded-t"
                          style={{ 
                            height: `${(parseFloat(hourData.usage) / parseFloat(results.dailyConsumption)) * 200}px`,
                            maxHeight: '200px'
                          }}
                        ></div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Hour labels */}
                  <div className="absolute bottom-0 left-0 right-0 flex">
                    {results.hourlyUsage.map((hourData, index) => (
                      <div key={index} className="flex-1 text-center text-xs mt-2">
                        {index}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="mt-4 text-sm text-center text-gray-600">
                  Time of day (hours)
                </div>
              </div>
            </div>
            
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded p-2 text-center">
                <p className="text-xs text-gray-600">Peak Usage Hour</p>
                <p className="font-semibold">
                  {results.hourlyUsage.reduce((max, curr, i, arr) => 
                    parseFloat(curr.usage) > parseFloat(arr[max].usage) ? i : max, 0)}:00
                </p>
              </div>
              <div className="bg-white rounded p-2 text-center">
                <p className="text-xs text-gray-600">Peak Demand</p>
                <p className="font-semibold">
                  {Math.max(...results.hourlyUsage.map(h => parseFloat(h.usage))).toFixed(2)} kWh
                </p>
              </div>
              <div className="bg-white rounded p-2 text-center">
                <p className="text-xs text-gray-600">Nighttime Usage</p>
                <p className="font-semibold">
                  {results.hourlyUsage.slice(18, 24).concat(results.hourlyUsage.slice(0, 6))
                    .reduce((sum, hour) => sum + parseFloat(hour.usage), 0).toFixed(2)} kWh
                </p>
              </div>
              <div className="bg-white rounded p-2 text-center">
                <p className="text-xs text-gray-600">Daytime Usage</p>
                <p className="font-semibold">
                  {results.hourlyUsage.slice(6, 18)
                    .reduce((sum, hour) => sum + parseFloat(hour.usage), 0).toFixed(2)} kWh
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SolarSystemCalculator; 