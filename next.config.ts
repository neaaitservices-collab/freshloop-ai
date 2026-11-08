import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Dynamic RSC prefetches must not be reused after a role change. 0 is the Next default;
    // keep it explicit so a protected click refetches instead of replaying an older payload.
    staleTimes: {
      dynamic: 0,
    },
  },
  /** Prisma must load generated delegates from node_modules at runtime (not a stale Turbopack bundle). */
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/client/runtime/library",
    "prisma",
  ],
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/admin",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
