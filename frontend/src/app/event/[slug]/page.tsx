'use client';

import { use, useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  Camera, 
  Calendar, 
  MapPin, 
  Image as ImageIcon,
  Download, 
  Share2, 
  Lock, 
  ChevronRight,
  ArrowLeft,
  Sparkles,
  Search,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiClient } from '@/lib/api-client';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface GalleryPhoto {
  id: number;
  preview_path?: string | null;
  file_path?: string | null;
  path?: string;
}

interface EventDetails {
  id: number;
  name: string;
  location?: string;
  count?: number;
  privacy_mode?: boolean;
  created_at?: string;
}

/* -------------------------------------------------------------------------- */
/* Page Component                                                             */
/* -------------------------------------------------------------------------- */

export default function PublicEventPortal({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  const eventId = resolvedParams.slug; // Slug is event ID for now

  const [event, setEvent] = useState<EventDetails | null>(null);
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEventData = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const [details, photoList] = await Promise.all([
        apiClient.getEventDetails(eventId),
        apiClient.getEventPhotos(eventId)
      ]);
      setEvent(details);
      setPhotos(Array.isArray(photoList) ? photoList : []);
    } catch (err: any) {
      console.error("[Portal Error]:", err);
      setError("Failed to load event details. Please check the link.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEventData();
  }, [fetchEventData]);

  const eventDate = useMemo(() => {
    if (!event?.created_at) return '—';
    const d = new Date(event.created_at);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }, [event]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full"
        />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-500/10 p-4 rounded-full mb-6 border border-red-500/20">
          <Lock className="text-red-500" size={32} />
        </div>
        <h1 className="text-2xl font-black italic uppercase text-white mb-2">Access Restricted</h1>
        <p className="text-slate-500 max-w-sm mb-8">{error || "This event link is invalid or expired."}</p>
        <Link href="/" className="px-8 py-4 bg-slate-900 border border-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-slate-800 transition-all">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-blue-500/30 overflow-x-hidden pb-20">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none opacity-40 overflow-hidden">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-blue-600/20 blur-[120px] rounded-full" />
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] bg-indigo-600/15 blur-[100px] rounded-full" />
      </div>

      {/* Hero Section */}
      <section className="relative pt-12 pb-20 px-4 sm:px-6 lg:px-10 border-b border-white/[0.05]">
        <div className="max-w-6xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 hover:text-blue-400 transition-colors mb-12">
            <ArrowLeft size={14} />
            Back
          </Link>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                 <span className="px-4 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-[9px] font-black uppercase tracking-[0.4em] text-blue-300 flex items-center gap-2">
                    <Sparkles size={12} className="text-cyan-400" />
                    Verified Event
                 </span>
                 <span className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-600">Ref #{event.id}</span>
              </div>
              
              <h1 className="text-5xl sm:text-7xl font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_40px_rgba(59,130,246,0.15)] leading-[0.9]">
                {event.name}
              </h1>

              <div className="flex flex-wrap items-center gap-6 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                <span className="flex items-center gap-2">
                  <Calendar size={16} className="text-blue-500" />
                  {eventDate}
                </span>
                <span className="flex items-center gap-2">
                  <MapPin size={16} className="text-indigo-500" />
                  {event.location}
                </span>
                <span className="flex items-center gap-2">
                  <ImageIcon size={16} className="text-cyan-500" />
                  {photos.length} Photos
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link 
                href={`/find-my-photos?event=${event.id}`}
                className="group relative px-10 py-5 bg-blue-600 rounded-[2rem] overflow-hidden transition-all hover:scale-105 active:scale-95 shadow-[0_20px_50px_rgba(37,99,235,0.3)]"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative flex items-center justify-center gap-3 text-white text-xs font-black uppercase tracking-[0.3em]">
                  <Camera size={18} />
                  Find My Photos
                  <ChevronRight size={16} />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Gallery / Privacy Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-10 max-w-7xl mx-auto">
        {event.privacy_mode ? (
          <div className="max-w-2xl mx-auto text-center py-20 px-8 rounded-[3rem] border border-dashed border-white/[0.1] bg-white/[0.02] backdrop-blur-md">
            <div className="bg-slate-900/80 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-8 border border-white/[0.05]">
               <Lock className="text-blue-500" size={32} />
            </div>
            <h3 className="text-2xl font-black italic uppercase text-white mb-4 tracking-tighter">Privacy Mode Active</h3>
            <p className="text-slate-500 text-sm font-medium leading-relaxed mb-10 max-w-md mx-auto">
              This gallery is protected. For your privacy, full browsing is disabled. Use our AI Face Search to securely find and unlock your personal photos.
            </p>
            <Link 
              href={`/find-my-photos?event=${event.id}`}
              className="inline-flex items-center gap-3 px-8 py-4 bg-white text-[#020617] rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-blue-500 hover:text-white transition-all shadow-xl"
            >
              <Search size={16} />
              Start Neural Scan
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-12">
               <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Event Gallery</h2>
               <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <CheckCircle2 size={14} className="text-green-500" />
                  Public Stream
               </div>
            </div>

            {photos.length === 0 ? (
              <div className="py-40 text-center border border-dashed border-white/[0.1] rounded-[3rem]">
                <p className="text-slate-500 font-bold italic">The photographer is still processing the assets. Check back soon!</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {photos.map((photo, i) => (
                  <motion.div
                    key={photo.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: (i % 5) * 0.1 }}
                    className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/[0.05] bg-slate-950/50"
                  >
                    <Image
                      src={apiClient.getImageUrl(photo.preview_path || photo.path || "")}
                      alt={`Photo ${photo.id}`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-110"
                      loading="lazy"
                    />
                    
                    {/* Hover Actions */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                    
                    <div className="absolute bottom-4 left-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-300">
                      <a 
                        href={apiClient.getImageUrl(photo.file_path || photo.path || "")}
                        target="_blank"
                        className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 p-2.5 rounded-xl flex items-center justify-center hover:bg-white hover:text-[#020617] transition-all"
                      >
                        <Download size={16} />
                      </a>
                      <button
                        onClick={() => {
                          const shareUrl = apiClient.getImageUrl(photo.file_path || photo.path || "");
                          if (navigator?.clipboard) {
                            navigator.clipboard
                              .writeText(shareUrl)
                              .then(() => console.log("Share link copied:", shareUrl))
                              .catch(() => console.log("Coming Soon: native share"));
                          } else {
                            console.log("Coming Soon: native share");
                          }
                        }}
                        className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 p-2.5 rounded-xl flex items-center justify-center hover:bg-white hover:text-[#020617] transition-all"
                      >
                        <Share2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Sticky Bottom Actions */}
      <AnimatePresence>
        {!event.privacy_mode && photos.length > 0 && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-full max-w-xs px-4"
          >
            <div className="bg-white/10 backdrop-blur-2xl border border-white/10 p-2 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex gap-2">
              <button className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all active:scale-95">
                <Download size={14} />
                Bulk Download
              </button>
              <button 
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="bg-white/10 hover:bg-white/20 text-white p-4 rounded-2xl transition-all"
              >
                <ArrowLeft className="rotate-90" size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
