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
  async rewrites() {
    return [
      {
        // Sabhi /api/py requests ko backend par redirect karega
        source: "/api/py/:path*",
        destination: `${backend}/api/py/:path*`,
      },
    ];
  },
  reactStrictMode: false, // Loop fix ke liye ye sahi hai
};

export default nextConfig;