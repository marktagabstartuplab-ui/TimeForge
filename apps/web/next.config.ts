import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // apps/web has its own package-lock.json (not an npm workspace), but sibling
  // lockfiles at the monorepo root and further up the filesystem make Next
  // guess the wrong workspace root, which intermittently triggers Turbopack
  // errors. Pin it explicitly to this directory.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
