// One wording for a workflow-linked communication's state. The Communications hub, the linked
// detail on a lease or ticket, notifications and Dashboard answers all read it from here, so the
// same state never reads two ways. Pure and client-safe: labels only, no mailbox or message text.

import type {
  WorkflowCommunicationLink,
  WorkflowCommunicationStatus,
  WorkflowCommunicationWaitingOn,
} from "@/lib/gmail-hub/workflow-context";
import type {
  CommunicationSequence,
  SequenceObservationFailure,
} from "@/lib/gmail-hub/sequence-model";
import type {
  SequenceRefusal,
  SequenceRefusalReason,
} from "@/lib/gmail-hub/current-message";
import {
  OWNER_WORDING_UPDATED_INPUT,
  type ChangedInput,
} from "@/lib/gmail-hub/reviewed-inputs";
import {
  OWNER_WORDING_UPDATED_LINE,
  isOwnerWordingChange,
} from "@/lib/lease-renewal/owner-copy-version";
import { BUSINESS_TIME_ZONE } from "@/lib/lease-renewal/business-calendar";

type SequencePauseCause = NonNullable<CommunicationSequence["pause"]>["cause"];

/** S233: one plain label per pause cause; every cause still needs a fresh review before Resume. */
export const SEQUENCE_PAUSE_CAUSE_LABELS: Record<SequencePauseCause, string> = {
  staff: "Paused by staff",
  reply: "A reply was received",
  bounce: "Failed delivery reported",
  changed_source: "The lease or recipient facts changed",
  transfer: "Handed to another staff member",
  edited: "The message was edited after review",
  source_unavailable: "The lease or recipient facts could not be read",
  authorization_unavailable: "Sending is not authorized right now",
  provider_refused: "Gmail refused the send",
  send_unconfirmed: "The send could not be confirmed; checking",
  unexpected_sender:
    "A message arrived from an address not on this conversation, or from an automated sender",
  resource_changed: "A tenant link in this message changed or needs a new access check",
  // S272 R-S272-4: the worker stopped an older authorization after a newer confirmed send.
  newer_message_sent: "A newer message for this renewal was sent",
  // S276 R-S276-2 / R-S276-4: any recorded tenant response, a decline included, at save time.
  tenant_response_recorded: "The tenant's response was recorded by staff",
};

/**
 * S272 R-S272-5: an instant as the communication detail prints it, with its zone:
 * "11/13/2026, 9:00 AM CST". The sequence's own zone when it has one, otherwise Central.
 */
export function formatSequenceInstant(
  atMs: number,
  timeZone: string | null | undefined = BUSINESS_TIME_ZONE,
): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(atMs);
  try {
    return format(timeZone || BUSINESS_TIME_ZONE);
  } catch {
    return format(BUSINESS_TIME_ZONE);
  }
}

/**
 * S272 R-S272-5 (S233 R-S233-6): the state line of the communication detail. A scheduled message
 * prints its time with its zone, "Scheduled for 11/13/2026, 9:00 AM CST"; a paused one the time it
 * was paused, "Paused on 11/12/2026, 12:21 PM CST". Every other state reads as the shared label.
 */
export function describeSequenceDetailState(input: {
  state: import("./sequence-model").SequenceState;
  scheduled: boolean;
  confirmedCount: number;
  unresolvedOccurrenceId: string | null;
  nextDueAtMs: number | null;
  pause: { atMs: number } | null;
  timeZone: string | null;
}): string {
  const { label } = describeSequenceState(input);
  if (label === "Scheduled" && input.nextDueAtMs !== null)
    return `Scheduled for ${formatSequenceInstant(input.nextDueAtMs, input.timeZone)}`;
  if (label === "Paused" && input.pause && Number.isFinite(input.pause.atMs))
    return `Paused on ${formatSequenceInstant(input.pause.atMs, input.timeZone)}`;
  return label;
}

/** S272 R-S272-2: the one line staff read when the wording predates a lease change. */
export const WORDING_PREDATES_CHANGE_TEXT =
  "This message was written before the lease changed. Update it from the lease, or cancel it.";

/** S272 R-S272-5: the actions a refusal offers, as staff read them. */
export const SEQUENCE_REFUSAL_ACTION_LABELS = {
  update_from_lease: "Update from the lease",
  cancel: "Cancel future messages",
  open_lease: "Open the lease",
  open_related: "Open that communication",
} as const;
export type SequenceRefusalAction = keyof typeof SEQUENCE_REFUSAL_ACTION_LABELS;

/**
 * S272 R-S272-5 (ARCH-S272-3): the only actions that can succeed for each refusal. A message whose
 * wording predates a change can be updated from the lease or cancelled; one stopped by a newer send
 * can only be cancelled (the lease opens for the current message); a refused new message opens the
 * communication that already holds the renewal.
 */
export const SEQUENCE_REFUSAL_ACTIONS: Record<
  SequenceRefusalReason,
  readonly SequenceRefusalAction[]
> = {
  wording_predates_change: ["update_from_lease", "cancel"],
  newer_message_sent: ["open_lease", "cancel"],
  unsent_message_exists: ["open_related"],
};

/**
 * S272 R-S272-5: true when the refusal leaves this communication no Resume, Send or Schedule. A
 * refused new message keeps them: it succeeds once the other communication is updated or cancelled.
 */
export function refusalWithholdsAuthorization(reason: SequenceRefusalReason): boolean {
  return reason !== "unsent_message_exists";
}

/** S272 R-S272-2: one changed content value: "Renewal end date: 12/31/2027 in this message, 06/30/2027 on the lease." */
export function predatesChangeLine(change: ChangedInput): string {
  // S285 R-S285-6: the owner wording an approver published is named as one cause.
  if (change.key === OWNER_WORDING_UPDATED_INPUT.key || isOwnerWordingChange(change))
    return `${OWNER_WORDING_UPDATED_LINE}.`;
  const { previous, current } = change;
  if (previous === undefined || previous === current) return `${change.label} changed.`;
  return `${change.label}: ${previous ?? "not set"} in this message, ${current ?? "not set"} on the lease.`;
}

const UNSENT_LEAD = {
  tenant: "A tenant offer for this renewal",
  owner: "An owner message for this renewal",
} as const;

/**
 * S272 R-S272-6 (ARCH-S272-3): the staff text for one typed refusal, derived in this one place for
 * the lease and Communications: the reason line, each changed value (wording only) and the actions
 * that can succeed.
 */
export function describeSequenceRefusal(refusal: SequenceRefusal): {
  readonly text: string;
  readonly lines: readonly string[];
  readonly actions: readonly SequenceRefusalAction[];
} {
  const at = (atMs: number | null | undefined) =>
    typeof atMs === "number" && Number.isFinite(atMs)
      ? formatSequenceInstant(atMs, refusal.timeZone)
      : null;
  const actions = SEQUENCE_REFUSAL_ACTIONS[refusal.reason];
  if (refusal.reason === "wording_predates_change")
    return {
      text: WORDING_PREDATES_CHANGE_TEXT,
      lines: (refusal.changes ?? []).map(predatesChangeLine),
      actions,
    };
  if (refusal.reason === "newer_message_sent") {
    const sent = at(refusal.relatedAtMs);
    return {
      text: sent
        ? `A newer message for this renewal was sent on ${sent}. Cancel this one.`
        : "A newer message for this renewal was sent. Cancel this one.",
      lines: [],
      actions,
    };
  }
  const time = at(refusal.relatedAtMs);
  const lead = UNSENT_LEAD[refusal.audience];
  const text =
    refusal.relatedState === "unconfirmed"
      ? `${lead} has a send that is not confirmed yet. Open it to check that send.`
      : refusal.relatedState === "paused"
        ? `${lead} ${time ? `was paused on ${time}` : "is paused"} and is not sent. Open it to update or cancel it.`
        : refusal.relatedState === "awaiting_send"
          ? `${lead} is already waiting to send. Open it to update or cancel it.`
          : `${lead} is already scheduled${time ? ` for ${time}` : ""}. Open it to update or cancel it.`;
  return { text, lines: [], actions };
}

/** S272 R-S272-6: the refusal as one message, as the sequences route returns it. */
export function sequenceRefusalMessage(refusal: SequenceRefusal): string {
  const view = describeSequenceRefusal(refusal);
  return [view.text, ...view.lines].join(" ");
}

export const COMMUNICATION_STATUS_LABELS: Record<WorkflowCommunicationStatus, string> = {
  linked: "linked",
  draft_created: "unsent draft created",
  sent: "reply sent",
  attention_required: "needs review",
};

export const COMMUNICATION_WAITING_ON_LABELS: Record<
  WorkflowCommunicationWaitingOn,
  string
> = {
  team: "Waiting on the team",
  owner: "Waiting on the owner",
  resident: "Waiting on the resident",
  vendor: "Waiting on the vendor",
  outside: "Waiting on someone outside the team",
  none: "Nothing is waiting",
};

/** The status as a badge reads it: the same words, starting with a capital. */
export function communicationStatusBadge(status: WorkflowCommunicationStatus): string {
  const label = COMMUNICATION_STATUS_LABELS[status];
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

const UNVERIFIED_REASONS: Record<
  NonNullable<WorkflowCommunicationLink["contact_observation_reason"]>,
  string
> = {
  thread_unavailable: "the linked Gmail thread was not found",
  thread_unreadable: "the linked Gmail thread could not be read",
};

export interface CommunicationStateInput {
  readonly status: WorkflowCommunicationStatus;
  readonly waitingOn?: WorkflowCommunicationWaitingOn | null;
  readonly lastContactAtMs?: number | null;
  readonly observationState?:
    | WorkflowCommunicationLink["contact_observation_state"]
    | null;
  readonly observationReason?:
    | WorkflowCommunicationLink["contact_observation_reason"]
    | null;
}

export interface CommunicationStateView {
  /** The status in words: "needs review", "unsent draft created", "reply sent" or "linked". */
  readonly status: string;
  /** True when the linked thread could not be read, so recorded contact state is not current. */
  readonly needsVerification: boolean;
  /** True when a person has something to look at: a new message, or a thread to verify. */
  readonly needsAttention: boolean;
  /** Who it waits on and the last contact, or why neither can be relied on. */
  readonly evidence: string;
}

/** The fields of a stored link that describe its state. */
export function communicationStateOf(
  link: Pick<
    WorkflowCommunicationLink,
    | "status"
    | "waiting_on"
    | "last_contact_at_ms"
    | "contact_observation_state"
    | "contact_observation_reason"
  >,
): CommunicationStateInput {
  return {
    status: link.status,
    waitingOn: link.waiting_on ?? null,
    lastContactAtMs: link.last_contact_at_ms ?? null,
    observationState: link.contact_observation_state ?? null,
    observationReason: link.contact_observation_reason ?? null,
  };
}

export function describeCommunicationState(
  input: CommunicationStateInput,
  formatTimestamp: (atMs: number) => string,
): CommunicationStateView {
  const status = COMMUNICATION_STATUS_LABELS[input.status];
  if (input.observationState === "needs_verification")
    return {
      status,
      needsVerification: true,
      needsAttention: true,
      // Earlier contact evidence is withheld: it would read as current, and it is not.
      evidence: `Needs verification: ${
        input.observationReason
          ? UNVERIFIED_REASONS[input.observationReason]
          : "the linked Gmail thread could not be checked"
      }. Refresh or relink it before relying on contact state.`,
    };
  return {
    status,
    needsVerification: false,
    needsAttention: input.status === "attention_required",
    evidence: [
      input.waitingOn
        ? COMMUNICATION_WAITING_ON_LABELS[input.waitingOn]
        : "Waiting on not yet observed",
      input.lastContactAtMs
        ? `Last contact ${formatTimestamp(input.lastContactAtMs)}`
        : "Last contact not yet observed",
    ].join(" · "),
  };
}

/** An admitted occurrence is never a confirmed send, including after cancellation. */
export function describeSequenceState(input: {
  state: import("./sequence-model").SequenceState;
  scheduled: boolean;
  confirmedCount: number;
  unresolvedOccurrenceId: string | null;
}) {
  const needsVerification =
    !!input.unresolvedOccurrenceId || input.state === "needs_reconciliation";
  const label = needsVerification
    ? "Needs verification"
    : input.state === "active"
      ? input.scheduled
        ? "Scheduled"
        : "Awaiting send"
      : (
          {
            draft: "Draft in app",
            paused: "Paused",
            cancelled: "Cancelled",
            completed: input.confirmedCount > 0 ? "Sent" : "Completed",
            needs_reconciliation: "Needs verification",
          } as const
        )[input.state];
  return {
    label,
    confirmed: `${input.confirmedCount} confirmed message${input.confirmedCount === 1 ? "" : "s"}`,
    needsVerification,
  };
}

function describeAge(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "less than a minute";
  if (minutes < 120) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.floor(hours / 24)} days`;
}

const OBSERVATION_FAILURE_TEXT: Record<SequenceObservationFailure, string> = {
  read_failed: "a linked Gmail thread could not be read",
  thread_too_large:
    "a linked Gmail thread is over the 50-message or 100,000-character read limit",
  mailbox_sync_failed: "the staff mailbox sync failed, so it was not checked this run",
  source_unavailable: "the lease source or recipient facts could not be read",
  // S274 R-S274-4: a wait, not a hold: the next run checks the settled read.
  lease_read_settling:
    "the lease was being re-read at the due time, so the message waits for the next check",
};

/**
 * S233 R-S233-4: how fresh the incoming check is. An unclean check says since when and why, and
 * that dependent sends are held; a mailbox sync failure reads "not checked this run".
 */
export function describeSequenceObservation(
  observation: CommunicationSequence["observation"],
  nowMs: number,
): string {
  if (!observation) return "Incoming not checked yet";
  const age = describeAge(nowMs - observation.checkedAtMs);
  if (observation.state === "current") return `Incoming checked ${age} ago`;
  // A record from before the reason was kept says only what it knows.
  if (!observation.reason)
    return `Incoming could not be fully read (last attempt ${age} ago); scheduled sends are held until it reads cleanly`;
  // S274 R-S274-4: a wait on a settling lease read is not a hold and not an incoming read failure.
  if (observation.reason === "lease_read_settling")
    return `Waiting on a lease read: ${OBSERVATION_FAILURE_TEXT.lease_read_settling} (last check ${age} ago)`;
  const since = describeAge(
    nowMs - (observation.unavailableSinceMs ?? observation.checkedAtMs),
  );
  const lead =
    observation.reason === "mailbox_sync_failed"
      ? "Incoming not checked this run"
      : "Incoming could not be read cleanly";
  return `${lead}: ${OBSERVATION_FAILURE_TEXT[observation.reason]}. Unavailable for ${since} (last attempt ${age} ago); scheduled sends are held until it reads cleanly`;
}

/** S233 R-S233-5: the worker health the hub reads (a serialized `CommunicationWorkerHealth`). */
export interface CommunicationWorkerHealthView {
  readonly lastRun: {
    readonly startedAtMs: number | null;
    readonly finishedAtMs: number | null;
    readonly running: boolean;
    readonly counts: Readonly<Record<string, number>>;
  } | null;
  readonly complete: boolean;
  readonly oldestPastDue: { readonly dueAtMs: number; readonly lagMs: number } | null;
  readonly oldestObservation: {
    readonly checkedAtMs: number;
    readonly ageMs: number;
  } | null;
  readonly neverChecked: number;
}

/**
 * S233 R-S233-5: the hub's worker health line: the last run and its counts, the oldest past-due
 * unsent message with its lag, and the oldest incoming check. `dueLabel` formats the due time in
 * the sequence time zone the hub already uses.
 */
export function describeWorkerHealth(
  health: CommunicationWorkerHealthView,
  nowMs: number,
  dueLabel: (ms: number) => string,
): readonly string[] {
  const lines: string[] = [];
  const run = health.lastRun;
  if (!run || (run.startedAtMs === null && run.finishedAtMs === null))
    lines.push("Worker: no run recorded yet.");
  else if (run.running)
    lines.push(
      `Worker: a run is in progress${run.startedAtMs !== null ? ` (started ${describeAge(nowMs - run.startedAtMs)} ago)` : ""}.`,
    );
  else if (run.finishedAtMs === null)
    // A run claims the record as it starts; a lease that ran out before it finished is a stopped run.
    lines.push(
      `Worker: the last run started ${describeAge(nowMs - run.startedAtMs!)} ago and did not finish.`,
    );
  else {
    const c = run.counts;
    const parts = [
      `${c.inspected ?? 0} checked`,
      `${c.sent ?? 0} sent`,
      `${c.held ?? 0} held`,
      `${c.failures ?? 0} failures`,
      ...(c.notChecked ? [`${c.notChecked} not checked this run`] : []),
      // S274 R-S274-7: counts only; no record or address.
      ...(c.waitedOnLeaseRead ? [`${c.waitedOnLeaseRead} waited on a lease read`] : []),
    ];
    lines.push(
      `Worker: last run finished ${describeAge(nowMs - run.finishedAtMs!)} ago (${parts.join(", ")}).`,
    );
  }
  // Ages follow the hub's minute clock, as the last run's does; the read's own lag and age are for
  // the assurance receipt, which has no clock of its own.
  lines.push(
    health.oldestPastDue
      ? `Oldest past-due message: due ${dueLabel(health.oldestPastDue.dueAtMs)}; not yet sent (${describeAge(nowMs - health.oldestPastDue.dueAtMs)} late).`
      : "No scheduled message is past due.",
  );
  lines.push(
    health.oldestObservation
      ? `Oldest incoming check: ${describeAge(nowMs - health.oldestObservation.checkedAtMs)} ago${health.neverChecked ? `; ${health.neverChecked} not checked yet` : ""}.`
      : health.neverChecked
        ? `Incoming not checked yet for ${health.neverChecked} communication${health.neverChecked === 1 ? "" : "s"}.`
        : "No open communication needs an incoming check.",
  );
  if (!health.complete)
    lines.push("Counts cover the first open communications read; more are open.");
  return lines;
}
