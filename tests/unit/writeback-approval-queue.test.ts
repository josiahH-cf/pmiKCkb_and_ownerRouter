import { describe, expect, it } from "vitest";

import {
  buildWritebackApprovalQueue,
  type WritebackApprovalQueue,
} from "@/lib/approval/writeback-approval-queue";
import { renewalRunHref } from "@/lib/approval/renewal-review";
import type {
  RenewalFlagView,
  RenewalRunView,
  RenewalWritebackApprovalView,
} from "@/lib/lease-renewal/run-view";
import type { Severity } from "@/lib/lease-renewal/severity";

// A value-bearing sentinel carried in every flag's IGNORED value-bearing fields so the "value-free"
// assertions can prove the queue never leaks the proposed value, decision reason, or decider.
const SECRET = "SENTINEL_RENT_4242";
const SECRET_REASON = "SENSITIVE_APPROVAL_REASON_9000";
const SECRET_DECIDER = "admin-secret-uid";
const SAFE_RECEIPT_ID = "authorization-receipt-safe-1";

function approvalOverlay(
  state: RenewalWritebackApprovalView["state"] | null,
): RenewalWritebackApprovalView | null {
  if (state === null) return null;
  return {
    queued: true,
    state,
    stale: false,
    authorizationReceiptId: SAFE_RECEIPT_ID,
    decidedByUid: SECRET_DECIDER,
    reason: SECRET_REASON,
    reasonRecorded: true,
    productionAllowed: false,
    executed: false,
    activity: [
      {
        action: "approve",
        decidedByUid: SECRET_DECIDER,
        reason: SECRET_REASON,
        createdAt: "2026-07-01T10:00:00.000Z",
      },
    ],
  };
}

function makeFlag(
  fieldKey: string,
  severity: Severity,
  approvalState: RenewalWritebackApprovalView["state"] | null,
): RenewalFlagView {
  return {
    sourceTriggerKey: `lease_renewal:reconcile:run:${fieldKey}`,
    fieldKey,
    fieldLabel: fieldKey,
    severity,
    agreement: "conflict",
    actionNeeded: `Reconcile ${fieldKey}`,
    directLink: `/lease-renewal/runs/run/reconciliation/${fieldKey}`,
    suggestedWinner: { source: "rentvine", value: SECRET },
    candidates: [
      {
        source: "rentvine",
        sourceSystem: "RentVine",
        value: SECRET,
        confidence: "High",
        locationRef: "ref",
      },
    ],
    resolution: null,
    writeback: {
      fieldKey,
      fieldLabel: fieldKey,
      method: "append_only_column",
      proposedColumnHeader: `KB Proposed — ${fieldKey}`,
      proposedValue: SECRET,
      sourceSystem: "RentVine",
      rationale: `Append "${SECRET}" from RentVine ...`,
      status: "Proposed",
      requiresApproval: true,
      autoApplyAllowed: false,
      suggestionOnly: true,
      valueReady: true,
    } as RenewalFlagView["writeback"],
    writebackApproval: approvalOverlay(approvalState),
  };
}

function makeView(
  runId: string,
  label: string,
  groups: { severity: Severity; flags: RenewalFlagView[] }[],
): RenewalRunView {
  return {
    runId,
    label,
    manifest: {
      tabsRecognized: 0,
      tabsUnrecognized: 0,
      credentialTabsExcluded: 0,
      credentialScrubHits: 0,
      dividerRowsDropped: 0,
      totalRecords: 0,
    },
    excludedTabs: [],
    groups,
    totalFlags: groups.reduce((sum, group) => sum + group.flags.length, 0),
    resolvedCount: 0,
  };
}

function stateGroup(queue: WritebackApprovalQueue, state: string) {
  return queue.groups.find((group) => group.state === state);
}

describe("buildWritebackApprovalQueue", () => {
  it("buckets every queued proposal across runs by approval state, with counts", () => {
    const queue = buildWritebackApprovalQueue([
      makeView("run-a", "Run A", [
        {
          severity: "High",
          flags: [
            makeFlag("current_rent", "High", "Awaiting Approval"),
            makeFlag("renewal_date", "High", "Approved"),
          ],
        },
        {
          severity: "Low",
          flags: [
            makeFlag("address", "Low", null), // no queued proposal → excluded
          ],
        },
      ]),
      makeView("run-b", "Run B", [
        {
          severity: "Medium",
          flags: [makeFlag("lease_start", "Medium", "Returned for Revision")],
        },
      ]),
    ]);

    expect(queue.counts).toEqual({
      awaitingApproval: 1,
      approved: 1,
      returned: 1,
      total: 3,
    });
    expect(queue.groups.map((group) => group.state)).toEqual([
      "Awaiting Approval",
      "Approved",
      "Returned for Revision",
    ]);
    expect(stateGroup(queue, "Awaiting Approval")?.rows).toHaveLength(1);
    expect(stateGroup(queue, "Awaiting Approval")?.rows[0]).toMatchObject({
      fieldKey: "current_rent",
      runId: "run-a",
      runLabel: "Run A",
      state: "Awaiting Approval",
      href: renewalRunHref("run-a"),
    });
    expect(stateGroup(queue, "Returned for Revision")?.rows[0]).toMatchObject({
      runId: "run-b",
      fieldKey: "lease_start",
    });
    expect(stateGroup(queue, "Approved")?.rows[0]).toMatchObject({
      authorizationReceiptId: SAFE_RECEIPT_ID,
      decisionReasonRecorded: true,
      productionAllowed: false,
      executed: false,
    });
  });

  it("orders rows within a bucket most-attention-first (severity, run label, field)", () => {
    const queue = buildWritebackApprovalQueue([
      makeView("run-z", "Zeta run", [
        { severity: "Low", flags: [makeFlag("z_low", "Low", "Awaiting Approval")] },
      ]),
      makeView("run-a", "Alpha run", [
        {
          severity: "High",
          flags: [makeFlag("a_high", "High", "Awaiting Approval")],
        },
        {
          severity: "Blocked",
          flags: [makeFlag("a_blocked", "Blocked", "Awaiting Approval")],
        },
      ]),
    ]);

    const awaiting = stateGroup(queue, "Awaiting Approval");
    // High (rank 0) → Blocked (rank 1) → Low (rank 3); within equal severity, by run label then field.
    expect(awaiting?.rows.map((row) => row.fieldKey)).toEqual([
      "a_high",
      "a_blocked",
      "z_low",
    ]);
  });

  it("never leaks the proposed value, decision reason, decider, or activity", () => {
    const queue = buildWritebackApprovalQueue([
      makeView("run-a", "Run A", [
        {
          severity: "High",
          flags: [
            makeFlag("current_rent", "High", "Approved"),
            makeFlag("renewal_date", "High", "Awaiting Approval"),
          ],
        },
      ]),
    ]);

    const serialized = JSON.stringify(queue);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(SECRET_REASON);
    expect(serialized).not.toContain(SECRET_DECIDER);
    expect(serialized).not.toContain("candidates");
    expect(serialized).not.toContain("suggestedWinner");
    expect(serialized).not.toContain("proposedValue");
    expect(serialized).not.toContain("rationale");
    expect(serialized).not.toContain("decidedByUid");
    expect(serialized).not.toContain("activity");
    expect(serialized).not.toContain("writebackApproval");

    // Pin the EXACT row shape on EVERY row across all groups, so a future value-bearing field is caught
    // structurally — not just on a single representative row.
    const allRows = queue.groups.flatMap((group) => group.rows);
    expect(allRows).toHaveLength(2);
    for (const row of allRows) {
      expect(Object.keys(row).sort()).toEqual([
        "authorizationReceiptId",
        "decisionReasonRecorded",
        "executed",
        "fieldKey",
        "fieldLabel",
        "href",
        "productionAllowed",
        "runId",
        "runLabel",
        "severity",
        "state",
      ]);
    }
  });

  it("returns an empty, well-formed queue when nothing is queued", () => {
    const queue = buildWritebackApprovalQueue([
      makeView("run-a", "Run A", [
        { severity: "Low", flags: [makeFlag("address", "Low", null)] },
      ]),
    ]);

    expect(queue.counts).toEqual({
      awaitingApproval: 0,
      approved: 0,
      returned: 0,
      total: 0,
    });
    // The three state buckets still exist (stable layout), each empty.
    expect(queue.groups.every((group) => group.rows.length === 0)).toBe(true);
  });

  it("returns empty groups for no runs", () => {
    const queue = buildWritebackApprovalQueue([]);
    expect(queue.counts.total).toBe(0);
    expect(queue.groups).toHaveLength(3);
  });
});
