"use client";

/**
 * School thank-you setup (/panel/school/[id]/thanks).
 *
 * Two jobs on one screen:
 *  - "Gestos por hacer": the prompted milestones the platform detected (a supporter's first
 *    support with no welcome template, or a special anniversary) that ask the school for a
 *    PERSONAL, memorable gesture — a short video of the kids, a letter, a placard. The board
 *    writes the message (+ optional media) and records the real-world gesture.
 *  - "Plantillas automáticas": reusable thank-yous the platform auto-sends on the recurring
 *    milestones (welcome, each renewal, generic anniversaries) so the board doesn't write each
 *    one by hand. The {nombre} token is filled with the supporter's name on send.
 *
 * The example copy is INSPIRATION shown here, never a stored default — every message is the
 * school's own words. The platform never touches money; a thank-you is gratitude, nothing more.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { ThanksMediaPicker } from "@/components/school/ThanksMediaPicker";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormSection } from "@/components/ui/FormSection";
import { HeartIcon } from "@/components/ui/icons";
import { userErrorMessage } from "@/lib/errors";
import { thankYouMilestoneLabel } from "@/lib/thanks";
import {
  getSchoolById,
  getSchoolThanksConfig,
  getThankYousBySchool,
  markThankYouGesture,
  sendPromptedThankYou,
  updateSchoolThanksConfig,
  uploadThanksMedia,
} from "@/lib/firestore";
import {
  THANK_YOU_MESSAGE_MAX,
  THANK_YOU_SPECIAL_YEARS_DEFAULT,
  THANK_YOU_SPECIAL_YEARS_MAX,
  type SchoolDoc,
  type ThankYouDoc,
  type ThankYouMedia,
  type ThankYouTemplate,
} from "@/types";
import { isPageManager } from "@/lib/permissions";
import type { LoadState } from "@/lib/page-state";

const TITLE = "Agradecimientos";

/** Inspiration shown to the board (never stored): keep it simple, cheap, memorable. */
const INSPIRATION = {
  welcome:
    "Ej.: un saludo de bienvenida en video de los niños (sin nombres), o unas líneas: «Nos alegra que te unas a nuestra comunidad».",
  renewal: "Ej.: «Gracias {nombre}, por seguir con nosotros un período más».",
  anniversaryGeneric:
    "Ej.: «Gracias {nombre}. Hoy es una fecha especial para nosotros: gracias por llevarnos en tu corazón».",
  prompt:
    "Haz algo simple y memorable: un video corto dedicado, unas líneas escritas por los alumnos, una carta, una placa con su nombre. Lo que construye comunidad.",
};

/** A template as the editor holds it: text + at most one media (a new file, or a saved url). */
interface TemplateState {
  message: string;
  mediaFile: File | null;
  mediaUrl: string | null;
  mediaKind: "photo" | "video" | null;
}

function initTemplateState(t?: ThankYouTemplate): TemplateState {
  const url = t?.media?.videoUrl ?? t?.media?.photoUrl ?? null;
  const kind = t?.media?.videoUrl ? "video" : t?.media?.photoUrl ? "photo" : null;
  return { message: t?.message ?? "", mediaFile: null, mediaUrl: url, mediaKind: kind };
}

/** Parse the "1, 5" special-years input into a clean, sorted, de-duped, capped int list. */
function parseSpecialYears(raw: string): number[] {
  const years = raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 99);
  return [...new Set(years)].sort((a, b) => a - b).slice(0, THANK_YOU_SPECIAL_YEARS_MAX);
}

export default function SchoolThanksPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [thankYous, setThankYous] = useState<ThankYouDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Template editor state, prefilled from the config once it loads.
  const [welcome, setWelcome] = useState<TemplateState>(initTemplateState());
  const [renewal, setRenewal] = useState<TemplateState>(initTemplateState());
  const [anniversary, setAnniversary] = useState<TemplateState>(initTemplateState());
  const [specialYears, setSpecialYears] = useState(
    THANK_YOU_SPECIAL_YEARS_DEFAULT.join(", "),
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      getSchoolById(id),
      getSchoolThanksConfig(id).catch(() => null),
      getThankYousBySchool(id).catch(() => []),
    ])
      .then(([s, config, tys]) => {
        setSchool(s);
        setThankYous(tys);
        if (config) {
          setWelcome(initTemplateState(config.welcome));
          setRenewal(initTemplateState(config.renewal));
          setAnniversary(initTemplateState(config.anniversaryGeneric));
          setSpecialYears(
            (config.specialYears ?? THANK_YOU_SPECIAL_YEARS_DEFAULT).join(", "),
          );
        }
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  const isManager = isPageManager(school, user);

  const prompted = useMemo(
    () => thankYous.filter((t) => t.status === "prompted"),
    [thankYous],
  );
  const recentSent = useMemo(
    () => thankYous.filter((t) => t.status === "sent").slice(0, 8),
    [thankYous],
  );

  /** Upload any newly-picked file and resolve the template's media for storage. */
  async function resolveMedia(t: TemplateState): Promise<ThankYouMedia | undefined> {
    if (t.mediaFile) {
      const kind = t.mediaFile.type.startsWith("video/") ? "video" : "photo";
      const url = await uploadThanksMedia(id, kind, t.mediaFile);
      return kind === "video" ? { videoUrl: url } : { photoUrl: url };
    }
    if (t.mediaUrl && t.mediaKind) {
      return t.mediaKind === "video"
        ? { videoUrl: t.mediaUrl }
        : { photoUrl: t.mediaUrl };
    }
    return undefined;
  }

  const onSaveTemplates = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const [welcomeMedia, renewalMedia, anniversaryMedia] = await Promise.all([
        resolveMedia(welcome),
        resolveMedia(renewal),
        resolveMedia(anniversary),
      ]);
      await updateSchoolThanksConfig(id, {
        welcome: { message: welcome.message, media: welcomeMedia },
        renewal: { message: renewal.message, media: renewalMedia },
        anniversaryGeneric: {
          message: anniversary.message,
          media: anniversaryMedia,
        },
        specialYears: parseSpecialYears(specialYears),
      });
      setSaved(true);
      load(); // re-read so the editor reflects the stored (cleaned) config
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar las plantillas."));
    } finally {
      setSaving(false);
    }
  };

  if (loadState === "loading") {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{TITLE}</h1>
        <div className="mt-8 flex flex-col gap-6" aria-hidden="true">
          <div className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <div className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        </div>
        <p className="sr-only" role="status">
          Cargando…
        </p>
      </main>
    );
  }

  if (loadState === "error" || !school) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{TITLE}</h1>
        <EmptyState
          className="mt-8"
          icon={<HeartIcon className="h-7 w-7" />}
          title="No pudimos cargar esta sección"
          description="Revisa tu conexión e intenta de nuevo."
        />
        <p className="mt-4 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  if (!isManager) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{TITLE}</h1>
        <p role="alert" className="mt-4 text-sm text-error">
          No administras esta escuela.
        </p>
        <p className="mt-4 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  return (
    <main>
      <BackLink href={`/school/${id}`}>Principal</BackLink>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        {TITLE}
      </h1>
      <p className="mt-1 text-sm text-muted">{school.name}</p>

      <section className={`mt-6 flex items-start gap-4 ${cardClass("inset")}`}>
        <span className="text-brand">
          <HeartIcon className="h-6 w-6" />
        </span>
        <p className="text-sm text-muted">
          Agradecer construye comunidad. La idea es algo <strong>simple, barato y
          memorable</strong>: un video corto de los niños, unas líneas sinceras, una
          carta. Escribe <code className="rounded bg-surface px-1">{"{nombre}"}</code>{" "}
          donde quieras que aparezca el nombre de quien apoya.
        </p>
      </section>

      {/* Gestos por hacer: prompted milestones awaiting the school's personal touch. */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Gestos especiales por hacer
          {prompted.length > 0 && (
            <span className="ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-white">
              {prompted.length}
            </span>
          )}
        </h2>
        {prompted.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Cuando alguien apoye por primera vez o cumpla un aniversario especial, vas a
            poder dedicarle un agradecimiento desde acá.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {prompted.map((t) => (
              <PromptCard key={t.id} schoolId={id} thankYou={t} onDone={load} />
            ))}
          </ul>
        )}
      </section>

      {/* Plantillas automáticas. */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Plantillas automáticas
        </h2>
        <p className="mt-1 text-sm text-muted">
          Se envían solas cuando ocurre el momento. Deja una en blanco para no enviar nada
          en ese caso (los aniversarios especiales siempre te avisan para que los hagas a
          mano).
        </p>

        <div className="mt-6 flex flex-col gap-6">
          <FormSection legend="Bienvenida (primer apoyo)" boxed>
            <TemplateEditor
              value={welcome}
              onChange={setWelcome}
              placeholder="Mensaje de bienvenida para quien apoya por primera vez."
              inspiration={INSPIRATION.welcome}
            />
          </FormSection>

          <FormSection legend="Renovación (cada vez que renueva)" boxed>
            <TemplateEditor
              value={renewal}
              onChange={setRenewal}
              placeholder="Un gracias breve cada vez que alguien renueva su apoyo."
              inspiration={INSPIRATION.renewal}
            />
          </FormSection>

          <FormSection legend="Aniversario (años no especiales)" boxed>
            <TemplateEditor
              value={anniversary}
              onChange={setAnniversary}
              placeholder="Para los aniversarios que no marcaste como especiales."
              inspiration={INSPIRATION.anniversaryGeneric}
            />
            <Field label="Años especiales (te avisamos para hacerlos a mano)">
              <input
                value={specialYears}
                onChange={(e) => setSpecialYears(e.target.value)}
                inputMode="numeric"
                placeholder="1, 5"
                className="input"
              />
              <span className="text-xs text-muted">
                Separa con comas. En estos aniversarios te pedimos un gesto personal en
                lugar de enviar la plantilla.
              </span>
            </Field>
          </FormSection>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-error">
            {error}
          </p>
        )}
        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onSaveTemplates}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? "Guardando…" : "Guardar plantillas"}
          </button>
          {saved && !saving && (
            <span role="status" className="text-sm text-success">
              Guardado
            </span>
          )}
        </div>
      </section>

      {recentSent.length > 0 && (
        <section className="mt-12">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Enviados recientemente
          </h2>
          <ul className="mt-4 flex flex-col gap-2">
            {recentSent.map((t) => (
              <li
                key={t.id}
                className={`flex items-center justify-between gap-3 text-sm ${cardClass("inset")}`}
              >
                <span className="min-w-0">
                  <span className="font-medium text-foreground">{t.supporterName || "—"}</span>
                  <span className="text-muted">
                    {" · "}
                    {thankYouMilestoneLabel(t.milestone, t.years)}
                  </span>
                </span>
                {t.gestureDone && (
                  <span className="shrink-0 text-xs text-success">Gesto hecho</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-12 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}

/** Message + optional media editor for one template (reused for all three). */
function TemplateEditor({
  value,
  onChange,
  placeholder,
  inspiration,
}: {
  value: TemplateState;
  onChange: (next: TemplateState) => void;
  placeholder: string;
  inspiration: string;
}) {
  return (
    <>
      <Field label="Mensaje">
        <textarea
          maxLength={THANK_YOU_MESSAGE_MAX}
          value={value.message}
          onChange={(e) => onChange({ ...value, message: e.target.value })}
          placeholder={placeholder}
          className="input min-h-24"
        />
        <span className="text-xs text-muted">{inspiration}</span>
      </Field>
      <ThanksMediaPicker
        file={value.mediaFile}
        existingUrl={value.mediaUrl}
        existingKind={value.mediaKind}
        onPick={(file) => onChange({ ...value, mediaFile: file })}
        onRemove={() =>
          onChange({ ...value, mediaFile: null, mediaUrl: null, mediaKind: null })
        }
      />
    </>
  );
}

/**
 * One prompted milestone: the board writes a personal thank-you (+ optional media) and can
 * record the real-world gesture it did. Owns its own composer state; `onDone` reloads the list.
 */
function PromptCard({
  schoolId,
  thankYou,
  onDone,
}: {
  schoolId: string;
  thankYou: ThankYouDoc;
  onDone: () => void;
}) {
  const [message, setMessage] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!message.trim() && !mediaFile) {
      setError("Escribe un mensaje o adjunta una foto o video.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let media: ThankYouMedia | undefined;
      if (mediaFile) {
        const kind = mediaFile.type.startsWith("video/") ? "video" : "photo";
        const url = await uploadThanksMedia(schoolId, kind, mediaFile);
        media = kind === "video" ? { videoUrl: url } : { photoUrl: url };
      }
      await sendPromptedThankYou(thankYou.id, { message, media });
      onDone();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo enviar el agradecimiento."));
      setBusy(false);
    }
  };

  const toggleGesture = async () => {
    setBusy(true);
    setError(null);
    try {
      await markThankYouGesture(thankYou.id, { done: !thankYou.gestureDone });
      onDone();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo actualizar el gesto."));
      setBusy(false);
    }
  };

  return (
    <li className={`flex flex-col gap-3 ${cardClass("inset")}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-foreground">
          {thankYou.supporterName || "Quien te apoya"}
        </span>
        <span className="inline-flex items-center rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-darker">
          {thankYouMilestoneLabel(thankYou.milestone, thankYou.years)}
        </span>
        {thankYou.supporterType === "business" && (
          <span className="text-xs text-muted">comercio</span>
        )}
      </div>
      <p className="text-sm text-muted">{INSPIRATION.prompt}</p>

      <Field label="Tu mensaje">
        <textarea
          maxLength={THANK_YOU_MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Escribe unas líneas para esta persona o comercio."
          className="input min-h-20"
        />
      </Field>
      <ThanksMediaPicker
        file={mediaFile}
        onPick={setMediaFile}
        onRemove={() => setMediaFile(null)}
      />

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={busy}
          className="btn btn-primary"
        >
          {busy ? "Enviando…" : "Enviar agradecimiento"}
        </button>
        <button
          type="button"
          onClick={toggleGesture}
          disabled={busy}
          className="btn btn-outline"
        >
          {thankYou.gestureDone
            ? "Gesto físico hecho ✓"
            : "Marcar gesto físico como hecho"}
        </button>
      </div>
    </li>
  );
}
