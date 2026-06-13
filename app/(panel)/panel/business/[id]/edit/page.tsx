"use client";

/**
 * Business edit form (/panel/business/[id]/edit). The create form captures only the
 * essentials; here the owner completes the public profile (contact channels, hours,
 * discount) and controls publication. Businesses are created as a hidden `draft` —
 * public reads filter by status == 'active' — so publishing from this page is what
 * actually puts the profile on the catalog. Photos/logo still need an upload UI.
 */
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { GalleryManager } from "@/components/business/GalleryManager";
import { HeaderPreview } from "@/components/business/HeaderPreview";
import { Combobox, type ComboboxOption } from "@/components/ui/Combobox";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { PhoneField } from "@/components/ui/PhoneField";
import { buildCatalogUrl, normalizePhoneInternational } from "@/lib/contact";
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
  getCategories,
  getSchoolsCached,
  removeBusinessGalleryPhoto,
  setBusinessStatus,
  splitBusinessPhotos,
  updateBusinessProfile,
  type BusinessPublishStatus,
} from "@/lib/firestore";
import {
  PAGE_DESCRIPTION_MAX,
  type BusinessContact,
  type BusinessDoc,
  type CategoryDoc,
  type SchoolDoc,
} from "@/types";

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
  const [catalog, setCatalog] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [web, setWeb] = useState("");
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [hours, setHours] = useState("");
  const [discountActive, setDiscountActive] = useState(false);
  const [discountText, setDiscountText] = useState("");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    Promise.all([getBusinessById(id), getSchoolsCached(), getCategories()])
      .then(([b, s, c]) => {
        setBusiness(b);
        setSchools(s);
        setCategories(c);
        setLoadState("loaded");
        if (!b) return;
        setName(b.name);
        setDescription(b.description);
        setSchoolId(b.schoolId);
        setSelectedCategories(b.categories);
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
        setCatalog(b.contact?.catalog ?? "");
        setPhone(b.contact?.phone ?? "");
        setEmail(b.contact?.email ?? "");
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

  const onToggleStatus = async (status: BusinessPublishStatus) => {
    if (!business) return;
    setPublishing(true);
    setError(null);
    try {
      await setBusinessStatus(business.id, status);
      setBusiness((b) => (b ? { ...b, status } : b));
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo cambiar el estado."));
    } finally {
      setPublishing(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!business) return;
    // Without a category the business never appears in the /category/* listings —
    // one of the main discovery paths — so it can't be emptied silently.
    if (selectedCategories.length === 0) {
      setError("Elegí al menos una categoría: sin categoría tu comercio no aparece en los listados.");
      return;
    }
    if (!coords) {
      setError("Elegí la ubicación en el mapa.");
      return;
    }
    if (whatsapp.trim() && !normalizePhoneInternational(whatsapp)) {
      setError("Revisá el número de WhatsApp: no parece un número marcable.");
      return;
    }
    if (phone.trim() && !normalizePhoneInternational(phone)) {
      setError("Revisá el número de teléfono: no parece un número marcable.");
      return;
    }
    if (catalog.trim() && !buildCatalogUrl(catalog)) {
      setError(
        "Revisá el catálogo: pegá el enlace wa.me/c/… que da WhatsApp Business o el número que lo tiene.",
      );
      return;
    }
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const school = schools.find((s) => s.id === schoolId);
      const contact: BusinessContact = {};
      const channels: Array<[keyof BusinessContact, string]> = [
        ["whatsapp", whatsapp],
        ["catalog", catalog],
        ["phone", phone],
        ["email", email],
        ["web", web],
        ["instagram", instagram],
        ["facebook", facebook],
      ];
      for (const [channel, raw] of channels) {
        const value = raw.trim();
        if (value) contact[channel] = value;
      }
      const trimmedName = name.trim();
      await updateBusinessProfile(business.id, {
        name: trimmedName,
        description: description.trim(),
        categories: selectedCategories,
        categoryNames: categories
          .filter((c) => selectedCategories.includes(c.id))
          .map((c) => c.name),
        schoolId,
        // The selected school may be the business's current one even when it is missing
        // from the list (delisted, or beyond the list cap) — fall back to the
        // denormalized name.
        schoolName:
          school?.name ??
          (schoolId === business.schoolId ? business.schoolName : ""),
        location: {
          lat: coords.lat,
          lng: coords.lng,
          admin1: admin1.trim(),
          admin2: admin2.trim(),
          admin3: admin3.trim(),
          country: country.trim() || undefined,
          address: address.trim() || undefined,
        },
        contact,
        discount: {
          active: discountActive,
          text: discountActive ? discountText.trim() : "",
          // Not editable here; carried through so saving never drops it.
          ...(business.discount?.percentage != null
            ? { percentage: business.discount.percentage }
            : {}),
        },
        hours: hours.trim(),
      });
      setBusiness((b) => (b ? { ...b, name: trimmedName } : b));
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudieron guardar los cambios."));
    } finally {
      setSaving(false);
    }
  };

  if (loadState === "loading") {
    return <p className="text-sm text-muted">Cargando…</p>;
  }

  if (loadState === "error") {
    return (
      <main className="max-w-xl">
        <h1 className="text-2xl font-bold">Editar comercio</h1>
        <p role="alert" className="mt-4 text-sm text-red-600">
          No pudimos cargar los datos del comercio. Revisá tu conexión e intentá
          de nuevo.
        </p>
        <button type="button" onClick={retry} className="btn btn-outline mt-3">
          Reintentar
        </button>
      </main>
    );
  }

  if (!business)
    return <p className="text-sm text-muted">Comercio no encontrado.</p>;

  const isManager =
    user != null &&
    (business.ownerId === user.id ||
      business.editorIds?.includes(user.id) ||
      user.role === "admin");

  if (!isManager) {
    return <p className="text-sm text-red-600">No administrás este comercio.</p>;
  }

  return (
    <main className="max-w-xl">
      <h1 className="text-2xl font-bold">Editar comercio</h1>
      <p className="mt-1 text-sm text-muted">{business.name}</p>

      <section
        className={`mt-4 rounded-lg border p-4 text-sm ${
          business.status === "active"
            ? "border-green-200 bg-green-50"
            : "border-amber-200 bg-amber-50"
        }`}
      >
        {business.status === "active" ? (
          <>
            <p className="text-green-800">
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
              onClick={() => onToggleStatus("draft")}
              disabled={publishing}
              className="btn btn-outline mt-3"
            >
              {publishing ? "Guardando…" : "Pasar a borrador"}
            </button>
          </>
        ) : business.status === "draft" ? (
          <>
            <p className="text-amber-800">
              Tu página está en <strong>borrador</strong>: no aparece en el
              catálogo ni se puede abrir su URL pública. Completá el perfil y
              publicala cuando esté lista.
            </p>
            <button
              type="button"
              onClick={() => onToggleStatus("active")}
              disabled={publishing}
              className="btn btn-primary mt-3"
            >
              {publishing ? "Publicando…" : "Publicar página"}
            </button>
          </>
        ) : (
          <p className="text-amber-800">
            {business.status === "pending"
              ? "Tu página está en revisión por el equipo; todavía no es visible al público."
              : "Tu página fue suspendida por el equipo y no es visible. Escribinos si creés que es un error."}
          </p>
        )}
      </section>

      <form
        onSubmit={onSubmit}
        onChange={() => setDirty(true)}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-6 flex flex-col gap-4"
      >
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
          <span className="text-xs text-muted">
            {description.length}/{PAGE_DESCRIPTION_MAX}
          </span>
        </Field>

        <Field label="Escuela que apoyás (opcional)">
          <Combobox
            options={schoolOptions}
            value={schoolId}
            onChange={setSchoolId}
            placeholder="Buscá tu escuela por nombre o lugar…"
          />
        </Field>
        <p className="-mt-2 text-xs text-muted">
          Borrá el texto para quitar la escuela vinculada.
        </p>

        <fieldset>
          <legend className="text-sm font-medium">
            Categorías (elegí al menos una)
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((c) => (
              <label
                key={c.id}
                className={`inline-flex min-h-10 cursor-pointer items-center rounded-full border px-4 text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                  selectedCategories.includes(c.id)
                    ? "bg-brand-darker text-white"
                    : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selectedCategories.includes(c.id)}
                  onChange={() => toggleCategory(c.id)}
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>

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
        <p className="-mt-2 text-xs text-muted">
          Se completan solos al mover el pin en el mapa — revisalos, corregilos
          o dejalos en blanco si no aplican.
        </p>

        <fieldset>
          <legend className="text-sm font-medium">Contacto (todo opcional)</legend>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PhoneField label="WhatsApp" value={whatsapp} onChange={setWhatsapp} />
            <Field label="Catálogo de WhatsApp Business">
              <input
                value={catalog}
                onChange={(e) => setCatalog(e.target.value)}
                placeholder="Enlace wa.me/c/… o el número del catálogo"
                className="input"
              />
            </Field>
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
        </fieldset>

        <Field label="Horario (opcional)">
          <input
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="L–V 8:00–18:00, S 8:00–12:00"
            className="input"
          />
        </Field>

        <fieldset className="rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            Descuento para la comunidad
          </legend>
          <label className="flex items-center gap-2 text-sm">
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

        <div className="flex flex-col gap-2">
          {/* Read-only mini header (cover + overlapping avatar) so the owner can
              check the overlap without opening the public page. */}
          <HeaderPreview
            cover={splitBusinessPhotos(business).cover}
            logo={business.logoUrl}
            businessName={business.name}
          />
          <p className="text-xs text-muted">
            El logo y la portada se eligen al crear la página; todavía no se
            pueden cambiar desde acá.
          </p>
        </div>

        <FormError message={error} />

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
          {saved && (
            <span role="status" className="text-xs text-green-700">
              Cambios guardados.
            </span>
          )}
        </div>
      </form>

      {/* Outside the form: gallery changes publish immediately (upload/remove mutate
          the doc on the spot), they don't wait for "Guardar cambios". */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Galería</h2>
        <div className="mt-2">
          <GalleryManager
            // splitBusinessPhotos excludes a legacy cover stored as photos[0], which
            // must not show up as a removable gallery item.
            initialPhotos={splitBusinessPhotos(business).gallery}
            addPhoto={(file) => addBusinessGalleryPhoto(business.id, file)}
            removePhoto={(url) => removeBusinessGalleryPhoto(business.id, url)}
          />
        </div>
      </section>

      <p className="mt-8 text-sm">
        <Link href="/panel" className="underline">
          ← Volver al panel
        </Link>
      </p>
    </main>
  );
}
