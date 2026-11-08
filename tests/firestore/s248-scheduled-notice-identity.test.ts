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
import { publishSuppliedRenewalTemplate } from "@/lib/firestore/renewal-message-publication";
import { saveSenderSignatureChoice } from "@/lib/firestore/renewal-sender-signature-choice";
import { saveRenewalWorkingField } from "@/lib/firestore/renewal-working-record";

// S248 L39 root cause, against the real Firestore emulator, the real notice safety marker and the
// real renewal target (`resolveCommunicationTarget`, which reads the lease through the admitted
// notice source exactly as the minute worker does), with an isolated mail client.
//
// A scheduled owner message is bound to the material facts it was reviewed on. Every provider
// source read anywhere raises every notice marker's admission version, so binding that version
// paused every scheduled message on its first due tick after any read. The material identity is the
// notice's scope and semantic hash: an unrelated read changes nothing and the message is sent and
// recorded as the outreach, while an observed notice, a recorded notice later withdrawn (reviewed or
// not) and an admitted read in flight at dispatch each still pause it before any send.

const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  notice: false,
  /** Another reader's admission landing during every provider read while set. */
  churn: null as null | (() => Promise<unknown>),
  /** Another reader's admission landing once, after the read was accepted, before it settles. */
  beforeObservation: null as null | (() => Promise<unknown>),
  leaseReads: 0,
  actor: {
    uid: "synthetic-scheduled-notice",
    email: "synthetic-scheduled-notice@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  } as AuthenticatedUser,
}));
vi.mock("@/lib/firestore/admin", () => ({ getAdminFirestore: () => state.db }));
vi.mock("@/lib/auth/session", async (original) => {
  const actual = await original<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireCapabilityInSpace: async () => state.actor,
    requireCapability: async () => state.actor,
  };
});
vi.mock("@/lib/lease-renewal/live-config", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/live-config")>();
  const { withFakeLeaseDetail } = await import("@/tests/helpers/rentvine-detail-fake");
  const reader = withFakeLeaseDetail({
    listAllLeasesExport: async () => {
      state.leaseReads++;
      // Another reader's admission lands after this read was admitted and before it settles.
      if (state.churn) await state.churn();
      return {
        complete: true,
        pages: 1,
        rows: [
          {
            lease: {
              leaseID: 9701,
              leaseStatusID: state.notice ? "3" : "2",
              endDate: "2027-01-31",
              baseRentAmount: 1234,
              noticeDate: state.notice ? "2026-11-03" : null,
              expectedMoveOutDate: null,
              moveOutDate: null,
              tenants: [
                {
                  contactID: "19701",
                  name: "Synthetic Tenant",
                  firstName: "Synthetic",
                  email: "tenant@fixture.invalid",
                },
              ],
            },
            unit: { unitID: "29701" },
            property: { streetName: "9701 Synthetic Fixture Avenue" },
            portfolio: {
              owners: [{ name: "Synthetic Owner", email: "owner@fixture.invalid" }],
            },
          },
        ],
      };
    },
    listLeaseStatuses: async () => [
      {
        leaseStatusID: "2",
        name: "Synthetic Active",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: false,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: true,
      },
      {
        leaseStatusID: "3",
        name: "Synthetic notice",
        primaryLeaseStatusID: "2",
        isPendingMoveOutStatus: true,
        isCompletedMoveOutStatus: false,
        isPendingMoveInStatus: false,
        isSystemStatus: false,
      },
    ],
  });
  return {
    ...actual,
    buildLiveRentVineConfig: () => ({ ok: true, rentvineClient: reader }),
    buildLiveRenewalConfig: () => ({
      ok: false,
      reason: "synthetic_optional_source_not_configured",
    }),
  };
});
// The real notice store, with one seam: a test may land another reader's admission after the
// dispatch's read was accepted and before its observation settles (an interleaving production can
// produce at any time). Admission, observation and version semantics are the real ones.
vi.mock("@/lib/firestore/renewal-notice-safety", async (original) => {
  const actual = await original<typeof import("@/lib/firestore/renewal-notice-safety")>();
  return {
    ...actual,
    observeRenewalNotice: async (
      ...args: Parameters<typeof actual.observeRenewalNotice>
    ) => {
      const hook = state.beforeObservation;
      state.beforeObservation = null;
      if (hook) await hook();
      return actual.observeRenewalNotice(...args);
    },
  };
});
// Every real Gmail effect is an unexpected test failure; the service below has its own client.
vi.mock("@/lib/gmail-hub/dependencies", async (original) => ({
  ...(await original<typeof import("@/lib/gmail-hub/dependencies")>()),
  createDescriptorBoundGmailRuntimeClient: () => {
    throw new Error("No real Gmail effect in this test");
  },
}));

import {
  GET as noticeReviewGet,
  POST as noticeReviewPost,
} from "@/app/api/lease-renewal/notice-review/route";
import {
  noticeSafetyMarkerRef,
  withRenewalNoticeAdmission,
} from "@/lib/firestore/renewal-notice-safety";
import {
  RENEWAL_OUTREACH_RECORD_COLLECTION,
  outreachRecordForAcceptedSend,
  readLeaseOutreachEvidence,
  writeRenewalOutreachRecord,
} from "@/lib/firestore/renewal-outreach-records";
import {
  prepareWorkflowComposition,
  resolveCommunicationTarget,
} from "@/lib/gmail-hub/sequence-dependencies";
import { WorkflowCommunicationSequenceService } from "@/lib/gmail-hub/sequence-service";
import {
  FirestoreCommunicationSequenceStore,
  reviewedCommunicationTargetHash,
  sequenceHash,
} from "@/lib/gmail-hub/sequence-store";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
import { WorkflowCommunicationContextSchema } from "@/lib/gmail-hub/workflow-context";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";
import { currentRenewalMessage } from "@/lib/lease-renewal/current-renewal-message";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";
import { projectOutreachEvidence } from "@/lib/lease-renewal/outreach-evidence";

const projectId = "demo-pmi-s248-scheduled-notice-identity";
const LEASE = "9701";
const publisher: AuthenticatedUser = {
  ...state.actor,
  uid: "synthetic-notice-publisher",
  email: "synthetic-notice-publisher@pmikcmetro.com",
  role: "Admin",
};
let app: App, db: Firestore, testEnv: RulesTestEnvironment;

function clearSources() {
  clearLiveLeaseCache();
  clearLeaseStatusTableCache();
}

const context = WorkflowCommunicationContextSchema.parse({
  lane: "renewals",
  entityType: "renewal_lease",
  entityId: LEASE,
  purpose: "renewal_owner",
  actionKey: "gmail.renewal_notice.send",
  sourceRefs: [`rentvine:lease:${LEASE}`],
});

function fixture() {
  const clock = { ms: Date.now() };
  const store = new FirestoreCommunicationSequenceStore(db);
  const sent = new Map<
    string,
    { messageId: string; threadId: string; labelIds: string[]; sentAtMs: number }
  >();
  const send = vi.fn(async (message: WorkflowMimeMessage) => {
    const result = {
      messageId: `provider-${sent.size + 1}`,
      threadId: "provider-thread",
      labelIds: ["SENT"],
      sentAtMs: clock.ms,
    };
    sent.set(message.messageId, result);
    return result;
  });
  const service = new WorkflowCommunicationSequenceService({
    store,
    // The worker's own target: the lease read through the admitted notice source.
    resolveTarget: resolveCommunicationTarget,
    resolveAttachment: async () => {
      throw new Error("No fixture attachments");
    },
    readActor: async () => state.actor,
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
      getThread: async (id) => ({ id, messages: [], truncated: false }),
      sendWorkflowMessage: send,
      findWorkflowMessage: async (id) => sent.get(id) ?? null,
    }),
    recordAcceptedSend: async (sequence, occurrence, sentAtMs) => {
      const record = outreachRecordForAcceptedSend(
        sequence,
        occurrence,
        sentAtMs,
        Date.now(),
      );
      if (record) await writeRenewalOutreachRecord(record, db);
    },
  });

  /** Review the composition and schedule it for tomorrow morning, as staff do. */
  async function schedule(): Promise<CommunicationSequence> {
    // Give the Editor a reviewed owner message before testing source changes during dispatch.
    await publishSuppliedRenewalTemplate(publisher, "owner", db);
    await saveSenderSignatureChoice(
      state.actor,
      { expectedRevision: 0, operationId: randomUUID(), signature: null },
      db,
    );
    await saveRenewalWorkingField(
      state.actor,
      {
        leaseId: LEASE,
        field: "terms_rent",
        value: 1150,
        expectedRevision: 0,
        operationId: randomUUID(),
      },
      db,
    );
    const composition = await prepareWorkflowComposition(state.actor, context);
    expect(composition.target.blockers).toEqual([]);
    const saved = await service.save(
      state.actor,
      { id: randomUUID(), context, initial: composition.initial, followUp: null },
      0,
      randomUUID(),
    );
    const tomorrow = new Date(clock.ms + 86_400_000).toLocaleDateString("en-CA", {
      timeZone: "America/Chicago",
    });
    const scheduled = await service.authorize(state.actor, {
      id: saved.id,
      expectedVersion: saved.version,
      operationId: randomUUID(),
      action: "schedule",
      schedule: {
        firstDate: tomorrow,
        time: "09:00",
        timeZone: "America/Chicago",
        everyDays: null,
        endDate: null,
        sendLimit: 1,
      },
      reviewedDraftHash: sequenceHash({
        initial: saved.initial,
        followUp: saved.followUp,
      }),
      reviewedTargetHash: reviewedCommunicationTargetHash(composition.target),
    });
    expect(scheduled.state).toBe("active");
    expect(scheduled.nextDueAtMs).toBeGreaterThan(clock.ms);
    return scheduled;
  }

  /** One due tick for this message: the worker's dispatch once its time has come. */
  async function dueTick(sequence: CommunicationSequence) {
    clock.ms = Math.max(clock.ms, (sequence.nextDueAtMs ?? clock.ms) + 60_000);
    return service.dispatch(sequence.id);
  }

  return { service, store, send, schedule, dueTick };
}

async function markerVersion(): Promise<number> {
  const snapshot = await noticeSafetyMarkerRef(db, LEASE).get();
  return Number(snapshot.get("version"));
}

async function outreachRecords() {
  return (await db.collection(RENEWAL_OUTREACH_RECORD_COLLECTION).get()).docs.map((doc) =>
    doc.data(),
  );
}

async function currentNoticeBasis() {
  const response = await noticeReviewGet(
    new Request(
      `http://fixture.invalid/api/lease-renewal/notice-review?leaseId=${LEASE}`,
    ),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  return body.basis as { scopeHash: string; version: number; semanticHash: string };
}

async function review(action: "record_notice" | "review_withdrawal") {
  const expected = await currentNoticeBasis();
  const response = await noticeReviewPost(
    new Request("http://fixture.invalid/api/lease-renewal/notice-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leaseId: LEASE,
        operationId: randomUUID(),
        expected,
        action,
        reason: "Synthetic staff review of the provider notice evidence.",
      }),
    }),
  );
  expect(response.status).toBe(200);
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s248-scheduled-notice-${process.pid}`);
  db = getFirestore(app);
  state.db = db;
  vi.stubEnv("ENVIRONMENT_KIND", "production");
  vi.stubEnv("DATA_CONTEXT", "live");
});
beforeEach(async () => {
  vi.useRealTimers();
  await testEnv.clearFirestore();
  clearSources();
  state.notice = false;
  state.churn = null;
  state.beforeObservation = null;
  state.leaseReads = 0;
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

describe("S248 L39: a scheduled renewal message keeps its notice identity across reads", () => {
  it("an unrelated provider read raises the notice marker version, and the due message is still sent and recorded as the outreach", async () => {
    const f = fixture();
    const scheduled = await f.schedule();
    const authorizedVersion = await markerVersion();
    // An unrelated provider read: the tenant message for the same lease is prepared on a cold
    // cache, so the admission raises every notice marker's version before RentVine is read.
    clearSources();
    const reads = state.leaseReads;
    await currentRenewalMessage(state.actor, LEASE, "tenant", db);
    expect(state.leaseReads).toBe(reads + 1);
    expect(await markerVersion()).toBeGreaterThan(authorizedVersion);

    const result = await f.dueTick(scheduled);
    expect(result.status).toBe("sent");
    expect(result.sequence.pause).toBeNull();
    expect(f.send).toHaveBeenCalledTimes(1);
    // The accepted message is the lease's owner outreach.
    const records = await outreachRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      origin: "app_send",
      leaseId: LEASE,
      audience: "owner",
      sequenceId: scheduled.id,
    });
    const evidence = projectOutreachEvidence(await readLeaseOutreachEvidence(LEASE, db), {
      cycleId: "no-work-record",
      unscoped: () => true,
    });
    expect(evidence.owner.state).toBe("accepted");
  });

  it("a notice observed for the lease after scheduling pauses the due message before any send", async () => {
    const f = fixture();
    const scheduled = await f.schedule();
    state.notice = true;
    clearSources();
    const result = await f.dueTick(scheduled);
    expect(result.status).toBe("paused");
    expect(result.sequence.pause?.cause).toBe("changed_source");
    expect(f.send).not.toHaveBeenCalled();
    expect(await outreachRecords()).toHaveLength(0);
  });

  it("a notice observed by a due tick keeps the message paused after RentVine withdraws it", async () => {
    const f = fixture();
    const scheduled = await f.schedule();
    state.notice = true;
    clearSources();
    expect((await f.dueTick(scheduled)).status).toBe("paused");
    state.notice = false;
    clearSources();
    const later = await f.dueTick(scheduled);
    expect(later.status).not.toBe("sent");
    expect(later.sequence.state).toBe("paused");
    expect(f.send).not.toHaveBeenCalled();
  });

  it("a recorded notice later withdrawn never sends under the old authorization, before or after the withdrawal review", async () => {
    // Withdrawn, not yet reviewed: the notice still blocks outreach.
    const unreviewed = fixture();
    const first = await unreviewed.schedule();
    state.notice = true;
    clearSources();
    await review("record_notice");
    state.notice = false;
    clearSources();
    const held = await unreviewed.dueTick(first);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause?.cause).toBe("changed_source");
    expect(unreviewed.send).not.toHaveBeenCalled();

    // Withdrawn and reviewed: nothing blocks a fresh review, yet the old authorization was given
    // on different notice evidence, so the message it covers still pauses.
    await testEnv.clearFirestore();
    clearSources();
    const reviewed = fixture();
    const second = await reviewed.schedule();
    state.notice = true;
    clearSources();
    await review("record_notice");
    state.notice = false;
    clearSources();
    await review("review_withdrawal");
    const composition = await prepareWorkflowComposition(state.actor, context);
    expect(composition.target.blockers).toEqual([]);
    const result = await reviewed.dueTick(second);
    expect(result.status).toBe("paused");
    expect(result.sequence.pause?.cause).toBe("changed_source");
    expect(reviewed.send).not.toHaveBeenCalled();
    expect(await outreachRecords()).toHaveLength(0);
  });

  it("an admitted read still in flight when the due message is checked pauses it before any send", async () => {
    const f = fixture();
    const scheduled = await f.schedule();
    clearSources();
    // The dispatch's read was accepted, then another reader's admission lands before the
    // observation settles: the marker is pending a newer generation than the one the dispatch read.
    state.beforeObservation = () =>
      withRenewalNoticeAdmission(state.actor, {}, db).beforeLeaseSourceRead(Date.now());
    const result = await f.dueTick(scheduled);
    expect(state.beforeObservation).toBeNull();
    expect(result.status).toBe("paused");
    expect(result.sequence.pause?.cause).toBe("changed_source");
    expect(f.send).not.toHaveBeenCalled();
  });

  it("admissions that keep landing during the dispatch's own reads hold the due message without a send", async () => {
    const f = fixture();
    const scheduled = await f.schedule();
    clearSources();
    state.churn = () =>
      withRenewalNoticeAdmission(state.actor, {}, db).beforeLeaseSourceRead(Date.now());
    const result = await f.dueTick(scheduled);
    state.churn = null;
    expect(["paused", "awaiting_source"]).toContain(result.status);
    expect(f.send).not.toHaveBeenCalled();
    expect(await outreachRecords()).toHaveLength(0);
  });
});
