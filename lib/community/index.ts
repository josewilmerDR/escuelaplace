/**
 * Community resolver — the SINGLE place the app asks "which community is this?".
 *
 * Today there is one static ficha, so this returns a constant chosen by `NEXT_PUBLIC_COMMUNITY_ID`
 * (defaulting to escuelaplace). Routing every brand/identity read through here — instead of the
 * literals scattered across lib/site, app/layout, the header and the buyer store — is what lets
 * the same codebase later serve a second community (premium: a different COMMUNITY_ID per
 * deployment; self-serve: a per-host lookup) without touching call sites.
 *
 * `NEXT_PUBLIC_` so the chosen id is inlined into the client bundle too — the resolver must
 * agree across server and client components (e.g. the buyer's localStorage key). Pure and
 * synchronous (no headers()/async), so it is safe in both. The per-host async variant is a
 * later phase.
 */
import type { CommunityConfig } from "@/types";
import { COMMUNITIES, DEFAULT_COMMUNITY_ID } from "./configs";

/** The active community for this deployment. */
export function getCurrentCommunity(): CommunityConfig {
  const id = process.env.NEXT_PUBLIC_COMMUNITY_ID ?? DEFAULT_COMMUNITY_ID;
  return COMMUNITIES[id] ?? COMMUNITIES[DEFAULT_COMMUNITY_ID];
}
