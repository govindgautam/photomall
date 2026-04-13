'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      // Get the code from URL
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      
      console.log('Callback page loaded');
      console.log('Code:', code);
      
      if (code) {
        // Exchange code for session
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        
        if (error) {
          console.error('Exchange error:', error);
          router.push('/?error=auth_failed');
        } else {
          router.push('/admin');
        }
      } else {
        // Try to get existing session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          router.push('/admin');
        } else {
          router.push('/?error=no_session');
        }
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Completing sign in...</p>
      </div>
    </div>
  );
}
