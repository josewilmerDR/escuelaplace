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
import { VisitorModeToast } from "@/components/ui/VisitorModeToast";
import { EyeIcon, PencilIcon } from "@/components/ui/icons";
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

  // In visitor mode the strip collapses with the rest of the owner-only UI; the shared
  // floating pill is the only trace, so the mode can't get stuck on invisibly.
  if (asVisitor) return <VisitorModeToast />;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl bg-surface px-4 py-3 ring-1 ring-black/5 sm:justify-start">
      <p className="text-sm font-medium text-muted">
        Administras esta página
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

