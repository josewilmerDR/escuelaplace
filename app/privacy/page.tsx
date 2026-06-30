import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, LegalSection } from "@/components/legal/LegalDocument";
import { absoluteUrl } from "@/lib/site";

/**
 * Privacy policy: /privacy. Static, indexable legal page (no data layer).
 *
 * Written to the platform's real data model, not a boilerplate template:
 *  - Buyers DON'T register — their community/location lives only in the browser
 *    (localStorage), never in Firestore. So for the vast majority of visitors we
 *    process no personal data at all.
 *  - Registered page owners sign in with Google; we receive name/email/photo and
 *    the content they publish. The legal basis for that is performing the service
 *    they asked for, not blanket consent.
 *  - The platform NEVER processes payments, so we hold no card/bank data of buyers.
 *
 * Contact + data-subject channel: josewdr@gmail.com. Controller is referred to
 * generically as "el equipo de escuelaplace" (no legal entity constituted yet).
 * Framed against Costa Rica's Ley 8968 with GDPR-aligned data-subject rights.
 */

const DESCRIPTION =
  "Cómo escuelaplace trata tus datos: los compradores navegan sin cuenta y sin que guardemos datos personales; los dueños de página inician sesión con Google. La plataforma nunca procesa pagos.";

const UPDATED = "30 de junio de 2026";
const CONTACT_EMAIL = "josewdr@gmail.com";

export const metadata: Metadata = {
  title: "Política de Privacidad",
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: "Política de Privacidad | escuelaplace",
    description: DESCRIPTION,
    url: absoluteUrl("/privacy"),
    type: "website",
  },
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Privacidad"
      title="Política de Privacidad"
      updated={UPDATED}
      intro={
        <>
          <p>
            En <strong>escuelaplace</strong> tratamos la menor cantidad de datos
            posible. Si solo navegas el directorio, no necesitas cuenta y{" "}
            <strong>no guardamos datos personales tuyos</strong>. Esta política
            explica qué datos recogemos, para qué, con quién los compartimos y qué
            derechos tienes sobre ellos.
          </p>
          <p>
            La redactamos conforme a la{" "}
            <strong>
              Ley 8968 de Protección de la Persona frente al tratamiento de sus
              datos personales
            </strong>{" "}
            de Costa Rica y con las buenas prácticas internacionales de protección
            de datos.
          </p>
        </>
      }
    >
      <LegalSection title="1. Quién es responsable de tus datos">
        <p>
          El responsable del tratamiento es <strong>el equipo de escuelaplace</strong>,
          que opera el directorio comunitario publicado en escuelaplace.com. Para
          cualquier consulta sobre tus datos o para ejercer tus derechos, escríbenos
          a{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Qué datos tratamos y de quién">
        <p>
          <strong>Compradores (visitantes sin cuenta).</strong> Puedes navegar todo
          el catálogo sin registrarte. La escuela y la zona que eliges como tu
          comunidad se guardan <strong>solo en tu navegador</strong> (almacenamiento
          local), nunca en nuestros servidores. No creamos ninguna cuenta ni perfil
          a tu nombre y no recogemos datos personales tuyos como comprador.
        </p>
        <p>
          <strong>Métricas de uso.</strong> Llevamos contadores agregados y anónimos
          (por ejemplo, cuántas veces se vio o se contactó un comercio) para que el
          dueño entienda el alcance de su página. Son cifras, no te identifican.
        </p>
        <p>
          <strong>Usuarios registrados (dueños de página).</strong> Si decides crear
          una página de comercio o de escuela, o registrar una donación, inicias
          sesión <strong>con Google</strong>. De tu cuenta de Google recibimos tu{" "}
          <strong>nombre, correo electrónico y foto de perfil</strong>. Tú puedes
          añadir un teléfono. Además tratamos el contenido que publicas: los datos de
          tu página, fotos, los métodos de pago que publica la escuela, tus reseñas y
          el registro de los apoyos o donaciones que realizas o confirmas.
        </p>
      </LegalSection>

      <LegalSection title="3. Para qué usamos tus datos">
        <p>Tratamos los datos de los usuarios registrados para:</p>
        <ul>
          <li>Crear y administrar tu cuenta y tus páginas.</li>
          <li>
            Mostrar el contenido público del directorio (las páginas de comercios y
            escuelas son públicas: ese es el propósito del catálogo).
          </li>
          <li>
            Mantener las señales que calcula la plataforma: ranking de comercios,
            insignias, reconocimiento del donante y contadores de las escuelas.
          </li>
          <li>
            Prevenir el fraude y el abuso (por ejemplo, detectar el auto-apoyo o la
            colusión que inflarían el ranking).
          </li>
          <li>Responder tus consultas y cumplir obligaciones legales.</li>
        </ul>
        <p>
          La base que nos legitima es, principalmente, la{" "}
          <strong>ejecución del servicio que solicitaste</strong> al crear tu cuenta
          y tus páginas; junto con nuestro <strong>interés legítimo</strong> en la
          seguridad y la prevención del fraude, y tu{" "}
          <strong>consentimiento</strong> donde aplica (por ejemplo, el reconocimiento
          público del donante, que es opcional).
        </p>
      </LegalSection>

      <LegalSection title="4. Qué información es pública">
        <p>
          escuelaplace es un directorio público e indexable por buscadores. Ten
          presente que:
        </p>
        <ul>
          <li>
            El contenido de las páginas de comercio y de escuela es{" "}
            <strong>público</strong>.
          </li>
          <li>Las reseñas se muestran junto a tu nombre.</li>
          <li>
            El reconocimiento del donante es <strong>opcional</strong>: solo apareces
            en el muro de donantes si lo activas.
          </li>
          <li>
            Los <strong>métodos de pago de una escuela</strong> solo se muestran
            después de que el equipo la verifica; mientras tanto permanecen ocultos.
          </li>
          <li>
            Los <strong>comprobantes de pago</strong> que subes no son públicos: su
            acceso está restringido a la escuela destinataria y a quien lo subió.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="pagos" title="5. La plataforma nunca procesa pagos">
        <p>
          escuelaplace <strong>no procesa, cobra, retiene ni certifica pagos</strong>.
          El aporte va directo del comercio o donante a la escuela por los medios que
          la propia escuela publica. Por eso{" "}
          <strong>
            no recogemos ni almacenamos datos de tus tarjetas ni de tus cuentas
            bancarias
          </strong>{" "}
          como comprador o donante. Los datos de pago que ves en una página son los
          que la escuela decidió publicar para recibir aportes.
        </p>
      </LegalSection>

      <LegalSection title="6. Con quién compartimos datos">
        <p>
          No vendemos tus datos. Para operar el servicio nos apoyamos en proveedores
          de infraestructura que los tratan por nuestra cuenta, principalmente{" "}
          <strong>Google Firebase</strong> (autenticación, base de datos,
          almacenamiento y hosting) y <strong>Google Maps</strong> (mapas y
          ubicación). Estos proveedores pueden procesar la información en servidores
          ubicados fuera de Costa Rica; esa transferencia internacional se rige por
          los términos y las salvaguardas de Google. También podremos divulgar datos
          si la ley o una autoridad competente lo exige.
        </p>
      </LegalSection>

      <LegalSection title="7. Cuánto tiempo conservamos tus datos">
        <p>
          Conservamos los datos de tu cuenta y tus páginas mientras existan. Si
          eliminas una página o solicitas la baja de tu cuenta, retiramos la
          información asociada, salvo lo que debamos conservar por una obligación
          legal o para resolver disputas y prevenir el fraude. Las cifras agregadas y
          anónimas pueden conservarse porque ya no te identifican.
        </p>
      </LegalSection>

      <LegalSection title="8. Tus derechos">
        <p>
          Tienes derecho a <strong>acceder</strong> a tus datos, a{" "}
          <strong>rectificarlos</strong>, a <strong>solicitar su eliminación</strong>{" "}
          y a <strong>oponerte</strong> a ciertos tratamientos. Muchos de estos los
          puedes ejercer tú mismo desde tu panel: editas o eliminas tus páginas, tus
          reseñas y tus datos de perfil cuando quieras. Para cualquier otra solicitud
          escríbenos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> y te
          responderemos en un plazo razonable.
        </p>
      </LegalSection>

      <LegalSection title="9. Almacenamiento local y sesión">
        <p>
          Usamos el <strong>almacenamiento local de tu navegador</strong> para
          recordar tu comunidad elegida (sin enviarla a nuestros servidores) y la
          tecnología de Firebase para mantener tu sesión iniciada. No usamos cookies
          de publicidad de terceros. Si tu navegador lo permite, puedes borrar este
          almacenamiento en cualquier momento desde su configuración.
        </p>
      </LegalSection>

      <LegalSection title="10. Menores de edad">
        <p>
          El servicio está dirigido a personas adultas que administran páginas de
          comercios o escuelas. Aunque escuelaplace conecta a la comunidad con
          escuelas, los compradores no se registran y no recogemos datos de menores.
          Si crees que un menor nos facilitó datos personales, contáctanos para
          eliminarlos.
        </p>
      </LegalSection>

      <LegalSection title="11. Cambios a esta política">
        <p>
          Podemos actualizar esta política para reflejar cambios en el servicio o en
          la normativa. Publicaremos la versión vigente en esta página con su fecha de
          actualización; los cambios relevantes se comunicarán por los medios
          razonables a nuestro alcance.
        </p>
      </LegalSection>

      <LegalSection title="12. Contacto">
        <p>
          Para cualquier duda sobre esta política o sobre el tratamiento de tus datos,
          escríbenos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <p>
          Consulta también nuestros{" "}
          <Link href="/terms">Términos y Condiciones</Link>.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
