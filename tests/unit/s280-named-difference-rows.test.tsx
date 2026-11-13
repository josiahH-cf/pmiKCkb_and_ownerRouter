// @vitest-environment jsdom
// S280 R-S280-3: every difference row names its lease and opens its own item. ARCH-S280-2,
// BEH-S280-2 and AC-S280-3 against the value-free board, write-back queue and inbox the Dashboard
// and the Approval Queue read, the pipeline's lease labels, and the rendered rows. Synthetic values.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NeedsDecisionInboxPanel } from "@/components/approval/NeedsDecisionInboxPanel";
import { RenewalReviewPanel } from "@/components/approval/RenewalReviewPanel";
import { DashboardAttentionQueue } from "@/components/console/DashboardAttentionQueue";
import {
  buildNeedsDecisionInbox,
  renewalTabCounts,
} from "@/lib/approval/needs-decision-inbox";
import { buildRenewalReviewBoard } from "@/lib/approval/renewal-review";
import { buildWritebackApprovalQueue } from "@/lib/approval/writeback-approval-queue";
import type { AttentionQueue, AttentionQueueRow } from "@/lib/attention/attention-queue";
import type { ApprovalQueueItemRecord } from "@/lib/firestore/types";
import { buildLiveRenewalReviewItemHref } from "@/lib/lease-renewal/live-review-destination";
import { runRenewalPipeline } from "@/lib/lease-renewal/pipeline";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";
import { buildRenewalRunView } from "@/lib/lease-renewal/run-view";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ACTOR = { role: "Admin" as const, uid: "admin-1" };
const LEASES = [
  { record: "aaaaaaaaaaaaaaaa", label: "101 Sample Pl", id: "101" },
  { record: "bbbbbbbbbbbbbbbb", label: "102 Sample Pl", id: "102" },
  { record: "cccccccccccccccc", label: "103 Sample Pl", id: "103" },
] as const;
const FIELDS = [
  { key: "current_rent", label: "Current rent" },
  { key: "tenant_responded", label: "Tenant renewal response" },
] as const;

function flag(
  lease: (typeof LEASES)[number],
  field: (typeof FIELDS)[number],
): RenewalFlagView {
  return {
    sourceTriggerKey: `lease_renewal:reconcile:live-review:${lease.record}:${field.key}`,
    candidateFingerprint: `rcf1_${"a".repeat(64)}`,
    fieldKey: field.key,
    fieldLabel: field.label,
    severity: "High",
    agreement: "conflict",
    actionNeeded: `Reconcile "${field.label}" across 2 sources.`,
    directLink: `/lease-renewal/runs/live-review/reconciliation/${field.key}`,
    suggestedWinner: null,
    candidates: [],
    resolution: null,
    writeback: null,
    writebackApproval: null,
    leaseLabel: lease.label,
    leaseId: lease.id,
  };
}

function liveView(flags: RenewalFlagView[]): RenewalRunView {
  return {
    runId: "live-review",
    label: "Live renewal review",
    manifest: {
      tabsRecognized: 1,
      tabsUnrecognized: 0,
      credentialTabsExcluded: 0,
      credentialScrubHits: 0,
      dividerRowsDropped: 0,
      totalRecords: 3,
    },
    excludedTabs: [],
    groups: [{ severity: "High", flags }],
    totalFlags: flags.length,
    resolvedCount: 0,
  };
}

const ALL_FLAGS = LEASES.flatMap((lease) => FIELDS.map((field) => flag(lease, field)));

describe("S280 ARCH-S280-2: rows keyed by run, lease row and field (fail-first)", () => {
  it("BEH-S280-2 / AC-S280-3: three leases and two fields give six named rows, each opening its own item, and the counts agree", () => {
    const view = liveView(ALL_FLAGS);
    const board = buildRenewalReviewBoard([view]);
    const writebacks = buildWritebackApprovalQueue([view]);
    const inbox = buildNeedsDecisionInbox([], board, writebacks, ACTOR);

    expect(inbox.rows).toHaveLength(6);
    expect(new Set(inbox.rows.map((row) => row.key)).size).toBe(6);
    expect(inbox.rows.map((row) => row.label).sort()).toEqual([
      "101 Sample Pl: Current rent",
      "101 Sample Pl: Tenant renewal response",
      "102 Sample Pl: Current rent",
      "102 Sample Pl: Tenant renewal response",
      "103 Sample Pl: Current rent",
      "103 Sample Pl: Tenant renewal response",
    ]);
    for (const source of ALL_FLAGS) {
      const row = inbox.rows.find((entry) =>
        entry.key.endsWith(
          source.sourceTriggerKey.slice("lease_renewal:reconcile:".length),
        ),
      );
      expect(row?.href).toBe(buildLiveRenewalReviewItemHref(source.sourceTriggerKey));
    }
    // One count behind the total, the tabs and the rendered rows.
    const tabs = renewalTabCounts(board, writebacks);
    expect(inbox.counts.total).toBe(6);
    expect(inbox.counts.renewalFlags).toBe(6);
    expect(tabs.renewalReviews).toBe(6);
    expect(board.totalOpenFlags).toBe(6);
    expect(board.runs[0].flags.map((entry) => entry.leaseLabel)).toEqual(
      ALL_FLAGS.map((entry) => entry.leaseLabel),
    );
  });

  it("AC-S280-3: a persisted reconcile item still folds into its own lease's row (existing dedup, key gains the lease row)", () => {
    const view = liveView(ALL_FLAGS);
    const reconcile = {
      id: "q-reconcile",
      status: "Ready for Approval",
      risk: "High",
      assignee_uid: "someone",
      required_approver_uid: "admin-1",
      action_needed: "Reconcile the rent",
      process_run_ref: { id: "live-review", label: "Live renewal review" },
      direct_link: "/lease-renewal/live",
      source_trigger_key: ALL_FLAGS[0].sourceTriggerKey,
      audience_group: "Dan/Admin decisions",
      item_type: "SourceFactConflict",
      created_at: "2026-11-12T18:00:00.000Z",
      updated_at: "2026-11-12T18:00:00.000Z",
    } as unknown as ApprovalQueueItemRecord;
    const inbox = buildNeedsDecisionInbox(
      [reconcile],
      buildRenewalReviewBoard([view]),
      buildWritebackApprovalQueue([view]),
      ACTOR,
    );
    expect(inbox.counts.total).toBe(6);
    expect(inbox.rows.some((row) => row.kind === "queue_item")).toBe(false);
  });

  it("R-S280-3: the operating Sheet run names the lease on every decision row", () => {
    const header = SAMPLE_RENEWAL_TABLES[0][0] as string[];
    const tenantCol = header.findIndex((h) => h.toLowerCase().includes("tenant name"));
    const rentCol = header.findIndex((h) => h.toLowerCase().includes("current rent"));
    const row = (tenant: string) => {
      const cells = header.map(() => "");
      cells[tenantCol] = tenant;
      cells[rentCol] = "$1,900";
      return cells;
    };
    const run = runRenewalPipeline({
      runId: "live-review",
      tables: [[header, row("Avery Sample"), row("Blake Sample"), row("Casey Sample")]],
      // RentVine's rent is unreadable on each, so each stays a decision (R-S280-6).
      nonSheetCandidates: LEASES.map((lease, index) => ({
        source: "rentvine",
        source_system: "RentVine",
        joinKind: "name" as const,
        joinValue: ["Avery Sample", "Blake Sample", "Casey Sample"][index],
        joinId: `lease:${lease.id}`,
        fields: { current_rent: { value: "pending", confidence: "Verified" as const } },
      })),
      recordJoinIds: { 1: "lease:101", 2: "lease:102", 3: "lease:103" },
      operatingSheet: true,
      leaseLabels: Object.fromEntries(
        LEASES.map((lease) => [`lease:${lease.id}`, lease.label]),
      ),
    });
    const view = buildRenewalRunView(run, [], "Live renewal review");
    const flags = view.groups.flatMap((group) => group.flags);
    expect(flags.map((entry) => entry.leaseLabel).sort()).toEqual([
      "101 Sample Pl",
      "102 Sample Pl",
      "103 Sample Pl",
    ]);
    expect(flags.map((entry) => entry.leaseId).sort()).toEqual(["101", "102", "103"]);
    const inbox = buildNeedsDecisionInbox(
      [],
      buildRenewalReviewBoard([view]),
      buildWritebackApprovalQueue([view]),
      ACTOR,
    );
    expect(inbox.rows.map((entry) => entry.label).sort()).toEqual([
      "101 Sample Pl: Current rent",
      "102 Sample Pl: Current rent",
      "103 Sample Pl: Current rent",
    ]);
  });
});

describe("S280 AC-S280-3: rendered rows", () => {
  it("AC-S280-3: the Renewal reviews tab renders one row per lease and field with no duplicate key warning", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<RenewalReviewPanel board={buildRenewalReviewBoard([liveView(ALL_FLAGS)])} />);
    const links = screen.getAllByRole("link", { name: /Sample Pl: / });
    expect(links).toHaveLength(6);
    expect(errors.mock.calls.some((call) => String(call[0]).includes("same key"))).toBe(
      false,
    );
  });

  it("BEH-S280-2: the Approval Queue's list names each lease and states the same total", () => {
    const view = liveView(ALL_FLAGS);
    const inbox = buildNeedsDecisionInbox(
      [],
      buildRenewalReviewBoard([view]),
      buildWritebackApprovalQueue([view]),
      ACTOR,
    );
    render(<NeedsDecisionInboxPanel inbox={inbox} />);
    expect(screen.getByText(/6 things need your decision/)).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(6);
    expect(
      screen.getByRole("link", { name: /102 Sample Pl: Tenant renewal response/ }),
    ).toHaveAttribute(
      "href",
      buildLiveRenewalReviewItemHref(
        "lease_renewal:reconcile:live-review:bbbbbbbbbbbbbbbb:tenant_responded",
      ),
    );
  });

  it("R-S280-3: past the panel's row limit one line counts the rest on Live renewal review", async () => {
    const rows: AttentionQueueRow[] = Array.from({ length: 8 }, (_, index) => ({
      key: `renewal_flag:live-review:r${index}:current_rent`,
      kind: "renewal_flag",
      label: `${100 + index} Sample Pl: Current rent`,
      detail: "Live renewal review",
      severity: "High",
      href: `/lease-renewal/live#item-${index}`,
      authority: "review",
    }));
    const queue: AttentionQueue = {
      state: "ok",
      rows,
      unavailableFeeds: [],
      seeAllHref: "/approval-queue",
      checkedAtIso: "2026-11-12T18:20:00.000Z",
    };
    await act(async () => {
      render(
        <DashboardAttentionQueue canApprove={false} initial={Promise.resolve(queue)} />,
      );
    });
    const region = screen.getByRole("region", { name: "Waiting on you" });
    expect(
      within(region).getAllByRole("link", { name: /Sample Pl: Current rent/ }),
    ).toHaveLength(5);
    expect(
      within(region).getByRole("link", { name: "and 3 more on Live renewal review" }),
    ).toHaveAttribute("href", "/lease-renewal/live");
  });
});
