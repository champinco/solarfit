import React, { useState, useCallback } from 'react'; // Import useState and useCallback
import { useDropzone } from 'react-dropzone';
import axios from 'axios'; // Import axios

function HomePage() {
  // --- State Variables ---
  const [extractedData, setExtractedData] = useState(null); // State for extracted data from backend
  const [uploading, setUploading] = useState(false); // State to track if upload/processing is in progress
  const [lastUploadFilename, setLastUploadFilename] = useState(''); // State to show the name of the last file attempted
  const [calculationResult, setCalculationResult] = useState(null); // State for calculation results
  const [calculating, setCalculating] = useState(false); // State for calculation progress
  const [calculationError, setCalculationError] = useState(''); // State for calculation errors

  // --- Sizing Form State ---
  const [location, setLocation] = useState(''); // e.g., City/Town
  const [systemType, setSystemType] = useState('on-grid'); // 'on-grid', 'off-grid', 'hybrid'
  const [roofArea, setRoofArea] = useState(''); // in square meters
  const [roofType, setRoofType] = useState('iron-sheets'); // 'iron-sheets', 'tiles', 'concrete-flat', 'other'
  const [avgMonthlyKwh, setAvgMonthlyKwh] = useState(''); // User's manual input for kWh
  const [avgMonthlyBill, setAvgMonthlyBill] = useState(''); // User's manual input for bill amount (KES, etc.)
  const [userType, setUserType] = useState('residential'); // 'residential', 'commercial', 'industrial'
  const [autonomyDays, setAutonomyDays] = useState(1); // Only for off-grid/hybrid
  const [budget, setBudget] = useState(''); // Optional budget input
  // --- End State Variables ---

  // --- File Drop Handler ---
  // Wrap onDropAccepted in useCallback to potentially optimize re-renders if needed
  const onDropAccepted = useCallback(async (acceptedFiles) => {
    if (uploading) return; // Prevent multiple simultaneous uploads

    const file = acceptedFiles[0]; // Get the single accepted file
    setUploading(true); // Indicate processing has started
    setExtractedData(null); // Clear any previous results
    setCalculationResult(null); // Clear previous calculation results too
    setCalculationError('');
    setLastUploadFilename(file.name); // Show the filename to the user

    const formData = new FormData();
    formData.append('bill', file); // Append the file with the key 'bill' (must match backend)

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('File upload successful:', response.data);
      const data = response.data.extractedData || {};
      setExtractedData(data);

      // --- Pre-fill form fields if data exists ---
      if (data.consumptionKwh !== null && data.consumptionKwh !== undefined) {
        setAvgMonthlyKwh(data.consumptionKwh.toString()); // Pre-fill kWh input, ensure it's a string for input value
      }
      if (data.totalAmount !== null && data.totalAmount !== undefined) {
        setAvgMonthlyBill(data.totalAmount.toString()); // Pre-fill bill amount input, ensure string
      }
      // --- End Pre-fill ---

    } catch (error) {
        console.error('File upload error:', error);
        setExtractedData(null); // Clear data display on error
        let errorMessage = 'File upload failed. Please try again.';
        if (error.response) {
             errorMessage += `\nServer Error (${error.response.status}): ${error.response.data.message || 'Unknown server error'}`;
        } else if (error.request) {
             errorMessage += '\nNo response received from server. Is the backend running?';
        } else {
             errorMessage += `\nError: ${error.message}`;
        }
        alert(errorMessage); // Show detailed error to the user
    } finally {
      setUploading(false); // Ensure uploading state is reset
    }
  }, [uploading]); // Dependency array for useCallback
  // --- End File Drop Handler ---

  // --- Dropzone Configuration ---
   const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpeg', '.jpg'] },
    maxFiles: 1,
    onDropAccepted: onDropAccepted,
    onDropRejected: (rejectedFiles) => {
        console.log('Rejected files:', rejectedFiles);
        let message = "File rejected.";
        if (rejectedFiles.length > 0 && rejectedFiles[0].errors.length > 0) {
            message = rejectedFiles[0].errors[0].message;
        }
        alert(`${message} Please upload a single image file (PNG, JPG, or JPEG).`);
    },
    disabled: uploading // Disable dropzone while uploading
  });
  // --- End Dropzone Configuration ---

  // --- Calculation Handler ---
  const handleCalculateClick = async () => {
    setCalculating(true);
    setCalculationResult(null);
    setCalculationError('');
    console.log("--- Starting Solar Size Calculation ---");

    // Basic Client-Side Validation
    if (!location) {
      setCalculationError("Please enter the Project Location.");
      setCalculating(false);
      return;
    }
    if (!avgMonthlyKwh && !avgMonthlyBill) {
      setCalculationError("Please enter either Average Monthly Energy (kWh) or Average Monthly Bill Amount.");
      setCalculating(false);
      return;
    }
     if ((systemType === 'off-grid' || systemType === 'hybrid') && (!autonomyDays || autonomyDays < 1)) {
      setCalculationError("Please enter valid Backup Days (Autonomy >= 1) for off-grid/hybrid systems.");
      setCalculating(false);
      return;
    }
    // Add more specific validations as needed (e.g., check if numbers are positive)

    const sizingParameters = {
      location,
      systemType,
      roofArea: roofArea ? parseFloat(roofArea) : null,
      roofType,
      avgMonthlyKwh: avgMonthlyKwh ? parseFloat(avgMonthlyKwh) : null,
      avgMonthlyBill: avgMonthlyBill ? parseFloat(avgMonthlyBill) : null,
      userType,
      autonomyDays: (systemType === 'off-grid' || systemType === 'hybrid') ? parseInt(autonomyDays) : null,
      budget: budget ? parseFloat(budget) : null,
    };

    console.log("Sending Sizing Parameters:", sizingParameters);

    try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
        // Calls the NEW /api/calculate endpoint on the backend
        const response = await axios.post(`${backendUrl}/api/calculate`, sizingParameters);

        console.log("Calculation Response:", response.data);
        setCalculationResult(response.data); // Store the results from the backend

    } catch (error) {
        console.error("Calculation API Error:", error);
        let errorMsg = "Calculation failed. Please try again.";
        if (error.response) {
             errorMsg += `\nServer Error (${error.response.status}): ${error.response.data.message || 'Unknown server error'}`;
        } else if (error.request) {
             errorMsg += '\nNo response received from calculation server.';
        } else {
             errorMsg += `\nError: ${error.message}`;
        }
        setCalculationError(errorMsg);
        setCalculationResult(null); // Clear any previous results
    } finally {
        setCalculating(false); // Calculation finished
    }
  };
  // --- End Calculation Handler ---


  // --- Inline Styles for Form ---
  const formGroupStyle = { display: 'flex', flexDirection: 'column', marginBottom: '15px' };
  const labelStyle = { marginBottom: '5px', fontWeight: 'bold', fontSize: '0.9em', color: '#333' };
  const inputStyle = { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1em' };
  const selectStyle = { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1em', backgroundColor: 'white' };
  const smallTextStyle = { fontSize: '0.8em', color: '#666', marginTop: '4px' };
  const dropzoneStyle = {
      border: `2px dashed ${uploading ? '#ccc' : isDragActive ? '#2196f3' : '#ccc'}`,
      padding: '20px', textAlign: 'center', cursor: uploading ? 'not-allowed' : 'pointer',
      backgroundColor: isDragActive ? '#f0f8ff' : '#ffffff', transition: 'border .24s ease-in-out, background-color .24s ease-in-out',
      marginBottom: '20px'
  };
  // --- End Inline Styles ---


  // --- Render Component ---
  return (
    <div style={{ maxWidth: '800px', margin: '20px auto', padding: '30px', fontFamily: 'Arial, sans-serif', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>

      {/* --- Section 1: Bill Upload --- */}
      <section>
          <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#0056b3' }}>1. Upload Your Bill (Optional)</h2>
          {/* Dropzone Area */}
          <div {...getRootProps()} style={dropzoneStyle}>
            <input {...getInputProps()} />
             { uploading ? <p style={{color: '#555'}}>Uploading & Processing Image...</p> : isDragActive ? <p style={{color: '#007bff'}}>Drop the image here!</p> : <p style={{color: '#555'}}>Drag 'n' drop bill image (PNG/JPG), or click to select <br/>(Helps pre-fill energy/cost below)</p> }
            <button type="button" onClick={(e) => { e.stopPropagation(); open(); }} disabled={uploading} style={{ marginTop: '10px', padding: '10px 20px', cursor: uploading ? 'not-allowed' : 'pointer', backgroundColor: uploading ? '#ccc' : '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}>
              {uploading ? 'Processing...' : 'Select Bill Image'}
            </button>
          </div>
           {/* File Name Display */}
          {lastUploadFilename && !uploading && (<div style={{ textAlign: 'center', color: '#333' }}><p>Last upload attempt: <strong>{lastUploadFilename}</strong></p></div>)}
          {/* Extracted Data Display Area */}
          {extractedData && !uploading && (
            <div style={{ margin: '20px 0', padding: '15px', border: '1px solid #e0e0e0', borderRadius: '4px', backgroundColor: '#f9f9f9' }}>
              <h4 style={{ marginTop: '0', borderBottom: '1px solid #eee', paddingBottom: '8px', marginBottom: '10px', fontSize: '1em', color: '#333' }}>Data Extracted from Bill:</h4>
              <p style={{ margin: '5px 0', fontSize: '0.9em' }}>Consumption (kWh): <strong style={{color: extractedData.consumptionKwh === null ? '#cc0000' : '#008000' }}>{extractedData.consumptionKwh ?? 'Not Found'}</strong></p>
              <p style={{ margin: '5px 0', fontSize: '0.9em' }}>Bill Amount: <strong style={{color: extractedData.totalAmount === null ? '#cc0000' : '#008000' }}>{extractedData.totalAmount ? `~ ${extractedData.totalAmount.toLocaleString()}` : 'Not Found'}</strong></p>
              <p style={{fontSize: '0.8em', color: '#777', marginTop: '10px'}}><i>(Auto-extracted, please verify.)</i></p>
            </div>
          )}
      </section>
      {/* --- End Section 1 --- */}


      {/* --- Section 2: Sizing Inputs --- */}
      <section style={{ marginTop: '40px', borderTop: '2px solid #0056b3', paddingTop: '20px' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '25px', color: '#0056b3' }}>2. Enter Sizing Details</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px 30px' }}> {/* Grid layout */}

            {/* Location */}
            <div style={formGroupStyle}>
              <label htmlFor="location" style={labelStyle}>Project Location (City/Town):*</label>
              <input type="text" id="location" value={location} onChange={(e) => setLocation(e.target.value)} required style={inputStyle} placeholder="e.g., Nairobi, Kampala"/>
            </div>

            {/* User Type */}
            <div style={formGroupStyle}>
              <label htmlFor="userType" style={labelStyle}>User Type:*</label>
              <select id="userType" value={userType} onChange={(e) => setUserType(e.target.value)} required style={selectStyle}>
                <option value="residential">Residential</option> <option value="commercial">Commercial</option> <option value="industrial">Industrial</option>
              </select>
            </div>

            {/* Avg Monthly kWh */}
            <div style={formGroupStyle}>
              <label htmlFor="avgMonthlyKwh" style={labelStyle}>Avg. Monthly Energy (kWh):</label>
              <input type="number" id="avgMonthlyKwh" value={avgMonthlyKwh} onChange={(e) => setAvgMonthlyKwh(e.target.value)} style={inputStyle} placeholder="From bill or estimate" min="0"/>
              <small style={smallTextStyle}>Enter if known, or use value from bill.</small>
            </div>

            {/* Avg Monthly Bill */}
             <div style={formGroupStyle}>
              <label htmlFor="avgMonthlyBill" style={labelStyle}>Avg. Monthly Bill (Local Currency):</label>
              <input type="number" id="avgMonthlyBill" value={avgMonthlyBill} onChange={(e) => setAvgMonthlyBill(e.target.value)} style={inputStyle} placeholder="e.g., 5000 (if kWh unknown)" min="0"/>
               <small style={smallTextStyle}>Alternative if kWh is unknown.</small>
            </div>

             {/* System Type */}
             <div style={formGroupStyle}>
              <label htmlFor="systemType" style={labelStyle}>System Type:*</label>
              <select id="systemType" value={systemType} onChange={(e) => setSystemType(e.target.value)} required style={selectStyle}>
                <option value="on-grid">Grid-Tied (No Battery)</option> <option value="off-grid">Off-Grid (Battery Required)</option> <option value="hybrid">Hybrid (Grid + Battery)</option>
              </select>
            </div>

             {/* Autonomy Days (Conditional) */}
             {(systemType === 'off-grid' || systemType === 'hybrid') && (
                 <div style={formGroupStyle}>
                  <label htmlFor="autonomyDays" style={labelStyle}>Backup Days (Autonomy):*</label>
                  <input type="number" id="autonomyDays" value={autonomyDays} onChange={(e) => setAutonomyDays(Math.max(1, parseInt(e.target.value) || 1))} required={systemType !== 'on-grid'} style={inputStyle} min="1" step="1"/>
                   <small style={smallTextStyle}>Days system runs on battery only.</small>
                </div>
             )}

            {/* Roof Area */}
            <div style={formGroupStyle}>
              <label htmlFor="roofArea" style={labelStyle}>Available Roof Area (m²):</label>
              <input type="number" id="roofArea" value={roofArea} onChange={(e) => setRoofArea(e.target.value)} style={inputStyle} placeholder="Approx. square meters" min="0"/>
               <small style={smallTextStyle}>Optional, helps check fit.</small>
            </div>

            {/* Roof Type */}
             <div style={formGroupStyle}>
              <label htmlFor="roofType" style={labelStyle}>Roof Type:*</label>
              <select id="roofType" value={roofType} onChange={(e) => setRoofType(e.target.value)} required style={selectStyle}>
                <option value="iron-sheets">Corrugated Iron Sheets</option> <option value="tiles">Roof Tiles (Clay/Concrete)</option> <option value="concrete-flat">Concrete Flat Roof</option> <option value="other">Other</option>
              </select>
            </div>

             {/* Budget (Optional) */}
             <div style={{...formGroupStyle, gridColumn: '1 / -1' }}> {/* Make budget span full width */}
              <label htmlFor="budget" style={labelStyle}>Estimated Budget (Optional, Local Currency):</label>
              <input type="number" id="budget" value={budget} onChange={(e) => setBudget(e.target.value)} style={inputStyle} placeholder="e.g., 500000 KES" min="0"/>
                <small style={smallTextStyle}>Helps filter or suggest options.</small>
            </div>

            {/* Calculation Button Area */}
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', marginTop: '30px' }}>
              <button type="button" onClick={handleCalculateClick} disabled={calculating} style={{ padding: '15px 40px', fontSize: '1.2em', backgroundColor: calculating ? '#ccc' : '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: calculating ? 'not-allowed' : 'pointer' }}>
                {calculating ? 'Calculating...' : 'Calculate Solar Estimate'}
              </button>
            </div>

          </div> {/* End Grid Layout */}

      </section>
      {/* --- End Section 2 --- */}


      {/* --- Section 3: Calculation Results --- */}
      <section style={{ marginTop: '40px', borderTop: '2px solid #28a745', paddingTop: '20px' }}>
           <h2 style={{ textAlign: 'center', marginBottom: '20px', color: '#1a682c' }}>3. Calculation Results</h2>

            {/* Loading State */}
            {calculating && (
                 <div style={{ textAlign: 'center', padding: '30px', color: '#555' }}>Calculating solar system size and cost... Please wait.</div>
             )}

            {/* Error Display */}
            {calculationError && !calculating && (
                <div style={{ border: '1px solid #dc3545', color: '#721c24', backgroundColor: '#f8d7da', padding: '15px', borderRadius: '4px', textAlign: 'center', whiteSpace: 'pre-wrap' }}> {/* Use pre-wrap for newlines in error */}
                    <strong>Error:</strong> {calculationError}
                </div>
            )}

           {/* Results Display */}
           {calculationResult && !calculating && !calculationError && (
               <div style={{ border: '1px solid #ccc', backgroundColor: '#f0fff0', padding: '20px', borderRadius: '5px' }}>
                   <h3 style={{ marginTop: '0', color: '#1a682c' }}>Estimated System:</h3>
                   {/* Display results using optional chaining and nullish coalescing for safety */}
                   <p><strong>Recommended PV Size:</strong> {`${calculationResult.pvSizeKwP?.toFixed(2) ?? 'N/A'} kWp`}</p>
                   <p><strong>Estimated Inverter Size:</strong> {`${calculationResult.inverterSizeKva?.toFixed(2) ?? 'N/A'} kVA`}</p>
                   { /* Conditionally display battery only if relevant and value exists */ }
                   { (calculationResult.systemType === 'off-grid' || calculationResult.systemType === 'hybrid') && calculationResult.batterySizeKwh != null &&
                       <p><strong>Estimated Battery Capacity:</strong> {`${calculationResult.batterySizeKwh.toFixed(2)} kWh`}</p>
                   }
                   <p><strong>Estimated Annual Production:</strong> {`${calculationResult.annualProductionKwh?.toLocaleString() ?? 'N/A'} kWh`}</p>
                   <hr style={{ margin: '20px 0', borderColor: '#eee' }}/>
                   <h3 style={{ color: '#1a682c' }}>Estimated Cost & Savings:</h3>
                   <p><strong>Estimated System Cost:</strong> {`${calculationResult.estimatedCost?.toLocaleString() ?? 'N/A'} (Local Currency)`}</p>
                   <p><strong>Estimated Payback Period:</strong> {`${calculationResult.paybackYears?.toFixed(1) ?? 'N/A'} Years`}</p>
                   <p><strong>Estimated Annual Savings:</strong> {`${calculationResult.annualSavings?.toLocaleString() ?? 'N/A'} (Local Currency)`}</p>
                   <p><strong>Estimated CO₂ Reduction:</strong> {`${calculationResult.co2ReductionKg?.toLocaleString() ?? 'N/A'} kg/year`}</p>

                    <p style={{fontSize: '0.85em', color: '#555', marginTop: '20px', borderTop: '1px dashed #ccc', paddingTop: '15px'}}>
                        <strong>Disclaimer:</strong> These are preliminary estimates based on provided data and regional averages using placeholder logic. Actual size, cost, and performance may vary significantly. Consult with qualified solar installers for detailed quotes and site assessments.
                    </p>
               </div>
           )}

           {/* Initial placeholder message */}
            {!calculating && !calculationError && !calculationResult && (
                <div style={{ textAlign: 'center', padding: '30px', color: '#777' }}>
                   Enter your details above and click "Calculate Solar Estimate" to see your results.
                </div>
            )}
      </section>
      {/* --- End Section 3 --- */}

    </div> // End Main Container
  );
  // --- End Render Component ---
}

export default HomePage;