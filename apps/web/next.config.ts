import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Types will be regenerated from Supabase CLI once DB is live
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.dev",
      },
    ],
  },
};

export default nextConfig;
