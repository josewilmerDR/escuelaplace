/**
 * The community registry. PR 0.1 ships a SINGLE ficha (escuelaplace) whose every value equals
 * the literal it will eventually replace, so wiring consumers to it (PR 0.2+) changes no
 * behavior. A second ficha (iglesiaplace) is added by appending an object here — not by forking
 * the app.
 */
import { SUBSCRIPTION_UNIT_CRC, TOOL_TYPES } from "@/types";
import type { CommunityConfig } from "@/types";

/**
 * escuelaplace — the founding community. Values mirror the current hardcoded points so the
 * later wiring is behavior-preserving:
 * - siteUrl ↔ lib/site.ts SITE_URL fallback
 * - wordmark ↔ components/layout/SiteHeader.tsx
 * - colors ↔ app/globals.css (--brand / --brand-dark)
 * - locale ↔ app/layout.tsx `<html lang>`
 * - subscriptionUnit ↔ types/firestore.ts SUBSCRIPTION_UNIT_CRC
 */
const ESCUELAPLACE: CommunityConfig = {
  id: "escuelaplace",
  type: "school",
  brandName: "escuelaplace",
  wordmark: { lead: "escuela", tail: "place" },
  siteUrl: "https://escuelaplace.com",
  colors: { brand: "#0ea5e9", brandDark: "#0284c7" },
  locale: "es-CR",
  country: "CR",
  currency: "CRC",
  subscriptionUnit: SUBSCRIPTION_UNIT_CRC,
  timezone: "America/Costa_Rica",
  copy: {
    entity: { singular: "escuela", plural: "escuelas" },
    board: "junta directiva",
    supporterRelation: "comercios que apoyan a las escuelas",
    heroHeading: "La escuela de tu comunidad y los comercios que la apoyan",
    howItWorksTitle: "¿Cómo funciona escuelaplace?",
  },
  // Every tool kind is offered today; the per-community gating seam (PR 0.5) is a no-op while
  // this lists all of TOOL_TYPES.
  enabledTools: [...TOOL_TYPES],
  features: {
    projects: true,
    reviews: true,
    donations: true,
    // App Check unproven in prod — accountless free voting stays off (see CLAUDE.md / docs).
    freeVoting: false,
  },
};

/** All known communities, keyed by `id`. */
export const COMMUNITIES: Record<string, CommunityConfig> = {
  [ESCUELAPLACE.id]: ESCUELAPLACE,
};

/** The id served when none is configured (the founding community). */
export const DEFAULT_COMMUNITY_ID = ESCUELAPLACE.id;
