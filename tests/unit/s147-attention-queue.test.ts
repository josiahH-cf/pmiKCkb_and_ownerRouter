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
// S167: every staff account has the Renewals Space, so an Editor is eligible for both feeds.
const editor = {
  uid: "u-maint",
  role: "Editor",
  email: "maint@pmikcmetro.com",
} as never;

describe("S147 attention queue gather", () => {
  // S167: the revalidation used to be skipped for an account without the Renewals Space.
  it("starts the stale lease revalidation before the review read, for every staff account", async () => {
    for (const user of [admin, editor]) {
      const order: string[] = [];
      const revalidateLeaseSource = vi.fn((nowMs: number) => {
        order.push(`revalidate:${nowMs}`);
      });
      const loadRunViews = vi.fn(async () => {
        order.push("review");
        return [];
      });
      await gatherAttentionQueue(user, deps({ loadRunViews, revalidateLeaseSource }));
      expect(order).toEqual([`revalidate:${NOW.getTime()}`, "review"]);
      expect(loadRunViews).toHaveBeenCalledWith(user);
    }
  });

  it("keeps gathering when the revalidation cannot start", async () => {
    const queue = await gatherAttentionQueue(
      admin,
      deps({
        listQueue: async () => [],
        revalidateLeaseSource: () => {
          throw new Error("config unavailable");
        },
      }),
    );
    expect(queue.state).toBe("ok");
  });

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

  // S167: an account without the Renewals Space used to skip the renewal review read and be sent
  // to Notifications for the full list.
  it("covers an Editor from their own approval items and the renewal review feed, never a fixed zero", async () => {
    const loadRunViews = vi.fn(async () => []);
    const queue = await gatherAttentionQueue(
      editor,
      deps({
        listQueue: async () => [
          item({ assignee_uid: "u-maint", required_approver_uid: "u-approver" }),
        ],
        loadRunViews,
      }),
    );
    expect(loadRunViews).toHaveBeenCalledTimes(1);
    expect(queue.state).toBe("ok");
    expect(queue.rows.map((row) => row.key)).toEqual(["queue_item:q1"]);
    // An Editor who submitted the item sees it but does not decide it.
    expect(queue.rows[0].authority).toBe("view");
    expect(queue.seeAllHref).toBe("/approval-queue");
  });

  // S167: an Editor's approval read used to be its only feed, so its failure was "unavailable".
  it("an Editor whose approval read failed is partial, and unavailable only when both feeds fail, never all clear", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = async () => {
      throw new Error("firestore down");
    };
    const partial = await gatherAttentionQueue(editor, deps({ listQueue: failing }));
    expect(partial.state).toBe("partial");
    expect(partial.unavailableFeeds).toEqual(["approval_queue"]);

    const unavailable = await gatherAttentionQueue(
      editor,
      deps({ listQueue: failing, loadRunViews: failing }),
    );
    expect(unavailable.state).toBe("unavailable");
    expect(unavailable.unavailableFeeds).toEqual(["approval_queue", "renewal_reviews"]);
    expect(unavailable.rows).toEqual([]);
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
