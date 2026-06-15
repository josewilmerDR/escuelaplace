"use client";

/**
 * Error boundary for the private route group (the panel). If any panel page
 * (edit/metrics/subscribe/projects…) throws during render, this calm fallback shows
 * instead of Next's default dev overlay. It's a UX surface only — the real error detail
 * is logged to the console (and surfaced via Next's error reporting), never shown to the
 * user. Error boundaries must be client components.
 */
import { useEffect } from "react";
import { BackLink } from "@/components/ui/BackLink";

export default function PanelError({
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
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Algo salió mal
      </h1>
      <p className="mt-6 text-sm text-muted">
        No pudimos cargar esta sección. Probá de nuevo.
      </p>
      <button type="button" onClick={reset} className="btn btn-outline mt-4">
        Reintentar
      </button>
      <div className="mt-6">
        <BackLink href="/panel">Volver al panel</BackLink>
      </div>
    </main>
  );
}
