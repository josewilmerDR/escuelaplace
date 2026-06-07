"use client";

/**
 * Create-business form (/panel/new/business). Captures the essentials, creates a draft
 * business owned by the signed-in user and links it to their managedPages, then routes
 * to the panel. Full details (photos, hours, discount) are edited later.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  createBusinessPage,
  getCategories,
  getSchools,
} from "@/lib/firestore";
import type { CategoryDoc, SchoolDoc } from "@/types";

export default function NewBusinessPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [schools, setSchools] = useState<SchoolDoc[]>([]);
  const [categories, setCategories] = useState<CategoryDoc[]>([]);
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
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  useEffect(() => {
    Promise.all([getSchools(), getCategories()]).then(([s, c]) => {
      setSchools(s);
      setCategories(c);
    });
  }, []);

  const toggleCategory = (id: string) =>
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setSaving(true);
    try {
      const school = schools.find((s) => s.id === schoolId);
      const id = await createBusinessPage(user.id, {
        name,
        description,
        categories: selectedCategories,
        categoryNames: categories
          .filter((c) => selectedCategories.includes(c.id))
          .map((c) => c.name),
        schoolId,
        schoolName: school?.name ?? "",
        location: {
          lat: Number(lat),
          lng: Number(lng),
          province,
          canton,
          district,
        },
        contact: whatsapp ? { whatsapp } : undefined,
      });
      router.push(`/panel?created=${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el comercio.");
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold">Crear comercio</h1>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <Field label="Nombre del comercio">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Descripción">
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input min-h-24"
          />
        </Field>

        <Field label="Escuela que apoyás">
          <select
            required
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="input"
          >
            <option value="">Elegí una escuela…</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <fieldset>
          <legend className="text-sm font-medium">Categorías</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {categories.map((c) => (
              <label
                key={c.id}
                className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${
                  selectedCategories.includes(c.id) ? "bg-black text-white" : ""
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

        <Field label="WhatsApp (opcional)">
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="input" />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "Creando…" : "Crear comercio"}
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
