import type { Metadata } from "next";
import { PageTypeChoice } from "@/components/onboarding/PageTypeChoice";
import { HeartIcon, MapPinIcon, VerifiedIcon } from "@/components/ui/icons";

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
  title: "Sumá tu comercio o escuela",
  description:
    "Publicá la página de tu comercio o escuela en escuelaplace: visibilidad en el directorio de tu comunidad, insignia y mejor ranking por apoyar a la escuela. La plataforma nunca toca el dinero — vos cobrás directo.",
};

const BENEFITS = [
  {
    Icon: MapPinIcon,
    title: "Visibilidad en tu comunidad",
    body: "Aparecés en el directorio de la escuela de tu zona, donde los vecinos buscan a quién comprarle.",
  },
  {
    Icon: VerifiedIcon,
    title: "Insignia y mejor ranking",
    body: "Apoyar a la escuela te da una insignia y mejor posición frente a los demás comercios de la zona.",
  },
  {
    Icon: HeartIcon,
    title: "Vos cobrás directo",
    body: "La plataforma nunca toca el dinero: el aporte va a la escuela por los medios que ella publica. Acá solo te damos visibilidad.",
  },
];

export default function CreatePage() {
  return (
    <main>
      {/* Hero band — same brand language as the home hero, but copy aimed at owners. */}
      <section className="bg-brand">
        <div className="mx-auto max-w-3xl px-6 py-16 text-center sm:py-20">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Sumá tu comercio o escuela a escuelaplace
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-white/90">
            Es un directorio comunitario: te conecta con las escuelas de tu zona
            y con los vecinos que quieren comprarle a quien las apoya. Gratis y
            sin intermediar pagos.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* What you get — three beats before asking for anything. */}
        <ul className="grid gap-6 sm:grid-cols-3">
          {BENEFITS.map(({ Icon, title, body }) => (
            <li key={title} className="text-center sm:text-left">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-tint text-brand-darker">
                <Icon className="h-6 w-6" />
              </span>
              <h2 className="mt-3 font-semibold text-foreground">{title}</h2>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ul>

        {/* The choice. Picking either kind sends you to its form; creating requires a
            Google sign-in (the panel asks for it). */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-foreground">¿Qué querés crear?</h2>
          <p className="mt-1 text-sm text-muted">
            Tu cuenta puede administrar varias páginas. Vas a iniciar sesión con
            Google para empezar.
          </p>
          <div className="mt-5">
            <PageTypeChoice />
          </div>
        </section>
      </div>
    </main>
  );
}
