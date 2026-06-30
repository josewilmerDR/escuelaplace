import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalSection } from "@/components/legal/LegalDocument";
import { absoluteUrl } from "@/lib/site";

/**
 * Terms of use: /terms. Static, indexable legal page (no data layer).
 *
 * The single most important clause is §3: the platform NEVER intermediates money —
 * every aporte goes directly from the business/donor to the school, escuelaplace is
 * not a party to it, "confirmado" means the SCHOOL declared it received the support
 * (not that the platform verified a payment). This is the liability shield that the
 * whole product model depends on, so it is stated plainly and up front. The rest
 * follows the real model: self-administered schools, verification semantics, the
 * anti-fraud ranking, user content licensing, prohibited conduct, IP and law.
 *
 * Contact: josewdr@gmail.com. Operator referred to generically as "el equipo de
 * escuelaplace". Governing law: Costa Rica.
 */

const DESCRIPTION =
  "Términos y Condiciones de escuelaplace: un directorio comunitario que da visibilidad, no un marketplace. La plataforma nunca procesa pagos; el aporte va directo del comercio o donante a la escuela.";

const UPDATED = "30 de junio de 2026";
const CONTACT_EMAIL = "josewdr@gmail.com";

export const metadata: Metadata = {
  title: "Términos y Condiciones",
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Términos y Condiciones | escuelaplace",
    description: DESCRIPTION,
    url: absoluteUrl("/terms"),
    type: "website",
  },
};

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Términos"
      title="Términos y Condiciones"
      updated={UPDATED}
      intro={
        <p>
          Estos términos regulan el uso de <strong>escuelaplace</strong>. Al navegar
          el sitio, crear una cuenta o publicar una página, aceptas estos Términos y
          Condiciones y nuestra{" "}
          <Link href="/privacy">Política de Privacidad</Link>. Si no estás de acuerdo,
          no utilices el servicio.
        </p>
      }
    >
      <LegalSection title="1. Qué es escuelaplace">
        <p>
          escuelaplace es un <strong>directorio comunitario</strong> (un catálogo)
          que conecta comercios locales con las escuelas de su comunidad en Costa
          Rica. <strong>No es un marketplace</strong>: no se compra ni se paga dentro
          del sitio. Nuestra función es dar visibilidad, una insignia y un mejor lugar
          en el directorio a los comercios que apoyan a las escuelas.
        </p>
      </LegalSection>

      <LegalSection id="pagos" title="2. La plataforma no intermedia pagos">
        <p>
          Esta es la regla más importante del servicio.{" "}
          <strong>
            Todo aporte, suscripción o donación ocurre directamente entre el comercio
            o el donante y la escuela
          </strong>
          , por los medios de pago que la propia escuela publica.
        </p>
        <ul>
          <li>
            escuelaplace <strong>no cobra, no retiene, no procesa ni certifica</strong>{" "}
            ningún pago, y no cobra comisión sobre los aportes.
          </li>
          <li>
            <strong>No somos parte</strong> de la relación económica entre las partes
            y no garantizamos que un aporte se realice, se reciba o se aplique a un fin
            determinado.
          </li>
          <li>
            Cuando un apoyo aparece como <strong>“confirmado”</strong>, significa que
            la <strong>escuela declaró haberlo recibido</strong>; no significa que la
            plataforma haya verificado el pago.
          </li>
          <li>
            Cualquier disputa sobre un pago se resuelve directamente entre quien aporta
            y la escuela. escuelaplace no es responsable de esas disputas.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Cuentas">
        <p>
          Para administrar una página o registrar un aporte necesitas una cuenta, que
          se crea iniciando sesión con Google. Eres responsable de la actividad de tu
          cuenta y de mantener veraces tus datos. Una misma cuenta puede administrar
          varias páginas. Los compradores no necesitan cuenta para navegar el
          directorio.
        </p>
      </LegalSection>

      <LegalSection title="4. Páginas de comercio">
        <p>
          Al publicar un comercio te comprometes a que su información sea veraz y a que
          el contenido (textos, fotos, logos) sea tuyo o cuentes con permiso para
          usarlo. No se permite contenido ilegal, engañoso, ofensivo ni que infrinja
          derechos de terceros. Podemos suspender o retirar una página que incumpla
          estos términos.
        </p>
      </LegalSection>

      <LegalSection title="5. Páginas de escuela y verificación">
        <p>
          Las escuelas se autoadministran: cualquier miembro de la comunidad puede
          crear su página. La página nace <strong>sin verificar</strong>, y mientras
          tanto sus métodos de pago permanecen ocultos y se muestra un aviso de datos
          sin verificar.
        </p>
        <p>
          La verificación significa que el equipo revisó que los{" "}
          <strong>métodos de pago existan y pertenezcan a la escuela</strong>.{" "}
          <strong>
            No comprobamos que quien creó la página sea una autoridad de la escuela
          </strong>
          . La verificación puede retirarse a solicitud formal de las autoridades de la
          escuela o ante un uso no legítimo. Si una escuela verificada edita
          información sensible (su nombre o sus métodos de pago), vuelve a revisión
          hasta que la aprobemos de nuevo.
        </p>
      </LegalSection>

      <LegalSection title="6. Apoyo, donaciones y aportes a proyectos">
        <p>
          El apoyo de un comercio, la donación de una persona y el aporte a un proyecto
          son <strong>relaciones directas con la escuela</strong>. La escuela es la
          única que confirma haberlos recibido. La plataforma solo registra esa
          relación y la confirmación de la escuela; nunca media el dinero. No
          garantizamos ningún resultado, beneficio fiscal ni destino específico de los
          fondos: eso depende de la escuela.
        </p>
      </LegalSection>

      <LegalSection title="7. Ranking y visibilidad">
        <p>
          El orden de los comercios en el directorio lo calcula la plataforma a partir
          del apoyo confirmado por las escuelas. <strong>No vendemos posiciones</strong>:
          nadie puede pagarnos para aparecer más arriba. Solo cuenta el apoyo a escuelas
          verificadas y confirmado por ellas; <strong>el auto-apoyo no suma</strong> y
          puede penalizar la cuenta. Podemos ajustar el detalle del cálculo con el tiempo
          para mantenerlo justo.
        </p>
      </LegalSection>

      <LegalSection title="8. Tu contenido">
        <p>
          Conservas la titularidad del contenido que publicas. Al subirlo, nos otorgas
          una licencia no exclusiva y mundial para alojarlo y mostrarlo dentro del
          directorio y en sus vistas previas para compartir, con el fin de operar el
          servicio. Eres responsable de tener los derechos sobre ese contenido y de su
          legalidad.
        </p>
      </LegalSection>

      <LegalSection title="9. Conducta prohibida">
        <p>No se permite, entre otras conductas:</p>
        <ul>
          <li>Suplantar a una persona, comercio o escuela.</li>
          <li>
            Manipular o inflar el ranking, las reseñas o las métricas (auto-apoyo,
            colusión, cuentas falsas).
          </li>
          <li>Publicar información falsa, fraudulenta o engañosa.</li>
          <li>
            Extraer datos de forma automatizada y abusiva, o intentar vulnerar la
            seguridad del servicio.
          </li>
          <li>Usar la plataforma para fines ilícitos o para dañar a terceros.</li>
        </ul>
      </LegalSection>

      <LegalSection title="10. Reseñas">
        <p>
          Las reseñas deben ser honestas y basarse en una experiencia real. Se permite
          una reseña por persona por comercio y no puedes reseñar tu propio comercio.
          Podemos moderar o retirar reseñas que incumplan estos términos.
        </p>
      </LegalSection>

      <LegalSection title="11. Propiedad intelectual">
        <p>
          La marca escuelaplace, su diseño y su software pertenecen al equipo de
          escuelaplace. Estos términos no te transfieren ningún derecho sobre ellos,
          más allá del uso normal del servicio.
        </p>
      </LegalSection>

      <LegalSection title="12. Descargo y límite de responsabilidad">
        <p>
          El servicio se ofrece <strong>“tal cual”</strong>, sin garantías de
          disponibilidad ininterrumpida ni de exactitud de la información publicada por
          comercios y escuelas, que es responsabilidad de quien la publica. En la medida
          que permita la ley, escuelaplace no será responsable por daños derivados del
          uso del servicio, de las relaciones entre usuarios ni de los pagos directos
          entre las partes.
        </p>
      </LegalSection>

      <LegalSection title="13. Suspensión y terminación">
        <p>
          Podemos suspender o cerrar cuentas o páginas que incumplan estos términos o
          la ley. Tú puedes dejar de usar el servicio y eliminar tus páginas o tu
          cuenta en cualquier momento desde tu panel o escribiéndonos.
        </p>
      </LegalSection>

      <LegalSection title="14. Cambios a estos términos">
        <p>
          Podemos modificar estos términos. Publicaremos la versión vigente en esta
          página con su fecha de actualización; el uso continuado del servicio después
          de un cambio implica su aceptación.
        </p>
      </LegalSection>

      <LegalSection title="15. Ley aplicable">
        <p>
          Estos términos se rigen por las leyes de la República de Costa Rica.
        </p>
      </LegalSection>

      <LegalSection title="16. Contacto">
        <p>
          Para cualquier consulta sobre estos términos, escríbenos a{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
