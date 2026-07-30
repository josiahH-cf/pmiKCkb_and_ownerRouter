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
import {
  type RuntimeSuspensionChangeRecord,
  listRuntimeSuspensionChanges,
} from "@/lib/firestore/runtime-action-suspensions";

// LR-02 (admin-audit): the merge is a pure function (unit-tested directly); readAdminActivityLog is
// tested by mocking the three list readers, which use orderBy/limit and so are not FakeFirestore-able.
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
vi.mock("@/lib/firestore/runtime-action-suspensions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/firestore/runtime-action-suspensions")>();
  return { ...actual, listRuntimeSuspensionChanges: vi.fn() };
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

function runtimeSuspensionRecord(
  over: Partial<RuntimeSuspensionChangeRecord> &
    Pick<RuntimeSuspensionChangeRecord, "operation_id" | "created_at">,
): RuntimeSuspensionChangeRecord {
  return {
    actor_uid: "admin-1",
    actor_email: "admin@pmikcmetro.com",
    action_key: "gmail.renewal_notice.draft_create",
    previous_state: "clear",
    new_state: "suspended",
    reason_code: "provider_outage",
    new_suspension_id: "0198f2c8-4f89-7a20-8f61-1e1d42af3ff2",
    ...over,
  };
}

describe("mergeAdminActivity (LR-02)", () => {
  it("merges access + suspension records newest-first and bounds to the limit", () => {
    const merged = mergeAdminActivity(
      [roleRecord({ id: "r1", created_at: "2026-07-10T10:00:00.000Z" })],
      [
        scopeRecord({ id: "s1", created_at: "2026-07-12T10:00:00.000Z" }),
        scopeRecord({ id: "s2", created_at: "2026-07-08T10:00:00.000Z" }),
      ],
      [
        runtimeSuspensionRecord({
          operation_id: "0198f2c8-4f89-7a20-8f61-1e1d42af3ff3",
          created_at: "2026-07-13T10:00:00.000Z",
        }),
      ],
      3,
    );
    expect(merged.map((entry) => entry.id)).toEqual([
      "runtime_suspension:0198f2c8-4f89-7a20-8f61-1e1d42af3ff3",
      "scope:s1",
      "role:r1",
    ]);
    expect(merged).toHaveLength(3);
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
      [],
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
      [],
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
      [],
    );
    expect(invalidPrior.summary).toContain("previous access setting was unreadable");
  });

  it("maps only fixed suspension reason labels and carries an opaque incident reference", () => {
    const [stopped, cleared] = mergeAdminActivity(
      [],
      [],
      [
        runtimeSuspensionRecord({
          operation_id: "0198f2c8-4f89-7a20-8f61-1e1d42af3ff4",
          created_at: "2026-07-30T12:00:00.000Z",
          incident_ref: "INC-2048",
        }),
        runtimeSuspensionRecord({
          operation_id: "0198f2c8-4f89-7a20-8f61-1e1d42af3ff5",
          created_at: "2026-07-30T11:00:00.000Z",
          previous_state: "suspended",
          new_state: "clear",
          reason_code: "incident_resolved",
          new_suspension_id: undefined,
        }),
      ],
    );

    expect(stopped).toMatchObject({
      kind: "runtime_suspension",
      summary: "Production action stopped",
      reason: "Provider outage",
      incidentRef: "INC-2048",
    });
    expect(cleared).toMatchObject({
      kind: "runtime_suspension",
      summary: "Production action stop cleared",
      reason: "Incident resolved",
    });
  });
});

describe("readAdminActivityLog (LR-02)", () => {
  it("reads all audit collections and merges them newest-first", async () => {
    vi.mocked(listAdminRoleChanges).mockResolvedValue([
      roleRecord({ id: "r1", created_at: "2026-07-09T00:00:00.000Z" }),
    ]);
    vi.mocked(listAdminScopeChanges).mockResolvedValue([
      scopeRecord({ id: "s1", created_at: "2026-07-11T00:00:00.000Z" }),
    ]);
    vi.mocked(listRuntimeSuspensionChanges).mockResolvedValue([
      runtimeSuspensionRecord({
        operation_id: "0198f2c8-4f89-7a20-8f61-1e1d42af3ff6",
        created_at: "2026-07-12T00:00:00.000Z",
      }),
    ]);

    const entries = await readAdminActivityLog({ limit: 25 });
    expect(entries.map((entry) => entry.id)).toEqual([
      "runtime_suspension:0198f2c8-4f89-7a20-8f61-1e1d42af3ff6",
      "scope:s1",
      "role:r1",
    ]);
    expect(listAdminRoleChanges).toHaveBeenCalledWith(25, undefined);
    expect(listAdminScopeChanges).toHaveBeenCalledWith(25, undefined);
    expect(listRuntimeSuspensionChanges).toHaveBeenCalledWith(25, undefined);
  });
});
