import { formatCalendarDateOrTimestamp } from "@/lib/date-display";
// One provider-free renewal follow-up projection. Exact bodyless communication evidence and one
// immutable policy snapshot enter as data; desk, workspace, and internal attention consume the same
// result. No clock or I/O is hidden here: the caller supplies the observation time and every source.

import type {
  WorkflowCommunicationLink,
  WorkflowCommunicationPurpose,
} from "@/lib/gmail-hub/workflow-context";
import {
  resolveNoticeRule,
  type NoticeRuleScope,
  type NoticeRuleSnapshot,
} from "@/lib/lease-renewal/notice-rules";

export const RENEWAL_FOLLOW_UP_VERSION = "renewal-follow-up-v1" as const;

export type RenewalWaitingParty =
  | "team"
  | "owner"
  | "tenant"
  | "document_coordinator"
  | "unresolved_source";

export interface RenewalProcessWaitingFallback {
  party: "document_coordinator" | "unresolved_source";
  sourceRef: string;
}

export type RenewalFollowUpSource =
  | {
      kind: "gmail_thread";
      linkId: string;
      threadId: string;
      messageId: string;
      purpose: "renewal_owner" | "renewal_tenant";
    }
  | {
      kind: "renewal_process";
      ref: string;
    }
  | {
      /** S279 R-S279-1: the lease's own renewal message evidence for its current cycle. */
      kind: "outreach_evidence";
      cycleId: string | null;
    };

export interface RenewalFollowUpWaiting {
  state: "verified" | "not_waiting" | "needs_verification";
  party: RenewalWaitingParty | null;
  source: RenewalFollowUpSource | null;
}

export interface RenewalFollowUpLastContact {
  /** "none": the lease's own evidence holds no counted message yet (S279), so nothing to verify. */
  state: "verified" | "needs_verification" | "none";
  atIso: string | null;
  source: Extract<RenewalFollowUpSource, { kind: "gmail_thread" }> | null;
}

/**
 * S279 R-S279-1 / R-S279-2: who has the move and the last contact from the one waiting projection
 * (`lease-waiting.ts`) over the lease's own message evidence. No viewer identity enters it.
 */
export interface RenewalFollowUpOutreachContact {
  /** Whose move it is; null once nobody outside the work is waited on (complete). */
  readonly party: "owner" | "tenant" | "team" | null;
  readonly lastContactIso: string | null;
  readonly cycleId: string | null;
}

/** S279 R-S279-5: the unconfirmed notice rules line, its next step and the Admin panel it names. */
export const NOTICE_RULES_UNCONFIRMED_LABEL = "Renewal notice rules are not confirmed";
export const NOTICE_RULES_UNCONFIRMED_NEXT =
  "an Admin confirms them in Admin, Renewal notice rules.";
/** The words of the next step that name the Admin panel; an Admin sees them as its link. */
export const NOTICE_RULES_ADMIN_PLACE = "Admin, Renewal notice rules";
export const NOTICE_RULES_ADMIN_HREF = "/admin?task=renewal#admin-renewal-notice-rules";

export interface RenewalFollowUpPolicy {
  state: "confirmed" | "disabled" | "unset" | "unreadable";
  label: string;
  version: number | null;
  updatedAtIso: string | null;
  effectiveScope: NoticeRuleScope | null;
  effectiveKey: string | null;
  intervalDays: number | null;
}

export interface RenewalFollowUpDue {
  state:
    | "due"
    | "not_due"
    | "not_applicable"
    | "disabled"
    | "unset"
    | "needs_verification";
  atIso: string | null;
}

export interface RenewalFollowUpAttention {
  kind: "renewal_follow_up";
  leaseId: string;
  dueAtIso: string;
  lastContactAtIso: string;
  dedupeKey: string;
  policyVersion: number;
  policyScope: NoticeRuleScope;
  sourceRefs: string[];
}

export interface RenewalFollowUpProjection {
  version: typeof RENEWAL_FOLLOW_UP_VERSION;
  leaseId: string;
  asOfIso: string;
  /** Opaque exact link identity retained for deliberate recovery even when contact is unreadable. */
  linkedThread: {
    linkId: string;
    threadId: string;
    purpose: "renewal_owner" | "renewal_tenant";
    observationState: "current" | "needs_verification";
  } | null;
  waiting: RenewalFollowUpWaiting;
  lastContact: RenewalFollowUpLastContact;
  policy: RenewalFollowUpPolicy;
  due: RenewalFollowUpDue;
  nextAction: string;
  /** The exact due work identity remains present when a human has dismissed its attention card. */
  workItem: RenewalFollowUpAttention | null;
  attentionState: "open" | "dismissed" | "not_applicable";
  attention: RenewalFollowUpAttention | null;
}

export interface RenewalFollowUpProjectionInput {
  leaseId: string;
  propertyKey?: string | null;
  asOfIso: string;
  communicationState: "current" | "unreadable";
  links: readonly WorkflowCommunicationLink[];
  policy: NoticeRuleSnapshot;
  preferredPurpose?: Extract<
    WorkflowCommunicationPurpose,
    "renewal_owner" | "renewal_tenant"
  >;
  processFallback?: RenewalProcessWaitingFallback | null;
  dismissedAttentionKeys?: readonly string[];
  /**
   * S279 R-S279-1 / R-S279-2: the lease's own waiting facts. When given, the waiting state, the
   * last contact, the due date and the next step read them and never a viewer's own mailbox link;
   * the process-step fallback applies only when the evidence could not be read (null). The links
   * still name the person's own linked thread and drive only that person's attention. Absent: the
   * pre-S279 link-based reading, kept for callers that read no evidence.
   */
  outreachContact?: RenewalFollowUpOutreachContact | null;
}

function exactLeaseRef(leaseId: string): string {
  return `rentvine:lease:${leaseId}`;
}

function isExactLeaseLink(link: WorkflowCommunicationLink, leaseId: string): boolean {
  return (
    link.lane === "renewals" &&
    link.entity_type === "renewal_lease" &&
    link.entity_id === leaseId &&
    (link.purpose === "renewal_owner" || link.purpose === "renewal_tenant") &&
    link.source_refs.includes(exactLeaseRef(leaseId)) &&
    Boolean(link.gmail_thread_id)
  );
}

function linkOrder(link: WorkflowCommunicationLink): number {
  // S279 R-S279-3: the link a confirmed send writes carries no observed contact yet; its send
  // time places it, so the current message's thread is not ranked behind an older thread.
  return link.contact_observation_state === "needs_verification"
    ? link.updated_at_ms
    : (link.last_contact_at_ms ??
        (link.contact_observation_state === undefined ? link.created_at_ms : 0) ??
        0);
}

/** Select one current channel deterministically; a rewrite cannot outrank newer provider evidence. */
export function selectRenewalFollowUpLink(
  links: readonly WorkflowCommunicationLink[],
  leaseId: string,
  preferredPurpose?: RenewalFollowUpProjectionInput["preferredPurpose"],
): WorkflowCommunicationLink | null {
  const exact = links.filter((link) => isExactLeaseLink(link, leaseId));
  const candidates = preferredPurpose
    ? exact.filter((link) => link.purpose === preferredPurpose)
    : exact;
  return (
    [...candidates].sort(
      (left, right) =>
        linkOrder(right) - linkOrder(left) ||
        right.updated_at_ms - left.updated_at_ms ||
        left.id.localeCompare(right.id),
    )[0] ?? null
  );
}

function gmailSource(
  link: WorkflowCommunicationLink,
): Extract<RenewalFollowUpSource, { kind: "gmail_thread" }> | null {
  if (
    !link.gmail_thread_id ||
    !link.last_contact_message_id ||
    (link.purpose !== "renewal_owner" && link.purpose !== "renewal_tenant") ||
    link.contact_observation_state === "needs_verification"
  ) {
    return null;
  }
  return {
    kind: "gmail_thread",
    linkId: link.id,
    threadId: link.gmail_thread_id,
    messageId: link.last_contact_message_id,
    purpose: link.purpose,
  };
}

function isoFromMs(value: number | undefined): string | null {
  if (!value || !Number.isSafeInteger(value) || value <= 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function waitingParty(
  waitingOn: WorkflowCommunicationLink["waiting_on"],
): RenewalWaitingParty | null {
  switch (waitingOn) {
    case "team":
      return "team";
    case "owner":
      return "owner";
    case "resident":
      return "tenant";
    case "vendor":
    case "outside":
      return "unresolved_source";
    case "none":
    case undefined:
      return null;
  }
}

function buildContactState(
  input: RenewalFollowUpProjectionInput,
  selected: WorkflowCommunicationLink | null,
): {
  waiting: RenewalFollowUpWaiting;
  lastContact: RenewalFollowUpLastContact;
} {
  const processWaiting = input.processFallback
    ? ({
        state: "verified",
        party: input.processFallback.party,
        source: {
          kind: "renewal_process",
          ref: input.processFallback.sourceRef,
        },
      } satisfies RenewalFollowUpWaiting)
    : null;

  if (input.communicationState === "unreadable" || !selected) {
    return {
      waiting:
        processWaiting ??
        ({ state: "needs_verification", party: null, source: null } as const),
      lastContact: { state: "needs_verification", atIso: null, source: null },
    };
  }

  const source = gmailSource(selected);
  const atIso = isoFromMs(selected.last_contact_at_ms);
  if (!source || !atIso || selected.contact_observation_state === "needs_verification") {
    return {
      waiting:
        processWaiting ??
        ({ state: "needs_verification", party: null, source: null } as const),
      lastContact: { state: "needs_verification", atIso: null, source: null },
    };
  }

  const party = waitingParty(selected.waiting_on);
  return {
    waiting:
      selected.waiting_on === "none"
        ? { state: "not_waiting", party: null, source }
        : party
          ? { state: "verified", party, source }
          : (processWaiting ?? {
              state: "needs_verification",
              party: null,
              source: null,
            }),
    lastContact: { state: "verified", atIso, source },
  };
}

/**
 * S279 R-S279-1 / R-S279-2: the waiting state and last contact from the lease's own message
 * evidence. When that evidence was read the older process step is never a fallback; when it could
 * not be read (null) only the process step's own waiting fact may stand, and contact needs a check.
 */
function outreachContactState(
  input: RenewalFollowUpProjectionInput,
  outreach: RenewalFollowUpOutreachContact | null,
): ReturnType<typeof buildContactState> {
  if (!outreach) {
    return {
      waiting: input.processFallback
        ? {
            state: "verified",
            party: input.processFallback.party,
            source: { kind: "renewal_process", ref: input.processFallback.sourceRef },
          }
        : { state: "needs_verification", party: null, source: null },
      lastContact: { state: "needs_verification", atIso: null, source: null },
    };
  }
  const source = { kind: "outreach_evidence", cycleId: outreach.cycleId } as const;
  return {
    waiting:
      outreach.party === null
        ? { state: "not_waiting", party: null, source }
        : { state: "verified", party: outreach.party, source },
    lastContact: outreach.lastContactIso
      ? { state: "verified", atIso: outreach.lastContactIso, source: null }
      : { state: "none", atIso: null, source: null },
  };
}

function policyKey(
  scope: NoticeRuleScope,
  input: RenewalFollowUpProjectionInput,
): string | null {
  if (scope === "lease") return input.leaseId;
  if (scope === "property") return input.propertyKey ?? null;
  return null;
}

function buildPolicy(input: RenewalFollowUpProjectionInput): RenewalFollowUpPolicy {
  const resolved = resolveNoticeRule(input.policy.ruleSet, {
    leaseId: input.leaseId,
    propertyKey: input.propertyKey,
  });
  const source = resolved.followUpIntervalDays;
  const common = {
    version: input.policy.version,
    updatedAtIso: input.policy.updatedAtIso,
    effectiveScope: source.scope,
    effectiveKey: policyKey(source.scope, input),
  };

  // S279 R-S279-5: the line names what is unconfirmed in the words of its Admin panel.
  if (input.policy.state === "invalid" || input.policy.state === "unreadable") {
    return {
      state: "unreadable",
      label: NOTICE_RULES_UNCONFIRMED_LABEL,
      ...common,
      intervalDays: null,
    };
  }
  if (input.policy.state !== "saved" || !resolved.fullyVerified) {
    return {
      state: "unset",
      label: NOTICE_RULES_UNCONFIRMED_LABEL,
      ...common,
      intervalDays: null,
    };
  }
  if (!resolved.enabled.value) {
    return {
      state: "disabled",
      label: "Follow-up timing disabled by confirmed policy",
      ...common,
      intervalDays: null,
    };
  }
  return {
    state: "confirmed",
    label: "Client-confirmed timing policy",
    ...common,
    intervalDays: Math.max(0, source.value),
  };
}

function dueFrom(
  input: RenewalFollowUpProjectionInput,
  contact: ReturnType<typeof buildContactState>,
  policy: RenewalFollowUpPolicy,
): RenewalFollowUpDue {
  if (policy.state === "unset" || policy.state === "unreadable") {
    return { state: "unset", atIso: null };
  }
  if (policy.state === "disabled") return { state: "disabled", atIso: null };
  if (
    contact.waiting.state === "needs_verification" ||
    contact.lastContact.state === "needs_verification"
  ) {
    return { state: "needs_verification", atIso: null };
  }
  if (
    (contact.waiting.party !== "owner" && contact.waiting.party !== "tenant") ||
    !contact.lastContact.atIso ||
    policy.intervalDays === null
  ) {
    return { state: "not_applicable", atIso: null };
  }
  const lastContactMs = Date.parse(contact.lastContact.atIso);
  const asOfMs = Date.parse(input.asOfIso);
  if (!Number.isFinite(lastContactMs) || !Number.isFinite(asOfMs)) {
    return { state: "needs_verification", atIso: null };
  }
  const dueAtIso = new Date(
    lastContactMs + policy.intervalDays * 86_400_000,
  ).toISOString();
  return {
    state: asOfMs >= Date.parse(dueAtIso) ? "due" : "not_due",
    atIso: dueAtIso,
  };
}

function policySourceRef(policy: RenewalFollowUpPolicy): string | null {
  if (
    policy.state !== "confirmed" ||
    policy.version === null ||
    policy.effectiveScope === null
  ) {
    return null;
  }
  const key = policy.effectiveKey ?? "global";
  return `notice-policy:active:v${policy.version}:${policy.effectiveScope}:${key}`;
}

function buildAttention(
  input: RenewalFollowUpProjectionInput,
  contact: ReturnType<typeof buildContactState>,
  policy: RenewalFollowUpPolicy,
  due: RenewalFollowUpDue,
): RenewalFollowUpAttention | null {
  const source = contact.lastContact.source;
  const ruleRef = policySourceRef(policy);
  if (
    due.state !== "due" ||
    !due.atIso ||
    !contact.lastContact.atIso ||
    !source ||
    !ruleRef ||
    policy.version === null ||
    policy.effectiveScope === null
  ) {
    return null;
  }
  const dedupeKey = [
    RENEWAL_FOLLOW_UP_VERSION,
    input.leaseId,
    String(policy.version),
    policy.effectiveScope,
    policy.effectiveKey ?? "global",
    source.messageId,
    due.atIso,
  ].join(":");
  return {
    kind: "renewal_follow_up",
    leaseId: input.leaseId,
    dueAtIso: due.atIso,
    lastContactAtIso: contact.lastContact.atIso,
    dedupeKey,
    policyVersion: policy.version,
    policyScope: policy.effectiveScope,
    sourceRefs: [
      `gmail-link:${source.linkId}`,
      `gmail-thread:${source.threadId}`,
      `gmail-message:${source.messageId}`,
      ruleRef,
    ],
  };
}

function nextAction(
  contact: ReturnType<typeof buildContactState>,
  policy: RenewalFollowUpPolicy,
  due: RenewalFollowUpDue,
): string {
  if (policy.state === "unset" || policy.state === "unreadable") {
    // S279 R-S279-5: the owner of the step and where it is done.
    return NOTICE_RULES_UNCONFIRMED_NEXT;
  }
  if (due.state === "needs_verification") {
    return "Refresh or relink the exact Gmail thread before relying on contact state.";
  }
  if (due.state === "due") {
    return "Review the linked thread and record the next human follow-up action.";
  }
  if (due.state === "not_due" && due.atIso) {
    return `Review follow-up state on ${formatCalendarDateOrTimestamp(due.atIso)}; no communication is automatic.`;
  }
  if (contact.waiting.party === "document_coordinator") {
    return "Continue the current document-coordinator substep.";
  }
  if (contact.waiting.party === "unresolved_source") {
    return "Resolve the named source blocker before continuing.";
  }
  return "Continue from the current source-backed renewal state.";
}

/** Build the one lease-bound contact, policy, due, and internal-attention projection. */
export function buildRenewalFollowUpProjection(
  input: RenewalFollowUpProjectionInput,
): RenewalFollowUpProjection {
  const selected = selectRenewalFollowUpLink(
    input.links,
    input.leaseId,
    input.preferredPurpose,
  );
  // The person's own linked thread: its control and that person's attention read it.
  const linkContact = buildContactState(input, selected);
  // S279 R-S279-2: the status every viewer reads comes from the lease's own evidence when given.
  const contact =
    input.outreachContact === undefined
      ? linkContact
      : outreachContactState(input, input.outreachContact);
  const policy = buildPolicy(input);
  const due = dueFrom(input, contact, policy);
  // A person's link attention still drives only that person's notifications.
  const linkDue = contact === linkContact ? due : dueFrom(input, linkContact, policy);
  const workItem = buildAttention(input, linkContact, policy, linkDue);
  const dismissed = Boolean(
    workItem && input.dismissedAttentionKeys?.includes(workItem.dedupeKey),
  );
  return {
    version: RENEWAL_FOLLOW_UP_VERSION,
    leaseId: input.leaseId,
    asOfIso: input.asOfIso,
    linkedThread:
      selected?.gmail_thread_id &&
      (selected.purpose === "renewal_owner" || selected.purpose === "renewal_tenant")
        ? {
            linkId: selected.id,
            threadId: selected.gmail_thread_id,
            purpose: selected.purpose,
            observationState:
              selected.contact_observation_state === "needs_verification"
                ? "needs_verification"
                : "current",
          }
        : null,
    waiting: contact.waiting,
    lastContact: contact.lastContact,
    policy,
    due,
    nextAction: nextAction(contact, policy, due),
    workItem,
    attentionState: workItem ? (dismissed ? "dismissed" : "open") : "not_applicable",
    attention: dismissed ? null : workItem,
  };
}
