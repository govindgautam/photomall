import type { NextConfig } from "next";

// Backend URL check: Hugging Face space ya localhost
const backend =
  process.env.BACKEND_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
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
      destination: 'http://127.0.0.1:8000/api/py/:path*',
    },
    {
      "source": "/uploads/:path*",
      "destination": "http://127.0.0.1:8000/uploads/:path*"
    }
  ]
},
  reactStrictMode: false, // Loop fix ke liye ye sahi hai
};

export default nextConfig;