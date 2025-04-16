import React, { useState } from 'react';
import { 
  CreditCardIcon,
  BanknotesIcon,
  CurrencyDollarIcon,
  PhoneIcon
} from '@heroicons/react/outline';

const PaymentIntegration = ({ amount, onPaymentSuccess }) => {
  const [selectedMethod, setSelectedMethod] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePayment = async (method) => {
    setLoading(true);
    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // In a real implementation, this would call the respective payment gateway API
      switch (method) {
        case 'mpesa':
          // Call M-Pesa API
          break;
        case 'airtel':
          // Call Airtel Money API
          break;
        case 'bank':
          // Process bank transfer
          break;
      }

      onPaymentSuccess({
        method,
        amount,
        transactionId: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Payment error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Payment Options</h2>
      
      <div className="space-y-4">
        <div className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
             onClick={() => setSelectedMethod('mpesa')}>
          <div className="flex items-center">
            <PhoneIcon className="h-6 w-6 text-green-600 mr-3" />
            <div>
              <h3 className="font-semibold">M-Pesa</h3>
              <p className="text-sm text-gray-600">Pay via M-Pesa mobile money</p>
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
             onClick={() => setSelectedMethod('airtel')}>
          <div className="flex items-center">
            <PhoneIcon className="h-6 w-6 text-red-600 mr-3" />
            <div>
              <h3 className="font-semibold">Airtel Money</h3>
              <p className="text-sm text-gray-600">Pay via Airtel Money</p>
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
             onClick={() => setSelectedMethod('bank')}>
          <div className="flex items-center">
            <BanknotesIcon className="h-6 w-6 text-blue-600 mr-3" />
            <div>
              <h3 className="font-semibold">Bank Transfer</h3>
              <p className="text-sm text-gray-600">Direct bank transfer</p>
            </div>
          </div>
        </div>
      </div>

      {selectedMethod && (
        <div className="mt-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700">Phone Number</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="07XX XXX XXX"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between mb-4">
            <span className="text-gray-600">Amount to Pay:</span>
            <span className="font-semibold">KES {amount.toLocaleString()}</span>
          </div>

          <button
            onClick={() => handlePayment(selectedMethod)}
            disabled={loading || !phoneNumber}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Make Payment'}
          </button>
        </div>
      )}

      <div className="mt-6 text-sm text-gray-600">
        <p>Payment plans available:</p>
        <ul className="list-disc pl-5 mt-2">
          <li>3 months (0% interest)</li>
          <li>6 months (5% interest)</li>
          <li>12 months (10% interest)</li>
        </ul>
      </div>
    </div>
  );
};

export default PaymentIntegration; 