'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Mail, 
  Key, 
  Server, 
  Save, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  ArrowLeft,
  Settings,
  Shield,
  Eye,
  EyeOff,
  HelpCircle
} from 'lucide-react';

export default function SettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [email, setEmail] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpServer, setSmtpServer] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const BACKEND_URL = '';

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${BACKEND_URL}/api/py/user/smtp-settings`, {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setEmail(data.email || '');
          setSmtpServer(data.smtp_server || 'smtp.gmail.com');
          setSmtpPort(data.smtp_port?.toString() || '587');
        }
      } catch (err) {
        console.error('Failed to load settings', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, [BACKEND_URL]);

  const handleSave = async () => {
    if (!email || !email.includes('@')) {
      setMessage({ type: 'error', text: 'Please enter a valid email address' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (!smtpPassword) {
      setMessage({ type: 'error', text: 'Please enter your app password' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/py/user/smtp-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email,
          smtp_password: smtpPassword,
          smtp_server: smtpServer,
          smtp_port: parseInt(smtpPort)
        })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage({ 
          type: 'success', 
          text: '✅ Email settings saved! Guests will receive OTP from your email.' 
        });
        setSmtpPassword('');
      } else {
        setMessage({ 
          type: 'error', 
          text: data.detail || 'Failed to save settings' 
        });
      }
    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: 'Network error. Please try again.' 
      });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 5000);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      setTestResult({ type: 'error', text: 'Please enter a valid test email address' });
      setTimeout(() => setTestResult(null), 3000);
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/py/email/test-smtp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          test_email: testEmail,
          email,
          smtp_password: smtpPassword,
          smtp_server: smtpServer,
          smtp_port: parseInt(smtpPort)
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setTestResult({ 
          type: 'success', 
          text: `✅ Test email sent to ${testEmail}! Check your inbox.` 
        });
      } else {
        setTestResult({ 
          type: 'error', 
          text: data.detail || 'Failed to send test email.' 
        });
      }
    } catch (err) {
      setTestResult({ 
        type: 'error', 
        text: 'Network error. Please try again.' 
      });
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center">
        <div className="h-12 w-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-500 text-xs uppercase tracking-wider">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      {/* Header - Only Header, NO Sidebar */}
      <header className="border-b border-white/[0.06] bg-[#020617]/80 backdrop-blur-2xl sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center gap-4">
          <button
            onClick={() => router.push('/admin')}
            className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-white hover:border-blue-500/40 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-blue-400 mb-1">
              Configuration
            </p>
            <h1 className="text-2xl font-black italic uppercase tracking-tighter text-white flex items-center gap-3">
              <Settings className="w-6 h-6 text-blue-400" />
              Email Settings
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content - NO Sidebar */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6 shadow-2xl">
          <div className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                <Mail size={16} className="text-blue-400" />
                Your Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
              />
            </div>

            {/* SMTP Password */}
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                <Key size={16} className="text-purple-400" />
                App Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                  placeholder="xxxx xxxx xxxx xxxx"
                  className="w-full px-4 py-3 pr-12 rounded-xl bg-slate-900/60 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* SMTP Server & Port */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2 flex items-center gap-2">
                  <Server size={16} className="text-green-400" />
                  SMTP Server
                </label>
                <input
                  type="text"
                  value={smtpServer}
                  onChange={(e) => setSmtpServer(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">
                  SMTP Port
                </label>
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-700 text-white"
                />
              </div>
            </div>

            {/* Test Email */}
            <div className="border-t border-white/[0.08] pt-6">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <HelpCircle size={16} className="text-blue-400" />
                Test Configuration
              </h3>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900/60 border border-slate-700 text-white"
                />
                <button
                  onClick={handleTestEmail}
                  disabled={testing}
                  className="px-4 py-2.5 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 hover:bg-purple-600/30 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {testing ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                  Test
                </button>
              </div>
              {testResult && (
                <div className={`mt-3 p-3 rounded-xl flex items-start gap-2 text-xs ${
                  testResult.type === 'success' 
                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                }`}>
                  {testResult.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  <p>{testResult.text}</p>
                </div>
              )}
            </div>

            {/* Message */}
            {message && (
              <div className={`p-4 rounded-xl flex items-start gap-3 ${
                message.type === 'success' 
                  ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}>
                {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                <p className="text-sm">{message.text}</p>
              </div>
            )}

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>

            {/* Help Section */}
            <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
              <h3 className="text-sm font-semibold text-blue-400 mb-2 flex items-center gap-2">
                <Shield size={14} />
                How to get Gmail App Password
              </h3>
              <ol className="text-xs text-slate-500 space-y-1 ml-4 list-decimal">
                <li>Go to <a href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Google Account Security</a></li>
                <li>Enable <strong>2-Step Verification</strong></li>
                <li>Search for <strong>"App Passwords"</strong></li>
                <li>Select <strong>"Mail"</strong> and <strong>"Other"</strong></li>
                <li>Copy the 16-character password</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}