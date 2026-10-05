// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveGmailWorkspace } from "@/components/gmail-hub/LiveGmailWorkspace";
import { WorkflowCommunicationPanel } from "@/components/gmail-hub/WorkflowCommunicationPanel";

// S87 (AC-S87-10): render one degraded communication on its hub and on its linked detail. The two
// must agree, and neither may show a success or readiness label the other contradicts. This file
// reads only the rendered surfaces, so it also runs against a build without the shared wording.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CONTACT_MS = Date.parse("2026-10-01T00:30:00.000Z");

interface Fixture {
  status: "linked" | "draft_created" | "sent" | "attention_required";
  waitingOn?: "team" | "owner" | "resident" | "vendor" | "outside" | "none";
  degraded?: boolean;
}

async function hubText(fixture: Fixture): Promise<string> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/connection"))
        return Response.json({
          status: "connected",
          mailboxEmail: "user@pmikcmetro.com",
          sync: { health: "manual", lastSuccessfulSyncMs: CONTACT_MS },
        });
      if (url.endsWith("/communications"))
        return Response.json({
          communications: [
            {
              id: "link-1",
              lane: "maintenance",
              purpose: "maintenance_owner",
              status: fixture.status,
              href: "/maintenance?ticket_id=ticket-1",
              createdAtMs: 1,
              ...(fixture.waitingOn ? { waitingOn: fixture.waitingOn } : {}),
              lastContactAtMs: CONTACT_MS,
              ...(fixture.degraded
                ? {
                    contactObservationState: "needs_verification",
                    contactObservationReason: "thread_unreadable",
                  }
                : {}),
            },
          ],
        });
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  render(<LiveGmailWorkspace authenticatedEmail="user@pmikcmetro.com" />);
  const row = (
    await screen.findByRole("link", { name: /Maintenance communication ·/ })
  ).closest("li");
  const text = row?.textContent ?? "";
  cleanup();
  vi.unstubAllGlobals();
  return text;
}

async function detailText(fixture: Fixture): Promise<string> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/gmail-hub/threads?"))
        return Response.json({
          communications: [
            {
              id: "link-1",
              actor_uid: "user-1",
              mailbox_key: "fixture-mailbox-hash",
              lane: "maintenance",
              entity_type: "maintenance_ticket",
              entity_id: "ticket-1",
              purpose: "maintenance_owner",
              origin_action_key: "gmail.mailbox.read",
              source_refs: ["maintenance_ticket:ticket-1"],
              gmail_thread_id: "fixture-thread",
              status: fixture.status,
              ...(fixture.waitingOn ? { waiting_on: fixture.waitingOn } : {}),
              last_contact_at_ms: CONTACT_MS,
              ...(fixture.degraded
                ? {
                    contact_observation_state: "needs_verification",
                    contact_observation_reason: "thread_unreadable",
                  }
                : {}),
              created_at_ms: 1,
              updated_at_ms: 1,
              expires_at_ms: null,
            },
          ],
        });
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  render(
    <WorkflowCommunicationPanel
      canLink={false}
      entityId="ticket-1"
      entityType="maintenance_ticket"
      lane="maintenance"
      purpose="maintenance_owner"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Load linked communication" }));
  const row = (
    await screen.findByRole("button", { name: /^Open maintenance owner ·/ })
  ).closest("li");
  const text = row?.textContent ?? "";
  cleanup();
  vi.unstubAllGlobals();
  return text;
}

describe("S87 a degraded communication reads the same on its hub and its linked detail", () => {
  it("both say the thread needs verification and neither shows earlier contact state as current", async () => {
    const fixture: Fixture = {
      status: "draft_created",
      waitingOn: "owner",
      degraded: true,
    };
    for (const [surface, text] of [
      ["hub", await hubText(fixture)],
      ["detail", await detailText(fixture)],
    ] as const) {
      expect(text, surface).toContain("Needs verification");
      expect(text, surface).toContain("the linked Gmail thread could not be read");
      // The draft is unsent on both surfaces, in the same words.
      expect(text, surface).toContain("· unsent draft created");
      expect(text, surface).not.toMatch(/Waiting on (the )?owner/);
      expect(text, surface).not.toContain("09/30/2026");
    }
  });

  it("a settled communication uses the same status and waiting-on words on both", async () => {
    const fixture: Fixture = { status: "sent", waitingOn: "none" };
    for (const [surface, text] of [
      ["hub", await hubText(fixture)],
      ["detail", await detailText(fixture)],
    ] as const) {
      expect(text, surface).toContain("· reply sent");
      expect(text, surface).toContain("Nothing is waiting");
      expect(text, surface).toContain("Last contact 09/30/2026, 7:30 PM CDT");
      expect(text, surface).not.toMatch(/Waiting on none/);
    }
  });

  it("a new message reads as needs review on both, waiting on the owner in the same words", async () => {
    const fixture: Fixture = { status: "attention_required", waitingOn: "owner" };
    for (const [surface, text] of [
      ["hub", await hubText(fixture)],
      ["detail", await detailText(fixture)],
    ] as const) {
      expect(text, surface).toContain("· needs review");
      expect(text, surface).toContain("Waiting on the owner");
      expect(text, surface).not.toContain("attention required");
    }
  });
});
