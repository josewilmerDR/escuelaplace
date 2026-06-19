import { describe, expect, it } from "vitest";
import { eventStatus, googleCalendarUrl } from "./events";

const at = (iso: string) => new Date(iso).getTime();

describe("eventStatus", () => {
  it("is 'today' anywhere on the event's calendar day, even after the start time", () => {
    const event = at("2026-07-01T18:00:00");
    expect(eventStatus(event, at("2026-07-01T09:00:00"))).toBe("today"); // before it
    expect(eventStatus(event, at("2026-07-01T20:00:00"))).toBe("today"); // after it, same day
  });

  it("is 'upcoming' before the day and 'past' after it", () => {
    const event = at("2026-07-01T18:00:00");
    expect(eventStatus(event, at("2026-06-30T23:59:00"))).toBe("upcoming");
    expect(eventStatus(event, at("2026-07-02T00:01:00"))).toBe("past");
  });
});

describe("googleCalendarUrl", () => {
  it("builds a TEMPLATE link with a UTC date window and the prefilled fields", () => {
    const url = googleCalendarUrl({
      title: "Feria de la escuela",
      details: "¡Vení!",
      location: "Gimnasio",
      startMs: at("2026-07-01T18:00:00Z"),
      durationMinutes: 60,
    });
    expect(url).toContain("https://calendar.google.com/calendar/render?");
    expect(url).toContain("action=TEMPLATE");
    // 18:00Z → 19:00Z, compact UTC stamps.
    expect(url).toContain("dates=20260701T180000Z%2F20260701T190000Z");
    expect(url).toContain("text=Feria+de+la+escuela");
    expect(url).toContain("location=Gimnasio");
  });

  it("defaults to a 2-hour window and omits empty optional fields", () => {
    const url = googleCalendarUrl({
      title: "Acto",
      startMs: at("2026-07-01T10:00:00Z"),
    });
    expect(url).toContain("dates=20260701T100000Z%2F20260701T120000Z");
    expect(url).not.toContain("details=");
    expect(url).not.toContain("location=");
  });
});
