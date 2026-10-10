import {
  FirestoreGmailStateStore,
  GMAIL_STATE_COLLECTIONS,
  gmailMailboxKey,
} from "@/lib/gmail-hub/state-store";
import { GmailHubService } from "@/lib/gmail-hub/service";
import {
  workflowCommunicationHref,
  type WorkflowCommunicationLink,
} from "@/lib/gmail-hub/workflow-context";
import { listGmailWorkflowNotifications } from "@/lib/gmail-hub/notifications";
import {
  communicationsRetentionFields,
  planCommunicationsCleanup,
} from "@/lib/gmail-hub/retention-policy";
import { FirestoreCommunicationsCleanupStore } from "@/lib/gmail-hub/retention-store";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  FirestoreCommunicationSequenceStore,
  sequenceHash,
  COMMUNICATION_SEQUENCE_COLLECTIONS,
} from "@/lib/gmail-hub/sequence-store";
import {
  WorkflowCommunicationSequenceService,
  type CommunicationSequenceDependencies,
} from "@/lib/gmail-hub/sequence-service";
import {
  runCommunicationWorker,
  CommunicationWorkerStore,
} from "@/lib/gmail-hub/sequence-worker";
import {
  plainCommunicationMessage,
  type SequenceDraft,
  type CommunicationSequence,
} from "@/lib/gmail-hub/sequence-model";
import type { GmailMessageView, GmailThreadView } from "@/lib/gmail-runtime/types";
import {
  encodeWorkflowMime,
  type WorkflowMimeMessage,
} from "@/lib/gmail-runtime/workflow-mime";
import { GmailRuntimeError } from "@/lib/gmail-runtime/client";
import type { AuthenticatedUser } from "@/lib/auth/session";
const projectId = "pmi-kc-kb-communication-journey-test";
let app: App, db: Firestore, env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: FIRESTORE_EMULATOR_TARGET,
  });
  app = initializeApp({ projectId }, `journeys-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => {
  await deleteApp(app);
  await env.cleanup();
});
const one: AuthenticatedUser = {
  uid: "staff-one",
  email: "staff-one@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const two: AuthenticatedUser = {
  ...one,
  uid: "staff-two",
  email: "staff-two@pmikcmetro.com",
};
const schedule = {
  firstDate: "2026-10-10",
  time: "09:00",
  timeZone: "America/Chicago",
  everyDays: 1,
  endDate: null,
  sendLimit: 3,
};
function fixture(maintenance = false) {
  let nowMs = Date.parse("2026-10-09T14:00:00Z"),
    loseResponse = false,
    readable = true;
  const context = maintenance
    ? {
        lane: "maintenance" as const,
        entityType: "maintenance_ticket" as const,
        entityId: "synthetic-ticket",
        purpose: "maintenance_owner" as const,
        actionKey: "gmail.maintenance_owner_notice.send",
        sourceRefs: ["maintenance:ticket:synthetic-ticket"],
      }
    : {
        lane: "renewals" as const,
        entityType: "renewal_lease" as const,
        entityId: "115",
        purpose: "renewal_owner" as const,
        actionKey: "gmail.renewal_notice.send",
        sourceRefs: ["rentvine:lease:115"],
      };
  const target = {
    context,
    to: ["owner@example.invalid"],
    cc: [],
    sourceRefs: context.sourceRefs,
    materialSourceHash: "a".repeat(64),
    label: "Synthetic integrated workflow",
  };
  const threads = new Map<string, GmailThreadView>(),
    sent = new Map<
      string,
      {
        mime: string;
        message: WorkflowMimeMessage;
        messageId: string;
        threadId: string;
        sentAtMs: number;
        labelIds: string[];
      }
    >();
  const send = vi.fn(async (message: WorkflowMimeMessage) => {
    const messageId = `message-${sent.size + 1}`,
      threadId = message.threadId ?? "mailbox-local-thread";
    const result = {
      mime: encodeWorkflowMime(message),
      message,
      messageId,
      threadId,
      sentAtMs: nowMs,
      labelIds: ["SENT"],
    };
    sent.set(message.messageId, result);
    const key = `${message.from}:${threadId}`,
      thread = threads.get(key) ?? {
        id: threadId,
        messages: [],
        truncated: false,
        historyId: "100",
      };
    thread.messages.push({
      id: messageId,
      threadId,
      labelIds: ["SENT"],
      internalDate: String(nowMs),
      from: message.from,
      to: message.to,
      cc: message.cc,
      bcc: [],
      subject: message.subject,
      date: new Date(nowMs).toISOString(),
      messageId: message.messageId,
      references: message.references,
      bodyText: message.body,
      bodyTruncated: false,
      attachments: [],
    });
    threads.set(key, thread);
    if (loseResponse) {
      loseResponse = false;
      throw new GmailRuntimeError(
        "Synthetic response loss after dispatch",
        undefined,
        true,
      );
    }
    return result;
  });
  const deps: CommunicationSequenceDependencies = {
    store: new FirestoreCommunicationSequenceStore(db),
    resolveTarget: async () => target,
    resolveAttachment: async () => {
      throw new Error("No selected fixture files");
    },
    readActor: async (uid) => (uid === two.uid ? two : one),
    now: () => nowMs,
    assertRuntimeAction: async () => undefined,
    assertEffectEnvironment: () => undefined,
    createClient: (sender) => ({
      subject: sender,
      getProfile: async () => ({
        emailAddress: sender,
        messagesTotal: 0,
        threadsTotal: 0,
        historyId: "100",
      }),
      getThread: async (id) => {
        if (!readable) throw new Error("Synthetic source outage");
        const t = threads.get(`${sender}:${id}`);
        if (!t) throw new Error("Unlinked thread");
        return structuredClone(t);
      },
      sendWorkflowMessage: send,
      findWorkflowMessage: async (id, expected) => {
        const r = sent.get(id);
        if (!r) return null;
        expect(r.message.from).toBe(sender);
        expect(r.mime).toBe(encodeWorkflowMime(expected));
        return r;
      },
    }),
  };
  let service = new WorkflowCommunicationSequenceService(deps);
  const draft: SequenceDraft = {
    id: randomUUID(),
    context,
    initial: {
      subject: "Exact reviewed message",
      paragraphs: [
        [{ text: "Synthetic address", bold: true }, { text: " — initial message" }],
      ],
      attachmentIds: [],
    },
    followUp: plainCommunicationMessage(
      "Exact reviewed message",
      "The separate approved follow-up",
    ),
  };
  async function authorize(
    actor: AuthenticatedUser,
    s: CommunicationSequence,
    action: "schedule" | "resume" = "schedule",
  ) {
    return service.authorize(actor, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action,
      schedule,
      reviewedDraftHash: sequenceHash({ initial: s.initial, followUp: s.followUp }),
      reviewedTargetHash: sequenceHash({
        to: target.to,
        cc: target.cc,
        materialSourceHash: target.materialSourceHash,
      }),
    });
  }
  async function begin() {
    return authorize(one, await service.save(one, draft, 0, randomUUID()));
  }
  async function run() {
    return runCommunicationWorker({
      service,
      store: new CommunicationWorkerStore(db),
      now: () => nowMs,
    });
  }
  function reply(sender = one.email) {
    const key = `${sender}:mailbox-local-thread`,
      t = threads.get(key)!;
    const m: GmailMessageView = {
      id: `reply-${nowMs}`,
      threadId: t.id,
      labelIds: ["INBOX"],
      internalDate: String(nowMs),
      from: "owner@example.invalid",
      to: [sender],
      cc: [],
      bcc: [],
      subject: draft.initial.subject,
      date: new Date(nowMs).toISOString(),
      messageId: `<reply-${nowMs}@example.invalid>`,
      references: [],
      bodyText: "Human reply to the approved workflow",
      bodyTruncated: false,
      attachments: [],
    };
    t.messages.push(m);
  }
  return {
    draft,
    send,
    begin,
    authorize,
    run,
    reply,
    threads,
    deps,
    get service() {
      return service;
    },
    restart() {
      service = new WorkflowCommunicationSequenceService({
        ...deps,
        store: new FirestoreCommunicationSequenceStore(db),
      });
    },
    at: (value: string) => {
      nowMs = Date.parse(value);
    },
    now: () => nowMs,
    loseNextResponse: () => {
      loseResponse = true;
    },
    sourceOutage: (value: boolean) => {
      readable = !value;
    },
  };
}
describe("S193 integrated durable service/worker journeys with deterministic external Gmail", () => {
  it.each([true, false])(
    "schedules, restarts and confirms the exact initial before reply=%s governs the follow-up",
    async (hasReply) => {
      const f = fixture();
      const s = await f.begin();
      expect(f.send).not.toHaveBeenCalled();
      expect(s.nextDueAtMs).toBe(Date.parse("2026-10-10T14:00:00Z"));
      f.restart();
      f.at("2026-10-10T14:00:00Z");
      expect(await f.run()).toMatchObject({ sent: 1 });
      expect(f.send).toHaveBeenCalledTimes(1);
      expect(f.send.mock.calls[0][0].htmlBody).toContain(
        "<strong>Synthetic address</strong>",
      );
      let state = await f.service.get(one, s.id);
      expect(state).toMatchObject({
        state: "active",
        confirmedCount: 1,
        nextDueAtMs: Date.parse("2026-10-11T14:00:00Z"),
      });
      f.at("2026-10-10T15:00:00Z");
      if (hasReply) f.reply();
      f.restart();
      f.at("2026-10-11T14:00:00Z");
      await f.run();
      state = await f.service.get(one, s.id);
      if (hasReply) {
        expect(state).toMatchObject({
          state: "paused",
          pause: { cause: "reply" },
          confirmedCount: 1,
          nextDueAtMs: null,
        });
        expect(f.send).toHaveBeenCalledTimes(1);
      } else {
        expect(state.confirmedCount).toBe(2);
        expect(f.send).toHaveBeenCalledTimes(2);
        expect(f.send.mock.calls[1][0]).toMatchObject({
          body: "The separate approved follow-up",
          threadId: "mailbox-local-thread",
          inReplyTo: state.threads[0].rfcMessageId,
        });
      }
      expect(
        (await db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences).get()).size,
      ).toBe(hasReply ? 1 : 2);
    },
  );
  it("maintenance pause and team takeover preserve old history and require new sender authority", async () => {
    const f = fixture(true),
      s = await f.begin();
    f.at("2026-10-10T14:00:00Z");
    await f.run();
    let state = await f.service.get(one, s.id);
    state = await f.service.control(two, {
      id: s.id,
      expectedVersion: state.version,
      operationId: randomUUID(),
      action: "pause",
    });
    state = await f.service.control(two, {
      id: s.id,
      expectedVersion: state.version,
      operationId: randomUUID(),
      action: "transfer",
      responsibleUid: two.uid,
    });
    f.restart();
    f.at("2026-10-11T14:00:00Z");
    await f.run();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(state.authorization?.senderEmail).toBe(one.email);
    await expect(f.authorize(one, state, "resume")).rejects.toMatchObject({
      status: 403,
    });
    state = await f.authorize(two, state, "resume");
    await f.run();
    state = await f.service.get(two, s.id);
    expect(state.confirmedCount).toBe(2);
    expect(f.send.mock.calls.map(([m]) => m.from)).toEqual([one.email, two.email]);
    expect(
      await f.service.thread(two, s.id, "mailbox-local-thread", one.email),
    ).toMatchObject({ id: "mailbox-local-thread" });
    await expect(
      f.service.thread(two, s.id, "mailbox-local-thread"),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.service.thread(two, s.id, "private-unlinked-thread", one.email),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.service.get(
        { ...one, hd: "outside.invalid", email: "vendor@outside.invalid" },
        s.id,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("persists an ambiguous occurrence, survives restart and recovers its exact receipt without redispatch", async () => {
    const f = fixture(),
      s = await f.begin();
    f.at("2026-10-10T14:00:00Z");
    f.loseNextResponse();
    await f.run();
    let state = await f.service.get(one, s.id);
    expect(state).toMatchObject({ state: "needs_reconciliation", confirmedCount: 0 });
    expect(state.unresolvedOccurrenceId).toBeTruthy();
    f.restart();
    await f.run();
    expect(f.send).toHaveBeenCalledTimes(1);
    state = await f.service.reconcile(one, s.id);
    expect(state.confirmedCount).toBe(1);
    expect(state.unresolvedOccurrenceId).toBeNull();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(
      (await db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences).get()).size,
    ).toBe(1);
  });
});

it("S193 legacy compatibility dry-run is repeatable across restart: old drafts, sent/ambiguous receipts, private links and legal holds never become a schedule or new authorization", async () => {
  const t = Date.now(),
    legacy = new FirestoreGmailStateStore({ db, dataMode: "test" });
  for (const [n, state] of ["pending", "sent", "ambiguous", "sent"].entries()) {
    const id = `legacy-${n}`,
      held = n === 3,
      at = held ? t - 400 * 86400000 : t;
    const link: WorkflowCommunicationLink = {
      id,
      actor_uid: one.uid,
      mailbox_key: gmailMailboxKey(one.email),
      lane: "renewals",
      entity_type: "renewal_lease",
      entity_id: "115",
      purpose: "renewal_owner",
      origin_action_key: "gmail.renewal_notice.draft_create",
      source_refs: ["rentvine:lease:115"],
      status: n === 0 ? "draft_created" : n === 2 ? "attention_required" : "sent",
      draft_id: `original-draft-${n}`,
      gmail_thread_id: `original-thread-${n}`,
      ...(n === 2 ? { attention_at_ms: at } : {}),
      created_at_ms: at,
      updated_at_ms: at,
      ...communicationsRetentionFields("workflow_link", at),
      ...(held ? { legal_hold: true, expires_at: null, expires_at_ms: null } : {}),
    };
    await legacy.saveCommunicationLink(link);
    await legacy.createConfirmation({
      id,
      actor_uid: one.uid,
      mailbox_email: one.email,
      payload_hash: String(n).repeat(64),
      message_id: `<original-${n}@example.invalid>`,
      message_kind: "new",
      state: state as "pending" | "sent" | "ambiguous",
      usable_until_ms: at + 600000,
      created_at_ms: at,
      updated_at_ms: at,
      workflow_context_key: "original-context",
      workflow_lane: "renewals",
      workflow_entity_type: "renewal_lease",
      workflow_entity_id: "115",
      workflow_purpose: "renewal_owner",
      ...communicationsRetentionFields("confirmation", at),
      ...(held ? { legal_hold: true, expires_at: null, expires_at_ms: null } : {}),
    });
  }
  const collections = [
    GMAIL_STATE_COLLECTIONS.workflowLinks,
    GMAIL_STATE_COLLECTIONS.confirmations,
    GMAIL_STATE_COLLECTIONS.workflowAudit,
    GMAIL_STATE_COLLECTIONS.sendAudit,
  ];
  const snapshot = async () =>
    JSON.stringify(
      await Promise.all(
        collections.map(async (name) => {
          const docs = await db.collection(name).get();
          return docs.docs
            .map((d) => [d.id, d.data()])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
        }),
      ),
    );
  const before = await snapshot(),
    provider = vi.fn(() => {
      throw Error("Read compatibility must not invoke Gmail");
    });
  for (let restart = 0; restart < 2; restart++) {
    const store = new FirestoreGmailStateStore({ db, dataMode: "test" }),
      hub = (who: AuthenticatedUser) =>
        new GmailHubService(who, {
          store,
          createClient: provider,
          assertEffectEnvironment: () => {
            throw Error("No effect authority from compatibility");
          },
          assertRuntimeActionExecutable: async () => {},
          now: () => t,
        });
    const links = await hub(one).listCommunications();
    // Legal hold preserves evidence without reviving its expired normal usability window.
    expect(links).toHaveLength(3);
    expect(await store.listCommunicationLinks(one.email)).toHaveLength(4);
    expect(links.every((l) => !l.sequence_id)).toBe(true);
    expect(links.map((l) => l.draft_id).sort()).toEqual(
      [0, 1, 2].map((n) => `original-draft-${n}`),
    );
    for (const link of links)
      expect(workflowCommunicationHref(link)).toBe(
        "/gmail-hub?workflow=renewal_lease&record=115&purpose=renewal_owner",
      );
    expect(await hub(two).listCommunications()).toEqual([]);
    const notices = await listGmailWorkflowNotifications(one, {}, store);
    expect(notices).toHaveLength(1);
    expect(notices[0].href).toBe(
      workflowCommunicationHref(links.find((l) => l.id === "legacy-2")!),
    );
    expect(await listGmailWorkflowNotifications(two, {}, store)).toEqual([]);
    expect((await store.getConfirmation("legacy-0"))?.state).toBe("pending");
    expect((await store.getConfirmation("legacy-1"))?.state).toBe("sent");
    expect((await store.getConfirmation("legacy-2"))?.state).toBe("ambiguous");
    const candidates = await new FirestoreCommunicationsCleanupStore(db).listCandidates(
        t,
        500,
      ),
      plan = planCommunicationsCleanup(candidates, t, 500);
    expect(plan.candidates.some((c) => c.id === "legacy-3")).toBe(false);
    expect(await snapshot()).toBe(before);
  }
  const worker = fixture();
  await worker.run();
  expect(worker.send).not.toHaveBeenCalled();
  expect(provider).not.toHaveBeenCalled();
  expect(
    (await db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences).get()).size,
  ).toBe(0);
  expect(await snapshot()).toBe(before);
});
