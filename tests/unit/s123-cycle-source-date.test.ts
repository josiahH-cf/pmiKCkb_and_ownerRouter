import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DateWindow } from "@/lib/lease-renewal/cohort";
import { projectCycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import {
  loadLiveRenewalDesk,
  loadLiveRenewalLeaseWorkspace,
} from "@/lib/lease-renewal/live-desk";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  SHEET_WRITEBACK_FLAG,
  isOperatingSheetWritebackPaused,
} from "@/lib/lease-renewal/sheet-writeback-policy";
import { projectRenewalWorkStatus } from "@/lib/lease-renewal/work-status";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import type { LiveLeaseSnapshotResult } from "@/lib/lease-renewal/live-lease-cache";
import {
  applyFakeLeaseDetail,
  withFakeLeaseDetail,
} from "@/tests/helpers/rentvine-detail-fake";

// S123 (F02): an unfinished renewal survives a provider date change under the same lease and cycle
// identity, the recorded basis stays history, and the desk/workspace say the source date changed
// instead of rewriting or hiding the work. Values are synthetic; no provider or store is written.

const READ_TS = "2026-07-19T00:00:00.000Z";
const WINDOWS: DateWindow[] = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];
const CYCLE_A = "1c0a4d7e-7d3b-4a6e-9f4c-2a5f9e6b8d10";
const CYCLE_B = "2d1b5e8f-8e4c-4b7f-8a5d-3b6a0f7c9e21";

function exportRows(endDate4821: string) {
  return [
    {
      lease: {
        leaseID: 4821,
        endDate: endDate4821,
        leaseType: "Fixed Term",
        tenants: [{ name: "Jordan Maple" }, { name: "Riley Maple" }],
      },
      property: {
        name: "Maple Court",
        streetNumber: "4821",
        streetName: "Maple Ct",
        address2: "Unit 4",
      },
      portfolio: { owners: [{ companyName: "Maple Holdings LLC" }] },
      unit: { rent: "1250.00" },
    },
    {
      lease: {
        leaseID: 8004,
        endDate: "2026-12-31",
        leaseType: "Fixed Term",
        tenants: [{ name: "Future Tenant" }],
      },
      unit: { rent: "1000.00" },
    },
  ] as Record<string, unknown>[];
}

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

function okConfig(rows: Record<string, unknown>[]) {
  return {
    ok: true as const,
    rentvineClient: withFakeLeaseDetail({
      listAllLeasesExport: async () => ({ rows, pages: 1, complete: true }),
    }),
    rentvineHost: "pmikcmetro.rentvine.com",
    sheetsReader: fakeSheetsReader(),
    spreadsheetId: "sheet-id",
  };
}

function snapshotResult(rows: Record<string, unknown>[]): LiveLeaseSnapshotResult {
  const views = leaseViewsFromExport(rows);
  applyFakeLeaseDetail(views, rows);
  return {
    snapshot: {
      views,
      complete: true,
      readAtMs: Date.parse(READ_TS),
      detailComplete: true,
      detailUnavailableCount: 0,
    },
    currency: {
      state: "fresh",
      ageMs: 0,
      readAtMs: Date.parse(READ_TS),
      refreshing: false,
      lastError: false,
    },
  };
}

type DeskConfigArg = Parameters<typeof loadLiveRenewalDesk>[2];
type WorkspaceConfigArg = Parameters<typeof loadLiveRenewalLeaseWorkspace>[2];

const meta = (eventId: string) => ({
  actorUid: "operator",
  recordedAt: "2026-07-18T12:00:00.000Z",
  eventId,
});

/** An accepted offer with future provider dates and every later obligation still open. */
function acceptedButUnsigned(): RenewalWorkspaceState {
  let state = emptyRenewalWorkspace("4821", CYCLE_A, {
    kind: "lease_end",
    dateIso: "2026-08-31",
    source: "RentVine lease end",
  });
  state = planRenewalWorkspaceAction(
    state,
    { kind: "activity", activity: "owner_outreach", outcome: "done", source: "Call" },
    meta("e1"),
  );
  state = planRenewalWorkspaceAction(
    state,
    {
      kind: "owner_response",
      outcome: "approved_terms",
      terms: { rent: 1250, effectiveDate: "2026-09-01", endDate: "2027-08-31" },
      source: "Owner call",
    },
    meta("e2"),
  );
  state = planRenewalWorkspaceAction(
    state,
    { kind: "activity", activity: "tenant_offer", outcome: "done", source: "Email" },
    meta("e3"),
  );
  state = planRenewalWorkspaceAction(
    state,
    { kind: "tenant_response", outcome: "accepted", source: "Tenant email" },
    meta("e4"),
  );
  return state;
}

beforeEach(clearLiveLeaseCache);
afterEach(() => vi.unstubAllEnvs());

describe("S123 cycle source-date projection (R-F02-04)", () => {
  const basis = { kind: "lease_end" as const, dateIso: "2026-08-31", source: "RentVine" };

  it("reports a changed provider date without touching the recorded basis", () => {
    const frozen = Object.freeze({ ...basis });
    const change = projectCycleSourceDateChange(frozen, "2027-08-31");
    expect(change).toMatchObject({
      state: "changed",
      recordedIso: "2026-08-31",
      currentIso: "2027-08-31",
    });
    expect(change.label).toContain("recorded lease end 08/31/2026");
    expect(change.label).toContain("now reports 08/31/2027");
    expect(change.label).toContain("kept as history");
    expect(frozen).toEqual(basis);
  });

  it("reports unchanged, unavailable, review-basis and not-recorded states distinctly", () => {
    expect(projectCycleSourceDateChange(basis, "2026-08-31").state).toBe("unchanged");
    expect(projectCycleSourceDateChange(basis, null)).toMatchObject({
      state: "current_unavailable",
      recordedIso: "2026-08-31",
      currentIso: null,
    });
    expect(projectCycleSourceDateChange(basis, "not a date").state).toBe(
      "current_unavailable",
    );
    expect(
      projectCycleSourceDateChange(
        { kind: "review_date", dateIso: "2026-09-15", source: "Reviewed" },
        "2027-08-31",
      ),
    ).toMatchObject({ state: "review_basis", recordedIso: "2026-09-15" });
    const none = projectCycleSourceDateChange(null, "2027-08-31");
    expect(none).toMatchObject({ state: "not_recorded", recordedIso: null });
    expect(none.label).toContain("Previous terms were not recorded");
    expect(none.label).toContain("2027-08-31");
  });
});

describe("S123 retained work across a source date change (AC-S123-1, AC-S123-3, AC-S123-4)", () => {
  it("AC-S123-1: the same lease and cycle stay on the desk with remaining work when the end date advances a year", async () => {
    const manual = new Map([["4821", acceptedButUnsigned()]]);
    const before = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig(exportRows("2026-08-31")) as unknown as DeskConfigArg,
      undefined,
      undefined,
      [],
      undefined,
      true,
      snapshotResult(exportRows("2026-08-31")),
      undefined,
      manual,
    );
    if (before.status !== "ok") throw new Error(before.status);
    const beforeRow = before.view.items.find((item) => item.id === "4821");
    expect(beforeRow?.retention.state).toBe("window");
    expect(beforeRow?.cycleSourceDate).toMatchObject({
      state: "unchanged",
      recordedIso: "2026-08-31",
    });
    const remaining = beforeRow?.manualProgress?.nextActivity;
    expect(remaining).toBeDefined();
    expect(beforeRow?.manualProgress?.complete).toBe(false);

    clearLiveLeaseCache();
    const after = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig(exportRows("2027-08-31")) as unknown as DeskConfigArg,
      undefined,
      undefined,
      [],
      undefined,
      true,
      snapshotResult(exportRows("2027-08-31")),
      undefined,
      manual,
    );
    if (after.status !== "ok") throw new Error(after.status);
    const rows = after.view.items.filter((item) => item.id === "4821");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.disposition).toBe("out_of_window");
    expect(row.retention).toEqual({
      state: "tracked_incomplete",
      label: "Recorded renewal work or source updates retained outside the active window",
    });
    expect(row.endDateIso).toBe("2027-08-31");
    expect(row.manualProgress?.nextActivity).toBe(remaining);
    expect(row.manualProgress?.complete).toBe(false);
    expect(row.cycleSourceDate).toMatchObject({
      state: "changed",
      recordedIso: "2026-08-31",
      currentIso: "2027-08-31",
    });
    // The recorded cycle identity and basis are history: the read rewrote nothing.
    expect(manual.get("4821")?.cycleId).toBe(CYCLE_A);
    expect(manual.get("4821")?.basis.dateIso).toBe("2026-08-31");
  });

  it("AC-S123-3: an external-only future-dated lease opens for inspection without a cycle and without a source-date claim", async () => {
    const manual = new Map<string, RenewalWorkspaceState>();
    const desk = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig(exportRows("2026-08-31")) as unknown as DeskConfigArg,
      undefined,
      undefined,
      [],
      undefined,
      true,
      snapshotResult(exportRows("2026-08-31")),
      undefined,
      manual,
    );
    if (desk.status !== "ok") throw new Error(desk.status);
    const row = desk.view.items.find((item) => item.id === "8004");
    expect(row?.retention.state).toBe("outside");
    expect(row?.manualProgress).toBeUndefined();
    expect(row?.cycleSourceDate).toBeUndefined();
    expect(manual.size).toBe(0);

    clearLiveLeaseCache();
    const workspace = await loadLiveRenewalLeaseWorkspace(
      "8004",
      READ_TS,
      okConfig(exportRows("2026-08-31")) as unknown as WorkspaceConfigArg,
      null,
      null,
      [],
      undefined,
      undefined,
      null,
      undefined,
      null,
      null,
    );
    if (workspace.status !== "ok") throw new Error(workspace.status);
    expect(workspace.workspace.summary.retention.state).toBe("outside");
    expect(workspace.workspace.summary.cycleSourceDate).toBeUndefined();
    expect(workspace.workspace.summary.manualProgress).toBeUndefined();
    expect(workspace.workspace.workflowAvailable).toBe(false);
    expect(manual.size).toBe(0);
  });

  it("AC-S123-4: the workspace carries the changed source date beside the immutable recorded basis", async () => {
    const manual = acceptedButUnsigned();
    const workspace = await loadLiveRenewalLeaseWorkspace(
      "4821",
      READ_TS,
      okConfig(exportRows("2027-08-31")) as unknown as WorkspaceConfigArg,
      null,
      null,
      [],
      undefined,
      undefined,
      null,
      undefined,
      null,
      manual,
    );
    if (workspace.status !== "ok") throw new Error(workspace.status);
    expect(workspace.workspace.summary.endDateIso).toBe("2027-08-31");
    expect(workspace.workspace.summary.cycleSourceDate).toMatchObject({
      state: "changed",
      recordedIso: "2026-08-31",
      currentIso: "2027-08-31",
    });
    expect(workspace.workspace.summary.retention.state).toBe("tracked_incomplete");
    expect(workspace.workspace.workflowAvailable).toBe(true);
    expect(manual.basis).toEqual({
      kind: "lease_end",
      dateIso: "2026-08-31",
      source: "RentVine lease end",
    });
    expect(manual.ownerResponse?.terms).toEqual({
      rent: 1250,
      effectiveDate: "2026-09-01",
      endDate: "2027-08-31",
    });
  });
});

describe("S123 preservation: acceptance, dates, closure and cycle identity stay separate", () => {
  it("AC-S123-2: tenant acceptance with future terms and missing signatures stays unfinished; only an audited closure completes it", () => {
    const state = acceptedButUnsigned();
    const summary = manualRenewalSummary(state);
    expect(summary.complete).toBe(false);
    expect(summary.nextActivity).not.toBe("complete");
    expect(summary.label).toBe("Manual work in progress");
    expect(() =>
      planRenewalWorkspaceAction(
        state,
        { kind: "complete", source: "Premature" },
        meta("early"),
      ),
    ).toThrow(/remain unfinished/);

    let closed = state;
    const policy = { reason: "Fixture policy", applicabilityPolicy: "Approved policy 1" };
    for (const activity of ["documents", "document_delivery", "signatures"] as const) {
      closed = planRenewalWorkspaceAction(
        closed,
        { kind: "activity", activity, outcome: "done", source: "Fixture" },
        meta(`done-${activity}`),
      );
    }
    for (const activity of [
      "information_form",
      "form_returned",
      "insurance",
      "rhino",
      "pet",
      "charges",
      "inspection",
      "filter",
      "utilities",
      "assisted_housing",
    ] as const) {
      closed = planRenewalWorkspaceAction(
        closed,
        {
          kind: "activity",
          activity,
          outcome: "not_applicable",
          source: "Fixture",
          ...policy,
        },
        meta(`na-${activity}`),
      );
    }
    expect(manualRenewalSummary(closed).nextActivity).toBe("complete");
    expect(manualRenewalSummary(closed).complete).toBe(false);
    const completed = planRenewalWorkspaceAction(
      closed,
      { kind: "complete", source: "Staff reviewed the checklist" },
      meta("complete"),
    );
    const done = manualRenewalSummary(completed);
    expect(done.complete).toBe(true);
    expect(done.label).toBe("Completed: recorded by staff");
    expect(completed.completion?.actorUid).toBe("operator");
    expect(completed.basis.dateIso).toBe("2026-08-31");
  });

  it("AC-S123-5: a later cycle starts empty and an old status is attributed to the previous cycle", () => {
    const previous = acceptedButUnsigned();
    const next = emptyRenewalWorkspace("4821", CYCLE_B, {
      kind: "lease_end",
      dateIso: "2027-08-31",
      source: "RentVine lease end",
    });
    expect(next.cycleId).not.toBe(previous.cycleId);
    expect(next.completion).toBeNull();
    expect(next.activities).toEqual({});
    expect(next.tenantResponse).toBeNull();
    expect(manualRenewalSummary(next).nextActivity).toBe("owner_outreach");
    expect(manualRenewalSummary(next).complete).toBe(false);
    expect(previous.tenantResponse?.outcome).toBe("accepted");

    const record = {
      schemaVersion: "renewal-work-status/v1" as const,
      leaseId: "4821",
      revision: 1,
      status: "waiting_on_owner_response" as const,
      recordedAt: "2026-07-18T12:00:00.000Z",
      recordedByUid: "operator",
      recordedByLabel: "operator@pmikcmetro.com",
      cycleId: CYCLE_A,
      eventId: "0f1c8f6e-6d1c-4bd3-9d7a-000000000001",
    };
    const relationFor = (currentCycleId: string) => {
      const projection = projectRenewalWorkStatus(
        { available: true, record },
        currentCycleId,
      );
      return projection.state === "recorded"
        ? projection.cycleRelation
        : projection.state;
    };
    expect(relationFor(CYCLE_B)).toBe("previous");
    expect(relationFor(CYCLE_A)).toBe("current");
  });

  it("AC-S123-7: the S128 operating-Sheet pause is unaffected by the read-only projection", () => {
    vi.stubEnv(SHEET_WRITEBACK_FLAG, "");
    expect(isOperatingSheetWritebackPaused()).toBe(true);
    vi.stubEnv(SHEET_WRITEBACK_FLAG, "false");
    expect(isOperatingSheetWritebackPaused()).toBe(true);
    const basis = { kind: "lease_end" as const, dateIso: "2026-08-31", source: "x" };
    projectCycleSourceDateChange(basis, "2027-08-31");
    expect(isOperatingSheetWritebackPaused()).toBe(true);
  });
});
