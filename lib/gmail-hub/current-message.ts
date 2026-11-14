// S272: one current renewal message per lease, cycle and audience. A tenant or an owner receives a
// renewal message only with wording that matches the lease facts it was authorized on, and an
// older message can never go out after a newer one.
//
// This module is pure and client-safe. It owns:
// - the content basis a target reads and the one kept beside each authorization (R-S272-1);
// - the three rules every Resume, Send and Schedule, every new initial message and every worker
//   claim applies (R-S272-2 wording that predates a content change, R-S272-3 one unsent initial
//   message, R-S272-4 an older authorization after a newer send), over stored sequence state;
// - the one typed refusal reason the sequences route returns (R-S272-6). Its staff text derives
//   from that reason in one place, `describeSequenceRefusal` in `communication-state.ts`.
// Later suites (S273) consume the stored values and the typed reasons.

import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import { sequenceRefusalMessage } from "./communication-state";
import {
  NEW_HOLD_KEY_PREFIX,
  OWNER_WORDING_UPDATED_INPUT,
  changedReviewedInputs,
  type ChangedInput,
  type ReviewedInput,
} from "./reviewed-inputs";

/**
 * R-S272-1: the reviewed inputs that are not part of the content basis. Recipients, the sender
 * signature, the notice identity, the retirement status and the holds stay in the material source
 * digest; everything else a renewal review displays feeds the wording.
 */
export const CONTENT_BASIS_EXCLUDED_KEYS: ReadonlySet<string> = new Set([
  "to",
  "cc",
  "signature",
  "notice",
  "retirement",
]);

/** R-S272-1: the labelled values behind the content basis, in the review's order. */
export function contentBasisInputs(
  inputs: readonly ReviewedInput[] | null | undefined,
): ReviewedInput[] {
  return (inputs ?? []).filter(
    (input) =>
      !CONTENT_BASIS_EXCLUDED_KEYS.has(input.key) &&
      !input.key.startsWith(NEW_HOLD_KEY_PREFIX),
  );
}

/**
 * R-S272-1: the content basis one target reads: the digest of the part of the material source that
 * feeds the wording (the address and approved template; for a tenant offer the verified lease end,
 * working rent, start and end, applicable charges, insurance transition and offer snapshot; for an
 * owner message the owner intent, current rent, rent to recommend and range), the same part of the
 * legacy material source, and the labelled values behind it. A linked reply has none.
 */
export interface TargetContentBasis {
  readonly digest: string;
  readonly legacyDigest: string;
  readonly values: readonly ReviewedInput[];
}

/**
 * R-S272-1: the content basis kept beside one authorization, keyed by its revision (like the notice
 * cycle and the authorizing operation, so the payload and replay binding do not change), with the
 * wording it authorized. An app-owned record with no provider effect; absent on older records.
 */
export interface AuthorizedContentBasis {
  revision: number;
  digest: string;
  values: ReviewedInput[];
  /** The initial and follow-up wording as authorized (the reviewed draft hash). */
  draftHash: string;
}

/** R-S272-6: the three typed refusal reasons. */
export const SEQUENCE_REFUSAL_REASONS = [
  "wording_predates_change",
  "unsent_message_exists",
  "newer_message_sent",
] as const;
export type SequenceRefusalReason = (typeof SEQUENCE_REFUSAL_REASONS)[number];

export type CurrentMessageAudience = "tenant" | "owner";

/** R-S272-3: how another communication holds unsent authorized work. */
export type UnsentMessageState = "scheduled" | "awaiting_send" | "paused" | "unconfirmed";

/** R-S272-6: one typed refusal, with the related communication and the changed values. */
export interface SequenceRefusal {
  readonly reason: SequenceRefusalReason;
  readonly audience: CurrentMessageAudience;
  /**
   * The related communication: the one refused (wording), the unsent one that holds the renewal
   * (its id for the link) or the newer one that was sent.
   */
  readonly relatedSequenceId?: string;
  /** unsent_message_exists: how that communication holds its unsent work. */
  readonly relatedState?: UnsentMessageState;
  /**
   * unsent_message_exists: its scheduled or paused time; newer_message_sent: the confirmed send
   * time. Null when not known.
   */
  readonly relatedAtMs?: number | null;
  /** The zone that time is shown in; the business zone when none was reviewed. */
  readonly timeZone?: string | null;
  /** wording_predates_change: each changed content value; empty when no values were kept. */
  readonly changes?: readonly ChangedInput[];
}

export const SEQUENCE_REFUSED_CODE = "sequence_refused";

/** R-S272-6: a Resume, Send or Schedule refused by one of the three rules. Nothing was written. */
export class CommunicationSequenceRefusedError extends EditableLayerError {
  readonly code = SEQUENCE_REFUSED_CODE;
  readonly refusal: SequenceRefusal;
  constructor(refusal: SequenceRefusal) {
    super(sequenceRefusalMessage(refusal), 409);
    this.name = "CommunicationSequenceRefusedError";
    this.refusal = refusal;
  }
}

interface ContextView {
  readonly lane?: unknown;
  readonly entityType?: unknown;
  readonly entityId?: unknown;
  readonly purpose?: unknown;
  readonly replyTo?: unknown;
}

/** The rules apply to an initial renewal message line (owner or tenant), never to a reply. */
export function isCurrentMessageScope(context: ContextView | null | undefined): boolean {
  return (
    !!context &&
    context.lane === "renewals" &&
    context.entityType === "renewal_lease" &&
    (context.purpose === "renewal_owner" || context.purpose === "renewal_tenant") &&
    !context.replyTo
  );
}

export function audienceOf(context: ContextView): CurrentMessageAudience {
  return context.purpose === "renewal_owner" ? "owner" : "tenant";
}

function sameLine(left: ContextView, right: ContextView | null | undefined): boolean {
  return (
    isCurrentMessageScope(left) &&
    isCurrentMessageScope(right) &&
    left.entityId === right!.entityId &&
    left.purpose === right!.purpose
  );
}

/**
 * A stored sequence as the rules read it, from the sequence record itself or from raw stored data
 * (older records may lack any member). `CommunicationSequence` satisfies it.
 */
export interface RelatedSequenceView {
  readonly id: string;
  readonly context: ContextView;
  readonly state?: string;
  readonly noticeCycleId?: string | null;
  readonly authorization?: {
    readonly approvedAtMs?: number;
    readonly schedule?: { readonly timeZone?: string } | null;
    readonly immediateTenantOffer?: true;
  } | null;
  readonly confirmedCount?: number;
  readonly unresolvedOccurrenceId?: string | null;
  readonly nextDueAtMs?: number | null;
  readonly pause?: { readonly cause?: string; readonly atMs?: number } | null;
  readonly threads?: readonly { readonly sentAtMs?: number }[];
  readonly lastSentAtMs?: number | null;
}

const OPEN_STATES: ReadonlySet<string> = new Set([
  "draft",
  "active",
  "paused",
  "needs_reconciliation",
]);
const TERMINAL_STATES: ReadonlySet<string> = new Set(["completed", "cancelled"]);

/** A stored record as a related view, or null when it is not a usable sequence record. */
export function relatedSequenceView(
  id: string,
  data: Record<string, unknown> | null | undefined,
): RelatedSequenceView | null {
  if (!data || data.purged) return null;
  const context = data.context;
  if (!context || typeof context !== "object") return null;
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const authorization =
    data.authorization && typeof data.authorization === "object"
      ? (data.authorization as RelatedSequenceView["authorization"])
      : null;
  return {
    id,
    context: context as ContextView,
    state: typeof data.state === "string" ? data.state : undefined,
    ...(data.noticeCycleId === undefined
      ? {}
      : {
          noticeCycleId:
            typeof data.noticeCycleId === "string" ? data.noticeCycleId : null,
        }),
    authorization,
    confirmedCount: number(data.confirmedCount) ?? 0,
    unresolvedOccurrenceId:
      typeof data.unresolvedOccurrenceId === "string"
        ? data.unresolvedOccurrenceId
        : null,
    nextDueAtMs: number(data.nextDueAtMs) ?? null,
    pause:
      data.pause && typeof data.pause === "object"
        ? (data.pause as RelatedSequenceView["pause"])
        : null,
    threads: Array.isArray(data.threads)
      ? (data.threads as RelatedSequenceView["threads"])
      : [],
    lastSentAtMs: number(data.lastSentAtMs) ?? null,
  };
}

/** R-S272-1: the content basis kept for this exact authorization revision, or none. */
export function keptContentBasis(sequence: {
  readonly authorization?: { readonly revision: number } | null;
  readonly authorizedContentBasis?: AuthorizedContentBasis;
}): AuthorizedContentBasis | null {
  return sequence.authorization &&
    sequence.authorizedContentBasis &&
    sequence.authorizedContentBasis.revision === sequence.authorization.revision
    ? sequence.authorizedContentBasis
    : null;
}

/**
 * R-S272-2: the content digest for an authorization, with the same legacy or current choice
 * dispatch makes for the material source digest (an outgoing-contract target compared with an
 * authorization that carries no signature setup uses the legacy digest).
 */
export function contentDigestFor(
  authorization: { readonly signatureSetup?: unknown },
  basis: TargetContentBasis,
  outgoingContract: boolean | undefined,
): string {
  return outgoingContract && !authorization.signatureSetup
    ? basis.legacyDigest
    : basis.digest;
}

/**
 * R-S272-2: refuse wording written before a content fact changed. With a kept content basis: the
 * current basis differs and the initial and follow-up wording are unchanged since that
 * authorization (the same draft, and no save of the wording after it), naming each changed value.
 * An older authorization with no kept basis that is paused as "The lease or recipient facts
 * changed" is refused the same way, without values. Wording staff edited or rebuilt after the
 * authorization goes through the existing one-action Update (S192 R-S192-3), so it is not refused.
 */
export function wordingPredatesChange(input: {
  readonly sequence: {
    readonly id: string;
    readonly context: ContextView;
    readonly state: string;
    readonly authorization?: {
      readonly revision: number;
      readonly signatureSetup?: unknown;
    } | null;
    readonly authorizedContentBasis?: AuthorizedContentBasis;
    readonly wordingSavedAfterRevision?: number;
    readonly pause?: {
      readonly cause?: string;
      readonly changedInputs?: readonly ChangedInput[];
    } | null;
  };
  /** The saved draft's hash, `sequenceHash({ initial, followUp })`. */
  readonly draftHash: string;
  readonly contentBasis: TargetContentBasis | null | undefined;
  readonly outgoingContract?: boolean;
}): SequenceRefusal | null {
  const s = input.sequence;
  const authorization = s.authorization;
  if (
    !authorization ||
    !input.contentBasis ||
    !isCurrentMessageScope(s.context) ||
    TERMINAL_STATES.has(s.state)
  )
    return null;
  const savedAfter = s.wordingSavedAfterRevision === authorization.revision;
  const kept = keptContentBasis(s);
  if (kept) {
    const current = contentDigestFor(
      authorization,
      input.contentBasis,
      input.outgoingContract,
    );
    if (kept.digest === current) return null;
    if (savedAfter || input.draftHash !== kept.draftHash) return null;
    return {
      reason: "wording_predates_change",
      audience: audienceOf(s.context),
      relatedSequenceId: s.id,
      changes: changedReviewedInputs(kept.values, input.contentBasis.values),
    };
  }
  if (s.state === "paused" && s.pause?.cause === "changed_source" && !savedAfter)
    return {
      reason: "wording_predates_change",
      audience: audienceOf(s.context),
      relatedSequenceId: s.id,
      // S285 R-S285-6: a hold the worker named as the owner wording update keeps that one cause;
      // no value is named.
      changes: (s.pause?.changedInputs ?? []).filter(
        (change) => change.key === OWNER_WORDING_UPDATED_INPUT.key,
      ),
    };
  return null;
}

/** The time another communication's initial message was confirmed sent, or null. */
export function initialSentAtMs(view: RelatedSequenceView): number | null {
  if ((view.confirmedCount ?? 0) < 1) return null;
  const first = view.threads?.[0]?.sentAtMs;
  if (typeof first === "number" && Number.isFinite(first)) return first;
  return typeof view.lastSentAtMs === "number" ? view.lastSentAtMs : null;
}

/**
 * Two records belong to the same cycle when both name it, or when either names none (a cycle that
 * was not recorded, or an older record from before it was kept).
 */
function sameCycle(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  return left === undefined || right === undefined || left === null || right === null
    ? true
    : left === right;
}

export interface NewerSend {
  readonly sequenceId: string;
  readonly sentAtMs: number;
}

/**
 * R-S272-4: the newest confirmed initial send by another communication for the same lease, cycle
 * and audience recorded after this communication's current authorization was granted, or null.
 */
export function newerInitialSend(
  subject: {
    readonly id: string;
    readonly context: ContextView;
    readonly state?: string;
    readonly noticeCycleId?: string | null;
    readonly authorization?: { readonly approvedAtMs: number } | null;
  },
  related: readonly RelatedSequenceView[],
): NewerSend | null {
  const authorization = subject.authorization;
  if (
    !authorization ||
    !isCurrentMessageScope(subject.context) ||
    (subject.state !== undefined && TERMINAL_STATES.has(subject.state))
  )
    return null;
  let newest: NewerSend | null = null;
  for (const other of related) {
    if (other.id === subject.id || !sameLine(subject.context, other.context)) continue;
    if (!sameCycle(subject.noticeCycleId, other.noticeCycleId)) continue;
    const sentAtMs = initialSentAtMs(other);
    if (sentAtMs === null || sentAtMs <= authorization.approvedAtMs) continue;
    if (!newest || sentAtMs > newest.sentAtMs)
      newest = { sequenceId: other.id, sentAtMs };
  }
  return newest;
}

/** R-S272-3: how a communication holds unsent authorized work, or null when it holds none. */
export function unsentMessageState(view: RelatedSequenceView): UnsentMessageState | null {
  if (!view.authorization) return null;
  if (view.unresolvedOccurrenceId || view.state === "needs_reconciliation")
    return "unconfirmed";
  if ((view.confirmedCount ?? 0) !== 0) return null;
  if (view.state === "paused") return "paused";
  if (view.state === "active")
    return view.authorization.schedule && !view.authorization.immediateTenantOffer
      ? "scheduled"
      : "awaiting_send";
  return null;
}

/**
 * R-S272-3: when an initial renewal message (not a reply) is authorized, the other communication
 * for the same lease and audience, with the same cycle or with no cycle recorded and an open state,
 * that holds an authorization with unsent work: scheduled and unsent, paused, or with an
 * unconfirmed send. Applies only to a message whose cycle scope was read (`noticeCycleId` present,
 * as every renewal target reports it).
 */
export function unsentInitialElsewhere(
  subject: {
    readonly id: string;
    readonly context: ContextView;
    readonly noticeCycleId?: string | null;
    readonly confirmedCount: number;
  },
  related: readonly RelatedSequenceView[],
): SequenceRefusal | null {
  if (
    !isCurrentMessageScope(subject.context) ||
    subject.confirmedCount !== 0 ||
    subject.noticeCycleId === undefined
  )
    return null;
  for (const prior of related) {
    if (prior.id === subject.id || !sameLine(subject.context, prior.context)) continue;
    const open = prior.state !== undefined && OPEN_STATES.has(prior.state);
    const cycle =
      prior.noticeCycleId === subject.noticeCycleId ||
      ((prior.noticeCycleId === null || prior.noticeCycleId === undefined) && open);
    if (!cycle) continue;
    const state = unsentMessageState(prior);
    if (!state) continue;
    return {
      reason: "unsent_message_exists",
      audience: audienceOf(subject.context),
      relatedSequenceId: prior.id,
      relatedState: state,
      relatedAtMs:
        state === "scheduled" || state === "awaiting_send"
          ? (prior.nextDueAtMs ?? null)
          : state === "paused"
            ? (prior.pause?.atMs ?? null)
            : null,
      timeZone: prior.authorization?.schedule?.timeZone ?? null,
    };
  }
  return null;
}

/** R-S272-4 as a typed refusal. */
export function newerSendRefusal(
  context: ContextView,
  newer: NewerSend | null,
): SequenceRefusal {
  return {
    reason: "newer_message_sent",
    audience: audienceOf(context),
    ...(newer
      ? { relatedSequenceId: newer.sequenceId, relatedAtMs: newer.sentAtMs }
      : {}),
  };
}

/**
 * ARCH-S272-2: the stored-state rules one authorization transaction applies: an older
 * authorization after a newer confirmed send (R-S272-4, on the record as it stood), then another
 * unsent initial message for the same lease, cycle and audience (R-S272-3, for the message being
 * authorized). R-S272-2 runs on the same record in the same transaction.
 */
export function currentMessageRefusal(input: {
  readonly subject: {
    readonly id: string;
    readonly context: ContextView;
    readonly state?: string;
    readonly noticeCycleId?: string | null;
    readonly authorization?: { readonly approvedAtMs: number } | null;
  };
  readonly next: {
    readonly noticeCycleId?: string | null;
    readonly confirmedCount: number;
  };
  readonly related: readonly RelatedSequenceView[];
}): SequenceRefusal | null {
  const newer = newerInitialSend(input.subject, input.related);
  if (newer) return newerSendRefusal(input.subject.context, newer);
  return unsentInitialElsewhere(
    {
      id: input.subject.id,
      context: input.subject.context,
      ...(input.next.noticeCycleId !== undefined
        ? { noticeCycleId: input.next.noticeCycleId }
        : {}),
      confirmedCount: input.next.confirmedCount,
    },
    input.related,
  );
}

/** The key of the one guard record every initial authorization for a lease and audience writes. */
export function currentMessageGuardKey(context: ContextView): readonly unknown[] {
  return ["renewal-current-message", context.entityId, context.purpose];
}
