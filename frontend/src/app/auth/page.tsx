'use client';
import { SignIn } from '@clerk/nextjs';

export default function AuthPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100">
      <SignIn 
        routing="hash"
        fallbackRedirectUrl="/admin"
        appearance={{
          elements: {
            rootBox: "mx-auto w-full max-w-md",
            card: "shadow-2xl rounded-2xl"
          }
        }}
      />
    </div>
  );
}
