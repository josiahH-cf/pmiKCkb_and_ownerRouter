import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  RENEWAL_OUTREACH_RECORD_COLLECTION,
  correctRenewalOutreach,
  outreachRecordForAcceptedSend,
  readLeaseOutreachEvidence,
  readRenewalOutreachEvidence,
  writeRenewalOutreachRecord,
} from "@/lib/firestore/renewal-outreach-records";
import { WorkflowCommunicationSequenceService } from "@/lib/gmail-hub/sequence-service";
import {
  FirestoreCommunicationSequenceStore,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import {
  plainCommunicationMessage,
  type CommunicationSequence,
  type SequenceDraft,
} from "@/lib/gmail-hub/sequence-model";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";
import { projectOutreachEvidence } from "@/lib/lease-renewal/outreach-evidence";
import { projectRenewalStage } from "@/lib/lease-renewal/renewal-stage";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";

// S248 ARCH-S248-2, AC-S248-2, R-S248-10 and R-S248-12 against the real Firestore emulator and the
// real communication service with an isolated mail client: a confirmed renewal Send that Gmail
// accepted writes exactly one outreach record for the current cycle, bound to the message and
// the staff confirmation; a repeat writes nothing new; a failed record write neither repeats nor
// fails the send, and the next read rebuilds the same fact from the communication's delivery
// evidence. A correction keeps the record and its history. Nothing schedules, reminds or follows
// up.

const projectId = "pmi-kc-kb-s248-outreach-records";
const LEASE = "9101";
const OTHER_LEASE = "9102";
const CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000009101";
const OTHER_CYCLE = "5c1d2e3f-4a5b-4c6d-8e7f-000000009999";
let env: RulesTestEnvironment, app: App, db: Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp({ projectId }, `s248-outreach-${process.pid}`);
  db = getFirestore(app);
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => env.clearFirestore());
afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await env.cleanup();
});

const actor = {
  uid: "managed-staff",
  email: "fixture-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};

function contextFor(leaseId: string, purpose: "renewal_owner" | "renewal_tenant") {
  return {
    lane: "renewals" as const,
    entityType: "renewal_lease" as const,
    entityId: leaseId,
    purpose,
    actionKey: "gmail.renewal_notice.send",
    sourceRefs: [`rentvine:lease:${leaseId}`],
  };
}

function fixture(
  options: {
    leaseId?: string;
    purpose?: "renewal_owner" | "renewal_tenant";
    cycleId?: string | null;
    recordWrite?: "real" | "fails";
  } = {},
) {
  const context = contextFor(
    options.leaseId ?? LEASE,
    options.purpose ?? "renewal_owner",
  );
  const store = new FirestoreCommunicationSequenceStore(db);
  const sent = new Map<
    string,
    { messageId: string; threadId: string; labelIds: string[]; sentAtMs: number }
  >();
  const target = {
    context,
    to: ["owner@example.invalid"],
    cc: [],
    sourceRefs: context.sourceRefs,
    materialSourceHash: "a".repeat(64),
    label: "Sample lease",
    ...(options.cycleId === null ? {} : { noticeCycleId: options.cycleId ?? CYCLE }),
  };
  const send = vi.fn(async (message: WorkflowMimeMessage) => {
    const result = {
      messageId: `provider-${sent.size + 1}`,
      threadId: "provider-thread",
      labelIds: ["SENT"],
      sentAtMs: Date.parse("2026-11-04T16:00:00.000Z"),
    };
    sent.set(message.messageId, result);
    return result;
  });
  const recordAttempts = vi.fn();
  const service = new WorkflowCommunicationSequenceService({
    store,
    resolveTarget: async () => target,
    resolveAttachment: async () => {
      throw new Error("No fixture attachments");
    },
    readActor: async () => actor,
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
      getThread: async (id) => ({ id, messages: [], truncated: false }),
      sendWorkflowMessage: send,
      findWorkflowMessage: async (id) => sent.get(id) ?? null,
    }),
    recordAcceptedSend: async (sequence, occurrence, sentAtMs) => {
      recordAttempts(occurrence.id);
      if (options.recordWrite === "fails") throw new Error("Record store unavailable");
      const record = outreachRecordForAcceptedSend(
        sequence,
        occurrence,
        sentAtMs,
        Date.now(),
      );
      if (record) await writeRenewalOutreachRecord(record, db);
    },
  });
  const draft: SequenceDraft = {
    id: randomUUID(),
    context,
    initial: plainCommunicationMessage("Sample renewal message", "Synthetic content"),
    followUp: null,
  };
  async function approve() {
    const saved = await service.save(actor, draft, 0, randomUUID());
    return service.authorize(actor, {
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
  }
  return { service, store, send, approve, recordAttempts };
}

async function records() {
  return (await db.collection(RENEWAL_OUTREACH_RECORD_COLLECTION).get()).docs.map((doc) =>
    doc.data(),
  );
}

async function collections() {
  return (await db.listCollections()).map((collection) => collection.id).sort();
}

describe("S248 outreach records from the confirmed renewal Send", () => {
  it("AC-S248-2: one accepted owner message writes exactly one record bound to the message and the confirmation", async () => {
    const f = fixture();
    const authorized = await f.approve();
    const result = await f.service.dispatch(authorized.id);
    expect(result.status).toBe("sent");
    const stored = await records();
    expect(stored).toHaveLength(1);
    const [record] = stored;
    const sequence = result.sequence as CommunicationSequence;
    expect(record).toMatchObject({
      origin: "app_send",
      leaseId: LEASE,
      cycleId: CYCLE,
      audience: "owner",
      sequenceId: sequence.id,
      rfcMessageId: sequence.threads[0]!.rfcMessageId,
      gmailMessageId: "provider-1",
      sentAtMs: Date.parse("2026-11-04T16:00:00.000Z"),
      authorization: {
        operationId: authorized.lastOperation.id,
        revision: authorized.authorization!.revision,
        payloadHash: authorized.authorization!.payloadHash,
        approvedByUid: actor.uid,
      },
      correction: null,
    });
    expect(record!.occurrenceId).toBe(
      /<pmi-([0-9a-f]{64})@/.exec(sequence.threads[0]!.rfcMessageId)![1],
    );
    // A repeat of the same message writes nothing new and sends nothing more.
    await f.service.dispatch(authorized.id);
    const written = outreachRecordForAcceptedSend(
      sequence,
      {
        id: record!.occurrenceId,
        sequenceId: sequence.id,
        rfcMessageId: sequence.threads[0]!.rfcMessageId,
        authorizationRevision: authorized.authorization!.revision,
        payloadHash: authorized.authorization!.payloadHash,
      },
      sequence.threads[0]!.sentAtMs,
      Date.now(),
    )!;
    expect(await writeRenewalOutreachRecord(written, db)).toBe("exists");
    expect(await records()).toHaveLength(1);
    expect(f.send).toHaveBeenCalledTimes(1);
    // The read hands the stored record to the projection, which counts it as the outreach.
    const evidence = projectOutreachEvidence(
      await readLeaseOutreachEvidence(LEASE, db),
      CYCLE,
    );
    expect(evidence.owner.state).toBe("accepted");
    expect(evidence.owner.derived?.stored).toBe(true);
  });

  it("AC-S248-2: a failed record write neither repeats nor fails the send; the next read rebuilds the fact", async () => {
    const f = fixture({ recordWrite: "fails" });
    const authorized = await f.approve();
    const result = await f.service.dispatch(authorized.id);
    expect(result.status).toBe("sent");
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.recordAttempts).toHaveBeenCalledTimes(1);
    expect(await records()).toHaveLength(0);
    // Dispatching again finds nothing due: the send is not repeated.
    await f.service.dispatch(authorized.id);
    expect(f.send).toHaveBeenCalledTimes(1);
    const read = await readLeaseOutreachEvidence(LEASE, db);
    const evidence = projectOutreachEvidence(read, CYCLE);
    expect(evidence.owner.derived).toMatchObject({
      origin: "app_send",
      activity: "owner_outreach",
      stored: false,
      sentAtMs: Date.parse("2026-11-04T16:00:00.000Z"),
    });
    // The stage reads the same as when the record is stored: the owner is now awaited.
    const state = emptyRenewalWorkspace(LEASE, CYCLE, {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "RentVine lease end",
    });
    const stage = projectRenewalStage(state, {
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
      outreach: read,
    });
    expect(stage.stageLine).toMatch(/^Waiting on owner response/);
    expect(stage.currentStepId).toBe("ask-owner");
  });

  it("AC-S248-4: a message for another lease, another cycle or none is never this lease's outreach", async () => {
    const otherLease = fixture({ leaseId: OTHER_LEASE });
    await otherLease.service.dispatch((await otherLease.approve()).id);
    const otherCycle = fixture({ cycleId: OTHER_CYCLE });
    await otherCycle.service.dispatch((await otherCycle.approve()).id);
    const noCycle = fixture({ cycleId: null });
    await noCycle.service.dispatch((await noCycle.approve()).id);
    // A message sent before any work record names no cycle; its record names none either.
    expect((await records()).map((record) => String(record.cycleId)).sort()).toEqual(
      [CYCLE, OTHER_CYCLE, "null"].sort(),
    );
    const read = await readRenewalOutreachEvidence([LEASE, OTHER_LEASE], db);
    expect(projectOutreachEvidence(read.get(LEASE)!, CYCLE).owner.derived).toBeNull();
    expect(
      projectOutreachEvidence(read.get(OTHER_LEASE)!, CYCLE).owner.derived,
    ).not.toBeNull();
  });

  it("the tenant offer records Tenant offer delivered the same way", async () => {
    const f = fixture({ purpose: "renewal_tenant" });
    await f.service.dispatch((await f.approve()).id);
    const [record] = await records();
    expect(record).toMatchObject({ audience: "tenant", leaseId: LEASE, cycleId: CYCLE });
    const evidence = projectOutreachEvidence(
      await readLeaseOutreachEvidence(LEASE, db),
      CYCLE,
    );
    expect(evidence.tenant.derived?.activity).toBe("tenant_offer");
    expect(evidence.owner.derived).toBeNull();
  });

  it("R-S248-10: This was not the renewal outreach keeps the record with its reason and reopens the step", async () => {
    const f = fixture();
    const sent = await f.service.dispatch((await f.approve()).id);
    const [record] = await records();
    const operationId = randomUUID();
    const corrected = await correctRenewalOutreach(
      actor,
      {
        leaseId: LEASE,
        cycleId: CYCLE,
        audience: "owner",
        occurrenceId: record!.occurrenceId,
        reason: "This was a synthetic test message to the owner.",
        operationId,
      },
      db,
    );
    expect(corrected.correction?.reason).toBe(
      "This was a synthetic test message to the owner.",
    );
    // The same operation again changes nothing; the record and its history stay.
    await correctRenewalOutreach(
      actor,
      {
        leaseId: LEASE,
        cycleId: CYCLE,
        audience: "owner",
        occurrenceId: record!.occurrenceId,
        reason: "This was a synthetic test message to the owner.",
        operationId,
      },
      db,
    );
    const [after] = await records();
    expect(after!.corrections).toHaveLength(1);
    expect(after!.occurrenceId).toBe(record!.occurrenceId);
    const evidence = projectOutreachEvidence(
      await readLeaseOutreachEvidence(LEASE, db),
      CYCLE,
    );
    expect(evidence.owner.derived).toBeNull();
    expect(evidence.owner.corrected).toEqual([
      expect.objectContaining({
        occurrenceId: record!.occurrenceId,
        reason: "This was a synthetic test message to the owner.",
      }),
    ]);
    expect((sent.sequence as CommunicationSequence).threads).toHaveLength(1);
  });

  it("R-S248-10: a correction of a rebuilt record creates it from the delivery evidence first", async () => {
    const f = fixture({ recordWrite: "fails" });
    const sent = await f.service.dispatch((await f.approve()).id);
    const thread = (sent.sequence as CommunicationSequence).threads[0]!;
    const occurrenceId = /<pmi-([0-9a-f]{64})@/.exec(thread.rfcMessageId)![1]!;
    await correctRenewalOutreach(
      actor,
      {
        leaseId: LEASE,
        cycleId: CYCLE,
        audience: "owner",
        occurrenceId,
        reason: "Sent to the wrong owner contact.",
        operationId: randomUUID(),
      },
      db,
    );
    const [record] = await records();
    expect(record).toMatchObject({ occurrenceId, correction: expect.any(Object) });
    // A correction naming another lease is refused and changes nothing.
    await expect(
      correctRenewalOutreach(
        actor,
        {
          leaseId: OTHER_LEASE,
          cycleId: CYCLE,
          audience: "owner",
          occurrenceId,
          reason: "Wrong lease.",
          operationId: randomUUID(),
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("R-S248-12: reading, recording and correcting outreach add no schedule, reminder or follow-up", async () => {
    const f = fixture();
    const authorized = await f.approve();
    const before = await collections();
    await f.service.dispatch(authorized.id);
    const afterSend = await collections();
    const [record] = await records();
    await readRenewalOutreachEvidence([LEASE], db);
    await correctRenewalOutreach(
      actor,
      {
        leaseId: LEASE,
        cycleId: CYCLE,
        audience: "owner",
        occurrenceId: record!.occurrenceId,
        reason: "Synthetic correction.",
        operationId: randomUUID(),
      },
      db,
    );
    const afterAll = await collections();
    // The only collection S248 adds is its own record store; the send's own receipts are S189's.
    expect(afterSend.filter((name) => !before.includes(name))).toEqual(
      expect.arrayContaining([RENEWAL_OUTREACH_RECORD_COLLECTION]),
    );
    expect(afterAll).toEqual(afterSend);
    for (const name of afterAll)
      expect(name).not.toMatch(/reminder|follow_up|followup|deadline|schedule/i);
    const sequence = (await f.store.get(authorized.id))!;
    // The communication itself gains no schedule or next due time from the record.
    expect(sequence.authorization?.schedule).toBeNull();
    expect(sequence.nextDueAtMs).toBeNull();
  });
});
