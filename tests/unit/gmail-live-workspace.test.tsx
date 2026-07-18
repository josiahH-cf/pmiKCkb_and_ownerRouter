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
              },
            ],
          });
        }
        if (url.endsWith("/watch")) {
          if (init?.method === "POST") {
            return Response.json({
              outcome: "completed",
              historyId: "12345",
              expiration: "1784012400000",
              readback: { state: "completed" },
            });
          }
          return Response.json({
            mailboxEmail: "josiah@pmikcmetro.com",
            topicName: "projects/pmi-kc-kb-prod/topics/gmail-replies",
            currentWatchExpirationMs: null,
            effect:
              "Start or renew the targeted Gmail push watch for this signed-in mailbox and topic.",
            proposedExpiration:
              "Gmail assigns the new expiration; the exact timestamp is read back after one provider attempt.",
            risk: "Live Gmail watch mutation. It does not send a message or grant cross-mailbox access.",
            reversibility:
              "A later confirmed renewal replaces the expiration; removing the configured watch stops future push delivery.",
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

    fireEvent.click(
      screen.getByRole("button", { name: "Review targeted reply watch renewal" }),
    );
    expect(await screen.findByText("Exact Live watch preview")).toBeInTheDocument();
    expect(
      screen.getByText("projects/pmi-kc-kb-prod/topics/gmail-replies"),
    ).toBeInTheDocument();
    expect(
      calls.filter((call) => call.url.endsWith("/watch") && call.method === "POST"),
    ).toHaveLength(0);
    const execute = screen.getByRole("button", {
      name: "Confirm and execute one watch attempt",
    });
    expect(execute).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /I confirm this exact mailbox, topic, and single Live provider attempt/,
      }),
    );
    fireEvent.click(execute);
    expect(
      await screen.findByText(/Targeted reply watch readback confirmed until/),
    ).toBeInTheDocument();
    const post = calls.find(
      (call) => call.url.endsWith("/watch") && call.method === "POST",
    );
    expect(JSON.parse(post?.body ?? "{}")).toMatchObject({
      mailboxEmail: "josiah@pmikcmetro.com",
      topicName: "projects/pmi-kc-kb-prod/topics/gmail-replies",
      observedWatchExpirationMs: null,
      confirmed: true,
    });
  });
});
