// S273 R-S273-6: the stored in-app notice the communication worker raises when it holds a renewal
// message before it was sent, and the reads that show it to the responsible sender in the existing
// renewal communications family. One record per sequence and pause (its id), so a repeat writes
// nothing new. App-owned and in-app only: no email, no message body, no recipient address. A notice
// is shown only to its own sender while they hold current renewals workflow access.

import type { Firestore } from "firebase-admin/firestore";

import { can } from "@/lib/auth/roles";
import { hasSpaceAccess, type AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { communicationsRetentionFields } from "@/lib/gmail-hub/retention-policy";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
import {
  RENEWAL_HOLD_NOTICE_TITLE,
  parseRenewalHoldNotice,
  renewalHoldHref,
  renewalHoldMessage,
  renewalHoldNoticeFor,
  renewalHoldNoticeId,
  renewalHoldNoticeIdFrom,
  renewalHoldNotificationId,
} from "@/lib/lease-renewal/renewal-hold-notice";
import type { UnifiedNotification } from "@/lib/notifications/families";

export const RENEWAL_HOLD_NOTICE_COLLECTION = "renewal_message_hold_notices";

/**
 * R-S273-6: write the one notice for this hold, once. A hold that raises no notice (a staff
 * pause, a reply, an owner or tenant message already sent) writes nothing; an existing notice for
 * the same sequence and pause is left as it is (its read state stays).
 */
export async function recordRenewalHold(
  sequence: CommunicationSequence,
  db: Firestore = getAdminFirestore(),
  nowMs: number = Date.now(),
): Promise<"written" | "exists" | "none"> {
  const notice = renewalHoldNoticeFor(sequence, nowMs);
  if (!notice) return "none";
  const ref = db
    .collection(RENEWAL_HOLD_NOTICE_COLLECTION)
    .doc(renewalHoldNoticeId(notice.sequenceId, notice.pausedAtMs));
  try {
    await ref.create({
      ...notice,
      read_at_ms: null,
      ...communicationsRetentionFields("bodyless_audit", nowMs),
    });
    return "written";
  } catch (error) {
    // gRPC ALREADY_EXISTS: this hold already has its notice.
    const code = (error as { code?: number | string }).code;
    if (code === 6 || code === "already-exists") return "exists";
    throw error;
  }
}

function assertRead(actor: AuthenticatedUser) {
  if (!can(actor.role, "read"))
    throw new EditableLayerError(
      "This user cannot read workflow communication attention.",
      403,
    );
}

/**
 * R-S273-6: the signed-in sender's hold notices, newest first, only while they have renewals
 * workflow access. Value-free beyond the lease label: title, one sentence and the lease step link.
 */
export async function listRenewalHoldNotifications(
  actor: AuthenticatedUser,
  options: { unreadOnly?: boolean; limit?: number } = {},
  db: Firestore = getAdminFirestore(),
): Promise<UnifiedNotification[]> {
  assertRead(actor);
  if (!hasSpaceAccess(actor, "renewals")) return [];
  const snapshot = await db
    .collection(RENEWAL_HOLD_NOTICE_COLLECTION)
    .where("uid", "==", actor.uid)
    .get();
  const notices = snapshot.docs
    .flatMap((doc) => {
      const notice = parseRenewalHoldNotice(doc.data());
      if (!notice || notice.uid !== actor.uid) return [];
      const readAtMs = doc.get("read_at_ms");
      const href = renewalHoldHref(notice);
      if (!href) return [];
      return [
        {
          docId: doc.id,
          notice,
          href,
          readAtMs: typeof readAtMs === "number" ? readAtMs : null,
        },
      ];
    })
    .filter((entry) => (options.unreadOnly ? entry.readAtMs === null : true))
    .sort((left, right) => right.notice.pausedAtMs - left.notice.pausedAtMs)
    .slice(0, options.limit ?? 25);
  return notices.map(
    ({ docId, notice, href, readAtMs }) =>
      ({
        id: renewalHoldNotificationId(docId),
        source: "gmail_workflow",
        family: "renewal_communications",
        lane: "decision",
        severity: "medium",
        title: RENEWAL_HOLD_NOTICE_TITLE,
        state_label: "Held",
        message: renewalHoldMessage(notice),
        href,
        created_at: new Date(notice.pausedAtMs).toISOString(),
        ...(readAtMs !== null ? { read_at: new Date(readAtMs).toISOString() } : {}),
      }) satisfies UnifiedNotification,
  );
}

/** R-S273-6: the sender marks their own hold notice read. Another person's notice is not found. */
export async function markRenewalHoldNotificationRead(
  actor: AuthenticatedUser,
  notificationId: string,
  db: Firestore = getAdminFirestore(),
  nowMs: number = Date.now(),
): Promise<void> {
  assertRead(actor);
  const id = renewalHoldNoticeIdFrom(notificationId);
  const missing = () =>
    new EditableLayerError("That renewal notice is not available to this user.", 404);
  if (!id || !hasSpaceAccess(actor, "renewals")) throw missing();
  const ref = db.collection(RENEWAL_HOLD_NOTICE_COLLECTION).doc(id);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const notice = snapshot.exists ? parseRenewalHoldNotice(snapshot.data()) : null;
    if (!notice || notice.uid !== actor.uid) throw missing();
    if (typeof snapshot.get("read_at_ms") === "number") return;
    tx.update(ref, { read_at_ms: nowMs });
  });
}
