import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import Tesseract from 'tesseract.js';
import { Bar } from 'react-chartjs-2';
import Chart from 'chart.js/auto';

function HomePage() {
  // State Variables - Initialize with empty values for server-side rendering
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lastUploadFilename, setLastUploadFilename] = useState('');
  const [calculationResult, setCalculationResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState('');
  const [location, setLocation] = useState('');
  const [systemType, setSystemType] = useState('on-grid');
  const [roofArea, setRoofArea] = useState('');
  const [roofType, setRoofType] = useState('iron-sheets');
  const [avgMonthlyKwh, setAvgMonthlyKwh] = useState('');
  const [avgMonthlyBill, setAvgMonthlyBill] = useState('');
  const [userType, setUserType] = useState('residential');
  const [autonomyDays, setAutonomyDays] = useState(1);
  const [budget, setBudget] = useState('');
  const [appliances, setAppliances] = useState([]);
  const [applianceCategories, setApplianceCategories] = useState({ residential: [], commercial: [], industrial: [] });
  const [tilt, setTilt] = useState(0); // Feature 2
  const [azimuth, setAzimuth] = useState(180); // Feature 2
  const [shading, setShading] = useState(0); // Feature 2

  // Check for token in localStorage after component mounts (client-side only)
  useEffect(() => {
    const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (storedToken) {
      setToken(storedToken);
      setIsLoggedIn(true);
    }
  }, []);

  // Fetch Appliances
  useEffect(() => {
    const fetchAppliances = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
        const response = await axios.get(`${backendUrl}/api/appliances`);
        setApplianceCategories(response.data);
      } catch (error) {
        console.error('Failed to fetch appliance list:', error);
      }
    };
    fetchAppliances();
  }, []);

  // Feature 1: OCR with Tesseract.js
  const onDropAccepted = useCallback(async (acceptedFiles) => {
    if (uploading) return;
    const file = acceptedFiles[0];
    setUploading(true);
    setExtractedData(null);
    setCalculationResult(null);
    setCalculationError('');
    setLastUploadFilename(file.name);

    try {
      const { data: { text } } = await Tesseract.recognize(file, 'eng');
      const consumptionMatch = text.match(/Consumption:\s*(\d+)\s*kWh/i);
      const amountMatch = text.match(/Total Amount:\s*(\d+)/i);
      const extractedData = {
        consumptionKwh: consumptionMatch ? parseInt(consumptionMatch[1]) : null,
        totalAmount: amountMatch ? parseInt(amountMatch[1]) : null,
      };
      setExtractedData(extractedData);
      if (extractedData.consumptionKwh) setAvgMonthlyKwh(extractedData.consumptionKwh.toString());
      if (extractedData.totalAmount) setAvgMonthlyBill(extractedData.totalAmount.toString());
    } catch (error) {
      console.error('OCR error:', error);
      alert('Failed to extract data from the bill image.');
    } finally {
      setUploading(false);
    }
  }, [uploading]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpeg', '.jpg'] },
    maxFiles: 1,
    onDropAccepted,
    onDropRejected: (rejectedFiles) => alert(rejectedFiles[0]?.errors[0]?.message || 'File rejected. Use PNG/JPG.'),
    disabled: uploading,
  });

  // Feature 3: Custom Appliance Entry
  const addAppliance = () => {
    const applianceOptions = applianceCategories[userType] || [];
    if (applianceOptions.length === 0) return;
    setAppliances([...appliances, { name: 'custom', customName: '', power: 0, quantity: 1, hoursPerDay: 1 }]);
  };

  const updateAppliance = (index, field, value) => {
    const updatedAppliances = appliances.map((appliance, i) => {
      if (i === index) {
        const updatedAppliance = { ...appliance, [field]: value };
        if (field === 'name' && value !== 'custom') {
          const selectedAppliance = applianceCategories[userType]?.find(a => a.name === value);
          if (selectedAppliance) updatedAppliance.power = selectedAppliance.power;
        }
        return updatedAppliance;
      }
      return appliance;
    });
    setAppliances(updatedAppliances);
  };

  const removeAppliance = (index) => setAppliances(appliances.filter((_, i) => i !== index));

  // Feature 4: Authentication
  const handleSignup = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      await axios.post(`${backendUrl}/api/signup`, { username, password });
      alert('Signup successful! Please log in.');
      setUsername('');
      setPassword('');
    } catch (error) {
      alert(`Signup failed: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleLogin = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await axios.post(`${backendUrl}/api/login`, { username, password });
      const { token } = response.data;
      setToken(token);
      localStorage.setItem('token', token);
      setIsLoggedIn(true);
      setUsername('');
      setPassword('');
    } catch (error) {
      alert(`Login failed: ${error.response?.data?.message || error.message}`);
    }
  };

  const handleLogout = () => {
    setToken('');
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
    setIsLoggedIn(false);
    setCalculationResult(null);
  };

  const saveCalculation = async () => {
    if (!calculationResult || !isLoggedIn) return;
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      await axios.post(`${backendUrl}/api/save-calculation`, calculationResult, {
        headers: { Authorization: `Bearer ${token}` },
      });
      alert('Calculation saved!');
    } catch (error) {
      alert(`Save failed: ${error.response?.data?.message || error.message}`);
    }
  };

  // Calculation Handler (Features 2, 5)
  const handleCalculateClick = async () => {
    setCalculating(true);
    setCalculationResult(null);
    setCalculationError('');

    if (!location) {
      setCalculationError('Please enter the Project Location.');
      setCalculating(false);
      return;
    }
    if (!avgMonthlyKwh && !avgMonthlyBill && appliances.length === 0) {
      setCalculationError('Please provide energy usage (kWh, bill, or appliances).');
      setCalculating(false);
      return;
    }

    const sizingParameters = {
      location,
      systemType,
      roofArea: roofArea ? parseFloat(roofArea) : null,
      roofType,
      avgMonthlyKwh: avgMonthlyKwh ? parseFloat(avgMonthlyKwh) : null,
      avgMonthlyBill: avgMonthlyBill ? parseFloat(avgMonthlyBill) : null,
      userType,
      autonomyDays: systemType !== 'on-grid' ? parseInt(autonomyDays) || 1 : null,
      budget: budget ? parseFloat(budget) : null,
      appliances: appliances.length > 0 ? appliances.map(a => ({
        name: a.customName || a.name,
        power: a.power,
        quantity: a.quantity,
        hoursPerDay: a.hoursPerDay,
      })) : null,
      tilt: parseFloat(tilt), // Feature 2
      azimuth: parseFloat(azimuth), // Feature 2
      shading: parseFloat(shading), // Feature 2
    };

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await axios.post(`${backendUrl}/api/calculate`, sizingParameters);
      setCalculationResult(response.data);
    } catch (error) {
      setCalculationError(`Calculation failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setCalculating(false);
    }
  };

  // PDF Generation
  const handleGeneratePDF = async () => {
    if (!calculationResult) {
      alert('Please calculate the system first.');
      return;
    }
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await axios.post(`${backendUrl}/api/generate-pdf`, calculationResult, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'solar_report.pdf');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert(`PDF generation failed: ${error.response?.data?.message || error.message}`);
    }
  };

  // Styles
  const formGroupStyle = { display: 'flex', flexDirection: 'column', marginBottom: '15px' };
  const labelStyle = { marginBottom: '5px', fontWeight: 'bold', fontSize: '0.9em', color: '#333' };
  const inputStyle = { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1em' };
  const selectStyle = { padding: '10px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '1em' };
  const dropzoneStyle = {
    border: `2px dashed ${uploading ? '#ccc' : isDragActive ? '#2196f3' : '#ccc'}`,
    padding: '20px',
    textAlign: 'center',
    cursor: uploading ? 'not-allowed' : 'pointer',
    backgroundColor: isDragActive ? '#f0f8ff' : '#fff',
    marginBottom: '20px',
  };
  const buttonStyle = {
    padding: '10px',
    backgroundColor: '#007bff',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  };
  const removeButtonStyle = {
    padding: '5px 10px',
    backgroundColor: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  };

  return (
    <div style={{ maxWidth: '800px', margin: '20px auto', padding: '30px', fontFamily: 'Arial, sans-serif', border: '1px solid #ddd', borderRadius: '8px' }}>
      {/* Authentication Section (Feature 4) */}
      {!isLoggedIn ? (
        <section>
          <h2 style={{ textAlign: 'center', color: '#0056b3' }}>Login/Signup</h2>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Username:</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} style={inputStyle} />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Password:</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} />
          </div>
          <button onClick={handleSignup} style={buttonStyle}>Signup</button>
          <button onClick={handleLogin} style={{ ...buttonStyle, marginLeft: '10px' }}>Login</button>
        </section>
      ) : (
        <section>
          <h2 style={{ textAlign: 'center', color: '#0056b3' }}>Welcome</h2>
          <button onClick={handleLogout} style={buttonStyle}>Logout</button>
        </section>
      )}

      {/* Bill Upload Section (Feature 1) */}
      <section style={{ marginTop: '40px' }}>
        <h2 style={{ textAlign: 'center', color: '#0056b3' }}>1. Upload Your Bill (Optional)</h2>
        <div {...getRootProps()} style={dropzoneStyle}>
          <input {...getInputProps()} />
          {uploading ? <p>Processing...</p> : isDragActive ? <p>Drop here!</p> : <p>Drag or click to upload bill (PNG/JPG)</p>}
        </div>
        {lastUploadFilename && <p>Last uploaded: <strong>{lastUploadFilename}</strong></p>}
        {extractedData && (
          <div style={{ padding: '15px', border: '1px solid #e0e0e0', backgroundColor: '#f9f9f9' }}>
            <h4>Extracted Data:</h4>
            <p>Consumption: <strong>{extractedData.consumptionKwh ?? 'Not Found'}</strong> kWh</p>
            <p>Bill Amount: <strong>{extractedData.totalAmount?.toLocaleString() ?? 'Not Found'}</strong></p>
          </div>
        )}
      </section>

      {/* Sizing Inputs Section (Features 2, 3) */}
      <section style={{ marginTop: '40px', borderTop: '2px solid #0056b3', paddingTop: '20px' }}>
        <h2 style={{ textAlign: 'center', color: '#0056b3' }}>2. Enter Sizing Details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div style={formGroupStyle}><label style={labelStyle}>Location:*</label><input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} placeholder="e.g., Nairobi" /></div>
          <div style={formGroupStyle}><label style={labelStyle}>System Type:*</label><select value={systemType} onChange={(e) => setSystemType(e.target.value)} style={selectStyle}><option value="on-grid">On-Grid</option><option value="off-grid">Off-Grid</option><option value="hybrid">Hybrid</option></select></div>
          <div style={formGroupStyle}><label style={labelStyle}>User Type:*</label><select value={userType} onChange={(e) => { setUserType(e.target.value); setAppliances([]); }} style={selectStyle}><option value="residential">Residential</option><option value="commercial">Commercial</option><option value="industrial">Industrial</option></select></div>
          <div style={formGroupStyle}><label style={labelStyle}>Avg. Monthly kWh:</label><input type="number" value={avgMonthlyKwh} onChange={(e) => setAvgMonthlyKwh(e.target.value)} style={inputStyle} /></div>
          <div style={formGroupStyle}><label style={labelStyle}>Avg. Monthly Bill:</label><input type="number" value={avgMonthlyBill} onChange={(e) => setAvgMonthlyBill(e.target.value)} style={inputStyle} /></div>
          {systemType !== 'on-grid' && <div style={formGroupStyle}><label style={labelStyle}>Autonomy Days:*</label><input type="number" value={autonomyDays} onChange={(e) => setAutonomyDays(e.target.value)} style={inputStyle} min="1" /></div>}
          {/* Feature 2: Advanced PVGIS Inputs */}
          <div style={formGroupStyle}><label style={labelStyle}>Panel Tilt (degrees):</label><input type="number" value={tilt} onChange={(e) => setTilt(e.target.value)} style={inputStyle} /></div>
          <div style={formGroupStyle}><label style={labelStyle}>Panel Azimuth (degrees):</label><input type="number" value={azimuth} onChange={(e) => setAzimuth(e.target.value)} style={inputStyle} /></div>
          <div style={formGroupStyle}><label style={labelStyle}>Shading (%):</label><input type="number" value={shading} onChange={(e) => setShading(e.target.value)} style={inputStyle} min="0" max="100" /></div>

          {/* Appliance Selection (Feature 3) */}
          <div style={{ gridColumn: '1 / -1', marginTop: '20px' }}>
            <h3 style={{ color: '#0056b3' }}>Appliances (Optional)</h3>
            {appliances.map((appliance, index) => (
              <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                <select value={appliance.name} onChange={(e) => updateAppliance(index, 'name', e.target.value)} style={{ ...selectStyle, flex: 2 }}>
                  <option value="custom">Custom Appliance</option>
                  {applianceCategories[userType]?.map(app => <option key={app.name} value={app.name}>{app.name} ({app.power}W)</option>)}
                </select>
                {appliance.name === 'custom' && (
                  <>
                    <input type="text" placeholder="Appliance Name" value={appliance.customName || ''} onChange={(e) => updateAppliance(index, 'customName', e.target.value)} style={inputStyle} />
                    <input type="number" placeholder="Power (W)" value={appliance.power} onChange={(e) => updateAppliance(index, 'power', parseInt(e.target.value) || 0)} style={inputStyle} />
                  </>
                )}
                <input type="number" value={appliance.quantity} onChange={(e) => updateAppliance(index, 'quantity', parseInt(e.target.value) || 1)} min="1" style={{ ...inputStyle, width: '80px' }} />
                <input type="number" value={appliance.hoursPerDay} onChange={(e) => updateAppliance(index, 'hoursPerDay', parseInt(e.target.value) || 1)} min="1" max="24" style={{ ...inputStyle, width: '80px' }} />
                <button onClick={() => removeAppliance(index)} style={removeButtonStyle}>X</button>
              </div>
            ))}
            <button onClick={addAppliance} style={buttonStyle} disabled={!applianceCategories[userType]?.length}>Add Appliance</button>
            {appliances.length > 0 && (
              <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                <p><strong>Daily Consumption Estimate:</strong> {appliances.reduce((sum, app) => sum + (app.power / 1000 * app.quantity * app.hoursPerDay), 0).toFixed(2)} kWh</p>
              </div>
            )}
          </div>

          <button onClick={handleCalculateClick} disabled={calculating} style={{ gridColumn: '1 / -1', padding: '15px', backgroundColor: calculating ? '#ccc' : '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: calculating ? 'not-allowed' : 'pointer', marginTop: '20px' }}>
            {calculating ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </section>

      {/* Results Section (Feature 6) */}
      <section style={{ marginTop: '40px', borderTop: '2px solid #28a745', paddingTop: '20px' }}>
        <h2 style={{ textAlign: 'center', color: '#1a682c' }}>3. Calculation Results</h2>
        {calculating && <p>Calculating...</p>}
        {calculationError && <p style={{ color: 'red' }}>{calculationError}</p>}
        {calculationResult && !calculating && !calculationError && (
          <div style={{ padding: '20px', backgroundColor: '#f0fff0', border: '1px solid #ccc', borderRadius: '8px' }}>
            <h3>System Specifications</h3>
            <p><strong>PV Size:</strong> {calculationResult.pvSizeKwP?.toFixed(2) ?? 'N/A'} kWp</p>
            <p><strong>Number of Panels:</strong> {calculationResult.numberOfPanels ?? 'N/A'} ({calculationResult.panelWattage ?? 'N/A'}W each)</p>
            <p><strong>Inverter Size:</strong> {calculationResult.inverterSizeKva?.toFixed(2) ?? 'N/A'} kVA</p>
            {calculationResult.batterySizeKwh && (
              <>
                <p><strong>Battery:</strong> {calculationResult.batterySizeKwh.toFixed(2)} kWh</p>
                <p><strong>Number of Batteries:</strong> {calculationResult.numberOfBatteries ?? 'N/A'}</p>
              </>
            )}
            <h3>Cost Breakdown</h3>
            <p><strong>Panels:</strong> {calculationResult.estimatedCost?.panels?.toLocaleString() ?? 'N/A'}</p>
            <p><strong>Inverter:</strong> {calculationResult.estimatedCost?.inverter?.toLocaleString() ?? 'N/A'}</p>
            {calculationResult.estimatedCost?.batteries > 0 && <p><strong>Batteries:</strong> {calculationResult.estimatedCost?.batteries?.toLocaleString() ?? 'N/A'}</p>}
            <p><strong>Charge Controller:</strong> {calculationResult.estimatedCost?.chargeController?.toLocaleString() ?? 'N/A'}</p>
            <p><strong>Total Cost:</strong> {calculationResult.estimatedCost?.total?.toLocaleString() ?? 'N/A'}</p>

            {/* Feature 6: Bar Graph */}
            <h3>Monthly Energy Production</h3>
            <Bar
              data={{
                labels: calculationResult.monthlyProduction.map(m => `Month ${m.month}`),
                datasets: [{
                  label: 'Production (kWh)',
                  data: calculationResult.monthlyProduction.map(m => m.production),
                  backgroundColor: 'rgba(75, 192, 192, 0.6)',
                }],
              }}
              options={{ scales: { y: { beginAtZero: true } } }}
            />

            <button onClick={handleGeneratePDF} style={{ ...buttonStyle, marginTop: '15px' }}>Generate PDF</button>
            {isLoggedIn && <button onClick={saveCalculation} style={{ ...buttonStyle, marginTop: '15px', marginLeft: '10px' }}>Save Calculation</button>}
          </div>
        )}
      </section>
    </div>
  );
}

export default HomePage;