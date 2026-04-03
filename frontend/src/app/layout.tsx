import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PhotoMall AI - Smart Event Photo Finder',
  description: 'AI-powered event photo management and facial recognition',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* ✅ CRITICAL: NO SIDEBAR HERE - Only children */}
        {children}
      </body>
    </html>
  );
}