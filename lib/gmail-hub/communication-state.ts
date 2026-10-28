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
};

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
