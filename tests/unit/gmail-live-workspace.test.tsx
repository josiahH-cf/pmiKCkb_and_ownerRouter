// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveGmailWorkspace } from "@/components/gmail-hub/LiveGmailWorkspace";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("LiveGmailWorkspace exact send UX (AC-S19-7)", () => {
  it("shows connected identity, exact preview, and Gmail delivery identifiers", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({
          url,
          ...(typeof init?.body === "string" ? { body: JSON.parse(init.body) } : {}),
        });
        if (url.endsWith("/connection")) {
          return Response.json({
            status: "connected",
            mailboxEmail: "josiah@pmikcmetro.com",
            sync: { health: "manual", lastSuccessfulSyncMs: null },
          });
        }
        if (url.endsWith("/threads")) {
          return Response.json({ threads: [], resultSizeEstimate: 0 });
        }
        if (url.endsWith("/watch")) {
          return Response.json({
            historyId: "12345",
            expiration: "1784012400000",
          });
        }
        if (url.endsWith("/send-confirmations")) {
          return Response.json({
            confirmationToken: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
            expiresAt: "2026-07-13T19:00:00.000Z",
            payload: {
              from: "josiah@pmikcmetro.com",
              to: ["josiah@pmikcmetro.com"],
              cc: [],
              bcc: [],
              subject: "Self proof",
              body: "Synthetic body",
              messageId: "<unique@pmikcmetro.com>",
              references: [],
            },
          });
        }
        if (url.endsWith("/send")) {
          return Response.json({
            status: "sent",
            duplicate: false,
            result: { messageId: "gmail-message-1", threadId: "gmail-thread-1" },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    render(
      <LiveGmailWorkspace
        authenticatedEmail="josiah@pmikcmetro.com"
        canCompose
        canSend
      />,
    );
    expect(
      await screen.findByText("Connected as josiah@pmikcmetro.com"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start or renew push watch" }));
    expect(await screen.findByText(/Push watch active until/)).toBeInTheDocument();
    expect(calls.some((call) => call.url.endsWith("/watch"))).toBe(true);

    fireEvent.change(screen.getByRole("textbox", { name: "Subject" }), {
      target: { value: "Self proof" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), {
      target: { value: "Synthetic body" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review exact message" }));

    expect(
      await screen.findByRole("heading", { name: "Exact message confirmation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Self proof")).toBeInTheDocument();
    expect(screen.getAllByText("Synthetic body")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Send this exact message" }));

    expect(
      await screen.findByText(
        "Sent once. Gmail message gmail-message-1 is in thread gmail-thread-1.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(calls.find((call) => call.url.endsWith("/send"))?.body).toMatchObject({
        payload: {
          from: "josiah@pmikcmetro.com",
          to: ["josiah@pmikcmetro.com"],
          subject: "Self proof",
          body: "Synthetic body",
        },
      });
    });
  });
});
