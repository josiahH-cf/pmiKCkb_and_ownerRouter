import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import { linkedRenewalMessageEvidence } from "@/lib/firestore/renewal-outreach-records";
import {
  createGmailHubService,
  setGmailHubDependenciesForTest,
} from "@/lib/gmail-hub/dependencies";
import { RENEWAL_DELIVERY_POLICY_VERSION } from "@/lib/gmail-hub/delivery-policy";
import {
  needsReplyWatchCatchUp,
  replyCheckable,
  replyWatchApplies,
  replyWatchEndReason,
  type ReplyWatchEndReason,
  type ReplyWatchLeaseFacts,
} from "@/lib/gmail-hub/reply-watch";
import {
  COMMUNICATION_SEQUENCE_COLLECTIONS,
  FirestoreCommunicationSequenceStore,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import {
  WorkflowCommunicationSequenceService,
  type SequenceMailClient,
} from "@/lib/gmail-hub/sequence-service";
import {
  plainCommunicationMessage,
  type CommunicationSequence,
  type SequenceDraft,
} from "@/lib/gmail-hub/sequence-model";
import {
  CommunicationWorkerStore,
  runCommunicationWorker,
} from "@/lib/gmail-hub/sequence-worker";
import { gmailMailboxKey, MemoryGmailStateStore } from "@/lib/gmail-hub/state-store";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import { GmailRuntimeClient, GmailRuntimeError } from "@/lib/gmail-runtime/client";
import type { GmailMessageView, GmailThreadView } from "@/lib/gmail-runtime/types";
import {
  REPLY_CHECK_WORDS,
  audienceEvidenceSentence,
  outreachFill,
  projectOutreachEvidence,
  replyCheckLine,
} from "@/lib/lease-renewal/outreach-evidence";
import { projectRenewalStage } from "@/lib/lease-renewal/renewal-stage";
import {
  OWNER_DECISION_AFTER_REPLY_LABEL,
  TENANT_DECISION_AFTER_REPLY_LABEL,
  manualActionLabel,
} from "@/lib/lease-renewal/workspace-state";
import {
  EVIDENCE_CYCLE,
  evidenceInput,
  recordedState,
} from "@/tests/helpers/outreach-evidence-fixtures";
import { FakeFirestore } from "../helpers/fake-firestore";

// S275: an owner or tenant reply reaches the lease through the worker and the visible checks.
// Synthetic fixtures only: every address, id, label and time is invented, and every mailbox is a
// fixture client. No Gmail watch, push or provider write is made anywhere here.

const actor: AuthenticatedUser = {
  uid: "staff-one",
  email: "staff-one@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const LEASE = "101";
const LABEL = "101 Sample Pl";
/** Accepted by Gmail 11/12/2026, 12:13 PM CST; the owner replied at 12:14 PM CST. */
const SENT_AT = Date.parse("2026-11-12T18:13:00.000Z");
const REPLY_AT = Date.parse("2026-11-12T18:14:00.000Z");
const CHECKED_AT = Date.parse("2026-11-12T18:20:00.000Z");
const REPLY_BODY = "Synthetic owner reply: approved at a base rent of 1875 per month.";

const renewalContext = (
  purpose: "renewal_owner" | "renewal_tenant" = "renewal_owner",
) => ({
  lane: "renewals" as const,
  entityType: "renewal_lease" as const,
  entityId: LEASE,
  purpose,
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: [`rentvine:lease:${LEASE}`],
});

/** A stored-shape renewal message after Gmail accepted its one send. */
function record(overrides: Partial<CommunicationSequence> = {}): CommunicationSequence {
  return {
    schemaVersion: "workflow-communication-sequence/v1",
    id: "4b1c1f7e-0000-4000-8000-000000000001",
    workflowLabel: LABEL,
    version: 3,
    context: renewalContext(),
    initial: plainCommunicationMessage("Renewal for 101 Sample Pl", "Synthetic message."),
    followUp: null,
    responsibleUid: actor.uid,
    senderEmail: actor.email,
    state: "completed",
    createdAtMs: SENT_AT - 60_000,
    updatedAtMs: SENT_AT,
    createdByUid: actor.uid,
    authorization: {
      revision: 1,
      approvedByUid: actor.uid,
      senderEmail: actor.email,
      approvedAtMs: SENT_AT - 30_000,
      payloadHash: "b".repeat(64),
      materialSourceHash: "a".repeat(64),
      to: ["owner@example.invalid"],
      cc: [],
      sourceRefs: [],
      initial: {
        subject: "Renewal for 101 Sample Pl",
        plainText: "Synthetic message.",
        htmlBody: "<p>Synthetic message.</p>",
        attachments: [],
      },
      followUp: null,
      schedule: null,
      deliveryPolicyVersion: RENEWAL_DELIVERY_POLICY_VERSION,
    },
    nextDueAtMs: null,
    confirmedCount: 1,
    lastSentAtMs: SENT_AT,
    pause: null,
    unresolvedOccurrenceId: null,
    linkedThreads: [],
    threads: [
      {
        senderEmail: actor.email,
        threadId: "thread-1",
        messageId: "message-1",
        rfcMessageId: `<pmi-${"c".repeat(64)}@pmikcmetro.com>`,
        sentAtMs: SENT_AT,
      },
    ],
    observedMessageIds: [],
    noticeCycleId: EVIDENCE_CYCLE,
    observation: null,
    lastOperation: { id: "operation", hash: "hash" },
    ...overrides,
  } as CommunicationSequence;
}

const humanReply = (receivedAtMs = REPLY_AT) => ({
  id: `${gmailMailboxKey(actor.email)}:reply-1`,
  senderEmail: actor.email,
  threadId: "thread-1",
  messageId: "reply-1",
  kind: "human" as const,
  receivedAtMs,
});

function ownerMessage(threadId: string, overrides: Partial<GmailMessageView> = {}) {
  return {
    id: "reply-1",
    threadId,
    labelIds: ["INBOX"],
    internalDate: String(REPLY_AT),
    from: "Owner <owner@example.invalid>",
    to: [actor.email],
    cc: [],
    bcc: [],
    subject: "Re: Renewal for 101 Sample Pl",
    date: "",
    messageId: "<reply@example.invalid>",
    references: [],
    bodyText: REPLY_BODY,
    bodyTruncated: false,
    attachments: [],
    ...overrides,
  } satisfies GmailMessageView;
}

/** A Firestore-shaped fake store and the real service, with fixture mail clients. */
function setup() {
  const db = new FakeFirestore();
  const store = new FirestoreCommunicationSequenceStore(db as unknown as Firestore);
  let nowMs = SENT_AT;
  const target = {
    context: renewalContext(),
    to: ["owner@example.invalid"],
    cc: [],
    sourceRefs: [`rentvine:lease:${LEASE}`],
    materialSourceHash: "a".repeat(64),
    label: LABEL,
    noticeCycleId: EVIDENCE_CYCLE,
  };
  const threads = new Map<string, GmailThreadView>();
  const sent = new Map<
    string,
    { messageId: string; threadId: string; labelIds: string[]; sentAtMs: number }
  >();
  const failing = new Set<string>();
  let counter = 0;
  const send = vi.fn(
    async (message: import("@/lib/gmail-runtime/workflow-mime").WorkflowMimeMessage) => {
      counter += 1;
      const threadId = `thread-${counter}`;
      threads.set(threadId, {
        id: threadId,
        truncated: false,
        historyId: "100",
        messages: [],
      });
      const result = {
        messageId: `message-${counter}`,
        threadId,
        labelIds: ["SENT"],
        sentAtMs: nowMs,
      };
      sent.set(message.messageId, result);
      return result;
    },
  );
  const getThread = vi.fn(async (id: string): Promise<GmailThreadView> => {
    if (failing.has(id)) throw new Error("Synthetic thread read failure.");
    return structuredClone(threads.get(id) ?? { id, truncated: false, messages: [] });
  });
  const createClient = vi.fn(
    (subject: string): SequenceMailClient => ({
      subject,
      getProfile: async () => ({
        emailAddress: subject,
        messagesTotal: 1,
        threadsTotal: 1,
        historyId: "100",
      }),
      getThread,
      sendWorkflowMessage: send,
      findWorkflowMessage: async (id) => sent.get(id) ?? null,
    }),
  );
  const endReason = vi.fn<
    (
      sequence: CommunicationSequence,
      nowMs: number,
    ) => Promise<ReplyWatchEndReason | null>
  >(async () => null);
  const deps = {
    store,
    resolveTarget: vi.fn(async () => target),
    resolveAttachment: vi.fn(),
    readActor: vi.fn(async () => actor),
    createClient,
    assertRuntimeAction: vi.fn(async () => undefined),
    assertEffectEnvironment: vi.fn(),
    now: () => nowMs,
    readBusinessProfile: vi.fn(async () => null),
    replyWatchEndReason: endReason,
  };
  const service = new WorkflowCommunicationSequenceService(deps);
  /** Save, review and send one owner message the way the composer's Send does. */
  async function sendOne(): Promise<CommunicationSequence> {
    const draft: SequenceDraft = {
      id: randomUUID(),
      context: renewalContext(),
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
      reviewedTargetHash: sequenceHash({
        to: target.to,
        cc: target.cc,
        materialSourceHash: target.materialSourceHash,
      }),
      reviewedDraftHash: sequenceHash({
        initial: saved.initial,
        followUp: saved.followUp,
      }),
    });
    return (await service.dispatch(authorized.id)).sequence;
  }
  const stored = (id: string) =>
    db.store.get(`${COMMUNICATION_SEQUENCE_COLLECTIONS.sequences}/${id}`) as
      | Record<string, unknown>
      | undefined;
  const runWorker = () =>
    runCommunicationWorker({
      service,
      store: new CommunicationWorkerStore(db as unknown as Firestore),
      now: () => nowMs,
    });
  return {
    db,
    store,
    deps,
    service,
    send,
    getThread,
    threads,
    failing,
    endReason,
    sendOne,
    stored,
    runWorker,
    setNow: (value: number) => {
      nowMs = value;
    },
    reply: (threadId: string, overrides: Partial<GmailMessageView> = {}) =>
      threads.get(threadId)!.messages.push(ownerMessage(threadId, overrides)),
  };
}

const facts = (
  overrides: Omit<Partial<ReplyWatchLeaseFacts>, "workspace"> & {
    workspace?: Partial<NonNullable<ReplyWatchLeaseFacts["workspace"]>> | null;
  } = {},
): ReplyWatchLeaseFacts => ({
  todayIso: overrides.todayIso ?? "2026-11-12",
  disposition: overrides.disposition ?? null,
  workspace:
    overrides.workspace === null
      ? null
      : {
          cycleId: EVIDENCE_CYCLE,
          basis: { kind: "lease_end", dateIso: "2026-12-31" },
          ownerResponse: null,
          tenantResponse: null,
          completion: null,
          ...overrides.workspace,
        },
});

afterEach(() => {
  setGmailHubDependenciesForTest(null);
  vi.restoreAllMocks();
});

describe("S275 ARCH-S275-1: the watched marker and its end conditions", () => {
  it("ARCH-S275-1 a completed renewal message with a confirmed send under the current policy is watched", () => {
    expect(replyWatchApplies(record())).toBe(true);
    // A cancelled, unsent, ended or earlier-policy message is never watched.
    expect(replyWatchApplies(record({ state: "cancelled" }))).toBe(false);
    expect(replyWatchApplies(record({ confirmedCount: 0, threads: [] }))).toBe(false);
    expect(
      replyWatchApplies(
        record({ replyWatchEnded: { reason: "answer_recorded", atMs: CHECKED_AT } }),
      ),
    ).toBe(false);
    expect(
      replyWatchApplies(
        record({
          authorization: {
            ...record().authorization!,
            deliveryPolicyVersion: "renewal-confirmed-delivery/2026-01-01",
          },
        }),
      ),
    ).toBe(false);
    // Open messages are observed by the worker's open page; the marker is for completed ones.
    expect(replyWatchApplies(record({ state: "active" }))).toBe(false);
    expect(replyCheckable(record({ state: "paused" }))).toBe(true);
    expect(
      replyCheckable(record({ state: "active", confirmedCount: 0, threads: [] })),
    ).toBe(false);
  });

  it("BEH-S275-4 the watch ends on a recorded answer, a closed cycle, a passed lease end or a cancel", () => {
    const owner = record();
    const tenant = record({ context: renewalContext("renewal_tenant") });
    expect(replyWatchEndReason(owner, facts())).toBeNull();
    // "No answer yet" keeps waiting; an approval or decline is the answer.
    expect(
      replyWatchEndReason(
        owner,
        facts({ workspace: { ownerResponse: { outcome: "no_response" } } }),
      ),
    ).toBeNull();
    expect(
      replyWatchEndReason(
        owner,
        facts({ workspace: { ownerResponse: { outcome: "approved_terms" } } }),
      ),
    ).toBe("answer_recorded");
    // The owner's answer does not end the tenant offer's watch; the tenant's answer does.
    expect(
      replyWatchEndReason(
        tenant,
        facts({ workspace: { ownerResponse: { outcome: "approved_terms" } } }),
      ),
    ).toBeNull();
    expect(
      replyWatchEndReason(
        tenant,
        facts({ workspace: { tenantResponse: { outcome: "awaiting_response" } } }),
      ),
    ).toBeNull();
    expect(
      replyWatchEndReason(
        tenant,
        facts({ workspace: { tenantResponse: { outcome: "needs_verification" } } }),
      ),
    ).toBeNull();
    expect(
      replyWatchEndReason(
        tenant,
        facts({ workspace: { tenantResponse: { outcome: "accepted" } } }),
      ),
    ).toBe("answer_recorded");
    // The cycle closes: completed, retired, a non-renewal, or replaced by a new cycle.
    expect(replyWatchEndReason(owner, facts({ workspace: { completion: {} } }))).toBe(
      "cycle_closed",
    );
    expect(
      replyWatchEndReason(
        owner,
        facts({
          disposition: {
            action: "retire",
            cycle: { cycleId: EVIDENCE_CYCLE, dateIso: "2026-12-31" },
          },
        }),
      ),
    ).toBe("cycle_closed");
    expect(
      replyWatchEndReason(
        owner,
        facts({
          disposition: {
            action: "restore",
            cycle: { cycleId: EVIDENCE_CYCLE, dateIso: "2026-12-31" },
          },
        }),
      ),
    ).toBeNull();
    expect(
      replyWatchEndReason(
        tenant,
        facts({ workspace: { ownerResponse: { outcome: "declined_non_renewal" } } }),
      ),
    ).toBe("cycle_closed");
    expect(
      replyWatchEndReason(
        owner,
        facts({ workspace: { cycleId: "9f4a5162-7384-4e95-8fa6-b0c1d2e3f405" } }),
      ),
    ).toBe("cycle_closed");
    // The lease end date has passed.
    expect(replyWatchEndReason(owner, facts({ todayIso: "2027-01-01" }))).toBe(
      "lease_end_passed",
    );
    expect(replyWatchEndReason(owner, facts({ todayIso: "2026-12-31" }))).toBeNull();
    // A lease-bound record has no end date to pass.
    expect(
      replyWatchEndReason(
        owner,
        facts({ todayIso: "2027-06-01", workspace: { basis: { kind: "lease_bound" } } }),
      ),
    ).toBeNull();
    expect(replyWatchEndReason(record({ state: "cancelled" }), facts())).toBe(
      "cancelled",
    );
  });

  it("ARCH-S275-1 the store derives the marker on every write: a confirmed single send is watched", async () => {
    const f = setup();
    const sent = await f.sendOne();
    expect(sent.state).toBe("completed");
    expect(sent.confirmedCount).toBe(1);
    // The state label and send limits are unchanged; only the indexed marker is added.
    expect(f.stored(sent.id)).toMatchObject({ state: "completed", replyWatch: true });
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});

describe("S275 R-S275-1 / R-S275-7: the worker visits watched messages within its bound", () => {
  it("R-S275-1 the worker observes a watched completed message once per run and never sends from it", async () => {
    const f = setup();
    const sent = await f.sendOne();
    f.reply(sent.threads[0]!.threadId);
    f.setNow(CHECKED_AT);
    vi.spyOn(f.store, "list").mockResolvedValue({ sequences: [], cursor: null });
    const listWatched = vi.spyOn(f.store, "listWatched").mockImplementation(async () => ({
      sequences: [(await f.store.get(sent.id))!],
      cursor: null,
    }));
    vi.spyOn(f.store, "listCatchUp").mockResolvedValue({ sequences: [], cursor: null });
    const run = await f.runWorker();
    expect(run).toMatchObject({
      status: "processed",
      inspected: 0,
      sent: 0,
      failures: 0,
      watched: 1,
      watchObserved: 1,
    });
    expect(listWatched).toHaveBeenCalledWith(null, 20);
    expect(f.send).toHaveBeenCalledTimes(1);
    const after = (await f.store.get(sent.id))!;
    expect(after.state).toBe("completed");
    expect(after.inbound).toEqual([
      expect.objectContaining({
        kind: "human",
        receivedAtMs: REPLY_AT,
        messageId: "reply-1",
      }),
    ]);
    expect(after.observation).toMatchObject({
      state: "current",
      checkedAtMs: CHECKED_AT,
    });
    // AC-S275-6: metadata only; the reply body is never stored.
    expect(JSON.stringify(f.stored(sent.id))).not.toContain(REPLY_BODY);
    expect(f.stored(sent.id)).toMatchObject({ replyWatch: true });
  });

  it("BEH-S275-4 an ended watch is recorded and the message leaves the watched page", async () => {
    const f = setup();
    const sent = await f.sendOne();
    f.setNow(CHECKED_AT);
    f.endReason.mockResolvedValue("answer_recorded");
    vi.spyOn(f.store, "list").mockResolvedValue({ sequences: [], cursor: null });
    vi.spyOn(f.store, "listWatched").mockImplementation(async () => ({
      sequences: [(await f.store.get(sent.id))!],
      cursor: null,
    }));
    vi.spyOn(f.store, "listCatchUp").mockResolvedValue({ sequences: [], cursor: null });
    expect(await f.runWorker()).toMatchObject({ watched: 1, watchEnded: 1 });
    expect(f.getThread).not.toHaveBeenCalled();
    expect(f.stored(sent.id)).toMatchObject({
      state: "completed",
      replyWatch: false,
      replyWatchEnded: { reason: "answer_recorded", atMs: CHECKED_AT },
    });
    // The next run finds nothing to visit for it: the marker is gone.
    expect(replyWatchApplies((await f.store.get(sent.id))!)).toBe(false);
    const again = await f.runWorker();
    expect(again).toMatchObject({ watched: 1 });
    expect(again).not.toHaveProperty("watchObserved");
  });

  it("R-S275-7 a message sent before the marker existed is observed once with its reply's actual received time", async () => {
    const f = setup();
    const sent = await f.sendOne();
    // The record as it was stored before S275: no marker at all.
    const path = `${COMMUNICATION_SEQUENCE_COLLECTIONS.sequences}/${sent.id}`;
    const legacy = { ...f.db.store.get(path)! };
    delete legacy.replyWatch;
    f.db.store.set(path, legacy);
    expect(needsReplyWatchCatchUp((await f.store.get(sent.id))!)).toBe(true);
    // The owner replied before the release; the catch-up records it with its own time.
    f.reply(sent.threads[0]!.threadId);
    f.setNow(CHECKED_AT);
    vi.spyOn(f.store, "list").mockResolvedValue({ sequences: [], cursor: null });
    vi.spyOn(f.store, "listWatched").mockResolvedValue({ sequences: [], cursor: null });
    const catchUp = vi.spyOn(f.store, "listCatchUp").mockImplementation(async () => ({
      sequences: [(await f.store.get(sent.id))!],
      cursor: null,
    }));
    expect(await f.runWorker()).toMatchObject({ caughtUp: 1, watchObserved: 1, sent: 0 });
    const after = (await f.store.get(sent.id))!;
    expect(after.inbound?.[0]).toMatchObject({ kind: "human", receivedAtMs: REPLY_AT });
    expect(f.stored(sent.id)).toMatchObject({ replyWatch: true });
    // The pass reached the end: it never runs again.
    await f.runWorker();
    expect(catchUp).toHaveBeenCalledTimes(1);
  });

  it("R-S275-1 a worker without the lease end conditions pages no watched message (preserved behavior)", async () => {
    const f = setup();
    const sent = await f.sendOne();
    delete (f.deps as Partial<typeof f.deps>).replyWatchEndReason;
    vi.spyOn(f.store, "list").mockResolvedValue({ sequences: [], cursor: null });
    const listWatched = vi.spyOn(f.store, "listWatched");
    expect(await f.runWorker()).toMatchObject({ status: "processed", inspected: 0 });
    expect(listWatched).not.toHaveBeenCalled();
    expect(f.stored(sent.id)).toMatchObject({ replyWatch: true });
  });
});

describe("S275 ARCH-S275-2 / R-S275-2: one refresh factory and a direct, isolated check", () => {
  const mailbox = actor.email;
  class HistoryClient extends GmailRuntimeClient {
    added: { id: string; threadId: string }[] = [];
    failHistory = false;
    constructor() {
      super({
        subject: mailbox,
        transport: {
          async send() {
            throw new Error("unexpected transport call");
          },
        },
        getToken: async () => "unused",
      });
    }
    override async listHistory() {
      if (this.failHistory)
        throw new GmailRuntimeError("history unavailable", 503, false);
      return { historyId: "150", messagesAdded: this.added };
    }
    override async getProfile() {
      return {
        emailAddress: mailbox,
        messagesTotal: 1,
        threadsTotal: 1,
        historyId: "200",
      };
    }
    override async getThread(threadId = "thread-1") {
      return { id: threadId, messages: [], truncated: false };
    }
  }
  async function hubStore() {
    const store = new MemoryGmailStateStore();
    await store.saveMailboxState({
      mailbox_email: mailbox,
      user_uid: actor.uid,
      history_id: "100",
      health: "connected",
      updated_at_ms: 1,
    });
    await store.saveCommunicationLink({
      id: "sequence-link",
      actor_uid: actor.uid,
      mailbox_key: gmailMailboxKey(mailbox),
      lane: "renewals",
      entity_type: "renewal_lease",
      entity_id: LEASE,
      purpose: "renewal_owner",
      origin_action_key: "gmail.renewal_notice.send",
      source_refs: [`rentvine:lease:${LEASE}`],
      gmail_thread_id: "thread-1",
      status: "sent",
      created_at_ms: 1,
      updated_at_ms: 1,
      ...communicationsRetentionFields("workflow_link", Date.now()),
      sequence_id: "sequence-a",
    } as Parameters<typeof store.saveCommunicationLink>[0]);
    return store;
  }
  function hub(store: MemoryGmailStateStore, client: HistoryClient) {
    const observeSequence = vi.fn(async (id: string) => {
      if (id === "sequence-a")
        throw new Error(
          "The linked observation is incomplete; the mailbox cursor remains held.",
        );
    });
    const checkMailboxSequences = vi.fn(async () => ({
      observed: 1,
      notChecked: 1,
      ended: 0,
    }));
    setGmailHubDependenciesForTest({
      createClient: () => client,
      store,
      assertEffectEnvironment: () => undefined,
      assertRuntimeActionExecutable: async () => undefined,
      now: () => CHECKED_AT,
      observeSequence,
      checkMailboxSequences,
    });
    return {
      service: createGmailHubService(actor),
      observeSequence,
      checkMailboxSequences,
    };
  }

  it("ARCH-S275-2 the manual check passes the sequence reply check and one failing message never fails the others", async () => {
    const store = await hubStore();
    const client = new HistoryClient();
    client.added = [{ id: "reply-1", threadId: "thread-1" }];
    const { service, observeSequence, checkMailboxSequences } = hub(store, client);
    const result = await service.refreshMailbox({ attemptKey: randomUUID() });
    expect(result).toMatchObject({
      status: "processed",
      sequences: { observed: 1, notChecked: 1, ended: 0 },
    });
    expect(observeSequence).toHaveBeenCalledWith("sequence-a");
    // The direct pass skips the message the history already read.
    const [, skip] = checkMailboxSequences.mock.calls[0] as unknown as [
      AuthenticatedUser,
      ReadonlySet<string>,
    ];
    expect([...skip]).toEqual(["sequence-a"]);
    expect((await store.getMailboxState(mailbox))?.history_id).toBe("150");
  });

  it("AC-S275-2 the direct pass runs when the history cursor has passed the reply, and when the history read fails", async () => {
    const store = await hubStore();
    const client = new HistoryClient();
    const { service, observeSequence, checkMailboxSequences } = hub(store, client);
    // Nothing new in the history: the cursor already passed the reply.
    await expect(
      service.refreshMailbox({ attemptKey: randomUUID() }),
    ).resolves.toMatchObject({ status: "processed", addedCount: 0 });
    expect(observeSequence).not.toHaveBeenCalled();
    expect(checkMailboxSequences).toHaveBeenCalledTimes(1);
    client.failHistory = true;
    await expect(service.refreshMailbox({ attemptKey: randomUUID() })).rejects.toThrow();
    expect(checkMailboxSequences).toHaveBeenCalledTimes(2);
  });

  it("ARCH-S275-2 the worker's mailbox sync passes the reply check and skips the direct pass", async () => {
    const store = await hubStore();
    const client = new HistoryClient();
    client.added = [{ id: "reply-1", threadId: "thread-1" }];
    const { service, observeSequence, checkMailboxSequences } = hub(store, client);
    const result = await service.refreshMailbox(
      { attemptKey: randomUUID() },
      { directCheck: false },
    );
    expect(result).toMatchObject({ status: "processed" });
    expect(result).not.toHaveProperty("sequences");
    expect(observeSequence).toHaveBeenCalledWith("sequence-a");
    expect(checkMailboxSequences).not.toHaveBeenCalled();
  });

  it("AC-S275-2 one of two thread reads fails: the other is observed and the failing one is not checked", async () => {
    const f = setup();
    const first = await f.sendOne();
    const second = await f.sendOne();
    f.reply(first.threads[0]!.threadId);
    f.failing.add(second.threads[0]!.threadId);
    f.setNow(CHECKED_AT);
    vi.spyOn(f.store, "listReplyCheckable").mockImplementation(async () => [
      (await f.store.get(first.id))!,
      (await f.store.get(second.id))!,
    ]);
    expect(await f.service.observeMailbox(actor)).toEqual({
      observed: 1,
      notChecked: 1,
      ended: 0,
    });
    expect((await f.store.get(first.id))?.inbound?.[0]).toMatchObject({
      kind: "human",
      receivedAtMs: REPLY_AT,
    });
    expect((await f.store.get(second.id))?.observation).toMatchObject({
      state: "unavailable",
      checkedAtMs: CHECKED_AT,
    });
    // Another staff mailbox's messages are not this check's.
    expect(
      await f.service.observeMailbox({
        ...actor,
        uid: "staff-two",
        email: "staff-two@pmikcmetro.com",
      }),
    ).toEqual({ observed: 0, notChecked: 0, ended: 0 });
  });
});

describe("S275 R-S275-3 / R-S275-4: the waiting step's check and the reply leading the step", () => {
  const stageContext = (outreach: ReturnType<typeof evidenceInput>) => ({
    leaseId: LEASE,
    staffRecordUnavailable: false,
    standingAgreement: null,
    housingAssistance: null,
    numbers: { verified: true, openDifferences: 0 },
    term: { monthToMonth: false, reviewNeeded: false },
    moveOutInitiated: false,
    sourceRenewal: null,
    verification: null,
    handStatus: null,
    lastContactAtIso: null,
    threadCheck: null,
    outreach,
    cycleDateIso: "2026-12-31",
  });

  it("ARCH-S275-3 the lease evidence read carries the last check time and state, and no content", () => {
    const evidence = linkedRenewalMessageEvidence(
      record({
        observation: { checkedAtMs: CHECKED_AT, state: "current", historyId: null },
      }),
    )!;
    expect(evidence.check).toEqual({
      checkable: true,
      checkedAtMs: CHECKED_AT,
      state: "current",
    });
    expect(JSON.stringify(evidence)).not.toMatch(/owner@example|Synthetic message/);
  });

  it.each(["source_unavailable", "lease_read_settling"] as const)(
    "keeps the reply check available without calling a %s dispatch observation a Gmail failure",
    (reason) => {
      const sequence = record({
        observation: { checkedAtMs: CHECKED_AT, state: "unavailable", historyId: null, reason },
      });
      const evidence = projectOutreachEvidence(
        evidenceInput([linkedRenewalMessageEvidence(sequence)!]),
        EVIDENCE_CYCLE,
      );
      expect(evidence.owner.replyCheck).toEqual({
        sequenceIds: [sequence.id],
        lastCheckedAtMs: null,
        failedAtMs: null,
      });
    },
  );

  it("R-S275-3 the waiting step says when it last checked, that it has not, or that the check failed", () => {
    expect(replyCheckLine(null)).toBe(REPLY_CHECK_WORDS.notChecked);
    const waiting = projectOutreachEvidence(
      evidenceInput([linkedRenewalMessageEvidence(record())!]),
      EVIDENCE_CYCLE,
    );
    expect(waiting.owner.state).toBe("accepted");
    expect(waiting.owner.replyCheck).toEqual({
      sequenceIds: [record().id],
      lastCheckedAtMs: null,
      failedAtMs: null,
    });
    expect(replyCheckLine(waiting.owner.replyCheck)).toBe("Not checked yet");
    const checked = projectOutreachEvidence(
      evidenceInput([
        linkedRenewalMessageEvidence(
          record({
            observation: { checkedAtMs: CHECKED_AT, state: "current", historyId: null },
          }),
        )!,
      ]),
      EVIDENCE_CYCLE,
    );
    expect(replyCheckLine(checked.owner.replyCheck)).toBe(
      "Last checked for a reply: 11/12/2026, 12:20 PM CST",
    );
    const failed = projectOutreachEvidence(
      evidenceInput([
        linkedRenewalMessageEvidence(
          record({
            observation: {
              checkedAtMs: CHECKED_AT + 60_000,
              state: "unavailable",
              historyId: null,
              reason: "read_failed",
            },
          }),
        )!,
      ]),
      EVIDENCE_CYCLE,
    );
    expect(replyCheckLine(failed.owner.replyCheck)).toBe(
      "Reply check failed at 11/12/2026, 12:21 PM CST. Try again.",
    );
    // The failure keeps the step waiting: nothing about the reply is derived from it.
    expect(failed.owner.state).toBe("accepted");
    // An ended watch is no longer something a check reads.
    const ended = projectOutreachEvidence(
      evidenceInput([
        linkedRenewalMessageEvidence(
          record({ replyWatchEnded: { reason: "answer_recorded", atMs: CHECKED_AT } }),
        )!,
      ]),
      EVIDENCE_CYCLE,
    );
    expect(ended.owner.replyCheck).toBeUndefined();
  });

  it("BEH-S275-1 a completed single owner message with a reply leads the step; on the starting state it waits", () => {
    const state = recordedState(LEASE);
    const before = projectRenewalStage(
      state,
      stageContext(evidenceInput([linkedRenewalMessageEvidence(record())!])),
    );
    expect(before.currentStepId).toBe("ask-owner");
    expect(before.waiting?.party).toBe("the owner");
    const replied = projectRenewalStage(
      state,
      stageContext(
        evidenceInput([
          linkedRenewalMessageEvidence(record({ inbound: [humanReply()] }))!,
        ]),
      ),
    );
    expect(replied.currentStepId).toBe("ask-owner");
    expect(replied.nextStep.label).toBe(OWNER_DECISION_AFTER_REPLY_LABEL);
    expect(replied.evidenceLine).toBe("Owner replied 11/12/2026");
    expect(replied.waiting).toBeNull();
    // R-S275-4: nothing is chosen for staff; the owner's answer is still unrecorded.
    expect(state.ownerResponse).toBeNull();
  });

  it("BEH-S275-5 a reply to a completed tenant offer reads Tenant replied and hands the move to staff", () => {
    const state = recordedState(LEASE);
    const tenant = linkedRenewalMessageEvidence(
      record({ context: renewalContext("renewal_tenant"), inbound: [humanReply()] }),
    )!;
    const evidence = projectOutreachEvidence(evidenceInput([tenant]), EVIDENCE_CYCLE);
    expect(evidence.tenant.state).toBe("replied");
    expect(audienceEvidenceSentence(evidence.tenant)).toBe("Tenant replied 11/12/2026");
    expect(outreachFill(state, evidence).tenantReplyAtMs).toBe(REPLY_AT);
    expect(manualActionLabel("tenant_response", { tenantReplied: true })).toBe(
      TENANT_DECISION_AFTER_REPLY_LABEL,
    );
  });
});
