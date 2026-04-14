'use client';

import { SignInButton, useAuth, UserButton } from '@clerk/nextjs';
import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import EventIdInput from '@/components/EventIdInput';

export default function GuestSearch() {
  const { isSignedIn } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [eventId, setEventId] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSearch = async () => {
    setNotice(null);
    if (!file || !eventId.trim()) {
      setNotice('Please provide both an Event ID and a selfie image.');
      return;
    }
    setLoading(true);
    setResults([]);

    try {
      const data = await apiClient.searchByFace(eventId.trim(), file);
      const list = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.matches)
          ? (data as any).matches
          : [];

      if (list.length > 0) {
        setResults(list);
      } else {
        setNotice('No matching photos found. Try a clearer, front-facing photo.');
      }
    } catch (err: unknown) {
      console.error(err);
      setNotice(
        err instanceof Error
          ? err.message
          : 'Unable to reach the server. Ensure the API is running and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="text-6xl mb-4">📸</div>
          <h1 className="text-3xl font-black text-slate-800 mb-2">PhotoMall</h1>
          <p className="text-slate-500 mb-6">Sign in to access admin panel</p>
          <SignInButton mode="redirect" fallbackRedirectUrl="/admin">
            <button className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </button>
          </SignInButton>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans">
      <div className="max-w-xl mx-auto mb-4 flex justify-between items-center">
        <Link href="/admin" className="text-xs font-bold text-slate-400 hover:text-blue-600">
          Admin panel
        </Link>
        <UserButton />
      </div>
      <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-2xl p-8">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-slate-800">Find My Photos</h1>
          <p className="text-slate-500">AI face matching</p>
        </div>
        <EventIdInput
          label="Event ID"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="w-full p-4 bg-slate-50 border-2 rounded-2xl"
        />
        <div className="mt-6">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full p-4 border-2 rounded-2xl"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="w-full mt-6 bg-blue-600 text-white py-4 rounded-2xl font-bold"
        >
          {loading ? 'Searching...' : 'Find My Photos'}
        </button>
        {results.length > 0 && (
          <div className="mt-8 grid grid-cols-2 gap-4">
            {results.map((photo) => (
              <img key={photo.id} src={apiClient.getImageUrl(photo.url)} alt="" className="rounded-lg" />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}