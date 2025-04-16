import React, { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { 
  DocumentTextIcon, 
  UploadIcon, 
  LightningBoltIcon,
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/outline';

const BillUploader = ({ onDataExtracted }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    setError(null);
    const file = e.target.files[0];
    
    if (!file) return;
    
    if (!file.type.includes('image')) {
      setError('Please upload an image file (jpg, png, etc.)');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      setError('File size should be less than 5MB');
      return;
    }
    
    setIsUploading(true);
    
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedImage(reader.result);
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };
  
  const processImage = async () => {
    if (!uploadedImage) return;
    
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    
    try {
      const worker = await createWorker({
        logger: m => {
          if (m.status === 'recognizing text') {
            setProgress(parseInt(m.progress * 100));
          }
        }
      });
      
      await worker.loadLanguage('eng');
      await worker.initialize('eng');
      const { data: { text } } = await worker.recognize(uploadedImage);
      await worker.terminate();
      
      const extractedInfo = parseExtractedText(text);
      
      if (extractedInfo.success) {
        setExtractedData(extractedInfo.data);
        onDataExtracted(extractedInfo.data);
      } else {
        setError('Could not find all required information in the bill. Please try a clearer image or enter data manually.');
      }
    } catch (err) {
      setError('Failed to process the image. Please try again or enter data manually.');
      console.error('OCR error:', err);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const parseExtractedText = (text) => {
    // Initialize extraction result
    const result = {
      success: false,
      data: {
        monthlyConsumption: null,
        monthlyBill: null,
        billingPeriod: null
      }
    };
    
    try {
      // Regular expressions for Kenya Power bill data
      const consumptionRegex = /consumption[\s:-]*(\d+(?:\.\d+)?)\s*(?:kWh|units)/i;
      const billAmountRegex = /(?:total amount|amount due|pay)[\s:-]*(?:KES|ksh|kes|sh)?[\s]*([\d,]+(?:\.\d+)?)/i;
      const billingPeriodRegex = /(?:billing period|for the period|period)[\s:-]*([a-zA-Z]+\s+\d{4})/i;
      
      // Extract consumption (kWh)
      const consumptionMatch = text.match(consumptionRegex);
      if (consumptionMatch && consumptionMatch[1]) {
        result.data.monthlyConsumption = parseFloat(consumptionMatch[1]);
      }
      
      // Extract bill amount
      const billMatch = text.match(billAmountRegex);
      if (billMatch && billMatch[1]) {
        result.data.monthlyBill = parseFloat(billMatch[1].replace(/,/g, ''));
      }
      
      // Extract billing period
      const periodMatch = text.match(billingPeriodRegex);
      if (periodMatch && periodMatch[1]) {
        result.data.billingPeriod = periodMatch[1];
      }
      
      // Check if we found at least consumption and bill amount
      if (result.data.monthlyConsumption && result.data.monthlyBill) {
        result.success = true;
      }
      
      return result;
    } catch (err) {
      console.error('Error parsing extracted text:', err);
      return result;
    }
  };
  
  const resetUpload = () => {
    setUploadedImage(null);
    setExtractedData(null);
    setError(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center mb-4">
        <DocumentTextIcon className="h-6 w-6 text-blue-600 mr-2" />
        <h3 className="text-lg font-semibold text-gray-800">Upload Your Electricity Bill</h3>
      </div>
      
      <p className="text-sm text-gray-600 mb-4">
        Upload a clear image of your Kenya Power bill to automatically extract your energy consumption data.
      </p>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 flex items-start">
          <ExclamationCircleIcon className="h-5 w-5 text-red-500 mr-2 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      
      {!uploadedImage ? (
        <div 
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:bg-gray-50"
          onClick={() => fileInputRef.current.click()}
        >
          <input 
            type="file" 
            className="hidden" 
            accept="image/*" 
            onChange={handleFileChange} 
            ref={fileInputRef}
          />
          <UploadIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Click to upload or drag and drop</p>
          <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</p>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <img 
              src={uploadedImage} 
              alt="Uploaded bill" 
              className="max-h-64 mx-auto rounded border" 
            />
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={processImage}
              disabled={isProcessing}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isProcessing ? `Processing (${progress}%)` : 'Extract Data'}
            </button>
            <button
              onClick={resetUpload}
              className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              Reset
            </button>
          </div>
        </div>
      )}
      
      {extractedData && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center mb-2">
            <CheckCircleIcon className="h-5 w-5 text-green-500 mr-2" />
            <h4 className="font-medium text-green-800">Data Successfully Extracted</h4>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <p className="text-xs text-gray-500">Monthly Consumption</p>
              <p className="font-medium flex items-center">
                <LightningBoltIcon className="h-4 w-4 text-yellow-500 mr-1" />
                {extractedData.monthlyConsumption} kWh
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Bill Amount</p>
              <p className="font-medium">KES {extractedData.monthlyBill.toLocaleString()}</p>
            </div>
            {extractedData.billingPeriod && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500">Billing Period</p>
                <p className="font-medium">{extractedData.billingPeriod}</p>
              </div>
            )}
          </div>
          
          <p className="text-sm text-gray-600 mt-3">
            This data has been automatically applied to your calculation.
          </p>
        </div>
      )}
    </div>
  );
};

export default BillUploader; 