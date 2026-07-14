// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import {
  getRenewalDeskView,
  getRenewalLeaseWorkspace,
} from "@/lib/lease-renewal/sample-desk";

afterEach(() => {
  cleanup();
});

describe("RenewalDesk", () => {
  it("renders the queue, the sample-data chip, and the collapsed dispositions", () => {
    render(<RenewalDesk view={getRenewalDeskView()} />);

    expect(
      screen.getByRole("heading", { name: "Renewals", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sample data")).toBeInTheDocument();

    // The desk now leads with a needs-attention fold; the address appears there and in the queue.
    expect(screen.getByText("Needs your attention")).toBeInTheDocument();
    expect(screen.getAllByText("4821 Maple Ct, Unit 4").length).toBeGreaterThan(0);
    // The conflict lease surfaces a one-click "Resolve conflicts" next action at the top.
    expect(screen.getByRole("link", { name: "Resolve conflicts" })).toBeInTheDocument();

    // Actionable leases still appear as cards with an Open link.
    expect(screen.getAllByRole("link", { name: "Open" })).toHaveLength(3);

    // The conflict lease shows a humanized source-conflict pill, not severity jargon.
    expect(screen.getByText("1 source conflict")).toBeInTheDocument();

    // Skipped / review / out-of-window are demoted into collapsed groups.
    expect(screen.getByText("Skipped (2)")).toBeInTheDocument();
    expect(screen.getByText("Needs review (1)")).toBeInTheDocument();
    expect(screen.getByText("Out of window (1)")).toBeInTheDocument();
    expect(screen.getByText("Data diagnostics")).toBeInTheDocument();
  });
});

describe("RenewalWorkspace", () => {
  it("shows the four steps, source-tagged drafts, the 3 tenant channels, and readiness", async () => {
    const user = userEvent.setup();
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7");
    expect(workspace).not.toBeNull();
    render(<RenewalWorkspace workspace={workspace!} />);

    expect(
      screen.getByRole("heading", { name: "318 Cedar Ave, Unit 7", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Data check", level: 2 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Owner decision", level: 2 }),
    ).toBeInTheDocument();

    // The owner email is a draft, source-tagged, never offering a send. The source tag renders the
    // clean display label ("RentVine"), not the internal "Rentvine (read-authoritative)" id (S13 A5).
    expect(screen.getAllByText(/Review before sending/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/RentVine/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/read-authoritative/)).toBeNull();

    // Tenant offer: email is shown first; switching to the text channel reveals the short nudge.
    expect(screen.getByText(/we'll get the documents out/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Text" }));
    expect(
      screen.queryByText(/emailed and messaged you the details/),
    ).not.toBeInTheDocument();

    // Readiness flags the Kansas City addendum.
    expect(screen.getByText("City-specific addendum")).toBeInTheDocument();
    expect(screen.getByText(/Kansas City city-specific addendum/)).toBeInTheDocument();
  });

  it("withholds the tenant offer until the owner decides and flags the conflict", () => {
    const workspace = getRenewalLeaseWorkspace("lease-1207-walnut-2");
    render(<RenewalWorkspace workspace={workspace!} />);

    expect(screen.getByText("Available after the owner decides")).toBeInTheDocument();
    expect(screen.getByText("Needs your decision")).toBeInTheDocument();
  });
});
