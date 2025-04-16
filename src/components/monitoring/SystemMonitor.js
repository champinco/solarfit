import React, { useState, useEffect } from 'react';
import {
  SunIcon,
  BoltIcon,
  BatteryIcon,
  ChartBarIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/outline';

const SystemMonitor = ({ systemId }) => {
  const [metrics, setMetrics] = useState({
    currentPower: 0,
    dailyProduction: 0,
    batteryLevel: 0,
    gridStatus: 'connected',
    alerts: []
  });

  // Simulate real-time data updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => ({
        currentPower: Math.random() * 5000,
        dailyProduction: prev.dailyProduction + Math.random() * 100,
        batteryLevel: Math.random() * 100,
        gridStatus: Math.random() > 0.9 ? 'disconnected' : 'connected',
        alerts: Math.random() > 0.95 ? ['Low battery warning'] : []
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">System Monitoring</h2>
        <span className="text-sm text-gray-500">System ID: {systemId}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center">
            <SunIcon className="h-6 w-6 text-yellow-500 mr-2" />
            <span className="text-sm text-gray-600">Current Power</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold">{(metrics.currentPower / 1000).toFixed(2)}</span>
            <span className="text-gray-500 ml-1">kW</span>
          </div>
        </div>

        <div className="bg-green-50 rounded-lg p-4">
          <div className="flex items-center">
            <BoltIcon className="h-6 w-6 text-green-500 mr-2" />
            <span className="text-sm text-gray-600">Daily Production</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold">{(metrics.dailyProduction / 1000).toFixed(2)}</span>
            <span className="text-gray-500 ml-1">kWh</span>
          </div>
        </div>

        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center">
            <BatteryIcon className="h-6 w-6 text-purple-500 mr-2" />
            <span className="text-sm text-gray-600">Battery Level</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold">{metrics.batteryLevel.toFixed(0)}</span>
            <span className="text-gray-500 ml-1">%</span>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center">
            <ChartBarIcon className="h-6 w-6 text-gray-500 mr-2" />
            <span className="text-sm text-gray-600">Grid Status</span>
          </div>
          <div className="mt-2">
            <span className={`text-2xl font-bold ${
              metrics.gridStatus === 'connected' ? 'text-green-500' : 'text-red-500'
            }`}>
              {metrics.gridStatus}
            </span>
          </div>
        </div>
      </div>

      {metrics.alerts.length > 0 && (
        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-6 w-6 text-red-500 mr-2" />
            <span className="text-red-700 font-semibold">System Alerts</span>
          </div>
          <ul className="mt-2">
            {metrics.alerts.map((alert, index) => (
              <li key={index} className="text-red-600">{alert}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Performance History</h3>
        <div className="bg-gray-50 rounded-lg p-4 h-64">
          {/* Placeholder for performance chart */}
          <div className="flex items-center justify-center h-full text-gray-500">
            Performance chart will be displayed here
          </div>
        </div>
      </div>

      <div className="mt-6 text-sm text-gray-600">
        <p>Last updated: {new Date().toLocaleTimeString()}</p>
      </div>
    </div>
  );
};

export default SystemMonitor; 