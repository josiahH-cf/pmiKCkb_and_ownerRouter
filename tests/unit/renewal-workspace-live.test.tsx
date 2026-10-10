// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => router,
}));

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type {
  DeskLeaseGuidance,
  RenewalLeaseWorkspace,
} from "@/lib/lease-renewal/desk-model";
import {
  RENEWAL_COMPLETION_REQUIREMENTS,
  buildRenewalEvidenceReference,
  projectRenewalProcess,
  type RenewalEvidenceMap,
} from "@/lib/lease-renewal/renewal-process";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

afterEach(() => {
  cleanup();
  expect(router.refresh).not.toHaveBeenCalled();
  router.refresh.mockClear();
});

function tenantPhaseCurrentEvidence(): RenewalEvidenceMap {
  const evidence: RenewalEvidenceMap = {};
  for (const requirement of RENEWAL_COMPLETION_REQUIREMENTS) {
    evidence[requirement.key] = buildRenewalEvidenceReference({
      ref: `app_record:${requirement.key}:receipt-1`,
      source: "app_record",
      disposition: requirement.allowNotApplicable ? "not_applicable" : "verified",
      ...(requirement.allowNotApplicable
        ? { reason: `The approved ${requirement.key} rule does not apply here.` }
        : {}),
    });
  }
  // Park the real projection on the tenant phase: every earlier requirement is satisfied and the
  // tenant-side work is still open.
  delete evidence["tenant-outcome"];
  delete evidence["tenant-message-sent"];
  delete evidence["tenant-contact-state"];
  delete evidence["tenant-draft-receipt"];
  return evidence;
}

/** The 318 sample workspace advanced (via real evidence) to a current tenant-decision phase. */
function tenantPhaseWorkspace() {
  const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7");
  if (!workspace) throw new Error("Missing sample workspace.");
  const process = projectRenewalProcess({
    processVersion: workspace.process.version,
    evidence: tenantPhaseCurrentEvidence(),
    tenantOutcome: null,
    complete: false,
  });
  return { ...workspace, process, currentStepIndex: process.currentStepIndex };
}

describe("RenewalWorkspace next action is the shared desk guidance (S104)", () => {
  it("renders the guidance action label, not a recomputation from the process", () => {
    const base = tenantPhaseWorkspace();
    const guidance: DeskLeaseGuidance = {
      ...base.guidance,
      overallStatus: "ready",
      isBlocked: false,
      blockers: [],
      action: {
        kind: "act",
        label: "Record the tenant's source-backed answer in Tenant decision.",
        destination: { kind: "workspace_phase", stepId: "tenant-decision" },
      },
    };
    render(<RenewalWorkspace workspace={{ ...base, guidance }} />);
    expect(screen.getByRole("heading", { name: "Suggested next" })).toBeInTheDocument();
    expect(
      screen.getByText("Record the tenant's source-backed answer in Tenant decision."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Tenant decision" })).toHaveAttribute(
      "href",
      expect.stringContaining("step=tenant-decision"),
    );
  });

  it("lists the guidance blockers with their exact phase links", () => {
    const base = tenantPhaseWorkspace();
    const guidance: DeskLeaseGuidance = {
      ...base.guidance,
      overallStatus: "blocked",
      isBlocked: true,
      blockers: [
        {
          id: "owner-decision",
          label: "Owner decision evidence is missing",
          type: "evidence",
          phaseId: "owner-decision",
          destination: { kind: "workspace_phase", stepId: "owner-decision" },
        },
      ],
      action: { kind: "blocked" },
    };
    render(<RenewalWorkspace workspace={{ ...base, guidance }} />);
    expect(screen.getByRole("heading", { name: "Suggested next" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Owner decision evidence is missing" }),
    ).toHaveAttribute("href", expect.stringContaining("step=owner-decision"));
  });

  it("titles a waiting lease from the guidance status", () => {
    const base = tenantPhaseWorkspace();
    const guidance: DeskLeaseGuidance = {
      ...base.guidance,
      overallStatus: "waiting",
      isBlocked: false,
      blockers: [],
      action: {
        kind: "waiting",
        label:
          "Waiting on the tenant; record the outcome when a source-backed response exists.",
        destination: { kind: "workspace_phase", stepId: "tenant-decision" },
      },
    };
    render(<RenewalWorkspace workspace={{ ...base, guidance }} />);
    expect(screen.getByRole("heading", { name: "Waiting" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Do this next" }),
    ).not.toBeInTheDocument();
  });
});

describe("RenewalWorkspace live mode", () => {
  it("shows the Live-data chip and renders the gated live composer on the current tenant phase", () => {
    const workspace = tenantPhaseWorkspace();
    expect(workspace.process.steps[workspace.currentStepIndex]?.id).toBe(
      "tenant-decision",
    );
    render(<RenewalWorkspace workspace={workspace} />);

    // Unmistakably live data, not sample.
    expect(screen.getByText("Live data")).toBeInTheDocument();
    expect(screen.queryByText("Sample data")).not.toBeInTheDocument();

    // Legacy entry points lead to the actual current-cycle reviewed controls; they cannot create.
    expect(screen.getByText("Reviewed renewal messages")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Prepare owner message" })).toHaveAttribute(
      "href",
      `/gmail-hub?compose=renewal_owner&lease=${workspace.summary.id}`,
    );
    expect(screen.getByRole("link", { name: "Prepare tenant message" })).toHaveAttribute(
      "href",
      `/gmail-hub?compose=renewal_tenant&lease=${workspace.summary.id}`,
    );
    expect(
      screen.queryByRole("button", { name: "Create Gmail draft" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Recover an earlier legacy draft attempt"),
    ).toBeInTheDocument();

    // The sample "Prepare ... email" buttons (which post to the sample draft routes) are gone.
    expect(
      screen.queryByRole("button", { name: "Prepare owner email" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Prepare tenant email" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Comps screenshot/i)).not.toBeInTheDocument();
  });

  it("has no sample mode even when an automated test supplies a fixture-shaped view", () => {
    const workspace = tenantPhaseWorkspace();
    render(<RenewalWorkspace workspace={workspace} />);

    expect(screen.getByText("Live data")).toBeInTheDocument();
    expect(screen.queryByText("Sample data")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Prepare owner email" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Prepare tenant email" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Reviewed renewal messages")).toBeInTheDocument();
  });

  it("pauses progress-dependent draft controls when saved progress cannot be verified", () => {
    const workspace = tenantPhaseWorkspace();
    render(
      <RenewalWorkspace
        auxiliaryFailures={[{ key: "progress", status: "failed" }]}
        selectedStepId="tenant-decision"
        workspace={workspace}
      />,
    );

    expect(screen.getByText("Supporting information unavailable")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Saved progress unavailable" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Waiting on the tenant")).not.toBeInTheDocument();
    expect(screen.queryByText("Current phase")).not.toBeInTheDocument();
    expect(document.querySelector('[data-current="true"]')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-progress-state="unavailable"]')).toHaveLength(
      5,
    );
    expect(screen.getAllByText(/Dependent actions are paused/i).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole("button", { name: "Preview review-only copy" }),
    ).not.toBeInTheDocument();
  });

  it("keeps source-update controls inspectable from an old phase bookmark", () => {
    const workspace = getRenewalLeaseWorkspace("lease-1207-walnut-2");
    if (!workspace) throw new Error("Missing sample workspace.");

    const { rerender } = render(
      <RenewalWorkspace
        operatingSheetPanel={<div>Sheet proposal controls</div>}
        rentvineUpdatesPanel={<div>RentVine proposal controls</div>}
        resolutionDestinations={[
          {
            fieldKey: "current_rent",
            href: "/lease-renewal/live#renewal-review-item-current-rent",
          },
        ]}
        selectedStepId="owner-decision"
        workspace={workspace}
      />,
    );
    expect(
      screen.getByText("Sheet proposal controls").closest("section"),
    ).toHaveAttribute("aria-label", "Lease details");
    expect(
      screen.getByText("RentVine proposal controls").closest("section"),
    ).toHaveAttribute("aria-label", "Lease details");

    rerender(
      <RenewalWorkspace
        operatingSheetPanel={<div>Sheet proposal controls</div>}
        rentvineUpdatesPanel={<div>RentVine proposal controls</div>}
        resolutionDestinations={[
          {
            fieldKey: "current_rent",
            href: "/lease-renewal/live#renewal-review-item-current-rent",
          },
        ]}
        selectedStepId="verify-renewal"
        workspace={workspace}
      />,
    );
    expect(screen.getByText("Sheet proposal controls")).toBeInTheDocument();
    expect(screen.getByText("RentVine proposal controls")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review and resolve this source item" }),
    ).toHaveAttribute("href", "/lease-renewal/live#renewal-review-item-current-rent");
  });

  it("S154 BEH-S154-1/2 (AC-S154-1): an out-of-window lease opened directly is workable, with its classification kept as context", () => {
    const current = getRenewalLeaseWorkspace("lease-1207-walnut-2");
    if (!current) throw new Error("Missing sample workspace.");
    // S154 (b7693d4d): there is no inspection-only lane. The window classification stays on the
    // summary for display and filters; every control the page mounts renders.
    const workspace: RenewalLeaseWorkspace = {
      ...current,
      tenantDraft: null,
      summary: {
        ...current.summary,
        disposition: "out_of_window",
        reason: "out_of_window",
        reasonLabel: "Outside this window",
        retention: { state: "outside", label: "Outside the active renewal window" },
        processVersion: null,
        workflowStepId: null,
        stageIndex: -1,
        stageLabel: null,
        nextAction: null,
        sourceDestinations: {
          rentvine: {
            kind: "external",
            href: "https://pmikcmetro.rentvine.com/leases/4821",
            label: "RentVine lease 4821",
          },
        },
      },
    };

    render(
      <RenewalWorkspace
        discrepancyPanel={<div>Discrepancy controls</div>}
        operatingSheetPanel={<div>Sheet proposal controls</div>}
        rentvineUpdatesPanel={<div>RentVine proposal controls</div>}
        resolutionDestinations={[
          {
            fieldKey: "current_rent",
            href: "/lease-renewal/live#renewal-review-item-current-rent",
          },
        ]}
        selectedStepId="owner-decision"
        sheetDestination={{
          kind: "external",
          href: "https://docs.google.com/spreadsheets/d/sheet-id/edit",
          label: "Operating renewal Sheet",
        }}
        workspace={workspace}
      />,
    );

    expect(screen.queryByRole("heading", { name: "Inspection only" })).toBeNull();
    expect(screen.queryByText(/inspection only/i)).toBeNull();
    expect(workspace.summary.retention.state).toBe("outside");
    expect(screen.getByRole("region", { name: "Lease details" })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Documents and completion" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Suggested next" })).toBeInTheDocument();
    expect(screen.getByText("Discrepancy controls")).toBeInTheDocument();
    expect(screen.getByText("Sheet proposal controls")).toBeInTheDocument();
    expect(screen.getByText("RentVine proposal controls")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review and resolve this source item" }),
    ).toHaveAttribute("href", "/lease-renewal/live#renewal-review-item-current-rent");
    expect(
      screen.getByRole("link", { name: "Open this lease in RentVine" }),
    ).toHaveAttribute("href", "https://pmikcmetro.rentvine.com/leases/4821");
    expect(
      screen.getByRole("link", { name: "Open the operating renewal Sheet" }),
    ).toBeInTheDocument();
  });
});
