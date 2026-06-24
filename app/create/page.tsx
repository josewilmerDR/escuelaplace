import type { Metadata } from "next";
import { BrandBand } from "@/components/layout/BrandBand";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageTypeChoice } from "@/components/onboarding/PageTypeChoice";
import { IconTile } from "@/components/ui/IconTile";
import { FlagIcon, HeartIcon, MapPinIcon } from "@/components/ui/icons";

/**
 * Public onboarding / explainer: /create — the front door for would-be page owners.
 * It first says what the platform does (visibility, recognition, no money handling) and only
 * then offers the comercio/escuela choice, instead of dropping visitors straight into the
 * auth-gated /panel/new with no context. The header CTA points here.
 *
 * Static marketing — server-rendered, and intentionally indexable (it is an acquisition
 * landing page).
 */

export const metadata: Metadata = {
  title: "Suma tu comercio o escuela",
  description:
    "Publica la página de tu comercio o escuela en escuelaplace: visibilidad en el directorio de tu comunidad, insignia y mejor ranking por apoyar a la escuela. La plataforma nunca toca el dinero — tú cobras directo.",
};

const BENEFITS = [
  {
    Icon: MapPinIcon,
    title: "Visibilidad en tu comunidad",
    body: "Apareces en el directorio de la escuela de tu comunidad o de las demás escuelas que apoyes, así como en el ranking de comercios.",
  },
  {
    Icon: FlagIcon,
    title: "Insignia y mejor ranking",
    body: "Apoyar a la escuela te da una insignia y mejor posición frente a los demás comercios de la zona.",
  },
  {
    Icon: HeartIcon,
    title: "Tu aporte 100% para la escuela",
    body: "La plataforma nunca toca el dinero: el aporte va a la escuela por los medios que ella publica.",
  },
];

export default function CreatePage() {
  return (
    <>
      {/* Hero band — same brand language as the home hero (BrandBand), copy aimed at owners.
          BrandBand without an image uses the from-brand to-brand-dark gradient; the h1 is
          large/bold enough to clear AA on it and the paragraph is solid white (not /90). */}
      <BrandBand size="hero" contentClassName="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Suma tu comercio o escuela a escuelaplace
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-white">
          Conectamos la escuela de tu comunidad con los vecinos que quieren
          comprarle a quien las apoya. Gratis y sin intermediar pagos.
        </p>
      </BrandBand>

      <PageContainer variant="narrow">
        {/* What you get — three beats before asking for anything. Each lead glyph sits in
            an app-icon tile (soft brand wash + inset ring), matching the calm-depth
            surfaces used across the panel. */}
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Por qué sumarte
        </h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-3">
          {BENEFITS.map(({ Icon, title, body }) => (
            <li key={title}>
              <IconTile size="md">
                <Icon className="h-6 w-6" />
              </IconTile>
              <h3 className="mt-4 text-base font-semibold tracking-tight text-foreground">
                {title}
              </h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ul>

        {/* The choice. Picking either kind sends you to its form; creating requires a
            Google sign-in (the panel asks for it). */}
        <section className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            ¿Qué quieres crear?
          </h2>
          <p className="mt-1 text-sm text-muted">
            Tu cuenta puede administrar varias páginas.
          </p>
          <div className="mt-6">
            <PageTypeChoice headingLevel="h3" />
          </div>
        </section>
      </PageContainer>
    </>
  );
}
