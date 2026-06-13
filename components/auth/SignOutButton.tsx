"use client";

/**
 * Sign-out action for the panel sidebar. The brand header no longer carries it: once signed
 * in, the header shows only the account-name pill (which links here), and signing out is an
 * account-area action. Panel routes are always authenticated (RequireAuth), so this assumes
 * a session and just signs out.
 */
import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function SignOutButton({ className = "" }: { className?: string }) {
  const { signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signOut();
        } finally {
          setBusy(false);
        }
      }}
      className={className}
    >
      Cerrar sesión
    </button>
  );
}
