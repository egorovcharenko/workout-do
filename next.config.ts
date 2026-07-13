import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      {
        source: "/v2",
        destination: "/",
        permanent: true,
      },
      {
        source: "/v2/session",
        destination: "/session",
        permanent: true,
      },
    ];
  },
  // Proxy Firebase Auth's helper endpoints under our own domain so the
  // OAuth flow stays first-party (Safari ITP recipe — same as block_do).
  // `beforeFiles` so these match before the app shell / not-found.
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/__/auth/:path*",
          destination: "https://workout-do-egor.firebaseapp.com/__/auth/:path*",
        },
        {
          source: "/__/firebase/:path*",
          destination: "https://workout-do-egor.firebaseapp.com/__/firebase/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
