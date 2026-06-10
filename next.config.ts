import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Business logos/photos live in Firebase Storage: production bucket URLs and the
    // local Storage emulator. Required for next/image to optimize remote sources.
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
      { protocol: "http", hostname: "127.0.0.1", port: "9199" },
      { protocol: "http", hostname: "localhost", port: "9199" },
    ],
  },
};

export default nextConfig;
