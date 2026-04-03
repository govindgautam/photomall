'use client';

import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Mail, 
  Copy, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Share2,
  QrCode,
  Users,
  Calendar,
  Image as ImageIcon,
  Sparkles,
  X
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';

export default function ShareEventPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string;
  
  const [email, setEmail] = useState('');
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpMessage, setOtpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [mounted, setMounted] = useState(false);

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-500" size={40} />
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Invalid Event</h1>
          <button
            onClick={() => router.push('/admin')}
            className="px-6 py-3 bg-blue-600 rounded-xl text-white"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Guest access URL
  const guestUrl = `${window.location.origin}/portal/event/${eventId}`;
  
  // Personalized link with email
  const getPersonalizedLink = () => {
    return `${window.location.origin}/portal/event/${eventId}?access=${encodeURIComponent(email)}`;
  };

  // Copy link to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Send OTP to guest
  const sendOTP = async () => {
    if (!email || !email.includes('@') || !email.includes('.')) {
      setOtpMessage({ type: 'error', text: 'Please enter a valid email address' });
      setTimeout(() => setOtpMessage(null), 3000);
      return;
    }

    setSendingOtp(true);
    setOtpMessage(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/py/email/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          event_id: parseInt(eventId)
        })
      });

      const data = await response.json();

      console.log('OTP Response:', data); // Debug log

      if (response.ok && data.success) {
        setOtpMessage({
          type: 'success',
          text: data.message || `✅ OTP sent to ${email}! Check your email.`
        });
        setEmail('');
      } else {
        setOtpMessage({
          type: 'error',
          text: data.detail || data.message || 'Failed to send OTP.'
        });
      }
    } catch (err) {
      console.error('OTP Error:', err);
      setOtpMessage({
        type: 'error',
        text: 'Network error. Make sure backend is running on port 8000.'
      });
    } finally {
      setSendingOtp(false);
      setTimeout(() => setOtpMessage(null), 5000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-black/50 backdrop-blur-2xl sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/admin')}
            className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white hover:border-blue-500/40 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-blue-400 mb-1">
              Share Event
            </p>
            <h1 className="text-xl font-black italic uppercase tracking-tighter text-white">
              Invite Guests
            </h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Event Info Card */}
        <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-2xl border border-blue-500/20 p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-blue-500/20 border border-blue-500/30">
              <ImageIcon className="w-6 h-6 text-blue-400" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white">Event #{eventId}</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                <span className="flex items-center gap-1">
                  <Calendar size={14} />
                  Share photos with guests
                </span>
                <span className="flex items-center gap-1">
                  <Users size={14} />
                  ID: {eventId}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowQR(!showQR)}
              className="p-2 rounded-xl bg-slate-800/50 hover:bg-slate-700 transition-all"
            >
              <QrCode className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* QR Code Modal */}
        <AnimatePresence>
          {showQR && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
              onClick={() => setShowQR(false)}
            >
              <div 
                className="bg-[#0a0f1c] border border-blue-500/30 rounded-2xl p-8 max-w-sm w-full text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-white">Scan to Access</h3>
                  <button onClick={() => setShowQR(false)} className="p-1 hover:bg-slate-800 rounded-lg">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <div className="bg-white p-4 rounded-2xl inline-block mx-auto mb-4">
                  <QRCodeSVG value={guestUrl} size={180} />
                </div>
                <p className="text-slate-400 text-sm mb-3 break-all">{guestUrl}</p>
                <button
                  onClick={() => copyToClipboard(guestUrl)}
                  className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-all"
                >
                  Copy Link
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Share Card */}
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-8">
          
          {/* Public Link Section */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Share2 className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-white">Public Gallery Link</h3>
            </div>
            <p className="text-slate-500 text-sm mb-3">
              Anyone with this link can view all event photos
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={guestUrl}
                className="flex-1 px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500/50"
              />
              <button
                onClick={() => copyToClipboard(guestUrl)}
                className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-all flex items-center gap-2"
              >
                {copied ? <CheckCircle size={18} /> : <Copy size={18} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.08]"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-zinc-900/50 text-slate-500 text-xs uppercase tracking-wider">or</span>
            </div>
          </div>

          {/* Email OTP Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-semibold text-white">Invite by Email</h3>
            </div>
            <p className="text-slate-500 text-sm mb-3">
              Send a 6-digit OTP to guest's email for secure access
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="guest@example.com"
                className="flex-1 px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-purple-500/50"
              />
              <button
                onClick={sendOTP}
                disabled={sendingOtp}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white font-medium transition-all hover:shadow-lg disabled:opacity-50 flex items-center gap-2"
              >
                {sendingOtp ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                {sendingOtp ? 'Sending...' : 'Send OTP'}
              </button>
            </div>

            {/* OTP Message */}
            {otpMessage && (
              <div className={`mt-3 p-3 rounded-xl flex items-start gap-2 text-sm ${
                otpMessage.type === 'success'
                  ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}>
                {otpMessage.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                <p>{otpMessage.text}</p>
              </div>
            )}

            {/* Personalized Link (after email entered) */}
            {email && email.includes('@') && (
              <div className="mt-4 pt-4 border-t border-white/[0.08]">
                <p className="text-xs text-slate-500 mb-2">Personalized access link:</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getPersonalizedLink()}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-800/60 text-xs text-slate-300 border border-white/[0.05]"
                  />
                  <button
                    onClick={() => copyToClipboard(getPersonalizedLink())}
                    className="px-3 py-2 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 transition-colors"
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 p-5 bg-blue-500/5 border border-blue-500/10 rounded-xl">
          <h4 className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-2">
            <Sparkles size={14} />
            How it works for guests
          </h4>
          <ul className="text-xs text-slate-500 space-y-2">
            <li>1. Guest clicks the link or scans QR code</li>
            <li>2. Enters email and OTP (if required)</li>
            <li>3. Browses all event photos</li>
            <li>4. Can upload selfie to find matching photos using AI</li>
          </ul>
        </div>

        {/* Back Button */}
        <div className="mt-8 text-center">
          <button
            onClick={() => router.push('/admin')}
            className="text-sm text-slate-500 hover:text-blue-400 transition-colors"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}