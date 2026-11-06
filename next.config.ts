import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
