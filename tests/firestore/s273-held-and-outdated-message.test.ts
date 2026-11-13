// S273 against the real Firestore emulator, with the real sequence store, service and worker, a
// synthetic renewal target whose lease facts the test changes, and an isolated mail client standing
// in for Gmail (its call count is the stand-in mailbox). A scheduled message reads out of date on
// the next lease read before any tick; a worker tick holds it, the lease evidence reads held with
// its cause and time, the sender gets exactly one notice naming the lease and the earlier attempt
// is listed, read only; one update saves the wording to the same communication and authorizes it,
// so exactly one sequence exists and the mailbox holds exactly one message with the new value; a
// failure after the save leaves it held with the retry. Synthetic values only; no provider request.
import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  RENEWAL_HOLD_NOTICE_COLLECTION,
  listRenewalHoldNotifications,
  markRenewalHoldNotificationRead,
  recordRenewalHold,
} from "@/lib/firestore/renewal-hold-notices";
import { readRenewalOutreachEvidence } from "@/lib/firestore/renewal-outreach-records";
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
  CommunicationWorkerStore,
  runCommunicationWorker,
} from "@/lib/gmail-hub/sequence-worker";
import { reviewedInput, type ReviewedInput } from "@/lib/gmail-hub/reviewed-inputs";
import {
  addCalendarDays,
  localDateAt,
  type CommunicationSchedule,
} from "@/lib/gmail-hub/schedule-calendar";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";
import { projectOutreachEvidence } from "@/lib/lease-renewal/outreach-evidence";
import {
  communicationWordingRevision,
  type LeaseMessageBasis,
} from "@/lib/lease-renewal/unsent-message";

const projectId = "demo-pmi-s273-held-and-outdated";
type Purpose = "renewal_tenant" | "renewal_owner";
const actor: AuthenticatedUser = {
  uid: "synthetic-s273-staff",
  email: "synthetic-s273-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const otherStaff: AuthenticatedUser = {
  uid: "synthetic-s273-other",
  email: "synthetic-s273-other@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const LEASE = "9273";
const CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000009273";
/** 11/12/2026, 12:00 PM CST. */
const NOW = Date.parse("2026-11-12T18:00:00.000Z");
const ZONE = "America/Chicago";
let app: App, db: Firestore, testEnv: RulesTestEnvironment;

interface Facts {
  rent: string;
  end: string;
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
    reviewedInput("template", "Approved template", "Synthetic template", "t".repeat(64)),
  ];
  return purpose === "renewal_tenant"
    ? [
        ...common,
        reviewedInput("renewalRent", "Renewal rent", f.rent),
        reviewedInput("renewalEnd", "Renewal end date", f.end),
      ]
    : [
        ...common,
        reviewedInput("ownerIntent", "Owner question", "Recommend a rent"),
        reviewedInput("rentToRecommend", "Rent to recommend", f.rent),
      ];
}

function targetFor(
  context: WorkflowCommunicationContext,
  f: Facts,
): VerifiedCommunicationTarget {
  const content = contentValues(context.purpose as Purpose, f);
  const to =
    context.purpose === "renewal_owner"
      ? "owner@example.invalid"
      : "tenant@example.invalid";
  return {
    context,
    to: [to],
    cc: [],
    sourceRefs: [`rentvine:lease:${LEASE}`],
    label: "101 Sample Pl",
    noticeCycleId: CYCLE,
    materialSourceHash: sequenceHash({ to, content }),
    reviewedInputs: [
      reviewedInput("to", "To", to),
      reviewedInput("cc", "Cc", null),
      ...content,
    ],
    contentBasis: {
      digest: sequenceHash(content),
      legacyDigest: sequenceHash({ legacy: content }),
      values: content,
    },
  };
}

const wording = (f: Facts) =>
  plainCommunicationMessage("Lease renewal", `Rent ${f.rent} through ${f.end}.`);

function fixture(purpose: Purpose = "renewal_tenant") {
  const clock = { ms: NOW };
  const facts: Facts = {
    rent: "$1,425.00",
    end: "12/31/2027",
  };
  const store = new FirestoreCommunicationSequenceStore(db);
  const mailbox = new Map<string, { messageId: string; body: string }>();
  // The exact readback the renewal delivery policy confirms a send with, by RFC message id.
  const accepted = new Map<
    string,
    { messageId: string; threadId: string; labelIds: string[]; sentAtMs: number }
  >();
  const send = vi.fn(async (message: WorkflowMimeMessage) => {
    const result = {
      messageId: `provider-${mailbox.size + 1}`,
      threadId: "provider-thread",
      labelIds: ["SENT"],
      sentAtMs: clock.ms,
    };
    mailbox.set(message.messageId, { messageId: result.messageId, body: message.body });
    accepted.set(message.messageId, result);
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
    // S273 R-S273-6: the production wiring, against the emulator.
    recordHold: async (sequence) => {
      await recordRenewalHold(sequence, db, clock.ms);
    },
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
      findWorkflowMessage: async (rfcMessageId) => accepted.get(rfcMessageId) ?? null,
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
  async function scheduled(): Promise<CommunicationSequence> {
    const draft = await service.save(
      actor,
      {
        id: randomUUID(),
        context: contextFor(purpose),
        initial: wording(facts),
        followUp: null,
      },
      0,
      randomUUID(),
    );
    return authorize(draft.id, "schedule", scheduleFor(clock.ms));
  }
  async function authorize(
    id: string,
    action: "send" | "schedule",
    schedule: CommunicationSchedule | null,
    reviewedTargetHash?: string,
  ) {
    const current = (await store.get(id))!;
    const reviewed = targetFor(current.context, facts);
    return service.authorize(actor, {
      id,
      expectedVersion: current.version,
      operationId: randomUUID(),
      action,
      schedule,
      reviewedDraftHash: sequenceHash({
        initial: current.initial,
        followUp: current.followUp,
      }),
      reviewedTargetHash: reviewedTargetHash ?? reviewedCommunicationTargetHash(reviewed),
      reviewedInputs: reviewed.reviewedInputs ?? null,
    });
  }
  /** R-S273-4's one confirmation: save the lease's current wording to the same communication. */
  async function saveLeaseWording(id: string) {
    const current = (await store.get(id))!;
    return service.save(
      actor,
      {
        id,
        context: current.context,
        initial: wording(facts),
        followUp: current.followUp,
      },
      current.version,
      randomUUID(),
    );
  }
  /** The lease's current values, as the lease and desk read reports them. */
  function leaseBasis(): LeaseMessageBasis {
    const target = targetFor(contextFor(purpose), facts);
    return {
      settled: true,
      digest: target.contentBasis!.digest,
      legacyDigest: target.contentBasis!.legacyDigest,
      values: target.contentBasis!.values,
      wordingRevision: communicationWordingRevision(wording(facts)),
      wordingSavedAtMs: null,
    };
  }
  async function workerTick() {
    return runCommunicationWorker({
      service,
      store: new CommunicationWorkerStore(db),
      now: () => clock.ms,
    });
  }
  return {
    clock,
    facts,
    store,
    service,
    send,
    mailbox,
    scheduled,
    authorize,
    saveLeaseWording,
    leaseBasis,
    workerTick,
  };
}

async function sequenceDocs() {
  return (await db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences).get()).docs;
}

async function evidence(audience: "owner" | "tenant", current?: LeaseMessageBasis) {
  const input = (await readRenewalOutreachEvidence([LEASE], db)).get(LEASE)!;
  return projectOutreachEvidence(
    current ? { ...input, currentMessage: { [audience]: current } } : input,
    CYCLE,
  )[audience];
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s273-held-and-outdated-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(async () => {
  await testEnv.clearFirestore();
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

describe("S273 BEH-S273-2: out of date on the next read, before any worker run", () => {
  it("BEH-S273-2 / AC-S273-2: a changed end date reads out of date with both values on the next lease read; nothing is written by reading", async () => {
    const f = fixture();
    const message = await f.scheduled();
    expect((await evidence("tenant", f.leaseBasis())).unsent?.kind).toBe(
      "scheduled_current",
    );
    f.facts.end = "06/30/2027";
    const before = (await f.store.get(message.id))!;
    const read = await evidence("tenant", f.leaseBasis());
    expect(read.unsent?.kind).toBe("scheduled_out_of_date");
    expect(read.unsent?.differences).toEqual([
      "Renewal end date: 12/31/2027 in the scheduled message, 06/30/2027 on the lease.",
    ]);
    const after = (await f.store.get(message.id))!;
    expect(after.version).toBe(before.version);
    expect(after.updatedAtMs).toBe(before.updatedAtMs);
    expect(f.send).not.toHaveBeenCalled();
  });
});

describe("S273 BEH-S273-3 / AC-S273-3 / AC-S273-5: a worker hold reads held, tells the sender once and lists the attempt", () => {
  it("BEH-S273-3: after a tick the lease reads held with cause and time, the sender has one notice naming the lease, and reading claims nothing", async () => {
    const f = fixture();
    const message = await f.scheduled();
    f.facts.end = "06/30/2027";
    f.clock.ms = (message.nextDueAtMs ?? f.clock.ms) + 60_000;
    expect(await f.workerTick()).toMatchObject({ sent: 0, held: 1 });
    const stored = (await f.store.get(message.id))!;
    expect(stored.state).toBe("paused");
    expect(stored.pause?.cause).toBe("changed_source");

    const held = await evidence("tenant");
    expect(held.unsent).toMatchObject({
      state: "held",
      kind: "held_changed",
      atMs: stored.pause!.atMs,
      cause: "changed_source",
    });
    expect(held.unsent?.line).toMatch(/^Offer held on .+ because the lease changed\.$/);
    expect(held.unsent?.primary?.label).toBe("Review the updated offer");

    // AC-S273-3: reading changes no record and claims or dispatches nothing.
    expect((await f.store.get(message.id))!.version).toBe(stored.version);
    expect(
      (await db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences).get()).size,
    ).toBe(0);

    // AC-S273-5: one notice for the responsible sender, deduplicated per sequence and pause.
    expect((await db.collection(RENEWAL_HOLD_NOTICE_COLLECTION).get()).size).toBe(1);
    expect(await recordRenewalHold(stored, db, f.clock.ms)).toBe("exists");
    f.clock.ms += 60_000;
    await f.workerTick();
    expect((await db.collection(RENEWAL_HOLD_NOTICE_COLLECTION).get()).size).toBe(1);
    const notices = await listRenewalHoldNotifications(actor, {}, db);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      source: "gmail_workflow",
      family: "renewal_communications",
      title: "Renewal message held",
      message: "The tenant offer for 101 Sample Pl was held because the lease changed.",
    });
    expect(notices[0]!.href).toMatch(/9273/);
    expect(notices[0]!.href).toMatch(/offer-tenant/);
    const stored_notice = JSON.stringify(
      (await db.collection(RENEWAL_HOLD_NOTICE_COLLECTION).get()).docs.map((doc) =>
        doc.data(),
      ),
    );
    expect(`${JSON.stringify(notices)}${stored_notice}`).not.toMatch(
      /tenant@example\.invalid|Rent \$1,425\.00 through/,
    );
    // None for a staff member who is not the responsible sender.
    expect(await listRenewalHoldNotifications(otherStaff, {}, db)).toEqual([]);
    await expect(
      markRenewalHoldNotificationRead(otherStaff, notices[0]!.id, db),
    ).rejects.toMatchObject({ status: 404 });
    await markRenewalHoldNotificationRead(actor, notices[0]!.id, db);
    expect(await listRenewalHoldNotifications(actor, { unreadOnly: true }, db)).toEqual(
      [],
    );
    expect(f.send).not.toHaveBeenCalled();
  });

  it("AC-S273-3: the earlier attempt is listed after the update, read only", async () => {
    const f = fixture();
    const message = await f.scheduled();
    f.facts.end = "06/30/2027";
    f.clock.ms = (message.nextDueAtMs ?? f.clock.ms) + 60_000;
    await f.workerTick();
    await f.saveLeaseWording(message.id);
    await f.authorize(message.id, "send", null);
    const stored = (await f.store.get(message.id))!;
    expect(stored.unsentHistory).toHaveLength(1);
    expect(stored.unsentHistory![0]).toMatchObject({
      state: "held",
      cause: "changed_source",
      resolution: "updated",
    });
    const listed = await evidence("tenant");
    expect(listed.earlierAttempts?.map((attempt) => attempt.line)).toEqual([
      expect.stringMatching(
        /^Held on .+ \(The lease or recipient facts changed\), then updated on .+\.$/,
      ),
    ]);
  });
});

describe("S273 ARCH-S273-3 / BEH-S273-4 / AC-S273-4: one update of the same communication", () => {
  it("BEH-S273-4: an out-of-date scheduled offer updated at its carried time leaves one sequence; one tick sends one message with the new end date", async () => {
    const f = fixture();
    const message = await f.scheduled();
    f.facts.end = "06/30/2027";
    // The one confirmation: the wording saves to the same communication, then it is authorized
    // for the same time it was scheduled for.
    await f.saveLeaseWording(message.id);
    const updated = await f.authorize(
      message.id,
      "schedule",
      message.authorization!.schedule,
    );
    expect(updated.id).toBe(message.id);
    expect(updated.nextDueAtMs).toBe(message.nextDueAtMs);
    expect(await sequenceDocs()).toHaveLength(1);
    expect((await evidence("tenant", f.leaseBasis())).unsent?.kind).toBe(
      "scheduled_current",
    );
    f.clock.ms = (updated.nextDueAtMs ?? f.clock.ms) + 60_000;
    expect(await f.workerTick()).toMatchObject({ sent: 1 });
    expect(f.send).toHaveBeenCalledTimes(1);
    expect([...f.mailbox.values()].map((sent) => sent.body)).toEqual([
      "Rent $1,425.00 through 06/30/2027.",
    ]);
    expect(await sequenceDocs()).toHaveLength(1);
  });

  it("AC-S273-4: with the earlier time past, the update sends now; exactly one message with the new value", async () => {
    const f = fixture();
    const message = await f.scheduled();
    f.facts.end = "06/30/2027";
    f.clock.ms = (message.nextDueAtMs ?? f.clock.ms) + 60_000;
    await f.workerTick();
    await f.saveLeaseWording(message.id);
    await f.authorize(message.id, "send", null);
    await f.service.dispatch(message.id);
    expect(f.send).toHaveBeenCalledTimes(1);
    expect([...f.mailbox.values()].map((sent) => sent.body)).toEqual([
      "Rent $1,425.00 through 06/30/2027.",
    ]);
    expect(await sequenceDocs()).toHaveLength(1);
  });

  it("AC-S273-4: a failure after the wording saved leaves it held with the new wording, and the step offers the retry", async () => {
    const f = fixture();
    const message = await f.scheduled();
    f.facts.end = "06/30/2027";
    await f.saveLeaseWording(message.id);
    await expect(
      f.authorize(
        message.id,
        "schedule",
        message.authorization!.schedule,
        "0".repeat(64),
      ),
    ).rejects.toBeTruthy();
    const stored = (await f.store.get(message.id))!;
    expect(stored.state).toBe("paused");
    expect(stored.initial.paragraphs).toEqual(wording(f.facts).paragraphs);
    const read = await evidence("tenant", f.leaseBasis());
    expect(read.unsent?.kind).toBe("held_changed");
    expect(read.unsent?.primary?.label).toBe("Review the updated offer");
    // The retry authorizes the same communication.
    await f.authorize(message.id, "schedule", message.authorization!.schedule);
    expect(await sequenceDocs()).toHaveLength(1);
    expect(f.send).not.toHaveBeenCalled();
  });

  it("BEH-S273-5: the same update holds for an owner message", async () => {
    const f = fixture("renewal_owner");
    const message = await f.scheduled();
    f.facts.rent = "$1,500.00";
    const read = await evidence("owner", f.leaseBasis());
    expect(read.unsent?.line).toBe("Scheduled owner message is out of date.");
    expect(read.unsent?.differences).toEqual([
      "Rent to recommend: $1,425.00 in the scheduled message, $1,500.00 on the lease.",
    ]);
    await f.saveLeaseWording(message.id);
    const updated = await f.authorize(
      message.id,
      "schedule",
      message.authorization!.schedule,
    );
    f.clock.ms = (updated.nextDueAtMs ?? f.clock.ms) + 60_000;
    expect(await f.workerTick()).toMatchObject({ sent: 1 });
    expect([...f.mailbox.values()].map((sent) => sent.body)).toEqual([
      "Rent $1,500.00 through 12/31/2027.",
    ]);
    expect(await sequenceDocs()).toHaveLength(1);
  });
});
