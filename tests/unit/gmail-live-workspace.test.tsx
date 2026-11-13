// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveGmailWorkspace } from "@/components/gmail-hub/LiveGmailWorkspace";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LiveGmailWorkspace workflow boundary (AC-GW-1, AC-GW-12)", () => {
  it("shows bodyless workflow attention and no inbox or compose controls", async () => {
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({
          url,
          method: init?.method ?? "GET",
          ...(typeof init?.body === "string" ? { body: init.body } : {}),
        });
        if (url.endsWith("/connection")) {
          return Response.json({
            status: "connected",
            mailboxEmail: "josiah@pmikcmetro.com",
            sync: {
              health: "manual",
              lastSuccessfulSyncMs: Date.parse("2026-10-01T00:30:00.000Z"),
            },
          });
        }
        if (url.endsWith("/communications")) {
          return Response.json({
            communications: [
              {
                id: "communication-1",
                lane: "maintenance",
                purpose: "maintenance_owner",
                status: "attention_required",
                href: "/maintenance?ticket_id=ticket-1",
                createdAtMs: 1,
                waitingOn: "team",
                lastContactAtMs: 1700000000000,
              },
            ],
          });
        }
        if (url.endsWith("/refresh")) {
          return Response.json({
            status: "processed",
            historyId: "12345",
            addedCount: 1,
            matchedCount: 1,
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(<LiveGmailWorkspace authenticatedEmail="josiah@pmikcmetro.com" />);

    expect(await screen.findByText("josiah@pmikcmetro.com")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Maintenance communication/ }),
    ).toHaveAttribute("href", "/maintenance?ticket_id=ticket-1");
    expect(screen.queryByText("Recent inbox threads")).not.toBeInTheDocument();
    expect(screen.queryByText("Compose message")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send this exact message/ })).toBeNull();
    expect(await screen.findByText(/Waiting on the team/)).toBeInTheDocument();
    expect(screen.getByText("Last refresh: 09/30/2026, 7:30 PM CDT")).toBeInTheDocument();
    expect(
      screen.getByText(/Last contact 11\/14\/2023, 4:13 PM CST/),
    ).toBeInTheDocument();

    // S275 R-S275-5: the disclosure keeps the connection details only; the page's one Gmail
    // check ("Check Gmail now", WorkflowCommunicationsHub) runs the read-only refresh, and the
    // list's own button reloads stored data under a name that does not read as a Gmail refresh.
    fireEvent.click(screen.getByText("Gmail connection and refresh"));
    expect(screen.queryByRole("button", { name: "Refresh linked Gmail now" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refresh attention" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload linked conversations" }));
    await waitFor(() =>
      expect(
        calls.filter((call) => call.url.endsWith("/communications")).length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(calls.some((call) => call.url.endsWith("/refresh"))).toBe(false);
    expect(calls.some((call) => call.url.endsWith("/watch"))).toBe(false);
  });
});
