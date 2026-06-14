import { OwnReviewMark } from "@/components/reviews/OwnReviewMark";
import { Stars } from "@/components/reviews/Stars";
import { formatRating } from "@/lib/format";
import type { ReviewDoc, ReviewStats } from "@/types";

/**
 * Read-only review list for the public business page: the "Reseñas" heading with the
 * average summary, the empty state or the list itself, and the "showing N of M" note when
 * the page rendered fewer reviews than the stored total. Rendered SSR. The write side
 * (ReviewForm, a client island) is composed separately by the page after this block, so
 * the read content stays a plain server component.
 */
export function ReviewList({
  reviews,
  stats,
}: {
  reviews: ReviewDoc[];
  stats: ReviewStats;
}) {
  const averageLabel = formatRating(stats.average);

  return (
    <>
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Reseñas
        </h2>
        {stats.count > 0 && (
          <span className="flex items-center gap-1 text-sm text-muted">
            {/* decorative: the number right after already carries the rating. */}
            <Stars value={stats.average} decorative />
            <span className="sr-only">Calificación promedio:</span>
            {averageLabel} ({stats.count})
          </span>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Todavía no hay reseñas. Sé la primera persona en dejar una.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {reviews.map((r) => (
            // Depth, not a hard border: each review sits on a soft elevated surface.
            <li
              key={r.id}
              className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-foreground">
                    {r.authorName}
                  </span>
                  <OwnReviewMark authorId={r.authorId} />
                  {r.createdAt && (
                    <span className="shrink-0 text-xs text-muted">
                      {r.createdAt.toDate().toLocaleDateString("es-CR", {
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </span>
                <Stars value={r.rating} className="shrink-0 text-sm" />
              </div>
              {r.text && (
                // pre-line: written in a textarea — keep the line breaks.
                <p className="mt-2 whitespace-pre-line text-sm text-muted">
                  {r.text}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {stats.count > reviews.length && (
        <p className="mt-3 text-xs text-muted">
          Mostrando las {reviews.length} reseñas más recientes de {stats.count}.
        </p>
      )}
    </>
  );
}
