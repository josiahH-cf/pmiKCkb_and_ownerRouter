import { describe, expect, it } from "vitest";

import type {
  DeskLeaseGuidance,
  DeskLeaseSummaryBase,
} from "@/lib/lease-renewal/desk-model";
import { OVERALL_STATUS_URGENCY_RANK } from "@/lib/lease-renewal/desk-query-v2";
import type { MoveOutDisposition } from "@/lib/lease-renewal/move-out-disposition";
import {
  NON_RENEWAL_HANDOFF_TARGET_ID,
  RENEWAL_ISSUE_KIND_LABELS,
  issueResolutionFor,
  projectRenewalIssues,
  type RenewalIssueInput,
} from "@/lib/lease-renewal/renewal-issues";

// S127 (F07): the issue model is a pure projection over the existing guidance and summary. Values
// are synthetic; nothing here reads a provider, stores a status or sends anything.

function guidance(overrides: Partial<DeskLeaseGuidance> = {}): DeskLeaseGuidance {
  return {
    currentBaseRent: 1500,
    currentBaseRentSource: "RentVine",
    rentVerification: {
      state: "verified",
      verifiedByResolutionDiffers: false,
      destination: { kind: "workspace_phase", stepId: "verify-renewal" },
    },
    overallStatus: "ready",
    urgencyRank: OVERALL_STATUS_URGENCY_RANK.ready,
    isBlocked: false,
    blockers: [],
    action: {
      kind: "act",
      label: "Record the owner decision.",
      destination: { kind: "workspace_phase", stepId: "owner-decision" },
    },
    ...overrides,
  };
}

function moveOut(
  state: MoveOutDisposition["state"],
  reason: MoveOutDisposition["reason"],
) {
  return {
    state,
    reason,
    label:
      state === "initiated"
        ? "Move-out initiated in RentVine: Active - Notice Given."
        : state === "unknown"
          ? "Move-out status unknown: the RentVine status table was unavailable."
          : "No move-out notice in RentVine (Active).",
    evidence: {
      origin: "rentvine_lease_status" as const,
      leaseId: "L",
      statusId: "3",
      statusName: "Active - Notice Given",
      primaryStatusId: "2",
      pendingMoveOut: state === "initiated",
      completedMoveOut: false,
      noticeDateIso: null,
      expectedMoveOutIso: null,
      moveOutIso: null,
    },
    freshness: "fresh" as const,
    observedAtIso: "2026-09-20T12:00:00.000Z",
  } satisfies MoveOutDisposition;
}

function input(
  overrides: Partial<RenewalIssueInput> = {},
  summary: Partial<RenewalIssueInput["summary"]> = {},
): RenewalIssueInput {
  return {
    guidance: guidance(),
    summary: summary as RenewalIssueInput["summary"],
    readComplete: true,
    currencyState: "fresh",
    progressStateAvailable: true,
    sheetWritebackPaused: false,
    ...overrides,
  };
}

describe("S127 issue kinds and scope (AC-S127-1)", () => {
  it("yields distinct scoped issues for a missing tenant email, a missing legal form, waiting on the owner, a paused Sheet and a failed optional source, and keeps permitted work available", () => {
    const blocked = guidance({
      overallStatus: "blocked",
      isBlocked: true,
      blockers: [
        {
          id: "tenant-email",
          label: "Add a tenant email address before composing the offer.",
          type: "evidence",
          phaseId: "tenant-decision",
          destination: {
            kind: "workspace_phase",
            stepId: "tenant-decision",
            controlId: "renewal-tenant-recipient",
          },
        },
        {
          id: "legal-form",
          label: "Attach the approved lease form before preparing the packet.",
          type: "dependency",
          phaseId: "document-packet",
          destination: { kind: "workspace_phase", stepId: "document-packet" },
          requiredCapability: "approve",
        },
      ],
      action: { kind: "blocked" },
    });
    const projected = projectRenewalIssues(
      input(
        { guidance: blocked, sheetWritebackPaused: true },
        { moveOut: moveOut("unknown", "status_table_unavailable") },
      ),
    );
    const byId = Object.fromEntries(projected.issues.map((issue) => [issue.id, issue]));
    expect(byId["blocking:tenant-email"]).toMatchObject({
      kind: "blocking",
      kindLabel: "Blocked",
      affectedAction: "Preparing the tenant offer",
      responsible: "an Editor",
      destination: { kind: "workspace_phase", controlId: "renewal-tenant-recipient" },
    });
    expect(byId["blocking:legal-form"]).toMatchObject({
      kind: "blocking",
      affectedAction: "Preparing the document packet",
      responsible: "an Approver or Admin",
      requiredCapability: "approve",
    });
    expect(byId["policy:sheet_writeback_paused"]).toMatchObject({
      kind: "policy_pause",
      kindLabel: "Paused by policy",
      affectedAction: "Writing to the operating Sheet",
      responsible: "Owner policy",
    });
    expect(byId["policy:sheet_writeback_paused"].reason).not.toMatch(
      /fail|broken|error|connection/i,
    );
    expect(byId["move_out:status_table_unavailable"]).toMatchObject({
      kind: "source_unavailable",
      affectedAction: "Ordinary renewal outreach",
    });
    // The optional source never becomes a global lease block.
    expect(
      projected.issues
        .filter((issue) => issue.kind === "blocking")
        .map((issue) => issue.id),
    ).toEqual(["blocking:tenant-email", "blocking:legal-form"]);
    expect(projected.primary).toMatchObject({ kind: "blocked", redirected: false });

    const waiting = projectRenewalIssues(
      input(
        {
          guidance: guidance({
            overallStatus: "waiting",
            action: {
              kind: "waiting",
              label: "Waiting on the owner.",
              destination: { kind: "workspace_phase", stepId: "owner-decision" },
            },
          }),
        },
        {
          followUp: {
            waiting: { state: "waiting", party: "owner" },
          } as unknown as DeskLeaseSummaryBase["followUp"],
        },
      ),
    );
    expect(waiting.issues.map((issue) => issue.kind)).toEqual(["waiting"]);
    expect(waiting.issues[0]).toMatchObject({
      kindLabel: "Waiting on a person",
      responsible: "the owner",
      affectedAction: "Recording the owner decision",
    });

    // A pause or an advisory alone leaves the primary action exactly as the guidance says.
    const advisoryOnly = projectRenewalIssues(
      input(
        { sheetWritebackPaused: true },
        { moveOut: moveOut("not_initiated", "active_without_notice") },
      ),
    );
    expect(advisoryOnly.primary).toMatchObject({
      kind: "act",
      label: "Record the owner decision.",
      redirected: false,
    });
    expect(advisoryOnly.issues.map((issue) => issue.kind)).toEqual(["policy_pause"]);
    expect(Object.values(RENEWAL_ISSUE_KIND_LABELS)).toHaveLength(5);
  });
});

describe("S127 one deterministic primary action (AC-S127-2)", () => {
  it("selects the same action from the same guidance on every surface and redirects a confirmed move-out to the handoff", () => {
    const shared = input({}, { moveOut: moveOut("initiated", "notice_status") });
    const desk = projectRenewalIssues(shared);
    const workspace = projectRenewalIssues({ ...shared });
    expect(workspace.primary).toEqual(desk.primary);
    expect(desk.primary).toMatchObject({
      kind: "act",
      redirected: true,
      destination: { kind: "workspace_anchor", targetId: NON_RENEWAL_HANDOFF_TARGET_ID },
    });
    expect(desk.primary.label).toMatch(/non-renewal handoff/);
    expect(desk.primary.label).not.toMatch(/owner decision|tenant offer/i);

    // A confirmed move-out never rewrites a non-outreach action or a blocked state.
    const verifying = projectRenewalIssues(
      input(
        {
          guidance: guidance({
            action: {
              kind: "act",
              label: "Verify the current rent.",
              destination: { kind: "workspace_phase", stepId: "verify-renewal" },
            },
          }),
        },
        { moveOut: moveOut("initiated", "notice_status") },
      ),
    );
    expect(verifying.primary).toMatchObject({
      redirected: false,
      label: "Verify the current rent.",
    });
    // An unconfirmed notice is an issue to review, not a redirect.
    const unsure = projectRenewalIssues(
      input({}, { moveOut: moveOut("unknown", "notice_evidence_without_status") }),
    );
    expect(unsure.primary.redirected).toBe(false);
    expect(unsure.issues.map((issue) => issue.kind)).toEqual(["advisory"]);
  });
});

describe("S127 permissions exposed, never granted (AC-S127-4)", () => {
  it("maps each role to inspect, prepare, review, execute or request access without a self-grant", () => {
    const projected = projectRenewalIssues(
      input({
        guidance: guidance({
          overallStatus: "blocked",
          isBlocked: true,
          blockers: [
            {
              id: "conflict",
              label: "Resolve the rent conflict.",
              type: "source",
              phaseId: "verify-renewal",
              destination: { kind: "workspace_phase", stepId: "verify-renewal" },
              requiredCapability: "approve",
            },
            {
              id: "email",
              label: "Add a tenant email address.",
              type: "evidence",
              phaseId: "tenant-decision",
              destination: { kind: "workspace_phase", stepId: "tenant-decision" },
            },
          ],
          action: { kind: "blocked" },
        }),
        sheetWritebackPaused: true,
      }),
    );
    const [conflict, email, pause] = projected.issues;
    expect(issueResolutionFor(conflict, "Editor")).toBe("request_access");
    expect(issueResolutionFor(conflict, "Approver")).toBe("review");
    expect(issueResolutionFor(conflict, "Admin")).toBe("review");
    expect(issueResolutionFor(email, "Editor")).toBe("prepare");
    expect(issueResolutionFor(email, "Admin")).toBe("prepare");
    expect(issueResolutionFor(pause, "Editor")).toBe("review");
    // Source problems refresh; waiting waits; nothing here grants a capability.
    const source = projectRenewalIssues(input({ readComplete: false })).issues[0];
    expect(issueResolutionFor(source, "Admin")).toBe("refresh");
    expect(JSON.stringify(projected)).not.toMatch(/grant|self-approve/i);
  });
});
