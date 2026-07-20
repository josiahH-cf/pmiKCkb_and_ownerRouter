import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firestore/admin-scope-changes", () => ({
  recordAdminScopeChange: vi.fn(async () => {}),
}));

import {
  type AdminAuthLike,
  UserManagementError,
  listAppUsers,
  setAppUserScopes,
} from "@/lib/admin/users";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { SpaceScope } from "@/lib/constants";
import { recordAdminScopeChange } from "@/lib/firestore/admin-scope-changes";

interface FakeUser {
  uid: string;
  email?: string;
  disabled?: boolean;
  customClaims?: Record<string, unknown> | null;
  metadata?: { lastSignInTime?: string | null };
}

function fakeAuth(users: FakeUser[]) {
  const store = new Map(users.map((user) => [user.uid, { ...user }]));
  const setSpy = vi.fn(async (uid: string, claims: Record<string, unknown>) => {
    const record = store.get(uid);
    if (record) record.customClaims = claims;
  });
  const getSpy = vi.fn(async (uid: string) => {
    const record = store.get(uid);
    if (!record) throw new Error("not found");
    return record;
  });
  const auth: AdminAuthLike = {
    listUsers: async () => ({ users: [...store.values()] }),
    getUser: getSpy,
    setCustomUserClaims: setSpy,
  };
  return { auth, getSpy, setSpy, store };
}

const adminActor: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

afterEach(() => {
  vi.mocked(recordAdminScopeChange).mockClear();
});

describe("admin user scope roster", () => {
  it("maps valid, wildcard, and malformed claims without presenting malformed as All", async () => {
    const { auth } = fakeAuth([
      {
        uid: "scoped",
        email: "scoped@pmikcmetro.com",
        customClaims: { role: "Editor", scopes: ["maintenance"] },
      },
      {
        uid: "wildcard",
        email: "wildcard@pmikcmetro.com",
        customClaims: { role: "Approver" },
      },
      {
        uid: "invalid",
        email: "invalid@pmikcmetro.com",
        customClaims: { role: "Editor", scopes: [] },
      },
    ]);

    const users = await listAppUsers(auth);
    expect(users.find((user) => user.uid === "scoped")?.scopes).toEqual(["maintenance"]);
    expect(users.find((user) => user.uid === "wildcard")?.scopes).toBeUndefined();
    expect(users.find((user) => user.uid === "wildcard")?.scopeClaimInvalid).toBe(false);
    expect(users.find((user) => user.uid === "invalid")).toMatchObject({
      scopes: undefined,
      scopeClaimInvalid: true,
    });
  });
});

describe("setAppUserScopes", () => {
  it("requires manageAdmin before reading or writing the target", async () => {
    const { auth, getSpy, setSpy } = fakeAuth([
      { uid: "u1", email: "u1@pmikcmetro.com", customClaims: { role: "Editor" } },
    ]);
    await expect(
      setAppUserScopes(
        {
          actor: { ...adminActor, role: "Approver" },
          targetUid: "u1",
          scopes: ["maintenance"],
          reason: "maintenance worker",
        },
        auth,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(getSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("rejects a short reason, an empty scope set, and an unknown scope", async () => {
    const { auth, setSpy } = fakeAuth([
      { uid: "u1", email: "u1@pmikcmetro.com", customClaims: { role: "Editor" } },
    ]);

    await expect(
      setAppUserScopes(
        { actor: adminActor, targetUid: "u1", scopes: ["maintenance"], reason: "x" },
        auth,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      setAppUserScopes(
        { actor: adminActor, targetUid: "u1", scopes: [], reason: "limit access" },
        auth,
      ),
    ).rejects.toBeInstanceOf(UserManagementError);
    await expect(
      setAppUserScopes(
        {
          actor: adminActor,
          targetUid: "u1",
          scopes: ["unknown" as SpaceScope],
          reason: "limit access",
        },
        auth,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("refuses a target outside the allowed Workspace domain", async () => {
    const { auth, setSpy } = fakeAuth([
      { uid: "u1", email: "outsider@gmail.com", customClaims: { role: "Editor" } },
    ]);
    await expect(
      setAppUserScopes(
        {
          actor: adminActor,
          targetUid: "u1",
          scopes: ["maintenance"],
          reason: "maintenance worker",
        },
        auth,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("preserves the role and unrelated claims and appends exactly one complete audit", async () => {
    const { auth, setSpy } = fakeAuth([
      {
        uid: "u1",
        email: "worker@pmikcmetro.com",
        customClaims: {
          role: "Editor",
          scopes: ["renewals"],
          feature_flag: "keep-me",
        },
      },
    ]);

    const updated = await setAppUserScopes(
      {
        actor: adminActor,
        targetUid: "u1",
        scopes: ["maintenance"],
        reason: " maintenance sub-user ",
      },
      auth,
    );

    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith("u1", {
      role: "Editor",
      scopes: ["maintenance"],
      feature_flag: "keep-me",
    });
    expect(updated).toMatchObject({ role: "Editor", scopes: ["maintenance"] });
    expect(recordAdminScopeChange).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordAdminScopeChange).mock.calls[0][0]).toEqual({
      actor_uid: "admin-1",
      actor_email: "admin@pmikcmetro.com",
      target_uid: "u1",
      target_email: "worker@pmikcmetro.com",
      previous_scopes: ["renewals"],
      previous_scope_claim_invalid: false,
      new_scopes: ["maintenance"],
      reason: "maintenance sub-user",
    });
  });

  it("clears only the scopes claim for All spaces and audits null as the wildcard", async () => {
    const { auth, setSpy } = fakeAuth([
      {
        uid: "u1",
        email: "worker@pmikcmetro.com",
        customClaims: { role: "Approver", scopes: ["maintenance"], marker: true },
      },
    ]);

    const updated = await setAppUserScopes(
      {
        actor: adminActor,
        targetUid: "u1",
        scopes: undefined,
        reason: "restore all spaces",
      },
      auth,
    );

    expect(setSpy).toHaveBeenCalledWith("u1", { role: "Approver", marker: true });
    expect(updated.role).toBe("Approver");
    expect(updated.scopes).toBeUndefined();
    expect(vi.mocked(recordAdminScopeChange).mock.calls[0][0]).toMatchObject({
      previous_scopes: ["maintenance"],
      previous_scope_claim_invalid: false,
      new_scopes: null,
    });
  });

  it("repairs a malformed claim to an explicit scope without auditing raw garbage", async () => {
    const { auth, setSpy } = fakeAuth([
      {
        uid: "u1",
        email: "worker@pmikcmetro.com",
        customClaims: {
          role: "Editor",
          scopes: ["malformed-private-value"],
          marker: true,
        },
      },
    ]);

    const updated = await setAppUserScopes(
      {
        actor: adminActor,
        targetUid: "u1",
        scopes: ["maintenance"],
        reason: "repair invalid scope",
      },
      auth,
    );

    expect(setSpy).toHaveBeenCalledWith("u1", {
      role: "Editor",
      scopes: ["maintenance"],
      marker: true,
    });
    expect(updated).toMatchObject({
      scopes: ["maintenance"],
      scopeClaimInvalid: false,
    });
    expect(recordAdminScopeChange).toHaveBeenCalledTimes(1);
    const auditInput = vi.mocked(recordAdminScopeChange).mock.calls[0][0];
    expect(auditInput).toMatchObject({
      previous_scopes: null,
      previous_scope_claim_invalid: true,
      new_scopes: ["maintenance"],
    });
    expect(JSON.stringify(auditInput)).not.toContain("malformed-private-value");
  });

  it("repairs a malformed claim to All spaces while preserving the invalid marker", async () => {
    const { auth, setSpy } = fakeAuth([
      {
        uid: "u1",
        email: "worker@pmikcmetro.com",
        customClaims: { role: "Approver", scopes: [], marker: true },
      },
    ]);

    const updated = await setAppUserScopes(
      {
        actor: adminActor,
        targetUid: "u1",
        scopes: undefined,
        reason: "repair to all spaces",
      },
      auth,
    );

    expect(setSpy).toHaveBeenCalledWith("u1", { role: "Approver", marker: true });
    expect(updated).toMatchObject({
      role: "Approver",
      scopeClaimInvalid: false,
    });
    expect(updated.scopes).toBeUndefined();
    expect(recordAdminScopeChange).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordAdminScopeChange).mock.calls[0][0]).toMatchObject({
      previous_scopes: null,
      previous_scope_claim_invalid: true,
      new_scopes: null,
    });
  });

  it("aborts with the claim untouched when the audit write fails (LR-01, no un-audited change)", async () => {
    const { auth, setSpy } = fakeAuth([
      {
        uid: "u1",
        email: "worker@pmikcmetro.com",
        customClaims: { role: "Approver", scopes: ["renewals"], marker: true },
      },
    ]);
    vi.mocked(recordAdminScopeChange).mockRejectedValueOnce(
      new Error("firestore unavailable"),
    );

    await expect(
      setAppUserScopes(
        {
          actor: adminActor,
          targetUid: "u1",
          scopes: ["maintenance"],
          reason: "maintenance assignment",
        },
        auth,
      ),
    ).rejects.toMatchObject({ status: 500 });

    // The audit record is written before the claim, so a failed audit leaves the claim untouched:
    // setCustomUserClaims must never have run, meaning no un-audited scope change can exist.
    expect(setSpy).not.toHaveBeenCalled();
    expect(recordAdminScopeChange).toHaveBeenCalledTimes(1);
  });
});
