'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';

export default function EngineSettingsPage() {
  const current = apiClient.getSession();
  const [tokenVisible, setTokenVisible] = useState(false);

  return (
    <main className="min-h-screen bg-[#020617] text-slate-100 p-8">
      <div className="max-w-3xl mx-auto">
        <Link href="/admin" className="text-xs uppercase tracking-widest text-slate-400 hover:text-blue-300">
          Back to dashboard
        </Link>
        <h1 className="mt-4 text-3xl font-black italic uppercase tracking-tighter">
          Engine Settings
        </h1>
        <section className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Session</p>
          {current?.access_token ? (
            <>
              <p className="text-sm text-slate-300">Logged in as: {current.name || `User ${current.user_id || ''}`}</p>
              <button
                onClick={() => setTokenVisible((v) => !v)}
                className="mt-3 text-xs uppercase tracking-widest text-blue-300 hover:text-blue-200"
              >
                {tokenVisible ? 'Hide token' : 'Show token'}
              </button>
              {tokenVisible ? <pre className="mt-3 text-xs break-all text-slate-400">{current.access_token}</pre> : null}
            </>
          ) : (
            <p className="text-sm text-amber-300">No active session found. Please login from /auth.</p>
          )}
        </section>
      </div>
    </main>
  );
}
