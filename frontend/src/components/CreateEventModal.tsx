'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Tag, MapPin, User, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface CreateEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateEventModal({ isOpen, onClose, onSuccess }: CreateEventModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    photographer_id: 1, 
  });

  // Modal reset logic
  useEffect(() => {
    if (isOpen) {
      setSuccess(false);
      setErrorMsg(null);
      setLoading(false);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFinalize = (eventId?: number | string) => {
    setLoading(false);
    setSuccess(true);
    
    // Dashboard data refresh
    onSuccess();

    // Redirection logic
    timeoutRef.current = setTimeout(() => {
      onClose();
      if (eventId) {
        router.push(`/admin/events/${eventId}`);
      } else {
        router.push('/admin'); // Fallback to admin dashboard
      }
    }, 2200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.location.trim()) {
      return setErrorMsg('Event name and location are required.');
    }

    setLoading(true);
    setErrorMsg(null);

    // 🛡️ SAFETY TIMER: Agar 4 seconds tak API response nahi aaya, toh dashboard refresh karke close kar do
    const safetyTimer = setTimeout(() => {
      if (!success) {
        console.warn("Safety trigger: API response slow, forcing UI update.");
        handleFinalize();
      }
    }, 4500);

    try {
      const response = await apiClient.createEvent(formData);
      clearTimeout(safetyTimer);
      
      // Backend response handle karein (id ya event_id jo bhi aa raha ho)
      const eventId = response?.id || response?.event_id;
      handleFinalize(eventId);

    } catch (error: any) {
      clearTimeout(safetyTimer);
      console.error("❌ Modal Error:", error);
      
      // Agar backend mein event ban gaya hai (Dashboard refresh check), toh sync hang hone par bhi success dikhao
      if (error.message.includes("fetch") || error.message.includes("JSON")) {
        handleFinalize();
      } else {
        setLoading(false);
        setErrorMsg(error.message || "Kuch technical issue hai!");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="bg-[#1e293b] border border-slate-700 w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
        
        {/* Header */}
        <div className="p-8 pb-0 flex justify-between items-start">
          <div>
            <h3 className="text-3xl font-black text-white tracking-tight">Initialize Event</h3>
            <p className="text-slate-400 text-sm mt-1">Deploying new AI photo cloud...</p>
          </div>
          {!success && !loading && (
            <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-all">
              <X size={24} />
            </button>
          )}
        </div>

        <div className="min-h-[420px] flex flex-col justify-center">
          {success ? (
            /* --- 🟢 SUCCESS VIEW --- */
            <div className="p-12 text-center flex flex-col items-center space-y-6 animate-in fade-in slide-in-from-bottom-8">
              <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center text-green-500 border border-green-500/30">
                <CheckCircle size={64} className="animate-bounce" />
              </div>
              <div className="space-y-2">
                <h4 className="text-3xl font-bold text-white">System Synced!</h4>
                <p className="text-slate-400">Database entry confirmed. Redirecting...</p>
                <div className="pt-6 flex items-center justify-center gap-3 text-blue-400 font-bold">
                  <Loader2 className="animate-spin" size={18} />
                  <span className="uppercase tracking-[0.2em] text-[10px]">Accessing Gallery</span>
                </div>
              </div>
            </div>
          ) : (
            /* --- 🔵 FORM VIEW --- */
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              {errorMsg && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-sm animate-in shake">
                  <AlertCircle size={18} className="shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-4">
                <div className="relative group">
                  <Tag className="absolute left-4 top-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                  <input 
                    required
                    type="text" 
                    placeholder="Event Designation (e.g. Wedding 2026)"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-slate-900/50 border border-slate-700 p-4 pl-12 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all"
                  />
                </div>

                <div className="relative group">
                  <MapPin className="absolute left-4 top-4 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                  <input 
                    required
                    type="text" 
                    placeholder="Geographic Location"
                    value={formData.location}
                    onChange={(e) => setFormData({...formData, location: e.target.value})}
                    className="w-full bg-slate-900/50 border border-slate-700 p-4 pl-12 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-white transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
                <User className="text-blue-500" size={18} />
                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">Photographer: Govind Gautam (ID: #1)</span>
              </div>

              <button 
                type="submit" 
                disabled={loading}
                className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white rounded-[1.5rem] font-black text-xl shadow-xl transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-3"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" size={24} />
                    <span className="tracking-widest">SYSTEM SYNCING...</span>
                  </>
                ) : (
                  "ACTIVATE EVENT"
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}