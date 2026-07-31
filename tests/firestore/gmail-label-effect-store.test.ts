import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  claimActionExecution,
  getActionExecution,
  prepareActionExecutionRecord,
} from "@/lib/firestore/action-executions";
import {
  FirestoreGmailLabelEffectStore,
  GMAIL_LABEL_EFFECT_COLLECTION,
} from "@/lib/firestore/gmail-label-effects";
import {
  hashGmailLabelSnapshot,
  type GmailLabelSnapshotDraft,
} from "@/lib/gmail-hub/label-contract";

/**
 * Real-emulator proof of the properties an in-memory Firestore structurally cannot show: that the
 * S20 one-attempt claim is genuinely atomic under contention, and that the label effect's two
 * transactional fences hold against the committed ledger.
 */

const projectId = "pmi-kc-kb-gmail-label-effect-store-test";
const actor: AuthenticatedUser = {
  uid: "user-josiah",
  email: "josiah@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Approver",
};

let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `gmail-label-effect-store-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

const previewHash = "a".repeat(64);
const contextHash = "b".repeat(64);

function draft(
  overrides: Partial<GmailLabelSnapshotDraft> = {},
): GmailLabelSnapshotDraft {
  return {
    schemaVersion: 1,
    s20ExecutionId: "",
    actionKey: "gmail.label.apply",
    kind: "apply",
    actorUid: actor.uid,
    mailboxKeyHash: "c".repeat(64),
    linkId: "link-1",
    threadId: "thread-1",
    label: "Waiting on Team",
    labelId: "Label_team",
    ruleRef: "manual-human-review:v1",
    reasonHash: "d".repeat(64),
    previewHash,
    contextHash,
    priorGovernedLabelIds: [],
    priorGovernedLabels: [],
    dataMode: "live",
    createdAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

async function prepareExecution() {
  const record = await prepareActionExecutionRecord(
    actor,
    {
      classification: {
        actionKey: "gmail.label.apply",
        blockers: [],
        defaultRisk: "Low",
        kind: "governed_label",
        requiresActionRegistry: true,
        risk: "Low",
      },
      idempotencyKey: "gmail-label-thread-1-waiting-on-team",
      idempotencyPrincipal: "gmail-label-effect",
      contextHash,
      previewHash,
      scopeRef: "gmail-label:maintenance:maintenance_ticket:ticket-1:maintenance_owner",
    },
    db,
  );
  return record.id;
}

describe("gmail.label.apply — atomic one-attempt claim", () => {
  it("lets exactly one of several concurrent claims win", async () => {
    const executionId = await prepareExecution();

    // Three contenders is enough to prove serialization; more only multiplies emulator
    // transaction-retry backoff without strengthening the property.
    const outcomes = await Promise.allSettled(
      Array.from({ length: 3 }, () =>
        claimActionExecution(actor, executionId, previewHash, db, contextHash),
      ),
    );

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(
      outcomes.every(
        (outcome) =>
          outcome.status === "fulfilled" ||
          /already has an attempt/.test(String(outcome.reason?.message)),
      ),
    ).toBe(true);
    expect(await getActionExecution(actor, executionId, db)).toMatchObject({
      attempt_count: 1,
      state: "Executing",
      claim_actor_uid: actor.uid,
    });
  }, 30_000);
});

describe("gmail.label.apply — durable effect snapshot fences", () => {
  it("persists the pre-effect snapshot only while the S20 attempt is unclaimed", async () => {
    const executionId = await prepareExecution();
    const store = new FirestoreGmailLabelEffectStore(db);

    const snapshot = await store.persistPrepared(
      actor,
      draft({ s20ExecutionId: executionId }),
    );

    expect(snapshot).toMatchObject({ state: "prepared", s20ExecutionId: executionId });
    expect(snapshot.snapshotHash).toBe(
      hashGmailLabelSnapshot(draft({ s20ExecutionId: executionId })),
    );
  });

  it("refuses a snapshot created after the attempt was already claimed", async () => {
    const executionId = await prepareExecution();
    await claimActionExecution(actor, executionId, previewHash, db, contextHash);

    await expect(
      new FirestoreGmailLabelEffectStore(db).persistPrepared(
        actor,
        draft({ s20ExecutionId: executionId }),
      ),
    ).rejects.toThrow(/must be persisted before the S20 attempt is claimed/);
  });

  it("refuses a provider start that is not downstream of the claim", async () => {
    const executionId = await prepareExecution();
    const store = new FirestoreGmailLabelEffectStore(db);
    const snapshot = await store.persistPrepared(
      actor,
      draft({ s20ExecutionId: executionId }),
    );

    // Unclaimed: an out-of-band call cannot turn a preparation into a Live effect.
    await expect(
      store.markProviderStarted(actor, {
        s20ExecutionId: executionId,
        snapshotHash: snapshot.snapshotHash,
        claimActorUid: actor.uid,
      }),
    ).rejects.toThrow(/may start only from the exact claimed S20 execution/);

    await claimActionExecution(actor, executionId, previewHash, db, contextHash);

    // Claimed, but by a different principal than the one presented.
    await expect(
      store.markProviderStarted(actor, {
        s20ExecutionId: executionId,
        snapshotHash: snapshot.snapshotHash,
        claimActorUid: "user-someone-else",
      }),
    ).rejects.toThrow(/may start only from the exact claimed S20 execution/);

    await expect(
      store.markProviderStarted(actor, {
        s20ExecutionId: executionId,
        snapshotHash: snapshot.snapshotHash,
        claimActorUid: actor.uid,
      }),
    ).resolves.toMatchObject({ state: "provider_started" });
  });

  it("refuses a settle whose observed set contradicts an already settled one", async () => {
    const executionId = await prepareExecution();
    const store = new FirestoreGmailLabelEffectStore(db);
    const snapshot = await store.persistPrepared(
      actor,
      draft({ s20ExecutionId: executionId }),
    );
    await claimActionExecution(actor, executionId, previewHash, db, contextHash);
    await store.markProviderStarted(actor, {
      s20ExecutionId: executionId,
      snapshotHash: snapshot.snapshotHash,
      claimActorUid: actor.uid,
    });
    await store.markSettled({
      s20ExecutionId: executionId,
      snapshotHash: snapshot.snapshotHash,
      observedGovernedLabelIds: ["Label_team"],
    });

    // Replaying the identical settle is idempotent; a contradicting one is refused.
    await expect(
      store.markSettled({
        s20ExecutionId: executionId,
        snapshotHash: snapshot.snapshotHash,
        observedGovernedLabelIds: ["Label_team"],
      }),
    ).resolves.toMatchObject({ state: "settled" });
    await expect(
      store.markSettled({
        s20ExecutionId: executionId,
        snapshotHash: snapshot.snapshotHash,
        observedGovernedLabelIds: ["Label_dan"],
      }),
    ).rejects.toThrow(/already settled with a different observed label set/);
  });

  it("stores no mailbox address, reason text, or message content", async () => {
    const executionId = await prepareExecution();
    await new FirestoreGmailLabelEffectStore(db).persistPrepared(
      actor,
      draft({ s20ExecutionId: executionId }),
    );

    const stored = await db
      .collection(GMAIL_LABEL_EFFECT_COLLECTION)
      .doc(executionId)
      .get();
    const serialized = JSON.stringify(stored.data());
    for (const forbidden of ["@pmikcmetro.com", "Waiting for staff review"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
