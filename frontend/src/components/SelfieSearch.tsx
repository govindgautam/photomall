'use client';

import { useState, useRef } from 'react';
import { Camera, Upload, Loader2, X, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
import Webcam from 'react-webcam';
import { apiClient } from '../lib/api-client';

/**
 * SelfieSearch Component
 * Handles face-based photo discovery using the device camera or gallery.
 */
interface SelfieSearchProps {
  eventId: string;
  onResultsFound: (results: any) => void;
  onClose?: () => void;
}

export default function SelfieSearch({ 
  eventId, 
  onResultsFound,
  onClose 
}: SelfieSearchProps) {
  const [mode, setMode] = useState<'camera' | 'upload' | null>(null);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.81);
  const [showThreshold, setShowThreshold] = useState(false);
  
  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Process the uploaded/captured selfie and trigger AI matching
   */
  const performSearch = async (file: File) => {
    setSearching(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Direct call to our fixed apiClient
      const results = await apiClient.searchByFace(eventId, file, threshold);
      
      // Ensure we pass results back to the parent experience
      if (results && results.photos && results.photos.length > 0) {
        setSuccess(`✨ Found ${results.photos.length} matching photo(s)!`);
        onResultsFound(results);
        // Auto close after success
        setTimeout(() => {
          if (onClose) onClose();
        }, 1500);
      } else {
        setError('No matching face found. Try a clearer photo or adjust sensitivity.');
      }
    } catch (err: any) {
      console.error("[Selfie Search Error]:", err.message);
      
      // User-friendly error messaging
      const errorMessage = err.message?.includes('404') 
        ? 'Search service is temporarily unavailable. Please contact support.' 
        : err.message?.includes('No face detected')
          ? 'No face detected. Please use a clear photo with your face visible.'
          : 'Connection lost. Please try again.';
        
      setError(errorMessage);
    } finally {
      setSearching(false);
    }
  };

  /**
   * Capture selfie from webcam
   */
  const captureSelfie = async () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        const blob = await fetch(imageSrc).then(res => res.blob());
        const file = new File([blob], `selfie_${Date.now()}.jpg`, { type: "image/jpeg" });
        setPreview(imageSrc);
        await performSearch(file);
      } else {
        setError('Could not capture photo. Please try again.');
      }
    }
  };

  /**
   * Handle file upload
   */
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPEG, PNG, etc.)');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }
    
    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    await performSearch(file);
    URL.revokeObjectURL(previewUrl);
    event.target.value = '';
  };

  /**
   * Reset search state
   */
  const reset = () => {
    setMode(null);
    setPreview(null);
    setError(null);
    setSuccess(null);
  };

  /**
   * Get threshold color
   */
  const getThresholdColor = (value: number) => {
    if (value >= 0.85) return 'text-green-400';
    if (value >= 0.75) return 'text-blue-400';
    if (value >= 0.65) return 'text-yellow-400';
    return 'text-red-400';
  };

  // Loading state
  if (searching) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="bg-zinc-900 rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-purple-500 rounded-full blur-2xl opacity-20 animate-pulse"></div>
            <Loader2 className="animate-spin text-purple-500 relative z-10 mx-auto" size={48} />
          </div>
          <p className="mt-6 text-white font-medium">AI is analyzing your face...</p>
          <p className="text-zinc-500 text-sm mt-2">Match sensitivity: {Math.round(threshold * 100)}%</p>
          <div className="mt-4 w-full bg-zinc-800 rounded-full h-1 overflow-hidden">
            <div className="bg-purple-500 h-full rounded-full animate-pulse" style={{ width: '70%' }}></div>
          </div>
        </div>
      </div>
    );
  }

  // Preview with results
  if (preview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6">
          <div className="relative">
            <img src={preview} alt="Preview" className="w-full rounded-lg" />
            <button
              onClick={reset}
              className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-start gap-2">
              <CheckCircle size={16} className="text-green-400 shrink-0 mt-0.5" />
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}
          
          <button
            onClick={reset}
            className="mt-4 w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            Try Another Photo
          </button>
        </div>
      </div>
    );
  }

  // Main selection screen
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={20} className="text-purple-400" />
            <h3 className="text-lg font-bold text-white">Find Your Photos</h3>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-lg">
              <X size={20} className="text-slate-400" />
            </button>
          )}
        </div>
        
        <p className="text-zinc-400 text-sm mb-6">
          Take a selfie or upload a photo to find all images with your face
        </p>
        
        {/* Sensitivity Slider */}
        <div className="mb-6 p-3 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
          <button
            onClick={() => setShowThreshold(!showThreshold)}
            className="flex items-center justify-between w-full text-zinc-400 hover:text-white transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">🎯 Match Sensitivity</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-mono ${getThresholdColor(threshold)}`}>
                {Math.round(threshold * 100)}%
              </span>
              <span className="text-xs">▼</span>
            </div>
          </button>
          
          {showThreshold && (
            <div className="mt-4 pt-2 border-t border-zinc-700/50">
              <div className="flex justify-between text-xs text-zinc-500 mb-2">
                <span>More Matches</span>
                <span>More Accurate</span>
              </div>
              <input
                type="range"
                min="0.70"
                max="0.95"
                step="0.01"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between mt-2 text-xs">
                <span className="text-red-400">70%</span>
                <span className="text-yellow-400">75%</span>
                <span className="text-blue-400">80%</span>
                <span className="text-green-400">85%</span>
                <span className="text-green-400">95%</span>
              </div>
              <p className="text-xs text-zinc-500 mt-3 text-center">
                {threshold >= 0.85 ? "🔒 Strict matching - only exact matches" :
                 threshold >= 0.75 ? "⚖️ Balanced matching - recommended" :
                 "🎲 Loose matching - more results"}
              </p>
            </div>
          )}
        </div>
        
        {!mode ? (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setMode('camera')}
              className="flex flex-col items-center gap-3 p-6 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition-all group"
            >
              <Camera size={32} className="text-blue-400 group-hover:scale-110 transition-transform" />
              <span className="text-white text-sm font-medium">Take Selfie</span>
              <span className="text-zinc-500 text-xs">Use camera</span>
            </button>
            
            <button
              onClick={() => setMode('upload')}
              className="flex flex-col items-center gap-3 p-6 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition-all group"
            >
              <Upload size={32} className="text-purple-400 group-hover:scale-110 transition-transform" />
              <span className="text-white text-sm font-medium">Upload Photo</span>
              <span className="text-zinc-500 text-xs">JPG, PNG</span>
            </button>
          </div>
        ) : mode === 'camera' ? (
          <div>
            <Webcam
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              className="w-full rounded-lg mb-4"
              videoConstraints={{
                facingMode: "user",
                width: { ideal: 1280 },
                height: { ideal: 720 }
              }}
            />
            <div className="flex gap-3">
              <button
                onClick={captureSelfie}
                className="flex-1 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 text-white font-medium hover:shadow-lg transition-all"
              >
                Capture & Search ({Math.round(threshold * 100)}%)
              </button>
              <button
                onClick={() => setMode(null)}
                className="px-6 py-3 rounded-lg bg-zinc-800 text-white font-medium hover:bg-zinc-700 transition-all"
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-purple-500 transition-all"
            >
              <Upload size={48} className="mx-auto text-purple-500 mb-3" />
              <p className="text-white mb-1">Click to upload a photo</p>
              <p className="text-zinc-500 text-xs">or drag and drop</p>
            </div>
            <button
              onClick={() => setMode(null)}
              className="w-full mt-3 py-3 rounded-lg bg-zinc-800 text-white font-medium hover:bg-zinc-700 transition-all"
            >
              Back
            </button>
          </div>
        )}
        
        {/* Info Note */}
        <div className="mt-6 pt-4 border-t border-zinc-800 text-center">
          <p className="text-[10px] text-zinc-600">
            Your photo is processed locally and not stored permanently
          </p>
        </div>
      </div>
    </div>
  );
}