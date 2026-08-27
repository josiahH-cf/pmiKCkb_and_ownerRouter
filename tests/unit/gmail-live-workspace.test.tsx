// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
            sync: { health: "manual", lastSuccessfulSyncMs: null },
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

    expect(
      await screen.findByText("Connected as josiah@pmikcmetro.com"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: /Maintenance communication/ }),
    ).toHaveAttribute("href", "/maintenance?ticket_id=ticket-1");
    expect(screen.queryByText("Recent inbox threads")).not.toBeInTheDocument();
    expect(screen.queryByText("Compose message")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send this exact message/ })).toBeNull();
    expect(await screen.findByText(/Waiting on team/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Refresh linked Gmail now" }));
    expect(
      await screen.findByText(/Read-only workflow refresh completed at/),
    ).toBeInTheDocument();
    const post = calls.find(
      (call) => call.url.endsWith("/refresh") && call.method === "POST",
    );
    expect(JSON.parse(post?.body ?? "{}").attemptKey).toMatch(/^[a-f0-9-]{36}$/i);
    expect(calls.some((call) => call.url.endsWith("/watch"))).toBe(false);
  });
});
