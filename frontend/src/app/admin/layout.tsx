'use client';

import { useRouter, usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Image as ImageIcon, 
  Users, 
  Settings, 
  LogOut,
  Camera,
  BarChart3,
  Upload,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Share2
} from 'lucide-react';
import { useState } from 'react';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const navigate = (path: string) => {
    router.push(path);
  };

  const isActive = (path: string) => {
    if (path === '/admin' && pathname === '/admin') return true;
    if (path !== '/admin' && pathname?.startsWith(path)) return true;
    return false;
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    router.push('/admin/login');
  };

  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
    { icon: ImageIcon, label: 'Events', path: '/admin/events' },
    { icon: Upload, label: 'Bulk Upload', path: '/admin' },
    { icon: Camera, label: 'Find Photos', path: '/find-my-photos' },
    { icon: Users, label: 'Face Clusters', path: '/admin/events' },
    { icon: BarChart3, label: 'Analytics', path: '/admin/analytics' },
    { icon: Share2, label: 'Share Event', path: '/admin/share' },
    { icon: Settings, label: 'Settings', path: '/admin/settings' },
  ];

  return (
    <div className="min-h-screen bg-[#020617] flex">
      {/* ✅ SINGLE SIDEBAR - FIXED POSITION */}
      <aside 
        className={`
          ${collapsed ? 'w-20' : 'w-72'}
          bg-[#0a0f1c] 
          border-r border-slate-800/50 
          flex flex-col 
          fixed left-0 top-0 bottom-0 
          z-50 
          transition-all duration-300
          overflow-y-auto
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800/50 h-16 shrink-0">
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => navigate('/admin')}
          >
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg">
              <Sparkles size={22} className="text-white" />
            </div>
            {!collapsed && (
              <h1 className="text-xl font-bold text-white">
                PhotoMall <span className="text-blue-500">AI</span>
              </h1>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-700 transition-colors shrink-0"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.label}
                onClick={() => navigate(item.path)}
                className={`
                  w-full flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all
                  ${active 
                    ? 'bg-blue-600/20 text-white border-l-2 border-blue-500' 
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }
                `}
              >
                <Icon size={20} />
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-slate-800/50 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all"
          >
            <LogOut size={20} />
            {!collapsed && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main 
        className={`
          flex-1 
          min-h-screen
          transition-all duration-300 
          ${collapsed ? 'ml-20' : 'ml-72'}
        `}
      >
        {children}
      </main>
    </div>
  );
}