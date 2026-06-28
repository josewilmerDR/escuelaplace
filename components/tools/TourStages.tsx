import Image from "next/image";
import type { TourStage } from "@/types";

/**
 * Public, server-rendered sequence of a guided tour's stages (etapa 1, 2, 3…), each with its
 * name, a description of what it includes, a photo grid and an optional short video. Rendered as
 * a vertical timeline: a brand rail threads numbered nodes so the recorrido reads as one ordered
 * journey instead of a flat list. Universal (no hooks/directives) so it renders straight from the
 * SSR detail page. The video is a native `<video controls preload="metadata">` — the file is a
 * public Storage URL and metadata-only preload keeps the page light until the visitor presses play.
 */
export function TourStages({ stages }: { stages: TourStage[] }) {
  return (
    <ol className="flex flex-col">
      {stages.map((stage, i) => {
        const photos = stage.photos ?? [];
        const isLast = i === stages.length - 1;
        return (
          <li key={i} className="relative flex gap-4 sm:gap-5">
            {/* Rail: the numbered node sits on a continuous line that links each stage to the
                next, so the sequence reads as a single path. The line is hidden on the last node. */}
            <div className="flex flex-col items-center">
              <span className="z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-white tabular-nums shadow-sm ring-4 ring-brand-tint">
                {i + 1}
              </span>
              {!isLast && (
                <span aria-hidden className="mt-1 w-0.5 flex-1 rounded-full bg-border" />
              )}
            </div>

            {/* Content — padded below (except the last) so the rail breathes between stages. */}
            <div className={`min-w-0 flex-1 ${isLast ? "" : "pb-10"}`}>
              <h3 className="pt-1 text-lg font-semibold tracking-tight text-foreground">
                {stage.title}
              </h3>

              {stage.description && (
                <p className="mt-2 whitespace-pre-line text-muted">
                  {stage.description}
                </p>
              )}

              {photos.length > 0 && (
                <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {photos.map((url) => (
                    <li
                      key={url}
                      className="relative block aspect-square overflow-hidden rounded-xl bg-surface ring-1 ring-black/5"
                    >
                      <Image
                        src={url}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 33vw, 50vw"
                        className="object-cover transition-transform duration-300 hover:scale-105"
                      />
                    </li>
                  ))}
                </ul>
              )}

              {stage.videoUrl && (
                <video
                  controls
                  preload="metadata"
                  className="mt-4 w-full rounded-xl bg-black ring-1 ring-black/5"
                >
                  <source src={stage.videoUrl} />
                  Tu navegador no puede reproducir este video.
                </video>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
