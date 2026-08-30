// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

afterEach(() => {
  cleanup();
});

describe("RenewalWorkspace live mode", () => {
  it("shows the Live-data chip, renders the gated live composer, and drops the sample email buttons", () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7");
    expect(workspace).not.toBeNull();
    render(<RenewalWorkspace workspace={workspace!} />);

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
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7");
    render(<RenewalWorkspace workspace={workspace!} />);

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
