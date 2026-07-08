import { afterEach, describe, expect, it, vi } from "vitest";

// Avoid any Firestore write: the audit record is asserted via the mock.
vi.mock("@/lib/firestore/admin-role-changes", () => ({
  recordAdminRoleChange: vi.fn(async () => {}),
}));

import {
  type AdminAuthLike,
  UserManagementError,
  listAppUsers,
  setAppUserRole,
} from "@/lib/admin/users";
import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { recordAdminRoleChange } from "@/lib/firestore/admin-role-changes";

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
  const auth: AdminAuthLike = {
    listUsers: async () => ({ users: [...store.values()] }),
    getUser: async (uid: string) => {
      const record = store.get(uid);
      if (!record) throw new Error("not found");
      return record;
    },
    setCustomUserClaims: setSpy,
  };
  return { auth, setSpy, store };
}

const actor: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
};

afterEach(() => {
  vi.mocked(recordAdminRoleChange).mockClear();
});

describe("listAppUsers", () => {
  it("maps claims to roles (defaulting Editor), sorts by email, and drops users with no email", async () => {
    const { auth } = fakeAuth([
      { uid: "b", email: "zed@pmikcmetro.com", customClaims: { role: "Approver" } },
      { uid: "a", email: "amy@pmikcmetro.com", customClaims: null },
      { uid: "c", email: undefined, customClaims: { role: "Admin" } },
    ]);

    const users = await listAppUsers(auth);

    expect(users.map((user) => user.email)).toEqual([
      "amy@pmikcmetro.com",
      "zed@pmikcmetro.com",
    ]);
    expect(users[0].role).toBe("Editor");
    expect(users[1].role).toBe("Approver");
  });
});

describe("setAppUserRole", () => {
  it("rejects an invalid role", async () => {
    const { auth, setSpy } = fakeAuth([{ uid: "u1", email: "u1@pmikcmetro.com" }]);
    await expect(
      setAppUserRole(
        { actor, targetUid: "u1", role: "Boss" as unknown as Role, reason: "x" },
        auth,
      ),
    ).rejects.toBeInstanceOf(UserManagementError);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("requires a plain-English reason", async () => {
    const { auth } = fakeAuth([{ uid: "u1", email: "u1@pmikcmetro.com" }]);
    await expect(
      setAppUserRole({ actor, targetUid: "u1", role: "Approver", reason: "  " }, auth),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a target outside the allowed domain", async () => {
    const { auth, setSpy } = fakeAuth([{ uid: "u1", email: "outsider@gmail.com" }]);
    await expect(
      setAppUserRole(
        { actor, targetUid: "u1", role: "Approver", reason: "promote" },
        auth,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("blocks removing the last Admin", async () => {
    const { auth, setSpy } = fakeAuth([
      { uid: "u1", email: "only-admin@pmikcmetro.com", customClaims: { role: "Admin" } },
      { uid: "u2", email: "editor@pmikcmetro.com", customClaims: { role: "Editor" } },
    ]);
    await expect(
      setAppUserRole(
        { actor, targetUid: "u1", role: "Editor", reason: "step down" },
        auth,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("promotes a user, records the audit, and returns the updated row", async () => {
    const { auth, setSpy } = fakeAuth([
      { uid: "u1", email: "editor@pmikcmetro.com", customClaims: { role: "Editor" } },
    ]);
    const updated = await setAppUserRole(
      { actor, targetUid: "u1", role: "Admin", reason: "needs to approve renewals" },
      auth,
    );

    expect(updated).toMatchObject({
      uid: "u1",
      email: "editor@pmikcmetro.com",
      role: "Admin",
    });
    expect(setSpy).toHaveBeenCalledWith("u1", { role: "Admin" });
    expect(recordAdminRoleChange).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordAdminRoleChange).mock.calls[0][0]).toMatchObject({
      actor_uid: "admin-1",
      target_uid: "u1",
      previous_role: "Editor",
      new_role: "Admin",
      reason: "needs to approve renewals",
    });
  });

  it("allows demoting an Admin when another Admin remains", async () => {
    const { auth, setSpy } = fakeAuth([
      { uid: "u1", email: "admin-a@pmikcmetro.com", customClaims: { role: "Admin" } },
      { uid: "u2", email: "admin-b@pmikcmetro.com", customClaims: { role: "Admin" } },
    ]);
    const updated = await setAppUserRole(
      { actor, targetUid: "u1", role: "Approver", reason: "reduce admin count" },
      auth,
    );
    expect(updated.role).toBe("Approver");
    expect(setSpy).toHaveBeenCalledWith("u1", { role: "Approver" });
  });
});
