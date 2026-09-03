import { beforeEach, describe, expect, it } from "vitest";

import type { DateWindow } from "@/lib/lease-renewal/cohort";
import {
  clearLiveLeaseCache,
  getLiveLeaseSnapshot,
  type AttemptedLiveLeaseSnapshotResult,
  type LiveLeaseSnapshotResult,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  buildLiveProcessEvidence,
  loadLiveOwnerCurrentRentDecision,
  loadLiveRenewalDesk,
  loadLiveRenewalLeaseWorkspace,
  packetSnapshotFromBatch,
} from "@/lib/lease-renewal/live-desk";
import {
  RENEWAL_STAGE,
  type RenewalProgress,
} from "@/lib/lease-renewal/renewal-progress";
import {
  RENEWAL_COMPLETION_REQUIREMENTS,
  RENEWAL_PROCESS_VERSION,
  buildRenewalEvidenceReference,
  type RenewalEvidenceMap,
} from "@/lib/lease-renewal/renewal-process";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";
import {
  DEFAULT_RENEWAL_DESK_QUERY,
  applyRenewalDeskQuery,
  buildRenewalDeskWindow,
} from "@/lib/lease-renewal/desk-query";
import { SAMPLE_RENEWAL_TABLES } from "@/lib/lease-renewal/sample-sheet";
import { DEFAULT_NOTICE_RULE_VALUES } from "@/lib/lease-renewal/notice-rules";
import type { WorkflowCommunicationLink } from "@/lib/gmail-hub/workflow-context";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import type { LeaseRenewalResolutionRecord } from "@/lib/firestore/types";
import type { DeskReconItem } from "@/lib/lease-renewal/desk-model";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";

// The loaders use the shared module-level export cache; reset it so cases don't leak reads.
beforeEach(clearLiveLeaseCache);

const READ_TS = "2026-07-19T00:00:00.000Z";
const WINDOWS: DateWindow[] = [{ startIso: "2026-08-01", endIso: "2026-09-30" }];

function correctedRentResolution(
  item: DeskReconItem,
  value: string,
  id = "exact-current-rent-resolution",
): LeaseRenewalResolutionRecord {
  if (!item.sourceTriggerKey || !item.candidateFingerprint) {
    throw new Error("Expected an exact current-rent decision identity.");
  }
  return {
    id,
    source_trigger_key: item.sourceTriggerKey,
    run_id: "live-review",
    field_key: item.fieldKey,
    field_label: item.fieldLabel,
    severity: "High",
    status: "Resolved",
    candidate_fingerprint: item.candidateFingerprint,
    resolution_kind: "corrected_value",
    corrected_value: value,
    proposed_writeback: {
      field_key: item.fieldKey,
      value,
      source_of_value: "corrected_value",
      status: "Queued",
      production_allowed: false,
    },
    reason: "Synthetic source-resolution regression fixture.",
    resolved_by_uid: "admin-fixture",
    created_at: READ_TS,
    updated_at: READ_TS,
  };
}

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
  const formulas = SAMPLE_RENEWAL_TABLES[0].map((row) => [...row]);
  formulas[1][2] =
    '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/4821","Jordan Maple")';
  formulas[3][2] =
    '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/7003","pat solstice")';
  return {
    listTabTitles: async () => ["Lease Renewal"],
    batchGet: async () => ({
      valueRanges: [{ range: "Lease Renewal", values: SAMPLE_RENEWAL_TABLES[0] }],
    }),
    batchGetFormulas: async () => ({
      valueRanges: [{ range: "Lease Renewal", values: formulas }],
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
    rentvineHost: "pmikcmetro.rentvine.com",
    sheetsReader: fakeSheetsReader(),
    spreadsheetId: "sheet-id",
  };
}

function snapshotResult(
  rows: readonly Record<string, unknown>[] = EXPORT_ROWS as Record<string, unknown>[],
): LiveLeaseSnapshotResult {
  return {
    snapshot: {
      views: leaseViewsFromExport(rows),
      complete: true,
      readAtMs: Date.parse(READ_TS),
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
  it("reuses one injected lease generation instead of rereading the provider", async () => {
    let providerCalls = 0;
    const config = okConfig(async () => {
      providerCalls += 1;
      throw new Error("The injected generation should satisfy the desk.");
    });

    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      config as unknown as DeskConfigArg,
      undefined,
      undefined,
      [],
      undefined,
      true,
      snapshotResult(),
    );

    expect(result.status).toBe("ok");
    expect(providerCalls).toBe(0);
  });

  it("keeps an absent current rent null instead of coercing it to zero", async () => {
    const config = okConfig(async () => ({
      rows: [
        {
          lease: {
            leaseID: 9005,
            endDate: "2026-08-31",
            leaseType: "Fixed Term",
            currentRent: "9999.00",
            tenants: [{ name: "Missing Rent" }],
          },
          unit: {},
        },
      ],
      pages: 1,
      complete: true,
    }));

    const result = await loadLiveOwnerCurrentRentDecision(
      "9005",
      READ_TS,
      config as unknown as NonNullable<DeskConfigArg>,
    );

    expect(result).toMatchObject({
      status: "ok",
      decision: {
        currentRent: null,
        currentRentEvidence: { agreement: "missing" },
      },
    });
  });

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
      sourceDestinations: {
        rentvine: {
          kind: "external",
          href: "https://pmikcmetro.rentvine.com/leases/4821",
        },
      },
    });
    expect(result.view.skipped[0]).toMatchObject({
      sourceDestinations: {
        rentvine: {
          kind: "external",
          href: "https://pmikcmetro.rentvine.com/leases/7003",
        },
      },
    });
  });

  it("fails closed instead of choosing the first of duplicated exact source links", async () => {
    const values = SAMPLE_RENEWAL_TABLES[0].map((row) => [...row]);
    const formulas = values.map((row) => [...row]);
    formulas[1][2] =
      '=HYPERLINK("https://pmikcmetro.rentvine.com/leases/4821","Jordan Maple")';
    values.push([...values[1]]);
    formulas.push([...formulas[1]]);
    const config = {
      ...okConfig(),
      sheetsReader: {
        listTabTitles: async () => ["Lease Renewal"],
        batchGet: async () => ({
          valueRanges: [{ range: "Lease Renewal", values }],
        }),
        batchGetFormulas: async () => ({
          valueRanges: [{ range: "Lease Renewal", values: formulas }],
        }),
      },
    } as unknown as NonNullable<DeskConfigArg>;

    const result = await loadLiveRenewalDesk(WINDOWS, READ_TS, config);
    if (result.status !== "ok") throw new Error(result.status);

    const duplicate = result.view.items.find((summary) => summary.id === "4821");
    expect(duplicate?.sourceDestinations?.rentvine).toBeUndefined();
    expect(duplicate?.guidance.rentVerification.state).toBe("needs_verification");
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

    clearLiveLeaseCache();
    const trackedWorkspace = await loadLiveRenewalLeaseWorkspace(
      "8004",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
      progress,
    );
    if (trackedWorkspace.status !== "ok") throw new Error(trackedWorkspace.status);
    expect(trackedWorkspace.workspace.workflowAvailable).toBe(true);
    expect(trackedWorkspace.workspace.summary.retention.state).toBe("tracked_incomplete");
  });

  it("lets a definitive skip outrank stale incomplete progress without exposing a process", async () => {
    const staleProgress: RenewalProgress = {
      leaseId: "7003",
      processVersion: RENEWAL_PROCESS_VERSION,
      stageIndex: RENEWAL_STAGE.owner,
      ownerDecision: null,
      ownerDecisionRevision: 0,
      tenantOfferDraftId: null,
      tenantOutcome: null,
      evidence: {},
      complete: false,
    };
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
      new Map([["7003", staleProgress]]),
    );
    if (result.status !== "ok") throw new Error(result.status);

    const skipped = result.view.items.find((row) => row.id === "7003");
    expect(skipped).toMatchObject({
      disposition: "skip",
      retention: { state: "outside" },
      processVersion: null,
      workflowStepId: null,
      stageIndex: -1,
      nextAction: null,
      processState: null,
      guidance: {
        blockers: [],
        action: { kind: "review", destination: { kind: "none" } },
      },
    });
  });

  it("conservatively retains possible tracked work and exposes no invented phase when progress is unreadable", async () => {
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
      new Map(),
      undefined,
      [],
      undefined,
      false,
    );
    if (result.status !== "ok") throw new Error(result.status);

    const outside = result.view.items.find((summary) => summary.id === "8004");
    expect(outside).toMatchObject({
      retention: {
        state: "needs_verification",
        label:
          "Saved progress unavailable; retained until tracking state can be verified",
      },
      processVersion: null,
      workflowStepId: null,
      stageIndex: -1,
      processState: null,
      guidance: {
        overallStatus: "needs_verification",
        blockers: [],
        action: {
          kind: "needs_verification",
          destination: { kind: "none" },
        },
      },
    });
    expect(
      applyRenewalDeskQuery(result.view.items, DEFAULT_RENEWAL_DESK_QUERY).items.map(
        (summary) => summary.id,
      ),
    ).toContain("8004");

    const inWindow = result.view.items.find((summary) => summary.id === "4821");
    expect(inWindow?.processState).toBeNull();
    expect(inWindow?.workflowStepId).toBeNull();
    expect(inWindow?.guidance.blockers).toEqual([]);
    expect(inWindow?.guidance.action).toMatchObject({
      kind: "needs_verification",
      destination: { kind: "none" },
    });
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

  it("fails every actionable row closed when saved renewal progress cannot be read", async () => {
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
      undefined,
      undefined,
      [],
      new Map(),
      false,
    );
    if (result.status !== "ok") throw new Error(result.status);

    expect(result.view.actionable.length).toBeGreaterThan(0);
    for (const row of result.view.actionable) {
      expect(row.guidance.overallStatus).toBe("needs_verification");
      expect(row.guidance.isBlocked).toBe(true);
      expect(row.guidance.action).toMatchObject({
        kind: "needs_verification",
        destination: { kind: "none" },
      });
      expect(row.guidance.action.kind).not.toBe("act");
    }
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
    const rentCheck = unresolved.workspace.dataCheck.find(
      (item) => item.fieldKey === "current_rent",
    );
    expect(rentCheck?.sourceTriggerKey).toMatch(
      /^lease_renewal:reconcile:live-review:[a-f0-9]{16}:/,
    );
    expect(rentCheck?.candidateFingerprint).toMatch(/^rcf1_[a-f0-9]{64}$/);
    if (!rentCheck) throw new Error("Expected a current-rent data check.");

    const result = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
      null,
      null,
      [
        {
          ...correctedRentResolution(rentCheck, "$9,999", "wrong-record"),
          source_trigger_key:
            "lease_renewal:reconcile:live-review:0000000000000000:current_rent",
        },
        correctedRentResolution(rentCheck, "$1,300.00", "exact-record"),
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
    expect(
      result.workspace.dataCheck.find((item) => item.fieldKey === "current_rent"),
    ).toMatchObject({ agreement: "resolved" });
    expect(result.workspace.summary.openConflicts).toBe(0);
    const resolvedMissingEvidence = result.workspace.process.steps.flatMap((step) =>
      step.substeps.flatMap((substep) => substep.missingEvidence),
    );
    expect(resolvedMissingEvidence).not.toContain("base-rent");
    expect(resolvedMissingEvidence).not.toContain("source-conflicts-resolved");

    clearLiveLeaseCache();
    const drifted = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      okConfig(async () => ({
        rows: EXPORT_ROWS.map((row) =>
          String(row.lease.leaseID) === "5001"
            ? { ...row, unit: { rent: "1500.00" } }
            : row,
        ) as Record<string, unknown>[],
        pages: 1,
        complete: true,
      })) as unknown as WorkspaceConfigArg,
      null,
      null,
      [correctedRentResolution(rentCheck, "$1,300.00", "stale-record")],
    );
    if (drifted.status !== "ok") throw new Error(drifted.status);
    expect(
      drifted.workspace.ownerDraft.facts.find((fact) => fact.key === "current_rent"),
    ).toMatchObject({ confidence: "Needs Verification" });
    expect(
      drifted.workspace.dataCheck.find((item) => item.fieldKey === "current_rent"),
    ).toMatchObject({ agreement: "conflict" });
    expect(drifted.workspace.summary.openConflicts).toBe(1);
    const reopenedMissingEvidence = drifted.workspace.process.steps.flatMap((step) =>
      step.substeps.flatMap((substep) => substep.missingEvidence),
    );
    expect(reopenedMissingEvidence).toContain("base-rent");
    expect(reopenedMissingEvidence).toContain("source-conflicts-resolved");
    expect(
      drifted.workspace.process.steps[drifted.workspace.process.currentStepIndex]?.id,
    ).toBe("verify-renewal");
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

  it("keeps review leases inspectable but returns not_found for unknown or skipped leases", async () => {
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

    clearLiveLeaseCache();
    const review = await loadLiveRenewalLeaseWorkspace(
      "9006",
      READ_TS,
      okConfig(async () => ({
        rows: [
          {
            lease: {
              leaseID: 9006,
              leaseType: "Fixed Term",
              tenants: [{ name: "Review Tenant" }],
            },
            unit: { rent: "1200.00" },
          },
        ],
        pages: 1,
        complete: true,
      })) as unknown as WorkspaceConfigArg,
    );
    expect(review.status).toBe("ok");
    if (review.status === "ok") {
      expect(review.workspace.summary.disposition).toBe("review");
      expect(review.workspace.summary.reason).toBe("no_end_date");
      expect(review.workspace.workflowAvailable).toBe(false);
      expect(review.workspace.summary).toMatchObject({
        processVersion: null,
        workflowStepId: null,
        stageIndex: -1,
        stageLabel: null,
        nextAction: null,
      });
      expect(review.workspace.live).toBeUndefined();
    }
  });

  it("keeps an out-of-window lease out of window after opening its workspace", async () => {
    const currentWindow = buildRenewalDeskWindow(READ_TS.slice(0, 10));
    const desk = await loadLiveRenewalDesk(
      [currentWindow],
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
    );
    if (desk.status !== "ok") throw new Error(desk.status);
    const deskRow = desk.view.items.find((row) => row.id === "8004");
    expect(deskRow).toMatchObject({
      disposition: "out_of_window",
      reason: "out_of_window",
      retention: { state: "outside" },
    });

    clearLiveLeaseCache();
    const workspace = await loadLiveRenewalLeaseWorkspace(
      "8004",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
    );
    if (workspace.status !== "ok") throw new Error(workspace.status);
    expect(workspace.workspace.summary).toMatchObject({
      disposition: deskRow?.disposition,
      reason: deskRow?.reason,
      retention: { state: deskRow?.retention.state },
      processVersion: null,
      workflowStepId: null,
      stageIndex: -1,
      stageLabel: null,
      nextAction: null,
    });
    expect(workspace.workspace.workflowAvailable).toBe(false);
    expect(workspace.workspace.live).toBeUndefined();
    expect(workspace.workspace.tenantDraft).toBeNull();
  });

  it("keeps duplicated no-id fallback names fail-closed and identical across desk/workspace", async () => {
    const values = SAMPLE_RENEWAL_TABLES[0].map((row) => [...row]);
    const config = {
      ...okConfig(async () => ({
        rows: [
          {
            lease: {
              leaseID: 9006,
              leaseType: "Fixed Term",
              tenants: [{ name: "Jordan Maple" }],
            },
            unit: { rent: "1250.00" },
          },
          {
            lease: {
              leaseID: 8004,
              endDate: "2026-12-31",
              leaseType: "Fixed Term",
              tenants: [{ name: "Jordan Maple" }],
            },
            unit: { rent: "1250.00" },
          },
        ],
        pages: 1,
        complete: true,
      })),
      // No hyperlink ids in this fixture: one Sheet row cannot verify two same-name leases.
      sheetsReader: {
        listTabTitles: async () => ["Lease Renewal"],
        batchGet: async () => ({
          valueRanges: [{ range: "Lease Renewal", values }],
        }),
        batchGetFormulas: async () => ({
          valueRanges: [{ range: "Lease Renewal", values }],
        }),
      },
    } as unknown as NonNullable<DeskConfigArg>;
    const window = buildRenewalDeskWindow(READ_TS.slice(0, 10));
    const desk = await loadLiveRenewalDesk([window], READ_TS, config);
    if (desk.status !== "ok") throw new Error(desk.status);

    for (const leaseId of ["9006", "8004"] as const) {
      const row = desk.view.items.find((item) => item.id === leaseId);
      expect(row?.guidance.rentVerification).toMatchObject({
        state: "needs_verification",
      });

      clearLiveLeaseCache();
      const workspace = await loadLiveRenewalLeaseWorkspace(
        leaseId,
        READ_TS,
        config as unknown as WorkspaceConfigArg,
      );
      if (workspace.status !== "ok") throw new Error(workspace.status);
      expect(
        workspace.workspace.dataCheck.find((item) => item.fieldKey === "current_rent"),
      ).toMatchObject({ agreement: "missing" });
      expect(workspace.workspace.currentRent).toBe(1250);
      expect(workspace.workspace.workflowAvailable).toBe(false);
    }
  });

  it("honors a post-write source barrier instead of reusing a pre-write workspace cache", async () => {
    let calls = 0;
    const config = okConfig(async () => {
      calls += 1;
      return {
        rows: EXPORT_ROWS.map((row) =>
          String(row.lease.leaseID) === "5001"
            ? { ...row, unit: { rent: calls === 1 ? "1400.00" : "1500.00" } }
            : row,
        ) as Record<string, unknown>[],
        pages: 1,
        complete: true,
      };
    }) as unknown as WorkspaceConfigArg;

    const before = await loadLiveRenewalLeaseWorkspace("5001", READ_TS, config);
    if (before.status !== "ok") throw new Error(before.status);
    expect(before.workspace.currentRent).toBe(1400);

    const after = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      config,
      null,
      null,
      [],
      undefined,
      undefined,
      Date.parse(READ_TS) + 1,
    );
    if (after.status !== "ok") throw new Error(after.status);
    expect(calls).toBe(2);
    expect(after.workspace.currentRent).toBe(1500);
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

  it("does not perform a second source read after a route-level snapshot attempt fails", async () => {
    let providerCalls = 0;
    const config = okConfig(async () => {
      providerCalls += 1;
      throw new Error("source unavailable");
    });
    let attempt: AttemptedLiveLeaseSnapshotResult;
    try {
      const value = await getLiveLeaseSnapshot(
        config.rentvineClient,
        Date.parse(READ_TS),
      );
      attempt = { status: "available", value };
    } catch {
      attempt = { status: "unavailable" };
    }
    expect(providerCalls).toBe(1);

    const result = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      config as unknown as WorkspaceConfigArg,
      null,
      null,
      [],
      undefined,
      undefined,
      null,
      attempt,
    );

    expect(result).toEqual({ status: "read_error" });
    expect(providerCalls).toBe(1);
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

  it("projects identical current packet phase and blockers on the desk and workspace", async () => {
    const liveOwnedKeys = new Set([
      "lease-tracked",
      "lease-identity",
      "lease-end-date",
      "base-rent",
      "source-conflicts-resolved",
      "source-snapshot-current",
      "renewal-recipients",
      "tenant-recipients",
      "recurring-charges-separated",
      "packet-catalog-version",
      "packet-facts",
      "packet-snapshot",
      "current-packet-version",
      "dotloop-packet-readback",
    ]);
    const evidence: RenewalEvidenceMap = {};
    for (const requirement of RENEWAL_COMPLETION_REQUIREMENTS) {
      if (liveOwnedKeys.has(requirement.key)) continue;
      evidence[requirement.key] = buildRenewalEvidenceReference({
        ref: `app:${requirement.key}:current`,
        source: "app_record",
        disposition: requirement.allowNotApplicable ? "not_applicable" : "verified",
        ...(requirement.allowNotApplicable
          ? { reason: "The current approved rule does not apply." }
          : {}),
      });
    }
    const tenantOutcomeEvidence = buildRenewalEvidenceReference({
      ref: "app:tenant-outcome:accepted",
      source: "app_record",
      disposition: "verified",
    });
    evidence["tenant-outcome"] = tenantOutcomeEvidence;
    const progress = progressFor({
      evidence,
      tenantOutcome: {
        state: "accepted",
        evidence: tenantOutcomeEvidence,
      },
    });
    const packet = {
      leaseId: "4821",
      transactionId: "4821",
      state: "Ready for preview",
      visibleState: "Ready for preview",
      current: true,
      catalogVersion: "catalog-v1",
      payloadHash: "a".repeat(64),
      snapshotId: "packet-current",
      snapshotVersion: 1,
    } as RenewalPacketSnapshot;

    const desk = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
      new Map([["4821", progress]]),
      undefined,
      [],
      new Map([["4821", packet]]),
    );
    if (desk.status !== "ok") throw new Error(desk.status);
    clearLiveLeaseCache();
    const workspace = await loadLiveRenewalLeaseWorkspace(
      "4821",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
      progress,
      null,
      [],
      packet,
    );
    if (workspace.status !== "ok") throw new Error(workspace.status);

    const row = desk.view.items.find((item) => item.id === "4821");
    const selected =
      workspace.workspace.process.steps[workspace.workspace.process.currentStepIndex];
    expect(row?.workflowStepId).toBe(selected.id);
    expect(row?.stageLabel).toBe(workspace.workspace.summary.stageLabel);
    expect(row?.nextAction).toBe(workspace.workspace.summary.nextAction);
    expect(row?.guidance.blockers.map((blocker) => blocker.label)).toEqual([
      ...new Set(
        selected.substeps
          .filter(
            (substep) =>
              substep.applicable &&
              substep.requiredForStep &&
              substep.state === "blocked",
          )
          .flatMap((substep) => substep.blockers),
      ),
    ]);
  });

  it("keeps an unavailable packet read distinct from a proved missing packet", () => {
    const packetKeys = [
      "packet-catalog-version",
      "packet-facts",
      "packet-snapshot",
      "current-packet-version",
      "dotloop-packet-readback",
    ] as const;
    const evidence = Object.fromEntries(
      packetKeys.map((key) => [
        key,
        buildRenewalEvidenceReference({
          ref: `packet:historical:${key}`,
          source: key === "packet-catalog-version" ? "policy_version" : "packet_snapshot",
          disposition: "verified",
        }),
      ]),
    ) as RenewalEvidenceMap;
    const baseInput = {
      leaseId: "4821",
      view: {
        leaseID: 4821,
        endDate: "2026-08-31",
        tenants: [{ name: "Jordan Maple", email: "jordan@example.test" }],
        owners: [{ name: "Maple Holdings", email: "owner@example.test" }],
      },
      endDateIso: "2026-08-31",
      currentRent: 1250,
      currentRentEvidence: {
        agreement: "agree" as const,
        currencyState: "fresh" as const,
        readAtIso: READ_TS,
      },
      dataCheck: [],
      dataCurrency: {
        state: "fresh" as const,
        ageMs: 0,
        readAtMs: Date.parse(READ_TS),
        refreshing: false,
        lastError: false,
      },
      readComplete: true,
      progress: progressFor({ evidence }),
    };

    const unavailable = buildLiveProcessEvidence({
      ...baseInput,
      packetSnapshot: undefined,
    });
    for (const key of packetKeys) {
      expect(unavailable.evidence[key]).toBeUndefined();
      expect(unavailable.blockers[key]?.reason).toBe(
        "Current document packet status could not be read.",
      );
    }

    const provedMissing = buildLiveProcessEvidence({
      ...baseInput,
      packetSnapshot: null,
    });
    for (const key of packetKeys) {
      expect(provedMissing.evidence[key]).toBeUndefined();
      expect(provedMissing.blockers[key]).toBeUndefined();
    }

    expect(packetSnapshotFromBatch(undefined, "4821")).toBeUndefined();
    expect(packetSnapshotFromBatch(new Map(), "4821")).toBeUndefined();
    expect(packetSnapshotFromBatch(new Map([["4821", null]]), "4821")).toBeNull();
  });

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
    if (!rentCheck) throw new Error("Expected a current-rent data check.");
    const resolution = correctedRentResolution(rentCheck, "1300", "res-1");

    clearLiveLeaseCache();
    const resolved = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
      undefined,
      undefined,
      [resolution],
    );
    if (resolved.status !== "ok") throw new Error(resolved.status);
    const row = resolved.view.items.find((item) => item.id === "5001");
    expect(row?.guidance.currentBaseRent).toBe(1400);
    expect(row?.guidance.rentVerification.state).toBe("verified");
    expect(row?.guidance.rentVerification.verifiedByResolutionDiffers).toBe(true);
    expect(row?.openConflicts).toBe(0);

    clearLiveLeaseCache();
    const drifted = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig(async () => ({
        rows: EXPORT_ROWS.map((source) =>
          String(source.lease.leaseID) === "5001"
            ? { ...source, unit: { rent: "1500.00" } }
            : source,
        ) as Record<string, unknown>[],
        pages: 1,
        complete: true,
      })) as unknown as DeskConfigArg,
      undefined,
      undefined,
      [resolution],
    );
    if (drifted.status !== "ok") throw new Error(drifted.status);
    const reopened = drifted.view.items.find((item) => item.id === "5001");
    expect(reopened?.openConflicts).toBe(1);
    expect(reopened?.guidance.rentVerification.state).toBe("needs_verification");
    expect(reopened?.guidance.rentVerification.verifiedByResolutionDiffers).toBe(false);
    expect(reopened?.guidance.overallStatus).toBe("blocked");
    expect(reopened?.workflowStepId).toBe("verify-renewal");
  });

  it("does not verify a conflicting rent from a zero-value resolution", async () => {
    const workspace = await loadLiveRenewalLeaseWorkspace(
      "5001",
      READ_TS,
      okConfig() as unknown as WorkspaceConfigArg,
    );
    if (workspace.status !== "ok") throw new Error(workspace.status);
    const rentCheck = workspace.workspace.dataCheck.find(
      (item) => item.fieldKey === "current_rent",
    );
    if (!rentCheck) throw new Error("Expected a current-rent data check.");

    clearLiveLeaseCache();
    const result = await loadLiveRenewalDesk(
      WINDOWS,
      READ_TS,
      okConfig() as unknown as DeskConfigArg,
      undefined,
      undefined,
      [correctedRentResolution(rentCheck, "0", "zero-rent-resolution")],
    );
    if (result.status !== "ok") throw new Error(result.status);
    const row = result.view.items.find((item) => item.id === "5001");
    expect(row?.guidance.currentBaseRent).toBe(1400);
    expect(row?.guidance.rentVerification.state).toBe("needs_verification");
    expect(row?.guidance.rentVerification.verifiedByResolutionDiffers).toBe(false);
  });
});
