"use client";

/**
 * The global "Actividad" entry in the account nav — a roll-up of everything pending across ALL
 * the schools the signed-in user manages, with a total-count badge. Shown only to users who
 * actually manage a school (a pure donor or a business-only owner sees nothing, like AdminNavLink
 * for non-admins), so it never adds noise for people with no confirmation queue.
 *
 * The badge is the nudge; tapping it opens /panel/activity, which breaks the total down per
 * school and links into each school's inbox. The count refetches on navigation so it stays fresh
 * after the board confirms something. Inside the mobile dropdown (AccountMenu) this only mounts
 * once the menu opens, so a logged-in visitor browsing the public catalog pays nothing for it.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getCachedPagesByUser,
  getPagesByUser,
  getPendingActivityCountForSchools,
  type ResolvedPage,
} from "@/lib/firestore";
import { useAuth } from "./AuthProvider";
import { PanelNavLink } from "./PanelNavLink";

/** Ids of the schools the user manages (a page that still exists). */
function managedSchoolIds(pages: ResolvedPage[]): string[] {
  return pages
    .filter((p) => p.type === "school" && p.doc)
    .map((p) => p.id);
}

export function ActivityNavLink({ block = false }: { block?: boolean }) {
  const { user } = useAuth();
  const pathname = usePathname();
  // null = not resolved yet (render nothing); [] = resolved, no schools (also render nothing).
  // Seeded from the session cache so a return visit shows the entry without waiting on a read.
  const [schoolIds, setSchoolIds] = useState<string[] | null>(() => {
    if (!user) return null;
    const cached = getCachedPagesByUser(user.id);
    return cached ? managedSchoolIds(cached) : null;
  });
  const [count, setCount] = useState(0);

  // Resolve the managed schools and their total pending count. Re-runs when the user changes and
  // on each navigation, so confirming an item elsewhere refreshes the badge on the next move.
  useEffect(() => {
    // No user → nothing to resolve; render already returns null for this case, so we don't
    // touch state here (a synchronous setState in an effect triggers cascading renders).
    if (!user) return;
    let cancelled = false;
    getPagesByUser(user.id)
      .then((pages) => {
        if (cancelled) return;
        const ids = managedSchoolIds(pages);
        setSchoolIds(ids);
        if (ids.length === 0) {
          setCount(0);
          return;
        }
        return getPendingActivityCountForSchools(ids).then((c) => {
          if (!cancelled) setCount(c);
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  if (!user || !schoolIds || schoolIds.length === 0) return null;

  return (
    <PanelNavLink
      href="/panel/activity"
      label="Actividad"
      block={block}
      badge={count}
    />
  );
}
