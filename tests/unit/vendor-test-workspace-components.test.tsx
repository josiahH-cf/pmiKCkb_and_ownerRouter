// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VendorPortal } from "@/components/vendor/VendorPortal";
import { VendorTestMailboxPanel } from "@/components/vendor/VendorTestMailboxPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const mailbox = {
  id: "vendor:test-summit-plumbing:ticket:test-maple-leak",
  vendorId: "vendor:test-summit-plumbing",
  ticketId: "ticket:test-maple-leak",
  threadId: "test-thread:ticket:test-maple-leak",
  data_mode: "test" as const,
  liveEvidenceEligible: false as const,
  subject: "Invented leak at Maple 204",
  snippet: "Simulated assigned-ticket thread.",
  label: "PMI/Vendor/Waiting" as const,
  draftBody: "",
  messages: [],
  createdAt: "2026-07-15T12:00:00.000Z",
  updatedAt: "2026-07-15T12:00:00.000Z",
};

describe("Vendor production Test workspace UI", () => {
  it("visibly labels Test tickets and never offers live Gmail connection", () => {
    render(
      <VendorPortal
        email="service@summit-plumbing.example.invalid"
        dataMode="test"
        tickets={[
          {
            id: "ticket:test-maple-leak",
            status: "Waiting on Vendor",
            priority: "Normal",
            summary: "Invented leak at Maple 204",
            unitLabel: "Maple 204 · Test unit",
            updatedAt: "2026-07-15T12:00:00.000Z",
            dataMode: "test",
          },
        ]}
      />,
    );

    expect(screen.getAllByText(/Test workspace/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/external delivery is off/i)).toBeInTheDocument();
    expect(screen.getByText("Invented leak at Maple 204")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /connect same-address Gmail/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the exact Test-only effect before recording a simulated reply", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init) return json({ mailbox });
      const body = JSON.parse(String(init.body)) as { action: string; body?: string };
      if (body.action === "prepare_reply") {
        return json({
          confirmationToken: "one-time-confirmation",
          ticketId: mailbox.ticketId,
          threadId: mailbox.threadId,
          body: body.body,
          messageId: "<test-reply@example.invalid>",
          callout: {
            dataMode: "test",
            action: "Simulate Vendor reply",
            target: `Test ticket ${mailbox.ticketId} · ${mailbox.threadId}`,
            externalEffect: false,
            liveEvidenceEligible: false,
            exactEffect:
              "Append this invented reply to the production Test workspace. No email or external provider is contacted.",
          },
        });
      }
      if (body.action === "confirm_reply") {
        return json({
          status: "simulated",
          duplicate: false,
          mailbox: {
            ...mailbox,
            messages: [
              {
                id: "<test-reply@example.invalid>",
                direction: "vendor_reply",
                body: "I can visit the invented unit tomorrow.",
                createdAt: "2026-07-15T12:01:00.000Z",
              },
            ],
          },
        });
      }
      return json({ mailbox });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<VendorTestMailboxPanel ticketId={mailbox.ticketId} />);
    await screen.findByText("Invented leak at Maple 204");
    await user.type(
      screen.getByRole("textbox", { name: "Invented reply" }),
      "I can visit the invented unit tomorrow.",
    );
    await user.click(screen.getByRole("button", { name: "Review simulated reply" }));

    expect(
      await screen.findByRole("region", { name: "Exact Test reply confirmation" }),
    ).toHaveTextContent("No email or external provider is contacted");
    expect(screen.getByText(/Test write · not live evidence/i)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Confirm exact simulated reply" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("No email left the app"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
