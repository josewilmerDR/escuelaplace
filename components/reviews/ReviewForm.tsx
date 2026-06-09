"use client";

/**
 * Write/edit form for a business review. Reading reviews is public (rendered SSR on the
 * business page); writing requires Google sign-in (opt-in — the buyer doesn't need an
 * account to browse). One review per user per business (doc id = uid); the business's own
 * owner/editors can't review it. On success it refreshes the server-rendered list.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { LoginButton } from "@/components/auth/LoginButton";
import { deleteReview, getMyReview, upsertReview } from "@/lib/firestore";

export function ReviewForm({
  businessId,
  ownerId,
  editorIds,
}: {
  businessId: string;
  ownerId: string;
  editorIds?: string[];
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [hasExisting, setHasExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isManager =
    !!user && (user.id === ownerId || !!editorIds?.includes(user.id));

  // Prefill the user's existing review, if any (async — no synchronous setState in effect).
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyReview(businessId, user.id).then((r) => {
      if (cancelled || !r) return;
      setRating(r.rating);
      setText(r.text);
      setHasExisting(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user, businessId]);

  if (loading) return null;

  if (!user) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <p className="mb-3 text-muted">Iniciá sesión con Google para dejar tu reseña.</p>
        <LoginButton />
      </div>
    );
  }

  if (isManager) {
    return (
      <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
        No podés reseñar tu propio comercio.
      </p>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await upsertReview({
        businessId,
        authorId: user.id,
        authorName: user.name || "Anónimo",
        rating,
        text: text.trim(),
      });
      setHasExisting(true);
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
    try {
      await deleteReview(businessId, user.id);
      setHasExisting(false);
      setRating(5);
      setText("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la reseña.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-border bg-surface p-4 text-sm"
    >
      <p className="font-medium text-slate-900">
        {hasExisting ? "Editá tu reseña" : "Dejá tu reseña"}
      </p>

      <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Calificación">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className={`text-2xl leading-none ${
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
        className="input mt-3 min-h-20 w-full"
      />

      {error && <p className="mt-2 text-red-600">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {saving ? "Guardando…" : hasExisting ? "Actualizar" : "Publicar"}
        </button>
        {hasExisting && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="text-muted hover:underline disabled:opacity-50"
          >
            Borrar
          </button>
        )}
      </div>
    </form>
  );
}
