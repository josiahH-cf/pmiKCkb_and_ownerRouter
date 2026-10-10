import {
  readBusinessProfile,
  savePresentationSetting,
} from "@/lib/firestore/presentation-settings";
import { applyBusinessSignature } from "@/lib/gmail-hub/business-signature";
import { observeStaffOperation } from "@/lib/observability/staff-operation";
import {
  FirestoreCommunicationsCleanupStore,
  applyCommunicationsLegalHold,
} from "@/lib/gmail-hub/retention-store";
import {
  COMMUNICATIONS_RETENTION_MS,
  parseRetentionCandidate,
  isCommunicationsCleanupEligible,
} from "@/lib/gmail-hub/retention-policy";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  FirestoreCommunicationSequenceStore,
  COMMUNICATION_SEQUENCE_COLLECTIONS,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import { CommunicationAttachmentStore } from "@/lib/gmail-hub/sequence-attachments";
import { CommunicationWorkerStore } from "@/lib/gmail-hub/sequence-worker";
import { WorkflowCommunicationSequenceService } from "@/lib/gmail-hub/sequence-service";
import {
  plainCommunicationMessage,
  type SequenceDraft,
  type CommunicationSequence,
} from "@/lib/gmail-hub/sequence-model";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";
import { GMAIL_STATE_COLLECTIONS } from "@/lib/gmail-hub/state-store";
const projectId = "pmi-kc-kb-sequence-emulator-test";
let env: RulesTestEnvironment, app: App, db: Firestore;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp({ projectId }, `sequence-${process.pid}`);
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
const other = {
  ...actor,
  uid: "managed-staff-two",
  email: "managed-staff-two@pmikcmetro.com",
};
const context = {
  lane: "renewals" as const,
  entityType: "renewal_lease" as const,
  entityId: "fixture-115",
  purpose: "renewal_owner" as const,
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: ["rentvine:lease:fixture-115"],
};
function preparedFor(s: CommunicationSequence) {
  return {
    materialSourceHash: s.authorization!.materialSourceHash,
    authorizationRevision: s.authorization!.revision,
    payloadHash: s.authorization!.payloadHash,
    senderEmail: s.authorization!.senderEmail,
    confirmedCount: s.confirmedCount,
  };
}
function fixture(now?: () => number) {
  const store = new FirestoreCommunicationSequenceStore(db),
    sent = new Map<
      string,
      { messageId: string; threadId: string; labelIds: string[]; sentAtMs: number }
    >();
  const target = {
    context,
    to: ["owner@example.invalid"],
    cc: [],
    sourceRefs: context.sourceRefs,
    materialSourceHash: "a".repeat(64),
    label: "Emulator lease",
  };
  const send = vi.fn(async (m: WorkflowMimeMessage) => {
    const result = {
      messageId: "provider-message",
      threadId: "provider-thread",
      labelIds: ["SENT"],
      sentAtMs: Date.now(),
    };
    sent.set(m.messageId, result);
    return result;
  });
  const service = new WorkflowCommunicationSequenceService({
    store,
    now,
    resolveTarget: async () => target,
    resolveAttachment: async () => {
      throw new Error("No fixture attachments");
    },
    readActor: async (uid) => (uid === other.uid ? other : actor),
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
      getThread: async (id) => ({ id, messages: [], truncated: false }),
      sendWorkflowMessage: send,
      findWorkflowMessage: async (id) => sent.get(id) ?? null,
    }),
  });
  const draft: SequenceDraft = {
    id: randomUUID(),
    context,
    initial: plainCommunicationMessage(
      "Exact emulator message",
      "Synthetic emulator content",
    ),
    followUp: null,
  };
  async function approve() {
    const s = await service.save(actor, draft, 0, randomUUID());
    return service.authorize(actor, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action: "send",
      schedule: null,
      reviewedDraftHash: sequenceHash({ initial: s.initial, followUp: s.followUp }),
      reviewedTargetHash: sequenceHash({
        to: target.to,
        cc: target.cc,
        materialSourceHash: target.materialSourceHash,
      }),
    });
  }
  return { store, service, send, draft, approve };
}
describe("S188–S191 real Firestore transaction ordering with isolated Gmail", () => {
  it("converges concurrent retries of one save and rejects a different stale edit", async () => {
    const f = fixture(),
      operationId = randomUUID();
    const saved = await Promise.all([
      f.service.save(actor, f.draft, 0, operationId),
      f.service.save(actor, f.draft, 0, operationId),
    ]);
    expect(saved.map((s) => s.version)).toEqual([1, 1]);
    const edits = await Promise.allSettled([
      f.service.save(
        actor,
        { ...f.draft, initial: plainCommunicationMessage("First change", "One") },
        1,
        randomUUID(),
      ),
      f.service.save(
        actor,
        { ...f.draft, initial: plainCommunicationMessage("Second change", "Two") },
        1,
        randomUUID(),
      ),
    ]);
    expect(edits.filter((e) => e.status === "fulfilled")).toHaveLength(1);
    expect(edits.filter((e) => e.status === "rejected")).toHaveLength(1);
    expect((await f.store.get(f.draft.id))?.version).toBe(2);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("allows one provider attempt under concurrent workers and atomically creates its linked receipt", async () => {
    const f = fixture(),
      s = await f.approve();
    await Promise.allSettled(Array.from({ length: 6 }, () => f.service.dispatch(s.id)));
    expect(f.send).toHaveBeenCalledTimes(1);
    const record = (await f.store.get(s.id))!;
    expect(record.confirmedCount).toBe(1);
    expect(record.state).toBe("completed");
    const occurrences = await db
      .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
      .get();
    expect(occurrences.size).toBe(1);
    expect(occurrences.docs[0].data().state).toBe("sent");
    const links = await db.collection(GMAIL_STATE_COLLECTIONS.workflowLinks).get();
    expect(links.size).toBe(1);
    expect(links.docs[0].data()).toMatchObject({
      sequence_id: s.id,
      gmail_message_id: "provider-message",
      gmail_thread_id: "provider-thread",
    });
  });
  it.each([
    ["claim", "content"],
    ["claim", "sender"],
    ["observe", "content"],
    ["observe", "sender"],
  ] as const)(
    "stops prepared work when %s races a newly authorized %s revision",
    async (boundary, change) => {
      const f = fixture(() => Date.parse("2026-10-10T06:00:00Z")),
        original = await f.approve();
      const replaceAuthorization = async () => {
        let current = (await f.store.get(original.id))!;
        const sender = change === "sender" ? other : actor;
        if (change === "sender") {
          current = await f.service.control(actor, {
            id: current.id,
            expectedVersion: current.version,
            operationId: randomUUID(),
            action: "transfer",
            responsibleUid: other.uid,
          });
        }
        current = await f.service.save(
          sender,
          {
            ...f.draft,
            initial: plainCommunicationMessage(
              "New reviewed revision",
              "Only the new exact content",
            ),
          },
          current.version,
          randomUUID(),
        );
        return f.service.authorize(sender, {
          id: current.id,
          expectedVersion: current.version,
          operationId: randomUUID(),
          action: "send",
          schedule: null,
          reviewedDraftHash: sequenceHash({
            initial: current.initial,
            followUp: current.followUp,
          }),
          reviewedTargetHash: sequenceHash({
            to: ["owner@example.invalid"],
            cc: [],
            materialSourceHash: "a".repeat(64),
          }),
        });
      };
      if (boundary === "claim") {
        const realClaim = f.store.claim.bind(f.store);
        vi.spyOn(f.store, "claim").mockImplementationOnce(async (...args) => {
          await replaceAuthorization();
          return realClaim(...args);
        });
      } else {
        const realObserve = f.store.observe.bind(f.store);
        vi.spyOn(f.store, "observe").mockImplementationOnce(async (...args) => {
          await replaceAuthorization();
          return realObserve(...args);
        });
      }
      await f.service.dispatch(original.id);
      expect(f.send).not.toHaveBeenCalled();
      expect(
        (await db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences).get()).size,
      ).toBe(0);
      const current = (await f.store.get(original.id))!;
      expect(current.authorization!.revision).toBeGreaterThan(
        original.authorization!.revision,
      );
      expect(current.unresolvedOccurrenceId).toBeNull();
      const fresh = await f.service.dispatch(original.id);
      expect(fresh.status).toBe("sent");
      expect(f.send).toHaveBeenCalledTimes(1);
      expect(f.send.mock.calls[0][0]).toMatchObject({
        from: change === "sender" ? other.email : actor.email,
        subject: "New reviewed revision",
        body: "Only the new exact content",
      });
      const attempts = await db
        .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences)
        .get();
      expect(attempts.size).toBe(1);
      expect(attempts.docs[0].data()).toMatchObject({
        authorizationRevision: current.authorization!.revision,
        payloadHash: current.authorization!.payloadHash,
        state: "sent",
      });
    },
  );
  it.each([
    { materialSourceHash: "b".repeat(64) },
    { authorizationRevision: 999 },
    { payloadHash: "c".repeat(64) },
    { senderEmail: other.email },
    { confirmedCount: 1 },
  ])(
    "does not consume an occurrence for a mismatched prepared basis %j",
    async (changed) => {
      const f = fixture(),
        s = await f.approve();
      expect(
        await f.store.claim(s.id, Date.now(), { ...preparedFor(s), ...changed }),
      ).toBeNull();
      expect(
        (await db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences).get()).size,
      ).toBe(0);
      const admitted = await f.store.claim(s.id, Date.now(), preparedFor(s));
      expect(admitted?.occurrence).toMatchObject({
        authorizationRevision: s.authorization!.revision,
        payloadHash: s.authorization!.payloadHash,
        senderEmail: actor.email,
        index: 0,
      });
      expect(f.send).not.toHaveBeenCalled();
    },
  );
  it("keeps a pause serialized before claim out of execution and preserves a pause after claim", async () => {
    const f = fixture(),
      s = await f.approve();
    await f.service.control(actor, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action: "pause",
    });
    expect(await f.store.claim(s.id, Date.now(), preparedFor(s))).toBeNull();
    const g = fixture(),
      t = await g.approve(),
      claim = (await g.store.claim(t.id, Date.now(), preparedFor(t)))!;
    await g.service.control(actor, {
      id: t.id,
      expectedVersion: t.version,
      operationId: randomUUID(),
      action: "pause",
    });
    expect(await g.store.canDispatch(claim.occurrence)).toBe(false);
    const result = await g.store.settle(claim.occurrence, {
      nowMs: Date.now(),
      outcome: "refused",
      reason: "paused_before_dispatch",
    });
    expect(result.state).toBe("paused");
    expect(result.confirmedCount).toBe(0);
    expect(f.send).not.toHaveBeenCalled();
    expect(g.send).not.toHaveBeenCalled();
  });
  it("accounts concurrent matching reconciliation once and refuses a conflicting terminal receipt", async () => {
    const f = fixture(),
      s = await f.approve(),
      claim = (await f.store.claim(s.id, Date.now(), preparedFor(s)))!;
    const effect = {
      messageId: "provider-message",
      threadId: "provider-thread",
      labelIds: ["SENT"],
    };
    await Promise.all([
      f.store.settle(claim.occurrence, { nowMs: Date.now(), result: effect }),
      f.store.settle(claim.occurrence, { nowMs: Date.now(), result: effect }),
    ]);
    expect((await f.store.get(s.id))?.confirmedCount).toBe(1);
    await expect(
      f.store.settle(claim.occurrence, {
        nowMs: Date.now(),
        result: { ...effect, messageId: "different-effect" },
      }),
    ).rejects.toThrow(/conflicts/);
    expect((await f.store.get(s.id))?.confirmedCount).toBe(1);
  });
  it("serializes a worker lease and fences a stale run's completion after restart", async () => {
    const store = new CommunicationWorkerStore(db);
    const claims = await Promise.all(Array.from({ length: 4 }, () => store.claim(1000)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    const old = claims.find(Boolean)!;
    const next = (await store.claim(old.expiresAtMs + 1))!;
    expect(await store.finish(old, null, old.expiresAtMs + 2, {})).toBe(false);
    expect(await store.finish(next, null, old.expiresAtMs + 3, {})).toBe(true);
  });
  it("resumes exactly the admitted attachment after a partial chunk write and rejects changed intent", async () => {
    let transactions = 0;
    const interrupted = new Proxy(db, {
      get(target, key) {
        if (key === "runTransaction")
          return (...args: Parameters<Firestore["runTransaction"]>) => {
            transactions += 1;
            if (transactions === 3)
              return Promise.reject(new Error("fixture interrupted chunk"));
            return target.runTransaction(...args);
          };
        const v = Reflect.get(target, key);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const bytes = new Uint8Array(384 * 1024 + 20).fill(7);
    bytes.set([255, 216, 255]);
    const input = {
      id: randomUUID(),
      actorUid: actor.uid,
      context,
      filename: "fixture.jpg",
      mimeType: "image/jpeg",
      bytes,
      nowMs: Date.now(),
    };
    await expect(
      new CommunicationAttachmentStore(interrupted).put(input),
    ).rejects.toThrow(/reconciliation/);
    const store = new CommunicationAttachmentStore(db);
    expect((await store.put(input)).state).toBe("ready");
    expect((await store.resolve(input.id, context)).bytes).toEqual(bytes);
    await expect(store.put({ ...input, filename: "different.jpg" })).rejects.toThrow(
      /different file/,
    );
    await expect(
      store.resolve(input.id, { ...context, entityId: "other-lease" }),
    ).rejects.toThrow(/unavailable/);
  });
  it("S193 retains active/ambiguous work, preserves legal holds across saves, and retires only resolved expired content without permitting resurrection", async () => {
    const f = fixture();
    let s = await f.service.save(actor, f.draft, 0, randomUUID());
    const ref = db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences).doc(s.id);
    expect((await ref.get()).data()).toMatchObject({
      operational_hold: true,
      expires_at: null,
      expires_at_ms: null,
      legal_hold: false,
    });
    const admin = { ...actor, role: "Admin" as const };
    const hold = {
      action: "hold" as const,
      caseReference: "synthetic-case",
      collection: "gmail_communication_sequences" as const,
      idempotencyKey: "synthetic-hold",
      reason: "Preserve synthetic emulator work only.",
      recordId: s.id,
    };
    await applyCommunicationsLegalHold(admin, hold, db, Date.now());
    s = await f.service.save(
      actor,
      { ...f.draft, initial: plainCommunicationMessage("Edited", "Kept exact words") },
      s.version,
      randomUUID(),
    );
    expect((await ref.get()).get("legal_hold")).toBe(true);
    await applyCommunicationsLegalHold(
      admin,
      { ...hold, action: "release", idempotencyKey: "synthetic-release" },
      db,
      Date.now(),
    );
    expect((await ref.get()).data()).toMatchObject({
      legal_hold: false,
      operational_hold: true,
      expires_at: null,
    });
    const cleanup = new FirestoreCommunicationsCleanupStore(db),
      future = Date.now() + COMMUNICATIONS_RETENTION_MS.workflow_link + 1000;
    const active = parseRetentionCandidate(
      "gmail_communication_sequences",
      s.id,
      (await ref.get()).data(),
    )!;
    expect(isCommunicationsCleanupEligible(active, future)).toBe(false);
    expect(await cleanup.deleteIfEligible(active, future)).toBe(false);
    await f.service.control(actor, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action: "cancel",
    });
    const terminal = parseRetentionCandidate(
      "gmail_communication_sequences",
      s.id,
      (await ref.get()).data(),
    )!;
    expect(isCommunicationsCleanupEligible(terminal, future)).toBe(true);
    await applyCommunicationsLegalHold(
      admin,
      { ...hold, idempotencyKey: "synthetic-hold-terminal" },
      db,
      Date.now(),
    );
    expect(await cleanup.deleteIfEligible(terminal, future)).toBe(false);
    await applyCommunicationsLegalHold(
      admin,
      { ...hold, action: "release", idempotencyKey: "synthetic-release-terminal" },
      db,
      Date.now(),
    );
    expect(await cleanup.deleteIfEligible(terminal, future)).toBe(true);
    expect((await ref.get()).data()).toEqual({
      id: s.id,
      purged: true,
      retired_at_ms: future,
    });
    expect(await f.store.get(s.id)).toBeNull();
    await expect(f.service.save(actor, f.draft, 0, randomUUID())).rejects.toMatchObject({
      status: 409,
    });
    expect(f.send).not.toHaveBeenCalled();
  });
  it("S193 retains a file while referenced, then atomically retires its exact chunks and upload identity", async () => {
    const f = fixture(),
      files = new CommunicationAttachmentStore(db),
      id = randomUUID(),
      bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
      nowMs = Date.now();
    await files.put({
      id,
      actorUid: actor.uid,
      context,
      filename: "synthetic.jpg",
      mimeType: "image/jpeg",
      bytes,
      nowMs,
    });
    const draft = { ...f.draft, initial: { ...f.draft.initial, attachmentIds: [id] } };
    const s = await f.service.save(actor, draft, 0, randomUUID()),
      cleanup = new FirestoreCommunicationsCleanupStore(db),
      future = nowMs + COMMUNICATIONS_RETENTION_MS.workflow_link + 10000;
    const ref = db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.attachments).doc(id);
    const candidate = parseRetentionCandidate(
      "gmail_communication_attachments",
      id,
      (await ref.get()).data(),
    )!;
    expect(await cleanup.deleteIfEligible(candidate, future)).toBe(false);
    await f.service.control(actor, {
      id: s.id,
      expectedVersion: s.version,
      operationId: randomUUID(),
      action: "cancel",
    });
    const seqRef = db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences).doc(s.id);
    expect(
      await cleanup.deleteIfEligible(
        parseRetentionCandidate(
          "gmail_communication_sequences",
          s.id,
          (await seqRef.get()).data(),
        )!,
        future,
      ),
    ).toBe(true);
    expect(await cleanup.deleteIfEligible(candidate, future)).toBe(true);
    expect((await ref.get()).data()).toMatchObject({ purged: true });
    expect((await db.collection("publication_content_chunks").get()).empty).toBe(true);
    await expect(
      files.put({
        id,
        actorUid: actor.uid,
        context,
        filename: "synthetic.jpg",
        mimeType: "image/jpeg",
        bytes,
        nowMs: future,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.send).not.toHaveBeenCalled();
  });
  it("denies every browser role direct access to private sequence, occurrence and attachment records", async () => {
    for (const role of ["Editor", "Approver", "Admin"]) {
      const client = env
        .authenticatedContext(`browser-${role}`, {
          email: `browser-${role.toLowerCase()}@pmikcmetro.com`,
          hd: "pmikcmetro.com",
          role,
        })
        .firestore();
      for (const collection of [
        COMMUNICATION_SEQUENCE_COLLECTIONS.sequences,
        COMMUNICATION_SEQUENCE_COLLECTIONS.occurrences,
        COMMUNICATION_SEQUENCE_COLLECTIONS.attachments,
      ]) {
        await assertFails(getDoc(doc(client, collection, "fixture")));
        await assertFails(setDoc(doc(client, collection, "fixture"), { guessed: true }));
      }
    }
  });
});

it("S185 measures actual app-history reads while retaining every permission check and fresh effect scopes", async () => {
  const f = fixture();
  await f.service.save(actor, f.draft, 0, randomUUID());
  const read = vi.spyOn(f.store, "get"),
    records: Array<{
      operation: string;
      durationMs: number;
      coalescedReads: number;
      stages: Record<string, { calls: number }>;
    }> = [];
  async function measure(operation: "maintenance_read" | "communications_prepare") {
    read.mockClear();
    const values = await observeStaffOperation(
      operation,
      0,
      async () => [
        await f.service.get(actor, f.draft.id),
        await f.service.get(actor, f.draft.id),
        await f.service.get(actor, f.draft.id),
      ],
      (record) => records.push(record as (typeof records)[number]),
    );
    expect(values.map((v) => v.id)).toEqual([f.draft.id, f.draft.id, f.draft.id]);
    expect(read).toHaveBeenCalledTimes(operation === "communications_prepare" ? 1 : 3);
    const trace = records.at(-1)!;
    expect(trace.stages.permission.calls).toBe(6);
    expect(trace.stages.record_read.calls).toBe(
      operation === "communications_prepare" ? 1 : 3,
    );
  }
  for (let i = 0; i < 6; i++) {
    await measure(i % 2 === 0 ? "maintenance_read" : "communications_prepare");
    await measure(i % 2 === 0 ? "communications_prepare" : "maintenance_read");
  }
  const summarize = (operation: string) => {
    const rows = records.filter((r) => r.operation === operation),
      times = rows.map((r) => r.durationMs).sort((a, b) => a - b);
    return {
      requests: rows.length,
      medianMs: (times[2] + times[3]) / 2,
      minMs: times[0],
      maxMs: times.at(-1),
      historyReadsPerRequest: rows[0].stages.record_read.calls,
      permissionChecksPerRequest: rows[0].stages.permission.calls,
    };
  };
  console.info(
    JSON.stringify({
      event: "s185_emulator_history_measurement",
      scope:
        "same three actual app-history lookups inside one request; external source and provider reads excluded",
      uncachedReference: summarize("maintenance_read"),
      composition: summarize("communications_prepare"),
    }),
  );
  await expect(
    observeStaffOperation(
      "communications_prepare",
      0,
      () => f.service.get({ ...actor, hd: "unexpected.invalid" }, f.draft.id),
      () => undefined,
    ),
  ).rejects.toMatchObject({ status: 403 });
  const changed = await f.service.save(
    actor,
    {
      ...f.draft,
      initial: plainCommunicationMessage(
        "New current draft",
        "Fresh on the next request",
      ),
    },
    1,
    randomUUID(),
  );
  await observeStaffOperation(
    "communications_prepare",
    0,
    async () =>
      expect((await f.service.get(actor, f.draft.id)).version).toBe(changed.version),
    () => undefined,
  );
  await observeStaffOperation(
    "maintenance_provider_update",
    1,
    async () => {
      read.mockClear();
      await f.service.get(actor, f.draft.id);
      await f.service.get(actor, f.draft.id);
      expect(read).toHaveBeenCalledTimes(2);
    },
    () => undefined,
  );
  expect(f.send).not.toHaveBeenCalled();
});

it("S224 actual profile transactions feed signature provenance; profile edits preserve approved bytes and team takeover needs the new sender's own signature", async () => {
  const admin = { ...actor, role: "Admin" as const };
  async function profile(
    who: typeof actor,
    expectedVersion = 0,
    title = "Property Manager",
  ) {
    const result = await savePresentationSetting(
      admin,
      {
        op: "save_profile",
        uid: who.uid,
        expectedVersion,
        operationId: randomUUID(),
        reason: "Synthetic profile review",
        profile: {
          name: who.uid,
          businessTitle: title,
          phone: "",
          hours: "",
          website: "",
          source: "staff-review:synthetic-profile",
        },
      },
      {
        db,
        verifyStaff: async (uid) => ({
          uid,
          email: who.email,
          emailVerified: true,
          disabled: false,
        }),
      },
    );
    expect(result.state).toBe("committed");
    return (await readBusinessProfile(who, who.uid, db))!;
  }
  const f = fixture(),
    first = await profile(actor),
    teammate = await profile(other);
  f.draft.initial = applyBusinessSignature(f.draft.initial, first, actor.email);
  const authorized = await f.approve(),
    before = JSON.stringify(authorized.authorization);
  expect(authorized.authorization?.initial.signature).toMatchObject({
    uid: actor.uid,
    version: 1,
    email: actor.email,
  });
  const current = await profile(actor, 1, "Reviewed new title");
  const restarted = fixture();
  expect(
    JSON.stringify((await restarted.service.get(actor, authorized.id)).authorization),
  ).toBe(before);
  const future = await restarted.service.save(
    actor,
    {
      ...f.draft,
      id: randomUUID(),
      initial: applyBusinessSignature(
        plainCommunicationMessage("Future work", "Synthetic future wording"),
        current,
        actor.email,
      ),
    },
    0,
    randomUUID(),
  );
  expect(future.signatureSnapshots?.initial).toMatchObject({
    version: 2,
    email: actor.email,
  });
  expect(future.signatureSnapshots?.initial?.text).toContain("Reviewed new title");
  const transferred = await restarted.service.control(other, {
    id: authorized.id,
    expectedVersion: authorized.version,
    operationId: randomUUID(),
    action: "transfer",
    responsibleUid: other.uid,
  });
  const authorize = (value: typeof transferred) =>
    restarted.service.authorize(other, {
      id: value.id,
      expectedVersion: value.version,
      operationId: randomUUID(),
      action: "send",
      schedule: null,
      reviewedDraftHash: sequenceHash({
        initial: value.initial,
        followUp: value.followUp,
      }),
      reviewedTargetHash: sequenceHash({
        to: ["owner@example.invalid"],
        cc: [],
        materialSourceHash: "a".repeat(64),
      }),
    });
  await expect(authorize(transferred)).rejects.toThrow("another staff sender");
  const edited = await restarted.service.save(
    other,
    {
      id: transferred.id,
      context: transferred.context,
      followUp: transferred.followUp,
      initial: applyBusinessSignature(
        transferred.initial,
        teammate,
        other.email,
        transferred.signatureSnapshots?.initial?.text,
      ),
    },
    transferred.version,
    randomUUID(),
  );
  expect(edited.signatureSnapshots?.initial).toMatchObject({
    uid: other.uid,
    email: other.email,
    version: 1,
  });
  expect((await authorize(edited)).authorization?.initial.signature?.email).toBe(
    other.email,
  );
  const versions = await db.collection("staff_business_profile_versions").get();
  expect(versions.size).toBe(3);
  expect(
    JSON.stringify((await restarted.service.get(actor, authorized.id)).authorization),
  ).not.toBe(before);
  expect(f.send).not.toHaveBeenCalled();
  expect(restarted.send).not.toHaveBeenCalled();
});
