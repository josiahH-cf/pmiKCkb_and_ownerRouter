import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import {
  LEASE_RENEWAL_COLLECTIONS,
  resolutionDocId,
} from "@/lib/firestore/lease-renewal-resolutions";
import { LEASE_RENEWAL_WRITEBACK_COLLECTIONS } from "@/lib/firestore/lease-renewal-writeback-approvals";
import {
  claimAuthorizedS98FieldUpdate,
  claimLeaseScopedS98Append,
  settleLeaseScopedS98Append,
} from "@/lib/firestore/s98-sheet-writeback-claim";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import type { ExternalExecutionRecord } from "@/lib/external-execution/types";
import {
  buildSheetWritebackProposal,
  sheetWritebackExecutionId,
  type SheetFieldUpdateAuthorization,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { writebackAuthorizationTokenForResolution } from "@/lib/lease-renewal/writeback-authorization-token";
import {
  SHEET_APPEND_LIFECYCLES_COLLECTION,
  SHEET_WRITEBACK_PROPOSALS_COLLECTION,
  getSheetWritebackProposal,
  saveSheetWritebackProposal,
  sheetAppendLifecycleDocId,
  sheetWritebackProposalDocId,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import type { AuthenticatedUser } from "@/lib/auth/session";

const projectId = "pmi-kc-kb-s98-authorized-claim-test";
const SOURCE_TRIGGER = "lease_renewal:reconcile:live-review:key:current_rent";
const FINGERPRINT = `rcf1_${"a".repeat(64)}`;
const RESOLUTION_AT = "2026-09-02T11:58:00.000Z";
const APPROVAL_AT = "2026-09-02T11:59:00.000Z";
const EXECUTION_ID = "s98:sheet-live-1:exact-execution";
const PREVIEW_HASH = "b".repeat(64);
let app: App;
let db: Firestore;
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    firestore: FIRESTORE_EMULATOR_TARGET,
    projectId,
  });
  app = initializeApp({ projectId }, `s98-authorized-claim-${process.pid}`);
  db = getFirestore(app);
});

beforeEach(async () => testEnv.clearFirestore());

afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});

function resolution(
  overrides: Partial<LeaseRenewalResolutionRecord> = {},
): LeaseRenewalResolutionRecord {
  return {
    id: resolutionDocId(SOURCE_TRIGGER),
    source_trigger_key: SOURCE_TRIGGER,
    run_id: "live-review",
    field_key: "current_rent",
    field_label: "Current rent",
    candidate_fingerprint: FINGERPRINT,
    severity: "High",
    status: "Resolved",
    resolution_kind: "pick_source",
    chosen_source: "rentvine",
    reason: "RentVine is the confirmed source.",
    resolved_by_uid: "editor-1",
    proposed_writeback: {
      field_key: "current_rent",
      value: "1200",
      source_of_value: "rentvine",
      status: "Queued",
      production_allowed: false,
    },
    created_at: "2026-09-02T11:57:00.000Z",
    updated_at: RESOLUTION_AT,
    ...overrides,
  };
}

function approval(
  current: LeaseRenewalResolutionRecord,
  overrides: Partial<LeaseRenewalWritebackApprovalRecord> = {},
): LeaseRenewalWritebackApprovalRecord {
  return {
    id: resolutionDocId(SOURCE_TRIGGER),
    source_trigger_key: current.source_trigger_key,
    run_id: current.run_id,
    field_key: current.field_key,
    field_label: current.field_label,
    candidate_fingerprint: current.candidate_fingerprint,
    resolution_updated_at: current.updated_at,
    severity: current.severity,
    state: "Approved",
    proposed_value: current.proposed_writeback!.value,
    source_of_value: current.proposed_writeback!.source_of_value,
    reason: "Approved the exact resolved proposal.",
    decided_by_uid: "admin-2",
    production_allowed: false,
    executed: false,
    created_at: APPROVAL_AT,
    updated_at: APPROVAL_AT,
    ...overrides,
  };
}

function authorization(
  current: LeaseRenewalResolutionRecord,
  currentApproval: LeaseRenewalWritebackApprovalRecord,
): SheetFieldUpdateAuthorization {
  return {
    sourceTriggerKey: current.source_trigger_key,
    runId: current.run_id,
    fieldKey: current.field_key,
    proposedValue: current.proposed_writeback!.value,
    sourceOfValue: current.proposed_writeback!.source_of_value,
    candidateFingerprint: current.candidate_fingerprint!,
    resolutionUpdatedAt: current.updated_at,
    authorizationToken: writebackAuthorizationTokenForResolution(current)!,
    approvalId: currentApproval.id,
    approvalUpdatedAt: currentApproval.updated_at,
    approvalDecidedByUid: currentApproval.decided_by_uid,
  };
}

async function seed(
  current: LeaseRenewalResolutionRecord,
  currentApproval: LeaseRenewalWritebackApprovalRecord,
) {
  const execution: ExternalExecutionRecord = {
    id: EXECUTION_ID,
    dataMode: "live",
    workflowId: "s98:Lease Renewal",
    actionId: EXECUTION_ID,
    actionKey: "google_sheets.renewal_checklist.field_update",
    contextHash: PREVIEW_HASH,
    previewHash: PREVIEW_HASH,
    idempotencyKey: EXECUTION_ID,
    state: "ready",
    attemptCount: 0,
    createdAt: "2026-09-02T12:00:00.000Z",
    updatedAt: "2026-09-02T12:00:00.000Z",
  };
  const docId = resolutionDocId(SOURCE_TRIGGER);
  await Promise.all([
    db
      .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
      .doc(EXECUTION_ID)
      .set(execution),
    db.collection(LEASE_RENEWAL_COLLECTIONS.resolutions).doc(docId).set(current),
    db
      .collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals)
      .doc(docId)
      .set(currentApproval),
  ]);
}

describe("S98 exact resolution-and-approval claim", () => {
  it("claims exactly once only when every immutable authorization term is current", async () => {
    const current = resolution();
    const currentApproval = approval(current);
    const expected = authorization(current, currentApproval);
    await seed(current, currentApproval);

    await expect(
      claimAuthorizedS98FieldUpdate(db, {
        executionId: EXECUTION_ID,
        previewHash: PREVIEW_HASH,
        authorization: expected,
      }),
    ).resolves.toBe("claimed");
    await expect(
      claimAuthorizedS98FieldUpdate(db, {
        executionId: EXECUTION_ID,
        previewHash: PREVIEW_HASH,
        authorization: expected,
      }),
    ).resolves.toBe("blocked");
    await expect(
      db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(EXECUTION_ID).get(),
    ).resolves.toHaveProperty("exists", true);
    expect(
      (
        await db
          .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
          .doc(EXECUTION_ID)
          .get()
      ).data(),
    ).toMatchObject({ state: "running", attemptCount: 1 });
  });

  it.each([
    {
      name: "same-value re-resolution",
      mutate: (current: LeaseRenewalResolutionRecord) => ({
        resolution: { ...current, updated_at: "2026-09-02T12:01:00.000Z" },
        approval: approval(current),
      }),
    },
    {
      name: "source-candidate drift",
      mutate: (current: LeaseRenewalResolutionRecord) => {
        const changed = {
          ...current,
          candidate_fingerprint: `rcf1_${"c".repeat(64)}`,
          updated_at: "2026-09-02T12:01:00.000Z",
        };
        return { resolution: changed, approval: approval(changed) };
      },
    },
    {
      name: "same-value source drift",
      mutate: (current: LeaseRenewalResolutionRecord) => {
        const changed = {
          ...current,
          resolution_kind: "pick_source" as const,
          chosen_source: "operating_sheet",
          proposed_writeback: {
            ...current.proposed_writeback!,
            source_of_value: "operating_sheet",
          },
          updated_at: "2026-09-02T12:01:00.000Z",
        };
        return { resolution: changed, approval: approval(changed) };
      },
    },
    {
      name: "returned approval",
      mutate: (current: LeaseRenewalResolutionRecord) => ({
        resolution: current,
        approval: approval(current, { state: "Returned for Revision" }),
      }),
    },
  ])("blocks $name before the one-attempt transition", async ({ mutate }) => {
    const previewResolution = resolution();
    const previewApproval = approval(previewResolution);
    const expected = authorization(previewResolution, previewApproval);
    const current = mutate(previewResolution);
    await seed(current.resolution, current.approval);

    await expect(
      claimAuthorizedS98FieldUpdate(db, {
        executionId: EXECUTION_ID,
        previewHash: PREVIEW_HASH,
        authorization: expected,
      }),
    ).resolves.toBe("blocked");
    expect(
      (
        await db
          .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
          .doc(EXECUTION_ID)
          .get()
      ).data(),
    ).toMatchObject({ state: "ready", attemptCount: 0 });
  });
});

const editor: AuthenticatedUser = {
  uid: "editor-1",
  email: "editor@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

function appendProposal(generationId: string, leaseId = "115", propertyId = "84") {
  return buildSheetWritebackProposal({
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
    actionKey: "google_sheets.renewal_checklist.row_append",
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
