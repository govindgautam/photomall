'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  LayoutDashboard, Image as ImageIcon, Users, 
  Search, Upload, Plus, RefreshCw, Settings, LogOut, ChevronRight, Camera,
  WifiOff, Share2, Mail, Phone, Sparkles, CheckCircle, AlertCircle, BarChart3, UserCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { apiClient } from '@/lib/api-client';
import StatsGrid from '@/components/StatsGrid';
import EventCard from '@/components/EventCard';
import CreateEventModal from '@/components/CreateEventModal';
import EventIdInput from '@/components/EventIdInput';

/**
 * ADMIN DASHBOARD - COMMAND CENTER
 * Senior Full-Stack Architect Edition
 */
export default function AdminDashboard() {
  const router = useRouter();
  const ingesterRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [photographerId, setPhotographerId] = useState(1);

  // --- UI States ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState('');
  const [connectionError, setConnectionError] = useState(false);

  // --- Data States ---
  const [stats, setStats] = useState({
    total_events: 0,
    total_photos: 0,
    total_faces: 0,
    storage_used: '0.0 GB'
  });
  const [recentEvents, setRecentEvents] = useState<any[]>([]);

  // --- Ingester States ---
  const [files, setFiles] = useState<File[] | null>(null);
  const [eventId, setEventId] = useState('');
  const [progress, setProgress] = useState(0);
  const [indexingProgress, setIndexingProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [liveLog, setLiveLog] = useState<string[]>([]);
  const [ingestionComplete, setIngestionComplete] = useState(false);

  // --- Quick Share State ---
  const [quickShareMessage, setQuickShareMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // --- WebSocket Realtime ---
  const wsRef = useRef<WebSocket | null>(null);
  const wsCompleteRef = useRef(false);
  const ingestionActiveRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

  const closeWs = useCallback(() => {
    wsCompleteRef.current = true;
    ingestionActiveRef.current = false;

    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // no-op
      }
    }
    wsRef.current = null;
  }, []);

  // --- Navigation Handlers ---
  const navigateToEventsList = () => {
    console.log('[Navigation] Navigating to Events List');
    router.push('/admin/events');
  };

  const navigateToFindMyPhotos = () => {
    console.log('[Navigation] Navigating to Find My Photos');
    router.push('/find-my-photos');
  };

  const navigateToFaceClusters = () => {
    console.log('[Navigation] Navigating to Face Clusters');
    router.push('/admin/events');
  };

  const navigateToAnalytics = () => {
    console.log('[Navigation] Navigating to Analytics');
    router.push('/admin/analytics');
  };

  const navigateToSettings = () => {
    console.log('[Navigation] Navigating to Settings');
    router.push('/admin/settings');
  };

  const navigateToDashboard = () => {
    console.log('[Navigation] Navigating to Dashboard');
    router.push('/admin');
  };

  // --- Quick Share Function ---
  const handleQuickShare = async (eventIdToShare: string) => {
  const email = prompt('Enter guest email address to share this event:');
  if (!email) return;
  
  if (!email.includes('@') || !email.includes('.')) {
    setQuickShareMessage({ type: 'error', text: '❌ Please enter a valid email address' });
    setTimeout(() => setQuickShareMessage(null), 3000);
    return;
  }
  
  try {
    // ✅ SIRF YAHAN CHANGE - BACKEND_URL HATAYA
    const response = await fetch(`/api/py/email/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, event_id: parseInt(eventIdToShare) })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      const successText = `✅ OTP sent to ${email}\n\nShare link: ${window.location.origin}/portal/event/${eventIdToShare}?access=${email}`;
      setQuickShareMessage({ type: 'success', text: successText });
      setTimeout(() => setQuickShareMessage(null), 5000);
    } else {
      const errorText = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || 'Failed to send OTP');
      setQuickShareMessage({ type: 'error', text: errorText });
      setTimeout(() => setQuickShareMessage(null), 3000);
    }
  } catch (err: any) {
    const errorText = err.message || 'Network error. Please try again.';
    setQuickShareMessage({ type: 'error', text: errorText });
    setTimeout(() => setQuickShareMessage(null), 3000);
  }
};
  // --- Real-Time Data Sync ---
  const refreshData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    
    try {
      const results = await Promise.allSettled([
        apiClient.getDashboardStats(),
        apiClient.listEvents(photographerId)
      ]);
      
      const statsResult = results[0];
      const eventsResult = results[1];

      if (statsResult.status === 'fulfilled' && statsResult.value && !statsResult.value.error) {
        const statsData = statsResult.value;
        console.log("[Architect Debug]: Backend Stats Payload:", statsData);
        
        setStats({
          total_events: Number(statsData.total_events ?? statsData.events ?? 0),
          total_photos: Number(statsData.total_photos ?? statsData.photos ?? statsData.total_photos_in_db ?? 0),
          total_faces: Number(statsData.total_faces ?? statsData.total_embeddings ?? statsData.faces ?? 0),
          storage_used: statsData.storage_used ?? statsData.storage ?? '1.52 GB'
        });
        setConnectionError(false);
      }
      
      let finalEvents: any[] = [];
      
      if (eventsResult.status === 'fulfilled' && Array.isArray(eventsResult.value)) {
        finalEvents = eventsResult.value;
        console.log("[Architect Debug]: Backend Events Payload:", finalEvents);
      } 
      else if (statsResult.status === 'fulfilled' && statsResult.value?.recent_events) {
        finalEvents = statsResult.value.recent_events;
      }

      const normalizedEvents = finalEvents.map((event: any) => ({
        ...event,
        id: event.id?.toString() || event.eventId?.toString() || "",
        photo_count: Number(event.photo_count ?? event.count ?? (Array.isArray(event.photos) ? event.photos.length : 0)) || 0
      }));

      setRecentEvents(normalizedEvents);
      
    } catch (err: any) {
      console.warn("[Architect Warning]: Dashboard Background Sync Throttled", err.message);
      
      const isConnectionError = 
        err.message?.includes('socket hang up') || 
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('fetch failed') ||
        err.message?.includes('Failed to fetch');

      if (isConnectionError && isManual) {
        setConnectionError(true);
      }
    } finally {
      if (isManual) setTimeout(() => setRefreshing(false), 500);
    }
  }, [photographerId]);

  // Initial Sync + Auto Polling (Every 15 seconds)
  useEffect(() => {
    refreshData();
    const interval = setInterval(() => {
      if (!loading) {
        refreshData(false);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [refreshData, loading]);

  // --- WebSocket initialization ---
  // --- WebSocket initialization ---
useEffect(() => {
  const normalizedEventId = eventId.trim();
  if (!normalizedEventId) return;
  if (!loading) return;

  ingestionActiveRef.current = true;
  wsCompleteRef.current = false;
  reconnectAttemptsRef.current = 0;

  // ✅ FIXED: Dynamic WebSocket URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/py/ws/ingestion/${normalizedEventId}`;
  console.log(`[WebSocket] Initializing: ${wsUrl}`);

    const connect = () => {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionError(false);
        console.log(`[WebSocket] Connected for Event ID: ${normalizedEventId}`);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!data || data.type !== 'PROGRESS_UPDATE') return;

          const progressObj = data.progress || {};
          const processed =
            typeof progressObj.processed === 'number'
              ? progressObj.processed
              : typeof data.processed === 'number'
                ? data.processed
                : 0;
          const total =
            typeof progressObj.total === 'number'
              ? progressObj.total
              : typeof data.total === 'number'
                ? data.total
                : 0;

          const p =
            typeof data.percentage === 'number'
              ? Math.round(data.percentage)
              : total > 0
                ? Math.round((processed / total) * 100)
                : 0;
          
          setProgress(p);
          setIndexingProgress(p);
          setProcessedCount(processed);
          if (total > 0) setTotalCount(total);

          if (typeof data.filename === 'string' && data.filename) {
            setLiveLog((prev) => [data.filename, ...prev].slice(0, 10));
          }

          setStats((prev) => {
            const currentPhotos = prev.total_photos + 1;
            const currentFaces = prev.total_faces + (data.face_count || 0);

            let newStorage = prev.storage_used;
            if (data.size_increment) {
              const match = prev.storage_used.match(/([\d.]+)\s*(MB|GB)/i);
              if (match) {
                let val = parseFloat(match[1]);
                const unit = match[2].toUpperCase();
                const incMB = data.size_increment / (1024 * 1024);

                if (unit === 'GB') val += incMB / 1024;
                else val += incMB;

                newStorage =
                  unit === 'GB' || val >= 1024
                    ? `${(unit === 'GB' ? val : val / 1024).toFixed(2)} GB`
                    : `${val.toFixed(2)} MB`;
              }
            }

            return {
              ...prev,
              total_photos: currentPhotos,
              total_faces: currentFaces,
              storage_used: newStorage,
            };
          });

          const wsStatus = typeof data.status === 'string' ? data.status.toLowerCase() : '';
          const isComplete = Boolean(data.is_complete) || wsStatus === 'completed' || p >= 100;
          
          if (isComplete) {
            wsCompleteRef.current = true;
            ingestionActiveRef.current = false;
            setIngestionComplete(true);
            setIndexingProgress(100);
            setProgress(100);

            setStatus(`✅ Success: ${data.total || processed} Photos Indexed.`);
            setTimeout(async () => {
              await refreshData(true);
              setLoading(false);
            }, 1500);

            closeWs();
          }
        } catch {
          // ignore malformed payloads
        }
      };

      ws.onerror = (err) => {
        console.error('[WebSocket] Critical connection error:', err);
        setStatus('⚠️ Real-time link unstable. Processing assets...');
      };

      ws.onclose = () => {
        if (wsCompleteRef.current) return;
        if (!ingestionActiveRef.current) return;

        const attempts = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempts;
        
        if (attempts > 5) return;

        const delayMs = Math.min(3000, 1000 * attempts);
        reconnectTimerRef.current = window.setTimeout(() => {
          try {
            console.warn(`[WebSocket] Attempting Reconnect ${attempts}/5...`);
            connect();
          } catch {
            // no-op
          }
        }, delayMs);
      };
    };

    connect();

    return () => {
      ingestionActiveRef.current = false;
      closeWs();
    };
  }, [eventId, loading, refreshData, closeWs]);

  // --- Handlers ---
  const prepareUpload = (id: string) => {
    setEventId(id);
    setFiles(null);
    setStatus('Ready for ingestion. Drop or select photos below.');
    ingesterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ✅ WORKING UPLOAD HANDLER
  const handleUpload = async () => {
    if (!files || files.length === 0 || !eventId.trim()) {
      setStatus('❌ Select an Event ID and at least one photo before uploading.');
      return;
    }

    setLoading(true);
    setIngestionComplete(false);
    setStatus('📤 Uploading photos to server...');
    setTotalCount(files.length);
    setProcessedCount(0);
    setProgress(0);
    setIndexingProgress(0);
    setLiveLog([]);

    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const response = await fetch(`${BACKEND_URL}/api/py/events/${eventId}/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      console.log('Upload response:', data);

      if (response.ok && data.success) {
        setStatus(`✅ ${data.uploaded_count} photos uploaded successfully!`);
        setIngestionComplete(true);
        setProgress(100);
        setIndexingProgress(100);
        
        setFiles(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        await refreshData(true);
        
        setQuickShareMessage({
          type: 'success',
          text: `✅ ${data.uploaded_count} photos uploaded! AI is processing them.`
        });
        setTimeout(() => setQuickShareMessage(null), 5000);
      } else {
        throw new Error(data.detail || data.message || 'Upload failed');
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setStatus(`❌ Upload failed: ${err.message}`);
      setQuickShareMessage({
        type: 'error',
        text: `❌ Upload failed: ${err.message}`
      });
      setTimeout(() => setQuickShareMessage(null), 5000);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans">
      
      {/* Connection Error Overlay */}
      <AnimatePresence>
        {connectionError && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/80 backdrop-blur-sm p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-[#0a0f1c] border border-blue-500/30 p-12 rounded-[3rem] text-center max-w-md w-full"
            >
              <div className="bg-blue-600/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8">
                <WifiOff className="text-blue-500 animate-pulse" size={40} />
              </div>
              <h3 className="text-2xl font-black italic text-white mb-4">Neural Link Reconnecting...</h3>
              <button 
                onClick={() => refreshData(true)}
                className="mt-6 text-[10px] font-black text-blue-400 hover:text-white uppercase tracking-[0.3em]"
              >
                Manual Override
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ✅ NO SIDEBAR HERE - ONLY MAIN CONTENT */}
      <div className="p-6 md:p-12">
        
        <header className="flex flex-col md:flex-row justify-between mb-12 gap-6">
          <div>
            <h2 className="text-4xl font-black text-white italic uppercase">Command Center</h2>
            <p className="text-slate-500 text-sm">Manage AI facial recognition streams</p>
          </div>
          <div className="flex gap-4">
            <button onClick={() => refreshData(true)} className="p-4 bg-slate-900/80 rounded-2xl border border-slate-800">
              <RefreshCw size={20} className={refreshing ? 'animate-spin text-blue-400' : 'text-slate-500'} />
            </button>
            <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-2">
              <Plus size={18} /> New Event
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <StatsGrid 
          events={stats.total_events} 
          photos={stats.total_photos} 
          faces={stats.total_faces} 
          storage={stats.storage_used} 
        />

        {/* Active Events */}
        <section className="mb-16 mt-16">
          <div className="flex justify-between mb-8">
            <h3 className="text-xl font-black text-white uppercase">Active Event Streams</h3>
            <button 
              onClick={navigateToEventsList} 
              className="text-xs text-slate-500 hover:text-blue-400 flex items-center gap-1"
            >
              View All <ChevronRight size={14} className="inline" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {recentEvents.length > 0 ? (
              recentEvents.map((event) => {
                const photoCount = Number(event.photo_count ?? 0);
                const dateLabel = event.created_at ? new Date(event.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                return (
                  <EventCard 
                    key={event.id}
                    id={event.id.toString()} 
                    name={event.name} 
                    date={dateLabel}
                    count={photoCount}
                    onUploadClick={() => prepareUpload(event.id.toString())}
                    onOpenGallery={(eid) => router.push(`/admin/gallery/${eid}`)}
                  />
                );
              })
            ) : (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800/50 rounded-[3rem]">
                <p className="text-slate-500">No active streams detected. Create an event to begin.</p>
              </div>
            )}
          </div>
        </section>

        {/* Toast Message */}
        <AnimatePresence>
          {quickShareMessage && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-6 right-6 z-50 max-w-md"
            >
              <div className={`p-4 rounded-xl shadow-xl flex items-start gap-3 ${quickShareMessage.type === 'success' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                {quickShareMessage.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                <p className="text-sm whitespace-pre-line">{String(quickShareMessage.text)}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Ingester */}
        <section ref={ingesterRef} className="max-w-4xl mx-auto bg-[#0a0f1c] rounded-[3rem] p-10 border border-slate-800">
          <div className="flex items-center gap-5 mb-10">
            <div className="bg-blue-600/10 p-4 rounded-2xl">
              <Upload className="text-blue-500" size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-black text-white uppercase">Neural Ingester</h3>
              <p className="text-slate-500 text-xs">Bulk media indexing hub</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <EventIdInput 
              label="Event target ID" 
              value={eventId} 
              onChange={(e) => setEventId(e.target.value)} 
              className="w-full bg-[#020617] border border-slate-800 p-5 rounded-2xl" 
            />
            <div>
              <label className="text-[10px] text-slate-500 uppercase ml-1">Engine Status</label>
              <div className="bg-[#020617] border border-slate-800 p-5 rounded-2xl flex justify-between">
                {loading ? (
                  <>AI Processing Hub: Indexing {processedCount} / {totalCount} <span>{indexingProgress}%</span></>
                ) : ingestionComplete ? (
                  <>✅ INGESTION COMPLETE <span>100%</span></>
                ) : (
                  <>AI Processing Hub: Ready</>
                )}
              </div>
            </div>
          </div>

          {/* ✅ FIXED DROP ZONE WITH ONCLICK */}
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-[2.5rem] p-16 text-center cursor-pointer transition-all ${files ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 hover:border-slate-700'}`}
          >
            <input 
              ref={fileInputRef}
              type="file" 
              multiple 
              accept="image/*" 
              className="hidden" 
              onChange={(e) => setFiles(Array.from(e.target.files || []))} 
              disabled={loading} 
            />
            {loading && liveLog.length > 0 ? (
              <div className="h-40 overflow-hidden">
                {liveLog.map((log, idx) => <div key={idx} className="text-[9px] text-slate-500">{log}</div>)}
              </div>
            ) : (
              <>
                <div className="bg-slate-900 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  {files ? <ImageIcon className="text-blue-400" size={32} /> : <Upload className="text-slate-700" size={32} />}
                </div>
                <p className="text-2xl font-black text-white">{files ? `${files.length} Photos Prepared` : "Drop Event Assets Here"}</p>
              </>
            )}
          </div>

          <button 
            onClick={handleUpload} 
            disabled={loading} 
            className={`w-full mt-10 py-6 rounded-2xl font-black text-xl ${loading ? 'bg-slate-800' : ingestionComplete ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-500'} text-white`}
          >
            {loading ? `AI Neural Mapping ${progress}%` : ingestionComplete ? '✅ INGESTION COMPLETE' : 'Trigger Bulk Ingestion'}
          </button>

          {status && <div className="mt-6 p-4 text-center text-xs text-blue-400">{status}</div>}
        </section>

        <CreateEventModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => refreshData(true)} 
        />
       
      </div>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: any; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-4 px-5 py-4 rounded-2xl cursor-pointer transition-all duration-300 group ${
      active 
        ? 'bg-blue-600/10 text-white border border-blue-500/10' 
        : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-200'
    }`}
    >
      <span className={`${active ? 'text-blue-500' : 'text-slate-600 group-hover:text-blue-400'} transition-colors`}>
        {icon}
      </span>
      <span className="font-black text-[10px] uppercase tracking-[0.2em]">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500"></div>}
    </div>
  );
}
