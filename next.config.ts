import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cap SSG worker concurrency so the build doesn't fire 21 parallel
  // DB queries at Neon. Even on a paid Neon tier this keeps connection
  // pressure predictable while we have ~3k slugs to pre-render. Tune
  // up if builds become noticeably slow as the catalog grows.
  experimental: {
    cpus: 8,
  },
};

export default nextConfig;
