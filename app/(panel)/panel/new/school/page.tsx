"use client";

/**
 * Create-school form (/panel/new/school). Schools are self-administered but start
 * unverified ('pending'): the SINPE stays hidden and an "unverified data" banner shows
 * until admin approves. Creates the school + optional SINPE and links it to the user.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { createSchoolPage } from "@/lib/firestore";

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
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [boardName, setBoardName] = useState("");
  const [boardPhone, setBoardPhone] = useState("");
  const [sinpeNumber, setSinpeNumber] = useState("");
  const [sinpeHolder, setSinpeHolder] = useState("");

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaving(true);
    try {
      const hasSinpe = sinpeNumber.trim() && sinpeHolder.trim();
      const id = await createSchoolPage(user.id, {
        name,
        mepCode,
        description,
        location: {
          lat: Number(lat),
          lng: Number(lng),
          province,
          canton,
          district,
        },
        boardContact: { name: boardName, phone: boardPhone || undefined },
        sinpe: hasSinpe
          ? { number: sinpeNumber, accountHolder: sinpeHolder }
          : undefined,
      });
      router.push(`/panel?created=${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la escuela.");
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

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <Field label="Nombre de la escuela">
          <input required value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </Field>

        <Field label="Código MEP">
          <input required value={mepCode} onChange={(e) => setMepCode(e.target.value)} className="input" />
        </Field>

        <Field label="Descripción (opcional)">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-24" />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Provincia">
            <input required value={province} onChange={(e) => setProvince(e.target.value)} className="input" />
          </Field>
          <Field label="Cantón">
            <input required value={canton} onChange={(e) => setCanton(e.target.value)} className="input" />
          </Field>
          <Field label="Distrito">
            <input required value={district} onChange={(e) => setDistrict(e.target.value)} className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitud">
            <input required type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} className="input" />
          </Field>
          <Field label="Longitud">
            <input required type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Contacto de la Junta — nombre">
            <input required value={boardName} onChange={(e) => setBoardName(e.target.value)} className="input" />
          </Field>
          <Field label="Teléfono (opcional)">
            <input value={boardPhone} onChange={(e) => setBoardPhone(e.target.value)} className="input" />
          </Field>
        </div>

        <fieldset className="rounded-md border p-3">
          <legend className="px-1 text-sm font-medium">SINPE (opcional, se oculta hasta verificar)</legend>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Número SINPE">
              <input value={sinpeNumber} onChange={(e) => setSinpeNumber(e.target.value)} className="input" />
            </Field>
            <Field label="Titular de la cuenta">
              <input value={sinpeHolder} onChange={(e) => setSinpeHolder(e.target.value)} className="input" />
            </Field>
          </div>
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "Creando…" : "Crear escuela"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}
