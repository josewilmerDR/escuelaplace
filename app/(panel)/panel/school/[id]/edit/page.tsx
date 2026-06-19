"use client";

/**
 * School edit form (/panel/school/[id]/edit). The create form captures only the
 * essentials; here the board completes the public page: description, thank-you
 * message, board contact, profile photo + cover, gallery, and the payment methods.
 *
 * Verification rules (see CLAUDE.md): editing `name` or the payment methods of a
 * verified school drops it to `needs_reverification` (payment data hidden + banner)
 * until admin re-approves — so `name` goes in the patch only when it actually changed,
 * and the payment methods are only rewritten when they changed.
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { GalleryManager } from "@/components/business/GalleryManager";
import { HeaderPreview } from "@/components/business/HeaderPreview";
import { SchoolPanelNav } from "@/components/school/SchoolPanelNav";
import { PaymentMethodsEditor } from "@/components/school/PaymentMethodsEditor";
import { cardClass } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { FormSection } from "@/components/ui/FormSection";
import { PagesIcon } from "@/components/ui/icons";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { SavedIndicator } from "@/components/ui/SavedIndicator";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import {
  LocationPicker,
  type AdminAreaGuess,
  type LatLng,
} from "@/components/maps/LocationPicker";
import {
  addSchoolGalleryPhoto,
  getSchoolById,
  getSchoolPrivate,
  paymentMethodsOf,
  removeSchoolGalleryPhoto,
  updateSchoolPaymentMethods,
  updateSchoolProfile,
  uploadSchoolImage,
  type SchoolProfilePatch,
} from "@/lib/firestore";
import {
  PAGE_DESCRIPTION_MAX,
  type PaymentMethod,
  type SchoolDoc,
} from "@/types";

/** Lifecycle of the school fetch the form depends on. */
type LoadState = "loading" | "error" | "loaded";

export default function SchoolEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Form state, prefilled from the doc once it loads
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thankYouMessage, setThankYouMessage] = useState("");
  // Country-agnostic administrative levels (see types/firestore.ts). country has no
  // input: it is carried from the doc and refreshed by the reverse geocoder on pin move.
  const [admin1, setAdmin1] = useState("");
  const [admin2, setAdmin2] = useState("");
  const [admin3, setAdmin3] = useState("");
  const [country, setCountry] = useState("");
  const [coords, setCoords] = useState<LatLng | null>(null);
  // Whether the user moved the pin this session (the doc prefills coords, and the
  // mount-time reverse geocode must not overwrite the stored fields unprompted).
  const [pinMoved, setPinMoved] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [boardPhone, setBoardPhone] = useState("");
  const [boardEmail, setBoardEmail] = useState("");
  // New images picked this session; null = keep the stored ones.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  // Payment methods as loaded (to detect actual changes — rewriting them re-hides
  // them on a verified school) and as typed.
  const [loadedMethods, setLoadedMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Any field change marks the form dirty (form-level onChange + the map handler);
  // a successful save clears it. The guard warns before close/refresh would throw
  // the edits away.
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty && !saving);

  const locationLabelId = useId();
  // The submit button lives at the very end of the flow, below the gallery section
  // (which sits outside the form). It's tied back to the form via `form={formId}`.
  const formId = useId();

  // Stable handlers so the memoized LocationPicker skips re-rendering the map tree on
  // every keystroke of the other fields.
  const onPickLocation = useCallback((next: LatLng) => {
    setCoords(next);
    setPinMoved(true);
    setDirty(true);
  }, []);

  const onAddressSuggestion = useCallback((guess: AdminAreaGuess) => {
    // The pin is the source of truth; the location fields are an editable
    // confirmation, so a recognized area overwrites what was typed.
    if (guess.admin1) setAdmin1(guess.admin1);
    if (guess.admin2) setAdmin2(guess.admin2);
    if (guess.admin3) setAdmin3(guess.admin3);
    if (guess.country) setCountry(guess.country);
  }, []);

  // setState only happens in the async callbacks, never synchronously in the effect
  // body. The private read is allowed for owner/editors/admin (see firestore.rules);
  // it fails closed to empty fields rather than failing the whole form.
  const load = useCallback(() => {
    Promise.all([
      getSchoolById(id),
      getSchoolPrivate(id).catch(() => null),
    ])
      .then(([s, priv]) => {
        setSchool(s);
        setLoadState("loaded");
        if (!s) return;
        setName(s.name);
        setDescription(s.description);
        setThankYouMessage(s.thankYouMessage ?? "");
        // ?? "": docs created before the agnostic-location rename lack these fields.
        setAdmin1(s.location.admin1 ?? "");
        setAdmin2(s.location.admin2 ?? "");
        setAdmin3(s.location.admin3 ?? "");
        setCountry(s.location.country ?? "");
        setCoords({
          lat: s.location.geopoint.latitude,
          lng: s.location.geopoint.longitude,
        });
        setBoardName(s.boardContact?.name ?? "");
        setBoardPhone(s.boardContact?.phone ?? "");
        setBoardEmail(s.boardContact?.email ?? "");
        // paymentMethodsOf folds a legacy single SINPE into the list, so the owner
        // edits it as a normal row (and any change persists the agnostic shape).
        const methods = paymentMethodsOf(priv);
        setLoadedMethods(methods);
        setPaymentMethods(methods);
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  // Split the stored photos into the cover (for the header preview fallback) and the
  // gallery. A legacy school with no `coverUrl` keeps its cover at photos[0]; that one
  // must NOT show up as a removable gallery thumb, so it's peeled off here.
  const { cover: storedCover, gallery: storedGallery } = useMemo(() => {
    if (!school) return { cover: undefined as string | undefined, gallery: [] as string[] };
    if (school.coverUrl) {
      return { cover: school.coverUrl, gallery: school.photos ?? [] };
    }
    if (school.photos?.length) {
      return { cover: school.photos[0], gallery: school.photos.slice(1) };
    }
    return { cover: undefined as string | undefined, gallery: [] as string[] };
  }, [school]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    const trimmedName = name.trim();
    // Whitespace-only passes the native `required`, so check the trimmed value.
    if (!trimmedName) {
      setError("Ingresá el nombre de la escuela.");
      return;
    }
    if (!coords) {
      setError("Elegí la ubicación en el mapa.");
      return;
    }
    // Whitespace-only passes the native `required` on the board name too.
    if (!boardName.trim()) {
      setError("Ingresá el nombre del comité escolar.");
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      // Images go up first so the patch carries their final URLs in the same write.
      const [photoUrl, coverUrl] = await Promise.all([
        photoFile
          ? uploadSchoolImage(school.id, "photo", photoFile)
          : Promise.resolve(null),
        coverFile
          ? uploadSchoolImage(school.id, "cover", coverFile)
          : Promise.resolve(null),
      ]);

      const patch: SchoolProfilePatch = {
        // `name` only when changed: its presence in the patch is what drops a
        // verified school to needs_reverification.
        ...(trimmedName !== school.name ? { name: trimmedName } : {}),
        description: description.trim(),
        thankYouMessage: thankYouMessage.trim(),
        location: {
          lat: coords.lat,
          lng: coords.lng,
          admin1: admin1.trim(),
          admin2: admin2.trim(),
          admin3: admin3.trim(),
          country: country.trim() || undefined,
        },
        boardContact: {
          name: boardName.trim(),
          ...(boardPhone.trim() ? { phone: boardPhone.trim() } : {}),
          ...(boardEmail.trim() ? { email: boardEmail.trim() } : {}),
        },
        ...(photoUrl ? { photoUrl } : {}),
        ...(coverUrl ? { coverUrl } : {}),
      };
      await updateSchoolProfile(school.id, patch, school.verificationStatus);

      // Payment methods: rewrite only on an actual change (rewriting re-hides them on
      // a verified school). Only complete rows persist — half-typed ones can't be paid
      // to — and removing every method is a valid change (the school can retract them).
      const completeMethods = paymentMethods
        .map((m) => ({ label: m.label.trim(), value: m.value.trim() }))
        .filter((m) => m.label && m.value);
      const methodsChanged =
        JSON.stringify(completeMethods) !== JSON.stringify(loadedMethods);
      if (methodsChanged) {
        // Separate try/catch: the profile write already succeeded, so a methods
        // failure must say so specifically (and leave the form dirty to retry) rather
        // than hide behind the generic "no se pudieron guardar" of a single catch.
        try {
          await updateSchoolPaymentMethods(
            school.id,
            completeMethods,
            school.verificationStatus,
          );
          setLoadedMethods(completeMethods);
        } catch (err) {
          setError(
            userErrorMessage(
              err,
              "Guardamos el perfil, pero no los métodos de pago. Reintentá.",
            ),
          );
          return;
        }
      }

      // Editing the `name` or the payment methods of a verified school drops it to
      // needs_reverification server-side; mirror that locally so the banner flips
      // immediately (and `verified` recomputes) without a refetch.
      const dropsToReverification =
        school.verificationStatus === "verified" &&
        (trimmedName !== school.name || methodsChanged);
      setSchool((s) =>
        s
          ? {
              ...s,
              name: trimmedName,
              ...(dropsToReverification
                ? { verificationStatus: "needs_reverification" as const }
                : {}),
              ...(photoUrl ? { photoUrl } : {}),
              ...(coverUrl ? { coverUrl } : {}),
            }
          : s,
      );
      setPhotoFile(null);
      setCoverFile(null);
      setSaved(true);
      // Clear dirty before navigating so the unsaved-changes guard doesn't fire on the
      // way out, then return to wherever the board came from (the last history entry).
      setDirty(false);
      router.back();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  if (loadState === "loading") {
    // Skeleton that keeps the heading in its final position so navigating here doesn't
    // flash a bare line then jump the layout when the doc arrives (mirrors the business
    // edit skeleton). The card placeholders stand in for the status banner + form sections.
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Editar escuela
        </h1>
        <div className="mt-8 flex flex-col gap-6" aria-hidden="true">
          <div className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <div className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <div className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        </div>
        <p className="sr-only" role="status">
          Cargando…
        </p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Editar escuela
        </h1>
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar los datos de la escuela. Revisá tu conexión e
          intentá de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!school) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Editar escuela
        </h1>
        <EmptyState
          icon={<PagesIcon className="h-7 w-7" />}
          title="No encontramos esta escuela"
          description="La página pudo haberse eliminado, o el enlace no es correcto."
        />
        <p className="mt-4 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Editar escuela
        </h1>
        <p role="alert" className="mt-4 text-sm text-error">
          No administrás esta escuela.
        </p>
        <p className="mt-4 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const verified = school.verificationStatus === "verified";

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Editar escuela
      </h1>
      <p className="mt-1 text-sm text-muted">{school.name}</p>

      <SchoolPanelNav schoolId={id} current="edit" />

      {/* Verification state: a calm-depth semantic banner (success when verified,
          warning while pending/needs_reverification) — soft tint + hairline ring.
          aria-live so the verified→needs_reverification flip after a sensitive edit
          is announced to screen readers. */}
      <section
        aria-live="polite"
        className={`mt-6 rounded-2xl p-4 text-sm ring-1 ${
          verified
            ? "bg-success-tint text-success ring-success/15"
            : "bg-warning-tint text-warning ring-warning/15"
        }`}
      >
        {verified ? (
          <p>
            Tu escuela está <strong>verificada</strong>: sus métodos de pago son
            visibles para quienes quieren apoyarla. Cambiar el{" "}
            <strong>nombre</strong> o los <strong>métodos de pago</strong> la
            devuelve a revisión y los oculta hasta que el equipo la re-apruebe.
          </p>
        ) : (
          <p>
            {school.verificationStatus === "needs_reverification"
              ? "Cambiaste datos sensibles: la escuela está en re-verificación y sus métodos de pago están ocultos hasta que el equipo la re-apruebe."
              : "Tu escuela todavía no está verificada: sus métodos de pago están ocultos y la página muestra el aviso “datos sin verificar” hasta que el equipo la apruebe."}
          </p>
        )}
      </section>

      <form
        id={formId}
        onSubmit={onSubmit}
        onChange={() => setDirty(true)}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-8 flex flex-col gap-6"
      >
        <FormSection legend="Información básica" boxed>
          <Field label="Nombre de la escuela">
            <input
              required
              autoComplete="organization"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Descripción">
            <textarea
              maxLength={PAGE_DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input min-h-24"
            />
            {/* Turn amber as the count nears the limit so the cap doesn't surprise
                mid-sentence; muted the rest of the time. */}
            <span
              className={`text-xs ${
                description.length >= PAGE_DESCRIPTION_MAX * 0.9
                  ? "text-warning"
                  : "text-muted"
              }`}
            >
              {description.length}/{PAGE_DESCRIPTION_MAX}
            </span>
          </Field>

          <Field label="Mensaje de agradecimiento (opcional)">
            <textarea
              maxLength={PAGE_DESCRIPTION_MAX}
              value={thankYouMessage}
              onChange={(e) => setThankYouMessage(e.target.value)}
              placeholder="Se muestra en el muro de agradecimiento de tu página pública."
              className="input min-h-24"
            />
            <span
              className={`text-xs ${
                thankYouMessage.length >= PAGE_DESCRIPTION_MAX * 0.9
                  ? "text-warning"
                  : "text-muted"
              }`}
            >
              {thankYouMessage.length}/{PAGE_DESCRIPTION_MAX}
            </span>
          </Field>
        </FormSection>

        <FormSection legend="Presentación" boxed>
          <ImagePicker
            label="Foto de perfil"
            hint="Se muestra como círculo sobre la portada (escudo o fachada)."
            value={photoFile}
            onChange={(file) => {
              setPhotoFile(file);
              setDirty(true);
            }}
            variant="avatar"
          />

          <ImagePicker
            label="Foto de portada"
            hint="Banda ancha arriba de la página (patio, actividades, la comunidad)."
            value={coverFile}
            onChange={(file) => {
              setCoverFile(file);
              setDirty(true);
            }}
            variant="cover"
          />

          {/* Mini header so the board can check the avatar/cover overlap without
              opening the public page. Newly picked files win over the stored URLs. */}
          <HeaderPreview
            cover={coverFile ?? storedCover}
            logo={photoFile ?? school.photoUrl}
            businessName={school.name}
          />
        </FormSection>

        <FormSection
          legend="Ubicación"
          description="Se completan solos al mover el pin en el mapa — revisalos, corregilos o dejalos en blanco si no aplican."
          boxed
        >
          <div
            role="group"
            aria-labelledby={locationLabelId}
            className="flex flex-col gap-1 text-sm"
          >
            <span id={locationLabelId} className="font-medium">
              Ubicación en el mapa
            </span>
            <LocationPicker
              value={coords}
              onChange={onPickLocation}
              // Suggestions only after an actual pin move; on mount the stored
              // fields stand (the doc prefills coords, and the mount-time reverse
              // geocode must not overwrite them unprompted).
              onAddress={pinMoved ? onAddressSuggestion : undefined}
            />
          </div>

          {/* Country-agnostic levels: free text (no closed list — this must work for any
              country), autofilled by the pin's reverse geocode. All optional: the pin
              is the source of truth, and not every country fills every level. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Provincia / Estado (opcional)">
              <input
                autoComplete="address-level1"
                value={admin1}
                onChange={(e) => setAdmin1(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Cantón / Municipio (opcional)">
              <input
                autoComplete="address-level2"
                value={admin2}
                onChange={(e) => setAdmin2(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Distrito / Comunidad (opcional)">
              <input
                autoComplete="address-level3"
                value={admin3}
                onChange={(e) => setAdmin3(e.target.value)}
                className="input"
              />
            </Field>
          </div>
        </FormSection>

        {/* "Comité escolar": neutral term for whoever administers the school's funds
            (junta de educación, asociación de padres, consejo escolar…). */}
        <FormSection
          legend="Contacto del comité escolar"
          description="La junta, asociación o consejo que administra los fondos de la escuela."
          boxed
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <input
                required
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Teléfono (opcional)">
              <input
                value={boardPhone}
                onChange={(e) => setBoardPhone(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Email (opcional)">
              <input
                type="email"
                value={boardEmail}
                onChange={(e) => setBoardEmail(e.target.value)}
                className="input"
              />
            </Field>
          </div>
        </FormSection>

        {/* The parenthetical depends on verification: a verified school's methods are
            already visible (editing them re-triggers review), so "se ocultan hasta
            verificar" would be factually wrong for it. */}
        <FormSection
          boxed
          legend={`Métodos de pago ${
            verified
              ? "(visibles; editarlos pide re-verificación)"
              : "(se ocultan hasta verificar)"
          }`}
          description="Cómo puede aportar quien quiera ayudar: cuenta bancaria, método local (SINPE Móvil, Modo, Bizum…), PayPal, etc. Es solo informativo — escuelaplace nunca procesa ni certifica pagos. Cambiarlos en una escuela verificada la devuelve a revisión."
        >
          <PaymentMethodsEditor
            value={paymentMethods}
            onChange={(rows) => {
              setPaymentMethods(rows);
              setDirty(true);
            }}
          />
        </FormSection>
      </form>

      {/* Outside the form: gallery changes publish immediately (upload/remove mutate
          the doc on the spot), they don't wait for "Guardar cambios". */}
      <section className={`mt-10 ${cardClass("elevated")}`}>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Galería
        </h2>
        <div className="mt-3">
          <GalleryManager
            // storedGallery already excludes a legacy cover at photos[0], which must
            // not show up as a removable gallery item.
            initialPhotos={storedGallery}
            addPhoto={(file) => addSchoolGalleryPhoto(school.id, file)}
            removePhoto={(url) => removeSchoolGalleryPhoto(school.id, url)}
          />
        </div>
      </section>

      {/* Save sits at the very end of the flow: the board fills the form, manages the
          gallery, and then commits the form edits. `form={formId}` ties this submit
          button back to the form above even though it lives outside it. */}
      <div className="mt-10 flex flex-col gap-6">
        <FormError message={error} />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            form={formId}
            disabled={saving}
            aria-busy={saving}
            className="btn btn-primary"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <SavedIndicator show={saved} onHide={() => setSaved(false)} />
        </div>
      </div>
    </main>
  );
}
