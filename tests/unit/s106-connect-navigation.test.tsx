// @vitest-environment jsdom
// S106 AC-S106-5 (fail-first): the mounted Connect control follows the server's validated Dotloop
// authorization address and never reports a connection before the provider callback decides it.

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectorSetupActions } from "@/components/connections/ConnectorSetupActions";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const AUTHORIZE =
  "https://auth.dotloop.com/oauth/authorize?response_type=code&client_id=client-public-1&redirect_uri=https%3A%2F%2Fpmi-kc-app.example%2Fapi%2Fconnections%2Fdotloop%2Fcallback&state=0f1e2d3c-4b5a-4968-8776-655443322110&redirect_on_deny=true";

function respond(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status: ok ? 200 : 409, json: async () => body })),
  );
}

beforeEach(() => {
  refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S106 Connect navigation (AC-S106-5)", () => {
  it("navigates to the returned documented authorization address and claims no connection", async () => {
    respond({ status: "authorize_url", authorizeUrl: AUTHORIZE });
    const navigate = vi.fn();
    render(
      <ConnectorSetupActions
        connectorId="dotloop"
        connectorName="Dotloop"
        method="oauth"
        navigate={navigate}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Connect with Dotloop" }));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(AUTHORIZE));
    expect(screen.queryByText("Connected.")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/Opening Dotloop to authorize/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses to follow an address that is not the documented Dotloop authorization URL", async () => {
    const navigate = vi.fn();
    for (const forged of [
      "https://evil.example/oauth/authorize?response_type=code&client_id=x&state=0f1e2d3c-4b5a-4968-8776-655443322110&redirect_uri=https%3A%2F%2Fa.example%2Fapi%2Fconnections%2Fdotloop%2Fcallback",
      `${AUTHORIZE}&client_secret=leak`,
      AUTHORIZE.replace("api%2Fconnections%2Fdotloop%2Fcallback", "elsewhere"),
    ]) {
      cleanup();
      respond({ status: "authorize_url", authorizeUrl: forged });
      render(
        <ConnectorSetupActions
          connectorId="dotloop"
          connectorName="Dotloop"
          method="oauth"
          navigate={navigate}
        />,
      );
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Connect with Dotloop" }));
      expect(
        await screen.findByText(/authorization address was not recognized/),
      ).toBeVisible();
    }
    expect(navigate).not.toHaveBeenCalled();
  });

  it("names incomplete configuration from the refusing response without opening anything", async () => {
    respond(
      { status: "credentials_not_configured", missing: ["DOTLOOP_OAUTH_CLIENT_ID"] },
      false,
    );
    const navigate = vi.fn();
    render(
      <ConnectorSetupActions
        connectorId="dotloop"
        connectorName="Dotloop"
        method="oauth"
        navigate={navigate}
      />,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Connect with Dotloop" }));
    expect(
      await screen.findByText(
        "The Dotloop application configuration is incomplete. Nothing was opened.",
      ),
    ).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });
});
