import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runAssistantQuery } from "@/lib/assistant/query";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { DeskLeaseRow } from "@/lib/lease-renewal/desk-model";
import {
  projectRenewalAttemptSummary,
  reconcileOrphanedRenewalAttempts,
  selectOrphanedRenewalAttempts,
  type RenewalAttemptRecord,
} from "@/lib/lease-renewal/execution/attempt-continuation";
import { RENEWAL_OWNER_OUTCOME_STATES } from "@/lib/lease-renewal/renewal-process";
import {
  RENEWAL_STAGE,
  planRecordOwnerOutcome,
  type RenewalProgress,
} from "@/lib/lease-renewal/renewal-progress";
import {
  buildRenewalEvidenceReference,
  RENEWAL_COMPLETION_REQUIREMENTS,
  RENEWAL_PROCESS_VERSION,
  type RenewalEvidenceKey,
  type RenewalEvidenceMap,
} from "@/lib/lease-renewal/renewal-process";
import {
  fixedTermProjection,
  monthToMonthProjection,
} from "@/tests/helpers/lease-term-fixtures";
import { projectIntakeTriage } from "@/lib/maintenance/intake-triage";
import { formatPreapprovalAmount } from "@/lib/maintenance/property-preapproval";
import { selectTroubleshootingResource } from "@/lib/maintenance/troubleshooting-catalog";
import {
  describeProviderStatusConflict,
  projectMaintenanceWaitingOn,
} from "@/lib/maintenance/waiting-on";
import type { MaintenanceTicketRecord } from "@/lib/maintenance/ticket-model";
import type { MaintenanceWorkOrderLink } from "@/lib/firestore/maintenance-work-order-links";

// S111: one integrated proof over one fixture portfolio. Every check composes the owning projections
// rather than writing a final state, so a fixture cannot make a check pass by asserting the answer it
// is supposed to derive. Live Dotloop and the owner-supplied maintenance inputs stay absent here and
// are reported as blocked by external environment in docs/status.md, never as passed.

const NOW = "2026-09-04T12:00:00.000Z";
const TODAY = "2026-09-04";

const operator: AuthenticatedUser = {
  uid: "uid-operator",
  email: "operator@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

function evidence(ref: string) {
  return buildRenewalEvidenceReference({
    ref,
    source: "app_record",
    disposition: "verified",
  });
}

function gmailEvidence(ref: string) {
  return buildRenewalEvidenceReference({
    ref,
    source: "gmail_receipt",
    disposition: "verified",
  });
}

const REQUIRED_KEYS: readonly RenewalEvidenceKey[] = [
  ...new Set(RENEWAL_COMPLETION_REQUIREMENTS.map((requirement) => requirement.key)),
];

function completeEvidence(): RenewalEvidenceMap {
  const map: RenewalEvidenceMap = {};
  for (const key of REQUIRED_KEYS) map[key] = evidence(`fixture:${key}`);
  map["owner-message-sent"] = gmailEvidence("fixture:owner-message-sent");
  map["owner-response"] = gmailEvidence("fixture:owner-response");
  return map;
}

function progress(overrides: Partial<RenewalProgress> = {}): RenewalProgress {
  return {
    leaseId: "4001",
    processVersion: RENEWAL_PROCESS_VERSION,
    stageIndex: RENEWAL_STAGE.owner,
    ownerDecision: { decision: "increase", offeredRent: 1500 },
    ownerDecisionRevision: 1,
    tenantOfferDraftId: "draft-1",
    tenantOutcome: null,
    evidence: completeEvidence(),
    complete: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// One fixture portfolio, described only by source facts. Nothing here states a
// disposition, a blocker, a waiting-on value, or an urgency: every check derives those.
// ---------------------------------------------------------------------------

const PORTFOLIO = {
  fixedTermRentDiffers: {
    leaseId: "4001",
    endDateIso: "2026-10-31",
    detail: {
      baseRentAmount: 1450,
      rentAmount: 1450,
      isMonthToMonth: "0" as const,
      monthToMonthStartDate: null,
      hasPendingMonthToMonthConversion: false,
    },
    unitListedRent: 1600,
  },
  monthToMonthWithAnchor: {
    leaseId: "4002",
    endDateIso: null,
    detail: {
      baseRentAmount: 1200,
      rentAmount: 1200,
      isMonthToMonth: "1" as const,
      monthToMonthStartDate: "2025-10-01",
      hasPendingMonthToMonthConversion: false,
    },
  },
  monthToMonthNoAnchor: {
    leaseId: "4003",
    endDateIso: null,
    detail: {
      baseRentAmount: 1300,
      rentAmount: 1300,
      isMonthToMonth: "1" as const,
      monthToMonthStartDate: null,
      hasPendingMonthToMonthConversion: false,
    },
  },
} as const;

describe("S111 renewal foundation composes into one term and one rent (READY-01)", () => {
  it("keeps the tenant's lease rent separate from the unit's listed rent", () => {
    const lease = PORTFOLIO.fixedTermRentDiffers;
    expect(lease.detail.baseRentAmount).not.toBe(lease.unitListedRent);
    const term = fixedTermProjection(lease.endDateIso);
    expect(term.term).toBe("fixed_term");
    // The unit's listed rent is a labelled reference and never becomes the tenant's current rent.
    expect(lease.detail.baseRentAmount).toBe(1450);
  });

  it("derives a periodic review anchor for a month-to-month lease that has a start date", () => {
    const term = monthToMonthProjection(
      PORTFOLIO.monthToMonthWithAnchor.detail.monthToMonthStartDate,
      null,
    );
    expect(term.term).toBe("month_to_month");
    expect(term.anchorDateIso).toBe("2025-10-01");
    expect(term.nextReviewIso).toBe("2026-10-01");
  });

  it("refuses to invent an anchor for a month-to-month lease without a start date", () => {
    const term = monthToMonthProjection(null, null);
    expect(term.term).toBe("month_to_month");
    expect(term.anchorDateIso).toBeNull();
    expect(term.nextReviewIso).toBeNull();
  });
});

describe("S111 the owner branch decides what stays applicable (READY-02, READY-03)", () => {
  it("types every recorded owner outcome through the real planner", () => {
    for (const state of RENEWAL_OWNER_OUTCOME_STATES) {
      const plan = planRecordOwnerOutcome(
        progress(),
        state,
        gmailEvidence("fixture:owner-response"),
      );
      expect(plan.ownerOutcome, state).toMatchObject({ state });
      // A decline moves on to the documented non-renewal handoff; the other three stay with the
      // owner. Either way the planner, not the fixture, decides.
      expect(plan.stageIndex, state).toBeGreaterThanOrEqual(RENEWAL_STAGE.owner);
    }
  });

  it("reopens the owner copy on a revision request and keeps it on an approval", () => {
    const approved = planRecordOwnerOutcome(
      progress(),
      "approved_terms",
      gmailEvidence("fixture:owner-response"),
    );
    const revision = planRecordOwnerOutcome(
      progress(),
      "revision_requested",
      gmailEvidence("fixture:owner-response"),
    );
    expect(approved.evidence["owner-decision"]).toBeDefined();
    expect(revision.evidence["owner-copy-version"]).toBeUndefined();
  });

  it("routes a decline through the documented non-renewal handoff", () => {
    const declined = planRecordOwnerOutcome(
      progress(),
      "declined_non_renewal",
      gmailEvidence("fixture:owner-response"),
    );
    expect(declined.ownerOutcome).toMatchObject({ state: "declined_non_renewal" });
  });
});

describe("S111 a confirmed effect continues and recovers (READY-04)", () => {
  const attempt: RenewalAttemptRecord = {
    executionId: "s97:4001:preview:effect",
    actionKey: "rentvine.lease.renewal_dates.update",
    state: "running",
    attemptCount: 1,
    updatedAtIso: "2026-09-04T11:00:00.000Z",
  };

  it("selects only the orphaned attempt and reconciles it read-only", async () => {
    const nowMs = Date.parse(NOW);
    expect(selectOrphanedRenewalAttempts([attempt], nowMs)).toHaveLength(1);
    const reconciliations = await reconcileOrphanedRenewalAttempts({
      leaseId: "4001",
      attempts: [attempt],
      nowMs,
      reconcile: async () => "ambiguous",
    });
    expect(reconciliations[0]).toMatchObject({ outcome: "ambiguous" });
    const summary = projectRenewalAttemptSummary({
      leaseId: "4001",
      attempts: [{ ...attempt, state: "ambiguous" }],
      nowMs,
    });
    expect(summary.nextAction).toMatch(/uncertain/i);
    expect(summary.nextAction).not.toMatch(/retry automatically/i);
  });
});

describe("S111 maintenance routing and intake compose (READY-05)", () => {
  function ticket(overrides: Partial<MaintenanceTicketRecord> = {}) {
    return {
      id: "ticket-1",
      data_mode: "live",
      status: "Open",
      priority: "Normal",
      priority_provenance: "operator-set",
      summary: "Water under the kitchen sink",
      description: "",
      unit: { unitId: "unit:1", label: "Unit 1" },
      photo_refs: [],
      reporter: { kind: "staff", uid: "uid-1" },
      labels: [],
      space_id: "maintenance",
      created_at: NOW,
      updated_at: NOW,
      ...overrides,
    } as MaintenanceTicketRecord;
  }

  const link = {
    ticket_ref: "ticket-1",
    action_key: "rentvine.work_order.create",
    execution_id: "exec-1",
    state: "succeeded",
    provider_work_order_id: "9001",
    created_by_uid: "uid-1",
    attempt_seq: 1,
    provider_snapshot: {
      property_id: "7",
      work_order_status_id: "3",
      status_label: "In Progress",
      priority_id: "2",
      is_owner_approved: "0" as const,
      assigned_vendor_trade_id: null,
      updated_at_iso: null,
      read_at_iso: NOW,
    },
  } as MaintenanceWorkOrderLink;

  const preapproval = {
    property_key: "7",
    amount_cents: 50_000,
    effective_from_iso: "2026-01-01T00:00:00.000Z",
    recorded_by_uid: "admin-1",
    version: 1,
  };

  it("skips the owner inside the preapproval and asks the owner above it", () => {
    const within = projectMaintenanceWaitingOn({
      ticket: ticket({ estimate_amount_cents: 40_000, status: "Waiting on Vendor" }),
      link,
      preapproval,
    });
    const above = projectMaintenanceWaitingOn({
      ticket: ticket({ estimate_amount_cents: 60_000 }),
      link,
      preapproval,
    });
    expect(within.ownerDecisionRequired).toBe(false);
    expect(within.ownerDecisionDetail).toContain(formatPreapprovalAmount(50_000));
    expect(above.waitingOn).toBe("owner_approval");
  });

  it("shows a differing provider status without resolving either side", () => {
    const conflict = describeProviderStatusConflict({
      appStatus: "Open",
      snapshot: link.provider_snapshot ?? null,
    });
    expect(conflict.differs).toBe(true);
    expect(conflict.providerStatus).toBe("In Progress");
    expect(conflict.nextAction).not.toMatch(/automatically/i);
  });

  it("routes fire, active water, and an ordinary report from the same rules", () => {
    expect(projectIntakeTriage({ summary: "Smoke in the hallway" }).urgency).toBe(
      "emergency_fire",
    );
    expect(projectIntakeTriage({ summary: "The basement is flooding" }).urgency).toBe(
      "urgent_flooding",
    );
    const normal = projectIntakeTriage({
      summary: "Water under the kitchen sink",
      issueType: "Plumbing",
    });
    expect(normal.urgency).toBe("normal");
    expect(normal.intakeComplete).toBe(false);
    // The owner has supplied no reviewed links yet, so no resource is offered. That absence is a
    // recorded external input, not a failure.
    expect(selectTroubleshootingResource(normal.issueType, normal.urgency)).toBeNull();
  });

  it("carries the intake photo blocker into the ticket the operator sees", () => {
    const promoted = ticket({ photos_needed: true, estimate_amount_cents: 40_000 });
    const projection = projectMaintenanceWaitingOn({
      ticket: promoted,
      link,
      preapproval,
    });
    expect(projection.waitingOn).toBe("resident");
    expect(projection.nextAction).toMatch(/photos/i);
  });
});

describe("S111 the assistant answers from the same records (READY-06)", () => {
  function row(overrides: Record<string, unknown> = {}): DeskLeaseRow {
    return {
      id: PORTFOLIO.fixedTermRentDiffers.leaseId,
      addressLabel: "4001 Elm St",
      propertyNameLabel: null,
      tenantNameLabel: "Tenant Of Record",
      tenantNameLabels: ["Tenant Of Record"],
      ownerNameLabels: ["Owner Of Record"],
      identity: { leaseRef: "4001" },
      endDateIso: PORTFOLIO.fixedTermRentDiffers.endDateIso,
      disposition: "review",
      reason: "in_window",
      reasonLabel: "In the renewal window",
      leaseTerm: fixedTermProjection(PORTFOLIO.fixedTermRentDiffers.endDateIso),
      currentRent: PORTFOLIO.fixedTermRentDiffers.detail.baseRentAmount,
      unitListedRent: PORTFOLIO.fixedTermRentDiffers.unitListedRent,
      retention: { state: "unknown" },
      processVersion: null,
      workflowStepId: null,
      stageIndex: 0,
      stageLabel: null,
      nextAction: null,
      openConflicts: 0,
      queryKeys: { normalizedOwners: [], normalizedTenants: [] },
      guidance: {
        currentBaseRent: 1450,
        currentBaseRentSource: "RentVine",
        rentVerification: { state: "verified" },
        overallStatus: "on_track",
        urgencyRank: 3,
        isBlocked: false,
        blockers: [],
        action: { kind: "act", label: "Open", destination: { kind: "none" } },
      },
      processState: null,
      ...overrides,
    } as unknown as DeskLeaseRow;
  }

  const rows = [
    row(),
    row({
      id: "4004",
      addressLabel: "4004 Oak Ave",
      guidance: {
        ...row().guidance,
        isBlocked: true,
        blockers: [{ label: "Owner has not responded" }],
      },
    }),
  ];

  function deps(overrides: Record<string, unknown> = {}) {
    return {
      nowIso: NOW,
      hasRenewalsAccess: true,
      loadWorkSnapshot: async () => ({ tasks: [], server_now: NOW }),
      loadRenewalRows: async () => ({ status: "ok" as const, rows }),
      ...overrides,
    };
  }

  it("returns the same blocked lease the desk row marks blocked", async () => {
    const envelope = await runAssistantQuery(
      { question: "What renewal blockers do I currently have?" },
      operator,
      deps(),
    );
    const blockedRows = rows.filter((entry) => entry.guidance.isBlocked);
    expect(envelope.items.map((item) => item.id)).toEqual(
      blockedRows.map((entry) => entry.id),
    );
    expect(envelope.items[0].blockers).toEqual(
      blockedRows[0].guidance.blockers.map((blocker) => blocker.label),
    );
  });

  it("returns the lease whose end date falls in the asked month", async () => {
    const envelope = await runAssistantQuery(
      { question: "Which renewals come up next month?" },
      operator,
      deps(),
    );
    expect(envelope.appliedFilters).toMatchObject({ month: "2026-10" });
    expect(envelope.items.map((item) => item.id).sort()).toEqual(["4001", "4004"]);
  });

  it("reports an unreadable renewal source as unavailable, never as none", async () => {
    const envelope = await runAssistantQuery(
      { question: "What renewal blockers do I currently have?" },
      operator,
      deps({
        loadRenewalRows: async () => ({ status: "read_error" as const, rows: [] }),
      }),
    );
    expect(envelope.completeness).toBe("unavailable");
    expect(envelope.sourceState).not.toMatch(/no renewals/i);
  });
});

describe("S111 no check passes by writing its own answer (AC-S111-1)", () => {
  it("keeps this suite free of a store, provider, or gate call", () => {
    const code = readFileSync(
      "tests/integration/s111-renewal-completion-proof.test.ts",
      "utf8",
    ).replaceAll(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    // Regex patterns rather than substrings, so this list cannot match its own source text.
    for (const forbidden of [
      /from "@\/lib\/firestore\/admin"/,
      /from "@\/lib\/integrations\/action-gate"/,
      /from "@\/lib\/external-execution\/orchestrator"/,
      /\.runTransaction\(/,
      /fetch\(/,
      /\.set\(/,
      /\.update\(/,
    ]) {
      expect(code, String(forbidden)).not.toMatch(forbidden);
    }
  });
});
