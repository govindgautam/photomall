'use client';

import { SignIn } from '@clerk/nextjs';

export default function AuthPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-slate-100 p-4">
      <SignIn 
        appearance={{
          elements: {
            rootBox: "mx-auto w-full max-w-md",
            card: "shadow-2xl rounded-2xl border border-slate-100",
            headerTitle: "text-2xl font-bold text-slate-800",
            headerSubtitle: "text-slate-500",
            socialButtonsBlockButton: "bg-white border border-slate-200 hover:bg-slate-50 rounded-xl",
            formButtonPrimary: "bg-blue-600 hover:bg-blue-700 rounded-xl",
            footerActionLink: "text-blue-600 hover:text-blue-700"
          }
        }}
        fallbackRedirectUrl="/admin"
        signUpForceRedirectUrl="/sign-up"
      />
    </div>
  );
}
