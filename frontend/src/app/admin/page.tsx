'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  LayoutDashboard, Image as ImageIcon, Users, 
  Search, Upload, Plus, RefreshCw, Settings, LogOut, ChevronRight, Camera,
  WifiOff
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
 * * This component manages global stats, event streams, and the AI Neural Ingester.
 * It features real-time WebSocket progress tracking and robust error handling.
 */
export default function AdminDashboard() {
  const router = useRouter();
  const ingesterRef = useRef<HTMLDivElement>(null);
  
  // Architect Fix: Photographer ID state to allow dynamic updates
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

  // --- WebSocket Realtime ---
  const wsRef = useRef<WebSocket | null>(null);
  const wsCompleteRef = useRef(false);
  const ingestionActiveRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);

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

  // --- Real-Time Data Sync ---
  const refreshData = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    
    try {
      // Senior Architect Fix: Using Promise.allSettled to prevent "7 Issues" red badge 
      // when one endpoint fails but the other works.
      const results = await Promise.allSettled([
        apiClient.getDashboardStats(),
        apiClient.listEvents(photographerId)
      ]);
      
      const statsResult = results[0];
      const eventsResult = results[1];

      // --- MAPPING LOGIC FOR STATS ---
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
      
      // --- MAPPING LOGIC FOR EVENTS ---
      let finalEvents: any[] = [];
      
      if (eventsResult.status === 'fulfilled' && Array.isArray(eventsResult.value)) {
        finalEvents = eventsResult.value;
        console.log("[Architect Debug]: Backend Events Payload:", finalEvents);
      } 
      // Fallback: If listEvents fails but stats has recent_events, use that
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

      // Only show the big blue reconnecting UI if it's a manual refresh failure
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
      // Don't poll if we are actively uploading to keep the socket clear
      if (!loading) {
        refreshData(false);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [refreshData, loading]);

  // --- WebSocket initialization (direct backend access) ---
  useEffect(() => {
    const normalizedEventId = eventId.trim();
    if (!normalizedEventId) return;
    if (!loading) return;

    ingestionActiveRef.current = true;
    wsCompleteRef.current = false;
    reconnectAttemptsRef.current = 0;

    const wsUrl = `ws://127.0.0.1:8000/api/py/ws/ingestion/${normalizedEventId}`;
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
        // Don't set connection error immediately to prevent UI flicker
        setStatus('⚠️ Real-time link unstable. Processing assets...');
      };

      ws.onclose = (event) => {
        if (wsCompleteRef.current) return;
        if (!ingestionActiveRef.current) return;

        const attempts = reconnectAttemptsRef.current + 1;
        reconnectAttemptsRef.current = attempts;
        
        // Safety: Stop after 5 failed reconnect attempts
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
    setFiles(null); // Clear previous files
    setStatus('Ready for ingestion. Drop or select photos below.');
    ingesterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleUpload = async () => {
    if (!files || files.length === 0 || !eventId.trim()) {
      setStatus('Select an Event ID and at least one photo before uploading.');
      return;
    }

    setLoading(true);
    setIngestionComplete(false);
    setStatus('AI Engine: Initializing Stream... 🚀');
    setTotalCount(files.length);
    setProcessedCount(0);
    setProgress(0);
    setIndexingProgress(0);
    setLiveLog([]);

    try {
      await apiClient.uploadBulkPhotos(eventId, files);
      setStatus(`AI Engine: Processing ${files.length} photos... ⏳`);
      setFiles(null);
    } catch (err: any) {
      setStatus(`❌ Error: ${err.message || "Upload failed"}`);
      setLoading(false);
      closeWs();
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 flex font-sans selection:bg-blue-500/30 relative">
      
      {/* 🔴 UI FAILSAFE OVERLAY */}
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
              className="bg-[#0a0f1c] border border-blue-500/30 p-12 rounded-[3rem] shadow-[0_0_50px_rgba(59,130,246,0.2)] text-center max-w-md w-full relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-pulse" />
              <div className="bg-blue-600/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 border border-blue-500/20">
                <WifiOff className="text-blue-500 animate-pulse" size={40} />
              </div>
              <h3 className="text-2xl font-black italic text-white uppercase tracking-tighter mb-4">Neural Link Reconnecting...</h3>
              <p className="text-slate-500 text-sm font-bold uppercase tracking-widest mb-8 leading-relaxed">
                Attempting to re-establish bi-directional stream with AI Node 01
              </p>
              <div className="flex justify-center gap-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ repeat: Infinity, duration: 1, delay: i * 0.2 }}
                    className="w-2 h-2 rounded-full bg-blue-500"
                  />
                ))}
              </div>
              <button 
                onClick={() => refreshData(true)}
                className="mt-10 text-[10px] font-black text-blue-400 hover:text-white uppercase tracking-[0.3em] transition-colors"
              >
                Manual Override
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 1. PREMIUM SIDEBAR */}
      <aside className="w-72 bg-[#0a0f1c] border-r border-slate-800/50 hidden lg:flex flex-col p-8 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-12 px-2 cursor-pointer group" onClick={() => refreshData(true)}>
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-900/40 group-hover:scale-110 transition-transform">
            <ImageIcon size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white italic">
            PhotoMall <span className="text-blue-500 font-black">AI</span>
          </h1>
        </div>
        
        <nav className="space-y-1.5 flex-1">
          <NavItem icon={<LayoutDashboard size={18}/>} label="Dashboard" active />
          <NavItem icon={<ImageIcon size={18}/>} label="Events List" onClick={() => router.push('/admin/events')} />
          <NavItem icon={<Camera size={18}/>} label="Find my photos (guest)" onClick={() => router.push('/find-my-photos')} />
          <NavItem icon={<Users size={18}/>} label="Face Clusters" onClick={() => router.push('/admin/events')} />
          <NavItem icon={<Search size={18}/>} label="Analytics" onClick={() => router.push('/admin/analytics')} />
          <NavItem icon={<Settings size={18}/>} label="Engine Settings" onClick={() => router.push('/admin/settings')} />
        </nav>

        {/* System Monitor Area */}
        <div className="mt-auto bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-800/50 backdrop-blur-md">
          <p className="text-[10px] text-slate-500 uppercase font-black tracking-[0.2em] mb-4">Cloud Intelligence</p>
          <div className="h-2 w-full bg-slate-950 rounded-full mb-3 overflow-hidden">
            <div 
              className="h-full bg-blue-500 rounded-full transition-all duration-1000 shadow-[0_0_12px_rgba(59,130,246,0.6)]" 
              style={{ width: stats.total_photos > 0 ? `${Math.min(100, (stats.total_photos / 1000) * 100)}%` : '5%' }}
            ></div>
          </div>
          <div className="flex justify-between items-center font-mono text-[9px]">
            <span className="text-slate-400">{stats.storage_used || '0.1 GB'} / 10GB</span>
            <span className="text-blue-400 font-bold uppercase animate-pulse">Neural Node: ON</span>
          </div>
        </div>
      </aside>

      {/* 2. MAIN VIEWPORT */}
      <div className="flex-1 p-6 md:p-12 overflow-y-auto lg:max-w-[calc(100vw-288px)]">
        
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
          <div className="space-y-1">
            <h2 className="text-4xl font-black text-white tracking-tighter italic uppercase">Command Center</h2>
            <p className="text-slate-500 text-sm font-medium">Manage AI facial recognition streams</p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => refreshData(true)}
              className="p-4 bg-slate-900/80 hover:bg-slate-800 rounded-2xl transition-all border border-slate-800 group"
            >
              <RefreshCw size={20} className={`${refreshing ? 'animate-spin text-blue-400' : 'text-slate-500 group-hover:text-white'}`} />
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-2xl font-black transition-all shadow-xl shadow-blue-900/30 flex items-center gap-2 active:scale-95 uppercase text-xs tracking-widest"
            >
              <Plus size={18} /> New Event
            </button>
          </div>
        </header>

        {/* ANALYTICS GRID */}
        <StatsGrid 
          events={stats.total_events}
          photos={stats.total_photos}
          faces={stats.total_faces}
          storage={stats.storage_used}
        />

        {/* ACTIVE STREAMS SECTION */}
        <section className="mb-16 mt-16">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-black italic flex items-center gap-3 text-white uppercase tracking-tight">
              Active Event Streams
              <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-ping"></span>
            </h3>
            <button
              onClick={() => router.push('/admin/events')}
              className="text-xs font-bold text-slate-500 hover:text-blue-400 transition-colors uppercase tracking-widest flex items-center gap-1"
            >
              View All <ChevronRight size={14} />
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {recentEvents.length > 0 ? (
              recentEvents.map((event) => {
                const photoCount = Number(event.photo_count ?? event.count ?? event.photos?.length ?? 0) || 0;
                const created = event.created_at
                  ? new Date(event.created_at as string)
                  : null;
                const dateLabel =
                  created && !Number.isNaN(created.getTime())
                    ? created.toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '—';
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
              <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800/50 rounded-[3rem] bg-slate-900/10">
                <p className="text-slate-500 font-bold italic">No active streams detected. Create an event to begin.</p>
              </div>
            )}
          </div>
        </section>

        {/* AI INGESTER TERMINAL */}
        <section 
          ref={ingesterRef}
          className="max-w-4xl mx-auto bg-[#0a0f1c] rounded-[3rem] p-10 border border-slate-800 shadow-3xl relative overflow-hidden"
        >
          <div className="flex items-center gap-5 mb-10">
            <div className="bg-blue-600/10 p-4 rounded-2xl border border-blue-500/20">
              <Upload className="text-blue-500" size={28} />
            </div>
            <div>
              <h3 className="text-2xl font-black italic text-white uppercase tracking-tight">Neural Ingester</h3>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Bulk media indexing hub</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
             <div className="space-y-3">
                <EventIdInput
                  label="Event target ID"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full bg-[#020617] border border-slate-800 p-5 rounded-2xl focus:border-blue-500/50 outline-none transition-all font-mono text-blue-400 placeholder:text-slate-600 text-lg"
                />
             </div>
             <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1">Engine Status</label>
                <div className="bg-[#020617] border border-slate-800 p-5 rounded-2xl flex items-center justify-between text-xs uppercase italic overflow-hidden relative">
                   {loading ? (
                     <>
                       <div className="flex items-center gap-4 text-blue-400 font-black">
                         <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)] animate-pulse"></div> 
                         AI Processing Hub: Indexing {processedCount} / {totalCount}
                       </div>
                       <span className="font-mono text-blue-400">{indexingProgress}%</span>
                       {/* Progress Bar background */}
                       <div className="absolute bottom-0 left-0 h-1 bg-blue-500 transition-all duration-300 shadow-[0_0_8px_rgba(59,130,246,0.5)]" style={{ width: `${indexingProgress}%` }}></div>
                     </>
                   ) : ingestionComplete ? (
                     <>
                       <div className="flex items-center gap-4 text-green-500 font-black">
                         <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)]"></div> 
                         ✅ INGESTION COMPLETE
                       </div>
                       <span className="font-mono text-green-500">100%</span>
                       <div className="absolute bottom-0 left-0 h-1 bg-green-500 transition-all duration-300 shadow-[0_0_8px_rgba(34,197,94,0.5)]" style={{ width: '100%' }}></div>
                     </>
                   ) : (
                     <div className="flex items-center gap-4 text-green-500 font-black">
                        <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_12px_rgba(34,197,94,0.8)] animate-pulse"></div> 
                        AI Processing Hub: Ready
                     </div>
                   )}
                </div>
             </div>
          </div>

          <div className={`group relative border-2 border-dashed rounded-[2.5rem] p-16 text-center transition-all duration-500 cursor-pointer ${
            files ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 hover:border-slate-700 bg-slate-950/30'
          }`}>
            <input 
              type="file" multiple accept="image/*" 
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              onChange={(e) => {
                const selected = Array.from(e.target.files || []).slice(0, 100);
                setFiles(selected.length > 0 ? selected : null);
                if ((e.target.files?.length || 0) > 100) {
                  setStatus('Only the first 100 photos were selected for stability.');
                }
              }}
              disabled={loading}
            />
            {loading && liveLog.length > 0 ? (
              <div className="h-40 overflow-hidden flex flex-col items-center justify-center">
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.3em] mb-4">Neural Feed Live</p>
                <div className="w-full space-y-1">
                  {liveLog.map((log, idx) => (
                    <div key={idx} className="text-[9px] font-mono text-slate-500 flex items-center justify-center gap-2">
                      <span className="text-blue-500/50">#</span> {log} <span className="text-green-500/50">OK</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="bg-slate-900 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-500 shadow-2xl">
                  {files ? <ImageIcon className="text-blue-400" size={32} /> : <Upload className="text-slate-700" size={32} />}
                </div>
                <p className="text-2xl font-black text-white italic uppercase tracking-tighter">
                  {files ? `${files.length} Photos Prepared` : "Drop Event Assets Here"}
                </p>
                <p className="text-slate-600 mt-2 text-[10px] font-black uppercase tracking-[0.2em]">Automatic Vector Indexing</p>
              </>
            )}
          </div>

          <button 
            onClick={handleUpload} disabled={loading}
            className={`w-full mt-10 py-6 rounded-2xl font-black text-xl italic uppercase tracking-tighter transition-all active:scale-[0.98] flex items-center justify-center gap-4 ${
              loading
                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                : ingestionComplete
                  ? 'bg-green-600 text-white shadow-2xl shadow-green-900/40'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-2xl shadow-blue-900/40'
            }`}
          >
            {loading ? (
              <div className="flex items-center gap-4">
                <RefreshCw className="animate-spin text-blue-400" size={24} />
                <span className="animate-pulse">AI Neural Mapping {progress}%</span>
              </div>
            ) : ingestionComplete ? (
              <>
                <span>✅ INGESTION COMPLETE</span>
              </>
            ) : (
              <>
                <Plus size={24} />
                <span>Trigger Bulk Ingestion</span>
              </>
            )}
          </button>

          {status && (
            <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl text-center font-bold text-xs text-blue-400 tracking-widest animate-pulse uppercase">
              {status}
            </div>
          )}
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

function NavItem({ icon, label, active = false, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={`flex items-center gap-4 px-5 py-4 rounded-2xl cursor-pointer transition-all duration-300 group ${
      active 
        ? 'bg-blue-600/10 text-white border border-blue-500/10' 
        : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-200'
    }`}>
      <span className={`${active ? 'text-blue-500' : 'text-slate-600 group-hover:text-blue-400'} transition-colors`}>
        {icon}
      </span>
      <span className="font-black text-[10px] uppercase tracking-[0.2em]">{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,1)]"></div>}
    </div>
  );
}