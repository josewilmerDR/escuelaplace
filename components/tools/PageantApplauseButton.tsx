"use client";

/**
 * The free "simpatía" applause for one pageant candidate — the accountless visitor's COMMUNITY vote.
 * Calls castPageantApplause (App Check-gated) and remembers the choice in localStorage so the button
 * reflects "ya aplaudiste" across visits without a server read. One vote per device per pageant: once
 * this device has applauded anyone here, the button locks (a re-tap is a server-side no-op anyway).
 *
 * PURELY a community signal — never money, never binding: voteFree is a capped, NON-BINDING axis of
 * the SUGGESTED standings; the school still crowns by hand. Rendered only when the school turned free
 * voting on (freeVotingEnabled). Until App Check is configured the call reports "unavailable" and the
 * button says so, so the feature degrades quietly instead of lying about a count.
 */
import { useState } from "react";
import {
  applaudedCandidateId,
  recordPageantApplause,
  useBuyerPreferences,
} from "@/lib/buyer/preferences";
import { castPageantApplause } from "@/lib/pageant-applause";

export function PageantApplauseButton({
  schoolId,
  toolId,
  candidateId,
  candidateName,
}: {
  schoolId: string;
  toolId: string;
  candidateId: string;
  candidateName: string;
}) {
  const { prefs, ready } = useBuyerPreferences();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Local vote memory: who this device applauded in THIS pageant (undefined until localStorage reads).
  const myVote = ready ? applaudedCandidateId(prefs, toolId) : undefined;
  const votedThis = myVote === candidateId;
  const votedOther = myVote != null && myVote !== candidateId;

  const applaud = async () => {
    setBusy(true);
    setNote(null);
    const result = await castPageantApplause({ schoolId, toolId, candidateId });
    if (result === "ok" || result === "duplicate") {
      recordPageantApplause(toolId, candidateId); // the re-render reflects "aplaudiste"
    } else if (result === "unavailable") {
      setNote("El voto libre aún no está disponible.");
    } else {
      setNote("No se pudo registrar. Intenta de nuevo.");
    }
    setBusy(false);
  };

  if (votedThis) {
    return (
      <p className="self-start text-sm font-medium text-brand-darker" role="status">
        ¡Gracias! Aplaudiste a {candidateName}.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={applaud}
        disabled={busy || votedOther || !ready}
        // Snug shared width, kept in sync with the "Apoyar" button so both CTAs match.
        className="btn btn-outline w-24 self-start"
      >
        {busy ? "Enviando…" : "Aplaudir"}
      </button>
      {votedOther && (
        <p className="text-xs text-muted">Ya usaste tu aplauso en este reinado.</p>
      )}
      {note && (
        <p className="text-xs text-muted" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
