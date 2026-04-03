'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Image as ImageIcon,
  LayoutGrid,
  Plus,
  Calendar,
  MapPin,
  RefreshCw
} from 'lucide-react';

import { apiClient } from '@/lib/api-client';

interface Event {
  id: number;
  name: string;
  location?: string;
  created_at?: string;
  photo_count?: number;
}

export default function EventsIndexPage() {
  const router = useRouter();
  const photographerId = 1;
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.listEvents(photographerId);
      setEvents(Array.isArray(data) ? data : []);
      console.log('[Events] Loaded:', data?.length || 0, 'events');
    } catch (err) {
      console.error('[Events] Load error:', err);
      setError('Failed to load events. Make sure backend is running.');
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
    } catch (err) {
      alert('Failed to update event');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Delete event #${id}? This will permanently remove all photos.`)) return;
    setBusyId(id);
    try {
      await apiClient.deleteEvent(id);
      await load();
    } catch (err) {
      alert('Failed to delete event');
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      {/* Header - Only Header, NO Sidebar */}
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
                Event Gallery Index
              </h1>
              <p className="text-xs text-slate-500 mt-1">
                {events.length} active {events.length === 1 ? 'event' : 'events'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              disabled={loading}
              className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white hover:border-blue-500/40 transition-all"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            </button>
            <button
              onClick={() => router.push('/admin')}
              className="px-4 py-2 rounded-xl bg-blue-600 text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-blue-500 transition-all flex items-center gap-2"
            >
              <Plus size={14} />
              New Event
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - NO Sidebar */}
      <main className="mx-auto max-w-5xl px-6 py-10">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
            <button onClick={load} className="ml-3 underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-10 w-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 rounded-[2rem] border border-dashed border-white/[0.08] bg-white/[0.02]">
            <LayoutGrid className="w-12 h-12 mx-auto text-slate-600 mb-4" />
            <p className="text-slate-500 text-sm mb-6">No events found.</p>
            <button
              onClick={() => router.push('/admin')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-500"
            >
              <Plus size={16} />
              Create Event
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <div
                key={ev.id}
                className="group flex items-center justify-between gap-4 p-5 rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:border-blue-500/35 hover:bg-blue-500/[0.06] transition-all cursor-pointer"
                onClick={() => router.push(`/admin/events/${ev.id}`)}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-white uppercase tracking-tight truncate italic text-lg">
                      {ev.name || `Event ${ev.id}`}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        <Calendar size={10} />
                        {formatDate(ev.created_at)}
                      </span>
                      {ev.location && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <MapPin size={10} />
                          {ev.location}
                        </span>
                      )}
                      <span className="text-[10px] text-blue-400">
                        {ev.photo_count || 0} photos
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    disabled={busyId === ev.id}
                    onClick={() => handleEdit(ev.id, ev.name, ev.location)}
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}