import { describe, expect, it } from "vitest";
import { bingoDeckNameError, deckCardsFromLote } from "./bingo-decks";
import { BINGO_DECK_NAME_MAX, type BingoCardDoc } from "@/types";

describe("bingoDeckNameError", () => {
  it("rejects an empty or whitespace-only name", () => {
    expect(bingoDeckNameError("")).not.toBeNull();
    expect(bingoDeckNameError("   ")).not.toBeNull();
  });

  it("accepts a normal name", () => {
    expect(bingoDeckNameError("Cartones impresos 2026")).toBeNull();
  });

  it("accepts a name exactly at the cap and rejects one past it", () => {
    expect(bingoDeckNameError("a".repeat(BINGO_DECK_NAME_MAX))).toBeNull();
    expect(bingoDeckNameError("a".repeat(BINGO_DECK_NAME_MAX + 1))).not.toBeNull();
  });

  it("measures the cap against the trimmed name", () => {
    // Surrounding spaces don't count toward the limit.
    const name = `  ${"a".repeat(BINGO_DECK_NAME_MAX)}  `;
    expect(bingoDeckNameError(name)).toBeNull();
  });
});

describe("deckCardsFromLote", () => {
  const lote: Pick<BingoCardDoc, "label" | "numbers">[] = [
    { label: "001", numbers: [1, 2, 3] },
    { label: "002", numbers: [4, 5, 6] },
  ];

  it("keeps only label + numbers, dropping per-event status/ownerId", () => {
    const full: BingoCardDoc[] = [
      {
        id: "a",
        label: "001",
        numbers: [1, 2, 3],
        status: "sold",
        ownerId: "buyer-1",
        soldOrderId: "order-1",
        // createdAt is a Timestamp at runtime; not needed for this pure transform.
      } as unknown as BingoCardDoc,
    ];
    expect(deckCardsFromLote(full)).toEqual([{ label: "001", numbers: [1, 2, 3] }]);
  });

  it("preserves order and is a plain projection of every cartón", () => {
    expect(deckCardsFromLote(lote)).toEqual([
      { label: "001", numbers: [1, 2, 3] },
      { label: "002", numbers: [4, 5, 6] },
    ]);
  });
});
