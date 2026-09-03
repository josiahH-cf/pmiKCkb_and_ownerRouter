// S98 lease-scoped append and legacy field-authorization claims. The append proposal generation,
// lease identity, one-attempt transition, and recovery lifecycle share one Firestore transaction.
// Field execution is currently unavailable because the live provider has no stable-row protocol;
// its authorization claim remains readable for compatibility only.

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import {
  LEASE_RENEWAL_COLLECTIONS,
  resolutionDocId,
} from "@/lib/firestore/lease-renewal-resolutions";
import { LEASE_RENEWAL_WRITEBACK_COLLECTIONS } from "@/lib/firestore/lease-renewal-writeback-approvals";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import type { ExternalExecutionRecord } from "@/lib/external-execution/types";
import type { SheetFieldUpdateAuthorization } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { writebackApprovalMatchesResolution } from "@/lib/lease-renewal/writeback-approval";
import { writebackAuthorizationTokenForResolution } from "@/lib/lease-renewal/writeback-authorization-token";
import {
  SHEET_APPEND_LIFECYCLES_COLLECTION,
  SHEET_WRITEBACK_PROPOSALS_COLLECTION,
  sheetAppendLifecycleDocId,
  sheetWritebackProposalDocId,
  type SheetAppendLifecycleState,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";

export interface S98AppendClaimInput {
  executionId: string;
  previewHash: string;
  effectHash: string;
  spreadsheetId: string;
  tabTitle: string;
  leaseId: string;
  propertyId: string;
}

/**
 * Atomically bind one append attempt to the still-active lease proposal. Replacement/discard reads
 * the same lifecycle document, so it cannot race a claim into a second proposal generation.
 */
export async function claimLeaseScopedS98Append(
  db: Firestore,
  input: S98AppendClaimInput,
): Promise<"claimed" | "duplicate" | "blocked"> {
  const executionRef = db
    .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
    .doc(input.executionId);
  const proposalRef = db.collection(SHEET_WRITEBACK_PROPOSALS_COLLECTION).doc(
    sheetWritebackProposalDocId(input.spreadsheetId, input.tabTitle, {
      kind: "lease_workspace",
      leaseId: input.leaseId,
    }),
  );
  const lifecycleRef = db
    .collection(SHEET_APPEND_LIFECYCLES_COLLECTION)
    .doc(sheetAppendLifecycleDocId(input.spreadsheetId, input.tabTitle, input.leaseId));

  return db.runTransaction(async (transaction) => {
    const [executionSnapshot, proposalSnapshot, lifecycleSnapshot] = await Promise.all([
      transaction.get(executionRef),
      transaction.get(proposalRef),
      transaction.get(lifecycleRef),
    ]);
    if (!executionSnapshot.exists || !proposalSnapshot.exists) return "blocked";

    const proposal = proposalSnapshot.data() ?? {};
    const scope = proposal.scope as Record<string, unknown> | undefined;
    const effects = Array.isArray(proposal.effects) ? proposal.effects : [];
    const exactEffect = effects.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).effectHash === input.effectHash,
    ) as Record<string, unknown> | undefined;
    const rawEffect = exactEffect?.effect as Record<string, unknown> | undefined;
    if (
      proposal.previewHash !== input.previewHash ||
      scope?.kind !== "lease_workspace" ||
      scope.leaseId !== input.leaseId ||
      scope.propertyId !== input.propertyId ||
      rawEffect?.kind !== "row_append" ||
      rawEffect.mode !== "normal" ||
      rawEffect.leaseId !== input.leaseId ||
      rawEffect.propertyId !== input.propertyId
    ) {
      return "blocked";
    }

    const execution = executionSnapshot.data() as ExternalExecutionRecord;
    if (
      execution.id !== input.executionId ||
      execution.previewHash !== input.previewHash ||
      execution.contextHash !== input.previewHash ||
      execution.actionKey !== "google_sheets.renewal_checklist.row_append"
    ) {
      return "blocked";
    }
    if (execution.state === "succeeded") return "duplicate";
    if (execution.state !== "ready" || execution.attemptCount !== 0) {
      return "blocked";
    }
    if (lifecycleSnapshot.exists) return "blocked";

    const now = new Date().toISOString();
    const next: ExternalExecutionRecord = {
      ...execution,
      state: "running",
      attemptCount: 1,
      updatedAt: now,
    };
    transaction.set(executionRef, next);
    transaction.create(lifecycleRef, {
      version: "operating-sheet-append-lifecycle/v1",
      spreadsheet_id: input.spreadsheetId,
      tab_title: input.tabTitle,
      lease_id: input.leaseId,
      property_id: input.propertyId,
      proposal_preview_hash: input.previewHash,
      effect_hash: input.effectHash,
      execution_id: input.executionId,
      state: "running",
      updated_at: now,
    });
    transaction.create(
      db.collection(EXTERNAL_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
      {
        execution_id: next.id,
        data_mode: next.dataMode,
        live_evidence_eligible: false,
        workflow_id: next.workflowId,
        action_id: next.actionId,
        action_key: next.actionKey,
        context_hash: next.contextHash,
        preview_hash: next.previewHash,
        state: next.state,
        attempt_count: next.attemptCount,
        action: "attempt_claimed_with_active_lease_generation",
        created_at: now,
      },
    );
    return "claimed";
  });
}

/** Keep the lease guard in lockstep with the durable attempt; unknown drift fails closed. */
export async function settleLeaseScopedS98Append(
  db: Firestore,
  input: S98AppendClaimInput & { state: SheetAppendLifecycleState },
): Promise<void> {
  const lifecycleRef = db
    .collection(SHEET_APPEND_LIFECYCLES_COLLECTION)
    .doc(sheetAppendLifecycleDocId(input.spreadsheetId, input.tabTitle, input.leaseId));
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(lifecycleRef);
    if (!snapshot.exists) throw new Error("S98 append lifecycle is missing.");
    const current = snapshot.data() ?? {};
    if (
      current.execution_id !== input.executionId ||
      current.proposal_preview_hash !== input.previewHash ||
      current.effect_hash !== input.effectHash ||
      current.lease_id !== input.leaseId ||
      current.property_id !== input.propertyId
    ) {
      throw new Error("S98 append lifecycle does not match the claimed attempt.");
    }
    if (current.state === input.state) return;
    const allowed =
      current.state === "running" ||
      (current.state === "ambiguous" && input.state === "succeeded");
    if (!allowed) {
      throw new Error("S98 append lifecycle is already terminal.");
    }
    transaction.update(lifecycleRef, {
      state: input.state,
      updated_at: new Date().toISOString(),
    });
  });
}

export async function claimAuthorizedS98FieldUpdate(
  db: Firestore,
  input: {
    executionId: string;
    previewHash: string;
    authorization: SheetFieldUpdateAuthorization;
  },
): Promise<"claimed" | "duplicate" | "blocked"> {
  const executionRef = db
    .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
    .doc(input.executionId);
  const decisionId = resolutionDocId(input.authorization.sourceTriggerKey);
  const resolutionRef = db
    .collection(LEASE_RENEWAL_COLLECTIONS.resolutions)
    .doc(decisionId);
  const approvalRef = db
    .collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals)
    .doc(decisionId);

  return db.runTransaction(async (transaction) => {
    const [executionSnapshot, resolutionSnapshot, approvalSnapshot] = await Promise.all([
      transaction.get(executionRef),
      transaction.get(resolutionRef),
      transaction.get(approvalRef),
    ]);
    if (
      !executionSnapshot.exists ||
      !resolutionSnapshot.exists ||
      !approvalSnapshot.exists
    ) {
      return "blocked" as const;
    }
    const resolution = normalizeRecord<LeaseRenewalResolutionRecord>(
      resolutionSnapshot.id,
      resolutionSnapshot.data()!,
    );
    const approval = normalizeRecord<LeaseRenewalWritebackApprovalRecord>(
      approvalSnapshot.id,
      approvalSnapshot.data()!,
    );
    if (!authorizationMatches(input.authorization, resolution, approval)) {
      return "blocked" as const;
    }

    const record = executionSnapshot.data() as ExternalExecutionRecord;
    if (
      record.id !== input.executionId ||
      record.previewHash !== input.previewHash ||
      record.contextHash !== input.previewHash ||
      record.actionKey !== "google_sheets.renewal_checklist.field_update" ||
      record.state === "blocked"
    ) {
      return "blocked" as const;
    }
    if (record.state === "succeeded") return "duplicate" as const;
    if (record.state !== "ready" || record.attemptCount !== 0) {
      return "blocked" as const;
    }
    const now = new Date().toISOString();
    const next: ExternalExecutionRecord = {
      ...record,
      state: "running",
      attemptCount: 1,
      updatedAt: now,
    };
    transaction.set(executionRef, next);
    transaction.create(
      db.collection(EXTERNAL_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
      {
        execution_id: next.id,
        data_mode: next.dataMode,
        live_evidence_eligible: false,
        workflow_id: next.workflowId,
        action_id: next.actionId,
        action_key: next.actionKey,
        context_hash: next.contextHash,
        preview_hash: next.previewHash,
        state: next.state,
        attempt_count: next.attemptCount,
        action: "attempt_claimed_with_current_resolution_approval",
        created_at: now,
      },
    );
    return "claimed" as const;
  });
}

function authorizationMatches(
  expected: SheetFieldUpdateAuthorization,
  resolution: LeaseRenewalResolutionRecord,
  approval: LeaseRenewalWritebackApprovalRecord,
): boolean {
  const proposal = resolution.proposed_writeback;
  return (
    approval.state === "Approved" &&
    writebackApprovalMatchesResolution(resolution, approval) &&
    writebackAuthorizationTokenForResolution(resolution) ===
      expected.authorizationToken &&
    resolution.source_trigger_key === expected.sourceTriggerKey &&
    resolution.run_id === expected.runId &&
    resolution.field_key === expected.fieldKey &&
    resolution.candidate_fingerprint === expected.candidateFingerprint &&
    resolution.updated_at === expected.resolutionUpdatedAt &&
    proposal?.value === expected.proposedValue &&
    proposal?.source_of_value === expected.sourceOfValue &&
    approval.id === expected.approvalId &&
    approval.updated_at === expected.approvalUpdatedAt &&
    approval.decided_by_uid === expected.approvalDecidedByUid
  );
}

function normalizeRecord<T>(id: string, data: Record<string, unknown>): T {
  return normalizeFirestoreValue({ ...data, id }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return (toDate.call(value) as Date).toISOString();
    }
  }
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}
