'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (mode === 'signup') {
        await apiClient.signup({ name, email, password });
        setMode('login');
        setMessage('Account created. Please sign in.');
      } else {
        await apiClient.login({ email, password });
        router.push('/admin');
      }
    } catch (err: any) {
      setMessage(err?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#020617] text-slate-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-8">
        <h1 className="text-3xl font-black italic tracking-tighter uppercase mb-2">
          {mode === 'login' ? 'Login' : 'Signup'}
        </h1>
        <p className="text-xs text-slate-500 uppercase tracking-widest mb-6">
          PhotoMall AI Access
        </p>
        {message ? <p className="mb-4 text-sm text-blue-300">{message}</p> : null}
        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Full name"
              className="w-full rounded-xl border border-white/[0.1] bg-[#020617] px-4 py-3"
            />
          ) : null}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="Email"
            className="w-full rounded-xl border border-white/[0.1] bg-[#020617] px-4 py-3"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Password"
            className="w-full rounded-xl border border-white/[0.1] bg-[#020617] px-4 py-3"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-3 font-black uppercase tracking-wider disabled:opacity-60"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
          className="mt-5 text-xs uppercase tracking-widest text-slate-400 hover:text-blue-300"
        >
          {mode === 'login' ? 'Need an account? Signup' : 'Already registered? Login'}
        </button>
      </section>
    </main>
  );
}
