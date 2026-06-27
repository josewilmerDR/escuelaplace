"use client";

/**
 * Business edit form (/panel/business/[id]/edit). The create form captures only the
 * essentials; here the owner completes the public profile (logo, cover, contact channels,
 * hours, discount, gallery) and controls publication. Businesses are created as a hidden
 * `draft` —
 * public reads filter by status == 'active' — so publishing from this page is what
 * actually puts the profile on the catalog.
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { BackLink } from "@/components/ui/BackLink";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { BusinessPanelNav } from "@/components/business/BusinessPanelNav";
import { GalleryManager } from "@/components/business/GalleryManager";
import { HeaderPreview } from "@/components/business/HeaderPreview";
import { cardClass } from "@/components/ui/Card";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { FormSection } from "@/components/ui/FormSection";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { PagesIcon } from "@/components/ui/icons";
import { PhoneField } from "@/components/ui/PhoneField";
import { SavedIndicator } from "@/components/ui/SavedIndicator";
import { TagsInput } from "@/components/ui/TagsInput";
import { normalizeTags, validateBusinessProfile } from "@/lib/business-profile";
import { normalizePhoneInternational } from "@/lib/contact";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { localityLabel } from "@/lib/location";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import {
  LocationPicker,
  type AdminAreaGuess,
  type LatLng,
} from "@/components/maps/LocationPicker";
import {
  addBusinessGalleryPhoto,
  getBusinessById,
  getBusinessPrivate,
  getCategories,
  getSchoolsCached,
  removeBusinessGalleryPhoto,
  setBusinessStatus,
  splitBusinessPhotos,
  updateBusinessProfile,
  uploadBusinessImage,
  type BusinessPublishStatus,
} from "@/lib/firestore";
import {
  BUSINESS_TAG_MAX,
  BUSINESS_TAGS_MAX,
  PAGE_DESCRIPTION_MAX,
  type BusinessContact,
  type BusinessDoc,
  type CategoryDoc,
  type SchoolDoc,
} from "@/types";
import { isPageManager } from "@/lib/permissions";

/** Lifecycle of the business/schools/categories fetch the form depends on. */
type LoadState = "loading" | "error" | "loaded";

export default function BusinessEditPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [business, setBusiness] = useState<BusinessDoc | null>(null);
  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  // Form state, prefilled from the doc once it loads
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  // Owner-curated search keywords (chips). Normalized on save with normalizeTags.
  const [tags, setTags] = useState<string[]>([]);
  // Country-agnostic administrative levels (see types/firestore.ts). country has no
  // input: it is carried from the doc and refreshed by the reverse geocoder on pin move.
  const [admin1, setAdmin1] = useState("");
  const [admin2, setAdmin2] = useState("");
  const [admin3, setAdmin3] = useState("");
  const [country, setCountry] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<LatLng | null>(null);
  // Whether the user moved the pin this session (the doc prefills coords, and the
  // mount-time reverse geocode must not overwrite the stored fields unprompted).
  const [pinMoved, setPinMoved] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [web, setWeb] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [hours, setHours] = useState("");
  const [discountActive, setDiscountActive] = useState(false);
  const [discountText, setDiscountText] = useState("");
  // New images picked this session; null = keep the stored logoUrl/coverUrl.
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Publish/unpublish errors render next to the publish button (top of the page),
  // separate from the form `error` banner that sits above the save button (bottom).
  const [statusError, setStatusError] = useState<string | null>(null);

  // Any field change marks the form dirty (form-level onChange + the map handler);
  // a successful save clears it. The guard warns before close/refresh would throw
  // the edits away.
  const [dirty, setDirty] = useState(false);
  useUnsavedChangesGuard(dirty && !saving);

  const locationLabelId = useId();

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
    if (guess.formattedAddress) setAddress(guess.formattedAddress);
  }, []);

  // Distinguish "fetch failed" from "business does not exist": without the catch, a
  // schools/categories failure would render the misleading "Comercio no encontrado".
  // setState only happens in the async callbacks, never synchronously in the effect
  // body (loadState already starts as "loading"; retry resets it from the handler).
  const load = useCallback(() => {
    Promise.all([
      getBusinessById(id),
      getSchoolsCached(),
      getCategories(),
      // Owner email lives in the private subcollection now (#13). Best-effort read: a
      // non-manager gets null (and the "not your business" notice below), not a load error.
      getBusinessPrivate(id),
    ])
      .then(([b, s, c, priv]) => {
        setBusiness(b);
        setSchools(s);
        setCategories(c);
        setLoadState("loaded");
        if (!b) return;
        setName(b.name);
        setDescription(b.description);
        setSchoolId(b.schoolId);
        setSelectedCategories(b.categories);
        setTags(b.tags ?? []);
        // ?? "": docs created before the agnostic-location rename lack these fields.
        setAdmin1(b.location.admin1 ?? "");
        setAdmin2(b.location.admin2 ?? "");
        setAdmin3(b.location.admin3 ?? "");
        setCountry(b.location.country ?? "");
        setAddress(b.location.address ?? "");
        setCoords({
          lat: b.location.geopoint.latitude,
          lng: b.location.geopoint.longitude,
        });
        setWhatsapp(b.contact?.whatsapp ?? "");
        setPhone(b.contact?.phone ?? "");
        // Email comes from the private subdoc; fall back to a legacy public `contact.email`
        // (pre-#13 docs) so it prefills here and migrates to private on the next save.
        setEmail(
          priv?.email ??
            (b.contact as { email?: string } | undefined)?.email ??
            "",
        );
        setWeb(b.contact?.web ?? "");
        setInstagram(b.contact?.instagram ?? "");
        setFacebook(b.contact?.facebook ?? "");
        setHours(b.hours ?? "");
        setDiscountActive(b.discount?.active ?? false);
        setDiscountText(b.discount?.text ?? "");
      })
      .catch(() => setLoadState("error"));
  }, [id]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

  const toggleCategory = (catId: string) =>
    setSelectedCategories((prev) =>
      prev.includes(catId) ? prev.filter((x) => x !== catId) : [...prev, catId],
    );

  // Type-to-filter options with a locality hint (school names repeat across
  // localities). The current school is prepended when missing from the list (delisted,
  // or beyond the list cap) so editing other fields never silently re-assigns it. An
  // unlinked business (schoolId "") prepends nothing — the field is optional.
  const schoolOptions = useMemo(() => {
    const options: ComboboxOption[] = schools.map((s) => ({
      id: s.id,
      label: s.name,
      hint: localityLabel(s.location) || undefined,
    }));
    if (
      business?.schoolId &&
      !schools.some((s) => s.id === business.schoolId)
    ) {
      options.unshift({ id: business.schoolId, label: business.schoolName });
    }
    return options;
  }, [schools, business]);

  // Split once per business change: the stored cover (for the header preview fallback)
  // and the gallery (excluding any legacy cover at photos[0], which must not show as a
  // removable gallery item). Both were computed twice inline before.
  const { cover: storedCover, gallery: storedGallery } = useMemo(
    () =>
      business
        ? splitBusinessPhotos(business)
        : { cover: undefined, gallery: [] as string[] },
    [business],
  );

  // Un-publishing asks for confirmation first via <ConfirmDialog> (confirmUnpublish);
  // publishing validates first. Both end in applyStatus, which writes the status.
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);

  const applyStatus = async (status: BusinessPublishStatus) => {
    if (!business) return;
    setStatusError(null);
    setPublishing(true);
    try {
      await setBusinessStatus(business.id, status);
      setBusiness((b) => (b ? { ...b, status } : b));
    } catch (err) {
      setStatusError(userErrorMessage(err, "No se pudo cambiar el estado."));
    } finally {
      setPublishing(false);
    }
  };

  const onPublish = () => {
    if (!business) return;
    setStatusError(null);
    // Don't publish a stale (unsaved) profile, and never publish one that fails the same
    // minimums "Guardar" enforces — otherwise the just-edited form silently publishes the
    // OLD doc, or a profile with no category / no map pin.
    if (dirty) {
      setStatusError(
        "Tienes cambios sin guardar. Guarda el perfil antes de publicarlo.",
      );
      return;
    }
    const invalid = validateBusinessProfile({
      categories: selectedCategories,
      hasCoords: coords != null,
    });
    if (invalid) {
      setStatusError(invalid);
      return;
    }
    void applyStatus("active");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    // Same minimums publishing enforces (see onPublish) — category for the
    // /category/* listings, a map pin for the location.
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
      setError("Elige la ubicación en el mapa.");
      return;
    }
    if (discountActive && !discountText.trim()) {
      setError("Escribe la descripción del descuento o desactiva la opción.");
      return;
    }
    if (whatsapp.trim() && !normalizePhoneInternational(whatsapp)) {
      setError("Revisa el número de WhatsApp: no parece un número marcable.");
      return;
    }
    if (phone.trim() && !normalizePhoneInternational(phone)) {
      setError("Revisa el número de teléfono: no parece un número marcable.");
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      // Images go up first so the patch carries their final URLs in the same write
      // (mirrors the school edit form). null = no new file → keep the stored URL.
      const [logoUrl, coverUrl] = await Promise.all([
        photoFile
          ? uploadBusinessImage(business.id, "logo", photoFile)
          : Promise.resolve(null),
        coverFile
          ? uploadBusinessImage(business.id, "cover", coverFile)
          : Promise.resolve(null),
      ]);

      const school = schools.find((s) => s.id === schoolId);
      // Email is NOT a public contact channel: it goes to the private subcollection (#13),
      // passed separately to updateBusinessProfile below.
      const contact: BusinessContact = {};
      const channels: Array<[keyof BusinessContact, string]> = [
        ["whatsapp", whatsapp],
        ["phone", phone],
        ["web", web],
        ["instagram", instagram],
        ["facebook", facebook],
      ];
      for (const [channel, raw] of channels) {
        const value = raw.trim();
        if (value) contact[channel] = value;
      }
      // The catalog is no longer editable here (its public button was removed), but carry a
      // stored value through so saving never silently drops it — same as discount.percentage.
      if (business.contact?.catalog) contact.catalog = business.contact.catalog;
      const trimmedName = name.trim();
      const categoryNames = categories
        .filter((c) => selectedCategories.includes(c.id))
        .map((c) => c.name);
      // The selected school may be the business's current one even when it is missing
      // from the list (delisted, or beyond the list cap) — fall back to the
      // denormalized name.
      const schoolName =
        school?.name ??
        (schoolId === business.schoolId ? business.schoolName : "");
      const location = {
        lat: coords.lat,
        lng: coords.lng,
        admin1: admin1.trim(),
        admin2: admin2.trim(),
        admin3: admin3.trim(),
        country: country.trim() || undefined,
        address: address.trim() || undefined,
      };
      const discount = {
        active: discountActive,
        text: discountActive ? discountText.trim() : "",
        // Not editable here; carried through so saving never drops it.
        ...(business.discount?.percentage != null
          ? { percentage: business.discount.percentage }
          : {}),
      };
      const trimmedHours = hours.trim();
      const cleanTags = normalizeTags(tags);
      await updateBusinessProfile(business.id, {
        name: trimmedName,
        description: description.trim(),
        categories: selectedCategories,
        categoryNames,
        schoolId,
        schoolName,
        location,
        contact,
        // Persisted to the private subcollection, not the public doc (#13).
        email: email.trim(),
        discount,
        tags: cleanTags,
        hours: trimmedHours,
        ...(logoUrl ? { logoUrl } : {}),
        ...(coverUrl ? { coverUrl } : {}),
      });
      // Refresh the WHOLE local snapshot, not just `name`: schoolId/schoolName feed
      // schoolOptions and the schoolName fallback, and the header preview / gallery read
      // logoUrl/coverUrl — a partial update would leave subsequent saves operating on
      // stale denormalized data. `location` here is the raw input shape; the stored
      // geopoint/geohash are recomputed server-side but aren't read back on this page.
      setBusiness((b) =>
        b
          ? {
              ...b,
              name: trimmedName,
              description: description.trim(),
              categories: selectedCategories,
              categoryNames,
              schoolId,
              schoolName,
              location: {
                ...b.location,
                admin1: location.admin1,
                admin2: location.admin2,
                admin3: location.admin3,
                country: location.country,
                address: location.address,
              },
              contact,
              discount,
              tags: cleanTags,
              hours: trimmedHours,
              ...(logoUrl ? { logoUrl } : {}),
              ...(coverUrl ? { coverUrl } : {}),
            }
          : b,
      );
      // Reflect the normalized (deduped/trimmed) tags back into the field after save.
      setTags(cleanTags);
      setPhotoFile(null);
      setCoverFile(null);
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  if (loadState === "loading") {
    // Skeleton that keeps the heading in its final position so navigating here doesn't
    // flash a bare line then jump the layout when the doc arrives (mirrors the panel home
    // skeleton). The card placeholders stand in for the status banner + form sections.
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Editar comercio
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
          Editar comercio
        </h1>
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar los datos del comercio. Revisa tu conexión e intenta
          de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!business) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Editar comercio
        </h1>
        <EmptyState
          icon={<PagesIcon className="h-7 w-7" />}
          title="No encontramos este comercio"
          description="La página pudo haberse eliminado, o el enlace no es correcto."
        />
        <p className="mt-4 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isManager = isPageManager(business, user);

  if (!isManager) {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Editar comercio
        </h1>
        <p role="alert" className="mt-4 text-sm text-error">
          No administras este comercio.
        </p>
        <p className="mt-4 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Editar comercio
      </h1>
      <p className="mt-1 text-sm text-muted">{business.name}</p>

      <BusinessPanelNav
        businessId={id}
        active={business.status === "active"}
        current="edit"
      />

      {/* Publication state + its one action, as a semantic note: green when live,
          amber while a draft / pending / suspended. Depth-not-borders (soft ring),
          not a hard 1px line. */}
      <section
        className={`mt-6 rounded-2xl p-4 text-sm ring-1 ${
          business.status === "active"
            ? "bg-success-tint text-success ring-success/15"
            : "bg-warning-tint text-warning ring-warning/15"
        }`}
      >
        {business.status === "active" ? (
          <>
            <p>
              Tu página está <strong>publicada</strong>: aparece en el catálogo y
              en{" "}
              <Link
                href={`/business/${business.slug}`}
                className="font-medium underline"
              >
                su URL pública
              </Link>
              .
            </p>
            <button
              type="button"
              onClick={() => {
                setStatusError(null);
                setConfirmUnpublish(true);
              }}
              disabled={saving || publishing}
              aria-busy={publishing}
              className="btn btn-outline mt-3"
            >
              {publishing ? "Guardando…" : "Pasar a borrador"}
            </button>
          </>
        ) : business.status === "draft" ? (
          <>
            <p>
              Tu página está en <strong>borrador</strong>: no aparece en el
              catálogo ni se puede abrir su URL pública. Completa el perfil y
              publícala cuando esté lista.
            </p>
            <button
              type="button"
              onClick={onPublish}
              disabled={saving || publishing}
              aria-busy={publishing}
              className="btn btn-primary mt-3"
            >
              {publishing ? "Publicando…" : "Publicar página"}
            </button>
          </>
        ) : (
          <p>
            {business.status === "pending"
              ? "Tu página está en revisión por el equipo; todavía no es visible al público."
              : "Tu página fue suspendida por el equipo y no es visible. Escríbenos si crees que es un error."}
          </p>
        )}
        {/* Publish/unpublish error next to its button (not at the far-bottom form
            banner), so the reason a publish didn't happen is right where the user looked. */}
        {statusError && (
          <p role="alert" className="mt-3 font-medium text-error">
            {statusError}
          </p>
        )}
      </section>

      <ConfirmDialog
        open={confirmUnpublish}
        title="Pasar la página a borrador"
        confirmLabel="Pasar a borrador"
        onConfirm={() => {
          setConfirmUnpublish(false);
          void applyStatus("draft");
        }}
        onCancel={() => setConfirmUnpublish(false)}
      >
        Tu página dejará de aparecer en el catálogo y su URL pública dejará de
        abrir.
      </ConfirmDialog>

      <form
        id="business-edit-form"
        onSubmit={onSubmit}
        onChange={() => setDirty(true)}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-8 flex flex-col gap-6"
      >
        <FormSection legend="Información básica" boxed>
          <Field label="Nombre del comercio">
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
              <Combobox
                options={schoolOptions}
                value={schoolId}
                // The Combobox selects from a portal outside the form's DOM subtree, so its
                // change never bubbles to the form's onChange — mark dirty here, like the
                // other off-form controls (TagsInput / ImagePicker / LocationPicker).
                onChange={(next) => {
                  setSchoolId(next);
                  setDirty(true);
                }}
                placeholder="Busca tu escuela por nombre o lugar…"
                emptyMessage="Ninguna escuela coincide — prueba otro nombre o lugar."
              />
            </Field>
            {/* Non-accional copy: this field only denormalizes the association on the
                doc — it does NOT create a subscription or count for ranking (that's the
                /subscribe flow). */}
            <p className="mt-1 text-xs text-muted">
              Asocia tu comercio a una escuela en tu perfil. Para apoyarla con una
              suscripción, ve a “Apoyar una escuela” desde el panel. Borra el texto
              para quitar la escuela vinculada.
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">
              Categorías (elige al menos una)
            </legend>
            {categories.length === 0 ? (
              // System failure (the fetch returned nothing), not "you didn't choose":
              // say so instead of rendering an empty fieldset that reads as no options.
              <p role="alert" className="mt-2 text-sm text-error">
                No pudimos cargar las categorías. Recarga la página.
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

          <TagsInput
            label="Etiquetas de búsqueda (opcional)"
            hint="Palabras o frases que la gente busca y que vendes u ofreces — “cuadernos”, “útiles escolares”, “tijeras”. Ayudan a que tu comercio aparezca aunque no estén en el nombre. Enter o coma para agregar cada una."
            value={tags}
            onChange={(next) => {
              setTags(next);
              setDirty(true);
            }}
            max={BUSINESS_TAGS_MAX}
            maxLength={BUSINESS_TAG_MAX}
            placeholder="cuadernos, útiles escolares, tijeras…"
          />
        </FormSection>

        <FormSection
          legend="Ubicación"
          description="Se completan solos al mover el pin en el mapa — revísalos, corrígelos o déjalos en blanco si no aplican."
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
          <Field label="Dirección (opcional)">
            <input
              autoComplete="street-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="input"
            />
          </Field>
        </FormSection>

        <FormSection
          legend="Contacto"
          description="Todos los canales son opcionales."
          boxed
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PhoneField label="WhatsApp" value={whatsapp} onChange={setWhatsapp} />
            <PhoneField label="Teléfono" value={phone} onChange={setPhone} />
            <Field label="Email">
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Sitio web">
              <input
                autoComplete="url"
                value={web}
                onChange={(e) => setWeb(e.target.value)}
                placeholder="micomercio.com"
                className="input"
              />
            </Field>
            <Field label="Instagram">
              <input
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@micomercio"
                className="input"
              />
            </Field>
            <Field label="Facebook">
              <input
                value={facebook}
                onChange={(e) => setFacebook(e.target.value)}
                className="input"
              />
            </Field>
          </div>
        </FormSection>

        <FormSection legend="Presentación" boxed>
          <ImagePicker
            label="Logo"
            hint="Se muestra como círculo sobre la portada (tu marca o fachada)."
            value={photoFile}
            onChange={(file) => {
              setPhotoFile(file);
              setDirty(true);
            }}
            variant="avatar"
          />

          <ImagePicker
            label="Portada"
            hint="Banda ancha arriba de la página (tu local, productos, equipo)."
            value={coverFile}
            onChange={(file) => {
              setCoverFile(file);
              setDirty(true);
            }}
            variant="cover"
          />

          {/* Mini header so the owner can check the avatar/cover overlap without opening
              the public page. Newly picked files win over the stored URLs. */}
          <HeaderPreview
            cover={coverFile ?? storedCover}
            logo={photoFile ?? business.logoUrl}
            businessName={business.name}
          />

          <Field label="Horario (opcional)">
            <input
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="L–V 8:00–18:00, S 8:00–12:00"
              className="input"
            />
          </Field>

          {/* Inset (muted) panel rather than another elevated card: it's a sub-group
              nested inside the already-elevated "Presentación" section. */}
          <fieldset className={cardClass("inset")}>
            <legend className="px-1 text-sm font-medium text-foreground">
              Descuento para la comunidad
            </legend>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={discountActive}
                onChange={(e) => setDiscountActive(e.target.checked)}
              />
              <span>Ofrezco un descuento</span>
            </label>
            {discountActive && (
              <div className="mt-3">
                <Field label="Descripción del descuento">
                  <input
                    required
                    value={discountText}
                    onChange={(e) => setDiscountText(e.target.value)}
                    maxLength={120}
                    placeholder="10% en útiles escolares mencionando escuelaplace"
                    className="input"
                  />
                </Field>
              </div>
            )}
          </fieldset>
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
            addPhoto={(file) => addBusinessGalleryPhoto(business.id, file)}
            removePhoto={(url) => removeBusinessGalleryPhoto(business.id, url)}
          />
        </div>
      </section>

      {/* The save action lives at the very bottom of the page, after the gallery, so it
          reads as the final step. It's outside the <form> now, so it's reconnected via the
          form="" attribute (submits the same form); its FormError sits right above it. The
          wrapper owns the spacing (gap-4 only bites when the error is present, since
          FormError renders null otherwise — no empty gap when there's no error). */}
      <div className="mt-10 flex flex-col gap-4">
        <FormError message={error} />
        <div className="flex items-center gap-3">
          <button
            type="submit"
            form="business-edit-form"
            disabled={saving || publishing}
            aria-busy={saving}
            className="btn btn-primary"
          >
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          <SavedIndicator show={saved} onHide={() => setSaved(false)} />
        </div>
      </div>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
