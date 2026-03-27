'use client';

import React, { useEffect, useState, useCallback, useMemo, use } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { 
  X, 
  QrCode, 
  ArrowLeft, 
  Zap,
  RefreshCcw,
  ImageOff,
  Download
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function AdminGallery({ params }: { params: Promise<{ eventId: string }> }) {
    const router = useRouter();
    
    // Proper way to unwrap params in Next.js 15
    const resolvedParams = use(params);
    const eventId = resolvedParams?.eventId;
    
    const [photos, setPhotos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [eventDetails, setEventDetails] = useState<any>(null);
    const [showQR, setShowQR] = useState(false);

    // Stable Guest URL for QR Code
    const guestUrl = useMemo(() => {
        if (typeof window !== 'undefined' && eventId && eventId !== 'undefined') {
            return `${window.location.origin}/search/${eventId}`;
        }
        return '';
    }, [eventId]);

    const fetchGalleryData = useCallback(async () => {
        if (!eventId || eventId === 'undefined') return;
        
        setLoading(true);
        try {
            // Parallel fetching for performance
            const [stats, photoData] = await Promise.all([
                apiClient.getDashboardStats(),
                apiClient.getEventPhotos(eventId)
            ]);

            // Sync Event Name from stats metadata
            if (stats?.recent_events) {
                const currentEvent = stats.recent_events.find((e: any) => e.id.toString() === eventId);
                if (currentEvent) setEventDetails(currentEvent);
            }

            console.log(`[Gallery DEBUG] Loaded ${photoData?.length || 0} assets`);
            setPhotos(photoData || []);
        } catch (err) {
            console.error("Critical Gallery Error:", err);
        } finally {
            setLoading(false);
        }
    }, [eventId]);

    useEffect(() => {
        fetchGalleryData();
    }, [fetchGalleryData]);

    // Guard Clause for invalid ID
    if (!eventId || eventId === 'undefined') {
        return (
            <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-center">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                    <X className="text-red-500" size={40} />
                </div>
                <h1 className="text-3xl font-black text-white mb-4 uppercase italic">Invalid Event Session</h1>
                <button onClick={() => router.push('/admin')} className="px-8 py-4 bg-white text-black font-black rounded-2xl hover:bg-blue-500 hover:text-white transition-all">
                    RETURN TO DASHBOARD
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#020617] text-white selection:bg-blue-500/30">
            {/* --- Sticky Header --- */}
            <header className="border-b border-white/5 bg-slate-950/80 backdrop-blur-2xl sticky top-0 z-50 px-6 py-4">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={() => router.push('/admin')} 
                            className="p-3 bg-slate-900 border border-white/5 rounded-2xl hover:bg-slate-800 transition-all text-slate-400 hover:text-white"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-black uppercase italic tracking-tighter">
                                {eventDetails?.name || (loading ? 'Syncing...' : 'Event Gallery')}
                            </h1>
                            <div className="flex items-center gap-3 text-[10px] text-slate-500 font-black mt-1 uppercase">
                                <span className="bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20">
                                    ID: {eventId}
                                </span>
                                <span className="flex items-center gap-1 text-slate-400">
                                    <Zap size={10} className="text-yellow-500 fill-yellow-500" /> 
                                    {photos.length} AI Indexed Assets
                                </span>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={fetchGalleryData} 
                            className="p-3 bg-slate-900 border border-white/5 rounded-2xl hover:bg-slate-800 transition-all" 
                            disabled={loading}
                        >
                            <RefreshCcw size={18} className={loading ? 'animate-spin text-blue-500' : 'text-slate-400'} />
                        </button>
                        <button 
                            onClick={() => setShowQR(!showQR)} 
                            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs transition-all shadow-xl ${
                                showQR ? 'bg-red-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-500'
                            }`}
                        >
                            <QrCode size={18} /> {showQR ? 'HIDE GATEWAY' : 'GET QR CODE'}
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto p-6 md:p-10">
                {/* --- QR Gateway Section --- */}
                {showQR && (
                    <div className="mb-12 p-8 bg-slate-900/40 border border-blue-500/20 rounded-[3rem] flex flex-col md:flex-row items-center gap-10 animate-in fade-in zoom-in duration-500">
                        <div className="bg-white p-5 rounded-[2.5rem] shadow-[0_0_50px_rgba(59,130,246,0.2)]">
                            <QRCodeSVG value={guestUrl} size={160} />
                        </div>
                        <div className="space-y-4 flex-1 text-center md:text-left">
                            <h2 className="text-4xl font-black italic uppercase tracking-tighter">Guest Experience Gateway</h2>
                            <p className="text-slate-400 text-sm font-medium">Share this link with guests. They can scan it to find their photos using AI Face Recognition instantly.</p>
                            <div className="flex items-center gap-2 p-2 bg-black/40 rounded-2xl border border-white/5 text-blue-400 font-mono text-[11px]">
                                <span className="flex-1 truncate px-3">{guestUrl}</span>
                                <button 
                                    onClick={() => { 
                                        navigator.clipboard.writeText(guestUrl); 
                                        alert("Link Copied to Clipboard!"); 
                                    }} 
                                    className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-sans font-black uppercase text-[10px] hover:bg-blue-500 transition-colors"
                                >
                                    Copy Link
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- Gallery Grid --- */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6">
                        <div className="h-12 w-12 border-[3px] border-blue-600/10 border-t-blue-500 rounded-full animate-spin"></div>
                        <p className="text-slate-500 font-black uppercase text-[9px] tracking-[0.4em] animate-pulse">Reconstructing AI Gallery</p>
                    </div>
                ) : (
                    <>
                        {photos.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                                {photos.map((photo, i) => {
                                    // Robust URL Resolution
                                    const rawPath = photo.path || photo.file_path || photo.url;
                                    const imageUrl = apiClient.getImageUrl(rawPath);

                                    return (
                                        <div key={photo.id || i} className="group relative bg-slate-900 rounded-[2rem] md:rounded-[2.5rem] overflow-hidden border border-white/5 hover:border-blue-500/50 transition-all duration-500 shadow-2xl aspect-[3/4]">
                                            <img 
                                                src={imageUrl} 
                                                className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" 
                                                alt="AI Indexed Asset"
                                                loading="lazy"
                                                onError={(e: any) => {
                                                    e.target.onerror = null;
                                                    e.target.src = "https://placehold.co/400x600/1e293b/475569?text=Broken+Asset";
                                                }}
                                            />
                                            
                                            {/* Overlay Actions */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-4">
                                                <a 
                                                  href={imageUrl} 
                                                  target="_blank" 
                                                  rel="noopener noreferrer" 
                                                  className="w-full py-3.5 bg-white text-black text-center text-[10px] font-black rounded-xl uppercase hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2"
                                                >
                                                    <Download size={14} /> VIEW SOURCE
                                                </a>
                                            </div>

                                            {/* AI Badge */}
                                            <div className="absolute top-4 left-4">
                                                <span className="text-[8px] font-black bg-blue-600 text-white px-2.5 py-1 rounded-lg uppercase tracking-widest shadow-lg">
                                                    AI INDEXED
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="min-h-[50vh] flex flex-col items-center justify-center text-center space-y-6 bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-white/5 p-10">
                                <div className="p-6 bg-slate-800/50 rounded-full">
                                    <ImageOff className="text-slate-600" size={48} />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-black italic uppercase text-slate-400">No Assets Detected</h3>
                                    <p className="text-slate-500 text-sm max-w-xs mx-auto">This event's neural index is currently empty. Start by uploading photos in the control center.</p>
                                </div>
                                <button 
                                    onClick={() => router.push('/admin')} 
                                    className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-[10px] uppercase transition-all shadow-xl"
                                >
                                    OPEN UPLOAD CONTROL
                                </button>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}