// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ConnectionCenter } from "@/components/connections/ConnectionCenter";
import { buildConnectionView } from "@/lib/connections/connection-status";

afterEach(() => {
  cleanup();
});

const configuredPresence = {
  RENTVINE_API_BASE_URL: true,
  RENTVINE_API_KEY: true,
  RENTVINE_API_SECRET: true,
};

describe("ConnectionCenter", () => {
  it("renders connector cards with status and never leaks an env var name or secret", () => {
    const view = buildConnectionView(configuredPresence);
    render(<ConnectionCenter canManage view={view} />);

    expect(
      screen.getByRole("heading", { name: "Connections", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("RentVine")).toBeInTheDocument();
    expect(screen.getByText("Dotloop")).toBeInTheDocument();
    expect(screen.getByText("Gmail (legacy notification sender)")).toBeInTheDocument();
    expect(document.body.textContent).toContain(
      "Approval notifications are in-app for the first release.",
    );
    expect(screen.getByText("Gmail (workflow communications)")).toBeInTheDocument();
    expect(document.body.textContent).toContain(
      "Gmail stays the message system of record.",
    );

    // RentVine fully configured → ready to verify; the OAuth connectors read Not connected.
    expect(screen.getByText("Ready to verify")).toBeInTheDocument();
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);

    // The guided "Set up" wizard still renders; the dead future-promise control is gone.
    expect(screen.getByText("Set up RentVine")).toBeInTheDocument();
    expect(screen.queryByText("Available in the next release.")).not.toBeInTheDocument();

    // No env var name (or secret value) ever appears in the UI.
    expect(document.body.textContent).not.toContain("RENTVINE_API_KEY");
    expect(document.body.textContent).not.toContain("RENTVINE_API_BASE_URL");
    expect(document.body.textContent).not.toContain("DOTLOOP_OAUTH_CLIENT_ID");
    expect(document.body.textContent).not.toContain("KB_APPROVAL_SENDER");

    // Voice rules v2: plain operator English. The app calls itself "the app"; no internal
    // jargon anywhere on the surface (locks the 2026-07-02 operator-quoted strings out).
    expect(document.body.textContent).not.toMatch(/control plane/i);
    expect(document.body.textContent).not.toMatch(/PMI handles/i);
    expect(document.body.textContent).not.toMatch(/PMI stores/i);
    expect(document.body.textContent).toContain(
      "Connect the systems the app reads from.",
    );
  });

  it("shows Connected once a connector's live check passed (D1)", () => {
    const view = buildConnectionView(configuredPresence, new Set(["rentvine"]));
    render(<ConnectionCenter canManage view={view} />);

    // "Connected" appears as both the summary metric label and the card's status label.
    expect(screen.getAllByText("Connected").length).toBeGreaterThan(1);
    expect(screen.getByText("Verified and ready.")).toBeInTheDocument();
  });

  it("gives Admins a Verify button only where a live check is built (D5)", () => {
    const view = buildConnectionView(configuredPresence);
    render(
      <ConnectionCenter
        canManage
        verifiableIds={["rentvine", "google_sheets"]}
        view={view}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Verify connection" })).toHaveLength(2);
  });

  it("is read-only for non-Admins: status visible, no setup or verify affordance (D5)", () => {
    const view = buildConnectionView(configuredPresence);
    render(
      <ConnectionCenter
        canManage={false}
        verifiableIds={["rentvine", "google_sheets"]}
        view={view}
      />,
    );

    expect(screen.getByText("RentVine")).toBeInTheDocument();
    expect(screen.getByText("Ready to verify")).toBeInTheDocument();
    expect(screen.queryByText(/^Set up /)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Verify connection" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("An Admin connects and verifies this.").length,
    ).toBeGreaterThan(0);
  });
});
