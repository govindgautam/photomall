'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    const handleCallback = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Callback error:', error);
        router.push('/auth?error=google_login_failed');
        return;
      }
      
      if (session) {
        localStorage.setItem('access_token', session.access_token);
        document.cookie = `token=${session.access_token}; path=/`;
        localStorage.setItem('user_email', session.user.email || '');
        localStorage.setItem('user_name', session.user.user_metadata?.full_name || '');
        router.push('/admin');
      } else {
        router.push('/auth?error=no_session');
      }
    };

    handleCallback();
  }, [router, supabase]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="animate-spin text-blue-500 mx-auto" size={48} />
        <p className="mt-4 text-white">Completing Google sign in...</p>
      </div>
    </div>
  );
}