"use client";

/**
 * Create-business form (/panel/new/business). Captures the essentials — including the
 * optional profile (logo) and cover images that fill the public FB-style header —
 * creates a draft business owned by the signed-in user and links it to their
 * managedPages, then routes to the panel. The page starts as a hidden draft: the owner
 * completes the profile (contact channels, hours, discount) and publishes it from
 * /panel/business/[id]/edit.
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { readBuyerPreferences } from "@/lib/buyer/preferences";
import { BackLink } from "@/components/ui/BackLink";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { StickyFormActions } from "@/components/ui/StickyFormActions";
import { FormSection } from "@/components/ui/FormSection";
import { HeaderPreview } from "@/components/business/HeaderPreview";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { PhoneField } from "@/components/ui/PhoneField";
import { validateBusinessProfile } from "@/lib/business-profile";
import { normalizePhoneInternational } from "@/lib/contact";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { localityLabel } from "@/lib/location";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import {
  createBusinessPage,
  getCategories,
  getSchoolsCached,
  slugify,
} from "@/lib/firestore";
import { PAGE_DESCRIPTION_MAX, type CategoryDoc, type SchoolDoc } from "@/types";
import {
  LocationPicker,
  type AdminAreaGuess,
  type LatLng,
} from "@/components/maps/LocationPicker";

/** Lifecycle of the schools/categories fetch the form depends on. */
type LoadState = "loading" | "error" | "loaded";

export default function NewBusinessPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  // Country-agnostic administrative levels (see types/firestore.ts). country has no
  // input: it arrives from the reverse geocoder when the pin moves.
  const [admin1, setAdmin1] = useState("");
  const [admin2, setAdmin2] = useState("");
  const [admin3, setAdmin3] = useState("");
  const [country, setCountry] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  // Whether the schoolId was auto-filled from the buyer's community (localStorage) on
  // load — distinguishes "we preselected it" from "the user chose it", so the hint only
  // shows for an actual preselection. Cleared as soon as the user touches the combobox.
  const [preselectedFromBuyer, setPreselectedFromBuyer] = useState(false);
  // Profile images (both optional): they fill the avatar and cover slots of the
  // public FB-style header. Held locally and uploaded inside createBusinessPage.
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  // Any field change marks the form dirty (form-level onChange + the map handler);
  // the guard warns before close/refresh would throw the typed work away.
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty && !saving);

  const locationLabelId = useId();

  // Stable handlers so the memoized LocationPicker skips re-rendering the map tree on
  // every keystroke of the other fields.
  const onPickLocation = useCallback((next: LatLng) => {
    setCoords(next);
    setDirty(true);
  }, []);

  const onAddressSuggestion = useCallback((guess: AdminAreaGuess) => {
    // The pin is the source of truth; the location fields are an editable
    // confirmation, so a recognized area overwrites what was typed.
    if (guess.admin1) setAdmin1(guess.admin1);
    if (guess.admin2) setAdmin2(guess.admin2);
    if (guess.admin3) setAdmin3(guess.admin3);
    if (guess.country) setCountry(guess.country);
    if (guess.formattedAddress) setAddress(guess.formattedAddress);
  }, []);

  // The school select is required, so a failed fetch would leave the form permanently
  // unsubmittable — surface it and offer a retry instead of rendering empty controls.
  // setState only happens in the async callbacks, never synchronously in the effect
  // body (loadState already starts as "loading"; retry resets it from the handler).
  const load = useCallback(() => {
    Promise.all([getSchoolsCached(), getCategories()])
      .then(([s, c]) => {
        setSchools(s);
        setCategories(c);
        // The owner is usually a neighbor who browsed as a buyer first: preselect the
        // school they already chose as their community (localStorage), but only if it
        // exists in the list. It's a default, not user input — no setDirty here, so the
        // unsaved-changes guard stays quiet and the field remains freely editable.
        const preferredSchoolId = readBuyerPreferences().schoolId;
        if (preferredSchoolId && s.some((x) => x.id === preferredSchoolId)) {
          setSchoolId(preferredSchoolId);
          setPreselectedFromBuyer(true);
        }
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, []);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  // Type-to-filter options with a locality hint (school names repeat across localities).
  // No current-school prepend like the edit form — this is create, so there's never a
  // delisted school to preserve.
  const schoolOptions = useMemo<ComboboxOption[]>(
    () =>
      schools.map((s) => ({
        id: s.id,
        label: s.name,
        hint: localityLabel(s.location) || undefined,
      })),
    [schools],
  );

  const toggleCategory = (id: string) =>
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Tu sesión expiró. Volvé a ingresar.");
      return;
    }
    const trimmedName = name.trim();
    // Whitespace-only passes the native `required`, so check the trimmed value.
    if (!trimmedName) {
      setError("Ingresá el nombre del comercio.");
      return;
    }
    // Same as the name: the textarea is `required`, but whitespace-only passes it.
    if (!description.trim()) {
      setError("Escribí una descripción del comercio.");
      return;
    }
    // Same minimums the edit form enforces — category for the /category/* listings,
    // a map pin for the location.
    const invalid = validateBusinessProfile({
      categories: selectedCategories,
      hasCoords: coords != null,
    });
    if (invalid) {
      setError(invalid);
      return;
    }
    if (!coords) {
      // validateBusinessProfile already guarantees this; the guard narrows the type.
      setError("Elegí la ubicación en el mapa.");
      return;
    }
    const trimmedWhatsapp = whatsapp.trim();
    if (trimmedWhatsapp && !normalizePhoneInternational(trimmedWhatsapp)) {
      setError("Revisá el número de WhatsApp: no parece un número marcable.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const school = schools.find((s) => s.id === schoolId);
      const id = await createBusinessPage(user.id, {
        name: trimmedName,
        description: description.trim(),
        categories: selectedCategories,
        categoryNames: categories
          .filter((c) => selectedCategories.includes(c.id))
          .map((c) => c.name),
        schoolId,
        schoolName: school?.name ?? "",
        location: {
          lat: coords.lat,
          lng: coords.lng,
          admin1: admin1.trim(),
          admin2: admin2.trim(),
          admin3: admin3.trim(),
          country: country.trim() || undefined,
          address: address.trim() || undefined,
        },
        contact: trimmedWhatsapp ? { whatsapp: trimmedWhatsapp } : undefined,
        logoFile: logoFile ?? undefined,
        coverFile: coverFile ?? undefined,
      });
      router.push(`/panel?created=${id}`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo crear el comercio."));
      setSaving(false);
    }
  };

  if (loadState === "loading") {
    // Skeleton that keeps the heading in its final position so navigating here doesn't
    // flash a bare line then jump the layout when the data arrives (mirrors the edit form
    // and the panel home skeleton). The card placeholders stand in for the form sections.
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Crear comercio
        </h1>
        <p className="mt-1 text-sm text-muted">
          Empezá con lo esencial: lo publicás como borrador y completás el resto
          después.
        </p>
        <div className="mt-8 flex flex-col gap-6" aria-hidden="true">
          <div className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <div className="h-48 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
          <div className="h-24 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
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
          Crear comercio
        </h1>
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar las escuelas y categorías. Revisá tu conexión e
          intentá de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Crear comercio
      </h1>
      <p className="mt-1 text-sm text-muted">
        Empezá con lo esencial: lo publicás como borrador y completás el resto
        después.
      </p>

      <form
        onSubmit={onSubmit}
        onChange={() => setDirty(true)}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-8 flex flex-col gap-6"
      >
        <FormSection legend="Información básica" boxed>
          <div>
            <Field label="Nombre del comercio">
              <input
                required
                autoComplete="organization"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
              />
            </Field>
            {/* The slug is derived from the name and never changes after creation — show
                the resulting URL before it becomes permanent. */}
            {slugify(name) && (
              <p className="mt-1 text-xs text-muted">
                Tu página va a estar en:{" "}
                <span className="font-medium">
                  escuelaplace.com/business/{slugify(name)}
                </span>{" "}
                (si el nombre ya está usado, se agrega un número).
              </p>
            )}
          </div>

          <Field label="Descripción">
            <textarea
              required
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

          <div>
            <Field label="Escuela vinculada (opcional)">
              {/* Type-to-filter with a locality hint: school names repeat a lot across
                  localities, and a native select gives no way to tell homonyms apart —
                  picking the wrong school misdirects the link publicly. Hidden when there
                  are no schools: a search box over zero options is dead, so only the
                  helper line below (which links to create one) shows in that case. */}
              {schools.length > 0 && (
                <Combobox
                  options={schoolOptions}
                  value={schoolId}
                  // The dropdown is a portal outside the form, so its selection doesn't
                  // bubble to the form's onChange — mark dirty here. Also clears the
                  // preselection hint, since touching the field counts as user input.
                  onChange={(id) => {
                    setSchoolId(id);
                    setDirty(true);
                    setPreselectedFromBuyer(false);
                  }}
                  placeholder="Buscá tu escuela por nombre o lugar…"
                  emptyMessage="Ninguna escuela coincide — probá otro nombre o lugar."
                />
              )}
            </Field>
            {/* Outside the Field: links must not nest inside its <label>. */}
            {schools.length === 0 ? (
              <p className="mt-1 text-xs text-muted">
                Todavía no hay escuelas en la plataforma. Podés crear tu comercio
                sin escuela y vincularla después, o{" "}
                <Link href="/panel/new/school" className="font-medium underline">
                  crear la página de tu escuela
                </Link>{" "}
                primero.
              </p>
            ) : (
              <>
                {/* Non-accional copy: this field only denormalizes the association on the
                    doc — it does NOT create a subscription or count for ranking (that's
                    the /subscribe flow). */}
                <p className="mt-1 text-xs text-muted">
                  Asocia tu comercio a una escuela en tu perfil. Para apoyarla con una
                  suscripción, andá a “Apoyar una escuela” desde el panel. Podés dejarla
                  en blanco y vincularla después. ¿Tu escuela no está en la lista?{" "}
                  <Link href="/panel/new/school" className="font-medium underline">
                    Creá su página
                  </Link>
                  .
                </p>
                {/* Only after an actual preselection from the buyer's community, so the
                    user knows we filled it (and can change it). */}
                {preselectedFromBuyer && (
                  <p className="mt-1 text-xs text-muted">
                    Preseleccionamos la escuela de tu comunidad — cambiala si no
                    corresponde.
                  </p>
                )}
              </>
            )}
          </div>

          <fieldset>
            <legend className="text-sm font-medium">
              Categorías (elegí al menos una)
            </legend>
            {categories.length === 0 ? (
              // System failure (the fetch returned nothing), not "you didn't choose":
              // say so instead of rendering an empty fieldset that reads as no options.
              // The category is required, so a silent empty leaves the form unsubmittable.
              <p role="alert" className="mt-2 text-sm text-error">
                No pudimos cargar las categorías. Recargá la página.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {categories.map((c) => {
                  const selected = selectedCategories.includes(c.id);
                  return (
                    // Multi-select toggle with an sr-only checkbox — Chip is a single
                    // link/button, so this can't use it directly; it replicates Chip's
                    // exact geometry (rounded-full px-4 py-2.5, hairline border + brand
                    // hover) so it reads as the same control as the browse chips.
                    <label
                      key={c.id}
                      className={`inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 py-2.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                        selected
                          ? "border-brand-darker bg-brand-darker text-white"
                          : "border-border bg-surface text-muted hover:border-brand-dark hover:text-brand-darker"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={selected}
                        onChange={() => toggleCategory(c.id)}
                      />
                      {c.name}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>
        </FormSection>

        <FormSection legend="Presentación" boxed>
          <ImagePicker
            label="Logo o foto de perfil (opcional)"
            hint="Se muestra en círculo junto al nombre, en tu página pública y en el catálogo."
            variant="avatar"
            value={logoFile}
            onChange={(f) => {
              setLogoFile(f);
              setDirty(true);
            }}
          />

          <ImagePicker
            label="Foto de portada (opcional)"
            hint="La franja ancha arriba de tu página pública (ideal 1200×480 px). Si no subís una, se muestra el logo en su lugar."
            variant="cover"
            value={coverFile}
            onChange={(f) => {
              setCoverFile(f);
              setDirty(true);
            }}
          />

          {/* Renders nothing until at least one image is chosen. */}
          <HeaderPreview cover={coverFile} logo={logoFile} businessName={name} />
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
              onAddress={onAddressSuggestion}
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
              <input autoComplete="address-level2" value={admin2} onChange={(e) => setAdmin2(e.target.value)} className="input" />
            </Field>
            <Field label="Distrito / Comunidad (opcional)">
              <input autoComplete="address-level3" value={admin3} onChange={(e) => setAdmin3(e.target.value)} className="input" />
            </Field>
          </div>
          <Field label="Dirección (opcional)">
            <input
              autoComplete="street-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input"
            />
          </Field>
        </FormSection>

        <FormSection legend="Contacto" boxed>
          <PhoneField
            label="WhatsApp (opcional)"
            value={whatsapp}
            onChange={setWhatsapp}
          />
        </FormSection>

        <FormError message={error} />

        <StickyFormActions>
          <button
            type="submit"
            disabled={saving}
            aria-busy={saving}
            className="btn btn-primary w-full sm:w-auto"
          >
            {/* Uploads can take a few seconds on mobile data — say what's happening. */}
            {saving
              ? logoFile || coverFile
                ? "Subiendo imágenes…"
                : "Creando…"
              : "Crear comercio"}
          </button>
        </StickyFormActions>
      </form>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
