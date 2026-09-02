// Value-bearing client projection of one S98 proposal for the authorized workspace panel.

import type {
  SheetWritebackProposal,
  ValidatedSheetWritebackEffect,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

export interface SheetWritebackClientEffect {
  index: number;
  action_key: string;
  kind: "row_append" | "field_update";
  effect_hash: string;
  effect: Record<string, unknown>;
  reversal_kind: "delete_appended_row" | "restore_field";
}

export interface SheetWritebackClientProposal {
  spreadsheet_id: string;
  tab_title: string;
  actor_email: string;
  source_read_at: string;
  evidence_ref: string;
  preview_hash: string;
  created_at: string;
  confirmation_expires_at: string;
  effects: SheetWritebackClientEffect[];
}

export function clientSheetWritebackEffect(
  entry: ValidatedSheetWritebackEffect,
): SheetWritebackClientEffect {
  return {
    index: entry.index,
    action_key: entry.actionKey,
    kind: entry.effect.kind,
    effect_hash: entry.effectHash,
    effect: entry.effect as unknown as Record<string, unknown>,
    reversal_kind: entry.reversal.kind,
  };
}

export function clientSheetWritebackProposal(
  proposal: SheetWritebackProposal,
): SheetWritebackClientProposal {
  return {
    spreadsheet_id: proposal.spreadsheetId,
    tab_title: proposal.tabTitle,
    actor_email: proposal.actorEmail,
    source_read_at: proposal.sourceReadAtIso,
    evidence_ref: proposal.evidenceRef,
    preview_hash: proposal.previewHash,
    created_at: proposal.createdAtIso,
    confirmation_expires_at: proposal.confirmationExpiresAtIso,
    effects: proposal.effects.map(clientSheetWritebackEffect),
  };
}
