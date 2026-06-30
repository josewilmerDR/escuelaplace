"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { useAuth } from "@/components/auth/AuthProvider";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormError } from "@/components/ui/FormError";
import { deleteAccount, exportMyData } from "@/lib/firestore";
import { reauthenticateWithGoogle, signOutUser } from "@/lib/auth";
import { callableErrorMessage, userErrorMessage } from "@/lib/errors";

const CONFIRM_WORD = "ELIMINAR";

/**
 * "Tus datos y privacidad": the account-level ARCO surface (Ley 8968). Lives in Configuración
 * because it's account-wide, not tied to one page or donation.
 *  - Descargar mis datos (access): pulls the full export bundle and saves it as JSON.
 *  - Eliminar mi cuenta (cancelation): re-proves identity, then runs the deleteAccount cascade and
 *    signs out. Irreversible — gated behind a typed confirmation.
 */
export function DataPrivacySection() {
  const router = useRouter();
  const { user } = useAuth();
  // Only pages the user OWNS get transferred/deleted on account deletion; editor-only pages are just
  // resigned. Count owners so the warning copy matches what the cascade actually does.
  const ownedPages = (user?.managedPages ?? []).filter((p) => p.role === "owner").length;

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      const data = await exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "escuelaplace-mis-datos.json";
      // Append before clicking (some browsers ignore .click() on a detached anchor) and defer the
      // revoke so the browser has started reading the blob before the URL is invalidated.
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      setExportError(callableErrorMessage(err, "No se pudieron preparar tus datos. Intenta de nuevo."));
    } finally {
      setExporting(false);
    }
  }

  async function onDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      // Fresh credentials first — proves it's really the account holder before an irreversible act.
      await reauthenticateWithGoogle();
      await deleteAccount();
      // The Auth account is gone; clear local session and leave the panel.
      await signOutUser().catch(() => {});
      router.replace("/");
      router.refresh();
    } catch (err) {
      // The user dismissed the Google re-auth popup — nothing was deleted, so don't claim it failed.
      if (
        err instanceof FirebaseError &&
        (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request")
      ) {
        setDeleting(false);
        return;
      }
      setDeleteError(
        callableErrorMessage(err, userErrorMessage(err, "No se pudo eliminar la cuenta. Intenta de nuevo.")),
      );
      setDeleting(false);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">Tus datos y privacidad</h2>

      {/* Access right: download everything we hold about you. */}
      <div className="mt-4">
        <p className="max-w-prose text-sm text-muted">
          Descarga una copia de toda la información que escuelaplace guarda sobre tu cuenta: tu
          perfil, tus donaciones y aportes, tus reseñas y las páginas que administras.
        </p>
        <button type="button" onClick={onExport} disabled={exporting} className="btn btn-secondary mt-3">
          {exporting ? "Preparando…" : "Descargar mis datos"}
        </button>
        <FormError message={exportError} />
      </div>

      {/* Cancelation right: delete the whole account. */}
      <div className="mt-8 border-t border-border pt-6">
        <h3 className="text-sm font-semibold text-error">Zona de peligro</h3>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Eliminar tu cuenta es permanente. Se borrarán tu perfil y tus reseñas; tus donaciones y
          aportes se anonimizan (se conserva el monto para que el total recaudado de cada escuela siga
          siendo correcto, pero se elimina tu identidad).
          {ownedPages > 0
            ? " Las páginas que administras se transferirán a un coeditor si lo hay, o se eliminarán por completo si eres el único dueño."
            : ""}
        </p>
        <button
          type="button"
          onClick={() => {
            setConfirmText("");
            setDeleteError(null);
            setOpen(true);
          }}
          className="btn btn-destructive mt-3"
        >
          Eliminar mi cuenta
        </button>
      </div>

      <ConfirmDialog
        open={open}
        title="Eliminar mi cuenta"
        tone="destructive"
        confirmLabel="Eliminar mi cuenta"
        busy={deleting}
        busyLabel="Eliminando…"
        confirmDisabled={confirmText.trim().toUpperCase() !== CONFIRM_WORD}
        onConfirm={onDeleteAccount}
        onCancel={() => {
          if (!deleting) setOpen(false);
        }}
      >
        <div className="space-y-3">
          <p>
            Esta acción es permanente y no se puede deshacer. Te pediremos volver a iniciar sesión con
            Google para confirmar que eres tú.
          </p>
          <label className="block">
            <span className="text-sm text-foreground">
              Para confirmar, escribe <strong>{CONFIRM_WORD}</strong>:
            </span>
            <input
              className="input mt-1"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              aria-label={`Escribe ${CONFIRM_WORD} para confirmar`}
            />
          </label>
          <FormError message={deleteError} />
        </div>
      </ConfirmDialog>
    </section>
  );
}
