import React from 'react';
import Link from 'next/link';
import { StarIcon, LocationMarkerIcon, BriefcaseIcon, CurrencyDollarIcon } from '@heroicons/react/outline';

const InstallerCard = ({ installer }) => {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-gray-800">{installer.companyName}</h3>
          <div className="flex items-center">
            <StarIcon className="h-5 w-5 text-yellow-400" />
            <span className="ml-1 text-gray-600">{installer.rating.toFixed(1)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center text-gray-600">
            <LocationMarkerIcon className="h-5 w-5 mr-2" />
            <span>{installer.location}</span>
          </div>

          <div className="flex items-center text-gray-600">
            <BriefcaseIcon className="h-5 w-5 mr-2" />
            <span>{installer.yearsOfExperience} years of experience</span>
          </div>

          <div className="flex items-center text-gray-600">
            <CurrencyDollarIcon className="h-5 w-5 mr-2" />
            <span>Average quote: KES {installer.averageQuote?.toLocaleString() || 'Not available'}</span>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-gray-600 text-sm line-clamp-2">{installer.description}</p>
        </div>

        <div className="mt-6 flex justify-between items-center">
          <Link href={`/installers/${installer._id}`} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
            View Profile
          </Link>
          <a href={`tel:${installer.phoneNumber}`} className="text-blue-600 hover:text-blue-800">
            Contact
          </a>
        </div>
      </div>
    </div>
  );
};

export default InstallerCard; 