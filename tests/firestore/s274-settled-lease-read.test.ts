import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { publishSuppliedRenewalTemplate } from "@/lib/firestore/renewal-message-publication";
import { saveSenderSignatureChoice } from "@/lib/firestore/renewal-sender-signature-choice";
import { saveRenewalWorkingField } from "@/lib/firestore/renewal-working-record";

// S274, against the real Firestore emulator, the real notice safety marker and the real renewal
// target (`resolveCommunicationTarget`), with an isolated mail client. A reviewed message is
// refused at Send, or held at its due time, only when a fact it was reviewed on really changed. A
// lease read still in progress makes the app wait:
// - ARCH-S274-1 / AC-S274-1: an admission that commits after the floor reads and before the notice
//   observation no longer refuses the confirm as "changed"; the confirm joins the read and the
//   message is authorized. The same holds for a lease with a saved retirement record whose read is
//   no longer fresh.
// - BEH-S274-5 / AC-S274-2: a read that never settles inside the bound answers the typed "still
//   reading" result, with nothing sent, authorized or paused.
// - AC-S274-3 / AC-S274-5 / R-S274-7: a due message checked during an admitted read waits (no
//   claim, send or pause) and the worker counts the wait; a settled difference then pauses it with
//   the changed inputs stored; a conflict between settled generations still pauses.

const state = vi.hoisted(() => ({
  db: null as Firestore | null,
  notice: false,
  /** Another reader's admission landing once, after the read was accepted, before it settles. */
  beforeObservation: null as null | (() => Promise<unknown>),
  /** The same, landing before every observation while set. */
  everyObservation: null as null | (() => Promise<unknown>),
  leaseReads: 0,
  actor: {
    uid: "synthetic-settled-read",
    email: "synthetic-settled-read@pmikcmetro.com",
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
      return {
        complete: true,
        pages: 1,
        rows: [
          {
            lease: {
              leaseID: 9742,
              leaseStatusID: state.notice ? "3" : "2",
              endDate: "2027-01-31",
              baseRentAmount: 1234,
              noticeDate: state.notice ? "2026-11-03" : null,
              expectedMoveOutDate: null,
              moveOutDate: null,
              tenants: [
                {
                  contactID: "19742",
                  name: "Synthetic Tenant",
                  firstName: "Synthetic",
                  email: "tenant@fixture.invalid",
                },
              ],
            },
            unit: { unitID: "29742" },
            property: { streetName: "9742 Synthetic Fixture Avenue" },
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
// The real notice store, with one seam: a test may land another reader's admission (or another
// instance's settled observation) after the read was accepted and before its observation settles.
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
      if (state.everyObservation) await state.everyObservation();
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
  noticeSafetyMarkerRef,
  withRenewalNoticeAdmission,
} from "@/lib/firestore/renewal-notice-safety";
import { RENEWAL_CYCLE_DISPOSITIONS } from "@/lib/firestore/renewal-cycle-disposition-read";
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
import {
  CommunicationWorkerStore,
  runCommunicationWorker,
} from "@/lib/gmail-hub/sequence-worker";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
import {
  LEASE_READ_NOT_SETTLED_MESSAGE,
  LeaseReadNotSettledError,
} from "@/lib/gmail-hub/reviewed-inputs";
import { WorkflowCommunicationContextSchema } from "@/lib/gmail-hub/workflow-context";
import type { WorkflowMimeMessage } from "@/lib/gmail-runtime/workflow-mime";
import { clearLeaseStatusTableCache } from "@/lib/lease-renewal/lease-status-table";
import { clearLiveLeaseCache } from "@/lib/lease-renewal/live-lease-cache";

const projectId = "demo-pmi-s274-settled-lease-read";
const LEASE = "9742";
const publisher: AuthenticatedUser = {
  ...state.actor,
  uid: "synthetic-settled-read-publisher",
  email: "synthetic-settled-read-publisher@pmikcmetro.com",
  role: "Admin",
};
let app: App, db: Firestore, testEnv: RulesTestEnvironment;
/** Moves the app's clock forward without fake timers (the cache reads Date.now()). */
let clockOffsetMs = 0;
const realNow = Date.now.bind(Date);
let nowSpy: { mockRestore(): void } | null = null;

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

/** Another reader's admission: every notice marker is raised to a pending, newer generation. */
const admission = () =>
  withRenewalNoticeAdmission(state.actor, {}, db).beforeLeaseSourceRead(Date.now());

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
  const waits: number[] = [];
  const service = new WorkflowCommunicationSequenceService({
    store,
    resolveTarget: resolveCommunicationTarget,
    // The bound is counted, not slept: each re-read follows at once.
    waitForLeaseRead: async (ms) => {
      waits.push(ms);
    },
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
  });

  /** Give the Editor a reviewed owner message, then review its composition as staff do. */
  async function review() {
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
    return { composition, saved };
  }

  async function confirm(
    action: "send" | "schedule",
    reviewed: Awaited<ReturnType<typeof review>>,
  ) {
    const tomorrow = new Date(clock.ms + 86_400_000).toLocaleDateString("en-CA", {
      timeZone: "America/Chicago",
    });
    return service.authorize(state.actor, {
      id: reviewed.saved.id,
      expectedVersion: reviewed.saved.version,
      operationId: randomUUID(),
      action,
      schedule:
        action === "schedule"
          ? {
              firstDate: tomorrow,
              time: "09:00",
              timeZone: "America/Chicago",
              everyDays: null,
              endDate: null,
              sendLimit: 1,
            }
          : null,
      reviewedDraftHash: sequenceHash({
        initial: reviewed.saved.initial,
        followUp: reviewed.saved.followUp,
      }),
      reviewedTargetHash: reviewedCommunicationTargetHash(reviewed.composition.target),
      reviewedInputs: reviewed.composition.target.reviewedInputs ?? null,
    });
  }

  async function schedule(): Promise<CommunicationSequence> {
    const scheduled = await confirm("schedule", await review());
    expect(scheduled.state).toBe("active");
    return scheduled;
  }

  /** One due tick for this message: the worker's dispatch once its time has come. */
  async function dueTick(sequence: CommunicationSequence) {
    clock.ms = Math.max(clock.ms, (sequence.nextDueAtMs ?? clock.ms) + 60_000);
    return service.dispatch(sequence.id);
  }

  return { service, store, send, waits, clock, review, confirm, schedule, dueTick };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s274-settled-lease-read-${process.pid}`);
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
  state.beforeObservation = null;
  state.everyObservation = null;
  state.leaseReads = 0;
  clockOffsetMs = 0;
});
afterEach(() => {
  nowSpy?.mockRestore();
  nowSpy = null;
});
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
  vi.unstubAllEnvs();
});

describe("S274 ARCH-S274-1: confirm resolves its target on a settled read", () => {
  it("ARCH-S274-1 / AC-S274-1: an admission committed between the floor reads and the notice observation no longer refuses the confirm; the message is authorized", async () => {
    const f = fixture();
    const reviewed = await f.review();
    // Fail-first on the starting state: this interleaving answered 409 "The recipients or source
    // facts changed after the preview" with nothing edited (audit A-04, baseline W12-03).
    state.beforeObservation = admission;
    const authorized = await f.confirm("schedule", reviewed);
    expect(state.beforeObservation).toBeNull();
    expect(authorized.state).toBe("active");
    expect(authorized.authorization).not.toBeNull();
    // The confirm read once more within its bound.
    expect(f.waits).toEqual([1_500]);
    expect(f.send).not.toHaveBeenCalled();
  });

  it("R-S274-2 / AC-S274-1: on a lease with a saved retirement record, a confirm after the read went stale is authorized", async () => {
    const f = fixture();
    await db
      .collection(RENEWAL_CYCLE_DISPOSITIONS)
      .doc(LEASE)
      .set({
        leaseId: LEASE,
        cycle: { kind: "lease_end", dateIso: "2027-01-31", cycleId: null },
        revision: 2,
        action: "restore",
        reason: "Synthetic retire and restore for the settled-read check.",
        actorUid: state.actor.uid,
        at: new Date().toISOString(),
        operationId: randomUUID(),
      });
    const reviewed = await f.review();
    // The review open past the 60 second lease read window, as in the rehearsal.
    clockOffsetMs = 61_000;
    nowSpy = vi.spyOn(Date, "now").mockImplementation(() => realNow() + clockOffsetMs);
    const authorized = await f.confirm("schedule", reviewed);
    expect(authorized.state).toBe("active");
    expect(f.send).not.toHaveBeenCalled();
  });

  it("BEH-S274-5 / AC-S274-2: a read kept unsettled past the bound answers the typed still-reading result, and nothing is sent, authorized or paused", async () => {
    const f = fixture();
    const reviewed = await f.review();
    const markerBefore = (await noticeSafetyMarkerRef(db, LEASE).get()).data();
    expect(markerBefore).toBeDefined();
    state.everyObservation = admission;
    const refusal = f.confirm("send", reviewed);
    await expect(refusal).rejects.toBeInstanceOf(LeaseReadNotSettledError);
    await expect(refusal).rejects.toThrow(LEASE_READ_NOT_SETTLED_MESSAGE);
    state.everyObservation = null;
    expect(f.waits).toEqual([1_500, 3_000, 5_000]);
    const after = await f.store.get(reviewed.saved.id);
    expect(after?.authorization).toBeNull();
    expect(after?.pause).toBeNull();
    expect(after?.version).toBe(reviewed.saved.version);
    expect(f.send).not.toHaveBeenCalled();
  });
});

describe("S274 ARCH-S274-2: the worker waits on an unsettled read and holds only a settled difference", () => {
  it("AC-S274-5 / BEH-S274-4: after a wait, a settled difference pauses the message with the changed inputs stored", async () => {
    const f = fixture();
    const scheduled = await f.schedule();
    clearSources();
    state.beforeObservation = admission;
    const waited = await f.dueTick(scheduled);
    expect(waited.status).toBe("awaiting_source");
    expect(waited.waitedOnLeaseRead).toBe(true);
    expect(waited.sequence.pause).toBeNull();
    // A real change lands: the provider now reports a notice for the lease.
    state.notice = true;
    clearSources();
    const held = await f.dueTick(scheduled);
    expect(held.status).toBe("paused");
    expect(held.sequence.pause?.cause).toBe("changed_source");
    const keys = (held.sequence.pause?.changedInputs ?? []).map((change) => change.key);
    expect(keys).toContain("notice");
    expect(keys.some((key) => key.startsWith("hold:"))).toBe(true);
    expect(f.send).not.toHaveBeenCalled();
  });

  it("AC-S274-3: a conflict between settled generations still pauses the due message", async () => {
    const f = fixture();
    const scheduled = await f.schedule();
    clearSources();
    // Another instance settled a newer generation with different notice facts before this
    // dispatch's older observation: a source generation conflict, not a read in flight.
    state.beforeObservation = async () => {
      const ref = noticeSafetyMarkerRef(db, LEASE);
      const marker = (await ref.get()).data() as {
        version: number;
        sourceReadAt: { lease: number; status: number };
      };
      await ref.set({
        ...marker,
        version: marker.version + 1,
        semanticHash: "c".repeat(64),
        sourceReadAt: {
          lease: marker.sourceReadAt.lease + 60_000,
          status: marker.sourceReadAt.status + 60_000,
        },
      });
    };
    const result = await f.dueTick(scheduled);
    expect(result.status).toBe("paused");
    expect(result.waitedOnLeaseRead).toBeUndefined();
    expect(result.sequence.pause?.cause).toBe("changed_source");
    expect(f.send).not.toHaveBeenCalled();
  });

  it("R-S274-7 / AC-S274-3: the worker's last-run counts show the wait, hold none and name no record or address", async () => {
    const f = fixture();
    const scheduled = await f.schedule();
    clearSources();
    f.clock.ms = (scheduled.nextDueAtMs ?? f.clock.ms) + 60_000;
    state.beforeObservation = admission;
    const workers = new CommunicationWorkerStore(db);
    const first = await runCommunicationWorker({
      service: f.service,
      store: workers,
      now: () => f.clock.ms,
    });
    expect(first).toMatchObject({ sent: 0, held: 0, waitedOnLeaseRead: 1 });
    const lastRun = await workers.readLastRun(f.clock.ms);
    expect(lastRun?.counts).toMatchObject({ waitedOnLeaseRead: 1, held: 0 });
    expect(JSON.stringify(lastRun)).not.toMatch(/@|fixture|Synthetic/);
    expect((await f.store.get(scheduled.id))?.pause).toBeNull();
    f.clock.ms += 60_000;
    const second = await runCommunicationWorker({
      service: f.service,
      store: workers,
      now: () => f.clock.ms,
    });
    expect(second).toMatchObject({ sent: 1, held: 0, waitedOnLeaseRead: 0 });
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});
