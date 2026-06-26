"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * The event-level "Apadrinar el reinado" CTA + its disclosure modal (a client island on the SSR
 * reinado page). Sponsoring funds the reinado's DESTINATION PROJECT — the event's costs (logistics,
 * decoration, …) — never a single candidate, so the modal makes the collective, non-earmarked purpose
 * explicit before sending the supporter to the one-time project funding flow (/panel/fund). PURELY
 * INFORMATIONAL — the platform never touches the money; the supporter pays the school directly and the
 * school confirms.
 */
export function PageantSponsorButton({
  schoolId,
  fundProjectId,
  cause,
}: {
  schoolId: string;
  fundProjectId: string;
  /** The reinado's declared cause (PageantConfig.cause), surfaced in the modal when set. */
  cause?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary self-start">
        Apadrinar el reinado
      </button>

      <ConfirmDialog
        open={open}
        title="Apadrinar el reinado"
        confirmLabel="Aceptar y continuar"
        cancelLabel="Cancelar"
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          router.push(`/panel/fund?schoolId=${schoolId}&projectId=${fundProjectId}`)
        }
      >
        <p>
          Tu aporte va a{" "}
          {cause ? (
            <span className="font-medium text-foreground">{cause}</span>
          ) : (
            "los costos del evento (logística, decoración, etc.)"
          )}
          : ayuda a realizar el reinado,{" "}
          <span className="font-medium text-foreground">
            no es un pago dirigido a ninguna candidatura
          </span>
          .
        </p>
        <p className="mt-2">
          Le pagás directo a la escuela por el medio de pago que ella publica; la escuela se
          compromete a usarlo para este fin y confirma tu aporte. La plataforma nunca toca el dinero.
        </p>
      </ConfirmDialog>
    </>
  );
}
