import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  authErrorResponse,
  hasSpaceAccess,
  requireCapabilityInSpace,
  requireSpaceAccess,
  setAuthResolverForTest,
  validateAuthClaims,
} from "@/lib/auth/session";
import { SPACE_SCOPES, SPACE_SCOPE_HOME, type SpaceScope } from "@/lib/constants";

const originalAllowedHd = process.env.ALLOWED_HD;

beforeEach(() => {
  process.env.ALLOWED_HD = "pmikcmetro.com";
});

afterEach(() => {
  process.env.ALLOWED_HD = originalAllowedHd;
  setAuthResolverForTest(null);
});

describe("space-scope authorization core", () => {
  it("treats an absent scope claim as the backward-compatible all-spaces wildcard", () => {
    const user = validateAuthClaims({
      uid: "existing-editor",
      email: "existing-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    });

    expect(user.scopes).toBeUndefined();
    expect(hasSpaceAccess(user, "renewals")).toBe(true);
    expect(hasSpaceAccess(user, "maintenance")).toBe(true);
  });

  it("freezes and canonicalizes the scope authority objects at runtime", () => {
    const user = validateAuthClaims({
      uid: "scoped-editor",
      email: "scoped-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance", "maintenance"],
    });

    expect(user.scopes).toEqual(["maintenance"]);
    expect(Object.isFrozen(user.scopes)).toBe(true);
    expect(Object.isFrozen(SPACE_SCOPES)).toBe(true);
    expect(Object.isFrozen(SPACE_SCOPE_HOME)).toBe(true);
    expect(() => (user.scopes as SpaceScope[]).push("renewals")).toThrow();
    expect(hasSpaceAccess(user, "renewals")).toBe(false);
  });

  it("allows the assigned space and denies every unassigned space", async () => {
    setAuthResolverForTest(() => ({
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
    }));

    await expect(requireSpaceAccess("maintenance")).resolves.toMatchObject({
      scopes: ["maintenance"],
    });
    await expect(requireSpaceAccess("renewals")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("returns the observable JSON 403 shape for an API scope miss", async () => {
    setAuthResolverForTest(() => ({
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
    }));

    let response: Response | undefined;

    try {
      await requireCapabilityInSpace("edit", "renewals");
    } catch (error) {
      response = authErrorResponse(error);
    }

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "This user is not authorized for the requested space.",
    });
  });

  it("never lets an in-scope assignment grant a capability denied by the role", async () => {
    setAuthResolverForTest(() => ({
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
    }));

    await expect(
      requireCapabilityInSpace("approve", "maintenance"),
    ).rejects.toMatchObject({ status: 403 });
  });
});
