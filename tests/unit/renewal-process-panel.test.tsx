// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RenewalProcessPanel } from "@/components/lease-renewal/RenewalProcessPanel";
import {
  LEGACY_RENEWAL_PROCESS_VERSION,
  RENEWAL_PROCESS_VERSION,
  buildRenewalEvidenceReference,
  projectRenewalProcess,
} from "@/lib/lease-renewal/renewal-process";

afterEach(cleanup);

describe("RenewalProcessPanel", () => {
  it("renders all six steps plus role, evidence state, blocker, and next action", () => {
    const process = projectRenewalProcess({
      processVersion: RENEWAL_PROCESS_VERSION,
      evidence: {
        "lease-tracked": buildRenewalEvidenceReference({
          ref: "app-record:lease-42:tracked",
          source: "app_record",
          disposition: "verified",
        }),
      },
      evidenceBlockers: {
        "lease-identity": {
          reason: "Authoritative lease identity is unresolved.",
          nextAction: "Refresh the exact RentVine lease.",
        },
      },
    });

    render(<RenewalProcessPanel process={process} />);
    const panel = screen.getByRole("region", {
      name: "Renewal process and evidence",
    });
    expect(
      within(panel).getByRole("heading", { name: "Renewal process · renewal-v1" }),
    ).toBeInTheDocument();
    for (const title of [
      "Find and verify the renewal",
      "Analyze market evidence and record the owner decision",
      "Prepare the tenant offer and track the decision",
      "Build the required document packet",
      "Obtain signatures and perform follow-up",
      "Complete final compliance checks and close the renewal",
    ]) {
      expect(within(panel).getByText(new RegExp(title))).toBeInTheDocument();
    }
    expect(within(panel).getAllByText(/Renewal operator/).length).toBeGreaterThan(0);
    expect(
      within(panel).getByText("Authoritative lease identity is unresolved."),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText("Next: Refresh the exact RentVine lease."),
    ).toBeInTheDocument();
    expect(within(panel).getAllByText("Complete").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText("Blocked").length).toBeGreaterThan(0);
  });

  it("shows the explicit legacy review instruction instead of reinterpreting progress", () => {
    const process = projectRenewalProcess({
      processVersion: LEGACY_RENEWAL_PROCESS_VERSION,
    });
    render(<RenewalProcessPanel process={process} />);

    expect(screen.getByText("Legacy progress needs review")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /re-record the current owner decision to pin renewal-v1/i,
    );
  });
});
