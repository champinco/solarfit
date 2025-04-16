// pages/index.js
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import dynamic from 'next/dynamic';
import 'chart.js/auto';
import Tesseract from 'tesseract.js';
import Head from 'next/head';

// Configuration
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
const DEFAULT_PANEL_WATTAGE = 550;
const DEFAULT_TILT = 15;
const DEFAULT_AZIMUTH = 180;
const DEFAULT_SYSTEM_VOLTAGE = 48;
const DEFAULT_OFFGRID_AUTONOMY = 1.5;
const DEFAULT_HYBRID_BACKUP_HOURS = 6;
const DEFAULT_DOD = 0.85;

// Dynamic Imports
const Bar = dynamic(() => import('react-chartjs-2').then((mod) => mod.Bar), { ssr: false });
const Pie = dynamic(() => import('react-chartjs-2').then((mod) => mod.Pie), { ssr: false });

// Icons
const Icon = ({ path, className = "w-5 h-5 inline", size }) => (
  <svg
    className={`${className} ${size ? `w-${size} h-${size}` : ''}`}
    fill="currentColor"
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path fillRule="evenodd" d={path} clipRule="evenodd" />
  </svg>
);
const SunIcon = () => <Icon path="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />;
const BoltIcon = () => <Icon path="M11 3a1 1 0 100 2v2h2V5a1 1 0 100-2h-2zm-5 5a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V9a1 1 0 00-1-1H6zm5 3v4H8v-4h3z" />;
const BatteryIcon = () => <Icon path="M4 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm10 2H6v6h8V7z" />;
const MoneyIcon = () => <Icon path="M4 5a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 6a1 1 0 011-1h10a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1v-2z" />;
const UploadIcon = () => <Icon path="M4 16v1a3 3 0 003 3h6a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" className="w-8 h-8 mx-auto text-gray-400 group-hover:text-indigo-500" />;
const CheckCircleIcon = () => <Icon path="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" className="w-5 h-5 text-green-600" />;
const InfoIcon = () => <Icon path="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" className="w-5 h-5 text-blue-600" />;
const ExclamationIcon = () => <Icon path="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM9 15a1 1 0 102 0 1 1 0 00-2 0zm1-9a1 1 0 00-1 1v5a1 1 0 102 0V7a1 1 0 00-1-1z" className="w-5 h-5 text-red-600" />;
const CogIcon = () => <Icon path="M13.828 1.586a2 2 0 00-2.828 0L9.172 3.414 6.586 2.586a2 2 0 00-2.828 2.828L5.586 7.414 2 9a2 2 0 000 2.828l3.586 1.586L3.758 15.414a2 2 0 002.828 2.828l2.586-2.828 1.828 1.828a2 2 0 002.828-2.828l-1.828-1.828 2.828-2.586a2 2 0 000-2.828l-2.828-2.586zM10 13a3 3 0 100-6 3 3 0 000 6z" />;
const ChevronDownIcon = () => <Icon path="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" size="4" />;
const ChevronUpIcon = () => <Icon path="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" size="4" />;
const LogoutIcon = () => <Icon path="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-4 h-4 mr-1" />;
const DatabaseIcon = () => <Icon path="M16 4v4a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2h8a2 2 0 012 2zm0 8v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4a2 2 0 012-2h8a2 2 0 012 2z" className="w-4 h-4 mr-1" />;
const PdfIcon = () => <Icon path="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h6v6h6v10H6z" className="w-4 h-4 mr-1" />;
const TrashIcon = () => <Icon path="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM8 9h8v10H8V9zm7.5-5l-1-1h-5l-1 1H5v2h14V4h-3.5z" className="w-4 h-4" />;
const SpinnerIcon = () => <Icon path="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14a6 6 0 110-12 6 6 0 010 12z" className="w-5 h-5 animate-spin" />;

function HomePage() {
  // State
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authMessageType, setAuthMessageType] = useState('info');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrError, setOcrError] = useState('');
  const [ocrImageUrl, setOcrImageUrl] = useState(null);
  const [ocrFileName, setOcrFileName] = useState('');
  const [extractedKwh, setExtractedKwh] = useState('');
  const [extractedBill, setExtractedBill] = useState('');
  const ocrResultRef = useRef(null);

  const [location, setLocation] = useState('');
  const [systemType, setSystemType] = useState('hybrid');
  const [userType, setUserType] = useState('residential');
  const [avgMonthlyKwh, setAvgMonthlyKwh] = useState('');
  const [avgMonthlyBill, setAvgMonthlyBill] = useState('');
  const [electricityPricePerKwh, setElectricityPricePerKwh] = useState('25');
  const [appliances, setAppliances] = useState([]);
  const [applianceCategories, setApplianceCategories] = useState({ residential: [], commercial: [], industrial: [] });
  const [systemVoltage, setSystemVoltage] = useState('');
  const [autonomyDays, setAutonomyDays] = useState('');
  const [backupDurationHours, setBackupDurationHours] = useState('');
  const [depthOfDischarge, setDepthOfDischarge] = useState('');
  const [panelWattage, setPanelWattage] = useState(DEFAULT_PANEL_WATTAGE);
  const [tilt, setTilt] = useState(DEFAULT_TILT);
  const [azimuth, setAzimuth] = useState(DEFAULT_AZIMUTH);
  const [shading, setShading] = useState(0);
  const [budget, setBudget] = useState('');
  const [calculationResult, setCalculationResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState('');
  const [calculationInputParams, setCalculationInputParams] = useState(null);
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false);
  const [showAppliances, setShowAppliances] = useState(false);
  const [showEduSection, setShowEduSection] = useState(false);
  const [savedCalculations, setSavedCalculations] = useState([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [activeInputSection, setActiveInputSection] = useState('location');

  // Effects
  useEffect(() => {
    const storedToken = localStorage.getItem('solarFitToken');
    if (storedToken) {
      setToken(storedToken);
      setIsLoggedIn(true);
      console.log('Token loaded from localStorage:', storedToken);
    }
  }, []);

  useEffect(() => {
    if (authMessage || ocrError || calculationError) {
      const timer = setTimeout(() => {
        setAuthMessage('');
        setOcrError('');
        setCalculationError('');
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [authMessage, ocrError, calculationError]);

  useEffect(() => {
    const fetchPresets = async () => {
      try {
        const response = await axios.get(`${backendUrl}/api/appliances`);
        if (response.data && typeof response.data === 'object') {
          setApplianceCategories(response.data);
          console.log('Appliance categories fetched:', response.data);
        } else {
          throw new Error('Invalid appliance data format');
        }
      } catch (error) {
        console.error('Failed to fetch appliances:', error);
        setAuthMessage('Error: Could not fetch appliance list.');
        setAuthMessageType('error');
      }
    };
    fetchPresets();
  }, [backendUrl]);

  useEffect(() => {
    const fetchSaved = async () => {
      if (isLoggedIn && token) {
        setLoadingSaved(true);
        try {
          const response = await axios.get(`${backendUrl}/api/calculations`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (Array.isArray(response.data)) {
            setSavedCalculations(response.data);
            console.log('Saved calculations fetched:', response.data.length);
          } else {
            throw new Error('Invalid saved data format');
          }
        } catch (error) {
          console.error('Fetch saved calculations error:', error);
          setAuthMessage('Error: Could not load saved calculations.');
          setAuthMessageType('error');
          if (error.response?.status === 401) handleLogout();
        }
        setLoadingSaved(false);
      } else {
        setSavedCalculations([]);
      }
    };
    fetchSaved();
  }, [isLoggedIn, token]);

  useEffect(() => {
    let volt = '', dod = '', auto = '', backup = '';
    if (systemType === 'off-grid') {
      volt = systemVoltage || DEFAULT_SYSTEM_VOLTAGE;
      dod = depthOfDischarge || DEFAULT_DOD;
      auto = autonomyDays || DEFAULT_OFFGRID_AUTONOMY;
    } else if (systemType === 'hybrid') {
      volt = systemVoltage || DEFAULT_SYSTEM_VOLTAGE;
      dod = depthOfDischarge || DEFAULT_DOD;
      backup = backupDurationHours || DEFAULT_HYBRID_BACKUP_HOURS;
    }
    setSystemVoltage(volt);
    setDepthOfDischarge(dod);
    setAutonomyDays(auto);
    setBackupDurationHours(backup);
    console.log('System type changed:', { systemType, volt, dod, auto, backup });
  }, [systemType]);

  // Handlers
  const handleAuthAction = async (action) => {
    setAuthLoading(true);
    setAuthMessage(`${action === 'login' ? 'Logging in' : 'Signing up'}...`);
    setAuthMessageType('info');
    if (!username || !password) {
      setAuthMessage('Error: Username and password required.');
      setAuthMessageType('error');
      setAuthLoading(false);
      return;
    }
    try {
      const response = await axios.post(`${backendUrl}/api/${action}`, { username, password });
      if (action === 'signup') {
        setAuthMessage(response.data.message || 'Signup successful! Please log in.');
        setAuthMessageType('success');
        setUsername('');
        setPassword('');
      } else {
        const { token } = response.data;
        if (!token) throw new Error('No token received');
        setToken(token);
        localStorage.setItem('solarFitToken', token);
        setIsLoggedIn(true);
        setAuthMessage('Login successful!');
        setAuthMessageType('success');
        setUsername('');
        setPassword('');
      }
    } catch (error) {
      setAuthMessage(`Error: ${error.response?.data?.message || error.message}`);
      setAuthMessageType('error');
      setIsLoggedIn(false);
      localStorage.removeItem('solarFitToken');
      setToken('');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = useCallback(() => {
    setToken('');
    localStorage.removeItem('solarFitToken');
    setIsLoggedIn(false);
    setCalculationResult(null);
    setCalculationInputParams(null);
    setUsername('');
    setPassword('');
    setSavedCalculations([]);
    setAuthMessage('Logged out successfully.');
    setAuthMessageType('success');
    console.log('User logged out');
  }, []);

  const parseOcrText = useCallback((text) => {
    console.log('OCR Text:', text);
    const kwhPatterns = [/kWh\s*:?\s*([\d,]+\.?\d*)/i, /Usage \(kWh\)\s*:?\s*([\d,]+\.?\d*)/i, /Units Consumed\s*:?\s*([\d,]+\.?\d*)/i, /([\d,]+\.?\d*)\s*kWh/i];
    const billPatterns = [/(?:Total Amount Due|Amount Payable|TOTAL.*)[:\s]?\s*(?:KES|Ksh\.?)\s*([\d,]+\.?\d*)/i, /(?:KES|Ksh\.?)\s*([\d,]+\.?\d*)/i];
    const cleanNumber = (str) => str ? parseFloat(str.replace(/,/g, '')) : null;

    let foundKwh = null, foundBill = null;
    for (const pattern of kwhPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        foundKwh = cleanNumber(match[1]);
        if (!isNaN(foundKwh) && foundKwh >= 0) break;
      }
    }
    for (const pattern of billPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        foundBill = cleanNumber(match[1]);
        if (!isNaN(foundBill) && foundBill > 10) break;
      }
    }

    let ocrMsg = '';
    if (foundKwh !== null) {
      setExtractedKwh(foundKwh);
      setAvgMonthlyKwh(foundKwh.toString());
      setAppliances([]);
      setAvgMonthlyBill('');
      setShowAppliances(false);
      ocrMsg += `Extracted ${foundKwh} kWh. `;
      setActiveInputSection('config');
    }
    if (foundBill !== null && foundKwh === null) {
      setExtractedBill(foundBill);
      setAvgMonthlyBill(foundBill.toString());
      setAppliances([]);
      setAvgMonthlyKwh('');
      setShowAppliances(false);
      ocrMsg += `Extracted Bill ${foundBill} KES. `;
      setActiveInputSection('config');
    }
    if (foundKwh === null && foundBill === null) {
      setOcrError('Could not extract kWh or Bill Amount.');
    } else {
      setAuthMessage(`Applied from ${ocrFileName}: ${ocrMsg}`);
      setAuthMessageType('success');
    }
    ocrResultRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ocrFileName]);

  const onDropAccepted = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setUploading(true);
    setOcrProgress(0);
    setOcrError('');
    setExtractedKwh('');
    setExtractedBill('');
    setOcrFileName(file.name);
    setOcrImageUrl(URL.createObjectURL(file));
    try {
      const { data: { text } } = await Tesseract.recognize(file, 'eng', {
        logger: m => m.status === 'recognizing text' && setOcrProgress(Math.round(m.progress * 100)),
      });
      parseOcrText(text);
    } catch (error) {
      console.error('OCR Error:', error);
      setOcrError(`OCR Error: ${error.message || 'Processing failed.'}`);
      if (ocrImageUrl) URL.revokeObjectURL(ocrImageUrl);
      setOcrImageUrl(null);
    } finally {
      setUploading(false);
    }
  }, [parseOcrText, ocrImageUrl]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDropAccepted,
    accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.bmp', '.webp', '.tiff'] },
    maxFiles: 1,
    disabled: uploading,
  });

  const clearOcrPreview = () => {
    if (ocrImageUrl) URL.revokeObjectURL(ocrImageUrl);
    setOcrImageUrl(null);
    setOcrFileName('');
  };

  const addAppliance = () => {
    if (avgMonthlyKwh || avgMonthlyBill) {
      alert('Clear Avg kWh/Bill to add appliances.');
      return;
    }
    setShowAppliances(true);
    const defaultPreset = applianceCategories[userType]?.[0] || { name: 'custom', power: '', peakFactor: 1.5 };
    setAppliances([...appliances, {
      id: Date.now(),
      name: defaultPreset.name,
      power: defaultPreset.power,
      peakFactor: defaultPreset.peakFactor,
      customName: '',
      quantity: 1,
      hoursPerDay: 1,
    }]);
    setActiveInputSection('appliances');
    console.log('Appliance added:', defaultPreset);
  };

  const updateAppliance = (id, field, value) => {
    setAppliances(prev => prev.map(app => {
      if (app.id !== id) return app;
      const updated = { ...app, [field]: value };
      if (field === 'name') {
        const preset = applianceCategories[userType]?.find(a => a.name === value);
        if (value === 'custom') {
          updated.power = '';
          updated.peakFactor = 1.5;
          updated.customName = '';
        } else if (preset) {
          updated.power = preset.power ?? '';
          updated.peakFactor = preset.peakFactor ?? 1.5;
          updated.customName = '';
        }
      }
      if (['power', 'quantity', 'hoursPerDay'].includes(field)) {
        const numVal = parseFloat(value);
        if (isNaN(numVal)) updated[field] = '';
        else if (field === 'power') updated.power = numVal >= 0 ? numVal : 0;
        else if (field === 'quantity') updated.quantity = numVal >= 1 ? Math.floor(numVal) : 1;
        else updated.hoursPerDay = Math.max(0, Math.min(24, numVal));
      }
      return updated;
    }));
  };

  const removeAppliance = (id) => {
    setAppliances(appliances.filter(app => app.id !== id));
    console.log('Appliance removed:', id);
  };

  const calculateDailyApplianceKwh = useMemo(() => {
    return appliances.reduce((sum, app) => {
      const p = parseFloat(app.power) || 0;
      const q = parseInt(app.quantity) || 0;
      const h = parseFloat(app.hoursPerDay) || 0;
      return p > 0 && q > 0 && h > 0 ? sum + (p / 1000) * q * h : sum;
    }, 0);
  }, [appliances]);

  const handleCalculateClick = async (event) => {
    event.preventDefault();
    setCalculating(true);
    setCalculationResult(null);
    setCalculationError('');
    const errors = [];
    if (!location.trim()) errors.push('Location is missing.');
    if (!electricityPricePerKwh || parseFloat(electricityPricePerKwh) <= 0) errors.push('Valid Electricity Price needed.');
    const kwhInput = parseFloat(avgMonthlyKwh);
    const billInput = parseFloat(avgMonthlyBill);
    const applianceEnergy = calculateDailyApplianceKwh;
    if (!(kwhInput > 0 || billInput > 0 || (appliances.length > 0 && applianceEnergy > 0))) {
      errors.push('Energy usage (kWh, Bill, or Appliances) required.');
    }
    if (isNaN(parseInt(panelWattage)) || parseInt(panelWattage) < 50) errors.push('Valid Panel Wattage needed.');
    if (systemType === 'off-grid') {
      if (isNaN(parseFloat(autonomyDays)) || parseFloat(autonomyDays) < 0.5) errors.push('Valid Autonomy Days needed.');
      if (isNaN(parseFloat(depthOfDischarge)) || parseFloat(depthOfDischarge) <= 0.1) errors.push('Valid DoD needed.');
      if (![12, 24, 48].includes(Number(systemVoltage))) errors.push('Valid System Voltage needed.');
    }
    if (systemType === 'hybrid' && backupDurationHours > 0) {
      if (isNaN(parseFloat(depthOfDischarge)) || parseFloat(depthOfDischarge) <= 0.1) errors.push('Valid DoD needed.');
      if (![24, 48].includes(Number(systemVoltage))) errors.push('Valid System Voltage needed.');
    }

    if (errors.length > 0) {
      setCalculationError(`Please fix:\n- ${errors.join('\n- ')}`);
      setCalculating(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const paramsToSend = {
      location: location.trim(),
      systemType,
      userType,
      systemVoltage: systemType !== 'on-grid' && Number(systemVoltage) ? Number(systemVoltage) : null,
      avgMonthlyKwh: avgMonthlyKwh ? parseFloat(avgMonthlyKwh) : null,
      avgMonthlyBill: avgMonthlyBill ? parseFloat(avgMonthlyBill) : null,
      electricityPricePerKwh: parseFloat(electricityPricePerKwh),
      appliances: appliances.length > 0 ? appliances.map(a => ({
        name: a.name === 'custom' ? a.customName || 'Unnamed' : a.name,
        power: parseFloat(a.power) || 0,
        quantity: parseInt(a.quantity) || 0,
        hoursPerDay: parseFloat(a.hoursPerDay) || 0,
        peakFactor: parseFloat(a.peakFactor) || 1.5,
      })).filter(a => a.power > 0 && a.quantity > 0) : null,
      autonomyDays: systemType === 'off-grid' ? parseFloat(autonomyDays) : null,
      backupDurationHours: systemType === 'hybrid' ? parseFloat(backupDurationHours) : null,
      depthOfDischarge: systemType !== 'on-grid' && depthOfDischarge ? parseFloat(depthOfDischarge) : null,
      panelWattage: parseInt(panelWattage),
      tilt: parseFloat(tilt) || DEFAULT_TILT,
      azimuth: parseFloat(azimuth) || DEFAULT_AZIMUTH,
      shading: parseFloat(shading) || 0,
      budget: budget ? parseFloat(budget) : null,
    };
    setCalculationInputParams(paramsToSend);

    try {
      const response = await axios.post(`${backendUrl}/api/calculate`, paramsToSend, { timeout: 60000 });
      console.log('Calculation response:', response.data);
      setCalculationResult(response.data);
      document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      setCalculationError(`Error: ${error.response?.data?.message || error.message}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setCalculating(false);
    }
  };

  const saveCalculation = async () => {
    if (!calculationResult || !isLoggedIn || !calculationInputParams) {
      alert('Cannot save: No result or not logged in.');
      return;
    }
    setAuthMessage('Saving...');
    setAuthMessageType('info');
    try {
      await axios.post(`${backendUrl}/api/save-calculation`, { calculationParams: calculationInputParams, resultData: calculationResult }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAuthMessage('Saved successfully!');
      setAuthMessageType('success');
      const response = await axios.get(`${backendUrl}/api/calculations`, { headers: { Authorization: `Bearer ${token}` } });
      setSavedCalculations(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setAuthMessage(`Error: ${error.response?.data?.message || 'Save failed.'}`);
      setAuthMessageType('error');
      if (error.response?.status === 401) handleLogout();
    }
  };

  const handleGeneratePDF = async () => {
    if (!calculationResult) {
      alert('No calculation result to generate PDF.');
      return;
    }
    const btn = document.getElementById('pdfButton');
    if (btn) btn.textContent = 'Generating...';
    try {
      const response = await axios.post(`${backendUrl}/api/generate-pdf`, calculationResult, {
        responseType: 'blob',
        headers: { 'Accept': 'application/pdf' },
        timeout: 45000,
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `SolarFit_Estimate_${(calculationResult.location || 'loc').replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(`PDF Error: ${error.response?.data?.message || error.message}`);
    } finally {
      if (btn) btn.textContent = 'Generate PDF Report';
    }
  };

  const loadCalculation = (calc) => {
    if (!calc?.calculationParams || !calc?.resultData) {
      alert('Error loading: Invalid data.');
      return;
    }
    const params = calc.calculationParams;
    const result = calc.resultData;
    setLocation(params.location || '');
    setSystemType(params.systemType || 'hybrid');
    setUserType(params.userType || 'residential');
    setAvgMonthlyKwh(params.avgMonthlyKwh || '');
    setAvgMonthlyBill(params.avgMonthlyBill || '');
    setElectricityPricePerKwh(params.electricityPricePerKwh || '25');
    setSystemVoltage(params.systemVoltage || '');
    setAutonomyDays(params.autonomyDays || '');
    setBackupDurationHours(params.backupDurationHours || '');
    setDepthOfDischarge(params.depthOfDischarge || '');
    setPanelWattage(params.panelWattage || DEFAULT_PANEL_WATTAGE);
    setTilt(params.tilt || DEFAULT_TILT);
    setAzimuth(params.azimuth || DEFAULT_AZIMUTH);
    setShading(params.shading || 0);
    setBudget(params.budget || '');
    setAppliances(params.avgMonthlyKwh || params.avgMonthlyBill ? [] : (params.appliances || []).map((a, i) => ({ ...a, id: a.id || Date.now() + i })));
    setShowAppliances((params.appliances || []).length > 0 && !(params.avgMonthlyKwh || params.avgMonthlyBill));
    setCalculationResult(result);
    setCalculationInputParams(params);
    setCalculationError('');
    setActiveInputSection('location');
    setAuthMessage(`Loaded calculation from ${new Date(calc.createdAt).toLocaleDateString()}.`);
    setAuthMessageType('success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    console.log('Calculation loaded:', params);
  };

  const toggleSection = (sectionName) => {
    console.log(`Toggling section: ${sectionName}, current: ${activeInputSection}`);
    setActiveInputSection(prev => {
      const newSection = prev === sectionName ? null : sectionName;
      console.log(`New active section: ${newSection}`);
      return newSection;
    });
  };

  const SectionHeader = ({ title, sectionId, icon }) => (
    <button
      type="button"
      onClick={() => toggleSection(sectionId)}
      className={`w-full flex justify-between items-center p-3 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors ${sectionId === 'appliances' && (avgMonthlyKwh || avgMonthlyBill) ? 'opacity-50 cursor-not-allowed' : ''}`}
      aria-expanded={activeInputSection === sectionId}
      aria-controls={`section-${sectionId}`}
      disabled={sectionId === 'appliances' && (avgMonthlyKwh || avgMonthlyBill)}
    >
      <h3 className="text-lg font-semibold text-indigo-800 flex items-center">
        {icon && <span className="mr-2 text-indigo-600">{icon}</span>}
        {title}
      </h3>
      {activeInputSection === sectionId ? <ChevronUpIcon /> : <ChevronDownIcon />}
    </button>
  );

  const SectionContent = ({ children, isVisible, id }) => (
    <div
      id={`section-${id}`}
      className={`pl-4 pr-2 py-4 border-l-2 border-indigo-200 ml-2 transition-all duration-300 ease-in-out overflow-hidden ${isVisible ? 'max-h-full opacity-100' : 'max-h-0 opacity-0'}`}
      aria-hidden={!isVisible}
    >
      {children}
    </div>
  );

  // Styles
  const cardStyle = "bg-white p-6 rounded-xl shadow-md mb-6 border border-gray-100";
  const formGroupStyle = "mb-4";
  const labelStyle = "block text-xs font-medium text-gray-700 mb-1";
  const inputStyle = "w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500";
  const selectStyle = `${inputStyle} appearance-none`;
  const buttonStyle = "inline-flex items-center px-4 py-2 rounded-md font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50";
  const secondaryButtonStyle = "inline-flex items-center px-4 py-2 rounded-md font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 focus:ring-2 focus:ring-indigo-500";
  const dangerButtonStyle = "inline-flex items-center px-4 py-2 rounded-md font-medium text-white bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-500";
  const dropzoneStyle = `p-6 border-2 border-dashed rounded-lg text-center ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-gray-50'} ${uploading ? 'opacity-50' : ''}`;

  // Chart Options
  const barChartOptions = { responsive: true, scales: { y: { beginAtZero: true } }, plugins: { legend: { display: false } } };
  const pieChartOptions = { responsive: true, plugins: { legend: { position: 'right' } } };

  const getPieData = (costBreakdown) => {
    if (!costBreakdown) return null;
    const labels = ['Panels', 'Inverter', 'Batteries', 'Controller', 'Mounting', 'Installation'];
    const data = [
      costBreakdown.panels,
      costBreakdown.inverter,
      costBreakdown.batteries,
      costBreakdown.chargeController,
      costBreakdown.mounting,
      costBreakdown.installation,
    ].filter(v => v > 0);
    if (!data.length) return null;
    return {
      labels: labels.slice(0, data.length),
      datasets: [{ data, backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444'] }],
    };
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-900">
      <Head>
        <title>SolarFit Kenya - Solar System Sizing</title>
        <meta name="description" content="Solar system sizing calculator for Kenya." />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {authMessage && (
        <div className={`fixed top-4 right-4 p-3 rounded-md shadow-md text-sm ${authMessageType === 'error' ? 'bg-red-100 text-red-700' : authMessageType === 'success' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          {authMessage}
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6">
        <header className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-indigo-800">SolarFit Kenya</h1>
          <p className="text-gray-600">Intelligent Solar System Sizing</p>
          {isLoggedIn && (
            <button onClick={handleLogout} className={`${dangerButtonStyle} absolute top-6 right-6 text-sm`}>
              <LogoutIcon /> Logout
            </button>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {!isLoggedIn && (
              <div className={cardStyle}>
                <h2 className="text-xl font-semibold text-indigo-700 mb-4">Login or Signup</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={formGroupStyle}>
                    <label htmlFor="username" className={labelStyle}>Username</label>
                    <input id="username" value={username} onChange={e => setUsername(e.target.value)} className={inputStyle} />
                  </div>
                  <div className={formGroupStyle}>
                    <label htmlFor="password" className={labelStyle}>Password</label>
                    <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputStyle} />
                  </div>
                </div>
                <div className="mt-4 flex space-x-4 justify-center">
                  <button onClick={() => handleAuthAction('signup')} className={secondaryButtonStyle} disabled={authLoading}>
                    {authLoading ? <SpinnerIcon /> : 'Signup'}
                  </button>
                  <button onClick={() => handleAuthAction('login')} className={buttonStyle} disabled={authLoading}>
                    {authLoading ? <SpinnerIcon /> : 'Login'}
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleCalculateClick} className="space-y-4">
              <div>
                <SectionHeader title="1. Location & System" sectionId="location" icon={<SunIcon />} />
                <SectionContent isVisible={activeInputSection === 'location'} id="location">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={formGroupStyle}>
                      <label htmlFor="location" className={labelStyle}>Location*</label>
                      <input id="location" value={location} onChange={e => setLocation(e.target.value)} className={inputStyle} required />
                    </div>
                    <div className={formGroupStyle}>
                      <label htmlFor="systemType" className={labelStyle}>System Type*</label>
                      <select id="systemType" value={systemType} onChange={e => setSystemType(e.target.value)} className={selectStyle} required>
                        <option value="hybrid">Hybrid</option>
                        <option value="off-grid">Off-Grid</option>
                        <option value="on-grid">On-Grid</option>
                      </select>
                    </div>
                    <div className={formGroupStyle}>
                      <label htmlFor="userType" className={labelStyle}>User Type*</label>
                      <select id="userType" value={userType} onChange={e => { setUserType(e.target.value); setAppliances([]); }} className={selectStyle} required>
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                        <option value="industrial">Industrial</option>
                      </select>
                    </div>
                  </div>
                </SectionContent>
              </div>

              <div>
                <SectionHeader title="2. Energy Consumption" sectionId="energy" icon={<BoltIcon />} />
                <SectionContent isVisible={activeInputSection === 'energy'} id="energy">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelStyle}>Upload Bill (OCR)</label>
                      <div {...getRootProps()} className={dropzoneStyle}>
                        <input {...getInputProps()} />
                        <UploadIcon />
                        <p className="text-sm text-gray-600">{isDragActive ? 'Drop here...' : 'Drag or click to upload'}</p>
                      </div>
                      <div ref={ocrResultRef} className="mt-2">
                        {uploading && <p className="text-sm text-indigo-600"><SpinnerIcon /> Processing {ocrProgress}%</p>}
                        {ocrImageUrl && !uploading && (
                          <div className="relative">
                            <img src={ocrImageUrl} alt="Preview" className="max-h-20 rounded" />
                            <button onClick={clearOcrPreview} className="absolute top-0 right-0 of p-1 bg-red-500 text-white rounded-full">X</button>
                          </div>
                        )}
                        {ocrError && <p className="text-sm text-red-600"><ExclamationIcon /> {ocrError}</p>}
                        {(extractedKwh || extractedBill) && !uploading && (
                          <p className="text-sm text-green-600"><CheckCircleIcon /> {extractedKwh ? `${extractedKwh} kWh` : `KES ${extractedBill}`}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className={formGroupStyle}>
                        <label htmlFor="avgMonthlyKwh" className={labelStyle}>Avg Monthly kWh</label>
                        <input id="avgMonthlyKwh" type="number" value={avgMonthlyKwh} onChange={e => { setAvgMonthlyKwh(e.target.value); setAppliances([]); setAvgMonthlyBill(''); clearOcrPreview(); }} className={inputStyle} disabled={appliances.length > 0} />
                      </div>
                      <div className={formGroupStyle}>
                        <label htmlFor="avgMonthlyBill" className={labelStyle}>Avg Monthly Bill (KES)</label>
                        <input id="avgMonthlyBill" type="number" value={avgMonthlyBill} onChange={e => { setAvgMonthlyBill(e.target.value); setAppliances([]); setAvgMonthlyKwh(''); clearOcrPreview(); }} className={inputStyle} disabled={appliances.length > 0} />
                      </div>
                      <div className={formGroupStyle}>
                        <label htmlFor="electricityPrice" className={labelStyle}>Price per kWh (KES)*</label>
                        <input id="electricityPrice" type="number" step="0.1" value={electricityPricePerKwh} onChange={e => setElectricityPricePerKwh(e.target.value)} className={inputStyle} required />
                      </div>
                    </div>
                  </div>
                </SectionContent>
              </div>

              <div>
                <SectionHeader title="3. Configuration" sectionId="config" icon={<CogIcon />} />
                <SectionContent isVisible={activeInputSection === 'config'} id="config">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className={systemType === 'on-grid' ? 'opacity-50' : ''}>
                      <label className={labelStyle}>Battery Settings</label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className={formGroupStyle}>
                          <label htmlFor="systemVoltage" className={labelStyle}>Voltage*</label>
                          <select id="systemVoltage" value={systemVoltage} onChange={e => setSystemVoltage(e.target.value)} className={selectStyle} disabled={systemType === 'on-grid'}>
                            <option value="">Select</option>
                            {systemType !== 'on-grid' && <option value="24">24 V</option>}
                            <option value="48">48 V</option>
                          </select>
                        </div>
                        <div className={formGroupStyle}>
                          <label htmlFor="dod" className={labelStyle}>DoD*</label>
                          <input id="dod" type="number" step="0.01" min="0.1" max="1" value={depthOfDischarge} onChange={e => setDepthOfDischarge(e.target.value)} className={inputStyle} disabled={systemType === 'on-grid'} />
                        </div>
                      </div>
                      {systemType === 'off-grid' && (
                        <div className={formGroupStyle}>
                          <label htmlFor="autonomyDays" className={labelStyle}>Autonomy Days*</label>
                          <input id="autonomyDays" type="number" step="0.1" value={autonomyDays} onChange={e => setAutonomyDays(e.target.value)} className={inputStyle} />
                        </div>
                      )}
                      {systemType === 'hybrid' && (
                        <div className={formGroupStyle}>
                          <label htmlFor="backupDurationHours" className={labelStyle}>Backup Hours*</label>
                          <input id="backupDurationHours" type="number" value={backupDurationHours} onChange={e => setBackupDurationHours(e.target.value)} className={inputStyle} />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={labelStyle}>Panel Settings</label>
                      <div className={formGroupStyle}>
                        <label htmlFor="panelWattage" className={labelStyle}>Wattage (Wp)*</label>
                        <input id="panelWattage" type="number" value={panelWattage} onChange={e => setPanelWattage(e.target.value)} className={inputStyle} required />
                      </div>
                      <button type="button" onClick={() => setShowAdvancedPanel(!showAdvancedPanel)} className="text-sm text-indigo-600 hover:underline flex items-center">
                        Advanced {showAdvancedPanel ? <ChevronUpIcon /> : <ChevronDownIcon />}
                      </button>
                      {showAdvancedPanel && (
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          <div className={formGroupStyle}>
                            <label htmlFor="tilt" className={labelStyle}>Tilt°</label>
                            <input id="tilt" type="number" value={tilt} onChange={e => setTilt(e.target.value)} className={inputStyle} />
                          </div>
                          <div className={formGroupStyle}>
                            <label htmlFor="azimuth" className={labelStyle}>Azimuth°</label>
                            <input id="azimuth" type="number" value={azimuth} onChange={e => setAzimuth(e.target.value)} className={inputStyle} />
                          </div>
                          <div className={formGroupStyle}>
                            <label htmlFor="shading" className={labelStyle}>Shading %</label>
                            <input id="shading" type="number" value={shading} onChange={e => setShading(e.target.value)} className={inputStyle} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </SectionContent>
              </div>

              <div>
                <SectionHeader title={`4. Appliances (${calculateDailyApplianceKwh.toFixed(2)} kWh/Day)`} sectionId="appliances" icon={<BatteryIcon />} />
                <SectionContent isVisible={activeInputSection === 'appliances'} id="appliances">
                  {appliances.length > 0 ? (
                    appliances.map(app => (
                      <div key={app.id} className="grid grid-cols-12 gap-2 mb-2 p-2 border rounded">
                        <div className="col-span-3">
                          <select value={app.name} onChange={e => updateAppliance(app.id, 'name', e.target.value)} className={selectStyle}>
                            <option value="custom">Custom</option>
                            {applianceCategories[userType]?.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                          </select>
                        </div>
                        {app.name === 'custom' && (
                          <div className="col-span-3">
                            <input type="text" value={app.customName} onChange={e => updateAppliance(app.id, 'customName', e.target.value)} className={inputStyle} placeholder="Name" />
                          </div>
                        )}
                        <div className="col-span-2">
                          <input type="number" value={app.power} onChange={e => updateAppliance(app.id, 'power', e.target.value)} className={inputStyle} placeholder="Watts" disabled={app.name !== 'custom'} />
                        </div>
                        <div className="col-span-2">
                          <input type="number" value={app.quantity} onChange={e => updateAppliance(app.id, 'quantity', e.target.value)} className={inputStyle} placeholder="Qty" />
                        </div>
                        <div className="col-span-2">
                          <input type="number" value={app.hoursPerDay} onChange={e => updateAppliance(app.id, 'hoursPerDay', e.target.value)} className={inputStyle} placeholder="Hrs/Day" />
                        </div>
                        <div className="col-span-1">
                          <button onClick={() => removeAppliance(app.id)} className={dangerButtonStyle}><TrashIcon /></button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No appliances added.</p>
                  )}
                  <button type="button" onClick={addAppliance} className={secondaryButtonStyle}>+ Add Appliance</button>
                </SectionContent>
              </div>

              <div>
                <SectionHeader title="5. Budget" sectionId="budget" icon={<MoneyIcon />} />
                <SectionContent isVisible={activeInputSection === 'budget'} id="budget">
                  <div className={formGroupStyle}>
                    <label htmlFor="budget" className={labelStyle}>Max Budget (KES)</label>
                    <input id="budget" type="number" value={budget} onChange={e => setBudget(e.target.value)} className={inputStyle} />
                  </div>
                </SectionContent>
              </div>

              <button type="submit" className={`${buttonStyle} w-full`} disabled={calculating}>
                {calculating ? <SpinnerIcon /> : 'Calculate'}
              </button>
              {calculationError && <p className="text-sm text-red-600 mt-2 whitespace-pre-line">{calculationError}</p>}
            </form>
          </div>

          <div className="space-y-6">
            {!calculationResult && !calculating && (
              <div className={cardStyle}>
                <h2 className="text-xl font-semibold text-indigo-700 mb-4">Welcome</h2>
                <p className="text-sm text-gray-600">Fill out the form to calculate your solar system size.</p>
              </div>
            )}

            {calculating && (
              <div className={cardStyle}>
                <SpinnerIcon className="w-8 h-8 mx-auto text-indigo-600" />
                <p className="text-center mt-2">Calculating...</p>
              </div>
            )}

            {calculationResult && !calculating && (
              <div id="results-section" className={`${cardStyle} border-t-4 border-green-500`}>
                <h2 className="text-xl font-semibold text-green-700 mb-4">Results</h2>
                <div className="mb-4">
                  <p><strong>Location:</strong> {calculationResult.location}</p>
                  <p><strong>System Type:</strong> {calculationResult.systemType}</p>
                  <p><strong>Daily Need:</strong> {calculationResult.dailyEnergyConsumptionKwh?.toFixed(1)} kWh</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <h3 className="font-semibold text-green-700">PV System</h3>
                    <p>Size: {calculationResult.pvSystem?.sizeKwP} kWp</p>
                    <p>Panels: {calculationResult.pvSystem?.numberOfPanels} x {calculationResult.pvSystem?.panelWattage} Wp</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-green-700">Inverter</h3>
                    <p>Size: {calculationResult.inverter?.sizeKva} kVA</p>
                  </div>
                </div>
                {calculationResult.batterySystem && (
                  <div className="mb-4">
                    <h3 className="font-semibold text-green-700">Battery</h3>
                    <p>Capacity: {calculationResult.batterySystem.actualCapacityKwh} kWh</p>
                    <p>Units: {calculationResult.batterySystem.numberOfUnits}</p>
                  </div>
                )}
                <div className="mb-4">
                  <h3 className="font-semibold text-green-700">Financial</h3>
                  <p>Total Cost: {calculationResult.financial?.estimatedTotalCost?.toLocaleString()} {calculationResult.financial?.currency}</p>
                  <p>Savings: {calculationResult.financial?.estimatedAnnualSavings?.toLocaleString()}</p>
                  {getPieData(calculationResult.financial.costBreakdown) && (
                    <Pie data={getPieData(calculationResult.financial.costBreakdown)} options={pieChartOptions} />
                  )}
                </div>
                <div className="flex space-x-4">
                  {isLoggedIn && <button onClick={saveCalculation} className={secondaryButtonStyle}><DatabaseIcon /> Save</button>}
                  <button onClick={handleGeneratePDF} id="pdfButton" className={buttonStyle}><PdfIcon /> PDF</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;