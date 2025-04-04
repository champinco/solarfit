import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import Tesseract from 'tesseract.js';
import { Bar } from 'react-chartjs-2';
import Chart from 'chart.js/auto'; // Required for Chart.js v3+

function HomePage() {
    // Auth State
    const [token, setToken] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoggedIn, setIsLoggedIn] = useState(false);

    // OCR State
    const [uploading, setUploading] = useState(false);
    const [ocrProgress, setOcrProgress] = useState(0);
    const [ocrText, setOcrText] = useState(''); // Store raw OCR text for debugging/refinement
    const [extractedData, setExtractedData] = useState(null); // Holds { consumptionKwh, totalAmount, billingPeriod, tariffInfo }
    const [lastUploadFilename, setLastUploadFilename] = useState('');

    // Input Parameter State
    const [location, setLocation] = useState('');
    const [systemType, setSystemType] = useState('on-grid');
    const [roofArea, setRoofArea] = useState(''); // Still here, but not used in backend calc yet
    const [roofType, setRoofType] = useState('iron-sheets'); // Not used in backend calc yet
    const [avgMonthlyKwh, setAvgMonthlyKwh] = useState('');
    const [avgMonthlyBill, setAvgMonthlyBill] = useState('');
    const [electricityPricePerKwh, setElectricityPricePerKwh] = useState(''); // New input
    const [userType, setUserType] = useState('residential');
    const [autonomyDays, setAutonomyDays] = useState(1);
    const [depthOfDischarge, setDepthOfDischarge] = useState(0.8); // New input for battery DoD
    const [budget, setBudget] = useState('');
    const [appliances, setAppliances] = useState([]);
    const [applianceCategories, setApplianceCategories] = useState({ residential: [], commercial: [], industrial: [] });
    const [tilt, setTilt] = useState(15); // Default based on backend
    const [azimuth, setAzimuth] = useState(180); // Default based on backend (South)
    const [shading, setShading] = useState(0);
    const [panelWattage, setPanelWattage] = useState(450); // New input for panel size

    // Calculation Result State
    const [calculationResult, setCalculationResult] = useState(null);
    const [calculating, setCalculating] = useState(false);
    const [calculationError, setCalculationError] = useState('');
    const [calculationInputParams, setCalculationInputParams] = useState(null); // Store inputs used for the calculation

    // Backend URL
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'; // Ensure this is set in your .env file for Next.js


    useEffect(() => {
        // Check localStorage for token on initial load (Client-side only)
        if (typeof window !== 'undefined') {
            const storedToken = localStorage.getItem('token') || '';
            setToken(storedToken);
            setIsLoggedIn(!!storedToken);
        }
        // Fetch appliance list
        const fetchAppliances = async () => {
            try {
                const response = await axios.get(`${backendUrl}/api/appliances`);
                setApplianceCategories(response.data);
            } catch (error) {
                console.error('Failed to fetch appliance list:', error);
                // Optionally set an error state to inform the user
            }
        };
        fetchAppliances();
    }, [backendUrl]); // Rerun if backendUrl changes (though unlikely)


    // --- OCR Processing ---
    const onDropAccepted = useCallback(async (acceptedFiles) => {
        if (uploading) return;
        const file = acceptedFiles[0];
        setUploading(true);
        setOcrProgress(0);
        setOcrText('');
        setExtractedData(null); // Clear previous extracted data
        setCalculationResult(null); // Clear previous calculation
        setCalculationError('');
        setLastUploadFilename(file.name);

        try {
             // Using Tesseract.js logger for progress
            const { data: { text } } = await Tesseract.recognize(
                file,
                'eng',
                {
                    logger: m => {
                        // console.log(m) // Log detailed progress
                        if (m.status === 'recognizing text') {
                           setOcrProgress(Math.round(m.progress * 100));
                        }
                     }
                 }
            );
            console.log('OCR Raw Text:', text); // Debugging: Log raw text
            setOcrText(text); // Save raw text

             // Improved Regex Patterns (Still needs refinement based on actual bills)
             // More tolerant to spacing and case variations. Added KES/Ksh.
            const consumptionMatch = text.match(/Total\s+Consumption.*?(\d{1,5}(?:\.\d+)?)\s*(kWh|KWH|kw\s*h|units)/i) || text.match(/Consumption\s+Units.*?(\d{1,5}(?:\.\d+)?)/i) || text.match(/(\d{1,5}(?:\.\d+)?)\s*kWh/i);
            const amountMatch = text.match(/(?:Total\s*Amount\s*Due|Amount\sPayable|TOTAL\s*BILL).{0,20}?KES?[:\s]*([\d,]+\.?\d*)/i) || text.match(/Total\s+Bill.*?([\d,]+\.?\d*)/i) ; // Look for amount after "Total Amount Due/Payable/Bill" with optional KES/Ksh
             const periodMatch = text.match(/Billing\s+Period\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4}\s+to\s+\d{1,2}\/\d{1,2}\/\d{4})/i) || text.match(/Period\s*:\s*(.*?)\s*\n/i);
            const tariffMatch = text.match(/Rate\s+Schedule\s*[:\-]?\s*(.*?)\s*\n/i) || text.match(/Tariff\s*[:\-]?\s*(\S+)/i);

             // Helper to clean and parse numbers (removes commas)
            const parseNumber = (str) => {
                if (!str) return null;
                 return parseFloat(str.replace(/,/g, ''));
            };

             const extracted = {
                 consumptionKwh: consumptionMatch ? parseNumber(consumptionMatch[1]) : null,
                 totalAmount: amountMatch ? parseNumber(amountMatch[1]) : null,
                 billingPeriod: periodMatch ? periodMatch[1].trim() : 'Not Found',
                 tariffInfo: tariffMatch ? tariffMatch[1].trim() : 'Not Found',
             };
             setExtractedData(extracted);
             console.log("Extracted Data:", extracted);

            // Pre-fill form fields if data was found
             if (extracted.consumptionKwh) setAvgMonthlyKwh(extracted.consumptionKwh.toString());
             if (extracted.totalAmount) setAvgMonthlyBill(extracted.totalAmount.toString());

        } catch (error) {
            console.error('OCR error:', error);
            alert('Failed to process the bill image. Please check the console for details.');
            setCalculationError('OCR failed. Please enter usage manually.');
        } finally {
            setUploading(false);
            setOcrProgress(100); // Indicate completion
        }
    }, [uploading]); // Dependency array includes uploading state


    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpeg', '.jpg'] },
        maxFiles: 1,
        onDropAccepted,
        onDropRejected: (rejectedFiles) => alert(rejectedFiles[0]?.errors[0]?.message || 'File type not accepted. Please upload PNG or JPG.'),
        disabled: uploading,
    });

    // --- Appliance Management ---
    const addAppliance = () => {
        const applianceOptions = applianceCategories[userType] || [];
        if (applianceOptions.length === 0 && userType) { // Check if categories exist for the type
             // Provide default empty structure if needed, or prevent adding
             // setAppliances([...appliances, { name: 'custom', customName: '', power: 0, quantity: 1, hoursPerDay: 1 }]);
             alert(`Appliance list for ${userType} is empty or not loaded.`);
             return;
         }
        setAppliances([...appliances, { name: 'custom', customName: '', power: 0, quantity: 1, hoursPerDay: 1 }]);
    };

    const updateAppliance = (index, field, value) => {
         // Ensure numeric fields are parsed correctly or default to 0/1
        let parsedValue = value;
         if (field === 'power' || field === 'quantity' || field === 'hoursPerDay') {
            parsedValue = parseInt(value, 10);
             if (isNaN(parsedValue) || parsedValue < (field === 'power' ? 0 : 1)) {
                 parsedValue = (field === 'power' ? 0 : 1); // Default to minimum valid value
            }
        }
        if (field === 'hoursPerDay' && parsedValue > 24) parsedValue = 24; // Max 24 hours


        const updatedAppliances = appliances.map((appliance, i) => {
            if (i === index) {
                const updatedAppliance = { ...appliance, [field]: parsedValue };
                // If selecting a predefined appliance, update power and clear custom name
                if (field === 'name' && value !== 'custom') {
                     const selectedAppliance = (applianceCategories[userType] || []).find(a => a.name === value);
                     if (selectedAppliance) {
                        updatedAppliance.power = selectedAppliance.power;
                         updatedAppliance.customName = ''; // Clear custom name when predefined is selected
                    }
                }
                // Ensure name is 'custom' if customName or power is edited directly while a predefined was selected
                if ((field === 'customName' || field === 'power') && appliance.name !== 'custom') {
                    // Don't auto-switch back to 'custom' if they edit power for a *selected* predefined item - let them override.
                    // updatedAppliance.name = 'custom'; // Maybe revert this auto-switch for flexibility? Let's allow override.
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
             return sum + (powerW / 1000 * quantity * hours);
         }, 0);
     };


    // --- Auth Handlers ---
    const handleSignup = async () => {
        try {
            await axios.post(`${backendUrl}/api/signup`, { username, password });
            alert('Signup successful! Please log in.');
            setUsername('');
            setPassword('');
        } catch (error) {
             console.error("Signup failed:", error.response || error);
            alert(`Signup failed: ${error.response?.data?.message || error.message}`);
        }
    };

    const handleLogin = async () => {
        try {
            const response = await axios.post(`${backendUrl}/api/login`, { username, password });
            const { token } = response.data;
            setToken(token);
            localStorage.setItem('token', token); // Persist token
            setIsLoggedIn(true);
            setUsername('');
            setPassword('');
            // Optionally fetch user data or saved calculations here
        } catch (error) {
            console.error("Login failed:", error.response || error);
            alert(`Login failed: ${error.response?.data?.message || error.message}`);
        }
    };

    const handleLogout = () => {
        setToken('');
        localStorage.removeItem('token');
        setIsLoggedIn(false);
        setCalculationResult(null); // Clear results on logout
        setUsername(''); // Clear fields if needed
        setPassword('');
    };


    // --- Calculation & Results ---
    const handleCalculateClick = async () => {
        setCalculating(true);
        setCalculationResult(null);
        setCalculationError('');
        setCalculationInputParams(null); // Clear previous inputs

         // --- Input Validation (Frontend) ---
         if (!location) {
            setCalculationError('Project Location is required.');
            setCalculating(false);
            return;
        }
         const energyProvided = avgMonthlyKwh || avgMonthlyBill || appliances.length > 0;
         if (!energyProvided) {
             setCalculationError('Please provide energy usage: Avg. Monthly kWh, Avg. Monthly Bill, or detailed appliances.');
             setCalculating(false);
             return;
         }
        if (systemType !== 'on-grid' && (!autonomyDays || autonomyDays < 1)) {
             setCalculationError('Autonomy days (>= 1) are required for off-grid/hybrid systems.');
             setCalculating(false);
             return;
        }
         if (systemType !== 'on-grid' && (!depthOfDischarge || depthOfDischarge <= 0 || depthOfDischarge > 1)) {
            setCalculationError('Valid Battery Depth of Discharge (e.g., 0.8 for 80%) is required for off-grid/hybrid systems.');
             setCalculating(false);
             return;
        }
         if (!electricityPricePerKwh || electricityPricePerKwh <= 0) {
            setCalculationError('Current Electricity Price (per kWh) is needed for financial estimates.');
             // Decide if this is a hard requirement or just a warning
             // setCalculating(false); return; // Uncomment for hard requirement
             console.warn("Electricity price not provided, payback period will not be calculated.");
         }


         // Consolidate parameters for the backend
        const sizingParameters = {
            location,
            systemType,
            roofArea: roofArea ? parseFloat(roofArea) : null, // Still sending, though not used in calc
            roofType, // Still sending
            avgMonthlyKwh: avgMonthlyKwh ? parseFloat(avgMonthlyKwh) : null,
            avgMonthlyBill: avgMonthlyBill ? parseFloat(avgMonthlyBill) : null,
            electricityPricePerKwh: electricityPricePerKwh ? parseFloat(electricityPricePerKwh) : null,
            userType,
            autonomyDays: systemType !== 'on-grid' ? parseInt(autonomyDays) || 1 : null,
             depthOfDischarge: systemType !== 'on-grid' ? parseFloat(depthOfDischarge) || 0.8 : null,
            budget: budget ? parseFloat(budget) : null,
            appliances: appliances.length > 0 ? appliances.map(a => ({
                name: a.customName || a.name, // Send custom name if exists
                power: a.power || 0,
                quantity: a.quantity || 1,
                hoursPerDay: a.hoursPerDay || 0,
            })) : null,
            tilt: parseFloat(tilt) || 0,
            azimuth: parseFloat(azimuth) || 180,
            shading: parseFloat(shading) || 0,
             panelWattage: parseInt(panelWattage) || 450, // Send panel wattage
        };

        setCalculationInputParams(sizingParameters); // Save the parameters used for this calculation

        try {
            console.log("Sending calculation request:", sizingParameters);
            const response = await axios.post(`${backendUrl}/api/calculate`, sizingParameters);
            console.log("Calculation response:", response.data);
            setCalculationResult(response.data);
        } catch (error) {
             console.error('Calculation API error:', error.response || error);
             setCalculationError(`Calculation failed: ${error.response?.data?.message || error.message}. Check console for details.`);
        } finally {
            setCalculating(false);
        }
    };


     const saveCalculation = async () => {
        if (!calculationResult || !isLoggedIn || !calculationInputParams) {
             alert("Cannot save: No calculation result available, not logged in, or input parameters missing.");
             return;
         }
         try {
             const payload = {
                 calculationParams: calculationInputParams, // Send the inputs used
                 resultData: calculationResult          // Send the results
             };
            await axios.post(`${backendUrl}/api/save-calculation`, payload, {
                headers: { Authorization: `Bearer ${token}` },
            });
            alert('Calculation saved successfully!');
        } catch (error) {
            console.error("Save calculation failed:", error.response || error);
            alert(`Save failed: ${error.response?.data?.message || 'Please try again.'}`);
        }
    };

    const handleGeneratePDF = async () => {
        if (!calculationResult) {
            alert('Please perform a calculation first.');
            return;
        }
        try {
             // Pass the entire calculationResult object to the backend
            const response = await axios.post(`${backendUrl}/api/generate-pdf`, calculationResult, {
                 responseType: 'blob', // Important for file download
                 headers: { Accept: 'application/pdf' }
             });

            // Create a URL for the blob and trigger download
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            const filename = `SolarReport_${calculationResult.location?.replace(/\s+/g, '_') || 'Details'}.pdf`;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();

            // Clean up
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

        } catch (error) {
             console.error('PDF generation failed:', error.response || error);
             // Attempt to read error message if backend sent JSON in blob
            let errorMsg = 'PDF generation failed. See console.';
             if (error.response && error.response.data instanceof Blob && error.response.data.type === "application/json") {
                 try {
                    const errJson = JSON.parse(await error.response.data.text());
                     errorMsg = `PDF generation failed: ${errJson.message || 'Server error'}`;
                 } catch (parseError) { /* Ignore if parsing fails */ }
             } else if(error.response?.data?.message) {
                errorMsg = `PDF generation failed: ${error.response.data.message}`;
            }
             alert(errorMsg);
        }
    };


    // --- Styles --- (using object notation for inline styles)
    const pageStyle = { maxWidth: '900px', margin: '20px auto', padding: '20px 40px', fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', background: '#f9f9f9', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' };
    const sectionStyle = { marginTop: '40px', paddingTop: '20px', borderTop: '1px solid #eee' };
    const formGroupStyle = { display: 'flex', flexDirection: 'column', marginBottom: '18px' };
    const labelStyle = { marginBottom: '6px', fontWeight: '600', fontSize: '0.9em', color: '#333' };
    const inputStyle = { padding: '10px 12px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1em', width: '100%', boxSizing: 'border-box' };
     const selectStyle = { padding: '10px 12px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1em', width: '100%', boxSizing: 'border-box', background: '#fff' };
     const buttonStyle = { padding: '10px 18px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1em', transition: 'background-color 0.2s ease' };
     const buttonDisabledStyle = { ...buttonStyle, backgroundColor: '#ccc', cursor: 'not-allowed' };
    const buttonSecondaryStyle = { ...buttonStyle, backgroundColor: '#6c757d'};
    const buttonDangerStyle = { ...buttonStyle, backgroundColor: '#dc3545'};
     const removeButtonStyle = { padding: '5px 10px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8em', marginLeft: 'auto'};
     const dropzoneBaseStyle = { border: `2px dashed #ccc`, padding: '30px', textAlign: 'center', cursor: 'pointer', backgroundColor:  '#fff', marginBottom: '20px', borderRadius: '4px' };
     const dropzoneActiveStyle = { borderColor: '#2196f3', backgroundColor: '#f0f8ff' };
     const dropzoneAcceptStyle = { borderColor: '#00e676' };
     const dropzoneRejectStyle = { borderColor: '#ff1744' };
     const dropzoneDisabledStyle = { cursor: 'not-allowed', backgroundColor: '#eee' };

     // Combine dropzone styles based on state
    const getDropzoneStyle = useCallback(() => ({
        ...dropzoneBaseStyle,
        ...(isDragActive ? dropzoneActiveStyle : {}),
        // ...(isDragAccept ? dropzoneAcceptStyle : {}), // useDropzone v11+ might deprecate these specific state props
        // ...(isDragReject ? dropzoneRejectStyle : {}),
        ...(uploading ? dropzoneDisabledStyle : {}),
    }), [isDragActive, uploading]); // Removed isDragAccept, isDragReject as direct props might change

     const h2Style = { textAlign: 'center', color: '#0056b3', marginBottom: '30px', borderBottom: '2px solid #0056b3', paddingBottom: '10px'};
     const h3Style = { color: '#0056b3', marginBottom: '15px', marginTop: '25px'};
     const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px 30px' };
     const fullWidthStyle = { gridColumn: '1 / -1' };
     const resultBoxStyle = { padding: '25px', backgroundColor: '#f0fff4', border: '1px solid #b8ddc4', borderRadius: '8px', marginTop: '20px'};
     const errorStyle = { color: 'red', fontWeight: 'bold', marginTop: '10px', padding: '10px', border: '1px solid red', borderRadius: '4px', background: '#ffeeee' };
     const ocrResultStyle = { padding: '15px', border: '1px solid #e0e0e0', backgroundColor: '#fdfdfd', marginTop: '15px', borderRadius: '4px' };
     const fieldsetBorderStyle = { border: '1px solid #ccc', padding: '20px', borderRadius: '5px', marginBottom: '20px'};
     const legendStyle = {fontWeight: 'bold', color: '#0056b3', padding: '0 10px'}


    return (
        <div style={pageStyle}>
            <h1>Solar System Sizing Calculator</h1>

             {/* --- Login/Signup Section --- */}
             <section>
                {!isLoggedIn ? (
                     <div>
                        <h2 style={h2Style}>Login / Signup</h2>
                        <div style={gridStyle}>
                             <div style={formGroupStyle}><label style={labelStyle} htmlFor="username">Username:</label><input id="username" value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} /></div>
                             <div style={formGroupStyle}><label style={labelStyle} htmlFor="password">Password:</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} /></div>
                        </div>
                         <div style={{marginTop: '10px'}}>
                            <button onClick={handleSignup} style={{...buttonSecondaryStyle, marginRight: '10px'}}>Signup</button>
                            <button onClick={handleLogin} style={buttonStyle}>Login</button>
                        </div>
                     </div>
                ) : (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                             <h2 style={{...h2Style, textAlign: 'left', marginBottom: 0, borderBottom: 'none', paddingBottom: 0}}>Welcome!</h2>
                            <button onClick={handleLogout} style={buttonDangerStyle}>Logout</button>
                        </div>
                         {/* Optionally add link to view saved calculations */}
                     </div>
                 )}
            </section>


            {/* --- OCR Bill Upload Section --- */}
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
                {lastUploadFilename && <p style={{fontSize: '0.9em', color: '#555'}}>Last file: <strong>{lastUploadFilename}</strong></p>}

                 {/* Display Extracted Data and Allow Correction */}
                 {extractedData && (
                     <div style={ocrResultStyle}>
                        <h3 style={{...h3Style, marginTop: 0 }}>OCR Results (Verify & Correct):</h3>
                        <p>Billing Period: {extractedData.billingPeriod || 'Not Found'}</p>
                        <p>Tariff/Rate: {extractedData.tariffInfo || 'Not Found'}</p>
                        {/* Add input fields for correction */}
                         <div style={formGroupStyle}>
                            <label style={labelStyle}>Detected Avg. Monthly kWh:</label>
                            <input
                                type="number"
                                style={inputStyle}
                                value={avgMonthlyKwh} // Bind to the main state variable
                                onChange={(e) => setAvgMonthlyKwh(e.target.value)} // Allow direct edit
                                placeholder="Enter kWh if not found/incorrect"
                             />
                         </div>
                         <div style={formGroupStyle}>
                            <label style={labelStyle}>Detected Avg. Monthly Bill (KES):</label>
                            <input
                                type="number"
                                style={inputStyle}
                                value={avgMonthlyBill} // Bind to the main state variable
                                onChange={(e) => setAvgMonthlyBill(e.target.value)} // Allow direct edit
                                placeholder="Enter Bill Amount if not found/incorrect"
                            />
                        </div>
                        <p style={{fontSize: '0.8em', color: 'gray', marginTop:'10px'}}>You can also fill/override these values manually below.</p>
                    </div>
                )}
                 {/* Display raw OCR text for debugging if needed
                {ocrText && (
                    <details style={{ marginTop: '10px' }}>
                        <summary>Show Raw OCR Text</summary>
                        <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', background: '#eee', padding: '10px', fontSize: '0.8em', maxHeight: '200px', overflowY: 'auto' }}>
                            {ocrText}
                        </pre>
                    </details>
                )}
                */}

            </section>

             {/* --- Manual Sizing Details Section --- */}
             <section style={sectionStyle}>
                <h2 style={h2Style}>2. Enter Project Details & Energy Needs</h2>
                <div style={gridStyle}>

                     {/* Location & System Type */}
                     <fieldset style={fieldsetBorderStyle}>
                         <legend style={legendStyle}>Location & System</legend>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="location">Project Location:*</label>
                            <input id="location" value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} placeholder="e.g., Nairobi, Kenya" required />
                        </div>
                         <div style={formGroupStyle}>
                             <label style={labelStyle} htmlFor="systemType">System Type:*</label>
                             <select id="systemType" value={systemType} onChange={(e) => setSystemType(e.target.value)} style={selectStyle} required>
                                 <option value="on-grid">On-Grid (Connected to Utility)</option>
                                 <option value="off-grid">Off-Grid (No Utility Connection)</option>
                                 <option value="hybrid">Hybrid (Grid + Battery Backup)</option>
                             </select>
                         </div>
                         <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="userType">User Type:*</label>
                            <select id="userType" value={userType} onChange={(e) => { setUserType(e.target.value); setAppliances([]); }} style={selectStyle} required>
                                <option value="residential">Residential</option>
                                <option value="commercial">Commercial</option>
                                <option value="industrial">Industrial</option>
                            </select>
                         </div>
                     </fieldset>

                    {/* Energy Consumption */}
                    <fieldset style={fieldsetBorderStyle}>
                         <legend style={legendStyle}>Energy Consumption*</legend>
                        <p style={{fontSize:'0.85em', color: '#555', marginBottom: '15px'}}>Enter details below OR list appliances.</p>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="avgMonthlyKwh">Avg. Monthly kWh:</label>
                            <input id="avgMonthlyKwh" type="number" value={avgMonthlyKwh} onChange={(e) => setAvgMonthlyKwh(e.target.value)} style={inputStyle} placeholder="From bill or estimate" />
                         </div>
                         <div style={formGroupStyle}>
                             <label style={labelStyle} htmlFor="avgMonthlyBill">Avg. Monthly Bill (KES):</label>
                             <input id="avgMonthlyBill" type="number" value={avgMonthlyBill} onChange={(e) => setAvgMonthlyBill(e.target.value)} style={inputStyle} placeholder="From bill or estimate"/>
                         </div>
                         <div style={formGroupStyle}>
                             <label style={labelStyle} htmlFor="electricityPrice">Current Electricity Price (KES/kWh):*</label>
                            <input id="electricityPrice" type="number" step="0.1" value={electricityPricePerKwh} onChange={(e) => setElectricityPricePerKwh(e.target.value)} style={inputStyle} placeholder="e.g., 25.5" required />
                             <small style={{fontSize: '0.8em', color: '#666', marginTop:'3px'}}>Needed for payback calculation.</small>
                         </div>
                    </fieldset>

                     {/* Battery Details (Conditional) */}
                    {systemType !== 'on-grid' && (
                         <fieldset style={fieldsetBorderStyle}>
                            <legend style={legendStyle}>Battery Details</legend>
                             <div style={formGroupStyle}>
                                 <label style={labelStyle} htmlFor="autonomyDays">Days of Autonomy:*</label>
                                <input id="autonomyDays" type="number" value={autonomyDays} onChange={(e) => setAutonomyDays(e.target.value)} style={inputStyle} min="1" required />
                                <small style={{fontSize: '0.8em', color: '#666', marginTop:'3px'}}>How many days should the battery last without sun?</small>
                            </div>
                             <div style={formGroupStyle}>
                                <label style={labelStyle} htmlFor="dod">Battery Depth of Discharge (DoD):*</label>
                                <input id="dod" type="number" step="0.05" min="0.1" max="1.0" value={depthOfDischarge} onChange={(e) => setDepthOfDischarge(e.target.value)} style={inputStyle} required />
                                <small style={{fontSize: '0.8em', color: '#666', marginTop:'3px'}}>e.g., 0.8 for 80% DoD (Recommended for Li-ion)</small>
                             </div>
                        </fieldset>
                     )}

                    {/* Panel & Orientation Details */}
                     <fieldset style={fieldsetBorderStyle}>
                        <legend style={legendStyle}>Panel Configuration</legend>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="panelWattage">Panel Wattage (Wp):*</label>
                             <input id="panelWattage" type="number" value={panelWattage} onChange={(e) => setPanelWattage(e.target.value)} style={inputStyle} min="100" step="5" placeholder="e.g., 450" required />
                             <small style={{fontSize: '0.8em', color: '#666', marginTop:'3px'}}>Wattage of individual panels to be used.</small>
                         </div>
                        <div style={formGroupStyle}>
                            <label style={labelStyle} htmlFor="tilt">Panel Tilt (degrees):</label>
                             <input id="tilt" type="number" value={tilt} onChange={(e) => setTilt(e.target.value)} style={inputStyle} min="0" max="90" placeholder="Optimal usually near latitude" />
                        </div>
                        <div style={formGroupStyle}>
                             <label style={labelStyle} htmlFor="azimuth">Panel Azimuth (degrees):</label>
                             <input id="azimuth" type="number" value={azimuth} onChange={(e) => setAzimuth(e.target.value)} style={inputStyle} min="0" max="359" placeholder="180 = South, 0 = North" />
                         </div>
                        <div style={formGroupStyle}>
                             <label style={labelStyle} htmlFor="shading">Shading Losses (%):</label>
                            <input id="shading" type="number" value={shading} onChange={(e) => setShading(e.target.value)} style={inputStyle} min="0" max="100" />
                             <small style={{fontSize: '0.8em', color: '#666', marginTop:'3px'}}>Estimate % yearly energy loss due to shade.</small>
                         </div>
                    </fieldset>

                    {/* Optional Details */}
                     <fieldset style={fieldsetBorderStyle}>
                        <legend style={legendStyle}>Optional Details</legend>
                        <div style={formGroupStyle}>
                             <label style={labelStyle}>Budget (KES) (Optional):</label>
                             <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} style={inputStyle} placeholder="Enter max budget if applicable"/>
                         </div>
                        <div style={formGroupStyle}>
                             <label style={labelStyle}>Roof Area (sqm) (Optional):</label>
                             <input type="number" value={roofArea} onChange={(e) => setRoofArea(e.target.value)} style={inputStyle} placeholder="For future space checks" />
                        </div>
                         {/* <div style={formGroupStyle}> <label style={labelStyle}>Roof Type:</label> <select value={roofType} onChange={(e) => setRoofType(e.target.value)} style={selectStyle}> <option value="iron-sheets">Iron Sheets</option> <option value="tile">Tile</option> <option value="flat-concrete">Flat Concrete</option> </select> </div> */}
                     </fieldset>

                     {/* Appliance List (Full Width) */}
                     <fieldset style={{...fieldsetBorderStyle, ...fullWidthStyle}}>
                         <legend style={legendStyle}>Appliance Details (Alternative to kWh/Bill)</legend>
                        {appliances.map((appliance, index) => (
                            <div key={index} style={{ display: 'grid', gridTemplateColumns: appliance.name === 'custom' ? '2fr 1fr 1fr 0.5fr 0.5fr auto' : '3fr 1fr 0.5fr 0.5fr auto', gap: '10px', marginBottom: '10px', alignItems: 'center', paddingBottom: '10px', borderBottom: '1px dashed #eee' }}>
                                <select value={appliance.name} onChange={(e) => updateAppliance(index, 'name', e.target.value)} style={{ ...selectStyle }}>
                                    <option value="custom">-- Custom Appliance --</option>
                                    {(applianceCategories[userType] || []).map(app => <option key={app.name} value={app.name}>{app.name} ({app.power}W)</option>)}
                                </select>
                                {appliance.name === 'custom' && (
                                    <input type="text" placeholder="Appliance Name" value={appliance.customName || ''} onChange={(e) => updateAppliance(index, 'customName', e.target.value)} style={inputStyle} />
                                )}
                                 {/* Allow editing power even for predefined, but maybe show original value? */}
                                <input type="number" title="Power (W)" placeholder="Power (W)" value={appliance.power} onChange={(e) => updateAppliance(index, 'power', e.target.value)} style={inputStyle} min="0"/>
                                 <input type="number" title="Quantity" value={appliance.quantity} onChange={(e) => updateAppliance(index, 'quantity', e.target.value)} min="1" style={inputStyle} />
                                <input type="number" title="Hours/Day" value={appliance.hoursPerDay} onChange={(e) => updateAppliance(index, 'hoursPerDay', e.target.value)} min="0" max="24" style={inputStyle} />
                                <button onClick={() => removeAppliance(index)} style={removeButtonStyle} title="Remove Appliance">X</button>
                            </div>
                        ))}
                        <button onClick={addAppliance} style={{...buttonSecondaryStyle, marginTop:'10px'}} disabled={!applianceCategories[userType]?.length}>+ Add Appliance</button>
                         {appliances.length > 0 && (
                            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f0f8ff', borderRadius: '4px', border: '1px solid #cce0ff'}}>
                                <p style={{margin: 0}}><strong>Appliance Estimated Daily Use:</strong> {calculateDailyApplianceKwh().toFixed(2)} kWh</p>
                            </div>
                        )}
                    </fieldset>


                    {/* Calculation Button (Full Width) */}
                    <div style={fullWidthStyle}>
                        <button
                            onClick={handleCalculateClick}
                             disabled={calculating}
                             style={calculating ? buttonDisabledStyle : {...buttonStyle, backgroundColor: '#28a745', width: '100%', padding: '15px', fontSize: '1.2em'}}>
                             {calculating ? 'Calculating...' : 'Calculate System Size'}
                        </button>
                        {calculationError && <p style={errorStyle}>{calculationError}</p>}
                    </div>
                </div> {/* End Grid */}
            </section>


             {/* --- Calculation Results Section --- */}
             <section style={sectionStyle}>
                 <h2 style={h2Style}>3. Calculation Results</h2>
                 {calculating && <p>Calculating, please wait...</p>}
                 {!calculating && calculationResult && !calculationError && (
                     <div style={resultBoxStyle}>
                        <h3 style={h3Style}>System Specifications</h3>
                         <div style={gridStyle}>
                            <p><strong>PV Size:</strong> {calculationResult.pvSizeKwP?.toFixed(2) ?? 'N/A'} kWp</p>
                             <p><strong>Panels:</strong> {calculationResult.numberOfPanels ?? 'N/A'} x {calculationResult.panelWattage ?? 'N/A'} Wp</p>
                            <p><strong>Inverter Size:</strong> {calculationResult.inverterSizeKva?.toFixed(2) ?? 'N/A'} kVA</p>
                            {calculationResult.battery?.sizeKwh > 0 && (
                                <>
                                     <p><strong>Battery:</strong> {calculationResult.battery.sizeKwh?.toFixed(2)} kWh</p>
                                    <p><strong>No. of Batteries:</strong> {calculationResult.battery.numberOfUnits ?? 'N/A'} ({calculationResult.battery.unitCapacityKwh} kWh units)</p>
                                     <p><strong>Autonomy:</strong> {calculationResult.autonomyDays ?? 'N/A'} days</p>
                                </>
                            )}
                            <p><strong>Est. Annual Production:</strong> {calculationResult.annualProductionKwh?.toFixed(0) ?? 'N/A'} kWh</p>
                            <p><strong>Avg. Daily PSH:</strong> {calculationResult.dailyPeakSunHours?.toFixed(2) ?? 'N/A'} hrs</p>
                            <p><strong>Est. Payback:</strong> {calculationResult.simplePaybackYears?.toFixed(1) ?? 'N/A'} years</p>

                         </div>
                         {calculationResult.budgetConstrained && (
                             <p style={{color:'orange', fontWeight:'bold', marginTop:'10px'}}>Note: System size was reduced to meet the budget of KES {calculationResult.targetBudget?.toLocaleString()}.</p>
                         )}

                        <h3 style={h3Style}>Cost Breakdown (KES)</h3>
                         <div style={gridStyle}>
                             <p><strong>Panels:</strong> {calculationResult.estimatedCost?.panels?.toLocaleString() ?? 'N/A'}</p>
                            <p><strong>Inverter:</strong> {calculationResult.estimatedCost?.inverter?.toLocaleString() ?? 'N/A'}</p>
                            {calculationResult.estimatedCost?.batteries > 0 && <p><strong>Batteries:</strong> {calculationResult.estimatedCost?.batteries?.toLocaleString() ?? 'N/A'}</p>}
                            {calculationResult.estimatedCost?.chargeController > 0 && <p><strong>Charge Controller:</strong> {calculationResult.estimatedCost?.chargeController?.toLocaleString() ?? 'N/A'}</p>}
                            <p><strong>Mounting/Racking:</strong> {calculationResult.estimatedCost?.mounting?.toLocaleString() ?? 'N/A'}</p>
                             <p><strong>Installation Labor:</strong> {calculationResult.estimatedCost?.installation?.toLocaleString() ?? 'N/A'}</p>
                             <p style={{fontWeight: 'bold', gridColumn: '1 / -1'}}><strong>Total Estimated Cost: {calculationResult.estimatedCost?.total?.toLocaleString() ?? 'N/A'}</strong></p>
                        </div>

                         <h3 style={h3Style}>Monthly Energy Production (kWh)</h3>
                         {calculationResult.monthlyProduction && calculationResult.monthlyProduction.length > 0 ? (
                            <div style={{ maxWidth: '700px', margin: '20px auto' }}> {/* Constrain chart width */}
                                <Bar
                                     data={{
                                        labels: calculationResult.monthlyProduction.map(m => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m.month - 1]),
                                         datasets: [{
                                            label: 'Est. Production (kWh)',
                                             data: calculationResult.monthlyProduction.map(m => m.production.toFixed(0)), // Round to whole numbers
                                             backgroundColor: 'rgba(75, 192, 192, 0.6)',
                                             borderColor: 'rgba(75, 192, 192, 1)',
                                            borderWidth: 1,
                                        }],
                                    }}
                                     options={{
                                        responsive: true,
                                         maintainAspectRatio: true, // Let chart size based on container
                                        scales: { y: { beginAtZero: true, title: { display: true, text: 'kWh' } } },
                                         plugins: { legend: { display: false }, tooltip: { /* Add callbacks for custom tooltips if desired */ } }
                                     }}
                                />
                             </div>
                         ) : <p>Monthly production data not available.</p>}


                        <div style={{ marginTop: '30px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                            <button onClick={handleGeneratePDF} style={{...buttonStyle, backgroundColor: '#17a2b8'}}>Generate PDF Report</button>
                             {isLoggedIn && <button onClick={saveCalculation} style={buttonSecondaryStyle} disabled={!calculationInputParams}>Save Calculation</button>}
                        </div>
                    </div>
                )}
                 {!calculating && !calculationResult && !calculationError && <p>Enter details above and click "Calculate" to see results.</p>}

            </section>
        </div>
    );
}

export default HomePage;