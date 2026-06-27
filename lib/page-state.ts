/**
 * Lifecycle of a panel page's initial data fetch: a skeleton while it runs (`loading`), a
 * retry-able error state (`error`), or the resolved content (`loaded`). Shared by the client
 * panel pages so the three-state machine reads identically everywhere instead of being
 * re-declared in each one.
 */
export type LoadState = "loading" | "error" | "loaded";
