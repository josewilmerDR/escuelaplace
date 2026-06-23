/**
 * Firestore data access layer. Single entry point:
 *   import { getBusinessBySlug, getSchoolById } from "@/lib/firestore";
 *
 * Each domain file holds BOTH its reads (SSR/SSG) and its writes (owner-panel mutations);
 * shared write helpers live in ./geo (toLocation, LocationInput) and ./users
 * (linkPageToUser).
 */
export * from "./businesses";
export * from "./schools";
export * from "./categories";
export * from "./subscriptions";
export * from "./projects";
export * from "./activity";
export * from "./tools";
export * from "./raffles";
export * from "./product-orders";
export * from "./bingo-cards";
export * from "./bingo-orders";
export * from "./bingo-event";
export * from "./bingo-patterns-catalog";
export * from "./bingo-decks";
export * from "./donors";
export * from "./thanks";
export * from "./reviews";
export * from "./audit";
export * from "./metrics";
export * from "./ranking";
export * from "./feed";
export * from "./schools-feed";
export * from "./users";
export * from "./geo";
export * from "./converters";
export * from "./serialize";
