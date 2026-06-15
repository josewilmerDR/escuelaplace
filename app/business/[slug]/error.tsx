"use client";

/**
 * Route-level error boundary for the public business detail page. Shares RouteError with the
 * project and school boundaries so a failed SSR read reads as a recoverable, on-brand error
 * instead of Next's English global error page.
 */
import { RouteError } from "@/components/ui/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="No pudimos cargar el comercio"
      description="Ocurrió un problema al cargar la página del comercio. Volvé a intentar en un momento."
    />
  );
}
