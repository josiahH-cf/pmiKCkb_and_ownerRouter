import { beforeEach, describe, expect, it } from "vitest";

import type { DateWindow } from "@/lib/lease-renewal/cohort";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import {
  loadLiveRenewalDesk,
  loadLiveRenewalLeaseWorkspace,
} from "@/lib/lease-renewal/live-desk";
import {
  RENEWAL_STAGE,
  type RenewalProgress,
} from "@/lib/lease-renewal/renewal-progress";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";

// The loaders use the shared module-level export cache; reset it so cases don't leak reads.
beforeEach(clearLiveLeaseCache);

const READ_TS = "2026-07-19T00:00:00.000Z";
const WINDOWS: DateWindow[] = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];

// Live RentVine export rows crafted against the sample Renewals sheet tab:
//   4821 Jordan Maple  rent 1250 → agrees with the sheet ($1,250)          → actionable, no conflict
//   5001 Casey Rivers  rent 1400 → conflicts with the sheet ($1,300)       → actionable, 1 conflict
//   6002 Nomatch Tenant rent 1100 → no matching sheet row                  → actionable, "Needs input"
//   7003 Mtm Tenant    month-to-month                                      → skip
//   8004 Future Tenant ends 2026-12-31                                     → out of window
const EXPORT_ROWS = [
  {
    lease: {
      leaseID: 4821,
      endDate: "2026-08-31",
      leaseType: "Fixed Term",
      tenants: [{ name: "Jordan Maple" }],
    },
    unit: { rent: "1250.00" },
  },
  {
    lease: {
      leaseID: 5001,
      endDate: "2026-08-31",
      leaseType: "Fixed Term",
      tenants: [{ name: "Casey Rivers" }],
    },
    unit: { rent: "1400.00" },
  },
  {
    lease: {
      leaseID: 6002,
      endDate: "2026-09-30",
      leaseType: "Fixed Term",
      tenants: [{ name: "Nomatch Tenant" }],
    },
    unit: { rent: "1100.00" },
  },
  {
    lease: {
      leaseID: 7003,
      endDate: "2026-08-31",
      leaseType: "Month to Month",
      tenants: [{ name: "Mtm Tenant" }],
    },
    unit: { rent: "900.00" },
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
];

// A fake sheet reader that returns the sample Renewals tab (Jordan Maple $1,250, RIVERS CASEY $1,300,
// pat solstice $1,500), so the reconciliation runs against a real recognized "Renewals" record set.
function fakeSheetsReader() {
  return {
    listTabTitles: async () => ["Lease Renewal"],
    batchGet: async () => ({
      valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
    }),
  };
}

function okConfig(
  listLeasesExport: () => Promise<Record<string, unknown>[]> = async () =>
    EXPORT_ROWS as Record<string, unknown>[],
) {
  return {
    ok: true as const,
    rentvineClient: { listLeasesExport },
    sheetsReader: fakeSheetsReader(),
    spreadsheetId: "sheet-id",
  };
}

type DeskConfigArg = Parameters<typeof loadLiveRenewalDesk>[2];
type WorkspaceConfigArg = Parameters<typeof loadLiveRenewalLeaseWorkspace>[2];

describe("loadLiveRenewalDesk", () => {
  it("classifies real live leases into cohort dispositions", async () => {
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.view.cohort.summary).toMatchObject({
      total: 5,
      actionable: 3,
      skipped: 1,
      outOfWindow: 1,
      needsReview: 0,
    });
    expect(result.view.actionable.map((s) => s.id).sort()).toEqual([
      "4821",
      "5001",
      "6002",
    ]);
    expect(result.view.skipped.map((s) => s.id)).toEqual(["7003"]);
    expect(result.view.outOfWindow.map((s) => s.id)).toEqual(["8004"]);
  });

  it("counts open conflicts from the REAL reconciliation, not a fabricated value", async () => {
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
    );
    if (result.status !== "ok") throw new Error(result.status);

    const agrees = result.view.actionable.find((s) => s.id === "4821");
    const conflicts = result.view.actionable.find((s) => s.id === "5001");
    const needsInput = result.view.actionable.find((s) => s.id === "6002");

    expect(agrees?.openConflicts).toBe(0);
    expect(agrees?.stageLabel).toBe("Owner decision");
    expect(conflicts?.openConflicts).toBe(1);
    expect(conflicts?.stageLabel).toBe("Data check");
    // A field RentVine could not reconcile is NOT counted as a conflict (and never a fabricated pass).
    expect(needsInput?.openConflicts).toBe(0);
  });

  it("degrades to the config status without throwing when not connected", async () => {
    expect(
      await loadLiveRenewalDesk(WINDOWS, READ_TS, {
        ok: false,
        reason: "not_configured",
      }),
    ).toEqual({ status: "not_configured" });
    expect(
      await loadLiveRenewalDesk(WINDOWS, READ_TS, {
        ok: false,
        reason: "account_mismatch",
      }),
    ).toEqual({ status: "account_mismatch" });
  });

  it("returns read_error when the live read throws", async () => {
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig(async () => {
        throw new Error("boom");
      }) as unknown as DeskConfigArg,
    );
    expect(result).toEqual({ status: "read_error" });
  });
});

describe("loadLiveRenewalLeaseWorkspace", () => {
  it("maps the REAL rent reconciliation into the Data-check for a conflicting lease", async () => {
    const result = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
    );
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const { workspace } = result;
    // The composer needs the real RentVine id; the tenant offer is drafted only via the gated composer.
    expect(workspace.summary.id).toBe("5001");
    expect(workspace.tenantDraft).toBeNull();

    const rent = workspace.dataCheck.find((item) => item.fieldKey === "current_rent");
    expect(rent?.agreement).toBe("conflict");
    // Both real sources are carried (in-app PII display), sourced from RentVine and the sheet.
    const sources = rent?.candidates.map((c) => c.source) ?? [];
    expect(sources).toContain("rentvine");
    expect(sources.some((s) => s.startsWith("sheet"))).toBe(true);
  });

  it("agrees when the live rent matches the sheet", async () => {
    const result = await loadLiveRenewalLeaseWorkspace(
      "4821",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
    );
    if (result.status !== "ok") throw new Error(result.status);
    const rent = result.workspace.dataCheck.find((i) => i.fieldKey === "current_rent");
    expect(rent?.agreement).toBe("agree");
  });

  it("marks a field it cannot reconcile as 'Needs input', never a fabricated pass", async () => {
    const result = await loadLiveRenewalLeaseWorkspace(
      "6002",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
    );
    if (result.status !== "ok") throw new Error(result.status);
    const rent = result.workspace.dataCheck.find((i) => i.fieldKey === "current_rent");
    // No matching sheet row → the field cannot be reconciled → "missing" (renders "Needs input").
    expect(rent?.agreement).toBe("missing");
    expect(rent?.agreement).not.toBe("agree");
    // Every readiness check is honestly "Needs input" (RentVine carries no build-out inputs).
    expect(result.workspace.readiness.needsInput.length).toBeGreaterThan(0);
    expect(
      result.workspace.readiness.flags.length +
        result.workspace.readiness.needsInput.length,
    ).toBe(result.workspace.readiness.checks.length);
  });

  it("returns not_found for an unknown or non-actionable lease", async () => {
    const unknown = await loadLiveRenewalLeaseWorkspace(
      "does-not-exist",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
    );
    expect(unknown).toEqual({ status: "not_found" });

    clearLiveLeaseCache();
    // 7003 is month-to-month → skip → not an actionable workspace.
    const skipped = await loadLiveRenewalLeaseWorkspace(
      "7003",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
    );
    expect(skipped).toEqual({ status: "not_found" });
  });

  it("degrades to the config status and to read_error without throwing", async () => {
    expect(
      await loadLiveRenewalLeaseWorkspace("5001", READ_TS, {
        ok: false,
        reason: "not_configured",
      }),
    ).toEqual({ status: "not_configured" });

    clearLiveLeaseCache();
    const result = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      okConfig(async () => {
        throw new Error("boom");
      }) as unknown as WorkspaceConfigArg,
    );
    expect(result).toEqual({ status: "read_error" });
  });
});

describe("live renewal workspace + recorded progress (Phase A)", () => {
  function progressFor(overrides: Partial<RenewalProgress>): RenewalProgress {
    return {
      leaseId: "4821",
      stageIndex: RENEWAL_STAGE.tenant,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      tenantOfferDraftId: null,
      complete: false,
      ...overrides,
    };
  }

  it("a recorded owner decision advances the stage and builds the tenant offer from those numbers", async () => {
    const result = await loadLiveRenewalLeaseWorkspace(
      "4821",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
      progressFor({}),
    );
    if (result.status !== "ok") throw new Error(result.status);
    const { workspace } = result;

    // Stage now reflects the recorded progress, not the data-derived default (which was Owner decision).
    expect(workspace.currentStepIndex).toBe(RENEWAL_STAGE.tenant);
    expect(workspace.summary.stageLabel).toBe("Tenant offer");
    // The tenant offer is a REAL draft built from the recorded rent, not null and not a placeholder.
    expect(workspace.tenantDraft).not.toBeNull();
    expect(workspace.tenantDraft?.channels.email.body).toContain("$1,300");
    // The live progress payload is carried for the workspace controls.
    expect(workspace.live?.ownerDecision).toEqual({
      decision: "increase",
      offeredRent: 1300,
    });
    expect(workspace.live?.leaseId).toBe("4821");
  });

  it("without a recorded decision the tenant offer stays null (composer is still the only send)", async () => {
    const result = await loadLiveRenewalLeaseWorkspace(
      "4821",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
      null,
    );
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.workspace.tenantDraft).toBeNull();
    expect(result.workspace.live?.ownerDecision).toBeNull();
  });

  it("the desk projects each lease's recorded stage over the derived default", async () => {
    const progressByLease = new Map<string, RenewalProgress>([
      [
        "4821",
        progressFor({ leaseId: "4821", stageIndex: RENEWAL_STAGE.build, complete: true }),
      ],
    ]);
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
      progressByLease,
    );
    if (result.status !== "ok") throw new Error(result.status);
    const recorded = result.view.actionable.find((s) => s.id === "4821");
    // 4821 agrees on rent (derived stage = Owner decision), but the recorded stage wins.
    expect(recorded?.stageLabel).toBe("Build docs");
    // A lease with no record keeps its derived stage.
    const untouched = result.view.actionable.find((s) => s.id === "5001");
    expect(untouched?.stageLabel).toBe("Data check");
  });
});
