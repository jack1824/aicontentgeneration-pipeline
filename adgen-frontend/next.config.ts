import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The browser talks ONLY to this app; this app proxies to the FastAPI orchestrator.
  // No CORS, no keys client-side (docs file 02 golden rule).
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
    return [{ source: "/api/backend/:path*", destination: `${backend}/:path*` }];
  },
};

export default nextConfig;
