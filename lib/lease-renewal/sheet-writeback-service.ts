// Route-facing service for the LIVE, confirm-target Sheet write-back (Phase C enablement).
//
// Two steps a human drives: RESOLVE the exact target (confirm:false → returns the value, the KB-Proposed
// column, and the matched row's current cells so the operator can verify it is the right lease), then
// COMMIT the guarded single-cell append (confirm:true). The row is NOT guessed: it comes from the
// reconciliation pipeline's own stamp on the flag (recordRef.sourceRowIndex) — the same join that already
// reconciles the sheet correctly today. Everything stays flag-gated (default OFF) and append-only; any
// uncertainty blocks. Deps are injected so the whole flow is unit-tested without RentVine, Sheets, or
// Firestore. PII-safe: a thrown read/write error collapses to a category, never a surfaced message.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { getWritebackApproval } from "@/lib/firestore/lease-renewal-writeback-approvals";
import type { LeaseRenewalWritebackApprovalRecord } from "@/lib/firestore/types";
import {
  GoogleSheetsApiWriter,
  type SheetsValuesWriter,
} from "@/lib/google-sheets/write-client";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import { rebuildLiveRenewalRun } from "@/lib/lease-renewal/live-review";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";
import {
  commitWritebackAtRow,
  resolveWritebackTarget,
  type ResolvedWritebackTarget,
  type RowWritebackPlan,
} from "@/lib/lease-renewal/sheet-writeback-execution";

// Must match the append-only column header the proposal generator names (writeback-proposal.ts).
const APPEND_ONLY_COLUMN_PREFIX = "KB Proposed";

export type WritebackExecuteOutcome =
  | { status: "disabled" }
  | { status: "not_configured" }
  | { status: "read_error" }
  | { status: "flag_not_found" }
  | { status: "not_approved"; reason: string }
  | { status: "resolved"; target: ResolvedWritebackTarget }
  | { status: "written"; a1: string }
  | { status: "blocked"; reason: string };

export interface WritebackExecuteInput {
  runId: string;
  sourceTriggerKey: string;
  /** false → resolve + return the target for human confirmation; true → perform the guarded write. */
  confirm: boolean;
}

export interface WritebackExecuteDeps {
  rebuildRun: (readTimestamp: string) => Promise<RenewalRunResult | null>;
  loadApproval: (
    actor: AuthenticatedUser,
    sourceTriggerKey: string,
  ) => Promise<LeaseRenewalWritebackApprovalRecord | null>;
  writer: SheetsValuesWriter;
  spreadsheetId: string;
}

/** Build the live deps, or a not_configured status when the live sources aren't connected. */
export function buildLiveWritebackDeps():
  | WritebackExecuteDeps
  | { status: "not_configured" } {
  const config = buildLiveRenewalConfig();
  if (!config.ok) return { status: "not_configured" };
  return {
    rebuildRun: rebuildLiveRenewalRun,
    loadApproval: getWritebackApproval,
    writer: new GoogleSheetsApiWriter(),
    spreadsheetId: config.spreadsheetId,
  };
}

/**
 * Resolve (confirm:false) or commit (confirm:true) the approved write-back for one flag. Requires a
 * matching Approved approval with a value; otherwise returns not_approved. The row + column come from the
 * live rebuild's flag stamp; the write itself is the flag-gated, append-only, compare-and-set executor.
 */
export async function prepareOrCommitWriteback(
  actor: AuthenticatedUser,
  input: WritebackExecuteInput,
  readTimestamp: string,
  deps: WritebackExecuteDeps,
): Promise<WritebackExecuteOutcome> {
  const run = await deps.rebuildRun(readTimestamp);
  if (!run) return { status: "read_error" };

  const flag = run.flags.find(
    (outcome) =>
      outcome.queueMapping?.queueItem.source_trigger_key === input.sourceTriggerKey,
  );
  if (!flag) return { status: "flag_not_found" };

  const approval = await deps.loadApproval(actor, input.sourceTriggerKey);
  if (!approval || approval.state !== "Approved") {
    return {
      status: "not_approved",
      reason: "This flag has no approved write-back to execute.",
    };
  }
  if (approval.run_id !== input.runId) {
    return {
      status: "not_approved",
      reason: "This approval belongs to a different run.",
    };
  }
  const proposedValue = (approval.proposed_value ?? "").trim();
  if (proposedValue === "") {
    return {
      status: "not_approved",
      reason: "The approved proposal has no value to write.",
    };
  }

  const plan: RowWritebackPlan = {
    spreadsheetId: deps.spreadsheetId,
    tabName: flag.recordRef.tab,
    proposedColumnHeader: `${APPEND_ONLY_COLUMN_PREFIX} — ${flag.fieldLabel}`,
    rowIndex: flag.recordRef.sourceRowIndex,
    proposedValue,
  };

  try {
    if (!input.confirm) {
      const resolved = await resolveWritebackTarget(deps.writer, plan);
      if (resolved.status === "resolved") {
        return { status: "resolved", target: resolved.target };
      }
      return resolved.status === "disabled"
        ? { status: "disabled" }
        : { status: "blocked", reason: resolved.reason };
    }

    const outcome = await commitWritebackAtRow(deps.writer, plan);
    if (outcome.status === "written") return { status: "written", a1: outcome.a1 };
    return outcome.status === "disabled"
      ? { status: "disabled" }
      : { status: "blocked", reason: outcome.reason };
  } catch {
    // A thrown Sheets read/write (network, missing write scope) collapses to a safe category.
    return { status: "read_error" };
  }
}
