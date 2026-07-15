// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { V1ProductionTestWorkspacePanel } from "@/components/admin/V1ProductionTestWorkspacePanel";

const SAFE_RESULT = {
  mode: "production-test-workspace",
  dataMode: "test",
  liveEvidenceEligible: false,
  liveProviderCallCount: 0,
  vendorBoundary: {
    invited: true,
    verifiedEmailTotp: true,
    oauthExactScopes: true,
    sameMailbox: true,
    assignedTicketOnly: true,
    wrongMailboxBlocked: true,
    exactReplyOneAttempt: true,
    disabled: true,
    sessionRevoked: true,
    tokenRevocationQueued: true,
    typedProviderBoundary: true,
    liveProviderCalls: 0,
  },
  lease: {
    actionCount: 11,
    receiptCount: 11,
    attemptCount: 11,
    typedAdapterCount: 11,
    providerCallCount: 11,
  },
  maintenance: {
    actionCount: 19,
    receiptCount: 19,
    attemptCount: 19,
    typedAdapterCount: 19,
    providerCallCount: 19,
  },
  providerOperations: ["vendor.account_invite", "rentvine.work_order_create"],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("V1 production Test workspace Admin panel", () => {
  it("runs the endpoint and labels all evidence as Test-only", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(SAFE_RESULT), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<V1ProductionTestWorkspacePanel />);

    expect(screen.getByTestId("v1-production-test-badge")).toHaveTextContent(
      "TEST · non-Live",
    );
    expect(
      screen.getByText(/cannot activate a provider, satisfy Live-provider proof/i),
    ).toBeInTheDocument();
    const safety = screen.getByLabelText("Test workspace safety boundary");
    expect(within(safety).getByText("TEST")).toBeInTheDocument();
    expect(within(safety).getByText("No")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Run full Test workspace" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/v1/fake-acceptance", {
      headers: { accept: "application/json" },
      method: "POST",
    });
    expect(
      await screen.findByText(
        "Test workspace completed with 0 Live-provider calls. This proves application workflow behavior, not Live-provider activation.",
      ),
    ).toBeInTheDocument();

    const lease = screen.getByLabelText("Lease Test result");
    expect(within(lease).getAllByText("11", { selector: "dd" })).toHaveLength(5);
    const maintenance = screen.getByLabelText("Maintenance Test result");
    expect(within(maintenance).getAllByText("19", { selector: "dd" })).toHaveLength(5);
    expect(screen.getByText("Test adapter operations (2)")).toBeInTheDocument();
    expect(screen.getByText("rentvine.work_order_create")).toBeInTheDocument();
  });

  it("withholds results if the endpoint reports any Live-provider call", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ ...SAFE_RESULT, liveProviderCallCount: 1 }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
      ),
    );
    render(<V1ProductionTestWorkspacePanel />);

    await user.click(screen.getByRole("button", { name: "Run full Test workspace" }));

    expect(
      await screen.findByText(
        "The Test workspace safety boundary could not be verified. Results were withheld.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Production Test workspace results"),
    ).not.toBeInTheDocument();
  });
});
