import { describe, expect, it } from "vitest";
import {
  publicTools,
  toolConfigOf,
  toolContactLabel,
  toolContactPhone,
  toolDateFromInput,
  toolDateInputValue,
  toolDateTimeFromInput,
  toolDateTimeInputValue,
  toolWindowLabel,
} from "./tools";
import type { ToolDoc } from "@/types";

// ---------------------------------------------------------------------------
// Minimal fake Timestamp helpers (no Firebase dependency)
// ---------------------------------------------------------------------------

/** Fake Timestamp for toolWindowLabel / toolDateInputValue: wraps a UTC-midnight Date. */
function fakeTs(ms: number) {
  return {
    toMillis: () => ms,
    toDate: () => new Date(ms),
  };
}

// ---------------------------------------------------------------------------
// toolConfigOf
// ---------------------------------------------------------------------------

describe("toolConfigOf", () => {
  const raffleConfig = { numberCount: 100, pricePerNumber: 500, currency: "CRC" as const, prizes: ["Prize 1"], drawMethod: "lotería" };

  it("returns the config when tool.type matches the requested kind", () => {
    const tool = { type: "raffle" as const, config: raffleConfig };
    expect(toolConfigOf(tool, "raffle")).toBe(raffleConfig);
  });

  it("returns null when tool.type does not match the requested kind", () => {
    const tool = { type: "bingo" as const, config: raffleConfig };
    expect(toolConfigOf(tool, "raffle")).toBeNull();
  });

  it("returns null when tool is null", () => {
    expect(toolConfigOf(null, "raffle")).toBeNull();
  });

  it("returns null when tool is undefined", () => {
    expect(toolConfigOf(undefined, "raffle")).toBeNull();
  });

  it("returns null when kind matches but config is absent", () => {
    const tool = { type: "raffle" as const, config: undefined };
    expect(toolConfigOf(tool, "raffle")).toBeNull();
  });

  it("returns the config for a pageant tool kind", () => {
    const pageantConfig = {
      currency: "CRC" as const,
      pricePerSupportUnit: 1000,
      freeVotingEnabled: false,
      crownFormula: { jury: 0.5, support: 0.3, sympathy: 0.2 },
    };
    const tool = { type: "pageant" as const, config: pageantConfig };
    expect(toolConfigOf(tool, "pageant")).toBe(pageantConfig);
  });
});

// ---------------------------------------------------------------------------
// publicTools
// ---------------------------------------------------------------------------

describe("publicTools", () => {
  const base: Pick<ToolDoc, "id" | "type" | "status" | "title" | "description" | "schoolId" | "schoolName" | "ownerId" | "createdAt" | "updatedAt"> = {
    id: "t1",
    type: "other",
    status: "active",
    title: "T",
    description: "D",
    schoolId: "s1",
    schoolName: "Escuela",
    ownerId: "u1",
    createdAt: fakeTs(0) as unknown as ToolDoc["createdAt"],
    updatedAt: fakeTs(0) as unknown as ToolDoc["updatedAt"],
  };

  it("returns only tools with status === 'active'", () => {
    const active = { ...base, id: "a", status: "active" as const };
    const inactive = { ...base, id: "b", status: "inactive" as const };
    const result = publicTools([active, inactive] as ToolDoc[]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("returns an empty array when all tools are inactive", () => {
    const inactive = { ...base, id: "b", status: "inactive" as const };
    expect(publicTools([inactive] as ToolDoc[])).toEqual([]);
  });

  it("returns an empty array for an empty input", () => {
    expect(publicTools([])).toEqual([]);
  });

  it("preserves order of active tools", () => {
    const tools = ["a", "b", "c"].map((id) => ({ ...base, id, status: "active" as const })) as ToolDoc[];
    const result = publicTools(tools);
    expect(result.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// toolWindowLabel
// ---------------------------------------------------------------------------

describe("toolWindowLabel", () => {
  // Use a known UTC date so the formatted string is deterministic.
  // 2026-06-15 00:00:00 UTC = 1750032000000 ms
  const juneMs = Date.UTC(2026, 5, 15); // June 15 2026 UTC
  const julyMs = Date.UTC(2026, 6, 20); // July 20 2026 UTC

  it("formats 'start – end' when both dates are present", () => {
    const tool = { startsAt: fakeTs(juneMs) as unknown as ToolDoc["startsAt"], endsAt: fakeTs(julyMs) as unknown as ToolDoc["endsAt"] };
    const label = toolWindowLabel(tool);
    expect(label).not.toBeNull();
    expect(label).toContain("–");
  });

  it("formats 'Desde ...' when only startsAt is present", () => {
    const tool = { startsAt: fakeTs(juneMs) as unknown as ToolDoc["startsAt"], endsAt: undefined };
    const label = toolWindowLabel(tool);
    expect(label).not.toBeNull();
    expect(label!.startsWith("Desde ")).toBe(true);
  });

  it("formats 'Hasta ...' when only endsAt is present", () => {
    const tool = { startsAt: undefined, endsAt: fakeTs(julyMs) as unknown as ToolDoc["endsAt"] };
    const label = toolWindowLabel(tool);
    expect(label).not.toBeNull();
    expect(label!.startsWith("Hasta ")).toBe(true);
  });

  it("returns null when neither date is set", () => {
    const tool = { startsAt: undefined, endsAt: undefined };
    expect(toolWindowLabel(tool)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toolContactPhone
// ---------------------------------------------------------------------------

describe("toolContactPhone", () => {
  it("returns the tool-level contactPhone when set", () => {
    expect(toolContactPhone({ contactPhone: "88881111", config: undefined })).toBe("88881111");
  });

  it("falls back to config.contactPhone when tool-level is absent", () => {
    const config = { contactPhone: "77772222" } as Record<string, unknown>;
    expect(toolContactPhone({ contactPhone: undefined, config: config as ToolDoc["config"] })).toBe("77772222");
  });

  it("prefers tool-level contactPhone over config.contactPhone", () => {
    const config = { contactPhone: "77772222" } as Record<string, unknown>;
    expect(toolContactPhone({ contactPhone: "88881111", config: config as ToolDoc["config"] })).toBe("88881111");
  });

  it("returns empty string when neither tool-level nor config has a phone", () => {
    expect(toolContactPhone({ contactPhone: undefined, config: undefined })).toBe("");
  });

  it("returns empty string when tool-level is empty string and config is absent", () => {
    // Empty string is falsy — treated as absent; no config fallback either
    expect(toolContactPhone({ contactPhone: "", config: undefined })).toBe("");
  });

  it("returns empty string when config does not have contactPhone", () => {
    const config = {} as ToolDoc["config"];
    expect(toolContactPhone({ contactPhone: undefined, config })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// toolContactLabel
// ---------------------------------------------------------------------------

describe("toolContactLabel", () => {
  it("returns the trimmed custom label when set", () => {
    expect(toolContactLabel({ contactLabel: "  Preguntar  " })).toBe("Preguntar");
  });

  it("returns 'Consultar' when contactLabel is undefined", () => {
    expect(toolContactLabel({ contactLabel: undefined })).toBe("Consultar");
  });

  it("returns 'Consultar' when contactLabel is an empty string", () => {
    expect(toolContactLabel({ contactLabel: "" })).toBe("Consultar");
  });

  it("returns 'Consultar' when contactLabel is whitespace-only", () => {
    expect(toolContactLabel({ contactLabel: "   " })).toBe("Consultar");
  });

  it("returns the trimmed label unchanged when it contains no extra whitespace", () => {
    expect(toolContactLabel({ contactLabel: "Reservar" })).toBe("Reservar");
  });
});

// ---------------------------------------------------------------------------
// toolDateInputValue
// ---------------------------------------------------------------------------

describe("toolDateInputValue", () => {
  it("converts a UTC-midnight Timestamp to 'YYYY-MM-DD'", () => {
    // 2026-06-15 00:00:00 UTC
    const ms = Date.UTC(2026, 5, 15);
    const ts = fakeTs(ms) as unknown as Parameters<typeof toolDateInputValue>[0];
    expect(toolDateInputValue(ts)).toBe("2026-06-15");
  });

  it("zero-pads month and day", () => {
    // 2026-01-05 00:00:00 UTC
    const ms = Date.UTC(2026, 0, 5);
    const ts = fakeTs(ms) as unknown as Parameters<typeof toolDateInputValue>[0];
    expect(toolDateInputValue(ts)).toBe("2026-01-05");
  });

  it("returns '' when timestamp is undefined", () => {
    expect(toolDateInputValue(undefined)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// toolDateFromInput
// ---------------------------------------------------------------------------

describe("toolDateFromInput", () => {
  it("parses 'YYYY-MM-DD' to a UTC-midnight Date", () => {
    const result = toolDateFromInput("2026-06-15");
    expect(result).not.toBeNull();
    expect(result!.getUTCFullYear()).toBe(2026);
    expect(result!.getUTCMonth()).toBe(5); // June = 5
    expect(result!.getUTCDate()).toBe(15);
    expect(result!.getUTCHours()).toBe(0);
    expect(result!.getUTCMinutes()).toBe(0);
    expect(result!.getUTCSeconds()).toBe(0);
  });

  it("returns null for an empty string", () => {
    expect(toolDateFromInput("")).toBeNull();
  });

  it("returns null when the value has missing parts (no dashes)", () => {
    expect(toolDateFromInput("20260615")).toBeNull();
  });

  it("returns null when split produces NaN parts (letters in date)", () => {
    // "20xx-06-15" → y=NaN → null
    expect(toolDateFromInput("20xx-06-15")).toBeNull();
  });

  it("round-trips with toolDateInputValue", () => {
    const original = "2026-12-31";
    const ms = Date.UTC(2026, 11, 31);
    const ts = fakeTs(ms) as unknown as Parameters<typeof toolDateInputValue>[0];
    expect(toolDateInputValue(ts)).toBe(original);
    const parsed = toolDateFromInput(original)!;
    expect(parsed.getTime()).toBe(ms);
  });
});

// ---------------------------------------------------------------------------
// toolDateTimeInputValue
// ---------------------------------------------------------------------------

describe("toolDateTimeInputValue", () => {
  it("returns '' when no timestamp is provided", () => {
    expect(toolDateTimeInputValue(undefined)).toBe("");
  });

  it("formats a Date to 'YYYY-MM-DDTHH:mm' in local time", () => {
    // Use a fixed local date to avoid TZ sensitivity in the assertion format check.
    // We'll verify structure without hardcoding the local offset.
    const now = new Date(2026, 5, 15, 14, 30); // June 15 2026 14:30 local
    const ts = { toDate: () => now };
    const result = toolDateTimeInputValue(ts);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // The result must contain the local year/month/day/hour/minute.
    expect(result).toBe(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    );
  });

  it("zero-pads single-digit months, days, hours, minutes", () => {
    const d = new Date(2026, 0, 5, 9, 3); // Jan 5 2026 09:03 local
    const ts = { toDate: () => d };
    const result = toolDateTimeInputValue(ts);
    expect(result).toBe("2026-01-05T09:03");
  });
});

// ---------------------------------------------------------------------------
// toolDateTimeFromInput
// ---------------------------------------------------------------------------

describe("toolDateTimeFromInput", () => {
  it("parses a valid datetime-local string to a Date", () => {
    const result = toolDateTimeFromInput("2026-06-15T14:30");
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Date);
    expect(Number.isNaN(result!.getTime())).toBe(false);
  });

  it("returns null for an empty string", () => {
    expect(toolDateTimeFromInput("")).toBeNull();
  });

  it("returns null for an invalid datetime string", () => {
    expect(toolDateTimeFromInput("not-a-date")).toBeNull();
  });

  it("round-trips with toolDateTimeInputValue for local time", () => {
    const d = new Date(2026, 5, 15, 14, 30); // June 15 2026 14:30 local
    const ts = { toDate: () => d };
    const formatted = toolDateTimeInputValue(ts);
    const parsed = toolDateTimeFromInput(formatted);
    expect(parsed).not.toBeNull();
    // The round-tripped date should represent the same local time.
    expect(parsed!.getFullYear()).toBe(d.getFullYear());
    expect(parsed!.getMonth()).toBe(d.getMonth());
    expect(parsed!.getDate()).toBe(d.getDate());
    expect(parsed!.getHours()).toBe(d.getHours());
    expect(parsed!.getMinutes()).toBe(d.getMinutes());
  });
});
