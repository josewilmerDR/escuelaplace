"use client";

/**
 * Create-school form (/panel/new/school). Schools are self-administered but start
 * unverified ('pending'): the SINPE stays hidden and an "unverified data" banner shows
 * until admin approves. Creates the school + optional SINPE and links it to the user.
 */
import { useCallback, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { CR_PROVINCES, matchProvince } from "@/lib/cr";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import { createSchoolPage } from "@/lib/firestore";
import { PAGE_DESCRIPTION_MAX } from "@/types";
import {
  LocationPicker,
  type AdminAreaGuess,
  type LatLng,
} from "@/components/maps/LocationPicker";

export default function NewSchoolPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [mepCode, setMepCode] = useState("");
  const [description, setDescription] = useState("");
  const [province, setProvince] = useState("");
  const [canton, setCanton] = useState("");
  const [district, setDistrict] = useState("");
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [boardName, setBoardName] = useState("");
  const [boardPhone, setBoardPhone] = useState("");
  const [sinpeNumber, setSinpeNumber] = useState("");
  const [sinpeHolder, setSinpeHolder] = useState("");

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
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError("Tu sesión expiró. Volvé a ingresar.");
      return;
    }
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
    setError(null);
    setSaving(true);
    try {
      const hasSinpe = sinpeNumber.trim() && sinpeHolder.trim();
      const id = await createSchoolPage(user.id, {
        name: trimmedName,
        mepCode: mepCode.trim(),
        description: description.trim(),
        location: {
          lat: coords.lat,
          lng: coords.lng,
          province: province.trim(),
          canton: canton.trim(),
          district: district.trim(),
        },
        boardContact: {
          name: boardName.trim(),
          phone: boardPhone.trim() || undefined,
        },
        sinpe: hasSinpe
          ? { number: sinpeNumber.trim(), accountHolder: sinpeHolder.trim() }
          : undefined,
      });
      router.push(`/panel?created=${id}`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo crear la escuela."));
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Crear escuela</h1>
      <p className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
        La escuela se publica como <strong>sin verificar</strong>. El SINPE queda
        oculto hasta que el equipo verifique los datos.
      </p>

      <form
        onSubmit={onSubmit}
        onChange={() => setDirty(true)}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-6 flex flex-col gap-4"
      >
        <Field label="Nombre de la escuela">
          <input required autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </Field>

        <Field label="Código MEP">
          <input required value={mepCode} onChange={(e) => setMepCode(e.target.value)} className="input" />
        </Field>

        <Field label="Descripción (opcional)">
          <textarea
            maxLength={PAGE_DESCRIPTION_MAX}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input min-h-24"
          />
          <span className="text-xs text-gray-500">
            {description.length}/{PAGE_DESCRIPTION_MAX}
          </span>
        </Field>

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
        <p className="-mt-2 text-xs text-gray-500">
          Se completan solos al marcar el punto en el mapa — revisalos y
          corregilos si hace falta.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Contacto de la Junta — nombre">
            <input required value={boardName} onChange={(e) => setBoardName(e.target.value)} className="input" />
          </Field>
          <Field label="Teléfono (opcional)">
            <input value={boardPhone} onChange={(e) => setBoardPhone(e.target.value)} className="input" />
          </Field>
        </div>

        <fieldset className="rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">SINPE (opcional, se oculta hasta verificar)</legend>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Número SINPE">
              <input value={sinpeNumber} onChange={(e) => setSinpeNumber(e.target.value)} className="input" />
            </Field>
            <Field label="Titular de la cuenta">
              <input value={sinpeHolder} onChange={(e) => setSinpeHolder(e.target.value)} className="input" />
            </Field>
          </div>
        </fieldset>

        <FormError message={error} />

        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Creando…" : "Crear escuela"}
        </button>
      </form>
    </main>
  );
}
