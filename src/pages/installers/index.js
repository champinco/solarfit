import React, { useState, useEffect } from 'react';
import InstallerCard from '../../components/installers/InstallerCard';
import axios from 'axios';

export default function InstallersPage() {
  const [installers, setInstallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    location: '',
    experience: '',
    rating: '',
  });

  useEffect(() => {
    fetchInstallers();
  }, [filters]);

  const fetchInstallers = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/installers', {
        params: filters,
      });
      setInstallers(response.data);
    } catch (error) {
      console.error('Error fetching installers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Find Solar Installers</h1>
          <p className="mt-2 text-lg text-gray-600">
            Browse our verified network of professional solar installers
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Location</label>
              <input
                type="text"
                name="location"
                value={filters.location}
                onChange={handleFilterChange}
                placeholder="e.g., Nairobi"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Minimum Experience (years)</label>
              <input
                type="number"
                name="experience"
                value={filters.experience}
                onChange={handleFilterChange}
                placeholder="e.g., 5"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Minimum Rating</label>
              <input
                type="number"
                name="rating"
                value={filters.rating}
                onChange={handleFilterChange}
                placeholder="e.g., 4.0"
                step="0.1"
                min="0"
                max="5"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Installers Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading installers...</p>
          </div>
        ) : installers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {installers.map((installer) => (
              <InstallerCard key={installer._id} installer={installer} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600">No installers found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
} 