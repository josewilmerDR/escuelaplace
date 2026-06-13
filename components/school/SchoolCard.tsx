import Image from "next/image";
import Link from "next/link";
import { HeartIcon, VerifiedIcon } from "@/components/ui/icons";
import { schoolSupportersCount } from "@/lib/firestore";
import type { SchoolCardData } from "@/types";

/**
 * A school card, mirroring <BusinessCard>'s visual language (cover → avatar → identity), in two
 * modes driven by whether `onSelect` is given:
 *
 * - Directory (no `onSelect`): a stretched-link card to /school/[id], used by the public
 *   /schools listing. The school's own page already carries the "Donar" CTA.
 * - Selectable (`onSelect`): a radio-style button used by the donation picker carousel; the
 *   whole surface selects the school and a ring + check mark shows the current choice.
 *
 * The card fills its container; callers (grid cell or carousel slide) own the width.
 */
const COVER_SIZES = "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";

function CardMedia({ school }: { school: SchoolCardData }) {
  const initial = school.name.charAt(0).toUpperCase();
  return (
    <div className="relative aspect-video w-full overflow-hidden bg-brand-tint">
      {school.photo ? (
        <Image
          src={school.photo}
          alt=""
          fill
          sizes={COVER_SIZES}
          className="object-cover"
        />
      ) : school.photoUrl ? (
        <Image
          src={school.photoUrl}
          alt=""
          fill
          sizes={COVER_SIZES}
          className="object-contain p-8"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-full items-center justify-center text-5xl font-bold text-brand-darker/40"
        >
          {initial}
        </span>
      )}
    </div>
  );
}

function CardBody({
  school,
  title,
}: {
  school: SchoolCardData;
  /** Title node — a Link (directory) or plain text (selectable). */
  title: React.ReactNode;
}) {
  const initial = school.name.charAt(0).toUpperCase();
  const supporters = schoolSupportersCount(school);

  return (
    <div className="flex flex-1 gap-3 p-4">
      {school.photoUrl ? (
        <Image
          src={school.photoUrl}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0 rounded-full border border-border object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-base font-bold text-brand-darker"
        >
          {initial}
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="flex items-center gap-1.5 font-semibold leading-snug text-foreground group-hover:text-brand-darker">
          <span className="line-clamp-2">{title}</span>
          {school.verified && (
            <>
              <VerifiedIcon
                className="h-4 w-4 shrink-0 text-brand"
                title="Escuela verificada"
              />
              <span className="sr-only">Escuela verificada</span>
            </>
          )}
        </h3>

        {school.locality && (
          <p className="mt-1 truncate text-sm text-muted">{school.locality}</p>
        )}

        {supporters > 0 && (
          <p className="mt-auto flex items-center gap-1.5 pt-3 text-sm text-muted">
            <HeartIcon className="h-4 w-4 shrink-0 text-brand" />
            {supporters === 1
              ? "1 persona o comercio la apoya"
              : `${supporters} personas y comercios la apoyan`}
          </p>
        )}
      </div>
    </div>
  );
}

export function SchoolCard({
  school,
  selected = false,
  onSelect,
  tabIndex,
}: {
  school: SchoolCardData;
  /** Selectable mode only: whether this card is the current choice. */
  selected?: boolean;
  /** Provide to render the card as a radio-style selector (donation picker). */
  onSelect?: (id: string) => void;
  /** Selectable mode only: roving tabindex managed by the radiogroup (picker). */
  tabIndex?: number;
}) {
  if (onSelect) {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        tabIndex={tabIndex}
        onClick={() => onSelect(school.id)}
        className={`group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border bg-white text-left transition hover:shadow-lg ${
          selected
            ? "border-brand ring-2 ring-brand"
            : "border-border hover:border-brand-dark"
        }`}
      >
        <CardMedia school={school} />
        {/* Selected check, overlaid on the cover. */}
        {selected && (
          <span className="absolute top-2 right-2 rounded-full bg-brand-darker p-1 text-white shadow">
            <VerifiedIcon className="h-4 w-4" />
          </span>
        )}
        <CardBody school={school} title={school.name} />
      </button>
    );
  }

  return (
    // Stretched-link card: the title link's ::after covers the whole surface.
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-white transition-shadow hover:shadow-lg">
      <CardMedia school={school} />
      <CardBody
        school={school}
        title={
          <Link href={`/school/${school.id}`} className="after:absolute after:inset-0">
            {school.name}
          </Link>
        }
      />
    </article>
  );
}
