import { describe, expect, it } from "vitest";
import {
  TOOL_TYPE_LIST,
  createToolTitle,
  deleteToolTitle,
  editToolTitle,
  toolBuyHref,
  toolBuyLabel,
  toolTypeMeta,
} from "./registry";

// ---------------------------------------------------------------------------
// TOOL_TYPE_LIST
// ---------------------------------------------------------------------------

describe("TOOL_TYPE_LIST", () => {
  it("contains every declared ToolType key exactly once", () => {
    const keys = TOOL_TYPE_LIST.map((m) => m.key);
    const expected = [
      "raffle",
      "bingo",
      "sale",
      "service",
      "guided_tour",
      "event",
      "pageant",
      "other",
    ];
    expect(keys).toEqual(expected);
  });

  it("preserves declared insertion order (raffle first, other last)", () => {
    expect(TOOL_TYPE_LIST[0].key).toBe("raffle");
    expect(TOOL_TYPE_LIST[TOOL_TYPE_LIST.length - 1].key).toBe("other");
  });

  it("every entry's key matches its position's meta.key (self-consistent)", () => {
    for (const meta of TOOL_TYPE_LIST) {
      expect(toolTypeMeta(meta.key).key).toBe(meta.key);
    }
  });

  it("every entry has a non-empty label, pluralLabel, hint, titleLabel, titlePlaceholder and inactiveNotice", () => {
    for (const meta of TOOL_TYPE_LIST) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.pluralLabel.length).toBeGreaterThan(0);
      expect(meta.hint.length).toBeGreaterThan(0);
      expect(meta.titleLabel.length).toBeGreaterThan(0);
      expect(meta.titlePlaceholder.length).toBeGreaterThan(0);
      expect(meta.inactiveNotice.length).toBeGreaterThan(0);
    }
  });

  it("every entry carries a truthy icon (a component function)", () => {
    for (const meta of TOOL_TYPE_LIST) {
      expect(typeof meta.icon).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// toolTypeMeta
// ---------------------------------------------------------------------------

describe("toolTypeMeta", () => {
  it("returns the correct meta for each known ToolType", () => {
    expect(toolTypeMeta("raffle").key).toBe("raffle");
    expect(toolTypeMeta("bingo").key).toBe("bingo");
    expect(toolTypeMeta("sale").key).toBe("sale");
    expect(toolTypeMeta("service").key).toBe("service");
    expect(toolTypeMeta("guided_tour").key).toBe("guided_tour");
    expect(toolTypeMeta("event").key).toBe("event");
    expect(toolTypeMeta("pageant").key).toBe("pageant");
    expect(toolTypeMeta("other").key).toBe("other");
  });

  it("falls back to the 'other' meta for an unknown/legacy string", () => {
    const fallback = toolTypeMeta("unknown_legacy_type" as string);
    expect(fallback.key).toBe("other");
  });

  it("falls back to 'other' for an empty string", () => {
    const fallback = toolTypeMeta("" as string);
    expect(fallback.key).toBe("other");
  });

  it("returns 'other' meta for explicitly passing 'other'", () => {
    expect(toolTypeMeta("other").key).toBe("other");
  });

  it("returns the correct Spanish label for known types", () => {
    expect(toolTypeMeta("raffle").label).toBe("Rifa");
    expect(toolTypeMeta("bingo").label).toBe("Bingo");
    expect(toolTypeMeta("pageant").label).toBe("Reinado");
    expect(toolTypeMeta("sale").label).toBe("Productos");
    expect(toolTypeMeta("other").label).toBe("Otro");
  });
});

// ---------------------------------------------------------------------------
// createToolTitle
// ---------------------------------------------------------------------------

describe("createToolTitle", () => {
  it("returns generic wording for 'other' (not 'Crear otro')", () => {
    expect(createToolTitle("other")).toBe("Crear herramienta");
  });

  it("builds 'Crear <label lowercased>' for raffle", () => {
    expect(createToolTitle("raffle")).toBe("Crear rifa");
  });

  it("builds 'Crear <label lowercased>' for bingo", () => {
    expect(createToolTitle("bingo")).toBe("Crear bingo");
  });

  it("builds 'Crear <label lowercased>' for sale (label is 'Productos')", () => {
    expect(createToolTitle("sale")).toBe("Crear productos");
  });

  it("builds 'Crear <label lowercased>' for service", () => {
    expect(createToolTitle("service")).toBe("Crear servicios");
  });

  it("builds 'Crear <label lowercased>' for guided_tour", () => {
    expect(createToolTitle("guided_tour")).toBe("Crear visita guiada");
  });

  it("builds 'Crear <label lowercased>' for event", () => {
    expect(createToolTitle("event")).toBe("Crear evento");
  });

  it("builds 'Crear <label lowercased>' for pageant", () => {
    expect(createToolTitle("pageant")).toBe("Crear reinado");
  });

  it("produces non-empty string for every declared kind", () => {
    for (const meta of TOOL_TYPE_LIST) {
      expect(createToolTitle(meta.key).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// editToolTitle
// ---------------------------------------------------------------------------

describe("editToolTitle", () => {
  it("returns generic wording for 'other' (not 'Editar otro')", () => {
    expect(editToolTitle("other")).toBe("Editar herramienta");
  });

  it("builds 'Editar <label lowercased>' for raffle", () => {
    expect(editToolTitle("raffle")).toBe("Editar rifa");
  });

  it("builds 'Editar <label lowercased>' for bingo", () => {
    expect(editToolTitle("bingo")).toBe("Editar bingo");
  });

  it("builds 'Editar <label lowercased>' for sale", () => {
    expect(editToolTitle("sale")).toBe("Editar productos");
  });

  it("builds 'Editar <label lowercased>' for guided_tour", () => {
    expect(editToolTitle("guided_tour")).toBe("Editar visita guiada");
  });

  it("builds 'Editar <label lowercased>' for pageant", () => {
    expect(editToolTitle("pageant")).toBe("Editar reinado");
  });

  it("produces non-empty string for every declared kind", () => {
    for (const meta of TOOL_TYPE_LIST) {
      expect(editToolTitle(meta.key).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// deleteToolTitle
// ---------------------------------------------------------------------------

describe("deleteToolTitle", () => {
  it("returns generic wording for 'other' (not 'Eliminar otro')", () => {
    expect(deleteToolTitle("other")).toBe("Eliminar herramienta");
  });

  it("builds 'Eliminar <label lowercased>' for raffle", () => {
    expect(deleteToolTitle("raffle")).toBe("Eliminar rifa");
  });

  it("builds 'Eliminar <label lowercased>' for bingo", () => {
    expect(deleteToolTitle("bingo")).toBe("Eliminar bingo");
  });

  it("builds 'Eliminar <label lowercased>' for sale", () => {
    expect(deleteToolTitle("sale")).toBe("Eliminar productos");
  });

  it("builds 'Eliminar <label lowercased>' for pageant", () => {
    expect(deleteToolTitle("pageant")).toBe("Eliminar reinado");
  });

  it("produces non-empty string for every declared kind", () => {
    for (const meta of TOOL_TYPE_LIST) {
      expect(deleteToolTitle(meta.key).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// toolBuyLabel
// ---------------------------------------------------------------------------

describe("toolBuyLabel", () => {
  it("returns a non-null label for raffle", () => {
    expect(toolBuyLabel("raffle")).toBe("Comprar números");
  });

  it("returns a non-null label for bingo", () => {
    expect(toolBuyLabel("bingo")).toBe("Comprar cartones");
  });

  it("returns a non-null label for sale", () => {
    expect(toolBuyLabel("sale")).toBe("Comprar");
  });

  it("returns a non-null label for pageant (support flow)", () => {
    expect(toolBuyLabel("pageant")).toBe("Apoyar");
  });

  it("returns null for guided_tour (consult flow, no buy)", () => {
    expect(toolBuyLabel("guided_tour")).toBeNull();
  });

  it("returns null for service", () => {
    expect(toolBuyLabel("service")).toBeNull();
  });

  it("returns null for event", () => {
    expect(toolBuyLabel("event")).toBeNull();
  });

  it("returns null for other", () => {
    expect(toolBuyLabel("other")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toolBuyHref
// ---------------------------------------------------------------------------

describe("toolBuyHref", () => {
  const ids = {
    schoolId: "school-abc",
    toolId: "tool-xyz",
    detailHref: "/school/school-abc/tool/tool-xyz",
  };

  it("bingo lands on the /panel/bingo-order page with schoolId and toolId query params", () => {
    expect(toolBuyHref("bingo", ids)).toBe(
      "/panel/bingo-order?schoolId=school-abc&toolId=tool-xyz",
    );
  });

  it("raffle appends #comprar to the detail href", () => {
    expect(toolBuyHref("raffle", ids)).toBe(
      "/school/school-abc/tool/tool-xyz#comprar",
    );
  });

  it("sale appends #comprar to the detail href", () => {
    expect(toolBuyHref("sale", ids)).toBe(
      "/school/school-abc/tool/tool-xyz#comprar",
    );
  });

  it("pageant appends #candidatas to the detail href (candidate roster section)", () => {
    expect(toolBuyHref("pageant", ids)).toBe(
      "/school/school-abc/tool/tool-xyz#candidatas",
    );
  });

  it("returns null for guided_tour", () => {
    expect(toolBuyHref("guided_tour", ids)).toBeNull();
  });

  it("returns null for service", () => {
    expect(toolBuyHref("service", ids)).toBeNull();
  });

  it("returns null for event", () => {
    expect(toolBuyHref("event", ids)).toBeNull();
  });

  it("returns null for other", () => {
    expect(toolBuyHref("other", ids)).toBeNull();
  });

  it("bingo href includes exactly the provided schoolId and toolId (no cross-contamination)", () => {
    const href = toolBuyHref("bingo", {
      schoolId: "s1",
      toolId: "t1",
      detailHref: "/irrelevant",
    });
    expect(href).toContain("schoolId=s1");
    expect(href).toContain("toolId=t1");
  });

  it("raffle/sale use the detailHref verbatim (no modification beyond appending the anchor)", () => {
    const customDetail = "/school/custom-school/tool/custom-tool";
    expect(toolBuyHref("raffle", { ...ids, detailHref: customDetail })).toBe(
      `${customDetail}#comprar`,
    );
    expect(toolBuyHref("sale", { ...ids, detailHref: customDetail })).toBe(
      `${customDetail}#comprar`,
    );
  });
});

// ---------------------------------------------------------------------------
// Consistency: toolBuyLabel and toolBuyHref agree on which kinds are buyable
// ---------------------------------------------------------------------------

describe("toolBuyLabel / toolBuyHref buyable-kind agreement", () => {
  const ids = {
    schoolId: "s",
    toolId: "t",
    detailHref: "/school/s/tool/t",
  };

  it("every kind where toolBuyLabel is non-null also has a non-null toolBuyHref", () => {
    for (const meta of TOOL_TYPE_LIST) {
      const label = toolBuyLabel(meta.key);
      const href = toolBuyHref(meta.key, ids);
      if (label !== null) {
        expect(href).not.toBeNull();
      }
    }
  });

  it("every kind where toolBuyHref is non-null also has a non-null toolBuyLabel", () => {
    for (const meta of TOOL_TYPE_LIST) {
      const href = toolBuyHref(meta.key, ids);
      const label = toolBuyLabel(meta.key);
      if (href !== null) {
        expect(label).not.toBeNull();
      }
    }
  });

  it("the buyable kinds are exactly raffle, bingo, sale, and pageant", () => {
    const buyable = TOOL_TYPE_LIST.filter(
      (m) => toolBuyLabel(m.key) !== null,
    ).map((m) => m.key);
    expect(buyable.sort()).toEqual(["bingo", "pageant", "raffle", "sale"]);
  });

  it("the non-buyable kinds are exactly guided_tour, service, event, and other", () => {
    const nonBuyable = TOOL_TYPE_LIST.filter(
      (m) => toolBuyLabel(m.key) === null,
    ).map((m) => m.key);
    expect(nonBuyable.sort()).toEqual(["event", "guided_tour", "other", "service"]);
  });
});
