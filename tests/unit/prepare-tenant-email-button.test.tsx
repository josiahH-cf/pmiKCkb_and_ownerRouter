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
  it("posts only the lease id and renders a non-executable preview with no Copy or Send control", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        enabled: false,
        execution_allowed: false,
        status: "preview_only",
        reason: "Sample renewal data is an internal preview only. Do not send.",
        request: {
          to: "",
          subject: "Your lease renewal",
          body: "Draft — Review before sending\n\nHere is your renewal offer.",
          missingInputs: [],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PrepareTenantEmailButton leaseId="lease-318-cedar-7" />);
    // §H/§G: the primary Prepare action is now the prominent large primary button (was secondary).
    const prepare = screen.getByRole("button", { name: "Prepare tenant email" });
    expect(prepare).toHaveClass("primary-button", "button--large");
    await user.click(prepare);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "/api/lease-renewal/tenant-notice-draft",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      leaseId: "lease-318-cedar-7",
    });

    expect(await screen.findByText(/Here is your renewal offer\./)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy draft" })).toBeNull();
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });
});
