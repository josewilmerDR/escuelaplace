"use client";

/**
 * Write/edit form for a business review. Reading reviews is public (rendered SSR on the
 * business page); writing requires Google sign-in (opt-in — the buyer doesn't need an
 * account to browse). One review per user per business (doc id = uid); the business's own
 * owner/editors can't review it. On success it refreshes the server-rendered list.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginButton } from "@/components/auth/LoginButton";
import { deleteReview, getMyReview, upsertReview } from "@/lib/firestore";
import { useViewAsVisitor } from "@/lib/view-as";
import type { UserDoc } from "@/types";

export function ReviewForm({
  businessId,
  businessName,
  ownerId,
  editorIds,
}: {
  businessId: string;
  /** For concrete copy in the delete confirmation. */
  businessName: string;
  ownerId: string;
  editorIds?: string[];
}) {
  const { user, loading } = useAuth();
  // "Ver como visitante" (toggled from ManageBar by the page's managers): pretend
  // signed-out so the owner sees the sign-in prompt an anonymous buyer gets, not the
  // "No podés reseñar tu propio comercio" notice.
  const [asVisitor] = useViewAsVisitor();

  if (loading) {
    // Skeleton sized like the sign-in box: no pop-in over the list while auth resolves
    // (same idea as the LoginButton header skeleton).
    return (
      <div
        aria-hidden
        className="h-28 animate-pulse rounded-2xl bg-surface ring-1 ring-black/5"
      />
    );
  }

  if (!user || asVisitor) {
    return (
      <div className="rounded-2xl bg-surface p-5 text-sm ring-1 ring-black/5">
        <p className="mb-3 text-muted">Iniciá sesión con Google para dejar tu reseña.</p>
        {/* "primary": the default on-brand chip is white-on-white here. */}
        <LoginButton variant="primary" />
      </div>
    );
  }

  if (user.id === ownerId || editorIds?.includes(user.id)) {
    return (
      <p className="rounded-2xl bg-surface p-5 text-sm text-muted ring-1 ring-black/5">
        No podés reseñar tu propio comercio.
      </p>
    );
  }

  return (
    // Keyed by user: switching accounts remounts the form with fresh state, so one
    // account's draft can never leak into — or get published under — another one.
    <ReviewFormInner
      key={user.id}
      user={user}
      businessId={businessId}
      businessName={businessName}
    />
  );
}

function ReviewFormInner({
  user,
  businessId,
  businessName,
}: {
  user: UserDoc;
  businessId: string;
  businessName: string;
}) {
  const router = useRouter();
  // 0 = no rating chosen yet. Preselecting 5 stars made accidental (and inflated)
  // five-star reviews one tap away; the choice must be conscious.
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [hasExisting, setHasExisting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const starRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Prefill the user's existing review, if any (async — no synchronous setState in effect).
  useEffect(() => {
    let cancelled = false;
    getMyReview(businessId, user.id)
      .then((r) => {
        if (cancelled || !r) return;
        setRating(r.rating);
        setText(r.text);
        setHasExisting(true);
      })
      .catch(() => {
        // Can't know whether a review exists — submitting now would overwrite it
        // blindly, so warn instead of failing silently.
        if (cancelled) return;
        setError(
          "No pudimos comprobar si ya tenías una reseña. Recargá la página antes de publicar.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [user.id, businessId]);

  // Standard radiogroup keyboard: arrows move selection AND focus (roving tabindex).
  const onStarKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    let next: number;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      next = rating >= 5 ? 1 : rating + 1;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      next = rating <= 1 ? 5 : rating - 1;
    } else {
      return;
    }
    e.preventDefault();
    setRating(next);
    starRefs.current[next - 1]?.focus();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess(null);
    if (rating === 0) {
      setError("Elegí una calificación antes de publicar.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const wasExisting = hasExisting;
      await upsertReview({
        businessId,
        authorId: user.id,
        authorName: user.name || "Anónimo",
        rating,
        text: text.trim(),
      });
      setHasExisting(true);
      setSuccess(wasExisting ? "Tu reseña se actualizó." : "Tu reseña se publicó.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la reseña.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteReview(businessId, user.id);
      setHasExisting(false);
      setRating(0);
      setText("");
      setSuccess("Tu reseña se borró.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la reseña.");
    } finally {
      setSaving(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      // Calm-depth card: a soft elevated white surface, not a hard-bordered box.
      className="rounded-2xl bg-white p-5 text-sm shadow-sm ring-1 ring-black/5"
    >
      <p className="text-base font-semibold tracking-tight text-foreground">
        {hasExisting ? "Editá tu reseña" : "Dejá tu reseña"}
      </p>

      {/* h-10/w-10 buttons keep the tap targets ≥40px (the .btn rule in globals.css);
          the glyph itself was a ~24px target. A soft rounded hover/focus ring makes the
          stars read as a real control rather than loose glyphs. */}
      <div className="mt-3 flex" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            ref={(el) => {
              starRefs.current[n - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
            tabIndex={n === (rating === 0 ? 1 : rating) ? 0 : -1}
            onClick={() => setRating(n)}
            onKeyDown={onStarKeyDown}
            className={`flex h-10 w-10 items-center justify-center rounded-lg text-2xl leading-none transition-colors hover:bg-surface focus-visible:bg-surface ${
              n <= rating ? "text-brand" : "text-slate-300"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Contá tu experiencia (opcional)"
        aria-label="Contá tu experiencia (opcional)"
        maxLength={600}
        className="input mt-3 min-h-20 w-full"
      />
      <p className="mt-1 text-right text-xs text-muted">{text.length}/600</p>

      {error && (
        <p role="alert" className="mt-2 text-error">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="mt-2 text-success">
          {success}
        </p>
      )}

      {confirmingDelete ? (
        // Inline confirmation (no modal primitive in the codebase yet). Concrete copy:
        // what gets deleted and that there is no undo.
        <div className="mt-3 rounded-xl bg-error-tint p-3 ring-1 ring-error/10">
          <p className="text-error">
            ¿Borrar tu reseña de {businessName}? Esta acción no se puede
            deshacer.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              className="btn btn-destructive"
            >
              {saving ? "Borrando…" : "Sí, borrar"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={saving}
              className="btn btn-outline"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? "Guardando…" : hasExisting ? "Actualizar" : "Publicar"}
          </button>
          {hasExisting && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={saving}
              className="min-h-10 px-2 text-error hover:underline disabled:opacity-50"
            >
              Borrar
            </button>
          )}
        </div>
      )}
    </form>
  );
}
