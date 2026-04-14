"use client";
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import MasonryGrid from '@/components/portal/MasonryGrid';
import Lightbox from '@/components/portal/Lightbox';
import { 
  Loader2, ArrowLeft, Download, Share2, Sparkles, Image as ImageIcon, 
  X, AlertCircle, Mail, Phone, Camera, Upload, Sliders, CheckCircle, Bell, BellRing
} from 'lucide-react';
import { getImageUrl } from '@/lib/utils';
import Webcam from 'react-webcam';

interface Photo {
  id: string;
  url: string;
  file_path?: string;
  thumbnail_url?: string;
  similarity_score?: number;
}

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
      console.log('🔍 Search response:', data);
      
      if (data.success && data.photos && data.photos.length > 0) {
        setSuccess(`✨ Found ${data.photos.length} matching photos!`);
        onResultsFound(data);
        setTimeout(() => onClose(), 1500);
      } else {
        setError('No matching face found. Try a clearer photo or adjust sensitivity.');
      }
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.message || 'Failed to search.');
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
        setError('Could not capture photo.');
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

export default function GalleryPage() {
  const { eventid } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSearchResult = searchParams.get('search') === 'true';
  const accessCode = searchParams.get('access');
  
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImg, setSelectedImg] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [guestIdentifier, setGuestIdentifier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [eventInfo, setEventInfo] = useState<{ name: string; photoCount: number } | null>(null);
  const [showSelfieSearch, setShowSelfieSearch] = useState(false);
  
  // Subscribe State
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  const BACKEND_URL = '';

  // Step 1: Verify Access
  useEffect(() => {
    const verifyAccess = async () => {
      const storedIdentifier = sessionStorage.getItem('guest_identifier');
      const identifier = storedIdentifier || accessCode;
      
      if (!identifier) {
        router.push(`/portal/access?redirect=${eventid}`);
        return;
      }
      
      setGuestIdentifier(identifier);
      
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/py/portal/event/${eventid}/verify/${encodeURIComponent(identifier)}`
        );
        
        const data = await response.json();
        
        if (data.has_access) {
          setHasAccess(true);
          setEventInfo({
            name: data.event_name,
            photoCount: data.photo_count
          });
          
          sessionStorage.setItem('guest_identifier', identifier);
          
          let guestIdValue = sessionStorage.getItem('guest_id');
          if (!guestIdValue) {
            guestIdValue = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('guest_id', guestIdValue);
          }
          setGuestId(guestIdValue);
          
          loadPhotos();
          checkSubscriptionStatus();
        } else {
          setHasAccess(false);
          setError('You do not have access to this event.');
        }
      } catch (err) {
        console.error('Access verification failed:', err);
        setHasAccess(false);
        setError('Failed to verify access.');
      }
    };
    
    verifyAccess();
  }, [eventid, accessCode, router, BACKEND_URL]);

  // Check subscription status
  const checkSubscriptionStatus = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/py/notifications/subscribers/${eventid}`);
      const data = await res.json();
      if (data.subscribers && data.subscribers.includes(guestIdentifier)) {
        setIsSubscribed(true);
      }
    } catch (err) {
      console.error('Check subscription error:', err);
    }
  };

  // Subscribe handler
  const handleSubscribe = async () => {
    if (!guestIdentifier) {
      alert('Please login first');
      return;
    }
    
    setSubscribing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/py/notifications/subscribe/${eventid}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: guestIdentifier })
      });
      const data = await res.json();
      if (data.success) {
        setIsSubscribed(true);
        alert('You will receive email notifications for this event!');
      } else {
        alert(data.message || 'Failed to subscribe');
      }
    } catch (err) {
      console.error('Subscribe error:', err);
      alert('Network error. Please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  const loadPhotos = () => {
    console.log('🔍 loadPhotos called, isSearchResult:', isSearchResult);
    if (isSearchResult) {
      loadSearchResults();
    } else {
      fetchAllPhotos();
    }
  };

  // ✅ FIXED: Better search results loading
  const loadSearchResults = () => {
    const storedResults = sessionStorage.getItem('search_results');
    const storedMatchCount = sessionStorage.getItem('match_count');
    
    console.log('🔍 [GALLERY] Loading search results from session:', {
      hasResults: !!storedResults,
      matchCount: storedMatchCount
    });
    
    if (storedResults) {
      try {
        const results = JSON.parse(storedResults);
        console.log('📸 [GALLERY] Parsed results count:', results?.length);
        
        if (results && Array.isArray(results) && results.length > 0) {
          setPhotos(results);
          if (storedMatchCount) {
            setMatchCount(parseInt(storedMatchCount));
          }
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error('Failed to parse search results', e);
      }
    }
    
    // If no search results, clear and show all photos
    console.warn('⚠️ [GALLERY] No valid search results found, loading all photos');
    sessionStorage.removeItem('search_results');
    sessionStorage.removeItem('match_count');
    fetchAllPhotos();
  };

  const fetchAllPhotos = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `${BACKEND_URL}/api/py/portal/${eventid}/photos?identifier=${guestId}`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📸 Fetched all photos count:', data?.length || 0);
      
      const photosWithUrls = (data || []).map((photo: any) => ({
        id: photo.id,
        url: getImageUrl(photo.url || photo.file_path || ''),
        thumbnail_url: photo.thumbnail_url ? getImageUrl(photo.thumbnail_url) : undefined,
        similarity_score: photo.similarity_score
      }));
      
      setPhotos(photosWithUrls);
      setMatchCount(null);
      
    } catch (err) {
      console.error("Failed to load photos:", err);
      setError(err instanceof Error ? err.message : "Failed to load photos");
    } finally {
      setLoading(false);
    }
  }, [eventid, guestId, BACKEND_URL]);

  // ✅ FIXED: handleSearchResults with window.location
  const handleSearchResults = (results: any) => {
    console.log('🔍 [PORTAL] Search results received:', results);
    console.log('🔍 [PORTAL] Photos array:', results.photos);
    console.log('🔍 [PORTAL] Match count:', results.match_count);
    
    if (!results.photos || results.photos.length === 0) {
      console.log('❌ [PORTAL] No photos in results');
      setError('No matching photos found');
      return;
    }
    
    const photosWithUrls = results.photos.map((photo: any) => ({
      id: photo.id,
      url: getImageUrl(photo.url || photo.file_path || ''),
      thumbnail_url: getImageUrl(photo.thumbnail_url || photo.url || ''),
      similarity_score: photo.similarity_score
    }));
    
    console.log('📸 [PORTAL] Processed photos count:', photosWithUrls.length);
    
    // Clear old data
    sessionStorage.removeItem('search_results');
    sessionStorage.removeItem('match_count');
    
    // Save new data
    sessionStorage.setItem('search_results', JSON.stringify(photosWithUrls));
    sessionStorage.setItem('match_count', results.match_count?.toString() || photosWithUrls.length.toString());
    
    // Verify save
    const saved = sessionStorage.getItem('search_results');
    console.log('✅ [PORTAL] Saved to session. Length:', saved ? JSON.parse(saved).length : 0);
    
    // ✅ Use window.location for guaranteed redirect
    window.location.href = `/portal/${eventid}/gallery?search=true`;
  };

  const handleDownloadAll = async () => {
    if (!guestId) return;
    
    setDownloading(true);
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/py/download/event/${eventid}?identifier=${guestId}`
      );
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `event-${eventid}-photos.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      } else {
        throw new Error('Download failed');
      }
    } catch (err) {
      console.error("Download failed:", err);
      alert('Failed to download photos.');
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = () => {
    const shareData = {
      title: eventInfo?.name || 'Event Gallery',
      text: isSearchResult 
        ? `Found ${photos.length} photos with me at ${eventInfo?.name}!` 
        : `Check out photos from ${eventInfo?.name}!`,
      url: window.location.href.replace('?search=true', '').replace(/\?access=.*/, ''),
    };
    
    if (navigator.share) {
      navigator.share(shareData).catch(console.error);
    } else {
      navigator.clipboard.writeText(shareData.url);
      alert('Event link copied to clipboard!');
    }
  };

  const handleNewSearch = () => {
    sessionStorage.removeItem('search_results');
    sessionStorage.removeItem('match_count');
    window.location.href = `/portal/${eventid}`;
  };

  const handleClearFilter = () => {
    sessionStorage.removeItem('search_results');
    sessionStorage.removeItem('match_count');
    setMatchCount(null);
    fetchAllPhotos();
  };

  const handleGoToAccess = () => {
    router.push(`/portal/access?redirect=${eventid}`);
  };

  // Loading state
  if (loading && hasAccess === null) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <Loader2 className="animate-spin text-blue-500" size={48} />
        <p className="mt-4 text-zinc-400">Verifying access...</p>
      </div>
    );
  }

  // No access state
  if (hasAccess === false) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white p-4">
        <div className="text-center max-w-md mx-auto">
          <div className="text-red-500 text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-semibold mb-2">Access Denied</h2>
          <p className="text-zinc-400 mb-6">{error || 'You do not have access to this event.'}</p>
          <button
            onClick={handleGoToAccess}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Enter Email/Phone
          </button>
        </div>
      </div>
    );
  }

  // Loading photos state
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <Loader2 className="animate-spin text-blue-500" size={48} />
        <p className="mt-4 text-zinc-400">Loading your photos...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-black">
      {/* Header with Find My Face Button and Subscribe Button */}
      <nav className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-zinc-800 px-4 md:px-6 py-4 flex items-center justify-between">
        <button 
          onClick={() => isSearchResult ? handleNewSearch() : router.back()} 
          className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        
        <div className="text-center">
          <h1 className="text-sm font-bold uppercase tracking-widest text-zinc-500">
            {eventInfo?.name || 'Event Gallery'}
          </h1>
          {isSearchResult && matchCount && (
            <div className="flex items-center gap-1 justify-center mt-1">
              <Sparkles size={12} className="text-blue-400" />
              <span className="text-blue-400 text-xs font-medium">
                AI Matched: {photos.length} photos
              </span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
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
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xs font-medium hover:opacity-90 transition-all"
          >
            <Camera size={16} />
            <span className="hidden sm:inline">Find My Face</span>
          </button>
          
          <button
            onClick={handleShare}
            className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
          >
            <Share2 size={20} />
          </button>
          
          {photos.length > 0 && (
            <button
              onClick={handleDownloadAll}
              disabled={downloading}
              className="p-2 hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-50"
            >
              {downloading ? <Loader2 size={20} className="animate-spin" /> : <Download size={20} />}
            </button>
          )}
          
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center font-bold shadow-lg">
            {guestIdentifier?.charAt(0).toUpperCase() || 'G'}
          </div>
        </div>
      </nav>

      {/* Selfie Search Modal */}
      {showSelfieSearch && (
        <SelfieSearchModal
          eventId={eventid as string}
          onClose={() => setShowSelfieSearch(false)}
          onResultsFound={handleSearchResults}
          backendUrl={BACKEND_URL}
        />
      )}

      {/* Filter Chips */}
      {isSearchResult && (
        <div className="sticky top-[73px] z-30 bg-black/60 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex justify-center gap-3">
          <button 
            onClick={handleClearFilter}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-full text-xs font-medium transition-all flex items-center gap-2"
          >
            <X size={14} />
            Show All Photos
          </button>
          <button 
            onClick={handleNewSearch}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-full text-xs font-medium transition-all flex items-center gap-2"
          >
            <Sparkles size={14} />
            New Search
          </button>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 px-2 md:px-4">
        {photos.length > 0 ? (
          <>
            <div className="mb-6 px-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <ImageIcon size={16} className="text-blue-400" />
                </div>
                <p className="text-zinc-400 text-sm">
                  {isSearchResult ? (
                    <>
                      Found <span className="text-white font-semibold">{photos.length}</span> photos with you
                    </>
                  ) : (
                    <>
                      Showing all <span className="text-white font-semibold">{photos.length}</span> event photos
                    </>
                  )}
                </p>
              </div>
            </div>
            
            <MasonryGrid 
              photos={photos} 
              onPhotoClick={(url) => setSelectedImg(url)} 
            />
          </>
        ) : (
          <div className="text-center py-20 px-4">
            <div className="bg-zinc-900 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <ImageIcon size={40} className="text-zinc-700" />
            </div>
            <h2 className="text-2xl font-bold mb-2">No Photos Found</h2>
            <p className="text-zinc-500 max-w-xs mx-auto">
              {isSearchResult 
                ? "We couldn't find any photos matching your face in this event." 
                : "No photos have been uploaded to this event yet."}
            </p>
            <button 
              onClick={() => setShowSelfieSearch(true)}
              className="mt-6 px-4 py-2 rounded-xl bg-purple-600 text-white text-sm font-medium hover:opacity-90"
            >
              Find My Face
            </button>
          </div>
        )}
      </main>

      {selectedImg && (
        <Lightbox 
          url={selectedImg} 
          onClose={() => setSelectedImg(null)} 
        />
      )}
    </div>
  );
}