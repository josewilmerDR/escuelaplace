import type { ReactNode } from "react";
import { PageContainer } from "@/components/layout/PageContainer";

/**
 * Shared chrome for the static legal pages (/privacy, /terms): a narrow, readable
 * column with an eyebrow, a title and a "last updated" line, followed by the
 * document body. Pure presentational server component — no data layer, fully
 * static, indexable. Mirrors the long-form reading measure of /about.
 *
 * <LegalSection> is the per-section primitive; it carries the prose styling so each
 * page writes plain <p>/<ul>/<a> markup without repeating Tailwind classes.
 */
export function LegalDocument({
  eyebrow,
  title,
  updated,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  /** Human-readable last-updated date, e.g. "30 de junio de 2026". */
  updated: string;
  /** Optional lead paragraph(s) between the title and the first section. */
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <PageContainer variant="narrow">
      <div className="mx-auto max-w-3xl">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-darker">
            {eyebrow}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-muted">
            Última actualización: {updated}
          </p>
          {intro ? (
            <div className="mt-6 space-y-3 text-base leading-relaxed text-muted [&_a]:font-medium [&_a]:text-brand-darker [&_a]:underline hover:[&_a]:text-brand-darkest [&_strong]:text-foreground">
              {intro}
            </div>
          ) : null}
        </header>

        <div className="mt-10 space-y-10">{children}</div>
      </div>
    </PageContainer>
  );
}

/**
 * One titled section of a legal document. The `scroll-mt` keeps an in-page anchor
 * target clear of the sticky header. The body container styles its prose children
 * (paragraphs, lists, links, emphasis) so callers write semantic markup only.
 */
export function LegalSection({
  id,
  title,
  children,
}: {
  /** Optional anchor id for deep links (e.g. "#pagos"). */
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 space-y-3 text-sm leading-relaxed text-muted [&_a]:font-medium [&_a]:text-brand-darker [&_a]:underline hover:[&_a]:text-brand-darkest [&_li]:marker:text-brand-dark/50 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5"
    >
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
