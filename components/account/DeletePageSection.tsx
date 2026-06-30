"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FormError } from "@/components/ui/FormError";
import { deletePage } from "@/lib/firestore";
import { callableErrorMessage } from "@/lib/errors";

/**
 * "Zona de peligro" at the foot of a page's edit screen: the owner-only, irreversible delete of a
 * whole business/school. The cascade (content, support records, Storage, denormalized counters) runs
 * server-side in the deletePage callable; this only confirms intent and navigates away. Render it
 * ONLY for the page owner (or admin) — editors manage content, not existence.
 */
export function DeletePageSection({
  type,
  id,
  name,
}: {
  type: "business" | "school";
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noun = type === "business" ? "comercio" : "escuela";

  async function onConfirm() {
    setBusy(true);
    setError(null);
    try {
      await deletePage(type, id);
      // The page (and this edit route) no longer exist; land back on the panel home.
      router.replace("/panel");
      router.refresh();
    } catch (err) {
      setError(
        callableErrorMessage(
          err,
          `No se pudo eliminar ${type === "business" ? "el comercio" : "la escuela"}. Intenta de nuevo.`,
        ),
      );
      setBusy(false);
    }
  }

  return (
    <section className="mt-12 border-t border-border pt-6">
      <h2 className="text-sm font-semibold text-error">Zona de peligro</h2>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Eliminar {type === "business" ? "este comercio" : "esta escuela"} borra de forma permanente
        su perfil y todos los datos asociados. Esta acción no se puede deshacer.
      </p>
      <button
        type="button"
        onClick={() => {
          setConfirmText("");
          setError(null);
          setOpen(true);
        }}
        className="btn btn-destructive mt-3"
      >
        Eliminar {noun}
      </button>

      <ConfirmDialog
        open={open}
        title={`Eliminar ${noun}`}
        tone="destructive"
        confirmLabel="Eliminar definitivamente"
        busy={busy}
        busyLabel="Eliminando…"
        confirmDisabled={confirmText.trim() !== name.trim()}
        onConfirm={onConfirm}
        onCancel={() => {
          if (!busy) setOpen(false);
        }}
      >
        <div className="space-y-3">
          <p>
            Vas a eliminar <strong>«{name}»</strong> y todo su contenido
            {type === "school"
              ? " (proyectos, herramientas, métodos de pago y el historial de apoyos recibidos)"
              : " (reseñas, métricas y los apoyos que diste a escuelas)"}
            . Es permanente y no se puede deshacer.
          </p>
          <label className="block">
            <span className="text-sm text-foreground">
              Para confirmar, escribe el nombre exacto de {type === "business" ? "el comercio" : "la escuela"}:
            </span>
            <input
              className="input mt-1"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={name}
              autoComplete="off"
              aria-label={`Escribe «${name}» para confirmar`}
            />
          </label>
          <FormError message={error} />
        </div>
      </ConfirmDialog>
    </section>
  );
}
