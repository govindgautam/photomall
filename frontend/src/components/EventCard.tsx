'use client';
import React from 'react';
import { 
  Image as ImageIcon, 
  Calendar, 
  UploadCloud, 
  ArrowRight, 
  Activity,
  Layers,
  LayoutGrid,
  Share2
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface EventCardProps {
  id: string;
  name: string;
  date: string;
  count: number;
  onUploadClick?: (id: string) => void;
  onOpenGallery?: (id: string) => void;
}

export default function EventCard({ id, name, date, count, onUploadClick, onOpenGallery }: EventCardProps) {
  const router = useRouter();
  const displayCount = Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/admin/share/${id}`);
  };

  return (
    <div 
      className="group bg-[#0a0f1c] border border-slate-800/60 rounded-[2.5rem] p-7 hover:border-blue-500/40 transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.4)] relative overflow-hidden"
    >
      
      {/* Dynamic Background Glows */}
      <div className="absolute -right-8 -top-8 w-32 h-32 bg-blue-600/5 rounded-full blur-3xl group-hover:bg-blue-600/15 transition-all duration-700" />
      <div className="absolute -left-8 -bottom-8 w-32 h-32 bg-indigo-600/5 rounded-full blur-3xl group-hover:bg-indigo-600/10 transition-all duration-700" />

      <div className="relative z-10">
        {/* Header Section */}
        <div className="flex justify-between items-start mb-8">
          <div className="bg-[#111827] p-3.5 rounded-2xl border border-slate-800 group-hover:border-blue-500/30 group-hover:scale-110 transition-all duration-300 shadow-inner">
            <ImageIcon className="text-blue-500 group-hover:text-blue-400" size={24} />
          </div>
          <div className="flex items-center gap-2">
            {/* ✅ SHARE BUTTON - Navigates to Share Page */}
            <button
              onClick={handleShare}
              className="bg-gradient-to-r from-purple-600 to-pink-500 p-2.5 rounded-xl hover:shadow-lg transition-all duration-300"
              title="Share this event with guests"
            >
              <Share2 size={16} className="text-white" />
            </button>
            <span className="text-[9px] font-black bg-slate-900/80 px-3 py-1.5 rounded-lg text-slate-400 tracking-[0.2em] uppercase border border-slate-700/50 group-hover:text-blue-300 transition-colors">
              REF: #{id}
            </span>
          </div>
        </div>

        {/* Title & Date */}
        <div className="space-y-1.5 mb-8">
          <h3 className="text-2xl font-extrabold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-blue-400 transition-all duration-300 line-clamp-1 tracking-tight italic uppercase">
            {name}
          </h3>
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <Calendar size={14} className="text-blue-500/70" />
            <span>{date}</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {/* IMAGE COUNT CARD */}
          <div className="bg-[#111827]/80 p-4 rounded-[1.5rem] border border-slate-800/50 group-hover:border-blue-500/20 transition-all relative overflow-hidden">
            <div className="flex items-center gap-2 mb-1">
              <Layers size={12} className="text-slate-500" />
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Images</p>
            </div>
            <p className="text-2xl font-black text-white group-hover:text-blue-400 transition-colors">
              {displayCount.toLocaleString()}
            </p>
            <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500/20 w-full" />
          </div>
          
          {/* NODE STATUS CARD */}
          <div className="bg-[#111827]/80 p-4 rounded-[1.5rem] border border-slate-800/50 group-hover:border-green-500/20 transition-all">
            <div className="flex items-center gap-2 mb-1">
              <Activity size={12} className="text-slate-500" />
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Node</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
              <p className="text-xs font-bold text-green-500 uppercase tracking-tighter italic">Active</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          {onOpenGallery ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenGallery(id);
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.22em] border border-white/10 bg-white/[0.04] text-slate-200 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-white transition-all duration-300"
            >
              <LayoutGrid size={16} className="text-indigo-400" />
              Neural gallery
            </button>
          ) : null}
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUploadClick?.(id);
            }}
            className="w-full flex items-center justify-center gap-3 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-xs transition-all duration-300 group/btn border border-blue-400/20 shadow-[0_10px_20px_rgba(37,99,235,0.2)] active:scale-[0.97] uppercase tracking-widest"
          >
            <UploadCloud size={18} className="group-hover/btn:scale-110 group-hover/btn:-translate-y-0.5 transition-all duration-300" />
            <span>Bulk Ingestion</span>
            <ArrowRight size={16} className="opacity-0 -translate-x-4 group-hover/btn:opacity-100 group-hover/btn:translate-x-0 transition-all duration-300" />
          </button>
        </div>
      </div>

      {/* Animated Bottom Border */}
      <div className="absolute bottom-0 left-0 w-0 h-1 bg-gradient-to-r from-blue-600 to-indigo-500 group-hover:w-full transition-all duration-700" />
    </div>
  );
}