"use client";

import { useState } from "react";
import { clearBuyerPreferences } from "@/lib/buyer/preferences";

/**
 * One-tap "erasure" for the accountless buyer: clears the only data we hold about them — their
 * chosen community, device key and applause memory in localStorage. Embedded in the privacy policy
 * (the place a buyer reads about local storage), so the right is exercisable, not just described.
 */
export function ClearLocalDataButton() {
  const [done, setDone] = useState(false);
  return (
    <span className="not-prose inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          clearBuyerPreferences();
          setDone(true);
        }}
      >
        Borrar mis preferencias locales
      </button>
      {done && (
        <span role="status" className="text-sm font-medium text-success">
          Listo. Se borraron de este navegador.
        </span>
      )}
    </span>
  );
}
