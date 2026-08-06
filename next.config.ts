import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native addon — must not be bundled by Turbopack/webpack
  serverExternalPackages: ["better-sqlite3", "@langchain/langgraph-checkpoint-sqlite"],
};

export default nextConfig;
