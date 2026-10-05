// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveGmailWorkspace } from "@/components/gmail-hub/LiveGmailWorkspace";
import { WorkflowCommunicationPanel } from "@/components/gmail-hub/WorkflowCommunicationPanel";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { formatBusinessTimestamp } from "@/lib/date-display";
import type { MaintenanceTicketNotificationRecord } from "@/lib/firestore/maintenance-ticket-notifications";
import {
  COMMUNICATION_STATUS_LABELS,
  communicationStateOf,
  describeCommunicationState,
} from "@/lib/gmail-hub/communication-state";
import { listGmailWorkflowNotifications } from "@/lib/gmail-hub/notifications";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import { gmailMailboxKey, MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import {
  WORKFLOW_COMMUNICATION_STATUSES,
  WORKFLOW_COMMUNICATION_WAITING_ON,
  type WorkflowCommunicationLink,
} from "@/lib/gmail-hub/workflow-context";
import { notificationStateLabel } from "@/lib/notifications/families";
import { buildNotificationFeed } from "@/lib/notifications/feed";
import { projectCommunicationRead } from "@/lib/operational-context/projections";

// S87 (R-S87-10): one communication or maintenance state reads the same on the Communications hub,
// on its linked detail, in notifications and in a Dashboard answer. A degraded item, whose linked
// thread could not be read, says so everywhere and never shows earlier contact state as current.
// Every expectation is on rendered text or returned values; records are synthetic.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CONTACT_MS = Date.parse("2026-10-01T00:30:00.000Z");

function link(
  overrides: Partial<WorkflowCommunicationLink> = {},
): WorkflowCommunicationLink {
  return {
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
    status: "attention_required",
    waiting_on: "owner",
    last_contact_at_ms: CONTACT_MS,
    created_at_ms: 1,
    updated_at_ms: 1,
    ...communicationsRetentionFields("workflow_link", 1),
    ...overrides,
  } as WorkflowCommunicationLink;
}

/** The hub's row for one stored link, as its API route projects it. */
function hubRow(stored: WorkflowCommunicationLink) {
  return {
    id: stored.id,
    lane: stored.lane,
    purpose: stored.purpose,
    status: stored.status,
    href: "/maintenance?ticket_id=ticket-1",
    createdAtMs: stored.created_at_ms,
    ...(stored.waiting_on ? { waitingOn: stored.waiting_on } : {}),
    ...(stored.last_contact_at_ms ? { lastContactAtMs: stored.last_contact_at_ms } : {}),
    ...(stored.contact_observation_state
      ? { contactObservationState: stored.contact_observation_state }
      : {}),
    ...(stored.contact_observation_reason
      ? { contactObservationReason: stored.contact_observation_reason }
      : {}),
  };
}

async function renderHub(stored: readonly WorkflowCommunicationLink[]) {
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
        return Response.json({ communications: stored.map(hubRow) });
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
  render(<LiveGmailWorkspace authenticatedEmail="user@pmikcmetro.com" />);
  await screen.findByRole("heading", { name: "Needs attention" });
  await screen.findAllByRole("link", { name: /communication ·/ });
  return [...document.querySelectorAll<HTMLElement>("[data-communication-state]")];
}

async function renderDetail(stored: readonly WorkflowCommunicationLink[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/gmail-hub/threads?"))
        return Response.json({ communications: stored });
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
  await screen.findAllByRole("button", { name: /^Open maintenance owner ·/ });
  return [...document.querySelectorAll<HTMLElement>("[data-communication-state]")];
}

const RAW_WORDING =
  /attention required|(?<!unsent )draft created|attention_required|draft_created|Waiting on (none|team|owner|resident|vendor|outside)\b|evidence is not yet available/;

describe("S87 one operational state reads the same on every surface", () => {
  it("names every status and waiting-on value once, in plain words", () => {
    expect(COMMUNICATION_STATUS_LABELS).toEqual({
      linked: "linked",
      draft_created: "unsent draft created",
      sent: "reply sent",
      attention_required: "needs review",
    });
    for (const status of WORKFLOW_COMMUNICATION_STATUSES)
      for (const waitingOn of WORKFLOW_COMMUNICATION_WAITING_ON) {
        const view = describeCommunicationState(
          { status, waitingOn, lastContactAtMs: CONTACT_MS },
          formatBusinessTimestamp,
        );
        expect(`${view.status} ${view.evidence}`).not.toMatch(RAW_WORDING);
        expect(view.evidence).toContain("Last contact 09/30/2026, 7:30 PM CDT");
      }
    expect(
      describeCommunicationState({ status: "linked" }, formatBusinessTimestamp).evidence,
    ).toBe("Waiting on not yet observed · Last contact not yet observed");
  });

  it("a degraded communication says the same thing on the hub and on its linked detail", async () => {
    const degraded = link({
      status: "sent",
      contact_observation_state: "needs_verification",
      contact_observation_reason: "thread_unreadable",
    });
    const expected = describeCommunicationState(
      communicationStateOf(degraded),
      formatBusinessTimestamp,
    );
    expect(expected.evidence).toBe(
      "Needs verification: the linked Gmail thread could not be read. Refresh or relink it before relying on contact state.",
    );

    const [hub] = await renderHub([degraded]);
    expect(hub).toHaveAttribute("data-communication-state", "needs_verification");
    expect(hub).toHaveTextContent(`Maintenance communication · ${expected.status}`);
    expect(hub).toHaveTextContent(expected.evidence);
    // A thread that could not be read is listed under attention, never as settled.
    const attention = screen.getByRole("heading", { name: "Needs attention" });
    expect(
      attention.compareDocumentPosition(hub) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Other linked conversations" }),
    ).toBeNull();
    // Earlier contact state is not shown as if it were current.
    expect(hub).not.toHaveTextContent("Waiting on the owner");
    expect(hub).not.toHaveTextContent("Last contact 09/30/2026");
    const hubText = hub.textContent ?? "";
    cleanup();
    vi.unstubAllGlobals();

    const [detail] = await renderDetail([degraded]);
    expect(detail).toHaveAttribute("data-communication-state", "needs_verification");
    expect(
      within(detail).getByRole("button", {
        name: `Open maintenance owner · ${expected.status}`,
      }),
    ).toBeInTheDocument();
    expect(detail).toHaveTextContent(expected.evidence);
    expect(detail).not.toHaveTextContent("Waiting on the owner");
    expect(detail).not.toHaveTextContent("Last contact 09/30/2026");
    expect(hubText).not.toMatch(RAW_WORDING);
    expect(detail.textContent ?? "").not.toMatch(RAW_WORDING);
  });

  it("every status and waiting-on pair reads identically on the hub and the linked detail", async () => {
    const stored = WORKFLOW_COMMUNICATION_STATUSES.flatMap((status, row) =>
      WORKFLOW_COMMUNICATION_WAITING_ON.map((waiting_on, column) =>
        link({ id: `link-${row}-${column}`, status, waiting_on }),
      ),
    );
    stored.push(
      link({
        id: "link-unobserved",
        status: "linked",
        waiting_on: undefined,
        last_contact_at_ms: undefined,
      }),
    );
    // Each pair has its own status and evidence wording, so one row answers for one record.
    const said = (rows: HTMLElement[]) =>
      new Map(
        stored.map((item) => {
          const view = describeCommunicationState(
            communicationStateOf(item),
            formatBusinessTimestamp,
          );
          const matching = rows.filter(
            (row) =>
              (row.textContent ?? "").includes(`· ${view.status}`) &&
              (row.textContent ?? "").includes(view.evidence),
          );
          return [item.id, { found: matching.length === 1 }] as const;
        }),
      );

    const hubRows = await renderHub(stored);
    expect(hubRows).toHaveLength(stored.length);
    const hub = said(hubRows);
    // Only a status that needs a person, here a new message, sits under "Needs attention".
    const otherHeading = screen.getByRole("heading", {
      name: "Other linked conversations",
    });
    for (const row of hubRows) {
      const afterOther = Boolean(
        otherHeading.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
      expect(afterOther, row.textContent ?? "").toBe(
        row.dataset.communicationState !== "attention_required",
      );
    }
    const hubText = hubRows.map((row) => row.textContent ?? "").join("\n");
    cleanup();
    vi.unstubAllGlobals();

    const detailRows = await renderDetail(stored);
    expect(detailRows).toHaveLength(stored.length);
    const detail = said(detailRows);
    for (const item of stored) {
      expect(hub.get(item.id)?.found, `hub ${item.id}`).toBe(true);
      expect(detail.get(item.id)?.found, `detail ${item.id}`).toBe(true);
    }
    expect(hubText).not.toMatch(RAW_WORDING);
    expect(detailRows.map((row) => row.textContent ?? "").join("\n")).not.toMatch(
      RAW_WORDING,
    );
  });

  it("the notification and the Dashboard answer use the same words for the same communication", async () => {
    const actor: AuthenticatedUser = {
      uid: "user-1",
      email: "user@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Editor",
    };
    const nowMs = Date.now();
    const store = new MemoryGmailStateStore();
    const stored = link({
      mailbox_key: gmailMailboxKey(actor.email),
      attention_at_ms: nowMs,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      ...communicationsRetentionFields("workflow_link", nowMs),
    });
    await store.saveCommunicationLink(stored);
    const view = describeCommunicationState(
      communicationStateOf(stored),
      formatBusinessTimestamp,
    );

    const [notification] = await listGmailWorkflowNotifications(actor, {}, store);
    expect(notification.title).toBe(`Maintenance communication ${view.status}`);
    // The badge carries the same words, starting with a capital like the other badges.
    expect(notification.state_label).toBe("Needs review");
    expect(notification.state_label?.toLowerCase()).toBe(view.status);
    expect(notificationStateLabel(notification)).toBe("Needs review");

    const [record] = projectCommunicationRead({
      links: [stored],
      asOf: "2026-10-01T00:30:00.000Z",
    }).records;
    expect(record.detail).toBe(`${view.status} · ${view.evidence}`);
    expect(record.detail).toBe(
      "needs review · Waiting on the owner · Last contact 09/30/2026, 7:30 PM CDT",
    );

    const degraded = projectCommunicationRead({
      links: [link({ contact_observation_state: "needs_verification" })],
      asOf: "2026-10-01T00:30:00.000Z",
    }).records[0];
    expect(degraded.detail).toContain("Needs verification");
    expect(degraded.detail).not.toContain("Waiting on the owner");
  });

  it("a ticket event carries the ticket's own status, so a closed ticket never reads as waiting for a decision", () => {
    const event = (
      id: string,
      kind: MaintenanceTicketNotificationRecord["event"],
      ticket_status: MaintenanceTicketNotificationRecord["ticket_status"],
      created_at: string,
    ): MaintenanceTicketNotificationRecord => ({
      id,
      ticket_id: "ticket-1",
      event: kind,
      recipient_uid: "user-1",
      title:
        kind === "closed" ? "Maintenance ticket closed" : "Maintenance ticket updated",
      message: "A maintenance ticket you are assigned was updated.",
      ticket_status,
      href: "/maintenance?ticket_id=ticket-1",
      created_at,
    });
    const maintenance = [
      event("n-closed", "closed", "Closed", "2026-10-02T15:00:00.000Z"),
      event(
        "n-waiting",
        "status_changed",
        "Waiting on Vendor",
        "2026-10-02T14:00:00.000Z",
      ),
    ];
    const feed = buildNotificationFeed({ approval: [], maintenance });
    expect(feed.notifications.map(notificationStateLabel)).toEqual([
      "Closed",
      "Waiting on Vendor",
    ]);
    expect(feed.notifications.map(notificationStateLabel)).not.toContain(
      "Needs your decision",
    );
    // An event with no record state of its own keeps its attention lane.
    expect(notificationStateLabel({ lane: "decision" })).toBe("Needs your decision");

    // A roll-up of several tickets shows no single ticket's status.
    const digest = buildNotificationFeed({
      approval: [],
      maintenance,
      preferences: { digest_lanes: ["decision"] },
    });
    expect(digest.notifications).toHaveLength(1);
    expect(digest.notifications[0].state_label).toBeUndefined();
    expect(notificationStateLabel(digest.notifications[0])).toBe("Needs your decision");

    // The hub page and the Maintenance queue both print the status in these same words.
    const page = readFileSync(join(process.cwd(), "app/notifications/page.tsx"), "utf8");
    expect(page).toContain("{notificationStateLabel(notification)}");
    expect(page).not.toContain("laneLabel(");
    const queue = readFileSync(
      join(process.cwd(), "components/maintenance/MaintenanceQueue.tsx"),
      "utf8",
    );
    expect(queue).toMatch(
      /data-value=\{STATUS_PILL\[ticket\.status\]\}>\s*\{ticket\.status\}/,
    );
  });

  it("no surface keeps a private copy of the wording", () => {
    for (const owner of [
      "components/gmail-hub/LiveGmailWorkspace.tsx",
      "components/gmail-hub/WorkflowCommunicationPanel.tsx",
      "lib/gmail-hub/notifications.ts",
      "lib/operational-context/projections.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), owner), "utf8");
      expect(source, owner).toContain("@/lib/gmail-hub/communication-state");
      expect(source, owner).not.toMatch(
        /status\.replaceAll\("_", " "\)|needs review`|"unsent draft created"|"reply sent"|Waiting on \$\{/,
      );
    }
  });
});
