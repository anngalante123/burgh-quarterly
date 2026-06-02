import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Strip the `x-powered-by: Next.js` header. Minor info-leak, no upside.
  poweredByHeader: false,
  // Cap SSG worker concurrency so the build doesn't fire 21 parallel
  // DB queries at Neon. Even on a paid Neon tier this keeps connection
  // pressure predictable while we have ~3k slugs to pre-render. Tune
  // up if builds become noticeably slow as the catalog grows.
  experimental: {
    cpus: 8,
  },
  async redirects() {
    return [
      {
        // Old slug exposed a banned engagement-rate metric in the URL.
        // Renamed to /loudest-feeds in May 2026. Permanent so inbound
        // links from social shares and email survive.
        source: "/best-on-social/highest-engagement-rate-posts",
        destination: "/best-on-social/loudest-feeds",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
