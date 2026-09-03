// S97's one-attempt transition and active proposal generation share one Firestore transaction.
// This is the final server-side boundary after the route loads a proposal: if an Editor replaces or
// discards that generation concurrently, the transaction retries against the new active document
// and refuses before any provider writer is constructed.

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { canonicalJson } from "@/lib/execution/preview-hash";
import type { ExternalExecutionRecord } from "@/lib/external-execution/types";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import { RENEWAL_WRITEBACK_PROPOSALS_COLLECTION } from "@/lib/lease-renewal/writeback/proposal-store";
import {
  legacyRenewalWritebackExecutionId,
  renewalWritebackExecutionId,
  type RenewalWritebackProposal,
  type ValidatedRenewalWritebackEffect,
} from "@/lib/lease-renewal/writeback/proposal-contract";

export interface S97ActiveEffectClaimInput {
  readonly proposal: RenewalWritebackProposal;
  readonly effect: ValidatedRenewalWritebackEffect;
  readonly record: ExternalExecutionRecord;
}

function recordMatches(
  record: ExternalExecutionRecord,
  proposal: RenewalWritebackProposal,
  effect: ValidatedRenewalWritebackEffect,
): boolean {
  const currentId = renewalWritebackExecutionId(proposal, effect);
  const legacyId = legacyRenewalWritebackExecutionId(proposal, effect);
  return (
    (record.id === currentId || record.id === legacyId) &&
    record.dataMode === "live" &&
    record.workflowId === `s97:${proposal.leaseId}` &&
    record.actionId === record.id &&
    record.actionKey === effect.actionKey &&
    record.contextHash === proposal.previewHash &&
    record.previewHash === effect.effectHash &&
    record.idempotencyKey === record.id
  );
}

/** Atomically create-and-claim (or duplicate-check) one effect of the exact active generation. */
export async function claimActiveS97RenewalEffect(
  db: Firestore,
  input: S97ActiveEffectClaimInput,
): Promise<"claimed" | "duplicate" | "blocked"> {
  const { proposal, effect, record: requested } = input;
  if (!recordMatches(requested, proposal, effect)) return "blocked";
  const currentId = renewalWritebackExecutionId(proposal, effect);
  // New executions must use the generation-bound identity. The legacy id is accepted only when a
  // matching durable record already exists for compatibility with completed proof receipts.
  if (requested.id !== currentId && requested.state === "ready") return "blocked";

  const proposalRef = db
    .collection(RENEWAL_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(proposal.leaseId);
  const executionRef = db
    .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
    .doc(requested.id);
  return db.runTransaction(async (transaction) => {
    const [proposalSnapshot, executionSnapshot] = await Promise.all([
      transaction.get(proposalRef),
      transaction.get(executionRef),
    ]);
    if (!proposalSnapshot.exists) return "blocked";
    const active = proposalSnapshot.data() ?? {};
    const activeEffects = Array.isArray(active.effects) ? active.effects : [];
    const storedEffect = activeEffects.find(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).effectHash === effect.effectHash,
    );
    if (
      active.version !== proposal.version ||
      active.leaseId !== proposal.leaseId ||
      active.account !== proposal.account ||
      active.previewHash !== proposal.previewHash ||
      canonicalJson(storedEffect) !== canonicalJson(effect)
    ) {
      return "blocked";
    }

    const existing = executionSnapshot.exists
      ? (executionSnapshot.data() as ExternalExecutionRecord)
      : null;
    if (existing && !recordMatches(existing, proposal, effect)) return "blocked";
    if (existing?.state === "succeeded" && existing.receipt) return "duplicate";
    if (existing && (existing.state !== "ready" || existing.attemptCount !== 0)) {
      return "blocked";
    }
    if (!existing && requested.id !== currentId) return "blocked";

    const now = new Date().toISOString();
    const next: ExternalExecutionRecord = {
      ...(existing ?? requested),
      state: "running",
      attemptCount: 1,
      updatedAt: now,
    };
    if (existing) transaction.set(executionRef, next);
    else transaction.create(executionRef, next);
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
