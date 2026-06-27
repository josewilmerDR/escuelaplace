"use client";

/**
 * Empty-state hint for the thank-you wall, shown ONLY to the school's managers (owner,
 * editors, admin) when there are no confirmed donors yet. The public wall stays hidden
 * until it has content — a barren "no donors yet" card reads as a warning to visitors,
 * not an invitation — but the people who run the page should still discover that the
 * feature exists and how it fills. Client island (the SSR page doesn't know who is
 * looking): renders nothing for visitors and while "Ver como visitante" is active, so the
 * public view never changes and the layout doesn't shift.
 */
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Badge } from "@/components/ui/Badge";
import { cardClass } from "@/components/ui/Card";
import { HeartIcon } from "@/components/ui/icons";
import { useViewAsVisitor } from "@/lib/view-as";
import { isPageManager } from "@/lib/permissions";

export function DonorWallManagerHint({
  schoolId,
  ownerId,
  editorIds,
}: {
  schoolId: string;
  ownerId: string;
  editorIds?: string[];
}) {
  const { user } = useAuth();
  const [asVisitor] = useViewAsVisitor();
  const canManage = isPageManager({ ownerId, editorIds }, user);
  if (!canManage || asVisitor) return null;

  return (
    <section className={`mt-4 ${cardClass()}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <HeartIcon className="h-5 w-5 text-brand" />
          Muro de agradecimiento
        </h2>
        <Badge tone="neutral">Solo tú ves esto</Badge>
      </div>
      <p className="mt-2 text-sm text-muted">
        Cuando confirmes tu primer aporte, acá aparece un muro público que
        agradece a quienes apoyan tu escuela. Cada donante elige si quiere
        mostrarse con su nombre y nivel; el resto suma de forma anónima. Los
        visitantes no ven esta tarjeta hasta que haya un primer agradecimiento.
      </p>
      <p className="mt-3 text-sm">
        <Link
          href={`/panel/school/${schoolId}/edit`}
          className="font-medium text-brand-darker hover:underline"
        >
          Personaliza el mensaje de agradecimiento
        </Link>{" "}
        que encabeza el muro.
      </p>
    </section>
  );
}
