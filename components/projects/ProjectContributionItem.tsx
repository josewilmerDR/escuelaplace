"use client";

/**
 * One row in a donor's own list of contributions to a project (`projectContributions/{id}`).
 * Renders the type + assessed/paid amount, the optional in-kind description, the proof badge
 * and the status pill, and — only while still `pending` — how long it has waited, a nudge to
 * the school, and an accessible control to attach or replace the payment proof.
 *
 * It mirrors SupporterContributionItem (the subscription/donation row) so the three support
 * flows read identically; the doc shape differs (a one-off contribution, status
 * 'pending'|'confirmed'), hence a sibling component rather than a shared one. The proof goes
 * to private Storage and the SCHOOL confirms it — the platform never touches the money.
 */
import { Badge } from "@/components/ui/Badge";
import { CheckIcon, PaperClipIcon } from "@/components/ui/icons";
import { PendingAge } from "@/components/subscriptions/PendingAge";
import { RemindSchoolButton } from "@/components/subscriptions/RemindSchoolButton";
import { formatMoney } from "@/lib/format";
import type { BoardContact, ProjectContributionDoc } from "@/types";

/** Same image/PDF allow-list FilePicker defaults to, named so it isn't a loose literal. */
const PROOF_ACCEPT = "image/*,application/pdf";

export function ProjectContributionItem({
  contribution: c,
  donorName,
  boardContact,
  uploadingId,
  uploadError,
  onUploadProof,
}: {
  contribution: ProjectContributionDoc;
  donorName: string;
  boardContact: BoardContact | undefined;
  uploadingId: string | null;
  /** Inline error for this row's upload (rendered next to the control, not in the form). */
  uploadError?: string | null;
  onUploadProof: (contributionId: string, file: File) => void;
}) {
  const isPending = c.status === "pending";
  const isUploading = uploadingId === c.id;

  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 text-sm ring-1 ring-black/5">
      <div className="min-w-0">
        <p className="font-semibold tracking-tight text-foreground">
          {c.type === "in_kind" ? "Donación en especie" : "Aporte en dinero"} ·{" "}
          {formatMoney(c.amount, c.currency)}
        </p>
        {c.type === "in_kind" && c.description && (
          <p className="break-words text-xs text-muted">{c.description}</p>
        )}
        <p className="text-xs text-muted">
          {c.proofUploaded ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckIcon className="h-3.5 w-3.5" />
              Comprobante
            </span>
          ) : (
            "Sin comprobante"
          )}
        </p>
        {/* Waiting on the school: show how long, and offer a nudge through the school's own
            channel. The platform never confirms the money. */}
        {isPending && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <PendingAge since={c.createdAt} />
            <RemindSchoolButton
              boardContact={boardContact}
              supporterName={donorName}
              schoolName={c.schoolName}
            />
          </div>
        )}
        {/* Quiet, accessible proof upload — pending rows only (nothing to re-attach once
            settled). Kept under the info block so it never competes with the status badge.
            This is the recovery path when the inline upload at registration time failed. */}
        {isPending && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <label
              className={`btn btn-outline min-h-10 text-muted hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand ${
                uploadingId !== null ? "pointer-events-none opacity-50" : "cursor-pointer"
              }`}
              aria-disabled={uploadingId !== null}
            >
              <PaperClipIcon className="mr-1.5 h-4 w-4" />
              {isUploading
                ? "Subiendo…"
                : c.proofUploaded
                  ? "Reemplazar comprobante"
                  : "Subir comprobante"}
              <input
                type="file"
                accept={PROOF_ACCEPT}
                className="sr-only"
                aria-label={
                  c.proofUploaded
                    ? "Reemplazar comprobante de pago"
                    : "Subir comprobante de pago"
                }
                disabled={uploadingId !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadProof(c.id, f);
                }}
              />
            </label>
            {uploadError && (
              <span role="alert" className="text-xs text-error">
                {uploadError}
              </span>
            )}
          </div>
        )}
      </div>
      <Badge tone={c.status === "confirmed" ? "success" : "warning"}>
        {c.status === "confirmed" ? "Confirmado" : "Pendiente"}
      </Badge>
    </li>
  );
}
