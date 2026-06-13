import { PageTypeChoice } from "@/components/onboarding/PageTypeChoice";

/**
 * Onboarding choice (/panel/new): a signed-in user picks what kind of page to create,
 * Facebook-style. The choice cards are shared with the public onboarding (/create) via
 * <PageTypeChoice>; this in-panel entry skips the pitch since the user is already in.
 */
export default function NewPageChoice() {
  return (
    <main>
      <h1 className="text-2xl font-bold">¿Qué querés crear?</h1>
      <p className="mt-2 text-muted">
        Tu cuenta puede administrar varias páginas. Elegí el tipo para empezar.
      </p>

      <div className="mt-6">
        <PageTypeChoice />
      </div>
    </main>
  );
}
