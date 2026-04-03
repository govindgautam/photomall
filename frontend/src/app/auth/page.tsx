'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, User, Loader2, Sparkles, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://127.0.0.1:8000';

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      // Verify if token is valid before redirecting
      fetch(`${BACKEND_URL}/api/py/auth/verify`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => {
        if (res.ok) {
          router.push('/admin');
        } else {
          // Token is invalid, clear it
          localStorage.removeItem('access_token');
          document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
          });
        }
      })
      .catch(() => {
        // Network error or invalid token, clear it
        localStorage.removeItem('access_token');
      });
    }
  }, [router]);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError(null);
    setSuccess(null);
  };

  const handleToggleMode = (mode: boolean) => {
    setIsLogin(mode);
    resetForm();
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!isLogin) {
        // Validation for Signup
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        const response = await fetch(`${BACKEND_URL}/api/py/auth/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, email, password }),
        });

        const data = await response.json();

        if (response.ok) {
          setSuccess('Account created successfully! Switching to login...');
          setTimeout(() => {
            handleToggleMode(true);
            setEmail(email); // Keep email for login
          }, 2000);
        } else {
          setError(data.detail || 'Failed to create account');
        }
      } else {
        // Login Logic
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await fetch(`${BACKEND_URL}/api/py/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData,
        });

        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('access_token', data.access_token);
          document.cookie = `token=${data.access_token}; path=/`;
          router.push('/admin');
        } else {
          let errorMsg = 'Invalid credentials';
          if (typeof data.detail === 'string') {
            errorMsg = data.detail;
          } else if (data.detail?.msg) {
            errorMsg = data.detail.msg;
          }
          setError(errorMsg);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Network error occurred');
    } finally {
      if (isLogin || error) setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-900 to-black flex flex-col items-center justify-center p-4">
      {/* Brand Header */}
      <div className="mb-8 text-center flex flex-col items-center">
        <div className="bg-blue-600/20 p-3 rounded-2xl mb-4 border border-blue-500/30 shadow-[0_0_15px_rgba(37,99,235,0.2)]">
          <Sparkles className="text-blue-400" size={32} />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">PhotoMall <span className="text-blue-500 font-black italic">AI</span></h1>
        <p className="text-zinc-500 mt-2 text-sm">Sign in to manage your intelligent event galleries</p>
      </div>

      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-xl rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden transition-all duration-500">
        
        {/* Toggle Bar */}
        <div className="flex w-full p-2 bg-zinc-950/50">
          <button
            type="button"
            className={`flex-1 py-3 text-sm font-semibold rounded-2xl transition-all duration-300 ${
              isLogin 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
            onClick={() => handleToggleMode(true)}
          >
            Login
          </button>
          <button
            type="button"
            className={`flex-1 py-3 text-sm font-semibold rounded-2xl transition-all duration-300 ${
              !isLogin 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
            onClick={() => handleToggleMode(false)}
          >
            Sign Up
          </button>
        </div>

        <div className="p-8">
          <form onSubmit={handleAuth} className="space-y-5">
            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2">
                <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            
            {/* Success Message */}
            {success && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2">
                <CheckCircle className="text-green-400 shrink-0 mt-0.5" size={18} />
                <p className="text-green-400 text-sm">{success}</p>
              </div>
            )}

            {!isLogin && (
              <div className="relative animate-in slide-in-from-top-2 duration-300">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  required={!isLogin}
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                required
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full pl-11 pr-12 py-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                required
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {!isLogin && (
              <div className="relative animate-in slide-in-from-top-2 duration-300">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm Password"
                  className="w-full pl-11 pr-12 py-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  required={!isLogin}
                />
                <button 
                  type="button" 
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (success !== null && !isLogin)}
              className="w-full mt-2 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold tracking-wide transition-all duration-300 shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-2 group"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {isLogin ? 'Authenticating...' : 'Creating Account...'}
                </>
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  <Sparkles size={18} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
      
      <p className="mt-8 text-xs text-zinc-600 hover:text-zinc-500 cursor-default transition-colors">
        &copy; {new Date().getFullYear()} PhotoMall AI. All rights reserved.
      </p>
    </div>
  );
}
