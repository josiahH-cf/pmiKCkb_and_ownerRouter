import { describe, expect, it, vi } from "vitest";

import { mergeAdminActivity, readAdminActivityLog } from "@/lib/admin/activity-log";
import {
  type AdminRoleChangeRecord,
  listAdminRoleChanges,
} from "@/lib/firestore/admin-role-changes";
import {
  type AdminScopeChangeRecord,
  listAdminScopeChanges,
} from "@/lib/firestore/admin-scope-changes";

// LR-02 (admin-audit): the merge is a pure function (unit-tested directly); readAdminActivityLog is
// tested by mocking the two list readers, which use orderBy/limit and so are not FakeFirestore-able.
vi.mock("@/lib/firestore/admin-role-changes", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/firestore/admin-role-changes")>();
  return { ...actual, listAdminRoleChanges: vi.fn() };
});
vi.mock("@/lib/firestore/admin-scope-changes", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/firestore/admin-scope-changes")>();
  return { ...actual, listAdminScopeChanges: vi.fn() };
});

function roleRecord(
  over: Partial<AdminRoleChangeRecord> & Pick<AdminRoleChangeRecord, "id" | "created_at">,
): AdminRoleChangeRecord {
  return {
    actor_uid: "admin-1",
    actor_email: "admin@pmikcmetro.com",
    target_uid: "u1",
    target_email: "u1@pmikcmetro.com",
    previous_role: "Editor",
    new_role: "Admin",
    reason: "promote",
    ...over,
  };
}

function scopeRecord(
  over: Partial<AdminScopeChangeRecord> &
    Pick<AdminScopeChangeRecord, "id" | "created_at">,
): AdminScopeChangeRecord {
  return {
    actor_uid: "admin-1",
    actor_email: "admin@pmikcmetro.com",
    target_uid: "u2",
    target_email: "u2@pmikcmetro.com",
    previous_scopes: null,
    previous_scope_claim_invalid: false,
    new_scopes: ["renewals"],
    reason: "narrow",
    ...over,
  };
}

describe("mergeAdminActivity (LR-02)", () => {
  it("merges role + scope records newest-first and bounds to the limit", () => {
    const merged = mergeAdminActivity(
      [roleRecord({ id: "r1", created_at: "2026-07-10T10:00:00.000Z" })],
      [
        scopeRecord({ id: "s1", created_at: "2026-07-12T10:00:00.000Z" }),
        scopeRecord({ id: "s2", created_at: "2026-07-08T10:00:00.000Z" }),
      ],
      2,
    );
    expect(merged.map((entry) => entry.id)).toEqual(["scope:s1", "role:r1"]);
    expect(merged).toHaveLength(2);
  });

  it("summarizes a role change in plain English (no em dash)", () => {
    const [entry] = mergeAdminActivity(
      [
        roleRecord({
          id: "r1",
          created_at: "2026-07-10T10:00:00.000Z",
          previous_role: "Editor",
          new_role: "Approver",
        }),
      ],
      [],
    );
    expect(entry.kind).toBe("role");
    expect(entry.summary).toBe("Role changed from Editor to Approver");
    expect(entry.summary).not.toContain("—");
  });

  it("summarizes scope changes: null/empty is All spaces, and an unreadable prior claim is flagged", () => {
    const [allSpaces] = mergeAdminActivity(
      [],
      [
        scopeRecord({
          id: "s1",
          created_at: "2026-07-10T10:00:00.000Z",
          new_scopes: null,
        }),
      ],
    );
    expect(allSpaces.summary).toBe("Space access set to All spaces");

    const [named] = mergeAdminActivity(
      [],
      [
        scopeRecord({
          id: "s2",
          created_at: "2026-07-10T10:00:00.000Z",
          new_scopes: ["renewals", "maintenance"],
        }),
      ],
    );
    expect(named.summary).toBe("Space access set to renewals, maintenance");

    const [invalidPrior] = mergeAdminActivity(
      [],
      [
        scopeRecord({
          id: "s3",
          created_at: "2026-07-10T10:00:00.000Z",
          new_scopes: ["renewals"],
          previous_scope_claim_invalid: true,
        }),
      ],
    );
    expect(invalidPrior.summary).toContain("previous access setting was unreadable");
  });
});

describe("readAdminActivityLog (LR-02)", () => {
  it("reads both audit collections and merges them newest-first", async () => {
    vi.mocked(listAdminRoleChanges).mockResolvedValue([
      roleRecord({ id: "r1", created_at: "2026-07-09T00:00:00.000Z" }),
    ]);
    vi.mocked(listAdminScopeChanges).mockResolvedValue([
      scopeRecord({ id: "s1", created_at: "2026-07-11T00:00:00.000Z" }),
    ]);

    const entries = await readAdminActivityLog({ limit: 25 });
    expect(entries.map((entry) => entry.id)).toEqual(["scope:s1", "role:r1"]);
    expect(listAdminRoleChanges).toHaveBeenCalledWith(25, undefined);
    expect(listAdminScopeChanges).toHaveBeenCalledWith(25, undefined);
  });
});
