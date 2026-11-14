// S273: a held or out-of-date renewal message on the lease, and its one update.
//
// Pure and client-safe. It owns:
// - the evidence one stored communication gives about its unsent authorized work: scheduled, held
//   (paused before any accepted send, with its cause and time) or unconfirmed (R-S273-1), with the
//   content basis S272 kept beside the authorization and the authorized wording's revision;
// - the out-of-date comparison (ARCH-S273-2): a pure function over that kept basis, the authorized
//   wording revision and the lease's current values. It runs on read and never writes; a lease read
//   that is not settled (S274) keeps the previous state;
// - the words the step and the desk row read (R-S273-3), the carried send time of the one update
//   (R-S273-4) and the read-only list of earlier attempts (R-S273-5).
// Nothing here sends, cancels, resumes, saves, claims or looks anything up.

import { formatBusinessTimestamp } from "@/lib/date-display";
import { SEQUENCE_PAUSE_CAUSE_LABELS } from "@/lib/gmail-hub/communication-state";
import { isCurrentMessageScope, keptContentBasis } from "@/lib/gmail-hub/current-message";
import {
  NEW_HOLD_KEY_PREFIX,
  NEW_HOLD_LABEL,
  OWNER_WORDING_UPDATED_INPUT,
  changedReviewedInputs,
  type ChangedInput,
  type ReviewedInput,
} from "@/lib/gmail-hub/reviewed-inputs";
import { resolveWallTime } from "@/lib/gmail-hub/schedule-calendar";
import {
  renderEditableCommunicationBody,
  type CommunicationSequence,
  type RichCommunicationMessage,
} from "@/lib/gmail-hub/sequence-model";
import { messageRevisionOf } from "@/lib/lease-renewal/message-revision";
import {
  OWNER_WORDING_UPDATED_LINE,
  isOwnerWordingChange,
} from "@/lib/lease-renewal/owner-copy-version";

type Audience = "owner" | "tenant";
export type UnsentPauseCause = NonNullable<CommunicationSequence["pause"]>["cause"];

/** R-S273-1: how a communication holds its unsent authorized work. */
export type UnsentWorkState = "scheduled" | "held" | "unconfirmed";

/**
 * R-S273-4: the first message's own wall time from the authorization, carried into an update when
 * it is still in the future. `atMs` is that instant (the stored due time while it is scheduled).
 */
export interface CarriedSendTime {
  readonly date: string;
  readonly time: string;
  readonly timeZone: string;
  readonly atMs: number | null;
}

/**
 * R-S273-1: one stored communication's unsent authorized work, from the sequence record alone. No
 * message body and no recipient address: the kept content values are the ones the review showed
 * (S272 R-S272-1 excludes recipients, the signature and the notice identity).
 */
export interface UnsentWorkEvidence {
  readonly state: UnsentWorkState;
  /** Scheduled: the stored due time; held: when it was held; unconfirmed: null. */
  readonly atMs: number | null;
  /** The zone the authorization was scheduled in; null for an immediate send. */
  readonly timeZone: string | null;
  /** Held: the pause cause; otherwise null. */
  readonly cause: UnsentPauseCause | null;
  /** Held by the communication worker (not by a staff member). */
  readonly heldByWorker: boolean;
  readonly authorizationRevision: number;
  readonly authorizedAtMs: number;
  readonly sendAt: CarriedSendTime | null;
  /** S272 R-S272-1: the content basis kept with this authorization; null on an older record. */
  readonly basis: {
    readonly digest: string;
    readonly values: readonly ReviewedInput[];
  } | null;
  /** Which digest of the lease's current read the kept one compares with (S272 R-S272-2). */
  readonly digestKind: "current" | "legacy";
  /** The authorized initial wording's revision (`message-revision.ts`). */
  readonly wordingRevision: string;
  /** S274 R-S274-6: the changed inputs stored with a hold on a settled difference. */
  readonly changedInputs: readonly ChangedInput[] | null;
  /** The communication's own wording was saved after this authorization (an edit, or an update). */
  readonly wordingSavedAfter: boolean;
}

/**
 * R-S273-2: the lease's current values, read on the lease and desk read for an audience that holds
 * unsent work: the content basis the renewal target reports (S272 R-S272-1), the lease's own
 * message wording revision as the communication renders it, and when the lease's message record was
 * last saved. `settled` is false when the lease read did not settle (S274).
 */
export interface LeaseMessageBasis {
  readonly settled: boolean;
  readonly digest: string | null;
  readonly legacyDigest: string | null;
  readonly values: readonly ReviewedInput[];
  readonly wordingRevision: string | null;
  readonly wordingSavedAtMs: number | null;
}

/** R-S273-2: the current values for each audience that was read. */
export type LeaseMessageBases = Readonly<
  Partial<Record<Audience, LeaseMessageBasis | null>>
>;

export type OutOfDateVerdict =
  | { readonly kind: "current" }
  | {
      readonly kind: "out_of_date";
      /** Each changed content value with both values where the authorization kept them. */
      readonly changes: readonly ChangedInput[];
      /** The lease's own wording was saved after the authorization and differs from it. */
      readonly wording: boolean;
    }
  /** Not read, or read while the lease read had not settled. */
  | { readonly kind: "unknown" };

/** S273: the record of one earlier attempt, kept beside the communication (R-S273-5). */
export interface UnsentAttemptRecord {
  readonly state: UnsentWorkState;
  readonly atMs: number | null;
  readonly cause: UnsentPauseCause | null;
  readonly endedAtMs: number;
  readonly resolution: "updated" | "resumed" | "resolved";
  readonly authorizationRevision: number;
}

/** R-S273-5: one earlier attempt as the evidence carries it, including superseded holds. */
export interface EarlierAttemptEvidence {
  readonly state: UnsentWorkState | "cancelled";
  readonly atMs: number | null;
  readonly cause: UnsentPauseCause | null;
  readonly endedAtMs: number;
  readonly resolution: "updated" | "resumed" | "resolved" | "cancelled" | "superseded";
}

/** R-S273-5: one earlier attempt as the Verification list reads it. */
export interface EarlierAttemptView {
  readonly key: string;
  readonly sequenceId: string;
  readonly atMs: number;
  readonly line: string;
}

export const UNSENT_HISTORY_LIMIT = 20;

/** The exact staff words of this suite that do not depend on the audience. */
export const UNSENT_MESSAGE_WORDS = {
  /** R-S273-3: the desk row's one cue. */
  cueOutOfDate: "Scheduled message out of date",
  cueHeld: "Message held",
  /** R-S273-5: the list's heading inside the step's existing Verification disclosure. */
  earlierAttempts: "Earlier attempts",
  /** R-S273-2: the lease's own wording changed after the review. */
  wordingChanged:
    "The lease's message wording was edited after this message was reviewed.",
  /** R-S273-4: the review dialog's other choice when the carried time has passed. */
  sendNow: "Send now",
  scheduleInstead: "Schedule instead",
  /** R-S273-4: the review dialog's line while it starts with no carried time. */
  noCarriedTime:
    "The earlier send time has passed. Choose a new date and time, or send now.",
  carriedTime: "The date and time are carried from the earlier review.",
  /** R-S273-4: the update could not read the communication as it stands. */
  changedElsewhere:
    "This message changed since the lease was read. Reload the lease and review it again.",
  notResponsible:
    "Only the staff member who scheduled this message can update it. Open it in Communications to hand it over first.",
  checkSendFirst: "Check whether the message went out before updating it.",
  /** The cancel confirmation. */
  cancelDescription:
    "Nothing is sent. The communication keeps its history, and the lease shows the step's send action again.",
  cancelled: "Cancelled. Nothing was sent.",
} as const;

const NOUN: Record<Audience, string> = { tenant: "offer", owner: "owner message" };

/**
 * R-S273-3: the audience's words. The owner step says "owner message" where the tenant step says
 * "offer".
 */
export function unsentMessageWords(audience: Audience) {
  const noun = NOUN[audience];
  const lead = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
  return {
    outOfDate: `Scheduled ${noun} is out of date.`,
    heldChanged: (at: string | null) =>
      at
        ? `${lead} held on ${at} because the lease changed.`
        : `${lead} held because the lease changed.`,
    heldOther: (at: string | null, cause: string) =>
      at ? `${lead} held on ${at}: ${cause}.` : `${lead} held: ${cause}.`,
    review: `Review the updated ${noun}`,
    cancel: `Cancel the scheduled ${noun}`,
    cancelTitle: `Cancel the scheduled ${noun}?`,
    openCommunication: `Review this ${audience} communication`,
  } as const;
}

/**
 * R-S273-3: one changed value: "Renewal end date: 12/31/2027 in the scheduled message, 06/30/2027
 * on the lease." A value the authorization did not keep reads "{label} changed." S285 R-S285-6: a
 * held owner message whose only cause is the owner wording an approver published reads "The
 * owner message wording was updated." (the worker's hold and the approved template's change).
 */
export function unsentDifferenceLine(change: ChangedInput): string {
  if (change.key.startsWith(NEW_HOLD_KEY_PREFIX))
    return `${NEW_HOLD_LABEL}: ${(change.current ?? "").replace(/\.$/, "")}.`;
  if (change.key === OWNER_WORDING_UPDATED_INPUT.key || isOwnerWordingChange(change))
    return `${OWNER_WORDING_UPDATED_LINE}.`;
  const { previous, current } = change;
  if (previous === undefined || previous === current) return `${change.label} changed.`;
  return `${change.label}: ${previous ?? "not set"} in the scheduled message, ${current ?? "not set"} on the lease.`;
}

/** R-S273-2: the revision of a communication message, as its authorization renders it. */
export function communicationWordingRevision(
  message: Pick<RichCommunicationMessage, "subject" | "paragraphs" | "layout">,
): string {
  return messageRevisionOf({
    subject: message.subject,
    body: renderEditableCommunicationBody(message.paragraphs, message.layout).plainText,
  });
}

function dueInstant(schedule: {
  readonly firstDate: string;
  readonly time: string;
  readonly timeZone: string;
}): number | null {
  try {
    return resolveWallTime(schedule.firstDate, schedule.time, schedule.timeZone)
      .instantMs;
  } catch {
    return null;
  }
}

/**
 * R-S273-1 (ARCH-S273-1): the unsent authorized work one stored communication holds, or null.
 * Only an initial renewal message (owner or tenant, never a reply) with an authorization and no
 * accepted send: scheduled and unsent, held (paused, with its cause and time) or with an
 * unconfirmed send. A message paused before any accepted send no longer reads as nothing.
 */
export function unsentWorkEvidence(
  sequence: CommunicationSequence,
): UnsentWorkEvidence | null {
  const authorization = sequence.authorization;
  if (!authorization || !isCurrentMessageScope(sequence.context)) return null;
  if ((sequence.confirmedCount ?? 0) !== 0) return null;
  const state: UnsentWorkState | null =
    sequence.unresolvedOccurrenceId || sequence.state === "needs_reconciliation"
      ? "unconfirmed"
      : sequence.state === "paused"
        ? "held"
        : sequence.state === "active" &&
            authorization.schedule &&
            !authorization.immediateTenantOffer &&
            sequence.nextDueAtMs !== null
          ? "scheduled"
          : null;
  if (!state) return null;
  const plan =
    authorization.schedule && !authorization.immediateTenantOffer
      ? authorization.schedule
      : null;
  const kept = keptContentBasis(sequence);
  const changed = sequence.pause?.changedInputs;
  return {
    state,
    atMs:
      state === "scheduled"
        ? sequence.nextDueAtMs
        : state === "held"
          ? (sequence.pause?.atMs ?? null)
          : null,
    timeZone: plan?.timeZone ?? null,
    cause: state === "held" ? (sequence.pause?.cause ?? null) : null,
    heldByWorker: state === "held" && sequence.pause?.byUid === "communication-worker",
    authorizationRevision: authorization.revision,
    authorizedAtMs: authorization.approvedAtMs,
    sendAt: plan
      ? {
          date: plan.firstDate,
          time: plan.time,
          timeZone: plan.timeZone,
          atMs:
            state === "scheduled" && sequence.nextDueAtMs !== null
              ? sequence.nextDueAtMs
              : dueInstant(plan),
        }
      : null,
    basis: kept ? { digest: kept.digest, values: [...kept.values] } : null,
    // S272 R-S272-1 kept the digest contentDigestFor chose when it authorized: the legacy one only
    // for an outgoing-contract target with no signature setup, which authorization refuses
    // (SIGNATURE_SETUP_REQUIRED). A kept basis therefore compares with the current digest, with or
    // without a signature setup.
    digestKind: "current",
    wordingRevision: messageRevisionOf({
      subject: authorization.initial.subject,
      body: authorization.initial.plainText,
    }),
    changedInputs:
      state === "held" && Array.isArray(changed) && changed.length ? [...changed] : null,
    wordingSavedAfter: sequence.wordingSavedAfterRevision === authorization.revision,
  };
}

/**
 * ARCH-S273-2: whether the unsent message is out of date with the lease. Either the content basis
 * kept with its authorization differs from the lease's current content basis (each changed value
 * named where the authorization kept it), or the lease's own message wording was saved after the
 * authorization and its revision differs from the authorized wording's revision. Wording edited
 * on the communication itself is not a difference. An unsettled or missing read is "unknown".
 */
export function unsentOutOfDate(
  unsent: UnsentWorkEvidence,
  current: LeaseMessageBasis | null | undefined,
): OutOfDateVerdict {
  if (!current || !current.settled) return { kind: "unknown" };
  let basisChanged = false;
  let changes: ChangedInput[] = [];
  if (unsent.basis) {
    const digest = unsent.digestKind === "legacy" ? current.legacyDigest : current.digest;
    if (digest !== null && digest !== unsent.basis.digest) {
      basisChanged = true;
      changes = changedReviewedInputs(unsent.basis.values, current.values);
    }
  }
  const wording =
    current.wordingSavedAtMs !== null &&
    current.wordingSavedAtMs > unsent.authorizedAtMs &&
    current.wordingRevision !== null &&
    current.wordingRevision !== unsent.wordingRevision;
  return basisChanged || wording
    ? { kind: "out_of_date", changes, wording }
    : { kind: "current" };
}

/**
 * S274 / R-S273-2: a lease read that is not settled keeps the previous state, so the cue does not
 * flicker. For each audience whose new read did not settle, the previous settled read stands.
 */
export function keepSettledMessageBases(
  previous: LeaseMessageBases | null | undefined,
  next: LeaseMessageBases | null | undefined,
): LeaseMessageBases | undefined {
  if (!next) return previous ?? undefined;
  if (!previous) return next;
  const kept: Partial<Record<Audience, LeaseMessageBasis | null>> = { ...next };
  for (const audience of ["owner", "tenant"] as const) {
    const read = next[audience];
    const prior = previous[audience];
    if (read && !read.settled && prior?.settled) kept[audience] = prior;
  }
  return kept;
}

export type UnsentMessageKind =
  | "scheduled_current"
  | "scheduled_out_of_date"
  | "held_changed"
  | "held_other"
  | "unconfirmed";

export type UnsentMessageAction = "update" | "open_communication" | "cancel";

/**
 * R-S273-3: what the step and the desk row show for one audience's unsent work. Serializable; S280
 * lists the same held and out-of-date items on the Dashboard from it.
 */
export interface UnsentMessageView {
  readonly sequenceId: string;
  readonly audience: Audience;
  readonly state: UnsentWorkState;
  readonly kind: UnsentMessageKind;
  /** The one line ("Scheduled offer is out of date."); null where the existing line stays. */
  readonly line: string | null;
  /** Each difference, in the scheduled message's and the lease's values. */
  readonly differences: readonly string[];
  readonly primary: {
    readonly label: string;
    readonly action: Exclude<UnsentMessageAction, "cancel">;
  } | null;
  readonly secondary: { readonly label: string; readonly action: "cancel" } | null;
  /** The desk row's one cue, linking to the step; null when the row needs none. */
  readonly cue: { readonly kind: "out_of_date" | "held"; readonly label: string } | null;
  /** Scheduled: the stored due time; held: when it was held. */
  readonly atMs: number | null;
  readonly cause: UnsentPauseCause | null;
  readonly sendAt: CarriedSendTime | null;
  readonly authorizationRevision: number;
}

/** True when the step offers this suite's own repair or recovery (not the existing lines). */
export function unsentNeedsStaff(view: UnsentMessageView | null | undefined): boolean {
  return (
    view?.kind === "scheduled_out_of_date" ||
    view?.kind === "held_changed" ||
    view?.kind === "held_other"
  );
}

const at = (ms: number | null) => (ms === null ? null : formatBusinessTimestamp(ms));

function verdictLines(verdict: OutOfDateVerdict): string[] {
  if (verdict.kind !== "out_of_date") return [];
  return [
    ...verdict.changes.map(unsentDifferenceLine),
    ...(verdict.wording ? [UNSENT_MESSAGE_WORDS.wordingChanged] : []),
  ];
}

/**
 * R-S273-3: the step's state, values and actions for one audience's unsent work.
 * - Scheduled and out of date: the line, each difference, "Review the updated offer" and "Cancel
 *   the scheduled offer".
 * - Held for changed facts (the worker's hold for a changed lease, or a held message that is out
 *   of date, such as an update whose wording saved but whose authorization did not): "Offer held
 *   on {time} because the lease changed.", the same differences and the same two actions.
 * - Held for another cause: the existing cause label and its existing recovery, in Communications.
 * - Scheduled and current, and unconfirmed: the existing lines and actions stay (no line here).
 * An older authorization with no kept values shows the state without the values.
 */
export function projectUnsentMessage(
  message: { readonly sequenceId: string; readonly audience: Audience },
  unsent: UnsentWorkEvidence,
  current: LeaseMessageBasis | null | undefined,
): UnsentMessageView {
  const words = unsentMessageWords(message.audience);
  const verdict = unsentOutOfDate(unsent, current);
  const view = (
    kind: UnsentMessageKind,
    line: string | null,
    differences: readonly string[],
    primary: UnsentMessageView["primary"],
    secondary: UnsentMessageView["secondary"],
    cue: UnsentMessageView["cue"],
  ): UnsentMessageView => ({
    sequenceId: message.sequenceId,
    audience: message.audience,
    state: unsent.state,
    kind,
    line,
    differences,
    primary,
    secondary,
    cue,
    atMs: unsent.atMs,
    cause: unsent.cause,
    sendAt: unsent.sendAt,
    authorizationRevision: unsent.authorizationRevision,
  });
  const update = { label: words.review, action: "update" as const };
  const cancel = { label: words.cancel, action: "cancel" as const };
  if (unsent.state === "unconfirmed")
    return view("unconfirmed", null, [], null, null, null);
  if (unsent.state === "scheduled")
    return verdict.kind === "out_of_date"
      ? view(
          "scheduled_out_of_date",
          words.outOfDate,
          verdictLines(verdict),
          update,
          cancel,
          { kind: "out_of_date", label: UNSENT_MESSAGE_WORDS.cueOutOfDate },
        )
      : view("scheduled_current", null, [], null, null, null);
  if (unsent.cause === "changed_source" || verdict.kind === "out_of_date") {
    const differences =
      verdict.kind === "out_of_date"
        ? verdictLines(verdict)
        : (unsent.changedInputs ?? []).map(unsentDifferenceLine);
    return view(
      "held_changed",
      words.heldChanged(at(unsent.atMs)),
      differences,
      update,
      cancel,
      { kind: "held", label: UNSENT_MESSAGE_WORDS.cueHeld },
    );
  }
  const cause =
    (unsent.cause && SEQUENCE_PAUSE_CAUSE_LABELS[unsent.cause]) || "Needs review";
  return view(
    "held_other",
    words.heldOther(at(unsent.atMs), cause),
    [],
    { label: words.openCommunication, action: "open_communication" },
    null,
    { kind: "held", label: UNSENT_MESSAGE_WORDS.cueHeld },
  );
}

/** R-S273-3: the step's one detail sentence: the line, then each difference. */
export function unsentMessageDetail(view: UnsentMessageView): string | null {
  return view.line ? [view.line, ...view.differences].join(" ") : null;
}

/**
 * R-S273-4: the date and time an update starts with: the earlier authorization's own date and
 * time while that instant is still in the future; otherwise null (the fields start empty and Send
 * now is offered).
 */
export function carriedSendTime(
  view: Pick<UnsentMessageView, "sendAt"> | null | undefined,
  nowMs: number,
): { readonly date: string; readonly time: string } | null {
  const sendAt = view?.sendAt;
  if (!sendAt || sendAt.atMs === null || !(sendAt.atMs > nowMs)) return null;
  return { date: sendAt.date, time: sendAt.time };
}

/**
 * R-S273-4: why the communication as it stands now cannot take the update, or null. The update
 * reads it fresh before its one confirmation; it must still be this lease's unsent message for the
 * same audience, with the reviewing staff member as its responsible sender.
 */
export function unsentUpdateRefusal(
  sequence: Pick<
    CommunicationSequence,
    | "id"
    | "context"
    | "state"
    | "confirmedCount"
    | "authorization"
    | "unresolvedOccurrenceId"
    | "senderEmail"
  >,
  expected: {
    readonly sequenceId: string;
    readonly leaseId: string;
    readonly audience: Audience;
    readonly senderEmail: string;
  },
): string | null {
  if (
    sequence.id !== expected.sequenceId ||
    sequence.context.entityId !== expected.leaseId ||
    sequence.context.purpose !==
      (expected.audience === "owner" ? "renewal_owner" : "renewal_tenant") ||
    sequence.context.replyTo
  )
    return UNSENT_MESSAGE_WORDS.changedElsewhere;
  if (sequence.unresolvedOccurrenceId || sequence.state === "needs_reconciliation")
    return UNSENT_MESSAGE_WORDS.checkSendFirst;
  if (
    !sequence.authorization ||
    sequence.confirmedCount !== 0 ||
    sequence.state === "completed" ||
    sequence.state === "cancelled" ||
    sequence.state === "draft"
  )
    return UNSENT_MESSAGE_WORDS.changedElsewhere;
  if (sequence.senderEmail.toLowerCase() !== expected.senderEmail.toLowerCase())
    return UNSENT_MESSAGE_WORDS.notResponsible;
  return null;
}

/** R-S273-7: the stored time a Schedule confirmation shows: "Scheduled for 11/13/2026, 9:00 AM CST." */
export function scheduledStoredLine(nextDueAtMs: number | null | undefined): string {
  return typeof nextDueAtMs === "number" && Number.isFinite(nextDueAtMs)
    ? `Scheduled for ${formatBusinessTimestamp(nextDueAtMs)}. It counts as sent once Gmail accepts it.`
    : "Scheduled. It counts as sent once Gmail accepts it.";
}

// R-S273-5: the trail of earlier attempts, kept beside the communication (never in its payload).

/**
 * A wording save on a communication with unsent authorized work (an update from the lease, or an
 * edit in Communications) ends that attempt: scheduled or held, then updated. A second save after
 * the same authorization adds nothing; the attempt is already listed.
 */
export function unsentAttemptOnSave(
  current: CommunicationSequence | null | undefined,
  nowMs: number,
): UnsentAttemptRecord | null {
  const authorization = current?.authorization;
  if (!current || !authorization || !isCurrentMessageScope(current.context)) return null;
  if (current.confirmedCount !== 0 || current.unresolvedOccurrenceId) return null;
  if (current.state !== "active" && current.state !== "paused") return null;
  if (current.wordingSavedAfterRevision === authorization.revision) return null;
  const scheduled = current.state === "active";
  return {
    state: scheduled ? "scheduled" : "held",
    atMs: scheduled ? current.nextDueAtMs : (current.pause?.atMs ?? null),
    cause: scheduled ? null : (current.pause?.cause ?? null),
    endedAtMs: nowMs,
    resolution: "updated",
    authorizationRevision: authorization.revision,
  };
}

/** A Resume of a held message with no wording save since its authorization: held, then resumed. */
export function unsentAttemptOnResume(
  current: CommunicationSequence | null | undefined,
  nowMs: number,
): UnsentAttemptRecord | null {
  const authorization = current?.authorization;
  if (!current || !authorization || !isCurrentMessageScope(current.context)) return null;
  if (current.state !== "paused" || current.confirmedCount !== 0) return null;
  if (current.wordingSavedAfterRevision === authorization.revision) return null;
  return {
    state: "held",
    atMs: current.pause?.atMs ?? null,
    cause: current.pause?.cause ?? null,
    endedAtMs: nowMs,
    resolution: "resumed",
    authorizationRevision: authorization.revision,
  };
}

/**
 * A first message whose send was not confirmed (an ambiguous attempt, or one held for
 * reconciliation) and that a later readback settled: unconfirmed, then resolved.
 */
export function unsentAttemptOnSettle(
  sequence: CommunicationSequence,
  occurrence: {
    readonly index: number;
    readonly state: string;
    readonly claimedAtMs: number;
  },
  nowMs: number,
): UnsentAttemptRecord | null {
  const authorization = sequence.authorization;
  if (!authorization || !isCurrentMessageScope(sequence.context)) return null;
  if (occurrence.index !== 0 || sequence.confirmedCount !== 0) return null;
  if (occurrence.state !== "ambiguous" && sequence.state !== "needs_reconciliation")
    return null;
  return {
    state: "unconfirmed",
    atMs: Number.isFinite(occurrence.claimedAtMs) ? occurrence.claimedAtMs : null,
    cause: "send_unconfirmed",
    endedAtMs: nowMs,
    resolution: "resolved",
    authorizationRevision: authorization.revision,
  };
}

export function appendUnsentHistory(
  history: readonly UnsentAttemptRecord[] | null | undefined,
  entry: UnsentAttemptRecord,
): UnsentAttemptRecord[] {
  return [...(Array.isArray(history) ? history : []), entry].slice(-UNSENT_HISTORY_LIMIT);
}

/**
 * R-S273-5: a communication's earlier attempts, read only: its kept trail and, for an initial
 * message cancelled before any accepted send, the cancellation.
 */
export function earlierAttemptsOf(
  sequence: CommunicationSequence,
): EarlierAttemptEvidence[] {
  if (!isCurrentMessageScope(sequence.context)) return [];
  const trail = (Array.isArray(sequence.unsentHistory) ? sequence.unsentHistory : [])
    .filter(
      (entry) =>
        entry &&
        typeof entry.endedAtMs === "number" &&
        ["scheduled", "held", "unconfirmed"].includes(entry.state),
    )
    .map(
      (entry): EarlierAttemptEvidence => ({
        state: entry.state,
        atMs: typeof entry.atMs === "number" ? entry.atMs : null,
        cause: entry.cause ?? null,
        endedAtMs: entry.endedAtMs,
        resolution: entry.resolution,
      }),
    );
  const cancelled =
    sequence.state === "cancelled" &&
    sequence.authorization &&
    (sequence.confirmedCount ?? 0) === 0
      ? [
          {
            state: "cancelled" as const,
            atMs: null,
            cause: null,
            endedAtMs: sequence.pause?.atMs ?? sequence.updatedAtMs,
            resolution: "cancelled" as const,
          },
        ]
      : [];
  return [...trail, ...cancelled];
}

const RESOLUTION_WORDS: Record<
  Exclude<EarlierAttemptEvidence["resolution"], "cancelled" | "superseded">,
  string
> = {
  updated: "then updated",
  resumed: "then resumed",
  resolved: "then resolved",
};

/** R-S273-5: one earlier attempt in words, with its date and time, state and cause. */
export function earlierAttemptLine(attempt: EarlierAttemptEvidence): string {
  const ended = formatBusinessTimestamp(attempt.endedAtMs);
  if (attempt.resolution === "cancelled")
    return `Cancelled on ${ended} before it was sent.`;
  if (attempt.resolution === "superseded")
    return `Held on ${ended}: ${SEQUENCE_PAUSE_CAUSE_LABELS.newer_message_sent}.`;
  const when = at(attempt.atMs);
  const cause = attempt.cause ? SEQUENCE_PAUSE_CAUSE_LABELS[attempt.cause] : null;
  const opening =
    attempt.state === "scheduled"
      ? when
        ? `Scheduled for ${when}`
        : "Scheduled"
      : attempt.state === "held"
        ? when
          ? `Held on ${when}`
          : "Held"
        : when
          ? `Not confirmed from ${when}`
          : "Not confirmed";
  return `${opening}${cause ? ` (${cause})` : ""}, ${RESOLUTION_WORDS[attempt.resolution]} on ${ended}.`;
}

/** R-S273-5: the cycle's earlier attempts for one audience, oldest first. */
export function earlierAttemptViews(
  messages: readonly {
    readonly sequenceId: string;
    readonly attempts?: readonly EarlierAttemptEvidence[];
  }[],
): EarlierAttemptView[] {
  return messages
    .flatMap((message) =>
      (message.attempts ?? []).map((attempt, index) => ({
        key: `${message.sequenceId}:${index}`,
        sequenceId: message.sequenceId,
        atMs: attempt.endedAtMs,
        line: earlierAttemptLine(attempt),
      })),
    )
    .sort((left, right) => left.atMs - right.atMs || left.key.localeCompare(right.key));
}
