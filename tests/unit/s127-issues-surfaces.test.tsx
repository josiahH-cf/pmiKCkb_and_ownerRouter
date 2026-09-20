// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { RenewalDeskTable } from "@/components/lease-renewal/RenewalDeskTable";
import { RenewalFocusHashTarget } from "@/components/lease-renewal/RenewalFocusHashTarget";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type {
  DeskLeaseGuidance,
  DeskLeaseRow,
  DeskLeaseSummaryBase,
} from "@/lib/lease-renewal/desk-model";
import { withRenewalDeskQueryKeys } from "@/lib/lease-renewal/desk-query";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  OVERALL_STATUS_URGENCY_RANK,
} from "@/lib/lease-renewal/desk-query-v2";
import type { MoveOutDisposition } from "@/lib/lease-renewal/move-out-disposition";
import { NON_RENEWAL_HANDOFF_TARGET_ID } from "@/lib/lease-renewal/renewal-issues";
import { fixedTermProjection } from "@/tests/helpers/lease-term-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S127 (F07): the desk and the workspace render the same issue model with visible kind labels and
// exact control targets; activating an issue focuses its target; a pause reads as policy, not as a
// failure. Rendering issues no request and records nothing. Values are synthetic.

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

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

const initiated: MoveOutDisposition = {
  state: "initiated",
  reason: "notice_status",
  label: "Move-out initiated in RentVine: Active - Notice Given.",
  evidence: {
    origin: "rentvine_lease_status",
    leaseId: "L1",
    statusId: "3",
    statusName: "Active - Notice Given",
    primaryStatusId: "2",
    pendingMoveOut: true,
    completedMoveOut: false,
    noticeDateIso: "2026-08-01",
    expectedMoveOutIso: "2026-09-30",
    moveOutIso: null,
  },
  freshness: "fresh",
  observedAtIso: "2026-09-20T12:00:00.000Z",
};

function row(
  id: string,
  overrides: Partial<DeskLeaseSummaryBase> = {},
  guidanceValue: DeskLeaseGuidance = guidance(),
): DeskLeaseRow {
  const base: DeskLeaseSummaryBase = {
    id,
    addressLabel: `${id} Main St`,
    propertyNameLabel: null,
    tenantNameLabel: "Tenant Alpha",
    tenantNameLabels: ["Tenant Alpha"],
    ownerNameLabels: ["Owner Alpha"],
    identity: {
      address: { label: `${id} Main St`, sourceRef: `rentvine:lease:${id}:property` },
      property: null,
      tenants: [
        { label: "Tenant Alpha", sourceRef: `rentvine:lease:${id}:tenants[0].name` },
      ],
      owners: [
        {
          label: "Owner Alpha",
          sourceRef: `rentvine:lease:${id}:portfolio.owners[0].name`,
        },
      ],
    },
    endDateIso: "2026-09-30",
    disposition: "actionable",
    reason: "actionable",
    reasonLabel: "Ready to work",
    leaseTerm: fixedTermProjection("2026-09-30"),
    currentRent: 1500,
    unitListedRent: 1500,
    retention: { state: "window", label: "Inside the current-month renewal window" },
    processVersion: "renewal-v1",
    workflowStepId: "owner-decision",
    stageIndex: 1,
    stageLabel: "Owner decision",
    nextAction: "Record the owner decision.",
    openConflicts: 0,
    ...overrides,
  };
  return {
    ...withRenewalDeskQueryKeys(base),
    processState: {
      status: "active",
      currentStepId: "owner-decision",
      currentStepState: "ready",
    },
    guidance: guidanceValue,
  };
}

const shortcuts = { available: false, tokenFor: () => null } as const;

describe("S127 desk row issues and redirect (AC-S127-2, AC-S127-3, AC-S127-6)", () => {
  it("names the other issue kinds in text beside the action and links a confirmed move-out to the handoff", () => {
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[row("L1", { moveOut: initiated }), row("L2")]}
        sheetWritebackPaused
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2 }}
        totalInScope={2}
        totalLoaded={2}
      />,
    );
    const summaries = Array.from(document.querySelectorAll(".renewal-issue-summary"));
    expect(summaries).toHaveLength(2);
    const [moveOutRow, plainRow] = summaries;
    expect(moveOutRow).toHaveAttribute(
      "data-renewal-primary-redirect",
      "non_renewal_handoff",
    );
    const handoff = within(moveOutRow as HTMLElement).getByRole("link", {
      name: /non-renewal handoff/,
    });
    expect(handoff.getAttribute("href")).toBe(
      `/lease-renewal/live/desk/lease/L1#${NON_RENEWAL_HANDOFF_TARGET_ID}`,
    );
    expect(moveOutRow).toHaveTextContent("Paused by policy");
    expect(plainRow).toHaveAttribute("data-renewal-primary-redirect", "none");
    expect(plainRow).toHaveAttribute("data-renewal-issue-kinds", "policy_pause");
    expect(plainRow).toHaveTextContent("Also: Paused by policy (1)");
    expect(plainRow?.textContent).not.toMatch(/fail|broken|error/i);
    // The blocker links already carry their exact step and control target.
    cleanup();
    render(
      <RenewalDeskTable
        role="Editor"
        rows={[
          row(
            "L3",
            {},
            guidance({
              overallStatus: "blocked",
              isBlocked: true,
              blockers: [
                {
                  id: "tenant-email",
                  label: "Add a tenant email address.",
                  type: "evidence",
                  phaseId: "tenant-decision",
                  destination: {
                    kind: "workspace_phase",
                    stepId: "tenant-decision",
                    controlId: "renewal-tenant-recipient",
                  },
                },
              ],
              action: { kind: "blocked" },
            }),
          ),
        ]}
        shortcuts={shortcuts}
        sourceReadOk
        state={{ ...DEFAULT_RENEWAL_DESK_QUERY_V2 }}
        totalInScope={1}
        totalLoaded={1}
      />,
    );
    const blocker = screen.getByRole("link", { name: "Add a tenant email address." });
    expect(blocker.getAttribute("href")).toContain("step=tenant-decision");
    expect(blocker.getAttribute("href")).toContain("#renewal-tenant-recipient");
  });
});

describe("S127 workspace disclosure and focus (AC-S127-1, AC-S127-3, AC-S127-6)", () => {
  it("lists other issues on demand with kind, reason, affected action and responsible party, and redirects a confirmed move-out", () => {
    const value = getRenewalLeaseWorkspace("lease-318-cedar-7");
    if (!value) throw new Error("sample workspace missing");
    render(
      <RenewalWorkspace
        role="Editor"
        sheetWritebackPaused
        workspace={{
          ...value,
          guidance: guidance(),
          summary: { ...value.summary, moveOut: initiated },
        }}
        workStatus={{ available: true, record: null, history: [], currentCycleId: null }}
      />,
    );
    const redirect = document.querySelector(
      '[data-renewal-primary-redirect="non_renewal_handoff"]',
    );
    expect(redirect).not.toBeNull();
    expect(redirect).toHaveTextContent(/non-renewal handoff/);
    const link = within(redirect as HTMLElement).getByRole("link", {
      name: "Go to the non-renewal handoff",
    });
    expect(link.getAttribute("href")).toBe(`#${NON_RENEWAL_HANDOFF_TARGET_ID}`);
    const details = document.querySelector("details.renewal-issues");
    expect(details).toHaveAttribute("data-renewal-issues", "1");
    expect(
      within(details as HTMLElement).getByText("Other current issues (1)"),
    ).toBeInTheDocument();
    const pause = details?.querySelector('[data-renewal-issue-kind="policy_pause"]');
    expect(pause).toHaveTextContent("Paused by policy:");
    expect(pause).toHaveTextContent("Affects: Writing to the operating Sheet.");
    expect(pause).toHaveTextContent("Resolved by: Owner policy.");
    expect(pause?.querySelector("a")).toBeNull();
    expect(pause?.textContent).not.toMatch(/fail|broken|error/i);
  });

  it("moves keyboard focus to the hash target so an activated issue lands on its control", () => {
    render(
      <div>
        <div id="renewal-tenant-recipient" tabIndex={-1}>
          Tenant recipient
        </div>
        <RenewalFocusHashTarget />
      </div>,
    );
    expect(document.activeElement?.id).not.toBe("renewal-tenant-recipient");
    window.location.hash = "#renewal-tenant-recipient";
    window.dispatchEvent(new Event("hashchange"));
    expect(document.activeElement?.id).toBe("renewal-tenant-recipient");
  });
});
