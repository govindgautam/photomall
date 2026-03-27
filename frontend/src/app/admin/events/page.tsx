'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Image as ImageIcon,
  LayoutGrid,
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';

export default function EventsIndexPage() {
  const router = useRouter();
  const photographerId = 1;
  const [events, setEvents] = useState<
    Array<Record<string, unknown> & { id: number; name?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.listEvents(photographerId);
      setEvents(Array.isArray(data) ? data : []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [photographerId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleEdit = async (id: number, currentName: string, currentLocation?: string) => {
    const name = window.prompt('Update event name', currentName || `Event ${id}`);
    if (name === null) return;
    const location = window.prompt('Update location', currentLocation || '');
    if (location === null) return;
    setBusyId(id);
    try {
      await apiClient.updateEvent(id, { name, location });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Delete event #${id}? This also removes linked photos.`)) return;
    setBusyId(id);
    try {
      await apiClient.deleteEvent(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 selection:bg-blue-500/30">
      <header className="border-b border-white/[0.06] bg-[#020617]/80 backdrop-blur-2xl sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-6 py-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white hover:border-blue-500/40 transition-all"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.4em] text-blue-400 mb-1">
                Streams
              </p>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white">
                Event gallery index
              </h1>
            </div>
          </div>
          <Link
            href="/admin"
            className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 hover:text-blue-400 transition-colors hidden sm:inline"
          >
            Command center
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-10 w-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 rounded-[2rem] border border-dashed border-white/[0.08] bg-white/[0.02]">
            <LayoutGrid className="w-12 h-12 mx-auto text-slate-600 mb-4" />
            <p className="text-slate-500 text-sm mb-6">No events found.</p>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-500"
            >
              Create event
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {events.map((ev) => (
              <li key={ev.id}>
                <div className="group flex items-center justify-between gap-4 p-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-blue-500/35 hover:bg-blue-500/[0.06] transition-all">
                  <Link href={`/admin/events/${ev.id}`} className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-white uppercase tracking-tight truncate italic">
                        {String(ev.name ?? `Event ${ev.id}`)}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                        Ref #{ev.id} · {String((ev as any).location ?? 'Unknown')}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === ev.id}
                      onClick={() => handleEdit(ev.id, String(ev.name ?? ''), String((ev as any).location ?? ''))}
                      className="p-2 rounded-xl border border-white/[0.12] text-slate-300 hover:text-blue-300 hover:border-blue-500/40 transition-all disabled:opacity-50"
                      aria-label="Edit event"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busyId === ev.id}
                      onClick={() => handleDelete(ev.id)}
                      className="p-2 rounded-xl border border-white/[0.12] text-slate-300 hover:text-red-300 hover:border-red-500/40 transition-all disabled:opacity-50"
                      aria-label="Delete event"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-slate-600 group-hover:text-blue-400 shrink-0 transition-colors" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
