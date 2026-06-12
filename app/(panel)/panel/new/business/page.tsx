"use client";

/**
 * Create-business form (/panel/new/business). Captures the essentials — including the
 * optional profile (logo) and cover images that fill the public FB-style header —
 * creates a draft business owned by the signed-in user and links it to their
 * managedPages, then routes to the panel. The page starts as a hidden draft: the owner
 * completes the profile (contact channels, hours, discount) and publishes it from
 * /panel/business/[id]/edit.
 */
import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Combobox } from "@/components/ui/Combobox";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { HeaderPreview } from "@/components/business/HeaderPreview";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { PhoneField } from "@/components/ui/PhoneField";
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
        setLoadState("loaded");
      })
      .catch(() => setLoadState("error"));
  }, []);

  useEffect(load, [load]);

  const retry = () => {
    setLoadState("loading");
    load();
  };

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
    // Without a category the business never appears in the /category/* listings —
    // one of the main discovery paths — so it can't be skipped silently.
    if (selectedCategories.length === 0) {
      setError("Elegí al menos una categoría: sin categoría tu comercio no aparece en los listados.");
      return;
    }
    if (!coords) {
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
    return <p className="text-sm text-gray-500">Cargando…</p>;
  }

  if (loadState === "error") {
    return (
      <main className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold">Crear comercio</h1>
        <p role="alert" className="mt-4 text-sm text-red-600">
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
    <main className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Crear comercio</h1>

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
        {/* The slug is derived from the name and never changes after creation — show
            the resulting URL before it becomes permanent. */}
        {slugify(name) && (
          <p className="-mt-2 text-xs text-gray-500">
            Tu página va a estar en:{" "}
            <span className="font-medium">
              escuelaplace.com/business/{slugify(name)}
            </span>{" "}
            (si el nombre ya está usado, se agrega un número).
          </p>
        )}

        <Field label="Descripción">
          <textarea
            required
            maxLength={PAGE_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input min-h-24"
          />
          <span className="text-xs text-gray-500">
            {description.length}/{PAGE_DESCRIPTION_MAX}
          </span>
        </Field>

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

        <Field label="Escuela que apoyás (opcional)">
          {/* Type-to-filter with a locality hint: school names repeat a lot across
              localities, and a native select gives no way to tell homonyms apart —
              picking the wrong school misdirects the support publicly. */}
          <Combobox
            options={schools.map((s) => ({
              id: s.id,
              label: s.name,
              hint: localityLabel(s.location) || undefined,
            }))}
            value={schoolId}
            onChange={setSchoolId}
            placeholder="Buscá tu escuela por nombre o lugar…"
          />
        </Field>
        {/* Outside the Field: links must not nest inside its <label>. */}
        {schools.length === 0 ? (
          <p className="-mt-2 text-xs text-gray-500">
            Todavía no hay escuelas en la plataforma. Podés crear tu comercio
            sin escuela y vincularla después, o{" "}
            <Link href="/panel/new/school" className="font-medium underline">
              crear la página de tu escuela
            </Link>{" "}
            primero.
          </p>
        ) : (
          <p className="-mt-2 text-xs text-gray-500">
            Podés dejarla en blanco y vincularla después desde la edición. ¿Tu
            escuela no está en la lista?{" "}
            <Link href="/panel/new/school" className="font-medium underline">
              Creá su página
            </Link>
            .
          </p>
        )}

        <fieldset>
          <legend className="text-sm font-medium">
            Categorías (elegí al menos una)
          </legend>
          {categories.length === 0 ? (
            <p className="mt-2 text-xs text-gray-500">
              No hay categorías disponibles por ahora.
            </p>
          ) : (
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
          )}
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
        <p className="-mt-2 text-xs text-gray-500">
          Se completan solos al marcar el punto en el mapa — revisalos,
          corregilos o dejalos en blanco si no aplican.
        </p>

        <PhoneField
          label="WhatsApp (opcional)"
          value={whatsapp}
          onChange={setWhatsapp}
        />

        <FormError message={error} />

        <button type="submit" disabled={saving} className="btn btn-primary">
          {/* Uploads can take a few seconds on mobile data — say what's happening. */}
          {saving
            ? logoFile || coverFile
              ? "Subiendo imágenes…"
              : "Creando…"
            : "Crear comercio"}
        </button>
      </form>
    </main>
  );
}
