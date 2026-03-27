'use client';
import React from 'react';
import { LayoutDashboard, Image as ImageIcon, Users, HardDrive } from 'lucide-react';

/**
 * ARCHITECT NOTE: 
 * StatsGrid interface ensures data integrity.
 * Values are handled as strings/numbers for flexibility.
 */
interface StatsGridProps {
  events?: number;
  photos?: number;
  faces?: number;
  storage?: string;
}

export default function StatsGrid({ 
  events = 0, 
  photos = 0, 
  faces = 0, 
  storage = '0.1 GB' 
}: StatsGridProps) {

  // Safety: Ensure values are treated as numbers before calling toLocaleString
  const safeEvents = Number(events) || 0;
  const safePhotos = Number(photos) || 0;
  const safeFaces = Number(faces) || 0;

  const statsData = [
    { 
      label: 'Total Events', 
      value: safeEvents.toLocaleString(), 
      icon: LayoutDashboard, 
      color: 'text-blue-400', 
      bg: 'bg-blue-500/10',
      border: 'group-hover:border-blue-500/50',
      glow: 'shadow-blue-500/20'
    },
    { 
      label: 'Total Photos', 
      value: safePhotos.toLocaleString(), 
      icon: ImageIcon, 
      color: 'text-purple-400', 
      bg: 'bg-purple-500/10',
      border: 'group-hover:border-purple-500/50',
      glow: 'shadow-purple-500/20'
    },
    { 
      label: 'AI Faces Indexed', 
      value: safeFaces.toLocaleString(), 
      icon: Users, 
      color: 'text-green-400', 
      bg: 'bg-green-500/10',
      border: 'group-hover:border-green-500/50',
      glow: 'shadow-green-500/20'
    },
    { 
      label: 'Storage Used', 
      value: storage || '0.1 GB', 
      icon: HardDrive, 
      color: 'text-orange-400', 
      bg: 'bg-orange-500/10',
      border: 'group-hover:border-orange-500/50',
      glow: 'shadow-orange-500/20'
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
      {statsData.map((item, index) => (
        <div 
          key={index} 
          className={`relative overflow-hidden bg-[#0a0f1c] border border-slate-800/50 p-6 rounded-[2rem] transition-all duration-500 group hover:bg-[#111827] hover:border-slate-700 hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)] ${item.border}`}
        >
          {/* Subtle Background Icon Watermark */}
          <item.icon 
            className={`absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500`} 
            size={120} 
          />

          <div className="flex items-center justify-between relative z-10">
            <div className="space-y-2">
              <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                {item.label}
              </p>
              <h3 className="text-4xl font-black text-white tracking-tighter italic">
                {item.value}
              </h3>
            </div>
            
            <div className={`p-4 rounded-2xl ${item.bg} ${item.color} transition-all duration-500 group-hover:scale-110 group-hover:-rotate-6 shadow-xl ${item.glow}`}>
              <item.icon size={26} strokeWidth={2.5} />
            </div>
          </div>
          
          {/* Animated Bottom Progress-like Bar */}
          <div className="absolute bottom-0 left-0 h-[3px] w-0 group-hover:w-full transition-all duration-700 ease-in-out rounded-full overflow-hidden">
             <div className={`h-full w-full ${item.bg.replace('/10', '/60')}`} />
          </div>
        </div>
      ))}
    </div>
  );
}