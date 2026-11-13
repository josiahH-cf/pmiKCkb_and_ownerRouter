// S275 R-S275-1 / R-S275-7: a renewal message whose send Gmail confirmed stays under linked-thread
// observation until its answer is known. A single owner message (and a tenant offer with no
// follow-up) becomes "completed" when Gmail accepts it; its state label and send limits stay as
// they are, and this indexed marker keeps it on the worker's bounded page of watched messages.
//
// The watch reads only the exact linked threads under the existing `gmail.mailbox.read` key and
// delegation, by polling, and stores message metadata only (S233 R-S233-1). It ends when the answer
// from that audience is recorded on the lease for the cycle, when the cycle closes (completed,
// retired, a non-renewal or replaced by a new cycle), when the lease end date has passed, or when
// the message is cancelled. A message whose watch ended is terminal again: the worker never visits
// it, so its visits stay bounded as S233 R-S233-5 requires.
//
// Pure and client-safe: the store writes the marker from `replyWatchApplies`, the worker asks the
// lease record for `replyWatchEndReason`, and the lease page reads the same rule.

import { hasCurrentRenewalAuthorization } from "./delivery-policy";
import type { CommunicationSequence } from "./sequence-model";

/** Why a watch ended; recorded on the message with when. */
export const REPLY_WATCH_END_REASONS = [
  "answer_recorded",
  "cycle_closed",
  "lease_end_passed",
  "cancelled",
] as const;
export type ReplyWatchEndReason = (typeof REPLY_WATCH_END_REASONS)[number];

/** The stored end of a watch: why and when. */
export interface ReplyWatchEnded {
  readonly reason: ReplyWatchEndReason;
  readonly atMs: number;
}

/** The worker states that already observe a message; a watched message is never one of them. */
const OPEN_STATES = new Set(["draft", "active", "paused", "needs_reconciliation"]);

type WatchFields = Pick<
  CommunicationSequence,
  "state" | "confirmedCount" | "threads" | "authorization" | "context"
> & {
  readonly replyWatchEnded?: ReplyWatchEnded | null;
};

/**
 * ARCH-S275-1: whether this message carries the watched marker. A completed renewal message under
 * the current delivery policy (the October 20 authority for linked renewal replies) with at least
 * one send Gmail accepted, whose watch has not ended. A cancelled message is never watched.
 */
export function replyWatchApplies(sequence: WatchFields): boolean {
  return (
    sequence.state === "completed" &&
    sequence.confirmedCount > 0 &&
    Array.isArray(sequence.threads) &&
    sequence.threads.length > 0 &&
    !sequence.replyWatchEnded &&
    hasCurrentRenewalAuthorization(sequence as CommunicationSequence)
  );
}

/**
 * R-S275-3: whether a reply check can still read this message's threads now: an open message the
 * worker already observes after a confirmed send, or a watched completed one.
 */
export function replyCheckable(sequence: WatchFields): boolean {
  if (replyWatchApplies(sequence)) return true;
  return (
    OPEN_STATES.has(sequence.state) &&
    sequence.confirmedCount > 0 &&
    Array.isArray(sequence.threads) &&
    sequence.threads.length > 0 &&
    hasCurrentRenewalAuthorization(sequence as CommunicationSequence)
  );
}

/** The lease record facts the end conditions read; serializable, no message content. */
export interface ReplyWatchLeaseFacts {
  /** The lease's current work record, or null when it has none. */
  readonly workspace: {
    readonly cycleId: string;
    readonly basis: { readonly kind: string; readonly dateIso?: string };
    readonly ownerResponse: { readonly outcome: string } | null;
    readonly tenantResponse: { readonly outcome: string } | null;
    readonly completion: unknown | null;
  } | null;
  /** The lease's latest retire or restore record, or null when there is none. */
  readonly disposition: {
    readonly action: "retire" | "restore";
    readonly cycle: { readonly cycleId: string | null; readonly dateIso: string };
  } | null;
  /** Today on the Central business calendar, YYYY-MM-DD. */
  readonly todayIso: string;
}

/** Owner outcomes that are not an answer yet ("No answer yet" keeps waiting). */
const OWNER_WAITING = new Set(["no_response"]);
/** Tenant outcomes that are not an answer yet. */
const TENANT_WAITING = new Set(["awaiting_response"]);

/**
 * R-S275-1: why this message's watch ends now, or null while it holds. The audience is the
 * message's own: an owner message ends on a recorded owner answer, a tenant message on a recorded
 * tenant answer. The cycle closes on staff completion, a retirement of the cycle, a recorded
 * non-renewal, or a new work record that replaced the message's cycle.
 */
export function replyWatchEndReason(
  sequence: Pick<CommunicationSequence, "state" | "context" | "noticeCycleId">,
  facts: ReplyWatchLeaseFacts,
): ReplyWatchEndReason | null {
  if (sequence.state === "cancelled") return "cancelled";
  const audience =
    sequence.context.purpose === "renewal_owner"
      ? "owner"
      : sequence.context.purpose === "renewal_tenant"
        ? "tenant"
        : null;
  if (!audience) return "cycle_closed";
  const cycleId = sequence.noticeCycleId ?? null;
  const workspace = facts.workspace;
  // A new work record replaced the message's cycle.
  if (workspace && cycleId && workspace.cycleId !== cycleId) return "cycle_closed";
  const currentCycle = workspace?.cycleId ?? cycleId;
  if (
    facts.disposition?.action === "retire" &&
    (facts.disposition.cycle.cycleId === null ||
      currentCycle === null ||
      facts.disposition.cycle.cycleId === currentCycle)
  )
    return "cycle_closed";
  if (workspace) {
    const owner = workspace.ownerResponse;
    const tenant = workspace.tenantResponse;
    if (audience === "owner" && owner && !OWNER_WAITING.has(owner.outcome))
      return "answer_recorded";
    if (audience === "tenant" && tenant && !TENANT_WAITING.has(tenant.outcome))
      return "answer_recorded";
    if (workspace.completion) return "cycle_closed";
    if (
      owner?.outcome === "declined_non_renewal" ||
      tenant?.outcome === "declined_nonrenewing"
    )
      return "cycle_closed";
  }
  const endIso =
    workspace && workspace.basis.kind !== "lease_bound"
      ? (workspace.basis.dateIso ?? null)
      : !workspace && facts.disposition
        ? facts.disposition.cycle.dateIso
        : null;
  if (endIso && /^\d{4}-\d{2}-\d{2}$/.test(endIso) && endIso < facts.todayIso)
    return "lease_end_passed";
  return null;
}

/** Whether a stored record still needs its one catch-up observation (R-S275-7). */
export function needsReplyWatchCatchUp(
  sequence: WatchFields & { readonly replyWatch?: boolean },
): boolean {
  return sequence.replyWatch === undefined && replyWatchApplies(sequence);
}
