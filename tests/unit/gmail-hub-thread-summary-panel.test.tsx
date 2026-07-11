// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThreadSummaryPanel } from "@/components/gmail-hub/ThreadSummaryPanel";

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

describe("ThreadSummaryPanel", () => {
  it("posts pasted text and renders the structured summary with no Send control", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({
        ok: true,
        usedModel: true,
        summary: "Vendor confirmed the invoice.",
        waiting_on: "Owner approval.",
        suggested_next_action: "Forward to the owner.",
        errors: [],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ThreadSummaryPanel />);
    await user.type(screen.getByLabelText("Thread text"), "Vendor: invoice attached.");
    await user.click(screen.getByRole("button", { name: "Summarize thread" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/gmail-hub/thread-summary");
    expect(await screen.findByText("Vendor confirmed the invoice.")).toBeInTheDocument();
    expect(screen.getByText("Owner approval.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });

  it("disables the summarize button until text is pasted", () => {
    render(<ThreadSummaryPanel />);
    expect(screen.getByRole("button", { name: "Summarize thread" })).toBeDisabled();
  });
});
