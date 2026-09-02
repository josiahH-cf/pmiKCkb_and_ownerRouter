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
import { RENEWAL_PROCESS_VERSION } from "@/lib/lease-renewal/renewal-process";
import {
  DEFAULT_RENEWAL_DESK_QUERY,
  applyRenewalDeskQuery,
} from "@/lib/lease-renewal/desk-query";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import { DEFAULT_NOTICE_RULE_VALUES } from "@/lib/lease-renewal/notice-rules";
import type { WorkflowCommunicationLink } from "@/lib/gmail-hub/workflow-context";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";

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
      tenants: [{ name: "Jordan Maple" }, { name: "Riley Maple" }],
    },
    property: {
      name: "Maple Court",
      streetNumber: "4821",
      streetName: "Maple Ct",
      address2: "Unit 4",
    },
    portfolio: {
      owners: [{ companyName: "Maple Holdings LLC" }, { name: "Avery Owner" }],
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

type FakeExportRead = {
  rows: Record<string, unknown>[];
  pages: number;
  complete: boolean;
};

function okConfig(
  listAllLeasesExport: () => Promise<FakeExportRead> = async () => ({
    rows: EXPORT_ROWS as Record<string, unknown>[],
    pages: 1,
    complete: true,
  }),
) {
  return {
    ok: true as const,
    rentvineClient: { listAllLeasesExport },
    sheetsReader: fakeSheetsReader(),
    spreadsheetId: "sheet-id",
  };
}

function incompleteConfig() {
  return okConfig(async () => ({
    rows: EXPORT_ROWS as Record<string, unknown>[],
    pages: 20,
    complete: false,
  }));
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

    const identity = result.view.items.find((summary) => summary.id === "4821");
    expect(identity).toMatchObject({
      addressLabel: "4821 Maple Ct Unit 4",
      propertyNameLabel: "Maple Court",
      tenantNameLabels: ["Jordan Maple", "Riley Maple"],
      ownerNameLabels: ["Maple Holdings LLC", "Avery Owner"],
      queryKeys: {
        ownerLabels: ["Maple Holdings LLC", "Avery Owner"],
        tenantLabels: ["Jordan Maple", "Riley Maple"],
      },
    });
  });

  it("retains a tracked incomplete renewal outside the date window in the default worklist", async () => {
    const withoutProgress = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
    );
    if (withoutProgress.status !== "ok") throw new Error(withoutProgress.status);
    expect(
      applyRenewalDeskQuery(
        withoutProgress.view.items,
        DEFAULT_RENEWAL_DESK_QUERY,
      ).items.map((item) => item.id),
    ).not.toContain("8004");

    const progress: RenewalProgress = {
      leaseId: "8004",
      processVersion: RENEWAL_PROCESS_VERSION,
      stageIndex: RENEWAL_STAGE.owner,
      ownerDecision: null,
      ownerDecisionRevision: 0,
      tenantOfferDraftId: null,
      tenantOutcome: null,
      evidence: {},
      complete: false,
    };
    const tracked = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
      new Map([["8004", progress]]),
    );
    if (tracked.status !== "ok") throw new Error(tracked.status);

    const item = tracked.view.items.find((summary) => summary.id === "8004");
    expect(item).toMatchObject({
      retention: {
        state: "tracked_incomplete",
        label: "Tracked incomplete renewal retained outside the active window",
      },
      processVersion: RENEWAL_PROCESS_VERSION,
    });
    expect(item?.workflowStepId).not.toBeNull();
    expect(
      applyRenewalDeskQuery(tracked.view.items, DEFAULT_RENEWAL_DESK_QUERY).items.map(
        (summary) => summary.id,
      ),
    ).toContain("8004");
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
    // Rent agreement alone cannot skip unresolved authoritative recipients.
    expect(agrees?.stageLabel).toBe("Verify renewal");
    expect(conflicts?.openConflicts).toBe(1);
    expect(conflicts?.stageLabel).toBe("Verify renewal");
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

  // S57: the view carries the export read's completeness so the desk can render a partial read as
  // an explicit partial, never as the portfolio.
  it("marks the view readComplete on a complete read and not on a capped one", async () => {
    const complete = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
    );
    if (complete.status !== "ok") throw new Error(complete.status);
    expect(complete.view.readComplete).toBe(true);

    clearLiveLeaseCache();
    const partial = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      incompleteConfig() as unknown as DeskConfigArg,
    );
    if (partial.status !== "ok") throw new Error(partial.status);
    expect(partial.view.readComplete).toBe(false);
  });

  it("carries one byte-equal contact/policy/due projection across desk and workspace", async () => {
    const anchor = Date.parse("2026-07-10T12:00:00.000Z");
    const linked: WorkflowCommunicationLink = {
      id: "link-4821",
      actor_uid: "operator-1",
      mailbox_key: "mailbox-hash",
      lane: "renewals",
      entity_type: "renewal_lease",
      entity_id: "4821",
      purpose: "renewal_tenant",
      origin_action_key: "gmail.mailbox.read",
      source_refs: ["rentvine:lease:4821"],
      gmail_thread_id: "thread-4821",
      status: "linked",
      waiting_on: "resident",
      last_contact_at_ms: anchor,
      last_contact_source: "gmail_thread",
      last_contact_message_id: "message-4821",
      contact_observation_state: "current",
      created_at_ms: anchor,
      updated_at_ms: anchor,
      ...communicationsRetentionFields("workflow_link", anchor),
    };
    const followUpSources = {
      communicationState: "current" as const,
      links: [linked],
      policy: {
        state: "saved" as const,
        version: 4,
        updatedAtIso: "2026-07-09T00:00:00.000Z",
        ruleSet: {
          rules: [
            {
              scope: "global" as const,
              values: { ...DEFAULT_NOTICE_RULE_VALUES },
              verified: true,
            },
            {
              scope: "lease" as const,
              key: "4821",
              values: { followUpIntervalDays: 3 },
              verified: true,
            },
          ],
        },
      },
    };

    const desk = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
      undefined,
      followUpSources,
    );
    if (desk.status !== "ok") throw new Error(desk.status);
    const deskProjection = desk.view.actionable.find(
      (lease) => lease.id === "4821",
    )?.followUp;
    expect(deskProjection?.due).toEqual({
      state: "due",
      atIso: "2026-07-13T12:00:00.000Z",
    });

    const workspace = await loadLiveRenewalLeaseWorkspace(
      "4821",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
      null,
      null,
      [],
      null,
      followUpSources,
    );
    if (workspace.status !== "ok") throw new Error(workspace.status);
    expect(workspace.workspace.followUp).toEqual(deskProjection);
    expect(workspace.workspace.summary.followUp).toEqual(deskProjection);
    expect(
      workspace.workspace.process.steps[2].substeps.find(
        (substep) => substep.id === "refresh-contact-truth",
      )?.missingEvidence,
    ).toEqual([]);
    expect(
      workspace.workspace.process.steps[4].substeps.find(
        (substep) => substep.id === "apply-confirmed-follow-up-policy",
      )?.missingEvidence,
    ).toEqual([]);
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

  it("applies only the exact record-specific resolved rent to the owner draft", async () => {
    const unresolved = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
    );
    if (unresolved.status !== "ok") throw new Error(unresolved.status);
    const triggerKey = unresolved.workspace.dataCheck.find(
      (item) => item.fieldKey === "current_rent",
    )?.sourceTriggerKey;
    expect(triggerKey).toMatch(/^lease_renewal:reconcile:live-review:[a-f0-9]{16}:/);

    const result = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
      null,
      null,
      [
        {
          id: "wrong-record",
          source_trigger_key:
            "lease_renewal:reconcile:live-review:0000000000000000:current_rent",
          run_id: "live-review",
          field_key: "current_rent",
          field_label: "Current rent",
          severity: "High",
          status: "Resolved",
          corrected_value: "$9,999",
          created_at: READ_TS,
          updated_at: READ_TS,
        },
        {
          id: "exact-record",
          source_trigger_key: triggerKey!,
          run_id: "live-review",
          field_key: "current_rent",
          field_label: "Current rent",
          severity: "High",
          status: "Resolved",
          resolution_kind: "corrected_value",
          corrected_value: "$1,300.00",
          resolved_by_uid: "admin-fixture",
          created_at: READ_TS,
          updated_at: READ_TS,
        },
      ],
    );
    if (result.status !== "ok") throw new Error(result.status);
    expect(result.workspace.ownerDraft.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "current_rent",
          value: "$1,300",
          confidence: "Verified",
        }),
      ]),
    );
    expect(result.workspace.ownerDraft.body).not.toContain("$9,999");
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

  // S57: an incomplete read cannot prove absence — a miss on a partial portfolio is a read
  // failure, never a "not found" claim.
  it("returns read_error, not not_found, when the lease is missing from an incomplete read", async () => {
    const result = await loadLiveRenewalLeaseWorkspace(
      "does-not-exist",
      READ_TS,
      incompleteConfig() as unknown as WorkspaceConfigArg,
    );
    expect(result).toEqual({ status: "read_error" });

    clearLiveLeaseCache();
    // A lease PRESENT in the partial read still resolves — presence needs no completeness proof.
    const present = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      incompleteConfig() as unknown as WorkspaceConfigArg,
    );
    expect(present.status).toBe("ok");
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

describe("live renewal workspace + versioned evidence progress", () => {
  function progressFor(overrides: Partial<RenewalProgress>): RenewalProgress {
    return {
      leaseId: "4821",
      processVersion: RENEWAL_PROCESS_VERSION,
      stageIndex: RENEWAL_STAGE.tenant,
      ownerDecision: { decision: "increase", offeredRent: 1300 },
      ownerDecisionRevision: 1,
      tenantOfferDraftId: null,
      tenantOutcome: null,
      evidence: {},
      complete: false,
      ...overrides,
    };
  }

  it("a current owner decision builds the tenant offer without skipping unresolved verification", async () => {
    const result = await loadLiveRenewalLeaseWorkspace(
      "4821",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
      progressFor({
        evidence: {
          "owner-decision": {
            ref: "lease-progress:owner-decision:r1",
            source: "app_record",
            disposition: "verified",
          },
          "recurring-charges-separated": {
            ref: "app-contract:base-rent-and-recurring-charges:v1",
            source: "app_record",
            disposition: "verified",
          },
        },
      }),
    );
    if (result.status !== "ok") throw new Error(result.status);
    const { workspace } = result;

    // Exact process evidence wins over the old coarse stage pointer. Missing authoritative recipient
    // evidence keeps verification current even though the recorded owner decision may shape a draft.
    expect(workspace.currentStepIndex).toBe(RENEWAL_STAGE.verify);
    expect(workspace.summary.stageLabel).toBe("Verify renewal");
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

  it("invalidates a stored decision when current base-rent evidence has drifted", async () => {
    const result = await loadLiveRenewalLeaseWorkspace(
      "4821",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
      progressFor({
        evidence: {
          "base-rent": {
            ref: "renewal-current-rent:4821",
            source: "reconciliation_receipt",
            disposition: "verified",
            fingerprint: "a".repeat(64),
          },
          "owner-decision": {
            ref: "lease-progress:owner-decision:r1",
            source: "app_record",
            disposition: "verified",
          },
        },
      }),
    );
    if (result.status !== "ok") throw new Error(result.status);

    expect(result.workspace.live?.ownerDecisionCurrent).toBe(false);
    expect(result.workspace.tenantDraft).toBeNull();
    expect(
      result.workspace.process.steps[1].substeps.find(
        (substep) => substep.id === "record-owner-decision",
      )?.state,
    ).not.toBe("complete");
  });

  it("removes stale stored base-rent proof when current reconciliation conflicts", async () => {
    const result = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
      progressFor({
        leaseId: "5001",
        evidence: {
          "base-rent": {
            ref: "renewal-current-rent:5001",
            source: "reconciliation_receipt",
            disposition: "verified",
          },
          "owner-decision": {
            ref: "lease-progress:owner-decision:r1",
            source: "app_record",
            disposition: "verified",
          },
        },
      }),
    );
    if (result.status !== "ok") throw new Error(result.status);

    const baseRent = result.workspace.process.steps[0].substeps.find(
      (substep) => substep.id === "verify-base-rent",
    );
    expect(baseRent?.state).toBe("blocked");
    expect(baseRent?.blockers.join(" ")).toMatch(/base rent/i);
    expect(result.workspace.live?.ownerDecisionCurrent).toBe(false);
    expect(result.workspace.tenantDraft).toBeNull();
  });

  it("the desk projects exact evidence instead of trusting a recorded coarse stage", async () => {
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
    // A coarse Document-packet pointer cannot skip unresolved verification evidence.
    expect(recorded?.stageLabel).toBe("Verify renewal");
    // A lease with no record is also projected from current evidence.
    const untouched = result.view.actionable.find((s) => s.id === "5001");
    expect(untouched?.stageLabel).toBe("Verify renewal");
  });
});

describe("S82 desk guidance rows", () => {
  it("attaches honest guidance: verified agreeing rent, blocked conflict, fail-closed no-match", async () => {
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
    );
    if (result.status !== "ok") throw new Error(result.status);
    const byId = new Map(result.view.items.map((row) => [row.id, row]));

    const agreeing = byId.get("4821");
    expect(agreeing?.guidance.currentBaseRent).toBe(1250);
    expect(agreeing?.guidance.currentBaseRentSource).toBe("RentVine");
    expect(agreeing?.guidance.rentVerification.state).toBe("verified");
    expect(agreeing?.guidance.rentVerification.verifiedByResolutionDiffers).toBe(false);

    const conflicting = byId.get("5001");
    expect(conflicting?.guidance.currentBaseRent).toBe(1400);
    expect(conflicting?.guidance.rentVerification.state).toBe("needs_verification");
    expect(conflicting?.guidance.overallStatus).toBe("blocked");
    expect(conflicting?.guidance.isBlocked).toBe(true);
    expect(conflicting?.guidance.action).toEqual({ kind: "blocked" });
    expect(conflicting?.guidance.blockers.length).toBeGreaterThan(0);
    for (const blocker of conflicting?.guidance.blockers ?? []) {
      expect(blocker.destination).toEqual({
        kind: "workspace_phase",
        stepId: "verify-renewal",
      });
    }

    const noMatch = byId.get("6002");
    expect(noMatch?.guidance.rentVerification.state).toBe("needs_verification");

    const skipped = result.view.items.find((row) => row.id === "7003");
    expect(skipped?.guidance.overallStatus).toBe("needs_review");
    expect(skipped?.guidance.isBlocked).toBe(false);
  });

  it("verifies a conflicting rent by exact resolution without replacing the displayed RentVine value", async () => {
    // Resolve the exact record-specific decision identity from the same reconciliation the
    // workspace exposes, then feed the desk that one Resolved record.
    const workspace = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
    );
    if (workspace.status !== "ok") throw new Error(workspace.status);
    const rentCheck = workspace.workspace.dataCheck.find(
      (item) => item.fieldKey === "current_rent",
    );
    const triggerKey = rentCheck?.sourceTriggerKey;
    if (!triggerKey) throw new Error("Expected a rent source trigger key.");

    clearLiveLeaseCache();
    const resolved = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
      undefined,
      undefined,
      [
        {
          id: "res-1",
          source_trigger_key: triggerKey,
          run_id: "live-review",
          field_key: "current_rent",
          field_label: "Rent",
          severity: "Low",
          status: "Resolved",
          chosen_source: "Operating Sheet",
          corrected_value: "1300",
        } as never,
      ],
    );
    if (resolved.status !== "ok") throw new Error(resolved.status);
    const row = resolved.view.items.find((item) => item.id === "5001");
    expect(row?.guidance.currentBaseRent).toBe(1400);
    expect(row?.guidance.rentVerification.state).toBe("verified");
    expect(row?.guidance.rentVerification.verifiedByResolutionDiffers).toBe(true);
  });
});
