import React, { useState, useCallback, useEffect, useMemo } from 'react';
// import { useDropzone } from 'react-dropzone'; // Keep if using OCR
import axios from 'axios';
// import Tesseract from 'tesseract.js'; // Keep if using OCR
import dynamic from 'next/dynamic';
import 'chart.js/auto'; // Required for Chart.js v3+

// Dynamically import chart components, disabling SSR
const Bar = dynamic(() => import('react-chartjs-2').then((mod) => mod.Bar), { ssr: false });
const Pie = dynamic(() => import('react-chartjs-2').then((mod) => mod.Pie), { ssr: false });

function HomePage() {
    // --- State Variables ---

    // Auth State
    const [token, setToken] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [authMessage, setAuthMessage] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // // OCR State (Optional - Keep if using)
    // const [uploading, setUploading] = useState(false);
    // const [ocrProgress, setOcrProgress] = useState(0);
    // const [ocrText, setOcrText] = useState('');
    // const [extractedData, setExtractedData] = useState(null);
    // const [lastUploadFilename, setLastUploadFilename] = useState('');

    // Input Parameter State (Organized)
    const [location, setLocation] = useState(''); // Required
    const [systemType, setSystemType] = useState('on-grid'); // Required: on-grid, off-grid, hybrid
    const [userType, setUserType] = useState('residential'); // Required: residential, commercial, industrial
    const [systemVoltage, setSystemVoltage] = useState(48); // Required for off-grid/hybrid

    const [avgMonthlyKwh, setAvgMonthlyKwh] = useState(''); // Energy Option 1
    const [avgMonthlyBill, setAvgMonthlyBill] = useState(''); // Energy Option 2
    const [electricityPricePerKwh, setElectricityPricePerKwh] = useState(''); // Required if using bill, also for payback

    const [autonomyDays, setAutonomyDays] = useState(1.5); // For off-grid/hybrid
    const [depthOfDischarge, setDepthOfDischarge] = useState(0.8); // For off-grid/hybrid (80%)

    const [panelWattage, setPanelWattage] = useState(550); // Panel config
    const [tilt, setTilt] = useState(15);              // Panel config
    const [azimuth, setAzimuth] = useState(180);       // Panel config (180=South)
    const [shading, setShading] = useState(0);         // Panel config (%)

    const [appliances, setAppliances] = useState([]); // Energy Option 3
    const [applianceCategories, setApplianceCategories] = useState({ residential: [], commercial: [], industrial: [] });

    const [budget, setBudget] = useState(''); // Optional budget constraint
    // const [roofArea, setRoofArea] = useState(''); // Optional roof area (future use)

    // Calculation Result State
    const [calculationResult, setCalculationResult] = useState(null);
    const [calculating, setCalculating] = useState(false);
    const [calculationError, setCalculationError] = useState('');
    const [calculationInputParams, setCalculationInputParams] = useState(null); // Store inputs used for saving/PDF

    // Other UI State
    const [showAdvanced, setShowAdvanced] = useState(false); // Toggle for less common inputs
    const [savedCalculations, setSavedCalculations] = useState([]);
    const [loadingSaved, setLoadingSaved] = useState(false);


    // Backend URL
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

    // --- Effects ---

    // Check local storage for token on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const storedToken = localStorage.getItem('token') || '';
            setToken(storedToken);
            setIsLoggedIn(!!storedToken);
        }
    }, []);

    // Fetch appliance list on mount
    useEffect(() => {
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
                // Handle error - maybe set a default list or show message
            }
        };
        fetchAppliances();
    }, [backendUrl]);

    // Fetch saved calculations when logged in
     useEffect(() => {
        const fetchSavedCalculations = async () => {
             if (isLoggedIn && token) {
                 setLoadingSaved(true);
                 try {
                     const response = await axios.get(`${backendUrl}/api/calculations`, {
                         headers: { Authorization: `Bearer ${token}` },
                     });
                     setSavedCalculations(response.data);
                 } catch (error) {
                     console.error('Failed to fetch saved calculations:', error);
                      setAuthMessage("Could not load saved calculations.");
                     // If token is invalid/expired, log out
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
        fetchSavedCalculations();
    }, [isLoggedIn, token, backendUrl]); // Re-fetch if login status changes

    // --- Event Handlers ---

    // OCR Handler (Keep if using)
    // const onDropAccepted = useCallback(async (acceptedFiles) => { ... }, []);
    // const { getRootProps, getInputProps, isDragActive } = useDropzone({ ... });

    // Appliance Management
    const addAppliance = () => {
        const applianceOptions = applianceCategories[userType] || [];
        if (applianceOptions.length === 0 && userType) {
            alert(`Appliance list for ${userType} is empty or not loaded.`);
            return;
        }
        // Add a new blank appliance row
        setAppliances([...appliances, { id: Date.now(), name: 'custom', customName: '', power: '', quantity: 1, hoursPerDay: 1 }]);
    };

    const updateAppliance = (id, field, value) => {
        setAppliances(prevAppliances =>
            prevAppliances.map(appliance => {
                if (appliance.id === id) {
                    const updatedAppliance = { ...appliance, [field]: value };

                    // If selecting a preset appliance, update its power automatically
                    if (field === 'name' && value !== 'custom') {
                        const selectedPreset = (applianceCategories[userType] || []).find(a => a.name === value);
                        if (selectedPreset) {
                            updatedAppliance.power = selectedPreset.power || '';
                            updatedAppliance.customName = ''; // Clear custom name if preset selected
                        }
                    }
                     // Basic validation for numbers
                     if (field === 'power' || field === 'quantity' || field === 'hoursPerDay') {
                         let numValue = parseFloat(value);
                          if (isNaN(numValue) || numValue < (field === 'power' ? 0 : 1) ) {
                             // Keep empty string or revert maybe? Or set to min? Let's allow empty temporarily.
                             // numValue = (field === 'power' ? 0 : 1);
                          } else {
                             if (field === 'hoursPerDay' && numValue > 24) numValue = 24;
                              updatedAppliance[field] = numValue; // Store the valid number
                          }
                    }

                    return updatedAppliance;
                }
                return appliance;
            })
        );
    };

    const removeAppliance = (id) => setAppliances(appliances.filter(app => app.id !== id));

    // Calculate total daily kWh from the appliance list
    const calculateDailyApplianceKwh = useMemo(() => {
        return appliances.reduce((sum, app) => {
            const powerW = parseFloat(app.power) || 0;
            const quantity = parseInt(app.quantity) || 0; // Treat 0 quantity as 0 power contribution
            const hours = parseFloat(app.hoursPerDay) || 0;
            if (powerW > 0 && quantity > 0 && hours > 0) {
                return sum + (powerW / 1000) * quantity * hours;
            }
            return sum;
        }, 0);
    }, [appliances]); // Recalculate only when appliances change

    // Auth Handlers
    const handleAuthAction = async (action) => {
         setAuthMessage(''); // Clear previous messages
         if (!username || !password) {
            setAuthMessage('Please enter both username and password.');
            return;
         }

         try {
             const url = `${backendUrl}/api/${action}`; // action is 'login' or 'signup'
             const response = await axios.post(url, { username, password });

             if (action === 'signup') {
                 setAuthMessage(response.data.message || 'Signup successful! Please log in.');
                 setUsername(''); // Clear fields on successful signup
                 setPassword('');
             } else { // Login
                const { token } = response.data;
                if (!token) throw new Error("Login failed: No token received.");
                 setToken(token);
                 localStorage.setItem('token', token);
                 setIsLoggedIn(true);
                setAuthMessage('Login successful!');
                 setUsername('');
                 setPassword('');
            }
        } catch (error) {
            console.error(`${action} failed:`, error.response?.data || error.message);
            setAuthMessage(`Error: ${error.response?.data?.message || error.message || 'An unexpected error occurred.'}`);
            setIsLoggedIn(false); // Ensure logged out state on error
            localStorage.removeItem('token');
            setToken('');
        }
     };

    const handleLogout = () => {
        setToken('');
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        setCalculationResult(null);
        setUsername('');
        setPassword('');
        setAuthMessage('Logged out successfully.');
        setSavedCalculations([]); // Clear saved calculations on logout
    };

    // --- Main Calculation Logic ---
    const handleCalculateClick = async () => {
        setCalculating(true);
        setCalculationResult(null);
        setCalculationError('');
        setCalculationInputParams(null); // Reset input params cache

        // --- Frontend Validation ---
        const errors = [];
        if (!location.trim()) errors.push("Project Location is required.");
        if (!electricityPricePerKwh || parseFloat(electricityPricePerKwh) <= 0) {
            errors.push("Valid Electricity Price (> 0 KES/kWh) is required for cost savings calculations.");
        }
        const energyProvided = avgMonthlyKwh || avgMonthlyBill || appliances.length > 0;
        if (!energyProvided) errors.push("Please provide energy usage: Avg. Monthly kWh, Avg. Monthly Bill, or list your appliances.");

        if (systemType !== 'on-grid') {
             if (isNaN(parseFloat(autonomyDays)) || parseFloat(autonomyDays) < 0.5) errors.push("Autonomy days (>= 0.5) required for off-grid/hybrid.");
            if (isNaN(parseFloat(depthOfDischarge)) || parseFloat(depthOfDischarge) <= 0.1 || parseFloat(depthOfDischarge) > 1) errors.push("Valid DoD (0.1-1.0) required for off-grid/hybrid.");
             if (![12, 24, 48].includes(Number(systemVoltage))) errors.push("System Voltage (12, 24, or 48V) required for off-grid/hybrid.");
         }
          if (isNaN(parseInt(panelWattage)) || parseInt(panelWattage) < 50 || parseInt(panelWattage) > 1000) errors.push("Panel Wattage (50-1000 Wp) required.");


        if (errors.length > 0) {
            setCalculationError(`Please fix the following issues:\n- ${errors.join('\n- ')}`);
            setCalculating(false);
            return;
        }

        // Prepare parameters object to send to backend
        const sizingParameters = {
            location: location.trim(),
            systemType,
            userType,
            systemVoltage: Number(systemVoltage), // Send as number

            // Energy Inputs (send non-empty values)
            avgMonthlyKwh: avgMonthlyKwh ? parseFloat(avgMonthlyKwh) : null,
            avgMonthlyBill: avgMonthlyBill ? parseFloat(avgMonthlyBill) : null,
             electricityPricePerKwh: parseFloat(electricityPricePerKwh), // Already validated > 0

            // Appliances (filter out potentially incomplete/invalid ones before sending?)
            appliances: appliances.length > 0 ? appliances.map(a => ({
                name: a.customName || a.name,
                 power: parseFloat(a.power) || 0, // Ensure power is a number
                 quantity: parseInt(a.quantity) || 0,
                 hoursPerDay: parseFloat(a.hoursPerDay) || 0,
                 peakFactor: a.peakFactor || 1.5 // Send peak factor if you add it
             })).filter(a => a.power > 0 && a.quantity > 0 && a.hoursPerDay > 0) // Only send valid appliances
             : null,

            // Off-grid / Hybrid Params
             autonomyDays: systemType !== 'on-grid' ? parseFloat(autonomyDays) : null,
            depthOfDischarge: systemType !== 'on-grid' ? parseFloat(depthOfDischarge) : null,

            // Panel Config
             panelWattage: parseInt(panelWattage),
            tilt: parseFloat(tilt) || 0,
            azimuth: parseFloat(azimuth) || 180,
            shading: parseFloat(shading) || 0,

            // Optional
             budget: budget ? parseFloat(budget) : null,
            // roofArea: roofArea ? parseFloat(roofArea) : null, // If using roofArea later
        };

        setCalculationInputParams(sizingParameters); // Store the params used for this calculation attempt

        // --- API Call ---
        try {
            console.log('Sending calculation request:', sizingParameters);
            const response = await axios.post(`${backendUrl}/api/calculate`, sizingParameters, {
                timeout: 45000 // 45 second timeout (PVGIS can be slow)
            });
            console.log('Calculation response received:', response.data);

            if (!response.data || !response.data.pvSystem) {
                 throw new Error("Received invalid data structure from server.");
            }

            setCalculationResult(response.data); // Store successful result

        } catch (error) {
            console.error('Calculation API error:', error);
            let errorMessage = 'Calculation failed: ';
            if (error.code === 'ECONNABORTED') {
                 errorMessage += 'The request timed out. The server might be busy or the location APIs are slow. Please try again later.';
            } else if (error.response?.data?.message) {
                 errorMessage += error.response.data.message; // Use specific error from backend
             } else if (error.message) {
                 errorMessage += error.message;
             } else {
                 errorMessage += 'An unknown error occurred on the server.';
             }
            setCalculationError(errorMessage);
        } finally {
            setCalculating(false);
        }
    };

    // --- Helper Functions for Frontend ---

    const saveCalculation = async () => {
        if (!calculationResult || !isLoggedIn || !calculationInputParams) {
            alert('Cannot save: No calculation result, not logged in, or input parameters missing.');
            return;
        }
        setAuthMessage('Saving calculation...');
        try {
             const payload = {
                calculationParams: calculationInputParams, // Use the stored inputs
                resultData: calculationResult,
            };
            await axios.post(`${backendUrl}/api/save-calculation`, payload, {
                 headers: { Authorization: `Bearer ${token}` },
            });
             setAuthMessage('Calculation saved successfully!');
            // Re-fetch saved calculations to update the list
            if (token) {
                const response = await axios.get(`${backendUrl}/api/calculations`, { headers: { Authorization: `Bearer ${token}` }});
                 setSavedCalculations(response.data);
            }
        } catch (error) {
             console.error('Save calculation failed:', error.response || error);
             const errMsg = error.response?.data?.message || 'Save failed. Please try again.';
             setAuthMessage(`Save Error: ${errMsg}`);
              if (error.response?.status === 400 || error.response?.status === 401) { // Handle bad/expired token
                  handleLogout();
              }
         }
    };

     const handleGeneratePDF = async () => {
         if (!calculationResult) {
            alert('Please perform a calculation first to generate a PDF report.');
             return;
         }
         try {
             console.log("Requesting PDF generation with data:", calculationResult);
             const response = await axios.post(`${backendUrl}/api/generate-pdf`, calculationResult, {
                 responseType: 'blob', // Important for handling binary PDF data
                 headers: { 'Accept': 'application/pdf' },
                 timeout: 30000 // 30 second timeout for PDF generation
             });

            // Create a URL for the blob object
             const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
             const link = document.createElement('a');
             link.href = url;
             // Generate a filename (replace invalid chars)
            const filename = `SolarFit_Report_${(calculationResult.location || 'Location').replace(/[^a-z0-9]/gi, '_')}.pdf`;
            link.setAttribute('download', filename);

             // Append, click, and remove the link
             document.body.appendChild(link);
             link.click();
            document.body.removeChild(link);

            // Clean up the object URL
             window.URL.revokeObjectURL(url);

        } catch (error) {
             console.error('PDF generation failed:', error);
            let errorMsg = 'PDF generation failed. ';
            // Try to read error message if server sent JSON instead of PDF blob
             if (error.response && error.response.data instanceof Blob && error.response.data.type === 'application/json') {
                 try {
                    const errJson = JSON.parse(await error.response.data.text());
                    errorMsg += errJson.message || 'Server error during PDF creation.';
                 } catch (parseError) {
                    errorMsg += 'Unable to parse server error response.';
                 }
             } else if (error.response?.data?.message) {
                errorMsg += error.response.data.message;
             } else {
                 errorMsg += error.message || 'Check server logs for details.';
             }
             alert(errorMsg);
         }
     };

     const loadCalculation = (calc) => {
        if (calc && calc.calculationData) {
            const params = calc.calculationData;
            // Update state based on loaded calculation data
             setLocation(params.location || '');
             setSystemType(params.systemType || 'on-grid');
             setUserType(params.userType || 'residential');
             setSystemVoltage(params.systemVoltage || 48);
             setAvgMonthlyKwh(params.avgMonthlyKwh || '');
             setAvgMonthlyBill(params.avgMonthlyBill || '');
             setElectricityPricePerKwh(params.electricityPricePerKwh || '');
             setAppliances(params.appliances || []); // Need unique IDs if re-using add/remove logic
            // Add IDs if missing when loading:
             setAppliances((params.appliances || []).map((app, idx) => ({...app, id: app.id || Date.now() + idx })));

            if (params.systemType !== 'on-grid'){
                 setAutonomyDays(params.autonomyDays || 1.5);
                 setDepthOfDischarge(params.depthOfDischarge || 0.8);
            }
             setPanelWattage(params.panelWattage || 550);
             setTilt(params.tilt || 15);
             setAzimuth(params.azimuth || 180);
             setShading(params.shading || 0);
             setBudget(params.budget || '');

             setCalculationResult(calc.resultData || null); // Load the result too
            setCalculationError(''); // Clear errors
            window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top
            alert(`Loaded calculation saved on ${new Date(calc.createdAt).toLocaleDateString()}`);
         }
     }

    // --- Styles --- (using Tailwind CSS classes for brevity and modernity)
    // Include Tailwind via CDN in _document.js or install via npm

    const cardStyle = "bg-white p-6 rounded-lg shadow-md mb-6";
    const fieldsetStyle = "border border-gray-300 p-4 rounded-md mb-4";
    const legendStyle = "font-semibold text-blue-700 px-2";
    const formGroupStyle = "mb-4";
    const labelStyle = "block text-sm font-medium text-gray-700 mb-1";
    const inputStyle = "block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm";
    const selectStyle = inputStyle + " appearance-none"; // Ensure select arrows show
    const buttonStyle = "inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";
    const buttonSecondaryStyle = buttonStyle + " bg-gray-600 hover:bg-gray-700 focus:ring-gray-500";
    const buttonDangerStyle = buttonStyle + " bg-red-600 hover:bg-red-700 focus:ring-red-500";
    const h2Style = "text-2xl font-bold text-center text-blue-800 mb-6 pb-2 border-b-2 border-blue-300";
    const h3Style = "text-lg font-semibold text-blue-700 mt-4 mb-2";
    const gridStyle = "grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4"; // Responsive grid

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8 bg-gray-50 font-sans">
            <h1 className="text-3xl font-bold text-center text-blue-900 mb-8">SolarFit - Advanced Solar System Sizing</h1>

             {/* Authentication Section */}
             <div className={cardStyle}>
                 {!isLoggedIn ? (
                    <>
                        <h2 className={h2Style}>Login or Signup</h2>
                         {authMessage && <p className={`text-center p-2 rounded mb-4 ${authMessage.startsWith("Error:") ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{authMessage}</p>}
                        <div className={gridStyle}>
                            <div className={formGroupStyle}>
                                 <label htmlFor="username" className={labelStyle}>Username:</label>
                                <input id="username" value={username} onChange={e => setUsername(e.target.value)} className={inputStyle} />
                             </div>
                             <div className={formGroupStyle}>
                                <label htmlFor="password" className={labelStyle}>Password:</label>
                                <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} className={inputStyle} />
                             </div>
                         </div>
                         <div className="mt-4 flex justify-center space-x-4">
                            <button onClick={() => handleAuthAction('signup')} className={buttonSecondaryStyle}>Signup</button>
                            <button onClick={() => handleAuthAction('login')} className={buttonStyle}>Login</button>
                        </div>
                     </>
                ) : (
                     <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold text-green-700">Welcome back!</h2>
                         {authMessage && !authMessage.includes("successful") && !authMessage.includes("Saving") && <p className={`text-center p-2 rounded ${authMessage.startsWith("Error:") || authMessage.includes("Could not load") ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{authMessage}</p>}
                        <button onClick={handleLogout} className={buttonDangerStyle}>Logout</button>
                     </div>
                 )}
             </div>

             {/* Saved Calculations (if logged in) */}
             {isLoggedIn && (
                <div className={cardStyle}>
                     <h2 className={h2Style}>Saved Calculations</h2>
                    {loadingSaved ? <p>Loading saved calculations...</p> : (
                        savedCalculations.length > 0 ? (
                             <ul className="space-y-2 max-h-60 overflow-y-auto">
                                {savedCalculations.map(calc => (
                                    <li key={calc._id} className="flex justify-between items-center p-2 border rounded hover:bg-gray-100">
                                         <span>{calc.resultData?.location || 'No Location'} - {calc.resultData?.pvSystem?.sizeKwP || '?'}kWp - {new Date(calc.createdAt).toLocaleDateString()}</span>
                                        <button onClick={() => loadCalculation(calc)} className={buttonSecondaryStyle + " text-xs px-2 py-1"}>Load</button>
                                    </li>
                                 ))}
                             </ul>
                        ) : <p className="text-center text-gray-500">No saved calculations found.</p>
                     )}
                 </div>
             )}


            {/* Removed OCR Dropzone for simplicity now - can be added back if needed */}

            {/* Sizing Input Section */}
             <form onSubmit={e => { e.preventDefault(); handleCalculateClick(); }}>
                 <div className={cardStyle}>
                     <h2 className={h2Style}>Project Details & Energy Needs</h2>

                    {/* Grid for layout */}
                     <div className={gridStyle}>

                        {/* Location & System Type */}
                        <fieldset className={fieldsetStyle}>
                             <legend className={legendStyle}>Location & System</legend>
                             <div className={formGroupStyle}>
                                <label htmlFor="location" className={labelStyle}>Project Location* <span className="text-gray-500 text-xs">(e.g., Nairobi, Kenya)</span></label>
                                <input id="location" value={location} onChange={e => setLocation(e.target.value)} className={inputStyle} required placeholder="City/Town, Country"/>
                             </div>
                            <div className={formGroupStyle}>
                                <label htmlFor="systemType" className={labelStyle}>System Type*</label>
                                <select id="systemType" value={systemType} onChange={e => setSystemType(e.target.value)} className={selectStyle} required>
                                    <option value="on-grid">On-Grid (Grid-Tied)</option>
                                     <option value="off-grid">Off-Grid</option>
                                     <option value="hybrid">Hybrid (Grid + Battery)</option>
                                 </select>
                             </div>
                            <div className={formGroupStyle}>
                                <label htmlFor="userType" className={labelStyle}>User Type*</label>
                                <select id="userType" value={userType} onChange={e => {setUserType(e.target.value); setAppliances([])}} className={selectStyle} required>
                                    <option value="residential">Residential</option>
                                    <option value="commercial">Commercial</option>
                                    <option value="industrial">Industrial</option>
                                </select>
                             </div>
                         </fieldset>

                        {/* Energy Consumption */}
                        <fieldset className={fieldsetStyle}>
                             <legend className={legendStyle}>Energy Consumption*</legend>
                             <p className="text-xs text-gray-500 mb-2">Provide one: Avg. kWh, Avg. Bill, or detailed appliances below.</p>
                            <div className={formGroupStyle}>
                                <label htmlFor="avgMonthlyKwh" className={labelStyle}>Avg. Monthly kWh <span className="text-gray-500 text-xs">(Optional)</span></label>
                                <input id="avgMonthlyKwh" type="number" value={avgMonthlyKwh} onChange={e => setAvgMonthlyKwh(e.target.value)} className={inputStyle} placeholder="e.g., 350" disabled={appliances.length > 0} />
                             </div>
                            <div className={formGroupStyle}>
                                 <label htmlFor="avgMonthlyBill" className={labelStyle}>Avg. Monthly Bill (KES) <span className="text-gray-500 text-xs">(Optional)</span></label>
                                 <input id="avgMonthlyBill" type="number" value={avgMonthlyBill} onChange={e => setAvgMonthlyBill(e.target.value)} className={inputStyle} placeholder="e.g., 8000" disabled={appliances.length > 0 || !!avgMonthlyKwh} />
                            </div>
                            <div className={formGroupStyle}>
                                 <label htmlFor="electricityPrice" className={labelStyle}>Current Electricity Price (KES/kWh)*</label>
                                <input id="electricityPrice" type="number" step="0.1" value={electricityPricePerKwh} onChange={e => setElectricityPricePerKwh(e.target.value)} className={inputStyle} placeholder="e.g., 25.5" required />
                                 <span className="text-xs text-gray-500">Needed for Bill estimate & Payback calculation.</span>
                             </div>
                         </fieldset>

                         {/* Battery Details (Conditional) */}
                         {systemType !== 'on-grid' && (
                             <fieldset className={fieldsetStyle}>
                                 <legend className={legendStyle}>Battery Setup (Off-Grid/Hybrid)</legend>
                                <div className={formGroupStyle}>
                                     <label htmlFor="systemVoltage" className={labelStyle}>Battery System Voltage*</label>
                                    <select id="systemVoltage" value={systemVoltage} onChange={e => setSystemVoltage(Number(e.target.value))} className={selectStyle} required>
                                         <option value="12">12 V</option>
                                         <option value="24">24 V</option>
                                         <option value="48">48 V</option>
                                     </select>
                                 </div>
                                 <div className={formGroupStyle}>
                                    <label htmlFor="autonomyDays" className={labelStyle}>Days of Autonomy*</label>
                                    <input id="autonomyDays" type="number" step="0.5" min="0.5" value={autonomyDays} onChange={e => setAutonomyDays(e.target.value)} className={inputStyle} required />
                                    <span className="text-xs text-gray-500">Days battery supports load without sun.</span>
                                 </div>
                                 <div className={formGroupStyle}>
                                     <label htmlFor="dod" className={labelStyle}>Battery Depth of Discharge (DoD)*</label>
                                    <input id="dod" type="number" step="0.05" min="0.1" max="1.0" value={depthOfDischarge} onChange={e => setDepthOfDischarge(e.target.value)} className={inputStyle} required placeholder="0.8 for 80%" />
                                    <span className="text-xs text-gray-500">Fraction of battery capacity to use (e.g., 0.8 for LiFePO4).</span>
                                 </div>
                             </fieldset>
                        )}

                        {/* Panel Configuration */}
                         <fieldset className={fieldsetStyle}>
                             <legend className={legendStyle}>Panel Configuration</legend>
                            <div className={formGroupStyle}>
                                 <label htmlFor="panelWattage" className={labelStyle}>Individual Panel Wattage (Wp)*</label>
                                <input id="panelWattage" type="number" step="5" min="50" max="1000" value={panelWattage} onChange={e => setPanelWattage(e.target.value)} className={inputStyle} required placeholder="e.g., 550" />
                             </div>
                            {/* Advanced/Optional Panel Settings */}
                            <div className="mt-4">
                                 <button type="button" onClick={() => setShowAdvanced(!showAdvanced)} className="text-sm text-blue-600 hover:underline mb-2">
                                     {showAdvanced ? 'Hide' : 'Show'} Advanced Panel Settings (Tilt/Azimuth/Shading)
                                 </button>
                                 {showAdvanced && (
                                     <div className="space-y-3 pt-2 border-t">
                                         <div className={formGroupStyle}>
                                             <label htmlFor="tilt" className={labelStyle}>Panel Tilt (°)<span className="text-gray-500 text-xs"> (0=Flat, 90=Vertical)</span></label>
                                            <input id="tilt" type="number" min="0" max="90" value={tilt} onChange={e => setTilt(e.target.value)} className={inputStyle} />
                                             <span className="text-xs text-gray-500">Often near location latitude for optimal annual output.</span>
                                         </div>
                                         <div className={formGroupStyle}>
                                             <label htmlFor="azimuth" className={labelStyle}>Panel Azimuth (°)<span className="text-gray-500 text-xs"> (0=N, 90=E, 180=S, 270=W)</span></label>
                                             <input id="azimuth" type="number" min="0" max="359" value={azimuth} onChange={e => setAzimuth(e.target.value)} className={inputStyle} />
                                             <span className="text-xs text-gray-500">Direction panels face (180 for South in N. Hemisphere).</span>
                                        </div>
                                         <div className={formGroupStyle}>
                                             <label htmlFor="shading" className={labelStyle}>Shading Losses (%)</label>
                                            <input id="shading" type="number" min="0" max="99" value={shading} onChange={e => setShading(e.target.value)} className={inputStyle} />
                                             <span className="text-xs text-gray-500">Estimated % reduction in yearly output due to shadows.</span>
                                         </div>
                                    </div>
                                )}
                            </div>
                         </fieldset>

                        {/* Optional Budget */}
                        <fieldset className={fieldsetStyle + ' md:col-span-2'}> {/* Span full width on medium screens */}
                            <legend className={legendStyle}>Optional Budget</legend>
                            <div className={formGroupStyle}>
                                 <label htmlFor="budget" className={labelStyle}>Maximum Budget (KES) <span className="text-gray-500 text-xs">(Optional)</span></label>
                                <input id="budget" type="number" value={budget} onChange={e => setBudget(e.target.value)} className={inputStyle} placeholder="Leave blank if no budget constraint" />
                                <span className="text-xs text-gray-500">If set, the system size may be reduced to fit this budget.</span>
                            </div>
                        </fieldset>

                        {/* Appliance Details */}
                        <fieldset className={fieldsetStyle + ' md:col-span-2'}> {/* Span full width */}
                             <legend className={legendStyle}>Appliance Details (Enter if not using kWh/Bill above)</legend>
                            {appliances.map((appliance) => (
                                <div key={appliance.id} className="grid grid-cols-6 gap-2 items-end mb-3 border-b pb-2 border-dashed">
                                     {/* Appliance Selector */}
                                    <div className="col-span-6 sm:col-span-2">
                                         <label className="text-xs font-medium text-gray-600">Appliance*</label>
                                         <select value={appliance.name} onChange={e => updateAppliance(appliance.id, 'name', e.target.value)} className={selectStyle + ' text-sm'}>
                                             <option value="custom">-- Custom --</option>
                                             {(applianceCategories[userType] || []).map(app => (
                                                <option key={app.name} value={app.name}>{app.name} ({app.power}W)</option>
                                            ))}
                                        </select>
                                     </div>
                                     {/* Custom Name Input (conditional) */}
                                    {appliance.name === 'custom' && (
                                         <div className="col-span-6 sm:col-span-2">
                                            <label className="text-xs font-medium text-gray-600">Custom Name*</label>
                                            <input type="text" placeholder="e.g., Freezer Large" value={appliance.customName || ''} onChange={e => updateAppliance(appliance.id, 'customName', e.target.value)} className={inputStyle + ' text-sm'} required/>
                                         </div>
                                     )}
                                    {/* Power Input */}
                                    <div className={`col-span-3 sm:col-span-1 ${appliance.name === 'custom' ? '' : 'sm:col-start-3'}`}> {/* Adjust column start */}
                                        <label className="text-xs font-medium text-gray-600">Power (W)*</label>
                                        <input type="number" placeholder="W" value={appliance.power} onChange={e => updateAppliance(appliance.id, 'power', e.target.value)} className={inputStyle + ' text-sm'} min="0" required />
                                    </div>
                                    {/* Quantity Input */}
                                    <div className="col-span-3 sm:col-span-1">
                                        <label className="text-xs font-medium text-gray-600">Qty*</label>
                                        <input type="number" placeholder="Qty" value={appliance.quantity} onChange={e => updateAppliance(appliance.id, 'quantity', e.target.value)} className={inputStyle + ' text-sm'} min="1" required />
                                    </div>
                                    {/* Hours Input */}
                                     <div className="col-span-3 sm:col-span-1">
                                        <label className="text-xs font-medium text-gray-600">Hrs/Day*</label>
                                        <input type="number" step="0.5" placeholder="Hours" value={appliance.hoursPerDay} onChange={e => updateAppliance(appliance.id, 'hoursPerDay', e.target.value)} className={inputStyle + ' text-sm'} min="0" max="24" required/>
                                    </div>
                                    {/* Remove Button */}
                                    <div className="col-span-3 sm:col-span-1 flex items-end">
                                        <button type="button" onClick={() => removeAppliance(appliance.id)} className={buttonDangerStyle + " text-xs px-2 py-1 w-full"}>Remove</button>
                                    </div>
                                </div>
                             ))}
                             <div className="mt-4">
                                <button type="button" onClick={addAppliance} className={buttonSecondaryStyle} disabled={!!avgMonthlyKwh || !!avgMonthlyBill}>
                                    Add Appliance
                                 </button>
                                 {appliances.length > 0 && (
                                    <span className="ml-4 text-sm font-semibold">
                                         Total Daily Usage: {calculateDailyApplianceKwh.toFixed(2)} kWh
                                    </span>
                                )}
                                 {(!!avgMonthlyKwh || !!avgMonthlyBill) && <p className="text-xs text-red-600 mt-2">Appliance entry disabled when Avg kWh or Bill is entered above.</p>}
                            </div>
                         </fieldset>
                     </div> {/* End Grid */}

                    {/* Calculation Trigger */}
                    <div className="mt-8 text-center">
                         <button type="submit" className={buttonStyle + " px-6 py-3 text-lg"} disabled={calculating}>
                             {calculating ? 'Calculating...' : 'Calculate Solar System'}
                         </button>
                        {calculationError && <p className="mt-4 text-red-600 font-semibold whitespace-pre-line">{calculationError}</p>}
                     </div>
                </div> {/* End Card */}
             </form>

             {/* Results Section */}
             {calculationResult && (
                 <div className={cardStyle + " mt-8 border border-green-300 bg-green-50"}>
                    <h2 className={h2Style + " !text-green-800 !border-green-400"}>Solar System Results & Estimates</h2>

                    {/* Result Overview Grid */}
                    <div className={gridStyle}>
                        <div>
                            <h3 className={h3Style}>Project Summary</h3>
                            <p><strong>Location:</strong> {calculationResult.location}</p>
                             <p><strong>System Type:</strong> {calculationResult.systemType?.replace('-', ' ')}</p>
                             <p><strong>Daily Need:</strong> {calculationResult.dailyEnergyConsumptionKwh?.toFixed(2)} kWh <span className="text-xs">({calculationResult.energyConsumptionSource})</span></p>
                        </div>
                        <div>
                            <h3 className={h3Style}>Core Components</h3>
                            <p><strong>PV System Size:</strong> {calculationResult.pvSystem?.sizeKwP} kWp</p>
                            <p><strong>Panel Config:</strong> {calculationResult.pvSystem?.numberOfPanels} x {calculationResult.pvSystem?.panelWattage} Wp</p>
                             <p><strong>Inverter Size:</strong> {calculationResult.inverter?.sizeKva} kVA</p>
                         </div>
                    </div>

                    {/* Battery Details (Conditional) */}
                    {calculationResult.batterySystem && (
                        <>
                             <h3 className={h3Style}>Battery System (for {calculationResult.systemType})</h3>
                             <div className={gridStyle}>
                                <div>
                                     <p><strong>Actual Capacity:</strong> {calculationResult.batterySystem.actualCapacityKwh} kWh</p>
                                    <p><strong>Configuration:</strong> {calculationResult.batterySystem.numberOfUnits} x {calculationResult.batterySystem.unitCapacityKwh} kWh units</p>
                                    <p><strong>System Voltage:</strong> {calculationResult.batterySystem.voltage} V</p>
                                 </div>
                                 <div>
                                     <p><strong>Days of Autonomy:</strong> {calculationResult.batterySystem.autonomyDays}</p>
                                    <p><strong>Usable Capacity (DoD):</strong> {(calculationResult.batterySystem.depthOfDischarge * 100).toFixed(0)}%</p>
                                    {calculationResult.chargeController && <p><strong>Controller:</strong> Est. {calculationResult.chargeController.estimatedAmps}A {calculationResult.chargeController.type}</p> }
                                 </div>
                             </div>
                        </>
                     )}

                    {/* Energy Production */}
                    <div>
                        <h3 className={h3Style}>Energy Production</h3>
                        <p><strong>Est. Annual Production:</strong> {calculationResult.pvSystem?.estimatedAnnualProductionKwh} kWh</p>
                        <p className="text-xs text-gray-600">
                            (Based on PVGIS Avg Yield: {calculationResult.productionAnalysis?.avgDailyEnergyPerKwP_kWh} kWh/kWp/day
                            {calculationResult.productionAnalysis?.isMockPVGISData ? <span className="text-red-600 font-bold"> using MOCK data</span> : ''})
                        </p>
                        {/* Monthly Production Chart */}
                        {calculationResult.productionAnalysis?.monthlyProductionKwh?.length > 0 && (
                             <div className="mt-4 h-64 md:h-80"> {/* Fixed height container */}
                                 <Bar
                                     data={{
                                         labels: calculationResult.productionAnalysis.monthlyProductionKwh.map(m => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m.month-1]),
                                         datasets: [{
                                            label: 'Estimated Monthly Production (kWh)',
                                            data: calculationResult.productionAnalysis.monthlyProductionKwh.map(m => m.production.toFixed(0)),
                                             backgroundColor: 'rgba(75, 192, 192, 0.6)',
                                             borderColor: 'rgba(75, 192, 192, 1)',
                                             borderWidth: 1
                                         }]
                                     }}
                                     options={{
                                         responsive: true,
                                         maintainAspectRatio: false, // Important for fixed height container
                                         scales: { y: { beginAtZero: true, title: { display: true, text: 'Energy (kWh)' } } }
                                    }}
                                 />
                            </div>
                        )}
                    </div>

                    {/* Financial Analysis */}
                     <div className="mt-6 pt-4 border-t">
                        <h3 className={h3Style}>Financial Estimates ({calculationResult.financial?.currency})</h3>
                         <div className={gridStyle}>
                             <div> {/* Left Column */}
                                 <p><strong>Total Estimated Cost:</strong> <span className="font-bold">{calculationResult.financial?.estimatedTotalCost?.toLocaleString()}</span></p>
                                {calculationResult.financial?.budget?.constraintApplied && (
                                     <p className="text-sm text-orange-700">
                                         System size reduced to meet budget of {calculationResult.financial.budget.target?.toLocaleString()}. (Original est: {calculationResult.financial.budget.initialCalculatedCost?.toLocaleString()})
                                    </p>
                                )}
                                <p><strong>Estimated Annual Savings:</strong> {calculationResult.financial?.estimatedAnnualSavings?.toLocaleString()}</p>
                                 <p><strong>Simple Payback Period:</strong> {calculationResult.financial?.simplePaybackYears ? `${calculationResult.financial.simplePaybackYears} years` : 'N/A'}</p>
                            </div>
                             <div> {/* Right Column - Cost Breakdown */}
                                 <h4 className="text-md font-semibold mb-1">Cost Breakdown:</h4>
                                 {/* Optional: Use a Pie chart here too */}
                                 <ul className="text-sm space-y-1">
                                     <li>Panels: {calculationResult.financial?.costBreakdown?.panels?.toLocaleString()}</li>
                                    <li>Inverter: {calculationResult.financial?.costBreakdown?.inverter?.toLocaleString()}</li>
                                     {calculationResult.financial?.costBreakdown?.batteries > 0 && <li>Batteries: {calculationResult.financial?.costBreakdown?.batteries?.toLocaleString()}</li>}
                                    {calculationResult.financial?.costBreakdown?.chargeController > 0 && <li>Charge Controller: {calculationResult.financial?.costBreakdown?.chargeController?.toLocaleString()}</li>}
                                    <li>Mounting: {calculationResult.financial?.costBreakdown?.mounting?.toLocaleString()}</li>
                                     <li>Installation: {calculationResult.financial?.costBreakdown?.installation?.toLocaleString()}</li>
                                 </ul>
                                  <div className="mt-4 h-40"> {/* Pie chart for costs */}
                                      <Pie
                                         data={{
                                            labels: ['Panels', 'Inverter', 'Batteries', 'Controller', 'Mounting', 'Installation'].filter((_, i) => {
                                                  // Filter out zero-cost components like batteries/controller if not applicable
                                                  const costs = calculationResult.financial?.costBreakdown;
                                                   if (i === 2 && !(costs?.batteries > 0)) return false;
                                                   if (i === 3 && !(costs?.chargeController > 0)) return false;
                                                  return true;
                                            }),
                                            datasets: [{
                                                data: [
                                                     calculationResult.financial?.costBreakdown?.panels || 0,
                                                    calculationResult.financial?.costBreakdown?.inverter || 0,
                                                     calculationResult.financial?.costBreakdown?.batteries || 0,
                                                    calculationResult.financial?.costBreakdown?.chargeController || 0,
                                                     calculationResult.financial?.costBreakdown?.mounting || 0,
                                                    calculationResult.financial?.costBreakdown?.installation || 0
                                                ].filter(cost => cost > 0), // Filter out zero costs data too
                                                backgroundColor: ['#36A2EB', '#FF6384', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'],
                                             }]
                                         }}
                                        options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }}
                                    />
                                 </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions: Save & PDF */}
                    <div className="mt-8 flex justify-center space-x-4">
                        {isLoggedIn && (
                             <button onClick={saveCalculation} className={buttonSecondaryStyle} disabled={!calculationInputParams /* Disable if inputs changed since calc */}>
                                {authMessage.includes("Saving") ? 'Saving...' : 'Save This Calculation'}
                             </button>
                        )}
                         <button onClick={handleGeneratePDF} className={buttonStyle}>
                            Generate PDF Report
                         </button>
                     </div>

                    {/* Assumptions */}
                    <div className="mt-6 text-xs text-gray-500 border-t pt-2">
                        <p><strong>Assumptions used:</strong> Panel Watts: {calculationResult.assumptions?.panelWattageUsed}Wp,
                         {calculationResult.assumptions?.systemVoltage && ` Sys Voltage: ${calculationResult.assumptions.systemVoltage}V,`}
                         {calculationResult.assumptions?.batteryDoD && ` Batt DoD: ${(calculationResult.assumptions.batteryDoD * 100).toFixed(0)}%,`}
                         Loss Param: {calculationResult.assumptions?.pvgisSystemLossParam || 'N/A'}%
                        {/* Add more key assumptions if needed */}
                        </p>
                         <p className="italic mt-1">Cost estimates are based on mock regional pricing ({calculationResult.financial?.currency}). PVGIS data retrieval for {calculationResult.location}.</p>
                     </div>
                </div>
            )}

            <footer className="mt-12 text-center text-xs text-gray-500 border-t pt-4">
                 <p>SolarFit Calculator &copy; {new Date().getFullYear()}</p>
                 <p>This tool provides estimates. Actual system performance and costs depend on specific site conditions, equipment choices, and installation quality. Always consult a qualified professional.</p>
            </footer>

        </div> // End Main Container
     );
}

export default HomePage;