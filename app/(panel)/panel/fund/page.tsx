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
import { BackLink } from "@/components/ui/BackLink";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { RecognitionToggle } from "@/components/donors/RecognitionToggle";
import { PaymentMethodsInfo } from "@/components/school/PaymentMethodsInfo";
import { UNVERIFIED_FUNDING_TEXT } from "@/components/school/UnverifiedSchoolNotice";
import { ProjectContributionItem } from "@/components/projects/ProjectContributionItem";
import { ProjectProgress } from "@/components/projects/ProjectProgress";
import { cardClass } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormError } from "@/components/ui/FormError";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import {
  averageConfirmationTimeMs,
  canFundProject,
  createContribution,
  ensureDonorProfile,
  getContributionsByDonorForProject,
  getProjectById,
  getSchoolById,
  getSubscriptionsBySchool,
  getVerifiedSchoolPaymentMethods,
  projectGoal,
  uploadContributionProof,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import { CONTRIBUTION_DESCRIPTION_MAX, PROJECT_STAGE_COST_MAX } from "@/types";
import type {
  PaymentMethod,
  ProjectContributionDoc,
  ProjectDoc,
  SchoolDoc,
} from "@/types";

/** Lifecycle of the initial project + school + payment-methods + contributions fetch. */
type LoadState = "loading" | "error" | "loaded";

export default function FundPage() {
  // useSearchParams needs a Suspense boundary to keep the route statically renderable.
  return (
    <Suspense fallback={<FundSkeleton />}>
      <FundContent />
    </Suspense>
  );
}

/**
 * Loading shell. Renders the SAME static title the loaded page does, so navigating here
 * paints the heading instantly in its final position and only the form below fades in — no
 * blank flash ("parpadeo") during the Firestore reads. Used by BOTH the Suspense fallback
 * and the in-component `loading` state so the two are identical.
 */
function FundSkeleton() {
  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Financiar un proyecto
      </h1>
      <div className="mt-1 h-4 w-56 animate-pulse rounded bg-surface" aria-hidden="true" />
      <div className="mt-6 space-y-3" aria-hidden="true">
        <div className="h-20 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <div className="h-10 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
        <div className="h-28 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5" />
      </div>
      <p className="sr-only" role="status">
        Cargando…
      </p>
    </main>
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
  // Average first-confirmation time of the school; null until known. Same reassurance the
  // donate/subscribe flows show right before committing money ("will anyone confirm this?").
  const [confirmMs, setConfirmMs] = useState<number | null>(null);
  const [myContribs, setMyContribs] = useState<ProjectContributionDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  // Bumping this re-runs the initial load (the "Reintentar" button after a fetch error).
  const [reloadKey, setReloadKey] = useState(0);

  const [type, setType] = useState<"money" | "in_kind">("money");
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState("");
  // "" = not tied to a stage; otherwise the stage index.
  const [stageIndex, setStageIndex] = useState<number | "">("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  // Error of a per-row proof upload — shown next to the list, not in the form's FormError.
  const [listError, setListError] = useState<string | null>(null);

  const reloadContribs = useCallback(() => {
    if (!user) return Promise.resolve();
    return getContributionsByDonorForProject(user.id, projectId).then(
      setMyContribs,
    );
  }, [user, projectId]);

  useEffect(() => {
    if (!user) return;
    // Drop a stale result if the account switches (or the component unmounts) before the
    // reads resolve, so the previous user's contributions never flash into the new session.
    let cancelled = false;
    // Route every state write through a promise (even the missing-params case) so setState
    // never runs synchronously in the effect body. The school's confirmation responsiveness
    // comes from its subscriptions, like the donate/subscribe flows.
    const work =
      schoolId && projectId
        ? Promise.all([
            getProjectById(schoolId, projectId),
            getSchoolById(schoolId),
            getVerifiedSchoolPaymentMethods(schoolId),
            getContributionsByDonorForProject(user.id, projectId),
            getSubscriptionsBySchool(schoolId).then(averageConfirmationTimeMs),
          ])
        : Promise.resolve(null);
    work
      .then((res) => {
        if (cancelled) return;
        if (res) {
          const [p, s, m, contribs, confirm] = res;
          setProject(p);
          setSchool(s);
          setMethods(m);
          setMyContribs(contribs);
          setConfirmMs(confirm);
        } else {
          setProject(null);
        }
        setLoadState("loaded");
      })
      .catch(() => {
        // A fetch failure must read as a recoverable error, not "Proyecto no encontrado".
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [user, schoolId, projectId, reloadKey]);

  if (!user || loadState === "loading") {
    return <FundSkeleton />;
  }

  if (loadState === "error") {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Financiar un proyecto
        </h1>
        <p role="alert" className="mt-4 text-sm text-error">
          No pudimos cargar los datos. Revisa tu conexión e intenta de nuevo.
        </p>
        <button
          type="button"
          onClick={() => {
            setLoadState("loading");
            setReloadKey((k) => k + 1);
          }}
          className="btn btn-outline mt-3"
        >
          Reintentar
        </button>
      </main>
    );
  }

  if (!project || !school) {
    return (
      <main>
        <p className="text-sm text-muted">Proyecto no encontrado.</p>
        <p className="mt-4 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const isActive = project.status === "active";
  const canFund = canFundProject(school, project);

  /** Switching type clears any stage tie-in (kept visible for both shapes, but a stage chosen
   *  for one semantic shouldn't silently ride along into the other) and the success banner. */
  const onSelectType = (next: "money" | "in_kind") => {
    setType(next);
    setStageIndex("");
    setDone(false);
  };

  /** Picking a stage prefills the value with its full cost (editable for fractions). */
  const onSelectStage = (val: string) => {
    setDone(false);
    if (val === "") {
      setStageIndex("");
      return;
    }
    const idx = Number(val);
    setStageIndex(idx);
    setAmount(project.stages[idx]?.cost ?? 0);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canFund || amount <= 0) return;
    if (type === "in_kind" && !description.trim()) return;
    setSaving(true);
    setError(null);
    setDone(false);

    // Phase 1 — record the contribution. A failure here means nothing was created, so it's
    // the only failure that invalidates the whole action.
    let newId: string;
    try {
      // Create the recognition profile (private by default) so the Cloud Function has a
      // doc to bump `projectsSupported` the moment the school confirms.
      await ensureDonorProfile(user.id, user.name);
      const stageTitle =
        stageIndex === "" ? undefined : project.stages[stageIndex]?.title;
      newId = await createContribution({
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
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo registrar el aporte."));
      setSaving(false);
      return;
    }

    // Phase 2 — the contribution now exists (pending). The optional proof upload is
    // best-effort: a failure must NOT claim the contribution failed (that led to duplicates
    // on retry). Surface a proof-specific note instead and keep the recorded contribution;
    // the pending row's "Subir comprobante" recovers it.
    const file = proofFile;
    setProofFile(null);
    setAmount(0);
    setDescription("");
    setStageIndex("");
    try {
      if (file) await uploadContributionProof(newId, file);
      setDone(true);
    } catch (err) {
      setError(
        userErrorMessage(
          err,
          "El aporte se registró, pero no se pudo subir el comprobante. Puedes subirlo desde la lista.",
        ),
      );
    }
    await reloadContribs();
    setSaving(false);
  };

  const onUploadProof = async (contribId: string, file: File) => {
    setUploadingId(contribId);
    setListError(null);
    try {
      await uploadContributionProof(contribId, file);
      await reloadContribs();
    } catch (err) {
      setListError(userErrorMessage(err, "No se pudo subir el comprobante."));
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Financiar un proyecto
      </h1>
      <p className="mt-1 text-sm text-muted">
        <Link
          href={`/school/${schoolId}/project/${projectId}`}
          className="font-medium text-brand-darker transition-colors hover:text-brand-darkest"
        >
          {project.title}
        </Link>{" "}
        · {school.name}
      </p>

      {/* Live project progress on a soft inset panel. */}
      <div className={`mt-6 ${cardClass("inset")}`}>
        <ProjectProgress
          raised={project.raised}
          goal={projectGoal(project.stages)}
          currency={project.currency}
          contributorsCount={project.contributorsCount}
          compact
        />
      </div>

      {!isActive ? (
        <p className="mt-6 rounded-xl bg-warning-tint p-3 text-sm text-warning ring-1 ring-warning/10">
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
              (the cost of the stage it covers) toward the same progress bar. A radiogroup so
              the chosen shape is exposed to assistive tech, not conveyed by color alone. */}
          <div role="radiogroup" aria-label="Tipo de aporte" className="flex gap-2">
            <button
              type="button"
              role="radio"
              aria-checked={type === "money"}
              disabled={!canFund}
              onClick={() => onSelectType("money")}
              className={`btn flex-1 justify-center ${
                type === "money" ? "btn-primary" : "btn-outline"
              }`}
            >
              Aporte en dinero
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === "in_kind"}
              disabled={!canFund}
              onClick={() => onSelectType("in_kind")}
              className={`btn flex-1 justify-center ${
                type === "in_kind" ? "btn-primary" : "btn-outline"
              }`}
            >
              Donación en especie
            </button>
          </div>

          {type === "money" ? (
            <div className={`text-sm ${cardClass("inset")}`}>
              <PaymentMethodsInfo
                methods={methods}
                confirmationTimeMs={confirmMs}
                unverifiedText={UNVERIFIED_FUNDING_TEXT}
              />
            </div>
          ) : (
            <div className={`text-sm ${cardClass("inset")}`}>
              {canFund ? (
                <p className="text-muted">
                  Donas bienes o trabajo en vez de dinero (por ejemplo, “los
                  trabajos previos” o “el tanque”). La escuela coordina y valida
                  la entrega; su valor estimado suma al avance del proyecto igual
                  que un aporte en dinero.
                </p>
              ) : (
                <p className="text-warning">{UNVERIFIED_FUNDING_TEXT}</p>
              )}
            </div>
          )}

          {type === "in_kind" && (
            <Field label="¿Qué donas?">
              <textarea
                rows={2}
                required
                disabled={!canFund}
                maxLength={CONTRIBUTION_DESCRIPTION_MAX}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setDone(false);
                }}
                className="input"
                placeholder="Ej.: Los trabajos previos: limpieza y nivelación del terreno."
              />
            </Field>
          )}

          {/* Optional stage earmark — available for money and in-kind alike (the model ties
              either to a stage); it labels the aporte for the board and prefills the value. */}
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
                Al elegir una etapa, el valor se completa con su costo. Ajústalo
                si aportas solo una parte.
              </span>
            </Field>
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
              max={PROJECT_STAGE_COST_MAX}
              required
              disabled={!canFund}
              value={amount || ""}
              // Upper clamp on change so a typo (an extra zero) can't register an absurd
              // amount; mirrors the cap StageFields puts on stage cost.
              onChange={(e) => {
                setAmount(
                  Math.min(PROJECT_STAGE_COST_MAX, Math.max(0, Number(e.target.value) || 0)),
                );
                setDone(false);
              }}
              className="input"
            />
            {amount > 0 && (
              <span className="text-muted">
                {formatMoney(amount, project.currency)}
              </span>
            )}
          </Field>

          <FilePicker
            label={
              type === "money"
                ? "Comprobante de pago (opcional)"
                : "Foto o acuerdo (opcional)"
            }
            hint="No se publica en tu perfil ni en el catálogo; la escuela lo usa para confirmar tu aporte."
            value={proofFile}
            onChange={setProofFile}
            disabled={!canFund}
          />

          {/* Account-wide recognition preference (not per-contribution): autosaves on toggle;
              the display name is edited inline (no jump to settings that would discard the form). */}
          <RecognitionToggle compact />

          <FormError message={error} />
          {done && (
            <p
              role="status"
              className="rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10"
            >
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
              uploadingId !== null ||
              (type === "in_kind" && !description.trim())
            }
            aria-busy={saving}
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

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Tus aportes a este proyecto
        </h2>
        {listError && (
          <p role="alert" className="mt-2 text-sm text-error">
            {listError}
          </p>
        )}
        {myContribs.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Todavía no aportaste a este proyecto.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {myContribs.map((c) => (
              <ProjectContributionItem
                key={c.id}
                contribution={c}
                donorName={user.name}
                boardContact={school.boardContact}
                uploadingId={uploadingId}
                onUploadProof={onUploadProof}
              />
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
