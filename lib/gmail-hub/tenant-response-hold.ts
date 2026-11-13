// S276 R-S276-2 / R-S276-3 / R-S276-4 (ARCH-S276-2): a tenant response staff recorded on the lease
// is an input to dispatch for that lease's tenant renewal messages in the same cycle. Saving
// an acceptance, a change request or a decline pauses the unsent
// reminders of an offer authorized before it, under its own cause; dispatch and the claim read the
// same recorded response, so a reminder that becomes due after the response is held even when the
// pause could not be written at save time.
//
// The hold covers reminders only: a tenant renewal message (not a reply) whose initial send Gmail
// confirmed, so its next occurrence is a follow-up. A message authorized after the response was
// recorded (a staff Resume, or a new offer staff chose to send) is the staff's deliberate later
// decision and is never held by it. Clearing the response resumes nothing: a paused message stays
// paused until staff resume it in Communications (R-S276-5).
//
// Pure and client-safe: no Firestore, no mailbox, no message content.

import type { CommunicationSequence } from "./sequence-model";

/** R-S276-2: the pause cause, in the cause list and the label map. */
export const TENANT_RESPONSE_PAUSE_CAUSE = "tenant_response_recorded" as const;

/** The outcomes that establish the tenant's response under R-S276-2. */
const RECORDED_TENANT_RESPONSES: ReadonlySet<string> = new Set([
  "accepted",
  "counter_change_requested",
  "declined_nonrenewing",
]);

/** True when a saved tenant outcome is a response that ends the offer's reminders. */
export function isRecordedTenantResponse(outcome: string | null | undefined): boolean {
  return typeof outcome === "string" && RECORDED_TENANT_RESPONSES.has(outcome);
}

/** The recorded tenant response as dispatch reads it, from the lease's current work record. */
export interface RecordedTenantResponse {
  readonly cycleId: string;
  readonly eventId: string;
  readonly outcome: string;
  readonly actorUid: string;
  readonly recordedAtMs: number;
}

const text = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

/**
 * The recorded tenant response a work record (a stored head or a parsed state) carries, or null
 * when there is none, it is not a response yet, or it cannot be read.
 */
export function recordedTenantResponseOf(head: unknown): RecordedTenantResponse | null {
  if (!head || typeof head !== "object") return null;
  const record = head as { cycleId?: unknown; tenantResponse?: unknown };
  const response = record.tenantResponse as
    | {
        eventId?: unknown;
        actorUid?: unknown;
        recordedAt?: unknown;
        outcome?: unknown;
      }
    | null
    | undefined;
  if (!response || typeof response !== "object" || !text(record.cycleId)) return null;
  if (!text(response.outcome) || !isRecordedTenantResponse(response.outcome)) return null;
  const recordedAtMs = text(response.recordedAt) ? Date.parse(response.recordedAt) : NaN;
  if (!Number.isFinite(recordedAtMs) || !text(response.eventId)) return null;
  return {
    cycleId: record.cycleId,
    eventId: response.eventId,
    outcome: response.outcome,
    actorUid: text(response.actorUid) ? response.actorUid : "staff",
    recordedAtMs,
  };
}

type HoldFields = Pick<
  CommunicationSequence,
  "context" | "authorization" | "confirmedCount" | "noticeCycleId"
>;

/**
 * True when this message is a tenant renewal message (not a reply) with a confirmed initial send,
 * so its unsent work is reminders the recorded response can hold.
 */
export function tenantReminderScope(
  sequence: Pick<CommunicationSequence, "context" | "confirmedCount">,
): boolean {
  const context = sequence.context;
  return (
    context.entityType === "renewal_lease" &&
    context.purpose === "renewal_tenant" &&
    !context.replyTo &&
    /^[1-9]\d*$/.test(context.entityId) &&
    sequence.confirmedCount >= 1
  );
}

/**
 * ARCH-S276-2: whether the recorded response holds this message's unsent reminders: a tenant
 * reminder of the same cycle (or of a message whose cycle was not recorded), authorized at or
 * before the response was recorded.
 */
export function tenantResponseHolds(
  sequence: HoldFields,
  response: RecordedTenantResponse | null,
): boolean {
  if (!response || !sequence.authorization || !tenantReminderScope(sequence))
    return false;
  const cycle = sequence.noticeCycleId ?? null;
  if (cycle !== null && cycle !== response.cycleId) return false;
  return response.recordedAtMs >= sequence.authorization.approvedAtMs;
}

/** The evidence id a response pause names: the staff record event, never message content. */
export function tenantResponseEvidenceId(eventId: string): string {
  return `renewal-tenant-response:${eventId}`;
}

/** R-S276-2: the pause the response writes, with the actor who saved it (or stopped it). */
export function tenantResponsePause(
  response: Pick<RecordedTenantResponse, "eventId">,
  actorUid: string,
  atMs: number,
): NonNullable<CommunicationSequence["pause"]> {
  return {
    cause: TENANT_RESPONSE_PAUSE_CAUSE,
    byUid: actorUid,
    atMs,
    evidenceIds: [tenantResponseEvidenceId(response.eventId)],
  };
}

/** R-S276-2 / R-S276-3: what saving the response did to the offer's reminders. */
export interface TenantReminderStop {
  /**
   * stopped: one or more reminders were paused; none: nothing was scheduled to stop; failed: the
   * pause could not be written (dispatch still holds them), so the step offers "Stop them".
   */
  readonly state: "stopped" | "none" | "failed";
  readonly paused: number;
}
