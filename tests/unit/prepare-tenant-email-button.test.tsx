// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PrepareTenantEmailButton } from "@/components/lease-renewal/PrepareTenantEmailButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("PrepareTenantEmailButton (AC-S15-6)", () => {
  it("posts the lease id to the tenant route and renders the draft in a copyable box with no Send control", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        enabled: false,
        status: "needs_gmail_access",
        reason: "Gmail access is not enabled yet.",
        request: {
          to: "tenant@example.com",
          subject: "Your lease renewal",
          body: "Draft — Review before sending\n\nHere is your renewal offer.",
          missingInputs: [],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PrepareTenantEmailButton leaseId="lease-318-cedar-7" />);
    await user.click(screen.getByRole("button", { name: "Prepare tenant email" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/lease-renewal/tenant-notice-draft");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      leaseId: "lease-318-cedar-7",
    });

    expect(await screen.findByText(/Here is your renewal offer\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy draft" })).toBeInTheDocument();
    // The ceiling is a review-before-send draft: there is no send control.
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });
});
