import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Firebase Admin 14 depends on an ESM-only JOSE build. Bundling it avoids a
  // CommonJS externalization mismatch in the Vercel Node runtime.
  transpilePackages: [
    "firebase-admin",
    "@personal-suite/app-shell",
    "@personal-suite/app-registry",
    "@personal-suite/pwa",
  ],
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
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
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
