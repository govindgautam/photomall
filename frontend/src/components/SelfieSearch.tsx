import { useState } from 'react';
import { apiClient } from '../lib/api-client';

/**
 * SelfieSearch Component
 * Handles face-based photo discovery using the device camera or gallery.
 */
export default function SelfieSearch({ 
  eventId, 
  onResultsFound 
}: { 
  eventId: string, 
  onResultsFound: (results: any) => void 
}) {
  const [searching, setSearching] = useState(false);

  /**
   * Process the uploaded/captured selfie and trigger AI matching
   */
  const handleSelfieUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSearching(true);
    try {
      // Direct call to our fixed apiClient
      const results = await apiClient.searchByFace(eventId, file);
      
      // Ensure we pass results back to the parent experience
      if (results) {
        onResultsFound(results);
      }
    } catch (err: any) {
      console.error("[Selfie Search Error]:", err.message);
      
      // User-friendly error messaging
      const errorMessage = err.message?.includes('404') 
        ? 'Search service is temporarily unavailable. Please contact support.' 
        : 'No face detected or connection lost. Please try another clear photo.';
        
      alert(errorMessage);
    } finally {
      setSearching(false);
      // Clear the input so the same file can be uploaded again if needed
      e.target.value = '';
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <label 
        className={`flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-full shadow-2xl cursor-pointer transition-all active:scale-95 ${
          searching ? 'opacity-80 cursor-not-allowed' : ''
        }`}
      >
        {searching ? (
          <span className="animate-spin text-xl">🌀</span>
        ) : (
          <span className="text-xl">📸</span>
        )}
        
        <span className="font-bold">
          {searching ? 'Searching...' : 'Find My Photos'}
        </span>

        <input 
          type="file" 
          className="hidden" 
          accept="image/*" 
          capture="user" 
          onChange={handleSelfieUpload} 
          disabled={searching}
        />
      </label>
    </div>
  );
}