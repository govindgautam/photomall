"use client";
import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Key, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

// Separate component that uses useSearchParams
function OTPContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const eventId = searchParams.get('event_id') || '';
  
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  
  const BACKEND_URL = '';
  
  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    
    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };
  
  const handleVerify = async () => {
    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter the 6-digit OTP');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/py/email/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          event_id: parseInt(eventId),
          otp: otpCode
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setSuccess(data.message);
        
        // Store access in session
        sessionStorage.setItem('guest_identifier', email);
        sessionStorage.setItem('selected_event_id', eventId);
        
        // Redirect to gallery after 2 seconds
        setTimeout(() => {
          router.push(`/portal/${eventId}/gallery?access=${encodeURIComponent(email)}`);
        }, 2000);
      } else {
        setError(data.detail || 'Invalid OTP. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleResendOTP = async () => {
    setResendLoading(true);
    setError('');
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/py/email/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          event_id: parseInt(eventId)
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setSuccess('New OTP sent to your email!');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.detail || 'Failed to send OTP');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6 shadow-2xl">
          <div className="text-center mb-6">
            <Mail className="w-12 h-12 text-blue-500 mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-white">Verify Your Email</h2>
            <p className="text-zinc-400 text-sm mt-2">
              We've sent a 6-digit code to<br />
              <span className="text-blue-400 font-medium">{email}</span>
            </p>
          </div>
          
          {/* OTP Input */}
          <div className="flex justify-center gap-2 mb-6">
            {otp.map((digit, index) => (
              <input
                key={index}
                id={`otp-${index}`}
                type="text"
                inputMode="numeric"
                value={digit}
                onChange={(e) => handleOtpChange(index, e.target.value)}
                className="w-12 h-12 text-center text-2xl font-bold bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                maxLength={1}
              />
            ))}
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
              <AlertCircle className="text-red-500 shrink-0" size={18} />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          
          {success && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
              <CheckCircle className="text-green-500 shrink-0" size={18} />
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}
          
          <button
            onClick={handleVerify}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl font-semibold text-white hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Verifying...</span>
              </>
            ) : (
              <>
                <Key size={18} />
                <span>Verify & Access</span>
              </>
            )}
          </button>
          
          <div className="mt-4 text-center">
            <button
              onClick={handleResendOTP}
              disabled={resendLoading}
              className="text-sm text-zinc-500 hover:text-blue-400 transition-colors"
            >
              {resendLoading ? 'Sending...' : "Didn't receive code? Resend"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Main page component with Suspense wrapper
export default function VerifyOTPPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><Loader2 className="animate-spin text-blue-500" size={32} /></div>}>
      <OTPContent />
    </Suspense>
  );
}
