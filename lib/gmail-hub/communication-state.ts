// One wording for a workflow-linked communication's state. The Communications hub, the linked
// detail on a lease or ticket, notifications and Dashboard answers all read it from here, so the
// same state never reads two ways. Pure and client-safe: labels only, no mailbox or message text.

import type {
  WorkflowCommunicationLink,
  WorkflowCommunicationStatus,
  WorkflowCommunicationWaitingOn,
} from "@/lib/gmail-hub/workflow-context";

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
