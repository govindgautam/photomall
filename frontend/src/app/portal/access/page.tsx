// frontend/src/app/portal/access/page.tsx
"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Phone, ArrowRight, Sparkles, Shield, Camera, CheckCircle, AlertCircle } from 'lucide-react';

export default function PortalAccessPage() {
  const router = useRouter();
  const [accessMethod, setAccessMethod] = useState<'email' | 'phone'>('email');
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<any[]>([]);
  const [showEvents, setShowEvents] = useState(false);

  const BACKEND_URL = '';

  const handleAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Please enter your email or phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${BACKEND_URL}/api/py/portal/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        if (data.events && data.events.length > 0) {
          setEvents(data.events);
          setShowEvents(true);
          // Store guest identifier in session
          sessionStorage.setItem('guest_identifier', identifier);
        } else {
          setError('No events found for this identifier. Please check and try again.');
        }
      } else {
        setError(data.detail || 'Failed to find events. Please try again.');
      }
    } catch (err) {
      console.error('Access error:', err);
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleEventSelect = (eventId: number) => {
    sessionStorage.setItem('selected_event_id', eventId.toString());
    router.push(`/portal/event/${eventId}/gallery`);
  };

  if (showEvents) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500 rounded-full blur-3xl opacity-10"></div>
          <div className="absolute bottom-20 right-10 w-72 h-72 bg-purple-500 rounded-full blur-3xl opacity-10"></div>
        </div>

        <div className="relative max-w-2xl mx-auto px-4 py-12">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-full px-4 py-2 mb-4">
              <Sparkles size={16} className="text-blue-400" />
              <span className="text-blue-400 text-sm">Welcome Back</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Your Events</h1>
            <p className="text-zinc-400">Select an event to view your photos</p>
            <button
              onClick={() => setShowEvents(false)}
              className="mt-4 text-blue-400 text-sm hover:text-blue-300 transition-colors"
            >
              ← Use different email/phone
            </button>
          </div>

          {/* Event List */}
          <div className="space-y-4">
            {events.map((event) => (
              <button
                key={event.id}
                onClick={() => handleEventSelect(event.id)}
                className="w-full bg-zinc-900/50 backdrop-blur-sm rounded-xl border border-zinc-800 p-5 hover:border-blue-500/50 hover:bg-zinc-800/70 transition-all group text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-blue-400 transition-colors">
                      {event.name}
                    </h3>
                    <div className="flex flex-wrap gap-3 text-sm text-zinc-500">
                      {event.location && (
                        <div className="flex items-center gap-1">
                          <span>📍 {event.location}</span>
                        </div>
                      )}
                      {event.date && (
                        <div className="flex items-center gap-1">
                          <span>📅 {new Date(event.date).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Camera size={14} />
                        <span>{event.photo_count} photos</span>
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="text-zinc-500 group-hover:text-blue-400 transition-colors" size={20} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500 rounded-full blur-3xl opacity-10"></div>
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-purple-500 rounded-full blur-3xl opacity-10"></div>
      </div>

      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl mb-4 shadow-lg">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
              PhotoMall
            </h1>
            <p className="text-zinc-500 mt-2">Your memories, one click away</p>
          </div>

          {/* Main Card */}
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6 shadow-2xl">
            <div className="text-center mb-6">
              <Sparkles className="w-10 h-10 text-blue-500 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-white">Access Your Photos</h2>
              <p className="text-zinc-400 text-sm mt-2">
                Enter the email or phone number shared by your photographer
              </p>
            </div>

            {/* Access Method Toggle */}
            <div className="flex gap-2 bg-zinc-800/50 rounded-xl p-1 mb-6">
              <button
                onClick={() => setAccessMethod('email')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${
                  accessMethod === 'email'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Mail size={18} />
                <span className="text-sm font-medium">Email</span>
              </button>
              <button
                onClick={() => setAccessMethod('phone')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${
                  accessMethod === 'phone'
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Phone size={18} />
                <span className="text-sm font-medium">Phone</span>
              </button>
            </div>

            {/* Input Form */}
            <form onSubmit={handleAccess} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">
                  {accessMethod === 'email' ? 'Email Address' : 'Phone Number'}
                </label>
                <input
                  type={accessMethod === 'email' ? 'email' : 'tel'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={accessMethod === 'email' ? 'you@example.com' : '+91 98765 43210'}
                  className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  autoComplete="off"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
                  <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl font-semibold text-white hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Access Gallery</span>
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            {/* Info Section */}
            <div className="mt-8 pt-6 border-t border-zinc-800">
              <div className="flex flex-col gap-3 text-xs text-zinc-500">
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-1">
                    <Shield size={12} />
                    <span>Privacy Protected</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle size={12} />
                    <span>Instant Access</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Camera size={12} />
                    <span>AI-Powered</span>
                  </div>
                </div>
                <p className="text-center">
                  Enter the email or phone number shared by your photographer
                </p>
              </div>
            </div>
          </div>

          {/* Demo Links */}
          <div className="mt-6 text-center">
            <p className="text-zinc-600 text-xs mb-2">Demo Access (for testing):</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => setIdentifier('demo@example.com')}
                className="px-3 py-1 bg-zinc-800 rounded-full text-xs text-zinc-400 hover:text-white transition-colors"
              >
                demo@example.com
              </button>
              <button
                onClick={() => setIdentifier('+919876543210')}
                className="px-3 py-1 bg-zinc-800 rounded-full text-xs text-zinc-400 hover:text-white transition-colors"
              >
                +91 98765 43210
              </button>
            </div>
          </div>

          <p className="text-center text-zinc-600 text-xs mt-8">
            © 2024 PhotoMall. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}