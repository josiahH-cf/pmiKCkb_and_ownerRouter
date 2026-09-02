// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
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
});
