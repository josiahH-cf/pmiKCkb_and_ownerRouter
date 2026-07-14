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
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
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
              },
            ],
          });
        }
        if (url.endsWith("/watch")) {
          return Response.json({ historyId: "12345", expiration: "1784012400000" });
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

    fireEvent.click(
      screen.getByRole("button", { name: "Start or renew targeted reply watch" }),
    );
    expect(
      await screen.findByText(/Targeted reply watch active until/),
    ).toBeInTheDocument();
    expect(calls.some((call) => call.endsWith("/watch"))).toBe(true);
  });
});
