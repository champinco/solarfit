import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import Tesseract from 'tesseract.js';
import dynamic from 'next/dynamic';
import 'chart.js/auto';

// Dynamically import the Bar component, disabling SSR
const Bar = dynamic(() => import('react-chartjs-2').then((mod) => mod.Bar), { ssr: false });

function HomePage() {
    // Auth State
    const [token, setToken] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // OCR State
    const [uploading, setUploading] = useState(false);
    const [ocrProgress, setOcrProgress] = useState(0);
    const [ocrText, setOcrText] = useState('');
    const [extractedData, setExtractedData] = useState(null);
    const [lastUploadFilename, setLastUploadFilename] = useState('');

    // Input Parameter State
    const [location, setLocation] = useState('');
    const [systemType, setSystemType] = useState('on-grid');
    const [roofArea, setRoofArea] = useState('');
    const [roofType, setRoofType] = useState('iron-sheets');
    const [avgMonthlyKwh, setAvgMonthlyKwh] = useState('');
    const [avgMonthlyBill, setAvgMonthlyBill] = useState('');
    const [electricityPricePerKwh, setElectricityPricePerKwh] = useState('');
    const [userType, setUserType] = useState('residential');
    const [autonomyDays, setAutonomyDays] = useState(1);
    const [depthOfDischarge, setDepthOfDischarge] = useState(0.8);
    const [budget, setBudget] = useState('');
    const [appliances, setAppliances] = useState([]);
    const [applianceCategories, setApplianceCategories] = useState({
        residential: [],
        commercial: [],
        industrial: [],
    });
    const [tilt, setTilt] = useState(15);
    const [azimuth, setAzimuth] = useState(180);
    const [shading, setShading] = useState(0);
    const [panelWattage, setPanelWattage] = useState(450);

    // Calculation Result State
    const [calculationResult, setCalculationResult] = useState(null);
    const [calculating, setCalculating] = useState(false);
    const [calculationError, setCalculationError] = useState('');
    const [calculationInputParams, setCalculationInputParams] = useState(null);

    // Backend URL
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const storedToken = localStorage.getItem('token') || '';
            setToken(storedToken);
            setIsLoggedIn(!!storedToken);
        }
        const fetchAppliances = async () => {
            try {
                const response = await axios.get(`${backendUrl}/api/appliances`);
                if (response.data && typeof response.data === 'object') {
                    setApplianceCategories(response.data);
                } else {
                    console.error('Invalid appliance data format:', response.data);
                }
            } catch (error) {
                console.error('Failed to fetch appliance list:', error);
            }
        };
        fetchAppliances();
    }, [backendUrl]);

    // OCR Extraction Function
    const extractField = (text, labels, pattern = null) => {
        if (!text) return null;
        
        const lines = text.split('\n').map((line) => line.trim()).filter((line) => line);
        for (const label of labels) {
            for (const line of lines) {
                const labelRegex = new RegExp(label + '\\s*[:\\-]?\\s*', 'i');
                const match = line.match(labelRegex);
                if (match) {
                    const afterLabel = line.substring(match.index + match[0].length).trim();
                    if (pattern) {
                        const valueMatch = afterLabel.match(pattern);
                        if (valueMatch) return valueMatch[0];
                    } else {
                        return afterLabel;
                    }
                }
            }
        }
        return null;
    };

    const onDropAccepted = useCallback(
        async (acceptedFiles) => {
            if (uploading || !acceptedFiles || acceptedFiles.length === 0) return;
            
            const file = acceptedFiles[0];
            setUploading(true);
            setOcrProgress(0);
            setOcrText('');
            setExtractedData(null);
            setCalculationResult(null);
            setCalculationError('');
            setLastUploadFilename(file.name);

            try {
                const {
                    data: { text },
                } = await Tesseract.recognize(file, 'eng', {
                    logger: (m) => {
                        if (m.status === 'recognizing text') {
                            setOcrProgress(Math.round(m.progress * 100));
                        }
                    },
                });
                console.log('OCR Raw Text:', text);
                setOcrText(text);

                const dateLabels = ['Issue Date', 'Bill Date', 'Date', 'Statement Date'];
                const nameLabels = ['Customer Name', 'Account Name', 'Name', 'Billing Name'];
                const locationLabels = ['Service Address', 'Location', 'Supply Location', 'Address'];
                const consumptionLabels = ['Total Consumption', 'Consumption', 'Units Consumed', 'Energy Used', 'High Rate'];
                const amountLabels = ['Total Amount Due', 'Amount Payable', 'Total Bill', 'Balance', 'TOTAL AMOUNT PAYABLE'];

                const datePattern =
                    /\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}|\d{2}\s*\/\s*\d{2}\s*\/\s*\d{4}/i;
                const consumptionPattern = /\d{1,6}(?:,\d{3})*(?:\.\d+)?\s*(kWh|KWH|kw\s*h|units)/i;
                const amountPattern = /(?:KES|Ksh)?\s*\d{1,3}(?:,\d{3})*(?:\.\d+)?/i;

                const issueDate = extractField(text, dateLabels, datePattern);
                const customerName = extractField(text, nameLabels);
                const billLocation = extractField(text, locationLabels);
                
                // Try to extract consumption with pattern first
                let consumptionStr = extractField(text, consumptionLabels, consumptionPattern);
                let consumptionKwh = null;
                
                // If pattern matching fails, try to find numbers near consumption labels
                if (!consumptionStr) {
                    for (const label of consumptionLabels) {
                        const regex = new RegExp(`${label}\\s*[:\\-]?\\s*(\\d{1,6}(?:,\\d{3})*(?:\\.\\d+)?)`, 'i');
                        const match = text.match(regex);
                        if (match && match[1]) {
                            consumptionStr = match[1];
                            break;
                        }
                    }
                }
                
                // Parse the consumption value if found
                if (consumptionStr) {
                    // Extract just the numeric part
                    const numericMatch = consumptionStr.match(/\d{1,6}(?:,\d{3})*(?:\.\d+)?/);
                    if (numericMatch) {
                        consumptionKwh = parseFloat(numericMatch[0].replace(/,/g, ''));
                    }
                }
                
                // Try to extract amount with pattern first
                let amountStr = extractField(text, amountLabels, amountPattern);
                let totalAmount = null;
                
                // If pattern matching fails, try to find numbers near amount labels
                if (!amountStr) {
                    for (const label of amountLabels) {
                        const regex = new RegExp(`${label}\\s*[:\\-]?\\s*((?:KES|Ksh)?\\s*\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?)`, 'i');
                        const match = text.match(regex);
                        if (match && match[1]) {
                            amountStr = match[1];
                            break;
                        }
                    }
                }
                
                // Parse the amount value if found
                if (amountStr) {
                    // Extract just the numeric part
                    const numericMatch = amountStr.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/);
                    if (numericMatch) {
                        totalAmount = parseFloat(numericMatch[0].replace(/,/g, ''));
                    }
                }

                const extracted = {
                    issueDate,
                    customerName,
                    billLocation,
                    consumptionKwh,
                    totalAmount,
                };
                setExtractedData(extracted);
                console.log('Extracted Data:', extracted);

                if (!location && billLocation) setLocation(`${billLocation}, Kenya`);
                if (!avgMonthlyKwh && consumptionKwh) setAvgMonthlyKwh(consumptionKwh.toString());
                if (!avgMonthlyBill && totalAmount) setAvgMonthlyBill(totalAmount.toString());
                if (!electricityPricePerKwh) setElectricityPricePerKwh('22'); // Default value for Kenya
            } catch (error) {
                console.error('OCR error:', error);
                alert('Failed to process the bill image.');
                setCalculationError('OCR failed. Please enter usage manually.');
            } finally {
                setUploading(false);
                setOcrProgress(100);
            }
        },
        [uploading, location, avgMonthlyKwh, avgMonthlyBill]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpeg', '.jpg'] },
        maxFiles: 1,
        onDropAccepted,
        onDropRejected: (rejectedFiles) => alert(rejectedFiles[0]?.errors[0]?.message || 'File type not accepted.'),
        disabled: uploading,
    });

    // Appliance Management
    const addAppliance = () => {
        const applianceOptions = applianceCategories[userType] || [];
        if (applianceOptions.length === 0 && userType) {
            alert(`Appliance list for ${userType} is empty or not loaded.`);
            return;
        }
        setAppliances([...appliances, { name: 'custom', customName: '', power: 0, quantity: 1, hoursPerDay: 1 }]);
    };

    const updateAppliance = (index, field, value) => {
        let parsedValue = value;
        if (field === 'power' || field === 'quantity' || field === 'hoursPerDay') {
            parsedValue = parseInt(value, 10);
            if (isNaN(parsedValue) || parsedValue < (field === 'power' ? 0 : 1)) {
                parsedValue = field === 'power' ? 0 : 1;
            }
        }
        if (field === 'hoursPerDay' && parsedValue > 24) parsedValue = 24;

        const updatedAppliances = appliances.map((appliance, i) => {
            if (i === index) {
                const updatedAppliance = { ...appliance, [field]: parsedValue };
                if (field === 'name' && value !== 'custom') {
                    const selectedAppliance = (applianceCategories[userType] || []).find((a) => a.name === value);
                    if (selectedAppliance) {
                        updatedAppliance.power = selectedAppliance.power;
                        updatedAppliance.customName = '';
                    }
                }
                return updatedAppliance;
            }
            return appliance;
        });
        setAppliances(updatedAppliances);
    };

    const removeAppliance = (index) => setAppliances(appliances.filter((_, i) => i !== index));

    const calculateDailyApplianceKwh = () => {
        return appliances.reduce((sum, app) => {
            const powerW = app.power || 0;
            const quantity = app.quantity || 1;
            const hours = app.hoursPerDay || 0;
            return sum + (powerW / 1000) * quantity * hours;
        }, 0);
    };

    // Auth Handlers
    const handleSignup = async () => {
        if (!username || !password) {
            alert('Please enter both username and password');
            return;
        }
        
        try {
            await axios.post(`${backendUrl}/api/signup`, { username, password });
            alert('Signup successful! Please log in.');
            setUsername('');
            setPassword('');
        } catch (error) {
            console.error('Signup failed:', error.response || error);
            alert(`Signup failed: ${error.response?.data?.message || error.message}`);
        }
    };

    const handleLogin = async () => {
        if (!username || !password) {
            alert('Please enter both username and password');
            return;
        }
        
        try {
            const response = await axios.post(`${backendUrl}/api/login`, { username, password });
            const { token } = response.data;
            setToken(token);
            localStorage.setItem('token', token);
            setIsLoggedIn(true);
            setUsername('');
            setPassword('');
        } catch (error) {
            console.error('Login failed:', error.response || error);
            alert(`Login failed: ${error.response?.data?.message || error.message}`);
        }
    };

    const handleLogout = () => {
        setToken('');
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        setCalculationResult(null);
        setUsername('');
        setPassword('');
    };

    // Calculation & Results
    const handleCalculateClick = async () => {
        setCalculating(true);
        setCalculationResult(null);
        setCalculationError('');
        setCalculationInputParams(null);

        // Validate required fields
        if (!location) {
            setCalculationError('Project Location is required.');
            setCalculating(false);
            return;
        }
        
        // Validate energy information is provided
        const energyProvided = avgMonthlyKwh || avgMonthlyBill || appliances.length > 0;
        if (!energyProvided) {
            setCalculationError('Please provide energy usage: Avg. Monthly kWh, Avg. Monthly Bill, or appliances.');
            setCalculating(false);
            return;
        }
        
        // Validate off-grid/hybrid system parameters
        if (systemType !== 'on-grid' && (!autonomyDays || autonomyDays < 1)) {
            setCalculationError('Autonomy days (>= 1) are required for off-grid/hybrid systems.');
            setCalculating(false);
            return;
        }
        if (systemType !== 'on-grid' && (!depthOfDischarge || depthOfDischarge <= 0 || depthOfDischarge > 1)) {
            setCalculationError('Valid Battery Depth of Discharge (e.g., 0.8 for 80%) is required.');
            setCalculating(false);
            return;
        }
        
        // Validate panel wattage
        if (!panelWattage || panelWattage <= 0 || panelWattage > 1000) {
            setCalculationError('Panel wattage must be between 1 and 1000 Wp.');
            setCalculating(false);
            return;
        }

        // Prepare calculation parameters
        const sizingParameters = {
            location,
            systemType,
            roofArea: roofArea ? parseFloat(roofArea) : null,
            roofType,
            avgMonthlyKwh: avgMonthlyKwh ? parseFloat(avgMonthlyKwh) : null,
            avgMonthlyBill: avgMonthlyBill ? parseFloat(avgMonthlyBill) : null,
            electricityPricePerKwh: electricityPricePerKwh ? parseFloat(electricityPricePerKwh) : null,
            userType,
            autonomyDays: systemType !== 'on-grid' ? parseInt(autonomyDays) || 1 : null,
            depthOfDischarge: systemType !== 'on-grid' ? parseFloat(depthOfDischarge) || 0.8 : null,
            budget: budget ? parseFloat(budget) : null,
            appliances:
                appliances.length > 0
                    ? appliances.map((a) => ({
                          name: a.customName || a.name,
                          power: a.power || 0,
                          quantity: a.quantity || 1,
                          hoursPerDay: a.hoursPerDay || 0,
                      }))
                    : null,
            tilt: parseFloat(tilt) || 0,
            azimuth: parseFloat(azimuth) || 180,
            shading: parseFloat(shading) || 0,
            panelWattage: parseInt(panelWattage) || 450,
        };

        setCalculationInputParams(sizingParameters);

        try {
            console.log('Sending calculation request:', JSON.stringify(sizingParameters, null, 2));
            const response = await axios.post(`${backendUrl}/api/calculate`, sizingParameters, {
                timeout: 30000 // 30 second timeout for calculation
            });
            console.log('Calculation response:', response.data);
            setCalculationResult(response.data);
        } catch (error) {
            console.error('Calculation API error:', error.response || error);
            let errorMessage = 'Calculation failed: ';
            
            if (error.response && error.response.data && error.response.data.message) {
                errorMessage += error.response.data.message;
            } else if (error.message) {
                errorMessage += error.message;
            } else {
                errorMessage += 'Unknown error occurred.';
            }
            
            setCalculationError(errorMessage);
        } finally {
            setCalculating(false);
        }
    };

    const saveCalculation = async () => {
        if (!calculationResult || !isLoggedIn || !calculationInputParams) {
            alert('Cannot save: No calculation result, not logged in, or input parameters missing.');
            return;
        }
        try {
            const payload = {
                calculationParams: calculationInputParams,
                resultData: calculationResult,
            };
            await axios.post(`${backendUrl}/api/save-calculation`, payload, {
                headers: { Authorization: `Bearer ${token}` },
            });
            alert('Calculation saved successfully!');
        } catch (error) {
            console.error('Save calculation failed:', error.response || error);
            alert(`Save failed: ${error.response?.data?.message || 'Please try again.'}`);
        }
    };

    const handleGeneratePDF = async () => {
        if (!calculationResult) {
            alert('Please perform a calculation first.');
            return;
        }
        try {
            const response = await axios.post(`${backendUrl}/api/generate-pdf`, calculationResult, {
                responseType: 'blob',
                headers: { Accept: 'application/pdf' },
                timeout: 30000 // 30 second timeout for PDF generation
            });
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            const filename = `SolarReport_${calculationResult.location?.replace(/\s+/g, '_') || 'Details'}.pdf`;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('PDF generation failed:', error.response || error);
            let errorMsg = 'PDF generation failed.';
            if (error.response && error.response.data instanceof Blob && error.response.data.type === 'application/json') {
                try {
                    const errJson = JSON.parse(await error.response.data.text());
                    errorMsg = `PDF generation failed: ${errJson.message || 'Server error'}`;
                } catch (parseError) {
                    errorMsg = 'PDF generation failed: Unable to parse error response.';
                }
            } else if (error.response?.data?.message) {
                errorMsg = `PDF generation failed: ${error.response.data.message}`;
            }
            alert(errorMsg);
        }
    };

    // Styles
    const pageStyle = {
        maxWidth: '900px',
        margin: '20px auto',
        padding: '20px 40px',
        fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        background: '#f9f9f9',
        border: '1px solid #ddd',
        borderRadius: '8px',
        boxShadow: '0 2px 5px rgba(0,0,0,0.1)',
    };
    const sectionStyle = { marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #eee' };
    const formGroupStyle = { display: 'flex', flexDirection: 'column', marginBottom: '18px' };
    const labelStyle = { marginBottom: '6px', fontWeight: '600', fontSize: '0.9em', color: '#333' };
    const inputStyle = {
        padding: '10px 12px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        fontSize: '1em',
        width: '100%',
        boxSizing: 'border-box',
    };
    const selectStyle = {
        padding: '10px 12px',
        border: '1px solid #ccc',
        borderRadius: '4px',
        fontSize: '1em',
        width: '100%',
        boxSizing: 'border-box',
        background: '#fff',
    };
    const buttonStyle = {
        padding: '10px 18px',
        backgroundColor: '#007bff',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '1em',
        transition: 'background-color 0.2s ease',
    };
    const buttonDisabledStyle = { ...buttonStyle, backgroundColor: '#ccc', cursor: 'not-allowed' };
    const buttonSecondaryStyle = { ...buttonStyle, backgroundColor: '#6c757d' };
    const buttonDangerStyle = { ...buttonStyle, backgroundColor: '#dc3545' };
    const removeButtonStyle = {
        padding: '5px 10px',
        backgroundColor: '#dc3545',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '0.8em',
        marginLeft: 'auto',
    };
    const dropzoneBaseStyle = {
        border: `2px dashed #ccc`,
        padding: '30px',
        textAlign: 'center',
        cursor: 'pointer',
        backgroundColor: '#fff',
        marginBottom: '20px',
        borderRadius: '4px',
    };
    const dropzoneActiveStyle = { borderColor: '#2196f3', backgroundColor: '#f0f8ff' };
    const dropzoneDisabledStyle = { cursor: 'not-allowed', backgroundColor: '#eee' };
    const getDropzoneStyle = useCallback(
        () => ({
            ...dropzoneBaseStyle,
            ...(isDragActive ? dropzoneActiveStyle : {}),
            ...(uploading ? dropzoneDisabledStyle : {}),
        }),
        [isDragActive, uploading]
    );
    const h2Style = {
        textAlign: 'center',
        color: '#0056b3',
        marginBottom: '30px',
        borderBottom: '2px solid #0056b3',
        paddingBottom: '10px',
    };
    const h3Style = { color: '#0056b3', marginBottom: '15px', marginTop: '25px' };
    const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px 30px' };
    const fullWidthStyle = { gridColumn: '1 / -1' };
    const resultBoxStyle = {
        padding: '25px',
        backgroundColor: '#f0fff4',
        border: '1px solid #b8ddc4',
        borderRadius: '8px',
        marginTop: '20px',
    };
    const errorStyle = {
        color: 'red',
        fontWeight: 'bold',
        marginTop: '10px',
        padding: '10px',
        border: '1px solid red',
        borderRadius: '4px',
        background: '#ffeeee',
    };
    const ocrResultStyle = {
        padding: '15px',
        border: '1px solid #e0e0e0',
        backgroundColor: '#fdfdfd',
        marginTop: '15px',
        borderRadius: '4px',
    };
    const fieldsetBorderStyle = { border: '1px solid #ccc', padding: '20px', borderRadius: '5px', marginBottom: '20px' };
    const legendStyle = { fontWeight: 'bold', color: '#0056b3', padding: '0 10px' };

    return (
        <div style={pageStyle}>
            <h1>Solar System Sizing Calculator</h1>

            {/* Login/Signup Section */}
            <section>
                {!isLoggedIn ? (
                    <div>
                        <h2 style={h2Style}>Login / Signup</h2>
                        <div style={gridStyle}>
                            <div style={formGroupStyle}>
                                <label style={labelStyle} htmlFor="username">
                                    Username:
                                </label>
                                <input
                                    id="username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>
                            <div style={formGroupStyle}>
                                <label style={labelStyle} htmlFor="password">
                                    Password:
                                </label>
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    style={inputStyle}
                                />
                            </div>
                        </div>
                        <div style={{ marginTop: '10px' }}>
                            <button
                                onClick={handleSignup}
                                style={{ ...buttonSecondaryStyle, marginRight: '10px' }}
                            >
                                Signup
                            </button>
                            <button onClick={handleLogin} style={buttonStyle}>
                                Login
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '20px',
                            }}
                        >
                            <h2
                                style={{
                                    ...h2Style,
                                    textAlign: 'left',
                                    marginBottom: 0,
                                    borderBottom: 'none',
                                    paddingBottom: 0,
                                }}
                            >
                                Welcome!
                            </h2>
                            <button onClick={handleLogout} style={buttonDangerStyle}>
                                Logout
                            </button>
                        </div>
                    </div>
                )}
            </section>

            {/* OCR Bill Upload Section */}
            <section style={sectionStyle}>
                <h2 style={h2Style}>1. Upload Bill (Optional) or Enter Usage Manually</h2>
                <div {...getRootProps()} style={getDropzoneStyle()}>
                    <input {...getInputProps()} />
                    {uploading ? (
                        <p>Processing... {ocrProgress}%</p>
                    ) : isDragActive ? (
                        <p>Drop the bill image here ...</p>
                    ) : (
                        <p>Drag & drop bill image (PNG/JPG) here, or click to select file</p>
                    )}
                </div>
                {lastUploadFilename && (
                    <p style={{ fontSize: '0.9em', color: '#555' }}>
                        Last file: <strong>{lastUploadFilename}</strong>
                    </p>
                )}
                {extractedData && (
                    <div style={ocrResultStyle}>
                        <h3 style={{ ...h3Style, marginTop: 0 }}>OCR Results (Verify & Correct):</h3>
                        <p>
                            <strong>Issue Date:</strong> {extractedData.issueDate || 'Not Found'}
                        </p>
                        <p>
                            <strong>Customer Name:</strong> {extractedData.customerName || 'Not Found'}
                        </p>
                        <p>
                            <strong>Location:</strong> {extractedData.billLocation || 'Not Found'}
                        </p>
                        <div style={formGroupStyle}>
                            <label style={labelStyle}>Detected Avg. Monthly kWh:</label>
                            <input
                                type="number"
                                style={inputStyle}
                                value={avgMonthlyKwh}
                                onChange={(e) => setAvgMonthlyKwh(e.target.value)}
                                placeholder="Enter kWh if not found/incorrect"
                            />
                        </div>
                        <div style={formGroupStyle}>
                            <label style={labelStyle}>Detected Avg. Monthly Bill (KES):</label>
                            <input
                                type="number"
                                style={inputStyle}
                                value={avgMonthlyBill}
                                onChange={(e) => setAvgMonthlyBill(e.target.value)}
                                placeholder="Enter Bill Amount if not found/incorrect"
                            />
                        </div>
                        <p style={{ fontSize: '0.8em', color: 'gray', marginTop: '10px' }}>
                            You can also fill/override these values manually below.
                        </p>
                    </div>
                )}
            </section>

            {/* Manual Sizing Details Section */}
            <section style={sectionStyle}>
                <h2 style={h2Style}>2. Enter Project Details & Energy Needs</h2>
                <div style={gridStyle}>
                    <fieldset style={fieldsetBorderStyle}>
                        <legend style={legendStyle}>Location & System</legend>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="location">
                                Project Location:*
                            </label>
                            <input
                                id="location"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                style={inputStyle}
                                placeholder="e.g., Nairobi, Kenya"
                                required
                            />
                        </div>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="systemType">
                                System Type:*
                            </label>
                            <select
                                id="systemType"
                                value={systemType}
                                onChange={(e) => setSystemType(e.target.value)}
                                style={selectStyle}
                                required
                            >
                                <option value="on-grid">On-Grid</option>
                                <option value="off-grid">Off-Grid</option>
                                <option value="hybrid">Hybrid</option>
                            </select>
                        </div>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="userType">
                                User Type:*
                            </label>
                            <select
                                id="userType"
                                value={userType}
                                onChange={(e) => {
                                    setUserType(e.target.value);
                                    setAppliances([]);
                                }}
                                style={selectStyle}
                                required
                            >
                                <option value="residential">Residential</option>
                                <option value="commercial">Commercial</option>
                                <option value="industrial">Industrial</option>
                            </select>
                        </div>
                    </fieldset>
                    <fieldset style={fieldsetBorderStyle}>
                        <legend style={legendStyle}>Energy Consumption*</legend>
                        <p style={{ fontSize: '0.85em', color: '#555', marginBottom: '15px' }}>
                            Enter details below OR list appliances.
                        </p>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="avgMonthlyKwh">
                                Avg. Monthly kWh:
                            </label>
                            <input
                                id="avgMonthlyKwh"
                                type="number"
                                value={avgMonthlyKwh}
                                onChange={(e) => setAvgMonthlyKwh(e.target.value)}
                                style={inputStyle}
                                placeholder="From bill or estimate"
                            />
                        </div>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="avgMonthlyBill">
                                Avg. Monthly Bill (KES):
                            </label>
                            <input
                                id="avgMonthlyBill"
                                type="number"
                                value={avgMonthlyBill}
                                onChange={(e) => setAvgMonthlyBill(e.target.value)}
                                style={inputStyle}
                                placeholder="From bill or estimate"
                            />
                        </div>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="electricityPrice">
                                Current Electricity Price (KES/kWh):*
                            </label>
                            <input
                                id="electricityPrice"
                                type="number"
                                step="0.1"
                                value={electricityPricePerKwh}
                                onChange={(e) => setElectricityPricePerKwh(e.target.value)}
                                style={inputStyle}
                                placeholder="e.g., 25.5"
                                required
                            />
                            <small style={{ fontSize: '0.8em', color: '#666', marginTop: '3px' }}>
                                Needed for payback calculation.
                            </small>
                        </div>
                    </fieldset>
                    {systemType !== 'on-grid' && (
                        <fieldset style={fieldsetBorderStyle}>
                            <legend style={legendStyle}>Battery Details</legend>
                            <div style={formGroupStyle}>
                                <label style={labelStyle} htmlFor="autonomyDays">
                                    Days of Autonomy:*
                                </label>
                                <input
                                    id="autonomyDays"
                                    type="number"
                                    value={autonomyDays}
                                    onChange={(e) => setAutonomyDays(e.target.value)}
                                    style={inputStyle}
                                    min="1"
                                    required
                                />
                                <small style={{ fontSize: '0.8em', color: '#666', marginTop: '3px' }}>
                                    Days battery lasts without sun.
                                </small>
                            </div>
                            <div style={formGroupStyle}>
                                <label style={labelStyle} htmlFor="dod">
                                    Battery Depth of Discharge (DoD):*
                                </label>
                                <input
                                    id="dod"
                                    type="number"
                                    step="0.05"
                                    min="0.1"
                                    max="1.0"
                                    value={depthOfDischarge}
                                    onChange={(e) => setDepthOfDischarge(e.target.value)}
                                    style={inputStyle}
                                    required
                                />
                                <small style={{ fontSize: '0.8em', color: '#666', marginTop: '3px' }}>
                                    e.g., 0.8 for 80% DoD
                                </small>
                            </div>
                        </fieldset>
                    )}
                    <fieldset style={fieldsetBorderStyle}>
                        <legend style={legendStyle}>Panel Configuration</legend>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="panelWattage">
                                Panel Wattage (Wp):*
                            </label>
                            <input
                                id="panelWattage"
                                type="number"
                                value={panelWattage}
                                onChange={(e) => setPanelWattage(e.target.value)}
                                style={inputStyle}
                                min="100"
                                step="5"
                                placeholder="e.g., 450"
                                required
                            />
                            <small style={{ fontSize: '0.8em', color: '#666', marginTop: '3px' }}>
                                Wattage of individual panels.
                            </small>
                        </div>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="tilt">
                                Panel Tilt (degrees):
                            </label>
                            <input
                                id="tilt"
                                type="number"
                                value={tilt}
                                onChange={(e) => setTilt(e.target.value)}
                                style={inputStyle}
                                min="0"
                                max="90"
                                placeholder="Optimal near latitude"
                            />
                        </div>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="azimuth">
                                Panel Azimuth (degrees):
                            </label>
                            <input
                                id="azimuth"
                                type="number"
                                value={azimuth}
                                onChange={(e) => setAzimuth(e.target.value)}
                                style={inputStyle}
                                min="0"
                                max="359"
                                placeholder="180 = South"
                            />
                        </div>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="shading">
                                Shading Losses (%):
                            </label>
                            <input
                                id="shading"
                                type="number"
                                value={shading}
                                onChange={(e) => setShading(e.target.value)}
                                style={inputStyle}
                                min="0"
                                max="100"
                            />
                            <small style={{ fontSize: '0.8em', color: '#666', marginTop: '3px' }}>
                                % yearly loss due to shade.
                            </small>
                        </div>
                    </fieldset>
                    <fieldset style={fieldsetBorderStyle}>
                        <legend style={legendStyle}>Optional Details</legend>
                        <div style={formGroupStyle}>
                            <label style={labelStyle}>Budget (KES) (Optional):</label>
                            <input
                                type="number"
                                value={budget}
                                onChange={(e) => setBudget(e.target.value)}
                                style={inputStyle}
                                placeholder="Max budget if applicable"
                            />
                        </div>
                        <div style={formGroupStyle}>
                            <label style={labelStyle}>Roof Area (sqm) (Optional):</label>
                            <input
                                type="number"
                                value={roofArea}
                                onChange={(e) => setRoofArea(e.target.value)}
                                style={inputStyle}
                                placeholder="For future space checks"
                            />
                        </div>
                    </fieldset>
                    <fieldset style={{ ...fieldsetBorderStyle, ...fullWidthStyle }}>
                        <legend style={legendStyle}>Appliance Details (Alternative to kWh/Bill)</legend>
                        {appliances.map((appliance, index) => (
                            <div
                                key={index}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns:
                                        appliance.name === 'custom'
                                            ? '2fr 1fr 1fr 0.5fr 0.5fr auto'
                                            : '3fr 1fr 0.5fr 0.5fr auto',
                                    gap: '10px',
                                    marginBottom: '10px',
                                    alignItems: 'center',
                                    paddingBottom: '10px',
                                    borderBottom: '1px dashed #eee',
                                }}
                            >
                                <select
                                    value={appliance.name}
                                    onChange={(e) => updateAppliance(index, 'name', e.target.value)}
                                    style={{ ...selectStyle }}
                                >
                                    <option value="custom">-- Custom Appliance --</option>
                                    {(applianceCategories[userType] || []).map((app) => (
                                        <option key={app.name} value={app.name}>
                                            {app.name} ({app.power}W)
                                        </option>
                                    ))}
                                </select>
                                {appliance.name === 'custom' && (
                                    <input
                                        type="text"
                                        placeholder="Appliance Name"
                                        value={appliance.customName || ''}
                                        onChange={(e) => updateAppliance(index, 'customName', e.target.value)}
                                        style={inputStyle}
                                    />
                                )}
                                <input
                                    type="number"
                                    placeholder="Power (W)"
                                    value={appliance.power}
                                    onChange={(e) => updateAppliance(index, 'power', e.target.value)}
                                    style={inputStyle}
                                    min="0"
                                />
                                <input
                                    type="number"
                                    placeholder="Qty"
                                    value={appliance.quantity}
                                    onChange={(e) => updateAppliance(index, 'quantity', e.target.value)}
                                    style={inputStyle}
                                    min="1"
                                />
                                <input
                                    type="number"
                                    placeholder="Hrs/day"
                                    value={appliance.hoursPerDay}
                                    onChange={(e) => updateAppliance(index, 'hoursPerDay', e.target.value)}
                                    style={inputStyle}
                                    min="0"
                                    max="24"
                                />
                                <button onClick={() => removeAppliance(index)} style={removeButtonStyle}>
                                    Remove
                                </button>
                            </div>
                        ))}
                        <div style={{ marginTop: '15px' }}>
                            <button onClick={addAppliance} style={buttonSecondaryStyle}>
                                Add Appliance
                            </button>
                            {appliances.length > 0 && (
                                <div style={{ marginTop: '10px', fontSize: '0.9em' }}>
                                    <strong>Daily Consumption from Appliances:</strong>{' '}
                                    {calculateDailyApplianceKwh().toFixed(2)} kWh
                                </div>
                            )}
                        </div>
                    </fieldset>
                </div>

                <div style={{ marginTop: '30px', textAlign: 'center' }}>
                    <button
                        onClick={handleCalculateClick}
                        style={calculating ? buttonDisabledStyle : buttonStyle}
                        disabled={calculating}
                    >
                        {calculating ? 'Calculating...' : 'Calculate Solar System'}
                    </button>
                    {calculationError && <div style={errorStyle}>{calculationError}</div>}
                </div>
            </section>

            {/* Results Section */}
            {calculationResult && (
                <section style={sectionStyle}>
                    <h2 style={h2Style}>3. Solar System Results</h2>
                    <div style={resultBoxStyle}>
                        <h3 style={{ ...h3Style, marginTop: 0 }}>System Overview</h3>
                        <div style={gridStyle}>
                            <div>
                                <p>
                                    <strong>Location:</strong> {calculationResult.location}
                                </p>
                                <p>
                                    <strong>System Type:</strong> {calculationResult.systemType}
                                </p>
                                <p>
                                    <strong>Daily Energy Consumption:</strong>{' '}
                                    {calculationResult.dailyEnergyConsumptionKwh?.toFixed(2)} kWh
                                </p>
                                <p>
                                    <strong>Energy Source:</strong> {calculationResult.energyConsumptionSource}
                                </p>
                            </div>
                            <div>
                                <p>
                                    <strong>PV System Size:</strong> {calculationResult.pvSizeKwP?.toFixed(2)} kWp
                                </p>
                                <p>
                                    <strong>Panel Configuration:</strong> {calculationResult.numberOfPanels} x{' '}
                                    {calculationResult.panelWattage}W panels
                                </p>
                                <p>
                                    <strong>Inverter Size:</strong> {calculationResult.inverterSizeKva?.toFixed(2)} kVA
                                </p>
                                <p>
                                    <strong>Daily Peak Sun Hours:</strong>{' '}
                                    {calculationResult.dailyPeakSunHours?.toFixed(2)} hours
                                </p>
                            </div>
                        </div>

                        {calculationResult.systemType !== 'on-grid' && calculationResult.battery && (
                            <div>
                                <h3 style={h3Style}>Battery System</h3>
                                <div style={gridStyle}>
                                    <div>
                                        <p>
                                            <strong>Battery Capacity:</strong>{' '}
                                            {calculationResult.battery.sizeKwh?.toFixed(2)} kWh
                                        </p>
                                        <p>
                                            <strong>Battery Configuration:</strong>{' '}
                                            {calculationResult.battery.numberOfUnits} x{' '}
                                            {calculationResult.battery.unitCapacityKwh} kWh units
                                        </p>
                                    </div>
                                    <div>
                                        <p>
                                            <strong>Days of Autonomy:</strong> {calculationResult.autonomyDays}
                                        </p>
                                        <p>
                                            <strong>Depth of Discharge:</strong>{' '}
                                            {(calculationResult.battery.depthOfDischarge * 100).toFixed(0)}%
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <h3 style={h3Style}>Energy Production</h3>
                        <p>
                            <strong>Estimated Annual Production:</strong>{' '}
                            {calculationResult.annualProductionKwh?.toFixed(0)} kWh
                        </p>

                        {calculationResult.monthlyProduction && (
                            <div style={{ marginTop: '20px', height: '300px' }}>
                                <Bar
                                    data={{
                                        labels: calculationResult.monthlyProduction.map(
                                            (m) =>
                                                [
                                                    'Jan',
                                                    'Feb',
                                                    'Mar',
                                                    'Apr',
                                                    'May',
                                                    'Jun',
                                                    'Jul',
                                                    'Aug',
                                                    'Sep',
                                                    'Oct',
                                                    'Nov',
                                                    'Dec',
                                                ][m.month - 1]
                                        ),
                                        datasets: [
                                            {
                                                label: 'Monthly Production (kWh)',
                                                data: calculationResult.monthlyProduction.map((m) => m.production),
                                                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                                                borderColor: 'rgba(54, 162, 235, 1)',
                                                borderWidth: 1,
                                            },
                                        ],
                                    }}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        scales: {
                                            y: {
                                                beginAtZero: true,
                                                title: {
                                                    display: true,
                                                    text: 'Energy (kWh)',
                                                },
                                            },
                                        },
                                    }}
                                />
                            </div>
                        )}

                        <h3 style={h3Style}>Financial Analysis</h3>
                        <div style={gridStyle}>
                            <div>
                                <p>
                                    <strong>Total System Cost:</strong> KSh{' '}
                                    {calculationResult.estimatedCost?.total?.toLocaleString()}
                                </p>
                                {calculationResult.simplePaybackYears && (
                                    <p>
                                        <strong>Simple Payback Period:</strong>{' '}
                                        {calculationResult.simplePaybackYears?.toFixed(1)} years
                                    </p>
                                )}
                                {calculationResult.budgetConstrained && (
                                    <p>
                                        <strong>Budget Constrained:</strong> Yes (Target: KSh{' '}
                                        {calculationResult.targetBudget?.toLocaleString()})
                                    </p>
                                )}
                            </div>
                            <div>
                                <p>
                                    <strong>Solar Panels:</strong> KSh{' '}
                                    {calculationResult.estimatedCost?.panels?.toLocaleString()}
                                </p>
                                <p>
                                    <strong>Inverter:</strong> KSh{' '}
                                    {calculationResult.estimatedCost?.inverter?.toLocaleString()}
                                </p>
                                {calculationResult.estimatedCost?.batteries > 0 && (
                                    <p>
                                        <strong>Batteries:</strong> KSh{' '}
                                        {calculationResult.estimatedCost?.batteries?.toLocaleString()}
                                    </p>
                                )}
                                {calculationResult.estimatedCost?.chargeController > 0 && (
                                    <p>
                                        <strong>Charge Controller:</strong> KSh{' '}
                                        {calculationResult.estimatedCost?.chargeController?.toLocaleString()}
                                    </p>
                                )}
                                <p>
                                    <strong>Mounting & Installation:</strong> KSh{' '}
                                    {(
                                        (calculationResult.estimatedCost?.mounting || 0) +
                                        (calculationResult.estimatedCost?.installation || 0)
                                    ).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
                            {isLoggedIn && (
                                <button onClick={saveCalculation} style={buttonSecondaryStyle}>
                                    Save Calculation
                                </button>
                            )}
                            <button onClick={handleGeneratePDF} style={buttonStyle}>
                                Generate PDF Report
                            </button>
                        </div>
                    </div>
                </section>
            )}

            <footer style={{ marginTop: '50px', textAlign: 'center', color: '#666', fontSize: '0.8em' }}>
                <p>Solar System Sizing Calculator &copy; 2023</p>
                <p>
                    This tool provides estimates based on available data. Actual system performance may vary. Always
                    consult with a certified solar installer before making purchasing decisions.
                </p>
            </footer>
        </div>
    );
}

export default HomePage;