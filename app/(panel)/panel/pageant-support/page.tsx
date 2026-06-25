"use client";

/**
 * Pageant support flow (/panel/pageant-support?schoolId=&toolId=&candidateId=).
 *
 * Any signed-in user records ECONOMIC support ("apoyo") for one candidate of a reinado: it shows the
 * candidate, the school's published payment methods (only when verified — same gate as donations), a
 * number of support units, and an optional payment proof. Same lifecycle as a donation: the platform
 * never touches the money — the supporter pays the school directly and the SCHOOL confirms the proof;
 * a Cloud Function then advances the candidate's voteSupport tally. Mirrors /panel/fund.
 */
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PaymentMethodsInfo } from "@/components/school/PaymentMethodsInfo";
import { UNVERIFIED_FUNDING_TEXT } from "@/components/school/UnverifiedSchoolNotice";
import { BackLink } from "@/components/ui/BackLink";
import { cardClass } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { FilePicker } from "@/components/ui/FilePicker";
import { FormError } from "@/components/ui/FormError";
import { userErrorMessage } from "@/lib/errors";
import { clearValidationMessage, spanishRequiredMessage } from "@/lib/forms";
import {
  createPageantVote,
  getCandidates,
  getPageantVotesByTool,
  getSchoolById,
  getToolById,
  getVerifiedSchoolPaymentMethods,
  toolConfigOf,
  uploadPageantVoteProof,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import {
  PAGEANT_SUPPORT_UNITS_MAX,
  type CandidateDoc,
  type PageantConfig,
  type PageantVoteDoc,
  type PaymentMethod,
  type SchoolDoc,
} from "@/types";

type LoadState = "loading" | "error" | "loaded";

export default function PageantSupportPage() {
  // useSearchParams needs a Suspense boundary to keep the route statically renderable.
  return (
    <Suspense fallback={<SupportSkeleton />}>
      <SupportContent />
    </Suspense>
  );
}

function SupportSkeleton() {
  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Apoyar a una candidatura
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

function SupportContent() {
  const { user } = useAuth();
  const params = useSearchParams();
  const schoolId = params.get("schoolId") ?? "";
  const toolId = params.get("toolId") ?? "";
  const candidateId = params.get("candidateId") ?? "";

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [config, setConfig] = useState<PageantConfig | null>(null);
  const [toolTitle, setToolTitle] = useState("");
  const [candidate, setCandidate] = useState<CandidateDoc | null>(null);
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [myVotes, setMyVotes] = useState<PageantVoteDoc[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [reloadKey, setReloadKey] = useState(0);

  const [units, setUnits] = useState<number>(1);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reloadVotes = useCallback(() => {
    if (!user) return Promise.resolve();
    return getPageantVotesByTool(toolId).then((votes) =>
      setMyVotes(
        votes.filter(
          (v) => v.buyerId === user.id && v.candidateId === candidateId,
        ),
      ),
    );
  }, [user, toolId, candidateId]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const work =
      schoolId && toolId && candidateId
        ? Promise.all([
            getSchoolById(schoolId),
            getToolById(schoolId, toolId),
            getCandidates(schoolId, toolId),
            // Verified-school gate is the data layer's: returns null when the school isn't verified.
            getVerifiedSchoolPaymentMethods(schoolId),
            getPageantVotesByTool(toolId),
          ])
        : Promise.resolve(null);
    work
      .then((res) => {
        if (cancelled) return;
        if (res) {
          const [s, tool, candidates, m, votes] = res;
          setSchool(s);
          const cfg = toolConfigOf(tool, "pageant");
          setConfig(cfg);
          setToolTitle(tool?.title ?? "");
          setCandidate(candidates.find((c) => c.id === candidateId) ?? null);
          setMethods(m);
          setMyVotes(
            votes.filter(
              (v) => v.buyerId === user.id && v.candidateId === candidateId,
            ),
          );
        } else {
          setSchool(null);
        }
        setLoadState("loaded");
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [user, schoolId, toolId, candidateId, reloadKey]);

  if (!user || loadState === "loading") return <SupportSkeleton />;

  if (loadState === "error") {
    return (
      <main>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Apoyar a una candidatura
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

  if (!school || !config || !candidate) {
    return (
      <main>
        <p className="text-sm text-muted">Candidatura no encontrada.</p>
        <p className="mt-4 text-sm">
          <BackLink href="/panel">Volver al panel</BackLink>
        </p>
      </main>
    );
  }

  const canSupport = methods !== null; // verified-school gate (methods are null otherwise)
  const amount = units * config.pricePerSupportUnit;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSupport || units < 1) return;
    setSaving(true);
    setError(null);
    setDone(false);

    // Phase 1 — record the support order. A failure here means nothing was created.
    let newId: string;
    try {
      newId = await createPageantVote({
        schoolId,
        schoolName: school.name,
        toolId,
        toolTitle,
        candidateId,
        candidateName: candidate.name,
        buyerId: user.id,
        buyerName: user.name,
        units,
        amount,
        currency: config.currency,
      });
    } catch (err) {
      setError(userErrorMessage(err, "No se pudo registrar el apoyo."));
      setSaving(false);
      return;
    }

    // Phase 2 — the order exists (pending). The optional proof upload is best-effort: a failure
    // must NOT claim the support failed (that led to duplicates on retry). The pending row's
    // "Subir comprobante" recovers it.
    const file = proofFile;
    setProofFile(null);
    try {
      if (file) await uploadPageantVoteProof(newId, file);
      setDone(true);
    } catch (err) {
      setError(
        userErrorMessage(
          err,
          "El apoyo se registró, pero no se pudo subir el comprobante. Puedes subirlo desde la lista.",
        ),
      );
    }
    await reloadVotes();
    setSaving(false);
  };

  return (
    <main>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">
        Apoyar a una candidatura
      </h1>
      <p className="mt-1 text-sm text-muted">
        <Link
          href={`/school/${schoolId}/tool/${toolId}`}
          className="font-medium text-brand-darker transition-colors hover:text-brand-darkest"
        >
          {toolTitle}
        </Link>{" "}
        · {candidate.name} · {school.name}
      </p>

      <form
        onSubmit={onSubmit}
        onInvalidCapture={spanishRequiredMessage}
        onInputCapture={clearValidationMessage}
        className="mt-6 flex flex-col gap-4"
      >
        <div className={`text-sm ${cardClass("inset")}`}>
          <PaymentMethodsInfo
            methods={methods}
            confirmationTimeMs={null}
            unverifiedText={UNVERIFIED_FUNDING_TEXT}
          />
        </div>

        <Field label="Unidades de apoyo">
          <input
            type="number"
            min={1}
            max={PAGEANT_SUPPORT_UNITS_MAX}
            required
            disabled={!canSupport}
            value={units || ""}
            onChange={(e) =>
              setUnits(
                Math.min(
                  PAGEANT_SUPPORT_UNITS_MAX,
                  Math.max(1, Math.round(Number(e.target.value) || 1)),
                ),
              )
            }
            className="input"
          />
          <span className="text-muted">
            {formatMoney(config.pricePerSupportUnit, config.currency)} por unidad ·{" "}
            <span className="font-medium text-foreground">
              {formatMoney(amount, config.currency)}
            </span>{" "}
            en total. Le pagas directo a la escuela; ella confirma tu apoyo.
          </span>
        </Field>

        <FilePicker
          label="Comprobante de pago (opcional)"
          hint="No se publica en tu perfil ni en el catálogo; la escuela lo usa para confirmar tu apoyo."
          value={proofFile}
          onChange={setProofFile}
          disabled={!canSupport}
        />

        <FormError message={error} />
        {done && (
          <p
            role="status"
            className="rounded-xl bg-success-tint p-3 text-sm text-success ring-1 ring-success/10"
          >
            ¡Apoyo registrado! La escuela lo confirmará y el conteo de la candidatura se
            actualizará.
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !canSupport || units < 1}
          aria-busy={saving}
          className="btn btn-primary"
        >
          {saving ? "Registrando…" : "Registrar apoyo"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Tus apoyos a {candidate.name}
        </h2>
        {myVotes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Todavía no registraste un apoyo.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {myVotes.map((v) => (
              <li
                key={v.id}
                className={`${cardClass("inset")} flex items-center justify-between gap-3 text-sm`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {v.units} {v.units === 1 ? "unidad" : "unidades"} ·{" "}
                    {v.status === "confirmed" ? "Confirmado" : "Pendiente"}
                  </p>
                  <p className="text-xs text-muted">
                    {v.proofUploaded ? "Comprobante enviado" : "Sin comprobante"}
                  </p>
                </div>
                {v.status === "pending" && (
                  <SupportProofButton voteId={v.id} onUploaded={reloadVotes} />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 text-sm">
        <BackLink href={`/school/${schoolId}/tool/${toolId}`}>
          Volver al reinado
        </BackLink>
      </p>
    </main>
  );
}

/** Minimal per-row proof uploader: a hidden file input that uploads on selection. Lets a supporter
 * attach (or replace) the proof of a pending support order after creating it. */
function SupportProofButton({
  voteId,
  onUploaded,
}: {
  voteId: string;
  onUploaded: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await uploadPageantVoteProof(voteId, file);
      await onUploaded();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <label className="btn btn-outline shrink-0 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
      {busy ? "Subiendo…" : "Subir comprobante"}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={onFile}
      />
    </label>
  );
}
