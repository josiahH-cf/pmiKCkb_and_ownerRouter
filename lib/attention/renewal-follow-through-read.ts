// S280 R-S280-1: the server read behind the viewer's own renewal follow-through on the Dashboard.
//
// Read-only and bounded. It reads the viewer's own renewal communications by their responsible
// sender, every renewal communication of those leases (so a teammate's newer message makes theirs
// the current one), each of those leases' work record and retire record (S275's "answer recorded"
// end conditions), and, for the viewer's still-scheduled messages, the lease's current message
// values through the existing composition read S273 uses (bounded count and wait). It sends,
// schedules, saves, claims and looks up nothing, and makes no provider or billed call of its own.
// Any part that fails adds nothing: the Dashboard never shows an item it could not establish.

import type { Firestore } from "firebase-admin/firestore";
import { FieldPath } from "firebase-admin/firestore";

import {
  isFollowThroughSequence,
  mayNeedFollowThrough,
  projectOwnFollowThrough,
  scheduledOwnMessages,
  type AttentionFollowThroughRow,
  type FollowThroughAudience,
} from "@/lib/attention/renewal-follow-through";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  dispositionRef,
  readDispositionRecord,
} from "@/lib/firestore/renewal-cycle-disposition-read";
import {
  currentRenewalWorkspaceState,
  renewalWorkspaceHeadRefs,
} from "@/lib/firestore/renewal-workspace";
import type { ReplyWatchLeaseFacts } from "@/lib/gmail-hub/reply-watch";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import type { LeaseMessageBasis } from "@/lib/lease-renewal/unsent-message";
import { withReadDeadline } from "@/lib/observability/read-lifetime";

const SEQUENCE_COLLECTION = "gmail_communication_sequences";
/** The viewer's own communications read per Dashboard load. */
export const OWN_SEQUENCE_SCAN_LIMIT = 300;
/** At most this many leases are followed per load (one Firestore `in` read). */
export const OWN_FOLLOW_THROUGH_LEASE_LIMIT = 30;
/** At most this many scheduled messages are compared with the lease per load. */
export const OWN_FOLLOW_THROUGH_BASIS_READ_LIMIT = 6;
/** Each comparison read's bound; past it the message shows nothing. */
export const OWN_FOLLOW_THROUGH_BASIS_WAIT_MS = 8_000;
/** The whole read's bound on the Dashboard. */
export const OWN_FOLLOW_THROUGH_WAIT_MS = 20_000;

export interface OwnFollowThroughRead {
  readonly state: "ok" | "unavailable" | "not_eligible";
  readonly rows: readonly AttentionFollowThroughRow[];
  readonly incomplete?: true;
}

export interface OwnFollowThroughDependencies {
  readonly db?: () => Firestore;
  /** The existing composition read for one lease and audience (S273 `readLeaseMessageBasis`). */
  readonly readMessageBasis?: (
    user: AuthenticatedUser,
    leaseId: string,
    audience: FollowThroughAudience,
  ) => Promise<LeaseMessageBasis>;
}

async function defaultReadMessageBasis(
  user: AuthenticatedUser,
  leaseId: string,
  audience: FollowThroughAudience,
): Promise<LeaseMessageBasis> {
  // Loaded on use: the composition read pulls the renewal message preparation graph, which the
  // Dashboard needs only when the viewer holds a scheduled message.
  const { readLeaseMessageBasis } =
    await import("@/lib/lease-renewal/unsent-message-read");
  return readLeaseMessageBasis(user, leaseId, audience);
}

function storedSequence(
  doc: FirebaseFirestore.QueryDocumentSnapshot,
): CommunicationSequence | null {
  if (doc.get("purged")) return null;
  const data = doc.data() as CommunicationSequence | undefined;
  if (!data?.context || !Array.isArray(data.threads)) return null;
  const sequence = { ...data, id: doc.id } as CommunicationSequence;
  return isFollowThroughSequence(sequence) ? sequence : null;
}

async function readLeaseFacts(
  db: Firestore,
  leaseId: string,
  todayIso: string,
): Promise<ReplyWatchLeaseFacts | null> {
  try {
    const heads = renewalWorkspaceHeadRefs(db, leaseId);
    const [dated, leaseBound, dispositionDoc] = await Promise.all([
      heads.dated.get(),
      heads.leaseBound.get(),
      dispositionRef(db, leaseId).get(),
    ]);
    const workspace = currentRenewalWorkspaceState(db, leaseId, dated, leaseBound);
    let disposition: ReplyWatchLeaseFacts["disposition"] = null;
    try {
      disposition = readDispositionRecord(dispositionDoc, leaseId);
    } catch {
      disposition = null;
    }
    return { workspace, disposition, todayIso };
  } catch {
    // Not read: no reply item for this lease.
    return null;
  }
}

/**
 * R-S280-1: the viewer's own renewal follow-through. Never throws; a failed read reads as
 * "unavailable" with no rows, and the Dashboard keeps its other rows.
 */
export async function readOwnRenewalFollowThrough(
  user: AuthenticatedUser,
  nowMs: number,
  dependencies: OwnFollowThroughDependencies = {},
): Promise<OwnFollowThroughRead> {
  if (!hasSpaceAccess(user, "renewals")) return { state: "not_eligible", rows: [] };
  try {
    return await withReadDeadline(async (): Promise<OwnFollowThroughRead> => {
      const db = (dependencies.db ?? getAdminFirestore)();
      const ownQuery = db
        .collection(SEQUENCE_COLLECTION)
        .where("responsibleUid", "==", user.uid)
        .orderBy(FieldPath.documentId())
        .limit(OWN_SEQUENCE_SCAN_LIMIT);
      const latest = new Map<string, number>();
      let after: string | undefined;
      for (;;) {
        const page = await (after ? ownQuery.startAfter(after) : ownQuery).get();
        for (const doc of page.docs) {
          const sequence = storedSequence(doc);
          if (!sequence || !mayNeedFollowThrough(sequence)) continue;
          const id = sequence.context.entityId;
          latest.set(id, Math.max(latest.get(id) ?? 0, sequence.updatedAtMs));
        }
        if (page.size < OWN_SEQUENCE_SCAN_LIMIT) break;
        after = page.docs.at(-1)!.id;
      }
      const leaseIds = [...latest]
        .sort(([idA, atA], [idB, atB]) => atB - atA || idA.localeCompare(idB))
        .slice(0, OWN_FOLLOW_THROUGH_LEASE_LIMIT)
        .map(([id]) => id);
      if (leaseIds.length === 0) return { state: "ok" as const, rows: [] };

      // Every renewal communication of those leases, so "current" sees a teammate's newer one.
      const related = await db
        .collection(SEQUENCE_COLLECTION)
        .where("context.entityId", "in", leaseIds)
        .get();
      const sequences = related.docs.flatMap((doc) => {
        const sequence = storedSequence(doc);
        return sequence ? [sequence] : [];
      });

      const todayIso = businessDateIso(nowMs);
      const facts = new Map<string, ReplyWatchLeaseFacts | null>(
        await Promise.all(
          leaseIds.map(
            async (leaseId) =>
              [leaseId, await readLeaseFacts(db, leaseId, todayIso)] as const,
          ),
        ),
      );

      const readBasis = dependencies.readMessageBasis ?? defaultReadMessageBasis;
      const bases = new Map<string, LeaseMessageBasis | null>();
      const scheduled = scheduledOwnMessages(user.uid, sequences);
      await Promise.all(
        scheduled
          .slice(0, OWN_FOLLOW_THROUGH_BASIS_READ_LIMIT)
          .map(async ({ leaseId, audience }) => {
            try {
              bases.set(
                `${leaseId}:${audience}`,
                await withReadDeadline(
                  () => readBasis(user, leaseId, audience),
                  OWN_FOLLOW_THROUGH_BASIS_WAIT_MS,
                ),
              );
            } catch {
              // Not compared: the scheduled message adds nothing.
            }
          }),
      );

      return {
        state: "ok" as const,
        rows: projectOwnFollowThrough({
          viewerUid: user.uid,
          sequences,
          leaseFacts: facts,
          messageBases: bases,
        }),
        ...(latest.size > leaseIds.length ||
        scheduled.length > OWN_FOLLOW_THROUGH_BASIS_READ_LIMIT
          ? { incomplete: true as const }
          : {}),
      };
    }, OWN_FOLLOW_THROUGH_WAIT_MS);
  } catch (error) {
    console.error(
      `Attention follow-through read failed (${error instanceof Error ? error.name : "unknown"}).`,
    );
    return { state: "unavailable", rows: [] };
  }
}
