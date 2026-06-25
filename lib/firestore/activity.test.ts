import { describe, expect, it } from "vitest";
import { mergePendingActivity, type ActivityItem } from "./activity";
import type {
  BingoOrderDoc,
  PageantVoteDoc,
  ProductOrderDoc,
  ProjectContributionDoc,
  RaffleOrderDoc,
  SubscriptionDoc,
} from "@/types";

/** A minimal Timestamp stand-in: only `toMillis` is read by the merge (sorting). */
const ts = (ms: number) => ({ toMillis: () => ms }) as unknown as SubscriptionDoc["createdAt"];

const businessSub = (over: Partial<SubscriptionDoc> = {}): SubscriptionDoc =>
  ({
    id: "sub-biz",
    supporterType: "business",
    businessName: "Comercio X",
    schoolId: "s1",
    schoolName: "Escuela",
    units: 2,
    amount: 10_000,
    status: "pending",
    confirmedAt: null,
    expiresAt: null,
    proofUploaded: true,
    createdAt: ts(100),
    updatedAt: ts(100),
    ...over,
  }) as SubscriptionDoc;

const contribution = (over: Partial<ProjectContributionDoc> = {}): ProjectContributionDoc =>
  ({
    id: "contrib-1",
    schoolId: "s1",
    schoolName: "Escuela",
    projectId: "p1",
    projectTitle: "Techo nuevo",
    type: "money",
    donorId: "u9",
    donorName: "Ana",
    amount: 7_000,
    currency: "CRC",
    status: "pending",
    confirmedAt: null,
    proofUploaded: false,
    createdAt: ts(200),
    updatedAt: ts(200),
    ...over,
  }) as ProjectContributionDoc;

const raffleOrder = (over: Partial<RaffleOrderDoc> = {}): RaffleOrderDoc =>
  ({
    id: "raffle-1",
    schoolId: "s1",
    schoolName: "Escuela",
    toolId: "t1",
    toolTitle: "Rifa de la gira",
    buyerId: "u1",
    buyerName: "Juan",
    numbers: [3, 4],
    amount: 2_000,
    currency: "CRC",
    status: "pending",
    confirmedAt: null,
    proofUploaded: true,
    createdAt: ts(50),
    updatedAt: ts(50),
    ...over,
  }) as RaffleOrderDoc;

const productOrder = (over: Partial<ProductOrderDoc> = {}): ProductOrderDoc =>
  ({
    id: "product-1",
    schoolId: "s1",
    schoolName: "Escuela",
    toolId: "t2",
    toolTitle: "Kermés",
    productId: "pr1",
    productName: "Tamal",
    quantity: 3,
    buyerId: "u2",
    buyerName: "María",
    amount: 5_500,
    currency: "CRC",
    status: "pending",
    confirmedAt: null,
    proofUploaded: false,
    createdAt: ts(300),
    updatedAt: ts(300),
    ...over,
  }) as ProductOrderDoc;

const bingoOrder = (over: Partial<BingoOrderDoc> = {}): BingoOrderDoc =>
  ({
    id: "bingo-1",
    schoolId: "s1",
    schoolName: "Escuela",
    toolId: "t3",
    toolTitle: "Bingo familiar",
    buyerId: "u3",
    buyerName: "Pedro",
    quantity: 4,
    amount: 4_000,
    currency: "CRC",
    status: "pending",
    confirmedAt: null,
    proofUploaded: true,
    createdAt: ts(400),
    updatedAt: ts(400),
    ...over,
  }) as BingoOrderDoc;

const pageantVote = (over: Partial<PageantVoteDoc> = {}): PageantVoteDoc =>
  ({
    id: "pageant-1",
    schoolId: "s1",
    schoolName: "Escuela",
    toolId: "t4",
    toolTitle: "Reinado escolar",
    candidateId: "c1",
    candidateName: "Sofía",
    buyerId: "u4",
    buyerName: "Lucía",
    units: 5,
    amount: 5_000,
    currency: "CRC",
    status: "pending",
    confirmedAt: null,
    proofUploaded: true,
    createdAt: ts(500),
    updatedAt: ts(500),
    ...over,
  }) as PageantVoteDoc;

const allSources = () => ({
  subscriptions: [businessSub()],
  contributions: [contribution()],
  raffleOrders: [raffleOrder()],
  productOrders: [productOrder()],
  bingoOrders: [bingoOrder()],
  pageantVotes: [pageantVote()],
});

describe("mergePendingActivity", () => {
  it("folds all six collections into one feed", () => {
    const feed = mergePendingActivity(allSources());
    expect(feed).toHaveLength(6);
    expect(new Set(feed.map((i) => i.kind))).toEqual(
      new Set([
        "subscription",
        "project_contribution",
        "raffle_order",
        "product_order",
        "bingo_order",
        "pageant_vote",
      ]),
    );
  });

  it("orders oldest first (most overdue on top)", () => {
    // createdAt: raffle 50, sub 100, contrib 200, product 300, bingo 400, pageant 500.
    const feed = mergePendingActivity(allSources());
    expect(feed.map((i) => i.id)).toEqual([
      "raffle-1",
      "sub-biz",
      "contrib-1",
      "product-1",
      "bingo-1",
      "pageant-1",
    ]);
  });

  it("normalizes the actor name, amount, currency and title per kind", () => {
    const feed = mergePendingActivity(allSources());
    const byKind = (k: ActivityItem["kind"]) => feed.find((i) => i.kind === k)!;

    // A subscription targets the school itself → no tool title; magnitude is CRC.
    const sub = byKind("subscription");
    expect(sub.who).toBe("Comercio X");
    expect(sub.amount).toBe(10_000);
    expect(sub.currency).toBe("CRC");
    expect(sub.title).toBeUndefined();

    // Tool orders carry the activity title and the buyer's merged name.
    expect(byKind("raffle_order").title).toBe("Rifa de la gira");
    expect(byKind("raffle_order").who).toBe("Juan");
    expect(byKind("product_order").title).toBe("Kermés");
    expect(byKind("bingo_order").who).toBe("Pedro");
    expect(byKind("project_contribution").title).toBe("Techo nuevo");
    expect(byKind("pageant_vote").title).toBe("Reinado escolar");
    expect(byKind("pageant_vote").who).toBe("Lucía");
  });

  it("uses the donor name for a personal donation", () => {
    const feed = mergePendingActivity({
      ...allSources(),
      subscriptions: [
        businessSub({
          id: "sub-donor",
          supporterType: "user",
          businessName: undefined,
          donorName: "Carla",
        }),
      ],
    });
    expect(feed.find((i) => i.id === "sub-donor")!.who).toBe("Carla");
  });

  it("falls back to a dash when the private name wasn't merged (e.g. server-side)", () => {
    const feed = mergePendingActivity({
      subscriptions: [],
      contributions: [],
      raffleOrders: [raffleOrder({ buyerName: undefined, amount: undefined })],
      productOrders: [],
      bingoOrders: [],
      pageantVotes: [],
    });
    expect(feed[0].who).toBe("—");
    expect(feed[0].amount).toBeUndefined();
  });

  it("returns an empty feed when nothing is pending", () => {
    expect(
      mergePendingActivity({
        subscriptions: [],
        contributions: [],
        raffleOrders: [],
        productOrders: [],
        bingoOrders: [],
        pageantVotes: [],
      }),
    ).toEqual([]);
  });

  it("keeps the original doc under `doc` for the row's detail and confirm dispatch", () => {
    const feed = mergePendingActivity(allSources());
    const raffle = feed.find((i) => i.kind === "raffle_order")!;
    // Narrowing on `kind` exposes the kind-specific doc (raffle numbers here).
    if (raffle.kind === "raffle_order") {
      expect(raffle.doc.numbers).toEqual([3, 4]);
    }
  });
});
