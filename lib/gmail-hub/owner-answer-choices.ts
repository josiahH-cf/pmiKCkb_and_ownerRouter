// S285 R-S285-4 / R-S285-5 (ARCH-S285-3): what "Record the owner's answer" opens with, computed on
// read on the server from stored sequence state and the current owner roster. Read-only: nothing
// is stored until staff save the answer through the existing transaction.
//
// - The replies people sent on this lease's owner renewal threads (S234 R-S234-1), each with the
//   one roster owner it came from when the reply came from the address the owner message was sent
//   to for exactly one owner of record. Only that roster entry is returned; no address leaves here.
// - The renewal term the cycle's latest confirmed owner message stated, from the values kept with
//   its authorization (S272 R-S272-1); null when it stated none.

import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { COMMUNICATION_SEQUENCE_COLLECTIONS } from "./sequence-store";
import type { CommunicationInboundEvidence } from "./sequence-model";
import {
  initialSentAtMs,
  keptContentBasis,
  relatedSequenceView,
  type AuthorizedContentBasis,
} from "./current-message";
import type { OwnerReplyChoice } from "@/lib/lease-renewal/owner-approval-evidence";
import {
  matchReplyApprover,
  statedTermFromReviewedValues,
  type RosterOwnerAddress,
  type StatedOwnerTerm,
} from "@/lib/lease-renewal/owner-copy-version";

interface StoredOwnerSequence {
  readonly context?: {
    readonly entityType?: string;
    readonly purpose?: string;
    readonly replyTo?: unknown;
  };
  readonly inbound?: CommunicationInboundEvidence[];
  readonly authorization?: {
    readonly revision?: number;
    readonly to?: unknown;
    readonly cc?: unknown;
  } | null;
  readonly authorizedContentBasis?: AuthorizedContentBasis;
  readonly noticeCycleId?: string | null;
}

const addresses = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

/**
 * R-S285-5: whether a person's reply came from the address the owner message was sent to. The
 * evidence's own yes or no where it was recorded; for earlier evidence, a message sent to one
 * address with no copy has only that participant, so its person's reply came from it.
 */
function replyFromSentTo(
  entry: CommunicationInboundEvidence,
  to: readonly string[],
  cc: readonly string[],
): boolean | null {
  if (typeof entry.fromSentTo === "boolean") return entry.fromSentTo;
  return to.length === 1 && cc.length === 0 ? true : null;
}

/** Two records share a cycle when both name it, or when either names none. */
function sameCycle(left: string | null | undefined, right: string | null | undefined) {
  return left === null || left === undefined || right === null || right === undefined
    ? true
    : left === right;
}

export async function listOwnerAnswerChoices(
  input: {
    readonly leaseId: string;
    /** The lease's active renewal cycle; null when it has no work record. */
    readonly cycleId: string | null;
    /** The owners of record with the addresses this source read gives them; null when unreadable. */
    readonly roster: readonly RosterOwnerAddress[] | null;
  },
  db: Firestore = getAdminFirestore(),
): Promise<{ replies: OwnerReplyChoice[]; ownerMessageTerm: StatedOwnerTerm | null }> {
  const snapshot = await db
    .collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences)
    .where("context.entityId", "==", input.leaseId)
    .limit(50)
    .get();
  const replies: OwnerReplyChoice[] = [];
  let latest: { sentAtMs: number; term: StatedOwnerTerm | null } | null = null;
  for (const doc of snapshot.docs) {
    const data = doc.data() as StoredOwnerSequence & Record<string, unknown>;
    const context = data.context;
    if (context?.entityType !== "renewal_lease" || context.purpose !== "renewal_owner")
      continue;
    const to = addresses(data.authorization?.to);
    const cc = addresses(data.authorization?.cc);
    for (const entry of data.inbound ?? []) {
      if (entry.kind !== "human") continue;
      const approver = matchReplyApprover({
        kind: entry.kind,
        fromSentTo: replyFromSentTo(entry, to, cc),
        sentTo: to,
        roster: input.roster,
      });
      replies.push({
        sequenceId: doc.id,
        evidenceId: entry.id,
        senderEmail: entry.senderEmail,
        receivedAt: new Date(entry.receivedAtMs).toISOString(),
        threadId: entry.threadId,
        messageId: entry.messageId,
        ...(approver ? { approver } : {}),
      });
    }
    // R-S285-4: the cycle's latest confirmed owner message, and the term it stated.
    if (context.replyTo) continue;
    const view = relatedSequenceView(doc.id, data);
    if (!view || !sameCycle(view.noticeCycleId, input.cycleId)) continue;
    const sentAtMs = initialSentAtMs(view);
    if (sentAtMs === null) continue;
    if (latest && latest.sentAtMs >= sentAtMs) continue;
    const kept =
      typeof data.authorization?.revision === "number"
        ? keptContentBasis({
            authorization: { revision: data.authorization.revision },
            authorizedContentBasis: data.authorizedContentBasis,
          })
        : null;
    latest = { sentAtMs, term: statedTermFromReviewedValues(kept?.values) };
  }
  replies.sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
  return { replies, ownerMessageTerm: latest?.term ?? null };
}
