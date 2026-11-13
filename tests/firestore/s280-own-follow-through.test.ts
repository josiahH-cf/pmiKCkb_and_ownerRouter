// S280 R-S280-1 against the real Firestore emulator: the Dashboard's read of the viewer's own
// renewal follow-through. Stored synthetic communications on five leases: the viewer's owner
// message with a reply, the viewer's held tenant offer, a teammate's owner message with a reply, the
// viewer's older owner message beside a teammate's newer one, and the viewer's cancelled message.
// The read lists exactly the viewer's reply and held items, names each lease and opens its step,
// and writes nothing (AC-S280-6). No provider request; the composition read is injected.
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { readOwnRenewalFollowThrough } from "@/lib/attention/renewal-follow-through-read";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";

const projectId = "demo-pmi-s280-own-follow-through";
const SEQUENCES = "gmail_communication_sequences";
const viewer: AuthenticatedUser = {
  uid: "synthetic-s280-editor",
  email: "synthetic-s280-editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const TEAMMATE = "synthetic-s280-teammate";
/** 11/12/2026, 12:20 PM CST. */
const NOW = Date.parse("2026-11-12T18:20:00.000Z");
const HOUR = 3_600_000;
let app: App, db: Firestore, testEnv: RulesTestEnvironment;

function stored(input: {
  lease: string;
  purpose: "renewal_owner" | "renewal_tenant";
  responsibleUid: string;
  state: string;
  createdAtMs: number;
  confirmedCount?: number;
  sentAtMs?: number;
  replyAtMs?: number;
  pause?: Record<string, unknown> | null;
}) {
  const sent = input.sentAtMs ?? null;
  return {
    schemaVersion: "workflow-communication-sequence/v1",
    workflowLabel: `${input.lease} Sample Pl`,
    version: 2,
    responsibleUid: input.responsibleUid,
    senderEmail: "synthetic-staff@pmikcmetro.com",
    state: input.state,
    createdAtMs: input.createdAtMs,
    updatedAtMs: input.createdAtMs,
    createdByUid: input.responsibleUid,
    context: {
      lane: "renewals",
      entityType: "renewal_lease",
      entityId: input.lease,
      purpose: input.purpose,
      actionKey: "gmail.renewal_notice.send",
      sourceRefs: [`rentvine:lease:${input.lease}`],
    },
    // Stored as the sequence store writes it: Firestore holds no array directly inside an array.
    initial: {
      subject: "Lease renewal",
      paragraphs: [{ runs: [{ text: "Synthetic renewal message." }] }],
      attachmentIds: [],
    },
    followUp: null,
    authorization: {
      revision: 1,
      approvedByUid: input.responsibleUid,
      senderEmail: "synthetic-staff@pmikcmetro.com",
      approvedAtMs: input.createdAtMs,
      payloadHash: "a".repeat(64),
      materialSourceHash: "b".repeat(64),
      deliveryPolicyVersion: "renewal-confirmed-delivery/2026-10-20",
      to: ["synthetic-recipient@example.com"],
      cc: [],
      sourceRefs: [],
      initial: {
        subject: "Lease renewal",
        plainText: "Synthetic renewal message.",
        htmlBody: "<p>Synthetic renewal message.</p>",
        attachments: [],
      },
      followUp: null,
      schedule: null,
    },
    nextDueAtMs: null,
    confirmedCount: input.confirmedCount ?? 0,
    lastSentAtMs: sent,
    pause: input.pause ?? null,
    unresolvedOccurrenceId: null,
    linkedThreads: [],
    threads: sent
      ? [
          {
            senderEmail: "synthetic-staff@pmikcmetro.com",
            threadId: `t-${input.lease}`,
            messageId: `m-${input.lease}`,
            rfcMessageId: `<pmi-${"c".repeat(64)}@pmikcmetro.com>`,
            sentAtMs: sent,
          },
        ]
      : [],
    observedMessageIds: [],
    inbound:
      input.replyAtMs === undefined
        ? []
        : [
            {
              id: `mailbox:reply-${input.lease}`,
              senderEmail: "synthetic-staff@pmikcmetro.com",
              threadId: `t-${input.lease}`,
              messageId: `reply-${input.lease}`,
              kind: "human",
              receivedAtMs: input.replyAtMs,
            },
          ],
    observation: null,
    lastOperation: { id: "op-1", hash: "d".repeat(64) },
  };
}

async function seed() {
  const base = NOW - 48 * HOUR;
  const docs: Record<string, ReturnType<typeof stored>> = {
    "s280-reply-9280": stored({
      lease: "9280",
      purpose: "renewal_owner",
      responsibleUid: viewer.uid,
      state: "completed",
      createdAtMs: base,
      confirmedCount: 1,
      sentAtMs: base + HOUR,
      replyAtMs: NOW - HOUR,
    }),
    "s280-held-9281": stored({
      lease: "9281",
      purpose: "renewal_tenant",
      responsibleUid: viewer.uid,
      state: "paused",
      createdAtMs: base,
      pause: {
        cause: "changed_source",
        byUid: "communication-worker",
        atMs: NOW - 2 * HOUR,
        evidenceIds: [],
      },
    }),
    "s280-teammate-9282": stored({
      lease: "9282",
      purpose: "renewal_owner",
      responsibleUid: TEAMMATE,
      state: "completed",
      createdAtMs: base,
      confirmedCount: 1,
      sentAtMs: base + HOUR,
      replyAtMs: NOW - HOUR,
    }),
    "s280-older-9283": stored({
      lease: "9283",
      purpose: "renewal_owner",
      responsibleUid: viewer.uid,
      state: "completed",
      createdAtMs: base,
      confirmedCount: 1,
      sentAtMs: base + HOUR,
      replyAtMs: NOW - HOUR,
    }),
    "s280-newer-9283": stored({
      lease: "9283",
      purpose: "renewal_owner",
      responsibleUid: TEAMMATE,
      state: "completed",
      createdAtMs: base + 2 * HOUR,
      confirmedCount: 1,
      sentAtMs: base + 3 * HOUR,
      replyAtMs: NOW - HOUR,
    }),
    "s280-cancelled-9284": stored({
      lease: "9284",
      purpose: "renewal_tenant",
      responsibleUid: viewer.uid,
      state: "cancelled",
      createdAtMs: base,
    }),
  };
  for (const [id, data] of Object.entries(docs))
    await db.collection(SEQUENCES).doc(id).set(data);
}

async function snapshotAll() {
  const snapshot = await db.collection(SEQUENCES).get();
  return snapshot.docs
    .map((doc) => [doc.id, JSON.stringify(doc.data())] as const)
    .sort(([left], [right]) => left.localeCompare(right));
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s280-own-follow-through-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(async () => {
  await testEnv.clearFirestore();
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

describe("S280 R-S280-1 on the emulator", () => {
  it("AC-S280-1 / BEH-S280-1: lists exactly the viewer's reply and held items, by lease and step, and nothing for others' messages", async () => {
    await seed();
    const readMessageBasis = vi.fn(async () => {
      throw new Error("not called: no scheduled message");
    });
    const read = await readOwnRenewalFollowThrough(viewer, NOW, {
      db: () => db,
      readMessageBasis,
    });
    expect(read.state).toBe("ok");
    expect(read.rows.map((row) => [row.key, row.label, row.basis, row.href])).toEqual([
      [
        "9280:owner:reply",
        "9280 Sample Pl: record the owner's decision",
        "Because you sent this message.",
        "/lease-renewal/live/desk/lease/9280?step=ask-owner",
      ],
      [
        "9281:tenant:held",
        "9281 Sample Pl: review the held offer",
        "Because you sent this message.",
        "/lease-renewal/live/desk/lease/9281?step=offer-tenant",
      ],
    ]);
    expect(readMessageBasis).not.toHaveBeenCalled();
  });

  it("AC-S280-6: the read writes nothing and carries no reply body or address", async () => {
    await seed();
    const before = await snapshotAll();
    const read = await readOwnRenewalFollowThrough(viewer, NOW, { db: () => db });
    expect(await snapshotAll()).toEqual(before);
    expect(JSON.stringify(read)).not.toMatch(/@|reply-9280|Synthetic renewal message/);
  });

  it("R-S280-1: a viewer with no renewal messages gets an empty, readable list", async () => {
    await seed();
    const read = await readOwnRenewalFollowThrough(
      { ...viewer, uid: "synthetic-s280-nobody" },
      NOW,
      { db: () => db },
    );
    expect(read).toEqual({ state: "ok", rows: [] });
  });
});
