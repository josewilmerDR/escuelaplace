import Image from "next/image";
import type { TourStage } from "@/types";

/**
 * Public, server-rendered sequence of a guided tour's stages (etapa 1, 2, 3…), each with its
 * name, a description of what it includes, a photo grid and an optional short video. Universal
 * (no hooks/directives) so it renders straight from the SSR detail page. The video is a native
 * `<video controls preload="metadata">` — the file is a public Storage URL and metadata-only
 * preload keeps the page light until the visitor presses play.
 */
export function TourStages({ stages }: { stages: TourStage[] }) {
  return (
    <ol className="flex flex-col gap-8">
      {stages.map((stage, i) => {
        const photos = stage.photos ?? [];
        return (
          <li key={i} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white tabular-nums">
                {i + 1}
              </span>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">
                {stage.title}
              </h3>
            </div>

            {stage.description && (
              <p className="whitespace-pre-line text-muted">{stage.description}</p>
            )}

            {photos.length > 0 && (
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                      className="object-cover"
                    />
                  </li>
                ))}
              </ul>
            )}

            {stage.videoUrl && (
              <video
                controls
                preload="metadata"
                className="w-full rounded-xl bg-black ring-1 ring-black/5"
              >
                <source src={stage.videoUrl} />
                Tu navegador no puede reproducir este video.
              </video>
            )}
          </li>
        );
      })}
    </ol>
  );
}
