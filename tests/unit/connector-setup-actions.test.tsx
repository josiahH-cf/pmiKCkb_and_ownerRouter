// @vitest-environment jsdom

// The Admin connect affordance is honest and leak-free: the api_key form is write-only and reports
// the not-configured truth, the oauth button reports what is missing, google renders nothing, and no
// env var name or typed secret ever appears in the rendered DOM.

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import { ConnectorSetupActions } from "@/components/connections/ConnectorSetupActions";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api-key")) {
      return jsonResponse({
        connectorId: "rentvine",
        stored: false,
        status: "storage_not_configured",
      });
    }
    if (url.includes("/connect")) {
      return jsonResponse({
        connectorId: "dotloop",
        status: "credentials_not_configured",
      });
    }
    return jsonResponse({}, false);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe("ConnectorSetupActions", () => {
  it("renders nothing for a google connector", () => {
    const { container } = render(
      <ConnectorSetupActions
        connected={false}
        connectorId="google_sheets"
        connectorName="Google Sheets"
        method="google"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // HV-004 (owner decision, 2026-08-25): the API-key card no longer accepts a credential. It used to
  // render a masked, write-only input whose safety properties were all genuinely present -- but
  // nothing was ever stored, so the page invited an operator to hand over a real credential and then
  // discarded it while its own setup copy said otherwise. These assertions pin the removal.
  it("offers no credential entry on the API key card and points at server setup", () => {
    render(
      <ConnectorSetupActions
        connected={false}
        connectorId="rentvine"
        connectorName="RentVine"
        method="api_key"
      />,
    );

    // No input of any kind, and specifically no password field or save control.
    expect(screen.queryByLabelText("Add your RentVine API key")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save API key" })).toBeNull();
    expect(document.querySelector("input")).toBeNull();
    expect(document.querySelector('input[type="password"]')).toBeNull();

    // It says where the key actually goes instead of silently offering a dead field.
    expect(
      screen.getByText(/set up on the server, not entered here/i),
    ).toBeInTheDocument();

    // Still never names an env var.
    expect(document.body.textContent).not.toContain("RENTVINE_API_KEY");
  });

  it("still offers Disconnect on a connected API key connector", () => {
    render(
      <ConnectorSetupActions
        connected
        connectorId="rentvine"
        connectorName="RentVine"
        method="api_key"
      />,
    );
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save API key" })).toBeNull();
  });

  it("offers an OAuth connect button and reports missing connection details", async () => {
    const user = userEvent.setup();
    render(
      <ConnectorSetupActions
        connected={false}
        connectorId="dotloop"
        connectorName="Dotloop"
        method="oauth"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Connect with Dotloop" }));

    await waitFor(() =>
      expect(
        screen.getByText("Add the Dotloop connection details first."),
      ).toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain("DOTLOOP_OAUTH_CLIENT_ID");
  });

  it("reports the honest not-available message once details are present", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ connectorId: "dotloop", status: "provider_not_available" }),
    );
    const user = userEvent.setup();
    render(
      <ConnectorSetupActions
        connected={false}
        connectorId="dotloop"
        connectorName="Dotloop"
        method="oauth"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Connect with Dotloop" }));

    await waitFor(() =>
      expect(
        screen.getByText("This connector's sign-in isn't available yet."),
      ).toBeInTheDocument(),
    );
  });

  it("shows a Disconnect control only when the connector is connected", () => {
    const { rerender } = render(
      <ConnectorSetupActions
        connected={false}
        connectorId="rentvine"
        connectorName="RentVine"
        method="api_key"
      />,
    );
    expect(screen.queryByRole("button", { name: "Disconnect" })).not.toBeInTheDocument();

    rerender(
      <ConnectorSetupActions
        connected
        connectorId="rentvine"
        connectorName="RentVine"
        method="api_key"
      />,
    );
    expect(screen.getByRole("button", { name: "Disconnect" })).toBeInTheDocument();
  });
});
