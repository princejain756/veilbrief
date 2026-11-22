import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@veilbrief/core"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
