import { afterEach, describe, expect, it, vi } from "vitest";

import {
  gatherAttentionQueue,
  type AttentionQueueDependencies,
} from "@/lib/attention/attention-queue";
import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";

// S147 ARCH-S147-2: the compact queue is a projection of the existing needs-decision eligibility,
// dedup keys and inline-approve rule, gathered per feed so empty, partial and unavailable stay
// distinct. Expectations are checked against the fixture records, never a fabricated count.

afterEach(() => {
  vi.restoreAllMocks();
});

const NOW = new Date("2026-10-01T15:00:00.000Z");

function item(overrides: Partial<ApprovalQueueItemRecord> = {}): ApprovalQueueItemRecord {
  return {
    id: "q1",
    status: "Ready for Approval",
    risk: "Low",
    assignee_uid: "someone-else",
    required_approver_uid: "u-admin",
    action_needed: "Approve renewal package",
    process_run_ref: { label: "Run 1" },
    direct_link: "/approval-queue?item_id=q1",
    ...overrides,
  } as unknown as ApprovalQueueItemRecord;
}

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

// One renewal run with one open reconciliation flag, in the exact shape the review board reads.
function runView(fieldKey: string): RenewalRunView {
  return {
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
        flags: [flagView({ fieldKey, fieldLabel: "Current rent" })],
      },
    ],
    totalFlags: 1,
    resolvedCount: 0,
  };
}

function deps(
  overrides: Partial<AttentionQueueDependencies> = {},
): AttentionQueueDependencies {
  return {
    listQueue: async () => [item()],
    loadRunViews: async () => [],
    now: () => NOW,
    ...overrides,
  };
}

const admin = { uid: "u-admin", role: "Admin", email: "admin@pmikcmetro.com" } as never;
const maintenanceEditor = {
  uid: "u-maint",
  role: "Editor",
  email: "maint@pmikcmetro.com",
  scopes: ["maintenance"],
} as never;

describe("S147 attention queue gather", () => {
  it("reports an empty but complete read as ok with no rows", async () => {
    const queue = await gatherAttentionQueue(admin, deps({ listQueue: async () => [] }));
    expect(queue.state).toBe("ok");
    expect(queue.rows).toEqual([]);
    expect(queue.unavailableFeeds).toEqual([]);
  });

  it("marks a failed approval read partial when the renewal read answered", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const queue = await gatherAttentionQueue(
      admin,
      deps({
        listQueue: async () => {
          throw new Error("firestore down");
        },
      }),
    );
    expect(queue.state).toBe("partial");
    expect(queue.unavailableFeeds).toEqual(["approval_queue"]);
  });

  it("reports unavailable with no rows when every eligible feed failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = async () => {
      throw new Error("firestore down");
    };
    const queue = await gatherAttentionQueue(
      admin,
      deps({ listQueue: failing, loadRunViews: failing }),
    );
    expect(queue.state).toBe("unavailable");
    expect(queue.rows).toEqual([]);
    expect(queue.unavailableFeeds).toEqual(["approval_queue", "renewal_reviews"]);
  });

  it("covers a user without Renewals access from their own approval items, never a fixed zero", async () => {
    const loadRunViews = vi.fn(async () => []);
    const queue = await gatherAttentionQueue(
      maintenanceEditor,
      deps({
        listQueue: async () => [
          item({ assignee_uid: "u-maint", required_approver_uid: "u-approver" }),
        ],
        loadRunViews,
      }),
    );
    expect(loadRunViews).not.toHaveBeenCalled();
    expect(queue.state).toBe("ok");
    expect(queue.rows.map((row) => row.key)).toEqual(["queue_item:q1"]);
    // An Editor who submitted the item sees it but does not decide it.
    expect(queue.rows[0].authority).toBe("view");
    expect(queue.seeAllHref).toBe("/notifications");
  });

  it("a non-renewals user whose only feed failed is unavailable, not all clear", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const queue = await gatherAttentionQueue(
      maintenanceEditor,
      deps({
        listQueue: async () => {
          throw new Error("firestore down");
        },
      }),
    );
    expect(queue.state).toBe("unavailable");
    expect(queue.rows).toEqual([]);
  });

  it("keeps view access distinct from approval authority", async () => {
    const queue = await gatherAttentionQueue(
      admin,
      deps({
        listQueue: async () => [
          item({ id: "low", risk: "Low" }),
          item({ id: "high", risk: "High", action_needed: "Approve a high-risk change" }),
          item({ id: "blocked", status: "Blocked", action_needed: "Unblock the run" }),
        ],
      }),
    );
    const authority = Object.fromEntries(
      queue.rows.map((row) => [row.itemId, row.authority]),
    );
    expect(authority).toEqual({
      low: "approve_inline",
      high: "approve",
      blocked: "view",
    });
  });

  it("lists one row for a decision that two sources supply (existing dedup keys)", async () => {
    const reconcile = item({
      id: "rq",
      source_trigger_key: "lease_renewal:reconcile:run-1:current_rent",
      action_needed: "Resolve the rent conflict",
    } as Partial<ApprovalQueueItemRecord>);
    const queue = await gatherAttentionQueue(
      admin,
      deps({
        listQueue: async () => [reconcile],
        loadRunViews: async () => [runView("current_rent")],
      }),
    );
    // Both feeds answered, and the flag and its persisted reconcile item are one decision.
    expect(queue.state).toBe("ok");
    expect(queue.rows).toHaveLength(1);
    expect(queue.rows[0]).toMatchObject({
      key: "renewal_flag:run-1:current_rent",
      label: "Current rent",
      authority: "review",
    });
    // Without the queue item, the same flag still shows once.
    const flagOnly = await gatherAttentionQueue(
      admin,
      deps({
        listQueue: async () => [],
        loadRunViews: async () => [runView("current_rent")],
      }),
    );
    expect(flagOnly.rows.map((row) => row.key)).toEqual([
      "renewal_flag:run-1:current_rent",
    ]);
  });

  it("drops closed, snoozed and returned items exactly as the inbox rule does", async () => {
    const queue = await gatherAttentionQueue(
      admin,
      deps({
        listQueue: async () => [
          item({ id: "done", status: "Approved" }),
          item({ id: "later", status: "Snoozed" }),
          item({ id: "back", status: "Returned" }),
          item({ id: "open" }),
        ],
      }),
    );
    expect(queue.rows.map((row) => row.itemId)).toEqual(["open"]);
  });
});
