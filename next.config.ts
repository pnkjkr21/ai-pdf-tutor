import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* PDF parsing and Node fs stay server-side only. */
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
