import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import type { DateWindow } from "@/lib/lease-renewal/cohort";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import {
  loadLiveRenewalDesk,
  loadLiveRenewalLeaseWorkspace,
} from "@/lib/lease-renewal/live-desk";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  serializeRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  buildDeskReturnHref,
  buildWorkspaceHref,
  encodeDeskView,
  parseDeskViewState,
  validateDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import { withFakeLeaseDetail } from "@/tests/helpers/rentvine-detail-fake";

// S104: the table and the lease workspace read ONE projection, so a lease cannot show a different
// rent, term, status, blocker, or next action depending on which surface an operator opens; and a
// filtered, sorted view survives a trip into a lease and back. Fixture values are synthetic.

beforeEach(clearLiveLeaseCache);

const READ_TS = "2026-07-19T00:00:00.000Z";
const WINDOWS: DateWindow[] = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];

const EXPORT_ROWS = [
  {
    lease: {
      leaseID: 4821,
      startDate: "2025-09-01",
      endDate: "2026-08-31",
      isMonthToMonth: "0",
      // The lease's contractual base rent differs from the unit's listed rent, so a surface that
      // silently fell back to `unit.rent` would be visible in the parity assertion.
      baseRentAmount: 1250,
      tenants: [{ name: "Jordan Maple" }],
    },
    property: { streetNumber: "4821", streetName: "Maple Ct" },
    unit: { rent: "1300.00" },
  },
  {
    lease: {
      leaseID: 7003,
      startDate: "2024-08-01",
      endDate: "2026-08-31",
      isMonthToMonth: "1",
      monthToMonthStartDate: "2025-08-15",
      tenants: [{ name: "Mtm Tenant" }],
    },
    unit: { rent: "900.00" },
  },
];

function fakeSheetsReader() {
  const values = SAMPLE_RENEWAL_TABLES[0];
  return {
    listTabTitles: async () => ["Lease Renewal"],
    batchGet: async () => ({ valueRanges: [{ range: "Lease Renewal", values }] }),
    batchGetFormulas: async () => ({
      valueRanges: [{ range: "Lease Renewal", values }],
    }),
  };
}

function okConfig() {
  return {
    ok: true as const,
    rentvineClient: withFakeLeaseDetail({
      listAllLeasesExport: async () => ({
        rows: EXPORT_ROWS as Record<string, unknown>[],
        pages: 1,
        complete: true,
      }),
    }),
    rentvineHost: "pmikcmetro.rentvine.com",
    sheetsReader: fakeSheetsReader(),
    spreadsheetId: "sheet-id",
  };
}

type DeskConfigArg = Parameters<typeof loadLiveRenewalDesk>[2];
type WorkspaceConfigArg = Parameters<typeof loadLiveRenewalLeaseWorkspace>[2];

async function surfacesFor(leaseId: string) {
  const desk = await loadLiveRenewalDesk(
    WINDOWS,
    READ_TS,
    okConfig() as unknown as DeskConfigArg,
  );
  if (desk.status !== "ok") throw new Error(desk.status);
  const row = desk.view.items.find((item) => item.id === leaseId);
  if (!row) throw new Error(`No desk row for lease ${leaseId}.`);
  clearLiveLeaseCache();
  const workspace = await loadLiveRenewalLeaseWorkspace(
    leaseId,
    READ_TS,
    okConfig() as unknown as WorkspaceConfigArg,
  );
  if (workspace.status !== "ok") throw new Error(workspace.status);
  return { row, workspace: workspace.workspace };
}

describe("S104 desk and workspace parity (ARCH-S104-1 / BEH-S104-1)", () => {
  it("shows the same lease-scoped rent and unit reference on both surfaces", async () => {
    const { row, workspace } = await surfacesFor("4821");
    expect(row.currentRent).toBe(1250);
    expect(row.currentRent).toBe(workspace.summary.currentRent);
    expect(row.unitListedRent).toBe(1300);
    expect(row.unitListedRent).toBe(workspace.summary.unitListedRent);
    // The workspace's own reference field stays byte-equal to the shared projection.
    expect(workspace.unitListedRent).toBe(workspace.summary.unitListedRent);
  });

  it("shows the same term projection on both surfaces (AC-S104-1)", async () => {
    for (const leaseId of ["4821", "7003"]) {
      const { row, workspace } = await surfacesFor(leaseId);
      expect(row.leaseTerm).toEqual(workspace.summary.leaseTerm);
      expect(row.queryKeys.leaseTerm).toBe(workspace.summary.leaseTerm.term);
    }
    const monthToMonth = await surfacesFor("7003");
    expect(monthToMonth.row.leaseTerm).toMatchObject({
      term: "month_to_month",
      nextReviewIso: "2026-08-15",
    });
  });

  it("shows the same status, blockers, and next action on both surfaces", async () => {
    const { row, workspace } = await surfacesFor("4821");
    expect(workspace.guidance).toEqual(row.guidance);
    expect(workspace.guidance.overallStatus).toBe(row.guidance.overallStatus);
    expect(workspace.guidance.blockers.map((blocker) => blocker.id)).toEqual(
      row.guidance.blockers.map((blocker) => blocker.id),
    );
    expect(workspace.guidance.action).toEqual(row.guidance.action);
    expect(workspace.summary.retention).toEqual(row.retention);
    expect(workspace.summary.reasonLabel).toBe(row.reasonLabel);
  });

  it("keeps an inspection-only lease honest on both surfaces", async () => {
    const { row, workspace } = await surfacesFor("7003");
    expect(row.disposition).toBe("periodic_review");
    expect(workspace.workflowAvailable).toBe(false);
    expect(workspace.guidance).toEqual(row.guidance);
  });
});

describe("S104 open, write, and return continuity (BEH-S104-2 / AC-S104-2)", () => {
  const filtered = {
    ...DEFAULT_RENEWAL_DESK_QUERY_V2,
    sort: "base_rent" as const,
    direction: "desc" as const,
    scope: "all" as const,
    month: "2026-08",
    term: "fixed_term" as const,
    overallStatus: "needs_verification" as const,
  };

  it("returns from a lease to the byte-identical desk query", () => {
    const deskView = encodeDeskView(filtered);
    expect(deskView).toBe(serializeRenewalDeskQueryV2(filtered));
    const workspaceHref = buildWorkspaceHref({ leaseId: "4821", deskView });
    const carried = new URL(`http://localhost${workspaceHref}`).searchParams.get(
      "deskView",
    );
    expect(validateDeskView(carried)).toBe(deskView);
    expect(buildDeskReturnHref(carried)).toBe(`/lease-renewal/live/desk?${deskView}`);
    expect(parseDeskViewState(carried)).toMatchObject({
      sort: "base_rent",
      direction: "desc",
      scope: "all",
      month: "2026-08",
      term: "fixed_term",
      overallStatus: "needs_verification",
    });
  });

  it("keeps the continuation across a phase link, so a recorded change returns in place", () => {
    const deskView = encodeDeskView(filtered);
    const phaseHref = buildWorkspaceHref({
      leaseId: "4821",
      step: "verify-renewal",
      deskView,
    });
    const params = new URL(`http://localhost${phaseHref}`).searchParams;
    expect(params.get("step")).toBe("verify-renewal");
    expect(buildDeskReturnHref(params.get("deskView"))).toBe(
      `/lease-renewal/live/desk?${deskView}`,
    );
  });

  it("never silently restores a different view than the one carried (AC-S104-2)", () => {
    const deskView = encodeDeskView(filtered)!;
    const intact = buildDeskReturnHref(deskView);
    // A link that lost one filter restores a different table, so it can never be mistaken for the
    // operator's view.
    expect(buildDeskReturnHref(deskView.replace("&term=fixed_term", ""))).not.toBe(
      intact,
    );
    // A malformed, nested, unknown-key, or unknown-version link falls back to the default desk
    // instead of a partially restored one.
    for (const damaged of [
      deskView.replace("v=2", "v=3"),
      `${deskView}&deskView=nested`,
      `${deskView}&unknown=1`,
      `?${deskView}`,
      `${deskView}#fragment`,
    ]) {
      expect(buildDeskReturnHref(damaged)).toBe("/lease-renewal/live/desk");
    }
  });
});

describe("S104 one projection, no local recomputation (AC-S104-3)", () => {
  it("keeps the term and status builders out of the rendering components", () => {
    for (const path of [
      "components/lease-renewal/RenewalDeskTable.tsx",
      "components/lease-renewal/RenewalWorkspace.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/projectLeaseTerm|buildDeskLeaseGuidance/);
      expect(source).not.toMatch(/classifyRenewalCohort/);
    }
  });
});
