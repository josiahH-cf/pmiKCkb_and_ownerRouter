import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  applyRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";
import { buildRenewalDeskWindow } from "@/lib/lease-renewal/desk-query";
import { withRenewalDeskWorklistView } from "@/lib/lease-renewal/desk-worklist-views";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import {
  loadLiveRenewalDesk,
  loadLiveRenewalLeaseWorkspace,
} from "@/lib/lease-renewal/live-desk";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import {
  RENEWAL_STAGE,
  type RenewalProgress,
} from "@/lib/lease-renewal/renewal-progress";
import { RENEWAL_PROCESS_VERSION } from "@/lib/lease-renewal/renewal-process";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import type { RentVineLeaseStatus } from "@/lib/integrations/rentvine/client";
import { withFakeLeaseDetail } from "@/tests/helpers/rentvine-detail-fake";

// S122 (F01): one complete accessible inventory from the authorized provider read, inspection
// independent of workflow eligibility, and no false absence. Every value is synthetic and every
// adapter is a controlled fake; no provider, Sheet, mailbox or paid lookup is touched.

beforeEach(() => {
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
});

const READ_TS = "2026-07-19T00:00:00.000Z";
const WINDOWS = [buildRenewalDeskWindow("2026-07-19")];

// Future, completed, month-to-month, missing-Sheet and duplicate-name leases, each with a distinct
// provider identity. Names and addresses never decide uniqueness.
const EXPORT_ROWS = [
  {
    lease: {
      leaseID: 4821,
      endDate: "2026-08-31",
      leaseType: "Fixed Term",
      leaseStatusID: "2",
      tenants: [{ name: "Jordan Maple" }],
    },
    property: { name: "Maple Court", streetNumber: "4821", streetName: "Maple Ct" },
    unit: { rent: "1250.00" },
  },
  {
    lease: {
      leaseID: 5001,
      endDate: "2026-08-31",
      leaseType: "Fixed Term",
      leaseStatusID: "2",
      tenants: [{ name: "Casey Rivers" }],
    },
    unit: { rent: "1400.00" },
  },
  {
    lease: {
      leaseID: 6002,
      endDate: "2026-09-30",
      leaseType: "Fixed Term",
      leaseStatusID: "2",
      tenants: [{ name: "Nomatch Tenant" }],
    },
    unit: { rent: "1100.00" },
  },
  {
    lease: {
      leaseID: 7003,
      endDate: "2026-08-31",
      leaseType: "Month to Month",
      leaseStatusID: "2",
      isMonthToMonth: "1",
      monthToMonthStartDate: "2025-08-15",
      tenants: [{ name: "Mtm Tenant" }],
    },
    unit: { rent: "900.00" },
  },
  {
    lease: {
      leaseID: 8004,
      endDate: "2026-12-31",
      leaseType: "Fixed Term",
      leaseStatusID: "2",
      tenants: [{ name: "Future Tenant" }],
    },
    unit: { rent: "1000.00" },
  },
  {
    lease: {
      leaseID: 9010,
      endDate: "2029-06-30",
      leaseType: "Fixed Term",
      leaseStatusID: "2",
      tenants: [{ name: "Far Future Tenant" }],
    },
    property: { name: "Horizon Row", streetNumber: "77", streetName: "Horizon Way" },
    unit: { rent: "1600.00" },
  },
  {
    // Same tenant name as lease 4821 at a different address: a distinct lease, never a duplicate.
    lease: {
      leaseID: 9011,
      endDate: "2027-02-28",
      leaseType: "Fixed Term",
      leaseStatusID: "2",
      tenants: [{ name: "Jordan Maple" }],
    },
    property: { name: "Elm Row", streetNumber: "5", streetName: "Elm St" },
    unit: { rent: "1300.00" },
  },
  {
    lease: {
      leaseID: 9012,
      endDate: "2026-08-31",
      leaseType: "Fixed Term",
      leaseStatusID: "2",
      tenants: [{ name: "Done Tenant" }],
    },
    unit: { rent: "1500.00" },
  },
];
const EXPECTED_IDS = ["4821", "5001", "6002", "7003", "8004", "9010", "9011", "9012"];

// The documented account status table: every fixture lease is plainly Active.
const STATUSES: RentVineLeaseStatus[] = [
  {
    leaseStatusID: "2",
    name: "Active",
    primaryLeaseStatusID: "2",
    isPendingMoveOutStatus: false,
    isCompletedMoveOutStatus: false,
    isPendingMoveInStatus: false,
    isSystemStatus: true,
  },
];

function fakeSheetsReader() {
  return {
    listTabTitles: async () => ["Lease Renewal"],
    batchGet: async () => ({
      valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
    }),
    batchGetFormulas: async () => ({
      valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
    }),
  };
}

/** Records every adapter method name so a test can prove a read issued only reads. */
function recording<T extends object>(target: T, calls: string[]): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value = Reflect.get(object, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        calls.push(String(property));
        return (value as (...inner: unknown[]) => unknown).apply(object, args);
      };
    },
  });
}

function config(
  read: { pages: number; complete: boolean } = { pages: 3, complete: true },
  calls: string[] = [],
) {
  const client = withFakeLeaseDetail({
    listAllLeasesExport: async () => ({
      rows: EXPORT_ROWS as Record<string, unknown>[],
      pages: read.pages,
      complete: read.complete,
    }),
    listLeaseStatuses: async () => STATUSES,
  });
  return {
    ok: true as const,
    rentvineClient: recording(client, calls),
    rentvineHost: "pmikcmetro.rentvine.com",
    sheetsReader: recording(fakeSheetsReader(), calls),
    spreadsheetId: "sheet-id",
  };
}

type DeskConfigArg = Parameters<typeof loadLiveRenewalDesk>[2];
type WorkspaceConfigArg = Parameters<typeof loadLiveRenewalLeaseWorkspace>[2];

function completedProgress(leaseId: string): RenewalProgress {
  return {
    leaseId,
    processVersion: RENEWAL_PROCESS_VERSION,
    stageIndex: RENEWAL_STAGE.build,
    ownerDecision: { decision: "increase", offeredRent: 1550 },
    ownerDecisionRevision: 1,
    tenantOfferDraftId: null,
    tenantOutcome: null,
    evidence: {},
    complete: true,
  };
}

const noParty = () => false;

describe("S122 one complete accessible lease inventory (AC-S122-1)", () => {
  it("yields exactly the expected unique lease ids from a multi-page read and every view reads from that one projection", async () => {
    const desk = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      config() as unknown as DeskConfigArg,
      new Map([["9012", completedProgress("9012")]]),
    );
    if (desk.status !== "ok") throw new Error(desk.status);
    expect(desk.view.readComplete).toBe(true);
    const ids = desk.view.items.map((row) => row.id).sort();
    expect(ids).toEqual(EXPECTED_IDS);
    expect(new Set(ids).size).toBe(EXPECTED_IDS.length);

    const all = applyRenewalDeskQueryV2(
      desk.view.items,
      withRenewalDeskWorklistView(DEFAULT_RENEWAL_DESK_QUERY_V2, "all"),
      noParty,
    );
    expect(all.totalInScope).toBe(EXPECTED_IDS.length);
    expect(all.totalMatching).toBe(EXPECTED_IDS.length);

    // The far-future and next-year leases are loaded and inspectable, but outside the active view.
    const active = applyRenewalDeskQueryV2(
      desk.view.items,
      DEFAULT_RENEWAL_DESK_QUERY_V2,
      noParty,
    );
    const activeIds = active.items.map((row) => row.id);
    expect(activeIds).not.toContain("9010");
    expect(activeIds).not.toContain("9011");
    expect(activeIds).not.toContain("8004");
    const farFuture = desk.view.items.find((row) => row.id === "9010");
    expect(farFuture).toMatchObject({
      endDateIso: "2029-06-30",
      disposition: "out_of_window",
      retention: { state: "outside" },
    });
    expect(farFuture?.lifecycle?.category).toBe("later");
    // The lease with no Sheet row is still a known lease.
    expect(ids).toContain("6002");
    // Completed selects the cycle-aware category from the same rows: only the recorded completion.
    const completed = applyRenewalDeskQueryV2(
      desk.view.items,
      withRenewalDeskWorklistView(DEFAULT_RENEWAL_DESK_QUERY_V2, "completed"),
      noParty,
    );
    expect(completed.items.map((row) => row.id)).toEqual(["9012"]);
  });

  it("never reports full coverage from an interrupted page read while keeping what was read", async () => {
    const desk = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      config({ pages: 2, complete: false }) as unknown as DeskConfigArg,
    );
    if (desk.status !== "ok") throw new Error(desk.status);
    expect(desk.view.readComplete).toBe(false);
    expect(desk.view.items.map((row) => row.id).sort()).toEqual(EXPECTED_IDS);
  });
});

describe("S122 inspection independent of workflow eligibility (AC-S122-4)", () => {
  it("opens a lease dated years ahead with its known facts and source destination while issuing only reads", async () => {
    const calls: string[] = [];
    const workspace = await loadLiveRenewalLeaseWorkspace(
      "9010",
      READ_TS,
      config(undefined, calls) as unknown as WorkspaceConfigArg,
    );
    if (workspace.status !== "ok") throw new Error(workspace.status);
    const { summary } = workspace.workspace;
    expect(summary).toMatchObject({
      id: "9010",
      endDateIso: "2029-06-30",
      disposition: "out_of_window",
      retention: { state: "outside" },
      currentRent: 1600,
      processVersion: null,
      workflowStepId: null,
      nextAction: null,
    });
    expect(summary.addressLabel).toContain("Horizon Way");
    expect(summary.lifecycle?.category).toBe("later");
    expect(JSON.stringify(summary.sourceDestinations ?? {})).toContain("9010");
    // Opening creates nothing: no workflow, no cycle, no draft, no live process state.
    expect(workspace.workspace.workflowAvailable).toBe(false);
    expect(workspace.workspace.live).toBeUndefined();
    expect(workspace.workspace.tenantDraft).toBeNull();
    expect(summary.manualProgress).toBeUndefined();
    // Every adapter call was a documented read.
    expect(calls.length).toBeGreaterThan(0);
    const allowedReads = new Set([
      "listAllLeasesExport",
      "getLease",
      "listLeaseStatuses",
      "listTabTitles",
      "batchGet",
      "batchGetFormulas",
    ]);
    expect(calls.filter((name) => !allowedReads.has(name))).toEqual([]);
    expect(
      calls.some((name) => /write|create|update|append|send|delete|post/i.test(name)),
    ).toBe(false);
  });
});

describe("S122 no false deletion or silent archival (AC-S122-6)", () => {
  it("keeps a partial read as a read failure and reserves not-found for a complete read", async () => {
    // A lease absent from a partial read is a failed read, never an absence.
    const partial = await loadLiveRenewalLeaseWorkspace(
      "424242",
      READ_TS,
      config({ pages: 1, complete: false }) as unknown as WorkspaceConfigArg,
    );
    expect(partial).toEqual({ status: "read_error" });

    clearLiveLeaseCache();
    const missing = await loadLiveRenewalLeaseWorkspace(
      "424242",
      READ_TS,
      config() as unknown as WorkspaceConfigArg,
    );
    expect(missing).toEqual({ status: "not_found" });

    clearLiveLeaseCache();
    const present = await loadLiveRenewalLeaseWorkspace(
      "9011",
      READ_TS,
      config() as unknown as WorkspaceConfigArg,
    );
    expect(present.status).toBe("ok");
    if (present.status === "ok") {
      expect(present.workspace.summary.lifecycle?.category).toBe("later");
      expect(present.workspace.summary.manualProgress).toBeUndefined();
    }
  });
});
