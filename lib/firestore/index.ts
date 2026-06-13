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
export * from "./donors";
export * from "./reviews";
export * from "./metrics";
export * from "./ranking";
export * from "./feed";
export * from "./users";
export * from "./geo";
export * from "./converters";
export * from "./serialize";
