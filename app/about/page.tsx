import type { Metadata } from "next";
import Link from "next/link";
import {
  AcademicCapIcon,
  HeartIcon,
  SearchIcon,
  TagIcon,
  UsersIcon,
  VerifiedIcon,
} from "@/components/ui/icons";

/**
 * Static "how this works" page: /about
 *
 * This is a trust/clarity page, not a company story. The product breaks the
 * expectations a visitor brings from a marketplace (no checkout, no payment
 * processing, buyers don't register, businesses pay the school directly), so it
 * needs an explicit explanation of the model and — crucially — of what the
 * platform does NOT do (never touches money). It also states the ranking in
 * plain principle: it rewards real, school-confirmed support and blocks
 * self-dealing; the exact weights/thresholds stay internal (they're a moving
 * target and publishing them invites gaming) — see architecture decision #5.
 *
 * No data layer: pure server component, no Firestore reads. Fully static.
 */

export const metadata: Metadata = {
  title: "Cómo funciona",
  description:
    "escuelaplace es un directorio comunitario que conecta comercios locales con escuelas de Costa Rica. La plataforma nunca procesa pagos: solo da visibilidad. Así funciona para compradores, comercios y escuelas.",
};

/** A numbered "how it works" step. */
function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        aria-hidden
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-tint text-sm font-semibold text-brand-darker ring-1 ring-inset ring-brand-dark/10"
      >
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}

/** A role card (buyer / business / school) with its icon, lead and steps. */
function RoleCard({
  icon,
  title,
  lead,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/30 text-brand-darker ring-1 ring-inset ring-brand-dark/10"
        >
          {icon}
        </span>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
      </header>
      <p className="mt-3 text-sm leading-relaxed text-muted">{lead}</p>
      <ol className="mt-6 space-y-5">{children}</ol>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-darker">
          Cómo funciona
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Un directorio que pone a las escuelas en el centro
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted">
          escuelaplace es un <strong className="text-foreground">directorio
          comunitario</strong>: conecta a los comercios de tu barrio con las
          escuelas de tu comunidad. Los comercios apoyan a una escuela y, a
          cambio, ganan visibilidad, una insignia y un mejor lugar en el
          directorio. No es una tienda en línea ni un intermediario de pagos.
        </p>
      </header>

      {/* The single most important clarification — stated up front, not buried.
          It protects the visitor's trust and the platform alike. */}
      <aside className="mt-10 rounded-2xl border border-brand-dark/15 bg-brand-tint/40 p-6">
        <h2 className="flex items-center gap-2 font-semibold tracking-tight text-brand-darkest">
          <HeartIcon className="h-5 w-5" />
          La plataforma nunca toca el dinero
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-brand-darkest/90">
          El aporte va <strong>directo del comercio a la escuela</strong> (a su
          junta, comité o asociación), por los métodos de pago que la propia
          escuela publica: cuenta bancaria, SINPE Móvil, PayPal, etc. Nosotros no
          procesamos, no cobramos comisión ni certificamos pagos. Solo mostramos
          la información y damos visibilidad a quienes apoyan. La escuela confirma
          cada aporte; la plataforma nunca media el dinero.
        </p>
      </aside>

      <div className="mt-12 space-y-6">
        <RoleCard
          icon={<SearchIcon className="h-6 w-6" />}
          title="Para quien compra"
          lead="No necesitás cuenta ni registro. Navegás todo el catálogo como en cualquier directorio."
        >
          <Step n={1} title="Elegí tu comunidad">
            Seleccioná tu escuela y tu zona. Esa preferencia se guarda solo en tu
            navegador para ordenar lo que ves; no creamos ninguna cuenta a tu
            nombre.
          </Step>
          <Step n={2} title="Explorá comercios">
            Buscá por nombre o rubro y descubrí los negocios que apoyan a la
            escuela de tu comunidad.
          </Step>
          <Step n={3} title="Apoyá comprando">
            Elegí con quién gastar. Al preferir a los comercios que apoyan a tu
            escuela, tu compra sostiene a la institución de forma indirecta.
          </Step>
        </RoleCard>

        <RoleCard
          icon={<TagIcon className="h-6 w-6" />}
          title="Para tu comercio"
          lead="Creás la página de tu negocio, apoyás a una o varias escuelas y ganás visibilidad en el directorio de esa comunidad."
        >
          <Step n={1} title="Creá tu página">
            Registrate con Google y publicá tu comercio: descripción, fotos,
            contacto, horario y descuentos.
          </Step>
          <Step n={2} title="Apoyá a una escuela">
            Elegí la escuela que querés apoyar y hacé tu aporte directo por los
            métodos que ella publica. La escuela lo confirma.
          </Step>
          <Step n={3} title="Ganá visibilidad e insignia">
            Tu apoyo confirmado te da una insignia pública y un mejor lugar en el
            directorio de esa comunidad, donde los compradores te encuentran.
          </Step>
        </RoleCard>

        <RoleCard
          icon={<AcademicCapIcon className="h-6 w-6" />}
          title="Para tu escuela"
          lead="La escuela se autoadministra: publica sus datos, recibe el apoyo directo y confirma cada aporte."
        >
          <Step n={1} title="Creá la página de la escuela">
            Cualquier miembro de la comunidad puede crearla. Nace sin verificar:
            sus métodos de pago quedan ocultos hasta que nuestro equipo la
            apruebe.
          </Step>
          <Step n={2} title="Verificación">
            Revisamos la escuela y la marcamos como verificada. Desde ahí sus
            métodos de pago son visibles y muestra la insignia de confianza.
          </Step>
          <Step n={3} title="Recibí y confirmá el apoyo">
            Los comercios y donantes aportan directo a la escuela. La escuela
            confirma cada aporte; podés abrir proyectos para metas concretas.
          </Step>
        </RoleCard>
      </div>

      {/* The ranking, in principle. We explain the anti-fraud stance with pride
          but deliberately do NOT publish weights or thresholds. */}
      <section className="mt-12 rounded-2xl bg-surface p-6 ring-1 ring-black/5 sm:p-8">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <UsersIcon className="h-6 w-6 text-brand-darker" />
          Cómo se ordena el directorio
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          El orden de los comercios refleja su{" "}
          <strong className="text-foreground">apoyo confirmado por las
          escuelas</strong>. Pesa el apoyo sostenido en el tiempo y a la
          comunidad, no un pago puntual. Lo importante es que el ranking premia el
          apoyo real, no el que se inventa:
        </p>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
          <li className="flex gap-3">
            <VerifiedIcon className="h-5 w-5 shrink-0 text-success" />
            <span>
              Solo cuenta el apoyo a escuelas <strong>verificadas</strong> y{" "}
              <strong>confirmado por la propia escuela</strong>.
            </span>
          </li>
          <li className="flex gap-3">
            <VerifiedIcon className="h-5 w-5 shrink-0 text-success" />
            <span>
              <strong>No cuenta el auto-apoyo</strong>: apoyar tu propia escuela
              no sube tu posición.
            </span>
          </li>
          <li className="flex gap-3">
            <VerifiedIcon className="h-5 w-5 shrink-0 text-success" />
            <span>
              <strong>No vendemos posiciones.</strong> Nadie puede pagarnos a
              nosotros para aparecer más arriba.
            </span>
          </li>
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Ajustamos el detalle del cálculo con el tiempo para mantenerlo justo,
          pero el principio no cambia: la visibilidad se gana apoyando de verdad a
          la comunidad.
        </p>
      </section>

      {/* Trust note: what the verified badge means and why some data hides. */}
      <section className="mt-6 rounded-2xl bg-surface p-6 ring-1 ring-black/5 sm:p-8">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <VerifiedIcon className="h-6 w-6 text-brand-darker" />
          Verificación y confianza
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          La insignia de verificada significa que nuestro equipo revisó la
          escuela. Mientras una escuela no esté verificada, sus métodos de pago
          permanecen ocultos y mostramos un aviso de “datos sin verificar”, para
          que nadie aporte a datos que no hemos comprobado. Si una escuela
          verificada edita información sensible, vuelve a revisión hasta que la
          aprobemos de nuevo.
        </p>
      </section>

      <div className="mt-12 flex flex-col items-center gap-4 text-center">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          ¿Listo para sumar a tu comunidad?
        </h2>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/create" className="btn btn-primary">
            Crear una página
          </Link>
          <Link href="/schools" className="btn btn-outline">
            Ver escuelas
          </Link>
        </div>
      </div>

      <ShareRow />
    </main>
  );
}

/**
 * Share buttons. Pure server-rendered anchors to each network's web share
 * endpoint — no client JS, no Web Share API (which needs a user gesture in a
 * client component). We share the site root, not /about, so the link spreads
 * the platform itself. The message is the same wherever it lands.
 */
function ShareRow() {
  // metadataBase in the root layout — the canonical public origin.
  const url = "https://escuelaplace.com";
  const text =
    "Descubrí los comercios que apoyan a las escuelas de tu comunidad en escuelaplace";
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);

  const networks = [
    {
      label: "WhatsApp",
      href: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
      icon: <WhatsAppIcon className="h-5 w-5" />,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      icon: <FacebookIcon className="h-5 w-5" />,
    },
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
      icon: <XSocialIcon className="h-5 w-5" />,
    },
  ];

  return (
    <section className="mt-12 border-t border-border pt-8 text-center">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
        Compartí escuelaplace
      </h2>
      <ul className="mt-4 flex flex-wrap justify-center gap-3">
        {networks.map(({ label, href, icon }) => (
          <li key={label}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Compartir en ${label}`}
              className="btn btn-outline"
            >
              {icon}
              <span className="ml-2">{label}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

/** X (formerly Twitter) wordmark glyph. */
function XSocialIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
