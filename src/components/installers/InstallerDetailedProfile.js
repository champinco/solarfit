import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  StarIcon, 
  LocationMarkerIcon, 
  BriefcaseIcon, 
  CurrencyDollarIcon,
  PhoneIcon, 
  MailIcon,
  BadgeCheckIcon,
  DocumentTextIcon,
  ClockIcon
} from '@heroicons/react/outline';
import ReviewList from './ReviewList';
import QuoteRequestForm from './QuoteRequestForm';

const InstallerDetailedProfile = ({ installerId }) => {
  const [installer, setInstaller] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showQuoteForm, setShowQuoteForm] = useState(false);

  useEffect(() => {
    fetchInstallerDetails();
  }, [installerId]);

  const fetchInstallerDetails = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`/api/installers/${installerId}`);
      setInstaller(response.data);
    } catch (error) {
      setError('Failed to load installer details.');
      console.error('Error fetching installer details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading installer details...</p>
      </div>
    );
  }

  if (error || !installer) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error || 'Installer not found'}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{installer.companyName}</h1>
            <div className="flex items-center mt-2">
              <StarIcon className="h-5 w-5 text-yellow-400" />
              <span className="ml-1 text-gray-700">{installer.rating.toFixed(1)} / 5</span>
            </div>
          </div>
          
          <div className="mt-4 md:mt-0">
            <button 
              onClick={() => setShowQuoteForm(true)} 
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Request Quote
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Company Information</h2>
            
            <div className="space-y-3">
              <div className="flex items-center text-gray-600">
                <LocationMarkerIcon className="h-5 w-5 mr-2" />
                <span>{installer.location}</span>
              </div>
              
              <div className="flex items-center text-gray-600">
                <PhoneIcon className="h-5 w-5 mr-2" />
                <a href={`tel:${installer.phoneNumber}`} className="hover:text-blue-600">
                  {installer.phoneNumber}
                </a>
              </div>
              
              <div className="flex items-center text-gray-600">
                <MailIcon className="h-5 w-5 mr-2" />
                <a href={`mailto:${installer.email}`} className="hover:text-blue-600">
                  {installer.email}
                </a>
              </div>
              
              <div className="flex items-center text-gray-600">
                <BriefcaseIcon className="h-5 w-5 mr-2" />
                <span>{installer.yearsOfExperience} years of experience</span>
              </div>
              
              <div className="flex items-center text-gray-600">
                <CurrencyDollarIcon className="h-5 w-5 mr-2" />
                <span>Average quote: KES {installer.averageQuote?.toLocaleString() || 'Not available'}</span>
              </div>

              {installer.isVerified && (
                <div className="flex items-center text-green-600">
                  <BadgeCheckIcon className="h-5 w-5 mr-2" />
                  <span>Verified Installer</span>
                </div>
              )}
            </div>
            
            {installer.description && (
              <div className="mt-4">
                <h3 className="font-medium text-gray-800 mb-2">About</h3>
                <p className="text-gray-600">{installer.description}</p>
              </div>
            )}
          </div>
          
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Services & Certifications</h2>
            
            {installer.services && installer.services.length > 0 && (
              <div className="mb-4">
                <h3 className="font-medium text-gray-800 mb-2">Services Offered</h3>
                <div className="flex flex-wrap gap-2">
                  {installer.services.map((service, index) => (
                    <span 
                      key={index} 
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                    >
                      {service}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            {installer.certifications && installer.certifications.length > 0 && (
              <div>
                <h3 className="font-medium text-gray-800 mb-2">Certifications</h3>
                <div className="flex flex-wrap gap-2">
                  {installer.certifications.map((cert, index) => (
                    <span 
                      key={index} 
                      className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm flex items-center"
                    >
                      <DocumentTextIcon className="h-4 w-4 mr-1" />
                      {cert}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="mt-6">
              <h3 className="font-medium text-gray-800 mb-2">Member Since</h3>
              <div className="flex items-center text-gray-600">
                <ClockIcon className="h-5 w-5 mr-2" />
                <span>
                  {installer.createdAt 
                    ? new Date(installer.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : 'Not available'
                  }
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Customer Reviews</h2>
          <ReviewList installerId={installerId} />
        </div>
      </div>

      {showQuoteForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Request Quote from {installer.companyName}</h2>
              <button 
                onClick={() => setShowQuoteForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <QuoteRequestForm 
              installerId={installerId} 
              onSuccess={() => {
                setShowQuoteForm(false);
                alert('Quote request submitted successfully!');
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default InstallerDetailedProfile; 