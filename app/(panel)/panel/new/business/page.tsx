"use client";

/**
 * Create-business form (/panel/new/business). Captures the essentials, creates a draft
 * business owned by the signed-in user and links it to their managedPages, then routes
 * to the panel. The page starts as a hidden draft: the owner completes the profile
 * (contact channels, hours, discount) and publishes it from /panel/business/[id]/edit.
 */
import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Combobox } from "@/components/ui/Combobox";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { PhoneField } from "@/components/ui/PhoneField";
import { normalizePhoneInternational } from "@/lib/contact";
import { CR_PROVINCES, matchProvince } from "@/lib/cr";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
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
  const [province, setProvince] = useState("");
  const [canton, setCanton] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [whatsapp, setWhatsapp] = useState("");

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
    const matched = matchProvince(guess.province);
    if (matched) setProvince(matched);
    if (guess.canton) setCanton(guess.canton);
    if (guess.district) setDistrict(guess.district);
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
    // The Combobox has no native `required` semantics, so validate the selection here.
    if (!schoolId) {
      setError("Elegí la escuela que apoyás.");
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
          province: province.trim(),
          canton: canton.trim(),
          district: district.trim(),
          address: address.trim() || undefined,
        },
        contact: trimmedWhatsapp ? { whatsapp: trimmedWhatsapp } : undefined,
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

        <Field label="Escuela que apoyás">
          {/* Type-to-filter with a canton/province hint: MEP school names repeat a lot
              across cantons, and a native select gives no way to tell homonyms apart —
              picking the wrong school misdirects the support publicly. */}
          <Combobox
            options={schools.map((s) => ({
              id: s.id,
              label: s.name,
              hint: `${s.location.canton}, ${s.location.province}`,
            }))}
            value={schoolId}
            onChange={setSchoolId}
            placeholder="Buscá tu escuela por nombre o lugar…"
          />
        </Field>
        {/* Outside the Field: links must not nest inside its <label>. */}
        {schools.length === 0 ? (
          <p className="-mt-2 text-xs text-amber-700">
            Todavía no hay escuelas en la plataforma.{" "}
            <Link href="/panel/new/school" className="font-medium underline">
              Creá la página de tu escuela
            </Link>{" "}
            primero.
          </p>
        ) : (
          <p className="-mt-2 text-xs text-gray-500">
            ¿Tu escuela no está en la lista?{" "}
            <Link href="/panel/new/school" className="font-medium underline">
              Creá su página
            </Link>{" "}
            y después volvé a crear tu comercio.
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Provincia">
            <select
              required
              autoComplete="address-level1"
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="input"
            >
              <option value="">Elegí…</option>
              {CR_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cantón">
            <input required autoComplete="address-level2" value={canton} onChange={(e) => setCanton(e.target.value)} className="input" />
          </Field>
          <Field label="Distrito">
            <input required autoComplete="address-level3" value={district} onChange={(e) => setDistrict(e.target.value)} className="input" />
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
          Se completan solos al marcar el punto en el mapa — revisalos y
          corregilos si hace falta.
        </p>

        <PhoneField
          label="WhatsApp (opcional)"
          value={whatsapp}
          onChange={setWhatsapp}
        />

        <FormError message={error} />

        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Creando…" : "Crear comercio"}
        </button>
      </form>
    </main>
  );
}
