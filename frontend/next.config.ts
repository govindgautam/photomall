import type { NextConfig } from "next";

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
    ],
  },
  async rewrites() {
    return [
      {
        // Senior Architect Fix: /api/py/ ko Backend ke /api/ se map karein
        source: "/api/py/:path*",
        destination: `${backend}/api/py/:path*`,
      },
    ];
  },
  reactStrictMode: true,
};

export default nextConfig;