import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
