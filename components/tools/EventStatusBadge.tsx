"use client";

/**
 * Small client island for an event's Próximo/Hoy/Finalizó chip. It lives client-side because the
 * verdict depends on the current time (impure in a server render, and nicer to read against the
 * VIEWER's clock anyway). The wall clock is snapshotted once at mount via a lazy initializer
 * (reading it during render is impure; a setState-in-effect is also flagged) — same pattern as
 * PendingAge. Re-rendering re-mounts with a fresh "now", plenty for a day-granular chip.
 */
import { useState } from "react";
import { eventStatus, type EventStatus } from "@/lib/events";

const LABELS: Record<EventStatus, string> = {
  upcoming: "Próximo",
  today: "Hoy",
  past: "Finalizó",
};

export function EventStatusBadge({ dateMs }: { dateMs: number }) {
  const [nowMs] = useState(() => Date.now());
  const status: EventStatus = eventStatus(dateMs, nowMs);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        status === "past"
          ? "bg-surface text-muted ring-1 ring-black/5"
          : "bg-brand-tint text-brand-darker"
      }`}
    >
      {LABELS[status]}
    </span>
  );
}
