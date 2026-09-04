// S107: read one lease's confirmed-effect attempts from the durable execution store.
//
// It reads only. Execution identity is derived by each effect family's own existing builder, so no
// second identity scheme appears here, and an absent record simply means the operator never
// confirmed that effect.

import type { ExternalExecutionStore } from "@/lib/external-execution/types";
import {
  renewalAttemptFromExecutionRecord,
  type RenewalAttemptRecord,
} from "@/lib/lease-renewal/execution/attempt-continuation";
import {
  sheetWritebackExecutionId,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  renewalWritebackExecutionId,
  type RenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-contract";

export async function loadRenewalAttemptRecords(input: {
  readonly store: ExternalExecutionStore;
  readonly rentvineProposal?: RenewalWritebackProposal | null;
  readonly sheetProposal?: SheetWritebackProposal | null;
}): Promise<RenewalAttemptRecord[]> {
  const ids: string[] = [];
  if (input.rentvineProposal) {
    for (const effect of input.rentvineProposal.effects) {
      ids.push(renewalWritebackExecutionId(input.rentvineProposal, effect));
    }
  }
  if (input.sheetProposal) {
    for (const effect of input.sheetProposal.effects) {
      ids.push(sheetWritebackExecutionId(input.sheetProposal, effect));
    }
  }
  const attempts: RenewalAttemptRecord[] = [];
  for (const id of ids) {
    const attempt = renewalAttemptFromExecutionRecord(await input.store.get(id));
    if (attempt) attempts.push(attempt);
  }
  return attempts;
}
