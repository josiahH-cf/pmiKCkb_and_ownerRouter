// S107: continuation and recovery for one lease's confirmed renewal effects.
//
// It adds no job platform, scheduler, worker, or retry. A confirmed effect already runs to
// completion server-side and records its receipt; this module covers the two gaps that leaves:
//
//   1. an attempt that was interrupted after the provider call is surfaced on the next load as an
//      orphan whose exact next action is an Admin's reconciliation through the effect's own phase
//      control, and
//   2. the workspace shows one consolidated attempt summary instead of per-panel fragments.
//
// Everything here is a pure projection over durable records: it performs no provider call and
// writes nothing. Reconciliation itself is the separate, Admin-gated, human-initiated operation each
// effect family's service owns; a page load never performs it. Blind retry and autonomous chaining
// stay out: an attempt standing at `ambiguous` or `failed` names the operator's exact next action,
// and that action is never an automatic re-execution.

import type {
  ExternalExecutionRecord,
  ExternalExecutionState,
} from "@/lib/external-execution/types";
import { RENEWAL_EFFECT_RECONCILE_MIN_AGE_MS } from "@/lib/lease-renewal/execution/reconcile-age";

/**
 * An attempt younger than this is still plausibly in flight. It is the S97/S98 services' own
 * reconcile age, read from the one shared constant so the continuation can never disagree with the
 * services about what "orphaned" means.
 */
export const RENEWAL_CONTINUATION_MIN_AGE_MS = RENEWAL_EFFECT_RECONCILE_MIN_AGE_MS;

/**
 * The renewal effect families this one entry point covers. Dotloop joins here only when S34 gains a
 * runtime effect route; today no Dotloop attempt is ever loaded, so listing it would be a claim
 * with nothing behind it.
 */
export const RENEWAL_CONTINUATION_ACTION_PREFIXES = [
  "rentvine.lease.",
  "google_sheets.renewal_checklist.",
] as const;

export interface RenewalAttemptRecord {
  readonly executionId: string;
  readonly actionKey: string;
  readonly state: ExternalExecutionState;
  readonly attemptCount: 0 | 1;
  readonly updatedAtIso: string;
  readonly receiptId?: string;
  readonly blocker?: string;
}

export type RenewalAttemptOutcome = "succeeded" | "ambiguous" | "failed" | "unresolved";

export interface RenewalAttemptSummary {
  readonly leaseId: string;
  /** The most recent confirmed effect, by action key; null when nothing was ever confirmed. */
  readonly lastConfirmedStep: string | null;
  readonly lastAttemptAtIso: string | null;
  readonly lastAttemptState: ExternalExecutionState | null;
  readonly blocker: string | null;
  readonly nextAction: string;
  /** Attempts old enough to reconcile on this load. */
  readonly reconcilableCount: number;
  /** True while any attempt is still in flight; the summary never calls that a failure. */
  readonly inFlight: boolean;
}

function isCoveredAction(actionKey: string): boolean {
  return RENEWAL_CONTINUATION_ACTION_PREFIXES.some((prefix) =>
    actionKey.startsWith(prefix),
  );
}

function ageMs(attempt: RenewalAttemptRecord, nowMs: number): number {
  const updated = Date.parse(attempt.updatedAtIso);
  return Number.isFinite(updated) ? nowMs - updated : 0;
}

/**
 * The attempts this load may reconcile: a covered renewal effect that was claimed once, is still
 * unresolved, and is older than the minimum age. A younger attempt is left alone.
 */
export function selectOrphanedRenewalAttempts(
  attempts: readonly RenewalAttemptRecord[],
  nowMs: number,
): RenewalAttemptRecord[] {
  return attempts.filter(
    (attempt) =>
      isCoveredAction(attempt.actionKey) &&
      attempt.attemptCount === 1 &&
      (attempt.state === "running" || attempt.state === "ambiguous") &&
      ageMs(attempt, nowMs) >= RENEWAL_CONTINUATION_MIN_AGE_MS,
  );
}

const NEXT_ACTION: Record<string, string> = {
  running: "This attempt is still finishing; reload in a moment to see its receipt.",
  ambiguous:
    "The last attempt's result is uncertain. An Admin reconciles it from its exact receipt in the phase panel; nothing can be confirmed again until it is settled.",
  failed:
    "The last attempt failed. Review the exact blocker, then start a new proposal from the phase panel and confirm it deliberately.",
  blocked: "Resolve the exact blocker before confirming this effect.",
  succeeded: "The last confirmed effect is recorded with its receipt.",
  ready: "Nothing is in flight for this lease.",
  not_applicable: "Nothing is in flight for this lease.",
};

/** A claimed attempt that never reported within its window: the page never settles it itself. */
const ORPHANED_NEXT_ACTION =
  "This attempt did not report a result within its window. An Admin reconciles it from its exact receipt in the phase panel before anything else is confirmed.";

/** One consolidated view of a lease's confirmed-effect history. Pure; no clock and no I/O. */
export function projectRenewalAttemptSummary(input: {
  readonly leaseId: string;
  readonly attempts: readonly RenewalAttemptRecord[];
  readonly nowMs: number;
}): RenewalAttemptSummary {
  const covered = input.attempts.filter((attempt) => isCoveredAction(attempt.actionKey));
  const ordered = [...covered].sort((left, right) =>
    left.updatedAtIso === right.updatedAtIso
      ? left.executionId.localeCompare(right.executionId)
      : left.updatedAtIso.localeCompare(right.updatedAtIso),
  );
  const latest = ordered.at(-1) ?? null;
  const unresolved = ordered.filter(
    (attempt) => attempt.state === "ambiguous" || attempt.state === "failed",
  );
  const attention = unresolved.at(-1) ?? null;
  const reference = attention ?? latest;
  const orphaned = selectOrphanedRenewalAttempts(covered, input.nowMs);
  const referenceIsOrphaned =
    reference !== null &&
    reference.state === "running" &&
    orphaned.some((attempt) => attempt.executionId === reference.executionId);
  return {
    leaseId: input.leaseId,
    lastConfirmedStep: latest ? latest.actionKey : null,
    lastAttemptAtIso: latest ? latest.updatedAtIso : null,
    lastAttemptState: latest ? latest.state : null,
    blocker: reference?.blocker ?? null,
    nextAction:
      reference === null
        ? "Nothing is in flight for this lease."
        : referenceIsOrphaned
          ? ORPHANED_NEXT_ACTION
          : (NEXT_ACTION[reference.state] ?? NEXT_ACTION.ready),
    reconcilableCount: orphaned.length,
    inFlight: covered.some((attempt) => attempt.state === "running"),
  };
}

export interface RenewalAttemptReconciliation {
  readonly executionId: string;
  readonly actionKey: string;
  readonly outcome: RenewalAttemptOutcome;
}

/**
 * Classify this lease's orphaned attempts through an injected, read-only observation. This function
 * performs no provider call itself, never retries, and never writes; the injected operation must be
 * read-only too, and the workspace load injects none at all (it only projects the summary). An
 * observation that throws leaves the attempt unresolved rather than inventing an outcome.
 */
export async function reconcileOrphanedRenewalAttempts(input: {
  readonly leaseId: string;
  readonly attempts: readonly RenewalAttemptRecord[];
  readonly nowMs: number;
  readonly reconcile: (attempt: RenewalAttemptRecord) => Promise<RenewalAttemptOutcome>;
}): Promise<RenewalAttemptReconciliation[]> {
  const orphaned = selectOrphanedRenewalAttempts(input.attempts, input.nowMs);
  const results: RenewalAttemptReconciliation[] = [];
  for (const attempt of orphaned) {
    let outcome: RenewalAttemptOutcome;
    try {
      outcome = await input.reconcile(attempt);
    } catch {
      outcome = "unresolved";
    }
    results.push({
      executionId: attempt.executionId,
      actionKey: attempt.actionKey,
      outcome,
    });
  }
  return results;
}

/**
 * Project one durable execution record into an attempt record. Only a claimed record (attempt count
 * 1) is an attempt; an unclaimed one is a plan the operator has not confirmed.
 */
export function renewalAttemptFromExecutionRecord(
  record: ExternalExecutionRecord | null,
): RenewalAttemptRecord | null {
  if (!record || record.attemptCount !== 1) return null;
  return {
    executionId: record.id,
    actionKey: record.actionKey,
    state: record.state,
    attemptCount: 1,
    updatedAtIso: record.updatedAt,
    ...(record.receipt ? { receiptId: record.receipt.providerRef } : {}),
    ...(record.blocker ? { blocker: record.blocker } : {}),
  };
}

/** Apply reconciliation outcomes to the in-memory attempt list for the current render. */
export function applyRenewalReconciliations(
  attempts: readonly RenewalAttemptRecord[],
  reconciliations: readonly RenewalAttemptReconciliation[],
): RenewalAttemptRecord[] {
  const byId = new Map(
    reconciliations.map((entry) => [entry.executionId, entry.outcome] as const),
  );
  return attempts.map((attempt) => {
    const outcome = byId.get(attempt.executionId);
    if (!outcome || outcome === "unresolved") return attempt;
    return { ...attempt, state: outcome };
  });
}
