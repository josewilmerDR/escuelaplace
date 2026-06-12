import type { NextConfig } from "next";

// `next dev` runs with NODE_ENV=development; `next build` with production.
const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  images: {
    // Business logos/photos live in Firebase Storage. In dev they may come from the
    // local Storage emulator instead of the cloud bucket. Required for next/image to
    // optimize remote sources.
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      ...(isDev
        ? ([
            { protocol: "http", hostname: "127.0.0.1", port: "9199" },
            { protocol: "http", hostname: "localhost", port: "9199" },
          ] as const)
        : []),
    ],
    // The Storage emulator runs on loopback, which Next 16's optimizer blocks (SSRF
    // hardening) even when it matches remotePatterns — silently breaking every
    // emulator-hosted image. Dev-only opt-in; production builds keep the protection
    // (and only ever serve the cloud bucket).
    ...(isDev ? { dangerouslyAllowLocalIP: true } : {}),
  },
};

export default nextConfig;
