const handleGoogleLogin = async () => {
  setGoogleLoading(true);
  setError(null);
  
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });
    
    if (error) throw error;
  } catch (err: any) {
    console.error('Google login error:', err);
    setError(err.message || 'Google login failed. Please check Supabase configuration.');
    setGoogleLoading(false);
  }
};