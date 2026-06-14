"use client";

/**
 * One row in a supporter's own list of supports (a business subscription or a personal
 * donation — same `subscriptions/{id}` shape). Renders the school, the units/amount, the
 * proof badge, and — only while still `pending` — a quiet, accessible control to attach or
 * replace the payment proof plus a nudge to the school. Shared so the donate / subscribe
 * flows stay in sync; subscribe consumes it today.
 *
 * The proof upload is an accessible label (FilePicker markup: ≥40px tap target, focus ring,
 * aria-label on the hidden input), de-emphasized so it never competes with the status badge.
 * It is offered ONLY on pending rows — once confirmed/expired there is nothing to re-attach.
 * The platform never touches the money; the proof goes to private Storage and the SCHOOL
 * confirms it.
 */
import { CheckIcon, PaperClipIcon } from "@/components/ui/icons";
import { PendingAge } from "@/components/subscriptions/PendingAge";
import { RemindSchoolButton } from "@/components/subscriptions/RemindSchoolButton";
import { SubscriptionStatusBadge } from "@/components/subscriptions/SubscriptionStatusBadge";
import { formatColones } from "@/lib/format";
import type { BoardContact, SubscriptionDoc } from "@/types";

/** Same image/PDF allow-list FilePicker defaults to, named so it isn't a loose literal. */
const PROOF_ACCEPT = "image/*,application/pdf";

export function SupporterContributionItem({
  subscription: s,
  supporterName,
  boardContact,
  uploadingId,
  uploadError,
  onUploadProof,
}: {
  subscription: SubscriptionDoc;
  supporterName: string;
  boardContact: BoardContact | undefined;
  uploadingId: string | null;
  /** Inline error for this row's upload (rendered next to the control, not in the form). */
  uploadError?: string | null;
  onUploadProof: (subId: string, file: File) => void;
}) {
  const isPending = s.status === "pending";
  const isUploading = uploadingId === s.id;

  return (
    <li className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 text-sm ring-1 ring-black/5">
      <div>
        <p className="font-semibold tracking-tight text-foreground">{s.schoolName}</p>
        <p className="text-muted">
          {s.units}× · {formatColones(s.amount)} ·{" "}
          {s.proofUploaded ? (
            <span className="inline-flex items-center gap-1 text-success">
              <CheckIcon className="h-3.5 w-3.5" />
              Comprobante
            </span>
          ) : (
            "Sin comprobante"
          )}
        </p>
        {/* Waiting on the school: show how long, and offer a nudge through the
            school's own channel. The platform never confirms the money. */}
        {isPending && (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <PendingAge since={s.createdAt} />
            <RemindSchoolButton
              boardContact={boardContact}
              supporterName={supporterName}
              schoolName={s.schoolName}
            />
          </div>
        )}
        {/* Quiet, accessible proof upload — pending rows only (nothing to re-attach once
            settled). Kept under the info block so it never competes with the status badge. */}
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
                : s.proofUploaded
                  ? "Reemplazar comprobante"
                  : "Subir comprobante"}
              <input
                type="file"
                accept={PROOF_ACCEPT}
                className="sr-only"
                aria-label={
                  s.proofUploaded
                    ? "Reemplazar comprobante de pago"
                    : "Subir comprobante de pago"
                }
                disabled={uploadingId !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadProof(s.id, f);
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
      <SubscriptionStatusBadge status={s.status} />
    </li>
  );
}
