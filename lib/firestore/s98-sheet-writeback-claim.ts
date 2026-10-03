// Lease-scoped active proposal and one-attempt claims. App target serialization does not
// isolate direct Sheet collaborators; the execution service revalidates exact source state.
// S160: a current-rent field update is bound to the lease's working current rent inside the
// claim transaction; no reconciliation resolution or approval record is consulted.

import type { Firestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { v7 as uuidv7 } from "uuid";

import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import {
  currentRenewalWorkspaceState,
  renewalWorkspaceHeadRefs,
} from "@/lib/firestore/renewal-workspace";
import {
  parseRenewalWorkingRecord,
  renewalWorkingRecordRef,
} from "@/lib/firestore/renewal-working-record";
import type { ExternalExecutionRecord } from "@/lib/external-execution/types";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  parseSheetFieldIntent,
  sheetIntentValue,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import {
  SHEET_WRITEBACK_PROPOSAL_VERSION,
  sheetWritebackExecutionId,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  SHEET_APPEND_LIFECYCLES_COLLECTION,
  SHEET_WRITEBACK_PROPOSALS_COLLECTION,
  sheetAppendLifecycleDocId,
  sheetWritebackProposalDocId,
  type SheetAppendLifecycleState,
} from "@/lib/lease-renewal/sheet-writeback/proposal-store";
import { sheetRuntimeBindingMatches } from "@/lib/lease-renewal/sheet-writeback/runtime-binding";
import { workingCurrentRent } from "@/lib/lease-renewal/working-record";

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
    if (
      proposal.version !== SHEET_WRITEBACK_PROPOSAL_VERSION ||
      !sheetRuntimeBindingMatches(proposal.runtimeBinding)
    )
      return "blocked";
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
    // S160: only a staff-intent update is claimable. An update carrying a reconciliation
    // approval is a retired shape and can never be confirmed again.
    if (!effect.effect.staffIntent || effect.effect.authorization) return "blocked";
    if (proposal.evidenceRef.includes(":manual:")) {
      // A staff-recorded fact stays bound to the exact recorded event it was prepared from (value
      // integrity). The work record may be a dated cycle or the lease-bound record (S154).
      const reference =
        /^workspace:([1-9]\d*):cycle:([a-f0-9-]{36}):manual:([a-f0-9-]{36})$/.exec(
          proposal.evidenceRef,
        );
      if (!reference || reference[1] !== input.leaseId) return "blocked";
      const heads = renewalWorkspaceHeadRefs(db, input.leaseId);
      const [dated, leaseBound] = await Promise.all([
        transaction.get(heads.dated),
        transaction.get(heads.leaseBound),
      ]);
      let state: ReturnType<typeof currentRenewalWorkspaceState>;
      try {
        state = currentRenewalWorkspaceState(db, input.leaseId, dated, leaseBound);
      } catch {
        return "blocked";
      }
      const pending = state?.sourceUpdates[effect.effect.staffIntent.field];
      if (
        !state ||
        state.cycleId !== reference[2] ||
        !pending ||
        pending.eventId !== reference[3] ||
        pending.proposalId !== proposal.generationId ||
        hashExecutionPreview(pending.intent) !==
          hashExecutionPreview(effect.effect.staffIntent)
      )
        return "blocked";
    }
    const intent = parseSheetFieldIntent(effect.effect.staffIntent);
    if (
      intent.field !== effect.effect.field ||
      intent.source !== effect.effect.source ||
      sheetIntentValue(
        intent,
        effect.effect.expectedValue,
        effect.effect.cellEvidence?.checkbox,
      ) !== effect.effect.afterValue
    )
      return "blocked";
    if (intent.field === "current_rent") {
      // S160: the value is the working current rent, read inside this transaction; a changed or
      // cleared working value blocks the claim and leaves the attempt unused.
      const working = await transaction.get(renewalWorkingRecordRef(db, input.leaseId));
      let current: number | null;
      try {
        current = workingCurrentRent(
          working.exists
            ? parseRenewalWorkingRecord(working.data(), input.leaseId)
            : null,
        );
      } catch {
        return "blocked";
      }
      if (current === null || current !== intent.value) return "blocked";
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
    if (!sheetRuntimeBindingMatches(proposal.runtimeBinding)) return "blocked";
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
    if (
      proposal.version !== SHEET_WRITEBACK_PROPOSAL_VERSION ||
      !sheetRuntimeBindingMatches(proposal.runtimeBinding)
    )
      return "blocked";
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
    if (!sheetRuntimeBindingMatches(proposal.runtimeBinding)) return "blocked";

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
