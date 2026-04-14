'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Camera, Upload, Loader2, Sparkles, ArrowRight, AlertCircle, CheckCircle, X, Sliders, Mail, Bell, BellRing } from 'lucide-react';
import { getImageUrl } from '@/lib/utils';
import Webcam from 'react-webcam';

// Selfie Search Modal Component
function SelfieSearchModal({
  eventId,
  onClose,
  onResultsFound,
  backendUrl
}: {
  eventId: string;
  onClose: () => void;
  onResultsFound: (results: any) => void;
  backendUrl: string;
}) {
  const [mode, setMode] = useState<'camera' | 'upload' | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.81);
  const [showThreshold, setShowThreshold] = useState(false);

  const webcamRef = useRef<Webcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const performSearch = async (file: File) => {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('threshold', threshold.toString());

    try {
      const response = await fetch(`${backendUrl}/api/py/portal/${eventId}/search-selfie`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      console.log('🔍 Search API Response:', data);

      if (data.success && data.photos && data.photos.length > 0) {
        setSuccess(`✨ Found ${data.photos.length} matching photos!`);
        onResultsFound(data);
        setTimeout(() => onClose(), 1500);
      } else {
        setError('No matching face found. Try a clearer photo or adjust sensitivity.');
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Failed to search. Make sure backend is running.');
    } finally {
      setLoading(false);
    }
  };

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setPreview(previewUrl);
      await performSearch(file);
      URL.revokeObjectURL(previewUrl);
    }
  };

  const reset = () => {
    setMode(null);
    setPreview(null);
    setError(null);
    setSuccess(null);
  };

  const getThresholdColor = (value: number) => {
    if (value >= 0.85) return 'text-green-400';
    if (value >= 0.75) return 'text-blue-400';
    return 'text-yellow-400';
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="bg-zinc-900 rounded-2xl p-8 max-w-sm w-full text-center">
          <Loader2 className="animate-spin text-purple-500 mx-auto" size={48} />
          <p className="mt-4 text-white font-medium">AI is analyzing your face...</p>
          <p className="text-zinc-500 text-sm mt-2">Match sensitivity: {Math.round(threshold * 100)}%</p>
        </div>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6">
          <img src={preview} alt="Preview" className="w-full rounded-lg mb-4" />
          {error && <p className="text-red-400 text-sm text-center mb-4">{error}</p>}
          {success && <p className="text-green-400 text-sm text-center mb-4">{success}</p>}
          <button onClick={reset} className="w-full py-2 bg-zinc-800 rounded-lg hover:bg-zinc-700">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles size={20} className="text-purple-400" />
            Find Your Photos
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-lg">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Sensitivity Slider */}
        <div className="mb-4 p-3 bg-zinc-800/30 rounded-xl">
          <button
            onClick={() => setShowThreshold(!showThreshold)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <Sliders size={14} />
              <span className="text-sm text-zinc-400">Match Sensitivity</span>
            </div>
            <span className={`text-sm font-mono ${getThresholdColor(threshold)}`}>
              {Math.round(threshold * 100)}%
            </span>
          </button>

          {showThreshold && (
            <div className="mt-3">
              <input
                type="range"
                min="0.70"
                max="0.95"
                step="0.01"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-zinc-500 mt-1">
                <span>More Matches</span>
                <span>More Accurate</span>
              </div>
            </div>
          )}
        </div>

        {!mode ? (
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => setMode('camera')} className="flex flex-col items-center gap-2 p-4 bg-zinc-800 rounded-xl hover:bg-zinc-700">
              <Camera size={32} className="text-blue-400" />
              <span className="text-white text-sm">Take Selfie</span>
            </button>
            <button onClick={() => setMode('upload')} className="flex flex-col items-center gap-2 p-4 bg-zinc-800 rounded-xl hover:bg-zinc-700">
              <Upload size={32} className="text-purple-400" />
              <span className="text-white text-sm">Upload Photo</span>
            </button>
          </div>
        ) : mode === 'camera' ? (
          <div>
            <Webcam ref={webcamRef} screenshotFormat="image/jpeg" className="w-full rounded-lg mb-4" />
            <div className="flex gap-3">
              <button onClick={captureSelfie} className="flex-1 py-2 bg-purple-600 rounded-lg">Capture</button>
              <button onClick={() => setMode(null)} className="px-4 py-2 bg-zinc-800 rounded-lg">Back</button>
            </div>
          </div>
        ) : (
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
            <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer">
              <Upload size={40} className="mx-auto text-purple-500 mb-2" />
              <p className="text-white text-sm">Click to upload</p>
            </div>
            <button onClick={() => setMode(null)} className="w-full mt-3 py-2 bg-zinc-800 rounded-lg">Back</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PortalPage() {
  const { eventid } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessEmail = searchParams.get('access');

  const [email, setEmail] = useState(accessEmail || '');
  const [otp, setOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [verified, setVerified] = useState(!!accessEmail);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [eventInfo, setEventInfo] = useState<{ name: string; photoCount: number } | null>(null);
  const [showSelfieSearch, setShowSelfieSearch] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Subscribe State
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const BACKEND_URL = '';

useEffect(() => {
    if (verified) {
        // ✅ Ensure guest_identifier is set
        if (!sessionStorage.getItem('guest_identifier')) {
            sessionStorage.setItem('guest_identifier', email);
        }
        
        const initGuest = async () => {
            let id = sessionStorage.getItem('guest_id');
            if (!id) {
                id = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                sessionStorage.setItem('guest_id', id);
            }
            setGuestId(id);
            await fetchEventInfo();
            await checkSubscriptionStatus();
        };
        initGuest();
    }
}, [verified, eventid, email]);  // ✅ email 

  const fetchEventInfo = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/py/portal/${eventid}/stats`);
      if (res.ok) {
        const data = await res.json();
        setEventInfo({
          name: data.event_name || `Event ${eventid}`,
          photoCount: data.photo_count || 0
        });
      } else {
        setEventInfo({ name: `Event ${eventid}`, photoCount: 0 });
      }
    } catch (err) {
      setEventInfo({ name: `Event ${eventid}`, photoCount: 0 });
    } finally {
      setLoading(false);
    }
  };

  // Check if already subscribed
  const checkSubscriptionStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/py/notifications/subscribers/${eventid}`);
      const data = await res.json();
      if (data.subscribers && data.subscribers.includes(email)) {
        setIsSubscribed(true);
      }
    } catch (err) {
      console.error('Check subscription error:', err);
    }
  };

  // Subscribe to email notifications
  const handleSubscribe = async () => {
    setSubscribing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/py/notifications/subscribe/${eventid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      });
      const data = await res.json();
      if (data.success) {
        setIsSubscribed(true);
        setSuccess('You will receive email notifications for this event!');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.message || 'Failed to subscribe');
        setTimeout(() => setError(null), 3000);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setTimeout(() => setError(null), 3000);
    } finally {
      setSubscribing(false);
    }
  };

  const sendOTP = async () => {
    if (!email || !email.includes('@')) {
      setError('Enter a valid email');
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/py/email/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, event_id: parseInt(eventid as string) })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowOtpInput(true);
        setSuccess('OTP sent! Check your email.');
      } else {
        setError(data.detail || 'Failed to send OTP');
      }
    } catch {
      setError('Network error');
    } finally {
      setVerifying(false);
      setTimeout(() => { setError(null); setSuccess(null); }, 3000);
    }
  };

  // ✅ FIXED verifyOTP function - Direct gallery redirect
  const verifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      setError('Enter 6-digit OTP');
      return;
    }
    setVerifying(true);
    setError(null);
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/py/email/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, event_id: parseInt(eventid as string) })
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        setVerified(true);
        setShowOtpInput(false);
        setSuccess('Access granted! Redirecting to gallery...');
        
        console.log('🔍 Redirecting to gallery for event:', eventid);
        
        // ✅ Use window.location for guaranteed redirect
        setTimeout(() => {
          window.location.href = `/portal/${eventid}/gallery`;
        }, 1500);
      } else {
        setError('Invalid OTP');
      }
    } catch (err) {
      console.error('OTP error:', err);
      setError('Network error');
    } finally {
      setVerifying(false);
      setTimeout(() => { setError(null); setSuccess(null); }, 3000);
    }
  };

  // ✅ FIXED handleSearchResults function
  const handleSearchResults = (results: any) => {
    console.log('🔍 Search results received:', results);
    
    // Check if results have photos
    if (!results.photos || results.photos.length === 0) {
      console.log('❌ No photos in results');
      setError('No matching photos found');
      return;
    }
    
    // Convert photos to have proper URLs
    const photosWithUrls = results.photos.map((photo: any) => ({
      id: photo.id,
      url: getImageUrl(photo.url || photo.file_path || ''),
      thumbnail_url: getImageUrl(photo.thumbnail_url || photo.url || ''),
      similarity_score: photo.similarity_score
    }));
    
    console.log('📸 Photos with URLs:', photosWithUrls.length);
    
    // Clear old data
    sessionStorage.removeItem('search_results');
    sessionStorage.removeItem('match_count');
    
    // Save new data
    sessionStorage.setItem('search_results', JSON.stringify(photosWithUrls));
    sessionStorage.setItem('match_count', results.match_count?.toString() || photosWithUrls.length.toString());
    
    // Verify save
    const saved = sessionStorage.getItem('search_results');
    console.log('✅ Saved to session. Length:', saved ? JSON.parse(saved).length : 0);
    
    // ✅ Redirect to gallery with search=true
    window.location.href = `/portal/${eventid}/gallery?search=true`;
  };

  if (!verified) {
    return (
      <div className="min-h-screen bg-black">
        <div className="max-w-md mx-auto px-4 py-20">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white">{eventInfo?.name || `Event ${eventid}`}</h1>
            <p className="text-zinc-400 mt-2">Enter your email to access photos</p>
          </div>
          <div className="bg-zinc-900/50 rounded-2xl p-6">
            {!showOtpInput ? (
              <div className="space-y-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white"
                />
                <button
                  onClick={sendOTP}
                  disabled={verifying}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold"
                >
                  {verifying ? 'Sending...' : 'Send OTP'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white text-center text-2xl"
                />
                <button
                  onClick={verifyOTP}
                  disabled={verifying}
                  className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold"
                >
                  {verifying ? 'Verifying...' : 'Verify & Access'}
                </button>
                <button onClick={() => setShowOtpInput(false)} className="w-full text-sm text-zinc-500">
                  Change email
                </button>
              </div>
            )}
            {error && <p className="mt-4 text-red-400 text-center text-sm">{error}</p>}
            {success && <p className="mt-4 text-green-400 text-center text-sm">{success}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header with Find My Face Button and Subscribe Button */}
      <header className="sticky top-0 z-10 bg-black/80 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">{eventInfo?.name || `Event ${eventid}`}</h1>
            <p className="text-xs text-zinc-500">{eventInfo?.photoCount || 0} photos • {email}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Subscribe Button */}
            <button
              onClick={handleSubscribe}
              disabled={subscribing || isSubscribed}
              className={`px-3 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2 ${
                isSubscribed 
                  ? 'bg-green-600/20 text-green-400 cursor-default' 
                  : 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30'
              }`}
            >
              {subscribing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isSubscribed ? (
                <BellRing size={14} />
              ) : (
                <Bell size={14} />
              )}
              {isSubscribed ? 'Subscribed' : 'Get Updates'}
            </button>
            
            {/* Find My Face Button */}
            <button
              onClick={() => setShowSelfieSearch(true)}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-medium hover:opacity-90 transition-all flex items-center gap-2"
            >
              <Camera size={16} />
              Find My Face
            </button>
          </div>
        </div>
      </header>

      {/* Selfie Search Modal */}
      {showSelfieSearch && (
        <SelfieSearchModal
          eventId={eventid as string}
          onClose={() => setShowSelfieSearch(false)}
          onResultsFound={handleSearchResults}
          backendUrl={BACKEND_URL}
        />
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="inline-flex items-center gap-2 bg-purple-500/10 rounded-full px-4 py-2 mb-6">
          <Sparkles size={16} className="text-purple-400" />
          <span className="text-purple-400 text-sm">AI-Powered Photo Finder</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-4">Find all photos with your face</h2>
        <p className="text-zinc-400 max-w-md mx-auto mb-8">
          Upload a selfie and our AI will instantly find every photo where you appear in this event.
        </p>
        <button
          onClick={() => setShowSelfieSearch(true)}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-medium inline-flex items-center gap-2"
        >
          <Camera size={18} />
          Get Started
        </button>
      </main>

      {success && (
        <div className="fixed bottom-6 right-6 bg-green-500 text-white px-4 py-3 rounded-xl shadow-xl z-50">
          {success}
        </div>
      )}
      {error && (
        <div className="fixed bottom-6 right-6 bg-red-500 text-white px-4 py-3 rounded-xl shadow-xl z-50">
          {error}
        </div>
      )}
    </div>
  );
}