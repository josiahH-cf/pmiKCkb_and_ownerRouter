import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { readBusinessProfile } from "@/lib/firestore/presentation-settings";
import type { ReplyWatchEndReason } from "@/lib/gmail-hub/reply-watch";
import {
  COMMUNICATION_SEQUENCE_COLLECTIONS,
  FirestoreCommunicationSequenceStore,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import { WorkflowCommunicationSequenceService } from "@/lib/gmail-hub/sequence-service";
import {
  plainCommunicationMessage,
  type CommunicationSequence,
  type SequenceDraft,
} from "@/lib/gmail-hub/sequence-model";
import {
  CommunicationWorkerStore,
  runCommunicationWorker,
} from "@/lib/gmail-hub/sequence-worker";
import type { GmailThreadView } from "@/lib/gmail-runtime/types";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";

// S275 on the real Firestore emulator: the watched marker is an indexed field the worker pages by
// itself, so a watched message is visited past thousands of terminal records; an ended watch leaves
// the page; a record from before the marker is caught up once; and a manual check reads each
// watched or open message on its own. Synthetic records and fixture mail clients only.

const projectId = "pmi-kc-kb-s275-reply-watch-test";
let env: RulesTestEnvironment, app: App, db: Firestore;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp({ projectId }, `s275-reply-watch-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => {
  await deleteApp(app);
  await env.cleanup();
});

const actor = {
  uid: "managed-staff",
  email: "managed-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
const context = {
  lane: "renewals" as const,
  entityType: "renewal_lease" as const,
  entityId: "101",
  purpose: "renewal_owner" as const,
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: ["rentvine:lease:101"],
};
const REPLY_BODY = "Synthetic owner reply: approved at a base rent of 1875 per month.";

function fixture() {
  const store = new FirestoreCommunicationSequenceStore(db);
  let nowMs = Date.parse("2026-11-12T18:13:00.000Z");
  const target = {
    context,
    to: ["owner@example.invalid"],
    cc: [],
    sourceRefs: context.sourceRefs,
    materialSourceHash: "a".repeat(64),
    label: "101 Sample Pl",
  };
  const threads = new Map<string, GmailThreadView>();
  const failing = new Set<string>();
  const sent = new Map<
    string,
    { messageId: string; threadId: string; labelIds: string[]; sentAtMs: number }
  >();
  let counter = 0;
  const send = vi.fn(async (m: WorkflowMimeMessage) => {
    counter += 1;
    const threadId = `provider-thread-${counter}`;
    threads.set(threadId, {
      id: threadId,
      truncated: false,
      historyId: "100",
      messages: [],
    });
    const result = {
      messageId: `provider-message-${counter}`,
      threadId,
      labelIds: ["SENT"],
      sentAtMs: nowMs,
    };
    sent.set(m.messageId, result);
    return result;
  });
  const getThread = vi.fn(async (id: string): Promise<GmailThreadView> => {
    if (failing.has(id)) throw new Error("Synthetic thread read failure.");
    return structuredClone(threads.get(id) ?? { id, truncated: false, messages: [] });
  });
  const endReason = vi.fn<
    (
      sequence: CommunicationSequence,
      nowMs: number,
    ) => Promise<ReplyWatchEndReason | null>
  >(async () => null);
  const service = new WorkflowCommunicationSequenceService({
    store,
    now: () => nowMs,
    resolveTarget: async () => target,
    resolveAttachment: async () => {
      throw new Error("No fixture attachments");
    },
    readActor: async () => actor,
    readBusinessProfile: (who) => readBusinessProfile(who, who.uid, db),
    assertRuntimeAction: async () => undefined,
    assertEffectEnvironment: () => undefined,
    createClient: (subject) => ({
      subject,
      getProfile: async () => ({
        emailAddress: subject,
        messagesTotal: 0,
        threadsTotal: 0,
        historyId: "100",
      }),
      getThread,
      sendWorkflowMessage: send,
      findWorkflowMessage: async (id) => sent.get(id) ?? null,
    }),
    replyWatchEndReason: endReason,
  });
  async function sendOne(): Promise<CommunicationSequence> {
    const draft: SequenceDraft = {
      id: randomUUID(),
      context,
      initial: plainCommunicationMessage(
        "Renewal for 101 Sample Pl",
        "Synthetic message.",
      ),
      followUp: null,
    };
    const saved = await service.save(actor, draft, 0, randomUUID());
    const authorized = await service.authorize(actor, {
      id: saved.id,
      expectedVersion: saved.version,
      operationId: randomUUID(),
      action: "send",
      schedule: null,
      reviewedDraftHash: sequenceHash({
        initial: saved.initial,
        followUp: saved.followUp,
      }),
      reviewedTargetHash: sequenceHash({
        to: target.to,
        cc: target.cc,
        materialSourceHash: target.materialSourceHash,
      }),
    });
    return (await service.dispatch(authorized.id)).sequence;
  }
  function reply(threadId: string, receivedAtMs: number) {
    threads.get(threadId)!.messages.push({
      id: `reply-${threadId}`,
      threadId,
      labelIds: ["INBOX"],
      internalDate: String(receivedAtMs),
      from: "Owner <owner@example.invalid>",
      to: [actor.email],
      cc: [],
      bcc: [],
      subject: "Re: Renewal for 101 Sample Pl",
      date: "",
      messageId: `<reply-${threadId}@example.invalid>`,
      references: [],
      bodyText: REPLY_BODY,
      bodyTruncated: false,
      attachments: [],
    });
  }
  const workers = new CommunicationWorkerStore(db);
  const runWorker = () =>
    runCommunicationWorker({ service, store: workers, now: () => nowMs });
  return {
    store,
    service,
    send,
    getThread,
    failing,
    endReason,
    sendOne,
    reply,
    runWorker,
    workers,
    now: () => nowMs,
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}
const sequences = () => db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences);

describe("S275 the reply watch on the real Firestore emulator", () => {
  it("ARCH-S275-1 AC-S275-1 a watched message past 4,000 terminal records is observed in one run within the declared bound", async () => {
    const f = fixture();
    const watched = await f.sendOne();
    expect(watched.state).toBe("completed");
    expect((await sequences().doc(watched.id).get()).get("replyWatch")).toBe(true);
    // 4,000 completed and cancelled records whose ids sort before the watched one.
    for (let start = 0; start < 4000; start += 500) {
      const batch = db.batch();
      for (let index = start; index < start + 500; index += 1)
        batch.set(
          sequences().doc(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
          {
            schemaVersion: "workflow-communication-sequence/v1",
            version: 1,
            state: index % 2 ? "completed" : "cancelled",
          },
        );
      await batch.commit();
    }
    // The owner replied a minute after the send.
    f.reply(watched.threads[0]!.threadId, f.now() + 60_000);
    f.advance(5 * 60_000);
    // The marker's own index serves the watched page: the one watched message, nothing else.
    expect((await f.store.listWatched(null, 50)).sequences.map((s) => s.id)).toEqual([
      watched.id,
    ]);
    const run = (await f.runWorker()) as Record<string, unknown>;
    expect(run).toMatchObject({
      status: "processed",
      inspected: 0,
      sent: 0,
      failures: 0,
      watched: 1,
      watchObserved: 1,
    });
    // The open page still reads no terminal record (S233 AC-S233-5 stays green).
    expect(run.inspected).toBe(0);
    expect(f.send).toHaveBeenCalledTimes(1);
    const after = (await f.store.get(watched.id))!;
    expect(after.state).toBe("completed");
    expect(after.inbound).toEqual([expect.objectContaining({ kind: "human" })]);
    // AC-S275-6: metadata only, never the reply body.
    expect(
      JSON.stringify((await sequences().doc(watched.id).get()).data()),
    ).not.toContain(REPLY_BODY);
  });

  it("BEH-S275-4 AC-S275-4 the worker stops visiting after the answer, the closed cycle, the passed lease end and a cancel", async () => {
    const f = fixture();
    for (const reason of [
      "answer_recorded",
      "cycle_closed",
      "lease_end_passed",
    ] as const) {
      const sent = await f.sendOne();
      expect((await f.store.listWatched(null, 50)).sequences.map((s) => s.id)).toContain(
        sent.id,
      );
      f.endReason.mockImplementation(async (s) => (s.id === sent.id ? reason : null));
      f.advance(60_000);
      await f.runWorker();
      const stored = (await sequences().doc(sent.id).get()).data()!;
      expect(stored.replyWatch, reason).toBe(false);
      expect(stored.replyWatchEnded, reason).toMatchObject({ reason });
      expect(stored.state, reason).toBe("completed");
      expect(
        (await f.store.listWatched(null, 50)).sequences.map((s) => s.id),
        reason,
      ).not.toContain(sent.id);
    }
    // A sent message that was cancelled is never watched.
    f.endReason.mockResolvedValue(null);
    const cancelled = await f.sendOne();
    await f.store.write({
      id: cancelled.id,
      actorUid: actor.uid,
      operationId: randomUUID(),
      operationHash: "fixture-cancel",
      expectedVersion: cancelled.version,
      nowMs: f.now(),
      action: "cancel",
      apply: (current) => ({
        ...current!,
        version: current!.version + 1,
        state: "cancelled",
        updatedAtMs: f.now(),
      }),
    });
    expect((await sequences().doc(cancelled.id).get()).get("replyWatch")).toBe(false);
    f.getThread.mockClear();
    f.advance(60_000);
    expect(await f.runWorker()).not.toHaveProperty("watchObserved");
    expect(f.getThread).not.toHaveBeenCalled();
  });

  it("R-S275-7 a message completed before the marker existed is observed once and shows its reply's actual received time", async () => {
    const f = fixture();
    const legacy = await f.sendOne();
    // The record as stored before S275: no marker field at all.
    await sequences().doc(legacy.id).update({ replyWatch: FieldValue.delete() });
    expect((await f.store.listWatched(null, 50)).sequences).toEqual([]);
    const receivedAtMs = f.now() + 90_000;
    f.reply(legacy.threads[0]!.threadId, receivedAtMs);
    f.advance(24 * 60 * 60_000);
    expect(await f.runWorker()).toMatchObject({ caughtUp: 1, watchObserved: 1, sent: 0 });
    const after = (await f.store.get(legacy.id))!;
    expect(after.inbound?.[0]).toMatchObject({ kind: "human", receivedAtMs });
    expect((await sequences().doc(legacy.id).get()).get("replyWatch")).toBe(true);
    // The catch-up reached the end: it never runs again; the message is now on the watched page.
    f.advance(60_000);
    const next = await f.runWorker();
    expect(next).not.toHaveProperty("caughtUp");
    expect(next).toMatchObject({ watched: 1 });
  });

  it("AC-S275-2 a manual check reads each watched message itself: one failing thread read does not fail the other", async () => {
    const f = fixture();
    const first = await f.sendOne();
    const second = await f.sendOne();
    const receivedAtMs = f.now() + 60_000;
    f.reply(first.threads[0]!.threadId, receivedAtMs);
    f.failing.add(second.threads[0]!.threadId);
    f.advance(5 * 60_000);
    // No mailbox history is consulted: the check reads the linked threads directly.
    // Two different pages, including a completed message stored before the watch marker existed.
    await sequences().doc(first.id).update({ replyWatch: FieldValue.delete() });
    expect(await f.service.observeMailbox(actor, { pageSize: 1 })).toEqual({
      observed: 1,
      notChecked: 1,
      ended: 0,
    });
    expect((await f.store.get(first.id))?.inbound?.[0]).toMatchObject({
      kind: "human",
      receivedAtMs,
    });
    expect((await f.store.get(second.id))?.observation).toMatchObject({
      state: "unavailable",
      reason: "read_failed",
    });
  });

  it("finds a later watched message after unrelated mailboxes fill an earlier page", async () => {
    const f = fixture();
    const sent = await f.sendOne();
    const raw = (await sequences().doc(sent.id).get()).data()!;
    await sequences()
      .doc("000-earlier-mailbox")
      .set({
        ...raw,
        id: "000-earlier-mailbox",
        senderEmail: "other-fixture@pmikcmetro.com",
        threads: [{ ...raw.threads[0], senderEmail: "other-fixture@pmikcmetro.com" }],
      });
    const page = await f.store.listReplyCheckable(actor.email, 1);
    expect(page.map(({ id }) => id)).toEqual([sent.id]);
  });
});
