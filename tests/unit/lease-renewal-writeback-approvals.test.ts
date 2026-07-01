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
  decideWritebackApproval,
  getWritebackApproval,
  listWritebackApprovalActivity,
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
