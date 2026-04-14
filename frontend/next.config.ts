import type { NextConfig } from "next";

// Backend URL check: Hugging Face space ya localhost
const backend =
  process.env.BACKEND_URL?.replace(/\/$/, "") || 
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") ||
  "http://trs60cqg66wgqb6taap83nz6.98.89.25.154.sslip.io";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "http",
        hostname: "trs60cqg66wgqb6taap83nz6.98.89.25.154.sslip.io",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/uploads/**",
      },
      // Hugging Face Backend images allow karna zaroori hai
      {
        protocol: "https",
        hostname: "gautamgovind-photomall-backend.hf.space",
        pathname: "/uploads/**",
      },
      {
        protocol: "https",
        hostname: "gautamgovind-photomall-backend.hf.space",
        pathname: "/storage/**",
      },
    ],
  },
// next.config.js example
async rewrites() {
  return [
    {
      source: '/api/py/:path*',
      destination: `${backend}/api/py/:path*`,
    },
    {
      source: '/uploads/:path*',
      destination: `${backend}/uploads/:path*`,
    }
  ]
},
  reactStrictMode: false, // Loop fix ke liye ye sahi hai
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;