"use client";

/**
 * Route-level error boundary for the public project detail page. Delegates to the shared
 * RouteError so the treatment (logging, focus, retry + escape, digest, icon) matches the
 * school and business detail boundaries instead of being re-rolled here.
 */
import { RouteError } from "@/components/ui/RouteError";

export default function Error(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      entityLabel="el proyecto"
      backHref="/schools"
      backLabel="Ver escuelas"
    />
  );
}
