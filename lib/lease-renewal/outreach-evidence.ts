// S248 R-S248-1 to R-S248-10: the evidence the app already holds about a lease's renewal
// messages, as pure inputs to the one stage projection (S247). A confirmed Send that Gmail
// accepted records the outreach; a scheduled message, an unconfirmed send, a failed delivery and
// an unsent Gmail draft each read as their own state and never count as outreach; an observed
// reply hands the move back to staff without choosing an outcome for them (S234).
//
// Only a message linked to this lease, this audience and the current renewal cycle counts
// (AC-S248-4): the communication's context names the lease and audience, and its notice scope
// names the cycle. A message with no cycle, or another cycle's, changes nothing here.
//
// Evidence fills what staff have not recorded. When staff recorded something different after the
// evidence time, neither wins: the step keeps the staff record and the lease reads "Needs a check"
// with both facts (refines S232 R-S232-4). Nothing here reads a provider, records anything,
// schedules anything or derives a reminder (R-S248-12). Pure and client-safe.

import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import { businessDateIso } from "@/lib/lease-renewal/business-calendar";
import type {
  ManualActivity,
  RenewalWorkspaceState,
  StaffActivityRecord,
} from "@/lib/lease-renewal/workspace-state";

export const OUTREACH_AUDIENCES = ["owner", "tenant"] as const;
export type OutreachAudience = (typeof OUTREACH_AUDIENCES)[number];

/** The staff activity each audience's accepted renewal message records. */
export const OUTREACH_ACTIVITY = {
  owner: "owner_outreach",
  tenant: "tenant_offer",
} as const satisfies Record<OutreachAudience, ManualActivity>;
export type OutreachActivity = (typeof OUTREACH_ACTIVITY)[OutreachAudience];

/** The words a derived fact reads in; distinct from "recorded by staff" and from "verified". */
export const DERIVED_OUTREACH_ORIGIN_LABEL = "From the app's confirmed send";

/** The renewal message states the stage projection reads, with no message content. */
export interface LinkedRenewalMessageEvidence {
  readonly sequenceId: string;
  readonly audience: OutreachAudience;
  /** The renewal cycle the message's notice scope named when it was reviewed; null when none. */
  readonly cycleId: string | null;
  readonly createdAtMs: number;
  /** When a scheduled first message is due; null when it is not scheduled or was accepted. */
  readonly scheduledForMs: number | null;
  /** True while an admitted attempt's outcome is not confirmed (S189 reconcile pending). */
  readonly unconfirmed: boolean;
  /** Attempts Gmail accepted, oldest first. Accepted is never proof of delivery or reading. */
  readonly accepted: readonly {
    readonly occurrenceId: string;
    readonly sentAtMs: number;
    readonly senderEmail: string;
  }[];
  /** Replies people sent on this message's linked threads (S191, S233 "human"). */
  readonly replies: readonly { readonly id: string; readonly receivedAtMs: number }[];
  /** Delivery reports correlated to one of this message's attempts (S233 R-S233-2). */
  readonly failedDeliveries: readonly {
    readonly id: string;
    readonly receivedAtMs: number;
    readonly occurrenceId: string;
  }[];
}

/** An unsent Gmail draft prepared for this lease, audience and cycle (S162 draft head). */
export interface GmailDraftEvidence {
  readonly audience: OutreachAudience;
  readonly cycleId: string;
  readonly createdAtMs: number;
}

/** The outreach record a confirmed Send wrote, and its staff correction when one was made. */
export interface StoredOutreachRecord {
  readonly occurrenceId: string;
  readonly sequenceId: string;
  readonly leaseId: string;
  readonly cycleId: string;
  readonly audience: OutreachAudience;
  readonly sentAtMs: number;
  readonly senderEmail: string;
  readonly correction: {
    readonly reason: string;
    readonly byUid: string;
    readonly atMs: number;
  } | null;
}

/** Everything the app holds for one lease, read once per render. Serializable. */
export interface LeaseOutreachEvidenceInput {
  /** False when the lease's linked messages could not be read; nothing is derived then. */
  readonly readable: boolean;
  readonly messages: readonly LinkedRenewalMessageEvidence[];
  readonly records: readonly StoredOutreachRecord[];
  readonly drafts: readonly GmailDraftEvidence[];
}

export const EMPTY_OUTREACH_EVIDENCE_INPUT: LeaseOutreachEvidenceInput = Object.freeze({
  readable: true,
  messages: [],
  records: [],
  drafts: [],
});

export const UNREADABLE_OUTREACH_EVIDENCE_INPUT: LeaseOutreachEvidenceInput = Object.freeze(
  { readable: false, messages: [], records: [], drafts: [] },
);

export type AudienceEvidenceState =
  | "none"
  | "draft"
  | "scheduled"
  | "unconfirmed"
  | "delivery_failed"
  | "accepted"
  | "replied";

/**
 * R-S248-10: an outreach fact the app derived from its own confirmed send. `stored` is false when
 * the record write after the send did not land and this read rebuilt it from the delivery
 * evidence (ARCH-S248-2); the fact is the same either way.
 */
export interface DerivedOutreachRecord {
  readonly origin: "app_send";
  readonly audience: OutreachAudience;
  readonly activity: OutreachActivity;
  readonly sequenceId: string;
  readonly occurrenceId: string;
  readonly sentAtMs: number;
  readonly senderEmail: string;
  readonly stored: boolean;
}

export interface AudienceOutreachEvidence {
  readonly audience: OutreachAudience;
  readonly state: AudienceEvidenceState;
  /** The earliest accepted, uncorrected message without a failed delivery. */
  readonly derived: DerivedOutreachRecord | null;
  /** The latest accepted attempt among the counted messages; the last contact the app sent. */
  readonly lastSentAtMs: number | null;
  /** The latest reply on a counted message after its send. */
  readonly replyAtMs: number | null;
  readonly replyId: string | null;
  readonly replySequenceId: string | null;
  readonly failedAtMs: number | null;
  readonly scheduledForMs: number | null;
  readonly draftSinceMs: number | null;
  /** The communication whose admitted send needs the existing reconcile action. */
  readonly unconfirmedSequenceId: string | null;
  /** Derived records staff removed with "This was not the renewal outreach"; history only. */
  readonly corrected: readonly {
    readonly occurrenceId: string;
    readonly sentAtMs: number;
    readonly reason: string;
    readonly atMs: number;
  }[];
}

export interface OutreachEvidence {
  readonly readable: boolean;
  readonly cycleId: string | null;
  readonly owner: AudienceOutreachEvidence;
  readonly tenant: AudienceOutreachEvidence;
}

function emptyAudience(audience: OutreachAudience): AudienceOutreachEvidence {
  return {
    audience,
    state: "none",
    derived: null,
    lastSentAtMs: null,
    replyAtMs: null,
    replyId: null,
    replySequenceId: null,
    failedAtMs: null,
    scheduledForMs: null,
    draftSinceMs: null,
    unconfirmedSequenceId: null,
    corrected: [],
  };
}

export function emptyOutreachEvidence(
  cycleId: string | null,
  readable = true,
): OutreachEvidence {
  return {
    readable,
    cycleId,
    owner: emptyAudience("owner"),
    tenant: emptyAudience("tenant"),
  };
}

const latest = (values: readonly number[]): number | null =>
  values.length ? Math.max(...values) : null;

function projectAudience(
  input: LeaseOutreachEvidenceInput,
  audience: OutreachAudience,
  cycleId: string,
): AudienceOutreachEvidence {
  const records = new Map(
    input.records
      .filter((record) => record.audience === audience && record.cycleId === cycleId)
      .map((record) => [record.occurrenceId, record] as const),
  );
  // AC-S248-4: only this audience's messages bound to the current cycle count.
  const messages = input.messages
    .filter((message) => message.audience === audience && message.cycleId === cycleId)
    .slice()
    .sort(
      (left, right) =>
        left.createdAtMs - right.createdAtMs ||
        left.sequenceId.localeCompare(right.sequenceId),
    );
  const corrected: AudienceOutreachEvidence["corrected"][number][] = [];
  const counted: {
    message: LinkedRenewalMessageEvidence;
    first: LinkedRenewalMessageEvidence["accepted"][number];
  }[] = [];
  const failed: { message: LinkedRenewalMessageEvidence; atMs: number }[] = [];
  for (const message of messages) {
    const first = message.accepted[0];
    if (!first) continue;
    const correction = records.get(first.occurrenceId)?.correction ?? null;
    if (correction) {
      corrected.push({
        occurrenceId: first.occurrenceId,
        sentAtMs: first.sentAtMs,
        reason: correction.reason,
        atMs: correction.atMs,
      });
      continue;
    }
    const attempts = new Set(message.accepted.map((attempt) => attempt.occurrenceId));
    const failures = message.failedDeliveries.filter((entry) =>
      attempts.has(entry.occurrenceId),
    );
    if (failures.length) {
      failed.push({
        message,
        atMs: Math.max(...failures.map((entry) => entry.receivedAtMs)),
      });
      continue;
    }
    counted.push({ message, first });
  }
  counted.sort(
    (left, right) =>
      left.first.sentAtMs - right.first.sentAtMs ||
      left.first.occurrenceId.localeCompare(right.first.occurrenceId),
  );
  const head = counted[0];
  const derived: DerivedOutreachRecord | null = head
    ? {
        origin: "app_send",
        audience,
        activity: OUTREACH_ACTIVITY[audience],
        sequenceId: head.message.sequenceId,
        occurrenceId: head.first.occurrenceId,
        sentAtMs: head.first.sentAtMs,
        senderEmail: head.first.senderEmail,
        stored: records.has(head.first.occurrenceId),
      }
    : null;
  const lastSentAtMs = latest(
    counted.flatMap(({ message }) => message.accepted.map((attempt) => attempt.sentAtMs)),
  );
  const replies = derived
    ? counted.flatMap(({ message, first }) =>
        message.replies
          .filter((reply) => reply.receivedAtMs >= first.sentAtMs)
          .map((reply) => ({ ...reply, sequenceId: message.sequenceId })),
      )
    : [];
  const reply = replies.sort(
    (left, right) => right.receivedAtMs - left.receivedAtMs || left.id.localeCompare(right.id),
  )[0];
  const failedAtMs = latest(failed.map((entry) => entry.atMs));
  const pending = messages.filter((message) => message.accepted.length === 0);
  const unconfirmed = pending.filter((message) => message.unconfirmed).at(-1) ?? null;
  const scheduled = pending
    .filter((message) => !message.unconfirmed && message.scheduledForMs !== null)
    .sort((left, right) => left.scheduledForMs! - right.scheduledForMs!)[0];
  const draftSinceMs = latest(
    input.drafts
      .filter((draft) => draft.audience === audience && draft.cycleId === cycleId)
      .map((draft) => draft.createdAtMs),
  );
  // Precedence: an accepted message is the outreach; otherwise the newest open fact reads.
  let state: AudienceEvidenceState;
  if (derived) state = reply ? "replied" : "accepted";
  else {
    const candidates: { state: AudienceEvidenceState; atMs: number }[] = [];
    if (failedAtMs !== null)
      candidates.push({ state: "delivery_failed", atMs: failedAtMs });
    if (unconfirmed) candidates.push({ state: "unconfirmed", atMs: unconfirmed.createdAtMs });
    if (scheduled) candidates.push({ state: "scheduled", atMs: scheduled.createdAtMs });
    if (draftSinceMs !== null) candidates.push({ state: "draft", atMs: draftSinceMs });
    state = candidates.sort((left, right) => right.atMs - left.atMs)[0]?.state ?? "none";
  }
  return {
    audience,
    state,
    derived,
    lastSentAtMs,
    replyAtMs: reply?.receivedAtMs ?? null,
    replyId: reply?.id ?? null,
    replySequenceId: reply?.sequenceId ?? null,
    failedAtMs,
    scheduledForMs: scheduled?.scheduledForMs ?? null,
    draftSinceMs,
    unconfirmedSequenceId: unconfirmed?.sequenceId ?? null,
    corrected,
  };
}

/** ARCH-S248-1: the lease cycle's evidence for both audiences. Pure. */
export function projectOutreachEvidence(
  input: LeaseOutreachEvidenceInput | null | undefined,
  cycleId: string | null,
): OutreachEvidence {
  if (!input || !input.readable) return emptyOutreachEvidence(cycleId, false);
  if (cycleId === null) return emptyOutreachEvidence(null, true);
  return {
    readable: true,
    cycleId,
    owner: projectAudience(input, "owner", cycleId),
    tenant: projectAudience(input, "tenant", cycleId),
  };
}

/**
 * What the evidence fills on the staff lane for one cycle, after the staff record is read
 * against it (R-S248-8, R-S248-9). Serializable.
 */
export interface OutreachFill {
  readonly owner_outreach: DerivedOutreachRecord | null;
  readonly tenant_offer: DerivedOutreachRecord | null;
  /** A reply after the latest staff answer: the team has the move ("Record the owner's decision"). */
  readonly ownerReplyAtMs: number | null;
  readonly tenantReplyAtMs: number | null;
  /** Staff recorded something different after the evidence time: both facts, neither wins. */
  readonly checks: readonly OutreachCheck[];
  /** A staff record and the derived evidence agree: one fact, shown once. */
  readonly agreeing: readonly OutreachActivity[];
}

export interface OutreachCheck {
  readonly activity: OutreachActivity;
  readonly audience: OutreachAudience;
  /** The staff record's fact, in words. */
  readonly staffRecord: string;
  /** The app's evidence, in words. */
  readonly appEvidence: string;
}

export const EMPTY_OUTREACH_FILL: OutreachFill = Object.freeze({
  owner_outreach: null,
  tenant_offer: null,
  ownerReplyAtMs: null,
  tenantReplyAtMs: null,
  checks: [],
  agreeing: [],
});

const STAFF_OUTCOME_WORDS: Record<StaffActivityRecord["outcome"], string> = {
  not_started: "not started",
  waiting: "waiting",
  done: "done",
  not_applicable: "not applicable",
};

const ACTIVITY_WORDS: Record<OutreachActivity, string> = {
  owner_outreach: "Owner outreach",
  tenant_offer: "Tenant offer delivered",
};

const at = (ms: number) => formatBusinessTimestamp(new Date(ms).toISOString());

function staffActivityFor(
  state: RenewalWorkspaceState,
  activity: OutreachActivity,
): StaffActivityRecord | null {
  const record = state.activities[activity];
  if (!record) return null;
  // The tenant offer answers the current terms; a record from earlier terms is not current.
  if (activity === "tenant_offer" && record.termsRevision !== state.termsRevision)
    return null;
  return record;
}

/** True when this tenant message was sent under the current terms (S113 terms dependency). */
function sentUnderCurrentTerms(
  state: RenewalWorkspaceState,
  derived: DerivedOutreachRecord,
): boolean {
  const termsSetAt = state.ownerResponse?.recordedAt;
  if (!termsSetAt) return true;
  const termsMs = Date.parse(termsSetAt);
  return !Number.isFinite(termsMs) || derived.sentAtMs >= termsMs;
}

/**
 * R-S248-8/R-S248-9: read the staff record against the evidence. Evidence applies when staff
 * have recorded nothing for that step, or recorded something before the evidence time; a matching
 * record is one fact; a different record made after the evidence time is a check with both facts.
 */
export function outreachFill(
  state: RenewalWorkspaceState | null | undefined,
  evidence: OutreachEvidence | null | undefined,
): OutreachFill {
  if (!state || !evidence?.readable || evidence.cycleId !== state.cycleId)
    return EMPTY_OUTREACH_FILL;
  const checks: OutreachCheck[] = [];
  const agreeing: OutreachActivity[] = [];
  const fill = (audience: OutreachAudience): DerivedOutreachRecord | null => {
    const derived = evidence[audience].derived;
    if (!derived) return null;
    const activity = OUTREACH_ACTIVITY[audience];
    if (activity === "tenant_offer" && !sentUnderCurrentTerms(state, derived)) return null;
    const staff = staffActivityFor(state, activity);
    if (!staff) return derived;
    if (staff.outcome === "done") {
      agreeing.push(activity);
      return null;
    }
    const recordedMs = Date.parse(staff.recordedAt);
    if (Number.isFinite(recordedMs) && recordedMs > derived.sentAtMs) {
      checks.push({
        activity,
        audience,
        staffRecord: `says ${ACTIVITY_WORDS[activity]} is ${STAFF_OUTCOME_WORDS[staff.outcome]} (saved ${at(recordedMs)})`,
        appEvidence: `show the ${audience} message accepted by Gmail ${at(derived.sentAtMs)}`,
      });
      return null;
    }
    return derived;
  };
  const ownerFill = fill("owner");
  const tenantFill = fill("tenant");
  const ownerReplyAtMs = (() => {
    const reply = evidence.owner.replyAtMs;
    if (reply === null) return null;
    const answer = state.ownerResponse;
    if (!answer) return reply;
    if (answer.outcome !== "no_response") return null;
    const recordedMs = Date.parse(answer.recordedAt);
    return Number.isFinite(recordedMs) && recordedMs >= reply ? null : reply;
  })();
  const tenantReplyAtMs = (() => {
    const reply = evidence.tenant.replyAtMs;
    if (reply === null) return null;
    const answer =
      state.tenantResponse && state.tenantResponse.termsRevision === state.termsRevision
        ? state.tenantResponse
        : null;
    if (!answer) return reply;
    if (answer.outcome !== "awaiting_response") return null;
    const recordedMs = Date.parse(answer.recordedAt);
    return Number.isFinite(recordedMs) && recordedMs >= reply ? null : reply;
  })();
  return {
    owner_outreach: ownerFill,
    tenant_offer: tenantFill,
    ownerReplyAtMs,
    tenantReplyAtMs,
    checks,
    agreeing,
  };
}

/** The evidence sentence for one audience, in the exact words the lease page and desk read. */
export function audienceEvidenceSentence(
  evidence: AudienceOutreachEvidence,
): string | null {
  const who = evidence.audience === "owner" ? "Owner" : "Tenant";
  switch (evidence.state) {
    case "none":
      return null;
    case "draft":
      return evidence.draftSinceMs === null
        ? null
        : `Draft waiting in Gmail since ${at(evidence.draftSinceMs)}`;
    case "scheduled":
      return evidence.scheduledForMs === null
        ? null
        : `${who} message scheduled for ${at(evidence.scheduledForMs)}`;
    case "unconfirmed":
      return "The send was not confirmed";
    case "delivery_failed":
      return "Delivery failed";
    case "accepted":
      return evidence.derived
        ? `${who} message accepted by Gmail ${at(evidence.derived.sentAtMs)}`
        : null;
    case "replied":
      return evidence.replyAtMs === null
        ? null
        : `${who} replied ${outreachDate(evidence.replyAtMs)}`;
  }
}

/** A calendar day on the business calendar, as the desk writes dates. */
export function outreachDate(ms: number): string {
  return formatCalendarDate(businessDateIso(ms));
}

/**
 * R-S248-10: where a derived fact came from and when, in words distinct from "recorded by staff"
 * and from provider-verified completion.
 */
export function derivedOutreachAttribution(record: DerivedOutreachRecord): string {
  return `${DERIVED_OUTREACH_ORIGIN_LABEL}: the ${record.audience} message Gmail accepted ${at(record.sentAtMs)}, sent by ${record.senderEmail}.`;
}
