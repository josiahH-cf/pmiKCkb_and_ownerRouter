// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ConnectionCenter } from "@/components/connections/ConnectionCenter";
import { buildConnectionView } from "@/lib/connections/connection-status";

afterEach(() => {
  cleanup();
});

function service(id: string) {
  return document.getElementById(`connector-${id}`)!.closest("details")!;
}

function openService(id: string) {
  const details = service(id);
  fireEvent.click(details.querySelector("summary")!);
  expect(details).toHaveAttribute("open");
  return within(details);
}

const configuredPresence = {
  RENTVINE_API_BASE_URL: true,
  RENTVINE_API_KEY: true,
  RENTVINE_API_SECRET: true,
};

describe("ConnectionCenter", () => {
  it("groups connection truth by staff task and keeps governance closure distinct", () => {
    const view = buildConnectionView({
      ...configuredPresence,
      RENTCAST_API_KEY: true,
    });
    render(
      <ConnectionCenter
        canManage={false}
        verifiableIds={["rentvine", "google_sheets", "rentcast"]}
        view={view}
      />,
    );

    for (const group of [
      "Renewal data",
      "Communications",
      "Documents and storage",
      "Other operations",
    ]) {
      expect(screen.getByRole("region", { name: group })).toBeInTheDocument();
    }
    expect(service("rentcast").querySelector("summary")).toHaveTextContent("RentCast");
    expect(screen.getAllByText("Closed by governance")).toHaveLength(1);
    expect(document.body.textContent).toContain(
      "Connection status does not grant action authority.",
    );
    expect(
      screen.queryByRole("link", { name: "Open Admin task index" }),
    ).not.toBeInTheDocument();
  });

  it("gives an Admin a contextual return path to the task index", () => {
    render(<ConnectionCenter canManage view={buildConnectionView({})} />);

    expect(screen.getByRole("link", { name: "Open Admin task index" })).toHaveAttribute(
      "href",
      "/admin#admin-task-index",
    );
  });

  it("lets an Admin run the existing RentCast read-only check without exposing setup mutation", () => {
    render(
      <ConnectionCenter
        canManage
        verifiableIds={["rentcast"]}
        view={buildConnectionView({ RENTCAST_API_KEY: true })}
      />,
    );

    expect(service("rentcast").querySelector("summary")).toHaveTextContent(
      "Ready to verify",
    );
    expect(service("rentcast")).not.toHaveAttribute("open");
    const rentcast = openService("rentcast");
    expect(
      rentcast.getByRole("button", {
        name: "Check RentCast connection",
      }),
    ).toBeVisible();
    expect(rentcast.queryByText("Set up RentCast")).toBeNull();
  });

  it("renders connector cards with status and never leaks an env var name or secret", () => {
    const view = buildConnectionView(configuredPresence);
    render(<ConnectionCenter canManage view={view} />);

    expect(
      screen.getByRole("heading", { name: "Connections", level: 1 }),
    ).toBeInTheDocument();
    expect(service("rentvine").querySelector("summary")).toHaveTextContent("RentVine");
    expect(service("dotloop").querySelector("summary")).toHaveTextContent("Dotloop");
    expect(screen.queryByText("Gmail (legacy notification sender)")).toBeNull();
    expect(document.body.textContent).not.toContain("KB_APPROVAL_SENDER");
    expect(service("gmail_inbox").querySelector("summary")).toHaveTextContent(
      "Gmail (workflow communications)",
    );
    expect(document.body.textContent).toContain(
      "Gmail stays the message system of record.",
    );

    // RentVine fully configured → ready to verify; the OAuth connectors read Not connected.
    expect(service("rentvine").querySelector("summary")).toHaveTextContent(
      "Ready to verify",
    );
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
      "Connection status does not grant action authority.",
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

    expect(service("rentvine")).not.toHaveAttribute("open");
    expect(service("google_sheets")).not.toHaveAttribute("open");
    openService("rentvine");
    openService("google_sheets");
    expect(screen.getAllByRole("button", { name: /^Check .* connection$/ })).toHaveLength(
      2,
    );
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

    expect(service("rentvine").querySelector("summary")).toHaveTextContent("RentVine");
    expect(service("rentvine").querySelector("summary")).toHaveTextContent(
      "Ready to verify",
    );
    expect(screen.queryByText(/^Set up /)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Check .* connection$/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText("An Admin connects and verifies this.").length,
    ).toBeGreaterThan(0);
  });
});
