"use client";

/**
 * The celebratory card a supporter sees when a school thanks them for a milestone (first
 * support, a renewal, an anniversary). Shows the school's message and any media (a short clip
 * of the kids, a photo). Unseen ones lead with a brand ring + "Nuevo" chip and a "Marcar como
 * visto" action, so the moment lands once and then settles into history — stream-style.
 *
 * Only `sent` thank-yous reach this card; a `prompted` one (the school hasn't written it yet)
 * is never shown. The message already has the supporter's name folded in by the detector.
 */
import { SparklesIcon } from "@/components/ui/icons";
import { thankYouMilestoneLabel } from "@/lib/thanks";
import { safeMediaUrl } from "@/lib/url";
import type { ThankYouDoc } from "@/types";

export function ThankYouCard({
  thankYou,
  onMarkSeen,
}: {
  thankYou: ThankYouDoc;
  onMarkSeen: (id: string) => void;
}) {
  const unseen = !thankYou.seenByDonor;
  const media = thankYou.media;
  // Host-gate the clip before it loads into a <video> (bypasses next/image): drop off-domain.
  const videoUrl = safeMediaUrl(media?.videoUrl);

  return (
    <li
      className={`flex flex-col gap-3 rounded-2xl p-4 ring-1 ${
        unseen
          ? "bg-brand-tint/60 ring-brand/30"
          : "bg-surface ring-black/5"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-brand-darker">
          <SparklesIcon className="h-5 w-5" />
        </span>
        <span className="font-semibold tracking-tight text-foreground">
          {thankYou.schoolName || "Tu escuela"}
        </span>
        <span className="inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-xs font-medium text-brand-darker ring-1 ring-brand/15">
          {thankYouMilestoneLabel(thankYou.milestone, thankYou.years)}
        </span>
        {unseen && (
          <span className="inline-flex items-center rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">
            Nuevo
          </span>
        )}
      </div>

      {thankYou.message && (
        <p className="whitespace-pre-line text-sm text-foreground">{thankYou.message}</p>
      )}

      {videoUrl && (
        <video
          src={videoUrl}
          controls
          className="max-h-72 w-full rounded-xl bg-black"
        />
      )}
      {!videoUrl && media?.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- storage URL, no optimization needed here
        <img
          src={media.photoUrl}
          alt=""
          className="max-h-72 w-full rounded-xl object-cover"
        />
      )}

      {unseen && (
        <div>
          <button
            type="button"
            onClick={() => onMarkSeen(thankYou.id)}
            className="text-sm font-medium text-brand-darker underline-offset-2 hover:underline"
          >
            Marcar como visto
          </button>
        </div>
      )}
    </li>
  );
}
