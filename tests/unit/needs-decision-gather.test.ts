// S13 B5 — the interlock gather. The Console approvals answer and the Spaces directory both project
// from THIS one gather, so they can never answer "Nothing" while the Approval Queue shows work.
// Mocks only the two I/O reads; the pure projections (visibility, board, write-back queue, inbox
// merge) run for real.

import { afterEach, describe, expect, it, vi } from "vitest";

const { listApprovalQueue, loadRenewalRunViews } = vi.hoisted(() => ({
  listApprovalQueue: vi.fn(),
  loadRenewalRunViews: vi.fn(),
}));

vi.mock("@/lib/firestore/approval-queue", () => ({ listApprovalQueue }));
vi.mock("@/lib/lease-renewal/renewal-review-board", () => ({ loadRenewalRunViews }));

import {
  gatherNeedsDecisionInbox,
  renewalWaitingCount,
} from "@/lib/approval/needs-decision-gather";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";
import { RenewalReviewUnavailableError } from "@/lib/lease-renewal/review-readiness";
import { resolveApprovalsState } from "@/lib/ask/app-state-context";

const editor = {
  uid: "u1",
  email: "u1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as const;

afterEach(() => {
  vi.clearAllMocks();
});

function flagView(overrides: Partial<RenewalFlagView>): RenewalFlagView {
  return {
    sourceTriggerKey: "lease_renewal:reconcile:run-1:field",
    fieldKey: "field",
    fieldLabel: "Field",
    severity: "High",
    agreement: "conflict",
    actionNeeded: "Reconcile this field across 2 sources.",
    directLink: "/lease-renewal/runs/run-1",
    suggestedWinner: null,
    candidates: [],
    resolution: null,
    writeback: null,
    writebackApproval: null,
    ...overrides,
    candidateFingerprint: overrides.candidateFingerprint ?? `rcf1_${"a".repeat(64)}`,
  };
}

const runView: RenewalRunView = {
  runId: "run-1",
  label: "Run 1",
  manifest: {
    tabsRecognized: 1,
    tabsUnrecognized: 0,
    credentialTabsExcluded: 0,
    credentialScrubHits: 0,
    dividerRowsDropped: 0,
    totalRecords: 5,
  },
  excludedTabs: [],
  groups: [
    {
      severity: "High",
      flags: [
        // An OPEN flag → one renewal_flag row.
        flagView({ fieldKey: "current_rent", fieldLabel: "Current rent" }),
        // A RESOLVED flag whose proposal awaits approval → one writeback row (not a flag row).
        flagView({
          fieldKey: "renewal_date",
          fieldLabel: "Renewal date",
          resolution: { status: "Resolved" },
          writebackApproval: { queued: true, state: "Awaiting Approval", stale: false },
        }),
      ],
    },
  ],
  totalFlags: 2,
  resolvedCount: 1,
};

describe("gatherNeedsDecisionInbox", () => {
  it("S238 A-06 keeps actual visible rows but marks a stale renewal feed incomplete", async () => {
    listApprovalQueue.mockResolvedValue([
      {
        id: "current",
        status: "Ready for Approval",
        action_needed: "Review current package",
        risk: "Low",
        direct_link: "/approval-queue",
        process_run_ref: { id: "current", label: "Current renewal" },
        assignee_uid: "u1",
      },
      {
        id: "retired",
        status: "Ready for Approval",
        action_needed: "Old proof",
        risk: "Low",
        direct_link: "/maintenance",
        process_run_ref: { id: "maintenance:proof", label: "Old proof" },
        assignee_uid: "u1",
      },
      {
        id: "not-visible",
        status: "Ready for Approval",
        action_needed: "Another person's package",
        risk: "Low",
        direct_link: "/approval-queue",
        process_run_ref: { id: "other", label: "Other" },
        assignee_uid: "someone-else",
      },
    ]);
    loadRenewalRunViews.mockRejectedValue(
      new RenewalReviewUnavailableError({
        sourceStatus: "stale",
        overlayStatus: "available",
        sourceReadAtIso: "2026-11-03T08:29:00.000Z",
      }),
    );
    const inbox = await gatherNeedsDecisionInbox(editor as never);
    expect(inbox).toMatchObject({
      readState: "partial",
      unavailableFeeds: ["renewal_reviews"],
      renewalReviewIssue: {
        code: "source_stale",
        sourceReadAtIso: "2026-11-03T08:29:00.000Z",
      },
    });
    expect(inbox.rows.map((row) => row.itemId)).toEqual(["current"]);
    expect(inbox.counts.total).toBe(1);
    expect(listApprovalQueue).toHaveBeenCalledTimes(1);
    expect(loadRenewalRunViews).toHaveBeenCalledTimes(1);
  });

  it("S238 A-06 Console app-state never calls a failed renewal read an empty complete queue", async () => {
    listApprovalQueue.mockResolvedValue([]);
    loadRenewalRunViews.mockRejectedValue(
      new RenewalReviewUnavailableError({
        sourceStatus: "stale",
        overlayStatus: "available",
      }),
    );
    const result = await resolveApprovalsState(editor as never);
    expect(result.items).toEqual([]);
    expect(result.summary).toContain("stale");
    expect(result.summary).not.toMatch(/Nothing needs your decision/);
    expect(listApprovalQueue).toHaveBeenCalledTimes(1);
    expect(loadRenewalRunViews).toHaveBeenCalledTimes(1);
  });

  it("S238 A-06 marks two failed sources unavailable without inventing rows", async () => {
    listApprovalQueue.mockRejectedValue(new Error("private queue exception"));
    loadRenewalRunViews.mockRejectedValue(new Error("private renewal exception"));
    const inbox = await gatherNeedsDecisionInbox(editor as never);
    expect(inbox).toMatchObject({
      readState: "unavailable",
      unavailableFeeds: ["approval_queue", "renewal_reviews"],
      rows: [],
    });
    expect(JSON.stringify(inbox)).not.toContain("private");
  });
  it("merges visible queue items with the renewal feeds from ONE run-views gather", async () => {
    listApprovalQueue.mockResolvedValue([
      {
        id: "q1",
        status: "Ready for Approval",
        action_needed: "Approve renewal package",
        risk: "Medium",
        direct_link: "/approval-queue#a",
        process_run_ref: { label: "Run 1" },
        assignee_uid: "u1",
        required_approver_uid: "someone-else",
      },
      {
        id: "q2",
        status: "Ready for Approval",
        action_needed: "Not yours",
        risk: "Low",
        direct_link: "/approval-queue#b",
        process_run_ref: { label: "Run 1" },
        assignee_uid: "u2",
        required_approver_uid: "u3",
      },
      {
        id: "q3",
        status: "Approved",
        action_needed: "Already decided",
        risk: "Low",
        direct_link: "/approval-queue#c",
        process_run_ref: { label: "Run 1" },
        assignee_uid: "u1",
        required_approver_uid: "u1",
      },
    ]);
    loadRenewalRunViews.mockResolvedValue([runView]);

    const inbox = await gatherNeedsDecisionInbox(editor as never);

    // One open flag + one awaiting write-back + the ONE visible, undecided queue item.
    expect(inbox.counts).toEqual({
      total: 3,
      renewalFlags: 1,
      writebacksAwaiting: 1,
      queueItems: 1,
    });
    const labels = inbox.rows.map((row) => row.label);
    expect(labels).toContain("Current rent");
    expect(labels).toContain("Renewal date");
    expect(labels).toContain("Approve renewal package");
    expect(labels).not.toContain("Not yours"); // another user's item
    expect(labels).not.toContain("Already decided"); // terminal status

    expect(loadRenewalRunViews).toHaveBeenCalledTimes(1);
    // The Space-card count covers the renewal work only (flags + awaiting write-backs).
    expect(renewalWaitingCount(inbox)).toBe(2);

    // AC-S17-3 single-source invariant: the decision integer every surface shows is
    // counts.total, and it is EXACTLY the sum of its kinds and the row count — no surface can
    // recompute a different number without changing the rows. The Console deck reads this total; the
    // Approval Queue builds the same buildNeedsDecisionInbox over the same-filtered inputs.
    expect(inbox.counts.total).toBe(
      inbox.counts.renewalFlags +
        inbox.counts.writebacksAwaiting +
        inbox.counts.queueItems,
    );
    expect(inbox.counts.total).toBe(inbox.rows.length);
  });

  it("degrades each feed independently and never throws", async () => {
    listApprovalQueue.mockRejectedValue(new Error("firestore down"));
    loadRenewalRunViews.mockResolvedValue([runView]);

    const withQueueDown = await gatherNeedsDecisionInbox(editor as never);
    expect(withQueueDown.counts.queueItems).toBe(0);
    expect(withQueueDown.counts.total).toBe(2); // the renewal feeds still answer

    listApprovalQueue.mockResolvedValue([]);
    loadRenewalRunViews.mockRejectedValue(new Error("simulation unavailable"));

    const withRenewalsDown = await gatherNeedsDecisionInbox(editor as never);
    expect(withRenewalsDown.counts.total).toBe(0);
  });
});
