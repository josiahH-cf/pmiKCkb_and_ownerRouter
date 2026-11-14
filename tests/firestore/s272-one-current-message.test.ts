// S272 against the real Firestore emulator, with the real sequence store and service, a synthetic
// renewal target whose lease facts the test changes, and an isolated mail client standing in for
// Gmail (its call count is the stand-in mailbox). One lease, cycle and audience holds at most one
// message with unsent authorized work (two confirmations at once give exactly one authorization);
// wording written before a content change is refused on Resume, Send and Schedule and never goes
// out; an older authorization never dispatches after a newer confirmed send, even when workers
// race; a staff pause and Resume with unchanged facts sends once; an authorization with no stored
// content basis is refused without values only when held for changed facts; a reply and two
// unauthorized drafts are unaffected. Synthetic values only; no provider request.
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  COMMUNICATION_SEQUENCE_COLLECTIONS,
  FirestoreCommunicationSequenceStore,
  reviewedCommunicationTargetHash,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import { WorkflowCommunicationSequenceService } from "@/lib/gmail-hub/sequence-service";
import {
  plainCommunicationMessage,
  type CommunicationSequence,
  type VerifiedCommunicationTarget,
} from "@/lib/gmail-hub/sequence-model";
import {
  CommunicationSequenceRefusedError,
  currentMessageGuardKey,
} from "@/lib/gmail-hub/current-message";
import { WORDING_PREDATES_CHANGE_TEXT } from "@/lib/gmail-hub/communication-state";
import { reviewedInput, type ReviewedInput } from "@/lib/gmail-hub/reviewed-inputs";
import { addCalendarDays, localDateAt } from "@/lib/gmail-hub/schedule-calendar";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";

const projectId = "demo-pmi-s272-one-current-message";
type Purpose = "renewal_tenant" | "renewal_owner";
const actor: AuthenticatedUser = {
  uid: "synthetic-s272-staff",
  email: "synthetic-s272-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const LEASE = "9272";
const CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000009272";
/** 11/12/2026, 12:00 PM CST. */
const NOW = Date.parse("2026-11-12T18:00:00.000Z");
const ZONE = "America/Chicago";
let app: App, db: Firestore, testEnv: RulesTestEnvironment;

interface Facts {
  rent: string;
  start: string;
  end: string;
  template: string;
  to: string;
}

function contextFor(purpose: Purpose): WorkflowCommunicationContext {
  return {
    lane: "renewals",
    entityType: "renewal_lease",
    entityId: LEASE,
    purpose,
    actionKey: "gmail.renewal_notice.send",
    sourceRefs: [`rentvine:lease:${LEASE}`],
  };
}

function contentValues(purpose: Purpose, f: Facts): ReviewedInput[] {
  const common = [
    reviewedInput("address", "Property address", "101 Sample Pl"),
    reviewedInput(
      "template",
      "Approved template",
      "Synthetic renewal template",
      f.template,
    ),
  ];
  return purpose === "renewal_tenant"
    ? [
        ...common,
        reviewedInput("renewalRent", "Renewal rent", f.rent),
        reviewedInput("renewalStart", "Renewal start date", f.start),
        reviewedInput("renewalEnd", "Renewal end date", f.end),
      ]
    : [
        ...common,
        reviewedInput("ownerIntent", "Owner question", "Recommend a rent"),
        reviewedInput("rentToRecommend", "Rent to recommend", f.rent),
      ];
}

/** The lease's current read, as a renewal target reports it, for the facts as they stand. */
function targetFor(
  context: WorkflowCommunicationContext,
  f: Facts,
): VerifiedCommunicationTarget {
  const content = contentValues(context.purpose as Purpose, f);
  const base: VerifiedCommunicationTarget = {
    context,
    to: [f.to],
    cc: [],
    sourceRefs: [`rentvine:lease:${LEASE}`],
    label: "101 Sample Pl",
    noticeCycleId: CYCLE,
    materialSourceHash: sequenceHash({ to: f.to, content }),
    reviewedInputs: [
      reviewedInput("to", "To", f.to),
      reviewedInput("cc", "Cc", null),
      ...content,
    ],
    contentBasis: {
      digest: sequenceHash(content),
      legacyDigest: sequenceHash({ legacy: content }),
      values: content,
    },
  };
  return context.replyTo
    ? {
        ...base,
        contentBasis: null,
        reply: {
          senderEmail: actor.email,
          threadId: context.replyTo.threadId,
          parentMessageId: "<synthetic-parent@example.invalid>",
          subject: "Lease renewal",
          references: [],
        },
      }
    : base;
}

const wording = (f: Facts) =>
  plainCommunicationMessage(
    "Lease renewal",
    `Rent ${f.rent} from ${f.start} through ${f.end}.`,
  );

/** One lease's renewal line for an audience, with its own clock, facts and stand-in mailbox. */
function fixture(purpose: Purpose = "renewal_tenant") {
  const clock = { ms: NOW };
  const facts: Facts = {
    rent: "$1,425.00",
    start: "01/01/2027",
    end: "12/31/2027",
    template: "t".repeat(64),
    to: purpose === "renewal_owner" ? "owner@example.invalid" : "tenant@example.invalid",
  };
  const store = new FirestoreCommunicationSequenceStore(db);
  const mailbox = new Map<
    string,
    {
      messageId: string;
      threadId: string;
      labelIds: string[];
      sentAtMs: number;
      body: string;
    }
  >();
  const send = vi.fn(async (message: WorkflowMimeMessage) => {
    const result = {
      messageId: `provider-${mailbox.size + 1}`,
      threadId: "provider-thread",
      labelIds: ["SENT"],
      sentAtMs: clock.ms,
      body: message.body,
    };
    mailbox.set(message.messageId, result);
    return result;
  });
  const service = new WorkflowCommunicationSequenceService({
    store,
    resolveTarget: async (_actor, context) => targetFor(context, facts),
    resolveAttachment: async () => {
      throw new Error("No fixture attachments");
    },
    readActor: async () => actor,
    assertRuntimeAction: async () => undefined,
    assertEffectEnvironment: () => undefined,
    now: () => clock.ms,
    createClient: (subject) => ({
      subject,
      getProfile: async () => ({
        emailAddress: subject,
        messagesTotal: 0,
        threadsTotal: 0,
        historyId: "100",
      }),
      getThread: async (threadId) => ({ id: threadId, messages: [], truncated: false }),
      sendWorkflowMessage: send,
      findWorkflowMessage: async (rfcMessageId) => mailbox.get(rfcMessageId) ?? null,
    }),
  });
  const scheduleFor = (ms: number) => ({
    firstDate: addCalendarDays(localDateAt(ms, ZONE), 1),
    time: "09:00",
    timeZone: ZONE,
    everyDays: null,
    endDate: null,
    sendLimit: 1,
  });
  async function draft(
    context: WorkflowCommunicationContext = contextFor(purpose),
  ): Promise<CommunicationSequence> {
    return service.save(
      actor,
      { id: randomUUID(), context, initial: wording(facts), followUp: null },
      0,
      randomUUID(),
    );
  }
  /** Resume, Send or Schedule against the review shown now (the current read). */
  async function authorize(id: string, action: "send" | "schedule" | "resume") {
    const current = (await store.get(id))!;
    const reviewed = targetFor(current.context, facts);
    return service.authorize(actor, {
      id,
      expectedVersion: current.version,
      operationId: randomUUID(),
      action,
      schedule: action === "schedule" ? scheduleFor(clock.ms) : null,
      reviewedDraftHash: sequenceHash({
        initial: current.initial,
        followUp: current.followUp,
      }),
      reviewedTargetHash: reviewedCommunicationTargetHash(reviewed),
      reviewedInputs: reviewed.reviewedInputs ?? null,
    });
  }
  async function control(id: string, action: "pause" | "cancel") {
    const current = (await store.get(id))!;
    return service.control(actor, {
      id,
      expectedVersion: current.version,
      operationId: randomUUID(),
      action,
    });
  }
  async function saveWording(id: string) {
    const current = (await store.get(id))!;
    return service.save(
      actor,
      { id, context: current.context, initial: wording(facts), followUp: null },
      current.version,
      randomUUID(),
    );
  }
  /** Moves the clock past this message's due time; one worker visit. */
  async function tick(id: string) {
    const current = (await store.get(id))!;
    clock.ms = Math.max(clock.ms, (current.nextDueAtMs ?? clock.ms) + 60_000);
    return service.dispatch(id);
  }
  return {
    clock,
    facts,
    store,
    service,
    send,
    mailbox,
    draft,
    authorize,
    control,
    saveWording,
    tick,
  };
}

/** A newer communication for the same lease, cycle and audience, confirmed sent at `sentAtMs`. */
async function seedNewerSend(purpose: Purpose, sentAtMs: number): Promise<string> {
  const id = randomUUID();
  await db
    .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
    .doc(id)
    .set({
      id,
      schemaVersion: "workflow-communication-sequence/v1",
      version: 3,
      context: contextFor(purpose),
      state: "completed",
      noticeCycleId: CYCLE,
      confirmedCount: 1,
      lastSentAtMs: sentAtMs,
      threads: [
        {
          senderEmail: actor.email,
          threadId: "provider-thread-newer",
          messageId: "provider-newer",
          rfcMessageId: "<pmi-synthetic-newer@pmikcmetro.com>",
          sentAtMs,
        },
      ],
      authorization: { approvedAtMs: sentAtMs - 60_000, schedule: null },
    });
  return id;
}

async function occurrenceCount() {
  return (await db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences).get()).size;
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s272-one-current-message-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(async () => {
  await testEnv.clearFirestore();
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

describe("S272 ARCH-S272-1: the authorization keeps the content basis it was reviewed on", () => {
  it("ARCH-S272-1: the stored authorization carries the content digest, its labelled values and the authorized wording", async () => {
    const f = fixture();
    const saved = await f.draft();
    expect(
      (
        await db
          .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
          .doc(saved.id)
          .get()
      ).get("authorizedContentBasis"),
    ).toBeUndefined();
    const scheduled = await f.authorize(saved.id, "schedule");
    const stored = (await f.store.get(scheduled.id))!;
    expect(stored.authorizedContentBasis).toEqual({
      revision: scheduled.authorization!.revision,
      digest: sequenceHash(contentValues("renewal_tenant", f.facts)),
      values: contentValues("renewal_tenant", f.facts),
      draftHash: sequenceHash({ initial: saved.initial, followUp: saved.followUp }),
    });
    expect(stored.authorization!.payloadHash).toBe(scheduled.authorization!.payloadHash);
  });
});

describe("S272 R-S272-2: wording written before a content change never goes out", () => {
  it("BEH-S272-1 / AC-S272-1: a held tenant offer whose end date changed is refused on Resume, Send and Schedule with both dates, and the mailbox stays empty until it is updated", async () => {
    const f = fixture();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    f.facts.end = "06/30/2027";
    const held = await f.tick(scheduled.id);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause?.cause).toBe("changed_source");
    for (const action of ["resume", "send", "schedule"] as const) {
      const attempt = f.authorize(scheduled.id, action);
      await expect(attempt).rejects.toBeInstanceOf(CommunicationSequenceRefusedError);
      await expect(attempt).rejects.toThrow(
        "Renewal end date: 12/31/2027 in this message, 06/30/2027 on the lease.",
      );
    }
    // Nothing was written, and another worker visit sends nothing.
    expect((await f.store.get(scheduled.id))?.version).toBe(held.sequence.version);
    expect((await f.tick(scheduled.id)).status).not.toBe("sent");
    expect(f.send).not.toHaveBeenCalled();
    expect(await occurrenceCount()).toBe(0);
    // Updated from the lease, the same communication sends the current offer once.
    await f.saveWording(scheduled.id);
    const updated = await f.authorize(scheduled.id, "schedule");
    expect((await f.tick(updated.id)).status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
    expect([...f.mailbox.values()].map((message) => message.body)).toEqual([
      "Rent $1,425.00 from 01/01/2027 through 06/30/2027.",
    ]);
  });

  it("BEH-S272-5: the same refusal holds for an owner message", async () => {
    const f = fixture("renewal_owner");
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    f.facts.rent = "$1,500.00";
    expect((await f.tick(scheduled.id)).status).toBe("paused");
    for (const action of ["resume", "send", "schedule"] as const)
      await expect(f.authorize(scheduled.id, action)).rejects.toMatchObject({
        refusal: {
          reason: "wording_predates_change",
          audience: "owner",
          changes: [
            {
              key: "rentToRecommend",
              previous: "$1,425.00",
              current: "$1,500.00",
            },
          ],
        },
      });
    expect(f.send).not.toHaveBeenCalled();
  });

  it("AC-S272-6: an authorization with no stored content basis is refused without values when held for changed facts", async () => {
    const f = fixture();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    // An older record, authorized before the basis was kept.
    await db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
      .doc(scheduled.id)
      .update({ authorizedContentBasis: FieldValue.delete() });
    f.facts.end = "06/30/2027";
    expect((await f.tick(scheduled.id)).sequence.pause?.cause).toBe("changed_source");
    const attempt = f.authorize(scheduled.id, "resume");
    await expect(attempt).rejects.toMatchObject({
      refusal: { reason: "wording_predates_change", changes: [] },
    });
    await expect(attempt).rejects.toThrow(WORDING_PREDATES_CHANGE_TEXT);
    expect(f.send).not.toHaveBeenCalled();
  });

  it("AC-S272-6 / BEH-S272-4: with no stored basis, a staff pause and Resume with unchanged facts is due at once and sends once", async () => {
    const f = fixture();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    await db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
      .doc(scheduled.id)
      .update({ authorizedContentBasis: FieldValue.delete() });
    await f.control(scheduled.id, "pause");
    const resumed = await f.authorize(scheduled.id, "resume");
    expect(resumed.state).toBe("active");
    expect(resumed.nextDueAtMs).toBe(f.clock.ms);
    expect((await f.service.dispatch(scheduled.id)).status).toBe("sent");
    expect((await f.service.dispatch(scheduled.id)).status).not.toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});

describe("S272 R-S272-3 / ARCH-S272-2: one unsent initial message per lease, cycle and audience", () => {
  it("ARCH-S272-2 / AC-S272-2: two initial offers confirmed at the same time give exactly one authorization", async () => {
    const f = fixture();
    const [a, b] = await Promise.all([f.draft(), f.draft()]);
    const results = await Promise.allSettled([
      f.authorize(a.id, "schedule"),
      f.authorize(b.id, "schedule"),
    ]);
    const authorized = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    expect(authorized).toHaveLength(1);
    const refused = results.find((result) => result.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    expect(refused?.reason).toBeInstanceOf(CommunicationSequenceRefusedError);
    expect(refused?.reason).toMatchObject({
      refusal: {
        reason: "unsent_message_exists",
        relatedSequenceId: authorized[0]!.id,
        relatedState: "scheduled",
      },
    });
    const stored = await Promise.all([f.store.get(a.id), f.store.get(b.id)]);
    expect(stored.filter((s) => s?.authorization)).toHaveLength(1);
    // Both confirmations serialized on the one guard record for this lease and audience.
    const guard = await db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.operations)
      .doc(sequenceHash(currentMessageGuardKey(contextFor("renewal_tenant"))))
      .get();
    expect(guard.get("sequenceId")).toBe(authorized[0]!.id);
    expect(f.send).not.toHaveBeenCalled();
  });

  it.each(["scheduled", "paused", "unconfirmed"] as const)(
    "AC-S272-2 / BEH-S272-2: with the first offer %s, a second initial offer is refused and names it; after the first is cancelled the second confirms",
    async (state) => {
      const f = fixture();
      const first = await f.authorize((await f.draft()).id, "schedule");
      if (state === "paused") await f.control(first.id, "pause");
      let claimed: Awaited<ReturnType<typeof f.store.claim>> = null;
      if (state === "unconfirmed") {
        const current = (await f.store.get(first.id))!;
        claimed = await f.store.claim(first.id, current.nextDueAtMs! + 1, {
          materialSourceHash: current.authorization!.materialSourceHash,
          authorizationRevision: current.authorization!.revision,
          payloadHash: current.authorization!.payloadHash,
          senderEmail: current.authorization!.senderEmail,
          confirmedCount: 0,
        });
        expect(claimed?.occurrence.state).toBe("claimed");
      }
      const second = await f.draft();
      for (const action of ["send", "schedule"] as const)
        await expect(f.authorize(second.id, action)).rejects.toMatchObject({
          refusal: {
            reason: "unsent_message_exists",
            relatedSequenceId: first.id,
            relatedState: state,
          },
        });
      expect((await f.store.get(second.id))?.authorization).toBeNull();
      if (claimed)
        await f.store.settle(claimed.occurrence, {
          nowMs: f.clock.ms,
          outcome: "refused",
          reason: "paused_before_dispatch",
        });
      await f.control(first.id, "cancel");
      const confirmed = await f.authorize(second.id, "schedule");
      expect(confirmed.state).toBe("active");
      expect(f.send).not.toHaveBeenCalled();
    },
  );

  it("AC-S272-6 / R-S272-7: a reply on the lease and two unauthorized drafts are unaffected", async () => {
    const f = fixture();
    const first = await f.authorize((await f.draft()).id, "schedule");
    const drafts = await Promise.all([f.draft(), f.draft()]);
    expect(drafts.map((d) => d.state)).toEqual(["draft", "draft"]);
    const reply = await f.draft({
      ...contextFor("renewal_tenant"),
      actionKey: "gmail.thread.reply",
      replyTo: {
        sequenceId: first.id,
        threadId: "provider-thread",
        senderEmail: actor.email,
        parentId: "provider-parent",
      },
    });
    const authorized = await f.authorize(reply.id, "send");
    expect(authorized.state).toBe("active");
    expect(authorized.authorizedContentBasis).toBeUndefined();
  });
});

describe("S272 R-S272-4: an older authorization never dispatches after a newer send", () => {
  it("BEH-S272-3 / AC-S272-3: racing workers send nothing for the older offer, pause it with the new cause, and Resume, Send and Schedule are refused", async () => {
    const f = fixture();
    const older = await f.authorize((await f.draft()).id, "schedule");
    const newerId = await seedNewerSend("renewal_tenant", NOW + 23 * 60_000);
    f.clock.ms = older.nextDueAtMs! + 60_000;
    await Promise.allSettled(
      Array.from({ length: 4 }, () => f.service.dispatch(older.id)),
    );
    expect(f.send).not.toHaveBeenCalled();
    expect(await occurrenceCount()).toBe(0);
    const paused = (await f.store.get(older.id))!;
    expect(paused).toMatchObject({
      state: "paused",
      nextDueAtMs: null,
      unresolvedOccurrenceId: null,
      pause: { cause: "newer_message_sent", evidenceIds: [`communication:${newerId}`] },
    });
    for (const action of ["resume", "send", "schedule"] as const) {
      const attempt = f.authorize(older.id, action);
      await expect(attempt).rejects.toMatchObject({
        refusal: { reason: "newer_message_sent", relatedSequenceId: newerId },
      });
      await expect(attempt).rejects.toThrow(
        /^A newer message for this renewal was sent on 11\/12\/2026, 12:23\sPM CST\. Cancel this one\.$/,
      );
    }
    // The newer send stands alone in the mailbox; only Cancel remains for the older one.
    expect(f.mailbox.size).toBe(0);
    expect((await f.control(older.id, "cancel")).state).toBe("cancelled");
  });

  it("ARCH-S272-2 / AC-S272-3: the claim transaction itself stops the older offer when the worker's read missed the newer send", async () => {
    const f = fixture();
    const older = await f.authorize((await f.draft()).id, "schedule");
    await seedNewerSend("renewal_tenant", NOW + 23 * 60_000);
    vi.spyOn(f.store, "relatedRenewalSequences").mockResolvedValue([]);
    const result = await f.tick(older.id);
    expect(result.status).toBe("paused");
    expect(result.sequence.pause?.cause).toBe("newer_message_sent");
    expect(f.send).not.toHaveBeenCalled();
    expect(await occurrenceCount()).toBe(0);
  });

  it("BEH-S272-3: a paused older owner message is refused on Resume after a newer owner send", async () => {
    const f = fixture("renewal_owner");
    const older = await f.authorize((await f.draft()).id, "schedule");
    await f.control(older.id, "pause");
    const newerId = await seedNewerSend("renewal_owner", NOW + 23 * 60_000);
    await expect(f.authorize(older.id, "resume")).rejects.toMatchObject({
      refusal: {
        reason: "newer_message_sent",
        audience: "owner",
        relatedSequenceId: newerId,
      },
    });
    expect(f.send).not.toHaveBeenCalled();
  });
});

describe("S272 R-S272-7: a staff pause and Resume with unchanged facts", () => {
  it("BEH-S272-4 / AC-S272-4: Schedule, pause by staff and Resume: the message is due at once and one tick sends it once", async () => {
    const f = fixture();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    await f.control(scheduled.id, "pause");
    const resumed = await f.authorize(scheduled.id, "resume");
    expect(resumed).toMatchObject({ state: "active", nextDueAtMs: f.clock.ms });
    expect((await f.service.dispatch(scheduled.id)).status).toBe("sent");
    expect((await f.service.dispatch(scheduled.id)).status).not.toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(await occurrenceCount()).toBe(1);
  });
});
