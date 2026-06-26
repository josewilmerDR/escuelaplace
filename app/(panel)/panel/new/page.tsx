import type { Metadata } from "next";
import Link from "next/link";
import { PageTypeChoice } from "@/components/onboarding/PageTypeChoice";

export const metadata: Metadata = { title: "Crear página" };

/**
 * Onboarding choice (/panel/new): a signed-in user picks what kind of page to create,
 * Facebook-style. The choice cards are shared with the public onboarding (/create) via
 * <PageTypeChoice>; this in-panel entry skips the pitch since the user is already in.
 */
export default function NewPageChoice() {
  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        ¿Qué quieres crear?
      </h1>
      <p className="mt-1 text-sm text-muted">
        Tu cuenta puede administrar varias páginas. Elige el tipo para empezar.
      </p>

      <div className="mt-8">
        <PageTypeChoice />
      </div>

      {/* Bridge for the user who only wants to donate, not run a page. Quiet and
          visually subordinate to the two choice cards above. */}
      <p className="mt-8 text-sm text-muted">
        ¿Solo quieres apoyar a una escuela?{" "}
        <Link
          href="/panel/donate"
          className="font-medium text-brand-darker underline hover:text-brand-darkest"
        >
          Dona directamente
        </Link>
        .
      </p>
    </main>
  );
}
