import type { ExternalExecutionStore } from "@/lib/external-execution/types";
import { clientSheetWritebackEffect } from "@/lib/lease-renewal/sheet-writeback/client-projection";
import {
  sheetWritebackExecutionId,
  sheetWritebackReversalExecutionId,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

export interface SheetWritebackEffectStatusView {
  readonly execution_id: string;
  readonly state: string;
  readonly attempt_count: number;
  readonly receipt?: {
    readonly provider_ref: string;
    readonly result_hash: string;
    readonly reconciled: boolean;
  };
  readonly reversal_state: string | null;
  readonly effect_executable: boolean;
  readonly reversal_executable: false;
  readonly index: number;
  readonly action_key: string;
  readonly kind: "row_append" | "field_update";
  readonly effect_hash: string;
  readonly effect: Record<string, unknown>;
  readonly reversal_kind: "delete_appended_row" | "restore_field";
}

/** Project durable execution receipts without inferring readiness from proposal presence. */
export async function loadSheetWritebackEffectStatuses(
  proposal: SheetWritebackProposal,
  store: ExternalExecutionStore,
): Promise<SheetWritebackEffectStatusView[]> {
  const statuses: SheetWritebackEffectStatusView[] = [];
  for (const entry of proposal.effects) {
    const executionId = sheetWritebackExecutionId(proposal, entry);
    const record = await store.get(executionId);
    let reversalState: string | null = null;
    if (record?.state === "succeeded" && record.receipt) {
      const reversal = await store.get(
        sheetWritebackReversalExecutionId(executionId, record.receipt.resultHash),
      );
      reversalState = reversal?.state ?? null;
    }
    statuses.push({
      ...clientSheetWritebackEffect(entry),
      execution_id: executionId,
      state: record?.state ?? "not_started",
      attempt_count: record?.attemptCount ?? 0,
      ...(record?.receipt
        ? {
            receipt: {
              provider_ref: record.receipt.providerRef,
              result_hash: record.receipt.resultHash,
              reconciled: record.receipt.reconciled,
            },
          }
        : {}),
      reversal_state: reversalState,
      effect_executable: entry.effect.kind === "row_append",
      reversal_executable: false,
    });
  }
  return statuses;
}
