"use client";

/**
 * "Tu reseña" chip next to the viewer's own review in the server-rendered list. Client
 * island: the SSR list doesn't know who is looking at it. Renders nothing for everyone
 * else (and during SSR/auth resolution), so the list never shifts for other readers.
 */
import { useAuth } from "@/components/auth/AuthProvider";
import { useViewAsVisitor } from "@/lib/view-as";

export function OwnReviewMark({ authorId }: { authorId: string }) {
  const { user } = useAuth();
  // Hidden in "ver como visitante" mode: the chip is viewer-specific, and the mode's
  // promise is "exactly what an anonymous visitor sees".
  const [asVisitor] = useViewAsVisitor();
  if (asVisitor || !user || user.id !== authorId) return null;
  return (
    <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand-darker">
      Tu reseña
    </span>
  );
}
