// S273 R-S273-6 / AC-S273-5: when the communication worker holds a renewal message before it was
// sent, the responsible sender gets one in-app notice in the existing renewal communications
// family, naming the lease and opening its step; no message body and no recipient address; only
// with current workflow access. Synthetic values only; no Firestore, provider or mailbox call.
import { describe, expect, it, vi } from "vitest";

const holdStore = vi.hoisted(() => ({
  list: vi.fn(),
  markRead: vi.fn(),
}));
vi.mock("@/lib/firestore/renewal-hold-notices", () => ({
  listRenewalHoldNotifications: holdStore.list,
  markRenewalHoldNotificationRead: holdStore.markRead,
}));

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  listGmailWorkflowNotifications,
  markGmailWorkflowNotificationRead,
} from "@/lib/gmail-hub/notifications";
import {
  plainCommunicationMessage,
  type CommunicationSequence,
} from "@/lib/gmail-hub/sequence-model";
import { MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import {
  RENEWAL_HOLD_NOTICE_TITLE,
  isRenewalHoldNotificationId,
  parseRenewalHoldNotice,
  renewalHoldHref,
  renewalHoldMessage,
  renewalHoldNoticeFor,
  renewalHoldNoticeId,
  renewalHoldNotificationId,
} from "@/lib/lease-renewal/renewal-hold-notice";
import type { UnifiedNotification } from "@/lib/notifications/families";

const actor: AuthenticatedUser = {
  uid: "synthetic-s273-staff",
  email: "synthetic-s273-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const HELD_AT = Date.parse("2026-11-12T18:21:00.000Z");
const BODY = "Rent $1,425.00 from 01/01/2027 through 12/31/2027.";

function heldSequence(
  overrides: Partial<CommunicationSequence> = {},
): CommunicationSequence {
  return {
    schemaVersion: "workflow-communication-sequence/v1",
    id: "4b1c1f7e-0000-4000-8000-000000009273",
    workflowLabel: "101 Sample Pl",
    version: 5,
    context: {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: "9273",
      purpose: "renewal_tenant",
      actionKey: "gmail.renewal_notice.send",
      sourceRefs: ["rentvine:lease:9273"],
    },
    initial: plainCommunicationMessage("Lease renewal", BODY),
    followUp: null,
    responsibleUid: actor.uid,
    senderEmail: actor.email,
    state: "paused",
    createdAtMs: HELD_AT - 3_600_000,
    updatedAtMs: HELD_AT,
    createdByUid: actor.uid,
    authorization: {
      revision: 1,
      approvedByUid: actor.uid,
      senderEmail: actor.email,
      approvedAtMs: HELD_AT - 3_000_000,
      payloadHash: "b".repeat(64),
      materialSourceHash: "a".repeat(64),
      to: ["tenant@example.invalid"],
      cc: [],
      sourceRefs: [],
      initial: {
        subject: "Lease renewal",
        plainText: BODY,
        htmlBody: `<p>${BODY}</p>`,
        attachments: [],
      },
      followUp: null,
      schedule: null,
    },
    nextDueAtMs: null,
    confirmedCount: 0,
    lastSentAtMs: null,
    pause: {
      cause: "changed_source",
      byUid: "communication-worker",
      atMs: HELD_AT,
      evidenceIds: ["rentvine:lease:9273"],
    },
    unresolvedOccurrenceId: null,
    linkedThreads: [],
    threads: [],
    observedMessageIds: [],
    observation: null,
    lastOperation: { id: "operation", hash: "hash" },
    ...overrides,
  } as CommunicationSequence;
}

describe("S273 R-S273-6: one notice for the responsible sender when the worker holds a message", () => {
  it("AC-S273-5: a worker hold of an unsent tenant offer raises one notice naming the lease, opening its step", () => {
    const notice = renewalHoldNoticeFor(heldSequence(), HELD_AT + 1_000)!;
    expect(notice).toMatchObject({
      sequenceId: "4b1c1f7e-0000-4000-8000-000000009273",
      leaseId: "9273",
      audience: "tenant",
      uid: actor.uid,
      cause: "changed_source",
      pausedAtMs: HELD_AT,
      label: "101 Sample Pl",
    });
    expect(renewalHoldMessage(notice)).toBe(
      "The tenant offer for 101 Sample Pl was held because the lease changed.",
    );
    expect(RENEWAL_HOLD_NOTICE_TITLE).toBe("Renewal message held");
    expect(renewalHoldHref(notice)).toMatch(/9273/);
    expect(renewalHoldHref(notice)).toMatch(/offer-tenant/);
    expect(renewalHoldHref({ ...notice, audience: "owner" })).toMatch(/ask-owner/);
  });

  it("AC-S273-5: the notice carries no message body and no recipient address", () => {
    const notice = renewalHoldNoticeFor(heldSequence(), HELD_AT + 1_000)!;
    const text = JSON.stringify({ notice, message: renewalHoldMessage(notice) });
    expect(text).not.toContain(BODY);
    expect(text).not.toMatch(/@/);
    // A stored label that holds an address reads as the lease id instead.
    const withAddress = renewalHoldNoticeFor(
      heldSequence({ workflowLabel: "tenant@example.invalid" }),
      HELD_AT,
    )!;
    expect(withAddress.label).toBe("Lease 9273");
  });

  it("AC-S273-5: deduplicated per sequence and pause", () => {
    const first = renewalHoldNoticeFor(heldSequence(), HELD_AT + 1_000)!;
    const again = renewalHoldNoticeFor(heldSequence(), HELD_AT + 60_000)!;
    expect(renewalHoldNoticeId(first.sequenceId, first.pausedAtMs)).toBe(
      renewalHoldNoticeId(again.sequenceId, again.pausedAtMs),
    );
    const later = renewalHoldNoticeFor(
      heldSequence({
        pause: {
          cause: "changed_source",
          byUid: "communication-worker",
          atMs: HELD_AT + 86_400_000,
          evidenceIds: [],
        },
      }),
      HELD_AT + 86_400_000,
    )!;
    expect(renewalHoldNoticeId(later.sequenceId, later.pausedAtMs)).not.toBe(
      renewalHoldNoticeId(first.sequenceId, first.pausedAtMs),
    );
  });

  it("R-S273-6: a staff pause, a sent message, a reply and a draft raise no notice", () => {
    expect(
      renewalHoldNoticeFor(
        heldSequence({
          pause: { cause: "staff", byUid: actor.uid, atMs: HELD_AT, evidenceIds: [] },
        }),
        HELD_AT,
      ),
    ).toBeNull();
    expect(renewalHoldNoticeFor(heldSequence({ confirmedCount: 1 }), HELD_AT)).toBeNull();
    expect(
      renewalHoldNoticeFor(heldSequence({ state: "active", pause: null }), HELD_AT),
    ).toBeNull();
    expect(
      renewalHoldNoticeFor(
        heldSequence({
          context: {
            ...heldSequence().context,
            actionKey: "gmail.thread.reply",
            replyTo: {
              sequenceId: "4b1c1f7e-0000-4000-8000-000000000001",
              threadId: "thread-1",
              senderEmail: actor.email,
              parentId: "parent-1",
            },
          },
        }),
        HELD_AT,
      ),
    ).toBeNull();
  });

  it("R-S273-6: another cause names its existing label, and the owner message says owner message", () => {
    const notice = renewalHoldNoticeFor(
      heldSequence({
        context: { ...heldSequence().context, purpose: "renewal_owner" },
        pause: {
          cause: "newer_message_sent",
          byUid: "communication-worker",
          atMs: HELD_AT,
          evidenceIds: [],
        },
      }),
      HELD_AT,
    )!;
    expect(renewalHoldMessage(notice)).toBe(
      "The owner message for 101 Sample Pl was held: A newer message for this renewal was sent.",
    );
  });

  it("R-S273-6: a stored record reads back only when it is a whole notice", () => {
    const notice = renewalHoldNoticeFor(heldSequence(), HELD_AT)!;
    expect(parseRenewalHoldNotice({ ...notice, read_at_ms: null })).toEqual(notice);
    expect(parseRenewalHoldNotice({ ...notice, uid: 7 })).toBeNull();
    expect(parseRenewalHoldNotice(null)).toBeNull();
  });
});

describe("S273 AC-S273-5: the notice shows in the renewal communications family", () => {
  const holdNotification: UnifiedNotification = {
    id: renewalHoldNotificationId(renewalHoldNoticeId("seq", HELD_AT)),
    source: "gmail_workflow",
    family: "renewal_communications",
    lane: "decision",
    severity: "medium",
    title: RENEWAL_HOLD_NOTICE_TITLE,
    message: "The tenant offer for 101 Sample Pl was held because the lease changed.",
    href: "/lease-renewal/live/desk/lease/9273?step=offer-tenant",
    created_at: new Date(HELD_AT).toISOString(),
  };

  it("AC-S273-5: the sender's hold notices join the feed beside the communication links", async () => {
    const readHolds = vi.fn(async () => [holdNotification]);
    const listed = await listGmailWorkflowNotifications(
      actor,
      {},
      new MemoryGmailStateStore(),
      undefined,
      readHolds,
    );
    expect(listed).toEqual([holdNotification]);
    expect(readHolds).toHaveBeenCalledWith(actor, {});
  });

  it("AC-S273-5: none for a user without renewals workflow access", async () => {
    const readHolds = vi.fn(async () => [holdNotification]);
    // hasSpaceAccess grants a Space only to a signed-in account identity.
    const listed = await listGmailWorkflowNotifications(
      { ...actor, uid: "" },
      {},
      new MemoryGmailStateStore(),
      undefined,
      readHolds,
    );
    expect(listed).toEqual([]);
    expect(readHolds).not.toHaveBeenCalled();
  });

  it("AC-S273-5: a failed notice read shows the links alone, never an error", async () => {
    const listed = await listGmailWorkflowNotifications(
      actor,
      {},
      new MemoryGmailStateStore(),
      undefined,
      async () => {
        throw new Error("synthetic read failure");
      },
    );
    expect(listed).toEqual([]);
  });

  it("R-S273-6: an injected link store reads no notices unless a reader is passed", async () => {
    holdStore.list.mockClear();
    await listGmailWorkflowNotifications(actor, {}, new MemoryGmailStateStore());
    expect(holdStore.list).not.toHaveBeenCalled();
  });

  it("R-S273-6: marking a hold notice read goes to the sender's own notice, never a link", async () => {
    holdStore.markRead.mockReset();
    holdStore.markRead.mockResolvedValue(undefined);
    expect(isRenewalHoldNotificationId(holdNotification.id)).toBe(true);
    await markGmailWorkflowNotificationRead(
      actor,
      holdNotification.id,
      new MemoryGmailStateStore(),
    );
    expect(holdStore.markRead).toHaveBeenCalledWith(actor, holdNotification.id);
    expect(isRenewalHoldNotificationId("communication-1")).toBe(false);
  });
});
