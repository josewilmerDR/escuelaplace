"use client";

/**
 * Account settings (/panel/settings).
 *
 * The canonical home for account-wide preferences that aren't tied to a single page or a
 * single donation. Today it hosts the personal donor's public-recognition preference, which
 * governs every school's thank-you wall (see RecognitionToggle) — so it belongs here, not
 * buried below the donate form where it read as a per-donation toggle.
 */
import { BackLink } from "@/components/ui/BackLink";
import { RecognitionToggle } from "@/components/donors/RecognitionToggle";

export default function SettingsPage() {
  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Configuración
      </h1>
      <p className="mt-1 text-sm text-muted">
        Preferencias de tu cuenta.
      </p>

      <section className="mt-8">
        <RecognitionToggle />
      </section>

      <p className="mt-10 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
