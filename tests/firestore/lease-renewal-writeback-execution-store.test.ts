import { readFileSync } from "node:fs";

import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  FirestoreSheetWritebackExecutionStore,
  SHEET_WRITEBACK_EXECUTION_COLLECTIONS,
} from "@/lib/firestore/lease-renewal-writeback-executions";
import { LEASE_RENEWAL_COLLECTIONS } from "@/lib/firestore/lease-renewal-resolutions";
import { LEASE_RENEWAL_WRITEBACK_COLLECTIONS } from "@/lib/firestore/lease-renewal-writeback-approvals";
import { resolutionDocId } from "@/lib/firestore/lease-renewal-resolutions";
import {
  buildSheetWritebackPreview,
  buildSheetWritebackReceipt,
  type SheetWritebackClaimAuthorization,
  type SheetWritebackPreviewRecord,
  type SheetWritebackProviderEffect,
  type SheetWritebackTargetReference,
} from "@/lib/lease-renewal/sheet-writeback-contract";
import { hashSheetCellValue } from "@/lib/lease-renewal/sheet-writeback-policy";

const projectId = "pmi-kc-kb-sheet-writeback-execution-store-test";
const nowMs = Date.parse("2026-07-30T00:00:00.000Z");
const approvalVersion = "2026-07-30T00:00:00.000Z";
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
    projectId,
  });
  app = initializeApp({ projectId }, `sheet-writeback-store-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

function preview(
  options: {
    actorUid?: string;
    runId?: string;
    sourceTriggerKey?: string;
    propertyKey?: string;
    fieldKey?: string;
    approvalId?: string;
    candidateFingerprint?: string;
    resolutionUpdatedAt?: string;
    sourceOfValue?: string;
    proposedValue?: string;
    predecessorExecutionId?: string;
    target?: Partial<SheetWritebackTargetReference>;
    nonce?: string;
  } = {},
): SheetWritebackPreviewRecord {
  const sourceTriggerKey = options.sourceTriggerKey ?? "trigger-1";
  return buildSheetWritebackPreview({
    actorUid: options.actorUid ?? "admin-1",
    runId: options.runId ?? "live-review",
    sourceTriggerKey,
    propertyKey: options.propertyKey ?? "4821-maple-st",
    fieldKey: options.fieldKey ?? "current_rent",
    approvalId: options.approvalId ?? `approval-${resolutionDocId(sourceTriggerKey)}`,
    approvalVersion,
    candidateFingerprint: options.candidateFingerprint ?? "candidate-fingerprint-1",
    resolutionUpdatedAt: options.resolutionUpdatedAt ?? "2026-07-29T22:30:00.000Z",
    sourceOfValue: options.sourceOfValue ?? "RentVine",
    descriptor: {
      environmentKind: "production",
      dataContext: "live",
      source: "explicit",
    },
    target: {
      spreadsheetId: "sheet-1",
      tabName: "Renewals",
      a1: "Renewals!C2",
      rowIndex: 1,
      proposedColumnHeader: "KB Proposed — Rent",
      anchorHeaders: ["Address", "Tenant"],
      rowAnchorHash: "a".repeat(64),
      anchorColumnCount: 3,
      ...options.target,
    },
    proposedValue: options.proposedValue ?? "1300",
    ...(options.predecessorExecutionId
      ? { predecessorExecutionId: options.predecessorExecutionId }
      : {}),
    nowMs,
    nonce: options.nonce ?? "firestore-test",
  });
}

function authorizationFor(
  prepared: SheetWritebackPreviewRecord,
): SheetWritebackClaimAuthorization {
  return {
    sourceTriggerKey: prepared.binding.sourceTriggerKey,
    runId: prepared.binding.runId,
    propertyKey: prepared.binding.propertyKey,
    fieldKey: prepared.binding.fieldKey,
    approvalId: prepared.binding.approvalId,
    approvalVersion: prepared.binding.approvalVersion,
    candidateFingerprint: prepared.binding.candidateFingerprint,
    resolutionUpdatedAt: prepared.binding.resolutionUpdatedAt,
    sourceOfValue: prepared.binding.sourceOfValue,
    proposedValueHash: prepared.binding.proposedValueHash,
  };
}

function providerEffect(
  overrides: Partial<SheetWritebackProviderEffect> = {},
): SheetWritebackProviderEffect {
  return {
    a1: "Renewals!C2",
    effectId: "sheets-effect-1",
    appliedAt: new Date(nowMs + 2).toISOString(),
    resultHash: "b".repeat(64),
    ...overrides,
  };
}

interface AuthorizationSeedOverrides {
  approvalState?: "Approved" | "Returned for Revision";
  approvalSourceOfValue?: string;
  approvalValue?: string;
  proposalSourceOfValue?: string;
  proposalFieldKey?: string;
  proposalValue?: string;
}

async function seedAuthorization(
  prepared: SheetWritebackPreviewRecord,
  overrides: AuthorizationSeedOverrides = {},
): Promise<void> {
  const binding = prepared.binding;
  const docId = resolutionDocId(binding.sourceTriggerKey);
  const approvalValue = overrides.approvalValue ?? "1300";
  const proposedValue = overrides.proposalValue ?? "1300";
  await db.runTransaction(async (transaction) => {
    transaction.set(
      db.collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals).doc(docId),
      {
        id: binding.approvalId,
        source_trigger_key: binding.sourceTriggerKey,
        run_id: binding.runId,
        property_key: binding.propertyKey,
        field_key: binding.fieldKey,
        field_label: "Current rent",
        candidate_fingerprint: binding.candidateFingerprint,
        resolution_updated_at: binding.resolutionUpdatedAt,
        severity: "Medium",
        state: overrides.approvalState ?? "Approved",
        proposed_value: approvalValue,
        source_of_value: overrides.approvalSourceOfValue ?? binding.sourceOfValue,
        reason: "Approved current rent.",
        decided_by_uid: binding.actorUid,
        production_allowed: false,
        executed: false,
        created_at: "2026-07-29T23:00:00.000Z",
        updated_at: binding.approvalVersion,
      },
    );
    transaction.set(db.collection(LEASE_RENEWAL_COLLECTIONS.resolutions).doc(docId), {
      id: docId,
      source_trigger_key: binding.sourceTriggerKey,
      run_id: binding.runId,
      property_key: binding.propertyKey,
      field_key: binding.fieldKey,
      field_label: "Current rent",
      candidate_fingerprint: binding.candidateFingerprint,
      severity: "Medium",
      status: "Resolved",
      resolution_kind: "pick_source",
      chosen_source: overrides.proposalSourceOfValue ?? binding.sourceOfValue,
      proposed_writeback: {
        field_key: overrides.proposalFieldKey ?? binding.fieldKey,
        value: proposedValue,
        source_of_value: overrides.proposalSourceOfValue ?? binding.sourceOfValue,
        status: "Queued",
        production_allowed: false,
      },
      reason: "Accepted the reviewed source.",
      resolved_by_uid: binding.actorUid,
      created_at: "2026-07-29T22:00:00.000Z",
      updated_at: binding.resolutionUpdatedAt,
    });
  });
}

describe("Sheet write-back Firestore one-attempt store", () => {
  it("gives competing authorized claims one winner and returns one durable provider receipt to duplicates", async () => {
    const store = new FirestoreSheetWritebackExecutionStore(db);
    const prepared = preview({ sourceTriggerKey: "trigger-winning-claim" });
    const authorization = authorizationFor(prepared);
    await seedAuthorization(prepared);
    await store.createPreview(prepared);

    const claims = await Promise.all([
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: prepared.binding.actorUid,
        nowMs: nowMs + 1,
        authorization,
      }),
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: prepared.binding.actorUid,
        nowMs: nowMs + 1,
        authorization,
      }),
    ]);
    expect(claims.filter((claim) => claim.status === "claimed")).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === "in_progress")).toHaveLength(1);
    const winner = claims.find((claim) => claim.status === "claimed");
    if (!winner || winner.status !== "claimed") return;

    const effect = providerEffect();
    const receipt = buildSheetWritebackReceipt(winner.record, effect);
    await store.finish(winner.record.id, receipt);
    await expect(
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: prepared.binding.actorUid,
        nowMs: nowMs + 3,
        authorization,
      }),
    ).resolves.toMatchObject({ status: "duplicate", receipt });

    const persisted = await store.getExecution(prepared.executionId);
    expect(persisted).toMatchObject({
      propertyKey: prepared.binding.propertyKey,
      fieldKey: prepared.binding.fieldKey,
      sourceOfValue: prepared.binding.sourceOfValue,
      attemptCount: 1,
      receipt: {
        providerEffectId: effect.effectId,
        providerAppliedAt: effect.appliedAt,
        providerResultHash: effect.resultHash,
      },
      state: "succeeded",
    });
    await expect(
      store.getLatestExecution({
        runId: prepared.binding.runId,
        sourceTriggerKey: prepared.binding.sourceTriggerKey,
      }),
    ).resolves.toMatchObject({ id: prepared.executionId, receipt });
    expect(JSON.stringify(persisted)).not.toContain("1300");

    const audit = await db.collection(SHEET_WRITEBACK_EXECUTION_COLLECTIONS.audit).get();
    expect(audit.docs).toHaveLength(3);
    const auditJson = JSON.stringify(audit.docs.map((auditDoc) => auditDoc.data()));
    expect(auditJson).not.toContain("1300");
    expect(auditJson).not.toContain("sheet-1");
    expect(auditJson).not.toContain("Renewals!C2");
  }, 20_000);

  it("refuses a second actor's preview for the same global one-attempt identity", async () => {
    const store = new FirestoreSheetWritebackExecutionStore(db);
    const firstActor = preview({
      sourceTriggerKey: "trigger-actor-race",
      actorUid: "admin-1",
      nonce: "actor-1",
    });
    const secondActor = preview({
      sourceTriggerKey: "trigger-actor-race",
      actorUid: "admin-2",
      nonce: "actor-2",
    });
    expect(secondActor.executionId).toBe(firstActor.executionId);
    await seedAuthorization(firstActor);
    await store.createPreview(firstActor);
    await store.createPreview(secondActor);

    await expect(
      store.claim({
        previewHash: firstActor.id,
        executionId: firstActor.executionId,
        actorUid: firstActor.binding.actorUid,
        nowMs: nowMs + 1,
        authorization: authorizationFor(firstActor),
      }),
    ).resolves.toMatchObject({ status: "claimed" });
    await expect(
      store.claim({
        previewHash: secondActor.id,
        executionId: secondActor.executionId,
        actorUid: secondActor.binding.actorUid,
        nowMs: nowMs + 2,
        authorization: authorizationFor(secondActor),
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
  }, 20_000);

  it("transactionally advances only the expected run/source predecessor", async () => {
    const store = new FirestoreSheetWritebackExecutionStore(db);
    const sourceTriggerKey = "trigger-head-cas";
    const first = preview({ sourceTriggerKey, nonce: "head-v1" });
    await seedAuthorization(first);
    await store.createPreview(first);
    await expect(
      store.claim({
        previewHash: first.id,
        executionId: first.executionId,
        actorUid: first.binding.actorUid,
        nowMs: nowMs + 1,
        authorization: authorizationFor(first),
      }),
    ).resolves.toMatchObject({ status: "claimed" });

    const siblings = [
      preview({
        sourceTriggerKey,
        predecessorExecutionId: first.executionId,
        target: {
          a1: "Renewals!D3",
          rowIndex: 2,
          rowAnchorHash: "b".repeat(64),
          anchorColumnCount: 4,
        },
        nonce: "head-v2-a",
      }),
      preview({
        sourceTriggerKey,
        predecessorExecutionId: first.executionId,
        target: {
          a1: "Renewals!D4",
          rowIndex: 3,
          rowAnchorHash: "c".repeat(64),
          anchorColumnCount: 4,
        },
        nonce: "head-v2-b",
      }),
    ];
    await Promise.all(siblings.map((prepared) => store.createPreview(prepared)));
    const claims = await Promise.all(
      siblings.map((prepared) =>
        store.claim({
          previewHash: prepared.id,
          executionId: prepared.executionId,
          actorUid: prepared.binding.actorUid,
          nowMs: nowMs + 2,
          authorization: authorizationFor(prepared),
        }),
      ),
    );
    expect(claims.filter((claim) => claim.status === "claimed")).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === "mismatch")).toHaveLength(1);
    const winner = claims.find((claim) => claim.status === "claimed");
    if (!winner || winner.status !== "claimed") return;
    expect(winner.record.predecessorExecutionId).toBe(first.executionId);

    const latest = await store.getLatestExecution({
      runId: first.binding.runId,
      sourceTriggerKey,
    });
    expect(latest?.id).toBe(winner.record.id);

    const successor = preview({
      sourceTriggerKey,
      predecessorExecutionId: winner.record.id,
      target: {
        a1: "Renewals!E5",
        rowIndex: 4,
        rowAnchorHash: "d".repeat(64),
        anchorColumnCount: 5,
      },
      nonce: "head-v3",
    });
    await store.createPreview(successor);
    await expect(
      store.claim({
        previewHash: successor.id,
        executionId: successor.executionId,
        actorUid: successor.binding.actorUid,
        nowMs: nowMs + 3,
        authorization: authorizationFor(successor),
      }),
    ).resolves.toMatchObject({
      status: "claimed",
      record: { predecessorExecutionId: winner.record.id },
    });
  }, 20_000);

  it("rejects winning claims when a same-value proposal changes source or proposal field", async () => {
    const store = new FirestoreSheetWritebackExecutionStore(db);
    const races: Array<{
      name: string;
      sourceTriggerKey: string;
      seed: AuthorizationSeedOverrides;
    }> = [
      {
        name: "same value from a different source",
        sourceTriggerKey: "trigger-source-race",
        seed: { proposalSourceOfValue: "Google Sheet" },
      },
      {
        name: "proposal field_key drift",
        sourceTriggerKey: "trigger-field-race",
        seed: { proposalFieldKey: "renewal_rent" },
      },
    ];

    for (const race of races) {
      const prepared = preview({
        sourceTriggerKey: race.sourceTriggerKey,
        nonce: race.name,
      });
      await seedAuthorization(prepared, race.seed);
      await store.createPreview(prepared);
      await expect(
        store.claim({
          previewHash: prepared.id,
          executionId: prepared.executionId,
          actorUid: prepared.binding.actorUid,
          nowMs: nowMs + 1,
          authorization: authorizationFor(prepared),
        }),
        race.name,
      ).resolves.toMatchObject({ status: "mismatch" });
      expect(await store.getExecution(prepared.executionId)).toBeNull();
    }
  }, 20_000);

  it("accepts an exact nonempty whitespace-bearing value without normalization", async () => {
    const store = new FirestoreSheetWritebackExecutionStore(db);
    const rawValue = " 1300 ";
    const prepared = preview({
      sourceTriggerKey: "trigger-exact-raw-value",
      proposedValue: rawValue,
      nonce: "exact-raw-value",
    });
    await seedAuthorization(prepared, {
      approvalValue: rawValue,
      proposalValue: rawValue,
    });
    await store.createPreview(prepared);

    await expect(
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: prepared.binding.actorUid,
        nowMs: nowMs + 1,
        authorization: authorizationFor(prepared),
      }),
    ).resolves.toMatchObject({
      status: "claimed",
      record: { proposedValueHash: hashSheetCellValue(rawValue) },
    });
    expect(prepared.binding.proposedValueHash).not.toBe(hashSheetCellValue("1300"));
  }, 20_000);

  it("rejects surrounding-whitespace drift and all-whitespace values at the winning claim", async () => {
    const store = new FirestoreSheetWritebackExecutionStore(db);
    const races: Array<{
      name: string;
      sourceTriggerKey: string;
      previewValue?: string;
      seed: AuthorizationSeedOverrides;
    }> = [
      {
        name: "approval gained surrounding whitespace",
        sourceTriggerKey: "trigger-approval-whitespace-race",
        seed: { approvalValue: " 1300 " },
      },
      {
        name: "proposal gained surrounding whitespace",
        sourceTriggerKey: "trigger-proposal-whitespace-race",
        seed: { proposalValue: " 1300 " },
      },
      {
        name: "authorization is all whitespace",
        sourceTriggerKey: "trigger-all-whitespace",
        previewValue: " \t ",
        seed: { approvalValue: " \t ", proposalValue: " \t " },
      },
    ];

    for (const race of races) {
      const prepared = preview({
        sourceTriggerKey: race.sourceTriggerKey,
        proposedValue: race.previewValue ?? "1300",
        nonce: race.name,
      });
      await seedAuthorization(prepared, race.seed);
      await store.createPreview(prepared);
      await expect(
        store.claim({
          previewHash: prepared.id,
          executionId: prepared.executionId,
          actorUid: prepared.binding.actorUid,
          nowMs: nowMs + 1,
          authorization: authorizationFor(prepared),
        }),
        race.name,
      ).resolves.toMatchObject({ status: "mismatch" });
      expect(await store.getExecution(prepared.executionId)).toBeNull();
    }
  }, 20_000);

  it("rejects an approval revocation that lands after preview but before the winning claim", async () => {
    const store = new FirestoreSheetWritebackExecutionStore(db);
    const prepared = preview({
      sourceTriggerKey: "trigger-revoke-race",
      nonce: "revoke-race",
    });
    await seedAuthorization(prepared);
    await store.createPreview(prepared);

    const approvalRef = db
      .collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals)
      .doc(resolutionDocId(prepared.binding.sourceTriggerKey));
    await db.runTransaction(async (transaction) => {
      transaction.update(approvalRef, { state: "Returned for Revision" });
    });

    await expect(
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: prepared.binding.actorUid,
        nowMs: nowMs + 1,
        authorization: authorizationFor(prepared),
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
    expect(await store.getExecution(prepared.executionId)).toBeNull();
    await expect(
      store.getLatestExecution({
        runId: prepared.binding.runId,
        sourceTriggerKey: prepared.binding.sourceTriggerKey,
      }),
    ).resolves.toBeNull();
  }, 20_000);

  it("rejects a same-value/source re-resolution that lands before the winning claim", async () => {
    const store = new FirestoreSheetWritebackExecutionStore(db);
    const prepared = preview({
      sourceTriggerKey: "trigger-reresolution-race",
      nonce: "reresolution-race",
    });
    await seedAuthorization(prepared);
    await store.createPreview(prepared);

    const resolutionRef = db
      .collection(LEASE_RENEWAL_COLLECTIONS.resolutions)
      .doc(resolutionDocId(prepared.binding.sourceTriggerKey));
    await db.runTransaction(async (transaction) => {
      transaction.update(resolutionRef, {
        candidate_fingerprint: "candidate-fingerprint-2",
        updated_at: "2026-07-29T22:45:00.000Z",
      });
    });

    await expect(
      store.claim({
        previewHash: prepared.id,
        executionId: prepared.executionId,
        actorUid: prepared.binding.actorUid,
        nowMs: nowMs + 1,
        authorization: authorizationFor(prepared),
      }),
    ).resolves.toMatchObject({ status: "mismatch" });
    expect(await store.getExecution(prepared.executionId)).toBeNull();
  }, 20_000);

  it("denies direct client access to all four Admin-SDK-only collections", async () => {
    const collections = Object.values(SHEET_WRITEBACK_EXECUTION_COLLECTIONS);
    await testEnv.withSecurityRulesDisabled(async (context) => {
      for (const collection of collections) {
        await setDoc(doc(context.firestore(), collection, "server-only"), {
          state: "server-only",
        });
      }
    });

    for (const role of ["Editor", "Approver", "Admin"] as const) {
      const clientDb = testEnv
        .authenticatedContext(role.toLowerCase(), { role })
        .firestore();
      for (const collection of collections) {
        const existing = doc(clientDb, collection, "server-only");
        await assertFails(getDoc(existing));
        await assertFails(updateDoc(existing, { state: "tampered" }));
        await assertFails(deleteDoc(existing));
        await assertFails(
          setDoc(doc(clientDb, collection, `client-${role.toLowerCase()}`), {
            state: "tampered",
          }),
        );
      }
    }
  }, 20_000);
});
