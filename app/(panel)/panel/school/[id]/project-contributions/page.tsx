"use client";

/**
 * Project contribution confirmation queue (/panel/school/[id]/project-contributions).
 *
 * Mirrors the subscription queue: the board reviews pending contributions to its projects
 * and confirms the ones whose payment proof matches what it received. Confirming a
 * contribution fires a Cloud Function that advances the project's progress bar. The board
 * can confirm one at a time or all pending at once.
 */
import { useCallback, useEffect, useState } from "react";
import { BackLink } from "@/components/ui/BackLink";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  confirmContribution,
  getContributionProofUrl,
  getContributionsBySchool,
  getSchoolById,
} from "@/lib/firestore";
import { formatMoney } from "@/lib/format";
import type { ProjectContributionDoc, SchoolDoc } from "@/types";

export default function ProjectContributionsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [school, setSchool] = useState<SchoolDoc | null>(null);
  const [contribs, setContribs] = useState<ProjectContributionDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () => getContributionsBySchool(id).then(setContribs),
    [id],
  );

  useEffect(() => {
    Promise.all([getSchoolById(id), getContributionsBySchool(id)])
      .then(([s, c]) => {
        setSchool(s);
        setContribs(c);
      })
      .finally(() => setLoaded(true));
  }, [id]);

  if (!loaded) return <p className="text-sm text-muted">Cargando…</p>;
  if (!school)
    return <p className="text-sm text-muted">Escuela no encontrada.</p>;

  const isManager =
    user != null &&
    (school.ownerId === user.id ||
      school.editorIds?.includes(user.id) ||
      user.role === "admin");
  if (!isManager) {
    return <p className="text-sm text-red-600">No administrás esta escuela.</p>;
  }

  const pending = contribs.filter((c) => c.status === "pending");
  const others = contribs.filter((c) => c.status !== "pending");

  const confirmOne = async (cid: string) => {
    if (!user) return;
    setBusyId(cid);
    setError(null);
    try {
      await confirmContribution(cid, user.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmAll = async () => {
    if (!user || pending.length === 0) return;
    setBusyId("all");
    setError(null);
    try {
      await Promise.all(pending.map((c) => confirmContribution(c.id, user.id)));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron confirmar.");
    } finally {
      setBusyId(null);
    }
  };

  const viewProof = async (cid: string) => {
    setError(null);
    const url = await getContributionProofUrl(cid);
    if (url) window.open(url, "_blank", "noopener");
    else setError("No se pudo abrir el comprobante.");
  };

  return (
    <main className="max-w-2xl">
      <h1 className="text-2xl font-bold">Confirmar aportes a proyectos</h1>
      <p className="mt-1 text-sm text-muted">{school.name}</p>

      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pendientes ({pending.length})</h2>
          {pending.length > 0 && (
            <button
              type="button"
              onClick={confirmAll}
              disabled={busyId !== null}
              className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {busyId === "all" ? "Confirmando…" : "Confirmar todos"}
            </button>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {pending.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No hay aportes pendientes.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {pending.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.donorName}
                    {c.type === "in_kind" && (
                      <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-normal text-brand-darker">
                        En especie
                      </span>
                    )}
                  </p>
                  <p className="text-muted">
                    {c.projectTitle} ·{" "}
                    {c.type === "in_kind" ? "valor estimado " : ""}
                    {formatMoney(c.amount, c.currency)}
                  </p>
                  {c.type === "in_kind" && (
                    <p className="text-xs text-amber-800">
                      {c.stageTitle ? `Cubre: ${c.stageTitle}. ` : ""}
                      {c.description}
                    </p>
                  )}
                  {c.proofUploaded ? (
                    <button
                      type="button"
                      onClick={() => viewProof(c.id)}
                      className="mt-1 text-xs font-medium text-brand-darker hover:underline"
                    >
                      Ver {c.type === "in_kind" ? "evidencia" : "comprobante"}
                    </button>
                  ) : (
                    <span className="mt-1 block text-xs text-muted">
                      Sin {c.type === "in_kind" ? "evidencia" : "comprobante"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => confirmOne(c.id)}
                  disabled={busyId !== null}
                  className="btn btn-outline shrink-0"
                >
                  {busyId === c.id ? "Confirmando…" : "Confirmar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {others.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Historial</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {others.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.donorName}
                    {c.type === "in_kind" && (
                      <span className="ml-2 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-normal text-brand-darker">
                        En especie
                      </span>
                    )}
                  </p>
                  <p className="text-muted">
                    {c.projectTitle} · {formatMoney(c.amount, c.currency)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-800">
                  Confirmado
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 text-sm">
        <BackLink href="/panel">Volver al panel</BackLink>
      </p>
    </main>
  );
}
