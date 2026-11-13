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
      href: "/gmail-hub?workflow=maintenance_ticket&record=ticket-1&purpose=maintenance_owner",
    });
    expect(JSON.stringify(notifications)).not.toContain("thread-1");
    expect(JSON.stringify(notifications)).not.toContain("message-secret");

    await markGmailWorkflowNotificationRead(actor, "communication-1", store);
    await expect(
      listGmailWorkflowNotifications(actor, { unreadOnly: true }, store),
    ).resolves.toEqual([]);
  });

  it("S275 R-S275-6 names who replied and exactly the lease label, opens the waiting step and stays self-scoped", async () => {
    const store = new MemoryGmailStateStore();
    const nowMs = Date.now();
    const link = (purpose: "renewal_owner" | "renewal_tenant", sequenceId: string) => ({
      id: `communication-${purpose}`,
      actor_uid: actor.uid,
      mailbox_key: gmailMailboxKey(actor.email),
      lane: "renewals" as const,
      entity_type: "renewal_lease" as const,
      entity_id: "101",
      purpose,
      origin_action_key: "gmail.renewal_notice.send",
      source_refs: ["rentvine:lease:101"],
      gmail_thread_id: `thread-${purpose}`,
      last_message_id: `message-secret-${purpose}`,
      status: "attention_required" as const,
      waiting_on: "team" as const,
      attention_at_ms: nowMs,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      sequence_id: sequenceId,
      ...communicationsRetentionFields("workflow_link", nowMs),
    });
    const ownerSequence = "4b1c1f7e-0000-4000-8000-000000000001";
    const tenantSequence = "4b1c1f7e-0000-4000-8000-000000000002";
    await store.saveCommunicationLink(
      link("renewal_owner", ownerSequence) as Parameters<
        typeof store.saveCommunicationLink
      >[0],
    );
    await store.saveCommunicationLink(
      link("renewal_tenant", tenantSequence) as Parameters<
        typeof store.saveCommunicationLink
      >[0],
    );
    const readLabels = async (ids: readonly string[]) =>
      new Map(ids.map((id) => [id, "101 Sample Pl"] as const));
    const notifications = await listGmailWorkflowNotifications(
      actor,
      { unreadOnly: true },
      store,
      readLabels,
    );
    const owner = notifications.find(
      (entry) => entry.id === "communication-renewal_owner",
    );
    const tenant = notifications.find(
      (entry) => entry.id === "communication-renewal_tenant",
    );
    expect(owner).toMatchObject({
      family: "renewal_communications",
      title: "Owner replied",
      message: "101 Sample Pl: read the reply and record the owner's decision.",
      href: "/lease-renewal/live/desk/lease/101?step=ask-owner",
    });
    expect(tenant).toMatchObject({
      title: "Tenant replied",
      message: "101 Sample Pl: read the reply and record the tenant's decision.",
      href: "/lease-renewal/live/desk/lease/101?step=offer-tenant",
    });
    // The content pin allows exactly the lease label: no thread, message, body or address.
    const text = JSON.stringify(notifications);
    expect(text).not.toMatch(/thread-renewal|message-secret|@/);
    // Another staff member, without this workflow link, sees none of it.
    await expect(
      listGmailWorkflowNotifications(
        { ...actor, uid: "user-2", email: "other@pmikcmetro.com" },
        { unreadOnly: true },
        store,
        readLabels,
      ),
    ).resolves.toEqual([]);
    // Deduplication and the self-scoped mark-read are unchanged.
    await markGmailWorkflowNotificationRead(actor, "communication-renewal_owner", store);
    expect(
      (
        await listGmailWorkflowNotifications(
          actor,
          { unreadOnly: true },
          store,
          readLabels,
        )
      ).map((entry) => entry.id),
    ).toEqual(["communication-renewal_tenant"]);
  });

  it("keeps a held active workflow link visible without letting hold extend its policy window", async () => {
    const store = new MemoryGmailStateStore();
    const nowMs = Date.now();
    await store.saveCommunicationLink({
      id: "communication-held",
      actor_uid: actor.uid,
      mailbox_key: gmailMailboxKey(actor.email),
      lane: "maintenance",
      entity_type: "maintenance_ticket",
      entity_id: "ticket-held",
      purpose: "maintenance_owner",
      origin_action_key: "gmail.mailbox.read",
      source_refs: ["maintenance_ticket:ticket-held"],
      gmail_thread_id: "thread-held",
      status: "attention_required",
      attention_at_ms: nowMs,
      created_at_ms: nowMs,
      updated_at_ms: nowMs,
      ...communicationsRetentionFields("workflow_link", nowMs),
      legal_hold: true,
      expires_at: null,
      expires_at_ms: null,
    });

    await expect(
      listGmailWorkflowNotifications(actor, { unreadOnly: true }, store),
    ).resolves.toHaveLength(1);
  });
});
