// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { getRenewalLeaseWorkspace } from "@/lib/lease-renewal/sample-desk";

afterEach(() => {
  cleanup();
});

describe("RenewalWorkspace live mode", () => {
  it("shows the Live-data chip, renders the gated live composer, and drops the sample email buttons", () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7");
    expect(workspace).not.toBeNull();
    render(<RenewalWorkspace mode="live" workspace={workspace!} />);

    // Unmistakably live data, not sample.
    expect(screen.getByText("Live data")).toBeInTheDocument();
    expect(screen.queryByText("Sample data")).not.toBeInTheDocument();

    // The live, gated draft composer is present (the only send path).
    expect(screen.getByText(/Composes an unsent Gmail draft/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview draft" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Gmail draft" }),
    ).toBeInTheDocument();

    // The sample "Prepare ... email" buttons (which post to the sample draft routes) are gone.
    expect(
      screen.queryByRole("button", { name: "Prepare owner email" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Prepare tenant email" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the sample email buttons and chip in sample mode", () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7");
    render(<RenewalWorkspace workspace={workspace!} />);

    expect(screen.getByText("Sample data")).toBeInTheDocument();
    expect(screen.queryByText("Live data")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Prepare owner email" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Prepare tenant email" }),
    ).toBeInTheDocument();
    // The sample workspace points to the live notices desk instead of an always-failing composer.
    expect(screen.queryByText(/Composes an unsent Gmail draft/)).not.toBeInTheDocument();
  });
});
