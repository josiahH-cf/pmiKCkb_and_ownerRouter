import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type {
  ExternalActionReceipt,
  ExternalExecutionRecord,
} from "@/lib/external-execution/types";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import { claimActiveS97RenewalEffect } from "@/lib/firestore/s97-renewal-writeback-claim";
import {
  buildRenewalWritebackProposal,
  renewalWritebackExecutionId,
  renewalWritebackReversalExecutionId,
} from "@/lib/lease-renewal/writeback/proposal-contract";
import {
  discardRenewalWritebackProposal,
  getRenewalWritebackProposal,
  getRenewalWritebackProposalGeneration,
  listRenewalWritebackProposalHistory,
  saveRenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-store";

const projectId = "pmi-kc-kb-s97-generation-lifecycle-test";
const actor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s97-generation-lifecycle-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

function proposal(generation: number) {
  return buildRenewalWritebackProposal({
    leaseId: "115",
    account: "pmikcmetro",
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    leaseState: {
      startDate: "2025-09-01",
      endDate: "2026-08-31",
      increaseEligibilityDate: null,
    },
    sourceReadAtIso: new Date(
      Date.parse("2026-09-02T12:00:00.000Z") + generation * 1_000,
    ).toISOString(),
    evidenceRef: `workspace:115:generation:${generation}`,
    effects: [
      {
        kind: "renewal_dates_update",
        before: {
          startDate: "2025-09-01",
          endDate: "2026-08-31",
          increaseEligibilityDate: null,
        },
        after: { endDate: generation % 2 === 0 ? "2027-08-31" : "2027-09-30" },
      },
    ],
    nowMs: Date.parse("2026-09-02T12:00:00.000Z") + generation * 1_000,
  });
}

function readyRecord(current: ReturnType<typeof proposal>): ExternalExecutionRecord {
  const effect = current.effects[0];
  const id = renewalWritebackExecutionId(current, effect);
  return {
    id,
    dataMode: "live",
    workflowId: `s97:${current.leaseId}`,
    actionId: id,
    actionKey: effect.actionKey,
    contextHash: current.previewHash,
    previewHash: effect.effectHash,
    idempotencyKey: id,
    state: "ready",
    attemptCount: 0,
    createdAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-02T12:00:00.000Z",
  };
}

function receipt(record: ExternalExecutionRecord): ExternalActionReceipt {
  return {
    actionKey: record.actionKey,
    dataMode: "live",
    liveEvidenceEligible: true,
    providerRef: "s97-lease:115",
    resultHash: "e".repeat(64),
    reconciled: false,
    createdAt: "2026-09-02T12:01:00.000Z",
  };
}

async function seedExecution(
  current: ReturnType<typeof proposal>,
  state: "ready" | "running" | "ambiguous" | "succeeded",
) {
  const record = readyRecord(current);
  await db
    .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
    .doc(record.id)
    .set({
      ...record,
      state,
      attemptCount: state === "ready" ? 0 : 1,
      ...(state === "succeeded" ? { receipt: receipt(record) } : {}),
    });
  return record;
}

describe("S97 active proposal generation and lifecycle", () => {
  it("atomically claims the exact active generation once", async () => {
    const current = proposal(0);
    await saveRenewalWritebackProposal(actor, current, null, db);
    const input = {
      proposal: current,
      effect: current.effects[0],
      record: readyRecord(current),
    };

    const outcomes = await Promise.all([
      claimActiveS97RenewalEffect(db, input),
      claimActiveS97RenewalEffect(db, input),
    ]);
    expect(outcomes.filter((outcome) => outcome === "claimed")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "blocked")).toHaveLength(1);
    expect(
      (
        await db
          .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
          .doc(input.record.id)
          .get()
      ).data(),
    ).toMatchObject({ state: "running", attemptCount: 1 });
  });

  it("serializes route-load claim against proposal replacement with no ready orphan", async () => {
    const current = proposal(0);
    const replacement = proposal(1);
    await saveRenewalWritebackProposal(actor, current, null, db);
    const record = readyRecord(current);

    const [claim, replace] = await Promise.allSettled([
      claimActiveS97RenewalEffect(db, {
        proposal: current,
        effect: current.effects[0],
        record,
      }),
      saveRenewalWritebackProposal(actor, replacement, current.previewHash, db),
    ]);
    const claimWon = claim.status === "fulfilled" && claim.value === "claimed";
    const replacementWon = replace.status === "fulfilled";
    expect(Number(claimWon) + Number(replacementWon)).toBe(1);
    if (claimWon) {
      expect(replace.status).toBe("rejected");
      await expect(getRenewalWritebackProposal(actor, "115", db)).resolves.toMatchObject({
        previewHash: current.previewHash,
      });
    } else {
      expect(claim).toMatchObject({ status: "fulfilled", value: "blocked" });
      expect(
        (await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(record.id).get())
          .exists,
      ).toBe(false);
    }
  });

  it.each(["running", "ambiguous"] as const)(
    "keeps a %s generation active until reconciliation",
    async (state) => {
      const current = proposal(0);
      const replacement = proposal(1);
      await saveRenewalWritebackProposal(actor, current, null, db);
      await seedExecution(current, state);

      await expect(
        saveRenewalWritebackProposal(actor, replacement, current.previewHash, db),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        discardRenewalWritebackProposal(actor, "115", current.previewHash, db),
      ).rejects.toMatchObject({ status: 409 });
    },
  );

  it("archives succeeded recovery evidence before replacement", async () => {
    const current = proposal(0);
    const replacement = proposal(1);
    await saveRenewalWritebackProposal(actor, current, null, db);
    const forward = await seedExecution(current, "succeeded");

    await saveRenewalWritebackProposal(actor, replacement, current.previewHash, db);

    await expect(listRenewalWritebackProposalHistory(actor, "115", db)).resolves.toEqual([
      expect.objectContaining({
        proposal: expect.objectContaining({ previewHash: current.previewHash }),
        succeededEffects: [
          expect.objectContaining({
            effectHash: current.effects[0].effectHash,
            executionId: forward.id,
          }),
        ],
        archivedReason: "replacement",
      }),
    ]);
    await expect(
      getRenewalWritebackProposalGeneration(actor, "115", current.previewHash, db),
    ).resolves.toMatchObject({ previewHash: current.previewHash });
  });

  it("allows replacement past a historical ready orphan and makes that old claim inert", async () => {
    const current = proposal(0);
    const replacement = proposal(1);
    await saveRenewalWritebackProposal(actor, current, null, db);
    const orphan = await seedExecution(current, "ready");

    await saveRenewalWritebackProposal(actor, replacement, current.previewHash, db);
    await expect(
      claimActiveS97RenewalEffect(db, {
        proposal: current,
        effect: current.effects[0],
        record: orphan,
      }),
    ).resolves.toBe("blocked");
    expect(
      (
        await db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(orphan.id).get()
      ).data(),
    ).toMatchObject({ state: "ready", attemptCount: 0 });
  });

  it("blocks replacement while a reversal has an unresolved outcome", async () => {
    const current = proposal(0);
    const replacement = proposal(1);
    await saveRenewalWritebackProposal(actor, current, null, db);
    const forward = await seedExecution(current, "succeeded");
    const forwardReceipt = receipt(forward);
    const reversalId = renewalWritebackReversalExecutionId(
      forward.id,
      forwardReceipt.resultHash,
    );
    await db
      .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
      .doc(reversalId)
      .set({
        ...forward,
        id: reversalId,
        actionId: reversalId,
        idempotencyKey: reversalId,
        contextHash: forwardReceipt.resultHash,
        previewHash: "f".repeat(64),
        state: "ambiguous",
        attemptCount: 1,
      });

    await expect(
      saveRenewalWritebackProposal(actor, replacement, current.previewHash, db),
    ).rejects.toMatchObject({ status: 409 });
  });
});
