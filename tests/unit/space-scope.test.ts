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

// S167: every authenticated internal staff account has every existing internal Space. A scope
// claim left on an account is ignored; the role alone decides what the account may do.
describe("space-scope authorization core", () => {
  it("gives an account without a scope claim every Space", () => {
    const user = validateAuthClaims({
      uid: "existing-editor",
      email: "existing-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    });

    expect(Object.hasOwn(user, "scopes")).toBe(false);
    expect(hasSpaceAccess(user, "renewals")).toBe(true);
    expect(hasSpaceAccess(user, "maintenance")).toBe(true);
  });

  // S167: the claim used to be canonicalized, frozen onto the user and to deny Renewals.
  it("drops a duplicated scope claim from the user and keeps the Space catalog frozen", () => {
    const user = validateAuthClaims({
      uid: "scoped-editor",
      email: "scoped-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance", "maintenance"],
    });

    expect(user).toEqual({
      uid: "scoped-editor",
      email: "scoped-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    });
    expect(Object.isFrozen(SPACE_SCOPES)).toBe(true);
    expect(Object.isFrozen(SPACE_SCOPE_HOME)).toBe(true);
    expect(hasSpaceAccess(user, "maintenance")).toBe(true);
    expect(hasSpaceAccess(user, "renewals")).toBe(true);
  });

  // S167: Renewals used to refuse this account with a 403.
  it("admits a maintenance-only claim account to every Space", async () => {
    setAuthResolverForTest(() => ({
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
    }));

    for (const scope of SPACE_SCOPES) {
      const user = await requireSpaceAccess(scope);
      expect(user).toEqual({
        uid: "maintenance-editor",
        email: "maintenance-editor@pmikcmetro.com",
        hd: "pmikcmetro.com",
        role: "Editor",
      });
    }
  });

  it("admits only a Space that exists, with the observable JSON 403 shape otherwise", async () => {
    setAuthResolverForTest(() => ({
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
    }));

    // S167: an edit in Renewals used to be the 403 Space miss for this account.
    await expect(requireCapabilityInSpace("edit", "renewals")).resolves.toMatchObject({
      role: "Editor",
    });

    let response: Response | undefined;

    try {
      await requireCapabilityInSpace("edit", "not-a-space" as SpaceScope);
    } catch (error) {
      response = authErrorResponse(error);
    }

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "This user is not authorized for the requested space.",
    });
  });

  it("returns the observable JSON 403 shape for a role miss in an open Space", async () => {
    setAuthResolverForTest(() => ({
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
    }));

    let response: Response | undefined;

    try {
      await requireCapabilityInSpace("approve", "renewals");
    } catch (error) {
      response = authErrorResponse(error);
    }

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "This user is not authorized for the requested action.",
    });
  });

  it("never lets an open Space grant a capability denied by the role", async () => {
    setAuthResolverForTest(() => ({
      uid: "maintenance-editor",
      email: "maintenance-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
      scopes: ["maintenance"],
    }));

    for (const scope of SPACE_SCOPES) {
      await expect(requireCapabilityInSpace("approve", scope)).rejects.toMatchObject({
        status: 403,
      });
    }
  });
});
