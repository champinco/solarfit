import React from 'react';

export default function TestPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <h1 className="text-4xl font-bold text-blue-600 mb-4">Test Page</h1>
      <p className="text-gray-700 mb-4">This is a test page to check styling</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-4xl">
        <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
          <h2 className="text-xl font-semibold mb-2">Card 1</h2>
          <p>This card should have styling from Tailwind CSS.</p>
          <button className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Test Button
          </button>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
          <h2 className="text-xl font-semibold mb-2">Card 2</h2>
          <p>This card should have styling from Tailwind CSS.</p>
          <div className="flex items-center mt-4">
            <span className="mr-2">⬇️</span>
            <span>Down Arrow Icon</span>
          </div>
          <div className="flex items-center mt-2">
            <span className="mr-2">⬆️</span>
            <span>Up Arrow Icon</span>
          </div>
        </div>
      </div>
    </div>
  );
} 