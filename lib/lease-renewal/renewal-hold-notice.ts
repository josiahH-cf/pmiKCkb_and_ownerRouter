// S273 R-S273-6: when the communication worker holds a renewal message before it was sent, the
// responsible sender gets one in-app notice in the existing renewal communications family. Pure and
// client-safe: which hold raises a notice, its record, its words and its link. The notice names the
// lease label the communication stores and the audience; it carries no message body and no
// recipient address, and it is deduplicated per sequence and pause.

import { SEQUENCE_PAUSE_CAUSE_LABELS } from "@/lib/gmail-hub/communication-state";
import { isCurrentMessageScope } from "@/lib/gmail-hub/current-message";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
import { leaseWorkspaceHrefOrNull } from "@/lib/lease-renewal/desk-view-continuation";
import type { UnsentPauseCause } from "@/lib/lease-renewal/unsent-message";

export const RENEWAL_HOLD_NOTICE_SCHEMA_VERSION = "renewal-hold-notice/v1" as const;
/** The notification id prefix, so mark-read finds the notice and never a communication link. */
export const RENEWAL_HOLD_NOTIFICATION_PREFIX = "renewal-hold:";
export const RENEWAL_HOLD_NOTICE_TITLE = "Renewal message held";
/** The worker's own identity on a pause it raised. */
export const COMMUNICATION_WORKER_UID = "communication-worker";

/** The stored notice: identities, times, the cause and the lease label only. */
export interface RenewalHoldNotice {
  readonly schemaVersion: typeof RENEWAL_HOLD_NOTICE_SCHEMA_VERSION;
  readonly sequenceId: string;
  readonly leaseId: string;
  readonly audience: "owner" | "tenant";
  /** The responsible sender the notice is for. */
  readonly uid: string;
  readonly cause: UnsentPauseCause;
  readonly pausedAtMs: number;
  /** The lease label the communication stores (its property), never an email address. */
  readonly label: string;
  readonly createdAtMs: number;
}

/** One notice per sequence and pause. */
export function renewalHoldNoticeId(sequenceId: string, pausedAtMs: number): string {
  return `${sequenceId.replace(/[^A-Za-z0-9_-]/g, "")}-${Math.trunc(pausedAtMs)}`;
}

export function renewalHoldNotificationId(noticeId: string): string {
  return `${RENEWAL_HOLD_NOTIFICATION_PREFIX}${noticeId}`;
}

export function isRenewalHoldNotificationId(id: string): boolean {
  return id.startsWith(RENEWAL_HOLD_NOTIFICATION_PREFIX);
}

export function renewalHoldNoticeIdFrom(notificationId: string): string | null {
  if (!isRenewalHoldNotificationId(notificationId)) return null;
  const id = notificationId.slice(RENEWAL_HOLD_NOTIFICATION_PREFIX.length);
  return /^[A-Za-z0-9_-]{1,200}$/.test(id) ? id : null;
}

/** A label with no address in it: an "@" anywhere reads as the lease id instead. */
function safeLabel(label: string | null | undefined, leaseId: string): string {
  const text = (label ?? "").trim().slice(0, 200);
  return text && !text.includes("@") ? text : `Lease ${leaseId}`;
}

/**
 * R-S273-6: the notice one worker hold raises, or null. Only an initial renewal message (owner or
 * tenant, never a reply) held by the communication worker before any accepted send.
 */
export function renewalHoldNoticeFor(
  sequence: CommunicationSequence,
  nowMs: number,
): RenewalHoldNotice | null {
  const pause = sequence.pause;
  if (
    sequence.state !== "paused" ||
    !pause ||
    pause.byUid !== COMMUNICATION_WORKER_UID ||
    !Number.isFinite(pause.atMs) ||
    !sequence.authorization ||
    sequence.confirmedCount !== 0 ||
    !isCurrentMessageScope(sequence.context) ||
    !/^[1-9]\d*$/.test(sequence.context.entityId)
  )
    return null;
  return {
    schemaVersion: RENEWAL_HOLD_NOTICE_SCHEMA_VERSION,
    sequenceId: sequence.id,
    leaseId: sequence.context.entityId,
    audience: sequence.context.purpose === "renewal_owner" ? "owner" : "tenant",
    uid: sequence.responsibleUid,
    cause: pause.cause,
    pausedAtMs: pause.atMs,
    label: safeLabel(sequence.workflowLabel, sequence.context.entityId),
    createdAtMs: nowMs,
  };
}

/**
 * R-S273-6: the notice's words: "The tenant offer for 101 Sample Pl was held because the lease
 * changed." Another cause names its existing label.
 */
export function renewalHoldMessage(
  notice: Pick<RenewalHoldNotice, "audience" | "cause" | "label" | "leaseId">,
): string {
  const what = notice.audience === "owner" ? "owner message" : "tenant offer";
  const label = safeLabel(notice.label, notice.leaseId);
  if (notice.cause === "changed_source")
    return `The ${what} for ${label} was held because the lease changed.`;
  const cause = SEQUENCE_PAUSE_CAUSE_LABELS[notice.cause] ?? "Needs review";
  return `The ${what} for ${label} was held: ${cause}.`;
}

/** R-S273-6: the notice opens the lease's step for that audience. */
export function renewalHoldHref(
  notice: Pick<RenewalHoldNotice, "audience" | "leaseId">,
): string | null {
  return leaseWorkspaceHrefOrNull(
    notice.leaseId,
    notice.audience === "owner" ? "ask-owner" : "offer-tenant",
  );
}

/** A stored record read back, or null when it is not a usable notice. */
export function parseRenewalHoldNotice(value: unknown): RenewalHoldNotice | null {
  const record = value as Partial<RenewalHoldNotice> | null | undefined;
  if (
    !record ||
    record.schemaVersion !== RENEWAL_HOLD_NOTICE_SCHEMA_VERSION ||
    typeof record.sequenceId !== "string" ||
    typeof record.leaseId !== "string" ||
    (record.audience !== "owner" && record.audience !== "tenant") ||
    typeof record.uid !== "string" ||
    typeof record.cause !== "string" ||
    typeof record.pausedAtMs !== "number" ||
    typeof record.createdAtMs !== "number"
  )
    return null;
  return {
    schemaVersion: RENEWAL_HOLD_NOTICE_SCHEMA_VERSION,
    sequenceId: record.sequenceId,
    leaseId: record.leaseId,
    audience: record.audience,
    uid: record.uid,
    cause: record.cause as UnsentPauseCause,
    pausedAtMs: record.pausedAtMs,
    label: safeLabel(record.label, record.leaseId),
    createdAtMs: record.createdAtMs,
  };
}
