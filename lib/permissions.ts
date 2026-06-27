/**
 * Shared authorization predicate for "page manager" access.
 *
 * A page (a business or a school) is managed by its OWNER, any of its EDITORS, or any platform
 * ADMIN — the same rule the Firestore rules enforce server-side. This is the CLIENT-side gate that
 * decides whether to render a page's management UI (edit forms, metrics, confirmation queues, live
 * consoles) and the manage bars on public profiles. It is defense-in-depth and a UX gate, NOT the
 * security boundary (the rules are): a determined client can flip it, but writes still hit the
 * rules. Centralized so the rule lives in ONE tested place instead of being copy-pasted across
 * ~22 surfaces, where a single stale copy could silently show or hide management UI to the wrong
 * person as the permission model evolves.
 *
 * The admin role is included ON PURPOSE. A check that grants access to ONLY the owner/editors (for
 * example "can this person review their own business", which must EXCLUDE admins) is a different
 * rule and must not use this helper.
 */
export function isPageManager(
  page: { ownerId: string; editorIds?: string[] } | null | undefined,
  user: { id: string; role?: string } | null | undefined,
): boolean {
  if (!page || !user) return false;
  return (
    page.ownerId === user.id ||
    (page.editorIds?.includes(user.id) ?? false) ||
    user.role === "admin"
  );
}
