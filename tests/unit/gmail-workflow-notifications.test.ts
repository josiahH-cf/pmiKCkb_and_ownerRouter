import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  listGmailWorkflowNotifications,
  markGmailWorkflowNotificationRead,
} from "@/lib/gmail-hub/notifications";
import { gmailMailboxKey, MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";

const actor: AuthenticatedUser = {
  uid: "user-1",
  email: "user@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
  scopes: ["maintenance"],
};

describe("Gmail workflow attention (AC-GW-10, AC-GW-12)", () => {
  it("projects a deduplicated value-free notification and supports self-scoped mark-read", async () => {
    const store = new MemoryGmailStateStore();
    await store.saveCommunicationLink({
      id: "communication-1",
      actor_uid: actor.uid,
      mailbox_key: gmailMailboxKey(actor.email),
      lane: "maintenance",
      entity_type: "maintenance_ticket",
      entity_id: "ticket-1",
      purpose: "maintenance_owner",
      origin_action_key: "gmail.mailbox.read",
      source_refs: ["maintenance_ticket:ticket-1"],
      gmail_thread_id: "thread-1",
      last_message_id: "message-secret",
      status: "attention_required",
      attention_at_ms: Date.now(),
      created_at_ms: 1,
      updated_at_ms: 2,
      expires_at_ms: Date.now() + 60_000,
    });

    const notifications = await listGmailWorkflowNotifications(
      actor,
      { unreadOnly: true },
      store,
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      source: "gmail_workflow",
      family: "maintenance_communications",
      title: "Maintenance communication needs review",
      message: "A linked maintenance communication has a new message.",
      href: "/maintenance?ticket_id=ticket-1",
    });
    expect(JSON.stringify(notifications)).not.toContain("thread-1");
    expect(JSON.stringify(notifications)).not.toContain("message-secret");

    await markGmailWorkflowNotificationRead(actor, "communication-1", store);
    await expect(
      listGmailWorkflowNotifications(actor, { unreadOnly: true }, store),
    ).resolves.toEqual([]);
  });
});
