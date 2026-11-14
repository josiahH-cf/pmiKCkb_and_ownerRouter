// @vitest-environment jsdom
// S280 R-S280-4: when the renewal read is older than its freshness limit, "Waiting on you" keeps
// its last renewal rows with their read time and offers Refresh, which runs the existing bounded
// re-read. ARCH-S280-3, BEH-S280-3 and AC-S280-4 against the review readiness error, the attention
// gather, the re-read merge and the rendered panel. Synthetic values only.
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DashboardAttentionQueue } from "@/components/console/DashboardAttentionQueue";
import {
  gatherAttentionQueue,
  type AttentionQueue,
  type AttentionQueueDependencies,
  type AttentionQueueRow,
} from "@/lib/attention/attention-queue";
import { keepRetainedRenewalRows } from "@/lib/attention/attention-retention";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";
import { RenewalReviewUnavailableError } from "@/lib/lease-renewal/review-readiness";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const NOW = new Date("2026-11-12T18:30:00.000Z");
/** 11/12/2026, 12:20 PM CST. */
const READ_AT = "2026-11-12T18:20:00.000Z";
const admin = { uid: "u-admin", role: "Admin", email: "admin@pmikcmetro.com" } as never;

function flag(): RenewalFlagView {
  return {
    sourceTriggerKey: "lease_renewal:reconcile:live-review:aaaaaaaaaaaaaaaa:current_rent",
    candidateFingerprint: `rcf1_${"a".repeat(64)}`,
    fieldKey: "current_rent",
    fieldLabel: "Current rent",
    severity: "High",
    agreement: "conflict",
    actionNeeded: "Reconcile the current rent.",
    directLink: "/lease-renewal/runs/live-review/reconciliation/current_rent",
    suggestedWinner: null,
    candidates: [],
    resolution: null,
    writeback: null,
    writebackApproval: null,
    leaseLabel: "101 Sample Pl",
    leaseId: "101",
  };
}

function view(): RenewalRunView {
  return {
    runId: "live-review",
    label: "Live renewal review",
    manifest: {
      tabsRecognized: 1,
      tabsUnrecognized: 0,
      credentialTabsExcluded: 0,
      credentialScrubHits: 0,
      dividerRowsDropped: 0,
      totalRecords: 1,
    },
    excludedTabs: [],
    groups: [{ severity: "High", flags: [flag()] }],
    totalFlags: 1,
    resolvedCount: 0,
  };
}

function deps(
  overrides: Partial<AttentionQueueDependencies> = {},
): AttentionQueueDependencies {
  return {
    listQueue: async () => [],
    loadRunViews: async () => [],
    now: () => NOW,
    ...overrides,
  };
}

function staleError(sourceStatus: "stale" | "expired", overlay = "available" as const) {
  return new RenewalReviewUnavailableError({
    sourceStatus,
    overlayStatus: overlay,
    sourceReadAtIso: READ_AT,
    views: [view()],
  });
}

describe("S280 ARCH-S280-3: retained rows in the data (fail-first)", () => {
  it("ARCH-S280-3 / AC-S280-4: a stale read keeps its rows, marked retained, with the read time", async () => {
    const queue = await gatherAttentionQueue(
      admin,
      deps({
        loadRunViews: async () => {
          throw staleError("stale");
        },
      }),
    );
    expect(queue.state).toBe("ok");
    expect(queue.unavailableFeeds).toEqual([]);
    expect(queue.renewalRead).toEqual({ state: "retained", readAtIso: READ_AT });
    expect(queue.rows).toHaveLength(1);
    expect(queue.rows[0]).toMatchObject({
      label: "101 Sample Pl: Current rent",
      retained: true,
      authority: "review",
    });
    expect(queue.renewalReviewIssue).toBeUndefined();
  });

  it("AC-S280-4: an expired read is kept the same way", async () => {
    const queue = await gatherAttentionQueue(
      admin,
      deps({
        loadRunViews: async () => {
          throw staleError("expired");
        },
      }),
    );
    expect(queue.renewalRead?.state).toBe("retained");
    expect(queue.rows.every((row) => row.retained)).toBe(true);
  });

  it("AC-S280-4: without saved decisions nothing is retained and the read stays unavailable", async () => {
    const error = new RenewalReviewUnavailableError({
      sourceStatus: "stale",
      overlayStatus: "unavailable",
      sourceReadAtIso: READ_AT,
      views: [view()],
    });
    expect(error.retained).toBeUndefined();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const queue = await gatherAttentionQueue(
      admin,
      deps({
        loadRunViews: async () => {
          throw error;
        },
      }),
    );
    expect(queue.state).toBe("partial");
    expect(queue.rows).toEqual([]);
    expect(queue.renewalRead).toBeUndefined();
  });

  it("R-S280-4: a current read marks its rows current", async () => {
    const queue = await gatherAttentionQueue(
      admin,
      deps({ loadRunViews: async () => [view()] }),
    );
    expect(queue.renewalRead?.state).toBe("current");
    expect(queue.rows[0].retained).toBeUndefined();
  });

  it("R-S280-4: the earlier stale sentence is gone", () => {
    expect(staleError("stale").issue.message).not.toContain(
      "Retained comparisons cannot establish current decisions",
    );
  });
});

const RETAINED_ROW: AttentionQueueRow = {
  key: "renewal_flag:live-review:aaaaaaaaaaaaaaaa:current_rent",
  kind: "renewal_flag",
  label: "101 Sample Pl: Current rent",
  detail: "Live renewal review",
  severity: "High",
  href: "/lease-renewal/live#renewal-review-item-x",
  authority: "review",
  retained: true,
};

function retainedQueue(): AttentionQueue {
  return {
    state: "ok",
    rows: [RETAINED_ROW],
    unavailableFeeds: [],
    seeAllHref: "/approval-queue",
    checkedAtIso: NOW.toISOString(),
    renewalRead: { state: "retained", readAtIso: READ_AT },
  };
}

describe("S280 BEH-S280-3: the rendered panel", () => {
  it("BEH-S280-3: the rows stay, show when they were read and offer Refresh; after Refresh they are current", async () => {
    const user = userEvent.setup();
    const current: AttentionQueue = {
      ...retainedQueue(),
      rows: [{ ...RETAINED_ROW, retained: undefined }],
      renewalRead: { state: "current", readAtIso: null },
    };
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(current), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => {
      render(
        <DashboardAttentionQueue canApprove initial={Promise.resolve(retainedQueue())} />,
      );
    });
    const region = screen.getByRole("region", { name: "Waiting on you" });
    expect(
      within(region).getByRole("link", { name: "101 Sample Pl: Current rent" }),
    ).toBeVisible();
    expect(within(region).getByTestId("renewal-read-retained")).toHaveTextContent(
      "Renewal data last read 11/12/2026, 12:20 PM CST",
    );
    // A retained row has no decision control here; it opens its review surface.
    expect(within(region).queryByRole("button", { name: "Approve" })).toBeNull();
    expect(within(region).queryByRole("button", { name: "Try again" })).toBeNull();
    expect(
      within(region).queryByText(/Retained comparisons cannot establish/),
    ).toBeNull();

    await user.click(within(region).getByRole("button", { name: "Refresh" }));

    // The existing re-read: one uncached read of the attention route (it carries its own
    // abort signal).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard/attention",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(
      await within(region).findByRole("link", { name: "101 Sample Pl: Current rent" }),
    ).toBeVisible();
    expect(within(region).queryByTestId("renewal-read-retained")).toBeNull();
  });

  it("AC-S280-4: a Refresh whose renewal read fails keeps the rows and reports the failure in place", async () => {
    const user = userEvent.setup();
    const failed: AttentionQueue = {
      state: "partial",
      rows: [],
      unavailableFeeds: ["renewal_reviews"],
      seeAllHref: "/approval-queue",
      checkedAtIso: NOW.toISOString(),
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(failed), { status: 200 })),
    );
    await act(async () => {
      render(
        <DashboardAttentionQueue canApprove initial={Promise.resolve(retainedQueue())} />,
      );
    });
    const region = screen.getByRole("region", { name: "Waiting on you" });
    await user.click(within(region).getByRole("button", { name: "Refresh" }));

    expect(
      await within(region).findByText(/The renewal data could not be read just now/),
    ).toBeVisible();
    expect(
      within(region).getByRole("link", { name: "101 Sample Pl: Current rent" }),
    ).toBeVisible();
    expect(within(region).getByTestId("renewal-read-retained")).toHaveTextContent(
      "Renewal data last read 11/12/2026, 12:20 PM CST",
    );
  });

  it("AC-S280-4: the re-read merge keeps only renewal rows, never a queue item, and keeps the first read time", () => {
    const previous = {
      ...retainedQueue(),
      rows: [
        RETAINED_ROW,
        {
          key: "queue_item:q1",
          kind: "queue_item",
          label: "Approve renewal package",
          detail: "Run 1",
          severity: "Low",
          href: "/approval-queue?item_id=q1",
          authority: "approve_inline",
          itemId: "q1",
        } as AttentionQueueRow,
      ],
    };
    const merged = keepRetainedRenewalRows(previous, {
      state: "partial",
      rows: [],
      unavailableFeeds: ["renewal_reviews"],
      seeAllHref: "/approval-queue",
      checkedAtIso: "2026-11-12T18:40:00.000Z",
    });
    expect(merged.renewalFailed).toBe(true);
    expect(merged.queue.rows.map((row) => row.key)).toEqual([RETAINED_ROW.key]);
    expect(merged.queue.renewalRead).toEqual({ state: "retained", readAtIso: READ_AT });
  });
});
