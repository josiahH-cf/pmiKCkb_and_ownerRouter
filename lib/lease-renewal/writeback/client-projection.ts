// Value-bearing client projection of one S97 proposal for the authorized workspace review panel.

import type {
  RenewalWritebackProposal,
  ValidatedRenewalWritebackEffect,
} from "@/lib/lease-renewal/writeback/proposal-contract";

export interface RentvineWritebackClientEffect {
  index: number;
  action_key: string;
  kind: "renewal_dates_update" | "recurring_charge_update" | "recurring_charge_create";
  effect_hash: string;
  effect: Record<string, unknown>;
  reversal_kind:
    | "restore_dates"
    | "restore_charge_fields"
    | "delete_created_charge"
    | "none";
  reversal_reason?: string;
}

export interface RentvineWritebackClientProposal {
  lease_id: string;
  account: string;
  actor_uid: string;
  actor_email: string;
  lease_state: Record<string, unknown>;
  source_read_at: string;
  evidence_ref: string;
  preview_hash: string;
  created_at: string;
  confirmation_expires_at: string;
  effects: RentvineWritebackClientEffect[];
}

export function clientRenewalWritebackEffect(
  entry: ValidatedRenewalWritebackEffect,
): RentvineWritebackClientEffect {
  return {
    index: entry.index,
    action_key: entry.actionKey,
    kind: entry.effect.kind,
    effect_hash: entry.effectHash,
    effect: entry.effect as unknown as Record<string, unknown>,
    reversal_kind: entry.reversal.kind,
    ...(entry.reversal.kind === "none" ? { reversal_reason: entry.reversal.reason } : {}),
  };
}

export function clientRenewalWritebackProposal(
  proposal: RenewalWritebackProposal,
): RentvineWritebackClientProposal {
  return {
    lease_id: proposal.leaseId,
    account: proposal.account,
    actor_uid: proposal.actorUid,
    actor_email: proposal.actorEmail,
    lease_state: proposal.leaseState as unknown as Record<string, unknown>,
    source_read_at: proposal.sourceReadAtIso,
    evidence_ref: proposal.evidenceRef,
    preview_hash: proposal.previewHash,
    created_at: proposal.createdAtIso,
    confirmation_expires_at: proposal.confirmationExpiresAtIso,
    effects: proposal.effects.map(clientRenewalWritebackEffect),
  };
}
