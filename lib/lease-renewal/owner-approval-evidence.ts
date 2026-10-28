// S234 R-S234-1: the choices the owner-approval form offers and how a recorded approval reads.
// Client-safe: labels and ids only. The server checks every choice again when it is recorded.

import type { OwnerApprovalEvidence } from "@/lib/lease-renewal/workspace-state";

export interface OwnerReplyChoice {
  readonly sequenceId: string;
  /** The incoming evidence id (`mailbox:message`) the reply was recorded under. */
  readonly evidenceId: string;
  readonly senderEmail: string;
  readonly receivedAt: string;
}

export interface OwnerApprovalChoices {
  /** The owners of record from the current source read; null when it could not be read. */
  readonly roster:
    | readonly { readonly label: string; readonly sourceRef: string }[]
    | null;
  /** Replies received on this lease's owner renewal threads, newest first. */
  readonly replies: readonly OwnerReplyChoice[];
  /** PR #162 review: the fingerprint of `roster`, sent back with an owner choice. */
  readonly rosterFingerprint: string | null;
  /**
   * S234 R-S234-3: the current calculated charges' hash, so the coverage line can say whether the
   * approval still covers them; null or absent when the page could not compute them.
   */
  readonly economicsHash?: string | null;
}

/** One line naming who approved, how and when, for the lease page and the handoff. */
export function describeOwnerApproval(
  approval: OwnerApprovalEvidence,
  formatTime: (iso: string) => string,
): string {
  const who =
    approval.party.kind === "owner"
      ? approval.party.label
      : `${approval.party.name} (authorized representative, ${approval.party.capacity})`;
  const how =
    approval.channel.kind === "linked_reply"
      ? `a reply in this lease's renewal thread received ${formatTime(approval.channel.receivedAt)}`
      : approval.channel.kind === "written"
        ? `${approval.channel.medium} (reference ${approval.channel.reference})`
        : `a conversation with ${approval.channel.participants}`;
  return `Approved by ${who} through ${how}, on ${formatTime(approval.occurredAt)}.`;
}
