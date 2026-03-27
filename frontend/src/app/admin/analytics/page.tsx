'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export default function AnalyticsPage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    apiClient.getDashboardStats().then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <main className="min-h-screen bg-[#020617] text-slate-100 p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin" className="text-xs uppercase tracking-widest text-slate-400 hover:text-blue-300">
          Back to dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-black italic uppercase tracking-tighter flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-blue-400" /> Analytics
        </h1>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card label="Total Events" value={String(stats?.total_events ?? 0)} />
          <Card label="Total Photos" value={String(stats?.total_photos ?? 0)} />
          <Card label="Storage Used" value={String(stats?.storage_used ?? '0 MB')} />
        </div>
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-2xl font-black mt-2">{value}</p>
    </div>
  );
}
