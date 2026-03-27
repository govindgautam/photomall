import type { NextConfig } from "next";

// Backend URL check: Agar Render par hai toh wo use karega, varna localhost
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
      // Render ka images hostname allow karna zaroori hai
      {
        protocol: "https",
        hostname: "photomall.onrender.com",
        pathname: "/uploads/**",
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
  reactStrictMode: false, // LOOP FIX: Isko temporary false kar do taaki development double calls ruk jayein
};

export default nextConfig;