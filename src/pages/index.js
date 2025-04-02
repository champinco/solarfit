import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';

function HomePage() {
  // State Variables
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
  const [applianceCategories, setApplianceCategories] = useState({
    residential: [],
    commercial: [],
    industrial: []
  });

  // Fetch appliance list on component mount
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

  // File Drop Handler
  const onDropAccepted = useCallback(async (acceptedFiles) => {
    if (uploading) return;
    const file = acceptedFiles[0];
    setUploading(true);
    setExtractedData(null);
    setCalculationResult(null);
    setCalculationError('');
    setLastUploadFilename(file.name);

    const formData = new FormData();
    formData.append('bill', file);

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await axios.post(`${backendUrl}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const data = response.data.extractedData || {};
      setExtractedData(data);
      if (data.consumptionKwh != null) setAvgMonthlyKwh(data.consumptionKwh.toString());
      if (data.totalAmount != null) setAvgMonthlyBill(data.totalAmount.toString());
    } catch (error) {
      console.error('File upload error:', error);
      setExtractedData(null);
      alert(`File upload failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setUploading(false);
    }
  }, [uploading]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/png': ['.png'], 'image/jpeg': ['.jpeg', '.jpg'] },
    maxFiles: 1,
    onDropAccepted,
    onDropRejected: (rejectedFiles) => {
      alert(rejectedFiles[0]?.errors[0]?.message || 'File rejected. Use PNG/JPG.');
    },
    disabled: uploading,
  });

  // Appliance Management
  const addAppliance = () => {
    const applianceOptions = applianceCategories[userType] || [];
    if (applianceOptions.length === 0) return;
    
    setAppliances([...appliances, { 
      name: applianceOptions[0].name, 
      quantity: 1,
      hoursPerDay: 1,
      power: applianceOptions[0].power 
    }]);
  };

  const updateAppliance = (index, field, value) => {
    const updatedAppliances = appliances.map((appliance, i) => {
      if (i === index) {
        const updatedAppliance = { ...appliance, [field]: value };
        
        // Update power if name changes
        if (field === 'name') {
          const selectedAppliance = applianceCategories[userType]?.find(a => a.name === value);
          if (selectedAppliance) {
            updatedAppliance.power = selectedAppliance.power;
          }
        }
        
        return updatedAppliance;
      }
      return appliance;
    });
    
    setAppliances(updatedAppliances);
  };

  const removeAppliance = (index) => {
    setAppliances(appliances.filter((_, i) => i !== index));
  };

  // Calculation Handler
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
      appliances: appliances.length > 0 ? appliances : null,
    };

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await axios.post(`${backendUrl}/api/calculate`, sizingParameters);
      setCalculationResult(response.data);
    } catch (error) {
      console.error('Calculation error:', error);
      setCalculationError(`Calculation failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setCalculating(false);
    }
  };

  // PDF Generation Handler
  const handleGeneratePDF = async () => {
    if (!calculationResult) {
      alert('Please calculate the system first.');
      return;
    }
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';
      const response = await axios.post(`${backendUrl}/api/generate-pdf`, calculationResult, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'solar_report.pdf');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF generation error:', error);
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
    cursor: 'pointer'
  };
  const removeButtonStyle = {
    padding: '5px 10px',
    backgroundColor: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  };

  return (
    <div style={{ maxWidth: '800px', margin: '20px auto', padding: '30px', fontFamily: 'Arial, sans-serif', border: '1px solid #ddd', borderRadius: '8px' }}>
      {/* Bill Upload Section */}
      <section>
        <h2 style={{ textAlign: 'center', color: '#0056b3' }}>1. Upload Your Bill (Optional)</h2>
        <div {...getRootProps()} style={dropzoneStyle}>
          <input {...getInputProps()} />
          {uploading ? <p>Uploading...</p> : isDragActive ? <p>Drop here!</p> : <p>Drag or click to upload bill (PNG/JPG)</p>}
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

      {/* Sizing Inputs Section */}
      <section style={{ marginTop: '40px', borderTop: '2px solid #0056b3', paddingTop: '20px' }}>
        <h2 style={{ textAlign: 'center', color: '#0056b3' }}>2. Enter Sizing Details</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Location:*</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} style={inputStyle} placeholder="e.g., Nairobi" />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>System Type:*</label>
            <select value={systemType} onChange={(e) => setSystemType(e.target.value)} style={selectStyle}>
              <option value="on-grid">On-Grid</option>
              <option value="off-grid">Off-Grid</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>User Type:*</label>
            <select 
              value={userType} 
              onChange={(e) => {
                setUserType(e.target.value);
                setAppliances([]); // Clear appliances when user type changes
              }} 
              style={selectStyle}
            >
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="industrial">Industrial</option>
            </select>
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Avg. Monthly kWh:</label>
            <input type="number" value={avgMonthlyKwh} onChange={(e) => setAvgMonthlyKwh(e.target.value)} style={inputStyle} />
          </div>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Avg. Monthly Bill:</label>
            <input type="number" value={avgMonthlyBill} onChange={(e) => setAvgMonthlyBill(e.target.value)} style={inputStyle} />
          </div>
          {systemType !== 'on-grid' && (
            <div style={formGroupStyle}>
              <label style={labelStyle}>Autonomy Days:*</label>
              <input type="number" value={autonomyDays} onChange={(e) => setAutonomyDays(e.target.value)} style={inputStyle} min="1" />
            </div>
          )}
          
          {/* Appliance Selection */}
          <div style={{ gridColumn: '1 / -1', marginTop: '20px' }}>
            <h3 style={{ color: '#0056b3' }}>Appliances (Optional)</h3>
            <p>Estimate your energy needs by adding appliances:</p>
            
            {appliances.map((appliance, index) => (
              <div key={index} style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                <select
                  value={appliance.name}
                  onChange={(e) => updateAppliance(index, 'name', e.target.value)}
                  style={{ ...selectStyle, flex: 2 }}
                >
                  {applianceCategories[userType]?.map(app => (
                    <option key={app.name} value={app.name}>{app.name} ({app.power}W)</option>
                  ))}
                </select>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <label style={{ fontSize: '0.8em' }}>Quantity</label>
                  <input
                    type="number"
                    value={appliance.quantity}
                    onChange={(e) => updateAppliance(index, 'quantity', parseInt(e.target.value) || 1)}
                    min="1"
                    style={{ ...inputStyle, padding: '5px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <label style={{ fontSize: '0.8em' }}>Hours/Day</label>
                  <input
                    type="number"
                    value={appliance.hoursPerDay}
                    onChange={(e) => updateAppliance(index, 'hoursPerDay', parseInt(e.target.value) || 1)}
                    min="1"
                    max="24"
                    style={{ ...inputStyle, padding: '5px' }}
                  />
                </div>
                <button 
                  onClick={() => removeAppliance(index)} 
                  style={removeButtonStyle}
                  aria-label="Remove appliance"
                >
                  X
                </button>
              </div>
            ))}
            
            <button onClick={addAppliance} style={buttonStyle} disabled={!applianceCategories[userType]?.length}>
              Add Appliance
            </button>
            
            {appliances.length > 0 && (
              <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                <p><strong>Daily Consumption Estimate:</strong> {
                  appliances.reduce((sum, app) => 
                    sum + (app.power/1000 * app.quantity * app.hoursPerDay), 0).toFixed(2)
                } kWh</p>
              </div>
            )}
          </div>
          
          <button 
            onClick={handleCalculateClick} 
            disabled={calculating} 
            style={{ 
              gridColumn: '1 / -1', 
              padding: '15px', 
              backgroundColor: calculating ? '#ccc' : '#28a745', 
              color: '#fff', 
              border: 'none',
              borderRadius: '4px',
              cursor: calculating ? 'not-allowed' : 'pointer',
              marginTop: '20px'
            }}
          >
            {calculating ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </section>

      {/* Results Section */}
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
            {calculationResult.estimatedCost?.batteries > 0 && (
              <p><strong>Batteries:</strong> {calculationResult.estimatedCost?.batteries?.toLocaleString() ?? 'N/A'}</p>
            )}
            <p><strong>Charge Controller:</strong> {calculationResult.estimatedCost?.chargeController?.toLocaleString() ?? 'N/A'}</p>
            <p><strong>Total Cost:</strong> {calculationResult.estimatedCost?.total?.toLocaleString() ?? 'N/A'}</p>
            
            <button 
              onClick={handleGeneratePDF} 
              style={{ padding: '10px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', marginTop: '15px' }}
            >
              Generate PDF
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

export default HomePage;