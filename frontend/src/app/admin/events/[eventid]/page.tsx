// frontend/src/app/admin/events/[eventid]/page.tsx
'use client';

import type { ReactNode } from 'react';
import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar,
  Cpu,
  ExternalLink,
  Image as ImageIcon,
  LayoutGrid,
  RefreshCw,
  ScanFace,
  Sparkles,
  Mail,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  Copy,
  Share2,
  X,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface GalleryPhoto {
  id: number;
  file_path?: string;
  preview_path?: string | null;
  path?: string;
  url?: string;
}

interface FaceClusterRow {
  id: number;
  photo_id: number;
  thumbnail_path?: string | null;
  preview_path?: string | null;
  original_path?: string | null;
}

interface EventDetailsPayload {
  id: number;
  name: string;
  location?: string;
  count?: number;
  created_at?: string | null;
}

function photoPreviewSrc(p: GalleryPhoto): string {
  const raw = p.preview_path || p.path || p.file_path || p.url || '';
  return apiClient.getImageUrl(String(raw));
}

function photoOriginalSrc(p: GalleryPhoto): string {
  const raw = p.file_path || p.path || p.url || p.preview_path || '';
  return apiClient.getImageUrl(String(raw));
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function EventGalleryCommandPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const resolved = use(params);
  const eventId = resolved?.id;

  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [clusters, setClusters] = useState<FaceClusterRow[]>([]);
  const [eventMeta, setEventMeta] = useState<EventDetailsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFaceId, setSelectedFaceId] = useState<number | null>(null);
  
  // Email/OTP State
  const [guestEmail, setGuestEmail] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpMessage, setOtpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  const BACKEND_URL = '';

  const loadAll = useCallback(async () => {
    if (!eventId || eventId === 'undefined') return;
    setLoading(true);
    setError(null);
    try {
      const [p, c] = await Promise.all([
        apiClient.getEventPhotos(eventId),
        apiClient.getEventFaceClusters(eventId),
      ]);
      setPhotos(Array.isArray(p) ? p : []);
      setClusters(Array.isArray(c) ? c : []);
      try {
        const e = await apiClient.getEventDetails(eventId);
        setEventMeta(e);
      } catch {
        setEventMeta(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync failure';
      setError(msg);
      setPhotos([]);
      setClusters([]);
      setEventMeta(null);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const eventDateLabel = useMemo(() => {
    const raw =
      eventMeta?.created_at ??
      (eventMeta as { date?: string } | null)?.date;
    if (!raw) return '—';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, [eventMeta]);

  const filteredPhotos = useMemo(() => {
    if (selectedFaceId == null) return photos;
    const row = clusters.find((c) => c.id === selectedFaceId);
    if (!row) return photos;
    return photos.filter((p) => p.id === row.photo_id);
  }, [photos, clusters, selectedFaceId]);

  const indexedFaceCount = clusters.length;

  const toggleFace = (faceId: number) => {
    setSelectedFaceId((prev) => (prev === faceId ? null : faceId));
  };

  // ==================== OTP Functions ====================
  
  const sendOTPToGuest = async () => {
    if (!guestEmail) {
      setOtpMessage({ type: 'error', text: 'Please enter an email address' });
      setTimeout(() => setOtpMessage(null), 3000);
      return;
    }
    
    if (!guestEmail.includes('@') || !guestEmail.includes('.')) {
      setOtpMessage({ type: 'error', text: 'Please enter a valid email address' });
      setTimeout(() => setOtpMessage(null), 3000);
      return;
    }
    
    setSendingOtp(true);
    setOtpMessage(null);
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/py/email/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: guestEmail,
          event_id: parseInt(eventId)
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setOtpMessage({ 
          type: 'success', 
          text: data.message || `✅ OTP sent to ${guestEmail}` 
        });
        setGuestEmail('');
      } else {
        setOtpMessage({ 
          type: 'error', 
          text: data.detail || 'Failed to send OTP. Check backend logs.' 
        });
      }
    } catch (err) {
      setOtpMessage({ 
        type: 'error', 
        text: 'Network error. Make sure backend is running on port 8000.' 
      });
    } finally {
      setSendingOtp(false);
      setTimeout(() => setOtpMessage(null), 5000);
    }
  };
  
  const getShareLink = () => {
    return `${window.location.origin}/portal/event/${eventId}?access=${encodeURIComponent(guestEmail)}`;
  };
  
  const copyShareLink = () => {
    const link = getShareLink();
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const getPublicLink = () => {
    return `${window.location.origin}/portal/event/${eventId}`;
  };
  
  const copyPublicLink = () => {
    navigator.clipboard.writeText(getPublicLink());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Quick Share Function - Direct OTP without modal
  const quickShare = () => {
    const email = prompt('Enter guest email address to share this event:');
    if (email && email.includes('@') && email.includes('.')) {
      fetch(`${BACKEND_URL}/api/py/email/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, event_id: parseInt(eventId) })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert(`✅ OTP sent to ${email}\n\nShare link: ${window.location.origin}/portal/event/${eventId}?access=${email}`);
        } else {
          alert(`❌ Failed: ${data.detail || 'Unknown error'}`);
        }
      })
      .catch(() => alert('❌ Network error. Please try again.'));
    } else if (email) {
      alert('❌ Please enter a valid email address');
    }
  };

  if (!eventId || eventId === 'undefined') {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-8 text-center">
        <p className="text-slate-500 text-xs font-black uppercase tracking-[0.35em] mb-4">
          Invalid route
        </p>
        <Link
          href="/admin"
          className="px-8 py-4 rounded-2xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-500 transition-colors"
        >
          Return to command center
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 selection:bg-indigo-500/30 font-sans">
      {/* Ambient mesh */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.45]"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59,130,246,0.22), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(99,102,241,0.15), transparent), radial-gradient(ellipse 50% 30% at 0% 100%, rgba(14,165,233,0.12), transparent)',
        }}
      />

      <header className="relative z-20 border-b border-white/[0.06] bg-[#020617]/55 backdrop-blur-2xl sticky top-0">
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10 py-5 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="shrink-0 p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white hover:border-blue-500/40 hover:bg-blue-500/10 transition-all duration-300 shadow-[0_0_24px_rgba(59,130,246,0.08)]"
              aria-label="Back to admin dashboard"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={2.2} />
            </button>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.4em] text-blue-400/90">
                  Neural stream
                </span>
                <span className="h-1 w-1 rounded-full bg-slate-600" />
                <span className="text-[9px] font-black uppercase tracking-[0.35em] text-slate-500">
                  ID {eventId}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_40px_rgba(59,130,246,0.15)] truncate">
                {loading && !eventMeta?.name
                  ? 'Synchronizing…'
                  : eventMeta?.name || 'Event gallery'}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-white/[0.04] border border-white/[0.06] text-slate-400">
                  <Calendar className="w-3.5 h-3.5 text-blue-400" />
                  {eventDateLabel}
                </span>
                {eventMeta?.location ? (
                  <span className="text-slate-600 tracking-tight normal-case font-medium">
                    {eventMeta.location}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <div className="flex flex-wrap gap-2">
              <StatPill
                icon={<ImageIcon className="w-4 h-4 text-cyan-400" />}
                label="Total photos"
                value={photos.length}
                accent="from-cyan-500/20 to-blue-600/10"
              />
              <StatPill
                icon={<ScanFace className="w-4 h-4 text-indigo-400" />}
                label="Indexed faces"
                value={indexedFaceCount}
                accent="from-indigo-500/25 to-violet-600/10"
              />
            </div>
            <button
              type="button"
              onClick={() => loadAll()}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-white/[0.05] border border-white/[0.1] text-[10px] font-black uppercase tracking-[0.25em] text-slate-300 hover:border-blue-500/35 hover:text-white hover:bg-blue-500/10 transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-400' : ''}`} />
              Resync
            </button>
            {/* ✅ QUICK SHARE BUTTON */}
            <button
              onClick={quickShare}
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-lg transition-all flex items-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              Share Event
            </button>
          </div>
        </div>
      </header>

      <LayoutGroup id={`gallery-${eventId}`}>
        <div className="relative z-10 mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 flex flex-col lg:flex-row gap-8 lg:gap-10">
          {/* ---------- Sidebar ---------- */}
          <aside className="w-full lg:w-[300px] shrink-0 flex flex-col gap-4 order-first lg:order-none">
            {/* Face Index Card */}
            <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between gap-3 bg-gradient-to-r from-blue-600/10 via-transparent to-indigo-600/10">
                <div className="flex items-center gap-2 min-w-0">
                  <Cpu className="w-4 h-4 text-blue-400 shrink-0" />
                  <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-200 truncate">
                    AI indexed faces
                  </h2>
                </div>
                <Sparkles className="w-4 h-4 text-amber-400/80 shrink-0" />
              </div>

              <div className="p-4">
                <button
                  type="button"
                  onClick={() => setSelectedFaceId(null)}
                  className={`w-full mb-4 py-3 px-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.28em] border transition-all duration-300 ${
                    selectedFaceId === null
                      ? 'border-blue-500/50 bg-blue-500/15 text-white shadow-[0_0_28px_rgba(59,130,246,0.25)]'
                      : 'border-white/[0.08] bg-white/[0.02] text-slate-500 hover:border-blue-500/25 hover:text-slate-200'
                  }`}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <LayoutGrid className="w-3.5 h-3.5" />
                    All photos
                  </span>
                </button>

                {loading ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <div className="h-9 w-9 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    <p className="text-[9px] font-black uppercase tracking-[0.35em] text-slate-500">
                      Loading index…
                    </p>
                  </div>
                ) : clusters.length === 0 ? (
                  <div className="py-12 px-4 text-center rounded-2xl bg-black/25 border border-dashed border-white/[0.08]">
                    <ScanFace className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                    <p className="text-xs font-bold text-slate-500 tracking-tight leading-relaxed">
                      No faces indexed for this stream yet. Ingest photos and wait
                      for the AI pipeline to finish.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-row lg:flex-col gap-3 overflow-x-auto lg:overflow-x-visible lg:overflow-y-auto max-h-[min(52vh,560px)] pb-1 lg:pb-0 [scrollbar-width:thin]">
                    {clusters.map((cluster, idx) => {
                      const src = cluster.thumbnail_path
                        ? apiClient.getImageUrl(cluster.thumbnail_path)
                        : '';
                      const active = selectedFaceId === cluster.id;
                      return (
                        <motion.button
                          key={cluster.id}
                          type="button"
                          layout
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{
                            delay: idx * 0.028,
                            type: 'spring',
                            stiffness: 380,
                            damping: 28,
                          }}
                          onClick={() => toggleFace(cluster.id)}
                          className={`group relative shrink-0 flex flex-col items-center gap-2 p-2 rounded-2xl border transition-all duration-300 ${
                            active
                              ? 'border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_32px_rgba(34,211,238,0.25)]'
                              : 'border-white/[0.06] bg-white/[0.02] hover:border-blue-500/35 hover:bg-blue-500/5'
                          }`}
                        >
                          <div
                            className={`relative h-16 w-16 sm:h-[4.5rem] sm:w-[4.5rem] rounded-full overflow-hidden ring-2 transition-all duration-300 ${
                              active
                                ? 'ring-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.45)]'
                                : 'ring-blue-500/25 group-hover:ring-blue-400/50'
                            }`}
                          >
                            {src ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={src}
                                alt=""
                                className="h-full w-full object-cover scale-110 group-hover:scale-125 transition-transform duration-500"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    'https://placehold.co/128x128/0f172a/475569?text=Face';
                                }}
                              />
                            ) : (
                              <div className="h-full w-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-600">
                                —
                              </div>
                            )}
                            <div className="absolute inset-0 rounded-full bg-gradient-to-t from-[#020617]/80 via-transparent to-transparent opacity-60 pointer-events-none" />
                          </div>
                          <span
                            className={`text-[8px] font-black uppercase tracking-[0.22em] max-w-[5.5rem] truncate ${
                              active ? 'text-cyan-300' : 'text-slate-500'
                            }`}
                          >
                            #{cluster.id}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* ==================== GUEST ACCESS CARD ==================== */}
            <div className="rounded-[1.75rem] border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3 bg-gradient-to-r from-blue-600/10 via-transparent to-purple-600/10">
                <Mail className="w-4 h-4 text-purple-400 shrink-0" />
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-200">
                  Share with guests
                </h2>
              </div>

              <div className="p-4 space-y-4">
                {/* Email Input */}
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                    Guest email address
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="guest@example.com"
                      className="flex-1 px-4 py-3 rounded-xl bg-slate-900/60 border border-white/[0.08] text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 transition-all"
                    />
                    <button
                      type="button"
                      onClick={sendOTPToGuest}
                      disabled={sendingOtp}
                      className="px-4 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {sendingOtp ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline">Send OTP</span>
                    </button>
                  </div>
                  <p className="text-[8px] text-slate-500 mt-2">
                    Guest will receive 6-digit OTP on email
                  </p>
                </div>

                {/* OTP Message */}
                {otpMessage && (
                  <div className={`p-3 rounded-xl flex items-start gap-2 text-xs ${
                    otpMessage.type === 'success' 
                      ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                      : 'bg-red-500/10 border border-red-500/20 text-red-400'
                  }`}>
                    {otpMessage.type === 'success' ? (
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <p className="text-xs">{otpMessage.text}</p>
                  </div>
                )}

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/[0.06]"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-3 bg-[#020617] text-slate-600 text-[9px] uppercase tracking-wider">or</span>
                  </div>
                </div>

                {/* Public Link Button */}
                <button
                  type="button"
                  onClick={() => setShowShareModal(!showShareModal)}
                  className="w-full py-3 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-300 hover:text-white hover:border-blue-500/40 transition-all text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  Get shareable link
                </button>

                {/* Share Modal */}
                {showShareModal && (
                  <div className="mt-3 p-4 rounded-xl bg-slate-900/90 border border-white/[0.1] space-y-4">
                    <div className="flex justify-between items-center">
                      <p className="text-[10px] font-bold text-white uppercase tracking-wider">
                        Share this event
                      </p>
                      <button
                        onClick={() => setShowShareModal(false)}
                        className="p-1 hover:bg-slate-800 rounded-lg"
                      >
                        <X className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>
                    
                    {/* Public Link */}
                    <div>
                      <label className="block text-[8px] text-slate-500 uppercase tracking-wider mb-1">
                        Public gallery link
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          readOnly
                          value={getPublicLink()}
                          className="flex-1 px-3 py-2 rounded-lg bg-slate-800/80 text-xs text-slate-300 border border-white/[0.05] focus:outline-none"
                        />
                        <button
                          onClick={copyPublicLink}
                          className="px-3 py-2 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 transition-colors"
                        >
                          {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                      <p className="text-[8px] text-slate-500 mt-1">
                        Anyone with this link can view all photos
                      </p>
                    </div>

                    {/* Personalized Link with Email */}
                    {guestEmail && (
                      <div>
                        <label className="block text-[8px] text-slate-500 uppercase tracking-wider mb-1">
                          Personalized access link
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={getShareLink()}
                            className="flex-1 px-3 py-2 rounded-lg bg-slate-800/80 text-xs text-slate-300 border border-white/[0.05] focus:outline-none"
                          />
                          <button
                            onClick={copyShareLink}
                            className="px-3 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 transition-colors"
                          >
                            {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-[8px] text-slate-500 mt-1">
                          Guest will need to enter OTP for access
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* QR Code Link */}
                <div className="pt-2 text-center border-t border-white/[0.05]">
                  <Link
                    href={`${BACKEND_URL}/static/qrcodes/event_${eventId}_qr.png`}
                    target="_blank"
                    className="text-[8px] text-slate-500 hover:text-blue-400 transition-colors uppercase tracking-wider inline-flex items-center gap-1"
                  >
                    <ScanFace className="w-3 h-3" />
                    View QR Code →
                  </Link>
                </div>
              </div>
            </div>
          </aside>

          {/* ---------- Main masonry gallery ---------- */}
          <main className="flex-1 min-w-0">
            {error ? (
              <div className="rounded-[2rem] border border-red-500/25 bg-red-500/5 p-10 text-center">
                <p className="text-sm font-bold text-red-300 tracking-tight mb-4">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => loadAll()}
                  className="px-6 py-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-xs font-black uppercase tracking-widest hover:bg-red-500/30 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : loading ? (
              <div className="flex flex-col items-center justify-center min-h-[50vh] gap-5">
                <div className="h-12 w-12 border-[3px] border-blue-600/15 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-[0.45em] text-slate-500">
                  Hydrating neural gallery…
                </p>
              </div>
            ) : photos.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="min-h-[52vh] flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed border-white/[0.07] bg-white/[0.02] backdrop-blur-sm p-12 text-center"
              >
                <div className="p-6 rounded-full bg-slate-900/80 border border-white/[0.06] mb-6">
                  <ImageIcon className="w-14 h-14 text-slate-600" />
                </div>
                <h3 className="text-2xl font-black italic uppercase tracking-tighter text-slate-400 mb-2">
                  Empty stream
                </h3>
                <p className="text-slate-500 text-sm max-w-md mb-8 leading-relaxed">
                  This event has no photos in storage. Return to the command center
                  and run a bulk ingestion for this stream.
                </p>
                <Link
                  href="/admin"
                  className="px-10 py-4 rounded-2xl bg-blue-600 text-white text-xs font-black uppercase tracking-[0.3em] hover:bg-blue-500 shadow-[0_16px_40px_rgba(37,99,235,0.35)] transition-all"
                >
                  Open command center
                </Link>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {selectedFaceId != null ? (
                  <motion.p
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400/90 flex items-center gap-2"
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
                    Filtered by face #{selectedFaceId} ·{' '}
                    {filteredPhotos.length} asset
                    {filteredPhotos.length !== 1 ? 's' : ''}
                  </motion.p>
                ) : null}

                <motion.div
                  layout
                  className="columns-2 sm:columns-3 xl:columns-4 gap-4 [column-fill:balance]"
                >
                  <AnimatePresence mode="popLayout">
                    {filteredPhotos.map((photo, i) => {
                      const preview = photoPreviewSrc(photo);
                      const original = photoOriginalSrc(photo);
                      return (
                        <motion.article
                          key={photo.id}
                          layout
                          layoutId={`photo-card-${eventId}-${photo.id}`}
                          initial={{ opacity: 0, y: 16, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          transition={{
                            type: 'spring',
                            stiffness: 420,
                            damping: 32,
                            delay: i * 0.02,
                          }}
                          className="mb-4 break-inside-avoid group relative rounded-[1.35rem] overflow-hidden border border-white/[0.07] bg-slate-950/40 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                        >
                          <div className="relative overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={preview}
                              alt=""
                              className="w-full h-auto block transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  'https://placehold.co/600x800/0f172a/64748b?text=Asset';
                              }}
                            />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/20 to-transparent opacity-50 group-hover:opacity-80 transition-opacity duration-500" />

                            <div className="absolute top-3 left-3">
                              <span className="text-[8px] font-black px-2.5 py-1 rounded-lg bg-blue-600/90 text-white uppercase tracking-[0.2em] border border-white/10 shadow-lg backdrop-blur-sm">
                                ID {photo.id}
                              </span>
                            </div>

                            <motion.div
                              initial={false}
                              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                            >
                              <a
                                href={original}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="pointer-events-auto inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-[#020617] text-[10px] font-black uppercase tracking-[0.28em] shadow-[0_12px_40px_rgba(0,0,0,0.35)] hover:bg-blue-500 hover:text-white transition-colors border border-white/20"
                              >
                                <ExternalLink className="w-4 h-4" />
                                View original
                              </a>
                            </motion.div>
                          </div>
                        </motion.article>
                      );
                    })}
                  </AnimatePresence>
                </motion.div>

                {selectedFaceId != null && filteredPhotos.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-16 text-center rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02]"
                  >
                    <p className="text-slate-500 text-sm font-medium tracking-tight">
                      No photo matches this face filter.
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedFaceId(null)}
                      className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-blue-400 hover:text-blue-300"
                    >
                      Clear filter
                    </button>
                  </motion.div>
                ) : null}
              </div>
            )}
          </main>
        </div>
      </LayoutGroup>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                              */
/* -------------------------------------------------------------------------- */

function StatPill({
  icon,
  label,
  value,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-md px-4 py-3 min-w-[140px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`}
    >
      <div
        className={`pointer-events-none absolute inset-0 opacity-90 bg-gradient-to-br ${accent}`}
      />
      <div className="relative flex items-center gap-3">
        <div className="p-2 rounded-xl bg-black/30 border border-white/[0.06]">
          {icon}
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.28em] text-slate-500">
            {label}
          </p>
          <p className="text-xl font-black tabular-nums tracking-tighter text-white">
            {value.toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}