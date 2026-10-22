import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  distDir: process.env.AEDES_NEXT_DIST_DIR ?? ".next",
  turbopack: { root: path.resolve(process.cwd(), "../..") },
  async rewrites() {
    const apiOrigin = process.env.AEDES_API_ORIGIN ?? "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }];
  },
};
export default config;
