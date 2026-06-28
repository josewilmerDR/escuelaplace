import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/BackLink";

/**
 * The single page-title primitive. Owns the h1 recipe
 * (`text-3xl font-semibold tracking-tight text-foreground`) plus the muted subtitle, an
 * optional right-aligned action, an inline status node beside the title, and an optional
 * back-link row — so every panel and public page title reads the same and the style lives in
 * ONE place (a hand-copied class string drifts; a component cannot). It replaces the ~16 local
 * `Heading`/`PanelHeading`/`PageHeading` functions and the former `ToolManageHeading` — its
 * props are a superset of that one, so a ToolManageHeading call maps over 1:1.
 *
 * Skeleton parity: a page that renders a loading shell calls PageTitle with the SAME props in
 * both states, so the title never shifts ("parpadeo"). Use `reserveSubtitle` when the subtitle
 * is only known once loaded — it keeps the muted line's height reserved while it is empty.
 *
 * Layout (the min-w-0 / shrink-0 pairing the old ToolManageHeading documented): the title is
 * `min-w-0` so it wraps/truncates instead of pushing the action off-screen, and the action is
 * `shrink-0` so it never collapses onto a second row on mobile.
 */
export interface PageTitleProps {
  title: ReactNode;
  /** Muted line under the title. */
  subtitle?: ReactNode;
  /** Reserve the subtitle line even while empty (skeleton parity). */
  reserveSubtitle?: boolean;
  /** Inline node right after the title (e.g. a status badge); wraps below on narrow screens. */
  status?: ReactNode;
  /** Right-aligned control on the title row (e.g. a "Crear" button). */
  action?: ReactNode;
  /** Truncate the title to one line instead of wrapping. */
  truncate?: boolean;
  /** Render a back link above the title. Pass `backHref` for a fixed route, or `onBack` for a button. */
  backHref?: string;
  onBack?: () => void;
  backLabel?: ReactNode;
  /** Right-aligned control on the back-link row (e.g. a settings menu). */
  backAction?: ReactNode;
  /** One-off spacing on the outer <header>. */
  className?: string;
}

export function PageTitle({
  title,
  subtitle,
  reserveSubtitle,
  status,
  action,
  truncate,
  backHref,
  onBack,
  backLabel,
  backAction,
  className,
}: PageTitleProps) {
  const hasBack = backHref !== undefined || onBack !== undefined;

  const heading = (
    <h1
      className={`min-w-0 text-3xl font-semibold tracking-tight text-foreground${
        truncate ? " truncate" : ""
      }`}
    >
      {title}
    </h1>
  );

  // Three title-row shapes, unified: action → title left + action right; status (no action) →
  // badge inline beside the title; neither → the bare h1.
  const titleRow = action ? (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {heading}
        {status}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  ) : status ? (
    <div className="flex flex-wrap items-center gap-3">
      {heading}
      {status}
    </div>
  ) : (
    heading
  );

  const body = (
    <>
      {titleRow}
      {(reserveSubtitle || subtitle) && (
        // A non-breaking space (not a plain " ", which can collapse to zero height) keeps the
        // muted line reserved while empty, so a `reserveSubtitle` skeleton doesn't shift when the
        // real subtitle paints in.
        <p className="mt-1 text-sm text-muted">{subtitle || " "}</p>
      )}
    </>
  );

  return (
    <header className={className}>
      {hasBack && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm">
            <BackLink href={backHref} onClick={onBack}>
              {backLabel}
            </BackLink>
          </p>
          {backAction && <div className="shrink-0">{backAction}</div>}
        </div>
      )}
      {hasBack ? <div className="mt-3">{body}</div> : body}
    </header>
  );
}
