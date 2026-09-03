import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import { buildSheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { sheetWritebackExecutionId } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  SHEET_APPEND_LIFECYCLES_COLLECTION,
  discardSheetWritebackProposal,
  getSheetWritebackProposal,
  listSheetWritebackProposalHistory,
  saveSheetWritebackProposal,
  sheetAppendLifecycleDocId,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";

const projectId = "pmi-kc-kb-s98-proposal-scope-test";
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
  app = initializeApp({ projectId }, `s98-proposal-scope-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

function proposal(leaseId: string, propertyId: string, generation: string) {
  return buildSheetWritebackProposal({
    generationId: generation,
    spreadsheetId: "sheet-live-1",
    tabTitle: "Lease Renewal",
    headerHash: "a".repeat(64),
    headerWidth: 2,
    tenantColumnIndex: 0,
    scope: { kind: "lease_workspace", leaseId, propertyId },
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    sourceReadAtIso: "2026-09-02T12:00:00.000Z",
    evidenceRef: `workspace:${leaseId}:fresh-live-join`,
    effects: [
      {
        kind: "row_append",
        mode: "normal",
        operationId: `op-${generation}`,
        leaseId,
        propertyId,
        tenantName: `Tenant ${leaseId}`,
        fields: {},
      },
    ],
    nowMs: Date.parse("2026-09-02T12:00:00.000Z"),
  });
}

async function seedLifecycle(
  current: ReturnType<typeof proposal>,
  state: "running" | "ambiguous" | "succeeded" | "failed" | "reversed",
) {
  const effect = current.effects[0];
  const executionId = sheetWritebackExecutionId(current, effect);
  await db
    .collection(SHEET_APPEND_LIFECYCLES_COLLECTION)
    .doc(
      sheetAppendLifecycleDocId(
        current.spreadsheetId,
        current.tabTitle,
        current.scope.leaseId,
      ),
    )
    .set({
      version: "operating-sheet-append-lifecycle/v1",
      spreadsheet_id: current.spreadsheetId,
      tab_title: current.tabTitle,
      lease_id: current.scope.leaseId,
      property_id: current.scope.propertyId,
      proposal_preview_hash: current.previewHash,
      effect_hash: effect.effectHash,
      execution_id: executionId,
      state,
      updated_at: "2026-09-02T12:01:00.000Z",
    });
  await db
    .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
    .doc(executionId)
    .set({
      id: executionId,
      dataMode: "live",
      workflowId: "s98:Lease Renewal",
      actionId: executionId,
      actionKey: "google_sheets.renewal_checklist.row_append",
      contextHash: current.previewHash,
      previewHash: current.previewHash,
      idempotencyKey: executionId,
      state: state === "succeeded" ? "succeeded" : state,
      attemptCount: 1,
      ...(state === "succeeded"
        ? {
            receipt: {
              actionKey: "google_sheets.renewal_checklist.row_append",
              dataMode: "live",
              liveEvidenceEligible: true,
              providerRef: "s98-row:op-test",
              resultHash: "e".repeat(64),
              reconciled: false,
              createdAt: "2026-09-02T12:01:00.000Z",
            },
          }
        : {}),
      createdAt: "2026-09-02T12:00:00.000Z",
      updatedAt: "2026-09-02T12:01:00.000Z",
    });
}

describe("S98 lease-scoped proposal store", () => {
  it("isolates reads, overwrite generations, and discard between lease workspaces", async () => {
    const lease115 = proposal("115", "84", "generation-lease-115");
    const lease116 = proposal("116", "85", "generation-lease-116");
    const scope115 = { kind: "lease_workspace" as const, leaseId: "115" };
    const scope116 = { kind: "lease_workspace" as const, leaseId: "116" };

    await saveSheetWritebackProposal(actor, lease115, scope115, null, db);
    expect(
      await getSheetWritebackProposal(
        actor,
        "sheet-live-1",
        "Lease Renewal",
        scope116,
        db,
      ),
    ).toBeNull();

    await saveSheetWritebackProposal(actor, lease116, scope116, null, db);
    await expect(
      getSheetWritebackProposal(actor, "sheet-live-1", "Lease Renewal", scope115, db),
    ).resolves.toMatchObject({ previewHash: lease115.previewHash });
    await expect(
      getSheetWritebackProposal(actor, "sheet-live-1", "Lease Renewal", scope116, db),
    ).resolves.toMatchObject({ previewHash: lease116.previewHash });

    await expect(
      saveSheetWritebackProposal(actor, lease116, scope115, lease115.previewHash, db),
    ).rejects.toMatchObject({ status: 409 });
    const replacement115 = proposal("115", "84", "generation-lease-115-next");
    await expect(
      saveSheetWritebackProposal(actor, replacement115, scope115, null, db),
    ).rejects.toMatchObject({ status: 409 });

    await discardSheetWritebackProposal(
      actor,
      "sheet-live-1",
      "Lease Renewal",
      scope116,
      lease116.previewHash,
      db,
    );
    await expect(
      getSheetWritebackProposal(actor, "sheet-live-1", "Lease Renewal", scope116, db),
    ).resolves.toBeNull();
    await expect(
      getSheetWritebackProposal(actor, "sheet-live-1", "Lease Renewal", scope115, db),
    ).resolves.toMatchObject({ previewHash: lease115.previewHash });
  });

  it.each(["running", "ambiguous"] as const)(
    "keeps a %s append generation active for recovery",
    async (state) => {
      const current = proposal("115", "84", `generation-${state}-115`);
      const replacement = proposal("115", "84", `generation-${state}-next`);
      const scope = { kind: "lease_workspace" as const, leaseId: "115" };
      await saveSheetWritebackProposal(actor, current, scope, null, db);
      await seedLifecycle(current, state);

      await expect(
        saveSheetWritebackProposal(actor, replacement, scope, current.previewHash, db),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        discardSheetWritebackProposal(
          actor,
          current.spreadsheetId,
          current.tabTitle,
          scope,
          current.previewHash,
          db,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        getSheetWritebackProposal(
          actor,
          current.spreadsheetId,
          current.tabTitle,
          scope,
          db,
        ),
      ).resolves.toMatchObject({ previewHash: current.previewHash });
    },
  );

  it("archives succeeded evidence transactionally before replacing the active generation", async () => {
    const current = proposal("115", "84", "generation-success-115");
    const replacement = proposal("115", "84", "generation-success-next");
    const scope = { kind: "lease_workspace" as const, leaseId: "115" };
    await saveSheetWritebackProposal(actor, current, scope, null, db);
    await seedLifecycle(current, "succeeded");

    await saveSheetWritebackProposal(actor, replacement, scope, current.previewHash, db);

    await expect(
      getSheetWritebackProposal(
        actor,
        current.spreadsheetId,
        current.tabTitle,
        scope,
        db,
      ),
    ).resolves.toMatchObject({ previewHash: replacement.previewHash });
    await expect(
      listSheetWritebackProposalHistory(
        actor,
        current.spreadsheetId,
        current.tabTitle,
        scope,
        db,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        proposal: expect.objectContaining({ previewHash: current.previewHash }),
        effectHash: current.effects[0].effectHash,
        archivedReason: "replacement",
      }),
    ]);
    expect(
      (
        await db
          .collection(SHEET_APPEND_LIFECYCLES_COLLECTION)
          .doc(sheetAppendLifecycleDocId(current.spreadsheetId, current.tabTitle, "115"))
          .get()
      ).exists,
    ).toBe(false);
  });

  it("recovers a finish-to-lifecycle crash window without trapping the lease", async () => {
    const current = proposal("115", "84", "generation-finish-window");
    const replacement = proposal("115", "84", "generation-after-finish-window");
    const scope = { kind: "lease_workspace" as const, leaseId: "115" };
    await saveSheetWritebackProposal(actor, current, scope, null, db);
    await seedLifecycle(current, "running");
    const executionId = sheetWritebackExecutionId(current, current.effects[0]);
    await db
      .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
      .doc(executionId)
      .update({
        state: "succeeded",
        receipt: {
          actionKey: "google_sheets.renewal_checklist.row_append",
          dataMode: "live",
          liveEvidenceEligible: true,
          providerRef: "s98-row:op-test",
          resultHash: "f".repeat(64),
          reconciled: false,
          createdAt: "2026-09-02T12:01:00.000Z",
        },
      });

    await expect(
      saveSheetWritebackProposal(actor, replacement, scope, current.previewHash, db),
    ).resolves.toBeUndefined();
    await expect(
      listSheetWritebackProposalHistory(
        actor,
        current.spreadsheetId,
        current.tabTitle,
        scope,
        db,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        proposal: expect.objectContaining({ previewHash: current.previewHash }),
      }),
    ]);
  });

  it("archives succeeded evidence before clearing the active proposal", async () => {
    const current = proposal("115", "84", "generation-success-discard");
    const scope = { kind: "lease_workspace" as const, leaseId: "115" };
    await saveSheetWritebackProposal(actor, current, scope, null, db);
    await seedLifecycle(current, "succeeded");

    await discardSheetWritebackProposal(
      actor,
      current.spreadsheetId,
      current.tabTitle,
      scope,
      current.previewHash,
      db,
    );
    await expect(
      getSheetWritebackProposal(
        actor,
        current.spreadsheetId,
        current.tabTitle,
        scope,
        db,
      ),
    ).resolves.toBeNull();
    await expect(
      listSheetWritebackProposalHistory(
        actor,
        current.spreadsheetId,
        current.tabTitle,
        scope,
        db,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        proposal: expect.objectContaining({ previewHash: current.previewHash }),
        archivedReason: "discard",
      }),
    ]);
  });
});
