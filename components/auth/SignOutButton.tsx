"use client";

/**
 * Sign-out action for the panel sidebar. The brand header no longer carries it: once signed
 * in, the header shows only the account-name pill (which links here), and signing out is an
 * account-area action. Panel routes are always authenticated (RequireAuth), so this assumes
 * a session and just signs out. After signing out it sends the user back to the public home
 * (/) so they land on the catalog instead of being stranded on a now-private URL where
 * RequireAuth would read as "log in again".
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export function SignOutButton({ className = "" }: { className?: string }) {
  const { signOut } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signOut();
          router.replace("/");
        } finally {
          setBusy(false);
        }
      }}
      className={className}
    >
      {busy ? "Cerrando sesión…" : "Cerrar sesión"}
    </button>
  );
}
