// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConsoleApproveButton } from "@/components/console/ConsoleApproveButton";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ConsoleApproveButton", () => {
  it("PATCHes the existing approval-queue item route with {action:'approve'} and no confirm flag", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      okResponse(),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ConsoleApproveButton itemId="q1" />);

    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    // Hits the EXISTING already-authed approval-queue item route, not a new endpoint.
    expect(String(url)).toBe("/api/approval-queue/q1");
    expect(init?.method).toBe("PATCH");
    // Body is exactly the app-plane approval decision — the toEqual guarantees no extra
    // keys, so the console act-in-place path can never smuggle a confirm_high_risk flag.
    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({ action: "approve" });
    expect(body).not.toHaveProperty("confirm_high_risk");
  });

  it("shows the done state after a successful response", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => okResponse()),
    );

    render(<ConsoleApproveButton itemId="q1" />);

    await user.click(screen.getByRole("button", { name: "Approve" }));

    // On success the button is replaced by the done state; there is no button left to re-click.
    expect(await screen.findByText("Approved.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).toBeNull();
  });

  it("surfaces the server error inline and leaves the button clickable on a failed response", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        errorResponse(403, "High-risk items must be approved from the full surface."),
      ),
    );

    render(<ConsoleApproveButton itemId="q1" />);

    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(
      await screen.findByText("High-risk items must be approved from the full surface."),
    ).toBeInTheDocument();
    // No done state; the operator can retry — the button is back and enabled.
    expect(screen.queryByText("Approved.")).toBeNull();
    const button = screen.getByRole("button", { name: "Approve" });
    expect(button).toBeEnabled();
  });

  it("falls back to a generic message when a failed response carries no error payload", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("not json", {
            status: 500,
            headers: { "Content-Type": "text/plain" },
          }),
      ),
    );

    render(<ConsoleApproveButton itemId="q1" />);

    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText("Could not approve this item.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
  });
});

function okResponse() {
  return new Response(JSON.stringify({}), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
}

function errorResponse(status: number, error: string) {
  return new Response(JSON.stringify({ error }), {
    headers: { "Content-Type": "application/json" },
    status,
  });
}
