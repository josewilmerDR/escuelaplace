import { PhotoGallery } from "@/components/business/PhotoGallery";
import { PaperClipIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/format";
import type { ProjectStage } from "@/types";

/**
 * Presentational block for one cost-justified project stage (cover photos + quotes).
 * Server-safe (no client hooks); shared by the public project detail page so the stage
 * list stays consistent and the page file doesn't carry its own copy.
 */
export function ProjectStageItem({
  stage,
  index,
  currency,
  projectTitle,
}: {
  stage: ProjectStage;
  index: number;
  currency: string;
  projectTitle: string;
}) {
  return (
    // Inset panel inside the white article card: a soft surface fill + hairline ring
    // reads as a nested block without stacking white-on-white.
    <li className="rounded-xl bg-surface p-4 ring-1 ring-black/5 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground">
          {stage.title ? (
            <>
              <span className="text-muted">Etapa {index + 1}.</span>{" "}
              {stage.title}
            </>
          ) : (
            <span className="text-muted">Etapa {index + 1}</span>
          )}
        </h3>
        {stage.cost > 0 ? (
          <span className="font-semibold text-brand-darker">
            {formatMoney(stage.cost, currency)}
          </span>
        ) : (
          <span className="text-sm text-muted">Sin costo monetario</span>
        )}
      </div>
      {stage.justification && (
        <p className="mt-2 whitespace-pre-line text-sm text-muted">
          {stage.justification}
        </p>
      )}

      {stage.photos && stage.photos.length > 0 && (
        <div className="mt-3">
          <PhotoGallery
            photos={stage.photos}
            businessName={`${projectTitle} — etapa ${index + 1}`}
          />
        </div>
      )}

      {stage.quoteUrls && stage.quoteUrls.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3 text-sm">
          {stage.quoteUrls.map((url, qi) => (
            <li key={qi}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Ver cotización ${qi + 1} de la etapa ${index + 1} (abre en pestaña nueva)`}
                className="btn btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-sm"
              >
                <PaperClipIcon className="h-4 w-4" />
                Ver cotización
                {stage.quoteUrls!.length > 1 ? ` ${qi + 1}` : ""}
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
