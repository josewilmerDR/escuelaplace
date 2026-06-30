/**
 * The per-community ("tenant") configuration contract — the "ficha de comunidad".
 *
 * escuelaplace is being generalized into a COMMUNITY ENGINE: the same codebase serves
 * escuelaplace (schools), iglesiaplace (churches) and, later, any self-serve community — each
 * differing ONLY by data, never by forked code. "school" stops being baked into the schema and
 * becomes one VALUE of `CommunityConfig.type`.
 *
 * A CommunityConfig is read through `getCurrentCommunity()` (see lib/community). Today there is
 * a single static ficha (escuelaplace), so the resolver returns a constant; when a second
 * community exists the same shape is selected per-deployment (env) or, for the self-serve tier,
 * resolved per-host from a Firestore `communities/{id}` doc. The shape is identical in both
 * modes — only the SOURCE differs.
 *
 * This file is the contract only. It introduces NO behavior: nothing reads it yet (PR 0.1).
 */
import type { ProjectCurrency, ToolType } from "./firestore";

/** The kind of institution a community is built around. Drives default copy and tools. */
export type CommunityType = "school" | "church" | "generic";

/**
 * The vocabulary layer — how a community NAMES the things the engine renders. This is what
 * keeps "escuela" out of the church UI (and vice-versa) WITHOUT forking the code: the same
 * component renders `copy.entity.plural`, which is "escuelas" here and "iglesias" there.
 *
 * Only the strings that genuinely vary between communities live here; the rest of the copy is
 * DERIVED from `entity.*` at the call site, so this stays small.
 */
export interface CommunityCopy {
  /** The central institution, e.g. { singular: "escuela", plural: "escuelas" }. */
  entity: { singular: string; plural: string };
  /** The institution's governing body, e.g. "junta directiva" | "consejo parroquial". */
  board: string;
  /** The headline relation, e.g. "comercios que apoyan a las escuelas". */
  supporterRelation: string;
  /** Home hero heading (app/page.tsx). */
  heroHeading: string;
  /** "¿Cómo funciona X?" section title (app/page.tsx). */
  howItWorksTitle: string;
  /** Default document `<title>` (app/layout.tsx metadata.title.default). */
  metaTitle: string;
  /** Default meta description (app/layout.tsx metadata.description). */
  metaDescription: string;
}

/**
 * The brand wordmark, split so the engine can preserve the styled-tail treatment for any
 * community ("escuela" + a boxed "place"): rendered as `{lead}<span>{tail}</span>`.
 */
export interface CommunityWordmark {
  lead: string;
  tail: string;
}

/** Brand color tokens a community themes with (mirror of the :root vars in app/globals.css). */
export interface CommunityColors {
  /** Primary decorative fill — globals.css `--brand`. */
  brand: string;
  /** Darker shade for bold white text / borders / mobile themeColor — globals.css `--brand-dark`. */
  brandDark: string;
}

/** Whole-surface feature switches. All true today for escuelaplace except free voting. */
export interface CommunityFeatures {
  /** Crowdfunding projects. */
  projects: boolean;
  /** Business reviews. */
  reviews: boolean;
  /** Personal (user) donations. */
  donations: boolean;
  /** Accountless pageant "applause" free vote (App-Check gated; off until proven in prod). */
  freeVoting: boolean;
}

/**
 * The full per-community configuration. One shape, two possible sources (static per-deployment
 * for premium communities; a Firestore doc for the self-serve tier). See module docstring.
 */
export interface CommunityConfig {
  /**
   * Stable community key. MUST be stable forever: it namespaces the buyer's localStorage
   * (lib/buyer/preferences) and will key the future `communities/{id}` doc. For escuelaplace it
   * is exactly "escuelaplace" so the existing storage key stays unchanged.
   */
  id: string;
  /** Institution kind — drives default copy/tools. */
  type: CommunityType;

  // ── Identity ──────────────────────────────────────────────────────────────
  /** Full brand name used in metadata/copy, e.g. "escuelaplace". */
  brandName: string;
  /** Brand wordmark parts for the styled header/footer treatment. */
  wordmark: CommunityWordmark;
  /** Canonical public origin, e.g. "https://escuelaplace.com" (feeds the SITE_URL fallback). */
  siteUrl: string;

  // ── Visual brand ──────────────────────────────────────────────────────────
  colors: CommunityColors;

  // ── Locale / economics ──────────────────────────────────────────────────────
  /** BCP-47 locale for `<html lang>`, e.g. "es-CR". */
  locale: string;
  /** ISO-3166-1 alpha-2 country, e.g. "CR". */
  country: string;
  /** Currency of the support figures shown in this community. */
  currency: ProjectCurrency;
  /** Value of one support "unit" in `currency` (mirror of SUBSCRIPTION_UNIT_CRC). */
  subscriptionUnit: number;
  /** IANA timezone for daily metric keys / scheduled jobs, e.g. "America/Costa_Rica". */
  timezone: string;

  // ── Vocabulary ──────────────────────────────────────────────────────────────
  copy: CommunityCopy;

  // ── Tools / features ────────────────────────────────────────────────────────
  /** Which tool kinds this community may offer (a subset of TOOL_TYPES). */
  enabledTools: ToolType[];
  /** Coarse feature switches for whole surfaces. */
  features: CommunityFeatures;
}
