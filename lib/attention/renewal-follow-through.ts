// S280 R-S280-1 (ARCH-S280-1): the renewal work that follows from a staff member's own messages.
//
// "Waiting on you" adds, from recorded facts only, the renewal items where the viewer is the
// responsible sender of the lease's current message for an audience:
// - a reply to record: the owner or tenant answered that message and no answer is recorded on the
//   lease for the cycle (S275's watch end conditions decide "recorded");
// - a held message (S273): paused before any send, with any cause;
// - an out-of-date message (S273): still scheduled, and its kept content basis or the lease's own
//   wording differs from the lease's current values;
// - an unconfirmed send to check.
// Each row opens that lease step and states its basis: "Because you sent this message." No person
// assignment is created or inferred, and "last worked by" is never read. Rows carry the lease label
// the communication stores, never a message body, a reply body or a recipient address.
//
// Pure and client-safe: one source keyed by lease, audience and item kind, over stored sequence
// evidence and the responsible sender. The server read is in `renewal-follow-through-read.ts`.

import { FOLLOW_THROUGH_WORDS } from "@/lib/attention/renewal-follow-through-words";
import { isCurrentMessageScope } from "@/lib/gmail-hub/current-message";
import {
  replyWatchEndReason,
  type ReplyWatchLeaseFacts,
} from "@/lib/gmail-hub/reply-watch";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
import { leaseWorkspaceHrefOrNull } from "@/lib/lease-renewal/desk-view-continuation";
import {
  unsentOutOfDate,
  unsentWorkEvidence,
  type LeaseMessageBasis,
} from "@/lib/lease-renewal/unsent-message";

export type FollowThroughAudience = "owner" | "tenant";
export type FollowThroughKind = "reply" | "held" | "out_of_date" | "unconfirmed";

/** One row of the viewer's own renewal follow-through. Value-free: a label, a basis and a link. */
export interface AttentionFollowThroughRow {
  /** `${leaseId}:${audience}:${kind}`: one source keyed by lease, audience and item kind. */
  readonly key: string;
  readonly kind: FollowThroughKind;
  readonly leaseId: string;
  readonly audience: FollowThroughAudience;
  /** "101 Sample Pl: record the owner's decision". */
  readonly label: string;
  /** "Because you sent this message." */
  readonly basis: string;
  /** That lease's step. */
  readonly href: string;
}

/** The exact staff words of this source. */
export { FOLLOW_THROUGH_WORDS };

const KIND_ORDER: Record<FollowThroughKind, number> = {
  reply: 0,
  held: 1,
  out_of_date: 2,
  unconfirmed: 3,
};

/** The lease step each audience's message belongs to. */
const STEP: Record<FollowThroughAudience, string> = {
  owner: "ask-owner",
  tenant: "offer-tenant",
};

const LEASE_ID = /^[1-9]\d*$/;

/** A label with no address in it: an "@" anywhere reads as the lease id instead (as S273 does). */
export function followThroughLeaseLabel(
  label: string | null | undefined,
  leaseId: string,
) {
  const text = (label ?? "").trim().slice(0, 200);
  return text && !text.includes("@") ? text : `Lease ${leaseId}`;
}

function audienceOf(
  sequence: Pick<CommunicationSequence, "context">,
): FollowThroughAudience {
  return sequence.context.purpose === "renewal_owner" ? "owner" : "tenant";
}

/** The communications this source reads: an initial renewal message line on a resolved lease. */
export function isFollowThroughSequence(
  sequence: Pick<CommunicationSequence, "context">,
): boolean {
  return (
    isCurrentMessageScope(sequence.context) && LEASE_ID.test(sequence.context.entityId)
  );
}

/**
 * The lease's current message per audience: the newest authorized communication for that lease and
 * audience that was not cancelled. Another person's newer message makes theirs the current one, so
 * the viewer's older message adds nothing.
 */
export function currentRenewalMessages(
  sequences: readonly CommunicationSequence[],
): Map<string, CommunicationSequence> {
  const current = new Map<string, CommunicationSequence>();
  for (const sequence of sequences) {
    if (!isFollowThroughSequence(sequence)) continue;
    if (sequence.state === "cancelled" || sequence.state === "draft") continue;
    if (!sequence.authorization) continue;
    const key = `${sequence.context.entityId}:${audienceOf(sequence)}`;
    const held = current.get(key);
    if (
      !held ||
      sequence.createdAtMs > held.createdAtMs ||
      (sequence.createdAtMs === held.createdAtMs && sequence.id > held.id)
    )
      current.set(key, sequence);
  }
  return current;
}

/** The first send Gmail accepted on this message, or null. */
function firstAcceptedSendMs(sequence: CommunicationSequence): number | null {
  if ((sequence.confirmedCount ?? 0) <= 0 || !Array.isArray(sequence.threads))
    return null;
  const times = sequence.threads
    .map((thread) => thread.sentAtMs)
    .filter((ms): ms is number => typeof ms === "number" && Number.isFinite(ms));
  return times.length ? Math.min(...times) : null;
}

/** A person's reply after the first accepted send. */
function hasObservedReply(sequence: CommunicationSequence): boolean {
  const sentAtMs = firstAcceptedSendMs(sequence);
  if (sentAtMs === null) return false;
  return (sequence.inbound ?? []).some(
    (entry) => entry.kind === "human" && entry.receivedAtMs >= sentAtMs,
  );
}

export interface FollowThroughInput {
  readonly viewerUid: string;
  /** Every renewal communication of the leases the viewer sent to (theirs and others'). */
  readonly sequences: readonly CommunicationSequence[];
  /**
   * The lease record facts behind "recorded" (S275 end conditions), by lease id. An absent or null
   * entry was not read, so no reply item is listed for that lease (recorded facts only).
   */
  readonly leaseFacts: ReadonlyMap<string, ReplyWatchLeaseFacts | null>;
  /** The lease's current message values, by `${leaseId}:${audience}`; absent means not read. */
  readonly messageBases?: ReadonlyMap<string, LeaseMessageBasis | null>;
}

function row(
  sequence: CommunicationSequence,
  kind: FollowThroughKind,
): AttentionFollowThroughRow | null {
  const leaseId = sequence.context.entityId;
  const audience = audienceOf(sequence);
  const href = leaseWorkspaceHrefOrNull(leaseId, STEP[audience]);
  if (!href) return null;
  return {
    key: `${leaseId}:${audience}:${kind}`,
    kind,
    leaseId,
    audience,
    label: `${followThroughLeaseLabel(sequence.workflowLabel, leaseId)}: ${FOLLOW_THROUGH_WORDS[kind][audience]}`,
    basis: FOLLOW_THROUGH_WORDS.basis,
    href,
  };
}

/**
 * ARCH-S280-1: the viewer's own renewal follow-through, one row per lease, audience and kind, in a
 * fixed order (replies, held, out of date, unconfirmed; then by label). Pure; reads only the inputs.
 */
export function projectOwnFollowThrough(
  input: FollowThroughInput,
): AttentionFollowThroughRow[] {
  const rows = new Map<string, AttentionFollowThroughRow>();
  const add = (candidate: AttentionFollowThroughRow | null) => {
    if (candidate && !rows.has(candidate.key)) rows.set(candidate.key, candidate);
  };
  for (const [key, sequence] of currentRenewalMessages(input.sequences)) {
    if (sequence.responsibleUid !== input.viewerUid) continue;
    let unsent: ReturnType<typeof unsentWorkEvidence> = null;
    try {
      unsent = unsentWorkEvidence(sequence);
    } catch {
      unsent = null;
    }
    if (unsent?.state === "unconfirmed") {
      add(row(sequence, "unconfirmed"));
      continue;
    }
    if (unsent?.state === "held") {
      add(row(sequence, "held"));
      continue;
    }
    if (unsent?.state === "scheduled") {
      const basis = input.messageBases?.get(key);
      if (basis && unsentOutOfDate(unsent, basis).kind === "out_of_date")
        add(row(sequence, "out_of_date"));
      continue;
    }
    if (!hasObservedReply(sequence)) continue;
    const ended = sequence.replyWatchEnded?.reason;
    if (ended === "answer_recorded" || ended === "cycle_closed" || ended === "cancelled")
      continue;
    const facts = input.leaseFacts.get(sequence.context.entityId);
    if (!facts) continue;
    const reason = replyWatchEndReason(sequence, facts);
    if (
      reason === "answer_recorded" ||
      reason === "cycle_closed" ||
      reason === "cancelled"
    )
      continue;
    add(row(sequence, "reply"));
  }
  return [...rows.values()].sort(
    (left, right) =>
      KIND_ORDER[left.kind] - KIND_ORDER[right.kind] ||
      left.label.localeCompare(right.label, "en-US") ||
      left.key.localeCompare(right.key, "en-US"),
  );
}

/** The `${leaseId}:${audience}` pairs whose scheduled current message needs the lease's values. */
export function scheduledOwnMessages(
  viewerUid: string,
  sequences: readonly CommunicationSequence[],
): { leaseId: string; audience: FollowThroughAudience }[] {
  const pairs: { leaseId: string; audience: FollowThroughAudience }[] = [];
  for (const sequence of currentRenewalMessages(sequences).values()) {
    if (sequence.responsibleUid !== viewerUid) continue;
    try {
      if (unsentWorkEvidence(sequence)?.state === "scheduled")
        pairs.push({
          leaseId: sequence.context.entityId,
          audience: audienceOf(sequence),
        });
    } catch {
      // An older record missing a member adds nothing.
    }
  }
  return pairs;
}
