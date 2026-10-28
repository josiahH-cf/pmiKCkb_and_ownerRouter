// S233 R-S233-5: the communications worker's health for the hub and the read-only assurance. It
// reads the worker's own run record and the open sequences only (the same open-only index the worker
// pages), so completed and cancelled history never grows the read. Times and counts only: no
// sequence id, address, subject or body leaves here.

import type { Firestore, QuerySnapshot } from "firebase-admin/firestore";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  COMMUNICATION_SEQUENCE_COLLECTIONS,
  OPEN_SEQUENCE_STATES,
} from "./sequence-store";
import {
  CommunicationWorkerStore,
  type CommunicationWorkerLastRun,
} from "./sequence-worker";
import { hasCurrentRenewalAuthorization } from "./delivery-policy";
import type { CommunicationSequence } from "./sequence-model";
import type { WorkflowCommunicationContext } from "./workflow-context";

export interface CommunicationWorkerHealth {
  readonly asOfMs: number;
  readonly lastRun: CommunicationWorkerLastRun | null;
  /** Open sequences read for this summary; `complete` is false when the cap stopped the read. */
  readonly openRead: number;
  readonly complete: boolean;
  /** The oldest scheduled message that is due and not yet sent, with how late it is. */
  readonly oldestPastDue: { readonly dueAtMs: number; readonly lagMs: number } | null;
  /** The oldest incoming check among the open sequences the worker observes. */
  readonly oldestObservation: {
    readonly checkedAtMs: number;
    readonly ageMs: number;
  } | null;
  /** Open sequences the worker observes whose incoming check has not run yet. */
  readonly neverChecked: number;
}

const PAGE = 100;

export async function readCommunicationWorkerHealth(
  input: {
    readonly db?: Firestore;
    readonly nowMs?: number;
    readonly cap?: number;
    /** The hub counts only communications in the reader's Spaces, as its list does. */
    readonly include?: (context: WorkflowCommunicationContext) => boolean;
  } = {},
): Promise<CommunicationWorkerHealth> {
  const db = input.db ?? getAdminFirestore();
  const nowMs = input.nowMs ?? Date.now();
  const cap = Math.max(1, Math.min(2000, input.cap ?? 1000));
  const lastRun = await new CommunicationWorkerStore(db).readLastRun(nowMs);
  const collection = db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.sequences);
  let after: string | null = null;
  let openRead = 0;
  let complete = true;
  let oldestDue: number | null = null;
  let oldestCheck: number | null = null;
  let neverChecked = 0;
  const open = collection
    .where("state", "in", [...OPEN_SEQUENCE_STATES])
    .orderBy(FieldPath.documentId());
  for (;;) {
    const limit = Math.min(PAGE, cap - openRead);
    const page: QuerySnapshot = await (after ? open.startAfter(after) : open)
      .limit(limit)
      .get();
    for (const doc of page.docs) {
      openRead += 1;
      const sequence = doc.data() as Partial<CommunicationSequence>;
      // Only what the worker observes and sends: a draft, or a record held for a fresh review
      // under an earlier delivery policy, is never due work, so it never reads as worker lag.
      if (
        doc.get("purged") ||
        !sequence.context ||
        typeof sequence.context !== "object" ||
        !hasCurrentRenewalAuthorization(sequence as CommunicationSequence) ||
        (input.include && !input.include(sequence.context))
      )
        continue;
      const due = sequence.nextDueAtMs;
      if (
        sequence.state === "active" &&
        !sequence.unresolvedOccurrenceId &&
        typeof due === "number" &&
        due <= nowMs &&
        (oldestDue === null || due < oldestDue)
      )
        oldestDue = due;
      const checked = sequence.observation?.checkedAtMs;
      if (typeof checked !== "number") neverChecked += 1;
      else if (oldestCheck === null || checked < oldestCheck) oldestCheck = checked;
    }
    if (page.docs.length < limit) break;
    after = page.docs[page.docs.length - 1]!.id;
    if (openRead >= cap) {
      // The cap stopped the read; say so only when an open sequence was actually left unread.
      complete = (await open.startAfter(after).limit(1).get()).empty;
      break;
    }
  }
  return {
    asOfMs: nowMs,
    lastRun,
    openRead,
    complete,
    oldestPastDue:
      oldestDue === null ? null : { dueAtMs: oldestDue, lagMs: nowMs - oldestDue },
    oldestObservation:
      oldestCheck === null
        ? null
        : { checkedAtMs: oldestCheck, ageMs: nowMs - oldestCheck },
    neverChecked,
  };
}
