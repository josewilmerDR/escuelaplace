import type { ReactNode } from "react";
import { BackLink } from "@/components/ui/BackLink";

/**
 * The full-page notice a panel page shows instead of its content when it can't proceed — the
 * school/resource wasn't found, or the signed-in user doesn't manage this page. One home for the
 * `<main>` + heading + message + back-link chrome the panel pages all repeated; each page passes
 * its own `<Heading>` (the titles differ) and the message as children. The tone is muted on
 * purpose: a missing page or a lack of access is not a system failure. The back link defaults to
 * the panel home, overridable for pages that send the user somewhere nearer.
 */
export function PanelNotice({
  heading,
  children,
  backHref = "/panel",
  backLabel = "Volver al panel",
}: {
  heading: ReactNode;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main>
      {heading}
      <p className="mt-4 text-sm text-muted">{children}</p>
      <p className="mt-6 text-sm">
        <BackLink href={backHref}>{backLabel}</BackLink>
      </p>
    </main>
  );
}
