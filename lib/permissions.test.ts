import { describe, expect, it } from "vitest";
import { isPageManager } from "./permissions";

const OWNER = { id: "owner-1", role: "user" };
const EDITOR = { id: "editor-1", role: "user" };
const ADMIN = { id: "admin-1", role: "admin" };
const STRANGER = { id: "stranger-1", role: "user" };

const PAGE = { ownerId: "owner-1", editorIds: ["editor-1", "editor-2"] };

describe("isPageManager", () => {
  it("grants the owner", () => {
    expect(isPageManager(PAGE, OWNER)).toBe(true);
  });

  it("grants an editor", () => {
    expect(isPageManager(PAGE, EDITOR)).toBe(true);
  });

  it("grants any platform admin, even when not owner or editor", () => {
    expect(isPageManager(PAGE, ADMIN)).toBe(true);
    // An admin manages a page with no editors and a different owner.
    expect(isPageManager({ ownerId: "someone-else" }, ADMIN)).toBe(true);
  });

  it("denies an unrelated signed-in user", () => {
    expect(isPageManager(PAGE, STRANGER)).toBe(false);
  });

  it("denies when there is no user", () => {
    expect(isPageManager(PAGE, null)).toBe(false);
    expect(isPageManager(PAGE, undefined)).toBe(false);
  });

  it("denies when there is no page", () => {
    expect(isPageManager(null, OWNER)).toBe(false);
    expect(isPageManager(undefined, ADMIN)).toBe(false);
  });

  it("handles a page with no editorIds", () => {
    const page = { ownerId: "owner-1" };
    expect(isPageManager(page, OWNER)).toBe(true);
    expect(isPageManager(page, EDITOR)).toBe(false);
    expect(isPageManager(page, STRANGER)).toBe(false);
  });

  it("handles an empty editor list", () => {
    const page = { ownerId: "owner-1", editorIds: [] };
    expect(isPageManager(page, EDITOR)).toBe(false);
    expect(isPageManager(page, OWNER)).toBe(true);
  });

  it("does not grant a user with an undefined role unless owner/editor", () => {
    expect(isPageManager(PAGE, { id: "nobody" })).toBe(false);
    expect(isPageManager(PAGE, { id: "owner-1" })).toBe(true);
  });
});
