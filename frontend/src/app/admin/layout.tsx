import React from 'react';
import { 
  LayoutDashboard, 
  Image as ImageIcon, 
  Users, 
  Search, 
  Settings, 
  LogOut 
} from 'lucide-react';

/**
 * ARCHITECT NOTE: 
 * Ye layout 'admin' folder ke har page par apply hoga. 
 * Isse Sidebar baar-baar render nahi hoga, jo performance ke liye best hai.
 */

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}