import { describe, expect, it } from "vitest";

import type { AdminAuthLike } from "@/lib/admin/users";
import { readServerConfig } from "@/lib/config/server";
import { isAssignableUser, listAssignableUsers } from "@/lib/maintenance/assignees";

const demoConfig = readServerConfig({ LOCAL_DEMO_AUTH: "true" });
const prodConfig = readServerConfig({}); // localDemoAuth defaults false

function fakeAuth(
  users: Array<{
    uid: string;
    email?: string;
    disabled?: boolean;
    customClaims?: Record<string, unknown> | null;
  }>,
): AdminAuthLike {
  return {
    listUsers: async () => ({ users }),
    getUser: async (uid) => users.find((user) => user.uid === uid) ?? { uid },
    setCustomUserClaims: async () => {},
  };
}

describe("listAssignableUsers", () => {
  it("returns the synthetic demo roster in local-demo mode (so the picker works locally)", async () => {
    const roster = await listAssignableUsers({ config: demoConfig });
    expect(roster.map((user) => user.uid).sort()).toEqual([
      "local-demo-admin",
      "local-demo-approver",
      "local-demo-editor",
    ]);
    expect(roster.every((user) => user.email.endsWith("@pmikcmetro.com"))).toBe(true);
  });

  it("maps the real Firebase Auth roster and drops disabled + emailless + external-domain users in prod", async () => {
    const auth = fakeAuth([
      { uid: "u1", email: "a@pmikcmetro.com" },
      { uid: "u2", email: "b@pmikcmetro.com", disabled: true },
      { uid: "u3" }, // no email -> dropped by listAppUsers
      { uid: "ext", email: "ext@gmail.com" }, // external domain -> excluded (defense in depth)
    ]);
    const roster = await listAssignableUsers({ config: prodConfig, auth });
    expect(roster).toEqual([{ uid: "u1", email: "a@pmikcmetro.com" }]);
  });
});

describe("isAssignableUser", () => {
  it("is true only for a uid in the roster", async () => {
    expect(await isAssignableUser("local-demo-editor", { config: demoConfig })).toBe(
      true,
    );
    expect(await isAssignableUser("nope", { config: demoConfig })).toBe(false);
  });

  it("rejects blank/empty uids (unassign uses null, not '')", async () => {
    expect(await isAssignableUser("", { config: demoConfig })).toBe(false);
    expect(await isAssignableUser("   ", { config: demoConfig })).toBe(false);
  });

  it("rejects a disabled user's uid in prod (not in the assignable roster)", async () => {
    const auth = fakeAuth([{ uid: "off", email: "off@pmikcmetro.com", disabled: true }]);
    expect(await isAssignableUser("off", { config: prodConfig, auth })).toBe(false);
  });

  it("rejects an external-domain uid in prod (never a pickable/assignable user)", async () => {
    const auth = fakeAuth([{ uid: "ext", email: "ext@gmail.com" }]);
    expect(await isAssignableUser("ext", { config: prodConfig, auth })).toBe(false);
  });
});
