/**
 * Account settings (/panel/settings).
 *
 * The canonical home for account-wide preferences that aren't tied to a single page or a
 * single donation. Today it hosts the personal donor's public-recognition preference, which
 * governs every school's thank-you wall (see RecognitionToggle) — so it belongs here, not
 * buried below the donate form where it read as a per-donation toggle.
 */
import type { Metadata } from "next";
import { RecognitionToggle } from "@/components/donors/RecognitionToggle";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = { title: "Configuración" };

export default function SettingsPage() {
  return (
    <main>
      <PageTitle title="Configuración" subtitle="Preferencias de tu cuenta." />

      <div className="mt-8">
        <RecognitionToggle />
      </div>
    </main>
  );
}
