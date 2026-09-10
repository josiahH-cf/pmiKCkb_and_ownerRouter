import {
  RENEWAL_WORKSPACE_COLLECTIONS,
  renewalWorkspaceDocId,
} from "@/lib/firestore/renewal-workspace";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { sheetWritebackExecutionId } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
// Lease-scoped active proposal and one-attempt claims. App target serialization does not
// isolate direct Sheet collaborators; the execution service revalidates exact source state.

import type { Firestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import {
  parseSheetFieldIntent,
  sheetIntentValue,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
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
import type {
  SheetFieldUpdateAuthorization,
  SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
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

export const SHEET_FIELD_LIFECYCLES_COLLECTION = "operating_sheet_field_lifecycles";

/** One target and the active proposal are claimed with the immutable attempt in one transaction. */
export async function claimLeaseScopedS113FieldUpdate(
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
  return db.runTransaction(async (transaction) => {
    const [executionSnapshot, proposalSnapshot] = await Promise.all([
      transaction.get(executionRef),
      transaction.get(proposalRef),
    ]);
    if (!executionSnapshot.exists || !proposalSnapshot.exists) return "blocked";
    const proposal = proposalSnapshot.data() as SheetWritebackProposal;
    const effect = proposal.effects?.find(
      (entry) => entry.effectHash === input.effectHash,
    );
    if (
      proposal.previewHash !== input.previewHash ||
      proposal.scope?.kind !== "lease_workspace" ||
      proposal.scope.leaseId !== input.leaseId ||
      proposal.scope.propertyId !== input.propertyId ||
      proposal.spreadsheetId !== input.spreadsheetId ||
      proposal.tabTitle !== input.tabTitle ||
      effect?.effect.kind !== "field_update" ||
      (!effect.effect.authorization && !effect.effect.staffIntent)
    )
      return "blocked";
    if (sheetWritebackExecutionId(proposal, effect) !== input.executionId)
      return "blocked";
    if (proposal.evidenceRef.includes(":manual:")) {
      const reference =
        /^workspace:([1-9]\d*):cycle:([a-f0-9-]{36}):manual:([a-f0-9-]{36})$/.exec(
          proposal.evidenceRef,
        );
      if (!reference || reference[1] !== input.leaseId || !effect.effect.staffIntent)
        return "blocked";
      const workspace = await transaction.get(
        db
          .collection(RENEWAL_WORKSPACE_COLLECTIONS.head)
          .doc(renewalWorkspaceDocId(input.leaseId)),
      );
      const pending = workspace.get(`sourceUpdates.${effect.effect.staffIntent.field}`);
      if (
        !workspace.exists ||
        workspace.get("leaseId") !== input.leaseId ||
        workspace.get("cycleId") !== reference[2] ||
        !pending ||
        pending.eventId !== reference[3] ||
        pending.proposalId !== proposal.generationId ||
        hashExecutionPreview(pending.intent) !==
          hashExecutionPreview(effect.effect.staffIntent)
      )
        return "blocked";
    }
    if (effect.effect.staffIntent) {
      const intent = parseSheetFieldIntent(effect.effect.staffIntent);
      if (
        intent.field === "current_rent" ||
        intent.field !== effect.effect.field ||
        intent.source !== effect.effect.source ||
        sheetIntentValue(
          intent,
          effect.effect.expectedValue,
          effect.effect.cellEvidence?.checkbox,
        ) !== effect.effect.afterValue ||
        effect.effect.authorization
      )
        return "blocked";
    } else {
      const authorization = effect.effect.authorization!;
      const decisionId = resolutionDocId(authorization.sourceTriggerKey);
      const [resolution, approval] = await Promise.all([
        transaction.get(
          db.collection(LEASE_RENEWAL_COLLECTIONS.resolutions).doc(decisionId),
        ),
        transaction.get(
          db.collection(LEASE_RENEWAL_WRITEBACK_COLLECTIONS.approvals).doc(decisionId),
        ),
      ]);
      if (
        !resolution.exists ||
        !approval.exists ||
        !authorizationMatches(
          authorization,
          normalizeRecord<LeaseRenewalResolutionRecord>(
            resolution.id,
            resolution.data()!,
          ),
          normalizeRecord<LeaseRenewalWritebackApprovalRecord>(
            approval.id,
            approval.data()!,
          ),
        )
      )
        return "blocked";
    }
    const execution = executionSnapshot.data() as ExternalExecutionRecord;
    if (
      execution.id !== input.executionId ||
      execution.previewHash !== input.previewHash ||
      execution.contextHash !== input.previewHash ||
      execution.actionKey !== effect.actionKey
    )
      return "blocked";
    if (execution.state === "succeeded") return "duplicate";
    if (execution.state !== "ready" || execution.attemptCount !== 0) return "blocked";
    const targetId = createHash("sha256")
      .update(
        JSON.stringify({
          spreadsheet: input.spreadsheetId,
          tab: input.tabTitle,
          row: effect.effect.rowNumber,
          field: effect.effect.field,
        }),
      )
      .digest("hex");
    const targetRef = db.collection(SHEET_FIELD_LIFECYCLES_COLLECTION).doc(targetId);
    const target = await transaction.get(targetRef);
    if (target.exists) {
      const previousId = target.get("execution_id");
      if (typeof previousId !== "string") return "blocked";
      const previous = await transaction.get(
        db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(previousId),
      );
      if (!previous.exists || !["succeeded", "failed"].includes(previous.get("state")))
        return "blocked";
    }
    const now = new Date().toISOString();
    transaction.set(executionRef, {
      ...execution,
      state: "running",
      attemptCount: 1,
      updatedAt: now,
    });
    transaction.set(targetRef, {
      version: "operating-sheet-field-lifecycle/v1",
      execution_id: input.executionId,
      proposal_preview_hash: input.previewHash,
      lease_id: input.leaseId,
      updated_at: now,
    });
    transaction.create(
      db.collection(EXTERNAL_EXECUTION_COLLECTIONS.audit).doc(uuidv7()),
      {
        execution_id: execution.id,
        action_key: execution.actionKey,
        data_mode: execution.dataMode,
        live_evidence_eligible: false,
        context_hash: execution.contextHash,
        preview_hash: execution.previewHash,
        action: "attempt_claimed_with_active_lease_generation",
        state: "running",
        attempt_count: 1,
        created_at: now,
      },
    );
    return "claimed";
  });
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
