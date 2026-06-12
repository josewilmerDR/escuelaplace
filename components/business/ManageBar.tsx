"use client";

/**
 * Admin strip on the public business profile, visible only to the people who manage
 * the page (owner, editors, or platform admin): links to the panel's edit form and
 * metrics. Client island — the SSR page doesn't know who is looking at it. Renders
 * nothing for everyone else (and during SSR/auth resolution), so the layout never
 * shifts for buyers.
 *
 * "Ver como visitante" (FB's "View as") flips the shared view-as store: this strip
 * collapses into a floating exit pill, and the other owner-aware islands (ReviewForm,
 * OwnReviewMark) render their public state — so what's left on screen is exactly what
 * a visitor gets.
 */
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { useViewAsVisitor } from "@/lib/view-as";

export function ManageBar({
  businessId,
  ownerId,
  editorIds,
  supportsSchool,
}: {
  businessId: string;
  ownerId: string;
  editorIds?: string[];
  /** Whether the business has an active school subscription. When false, the bar
   * carries the "support a school" nudge — the public SupportBadge deliberately
   * renders nothing for that state (a negative label on the merchant's own profile
   * reads as a warning), so this is where the owner learns about it. */
  supportsSchool: boolean;
}) {
  const { user } = useAuth();
  const [asVisitor, setAsVisitor] = useViewAsVisitor();
  const canManage =
    user &&
    (user.id === ownerId ||
      editorIds?.includes(user.id) ||
      user.role === "admin");
  if (!canManage) return null;

  if (asVisitor) {
    // The strip disappears with the rest of the owner-only UI; the floating pill is
    // the only trace, so the mode can't get stuck on invisibly.
    return (
      <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900 py-2 pl-4 pr-2 text-sm text-white shadow-lg">
        <span>Así ven tu página los visitantes</span>
        <button
          type="button"
          onClick={() => setAsVisitor(false)}
          className="rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25"
        >
          Salir
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border border-border bg-surface px-4 py-3 sm:justify-start">
      <p className="text-sm font-medium text-slate-700">
        Administrás esta página
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href={`/panel/business/${businessId}/edit`}
          className="btn btn-outline"
        >
          <PencilIcon className="mr-2 h-4 w-4" />
          Editar página
        </Link>
        <Link
          href={`/panel/business/${businessId}/metrics`}
          className="btn btn-outline"
        >
          Ver métricas
        </Link>
        <button
          type="button"
          onClick={() => setAsVisitor(true)}
          className="btn btn-outline"
        >
          <EyeIcon className="mr-2 h-4 w-4" />
          Ver como visitante
        </button>
      </div>
      {!supportsSchool && (
        // w-full pushes the nudge to its own line inside the flex-wrap container.
        <p className="w-full text-center text-sm text-muted sm:text-left">
          Tu página aún no apoya a ninguna escuela.{" "}
          <Link
            href={`/panel/business/${businessId}/subscribe`}
            className="font-medium text-brand-darker hover:underline"
          >
            Apoyar una escuela
          </Link>
        </p>
      )}
    </div>
  );
}

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
      />
    </svg>
  );
}

/** Heroicons pencil (outline) — same inline-SVG approach as the page icons. */
function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      className={className}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
      />
    </svg>
  );
}
