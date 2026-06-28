import type { Metadata } from "next";
import Link from "next/link";
import { PageTypeChoice } from "@/components/onboarding/PageTypeChoice";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = { title: "Crear página" };

/**
 * Onboarding choice (/panel/new): a signed-in user picks what kind of page to create,
 * Facebook-style. The choice cards are shared with the public onboarding (/create) via
 * <PageTypeChoice>; this in-panel entry skips the pitch since the user is already in.
 */
export default function NewPageChoice() {
  return (
    <main>
      <PageTitle
        title="¿Qué quieres crear?"
        subtitle="Tu cuenta puede administrar varias páginas. Elige el tipo para empezar."
      />

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
