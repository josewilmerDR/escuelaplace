/**
 * Pure helpers for the "Eventos" tool kind: the upcoming/today/past status of a dated event and
 * an "Agregar al calendario" (Google Calendar) link. No Firebase, no React — unit-tested, used by
 * the public event page. Times are handled as epoch milliseconds so the helpers are deterministic
 * and testable (the caller passes `now`).
 */

export type EventStatus = "upcoming" | "today" | "past";

/**
 * Where a dated event sits relative to `now`. "today" wins on the event's calendar day regardless
 * of the time (so an event still reads "Hoy" while it's happening), "upcoming" before that day,
 * "past" after it. Local calendar days (the school and its community share a timezone).
 */
export function eventStatus(eventMs: number, nowMs: number): EventStatus {
  const ev = new Date(eventMs);
  const now = new Date(nowMs);
  const sameDay =
    ev.getFullYear() === now.getFullYear() &&
    ev.getMonth() === now.getMonth() &&
    ev.getDate() === now.getDate();
  if (sameDay) return "today";
  return eventMs > nowMs ? "upcoming" : "past";
}

/** Format an epoch-ms instant as the compact UTC stamp Google Calendar expects: YYYYMMDDTHHmmssZ. */
function toCalendarStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * A Google Calendar "add event" URL prefilled with the event's title, details, location and time
 * window. `durationMinutes` defaults to 2h (a sensible block for a one-off). One click adds it to
 * the user's calendar — no .ics download, no extra dependency.
 */
export function googleCalendarUrl({
  title,
  details,
  location,
  startMs,
  durationMinutes = 120,
}: {
  title: string;
  details?: string;
  location?: string;
  startMs: number;
  durationMinutes?: number;
}): string {
  const endMs = startMs + durationMinutes * 60_000;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toCalendarStamp(startMs)}/${toCalendarStamp(endMs)}`,
  });
  if (details) params.set("details", details);
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
