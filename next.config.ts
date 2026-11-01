import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local/test database) ships WASM files and must not be bundled.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
