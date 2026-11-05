// S246 synthetic portfolio (AC-S246-1): one lease per state the working batch must place, read on
// a fixed Central business date of November 5, 2026 so the working month is December 2026. Every
// name, address and amount is invented; nothing here comes from a real lease.

import type { RentVineLeaseStatus } from "@/lib/integrations/rentvine/client";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";
import type { RenewalCycleDateDecision } from "@/lib/lease-renewal/cycle-date-decision";
import { buildRenewalDeskWindow } from "@/lib/lease-renewal/desk-query";
import type { DeskLeaseRow, RenewalDeskView } from "@/lib/lease-renewal/desk-model";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import { loadLiveRenewalDesk } from "@/lib/lease-renewal/live-desk";
import {
  clearLiveLeaseCache,
  type LiveLeaseSnapshotResult,
} from "@/lib/lease-renewal/live-lease-cache";
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
      { endDate: "2026-12-31", program: "Housing voucher" },
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

export interface S246DeskOptions {
  readonly rows?: Row[];
  readonly statuses?: RentVineLeaseStatus[] | "unavailable";
  readonly manual?: ReadonlyMap<string, RenewalWorkspaceState>;
  readonly decisions?: ReadonlyMap<string, RenewalCycleDateDecision>;
  readonly readTs?: string;
}

/** Run the one desk orchestration over the synthetic portfolio. */
export async function loadS246Desk(
  options: S246DeskOptions = {},
): Promise<RenewalDeskView> {
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
  const result = await loadLiveRenewalDesk(
    [buildRenewalDeskWindow(readTs.slice(0, 10))],
    readTs,
    config as unknown as Parameters<typeof loadLiveRenewalDesk>[2],
    undefined,
    undefined,
    [],
    undefined,
    true,
    snapshot,
    undefined,
    options.manual ?? s246Manual(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    options.decisions,
  );
  if (result.status !== "ok") throw new Error(`desk load ${result.status}`);
  return result.view;
}

export function s246Row(view: RenewalDeskView, leaseId: string): DeskLeaseRow {
  const row = view.items.find((item) => item.id === leaseId);
  if (!row) throw new Error(`synthetic lease ${leaseId} was not loaded`);
  return row;
}
