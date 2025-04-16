import React from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import InstallerDetailedProfile from '../../components/installers/InstallerDetailedProfile';

const InstallerDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;

  if (!id) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Solar Installer Details | SolarFit Kenya</title>
        <meta name="description" content="View detailed information about this solar installer" />
      </Head>

      <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <button
              onClick={() => router.back()}
              className="flex items-center text-blue-600 hover:text-blue-800"
            >
              <svg className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Results
            </button>
          </div>
          
          <InstallerDetailedProfile installerId={id} />
        </div>
      </div>
    </>
  );
};

export default InstallerDetailPage; 