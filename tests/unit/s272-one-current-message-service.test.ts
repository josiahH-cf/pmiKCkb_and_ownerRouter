// S272 R-S272-1 to R-S272-4 and R-S272-7 at the sequence service, with the real sequence store on
// a fake Firestore that reads dotted field paths (so the store's lease query sees the lease's other
// communications) and an isolated mail client. The authorization keeps its content basis; held
// wording written before a content change is refused on Resume, Send and Schedule with the changed
// value named; edited or rebuilt wording goes through the existing Update; a second initial offer
// waits for the first to be cancelled; an older authorization is stopped by a newer send at the
// worker and at its claim; a staff pause and Resume with unchanged facts sends once; a reply and two
// unauthorized drafts are unaffected. Synthetic values only; no provider request.
import type { Firestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "../helpers/fake-firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  COMMUNICATION_SEQUENCE_COLLECTIONS,
  FirestoreCommunicationSequenceStore,
  reviewedCommunicationTargetHash,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import {
  WorkflowCommunicationSequenceService,
  type SequenceMailClient,
} from "@/lib/gmail-hub/sequence-service";
import {
  plainCommunicationMessage,
  type VerifiedCommunicationTarget,
} from "@/lib/gmail-hub/sequence-model";
import { reviewedInput, type ReviewedInput } from "@/lib/gmail-hub/reviewed-inputs";
import { CommunicationSequenceRefusedError } from "@/lib/gmail-hub/current-message";
import { addCalendarDays, localDateAt } from "@/lib/gmail-hub/schedule-calendar";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";

type Purpose = "renewal_tenant" | "renewal_owner";
const actor: AuthenticatedUser = {
  uid: "synthetic-s272-staff",
  email: "synthetic-s272-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const LEASE = "2720";
const CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000002720";
/** 11/12/2026, 12:00 PM CST. */
const NOW = Date.parse("2026-11-12T18:00:00.000Z");
const ZONE = "America/Chicago";

interface Facts {
  rent: string;
  start: string;
  end: string;
  charge: string;
  template: string;
  to: string;
  notice: string;
}
const FACTS: Facts = {
  rent: "$1,425.00",
  start: "01/01/2027",
  end: "12/31/2027",
  charge: "$45.00, per month",
  template: "t".repeat(64),
  to: "tenant@example.invalid",
  notice: "none",
};

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
        reviewedInput("charge:pet_rent", "Pet rent", f.charge),
      ]
    : [
        ...common,
        reviewedInput("ownerIntent", "Owner question", "Recommend a rent"),
        reviewedInput("rentToRecommend", "Rent to recommend", f.rent),
      ];
}

/** The lease's current read, as a renewal target reports it (content basis and all). */
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
    materialSourceHash: sequenceHash({ to: f.to, notice: f.notice, content }),
    reviewedInputs: [
      reviewedInput("to", "To", f.to),
      reviewedInput("cc", "Cc", null),
      ...content,
      reviewedInput("notice", "Notice status", null, f.notice),
    ],
    contentBasis: {
      digest: sequenceHash(content),
      legacyDigest: sequenceHash({ legacy: content }),
      values: content,
    },
  };
  // A linked reply states no lease content: it binds its thread and has no content basis.
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

function setup(purpose: Purpose = "renewal_tenant") {
  const db = new FakeFirestore({ fieldPaths: true });
  const store = new FirestoreCommunicationSequenceStore(db as unknown as Firestore);
  let nowMs = NOW;
  const facts: Facts = {
    ...FACTS,
    to: purpose === "renewal_owner" ? "owner@example.invalid" : FACTS.to,
  };
  let sends = 0;
  const send = vi.fn(async () => {
    sends += 1;
    return { messageId: `message-${sends}`, threadId: "thread-1", labelIds: ["SENT"] };
  });
  const client = (subject: string): SequenceMailClient => ({
    subject,
    getProfile: async () => ({
      emailAddress: subject,
      messagesTotal: 1,
      threadsTotal: 1,
      historyId: "100",
    }),
    getThread: async (id) => ({ id, truncated: false, historyId: "100", messages: [] }),
    sendWorkflowMessage: send,
    findWorkflowMessage: async () => ({
      messageId: `message-${sends}`,
      threadId: "thread-1",
      labelIds: ["SENT"],
      sentAtMs: nowMs,
    }),
  });
  const service = new WorkflowCommunicationSequenceService({
    store,
    resolveTarget: vi.fn(
      async (_actor: AuthenticatedUser, context: WorkflowCommunicationContext) =>
        targetFor(context, facts),
    ),
    resolveAttachment: vi.fn(),
    readActor: vi.fn(async () => actor),
    createClient: vi.fn(client),
    assertRuntimeAction: vi.fn(async () => undefined),
    assertEffectEnvironment: vi.fn(),
    now: () => nowMs,
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
    message = wording(facts),
  ) {
    return service.save(
      actor,
      { id: randomUUID(), context, initial: message, followUp: null },
      0,
      randomUUID(),
    );
  }
  /** Resume, Send or Schedule against the review the composer shows now (the current read). */
  async function authorize(id: string, action: "send" | "schedule" | "resume") {
    const current = (await store.get(id))!;
    const reviewed = targetFor(current.context, facts);
    return service.authorize(actor, {
      id,
      expectedVersion: current.version,
      operationId: randomUUID(),
      action,
      schedule: action === "schedule" ? scheduleFor(nowMs) : null,
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
  /** Staff save wording on the communication itself (an edit, or an update from the lease). */
  async function saveWording(id: string, message = wording(facts)) {
    const current = (await store.get(id))!;
    return service.save(
      actor,
      { id, context: current.context, initial: message, followUp: current.followUp },
      current.version,
      randomUUID(),
    );
  }
  /** One worker visit once the message is due. */
  async function tick(id: string) {
    const current = (await store.get(id))!;
    nowMs = Math.max(nowMs, (current.nextDueAtMs ?? nowMs) + 60_000);
    return service.dispatch(id);
  }
  /** A newer communication for the same lease, cycle and audience, confirmed sent at `sentAtMs`. */
  function seedNewerSend(sentAtMs: number) {
    const id = randomUUID();
    db.seed(`${COMMUNICATION_SEQUENCE_COLLECTIONS.sequences}/${id}`, {
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
          threadId: "thread-newer",
          messageId: "message-newer",
          rfcMessageId: "<pmi-newer@pmikcmetro.com>",
          sentAtMs,
        },
      ],
      authorization: { approvedAtMs: sentAtMs - 60_000, schedule: null },
    });
    return id;
  }
  return {
    db,
    store,
    service,
    send,
    facts,
    draft,
    authorize,
    control,
    saveWording,
    tick,
    seedNewerSend,
    now: () => nowMs,
  };
}

describe("S272 ARCH-S272-1: the authorization keeps its reviewed content basis", () => {
  it("ARCH-S272-1 / R-S272-1: a new authorization stores the content digest, its labelled values and the wording it authorized; before it none exists", async () => {
    const f = setup();
    const saved = await f.draft();
    expect(saved.authorizedContentBasis).toBeUndefined();
    const scheduled = await f.authorize(saved.id, "schedule");
    const content = contentValues("renewal_tenant", FACTS);
    expect(scheduled.authorizedContentBasis).toEqual({
      revision: scheduled.authorization!.revision,
      digest: sequenceHash(content),
      values: content,
      draftHash: sequenceHash({ initial: saved.initial, followUp: saved.followUp }),
    });
    // Kept beside the authorization: the payload and its replay binding do not carry it.
    expect(JSON.stringify(scheduled.authorization)).not.toContain(sequenceHash(content));
    expect(scheduled.noticeCycleId).toBe(CYCLE);
  });

  it("R-S272-2: a wording save after an authorization keeps the cycle and the kept basis and records the save", async () => {
    const f = setup();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    const edited = await f.saveWording(
      scheduled.id,
      plainCommunicationMessage("Lease renewal", "Edited reviewed wording."),
    );
    expect(edited).toMatchObject({
      state: "paused",
      pause: { cause: "edited" },
      noticeCycleId: CYCLE,
      wordingSavedAfterRevision: scheduled.authorization!.revision,
      authorizedContentBasis: scheduled.authorizedContentBasis,
    });
  });
});

describe("S272 R-S272-2: held wording written before a content change is refused", () => {
  it.each([
    ["rent", "renewalRent", "Renewal rent", "$1,425.00", "$1,450.00"],
    ["start", "renewalStart", "Renewal start date", "01/01/2027", "02/01/2027"],
    ["end", "renewalEnd", "Renewal end date", "12/31/2027", "06/30/2027"],
    ["charge", "charge:pet_rent", "Pet rent", "$45.00, per month", "$50.00, per month"],
  ] as const)(
    "AC-S272-1 / BEH-S272-1: a changed tenant %s refuses Resume, Send and Schedule of the held offer, names both values and sends nothing",
    async (field, key, label, before, after) => {
      const f = setup();
      const scheduled = await f.authorize((await f.draft()).id, "schedule");
      f.facts[field] = after;
      const held = await f.tick(scheduled.id);
      expect(held.status).toBe("paused");
      expect(held.sequence.pause?.cause).toBe("changed_source");
      for (const action of ["resume", "send", "schedule"] as const) {
        const attempt = f.authorize(scheduled.id, action);
        await expect(attempt).rejects.toBeInstanceOf(CommunicationSequenceRefusedError);
        await expect(attempt).rejects.toMatchObject({
          status: 409,
          refusal: {
            reason: "wording_predates_change",
            audience: "tenant",
            changes: [{ key, label, previous: before, current: after }],
          },
        });
        await expect(attempt).rejects.toThrow(
          `This message was written before the lease changed. Update it from the lease, or cancel it. ${label}: ${before} in this message, ${after} on the lease.`,
        );
      }
      // A refusal writes nothing and dispatches nothing.
      expect(f.send).not.toHaveBeenCalled();
      expect(await f.store.get(scheduled.id)).toMatchObject({
        state: "paused",
        version: held.sequence.version,
      });
    },
  );

  it("AC-S272-1: a new approved template refuses the held wording and names the template", async () => {
    const f = setup();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    f.facts.template = "u".repeat(64);
    expect((await f.tick(scheduled.id)).status).toBe("paused");
    await expect(f.authorize(scheduled.id, "resume")).rejects.toThrow(
      "Approved template changed.",
    );
    expect(f.send).not.toHaveBeenCalled();
  });

  it("BEH-S272-5 / AC-S272-1: the same refusal holds for an owner message", async () => {
    const f = setup("renewal_owner");
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
              label: "Rent to recommend",
              previous: "$1,425.00",
              current: "$1,500.00",
            },
          ],
        },
      });
    expect(f.send).not.toHaveBeenCalled();
  });

  it.each([
    ["recipient", "to", "tenant-new@example.invalid"],
    ["notice", "notice", "n".repeat(64)],
  ] as const)(
    "AC-S272-1: a %s-only change is not refused by this rule; Resume authorizes the current facts",
    async (_kind, field, value) => {
      const f = setup();
      const scheduled = await f.authorize((await f.draft()).id, "schedule");
      f.facts[field] = value;
      const held = await f.tick(scheduled.id);
      expect(held.sequence.pause?.cause).toBe("changed_source");
      const resumed = await f.authorize(scheduled.id, "resume");
      expect(resumed.state).toBe("active");
      expect(resumed.authorization!.revision).toBe(scheduled.authorization!.revision + 1);
      expect(resumed.authorization!.to).toEqual([f.facts.to]);
    },
  );

  it("AC-S272-1: edited wording is authorized through the existing Update and keeps the new basis", async () => {
    const f = setup();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    f.facts.end = "06/30/2027";
    expect((await f.tick(scheduled.id)).status).toBe("paused");
    const updated = await f.saveWording(scheduled.id, wording(f.facts));
    const authorized = await f.authorize(updated.id, "schedule");
    expect(authorized.state).toBe("active");
    expect(authorized.authorizedContentBasis).toMatchObject({
      revision: authorized.authorization!.revision,
      digest: sequenceHash(contentValues("renewal_tenant", f.facts)),
      draftHash: sequenceHash({ initial: updated.initial, followUp: updated.followUp }),
    });
    expect(authorized.authorization!.initial.plainText).toContain("06/30/2027");
  });

  it("R-S272-2: wording rebuilt from the lease after the authorization goes through even when it reads the same", async () => {
    const f = setup();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    // A template republished with the same words: the basis changed, the wording did not.
    f.facts.template = "u".repeat(64);
    expect((await f.tick(scheduled.id)).status).toBe("paused");
    await expect(f.authorize(scheduled.id, "send")).rejects.toBeInstanceOf(
      CommunicationSequenceRefusedError,
    );
    // "Update from the lease" saves the lease's current message once, here the same words.
    const rebuilt = await f.saveWording(scheduled.id, wording(f.facts));
    expect(rebuilt.wordingSavedAfterRevision).toBe(scheduled.authorization!.revision);
    expect((await f.authorize(rebuilt.id, "schedule")).state).toBe("active");
  });
});

describe("S272 R-S272-3: one unsent initial message per lease, cycle and audience", () => {
  it("BEH-S272-2: a second initial offer from a new draft is refused and names the scheduled one; after it is cancelled the second proceeds", async () => {
    const f = setup();
    const first = await f.authorize((await f.draft()).id, "schedule");
    const second = await f.draft();
    const refusal = f.authorize(second.id, "send");
    await expect(refusal).rejects.toMatchObject({
      refusal: {
        reason: "unsent_message_exists",
        audience: "tenant",
        relatedSequenceId: first.id,
        relatedState: "scheduled",
        relatedAtMs: first.nextDueAtMs,
      },
    });
    await expect(refusal).rejects.toThrow(
      /^A tenant offer for this renewal is already scheduled for 11\/13\/2026, 9:00\sAM CST\. Open it to update or cancel it\.$/,
    );
    expect((await f.store.get(second.id))?.authorization).toBeNull();
    await f.control(first.id, "cancel");
    const proceeded = await f.authorize(second.id, "send");
    expect(proceeded.state).toBe("active");
    expect(f.send).not.toHaveBeenCalled();
  });

  it("AC-S272-6 / R-S272-7: a reply on the same lease and two unauthorized drafts are unaffected", async () => {
    const f = setup();
    const first = await f.authorize((await f.draft()).id, "schedule");
    // Two unauthorized drafts for one context coexist.
    const a = await f.draft();
    const b = await f.draft();
    expect([a.state, b.state]).toEqual(["draft", "draft"]);
    // A linked reply authorizes while the initial offer is scheduled.
    const replyContext: WorkflowCommunicationContext = {
      ...contextFor("renewal_tenant"),
      actionKey: "gmail.thread.reply",
      replyTo: {
        sequenceId: first.id,
        threadId: "thread-1",
        senderEmail: actor.email,
        parentId: "parent-1",
      },
    };
    const reply = await f.draft(replyContext, wording(f.facts));
    const authorized = await f.authorize(reply.id, "send");
    expect(authorized.state).toBe("active");
    expect(authorized.authorizedContentBasis).toBeUndefined();
  });
});

describe("S272 R-S272-4: an older authorization after a newer send", () => {
  it("BEH-S272-3: Resume, Send and Schedule of an older paused offer are refused after a newer confirmed send", async () => {
    const f = setup();
    const older = await f.authorize((await f.draft()).id, "schedule");
    await f.control(older.id, "pause");
    const newerId = f.seedNewerSend(NOW + 23 * 60_000);
    for (const action of ["resume", "send", "schedule"] as const) {
      const attempt = f.authorize(older.id, action);
      await expect(attempt).rejects.toMatchObject({
        refusal: {
          reason: "newer_message_sent",
          relatedSequenceId: newerId,
          relatedAtMs: NOW + 23 * 60_000,
        },
      });
      await expect(attempt).rejects.toThrow(
        /^A newer message for this renewal was sent on 11\/12\/2026, 12:23\sPM CST\. Cancel this one\.$/,
      );
    }
    expect(f.send).not.toHaveBeenCalled();
  });

  it("AC-S272-3: the worker pauses a due older offer with the new cause before any claim and never sends it", async () => {
    const f = setup();
    const older = await f.authorize((await f.draft()).id, "schedule");
    const newerId = f.seedNewerSend(NOW + 23 * 60_000);
    const claim = vi.spyOn(f.store, "claim");
    const result = await f.tick(older.id);
    expect(result.status).toBe("paused");
    expect(result.sequence).toMatchObject({
      state: "paused",
      nextDueAtMs: null,
      pause: {
        cause: "newer_message_sent",
        byUid: "communication-worker",
        evidenceIds: [`communication:${newerId}`],
      },
    });
    expect(claim).not.toHaveBeenCalled();
    expect(f.send).not.toHaveBeenCalled();
    // Only "Cancel future messages" remains for its unsent work.
    await expect(f.authorize(older.id, "resume")).rejects.toMatchObject({
      refusal: { reason: "newer_message_sent" },
    });
    expect((await f.control(older.id, "cancel")).state).toBe("cancelled");
  });

  it("ARCH-S272-2 / AC-S272-3: the claim's own transaction stops it when the newer send lands after the worker's check", async () => {
    const f = setup();
    const older = await f.authorize((await f.draft()).id, "schedule");
    f.seedNewerSend(NOW + 23 * 60_000);
    // The worker's read before the claim saw no newer send; the claim reads stored state itself.
    vi.spyOn(f.store, "relatedRenewalSequences").mockResolvedValue([]);
    const result = await f.tick(older.id);
    expect(result.status).toBe("paused");
    expect(result.sequence.pause?.cause).toBe("newer_message_sent");
    expect(result.sequence.unresolvedOccurrenceId).toBeNull();
    expect(f.send).not.toHaveBeenCalled();
    expect(
      [...f.db.store.keys()].filter((path) =>
        path.startsWith(`${COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences}/`),
      ),
    ).toEqual([]);
  });

  it("R-S272-4: a send recorded before the authorization does not stop it", async () => {
    const f = setup();
    f.seedNewerSend(NOW - 60 * 60_000);
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    const sent = await f.tick(scheduled.id);
    expect(sent.status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});

describe("S272 R-S272-7: a staff pause and Resume with unchanged facts", () => {
  it("BEH-S272-4 / AC-S272-4: Resume returns the message to due at once and one tick sends it once", async () => {
    const f = setup();
    const scheduled = await f.authorize((await f.draft()).id, "schedule");
    await f.control(scheduled.id, "pause");
    const resumed = await f.authorize(scheduled.id, "resume");
    expect(resumed.state).toBe("active");
    expect(resumed.nextDueAtMs).toBe(f.now());
    expect((await f.service.dispatch(scheduled.id)).status).toBe("sent");
    expect((await f.service.dispatch(scheduled.id)).status).not.toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});
