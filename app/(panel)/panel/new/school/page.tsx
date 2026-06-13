"use client";

/**
 * Create-school form (/panel/new/school). Schools are self-administered but start
 * unverified ('pending'): the payment methods stay hidden and an "unverified data"
 * banner shows until admin approves. Creates the school + optional payment methods and
 * links it to the user.
 */
import { useCallback, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PaymentMethodsEditor } from "@/components/school/PaymentMethodsEditor";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { FormSection } from "@/components/ui/FormSection";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import { createSchoolPage } from "@/lib/firestore";
import { PAGE_DESCRIPTION_MAX, type PaymentMethod } from "@/types";
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
  const [description, setDescription] = useState("");
  // Country-agnostic administrative levels (see types/firestore.ts). country has no
  // input: it arrives from the reverse geocoder when the pin moves.
  const [admin1, setAdmin1] = useState("");
  const [admin2, setAdmin2] = useState("");
  const [admin3, setAdmin3] = useState("");
  const [country, setCountry] = useState("");
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [boardName, setBoardName] = useState("");
  const [boardPhone, setBoardPhone] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

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
      // Only complete rows are stored; half-typed ones can't be paid to.
      const completeMethods = paymentMethods
        .map((m) => ({ label: m.label.trim(), value: m.value.trim() }))
        .filter((m) => m.label && m.value);
      const id = await createSchoolPage(user.id, {
        name: trimmedName,
        description: description.trim(),
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
          phone: boardPhone.trim() || undefined,
        },
        paymentMethods: completeMethods.length ? completeMethods : undefined,
      });
      router.push(`/panel?created=${id}`);
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo crear la escuela."));
      setSaving(false);
    }
  };

  return (
    <main className="max-w-xl">
      <h1 className="text-2xl font-bold">Crear escuela</h1>
      <p className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
        La escuela se publica como <strong>sin verificar</strong>. Los métodos de
        pago quedan ocultos hasta que el equipo verifique los datos.
      </p>

      <form
        onSubmit={onSubmit}
        onChange={() => setDirty(true)}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-6 flex flex-col gap-4"
      >
        <FormSection legend="Información básica">
          <Field label="Nombre de la escuela">
            <input required autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </Field>

          <Field label="Descripción (opcional)">
            <textarea
              maxLength={PAGE_DESCRIPTION_MAX}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input min-h-24"
            />
            <span className="text-xs text-muted">
              {description.length}/{PAGE_DESCRIPTION_MAX}
            </span>
          </Field>
        </FormSection>

        <FormSection
          legend="Ubicación"
          description="Se completan solos al marcar el punto en el mapa — revisalos, corregilos o dejalos en blanco si no aplican."
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
        </FormSection>

        {/* "Comité escolar": neutral term for whoever administers the school's funds
            (junta de educación, asociación de padres, consejo escolar…). */}
        <FormSection
          legend="Contacto del comité escolar"
          description="La junta, asociación o consejo que administra los fondos de la escuela."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <input required value={boardName} onChange={(e) => setBoardName(e.target.value)} className="input" />
            </Field>
            <Field label="Teléfono (opcional)">
              <input value={boardPhone} onChange={(e) => setBoardPhone(e.target.value)} className="input" />
            </Field>
          </div>
        </FormSection>

        <fieldset className="rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">
            Métodos de pago (opcional, se ocultan hasta verificar)
          </legend>
          <p className="mb-3 mt-1 text-xs text-muted">
            Cómo puede aportar quien quiera ayudar: cuenta bancaria, método local
            (SINPE Móvil, Modo, Bizum…), PayPal, etc. Es solo informativo —
            escuelaplace nunca procesa ni certifica pagos.
          </p>
          <PaymentMethodsEditor
            value={paymentMethods}
            onChange={(rows) => {
              setPaymentMethods(rows);
              setDirty(true);
            }}
          />
        </fieldset>

        <FormError message={error} />

        <button type="submit" disabled={saving} className="btn btn-primary">
          {saving ? "Creando…" : "Crear escuela"}
        </button>
      </form>
    </main>
  );
}
