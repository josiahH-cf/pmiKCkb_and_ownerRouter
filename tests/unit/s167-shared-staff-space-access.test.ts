import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { can } from "@/lib/auth/roles";
import {
  AuthError,
  hasSpaceAccess,
  requireCapability,
  requireCapabilityInSpace,
  setAuthResolverForTest,
  validateAuthClaims,
} from "@/lib/auth/session";
import { SPACE_SCOPES } from "@/lib/constants";
import { resolvePrimaryNavigation } from "@/lib/navigation/primary-navigation";
import {
  canAccessProcessDefinitionId,
  canAccessSpaceId,
  canAccessWorkflowRun,
  scopeAskRequest,
} from "@/lib/space-scope-resources";
import { launchSpaces } from "@/lib/spaces";

// S167: every ordinary authorized staff account reaches every existing internal Space. A scope
// claim left on an existing account no longer narrows access; Admin administration, Vendor
// identities and verification accounts keep their own boundaries.

const originalAllowedHd = process.env.ALLOWED_HD;

beforeEach(() => {
  process.env.ALLOWED_HD = "pmikcmetro.com";
});

afterEach(() => {
  process.env.ALLOWED_HD = originalAllowedHd;
  setAuthResolverForTest(null);
});

const scopedEditorClaims = {
  uid: "existing-scoped-editor",
  email: "existing-scoped-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  scopes: ["maintenance"],
} as const;

const claimlessEditorClaims = {
  uid: "new-editor",
  email: "new-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as const;

describe("S167 shared staff Space access", () => {
  it("BEH-S167-1: an existing scoped staff account reaches every existing internal Space", () => {
    const user = validateAuthClaims(scopedEditorClaims);

    for (const scope of SPACE_SCOPES) {
      expect(hasSpaceAccess(user, scope)).toBe(true);
    }
    for (const space of launchSpaces) {
      expect(canAccessSpaceId(user, space.id)).toBe(true);
    }
  });

  it("BEH-S167-2: existing scoped and newly authorized accounts project the same access", () => {
    const scoped = validateAuthClaims(scopedEditorClaims);
    const claimless = validateAuthClaims(claimlessEditorClaims);

    expect(Object.keys(scoped).sort()).toEqual(Object.keys(claimless).sort());
    expect(resolvePrimaryNavigation(scoped)).toEqual(resolvePrimaryNavigation(claimless));
    expect(canAccessProcessDefinitionId(scoped, "any-custom-definition")).toBe(true);
    expect(canAccessWorkflowRun(scoped, { definition_id: "any-custom-definition" })).toBe(
      true,
    );
    expect(scopeAskRequest(scoped, { space: "move-in" })).toEqual({ space: "move-in" });
  });

  it("BEH-S167-5: API Space checks agree with the session projection for a scoped account", async () => {
    setAuthResolverForTest(() => ({ ...scopedEditorClaims, scopes: ["maintenance"] }));

    await expect(requireCapabilityInSpace("edit", "renewals")).resolves.toMatchObject({
      role: "Editor",
    });
    await expect(requireCapabilityInSpace("edit", "maintenance")).resolves.toMatchObject({
      role: "Editor",
    });
  });

  it("AC-S167-1: a malformed leftover scope claim does not lock a staff account out", () => {
    for (const scopes of [[], ["unknown-space"], "renewals"]) {
      const user = validateAuthClaims({ ...claimlessEditorClaims, scopes });
      expect(hasSpaceAccess(user, "renewals")).toBe(true);
      expect(hasSpaceAccess(user, "maintenance")).toBe(true);
    }
  });

  it("BEH-S167-6: open Spaces grant no administration to ordinary staff", async () => {
    setAuthResolverForTest(() => ({ ...scopedEditorClaims, scopes: ["maintenance"] }));

    expect(can("Editor", "manageAdmin")).toBe(false);
    expect(can("Approver", "manageAdmin")).toBe(false);
    await expect(requireCapability("manageAdmin")).rejects.toMatchObject({ status: 403 });
    await expect(
      requireCapabilityInSpace("manageAdmin", "renewals"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("BEH-S167-7: verification accounts keep their mutation refusal in every Space", async () => {
    setAuthResolverForTest(() => ({
      uid: "canary-editor",
      email: "canary-editor@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    }));

    await expect(requireCapabilityInSpace("read", "renewals")).resolves.toMatchObject({
      role: "Editor",
    });
    await expect(requireCapabilityInSpace("edit", "renewals")).rejects.toMatchObject({
      status: 403,
      code: "canary_read_only",
    });
  });

  it("BEH-S167-8: a Vendor identity still cannot use the internal session", () => {
    for (const vendorClaim of [
      { vendor: true },
      { vendor_id: "vendor-1" },
      { data_mode: "live" },
    ]) {
      let thrown: unknown;
      try {
        validateAuthClaims({ ...claimlessEditorClaims, ...vendorClaim });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(AuthError);
      expect(thrown).toMatchObject({ status: 403, code: "vendor_session" });
    }
  });
});
