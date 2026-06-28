"use client";

import { useEffect } from "react";

/**
 * Root error boundary — the last line of defense. Unlike a route-level error.tsx, this
 * catches errors thrown by the ROOT layout itself, where the normal boundaries can't reach.
 * It therefore replaces the whole document: it must render its own <html>/<body> and cannot
 * rely on the site chrome, the font, or even globals.css being mounted (the failure may be
 * the stylesheet). So it uses inline styles, not Tailwind classes. Next's built-in fallback
 * here is English-only; this one speaks Spanish and offers a retry.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the real error for diagnostics; the UI stays friendly and detail-free.
    console.error(error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          color: "#0f172a",
          backgroundColor: "#f8fafc",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1
            style={{
              fontSize: "1.875rem",
              fontWeight: 600,
              letterSpacing: "-0.025em",
              margin: 0,
            }}
          >
            Algo salió mal
          </h1>
          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.875rem",
              color: "#64748b",
            }}
          >
            Ocurrió un error inesperado. Intenta de nuevo.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "2rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0.75rem",
              border: "none",
              padding: "0.625rem 1.25rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "#ffffff",
              backgroundColor: "#0284c7",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
