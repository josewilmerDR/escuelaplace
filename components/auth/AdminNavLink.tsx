"use client";

/**
 * Panel nav entry for the admin verification queue. Renders only for users whose Firestore
 * role is `admin`, so regular page owners never see it. This is a UX affordance, not a
 * security boundary — the queue page and firestore.rules enforce admin access regardless.
 */
import Link from "next/link";
import { useAuth } from "./AuthProvider";

export function AdminNavLink({ className }: { className?: string }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return null;
  return (
    <Link href="/panel/admin" className={className}>
      Verificar escuelas
    </Link>
  );
}
