// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { RenewalTenantOutcomeControl } from "@/components/lease-renewal/RenewalTenantOutcomeControl";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("RenewalTenantOutcomeControl", () => {
  it("records a verified value-free reference and never offers a send action", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ progress: { stageIndex: 3 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<RenewalTenantOutcomeControl current={null} leaseId="lease-42" />);
    await user.selectOptions(screen.getByLabelText(/Tenant outcome/), "accepted");
    await user.type(
      screen.getByLabelText(/Exact evidence reference/),
      "gmail-thread:t-42:message:m-7",
    );
    await user.click(screen.getByRole("button", { name: "Record tenant outcome" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toEqual({
      action: "tenant_outcome",
      leaseId: "lease-42",
      outcome: "accepted",
      evidence: {
        ref: "gmail-thread:t-42:message:m-7",
        source: "gmail_receipt",
        disposition: "verified",
      },
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /send/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Never paste an email body/)).toBeInTheDocument();
  });

  it("explains every non-terminal and reopening branch", () => {
    render(<RenewalTenantOutcomeControl current={null} leaseId="lease-42" />);
    expect(
      screen.getByText(/Waiting and Needs verification remain incomplete/),
    ).toBeInTheDocument();
    expect(screen.getByText(/counter reopens the owner decision/i)).toBeInTheDocument();
    expect(
      screen.getByText(/decline requires a separate non-renewal handoff/i),
    ).toBeInTheDocument();
  });
});
