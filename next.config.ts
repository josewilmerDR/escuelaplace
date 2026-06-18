import type { NextConfig } from "next";

// `next dev` runs with NODE_ENV=development; `next build` with production.
const isDev = process.env.NODE_ENV !== "production";

// ── Security headers (P1-f / finding #9) ─────────────────────────────────────
// Strategy: ENFORCE everything that cannot break Next's inline hydration scripts or any
// Firebase/Maps resource load; roll out the full strict CSP as Content-Security-Policy-
// Report-Only FIRST so it observes (never blocks) until the allowlist is validated and an
// inline-script strategy (hash/nonce) is chosen — see docs/security/SECURITY-BASELINE.md §P1-f.
// All headers are STATIC (no per-request nonce / no headers() call in pages), so the SEO
// catalog pages stay statically generated.

// Enforced now: these four directives gate framing/base/object/form only — they touch
// neither inline scripts nor Firebase/Maps origins, so they are safe to enforce immediately.
const ENFORCED_CSP = [
  "frame-ancestors 'none'", // clickjacking (with X-Frame-Options: DENY for old clients)
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

// Report-Only strict policy (the observation/target). Breaks nothing because it is
// Report-Only. Origins are the validated Firebase web SDK + @vis.gl Google Maps + Google
// auth allowlist. In dev it also admits the local Firebase emulators + Next HMR so the
// reports are signal, not noise. script-src keeps 'unsafe-inline' as the documented bridge
// for Next's `self.__next_f` hydration scripts and the inline JSON-LD until a hash/nonce
// strategy is adopted (the flip-to-enforce plan is in the security baseline).
function reportOnlyCsp(): string {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "https://apis.google.com", // gapi loader for signInWithPopup
    "https://www.gstatic.com", // Firebase Auth helper scripts
    "https://maps.googleapis.com", // @googlemaps/js-api-loader injected script
    ...(isDev ? ["'unsafe-eval'"] : []), // Next dev tooling + some Maps WASM paths
  ].join(" ");

  const connectSrc = [
    "'self'",
    "https://firestore.googleapis.com",
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://www.googleapis.com",
    "https://firebaseinstallations.googleapis.com",
    "https://firebasestorage.googleapis.com",
    "https://*.firebaseapp.com", // auth helper iframe XHR back to its own origin
    "https://*.cloudfunctions.net", // trackInteraction + callables
    "https://*.run.app", // Gen2 functions (Cloud Run)
    "https://maps.googleapis.com",
    "https://places.googleapis.com",
    "https://*.googleapis.com", // Maps tile/shard hosts (narrow before enforcing)
    "data:",
    "blob:",
    ...(isDev
      ? [
          "http://127.0.0.1:8080", // Firestore emulator
          "http://localhost:8080",
          "http://127.0.0.1:9199", // Storage emulator
          "http://localhost:9199",
          "http://127.0.0.1:5001", // Functions emulator
          "http://localhost:5001",
          "http://127.0.0.1:9099", // Auth emulator
          "http://localhost:9099",
          "ws://127.0.0.1:*", // Next HMR
          "ws://localhost:*",
        ]
      : []),
  ].join(" ");

  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://firebasestorage.googleapis.com", // business/school assets + proofs
    "https://lh3.googleusercontent.com", // Google account avatars
    "https://*.googleusercontent.com",
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
    "https://*.gstatic.com",
    "https://*.ggpht.com", // Maps Street View / tiles
    ...(isDev ? ["http://127.0.0.1:9199", "http://localhost:9199"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Auth/Maps inject inline styles
    `img-src ${imgSrc}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${connectSrc}`,
    "frame-src 'self' https://*.firebaseapp.com https://apis.google.com https://accounts.google.com https://www.google.com", // auth iframe + popup brokers
    "worker-src 'self' blob:", // Maps web workers
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

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

  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Permissions-Policy",
        // Allow geolocation on self (the buyer/school location pickers use it); deny the rest.
        value:
          "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=(), browsing-topics=(), interest-cohort=()",
      },
      // same-origin-allow-popups (NOT same-origin) keeps Firebase signInWithPopup working —
      // same-origin would sever the opener and break the popup handshake.
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
      { key: "Content-Security-Policy", value: ENFORCED_CSP },
      { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp() },
      // HSTS only in prod — sending it over http://localhost would force-upgrade the
      // emulators to https and break local dev.
      ...(isDev
        ? []
        : [
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains; preload",
            },
          ]),
    ];

    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
