'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { 
  BarChart3, 
  ArrowLeft, 
  TrendingUp, 
  Camera, 
  Users, 
  HardDrive,
  Calendar,
  RefreshCw
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface AnalyticsData {
  total_events: number;
  total_photos: number;
  total_faces: number;
  storage_used: string;
  recent_events?: Array<{
    id: number;
    name: string;
    photo_count: number;
    created_at: string;
  }>;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getDashboardStats();
      setStats(data);
      console.log('[Analytics] Loaded:', data);
    } catch (err) {
      console.error('[Analytics] Error:', err);
      setError('Failed to load analytics data. Make sure backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      {/* Header - Only Header, NO Sidebar */}
      <header className="border-b border-white/[0.06] bg-[#020617]/80 backdrop-blur-2xl sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between gap-4">
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
                Intelligence
              </p>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white flex items-center gap-3">
                <BarChart3 className="w-6 h-6 text-blue-400" /> 
                Analytics Dashboard
              </h1>
            </div>
          </div>
          <button
            onClick={loadStats}
            disabled={loading}
            className="p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white hover:border-blue-500/40 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>
      </header>

      {/* Main Content - NO Sidebar */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
            {error}
            <button onClick={loadStats} className="ml-3 underline">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="h-12 w-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <StatCard 
                icon={<Calendar className="w-5 h-5 text-blue-400" />}
                label="Total Events"
                value={stats?.total_events ?? 0}
              />
              <StatCard 
                icon={<Camera className="w-5 h-5 text-green-400" />}
                label="Total Photos"
                value={stats?.total_photos ?? 0}
              />
              <StatCard 
                icon={<Users className="w-5 h-5 text-purple-400" />}
                label="Faces Indexed"
                value={stats?.total_faces ?? 0}
              />
              <StatCard 
                icon={<HardDrive className="w-5 h-5 text-yellow-400" />}
                label="Storage Used"
                value={stats?.storage_used ?? '0 MB'}
              />
            </div>

            {/* Recent Events Section */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-black uppercase tracking-tighter flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                  Recent Events
                </h2>
                <button
                  onClick={() => router.push('/admin/events')}
                  className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-blue-400 transition-colors"
                >
                  View All →
                </button>
              </div>
              
              {stats?.recent_events && stats.recent_events.length > 0 ? (
                <div className="space-y-3">
                  {stats.recent_events.slice(0, 5).map((event) => (
                    <div
                      key={event.id}
                      onClick={() => router.push(`/admin/events/${event.id}`)}
                      className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-blue-500/30 hover:bg-blue-500/5 transition-all cursor-pointer"
                    >
                      <div>
                        <p className="font-bold text-white">{event.name}</p>
                        <p className="text-[10px] text-slate-500 mt-1">
                          {new Date(event.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-blue-400">{event.photo_count}</p>
                        <p className="text-[8px] text-slate-500 uppercase">Photos</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-500 py-8">No recent events</p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ 
  icon, 
  label, 
  value 
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string | number; 
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 hover:border-blue-500/30 transition-all">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
          {icon}
        </div>
      </div>
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-3xl font-black mt-2 text-white">{value}</p>
    </div>
  );
}