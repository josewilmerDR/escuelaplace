"use client";

/**
 * Route-level error boundary for the public project detail page. An SSR Firestore read
 * failure here should read as a recoverable error (with a "Reintentar" action) rendered in
 * the same detail shell, instead of bubbling up to the generic global error page.
 */
import { PageContainer } from "@/components/layout/PageContainer";
import { cardClass } from "@/components/ui/Card";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <PageContainer variant="detail">
      <div role="alert" className={cardClass("elevated")}>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          No pudimos cargar el proyecto
        </h1>
        <p className="mt-3 text-sm text-muted">
          Revisá tu conexión e intentá de nuevo.
        </p>
        <button type="button" onClick={reset} className="btn btn-primary mt-4">
          Reintentar
        </button>
      </div>
    </PageContainer>
  );
}
