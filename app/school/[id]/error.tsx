"use client";

/**
 * Route-level error boundary for the public school detail page. Shares RouteError with the
 * project and business boundaries so a failed SSR read reads as a recoverable, on-brand
 * error instead of Next's English global error page.
 */
import { RouteError } from "@/components/ui/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="No pudimos cargar la escuela"
      description="Ocurrió un problema al cargar la página de la escuela. Volvé a intentar en un momento."
    />
  );
}
