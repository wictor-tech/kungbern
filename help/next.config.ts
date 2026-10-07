import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite levereras som WASM och ska inte paketeras av Next.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
