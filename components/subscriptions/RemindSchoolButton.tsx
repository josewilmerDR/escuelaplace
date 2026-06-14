"use client";

/**
 * "Recordar a la escuela": lets a supporter nudge a still-pending confirmation through the
 * channel the school itself published (WhatsApp preferred, e-mail otherwise) — capa 1 of
 * dispute handling. Deliberately NOT a platform action: escuelaplace never confirms the
 * money, it only opens the supporter's own message to the board. No infra (no e-mail
 * sending); falls back to a muted hint when the school published no reachable contact.
 */
import {
  buildMailtoLink,
  buildWhatsAppLink,
  confirmationReminderMessage,
} from "@/lib/contact";
import type { BoardContact } from "@/types";

export function RemindSchoolButton({
  boardContact,
  supporterName,
  schoolName,
}: {
  boardContact: BoardContact | undefined;
  supporterName: string;
  schoolName: string;
}) {
  // Plain derivation — the React Compiler memoizes it; a manual useMemo here only fights
  // the compiler's inferred dependencies.
  const message = confirmationReminderMessage(supporterName, schoolName);
  const href =
    (boardContact?.phone && buildWhatsAppLink(boardContact.phone, message)) ||
    (boardContact?.email &&
      buildMailtoLink(
        boardContact.email,
        "Aporte pendiente de confirmar — escuelaplace",
        message,
      )) ||
    null;

  if (!href) {
    return (
      <span className="text-xs text-muted">
        La escuela no publicó un contacto.
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-medium text-brand-darker hover:underline"
    >
      Recordar a la escuela
    </a>
  );
}
