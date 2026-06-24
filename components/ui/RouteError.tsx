"use client";

import Link from "next/link";
import { useEffect, useRef, useTransition } from "react";
import { PageContainer } from "@/components/layout/PageContainer";
import { cardClass } from "@/components/ui/Card";
import { WarningIcon } from "@/components/ui/icons";

/**
 * Shared route-level error boundary UI. A failed SSR Firestore read on a public detail page
 * should read as a recoverable error — rendered in the same detail shell, in Spanish, with
 * the brand header — instead of bubbling up to Next's English, unstyled global error page.
 *
 * Each route's own `error.tsx` is a thin client wrapper that forwards Next's `{ error, reset }`
 * props and supplies its entityLabel, so copy and behavior stay identical across the
 * project, school and business detail pages instead of being hand-copied per route.
 *
 * Behavior the bare boundary was missing:
 *  - logs the error (incl. `digest`) to the console — the only observability in production,
 *    where `error.message` is stripped and only the `digest` survives;
 *  - moves focus to the heading so keyboard / screen-reader users land on the error;
 *  - offers a stable escape link beside "Reintentar", so a persistent failure isn't a
 *    dead-end loop of retrying the same broken read;
 *  - surfaces the `digest` as a support reference when present.
 */
export function RouteError({
  error,
  reset,
  entityLabel,
  backHref = "/",
  backLabel = "Volver al catálogo",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /**
   * Spanish noun phrase for the failed entity, e.g. "la escuela" / "el comercio" /
   * "el proyecto". The headline and description are built from it so copy stays
   * identical across boundaries.
   */
  entityLabel: string;
  /** Stable escape destination — error.tsx has no access to route params. */
  backHref?: string;
  backLabel?: string;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, startTransition] = useTransition();

  // Surface the error for debugging / monitoring. In production this is the only trace,
  // since the visible copy is deliberately generic.
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Move focus to the heading on mount so the error isn't announced into a void and the
  // retry action is one Tab away, not buried at the top of the document.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <PageContainer variant="detail">
      <div className={`mx-auto max-w-md text-center ${cardClass("elevated")}`}>
        {/* Error icon tile (design-language icon-tile look, error tint) — a visual anchor so
            the state reads as "something broke" before the copy is parsed. */}
        <span
          aria-hidden
          className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-error-tint to-error-tint/30 text-error ring-1 ring-inset ring-error/10"
        >
          <WarningIcon className="h-6 w-6" />
        </span>

        {/* Only the text is the live region; the actions live outside it. */}
        <div role="alert">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-3xl font-semibold tracking-tight text-foreground focus:outline-none"
          >
            {`No pudimos cargar ${entityLabel}`}
          </h1>
          <p className="mt-3 text-sm text-muted">
            {`Ocurrió un problema al cargar ${entityLabel}. Vuelve a intentar en un momento.`}
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-muted">
              Código de referencia: {error.digest}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => startTransition(reset)}
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? "Reintentando…" : "Reintentar"}
          </button>
          <Link href={backHref} className="btn btn-secondary">
            {backLabel}
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
