"use client";

/**
 * Project funding flow (/panel/fund?schoolId=&projectId=).
 *
 * Any signed-in user contributes money to a specific project: it shows the project, the
 * school's published payment methods (only when verified — same gate as donations), an
 * amount in the project's currency, and an optional payment proof. Same lifecycle as a
 * donation: the platform never touches the money; the SCHOOL confirms the proof, and a
 * Cloud Function then advances the project's progress bar.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PaymentMethodsInfo } from "@/components/school/PaymentMethodsInfo";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { Field } from "@/components/ui/Field";
import { FormError } from "@/components/ui/FormError";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import {
  createContribution,
  ensureDonorProfile,
  getContributionsByDonor,
  getProjectById,
  getSchoolById,
  getVerifiedSchoolPaymentMethods,
  projectGoal,
  uploadContributionProof,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import type {
  PaymentMethod,
  ProjectContributionDoc,
  ProjectDoc,
  SchoolDoc,
} from "@/types";

export default function FundPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Cargando…</p>}>
      <FundContent />
    </Suspense>
  );
}

function FundContent() {
  const { user } = useAuth();
  const params = useSearchParams();
  const schoolId = params.get("schoolId") ?? "";
  const projectId = params.get("projectId") ?? "";

  const [project, setProject] = useState<ProjectDoc | null>(null);
  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [myContribs, setMyContribs] = useState<ProjectContributionDoc[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [type, setType] = useState<"money" | "in_kind">("money");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  // "" = not tied to a stage; otherwise the stage index.
  const [stageIndex, setStageIndex] = useState<number | "">("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reloadContribs = useCallback(() => {
    if (!user) return Promise.resolve();
    return getContributionsByDonor(user.id).then((all) =>
      setMyContribs(all.filter((c) => c.projectId === projectId)),
    );
  }, [user, projectId]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        if (schoolId && projectId) {
          const [p, s, m, contribs] = await Promise.all([
            getProjectById(schoolId, projectId),
            getSchoolById(schoolId),
            getVerifiedSchoolPaymentMethods(schoolId),
            getContributionsByDonor(user.id),
          ]);
          if (cancelled) return;
          setProject(p);
          setSchool(s);
          setMethods(m);
          setMyContribs(contribs.filter((c) => c.projectId === projectId));
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, schoolId, projectId]);

  if (!user || !loaded) {
    return <p className="text-sm text-muted">Cargando…</p>;
  }
  if (!project || !school) {
    return (
      <main className="max-w-xl">
        <p className="text-sm text-muted">Proyecto no encontrado.</p>
        <p className="mt-4 text-sm">
          <Link href="/panel" className="underline">
            ← Volver al panel
          </Link>
        </p>
      </main>
    );
  }

  const verified = school.verificationStatus === "verified";
  const isActive = project.status === "active";
  const canFund = verified && isActive;

  /** Picking a stage prefills the value with its full cost (editable for fractions). */
  const onSelectStage = (val: string) => {
    if (val === "") {
      setStageIndex("");
      return;
    }
    const idx = Number(val);
    setStageIndex(idx);
    setAmount(project?.stages[idx]?.cost ?? 0);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canFund || amount <= 0) return;
    if (type === "in_kind" && !description.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Create the recognition profile (private by default) so the Cloud Function has a
      // doc to bump `projectsSupported` the moment the school confirms.
      await ensureDonorProfile(user.id, user.name);
      const stageTitle =
        stageIndex === "" ? undefined : project.stages[stageIndex]?.title;
      const newId = await createContribution({
        schoolId,
        schoolName: school.name,
        projectId,
        projectTitle: project.title,
        currency: project.currency,
        donorId: user.id,
        donorName: user.name,
        type,
        amount,
        ...(type === "in_kind" ? { description: description.trim() } : {}),
        ...(stageIndex === "" ? {} : { stageIndex }),
        ...(stageTitle ? { stageTitle } : {}),
      });
      if (proofFile) await uploadContributionProof(newId, proofFile);
      setProofFile(null);
      setAmount(0);
      setDescription("");
      setStageIndex("");
      setDone(true);
      await reloadContribs();
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo registrar el aporte."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="max-w-xl">
      <h1 className="text-2xl font-bold">Financiar un proyecto</h1>
      <p className="mt-1 text-sm text-muted">
        <Link href={`/school/${schoolId}/project/${projectId}`} className="underline">
          {project.title}
        </Link>{" "}
        · {school.name}
      </p>

      <div className="mt-4 rounded-lg border p-3">
        <ProjectProgress
          raised={project.raised}
          goal={projectGoal(project.stages)}
          currency={project.currency}
          contributorsCount={project.contributorsCount}
          compact
        />
      </div>

      {!isActive ? (
        <p className="mt-6 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Este proyecto ya no recibe aportes.
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          onInvalidCapture={spanishRequiredMessage}
          onInputCapture={clearValidationMessage}
          className="mt-6 flex flex-col gap-4"
        >
          {/* Money vs in-kind: one flow, two shapes. In-kind credits an assessed value
              (the cost of the stage it covers) toward the same progress bar. */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("money")}
              className={`btn flex-1 justify-center ${
                type === "money" ? "btn-primary" : "btn-outline"
              }`}
            >
              Aporte en dinero
            </button>
            <button
              type="button"
              onClick={() => setType("in_kind")}
              className={`btn flex-1 justify-center ${
                type === "in_kind" ? "btn-primary" : "btn-outline"
              }`}
            >
              Donación en especie
            </button>
          </div>

          {type === "money" ? (
            <div className="rounded-md bg-surface p-3 text-sm">
              <PaymentMethodsInfo
                methods={methods}
                unverifiedText="Esta escuela aún no está verificada, así que todavía no podés financiar este proyecto. Vas a poder hacerlo en cuanto el equipo la verifique."
              />
            </div>
          ) : (
            <div className="rounded-md bg-surface p-3 text-sm">
              {canFund ? (
                <p className="text-muted">
                  Donás bienes o trabajo en vez de dinero (por ejemplo, “los
                  trabajos previos” o “el tanque”). La escuela coordina y valida
                  la entrega; su valor estimado suma al avance del proyecto igual
                  que un aporte en dinero.
                </p>
              ) : (
                <p className="text-amber-800">
                  Esta escuela aún no está verificada, así que todavía no podés
                  aportar a este proyecto. Vas a poder hacerlo en cuanto el equipo
                  la verifique.
                </p>
              )}
            </div>
          )}

          {type === "in_kind" && (
            <>
              <Field label="¿Qué donás?">
                <textarea
                  rows={2}
                  required
                  disabled={!canFund}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input"
                  placeholder="Ej.: Los trabajos previos: limpieza y nivelación del terreno."
                />
              </Field>
              {project.stages.length > 0 && (
                <Field label="¿Cubre una etapa? (opcional)">
                  <select
                    disabled={!canFund}
                    value={stageIndex === "" ? "" : String(stageIndex)}
                    onChange={(e) => onSelectStage(e.target.value)}
                    className="input"
                  >
                    <option value="">No corresponde a una etapa puntual</option>
                    {project.stages.map((s, i) => (
                      <option key={i} value={i}>
                        Etapa {i + 1}: {s.title} (
                        {formatMoney(s.cost, project.currency)})
                      </option>
                    ))}
                  </select>
                  <span className="text-muted">
                    Al elegir una etapa, el valor se completa con su costo.
                    Ajustalo si donás solo una parte.
                  </span>
                </Field>
              )}
            </>
          )}

          <Field
            label={
              type === "money"
                ? `Monto del aporte (${project.currency})`
                : `Valor estimado (${project.currency})`
            }
          >
            <input
              type="number"
              min={1}
              required
              disabled={!canFund}
              value={amount || ""}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              className="input"
            />
            {amount > 0 && (
              <span className="text-muted">
                {formatMoney(amount, project.currency)}
              </span>
            )}
          </Field>

          <Field
            label={
              type === "money"
                ? "Comprobante de pago (opcional)"
                : "Foto o acuerdo (opcional)"
            }
          >
            <input
              type="file"
              accept="image/*,application/pdf"
              disabled={!canFund}
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <span className="text-muted">
              Solo lo ven la escuela y vos. No se publica.
            </span>
          </Field>

          <FormError message={error} />
          {done && (
            <p className="text-sm text-green-700">
              ¡Aporte registrado! La escuela lo confirmará y el avance se
              actualizará.
            </p>
          )}

          <button
            type="submit"
            disabled={
              saving ||
              !canFund ||
              amount <= 0 ||
              (type === "in_kind" && !description.trim())
            }
            className="btn btn-primary"
          >
            {saving
              ? "Registrando…"
              : type === "money"
                ? "Registrar aporte"
                : "Registrar donación en especie"}
          </button>
        </form>
      )}

      {myContribs.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Tus aportes a este proyecto</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {myContribs.map((c) => (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.type === "in_kind" ? "Donación en especie" : "Aporte en dinero"}{" "}
                    · {formatMoney(c.amount, c.currency)}
                  </p>
                  {c.type === "in_kind" && c.description && (
                    <p className="text-xs text-muted">{c.description}</p>
                  )}
                  <p className="text-xs text-muted">
                    {c.proofUploaded ? "Comprobante ✓" : "Sin comprobante"}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${
                    c.status === "confirmed"
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {c.status === "confirmed" ? "Confirmado" : "Pendiente"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-sm">
        <Link href="/panel" className="underline">
          ← Volver al panel
        </Link>
      </p>
    </main>
  );
}
