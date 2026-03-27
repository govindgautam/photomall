'use client';

import Image from 'next/image';
import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
} from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  Fingerprint,
  ImageIcon,
  ScanLine,
  Sparkles,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';
import EventIdInput from '@/components/EventIdInput';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

interface MatchPhoto {
  id?: number;
  photo_id?: number;
  image_url?: string;
  url?: string;
  similarity?: number;
  preview_path?: string | null;
  file_path?: string | null;
  path?: string;
  event_id?: number;
}

interface SearchPayload {
  success?: boolean;
  message?: string;
  total_matches?: number;
  matches?: MatchPhoto[];
  event_name?: string;
}

function matchImageUrl(photo: MatchPhoto): string {
  const raw =
    photo.image_url || photo.url || photo.preview_path || photo.path || photo.file_path || '';
  return apiClient.getImageUrl(String(raw));
}

/** Backend `Event.id` is integer — query param must be digits only. */
function isNumericEventId(value: string): boolean {
  return /^\d+$/.test(value.trim());
}

function invalidEventHint(raw: string): string {
  const t = raw.trim();
  if (/your_event|placeholder|example|todo/i.test(t)) {
    return 'That value is documentation text, not a real ID. Use the numeric REF # from your event card in the admin dashboard (e.g. ?event=71).';
  }
  return 'Enter digits only — for example ?event=71. Copy the event ID from your invitation or admin dashboard.';
}

/* -------------------------------------------------------------------------- */
/* Shell + Suspense (useSearchParams)                                         */
/* -------------------------------------------------------------------------- */

export default function FindMyPhotosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#020617] flex items-center justify-center">
          <div className="h-10 w-10 rounded-full border-2 border-blue-500/20 border-t-blue-500 animate-spin" />
        </div>
      }
    >
      <FindMyPhotosExperience />
    </Suspense>
  );
}

function FindMyPhotosExperience() {
  const searchParams = useSearchParams();

  const [eventCode, setEventCode] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanningStatus, setScanningStatus] = useState<'connecting' | 'analyzing' | 'idle'>('idle');
  const [results, setResults] = useState<MatchPhoto[]>([]);
  const [phase, setPhase] = useState<'gate' | 'scan' | 'gallery'>('gate');
  const [toast, setToast] = useState<{
    kind: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'stable' | 'reconnecting' | 'failed'>('stable');

  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);
  const badUrlToastFor = useRef<string | null>(null);

  const resolvedEventId = eventCode.trim();

  const showToast = useCallback(
    (kind: 'success' | 'error' | 'info', text: string) => {
      setToast({ kind, text });
    },
    []
  );

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const e = searchParams.get('event') ?? searchParams.get('eventId');
    if (e === null || e.trim() === '') return;
    const trimmed = e.trim();
    if (!isNumericEventId(trimmed)) {
      setEventCode(trimmed);
      setPhase('gate');
      if (badUrlToastFor.current !== trimmed) {
        badUrlToastFor.current = trimmed;
        showToast('error', invalidEventHint(trimmed));
      }
      return;
    }
    badUrlToastFor.current = null;
    setEventCode(trimmed);
    setPhase('scan');
  }, [searchParams, showToast]);

  const setSelfieFile = useCallback(
    (f: File | null) => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setFile(f);
      if (f) {
        const url = URL.createObjectURL(f);
        previewUrlRef.current = url;
        setPreview(url);
      } else {
        setPreview(null);
      }
      setResults([]);
      setPhase((p) => (p === 'gallery' ? 'scan' : p));
    },
    []
  );

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const runVectorMatch = useCallback(
    async (selfie: File) => {
      if (!resolvedEventId) {
        showToast('error', 'Enter your event access code first.');
        return;
      }
      if (!isNumericEventId(resolvedEventId)) {
        showToast('error', invalidEventHint(resolvedEventId));
        return;
      }
      setScanning(true);
      setScanningStatus('connecting');
      setConnectionStatus('stable');
      setResults([]);
      
      // Intelligent multi-stage status updates
      const statusTimer = setTimeout(() => {
        setScanningStatus('analyzing');
      }, 100);

      try {
        const raw: unknown = await apiClient.searchByFace(resolvedEventId, selfie);

        clearTimeout(statusTimer);

        const list: MatchPhoto[] = Array.isArray(raw)
          ? (raw as MatchPhoto[])
          : (Array.isArray((raw as SearchPayload).matches) ? (raw as SearchPayload).matches as MatchPhoto[] : []);
        const eventName =
          !Array.isArray(raw) && typeof (raw as SearchPayload).event_name === 'string'
            ? (raw as SearchPayload).event_name
            : null;

        const validList = list.filter((item) => {
          if (!item || typeof item !== 'object') return false;
          const img = item.image_url || item.url || item.preview_path || item.path || item.file_path;
          const pid = item.photo_id ?? item.id;
          return Boolean(img) && (pid !== undefined && pid !== null);
        });

        if (validList.length > 0) {
          console.log(`[Neural Match] Successfully indexed ${validList.length} matches from neural node.`);
          setResults(validList);
          setEventTitle(eventName ?? null);
          setPhase('gallery');
          
          showToast(
            'success',
            `Success: Found ${validList.length} photos of you`
          );
        } else if (!Array.isArray(raw) && (raw as SearchPayload).success === false && (raw as SearchPayload).message) {
          showToast('info', (raw as SearchPayload).message as string);
          setResults([]);
          setPhase('scan');
        } else {
          showToast(
            'info',
            (!Array.isArray(raw) && (raw as SearchPayload).message) ? (raw as SearchPayload).message as string : 'No visual matches in this event yet. Try another angle.'
          );
          setResults([]);
          setPhase('scan');
        }
      } catch (e: unknown) {
        clearTimeout(statusTimer);
        const msg = e instanceof Error ? e.message : 'Neural search failed.';
        
        if (msg.includes('socket hang up') || msg.includes('ECONNRESET') || msg.includes('AbortError') || msg.includes('fetch failed')) {
          setConnectionStatus('reconnecting');
          showToast('error', 'Neural Link Busy: Retrying Connection...');
          // The retry logic is now handled in the apiClient with exponential backoff
        } else {
          setConnectionStatus('failed');
          showToast('error', msg);
        }
        
        setResults([]);
        setEventTitle(null);
        setPhase('scan');
      } finally {
        setScanning(false);
        setScanningStatus('idle');
      }
    },
    [resolvedEventId, showToast]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer.files?.[0];
      if (!f || !f.type.startsWith('image/')) {
        showToast('error', 'Drop a single image file (JPG / PNG).');
        return;
      }
      setSelfieFile(f);
      if (resolvedEventId) void runVectorMatch(f);
    },
    [resolvedEventId, runVectorMatch, setSelfieFile, showToast]
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setSelfieFile(f);
      if (resolvedEventId) void runVectorMatch(f);
    }
    e.target.value = '';
  };

  const unlockEvent = () => {
    if (!resolvedEventId) {
      showToast('error', 'Enter the event code from your invite or QR link.');
      return;
    }
    if (!isNumericEventId(resolvedEventId)) {
      showToast('error', invalidEventHint(resolvedEventId));
      return;
    }
    setPhase('scan');
    showToast('info', 'Ready. Drop or select a selfie to start the scan.');
  };

  const resetFlow = () => {
    setSelfieFile(null);
    setResults([]);
    setPhase(resolvedEventId ? 'scan' : 'gate');
    setEventTitle(null);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 selection:bg-blue-500/35 font-sans overflow-x-hidden">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.5]"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 90% 60% at 50% -25%, rgba(59,130,246,0.2), transparent), radial-gradient(ellipse 50% 40% at 100% 50%, rgba(99,102,241,0.12), transparent), radial-gradient(ellipse 45% 35% at 0% 80%, rgba(14,165,233,0.1), transparent)',
        }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-8 sm:py-12">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-10 sm:mb-14">
          <div className="space-y-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.35em] text-slate-500 hover:text-blue-400 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Home
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.4em] text-blue-300">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                PhotoMall AI
              </span>
              <span className="inline-flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.35em] text-slate-600">
                <Fingerprint className="w-3.5 h-3.5 text-indigo-400" />
                Guest neural lane
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_40px_rgba(59,130,246,0.12)]">
              Find{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-indigo-400">
                my photos
              </span>
            </h1>
            <p className="max-w-xl text-sm text-slate-500 font-medium leading-relaxed tracking-tight">
              One selfie. Vector match against our on-event face index. Your
              gallery appears only for this event—scoped for privacy.
            </p>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {phase === 'gate' ? (
            <motion.section
              key="gate"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
              className="max-w-lg mx-auto rounded-[2rem] border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl p-8 sm:p-10 shadow-[0_40px_100px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              <h2 className="text-lg font-black italic uppercase tracking-tighter text-white mb-2">
                Event access
              </h2>
              <p className="text-xs text-slate-500 mb-6 tracking-tight leading-relaxed">
                Your invite link includes a numeric ID, e.g.{' '}
                <code className="text-blue-400/90 font-mono text-[11px]">
                  ?event=71
                </code>
                .{' '}
                <span className="text-amber-500/90">
                  Replace placeholder text with the real REF # from the admin event card.
                </span>
              </p>
              <EventIdInput
                label="Event code"
                value={eventCode}
                onChange={(e) => setEventCode(e.target.value)}
                containerClassName="mb-0"
                className="w-full rounded-2xl border border-white/[0.1] bg-[#020617]/80 px-5 py-4 text-lg font-mono text-blue-300 placeholder:text-slate-600 outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
              />
              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={unlockEvent}
                className="mt-6 w-full rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-4 text-xs font-black uppercase tracking-[0.3em] text-white shadow-[0_16px_40px_rgba(37,99,235,0.35)] hover:from-blue-500 hover:to-indigo-500 transition-all"
              >
                Open neural scan
              </motion.button>
            </motion.section>
          ) : null}

          {phase === 'scan' || phase === 'gallery' ? (
            <motion.div
              key="main"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10"
            >
              <section className="lg:col-span-5 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.35em] text-slate-500">
                      Active stream
                    </p>
                    <p className="text-sm font-black italic uppercase tracking-tighter text-white">
                      Event #{resolvedEventId}
                      {eventTitle ? (
                        <span className="block text-[11px] font-bold text-slate-500 normal-case tracking-tight mt-1 not-italic">
                          {eventTitle}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPhase('gate');
                      resetFlow();
                    }}
                    className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-500 hover:text-blue-400 transition-colors"
                  >
                    Change code
                  </button>
                </div>

                <NeuralDropZone
                  preview={preview}
                  scanning={scanning}
                  scanningStatus={scanningStatus}
                  connectionStatus={connectionStatus}
                  onDrop={onDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }}
                  onPick={() => inputRef.current?.click()}
                  disabled={scanning}
                />
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  className="hidden"
                  onChange={onFileInput}
                />
                <p className="text-[10px] text-slate-600 text-center font-bold uppercase tracking-[0.2em]">
                  Drop portrait · auto-scan on release
                </p>
              </section>

              <section className="lg:col-span-7">
                {phase === 'gallery' && results.length > 0 ? (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  >
                    <div className="flex items-center justify-between gap-4 mb-6">
                      <h2 className="text-xl sm:text-2xl font-black italic uppercase tracking-tighter text-white">
                        Your matches
                      </h2>
                      <button
                        type="button"
                        onClick={resetFlow}
                        className="rounded-xl border border-white/[0.1] bg-white/[0.04] px-4 py-2 text-[9px] font-black uppercase tracking-[0.25em] text-slate-300 hover:border-blue-500/40 transition-all"
                      >
                        New selfie
                      </button>
                    </div>
                    <div className="columns-2 sm:columns-3 gap-4 [column-fill:balance]">
                      <AnimatePresence mode="popLayout">
                        {results.map((photo, i) => (
                          <motion.article
                            key={photo.photo_id ?? photo.id ?? i}
                            layout
                            initial={{ opacity: 0, scale: 0.94, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{
                              delay: i * 0.04,
                              type: 'spring',
                              stiffness: 400,
                              damping: 30,
                            }}
                            className="mb-4 break-inside-avoid group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-slate-950/50 shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
                          >
                            <div className="relative aspect-[3/4] w-full overflow-hidden">
                              <Image
                                unoptimized
                                src={matchImageUrl(photo)}
                                alt={`Match ${photo.photo_id ?? photo.id ?? i}`}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                                className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                                placeholder="blur"
                                blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA6mxuSQAAAABJRU5ErkJggg=="
                              />
                            </div>
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#020617]/90 via-transparent to-transparent opacity-60" />
                            <a
                              href={matchImageUrl(photo)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="absolute bottom-3 left-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-center rounded-xl bg-white text-[#020617] py-2.5 text-[9px] font-black uppercase tracking-[0.28em] hover:bg-blue-500 hover:text-white"
                            >
                              Open preview
                            </a>
                          </motion.article>
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ) : phase === 'gallery' && !scanning && results.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex min-h-[320px] flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/[0.1] bg-white/[0.02] p-10 text-center"
                  >
                    <ScanLine className="w-12 h-12 text-slate-600 mb-4" />
                    <h3 className="text-lg font-black italic uppercase tracking-tighter text-slate-400 mb-2">
                      No matches
                    </h3>
                    <p className="text-sm text-slate-500 max-w-sm tracking-tight">
                      Try brighter lighting, face the camera, or confirm you are
                      in this event&apos;s album.
                    </p>
                    <button
                      type="button"
                      onClick={resetFlow}
                      className="mt-8 rounded-2xl bg-blue-600 px-8 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-white hover:bg-blue-500"
                    >
                      Retry scan
                    </button>
                  </motion.div>
                ) : (
                  <div className="hidden lg:flex min-h-[400px] flex-col items-center justify-center rounded-[2rem] border border-white/[0.06] bg-white/[0.02] p-10 text-center">
                    <ImageIcon className="w-14 h-14 text-slate-700 mb-4" />
                    <p className="text-sm font-bold text-slate-600 tracking-tight max-w-xs">
                      Your private match grid will materialize here after the
                      neural scan completes.
                    </p>
                  </div>
                )}
              </section>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {toast ? (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className={`fixed left-1/2 top-6 z-[100] w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl ${
              toast.kind === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100'
                : toast.kind === 'error'
                  ? 'border-red-500/40 bg-red-950/90 text-red-100'
                  : 'border-blue-500/35 bg-[#0a1628]/95 text-blue-100'
            }`}
          >
            <p className="text-[11px] sm:text-xs font-black uppercase tracking-[0.12em] leading-snug text-center">
              {toast.text}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Neural drop zone + laser                                                     */
/* -------------------------------------------------------------------------- */

function NeuralDropZone({
  preview,
  scanning,
  scanningStatus,
  connectionStatus,
  onDrop,
  onDragOver,
  onPick,
  disabled,
}: {
  preview: string | null;
  scanning: boolean;
  scanningStatus: 'connecting' | 'analyzing' | 'idle';
  connectionStatus: 'stable' | 'reconnecting' | 'failed';
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onPick: () => void;
  disabled: boolean;
}) {
  const [hover, setHover] = useState(false);
  const rotate = useMotionValue(0);
  const borderGradient = useMotionTemplate`linear-gradient(${rotate}deg, rgba(59,130,246,0.85), rgba(99,102,241,0.5), rgba(34,211,238,0.65))`;

  useEffect(() => {
    let raf: number;
    const tick = () => {
      rotate.set((rotate.get() + 0.6) % 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // rotate is a stable MotionValue ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      layout
      className="relative rounded-[2rem] p-[1px] overflow-hidden"
      style={{ background: borderGradient }}
    >
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPick();
          }
        }}
        onDragEnter={() => setHover(true)}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          setHover(false);
          onDrop(e);
        }}
        onDragOver={onDragOver}
        onClick={onPick}
        className={`relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[1.96rem] border border-white/[0.06] bg-[#020617]/85 backdrop-blur-2xl transition-shadow duration-500 ${
          hover ? 'shadow-[0_0_60px_rgba(59,130,246,0.25)]' : ''
        } ${disabled ? 'pointer-events-none opacity-70' : ''}`}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Your selfie"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-[#020617]/25" />
            {scanning ? <LaserSweep /> : null}
            <div className="relative z-[2] flex flex-col items-center gap-3 p-6 text-center">
              <motion.div
                animate={scanning ? { scale: [1, 1.05, 1] } : {}}
                transition={{
                  repeat: scanning ? Infinity : 0,
                  duration: 1.2,
                }}
                className="rounded-full border border-blue-500/40 bg-black/50 px-4 py-2 text-[9px] font-black uppercase tracking-[0.35em] text-blue-200 backdrop-blur-md"
              >
                {connectionStatus === 'reconnecting' ? 'Neural Link Busy: Retrying...' :
                 scanningStatus === 'connecting' ? 'Connecting to Neural Node...' : 
                 scanningStatus === 'analyzing' ? 'Analyzing Biometrics...' : 
                 'Tap to replace'}
              </motion.div>
            </div>
          </>
        ) : (
          <div className="relative z-[1] flex flex-col items-center gap-5 p-10">
            <motion.div
              animate={
                hover
                  ? { scale: 1.08, boxShadow: '0 0 40px rgba(59,130,246,0.35)' }
                  : { scale: 1, boxShadow: '0 0 0 rgba(0,0,0,0)' }
              }
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="flex h-20 w-20 items-center justify-center rounded-3xl border border-blue-500/25 bg-blue-500/10 text-blue-400"
            >
              <Camera className="h-9 w-9" strokeWidth={1.5} />
            </motion.div>
            <div>
              <p className="text-lg font-black italic uppercase tracking-tighter text-white">
                Neural scan
              </p>
              <p className="mt-2 text-xs text-slate-500 font-medium tracking-tight">
                Drag & drop a clear selfie, or tap to capture
              </p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function LaserSweep() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[1.96rem]"
      aria-hidden
    >
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/10 via-transparent to-indigo-500/10" />
      <motion.div
        className="absolute left-0 right-0 h-[3px] rounded-full"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(34,211,238,0.2) 20%, rgba(147,197,253,1) 50%, rgba(34,211,238,0.2) 80%, transparent)',
          boxShadow:
            '0 0 24px 6px rgba(56,189,248,0.55), 0 0 48px 12px rgba(59,130,246,0.25)',
        }}
        initial={{ top: '0%' }}
        animate={{ top: ['0%', '100%'] }}
        transition={{
          duration: 0.8, // High-frequency scan
          repeat: Infinity,
          ease: 'linear',
        }}
      />
      <motion.div
        className="absolute left-0 right-0 h-px bg-cyan-400/80"
        initial={{ top: '0%', opacity: 0.4 }}
        animate={{ top: ['0%', '100%'], opacity: [0.5, 1, 0.5] }}
        transition={{
          duration: 0.8, // High-frequency scan
          repeat: Infinity,
          ease: 'linear',
        }}
        style={{
          boxShadow: '0 0 12px 2px rgba(34,211,238,0.9)',
        }}
      />
    </div>
  );
}
