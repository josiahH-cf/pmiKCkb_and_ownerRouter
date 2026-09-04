// S107: the workspace's load-time continuation pass.
//
// It reads this lease's confirmed-effect attempts, reconciles only the orphaned ones through each
// effect family's own existing `reconcileEffect`, and returns one consolidated summary. It adds no
// job platform and no retry: a reconcile that cannot prove an outcome leaves the attempt exactly as
// it was, and the summary names the operator's next action.

import type { EnvironmentDescriptor } from "@/lib/environment/descriptor";
import type { ExternalExecutionStore } from "@/lib/external-execution/types";
import {
  applyRenewalReconciliations,
  projectRenewalAttemptSummary,
  reconcileOrphanedRenewalAttempts,
  type RenewalAttemptOutcome,
  type RenewalAttemptRecord,
  type RenewalAttemptSummary,
} from "@/lib/lease-renewal/execution/attempt-continuation";
import { loadRenewalAttemptRecords } from "@/lib/lease-renewal/execution/attempt-loader";
import { SheetWritebackService } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import { buildLiveSheetWritebackDeps } from "@/lib/lease-renewal/sheet-writeback/live";
import type { SheetWritebackProposal } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { RenewalWritebackService } from "@/lib/lease-renewal/writeback/execution-service";
import { buildLiveRenewalWritebackDeps } from "@/lib/lease-renewal/writeback/live";
import type { RenewalWritebackProposal } from "@/lib/lease-renewal/writeback/proposal-contract";

/** The trailing segment of both families' execution ids is the effect hash. */
function effectHashOf(executionId: string): string {
  return executionId.slice(executionId.lastIndexOf(":") + 1);
}

function outcomeFor(state: RenewalAttemptRecord["state"]): RenewalAttemptOutcome {
  return state === "succeeded" || state === "failed" || state === "ambiguous"
    ? state
    : "unresolved";
}

/**
 * Reconcile one lease's orphaned attempts and project its summary. Every provider observation goes
 * through the family's existing service, which refuses outside a permitted environment; a service
 * that is not configured simply reconciles nothing.
 */
export async function projectWorkspaceAttemptSummary(input: {
  readonly leaseId: string;
  readonly store: ExternalExecutionStore;
  readonly descriptor: EnvironmentDescriptor;
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
  const reconciliations = await reconcileOrphanedRenewalAttempts({
    leaseId: input.leaseId,
    attempts,
    nowMs,
    reconcile: async (attempt) => {
      if (attempt.executionId.startsWith("s97:") && input.rentvineProposal) {
        const deps = buildLiveRenewalWritebackDeps(input.descriptor);
        if ("status" in deps) return "unresolved";
        await new RenewalWritebackService(deps).reconcileEffect({
          proposal: input.rentvineProposal,
          effectHash: effectHashOf(attempt.executionId),
        });
      } else if (attempt.executionId.startsWith("s98:") && input.sheetProposal) {
        const deps = buildLiveSheetWritebackDeps(input.descriptor);
        if ("status" in deps) return "unresolved";
        await new SheetWritebackService(deps).reconcileEffect({
          proposal: input.sheetProposal,
          effectHash: effectHashOf(attempt.executionId),
        });
      } else {
        return "unresolved";
      }
      // The service records the outcome durably; the render reads it back rather than trusting the
      // in-memory return value.
      const record = await input.store.get(attempt.executionId);
      return record ? outcomeFor(record.state) : "unresolved";
    },
  });
  return projectRenewalAttemptSummary({
    leaseId: input.leaseId,
    attempts: applyRenewalReconciliations(attempts, reconciliations),
    nowMs,
  });
}
