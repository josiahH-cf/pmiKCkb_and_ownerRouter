import { describe, expect, it } from "vitest";

import type { ApprovalQueueActor } from "@/lib/approval/queue";
import { buildNeedsDecisionInbox } from "@/lib/approval/needs-decision-inbox";
import { buildRenewalReviewBoard } from "@/lib/approval/renewal-review";
import { buildWritebackApprovalQueue } from "@/lib/approval/writeback-approval-queue";
import type {
  RenewalFlagView,
  RenewalRunView,
  RenewalWritebackApprovalView,
} from "@/lib/lease-renewal/run-view";
import type { Severity } from "@/lib/lease-renewal/severity";
import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";

// Value-bearing sentinels planted in fields the inbox must NEVER copy, so the "value-free" assertions
// prove the merged surface leaks no proposed value, reason, decider, or assignee uid.
const SECRET = "SENTINEL_RENT_4242";
const SECRET_REASON = "SENSITIVE_APPROVAL_REASON_9000";
const SECRET_DECIDER = "admin-secret-uid";
const ACTOR: ApprovalQueueActor = { role: "Admin", uid: "admin-1" };

function approvalOverlay(
  state: RenewalWritebackApprovalView["state"] | null,
): RenewalWritebackApprovalView | null {
  if (state === null) return null;
  return {
    queued: true,
    state,
    stale: false,
    decidedByUid: SECRET_DECIDER,
    reason: SECRET_REASON,
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
  options: {
    resolved?: boolean;
    approvalState?: RenewalWritebackApprovalView["state"] | null;
  } = {},
): RenewalFlagView {
  const approvalState = options.approvalState ?? null;
  return {
    sourceTriggerKey: `lease_renewal:reconcile:run:${fieldKey}`,
    fieldKey,
    fieldLabel: `Label ${fieldKey}`,
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
    resolution: options.resolved
      ? { status: "Resolved", kind: "pick_source", chosenSource: "rentvine" }
      : null,
    writeback: {
      fieldKey,
      fieldLabel: `Label ${fieldKey}`,
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

function queueItem(
  overrides: Partial<ApprovalQueueItemRecord> = {},
): ApprovalQueueItemRecord {
  const id = overrides.id ?? "item-1";
  return {
    action_needed: `Approve ${id}`,
    assignee_uid: SECRET_DECIDER, // value-bearing sentinel the inbox must not carry
    audience_group: "Dan/Admin decisions",
    created_at: "2026-06-05T00:00:00.000Z",
    direct_link: `/approval-queue?item_id=${id}`,
    id,
    item_type: "ApprovalPackage",
    process_run_ref: { id: "run-1", label: "Process run 1" },
    required_approver_uid: SECRET_DECIDER,
    risk: "Medium",
    source_trigger_key: `trigger-${id}`,
    status: "Ready for Approval",
    updated_at: "2026-06-05T00:00:00.000Z",
    ...overrides,
  };
}

const ROW_KEYS = ["detail", "href", "key", "kind", "label", "severity"];
const QUEUE_ROW_KEYS = [
  "canApproveInline",
  "detail",
  "href",
  "itemId",
  "key",
  "kind",
  "label",
  "severity",
];

describe("buildNeedsDecisionInbox", () => {
  it("merges the three feeds into one attention-ordered, value-free list", () => {
    const views = [
      makeView("run-a", "Run A", [
        { severity: "High", flags: [makeFlag("current_rent", "High")] },
        {
          severity: "Blocked",
          flags: [makeFlag("renewal_date", "Blocked", { resolved: true })], // resolved → excluded
        },
      ]),
    ];
    const inbox = buildNeedsDecisionInbox(
      [queueItem({ id: "q1", risk: "Medium" })],
      buildRenewalReviewBoard(views),
      buildWritebackApprovalQueue(
        // A separate awaiting-approval proposal on a different field.
        [
          makeView("run-a", "Run A", [
            {
              severity: "High",
              flags: [
                makeFlag("lawn_care", "High", {
                  resolved: true,
                  approvalState: "Awaiting Approval",
                }),
              ],
            },
          ]),
        ],
      ),
      ACTOR,
    );

    // High writeback + High open flag + Medium queue item; the resolved renewal_date is excluded.
    expect(inbox.counts).toEqual({
      total: 3,
      renewalFlags: 1,
      writebacksAwaiting: 1,
      queueItems: 1,
    });
    // Severity-first, then kind (writeback before renewal_flag within equal severity).
    expect(inbox.rows.map((r) => r.kind)).toEqual([
      "writeback",
      "renewal_flag",
      "queue_item",
    ]);
    expect(inbox.rows[0]).toMatchObject({ kind: "writeback", severity: "High" });
    expect(inbox.rows[2]).toMatchObject({ kind: "queue_item", label: "Approve q1" });
  });

  it("never leaks a value, reason, decider, or assignee uid, and pins the row shape", () => {
    const views = [
      makeView("run-a", "Run A", [
        { severity: "High", flags: [makeFlag("current_rent", "High")] },
      ]),
      makeView("run-b", "Run B", [
        {
          severity: "Medium",
          flags: [
            makeFlag("lease_start", "Medium", {
              resolved: true,
              approvalState: "Awaiting Approval",
            }),
          ],
        },
      ]),
    ];
    const inbox = buildNeedsDecisionInbox(
      [queueItem({ id: "q1" })],
      buildRenewalReviewBoard(views),
      buildWritebackApprovalQueue(views),
      ACTOR,
    );

    const serialized = JSON.stringify(inbox);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain(SECRET_REASON);
    expect(serialized).not.toContain(SECRET_DECIDER);
    expect(serialized).not.toContain("proposedValue");
    expect(serialized).not.toContain("candidates");
    expect(serialized).not.toContain("assignee");

    expect(inbox.rows.length).toBeGreaterThan(0);
    for (const row of inbox.rows) {
      expect(Object.keys(row).sort()).toEqual(
        row.kind === "queue_item" ? QUEUE_ROW_KEYS : ROW_KEYS,
      );
      if (row.kind === "queue_item") {
        expect(row.itemId).toBe(row.key.slice("queue_item:".length));
        expect(typeof row.canApproveInline).toBe("boolean");
      }
    }
  });

  it("allows inline approval only for Low/Medium Ready queue rows the actor may approve and does not own", () => {
    const approver: ApprovalQueueActor = { role: "Approver", uid: "approver-1" };
    const inbox = buildNeedsDecisionInbox(
      [
        queueItem({
          id: "safe-low",
          assignee_uid: "editor-1",
          required_approver_uid: approver.uid,
          risk: "Low",
        }),
        queueItem({
          id: "safe-medium",
          assignee_uid: "editor-1",
          required_approver_uid: approver.uid,
          risk: "Medium",
        }),
        queueItem({
          id: "high",
          assignee_uid: "editor-1",
          required_approver_uid: approver.uid,
          risk: "High",
        }),
        queueItem({
          id: "self-assigned",
          assignee_uid: approver.uid,
          required_approver_uid: approver.uid,
          risk: "Medium",
        }),
        queueItem({
          id: "wrong-approver",
          assignee_uid: "editor-1",
          required_approver_uid: "approver-2",
          risk: "Medium",
        }),
        queueItem({
          id: "not-ready",
          assignee_uid: "editor-1",
          required_approver_uid: approver.uid,
          risk: "Medium",
          status: "Blocked",
        }),
      ],
      undefined,
      undefined,
      approver,
    );

    const capabilityById = Object.fromEntries(
      inbox.rows.map((row) => [row.itemId, row.canApproveInline]),
    );
    expect(capabilityById).toEqual({
      "safe-low": true,
      "safe-medium": true,
      high: false,
      "self-assigned": false,
      "wrong-approver": false,
      "not-ready": false,
    });
  });

  it("never offers inline approval for an Admin's own assigned item", () => {
    const inbox = buildNeedsDecisionInbox(
      [
        queueItem({
          id: "admin-owned",
          assignee_uid: ACTOR.uid,
          required_approver_uid: ACTOR.uid,
          risk: "Medium",
        }),
      ],
      undefined,
      undefined,
      ACTOR,
    );

    expect(inbox.rows[0]).toMatchObject({
      kind: "queue_item",
      itemId: "admin-owned",
      canApproveInline: false,
    });
  });

  it("de-dupes a field that is both an open flag and an awaiting write-back (write-back wins)", () => {
    // One flag: unresolved (→ open flag) AND carrying an Awaiting-Approval write-back (→ write-back row).
    const views = [
      makeView("run-a", "Run A", [
        {
          severity: "High",
          flags: [
            makeFlag("current_rent", "High", { approvalState: "Awaiting Approval" }),
          ],
        },
      ]),
    ];
    const inbox = buildNeedsDecisionInbox(
      [],
      buildRenewalReviewBoard(views),
      buildWritebackApprovalQueue(views),
      ACTOR,
    );

    expect(inbox.counts.total).toBe(1);
    expect(inbox.rows[0].kind).toBe("writeback");
  });

  it("de-dupes a persisted reconcile queue item against its flag row by source_trigger_key (C4)", () => {
    const views = [
      makeView("run-a", "Run A", [
        { severity: "High", flags: [makeFlag("current_rent", "High")] },
      ]),
    ];
    const inbox = buildNeedsDecisionInbox(
      [
        // Persisted reconcile item for the SAME field conflict — must fold into the flag's row.
        queueItem({
          id: "q-reconcile",
          source_trigger_key: "lease_renewal:reconcile:run-a:current_rent",
        }),
        // An unrelated queue item still counts on its own.
        queueItem({ id: "q-other" }),
      ],
      buildRenewalReviewBoard(views),
      buildWritebackApprovalQueue(views),
      ACTOR,
    );

    expect(inbox.counts).toEqual({
      total: 2,
      renewalFlags: 1,
      writebacksAwaiting: 0,
      queueItems: 1,
    });
    // One underlying decision = one row: the reconcile queue item never renders beside its flag.
    expect(inbox.rows.find((row) => row.label === "Approve q-reconcile")).toBeUndefined();
  });

  it("shows only queue items that still need a decision (Ready, Blocked, Failed)", () => {
    const inbox = buildNeedsDecisionInbox(
      [
        queueItem({ id: "ready", status: "Ready for Approval" }),
        queueItem({ id: "blocked", status: "Blocked" }),
        queueItem({ id: "failed", status: "Failed" }), // actionable (not terminal) → included
        queueItem({ id: "approved", status: "Approved" }),
        queueItem({ id: "snoozed", status: "Snoozed" }),
        queueItem({ id: "returned", status: "Returned" }),
      ],
      undefined,
      undefined,
      ACTOR,
    );

    expect(inbox.counts.queueItems).toBe(3);
    expect(inbox.rows.map((r) => r.key).sort()).toEqual([
      "queue_item:blocked",
      "queue_item:failed",
      "queue_item:ready",
    ]);
  });

  it("returns an empty, well-formed inbox when nothing needs a decision", () => {
    const inbox = buildNeedsDecisionInbox([], undefined, undefined, ACTOR);
    expect(inbox.rows).toEqual([]);
    expect(inbox.counts).toEqual({
      total: 0,
      renewalFlags: 0,
      writebacksAwaiting: 0,
      queueItems: 0,
    });
  });
});
