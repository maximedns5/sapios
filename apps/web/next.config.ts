import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@sapios/shared"],
  poweredByHeader: false,
  agentRules: false,
};

export default nextConfig;
