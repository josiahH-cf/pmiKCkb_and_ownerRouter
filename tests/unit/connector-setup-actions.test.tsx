// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectorSetupActions } from "@/components/connections/ConnectorSetupActions";
import type { ConnectorConnectionView } from "@/lib/connections/connection-status";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const GENERATION_ID = "22222222-2222-4222-8222-222222222222";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

function connected(): ConnectorConnectionView {
  return {
    status: "connected",
    disconnect: {
      state: "connected",
      record_version: `g:${GENERATION_ID}:1`,
      recovery_available: true,
    },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let randomUuid: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  randomUuid = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(OPERATION_ID);
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/connect")) {
      return jsonResponse({
        connectorId: "dotloop",
        status: "credentials_not_configured",
      });
    }
    return jsonResponse({
      connectorId: "rentvine",
      disconnected: true,
      operationId: OPERATION_ID,
      completedAt: "2026-08-31T12:00:00.000Z",
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  randomUuid.mockRestore();
  refresh.mockReset();
});

describe("ConnectorSetupActions", () => {
  it("renders nothing for a google connector", () => {
    const { container } = render(
      <ConnectorSetupActions
        connectorId="google_sheets"
        connectorName="Google Sheets"
        method="google"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers no credential entry on the API key card and points at server setup", () => {
    render(
      <ConnectorSetupActions
        connectorId="rentvine"
        connectorName="RentVine"
        method="api_key"
      />,
    );
    expect(document.querySelector("input")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save API key" })).toBeNull();
    expect(screen.getByText(/set up on the server, not entered here/i)).toBeVisible();
    expect(document.body.textContent).not.toContain("RENTVINE_API_KEY");
  });

  it("makes first activation and Cancel inert, with Cancel initially focused", async () => {
    const user = userEvent.setup();
    render(
      <ConnectorSetupActions
        connection={connected()}
        connectorId="rentvine"
        connectorName="RentVine"
        method="api_key"
      />,
    );
    const trigger = screen.getByRole("button", { name: "Disconnect" });
    await user.click(trigger);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Disconnect RentVine" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Confirm disconnect" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("sends exactly one version-bound start request only after the exact phrase", async () => {
    const user = userEvent.setup();
    render(
      <ConnectorSetupActions
        connection={connected()}
        connectorId="rentvine"
        connectorName="RentVine"
        method="api_key"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    const input = screen.getByLabelText(/Type Disconnect RentVine exactly/);
    await user.type(input, "disconnect RentVine");
    expect(screen.getByRole("button", { name: "Confirm disconnect" })).toBeDisabled();
    await user.clear(input);
    await user.type(input, "Disconnect RentVine");
    await user.click(screen.getByRole("button", { name: "Confirm disconnect" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/connections/rentvine/disconnect");
    expect(JSON.parse(String(init.body))).toEqual({
      mode: "start",
      operationId: OPERATION_ID,
      connectorId: "rentvine",
      observedVersion: `g:${GENERATION_ID}:1`,
      confirmationPhrase: "Disconnect RentVine",
    });
    expect(await screen.findByText("RentVine is disconnected.")).toBeVisible();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("recovers a pending operation without minting a replacement id", async () => {
    const user = userEvent.setup();
    render(
      <ConnectorSetupActions
        connection={{
          status: "revocation_pending",
          disconnect: {
            state: "revocation_pending",
            record_version: `g:${GENERATION_ID}:2`,
            operation_id: OPERATION_ID,
            requested_at: "2026-08-31T11:00:00.000Z",
            recovery_available: true,
          },
        }}
        connectorId="rentvine"
        connectorName="RentVine"
        method="api_key"
      />,
    );
    expect(screen.getByText("Disconnecting: needs recovery.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry disconnect" }));
    await user.type(
      screen.getByLabelText(/Type Disconnect RentVine exactly/),
      "Disconnect RentVine",
    );
    await user.click(screen.getByRole("button", { name: "Confirm disconnect" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.mode).toBe("recover");
    expect(body.operationId).toBe(OPERATION_ID);
    expect(randomUuid).not.toHaveBeenCalled();
  });

  it("shows a revoked receipt and dispatches no second disconnect", () => {
    render(
      <ConnectorSetupActions
        connection={{
          status: "revoked",
          disconnect: {
            state: "revoked",
            record_version: `g:${GENERATION_ID}:3`,
            operation_id: OPERATION_ID,
            completed_at: "2026-08-31T12:00:00.000Z",
            destroy_outcome: "destroyed",
            recovery_available: false,
          },
        }}
        connectorId="rentvine"
        connectorName="RentVine"
        method="api_key"
      />,
    );
    expect(screen.getByText(`Receipt: ${OPERATION_ID}`)).toBeVisible();
    expect(screen.queryByRole("button", { name: /disconnect/i })).toBeNull();
    expect(screen.getByRole("link", { name: /review setup/i })).toHaveAttribute(
      "href",
      "/connections#connector-rentvine",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps malformed legacy pending state fail-closed", () => {
    render(
      <ConnectorSetupActions
        connection={{
          status: "revocation_pending",
          disconnect: {
            state: "legacy_pending",
            record_version: null,
            recovery_available: false,
          },
        }}
        connectorId="rentvine"
        connectorName="RentVine"
        method="api_key"
      />,
    );
    expect(screen.getByText(/needs Admin investigation/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /disconnect/i })).toBeNull();
  });

  it("does not offer reconnect for a malformed revoked lifecycle", () => {
    render(
      <ConnectorSetupActions
        connection={{
          status: "revoked",
          disconnect: {
            state: "manual_blocker",
            record_version: "g:22222222-2222-4222-8222-222222222222:3",
            recovery_available: false,
          },
        }}
        connectorId="dotloop"
        connectorName="Dotloop"
        method="oauth"
      />,
    );
    expect(screen.getByText(/needs Admin investigation/i)).toBeVisible();
    expect(screen.queryByRole("button", { name: /connect with/i })).toBeNull();
  });

  it("preserves the OAuth connect truth when no connection exists", async () => {
    const user = userEvent.setup();
    render(
      <ConnectorSetupActions
        connectorId="dotloop"
        connectorName="Dotloop"
        method="oauth"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Connect with Dotloop" }));
    expect(
      await screen.findByText("Add the Dotloop connection details first."),
    ).toBeVisible();
  });
});
