// pages/index.js (Corrected & Refined - Without i18n)
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import dynamic from 'next/dynamic';
import 'chart.js/auto';
import Tesseract from 'tesseract.js';
import Head from 'next/head';

// --- Configuration ---
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'; // Ensure this is correctly set in your .env.local
const DEFAULT_PANEL_WATTAGE = 550;
const DEFAULT_TILT = 15;
const DEFAULT_AZIMUTH = 180;
const DEFAULT_SYSTEM_VOLTAGE = 48;
const DEFAULT_OFFGRID_AUTONOMY = 1.5;
const DEFAULT_HYBRID_BACKUP_HOURS = 6;
const DEFAULT_DOD = 0.85;

// --- Dynamically import components ---
const Bar = dynamic(() => import('react-chartjs-2').then((mod) => mod.Bar), { ssr: false });
const Pie = dynamic(() => import('react-chartjs-2').then((mod) => mod.Pie), { ssr: false });

// --- Icons (Basic placeholder SVGs - Replace with your actual icons/library) ---
const SunIcon = () => <svg className="w-5 h-5 inline mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.121-3.536a1 1 0 011.414 0l.707.707a1 1 0 01-1.414 1.414l-.707-.707a1 1 0 010-1.414zM10 18a1 1 0 01-1-1v-1a1 1 0 112 0v1a1 1 0 01-1 1zm-4.95-.464a1 1 0 010 1.414l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 0zm-3.536-2.121a1 1 0 00-1.414 0l-.707.707a1 1 0 001.414 1.414l.707-.707a1 1 0 000-1.414zM3 11a1 1 0 11-2 0v-1a1 1 0 112 0v1zm14 0a1 1 0 100-2h-1a1 1 0 100 2h1zM4.95 6.464a1 1 0 000-1.414l.707-.707a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414zM2.207 9.293a1 1 0 011.414 0L4 9.586V8.414A1 1 0 014 7l-.707-.707A1 1 0 012 7.707l.207.207zm13.472-1.989a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 3.536a1 1 0 000 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 0z" clipRule="evenodd" /></svg>;
const BoltIcon = () => <svg className="w-5 h-5 inline mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5.4a1 1 0 01-1.6 1.2L8 5.374a1 1 0 00-1.78.458l1.696 6.36A1 1 0 017.1 14H3a1 1 0 110-2h3.182l-.61-2.287a1 1 0 01.81-1.321L9.7 7.315a1 1 0 011.2.4l.796 1.592a1 1 0 001.592-.796l-.4-3.994a1 1 0 011.414-1.1l.494 1.48a1 1 0 001.82-1.19l-1.68-5.04A1 1 0 0111.3 1.046zM13 10v5.585l-1.42 1.416a1 1 0 01-1.588-.176l-.6-2.399A1 1 0 008.625 13H7a1 1 0 010-2h1.625a1 1 0 01.789.375l.4 1.599 1.804-.722a1 1 0 00.59-.43l.6-1.199A1 1 0 0113 10z" clipRule="evenodd" /></svg>;
const BatteryIcon = () => <svg className="w-5 h-5 inline mr-1" fill="currentColor" viewBox="0 0 20 20"><path d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm9 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-4 1a1 1 0 10-2 0v2a1 1 0 102 0V8z" /></svg>;
const MoneyIcon = () => <svg className="w-5 h-5 inline mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h12v10H4v-2a2 2 0 00-2 2v4a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm5.707 5.707a1 1 0 010-1.414l3-3a1 1 0 011.414 1.414L11.414 10H14a1 1 0 110 2h-2.586l2.293 2.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;
const UploadIcon = () => <svg className="w-6 h-6 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>;
const CheckCircleIcon = () => <svg className="w-5 h-5 inline mr-1 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>;
const InfoIcon = () => <svg className="w-5 h-5 inline mr-1 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>;
const ExclamationIcon = () => <svg className="w-5 h-5 inline mr-1 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099a.75.75 0 011.486 0l6.875 11.374a.75.75 0 01-.643 1.027H2.025a.75.75 0 01-.643-1.027L8.257 3.099zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>;
const CogIcon = () => <svg className="w-5 h-5 inline mr-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.566.379-1.566 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.566 2.6 1.566 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.566-.379 1.566-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106A1.532 1.532 0 0111.49 3.17zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>;
const ChevronDownIcon = () => <svg className="w-4 h-4 inline ml-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;
const ChevronUpIcon = () => <svg className="w-4 h-4 inline ml-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>;


// --- Main Component ---
function HomePage() {
    // --- State Variables ---
    const [token, setToken] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [authMessage, setAuthMessage] = useState('');
    const [authMessageType, setAuthMessageType] = useState('info');
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    const [uploading, setUploading] = useState(false);
    const [ocrProgress, setOcrProgress] = useState(0);
    const [ocrError, setOcrError] = useState('');
    const [ocrResultText, setOcrResultText] = useState('');
    const [ocrFileName, setOcrFileName] = useState('');
    const [extractedKwh, setExtractedKwh] = useState('');
    const [extractedBill, setExtractedBill] = useState('');

    const [location, setLocation] = useState('');
    const [systemType, setSystemType] = useState('on-grid');
    const [userType, setUserType] = useState('residential');

    const [avgMonthlyKwh, setAvgMonthlyKwh] = useState('');
    const [avgMonthlyBill, setAvgMonthlyBill] = useState('');
    const [electricityPricePerKwh, setElectricityPricePerKwh] = useState('25');

    const [appliances, setAppliances] = useState([]);
    const [applianceCategories, setApplianceCategories] = useState({ residential: [], commercial: [], industrial: [] });

    const [systemVoltage, setSystemVoltage] = useState(''); // Initialize empty, set defaults based on type change
    const [autonomyDays, setAutonomyDays] = useState(''); // Initialize empty
    const [backupDurationHours, setBackupDurationHours] = useState(''); // Initialize empty
    const [depthOfDischarge, setDepthOfDischarge] = useState(''); // Initialize empty

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

    // --- Effects ---

    // Load token effect
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const storedToken = localStorage.getItem('solarFitToken');
            if (storedToken) {
                setToken(storedToken);
                setIsLoggedIn(true);
                // Optionally verify token here with a silent backend call
            }
        }
    }, []);

    // Fetch appliance presets effect
    useEffect(() => {
        const fetchPresets = async () => {
             try {
                const response = await axios.get(`${backendUrl}/api/appliances`);
                 if (response.data && typeof response.data === 'object') {
                     setApplianceCategories(response.data);
                } else { console.error('Invalid appliance data format received:', response.data); }
             } catch (error) { console.error('Failed to fetch appliance list:', error); }
         };
        fetchPresets();
    }, [backendUrl]); // Runs only on mount or if backendUrl changes

    // Fetch saved calculations effect
    useEffect(() => {
        const fetchSaved = async () => {
            if (isLoggedIn && token) {
                setLoadingSaved(true);
                setAuthMessage('');
                try {
                    const response = await axios.get(`${backendUrl}/api/calculations`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    if (Array.isArray(response.data)) {
                        setSavedCalculations(response.data);
                    } else {
                        console.error("Received non-array data for saved calculations:", response.data);
                        setSavedCalculations([]);
                        throw new Error("Invalid format for saved calculations.");
                    }
                } catch (error) {
                    console.error('Failed to fetch saved calculations:', error.response || error);
                    setAuthMessage("Error: Could not load saved calculations.");
                    setAuthMessageType('error');
                    // Logout if token invalid
                    if (error.response?.status === 400 || error.response?.status === 401) {
                        handleLogout();
                    }
                } finally {
                    setLoadingSaved(false);
                }
            } else {
                setSavedCalculations([]); // Clear if not logged in
            }
         };
        fetchSaved();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoggedIn, token]); // Re-run when login status or token changes, Add handleLogout to deps if it changes state used here


    // Effect to reset fields and apply defaults when SystemType changes
    useEffect(() => {
        if (systemType === 'on-grid') {
            setAutonomyDays('');
            setBackupDurationHours('');
            setDepthOfDischarge('');
            setSystemVoltage(''); // Not needed
        } else if (systemType === 'off-grid') {
            setBackupDurationHours('');
            // Set defaults only if current state is empty (don't overwrite user changes when just switching types)
            if (autonomyDays === '') setAutonomyDays(DEFAULT_OFFGRID_AUTONOMY);
            if (depthOfDischarge === '') setDepthOfDischarge(DEFAULT_DOD);
            if (systemVoltage === '') setSystemVoltage(DEFAULT_SYSTEM_VOLTAGE);
        } else { // hybrid
            setAutonomyDays('');
            if (backupDurationHours === '') setBackupDurationHours(DEFAULT_HYBRID_BACKUP_HOURS);
            if (depthOfDischarge === '') setDepthOfDischarge(DEFAULT_DOD);
            if (systemVoltage === '') setSystemVoltage(DEFAULT_SYSTEM_VOLTAGE);
        }
    }, [systemType, autonomyDays, backupDurationHours, depthOfDischarge, systemVoltage]); // Include states to avoid overwriting if they were just changed by user

    // --- Event Handlers & Logic ---

    // Auth Handlers
    const handleAuthAction = async (action) => {
        setAuthMessage('');
        if (!username || !password) {
            setAuthMessage('Error: Please enter both username and password.');
            setAuthMessageType('error'); return;
        }
        const loadingMsg = action === 'login' ? 'Logging in' : 'Signing up';
        setAuthMessage(loadingMsg + '...');
        setAuthMessageType('info');
        try {
            const url = `${backendUrl}/api/${action}`;
            const response = await axios.post(url, { username, password });
            if (action === 'signup') {
                setAuthMessage(response.data.message || 'Signup successful! Please log in.');
                setAuthMessageType('success'); setUsername(''); setPassword('');
            } else { // Login
                const { token } = response.data;
                if (!token) throw new Error("Login failed: No token received.");
                setToken(token); localStorage.setItem('solarFitToken', token); setIsLoggedIn(true);
                setAuthMessage('Login successful!');
                setAuthMessageType('success'); setUsername(''); setPassword('');
            }
        } catch (error) {
            console.error(`${action} error:`, error.response?.data || error.message);
            const errorMsg = error.response?.data?.message || error.message || 'An unexpected error occurred.';
            setAuthMessage(`Error: ${errorMsg}`);
            setAuthMessageType('error'); setIsLoggedIn(false); localStorage.removeItem('solarFitToken'); setToken('');
        }
    };

    const handleLogout = useCallback(() => { // Wrap in useCallback if passed as dependency
        setToken(''); localStorage.removeItem('solarFitToken'); setIsLoggedIn(false);
        setCalculationResult(null);
        setAuthMessage('Logged out successfully.');
        setAuthMessageType('success'); setUsername(''); setPassword(''); setSavedCalculations([]);
    }, []); // No dependencies needed if it only sets state directly

    // OCR Functionality
    const parseOcrText = useCallback((text) => {
        // Reset previous results
        setOcrError('');
        let foundKwh = null;
        let foundBill = null;

        // Define Regex patterns - IMPORTANT: Tune these for actual Kenyan bills!
        const kwhPatterns = [
             /kWh\s*:?\s*([\d,]+\.?\d*)/i,
             /Usage \(kWh\)\s*:?\s*([\d,]+\.?\d*)/i,
             /consumption\s*kWh\s*:?\s*([\d,]+\.?\d*)/i,
             /Units Consumed\s*:?\s*([\d,]+\.?\d*)/i,
             /([\d,]+\.?\d*)\s*kWh/i
        ];
        const billPatterns = [
             /(?:Total Amount Due|Amount Payable|TOTAL.*)[:\s]?\s*(?:KES|Ksh\.?)\s*([\d,]+\.?\d*)/i, // Capture common phrases like "Total Amount Due" etc.
             /(?:Balance Carried Forward|Total Balance)\s*[:\s]?\s*(?:KES|Ksh\.?)\s*(-?[\d,]+\.?\d*)/i, // Handle balances if they represent bill amount
            /(?:Current Bill|Bill Amount)\s*[:\s]?\s*(?:KES|Ksh\.?)\s*([\d,]+\.?\d*)/i,
            /(?:Pay Bill Before)\s*[\s\S]*?(?:Amount KES|Total \(KES\)|Bill Amt \(Ksh\))\s*[:\s]?\s*([\d,]+\.?\d*)/i, // Look around date for amount
            /(?:KES|Ksh\.?)\s*([\d,]+\.?\d*)/i, // Generic amount with currency prefix
             /([\d,]+\.?\d*)\s*(?:KES|Ksh\.?)/i // Generic amount with currency suffix
        ];

        // Helper to clean and parse number strings
        const cleanNumber = (str) => str ? parseFloat(str.replace(/,/g, '').trim()) : null;

        // Find kWh
        for (const pattern of kwhPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                const num = cleanNumber(match[1]);
                if (!isNaN(num) && num >= 0) { foundKwh = num; break; } // Use first valid positive kWh found
            }
        }

        // Find Bill Amount - Be careful not to grab irrelevant numbers
        for (const pattern of billPatterns) {
            const match = text.match(pattern);
            if (match && match[1]) {
                 const num = cleanNumber(match[1]);
                 // Add basic sanity checks: avoid tiny numbers or numbers clearly not bill amounts if possible
                if (!isNaN(num) && num > 10) { // Example: ignore amounts less than 10 KES
                     foundBill = num; break; // Use first likely bill amount
                }
            }
        }

        // Update state based on findings
        let ocrMsg = '';
        if (foundKwh !== null) {
            setExtractedKwh(foundKwh);
            setAvgMonthlyKwh(foundKwh.toString()); // Auto-fill input
            setAppliances([]); // Clear appliances if kWh found
            setAvgMonthlyBill(''); // Clear bill amount input if kWh found
            console.log(`OCR Extracted kWh: ${foundKwh}`);
            ocrMsg += `Extracted ${foundKwh} kWh. `;
            setShowAppliances(false); // Close appliance section
        }

        if (foundBill !== null && foundKwh === null) { // Only use Bill amount if kWh was NOT found
            setExtractedBill(foundBill);
            setAvgMonthlyBill(foundBill.toString());
            setAppliances([]);
            setAvgMonthlyKwh('');
            console.log(`OCR Extracted Bill (KES): ${foundBill}`);
            ocrMsg += `Extracted Bill Amount ${foundBill} KES. `;
            setShowAppliances(false);
        }

        // Set result messages
        if (foundKwh === null && foundBill === null) {
            setOcrError('Could not automatically extract kWh or Bill Amount. Please check the image or enter manually.');
        } else {
            setAuthMessage(ocrMsg + `Successfully applied from file: ${ocrFileName}`);
            setAuthMessageType('success');
            setOcrResultText(text.substring(0, 500) + '...'); // Show preview
        }

    }, [ocrFileName]); // Depend on filename to show it in success message

    const onDropAccepted = useCallback(async (acceptedFiles) => {
        const file = acceptedFiles[0]; if (!file) return;
        setUploading(true); setOcrProgress(0); setOcrError(''); setOcrResultText(''); setExtractedKwh(''); setExtractedBill(''); setOcrFileName(file.name); // Set filename early
        try {
            console.log('Starting OCR on file:', file.name);
            const { data: { text } } = await Tesseract.recognize( file, 'eng',
                { logger: m => { if (m.status === 'recognizing text') { setOcrProgress(Math.round(m.progress * 100)); } } }
            );
            console.log('OCR Raw Text Received, length:', text.length);
            parseOcrText(text);
        } catch (err) {
            console.error("OCR Error:", err);
            setOcrError(`OCR Error: ${err.message || 'Processing failed.'}`);
        } finally { setUploading(false); setOcrProgress(100); }
     }, [parseOcrText]); // Include parseOcrText in dependencies

    const { getRootProps, getInputProps, isDragActive, isFileDialogActive } = useDropzone({ onDropAccepted, accept: { 'image/*': ['.jpeg', '.png', '.jpg', '.bmp', '.webp', '.tiff'] }, maxFiles: 1, disabled: uploading });

    // Appliance Management
    const addAppliance = () => {
        if (avgMonthlyKwh || avgMonthlyBill) { alert('Please clear Avg kWh or Bill amount to add appliances manually.'); return; }
        setShowAppliances(true);
        const presetList = applianceCategories[userType] || [];
        const defaultPreset = presetList.length > 0 ? presetList[0] : null;
        setAppliances([...appliances, {
            id: Date.now(),
            name: defaultPreset ? defaultPreset.name : 'custom',
            power: defaultPreset ? defaultPreset.power : '',
            peakFactor: defaultPreset ? defaultPreset.peakFactor : 1.5,
            customName: '',
            quantity: 1,
            hoursPerDay: 1,
        }]);
     };
    const updateAppliance = (id, field, value) => {
        setAppliances(prevAppliances =>
            prevAppliances.map(appliance => {
                if (appliance.id === id) {
                    const updatedAppliance = { ...appliance, [field]: value };
                    let selectedPreset = null;

                    if (field === 'name') {
                       selectedPreset = (applianceCategories[userType] || []).find(a => a.name === value);
                        if (value === 'custom') {
                             updatedAppliance.power = ''; updatedAppliance.customName = ''; updatedAppliance.peakFactor = 1.5;
                         } else if (selectedPreset) {
                             updatedAppliance.power = selectedPreset.power ?? ''; updatedAppliance.peakFactor = selectedPreset.peakFactor ?? 1.5; updatedAppliance.customName = '';
                         }
                     }

                    if (field === 'power' || field === 'quantity' || field === 'hoursPerDay') {
                         const numValue = field === 'hoursPerDay' ? parseFloat(value) : parseInt(value);
                         if (isNaN(numValue)) { updatedAppliance[field] = ''; } // Allow empty string
                         else {
                            if (field === 'power' && numValue < 0) updatedAppliance[field] = 0;
                            else if (field === 'quantity' && numValue < 1) updatedAppliance[field] = 1;
                            else if (field === 'hoursPerDay') { updatedAppliance[field] = Math.max(0, Math.min(24, numValue)); }
                            else { updatedAppliance[field] = numValue; }
                        }
                     }
                    return updatedAppliance;
                }
                return appliance;
            })
        );
     };
    const removeAppliance = (id) => setAppliances(appliances.filter(app => app.id !== id));
    const calculateDailyApplianceKwh = useMemo(() => {
        return appliances.reduce((sum, app) => {
             const powerW = parseFloat(app.power) || 0; const quantity = parseInt(app.quantity) || 0; const hours = parseFloat(app.hoursPerDay) || 0;
             if (powerW > 0 && quantity > 0 && hours > 0) { return sum + (powerW / 1000) * quantity * hours; }
             return sum;
         }, 0);
    }, [appliances]);

    // --- Main Calculation Trigger ---
     const handleCalculateClick = async (event) => {
        if (event) event.preventDefault();
        setCalculating(true); setCalculationResult(null); setCalculationError(''); setCalculationInputParams(null);
        const errors = [];

        // --- Frontend Validations ---
        if (!location.trim()) errors.push("Project Location is required.");
        if (!electricityPricePerKwh || parseFloat(electricityPricePerKwh) <= 0) errors.push("Valid Electricity Price (> 0 KES/kWh) is required for savings calculations.");
        const kwhInput = parseFloat(avgMonthlyKwh); const billInput = parseFloat(avgMonthlyBill); const applianceEnergy = calculateDailyApplianceKwh; const energyProvided = kwhInput > 0 || billInput > 0 || (appliances.length > 0 && applianceEnergy > 0);
        if (!energyProvided) errors.push("Please provide energy usage: Avg. Monthly kWh, Avg. Monthly Bill, or list your appliances.");
        if (billInput > 0 && (isNaN(parseFloat(electricityPricePerKwh)) || parseFloat(electricityPricePerKwh) <= 0)) errors.push("Electricity Price is required when using Avg. Monthly Bill.");
        if (isNaN(parseInt(panelWattage)) || parseInt(panelWattage) < 50 || parseInt(panelWattage) > 1000) errors.push("Valid Panel Wattage (50-1000 Wp) required.");
        if (systemType === 'off-grid') {
            if (isNaN(parseFloat(autonomyDays)) || parseFloat(autonomyDays) < 0.5) errors.push("Valid Autonomy days (>= 0.5) required for Off-Grid.");
            if (isNaN(parseFloat(depthOfDischarge)) || parseFloat(depthOfDischarge) <= 0.1 || parseFloat(depthOfDischarge) > 1) errors.push("Valid Battery DoD (0.1-1.0) required for Off-Grid.");
            if (![12, 24, 48].includes(Number(systemVoltage))) errors.push("Valid System Voltage (12, 24, or 48V) required for Off-Grid.");
        } else if (systemType === 'hybrid') {
            if (isNaN(parseFloat(backupDurationHours)) || parseFloat(backupDurationHours) < 0) errors.push("Valid Backup Duration (>= 0 hours) required for Hybrid.");
            if (parseFloat(backupDurationHours) > 0) { // Only validate Batt params if backup needed
                if (isNaN(parseFloat(depthOfDischarge)) || parseFloat(depthOfDischarge) <= 0.1 || parseFloat(depthOfDischarge) > 1) errors.push("Valid Battery DoD (0.1-1.0) required for Hybrid with backup.");
                if (![24, 48].includes(Number(systemVoltage))) errors.push("Valid System Voltage (24V or 48V) required for Hybrid with backup.");
            }
        }
        if (showAdvancedPanel) {
            if (isNaN(parseFloat(tilt)) || parseFloat(tilt) < 0 || parseFloat(tilt) > 90) errors.push("Valid Panel Tilt (0-90) required.");
            if (isNaN(parseFloat(azimuth)) || parseFloat(azimuth) < 0 || parseFloat(azimuth) > 359) errors.push("Valid Panel Azimuth (0-359) required.");
            if (isNaN(parseFloat(shading)) || parseFloat(shading) < 0 || parseFloat(shading) > 99) errors.push("Valid Shading Loss (0-99) required.");
        }

        if (errors.length > 0) {
            setCalculationError(`Please fix the following issues:\n- ${errors.join('\n- ')}`);
            setCalculating(false); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
        }

        // --- Prepare Params ---
        const paramsToSend = {
            location: location.trim(), systemType, userType,
            systemVoltage: (systemType !== 'on-grid' && Number(systemVoltage)) ? Number(systemVoltage) : null, // Send only if applicable and valid number
            avgMonthlyKwh: avgMonthlyKwh ? parseFloat(avgMonthlyKwh) : null,
            avgMonthlyBill: avgMonthlyBill ? parseFloat(avgMonthlyBill) : null,
            electricityPricePerKwh: parseFloat(electricityPricePerKwh),
            appliances: appliances.length > 0 ? appliances.map(a => ({
                name: (a.name === 'custom' ? a.customName : a.name) || 'Unnamed Appliance',
                power: parseFloat(a.power) || 0,
                quantity: parseInt(a.quantity) || 0,
                hoursPerDay: parseFloat(a.hoursPerDay) || 0,
                peakFactor: parseFloat(a.peakFactor) || 1.5
            })).filter(a => a.power > 0 && a.quantity > 0) : null,
            autonomyDays: systemType === 'off-grid' ? parseFloat(autonomyDays) : null,
            backupDurationHours: systemType === 'hybrid' ? parseFloat(backupDurationHours) : null,
            depthOfDischarge: systemType !== 'on-grid' && parseFloat(depthOfDischarge) > 0 ? parseFloat(depthOfDischarge) : null, // Send only if applicable and valid
            panelWattage: parseInt(panelWattage),
            tilt: parseFloat(tilt) || DEFAULT_TILT, // Send default if not shown/empty
            azimuth: parseFloat(azimuth) || DEFAULT_AZIMUTH,
            shading: parseFloat(shading) || 0,
            budget: budget ? parseFloat(budget) : null,
        };
        setCalculationInputParams(paramsToSend); // Cache params sent

        // --- API Call ---
        try {
            console.log('Sending calculation request:', JSON.stringify(paramsToSend, null, 2));
            const response = await axios.post(`${backendUrl}/api/calculate`, paramsToSend, { timeout: 60000 });
            if (!response.data || !response.data.pvSystem) { throw new Error("Received invalid data structure from server."); }
            setCalculationResult(response.data);
            document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            console.error('Calculation API error:', error);
            let errorMessage = 'Calculation failed';
            if (error.code === 'ECONNABORTED') { errorMessage = 'Error: Request timed out. Server might be busy.'; }
            else if (error.response?.data?.message) { errorMessage = `Error: ${error.response.data.message}`; } // Use specific backend message
            else if (error.message) { errorMessage = `Error: ${error.message}`; }
            setCalculationError(errorMessage);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } finally { setCalculating(false); }
    };

    // Save Calculation
     const saveCalculation = async () => {
        if (!calculationResult || !isLoggedIn || !calculationInputParams) { alert('Cannot save: No result, not logged in, or input parameters missing.'); return; }
        setAuthMessage('Saving calculation...'); setAuthMessageType('info');
        try {
            const payload = { calculationParams: calculationInputParams, resultData: calculationResult };
            await axios.post(`${backendUrl}/api/save-calculation`, payload, { headers: { Authorization: `Bearer ${token}` } });
            setAuthMessage('Calculation saved successfully!'); setAuthMessageType('success');
             const fetchSavedAgain = async () => { setLoadingSaved(true); try { const response = await axios.get(`${backendUrl}/api/calculations`, { headers: { Authorization: `Bearer ${token}` } }); if (Array.isArray(response.data)) setSavedCalculations(response.data); else throw new Error("Invalid saved format"); } catch (error) { console.error('Post-save fetch error:', error.response || error); setAuthMessage('Error: Could not reload calculations after save.'); setAuthMessageType('error'); if (error.response?.status === 400 || error.response?.status === 401) handleLogout(); } finally { setLoadingSaved(false); } };
             fetchSavedAgain();
        } catch (error) {
            console.error('Save calculation error:', error.response || error);
            const errMsg = error.response?.data?.message || 'Save failed. Please try again.';
            setAuthMessage(`Error: ${errMsg}`); setAuthMessageType('error');
            if (error.response?.status === 400 || error.response?.status === 401) handleLogout();
        }
     };

    // Generate PDF
     const handleGeneratePDF = async () => {
        if (!calculationResult) { alert('Please perform a calculation first to generate a PDF report.'); return; }
        const pdfButton = document.getElementById('pdfButton'); if (pdfButton) pdfButton.textContent = 'Generating PDF...';
        try {
            const response = await axios.post(`${backendUrl}/api/generate-pdf`, calculationResult, { responseType: 'blob', headers: { 'Accept': 'application/pdf' }, timeout: 45000 });
            const blob = new Blob([response.data], { type: 'application/pdf' }); const url = window.URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; const filename = `SolarFit_Estimate_${(calculationResult.location || 'Location').replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`; link.setAttribute('download', filename); document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('PDF generation error:', error); let errorMsg = 'PDF generation failed. ';
            if (error.response?.data instanceof Blob && error.response.data.type === 'application/json') { try { const errJson = JSON.parse(await error.response.data.text()); errorMsg += errJson.message || 'Server error during PDF creation.'; } catch (parseError) { errorMsg += 'Unable to parse server error.'; } }
            else if (error.response?.data?.message) { errorMsg += error.response.data.message; } else { errorMsg += error.message || 'Check server logs.'; } alert(errorMsg);
        } finally { if (pdfButton) pdfButton.textContent = 'Generate PDF Report'; }
    };

    // Load Calculation
    const loadCalculation = (calc) => {
         if (calc?.calculationParams && calc?.resultData) {
            const params = calc.calculationParams; const result = calc.resultData;
            console.log("Loading calculation:", params);
            setLocation(params.location || ''); setSystemType(params.systemType || 'on-grid'); setUserType(params.userType || 'residential');
            // Set energy inputs correctly
            setAvgMonthlyKwh(params.avgMonthlyKwh || ''); setAvgMonthlyBill(params.avgMonthlyBill || '');
            setElectricityPricePerKwh(params.electricityPricePerKwh || '25');
            // Ensure appliances are cleared if kWh/Bill was loaded
            if (params.avgMonthlyKwh || params.avgMonthlyBill) { setAppliances([]); }
             else { setAppliances((params.appliances || []).map((app, idx) => ({ ...app, id: app.id || Date.now() + idx }))); }
            // Set battery/panel params
             setSystemVoltage(params.systemVoltage || ''); // Keep empty if null/0 was saved
            setAutonomyDays(params.autonomyDays || ''); // Use saved or default if null
            setBackupDurationHours(params.backupDurationHours || ''); // Use saved or default if null
             setDepthOfDischarge(params.depthOfDischarge || '');
            setPanelWattage(params.panelWattage || DEFAULT_PANEL_WATTAGE); setTilt(params.tilt || DEFAULT_TILT); setAzimuth(params.azimuth || DEFAULT_AZIMUTH); setShading(params.shading || 0); setBudget(params.budget || '');
            // Load results
            setCalculationResult(result); setCalculationInputParams(params); setCalculationError('');
            setAuthMessage(`Loaded calculation saved on ${new Date(calc.createdAt).toLocaleDateString()}.`); setAuthMessageType('success');
            window.scrollTo({ top: 0, behavior: 'smooth' });
             setShowAppliances(params.appliances && params.appliances.length > 0 && !params.avgMonthlyKwh && !params.avgMonthlyBill);
        } else { alert('Error: Could not load calculation, data is invalid.'); }
     };

    // Toggle section helper
    const toggleSection = (setter, currentState) => setter(!currentState);

    // --- UI Styling Constants ---
    // (Keep styles defined as before: cardStyle, fieldsetStyle, etc.)
    const cardStyle = "bg-white p-4 sm:p-6 rounded-lg shadow-lg mb-6 border border-gray-200";
    const fieldsetStyle = "border border-gray-300 p-4 rounded-lg mb-4 relative";
    const legendStyle = "font-semibold text-indigo-700 px-2 text-sm bg-white -mt-[0.8em] ml-2 absolute"; // Adjusted legend position
    const formGroupStyle = "mb-4 pt-2"; // Add padding top to account for lifted legend
    const labelStyle = "block text-xs font-medium text-gray-600 mb-1";
    const inputStyle = "block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm placeholder-gray-400";
    const selectStyle = inputStyle + " appearance-none bg-white"; // Important for custom arrow potentially
    const buttonStyle = "inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150 ease-in-out";
    const buttonSecondaryStyle = buttonStyle + " bg-gray-600 hover:bg-gray-700 focus:ring-gray-500 text-white";
    const buttonDangerStyle = buttonStyle + " bg-red-600 hover:bg-red-700 focus:ring-red-500 text-white";
    const buttonOutlineStyle = "inline-flex items-center justify-center px-4 py-2 border border-indigo-600 rounded-md shadow-sm text-sm font-medium text-indigo-600 bg-white hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150 ease-in-out";
    const h2Style = "text-2xl font-semibold text-center text-gray-800 mb-6 pb-2 border-b-2 border-gray-200";
    const h3Style = "text-lg font-semibold text-indigo-800 mt-4 mb-3 flex items-center";
    const gridStyle = "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1"; // Base grid style
    const resultCardStyle = cardStyle + " border-t-4 border-green-500 bg-gradient-to-br from-green-50 to-white";
    const resultH2Style = h2Style + " !text-green-800 !border-green-300";
    const resultH3Style = h3Style + " !text-green-700";
    const dropzoneBaseStyle = "mt-1 flex flex-col items-center justify-center px-6 py-10 border-2 border-gray-300 border-dashed rounded-md cursor-pointer hover:border-indigo-500 bg-gray-50 hover:bg-gray-100 transition-colors duration-150"; // Enhanced Dropzone style
    const dropzoneActiveStyle = "!border-indigo-600 !bg-indigo-50";


    // --- Render JSX ---
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-100 font-sans">
            <Head>
                <title>SolarFit - Advanced Solar System Sizing</title>
                <meta name="description" content="Calculate and estimate your solar PV system needs for residential, commercial, or industrial use in Kenya." />
                 {/* Link to Tailwind CDN if not using build process - NOT recommended for production */}
                 {/* <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet"> */}
            </Head>

            <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
                <div className="text-center mb-10">
                    <h1 className="text-4xl font-bold text-gray-800 mb-2">SolarFit</h1>
                    <p className="text-lg text-gray-600">Advanced Solar System Sizing</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                     <div className="lg:col-span-2 space-y-6"> {/* Left Column: Inputs */}
                        {/* Authentication Section */}
                        <div className={cardStyle}>
                             {/* Login/Signup Form or Welcome Message */}
                            {!isLoggedIn ? (
                                <>
                                    <h2 className="text-xl font-semibold text-center text-gray-700 mb-4">Login or Signup</h2>
                                     {authMessage && (
                                         <p className={`text-center p-2 rounded mb-4 text-sm ${authMessageType === 'error' ? 'bg-red-100 text-red-700' : authMessageType === 'success' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                             {authMessage}
                                        </p>
                                     )}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className={formGroupStyle}> <label htmlFor="username" className={labelStyle}>Username:</label> <input id="username" value={username} onChange={e => setUsername(e.target.value)} className={inputStyle} autoComplete="username" /> </div>
                                        <div className={formGroupStyle}> <label htmlFor="password" className={labelStyle}>Password:</label> <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputStyle} autoComplete="current-password" /> </div>
                                    </div>
                                    <div className="mt-5 flex flex-col sm:flex-row justify-center sm:space-x-4 space-y-2 sm:space-y-0">
                                        <button type="button" onClick={() => handleAuthAction('signup')} className={buttonSecondaryStyle + " w-full sm:w-auto"}>Signup</button>
                                        <button type="button" onClick={() => handleAuthAction('login')} className={buttonStyle + " w-full sm:w-auto"}>Login</button>
                                     </div>
                                </>
                            ) : (
                                <div className="flex justify-between items-center">
                                    <h2 className="text-lg font-semibold text-green-700">Welcome back!</h2>
                                    {/* Optional: Display non-success auth messages */}
                                    {authMessage && !authMessage.includes("successful") && !authMessage.includes("Loading") && (
                                        <p className={`p-1 px-2 rounded text-xs ${authMessageType === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{authMessage}</p>
                                     )}
                                     <button onClick={handleLogout} className={buttonDangerStyle + " text-xs px-3 py-1"}>Logout</button>
                                </div>
                            )}
                        </div>

                         {/* Saved Calculations Section */}
                         {isLoggedIn && (
                             <div className={cardStyle}>
                                 <h2 className="text-xl font-semibold text-center text-gray-700 mb-4">Saved Calculations</h2>
                                 {loadingSaved ? ( <p className="text-center text-sm text-gray-500">Loading saved calculations...</p> ) : (
                                    savedCalculations.length > 0 ? (
                                        <ul className="space-y-2 max-h-60 overflow-y-auto border rounded p-2 bg-gray-50">
                                            {savedCalculations.map(calc => (
                                                <li key={calc._id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-2 border-b last:border-b-0 hover:bg-gray-100">
                                                    <div className="text-sm mb-1 sm:mb-0">
                                                        <span className="font-medium">{calc.resultData?.location || 'No Location'}</span>
                                                        <span className="text-gray-600"> - {calc.resultData?.pvSystem?.sizeKwP || '?'}kWp ({calc.resultData?.systemType || 'N/A'})</span>
                                                        <span className="block sm:inline sm:ml-2 text-xs text-gray-500">({new Date(calc.createdAt).toLocaleDateString()})</span>
                                                     </div>
                                                     <button onClick={() => loadCalculation(calc)} className={buttonOutlineStyle + " text-xs px-2 py-1 w-full sm:w-auto"}> Load </button>
                                                </li>
                                             ))}
                                        </ul>
                                    ) : ( <p className="text-center text-sm text-gray-500">No saved calculations found.</p> )
                                 )}
                             </div>
                         )}

                        {/* Input Form */}
                        <form onSubmit={handleCalculateClick}>
                            <div className={cardStyle}>
                                <h2 className={h2Style}>Project Details & Energy Needs</h2>

                                {/* Main Input Grid */}
                                <div className={gridStyle + " md:grid-cols-3"}>
                                    {/* Location & System */}
                                    <fieldset className={fieldsetStyle + " md:col-span-2"}>
                                        <legend className={legendStyle}>Location & System</legend>
                                        <div className={formGroupStyle}> <label htmlFor="location" className={labelStyle}>Project Location*</label> <input id="location" value={location} onChange={e => setLocation(e.target.value)} className={inputStyle} required placeholder="e.g., Nairobi, Kenya" /> </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className={formGroupStyle}> <label htmlFor="systemType" className={labelStyle}>System Type*</label> <select id="systemType" value={systemType} onChange={e => setSystemType(e.target.value)} className={selectStyle} required> <option value="on-grid">On-Grid</option> <option value="off-grid">Off-Grid</option> <option value="hybrid">Hybrid</option> </select> </div>
                                            <div className={formGroupStyle}> <label htmlFor="userType" className={labelStyle}>User Type*</label> <select id="userType" value={userType} onChange={e => { setUserType(e.target.value); setAppliances([]) }} className={selectStyle} required> <option value="residential">Residential</option> <option value="commercial">Commercial</option> <option value="industrial">Industrial</option> </select> </div>
                                         </div>
                                    </fieldset>

                                     {/* Electricity Price */}
                                     <fieldset className={fieldsetStyle + " md:col-span-1"}>
                                        <legend className={legendStyle}>Electricity Cost</legend>
                                        <div className={formGroupStyle}> <label htmlFor="electricityPrice" className={labelStyle}>Current Price (KES/kWh)*</label> <input id="electricityPrice" type="number" step="0.1" value={electricityPricePerKwh} onChange={e => setElectricityPricePerKwh(e.target.value)} className={inputStyle} placeholder="e.g., 25" required min="0.1" /> <span className="text-xs text-gray-500 mt-1 block">Needed for savings estimate.</span> </div>
                                     </fieldset>
                                </div>

                                <hr className="my-6 border-gray-200" />

                                 {/* Energy Consumption */}
                                 <fieldset className={fieldsetStyle}>
                                    <legend className={legendStyle}>Energy Consumption*</legend>
                                     <p className="text-xs text-gray-500 mb-3">Provide one option below or list appliances.</p>
                                     <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                        {/* Option 1 & 2: kWh / Bill */}
                                        <div className='space-y-4'>
                                            <div className={formGroupStyle}> <label htmlFor="avgMonthlyKwh" className={labelStyle}>Avg. Monthly kWh</label> <input id="avgMonthlyKwh" type="number" min="0" value={avgMonthlyKwh} onChange={e => { setAvgMonthlyKwh(e.target.value); if (e.target.value) { setAppliances([]); setAvgMonthlyBill(''); setShowAppliances(false); } }} className={inputStyle} placeholder="e.g., 350" disabled={appliances.length > 0} /> </div>
                                             <div className={formGroupStyle}> <label htmlFor="avgMonthlyBill" className={labelStyle}>Avg. Monthly Bill (KES)</label> <input id="avgMonthlyBill" type="number" min="0" value={avgMonthlyBill} onChange={e => { setAvgMonthlyBill(e.target.value); if (e.target.value) { setAppliances([]); setAvgMonthlyKwh(''); setShowAppliances(false); } }} className={inputStyle} placeholder="e.g., 8000" disabled={!!avgMonthlyKwh || appliances.length > 0} /> </div>
                                        </div>
                                        {/* Option 3: OCR Upload */}
                                         <div className="pt-2">
                                             <label className={labelStyle}>Or Upload Bill Image (OCR)</label>
                                             <div {...getRootProps()} className={`${dropzoneBaseStyle} ${isDragActive ? dropzoneActiveStyle : ''}`}>
                                                <input {...getInputProps()} />
                                                <UploadIcon />
                                                 <p className="mt-1 text-sm text-gray-600"> {isFileDialogActive ? "Select file..." : (isDragActive ? 'Drop the image here...' : 'Drag & drop or click to select')} </p>
                                                 <p className="text-xs text-gray-500">Image file (PNG, JPG, etc.)</p>
                                                 {uploading && <p className="text-xs text-indigo-600 mt-2">Processing {ocrProgress}%...</p>}
                                                {ocrError && <p className="text-xs text-red-600 mt-2 font-medium">{ocrError}</p>}
                                                {!ocrError && (extractedKwh || extractedBill) && !uploading && (
                                                    <p className="text-xs text-green-600 mt-2 font-medium"> <CheckCircleIcon /> Extracted: {extractedKwh && `${extractedKwh} kWh`} {extractedBill && `${extractedBill} KES`} ({ocrFileName}) </p>
                                                )}
                                            </div>
                                         </div>
                                    </div>

                                    {/* Option 4: Appliance Details Toggle */}
                                    <div className="mt-5 pt-3 border-t border-dashed">
                                         <button type="button" onClick={() => toggleSection(setShowAppliances, showAppliances)} className="text-sm text-indigo-600 hover:underline flex items-center w-full justify-between" disabled={!!avgMonthlyKwh || !!avgMonthlyBill}>
                                            <span> Or List Appliances Manually {calculateDailyApplianceKwh > 0 ? `(Total: ${calculateDailyApplianceKwh.toFixed(2)} kWh / Day)` : ''} </span>
                                             {showAppliances ? <ChevronUpIcon /> : <ChevronDownIcon />}
                                         </button>
                                        {(!!avgMonthlyKwh || !!avgMonthlyBill) && <p className="text-xs text-orange-600 mt-1">Appliance entry disabled when Avg kWh or Bill is entered above.</p>}
                                        {showAppliances && !avgMonthlyKwh && !avgMonthlyBill && (
                                            <div className="mt-4 space-y-4">
                                                 {appliances.map((appliance) => (
                                                    <div key={appliance.id} className="grid grid-cols-6 gap-2 items-end border-b pb-2 last:border-b-0">
                                                        {/* Appliance Select */}
                                                        <div className="col-span-6 sm:col-span-2"> <label className={labelStyle}>Appliance</label> <select value={appliance.name} onChange={e => updateAppliance(appliance.id, 'name', e.target.value)} className={selectStyle + ' text-sm py-1.5'}> <option value="custom">-- Custom --</option> {(applianceCategories[userType] || []).map(app => (<option key={app.name} value={app.name}>{app.name} ({app.power}W)</option>))} </select> </div>
                                                        {/* Custom Name */}
                                                        {appliance.name === 'custom' && ( <div className="col-span-6 sm:col-span-4"> <label className={labelStyle}>Custom Name</label> <input type="text" placeholder="e.g., Kitchen Fridge" value={appliance.customName || ''} onChange={e => updateAppliance(appliance.id, 'customName', e.target.value)} className={inputStyle + ' text-sm py-1.5'} required /> </div> )}
                                                        {/* Inputs Row */}
                                                        <div className={`col-span-6 grid grid-cols-3 sm:grid-cols-4 gap-2 ${appliance.name === 'custom' ? '' : 'sm:col-start-3 sm:col-span-4'}`}>
                                                             <div> <label className={labelStyle}>Power (W)</label> <input type="number" placeholder="W" value={appliance.power} onChange={e => updateAppliance(appliance.id, 'power', e.target.value)} className={inputStyle + ' text-sm py-1.5'} min="0" required disabled={appliance.name !== 'custom'} /> </div>
                                                             <div> <label className={labelStyle}>Qty</label> <input type="number" placeholder="1" value={appliance.quantity} onChange={e => updateAppliance(appliance.id, 'quantity', e.target.value)} className={inputStyle + ' text-sm py-1.5'} min="1" required /> </div>
                                                             <div> <label className={labelStyle}>Hrs/Day</label> <input type="number" step="0.5" placeholder="Hours" value={appliance.hoursPerDay} onChange={e => updateAppliance(appliance.id, 'hoursPerDay', e.target.value)} className={inputStyle + ' text-sm py-1.5'} min="0" max="24" required /> </div>
                                                             <div className="flex items-end"> <button type="button" onClick={() => removeAppliance(appliance.id)} className={buttonDangerStyle + " text-xs px-2 py-1.5 w-full"}>Remove</button> </div>
                                                         </div>
                                                     </div>
                                                ))}
                                                <button type="button" onClick={addAppliance} className={buttonSecondaryStyle}> + Add Appliance </button>
                                             </div>
                                        )}
                                    </div>
                                 </fieldset>

                                <hr className="my-6 border-gray-200" />

                                {/* --- Configuration Grid --- */}
                                 <div className={gridStyle}>
                                     {/* Battery Section */}
                                     <fieldset className={fieldsetStyle}>
                                         <legend className={legendStyle}>Battery & Storage</legend>
                                         {systemType === 'on-grid' ? ( <p className="text-sm text-gray-500 italic pt-2">Batteries are typically not used in standard On-Grid systems (used for Hybrid/Off-Grid).</p> ) : (
                                             <div className="space-y-4">
                                                 <div className="grid grid-cols-2 gap-4">
                                                     <div className={formGroupStyle}> <label htmlFor="systemVoltage" className={labelStyle}>System Voltage*</label> <select id="systemVoltage" value={systemVoltage || ''} onChange={e => setSystemVoltage(Number(e.target.value))} className={selectStyle} required={systemType !== 'on-grid'}> <option value="" disabled>Select Voltage</option> {systemType === 'hybrid' && <option value="24">24 V</option>} <option value="48">48 V</option> {systemType === 'off-grid' && <option value="12">12 V</option>} {systemType === 'off-grid' && <option value="24">24 V</option>} </select> <span className="text-xs text-gray-500 mt-1 block">48V common for larger systems.</span> </div>
                                                     <div className={formGroupStyle}> <label htmlFor="dod" className={labelStyle}>Battery DoD*</label> <input id="dod" type="number" step="0.01" min="0.1" max="1.0" value={depthOfDischarge || ''} onChange={e => setDepthOfDischarge(e.target.value)} className={inputStyle} required={systemType !== 'on-grid'} placeholder="e.g. 0.85" /> <span className="text-xs text-gray-500 mt-1 block">{depthOfDischarge ? `Usable: ${(depthOfDischarge * 100).toFixed(0)}%` : 'e.g., 85% for LiFePO4'}</span> </div>
                                                  </div>
                                                 {systemType === 'off-grid' && ( <div className={formGroupStyle}> <label htmlFor="autonomyDays" className={labelStyle}>Days of Autonomy*</label> <input id="autonomyDays" type="number" step="0.1" min="0.5" value={autonomyDays || ''} onChange={e => setAutonomyDays(e.target.value)} className={inputStyle} required placeholder="e.g. 1.5" /> <span className="text-xs text-gray-500 mt-1 block">Days battery supports load without sun.</span> </div> )}
                                                 {systemType === 'hybrid' && ( <div className={formGroupStyle}> <label htmlFor="backupDurationHours" className={labelStyle}>Backup Duration (Hours)*</label> <input id="backupDurationHours" type="number" step="1" min="0" value={backupDurationHours || ''} onChange={e => setBackupDurationHours(e.target.value)} className={inputStyle} required placeholder="e.g., 6" /> <span className="text-xs text-gray-500 mt-1 block">Hours battery runs during grid outage.</span> </div> )}
                                             </div>
                                        )}
                                    </fieldset>

                                     {/* Panel Section */}
                                     <fieldset className={fieldsetStyle}>
                                        <legend className={legendStyle}>Panel Configuration</legend>
                                        <div className={formGroupStyle}> <label htmlFor="panelWattage" className={labelStyle}>Panel Wattage (Wp)*</label> <input id="panelWattage" type="number" step="5" min="50" max="1000" value={panelWattage} onChange={e => setPanelWattage(e.target.value)} className={inputStyle} required placeholder={`e.g., ${DEFAULT_PANEL_WATTAGE}`} /> </div>
                                         {/* Advanced Toggle */}
                                         <div className="mt-4 border-t pt-3">
                                             <button type="button" onClick={() => toggleSection(setShowAdvancedPanel, showAdvancedPanel)} className="text-sm text-indigo-600 hover:underline flex items-center w-full justify-between"> <span><CogIcon /> Advanced Panel Settings (Tilt/Azimuth/Shading)</span> {showAdvancedPanel ? <ChevronUpIcon /> : <ChevronDownIcon />} </button>
                                            {showAdvancedPanel && (
                                                 <div className="mt-3 space-y-3">
                                                     <div className="grid grid-cols-3 gap-3">
                                                        <div className={formGroupStyle + ' mb-0'}> <label htmlFor="tilt" className={labelStyle}>Tilt (°)</label> <input id="tilt" type="number" min="0" max="90" value={tilt} onChange={e => setTilt(e.target.value)} className={inputStyle + ' py-1.5'} /> </div>
                                                         <div className={formGroupStyle + ' mb-0'}> <label htmlFor="azimuth" className={labelStyle}>Azimuth (°)</label> <input id="azimuth" type="number" min="0" max="359" value={azimuth} onChange={e => setAzimuth(e.target.value)} className={inputStyle + ' py-1.5'} placeholder="180=S"/> </div>
                                                         <div className={formGroupStyle + ' mb-0'}> <label htmlFor="shading" className={labelStyle}>Shading (%)</label> <input id="shading" type="number" min="0" max="99" value={shading} onChange={e => setShading(e.target.value)} className={inputStyle + ' py-1.5'} /> </div>
                                                     </div>
                                                    <p className="text-xs text-gray-500">Defaults: Tilt={DEFAULT_TILT}°, Azimuth={DEFAULT_AZIMUTH}°(South), Shading=0%. Adjust for better accuracy if known.</p>
                                                 </div>
                                             )}
                                         </div>
                                    </fieldset>
                                </div>

                                {/* Budget */}
                                 <fieldset className={fieldsetStyle}>
                                     <legend className={legendStyle}>Optional Budget</legend>
                                    <div className={formGroupStyle}> <label htmlFor="budget" className={labelStyle}>Maximum Budget (KES) <span className="italic">(Optional)</span></label> <input id="budget" type="number" min="0" value={budget} onChange={e => setBudget(e.target.value)} className={inputStyle} placeholder="Leave blank if no budget limit" /> <span className="text-xs text-gray-500 mt-1 block">If set, the system size may be reduced to fit this budget.</span> </div>
                                 </fieldset>

                                {/* --- Action Button --- */}
                                <div className="mt-8 text-center">
                                     <button type="submit" className={buttonStyle + " px-8 py-3 text-lg font-semibold w-full sm:w-auto"} disabled={calculating}>
                                         <BoltIcon /> {calculating ? 'Calculating...' : 'Calculate Solar System'}
                                    </button>
                                    {/* Calculation Error Display */}
                                    {calculationError && ( <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md text-sm text-left whitespace-pre-line"> <div className="flex items-start"> <ExclamationIcon className="flex-shrink-0 mt-0.5"/> <span className='ml-2'><strong>Calculation Error:</strong><br />{calculationError}</span> </div> </div> )}
                                </div>
                            </div> {/* End Input Card */}
                        </form>
                     </div> {/* End Left Column */}


                    {/* == Right Column: Results & Info == */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Calculation Results Section */}
                         {calculationResult && (
                             <div id="results-section" className={resultCardStyle}>
                                 <h2 className={resultH2Style}>Solar System Results & Estimates</h2>
                                {/* Overview Block */}
                                <div className="mb-5 pb-3 border-b border-green-200"> <h3 className={resultH3Style}><InfoIcon /> Project Summary</h3> <p className="text-sm"><strong className="font-medium text-gray-700">Location:</strong> {calculationResult.location}</p> <p className="text-sm"><strong className="font-medium text-gray-700">System Type:</strong> {calculationResult.systemType?.replace('-', ' ')}</p> <p className="text-sm"><strong className="font-medium text-gray-700">Daily Need:</strong> {calculationResult.dailyEnergyConsumptionKwh?.toFixed(2)} kWh <span className="text-xs italic">({calculationResult.energyConsumptionSource})</span></p> </div>
                                {/* Core Components */}
                                <div className="mb-5 pb-3 border-b border-green-200"> <h3 className={resultH3Style}><SunIcon /> PV System</h3> <p className="text-sm"><strong>PV System Size:</strong> {calculationResult.pvSystem?.sizeKwP} kWp</p> <p className="text-sm"><strong>Panels:</strong> {calculationResult.pvSystem?.numberOfPanels} x {calculationResult.pvSystem?.panelWattage} Wp</p> <p className="text-sm"><strong>Inverter Size:</strong> {calculationResult.inverter?.sizeKva} kVA</p> <p className="text-sm"><strong>Est. Annual Production:</strong> {calculationResult.pvSystem?.estimatedAnnualProductionKwh?.toLocaleString()} kWh</p> </div>
                                 {/* Battery System */}
                                 {calculationResult.batterySystem && ( <div className="mb-5 pb-3 border-b border-green-200"> <h3 className={resultH3Style}><BatteryIcon /> Battery System ({calculationResult.systemType})</h3> <p className="text-sm"><strong>Actual Capacity:</strong> {calculationResult.batterySystem.actualCapacityKwh} kWh ({calculationResult.batterySystem.numberOfUnits} units)</p> <p className="text-sm"><strong>Usable Capacity:</strong> {calculationResult.batterySystem.targetCapacityKwh?.toFixed(2)} kWh ({calculationResult.batterySystem.depthOfDischarge * 100}%)</p> <p className="text-sm"><strong>Designed For:</strong> {calculationResult.batterySystem.requirementReason}</p> {calculationResult.chargeController && <p className="text-sm mt-1 pt-1 border-t border-dashed"><strong>Controller:</strong> {calculationResult.chargeController.estimatedAmps}A ({calculationResult.chargeController.type})</p>} </div> )}
                                {/* Financial Estimate */}
                                <div className="mb-5 pb-3 border-b border-green-200"> <h3 className={resultH3Style}><MoneyIcon /> Financial Estimates ({calculationResult.financial?.currency})</h3> <p className="text-lg font-semibold text-green-800"><strong>Total Estimated Cost:</strong> {calculationResult.financial?.estimatedTotalCost > 0 ? calculationResult.financial?.estimatedTotalCost?.toLocaleString() : 'N/A (Check inputs)'}</p> {calculationResult.financial?.budget?.constraintApplied && ( <p className="text-xs text-orange-600 mt-1">{calculationResult.financial.budget.scaledSystemNote}</p> )} <p className="text-sm"><strong>Estimated Annual Savings:</strong> {calculationResult.financial?.estimatedAnnualSavings > 0 ? calculationResult.financial?.estimatedAnnualSavings?.toLocaleString() + ' KES' : 'N/A'}</p> <p className="text-sm"><strong>Simple Payback Period:</strong> {calculationResult.financial?.simplePaybackYears ? `${calculationResult.financial.simplePaybackYears} years` : 'N/A'}</p> <p className="text-xs italic text-gray-500 mt-2">{calculationResult.financial?.pricingNote}</p> </div>
                                {/* Charts Container */}
                                <div className="grid grid-cols-1 gap-6 mb-5 pb-3 border-b border-green-200">
                                     {/* Monthly Production Chart */}
                                     {calculationResult.productionAnalysis?.monthlyProductionKwh?.length > 0 && ( <div className="h-64"> <h4 className="text-sm font-medium text-center mb-2">Estimated Monthly Production</h4> <Bar data={{ labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], datasets: [{ label: 'Monthly Production (kWh)', data: calculationResult.productionAnalysis.monthlyProductionKwh.sort((a,b) => a.month - b.month).map(m => m.production?.toFixed(0)), backgroundColor: 'rgba(34, 197, 94, 0.6)', borderColor: 'rgba(22, 163, 74, 1)', borderWidth: 1 }] }} options={chartOptions('Energy (kWh)')} /> </div> )}
                                     {/* Cost Breakdown Chart */}
                                    {calculationResult.financial?.costBreakdown && calculateChartableCosts(calculationResult.financial.costBreakdown).datasets[0]?.data.length > 0 && ( <div className="h-60"> <h4 className="text-sm font-medium text-center mb-2">Estimated Cost Breakdown</h4> <Pie data={calculateChartableCosts(calculationResult.financial.costBreakdown)} options={pieChartOptions} /> </div> )}
                                </div>
                                 {/* Action Buttons */}
                                 <div className="mt-6 flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-4">
                                    {isLoggedIn && ( <button onClick={saveCalculation} className={buttonSecondaryStyle + " w-full sm:w-auto"} disabled={!calculationInputParams /* Add || calculating ? if needed */}> {authMessage.includes('Saving') ? 'Saving...' : 'Save Calculation'} </button> )}
                                    <button id="pdfButton" onClick={handleGeneratePDF} className={buttonStyle + " w-full sm:w-auto"}> Generate PDF Report </button>
                                 </div>
                                {/* Assumptions */}
                                <div className="mt-6 text-xs text-gray-500 border-t pt-3"> <details> <summary className="cursor-pointer hover:text-indigo-600 font-medium">View Key Assumptions</summary> <ul className="list-disc list-inside mt-2 space-y-1 pl-2"> {Object.entries(calculationResult.assumptions || {}).filter(([key,value]) => value !== null && value !== undefined).map(([key, value]) => ( <li key={key}><strong className="font-medium">{formatAssumptionLabel(key)}:</strong> {value.toString()}</li> ))} </ul> </details> </div>
                             </div>
                        )} {/* End Calculation Result Card */}

                        {/* Educational Content Section */}
                         <div className={cardStyle}>
                            <h3 className="text-lg font-semibold text-indigo-800 mb-3 cursor-pointer flex justify-between items-center" onClick={() => toggleSection(setShowEduSection, showEduSection)}> Solar Basics Explained {showEduSection ? <ChevronUpIcon /> : <ChevronDownIcon />} </h3>
                             {showEduSection && (
                                <div className="prose prose-sm max-w-none text-gray-600 space-y-3 mt-4 border-t pt-3">
                                    <details> <summary className="font-medium cursor-pointer hover:text-indigo-700">What is kWp (Kilowatt Peak)?</summary> <p>Kilowatt Peak (kWp) is the standard measure of a solar panel's maximum power output under ideal test conditions (strong sunlight, specific temperature). It helps compare panels.</p> </details>
                                     <details> <summary className="font-medium cursor-pointer hover:text-indigo-700">What is kWh (Kilowatt Hour)?</summary> <p>Kilowatt Hour (kWh) is a unit of energy, representing the amount of electricity consumed or generated. It's what your utility bill measures (often called 'units'). 1 kWh is using 1000 Watts for 1 hour.</p> </details>
                                     <details> <summary className="font-medium cursor-pointer hover:text-indigo-700">Solar System Types?</summary> <p><strong>On-Grid:</strong> Connected to the KPLC grid. Uses solar when available, grid otherwise. Can potentially export excess power (net-metering dependent).</p> <p><strong>Off-Grid:</strong> Fully independent from the grid. Requires batteries to store energy for night time and cloudy days.</p><p><strong>Hybrid:</strong> Connected to the grid BUT also has batteries. Can use solar, grid, or battery power. Provides backup during grid outages and can potentially save more by optimising energy use (e.g., using stored solar at peak times).</p></details>
                                     <details> <summary className="font-medium cursor-pointer hover:text-indigo-700">Battery Depth of Discharge (DoD)?</summary> <p>DoD is the percentage of a battery's total capacity that is used. A higher DoD means you use more stored energy, but can shorten battery life. LiFePO4 batteries typically handle high DoD (80-95%) well.</p></details>
                                     <details> <summary className="font-medium cursor-pointer hover:text-indigo-700">How are prices estimated?</summary> <p>Prices shown are <strong>simulated estimates</strong> based on typical retail ranges observed in the Kenyan market from major distributors (like Davis & Shirtliff, Chloride Exide, etc.) and installers. They are NOT real-time quotes and can vary significantly based on specific brands, installation complexity, location, and current promotions. Use them as a general guideline.</p></details>
                                 </div>
                            )}
                        </div> {/* End Educational Card */}

                         {/* Footer */}
                         <footer className="mt-6 text-center text-xs text-gray-500 border-t pt-4">
                             <p>SolarFit Calculator © {new Date().getFullYear()}</p>
                            <p>This tool provides estimates. Actual performance and costs depend on site conditions, equipment chosen, and installation quality. Always consult a qualified solar professional for a detailed quote.</p>
                         </footer>
                     </div> {/* End Right Column */}
                </div> {/* End Main Content Grid */}
            </div> {/* End Max Width Container */}
        </div> // End Root Container
    );
}

// Export the component
export default HomePage;


// --- Helper Functions for Frontend ---

// Chart Options (shared styles)
const chartOptions = (yAxisLabel = 'Value') => ({
    responsive: true,
    maintainAspectRatio: false, // Important for defining height via container
    scales: {
        y: { beginAtZero: true, title: { display: true, text: yAxisLabel, font: { size: 10 } }, ticks: { font: { size: 9 } } },
        x: { ticks: { font: { size: 9 } } }
    },
    plugins: {
        legend: { display: false }, // Generally better to hide for single dataset bar/pie
        tooltip: { bodyFont: { size: 10 }, titleFont: { size: 12 } }
    }
});

// Pie Chart Specific Options & Tooltip Formatting
const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            position: 'bottom', // Improved position
            labels: { font: { size: 10 }, boxWidth: 15, padding: 10 }
        },
        tooltip: {
            callbacks: {
                label: function(context) { // Custom tooltip label
                    let label = context.label || '';
                    if (label) { label += ': '; }
                    let value = context.raw || 0;
                    let sum = context.dataset.data.reduce((a, b) => a + b, 0);
                    let percentage = sum > 0 ? ((value / sum) * 100).toFixed(1) + '%' : '0%';
                    // Format value as currency
                    return `${label} ${value.toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 })} (${percentage})`;
                }
            }
        }
    }
};

// Prepare Data for the Pie Chart
const calculateChartableCosts = (costBreakdown) => {
    const labels = [ 'Panels', 'Inverter', 'Batteries', 'Controller', 'Mounting', 'Installation' ];
    const costs = [ costBreakdown?.panels || 0, costBreakdown?.inverter || 0, costBreakdown?.batteries || 0, costBreakdown?.chargeController || 0, costBreakdown?.mounting || 0, costBreakdown?.installation || 0 ];
    const backgroundColors = ['#4f46e5', '#10b981', '#f59e0b', '#3b82f6', '#6366f1', '#f97316']; // Indigo, Green, Amber, Blue, Violet, Orange

    const filteredLabels = []; const filteredData = []; const filteredColors = [];
    costs.forEach((cost, index) => {
        if (cost > 0) { // Only include components with a cost > 0
            filteredLabels.push(labels[index]);
            filteredData.push(cost);
            filteredColors.push(backgroundColors[index % backgroundColors.length]);
        }
    });
    return {
        labels: filteredLabels,
        datasets: [{
            label: 'Cost Breakdown (KES)', // Dataset label
            data: filteredData,
            backgroundColor: filteredColors,
            hoverOffset: 8, // Slightly more hover effect
            borderColor: '#ffffff', // White border between slices
            borderWidth: 1
        }]
    };
};

 // Format Assumption Labels for Display
const formatAssumptionLabel = (key) => {
    // Converts camelCase or snake_case to Title Case
     const formatted = key
        .replace(/([A-Z])/g, ' $1') // Add space before capitals
        .replace(/_/g, ' ') // Replace underscores with space
        .replace(/^./, (str) => str.toUpperCase()) // Capitalize first letter
        // Specific replacements for acronyms or terms
         .replace('Pvgis', 'PVGIS')
        .replace('Do D', 'DoD')
         .replace('Kwh', 'kWh')
        .replace('Kwp', 'kWp')
        .replace('Lat Lon','Latitude/Longitude');
     return formatted;
};