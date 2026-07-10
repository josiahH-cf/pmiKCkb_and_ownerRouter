import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it } from "vitest";

import type { Role } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  LEASE_RENEWAL_COLLECTIONS,
  resolutionDocId,
} from "@/lib/firestore/lease-renewal-resolutions";
import {
  DecideWritebackApprovalInputSchema,
  LEASE_RENEWAL_WRITEBACK_COLLECTIONS,
  decideWritebackApproval,
  decideWritebackApprovalsBulk,
  getWritebackApproval,
  listWritebackApprovalActivity,
  listWritebackApprovalActivityForRun,
  listWritebackApprovalsForRun,
} from "@/lib/firestore/lease-renewal-writeback-approvals";
import type { LeaseRenewalResolutionRecord } from "@/lib/firestore/types";
import { FakeFirestore } from "../helpers/fake-firestore";

function userWith(role: Role, uid: string): AuthenticatedUser {
  return { uid, email: `${uid}@example.com`, hd: "example.com", role };
}

const admin = userWith("Admin", "admin-1");
const approver = userWith("Approver", "approver-1");

const RUN_ID = "run-1";
const KEY = "lease_renewal:reconcile:run-1:current_rent";

function seedResolution(
  db: FakeFirestore,
  overrides: Partial<LeaseRenewalResolutionRecord> = {},
): LeaseRenewalResolutionRecord {
  const docId = resolutionDocId(KEY);
  const record: LeaseRenewalResolutionRecord = {
    id: docId,
    source_trigger_key: KEY,
    run_id: RUN_ID,
    field_key: "current_rent",
    field_label: "Current rent",
    severity: "High",
    status: "Resolved",
    resolution_kind: "pick_source",
    chosen_source: "rentvine",
    reason: "RentVine is authoritative.",
    resolved_by_uid: "approver-1",
    proposed_writeback: {
      field_key: "current_rent",
      value: "1500",
      source_of_value: "rentvine",
      status: "Queued",
      production_allowed: false,
    },
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
  db.seed(
    `${LEASE_RENEWAL_COLLECTIONS.resolutions}/${docId}`,
    record as unknown as Record<string, unknown>,
  );
  return record;
}

let db: FakeFirestore;

beforeEach(() => {
  db = new FakeFirestore();
});

function fs(): Firestore {
  return db as unknown as Firestore;
}

function decide(
  actor: AuthenticatedUser,
  decision: "approve" | "return",
  reason = "Recorded for audit.",
) {
  return decideWritebackApproval(
    actor,
    { run_id: RUN_ID, source_trigger_key: KEY, decision, reason },
    fs(),
  );
}

describe("decideWritebackApproval", () => {
  it("approves a queued proposal, records who/why, and never executes", async () => {
    seedResolution(db);

    const approval = await decide(
      admin,
      "approve",
      "RentVine is the authoritative rent.",
    );

    expect(approval.state).toBe("Approved");
    expect(approval.production_allowed).toBe(false);
    expect(approval.executed).toBe(false);
    expect(approval.decided_by_uid).toBe("admin-1");
    expect(approval.proposed_value).toBe("1500");
    expect(approval.source_of_value).toBe("rentvine");
    expect(approval.reason).toBe("RentVine is the authoritative rent.");

    const activity = await listWritebackApprovalActivity(admin, KEY, fs());
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ action: "approve", new_state: "Approved" });
    expect(activity[0].previous_state).toBeUndefined();
  });

  it("supports a one-tap approve by stamping the reused reason-code label on its distinct audit records", async () => {
    seedResolution(db, {
      severity: "Medium",
      reason: "Accepted the suggested source",
      reason_code: "accepted_suggestion",
    });

    const approval = await decideWritebackApproval(
      admin,
      {
        run_id: RUN_ID,
        source_trigger_key: KEY,
        decision: "approve",
        reason_code: "accepted_suggestion",
      },
      fs(),
    );

    expect(approval).toMatchObject({
      state: "Approved",
      reason: "Accepted the suggested source",
      reason_code: "accepted_suggestion",
      decided_by_uid: "admin-1",
      production_allowed: false,
      executed: false,
    });

    const activity = await listWritebackApprovalActivity(admin, KEY, fs());
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({
      action: "approve",
      reason: "Accepted the suggested source",
      reason_code: "accepted_suggestion",
      actor_uid: "admin-1",
    });

    // Same deterministic id, separate collections and separate human decisions/timestamps.
    const docId = resolutionDocId(KEY);
    const resolutionRecord = db.store.get(
      `${LEASE_RENEWAL_COLLECTIONS.resolutions}/${docId}`,
    );
    const approvalRecord = db.store.get(
      `${LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals}/${docId}`,
    );
    expect(resolutionRecord).toMatchObject({ resolved_by_uid: "approver-1" });
    expect(approvalRecord).toMatchObject({ decided_by_uid: "admin-1" });
    expect(resolutionRecord?.updated_at).toBe("2026-07-01T00:00:00.000Z");
    expect(approvalRecord?.updated_at).toBe("2026-05-27T00:00:00.000Z");
  });

  it("confines code-only approval to the Low/Medium accepted-suggestion follow-on", async () => {
    seedResolution(db, {
      severity: "High",
      reason: "Accepted the suggested source",
      reason_code: "accepted_suggestion",
    });

    await expect(
      decideWritebackApproval(
        admin,
        {
          run_id: RUN_ID,
          source_trigger_key: KEY,
          decision: "approve",
          reason_code: "accepted_suggestion",
        },
        fs(),
      ),
    ).rejects.toThrow("A plain-English reason is required.");
  });

  it("refuses a code-only approval that does not reuse the stamped resolution code", async () => {
    seedResolution(db, {
      severity: "Medium",
      reason: "Accepted the suggested source",
      reason_code: "accepted_suggestion",
    });

    await expect(
      decideWritebackApproval(
        admin,
        {
          run_id: RUN_ID,
          source_trigger_key: KEY,
          decision: "approve",
          reason_code: "stale_source",
        },
        fs(),
      ),
    ).rejects.toThrow("A plain-English reason is required.");
  });

  it("is Admin-only — an Approver cannot authorize a write-back", async () => {
    seedResolution(db);
    await expect(decide(approver, "approve")).rejects.toThrow(EditableLayerError);
    expect(await getWritebackApproval(admin, KEY, fs())).toBeNull();
  });

  it("refuses to approve when no resolution queued a proposal", async () => {
    // No resolution seeded.
    await expect(decide(admin, "approve")).rejects.toThrow(/Resolve it/);
  });

  it("refuses to approve a dismissed flag (no queued proposed write-back)", async () => {
    seedResolution(db, {
      status: "Dismissed",
      resolution_kind: "flag_incorrect",
      proposed_writeback: undefined,
      chosen_source: undefined,
    });
    await expect(decide(admin, "approve")).rejects.toThrow(/no queued write-back/);
  });

  it("rejects a run_id that does not match the resolution", async () => {
    seedResolution(db);
    await expect(
      decideWritebackApproval(
        admin,
        {
          run_id: "other-run",
          source_trigger_key: KEY,
          decision: "approve",
          reason: "x",
        },
        fs(),
      ),
    ).rejects.toThrow(/different run/);
  });

  it("requires a plain-English reason", async () => {
    seedResolution(db);
    await expect(
      decideWritebackApproval(
        admin,
        { run_id: RUN_ID, source_trigger_key: KEY, decision: "approve", reason: "   " },
        fs(),
      ),
    ).rejects.toThrow();
  });

  it("requires free text for a return even when a reason code is present", () => {
    expect(() =>
      DecideWritebackApprovalInputSchema.parse({
        run_id: RUN_ID,
        source_trigger_key: KEY,
        decision: "return",
        reason_code: "accepted_suggestion",
      }),
    ).toThrow("A plain-English reason is required.");
  });

  it("refuses an approve when neither free text nor a reason code is present", () => {
    expect(() =>
      DecideWritebackApprovalInputSchema.parse({
        run_id: RUN_ID,
        source_trigger_key: KEY,
        decision: "approve",
      }),
    ).toThrow("A plain-English reason is required.");
  });

  it("rejects a double-approve (already approved is terminal until re-resolved)", async () => {
    seedResolution(db);
    await decide(admin, "approve");
    await expect(decide(admin, "approve")).rejects.toThrow(EditableLayerError);
  });

  it("revokes an approval (Approved → Returned) without executing anything", async () => {
    seedResolution(db);
    await decide(admin, "approve");
    const revoked = await decide(admin, "return", "Owner changed their mind.");
    expect(revoked.state).toBe("Returned for Revision");

    const activity = await listWritebackApprovalActivity(admin, KEY, fs());
    expect(activity).toHaveLength(2);
    expect(activity[1]).toMatchObject({
      action: "return",
      previous_state: "Approved",
      new_state: "Returned for Revision",
    });
  });

  it("treats a re-resolution that changed the proposed value as a fresh decision (stale approval)", async () => {
    seedResolution(db);
    await decide(admin, "approve");

    // A later re-resolution changed the queued value; the old approval is now stale.
    seedResolution(db, {
      proposed_writeback: {
        field_key: "current_rent",
        value: "1600",
        source_of_value: "corrected_value",
        status: "Queued",
        production_allowed: false,
      },
    });

    // Re-approving is allowed (the stale approval does not block it) and snapshots the new value.
    const reapproved = await decide(admin, "approve", "Approving the corrected value.");
    expect(reapproved.state).toBe("Approved");
    expect(reapproved.proposed_value).toBe("1600");
    expect(reapproved.source_of_value).toBe("corrected_value");
  });

  it("lists approvals for a run", async () => {
    seedResolution(db);
    await decide(admin, "approve");
    const approvals = await listWritebackApprovalsForRun(admin, RUN_ID, fs());
    expect(approvals).toHaveLength(1);
    expect(approvals[0].source_trigger_key).toBe(KEY);
    expect(approvals[0].production_allowed).toBe(false);
  });
});

const KEY2 = "lease_renewal:reconcile:run-1:renewal_date";

function seedResolutionForKey(
  key: string,
  fieldKey: string,
): LeaseRenewalResolutionRecord {
  const docId = resolutionDocId(key);
  const record: LeaseRenewalResolutionRecord = {
    id: docId,
    source_trigger_key: key,
    run_id: RUN_ID,
    field_key: fieldKey,
    field_label: fieldKey,
    severity: "High",
    status: "Resolved",
    resolution_kind: "pick_source",
    chosen_source: "rentvine",
    reason: "RentVine is authoritative.",
    resolved_by_uid: "approver-1",
    proposed_writeback: {
      field_key: fieldKey,
      value: "1500",
      source_of_value: "rentvine",
      status: "Queued",
      production_allowed: false,
    },
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
  };
  db.seed(
    `${LEASE_RENEWAL_COLLECTIONS.resolutions}/${docId}`,
    record as unknown as Record<string, unknown>,
  );
  return record;
}

describe("decideWritebackApprovalsBulk", () => {
  function bulk(
    actor: AuthenticatedUser,
    keys: string[],
    decision: "approve" | "return" = "approve",
    reason = "Shared bulk reason.",
  ) {
    return decideWritebackApprovalsBulk(
      actor,
      { run_id: RUN_ID, source_trigger_keys: keys, decision, reason },
      fs(),
    );
  }

  it("approves several queued proposals with ONE shared reason, one Activity row each", async () => {
    seedResolution(db); // KEY: current_rent
    seedResolutionForKey(KEY2, "renewal_date");

    const outcome = await bulk(admin, [KEY, KEY2], "approve", "Verified both values.");

    expect(outcome.decided_count).toBe(2);
    expect(outcome.failed_count).toBe(0);
    expect(outcome.results).toEqual([
      { source_trigger_key: KEY, ok: true, state: "Approved" },
      { source_trigger_key: KEY2, ok: true, state: "Approved" },
    ]);

    // The shared reason + decider + no-execute invariants land on EVERY record.
    for (const key of [KEY, KEY2]) {
      const approval = await getWritebackApproval(admin, key, fs());
      expect(approval).toMatchObject({
        state: "Approved",
        reason: "Verified both values.",
        decided_by_uid: "admin-1",
        production_allowed: false,
        executed: false,
      });
      const activity = await listWritebackApprovalActivity(admin, key, fs());
      expect(activity).toHaveLength(1);
      expect(activity[0]).toMatchObject({
        action: "approve",
        reason: "Verified both values.",
        actor_uid: "admin-1",
      });
    }
  });

  it("is Admin-only and fails fast before recording anything", async () => {
    seedResolution(db);
    seedResolutionForKey(KEY2, "renewal_date");
    await expect(bulk(approver, [KEY, KEY2])).rejects.toThrow(EditableLayerError);
    expect(await getWritebackApproval(admin, KEY, fs())).toBeNull();
    expect(await getWritebackApproval(admin, KEY2, fs())).toBeNull();
  });

  it("reports a per-item failure without blocking the other items", async () => {
    seedResolution(db); // Only KEY has a queued proposal; KEY2 has no resolution at all.

    const outcome = await bulk(admin, [KEY, KEY2]);

    expect(outcome.decided_count).toBe(1);
    expect(outcome.failed_count).toBe(1);
    expect(outcome.results[0]).toEqual({
      source_trigger_key: KEY,
      ok: true,
      state: "Approved",
    });
    expect(outcome.results[1].ok).toBe(false);
    expect(outcome.results[1].error).toMatch(/Resolve it/);
    expect(await getWritebackApproval(admin, KEY, fs())).not.toBeNull();
  });

  it("reports an illegal transition (double-approve) per item, deciding the rest", async () => {
    seedResolution(db);
    seedResolutionForKey(KEY2, "renewal_date");
    await decide(admin, "approve", "Already approved earlier."); // KEY is now Approved.

    const outcome = await bulk(admin, [KEY, KEY2]);

    expect(outcome.decided_count).toBe(1);
    expect(outcome.failed_count).toBe(1);
    expect(outcome.results[0].ok).toBe(false);
    expect(outcome.results[0].error).toMatch(/Cannot approve/);
    expect(outcome.results[1]).toEqual({
      source_trigger_key: KEY2,
      ok: true,
      state: "Approved",
    });
  });

  it("dedupes a repeated key so one decision never records two Activity rows", async () => {
    seedResolution(db);

    const outcome = await bulk(admin, [KEY, KEY]);

    expect(outcome.results).toHaveLength(1);
    expect(outcome.decided_count).toBe(1);
    const activity = await listWritebackApprovalActivity(admin, KEY, fs());
    expect(activity).toHaveLength(1);
  });

  it("requires a non-empty shared reason", async () => {
    seedResolution(db);
    await expect(bulk(admin, [KEY], "approve", "   ")).rejects.toThrow();
    expect(await getWritebackApproval(admin, KEY, fs())).toBeNull();
  });

  it("bulk-returns queued proposals (return leg)", async () => {
    seedResolution(db);
    seedResolutionForKey(KEY2, "renewal_date");

    const outcome = await bulk(admin, [KEY, KEY2], "return", "Both need a re-check.");

    expect(outcome.decided_count).toBe(2);
    for (const key of [KEY, KEY2]) {
      const approval = await getWritebackApproval(admin, key, fs());
      expect(approval?.state).toBe("Returned for Revision");
      expect(approval?.reason).toBe("Both need a re-check.");
    }
  });
});

describe("listWritebackApprovalActivityForRun", () => {
  it("requires read and returns an empty map when nothing has been decided", async () => {
    const byKey = await listWritebackApprovalActivityForRun(admin, RUN_ID, fs());
    expect(byKey.size).toBe(0);
  });

  it("groups the whole run's Activity by source_trigger_key in ONE query, newest last", async () => {
    seedResolution(db); // KEY: current_rent
    seedResolutionForKey(KEY2, "renewal_date");

    // KEY gets two decisions (approve → revoke); KEY2 gets one.
    await decide(admin, "approve", "RentVine authoritative.");
    await decide(admin, "return", "Owner changed their mind.");
    await decideWritebackApproval(
      admin,
      {
        run_id: RUN_ID,
        source_trigger_key: KEY2,
        decision: "approve",
        reason: "Confirmed the renewal date.",
      },
      fs(),
    );

    const byKey = await listWritebackApprovalActivityForRun(admin, RUN_ID, fs());

    expect([...byKey.keys()].sort()).toEqual([KEY, KEY2].sort());
    const keyTrail = byKey.get(KEY)!;
    expect(keyTrail).toHaveLength(2);
    // Oldest → newest: the approve is recorded before the revoke.
    expect(keyTrail[0]).toMatchObject({ action: "approve", new_state: "Approved" });
    expect(keyTrail[1]).toMatchObject({
      action: "return",
      previous_state: "Approved",
      new_state: "Returned for Revision",
    });
    expect(keyTrail.every((entry) => entry.run_id === RUN_ID)).toBe(true);

    const key2Trail = byKey.get(KEY2)!;
    expect(key2Trail).toHaveLength(1);
    expect(key2Trail[0]).toMatchObject({ action: "approve", new_state: "Approved" });
  });

  it("does not surface another run's Activity", async () => {
    seedResolution(db);
    await decide(admin, "approve");
    const otherRun = await listWritebackApprovalActivityForRun(admin, "run-other", fs());
    expect(otherRun.size).toBe(0);
  });
});
