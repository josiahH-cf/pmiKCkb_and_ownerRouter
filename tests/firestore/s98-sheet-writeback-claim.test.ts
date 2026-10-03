import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import {
  claimLeaseScopedS113FieldUpdate,
  claimLeaseScopedS98Append,
  settleLeaseScopedS98Append,
} from "@/lib/firestore/s98-sheet-writeback-claim";
import type { ExternalExecutionRecord } from "@/lib/external-execution/types";
import {
  buildSheetWritebackProposal,
  sheetWritebackExecutionId,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  SHEET_APPEND_LIFECYCLES_COLLECTION,
  SHEET_WRITEBACK_PROPOSALS_COLLECTION,
  getSheetWritebackProposal,
  saveSheetWritebackProposal,
  listSheetWritebackProposalHistory,
  discardSheetWritebackProposal,
  sheetAppendLifecycleDocId,
  sheetWritebackProposalDocId,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import type { AuthenticatedUser } from "@/lib/auth/session";

const projectId = "pmi-kc-kb-s98-authorized-claim-test";
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
  vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-a");
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s98-authorized-claim-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => {
  vi.stubEnv("LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED", "true");
  vi.stubEnv("K_REVISION", "pmi-kc-app-test-enabled-a");
  await testEnv.clearFirestore();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await deleteApp(app);
  await testEnv.cleanup();
});

// S160: the reconciliation-approval claim is retired. A current-rent field update is bound to the
// lease's working current rent inside claimLeaseScopedS113FieldUpdate; see
// tests/firestore/s160-sheet-working-rent.test.ts for that contract.

const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

function appendProposal(generationId: string, leaseId = "115", propertyId = "84") {
  return buildSheetWritebackProposal({
    runtimeBinding: {
      version: "operating-sheet-runtime/v1",
      revision: "pmi-kc-app-test-enabled-a",
      policy: "explicit-owner-enabled/v1",
    },
    generationId,
    spreadsheetId: "sheet-live-1",
    tabTitle: "Lease Renewal",
    headerHash: "d".repeat(64),
    headerWidth: 2,
    tenantColumnIndex: 0,
    scope: { kind: "lease_workspace", leaseId, propertyId },
    actorUid: editor.uid,
    actorEmail: editor.email,
    actorRole: editor.role,
    sourceReadAtIso: "2026-09-02T12:00:00.000Z",
    evidenceRef: `workspace:${leaseId}:fresh-live-join`,
    effects: [
      {
        kind: "row_append",
        mode: "normal",
        operationId: `op-${generationId}`,
        leaseId,
        propertyId,
        tenantName: `Tenant ${leaseId}`,
        fields: {},
      },
    ],
    nowMs: Date.parse("2026-09-02T12:00:00.000Z"),
  });
}

async function seedAppend(current: ReturnType<typeof appendProposal>) {
  const effect = current.effects[0];
  const executionId = sheetWritebackExecutionId(current, effect);
  const execution: ExternalExecutionRecord = {
    id: executionId,
    dataMode: "live",
    workflowId: "s98:Lease Renewal",
    actionId: executionId,
    actionKey: effect.actionKey,
    contextHash: current.previewHash,
    previewHash: current.previewHash,
    idempotencyKey: executionId,
    state: "ready",
    attemptCount: 0,
    createdAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-02T12:00:00.000Z",
  };
  await Promise.all([
    db
      .collection(SHEET_WRITEBACK_PROPOSALS_COLLECTION)
      .doc(
        sheetWritebackProposalDocId(current.spreadsheetId, current.tabTitle, {
          kind: "lease_workspace",
          leaseId: current.scope.leaseId,
        }),
      )
      .set({ ...current, updated_at: "2026-09-02T12:00:00.000Z" }),
    db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(executionId).set(execution),
  ]);
  return {
    executionId,
    previewHash: current.previewHash,
    effectHash: effect.effectHash,
    spreadsheetId: current.spreadsheetId,
    tabTitle: current.tabTitle,
    leaseId: current.scope.leaseId,
    propertyId: current.scope.propertyId,
  };
}

describe("S98 lease-scoped append claim", () => {
  it.each(["paused", "resumed"])(
    "refuses a durable old append proposal while %s without consuming an attempt",
    async (state) => {
      const current = appendProposal("generation-pre-pause");
      const input = await seedAppend(current);
      vi.stubEnv(
        "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED",
        state === "paused" ? "false" : "true",
      );
      vi.stubEnv(
        "K_REVISION",
        state === "paused" ? "pmi-kc-app-paused" : "pmi-kc-app-resumed",
      );
      expect(await claimLeaseScopedS98Append(db, input)).toBe("blocked");
      expect(
        (
          await db
            .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
            .doc(input.executionId)
            .get()
        ).data(),
      ).toMatchObject({ state: "ready", attemptCount: 0 });
      expect(
        (
          await getSheetWritebackProposal(
            editor,
            current.spreadsheetId,
            current.tabTitle,
            { kind: "lease_workspace", leaseId: "115" },
            db,
          )
        )?.previewHash,
      ).toBe(current.previewHash);
      expect((await db.collection(SHEET_APPEND_LIFECYCLES_COLLECTION).get()).empty).toBe(
        true,
      );
    },
  );
  it("atomically consumes one active generation and blocks replay or cross-workspace claims", async () => {
    const current = appendProposal("generation-append-115");
    const input = await seedAppend(current);

    const outcomes = await Promise.all([
      claimLeaseScopedS98Append(db, input),
      claimLeaseScopedS98Append(db, input),
    ]);
    expect(outcomes.sort()).toEqual(["blocked", "claimed"]);
    await expect(
      claimLeaseScopedS98Append(db, {
        ...input,
        leaseId: "116",
        propertyId: "85",
      }),
    ).resolves.toBe("blocked");
    expect(
      (
        await db
          .collection(SHEET_APPEND_LIFECYCLES_COLLECTION)
          .doc(
            sheetAppendLifecycleDocId(input.spreadsheetId, input.tabTitle, input.leaseId),
          )
          .get()
      ).data(),
    ).toMatchObject({
      proposal_preview_hash: current.previewHash,
      execution_id: input.executionId,
      state: "running",
    });
  });

  it("serializes proposal replacement against the first provider attempt", async () => {
    const current = appendProposal("generation-race-current");
    const replacement = appendProposal("generation-race-next");
    const input = await seedAppend(current);
    const scope = { kind: "lease_workspace" as const, leaseId: "115" };

    const [claimResult, replaceResult] = await Promise.allSettled([
      claimLeaseScopedS98Append(db, input),
      saveSheetWritebackProposal(editor, replacement, scope, current.previewHash, db),
    ]);
    const claimWon =
      claimResult.status === "fulfilled" && claimResult.value === "claimed";
    const replacementWon = replaceResult.status === "fulfilled";
    expect(Number(claimWon) + Number(replacementWon)).toBe(1);

    const active = await getSheetWritebackProposal(
      editor,
      current.spreadsheetId,
      current.tabTitle,
      scope,
      db,
    );
    const lifecycle = await db
      .collection(SHEET_APPEND_LIFECYCLES_COLLECTION)
      .doc(sheetAppendLifecycleDocId(input.spreadsheetId, input.tabTitle, input.leaseId))
      .get();
    if (claimWon) {
      expect(active?.previewHash).toBe(current.previewHash);
      expect(lifecycle.exists).toBe(true);
    } else {
      expect(active?.previewHash).toBe(replacement.previewHash);
      expect(lifecycle.exists).toBe(false);
    }
  });

  it("allows only the exact ambiguous attempt to settle as succeeded", async () => {
    const current = appendProposal("generation-settle-115");
    const input = await seedAppend(current);
    await expect(claimLeaseScopedS98Append(db, input)).resolves.toBe("claimed");
    await settleLeaseScopedS98Append(db, { ...input, state: "ambiguous" });
    await expect(
      settleLeaseScopedS98Append(db, {
        ...input,
        executionId: `${input.executionId}:foreign`,
        state: "succeeded",
      }),
    ).rejects.toThrow(/does not match/);
    await settleLeaseScopedS98Append(db, { ...input, state: "succeeded" });
    expect(
      (
        await db
          .collection(SHEET_APPEND_LIFECYCLES_COLLECTION)
          .doc(
            sheetAppendLifecycleDocId(input.spreadsheetId, input.tabTitle, input.leaseId),
          )
          .get()
      ).get("state"),
    ).toBe("succeeded");
  });
});

function fieldProposal(generationId: string) {
  const base = appendProposal(generationId);
  return buildSheetWritebackProposal({
    runtimeBinding: {
      version: "operating-sheet-runtime/v1",
      revision: "pmi-kc-app-test-enabled-a",
      policy: "explicit-owner-enabled/v1",
    },
    generationId,
    spreadsheetId: base.spreadsheetId,
    tabTitle: base.tabTitle,
    headerHash: base.headerHash,
    headerWidth: 2,
    tenantColumnIndex: 0,
    scope: base.scope,
    actorUid: editor.uid,
    actorEmail: editor.email,
    actorRole: editor.role,
    sourceReadAtIso: base.sourceReadAtIso,
    evidenceRef: base.evidenceRef,
    effects: [
      {
        kind: "field_update",
        rowNumber: 3,
        field: "market_value",
        rowKey: null,
        anchorTenantName: "Tenant 115",
        expectedValue: "1000",
        afterValue: "1100",
        source: "Reviewed comparables",
        staffIntent: {
          field: "market_value",
          value: 1100,
          source: "Reviewed comparables",
        },
      },
    ],
    nowMs: Date.parse("2026-09-02T12:00:00.000Z"),
  });
}

describe("S113 field generation and persisted correction history", () => {
  const scope = { kind: "lease_workspace" as const, leaseId: "115" };
  it("refuses an old field proposal after resume while preserving its unused durable record", async () => {
    const current = fieldProposal("field-pre-pause");
    const input = await seedAppend(current);
    vi.stubEnv("K_REVISION", "pmi-kc-app-resumed");
    expect(await claimLeaseScopedS113FieldUpdate(db, input)).toBe("blocked");
    expect(
      (
        await db
          .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
          .doc(input.executionId)
          .get()
      ).data(),
    ).toMatchObject({ state: "ready", attemptCount: 0 });
    expect(
      (
        await getSheetWritebackProposal(
          editor,
          current.spreadsheetId,
          current.tabTitle,
          scope,
          db,
        )
      )?.previewHash,
    ).toBe(current.previewHash);
  });
  it("serializes active field replacement against the first provider attempt", async () => {
    const current = fieldProposal("field-race-current");
    const replacement = fieldProposal("field-race-next");
    const input = await seedAppend(current);
    const [claim, replace] = await Promise.allSettled([
      claimLeaseScopedS113FieldUpdate(db, input),
      saveSheetWritebackProposal(editor, replacement, scope, current.previewHash, db),
    ]);
    const claimWon = claim.status === "fulfilled" && claim.value === "claimed";
    expect(Number(claimWon) + Number(replace.status === "fulfilled")).toBe(1);
    const active = await getSheetWritebackProposal(
      editor,
      current.spreadsheetId,
      current.tabTitle,
      scope,
      db,
    );
    expect(active?.previewHash).toBe(
      claimWon ? current.previewHash : replacement.previewHash,
    );
    const record = (
      await db
        .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
        .doc(input.executionId)
        .get()
    ).data();
    expect(record).toMatchObject({
      state: claimWon ? "running" : "ready",
      attemptCount: claimWon ? 1 : 0,
    });
  });
  it("cannot discard or replace an ambiguous field attempt", async () => {
    const current = fieldProposal("field-ambiguous");
    const input = await seedAppend(current);
    expect(await claimLeaseScopedS113FieldUpdate(db, input)).toBe("claimed");
    await db
      .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
      .doc(input.executionId)
      .update({ state: "ambiguous" });
    await expect(
      saveSheetWritebackProposal(
        editor,
        fieldProposal("field-next"),
        scope,
        current.previewHash,
        db,
      ),
    ).rejects.toThrow();
    await expect(
      discardSheetWritebackProposal(
        editor,
        current.spreadsheetId,
        current.tabTitle,
        scope,
        current.previewHash,
        db,
      ),
    ).rejects.toThrow();
    expect(
      (
        await getSheetWritebackProposal(
          editor,
          current.spreadsheetId,
          current.tabTitle,
          scope,
          db,
        )
      )?.previewHash,
    ).toBe(current.previewHash);
  });
  it("preserves before-values and exact attempt identity when a settled proposal is replaced", async () => {
    const current = fieldProposal("field-settled");
    const input = await seedAppend(current);
    expect(await claimLeaseScopedS113FieldUpdate(db, input)).toBe("claimed");
    await db
      .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
      .doc(input.executionId)
      .update({ state: "failed" });
    await saveSheetWritebackProposal(
      editor,
      fieldProposal("field-new-preview"),
      scope,
      current.previewHash,
      db,
    );
    const history = await listSheetWritebackProposalHistory(
      editor,
      current.spreadsheetId,
      current.tabTitle,
      scope,
      db,
    );
    expect(history).toHaveLength(1);
    expect(history[0].proposal.previewHash).toBe(current.previewHash);
    expect(history[0].proposal.effects[0].effect).toMatchObject({
      expectedValue: "1000",
      afterValue: "1100",
    });
    expect(
      (
        await db
          .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
          .doc(input.executionId)
          .get()
      ).get("attemptCount"),
    ).toBe(1);
  });
});
