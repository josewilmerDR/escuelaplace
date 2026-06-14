"use client";

/**
 * How long a support has been waiting for the school to confirm it. A neutral elapsed-time
 * chip that turns amber once it crosses SUBSCRIPTION_STALE_PENDING_DAYS — a cue that it's
 * reasonable to nudge, never a platform claim about the money (the school confirms against
 * its own records). The wall clock is read in an effect (reading it during render is
 * impure); until then it renders nothing, and since every panel list that uses it is a
 * client-only, post-auth surface, that one tick is invisible.
 */
import { useState } from "react";
import type { Timestamp } from "firebase/firestore";
import { ClockIcon } from "@/components/ui/icons";
import { formatDaysAgo } from "@/lib/format";
import { SUBSCRIPTION_STALE_PENDING_DAYS } from "@/types";

const DAY_MS = 86_400_000;

export function PendingAge({ since }: { since: Timestamp }) {
  // Snapshot the wall clock once at mount via a lazy initializer (reading it during render
  // is impure; a setState-in-effect is also flagged). Re-rendering the list re-mounts with
  // a fresh "now", which is plenty for a day-granular chip.
  const [nowMs] = useState(() => Date.now());
  const ms = nowMs - since.toMillis();
  const stale = ms >= SUBSCRIPTION_STALE_PENDING_DAYS * DAY_MS;
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 text-xs ${
        stale ? "font-medium text-warning" : "text-muted"
      }`}
      title={`Pendiente de confirmación · ${formatDaysAgo(ms)}`}
    >
      <ClockIcon className="h-3.5 w-3.5" />
      Pendiente {formatDaysAgo(ms)}
    </span>
  );
}
