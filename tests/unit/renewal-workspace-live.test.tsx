// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type { RenewalLeaseWorkspace } from "@/lib/lease-renewal/desk-model";
import {
  RENEWAL_COMPLETION_REQUIREMENTS,
  buildRenewalEvidenceReference,
  projectRenewalProcess,
  type RenewalEvidenceMap,
} from "@/lib/lease-renewal/renewal-process";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

afterEach(() => {
  cleanup();
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

    // The live, gated draft composer is present (the only send path).
    expect(screen.getByText(/Composes an unsent Gmail draft/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Preview review-only copy" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Tenant copy v1\.0: Review only/)).toBeInTheDocument();
    expect(screen.getByText(/review-only preview cannot create/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Gmail draft" })).toBeDisabled();

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
    expect(screen.getByText(/Composes an unsent Gmail draft/)).toBeInTheDocument();
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
    expect(screen.getAllByText("State unavailable")).toHaveLength(7);
    expect(document.querySelector('[data-current="true"]')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[data-state="unavailable"]')).toHaveLength(6);
    expect(screen.getAllByRole("link", { name: /State unavailable/ })).toHaveLength(6);
    expect(screen.getAllByText(/Dependent actions are paused/i).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole("button", { name: "Preview review-only copy" }),
    ).not.toBeInTheDocument();
  });

  it("renders source-update controls only inside the verification phase", () => {
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
    expect(screen.queryByText("Sheet proposal controls")).not.toBeInTheDocument();
    expect(screen.queryByText("RentVine proposal controls")).not.toBeInTheDocument();

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

  it("keeps an untracked out-of-window workspace inspection-only", () => {
    const current = getRenewalLeaseWorkspace("lease-1207-walnut-2");
    if (!current) throw new Error("Missing sample workspace.");
    const workspace: RenewalLeaseWorkspace = {
      ...current,
      workflowAvailable: false,
      live: undefined,
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

    expect(screen.getByRole("heading", { name: "Inspection only" })).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Renewal phases" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Do this next" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Discrepancy controls")).not.toBeInTheDocument();
    expect(screen.queryByText("Sheet proposal controls")).not.toBeInTheDocument();
    expect(screen.queryByText("RentVine proposal controls")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Review and resolve this source item" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open this lease in RentVine" }),
    ).toHaveAttribute("href", "https://pmikcmetro.rentvine.com/leases/4821");
    expect(
      screen.getByRole("link", { name: "Open the operating renewal Sheet" }),
    ).toBeInTheDocument();
  });
});
