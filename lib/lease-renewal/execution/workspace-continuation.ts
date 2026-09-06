// S107: the workspace's load-time continuation pass.
//
// It reads this lease's confirmed-effect attempts from the durable execution store and projects one
// consolidated summary. It performs no provider call and no write of any kind: an orphaned attempt
// (claimed, still unresolved, older than the shared reconcile age) is surfaced with the operator's
// exact next action, and its reconciliation stays the Admin-gated, human-initiated operation each
// effect family's own service exposes through its phase panel. It adds no job platform and no
// retry. Before this pass was made read-only, any viewer's page load reached the services'
// reconcile and could move a running attempt to ambiguous or settle it without a person.

import type { ExternalExecutionStore } from "@/lib/external-execution/types";
import {
  projectRenewalAttemptSummary,
  type RenewalAttemptSummary,
} from "@/lib/lease-renewal/execution/attempt-continuation";
import { loadRenewalAttemptRecords } from "@/lib/lease-renewal/execution/attempt-loader";
import type { SheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import type { RenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-contract";

/** Project one lease's attempt summary from durable records only. */
export async function projectWorkspaceAttemptSummary(input: {
  readonly leaseId: string;
  readonly store: ExternalExecutionStore;
  readonly rentvineProposal?: RenewalWritebackProposal | null;
  readonly sheetProposal?: SheetWritebackProposal | null;
  readonly nowMs?: number;
}): Promise<RenewalAttemptSummary> {
  const nowMs = input.nowMs ?? Date.now();
  const attempts = await loadRenewalAttemptRecords({
    store: input.store,
    rentvineProposal: input.rentvineProposal ?? null,
    sheetProposal: input.sheetProposal ?? null,
  });
  return projectRenewalAttemptSummary({ leaseId: input.leaseId, attempts, nowMs });
}
