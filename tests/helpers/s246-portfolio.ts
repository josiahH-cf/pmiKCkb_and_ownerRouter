// S246 synthetic portfolio (AC-S246-1): one lease per state the working batch must place, read on
// a fixed Central business date of November 5, 2026 so the working month is December 2026. Every
// name, address and amount is invented; nothing here comes from a real lease.

import type { RentVineLeaseStatus } from "@/lib/integrations/rentvine/client";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import type { RenewalCycleDateDecision } from "@/lib/lease-renewal/cycle-date-decision";
import { buildRenewalDeskWindow } from "@/lib/lease-renewal/desk-query";
import type { DeskLeaseRow, RenewalDeskView } from "@/lib/lease-renewal/desk-model";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import {
  loadLiveRenewalDesk,
  loadLiveRenewalLeaseWorkspace,
} from "@/lib/lease-renewal/live-desk";
import {
  clearLiveLeaseCache,
  type LiveLeaseSnapshotResult,
} from "@/lib/lease-renewal/live-lease-cache";
import type { RenewalLeaseWorkspace } from "@/lib/lease-renewal/desk-model";
import type { LeaseOutreachEvidenceInput } from "@/lib/lease-renewal/outreach-evidence";
import type { KickoffSupportRead } from "@/lib/lease-renewal/kickoff-facts";
import type { RenewalPricingRead } from "@/lib/lease-renewal/renewal-pricing-policy";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import { RENEWAL_PROCESS_VERSION } from "@/lib/lease-renewal/renewal-process";
import {
  RENEWAL_STAGE,
  type RenewalProgress,
} from "@/lib/lease-renewal/renewal-progress";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import {
  applyFakeLeaseDetail,
  withFakeLeaseDetail,
} from "@/tests/helpers/rentvine-detail-fake";

/** Noon Central on November 5, 2026. */
export const S246_READ_TS = "2026-11-05T18:00:00.000Z";
export const S246_TODAY = "2026-11-05";
export const S246_WORKING_MONTH = "2026-12";
export const S246_RENEWED_CYCLE = "5b0c1d2e-3f40-4a51-8b62-7c8d9e0f1a2b";
export const S246_COMPLETED_CYCLE = "6c1d2e3f-4051-4b62-9c73-8d9e0f1a2b3c";

const status = (
  leaseStatusID: string,
  name: string,
  primaryLeaseStatusID: string | null,
  pendingMoveOut = false,
): RentVineLeaseStatus => ({
  leaseStatusID,
  name,
  primaryLeaseStatusID,
  isPendingMoveOutStatus: pendingMoveOut,
  isCompletedMoveOutStatus: false,
  isPendingMoveInStatus: false,
  isSystemStatus: false,
});

export const S246_STATUSES: RentVineLeaseStatus[] = [
  status("1", "Future", "1"),
  status("2", "Active", "2"),
  status("3", "Closed", "3"),
  status("4", "Notice Given", "2", true),
  // A status row whose documented primary status is missing: it cannot say active or closed.
  status("5", "Unmapped", null),
];

type Row = Record<string, unknown>;

function lease(
  leaseID: number,
  fields: Record<string, unknown>,
  street: string,
  tenant: string,
): Row {
  return {
    lease: {
      leaseID,
      leaseType: "Fixed Term",
      leaseStatusID: "2",
      tenants: [{ name: tenant }],
      ...fields,
    },
    property: {
      name: `${street} Example`,
      streetNumber: String(leaseID),
      streetName: street,
    },
    portfolio: { portfolioID: leaseID + 9000, owners: [{ name: `${tenant} Owner` }] },
    unit: { rent: "1200.00" },
  };
}

/** One synthetic lease per state, keyed by what it models. */
export const S246_LEASES = {
  activeInMonth: "101",
  activeInMonthSecond: "102",
  activeLater: "103",
  endedWithoutOutcome: "104",
  endingThisMonth: "105",
  closed: "106",
  pending: "107",
  moveOut: "108",
  monthToMonthDue: "109",
  monthToMonthLater: "110",
  renewedInSource: "111",
  program: "112",
  ownerHold: "113",
  noEndDate: "114",
  statusUnreadable: "115",
  completed: "116",
} as const;

export function s246Rows(): Row[] {
  return [
    lease(101, { endDate: "2026-12-31" }, "Sample St", "Avery Example"),
    lease(102, { endDate: "2026-12-31" }, "Example Ave", "Blake Example"),
    lease(103, { endDate: "2027-02-28" }, "Later Ln", "Casey Example"),
    lease(104, { endDate: "2026-10-31" }, "Ended Ct", "Devon Example"),
    lease(105, { endDate: "2026-11-30" }, "Current Ct", "Emery Example"),
    lease(
      106,
      { endDate: "2026-12-31", leaseStatusID: "3" },
      "Closed Ct",
      "Finley Sample",
    ),
    lease(107, { endDate: "2026-12-31", leaseStatusID: "1" }, "Future Ct", "Gray Sample"),
    lease(
      108,
      { endDate: "2026-12-31", leaseStatusID: "4", noticeDate: "2026-10-20" },
      "Notice Row",
      "Harper Sample",
    ),
    lease(
      109,
      { endDate: null, isMonthToMonth: "1", monthToMonthStartDate: "2025-12-10" },
      "Monthly Way",
      "Indigo Sample",
    ),
    lease(
      110,
      { endDate: null, isMonthToMonth: "1", monthToMonthStartDate: "2026-06-15" },
      "Monthly Later Way",
      "Jules Sample",
    ),
    lease(111, { endDate: "2027-12-31" }, "Renewed Rd", "Kai Sample"),
    lease(
      112,
      // S251 R-S251-10: housing assistance wording is a suggestion only, so the program lease of
      // this matrix uses program wording that keeps "Program lease".
      { endDate: "2026-12-31", program: "PadSplit program" },
      "Program Pl",
      "Lane Sample",
    ),
    lease(
      113,
      { endDate: "2026-12-31", notes: "Owner hold through spring" },
      "Hold Hill",
      "Morgan Sample",
    ),
    lease(114, { endDate: null }, "Undated Dr", "Noel Sample"),
    lease(
      115,
      { endDate: "2026-12-31", leaseStatusID: "99" },
      "Unread Run",
      "Oak Sample",
    ),
    lease(116, { endDate: "2026-12-31" }, "Done Dr", "Parker Sample"),
  ];
}

const meta = (eventId: string) => ({
  actorUid: "synthetic-operator",
  recordedAt: "2026-11-03T15:00:00.000Z",
  eventId,
});

function cycle(leaseId: string, cycleId: string, dateIso: string): RenewalWorkspaceState {
  return planRenewalWorkspaceAction(
    emptyRenewalWorkspace(leaseId, cycleId, {
      kind: "lease_end",
      dateIso,
      source: "RentVine lease end",
    }),
    { kind: "activity", activity: "owner_outreach", outcome: "done", source: "Call" },
    meta(`${leaseId}-outreach`),
  );
}

/** Staff records: an unfinished cycle RentVine has since moved past, and a completed cycle. */
export function s246Manual(): Map<string, RenewalWorkspaceState> {
  return new Map([
    [S246_LEASES.renewedInSource, cycle("111", S246_RENEWED_CYCLE, "2026-12-31")],
    [
      S246_LEASES.completed,
      planRenewalWorkspaceAction(
        cycle("116", S246_COMPLETED_CYCLE, "2026-12-31"),
        { kind: "complete", source: "Signed renewal on file" },
        meta("116-complete"),
      ),
    ],
  ]);
}

/**
 * A lease whose saved app progress records a completion, with no staff record, that ended in
 * October (outside the desk window). It is kept out of `s246Rows()` so the sixteen-lease portfolio
 * and every count pinned on it stay as they are; a test adds it with `s246RowsWithAppCompletion()`.
 */
export const S246_APP_COMPLETED = "117";

export function s246RowsWithAppCompletion(): Row[] {
  return [
    ...s246Rows(),
    lease(117, { endDate: "2026-10-31" }, "Recorded Row", "Quinn Sample"),
  ];
}

/** Saved app progress that records a completion, for each lease id given. */
export function s246AppProgress(
  leaseIds: readonly string[] = [S246_APP_COMPLETED],
): Map<string, RenewalProgress> {
  return new Map(
    leaseIds.map((leaseId) => [
      leaseId,
      {
        leaseId,
        processVersion: RENEWAL_PROCESS_VERSION,
        stageIndex: RENEWAL_STAGE.close,
        ownerDecision: null,
        ownerDecisionRevision: 0,
        tenantOfferDraftId: null,
        tenantOutcome: null,
        evidence: {},
        complete: true,
      },
    ]),
  );
}

export interface S246DeskOptions {
  readonly rows?: Row[];
  readonly statuses?: RentVineLeaseStatus[] | "unavailable";
  readonly manual?: ReadonlyMap<string, RenewalWorkspaceState>;
  readonly decisions?: ReadonlyMap<string, RenewalCycleDateDecision>;
  /** Saved app progress by lease id; absent means none is saved. */
  readonly progress?: Map<string, RenewalProgress>;
  /** False when saved progress could not be read: every desk row then needs verification. */
  readonly progressStateAvailable?: boolean;
  readonly readTs?: string;
  /** S248: linked renewal message evidence by lease id; absent means the desk did not read it. */
  readonly outreach?: ReadonlyMap<string, LeaseOutreachEvidenceInput>;
  /** S248: the evidence read failed for this render. */
  readonly outreachUnavailable?: boolean;
  /** S250/S251: the bulk working-record read; absent means the desk did not read it. */
  readonly working?: ReadonlyMap<string, RenewalWorkingRecord>;
  /** S250: the bounded pricing read (assignments, policies, agreements). */
  readonly pricing?: RenewalPricingRead;
  /** S249: the preparation projection's bulk read; absent means not attempted. */
  readonly kickoffSupport?: KickoffSupportRead;
}

/** The synthetic sources and one lease generation both orchestrations read. */
function s246Sources(options: S246DeskOptions) {
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
  const rows = options.rows ?? s246Rows();
  const readTs = options.readTs ?? S246_READ_TS;
  const statuses = options.statuses ?? S246_STATUSES;
  const config = {
    ok: true as const,
    rentvineClient: withFakeLeaseDetail({
      listAllLeasesExport: async () => ({ rows, pages: 1, complete: true }),
      listLeaseStatuses: async () => {
        if (statuses === "unavailable") throw new Error("synthetic status outage");
        return statuses;
      },
    }),
    rentvineHost: "pmikcmetro.rentvine.com",
    sheetsReader: {
      listTabTitles: async () => ["Lease Renewal"],
      batchGet: async () => ({
        valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
      }),
      batchGetFormulas: async () => ({
        valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
      }),
    },
    spreadsheetId: "sheet-id",
  };
  const views = leaseViewsFromExport(rows);
  applyFakeLeaseDetail(views, rows);
  const snapshot: LiveLeaseSnapshotResult = {
    snapshot: {
      views,
      complete: true,
      readAtMs: Date.parse(readTs),
      detailComplete: true,
      detailUnavailableCount: 0,
    },
    currency: {
      state: "fresh",
      ageMs: 0,
      readAtMs: Date.parse(readTs),
      refreshing: false,
      lastError: false,
    },
  };
  return { readTs, config, snapshot };
}

/** Run the one desk orchestration over the synthetic portfolio. */
export async function loadS246Desk(
  options: S246DeskOptions = {},
): Promise<RenewalDeskView> {
  const { readTs, config, snapshot } = s246Sources(options);
  const result = await loadLiveRenewalDesk(
    [buildRenewalDeskWindow(readTs.slice(0, 10))],
    readTs,
    config as unknown as Parameters<typeof loadLiveRenewalDesk>[2],
    options.progress,
    undefined,
    [],
    undefined,
    options.progressStateAvailable ?? true,
    snapshot,
    undefined,
    options.manual ?? s246Manual(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.working,
    options.pricing,
    options.decisions,
    options.outreach || options.outreachUnavailable
      ? {
          available: options.outreachUnavailable !== true,
          byLease: options.outreach ?? new Map(),
        }
      : undefined,
    options.kickoffSupport,
  );
  if (result.status !== "ok") throw new Error(`desk load ${result.status}`);
  return result.view;
}

/** Open one synthetic lease the way its lease page does, over the same sources as the desk. */
export async function loadS246Workspace(
  leaseId: string,
  options: S246DeskOptions = {},
): Promise<RenewalLeaseWorkspace> {
  const { readTs, config, snapshot } = s246Sources(options);
  const result = await loadLiveRenewalLeaseWorkspace(
    leaseId,
    readTs,
    config as unknown as Parameters<typeof loadLiveRenewalLeaseWorkspace>[2],
    options.progress?.get(leaseId) ?? null,
    null,
    [],
    undefined,
    undefined,
    null,
    { status: "available", value: snapshot },
    null,
    (options.manual ?? s246Manual()).get(leaseId) ?? null,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.working ? (options.working.get(leaseId) ?? null) : undefined,
    options.pricing,
    options.decisions?.get(leaseId) ?? null,
    options.outreachUnavailable
      ? { readable: false, messages: [], records: [], drafts: [] }
      : options.outreach
        ? (options.outreach.get(leaseId) ?? {
            readable: true,
            messages: [],
            records: [],
            drafts: [],
          })
        : null,
    options.kickoffSupport ? { support: options.kickoffSupport } : undefined,
  );
  if (result.status !== "ok") throw new Error(`workspace load ${result.status}`);
  return result.workspace;
}

export function s246Row(view: RenewalDeskView, leaseId: string): DeskLeaseRow {
  const row = view.items.find((item) => item.id === leaseId);
  if (!row) throw new Error(`synthetic lease ${leaseId} was not loaded`);
  return row;
}
