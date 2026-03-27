'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import EventIdInput from '@/components/EventIdInput';

export default function GuestSearch() {
  const [file, setFile] = useState<File | null>(null);
  const [eventId, setEventId] = useState('');
  const [results, setResults] = useState<
    Array<{
      id?: number;
      photo_id?: number;
      preview_path?: string | null;
      file_path?: string | null;
      url?: string;
      similarity?: number;
    }>
  >([]);
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

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-12 font-sans">
      <div className="max-w-xl mx-auto mb-4 flex justify-end">
        <Link
          href="/admin"
          className="text-xs font-bold text-slate-400 hover:text-blue-600 transition-colors flex items-center gap-1"
        >
          Admin panel
        </Link>
      </div>

      <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-2xl p-8 border border-slate-100 transition-all hover:shadow-blue-100/50">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-slate-800 tracking-tight flex justify-center items-center gap-3">
            <span className="bg-blue-600 text-white p-2 rounded-2xl shadow-lg">📸</span>
            Find my photos
          </h1>
          <p className="text-slate-500 mt-2 font-medium italic">AI face matching</p>
        </div>

        {notice ? (
          <p
            role="alert"
            className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {notice}
          </p>
        ) : null}

        <div className="space-y-6">
          <EventIdInput
            label="Event ID"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-500 focus:bg-white outline-none transition-all text-slate-900 font-bold"
          />

          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-700 ml-1 uppercase tracking-wider">
              Selfie
            </label>
            <div
              className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${
                file
                  ? 'border-green-400 bg-green-50/30'
                  : 'border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30'
              }`}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                id="selfie-upload"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              <label htmlFor="selfie-upload" className="cursor-pointer block">
                <div className="text-3xl mb-3">{file ? '✅' : '🤳'}</div>
                <p
                  className={`font-bold text-lg mb-1 ${file ? 'text-green-600' : 'text-blue-600'}`}
                >
                  {file ? file.name : 'Tap to select a photo'}
                </p>
                <p className="text-slate-400 text-xs font-semibold">
                  Your face should be clearly visible
                </p>
              </label>
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-xl hover:bg-blue-700 active:scale-95 transition-all shadow-xl shadow-blue-200 disabled:bg-slate-300 disabled:shadow-none"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-3">
                <span className="animate-spin text-2xl">⚡</span> Searching…
              </span>
            ) : (
              'Find my photos'
            )}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="max-w-7xl mx-auto mt-20 px-4">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-black text-slate-800">
              <span className="text-blue-600">{results.length}</span> matching photos
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {results.map((photo) => (
              <div
                key={photo.photo_id ?? photo.id ?? String(photo.url ?? '')}
                className="group relative bg-white rounded-3xl overflow-hidden shadow-lg border border-slate-100 hover:shadow-2xl transition-all duration-300"
              >
                <div className="aspect-[4/5] overflow-hidden bg-slate-200">
                  <img
                    src={apiClient.getImageUrl(
                      String(photo.url || photo.preview_path || photo.file_path || '')
                    )}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    loading="lazy"
                  />
                </div>

                <div className="p-5 bg-white">
                  <button
                    type="button"
                    onClick={() =>
                      window.open(
                        apiClient.getImageUrl(
                          String(photo.url || photo.file_path || photo.preview_path || '')
                        ),
                        '_blank'
                      )
                    }
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-blue-600 transition-colors shadow-lg"
                  >
                    Open original
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
