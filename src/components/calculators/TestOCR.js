import React, { useState } from 'react';
import { createWorker } from 'tesseract.js';

const TestOCR = () => {
  const [image, setImage] = useState(null);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImageChange = (e) => {
    if (e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target.result);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const performOCR = async () => {
    if (!image) return;

    setIsProcessing(true);
    setText('');
    setProgress(0);

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
      const { data: { text } } = await worker.recognize(image);
      setText(text);
      await worker.terminate();
    } catch (error) {
      console.error('OCR Error:', error);
      setText('Error processing image');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 bg-white rounded shadow">
      <h2 className="text-xl font-bold mb-4">OCR Test Component</h2>
      
      <div className="mb-4">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageChange}
          className="block w-full text-sm text-gray-500
            file:mr-4 file:py-2 file:px-4
            file:rounded file:border-0
            file:text-sm file:font-semibold
            file:bg-blue-50 file:text-blue-700
            hover:file:bg-blue-100"
        />
      </div>
      
      {image && (
        <div className="mb-4">
          <img src={image} alt="Selected" className="max-h-64 mx-auto border rounded" />
        </div>
      )}
      
      <div className="mb-4">
        <button
          onClick={performOCR}
          disabled={!image || isProcessing}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded disabled:opacity-50"
        >
          {isProcessing ? `Processing (${progress}%)` : 'Extract Text'}
        </button>
      </div>
      
      {text && (
        <div className="mt-4">
          <h3 className="font-bold mb-2">Extracted Text:</h3>
          <div className="bg-gray-50 p-4 rounded border text-sm whitespace-pre-wrap">
            {text}
          </div>
        </div>
      )}
    </div>
  );
};

export default TestOCR; 