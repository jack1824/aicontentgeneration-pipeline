import type { NextConfig } from "next";

// Test-phase default for Vercel deploys: the Cloudflare quick tunnel into the
// user's local backend (not a secret; rotates when the tunnel restarts — update
// here and push). BACKEND_URL env var always wins when set.
const TUNNEL_BACKEND = "https://consider-ensuring-midlands-vessels.trycloudflare.com";

const nextConfig: NextConfig = {
  // Gemini plans for 30/60s ads take 30-60s to write; the rewrite proxy's default
  // 30s timeout was returning bare 500s while the backend finished fine.
  experimental: {
    proxyTimeout: 180_000,
  },
  // The browser talks ONLY to this app; this app proxies to the FastAPI orchestrator.
  // No CORS, no keys client-side (docs file 02 golden rule).
  async rewrites() {
    const backend =
      process.env.BACKEND_URL ??
      (process.env.VERCEL ? TUNNEL_BACKEND : "http://127.0.0.1:8000");
    return [{ source: "/api/backend/:path*", destination: `${backend}/:path*` }];
  },
  // The landing page moved from /landing to the site root; keep old shared links alive.
  async redirects() {
    return [{ source: "/landing", destination: "/", permanent: false }];
  },
};

export default nextConfig;
