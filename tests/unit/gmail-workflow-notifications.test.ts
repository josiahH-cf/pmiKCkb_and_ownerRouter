import { describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  listGmailWorkflowNotifications,
  markGmailWorkflowNotificationRead,
} from "@/lib/gmail-hub/notifications";
import { gmailMailboxKey, MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";

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
    const nowMs = Date.now();
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
      attention_at_ms: nowMs,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      ...communicationsRetentionFields("workflow_link", nowMs),
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
