"use client";

/**
 * Google sign-in / sign-out button. Reflects the current auth state from useAuth().
 */
import { useState } from "react";
import { useAuth } from "./AuthProvider";

export function LoginButton() {
  const { user, loading, signIn, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <span className="text-sm text-gray-400">…</span>;
  }

  if (user) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => run(signOut)}
        className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Cerrar sesión
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => run(signIn)}
      className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
    >
      Ingresar con Google
    </button>
  );
}
