"use client";

import type { SenderSignatureChoice } from "@/lib/lease-renewal/sender-signature-choice";
import { RenewalSenderSignatureForm } from "./RenewalSenderSignatureForm";

// S249 ARCH-S249-2 / R-S249-7 to R-S249-12: the lease's ONE message record on the Now card. The
// message editor (RenewalMessagePreparation) holds the record and gives this block its live
// content, so the preview, "Review and send", "Schedule", "Create Gmail draft instead", "Copy" and
// the Communications composer opened for the lease all carry the same revision.
//
// Send and Schedule are the existing staff-confirmed S189 to S192 contract, unchanged: the message
// is saved, the app's composition for the lease is read, the communication draft is saved, and the
// exact saved message is shown for review; the one confirmation then sends or schedules it with
// the saved draft's and the recipients' review hashes. Nothing here sends, schedules or creates a
// Gmail draft without that review and that confirmation.

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Button, ConfirmationDialog, Field } from "@/components/ui";
import { formatBusinessTimestamp, formatCalendarDate } from "@/lib/date-display";
import { renderEditableCommunicationBody } from "@/lib/gmail-hub/sequence-model";
import {
  LEASE_READ_NOT_SETTLED_CODE,
  LEASE_READ_NOT_SETTLED_MESSAGE,
  LEASE_READ_REREAD_WAITS_MS,
  TARGET_CHANGED_CODE,
  TARGET_CHANGED_LEAD,
  changedInputLine,
  type ChangedInput,
  type LeaseReadSettlement,
  type ReviewedInput,
} from "@/lib/gmail-hub/reviewed-inputs";
import {
  SEQUENCE_REFUSED_CODE,
  type SequenceRefusal,
} from "@/lib/gmail-hub/current-message";
import {
  SEQUENCE_REFUSAL_ACTION_LABELS,
  sequenceRefusalMessage,
} from "@/lib/gmail-hub/communication-state";
import {
  UNSENT_MESSAGE_WORDS,
  carriedSendTime,
  scheduledStoredLine,
  unsentMessageWords,
  unsentUpdateRefusal,
  type UnsentMessageView,
} from "@/lib/lease-renewal/unsent-message";
import type {
  CommunicationSequence,
  RichCommunicationMessage,
} from "@/lib/gmail-hub/sequence-model";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import { BUSINESS_TIME_ZONE } from "@/lib/lease-renewal/business-calendar";
import {
  GUIDED_MESSAGE_GROUP_LABELS,
  GUIDED_PRIORITY_WORDS,
} from "@/lib/lease-renewal/guided-priority";
import { RenewalSecondaryWork } from "./RenewalGuidedView";
import { messageRevisionLabel } from "@/lib/lease-renewal/message-revision";
import type { OffCycleReadinessItem } from "@/lib/lease-renewal/off-cycle-review";
import { STALE_REFINED_BODY_MESSAGE } from "@/lib/lease-renewal/refined-message";
import { NOTICE_GENERATION_NOT_READY } from "@/lib/lease-renewal/notice-source-error";
import {
  RECOMMENDATION_REASON_REFUSAL,
  RecommendationReasonSchema,
} from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalPathStepId } from "@/lib/lease-renewal/renewal-path";
import {
  KICKOFF_WORDS,
  MARKED_FACTS,
  SEND_READINESS_KEYS,
  sendReady,
  withLiveKickoff,
  type RenewalPreparation,
} from "@/lib/lease-renewal/renewal-preparation";
import {
  workingRenewalTerms,
  messageWorkingFieldsFor,
} from "@/lib/lease-renewal/working-record";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";
import { focusRenewalDashboardControl } from "./RenewalDashboardNavigation";
import {
  addCalendarDays,
  CommunicationScheduleSchema,
  localDateAt,
  nextOccurrence,
  formatZonedInstant,
} from "@/lib/gmail-hub/schedule-calendar";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
import { nowSlotKey, useRenewalNowCard } from "./RenewalNowCardContext";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { workingRecommendationBasis } from "@/lib/lease-renewal/kickoff-facts";
import { MESSAGE_CONTROL_IDS } from "@/lib/lease-renewal/message-readiness";
import { useRenewalPricingPolicy } from "./RenewalPricingPolicy";
import { RecommendationBasisLine, WorkingBaseBasisLine } from "./RenewalRentBasis";
import {
  STANDING_AGREEMENT_WORDS,
  standingRuleBasis,
} from "@/lib/lease-renewal/standing-agreement";
import {
  FOLLOW_UP_START_WORDS,
  followUpStartLine,
  followUpStartingValues,
  type FollowUpStartRead,
  type FollowUpStartingValues,
} from "@/lib/lease-renewal/follow-up-copy";

export interface PreparedSignatureFields {
  readonly name: string;
  readonly role: string;
  readonly phone: string;
}

/** What the message editor reads out; plain data, so it travels as one prop. */
export type PreparedMessageData = Omit<
  PreparedMessageApi,
  | "saveSignature"
  | "onSignatureSetupSaved"
  | "setReason"
  | "commitReason"
  | "flush"
  | "copy"
  | "openComposer"
  | "draft"
  | "rebuildRule"
  | "returnToStandardWording"
  | "undoWording"
> & {
  readonly draft: Omit<
    PreparedMessageApi["draft"],
    "requestPreview" | "create" | "cancel" | "recover"
  >;
};

/** The editor's own actions, each its own prop (they read the editor's save state when run). */
export interface PreparedMessageHandlers {
  readonly onSaveSignature: PreparedMessageApi["saveSignature"];
  readonly onSignatureSetupSaved?: (choice: SenderSignatureChoice) => Promise<void>;
  readonly onReasonChange: PreparedMessageApi["setReason"];
  readonly onReasonCommit: PreparedMessageApi["commitReason"];
  readonly onFlush: PreparedMessageApi["flush"];
  readonly onCopy: PreparedMessageApi["copy"];
  readonly onOpenComposer: PreparedMessageApi["openComposer"];
  readonly onDraftPreview: PreparedMessageApi["draft"]["requestPreview"];
  readonly onDraftCreate: PreparedMessageApi["draft"]["create"];
  readonly onDraftRecover?: PreparedMessageApi["draft"]["recover"];
  /** S250 R-S250-7: save the message on the agreement's current rule. */
  readonly onRebuildRule?: PreparedMessageApi["rebuildRule"];
  readonly onReturnToStandardWording?: PreparedMessageApi["returnToStandardWording"];
  readonly onUndoWording?: PreparedMessageApi["undoWording"];
}

export interface PreparedMessageApi {
  readonly channel: "owner" | "tenant";
  readonly leaseId: string;
  readonly canEdit: boolean;
  readonly subject: string;
  readonly plainText: string;
  readonly htmlBody: string;
  readonly revision: string;
  readonly to: string | null;
  readonly cc: readonly string[];
  readonly recipientReasons: readonly string[];
  readonly senderEmail: string;
  readonly templateApproved: boolean;
  /** When the message record was last saved. */
  readonly lastEditedAt: string | null;
  /** Authored wording remains exact; changed facts need a visible, deliberate resolution. */
  readonly wordingChangedSince?: boolean;
  readonly canUndoWording?: boolean;
  readonly returnToStandardWording?: () => void;
  readonly undoWording?: () => void;
  /**
   * S250 R-S250-7: the message record was built on an earlier version of the standing
   * agreement's rule and keeps that rule's rent; null otherwise.
   */
  readonly earlierRule?: {
    readonly agreement: string;
    readonly earlier: string;
    readonly current: string;
    readonly currentRent: number;
  } | null;
  /** S250 R-S250-7: rebuild the message on the current rule (a deliberate choice). */
  readonly rebuildRule?: () => Promise<void>;
  /** The marked values the message still carries, in its own words. */
  readonly marked: readonly string[];
  readonly signaturePresent: boolean;
  readonly outgoingReasons?: readonly string[];
  readonly renewOrNot?: boolean;
  /** S285 R-S285-3: the owner copy in use states the renewal term. */
  readonly ownerTermStated?: boolean;
  /**
   * S281 R-S281-2: the lease and its renewal in staff terms ("101 Sample Pl, renewal for the
   * lease ending 12/31/2026"), shown in the exact review in place of internal identifiers.
   */
  readonly leaseLabel?: string | null;
  readonly onSignatureSetupSaved?: (choice: SenderSignatureChoice) => Promise<void>;
  /** Fill and save the sender's own signature on this message (it is kept for the sender). */
  readonly saveSignature: (fields: PreparedSignatureFields) => string | null;
  readonly reason: string;
  readonly setReason: (value: string) => void;
  readonly commitReason: () => void;
  /** Save what is on screen and resolve true once the saved message reads back the same. */
  readonly flush: () => Promise<boolean>;
  readonly copy: () => Promise<void>;
  readonly composerHref: string;
  readonly openComposer: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  readonly draft: {
    readonly available: boolean;
    readonly pending: boolean;
    /** The revision a created Gmail draft carries; null when none was created from this record. */
    readonly createdRevision: string | null;
    /** True once a created Gmail draft was replaced: the earlier one is still in Gmail. */
    readonly earlierRemain?: boolean;
    readonly recoveryRequired?: boolean;
    readonly recover?: () => Promise<void>;
    readonly preview: {
      readonly subject: string;
      readonly body: string;
      readonly to: string;
    } | null;
    /** A failed field returns its local recovery, after the empty review dialog closes. */
    readonly requestPreview: () => Promise<void | (() => void)>;
    readonly create: () => Promise<void>;
    readonly cancel: () => void;
  };
  readonly notice: string;
}

const STEP_FOR_CHANNEL: Record<"owner" | "tenant", RenewalPathStepId> = {
  owner: "ask-owner",
  tenant: "offer-tenant",
};

/** S281 R-S281-3: the confirmed send a sent step reads in its Verification, with its receipt. */
export interface SentMessageReceipt {
  readonly sequenceId: string;
  readonly sentAtMs: number;
  readonly senderEmail: string;
}

/** S281 R-S281-1: the recipients line the step shows between its facts and its primary action. */
export function recipientsLine(to: string | null, cc: readonly string[]): string | null {
  if (!to) return null;
  return cc.length ? `To: ${to} · Cc: ${cc.join(", ")}` : `To: ${to}`;
}

interface ReviewState {
  readonly mode: "send" | "schedule";
  readonly sequence: CommunicationSequence;
  readonly signatureParagraph: RichCommunicationMessage["paragraphs"][number] | null;
  readonly noticeCycleId: string | null;
  readonly reviewedAtMs: number;
  readonly reviewedDraftHash: string;
  readonly reviewedTargetHash: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly body: string;
  /** S274 R-S274-5: the inputs this review displayed, sent back only to name what changed. */
  readonly reviewedInputs: readonly ReviewedInput[] | null;
  /** S274 R-S274-5: after a refusal, what changed since the earlier review, with both values. */
  readonly changes: readonly ChangedInput[] | null;
  /**
   * S276 R-S276-7 / R-S276-8: what the follow-up form opens with, read with this composition (the
   * notice rules' interval, the follow-up copy's publication and its composed body); null on a
   * read without it.
   */
  readonly followUpStart: FollowUpStartRead | null;
  /**
   * S273 R-S273-4: the review updates the held or out-of-date communication itself. Nothing is
   * saved until the one confirmation, which saves this wording to the same communication and then
   * authorizes it with the existing version checks.
   */
  readonly update?: {
    readonly sequenceId: string;
    readonly version: number;
    readonly context: WorkflowCommunicationContext;
    readonly initial: RichCommunicationMessage;
    readonly followUp: CommunicationSequence["followUp"];
    readonly title: string;
    /** The earlier date and time were carried into the schedule fields. */
    readonly carried: boolean;
  } | null;
}

/** The lease's composition as the review reads it (the same read for a new message or an update). */
interface RenewalCompositionRead {
  readonly context: WorkflowCommunicationContext;
  readonly initial: RichCommunicationMessage;
  readonly target: {
    readonly to: string[];
    readonly cc: string[];
    readonly blockers?: string[];
    readonly noticeCycleId?: string | null;
    readonly readSettlement?: LeaseReadSettlement;
    readonly reviewedInputs?: ReviewedInput[];
  };
  readonly signatureParagraph?: RichCommunicationMessage["paragraphs"][number] | null;
  readonly reviewedTargetHash: string;
  /** S276 R-S276-7 / R-S276-8: the follow-up form's starting read (tenant only). */
  readonly followUp?: FollowUpStartRead | null;
}

function readRenewalComposition(
  channel: "owner" | "tenant",
  leaseId: string,
): Promise<RenewalCompositionRead> {
  return json<RenewalCompositionRead>(
    `/api/gmail-hub/composition?purpose=${channel === "owner" ? "renewal_owner" : "renewal_tenant"}&lease=${encodeURIComponent(leaseId)}`,
  );
}

/** One save of the communication draft: the exact request, reused as is when it is retried. */
interface PendingSave {
  readonly body: {
    readonly action: "save";
    readonly draft: {
      readonly id: string;
      readonly context: WorkflowCommunicationContext;
      readonly initial: RichCommunicationMessage;
      readonly followUp: RichCommunicationMessage | null;
    };
    readonly expectedVersion: number;
    readonly operationId: string;
  };
}

/** True when a failed request may still have been applied at the server (no answer, or a 5xx). */
export function outcomeUnknown(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status !== "number" || status >= 500;
}

/** How many times a save whose answer was lost is sent again, identically, before stopping. */
export const SAVE_RETRIES = 2;

async function json<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetchWithDeadline(
    url,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
    code?: string;
    changes?: ChangedInput[];
    refusal?: SequenceRefusal;
  };
  if (!response.ok)
    throw Object.assign(new Error(payload.error ?? "This was not completed."), {
      status: response.status,
      // S274: the typed refusal the sequences route returns, when there is one.
      ...(typeof payload.code === "string" ? { code: payload.code } : {}),
      ...(Array.isArray(payload.changes) ? { changes: payload.changes } : {}),
      // S272 R-S272-6: the one typed refusal reason, with the related communication.
      ...(payload.refusal && typeof payload.refusal === "object"
        ? { refusal: payload.refusal }
        : {}),
    });
  return payload;
}

/** S274: the typed refusal a failed request carried, if any. */
function refusalOf(error: unknown): {
  code: string | null;
  changes: readonly ChangedInput[];
  sequenceRefusal: SequenceRefusal | null;
} {
  const value = error as { code?: unknown; changes?: unknown; refusal?: unknown } | null;
  return {
    code: typeof value?.code === "string" ? value.code : null,
    changes: Array.isArray(value?.changes) ? (value.changes as ChangedInput[]) : [],
    // S272 R-S272-6: the one typed refusal reason, when there is one.
    sequenceRefusal:
      value?.refusal && typeof value.refusal === "object"
        ? (value.refusal as SequenceRefusal)
        : null,
  };
}

/**
 * How long to wait before each further read of the review while the lease read is replaced. The
 * same bound confirm uses (S274 R-S274-1).
 */
export const COMPOSITION_REREAD_WAITS_MS = LEASE_READ_REREAD_WAITS_MS;

/**
 * S274 R-S274-2: a review read on a lease read that did not settle (a generation being replaced,
 * or a retirement status unavailable only because the read is not fresh) is read again.
 */
export function compositionWaitsOnRead(target: {
  readonly blockers?: readonly string[];
  readonly readSettlement?: LeaseReadSettlement;
}): boolean {
  return (
    onlyGenerationBeingReplaced(target.blockers) ||
    target.readSettlement?.state === "not_settled"
  );
}

/** True when the one thing holding the review is the lease generation being replaced. */
export function onlyGenerationBeingReplaced(
  blockers: readonly string[] | undefined,
): boolean {
  return (
    blockers !== undefined &&
    blockers.length === 1 &&
    blockers[0] === NOTICE_GENERATION_NOT_READY
  );
}

/** S250 (L28): a Gmail draft review refused only because the lease generation is being replaced. */
export function draftPreviewWaitsOnGeneration(data: unknown): boolean {
  const outcome = data as { status?: unknown; reasons?: unknown } | null;
  return (
    outcome?.status === "blocked" &&
    Array.isArray(outcome.reasons) &&
    onlyGenerationBeingReplaced(outcome.reasons as string[])
  );
}

/**
 * Ask for a review again while its only refusal is the generation being replaced, as the reason
 * asks: a bounded few times, with growing waits. The caller passes a review (a preview) only;
 * a create, a confirmation, a send or a save is never asked again.
 */
export async function previewAgainWhileGenerationReplaced<T>(
  first: T,
  again: () => Promise<T>,
  waiting: (value: T) => boolean,
  wait: (ms: number) => Promise<unknown> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<T> {
  let current = first;
  for (const waitMs of COMPOSITION_REREAD_WAITS_MS) {
    if (!waiting(current)) break;
    await wait(waitMs);
    current = await again();
  }
  return current;
}

/** The clock at the moment a review is read (called from handlers, never during render). */
function clockNowMs(): number {
  return Date.now();
}

/** The date input's native value (YYYY-MM-DD) for tomorrow in the business zone. */
function tomorrowIso(): string {
  return localDateAt(Date.now() + 86_400_000, BUSINESS_TIME_ZONE);
}

/** The sent message's host never notifies; it is read again on each render. */
const noHostSubscription = () => () => {};

/**
 * S281 R-S281-3: after a confirmed send, the exact sent message and its receipt, read only, inside
 * the step's Verification disclosure. The message is read from its communication once; nothing
 * here sends, saves or changes anything.
 */
function SentMessageEvidence({
  channel,
  leaseId,
  receipt,
}: Readonly<{
  channel: "owner" | "tenant";
  leaseId: string;
  receipt: SentMessageReceipt;
}>) {
  // The Verification host is read from the page after each render; the server render has none.
  const host = useSyncExternalStore(
    noHostSubscription,
    () => document.getElementById(`renewal-sent-message-${channel}`),
    () => null,
  );
  const [read, setRead] = useState<{
    readonly id: string;
    readonly message: RichCommunicationMessage | null;
    readonly to: readonly string[];
  } | null>(null);
  useEffect(() => {
    let active = true;
    void fetchWithDeadline(
      `/api/gmail-hub/sequences?id=${encodeURIComponent(receipt.sequenceId)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("The sent message is unavailable.");
        const body = (await response.json().catch(() => null)) as {
          sequence?: CommunicationSequence;
        } | null;
        const sequence = body?.sequence;
        if (
          !sequence ||
          sequence.id !== receipt.sequenceId ||
          sequence.context?.entityId !== leaseId
        )
          throw new Error("The sent message is unavailable.");
        if (active)
          setRead({
            id: receipt.sequenceId,
            message: sequence.initial,
            to: sequence.authorization?.to ?? [],
          });
      })
      .catch(() => {
        if (active) setRead({ id: receipt.sequenceId, message: null, to: [] });
      });
    return () => {
      active = false;
    };
  }, [receipt.sequenceId, leaseId]);
  if (!host) return null;
  const current = read?.id === receipt.sequenceId ? read : null;
  const body = current?.message
    ? renderEditableCommunicationBody(current.message.paragraphs, current.message.layout)
        .plainText
    : null;
  return createPortal(
    <section
      aria-label={channel === "owner" ? "Sent owner message" : "Sent tenant offer"}
      className="ui-stack-tight"
      data-renewal-field="sent-message"
    >
      <p data-renewal-field="sent-receipt">
        Sent {formatBusinessTimestamp(receipt.sentAtMs)} from {receipt.senderEmail}
        {current?.to.length ? ` to ${current.to.join(", ")}` : ""}. Gmail accepted it.
      </p>
      {current?.message ? (
        <>
          <p>
            <strong>{current.message.subject}</strong>
          </p>
          <div className="draft-box" data-renewal-field="sent-body">
            {body}
          </div>
        </>
      ) : current ? (
        <p className="muted">The sent message could not be read just now.</p>
      ) : (
        <p className="muted">Reading the sent message…</p>
      )}
    </section>,
    host,
  );
}

export function PreparedMessageSlot({
  data,
  compactFull = false,
  deliveryHeld = false,
  offCycleHold = null,
  sent = null,
  unsent = null,
  chargeReview = null,
  onSaveSignature,
  onSignatureSetupSaved,
  onReasonChange,
  onReasonCommit,
  onFlush,
  onCopy,
  onOpenComposer,
  onDraftPreview,
  onDraftCreate,
  onDraftRecover,
  onRebuildRule,
  onReturnToStandardWording,
  onUndoWording,
}: Readonly<
  {
    data: PreparedMessageData;
    compactFull?: boolean;
    deliveryHeld?: boolean;
    /**
     * S282 R-S282-4 (ARCH-S282-3): the off-cycle end date row, read from the same stage blocker
     * the Now card reads; null when no off-cycle hold stands.
     */
    offCycleHold?: OffCycleReadinessItem | null;
    /**
     * S281 R-S281-3: this message's confirmed send. The step reads as sent: the message and its
     * other ways to send are not rendered, and the exact sent message is read in Verification.
     */
    sent?: SentMessageReceipt | null;
    /**
     * S273 R-S273-3/R-S273-4: the step's held or out-of-date unsent message, from the same stage
     * projection the Now card reads; its repair or recovery replaces the step's send actions.
     */
    unsent?: UnsentMessageView | null;
    /** S264: Review offer charges for the tenant offer, shown after its working terms. */
    chargeReview?: ReactNode;
  } & PreparedMessageHandlers
>) {
  const nowCard = useRenewalNowCard();
  const view = useRenewalFocusView();
  const full = compactFull && view?.view === "full";
  // S281 R-S281-12: in the Guided outcome layout the message renders in its card as named
  // groups, as in Full view; the Now card keeps the one primary action.
  const guidedInline =
    compactFull && view?.outcomeLayout === true && view.view === "guided";
  const step = data.renewOrNot
    ? "assisted-owner-renewal-answer"
    : STEP_FOR_CHANNEL[data.channel];
  const api: PreparedMessageApi = {
    ...data,
    ...(onRebuildRule ? { rebuildRule: onRebuildRule } : {}),
    returnToStandardWording: onReturnToStandardWording,
    undoWording: onUndoWording,
    saveSignature: onSaveSignature,
    onSignatureSetupSaved,
    setReason: onReasonChange,
    commitReason: onReasonCommit,
    flush: onFlush,
    copy: onCopy,
    openComposer: onOpenComposer,
    draft: {
      ...data.draft,
      requestPreview: onDraftPreview,
      create: onDraftCreate,
      recover: onDraftRecover,
      cancel: () => undefined,
    },
  };
  const preview = nowCard?.slots[nowSlotKey(step, "message-preview")] ?? null;
  const actions = nowCard?.slots[nowSlotKey(step, "review-and-send")] ?? null;
  // Only a shown Now card step that sends this audience's message takes the block.
  if (!nowCard || (!preview && !full && !guidedInline)) return null;
  return (
    <PreparedMessageBlock
      actionsSlot={guidedInline ? null : actions}
      api={api}
      chargeReview={chargeReview}
      full={full}
      guidedInline={guidedInline}
      deliveryHeld={deliveryHeld}
      offCycleHold={offCycleHold}
      preparation={nowCard?.preparation ?? null}
      previewSlot={guidedInline ? null : preview}
      sent={sent}
      setPrimary={nowCard?.setPrimary ?? null}
      step={step}
      unsent={unsent}
    />
  );
}

function PreparedMessageBlock({
  api,
  chargeReview,
  preparation,
  previewSlot,
  actionsSlot,
  full,
  guidedInline,
  deliveryHeld,
  offCycleHold,
  sent,
  setPrimary,
  step,
  unsent,
}: Readonly<{
  api: PreparedMessageApi;
  chargeReview: ReactNode;
  preparation: RenewalPreparation | null;
  previewSlot: HTMLElement | null;
  actionsSlot: HTMLElement | null;
  full: boolean;
  /** S281 R-S281-12: the Guided outcome layout renders the named groups in the message card. */
  guidedInline: boolean;
  deliveryHeld: boolean;
  offCycleHold: OffCycleReadinessItem | null;
  sent: SentMessageReceipt | null;
  setPrimary: NonNullable<ReturnType<typeof useRenewalNowCard>>["setPrimary"] | null;
  step: RenewalPathStepId;
  unsent: UnsentMessageView | null;
}>) {
  // Full view and the Guided outcome layout render the message in its card.
  const inline = full || guidedInline;
  const inlineRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const working = useRenewalWorkingRecord();
  const pricing = useRenewalPricingPolicy();
  // The action that opens this message's exact review, as the person sees it: Guided names it for
  // its outcome (S269), while Full view and the assisted renewal question show "Review and send".
  const focusView = useRenewalFocusView();
  const reviewAction =
    !full && focusView?.view === "guided" && step === "ask-owner"
      ? GUIDED_PRIORITY_WORDS.reviewOwnerMessage
      : !full && focusView?.view === "guided" && step === "offer-tenant"
        ? GUIDED_PRIORITY_WORDS.reviewTenantOffer
        : KICKOFF_WORDS.reviewAndSend;
  // S250 R-S250-8: the tenant offer names the standing agreement's rule as the rent's basis.
  const ruleBasis =
    api.channel === "tenant"
      ? standingRuleBasis(
          pricing?.view?.authority,
          working?.record?.fields.terms_rent ?? null,
        )
      : null;
  const base = useId();
  const [review, setReview] = useState<ReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // S272 R-S272-3: the communication that already holds this renewal, for the refusal's link.
  const [refusedCommunication, setRefusedCommunication] = useState<string | null>(null);
  const [changedReview, setChangedReview] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(tomorrowIso);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const scheduleReady = Boolean(scheduleDate && scheduleTime);
  const [followUps, setFollowUps] = useState(false);
  const [followUpSubject, setFollowUpSubject] = useState("");
  const [followUpBody, setFollowUpBody] = useState("");
  const [everyDays, setEveryDays] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [followUpZone, setFollowUpZone] = useState<string>(BUSINESS_TIME_ZONE);
  const [followUpEnd, setFollowUpEnd] = useState("");
  const [followUpLimit, setFollowUpLimit] = useState("");
  // S276 R-S276-7 (ARCH-S276-3): the starting values this review's follow-up form opened with, set
  // the first time staff tick the option in a review. Form state only: unticking and ticking
  // again keeps what staff last typed, and nothing is authorized until they confirm the review.
  const [followUpSeed, setFollowUpSeed] = useState<FollowUpStartingValues | null>(null);
  const [unknownAuthorization, setUnknownAuthorization] = useState<string | null>(null);
  // S274 R-S274-5: the review is being read again in place after a refusal for a real change.
  const [reloading, setReloading] = useState(false);
  const reviewEpoch = useRef(0);
  const confirmLock = useRef(false);
  const followUpSave = useRef<PendingSave | null>(null);
  // S273 R-S273-3/R-S273-4: the held or out-of-date message's one repair (an update of the same
  // communication), or its existing recovery in Communications, and the cancel beside the repair.
  const repair = unsent?.primary?.action === "update" ? unsent : null;
  const recovery = unsent?.primary?.action === "open_communication" ? unsent : null;
  const unsentWords = unsentMessageWords(api.channel);
  const [cancelOpen, setCancelOpen] = useState(false);
  const cancelTrigger = useRef<HTMLButtonElement | null>(null);
  /** The update's one wording save, sent again as it was when its answer is lost. */
  const updateSave = useRef<{
    readonly body: {
      readonly action: "save";
      readonly draft: {
        readonly id: string;
        readonly context: WorkflowCommunicationContext;
        readonly initial: RichCommunicationMessage;
        readonly followUp: CommunicationSequence["followUp"];
      };
      readonly expectedVersion: number;
      readonly operationId: string;
    };
  } | null>(null);

  const canIncludeFollowUps =
    api.channel === "tenant" &&
    review?.mode === "send" &&
    Boolean(review.noticeCycleId) &&
    // S273 R-S273-4: an update authorizes the one message it replaces, with no new follow-ups.
    !review.update;
  const includesFollowUps = canIncludeFollowUps && followUps;
  const followUpMessage =
    review && followUpSubject.trim() && followUpBody.trim()
      ? {
          subject: followUpSubject.trim(),
          paragraphs: [
            ...followUpBody
              .trim()
              .split(/\n{2,}/)
              .map((text) => [{ text }]),
            ...(review.signatureParagraph ? [review.signatureParagraph] : []),
          ],
          attachmentIds: [],
        }
      : null;
  const followUpPlan = (() => {
    if (!review || !includesFollowUps || !followUpMessage) return null;
    const now = review.reviewedAtMs;
    const interval = Number(everyDays);
    if (
      !Number.isInteger(interval) ||
      interval < 1 ||
      interval > 366 ||
      (!followUpEnd && !followUpLimit)
    )
      return null;
    try {
      const parsed = CommunicationScheduleSchema.safeParse({
        firstDate: addCalendarDays(localDateAt(now, followUpZone), interval),
        time: followUpTime,
        timeZone: followUpZone,
        everyDays: interval,
        endDate: followUpEnd || null,
        sendLimit: followUpLimit ? Number(followUpLimit) : null,
      });
      if (!parsed.success) return null;
      const due = nextOccurrence(parsed.data, now, 1);
      return due === null ? null : { schedule: parsed.data, due };
    } catch {
      return null;
    }
  })();

  const [draftOpen, setDraftOpen] = useState(false);
  const draftOpenRef = useRef(false);
  const failedDraftRecovery = useRef<(() => void) | null>(null);
  const finishDraftRecovery = useCallback(() => {
    const recover = failedDraftRecovery.current;
    failedDraftRecovery.current = null;
    recover?.();
  }, []);
  useEffect(() => {
    draftOpenRef.current = draftOpen && (Boolean(previewSlot) || inline);
  }, [draftOpen, previewSlot, inline]);
  function closeDraft() {
    draftOpenRef.current = false;
    setDraftOpen(false);
  }
  async function showDraftPreview() {
    draftOpenRef.current = true;
    setDraftOpen(true);
    const recover = await api.draft.requestPreview();
    if (recover) {
      // A deliberate cancel or step change keeps its newer focus. Otherwise the failed
      // preview closes first, and the dialog's ordinary focus return finishes before recovery.
      if (draftOpenRef.current) failedDraftRecovery.current = recover;
      closeDraft();
    }
  }
  const [signatureChoiceOpen, setSignatureChoiceOpen] = useState<boolean | null>(null);
  const signatureOpen =
    signatureChoiceOpen ??
    Boolean(api.canEdit && api.onSignatureSetupSaved && !api.signaturePresent);
  const setSignatureOpen = setSignatureChoiceOpen;
  const [signature, setSignature] = useState<PreparedSignatureFields>({
    name: "",
    role: "",
    phone: "",
  });
  const [signatureNotice, setSignatureNotice] = useState("");
  const sequenceRef = useRef<{ id: string; version: number } | null>(null);
  // A communication draft save whose answer has not arrived: sent again as is before anything new.
  const pendingSave = useRef<PendingSave | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const draftRecovery = useRef<HTMLButtonElement | null>(null);
  const recoveringFocus = useRef(false);
  useEffect(() => {
    if (!recoveringFocus.current || api.draft.pending) return;
    recoveringFocus.current = false;
    if (api.draft.recoveryRequired) draftRecovery.current?.focus();
    else {
      const heading = (previewSlot ?? inlineRef.current)
        ?.closest("[data-renewal-now-step]")
        ?.querySelector<HTMLElement>("#renewal-now-heading");
      if (heading)
        focusRenewalDashboardControl(heading.id, {
          focusContainer: true,
          viewRequest: false,
        });
    }
  }, [api.draft.pending, api.draft.recoveryRequired, previewSlot]);
  // S281 R-S281-1: the recipients line the Now card shows before the primary action.
  const recipients = recipientsLine(api.to, api.cc);
  const workingTerms = workingRenewalTerms(working?.record ?? null);
  const typedRent = workingTerms.rent;
  const workingRentBasis = workingRecommendationBasis(working?.record);
  // S285 R-S285-3: while the owner copy in use states the term, "Renewal dates" reads the saved
  // working start and end.
  const termStart = api.ownerTermStated ? workingTerms.effectiveDate : null;
  const termEnd = api.ownerTermStated ? workingTerms.endDate : null;
  // S281 R-S281-2: the renewal dates the message states, shown with its amounts in the review.
  const datesStart = api.channel === "tenant" ? workingTerms.effectiveDate : termStart;
  const datesEnd = api.channel === "tenant" ? workingTerms.endDate : termEnd;
  const reviewDates =
    datesStart && datesEnd
      ? `Renewal term: ${formatCalendarDate(datesStart)} through ${formatCalendarDate(datesEnd)}`
      : null;
  const live = useMemo(
    () =>
      preparation && api.channel === "owner" && !api.renewOrNot
        ? withLiveKickoff(preparation, {
            signature: api.signaturePresent,
            typedRent,
            workingRentBasis,
            recipientReady: api.to !== null,
            templateApproved: api.templateApproved,
            marked: api.marked,
            ...(api.ownerTermStated
              ? { renewalDates: { start: termStart, end: termEnd } }
              : {}),
          })
        : null,
    [
      preparation,
      api.channel,
      api.renewOrNot,
      api.signaturePresent,
      typedRent,
      workingRentBasis,
      api.to,
      api.templateApproved,
      api.marked,
      api.ownerTermStated,
      termStart,
      termEnd,
    ],
  );
  // The items Send needs. For the owner they come from the one projection; for the tenant offer
  // they are the same four read from its own message.
  const signatureReady =
    api.signaturePresent &&
    !api.marked.some((entry) => entry.trim().toLowerCase() === MARKED_FACTS.signature);
  const needs = live
    ? live.items.filter((item) => SEND_READINESS_KEYS.includes(item.key))
    : [
        {
          key: "recipient" as const,
          label:
            api.channel === "owner"
              ? "Verified owner recipient"
              : "Verified tenant recipient",
          ready: api.to !== null,
          missing:
            api.to !== null
              ? null
              : api.channel === "owner"
                ? "a verified owner recipient"
                : "a verified tenant recipient",
          fix: {
            label:
              api.channel === "owner"
                ? "Add the owner's email on the owner record in RentVine"
                : "Check tenant email addresses in RentVine",
            target: MESSAGE_CONTROL_IDS.recipients(api.channel),
          },
        },
        {
          key: "signature" as const,
          label: "Your signature",
          // S279 R-S279-6: the row and the message's own marker are one read.
          ready: signatureReady,
          missing: signatureReady ? null : "your signature",
          fix: null,
        },
        {
          key: "template" as const,
          label: "Approved template",
          ready: api.templateApproved,
          missing: api.templateApproved
            ? null
            : api.channel === "owner"
              ? "an approved owner template"
              : "an approved tenant template",
          fix: {
            label:
              api.channel === "owner"
                ? "Ask an Approver to publish the owner template"
                : "Ask an Approver to publish the tenant template",
            target: MESSAGE_CONTROL_IDS.publication(api.channel),
          },
        },
        {
          key: "marked_values" as const,
          label: "Complete marked values",
          ready: api.marked.length === 0,
          missing: api.marked.length === 0 ? null : api.marked.join(", "),
          fix: api.marked.length
            ? {
                label: "Review the marked values",
                target: MESSAGE_CONTROL_IDS.readiness(api.channel),
              }
            : null,
        },
      ];
  // S282 R-S282-4 (ARCH-S282-3): while the off-cycle hold stands, its row leads the list as not
  // ready and its fix leads the step's action, so the list and the Now card never disagree.
  const ready =
    (live ? sendReady(live) : needs.every((item) => item.ready)) &&
    !api.outgoingReasons?.length &&
    !offCycleHold;
  const missingWords = needs.filter((item) => !item.ready && item.missing);
  const firstMissing = offCycleHold ? null : needs.find((item) => !item.ready);
  const reviewLabel = ready
    ? KICKOFF_WORDS.reviewAndSend
    : offCycleHold
      ? offCycleHold.fix.label
      : firstMissing?.key === "signature"
        ? "Set up your signature"
        : (firstMissing?.fix?.label ?? "Review required message inputs");
  const staleDraft =
    api.draft.createdRevision !== null && api.draft.createdRevision !== api.revision;
  // H: the reason carries the same guard as edited wording, and says what to take out.
  const reasonCheck = api.reason.trim()
    ? RecommendationReasonSchema.safeParse(api.reason)
    : null;
  const reasonRefusal =
    reasonCheck && !reasonCheck.success
      ? (reasonCheck.error.issues[0]?.message ?? RECOMMENDATION_REASON_REFUSAL)
      : null;

  /**
   * Save the message, read the lease composition and save the communication draft for review.
   * S274 R-S274-5: `reloadAfter` reads the review again in place after a refusal for a real
   * change: the server's current message, recipients and sender, with each changed input named.
   * It saves nothing on the lease and never sends; a further confirmation is required.
   */
  const prepareReview = async (
    mode: "send" | "schedule",
    reloadAfter: readonly ChangedInput[] | null = null,
  ) => {
    setBusy(true);
    setMessage("");
    setRefusedCommunication(null);
    setChangedReview(null);
    if (reloadAfter) setReloading(true);
    const epoch = reviewEpoch.current;
    const cancelled = () => reloadAfter !== null && epoch !== reviewEpoch.current;
    // A reload shows the result in the dialog; a reload that cannot show a review closes it, and
    // the reason reads on the card.
    const fail = (text: string) => {
      if (reloadAfter) setReview(null);
      setMessage(text);
    };
    try {
      if (!reloadAfter && !(await api.flush())) {
        setMessage(
          "Your latest message could not be prepared for review. Your entries are kept; correct or retry the save.",
        );
        return;
      }
      const workingFields = messageWorkingFieldsFor(
        api.channel,
        api.renewOrNot,
        api.ownerTermStated,
      );
      const workingVersion = working?.confirmedVersion?.(workingFields);
      const figuresChanged = () =>
        !reloadAfter &&
        Boolean(
          working?.hasUnsettled?.(workingFields) ||
          working?.confirmedVersion?.(workingFields) !== workingVersion,
        );
      const changedMessage = `Working figures changed while this review was loading. Your entries are kept. Choose ${mode === "schedule" ? KICKOFF_WORDS.schedule : reviewAction} again to review the current message.`;
      const readComposition = () => readRenewalComposition(api.channel, api.leaseId);
      let composition = await readComposition();
      // A lease read older than a minute starts the next RentVine read, and the review made on the
      // older one answers that the generation is being replaced. As the reason asks, the review is
      // read again once that next read lands: reads only, a bounded few, and the server decides.
      // S274 R-S274-2: a read the server reports as not settled is read again the same way.
      for (const waitMs of COMPOSITION_REREAD_WAITS_MS) {
        if (!compositionWaitsOnRead(composition.target)) break;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        composition = await readComposition();
      }
      if (composition.target.blockers?.length) {
        fail(`This message cannot be sent yet: ${composition.target.blockers.join(" ")}`);
        return;
      }
      if (figuresChanged()) {
        setChangedReview(changedMessage);
        return;
      }
      type Saved = { sequence: CommunicationSequence; reviewedDraftHash: string };
      // One operation id per save attempt, reused unchanged on every retry, so a save whose
      // answer was lost is answered with the record it already made (the server replays an
      // operation it already applied). A lost answer never becomes a second sendable draft.
      const send = async (pending: PendingSave): Promise<Saved> => {
        pendingSave.current = pending;
        for (let attempt = 0; ; attempt += 1) {
          try {
            const saved = await json<Saved>("/api/gmail-hub/sequences", pending.body);
            pendingSave.current = null;
            return saved;
          } catch (error) {
            if (!outcomeUnknown(error)) {
              pendingSave.current = null;
              throw error;
            }
            if (attempt >= SAVE_RETRIES)
              throw new Error(
                `The draft save did not answer. Choose ${mode === "schedule" ? KICKOFF_WORDS.schedule : reviewAction} again: the same save is sent again, so no second draft is made.`,
              );
          }
        }
      };
      const attemptFor = (
        prior: { id: string; version: number } | null,
      ): PendingSave => ({
        body: {
          action: "save",
          draft: {
            id: prior?.id ?? crypto.randomUUID(),
            context: composition.context,
            initial: composition.initial,
            followUp: null,
          },
          expectedVersion: prior?.version ?? 0,
          operationId: crypto.randomUUID(),
        },
      });
      // A save left unanswered by an earlier attempt is settled first, by sending it again as it
      // was: its record is then the one this review saves over.
      if (pendingSave.current) {
        try {
          const replayed = await send(pendingSave.current);
          sequenceRef.current = {
            id: replayed.sequence.id,
            version: replayed.sequence.version,
          };
        } catch (error) {
          if (outcomeUnknown(error)) throw error;
        }
      }
      let saved: Saved;
      try {
        saved = await send(attemptFor(sequenceRef.current));
      } catch (error) {
        // A communication already sent, scheduled or changed elsewhere starts a new one; an
        // answer that was lost is never read as that.
        if (outcomeUnknown(error) || sequenceRef.current === null) throw error;
        sequenceRef.current = null;
        saved = await send(attemptFor(null));
      }
      sequenceRef.current = { id: saved.sequence.id, version: saved.sequence.version };
      if (figuresChanged()) {
        setChangedReview(changedMessage);
        return;
      }
      const rendered = renderEditableCommunicationBody(
        saved.sequence.initial.paragraphs,
        saved.sequence.initial.layout,
      );
      followUpSave.current = null;
      if (cancelled()) return;
      const followUpStart = composition.followUp ?? null;
      if (!reloadAfter) {
        // S276 R-S276-7: every new review opens with the follow-up option unticked; its starting
        // values are filled in the first time staff tick it in this review.
        setFollowUps(false);
        setFollowUpSeed(null);
        setFollowUpSubject("");
        setFollowUpBody("");
        setEveryDays("");
        setFollowUpTime("");
        setFollowUpZone(BUSINESS_TIME_ZONE);
        setFollowUpEnd("");
        setFollowUpLimit("");
      } else if (followUpSeed) {
        // R-S276-8: the review read again after a real change. A follow-up subject or message
        // staff have not changed follows the current reviewed facts; one they changed is kept.
        const next = followUpStartingValues({
          subject: saved.sequence.initial.subject,
          start: followUpStart,
        });
        if (followUpSubject === followUpSeed.subject) setFollowUpSubject(next.subject);
        if (followUpBody === followUpSeed.body) setFollowUpBody(next.body);
        setFollowUpSeed({
          ...followUpSeed,
          subject: next.subject,
          body: next.body,
          published: next.published,
          line: followUpStartLine(Number(followUpSeed.everyDays), next.published),
        });
      }
      setReview({
        mode,
        signatureParagraph: composition.signatureParagraph ?? null,
        noticeCycleId: composition.target.noticeCycleId ?? null,
        sequence: saved.sequence,
        reviewedDraftHash: saved.reviewedDraftHash,
        reviewedTargetHash: composition.reviewedTargetHash,
        to: composition.target.to,
        cc: composition.target.cc,
        subject: saved.sequence.initial.subject,
        body: rendered.plainText,
        reviewedAtMs: saved.sequence.updatedAtMs,
        reviewedInputs: composition.target.reviewedInputs ?? null,
        changes: reloadAfter,
        followUpStart,
      });
    } catch (error) {
      fail(
        error instanceof Error
          ? error.message
          : "The review could not be prepared. Nothing was sent.",
      );
    } finally {
      setBusy(false);
      if (reloadAfter) setReloading(false);
    }
  };

  /**
   * S273 R-S273-4: "Review the updated offer". The existing review dialog opens with the lease's
   * current message, recipients and sender, for the same communication that is held or out of
   * date. The date and time are carried from the earlier authorization while still in the future;
   * otherwise they start empty and Send now is offered. Nothing is saved here: the one
   * confirmation saves the wording to that communication and authorizes it. `reloadAfter` reads
   * the review again in place after a refusal for a real change (S274 R-S274-5).
   */
  const prepareUpdateReview = async (
    reloadAfter: readonly ChangedInput[] | null = null,
  ) => {
    if (!repair) return;
    setBusy(true);
    setMessage("");
    setRefusedCommunication(null);
    setChangedReview(null);
    if (reloadAfter) setReloading(true);
    const epoch = reviewEpoch.current;
    const fail = (text: string) => {
      if (reloadAfter) setReview(null);
      setMessage(text);
    };
    try {
      if (!reloadAfter && !(await api.flush())) {
        fail(
          "Your latest message could not be prepared for review. Your entries are kept; correct or retry the save.",
        );
        return;
      }
      const read = await json<{ sequence: CommunicationSequence }>(
        `/api/gmail-hub/sequences?id=${encodeURIComponent(repair.sequenceId)}`,
      );
      const refusal = unsentUpdateRefusal(read.sequence, {
        sequenceId: repair.sequenceId,
        leaseId: api.leaseId,
        audience: api.channel,
        senderEmail: api.senderEmail,
      });
      if (refusal) {
        fail(refusal);
        return;
      }
      let composition = await readRenewalComposition(api.channel, api.leaseId);
      for (const waitMs of COMPOSITION_REREAD_WAITS_MS) {
        if (!compositionWaitsOnRead(composition.target)) break;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        composition = await readRenewalComposition(api.channel, api.leaseId);
      }
      if (composition.target.blockers?.length) {
        fail(`This message cannot be sent yet: ${composition.target.blockers.join(" ")}`);
        return;
      }
      if (epoch !== reviewEpoch.current) return;
      const carried = reloadAfter ? null : carriedSendTime(repair, clockNowMs());
      if (!reloadAfter) {
        setScheduleDate(carried?.date ?? "");
        setScheduleTime(carried?.time ?? "");
      }
      const rendered = renderEditableCommunicationBody(
        composition.initial.paragraphs,
        composition.initial.layout,
      );
      const sequence = read.sequence;
      setReview((previous) => ({
        mode: reloadAfter && previous ? previous.mode : "schedule",
        sequence,
        signatureParagraph: composition.signatureParagraph ?? null,
        noticeCycleId: composition.target.noticeCycleId ?? null,
        reviewedAtMs: clockNowMs(),
        // Known only once the confirmation saves the wording.
        reviewedDraftHash: "",
        reviewedTargetHash: composition.reviewedTargetHash,
        to: composition.target.to,
        cc: composition.target.cc,
        subject: composition.initial.subject,
        body: rendered.plainText,
        reviewedInputs: composition.target.reviewedInputs ?? null,
        changes: reloadAfter,
        // S276 R-S276-7: an update authorizes the one message it replaces, with no new follow-ups,
        // so the follow-up form has no starting read here.
        followUpStart: null,
        update: {
          sequenceId: sequence.id,
          version: sequence.version,
          context: sequence.context,
          initial: composition.initial,
          followUp: sequence.followUp,
          title: repair.primary?.label ?? unsentWords.review,
          carried: reloadAfter ? (previous?.update?.carried ?? false) : carried !== null,
        },
      }));
    } catch (error) {
      fail(
        error instanceof Error
          ? error.message
          : "The review could not be prepared. Nothing was sent.",
      );
    } finally {
      setBusy(false);
      if (reloadAfter) setReloading(false);
    }
  };

  /** S273 R-S273-3: "Cancel the scheduled offer", after its own confirmation. Nothing is sent. */
  async function cancelUnsent() {
    if (!repair || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const read = await json<{ sequence: CommunicationSequence }>(
        `/api/gmail-hub/sequences?id=${encodeURIComponent(repair.sequenceId)}`,
      );
      const sequence = read.sequence;
      if (
        sequence.id !== repair.sequenceId ||
        sequence.context.entityId !== api.leaseId ||
        sequence.confirmedCount !== 0 ||
        sequence.state === "completed" ||
        sequence.state === "cancelled"
      ) {
        setMessage(UNSENT_MESSAGE_WORDS.changedElsewhere);
        return;
      }
      await json("/api/gmail-hub/sequences", {
        action: "cancel",
        id: sequence.id,
        expectedVersion: sequence.version,
        operationId: crypto.randomUUID(),
      });
      setCancelOpen(false);
      setMessage(UNSENT_MESSAGE_WORDS.cancelled);
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The message was not cancelled. Reload the lease and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (
      !review ||
      unknownAuthorization ||
      reloading ||
      confirmLock.current ||
      (review.mode === "schedule" && !scheduleReady) ||
      (includesFollowUps && (!followUpPlan || !followUpMessage))
    )
      return;
    confirmLock.current = true;
    setBusy(true);
    setMessage("");
    setRefusedCommunication(null);
    let sendingId: string | null = null;
    // S274 R-S274-5: a refusal for a real change reloads this review in place after the request.
    let reloadAfter: readonly ChangedInput[] | null = null;
    // S273 R-S273-4: the update's wording save landed; a later failure leaves it held with the
    // new wording, and the step offers the retry.
    let updateSaved = false;
    try {
      let sequence = review.sequence;
      let reviewedDraftHash = review.reviewedDraftHash;
      if (review.update) {
        // S273 R-S273-4: the one confirmation saves the lease's current wording to the same
        // communication (its existing version check), then authorizes that exact end state below.
        // A save whose answer was lost is sent again as it was, so it is never applied twice.
        const update = review.update;
        const draft = {
          id: update.sequenceId,
          context: update.context,
          initial: update.initial,
          followUp: update.followUp,
        };
        const pending =
          updateSave.current &&
          JSON.stringify(updateSave.current.body.draft) === JSON.stringify(draft) &&
          updateSave.current.body.expectedVersion === update.version
            ? updateSave.current
            : {
                body: {
                  action: "save" as const,
                  draft,
                  expectedVersion: update.version,
                  operationId: crypto.randomUUID(),
                },
              };
        updateSave.current = pending;
        let saved: { sequence: CommunicationSequence; reviewedDraftHash: string };
        try {
          saved = await json<{
            sequence: CommunicationSequence;
            reviewedDraftHash: string;
          }>("/api/gmail-hub/sequences", pending.body);
        } catch (error) {
          if (!outcomeUnknown(error)) updateSave.current = null;
          throw error;
        }
        updateSave.current = null;
        updateSaved = true;
        sequence = saved.sequence;
        reviewedDraftHash = saved.reviewedDraftHash;
        // A second confirmation in this review saves over this exact version.
        setReview((previous) =>
          previous?.update
            ? {
                ...previous,
                sequence: saved.sequence,
                update: { ...previous.update, version: saved.sequence.version },
              }
            : previous,
        );
      }
      if (includesFollowUps && followUpPlan && followUpMessage) {
        const draft = {
          id: sequence.id,
          context: sequence.context,
          initial: sequence.initial,
          followUp: followUpMessage,
        };
        const pending = followUpSave.current ?? {
          body: {
            action: "save" as const,
            draft,
            expectedVersion: sequence.version,
            operationId: crypto.randomUUID(),
          },
        };
        if (JSON.stringify(pending.body.draft) !== JSON.stringify(draft)) {
          setMessage(
            "The prior save is unresolved. Reopen the current communication and review its saved wording.",
          );
          return;
        }
        followUpSave.current = pending;
        const saved = await json<{
          sequence: CommunicationSequence;
          reviewedDraftHash: string;
        }>("/api/gmail-hub/sequences", pending.body);
        sequence = saved.sequence;
        reviewedDraftHash = saved.reviewedDraftHash;
        // A reloaded review saves over this exact version of the draft.
        sequenceRef.current = { id: sequence.id, version: sequence.version };
      }
      sendingId = sequence.id;
      const result = await json<{ sequence: CommunicationSequence }>(
        "/api/gmail-hub/sequences",
        {
          action: review.mode,
          id: sequence.id,
          expectedVersion: sequence.version,
          operationId: crypto.randomUUID(),
          reviewedDraftHash,
          reviewedTargetHash: review.reviewedTargetHash,
          // S274 R-S274-5: only to name what changed; the server decides on the target hash.
          ...(review.reviewedInputs ? { reviewedInputs: review.reviewedInputs } : {}),
          schedule:
            review.mode === "schedule"
              ? {
                  firstDate: scheduleDate,
                  time: scheduleTime,
                  timeZone: BUSINESS_TIME_ZONE,
                  everyDays: null,
                  endDate: null,
                  sendLimit: 1,
                }
              : includesFollowUps
                ? (followUpPlan?.schedule ?? null)
                : null,
        },
      );
      sequenceRef.current = null;
      setReview(null);
      const accepted = (result.sequence.threads ?? []).length > 0;
      const next = result.sequence.nextDueAtMs;
      const nextFollowUp =
        accepted && includesFollowUps && next !== null && followUpPlan
          ? ` Next follow-up: ${formatZonedInstant(next, followUpPlan.schedule.timeZone)}.`
          : "";
      // S283 R-S283-1 (BEH-S283-1): the scheduled instant in the settled shape, its zone named.
      setMessage(
        // S273 R-S273-7: the stored time from the communication, in the settled date and time
        // format; the lease step reads the same stored time after a reload.
        review.mode === "schedule"
          ? scheduledStoredLine(result.sequence.nextDueAtMs)
          : accepted
            ? `Sent. Gmail accepted the message; the lease now waits on the reply.${nextFollowUp}`
            : "The send is recorded, and Gmail has not confirmed it yet. The lease says what happens next.",
      );

      router.refresh();
    } catch (error) {
      // S273 R-S273-4: the wording saved and the authorization did not; the lease reads the
      // communication as held with the new wording, and the step offers the retry.
      if (updateSaved) router.refresh();
      const refusal = refusalOf(error);
      if (refusal.code === LEASE_READ_NOT_SETTLED_CODE) {
        // S274 R-S274-3: the lease is still being re-read. The review keeps its content and its
        // confirm button; nothing was sent, scheduled or held.
        setMessage(LEASE_READ_NOT_SETTLED_MESSAGE);
      } else if (refusal.code === TARGET_CHANGED_CODE) {
        // S274 R-S274-5: a fact the review showed really changed. The review is read again in place
        // with each changed value marked, and needs one more confirmation.
        reloadAfter = refusal.changes;
      } else if (refusal.code === SEQUENCE_REFUSED_CODE && refusal.sequenceRefusal) {
        // S272 R-S272-6: one typed reason; its text derives in one place. Nothing was sent,
        // scheduled or written. A message already holding this renewal is named with its link.
        setMessage(sequenceRefusalMessage(refusal.sequenceRefusal));
        setRefusedCommunication(
          refusal.sequenceRefusal.reason === "unsent_message_exists"
            ? (refusal.sequenceRefusal.relatedSequenceId ?? null)
            : null,
        );
      } else {
        if (sendingId && outcomeUnknown(error)) setUnknownAuthorization(sendingId);
        setMessage(
          error instanceof Error
            ? `${error.message} Check the lease before trying again; nothing is sent twice.`
            : "The response did not arrive. Check the lease before trying again; nothing is sent twice.",
        );
      }
    } finally {
      confirmLock.current = false;
      setBusy(false);
    }
    if (reloadAfter)
      await (review.update
        ? prepareUpdateReview(reloadAfter)
        : prepareReview(review.mode, reloadAfter));
  }

  // R-S249-8: "Review and send" is the Now card's primary action while the step asks for its send.
  const runReview = (button: HTMLButtonElement) => {
    if (!ready) {
      if (offCycleHold) {
        // S282 R-S282-4: the fix opens the lease end date review on Check the numbers.
        focusRenewalDashboardControl(offCycleHold.fix.target);
      } else if (firstMissing?.key === "signature") {
        setSignatureOpen(true);
        requestAnimationFrame(() => {
          focusRenewalDashboardControl(MESSAGE_CONTROL_IDS.signature(api.channel), {
            focusContainer: true,
          });
        });
      } else if (firstMissing?.fix) {
        focusRenewalDashboardControl(firstMissing.fix.target);
      } else {
        focusRenewalDashboardControl(MESSAGE_CONTROL_IDS.readiness(api.channel));
      }
      return;
    }
    // Preparing the review can disable the button before the dialog opens.
    trigger.current = button;
    void prepareReview("send");
  };
  const reason =
    changedReview ||
    (ready
      ? null
      : api.outgoingReasons?.join(" ") ||
        (offCycleHold && missingWords.length === 0
          ? `${offCycleHold.text}.`
          : `Before sending, add ${missingWords.map((item) => item.missing).join(", ")}.`));
  // The Now card holds one stable action; it always runs the latest review step.
  const latestRun = useRef(runReview);
  useEffect(() => {
    latestRun.current = runReview;
  });
  const stableRun = useCallback(
    (button: HTMLButtonElement) => latestRun.current(button),
    [],
  );
  // S273 R-S273-3/R-S273-4: the held or out-of-date message's one action: its update review, or
  // its existing recovery in Communications.
  const runUnsent = (button: HTMLButtonElement) => {
    if (repair) {
      trigger.current = button;
      void prepareUpdateReview();
      return;
    }
    if (recovery)
      router.push(`/gmail-hub?communication=${encodeURIComponent(recovery.sequenceId)}`);
  };
  const latestUnsentRun = useRef(runUnsent);
  useEffect(() => {
    latestUnsentRun.current = runUnsent;
  });
  const stableUnsentRun = useCallback(
    (button: HTMLButtonElement) => latestUnsentRun.current(button),
    [],
  );
  const unsentPrimaryLabel = (repair ?? recovery)?.primary?.label ?? null;
  const unsentRepairs = Boolean(repair);
  useEffect(() => {
    if (!setPrimary) return;
    // S273: the held or out-of-date message's action is the step's one primary on the Now card.
    if (!full && unsentPrimaryLabel) {
      setPrimary(step, {
        label: unsentPrimaryLabel,
        run: stableUnsentRun,
        busy,
        disabled: busy || (unsentRepairs && !api.canEdit),
        reason: null,
        recipients,
      });
      return;
    }
    if (full || deliveryHeld) {
      setPrimary(step, null);
      return;
    }
    setPrimary(step, {
      label: reviewLabel,
      run: stableRun,
      busy,
      disabled: busy || !api.canEdit,
      reason,
      recipients,
    });
  }, [
    setPrimary,
    step,
    stableRun,
    busy,
    api.canEdit,
    reason,
    reviewLabel,
    full,
    deliveryHeld,
    unsentPrimaryLabel,
    unsentRepairs,
    stableUnsentRun,
    recipients,
  ]);
  useEffect(
    () => (setPrimary ? () => setPrimary(step, null) : undefined),
    [setPrimary, step],
  );

  if (!previewSlot && !inline) return null;
  const previewBlock = (
    <section
      aria-label={api.channel === "owner" ? "Owner message" : "Tenant offer"}
      className="ui-stack-tight renewal-now-message"
      data-renewal-message-revision={api.revision}
    >
      {repair?.secondary && api.canEdit ? (
        // S273 R-S273-3: the second action beside the repair, after its own confirmation.
        <p data-renewal-field="unsent-cancel">
          <Button
            disabled={busy}
            onClick={(event) => {
              cancelTrigger.current = event.currentTarget;
              setMessage("");
              setCancelOpen(true);
            }}
            size="compact"
            variant="secondary"
          >
            {repair.secondary.label}
          </Button>
        </p>
      ) : null}
      {api.channel === "owner" && live ? (
        <>
          <div className="ui-stack-tight">
            <label htmlFor={`${base}-reason`}>{KICKOFF_WORDS.reasonToInclude}</label>
            <input
              disabled={!api.canEdit}
              id={`${base}-reason`}
              maxLength={300}
              onBlur={api.commitReason}
              onChange={(event) => api.setReason(event.target.value)}
              placeholder="For example: current market conditions"
              value={api.reason}
            />
            <p className="muted">
              Placed in the message beside the rent, exactly as typed.
            </p>
            {reasonRefusal ? (
              <p data-renewal-field="reason-refused" role="alert">
                {reasonRefusal}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
      {ruleBasis ? (
        <p className="muted" data-renewal-field="tenant-offer-rule-basis">
          Basis for the rent: {ruleBasis}
        </p>
      ) : null}
      {api.earlierRule ? (
        // S250 R-S250-7: a rule change applies forward only; this message keeps its rule's rent.
        <div className="ui-stack-tight" data-renewal-field="message-earlier-rule">
          <p className="renewal-notice" role="note">
            {STANDING_AGREEMENT_WORDS.earlierRule}: this message keeps the rent from the
            earlier rule of {api.earlierRule.agreement} ({api.earlierRule.earlier}). The
            current rule is {api.earlierRule.current}.
          </p>
          {api.canEdit && api.rebuildRule ? (
            <p>
              <Button
                disabled={busy}
                onClick={() => void api.rebuildRule?.()}
                size="compact"
                variant="secondary"
              >
                {STANDING_AGREEMENT_WORDS.rebuild}
              </Button>
            </p>
          ) : null}
        </div>
      ) : null}
      {/* S264 R-S264-2: Review offer charges follows the working terms and leads the offer's
        own work, before the readiness list and the preview. */}
      {api.channel === "tenant" ? chargeReview : null}
      <ul
        aria-label="What sending needs"
        className="renewal-now-readiness"
        // S281 R-S281-12: a failing readiness line leads the step, so "Message" opens on its own.
        data-renewal-promote={!ready ? true : undefined}
      >
        {offCycleHold ? (
          <li data-renewal-ready="missing" data-renewal-readiness-key={offCycleHold.key}>
            {offCycleHold.text}
            {/* Like every first missing item, its fix is inline only while the step's own
                action is held; otherwise that action already names it. */}
            {deliveryHeld ? (
              <>
                {" "}
                <button
                  className="text-link"
                  data-renewal-fix-link
                  onClick={() => focusRenewalDashboardControl(offCycleHold.fix.target)}
                  type="button"
                >
                  {offCycleHold.fix.label}
                </button>
              </>
            ) : null}
          </li>
        ) : null}
        {needs.map((item) => (
          <li data-renewal-ready={item.ready ? "ready" : "missing"} key={item.key}>
            {!item.ready && "line" in item && item.line
              ? item.line
              : `${item.label}: ${item.ready ? "Ready" : `Missing ${item.missing ?? ""}`}`}
            {!item.ready &&
            item.key === "signature" &&
            (deliveryHeld || firstMissing?.key !== "signature") ? (
              <>
                {" "}
                <button
                  className="text-link"
                  id="renewal-now-signature"
                  onClick={() => setSignatureOpen(true)}
                  type="button"
                >
                  Set up your signature
                </button>
              </>
            ) : !item.ready &&
              item.fix &&
              (deliveryHeld || item.key !== firstMissing?.key) ? (
              <>
                {" "}
                <button
                  className="text-link"
                  data-renewal-fix-link
                  onClick={() => focusRenewalDashboardControl(item.fix!.target)}
                  type="button"
                >
                  {item.fix.label}
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {api.onSignatureSetupSaved && api.signaturePresent && !signatureOpen ? (
        <Button size="compact" variant="tertiary" onClick={() => setSignatureOpen(true)}>
          Edit signature
        </Button>
      ) : null}
      {api.outgoingReasons?.length ? (
        <ul aria-label="Requirements before outgoing work">
          {api.outgoingReasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {signatureOpen && api.onSignatureSetupSaved ? (
        <RenewalSenderSignatureForm
          id={MESSAGE_CONTROL_IDS.signature(api.channel)}
          onCancel={() => setSignatureOpen(false)}
          onSaved={async (choice) => {
            await api.onSignatureSetupSaved?.(choice);
            setSignatureOpen(false);
            setSignatureNotice(
              choice.signature ? "Signature saved." : "Blank signature saved.",
            );
          }}
        />
      ) : signatureOpen ? (
        // R-S249-11 / L45: a staff member with no signature sets one up here, on the lease.
        <form
          aria-label="Your signature"
          className="ui-stack-tight renewal-now-signature-form"
          data-renewal-signature-setup={api.channel}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const refusal = api.saveSignature(signature);
            if (refusal) {
              setSignatureNotice(refusal);
              const first =
                !signature.name.trim() || signature.name.trim().length > 240
                  ? "name"
                  : signature.role.trim().length > 240
                    ? "role"
                    : signature.phone.trim().length > 240
                      ? "phone"
                      : "name";
              document.getElementById(`${base}-sig-${first}`)?.focus();
            } else {
              setSignatureNotice(
                "Your signature is on this message. It saves with the message and is kept for your next lease.",
              );
              setSignatureOpen(false);
            }
          }}
        >
          {(
            [
              ["name", "Sender name"],
              ["role", "Approved role / organization (optional)"],
              ["phone", "Verified phone (optional)"],
            ] as const
          ).map(([field, label]) => (
            <Field
              htmlFor={`${base}-sig-${field}`}
              key={field}
              label={label}
              required={field === "name"}
            >
              <input
                id={`${base}-sig-${field}`}
                required={field === "name"}
                onChange={(event) =>
                  setSignature((previous) => ({
                    ...previous,
                    [field]: event.target.value,
                  }))
                }
                value={signature[field]}
              />
            </Field>
          ))}
          <div className="ui-row">
            <Button size="compact" type="submit">
              Save my signature
            </Button>
            <Button
              onClick={() => setSignatureOpen(false)}
              size="compact"
              variant="tertiary"
            >
              Not now
            </Button>
          </div>
        </form>
      ) : null}
      {signatureNotice ? (
        <p data-renewal-field="signature-notice" role="status">
          {signatureNotice}
        </p>
      ) : null}
      {api.wordingChangedSince ? (
        <div
          className="renewal-notice ui-stack-tight"
          data-renewal-field="wording-changed"
          // S281 R-S281-12: a wording fix leads the step, so "Message" opens on its own.
          data-renewal-promote
        >
          <p role="status">{STALE_REFINED_BODY_MESSAGE}</p>
          {api.canEdit && api.returnToStandardWording ? (
            <Button
              onClick={api.returnToStandardWording}
              size="compact"
              variant="secondary"
            >
              Return to the standard wording
            </Button>
          ) : null}
        </div>
      ) : null}
      {api.canEdit && api.canUndoWording && api.undoWording ? (
        <Button onClick={api.undoWording} size="compact" variant="secondary">
          Undo the last refinement
        </Button>
      ) : null}
      <div className="renewal-now-preview" data-renewal-field="message-preview">
        <p>
          <strong>To:</strong>{" "}
          {api.to ?? `No verified recipient yet. ${api.recipientReasons.join(" ")}`}
          {api.cc.length ? (
            <>
              {" "}
              <strong>Cc:</strong> {api.cc.join(", ")}
            </>
          ) : null}
        </p>
        <p>
          <strong>Subject:</strong> {api.subject}
        </p>
        <div
          aria-label="Message preview"
          className="renewal-message-preview"
          dangerouslySetInnerHTML={{ __html: api.htmlBody }}
          role="document"
        />
        <p className="muted" data-renewal-field="message-revision">
          Message revision {messageRevisionLabel(api.revision)}.{" "}
          {api.lastEditedAt
            ? `Last edited ${formatBusinessTimestamp(api.lastEditedAt)}.`
            : "Not edited yet; prepared from the lease facts."}
        </p>
      </div>
      {staleDraft ? (
        // R-S249-9: a Gmail draft never goes stale silently.
        <p className="renewal-notice" data-renewal-field="draft-older" role="note">
          {KICKOFF_WORDS.draftOlder} (draft revision{" "}
          {messageRevisionLabel(api.draft.createdRevision!)}, message revision{" "}
          {messageRevisionLabel(api.revision)}).{" "}
          <Button
            disabled={!api.draft.available || api.draft.pending}
            onClick={(event) => {
              trigger.current = event.currentTarget;
              void showDraftPreview();
            }}
            size="compact"
            variant="secondary"
          >
            {KICKOFF_WORDS.replaceDraft}
          </Button>
        </p>
      ) : api.draft.createdRevision ? (
        <p className="muted" data-renewal-field="draft-current">
          The unsent Gmail draft carries this message revision.
        </p>
      ) : null}
      {api.draft.earlierRemain ? (
        // R-S249-9: the app never deletes a Gmail draft, so a replaced one is named until the
        // staff member deletes it in Gmail.
        <p className="renewal-notice" data-renewal-field="draft-earlier" role="note">
          {KICKOFF_WORDS.earlierDraftRemains}
        </p>
      ) : null}
      {api.draft.recoveryRequired ? (
        <div
          className="renewal-notice ui-stack-tight"
          data-renewal-field="draft-recovery"
        >
          <p>
            Recover this exact attempt to confirm whether the Gmail draft exists. Copy
            remains available.
          </p>
          {api.draft.recover ? (
            <Button
              disabled={!api.canEdit || api.draft.pending || busy}
              onClick={() => {
                recoveringFocus.current = true;
                void api.draft.recover?.();
              }}
              ref={draftRecovery}
              size="compact"
              variant="secondary"
            >
              {api.draft.pending
                ? "Checking the exact Gmail attempt..."
                : "Recover exact Gmail attempt"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {changedReview ? <p role="status">{changedReview}</p> : null}
      {api.notice && api.notice !== message ? <p role="status">{api.notice}</p> : null}
    </section>
  );
  const actionsBlock = (
    <div className="ui-row renewal-now-delivery">
      <Button
        disabled={busy || !api.canEdit || !ready}
        onClick={(event) => {
          trigger.current = event.currentTarget;
          void prepareReview("schedule");
        }}
        size="compact"
        variant="secondary"
      >
        {KICKOFF_WORDS.schedule}
      </Button>
      <Button
        disabled={!api.draft.available || api.draft.pending || busy}
        onClick={(event) => {
          trigger.current = event.currentTarget;
          void showDraftPreview();
        }}
        size="compact"
        variant="secondary"
      >
        {KICKOFF_WORDS.createGmailDraft}
      </Button>
      <Button onClick={() => void api.copy()} size="compact" variant="secondary">
        {KICKOFF_WORDS.copy}
      </Button>
      <a
        className="text-link"
        data-renewal-field="composer-link"
        href={api.composerHref}
        // The composer opens with the saved message record; what is on screen is saved first.
        onClick={api.openComposer}
        rel="noopener noreferrer"
        target="_blank"
      >
        Open in Communications
      </a>
    </div>
  );
  // S281 R-S281-12: below the primary action, the message and its other ways to send are named
  // groups, closed on entry; "Message" opens on its own when a wording or readiness fix leads.
  // S281 R-S281-3: after a confirmed send neither group is rendered.
  const groups = sent ? null : (
    <>
      <RenewalSecondaryWork label={GUIDED_MESSAGE_GROUP_LABELS.message} stepId={step}>
        {previewBlock}
      </RenewalSecondaryWork>
      {!deliveryHeld ? (
        <RenewalSecondaryWork label={GUIDED_MESSAGE_GROUP_LABELS.otherWays} stepId={step}>
          {actionsBlock}
        </RenewalSecondaryWork>
      ) : null}
    </>
  );
  return (
    <>
      {inline ? (
        <div
          className="ui-stack-tight"
          data-renewal-message-sent={sent ? true : undefined}
          data-renewal-message-work={api.channel}
          ref={inlineRef}
        >
          {/* S281 R-S281-1: Full view's matching section shows the recipients before the
              primary; the Guided Now card shows them before its own primary. */}
          {full && !sent && recipients ? (
            <p data-renewal-field="full-recipients">{recipients}</p>
          ) : null}
          {!full ? null : unsentPrimaryLabel && (recovery || api.canEdit) ? (
            // S273 R-S273-3/R-S273-4: the held or out-of-date message's one action in Full view.
            <Button
              data-renewal-unsent-action={repair ? "update" : "open_communication"}
              data-renewal-work-primary
              busy={busy}
              onClick={(event) => runUnsent(event.currentTarget)}
            >
              {unsentPrimaryLabel}
            </Button>
          ) : !deliveryHeld && api.canEdit ? (
            <Button
              data-renewal-work-primary
              busy={busy}
              onClick={(event) => runReview(event.currentTarget)}
            >
              {reviewLabel}
            </Button>
          ) : null}
          {groups}
        </div>
      ) : previewSlot ? (
        createPortal(previewBlock, previewSlot)
      ) : null}
      {actionsSlot && !deliveryHeld ? createPortal(actionsBlock, actionsSlot) : null}
      {sent && inline ? (
        <SentMessageEvidence channel={api.channel} leaseId={api.leaseId} receipt={sent} />
      ) : null}
      <ConfirmationDialog
        busy={busy && !reloading}
        busyLabel={review?.mode === "schedule" ? "Scheduling…" : "Sending…"}
        className="renewal-review-dialog"
        confirmDisabled={
          !review ||
          reloading ||
          Boolean(unknownAuthorization) ||
          (review.mode === "schedule" && !scheduleReady) ||
          Boolean(includesFollowUps && !followUpPlan)
        }
        confirmLabel={
          review?.mode === "schedule"
            ? "Schedule this message"
            : includesFollowUps
              ? "Send offer now and authorize follow-ups"
              : "Send this message"
        }
        description="Review the exact message, recipients and sender. Confirming is the one step that sends or schedules it."
        error={review && message ? message : undefined}
        onCancel={() => {
          // A reload still in flight never reopens a review the person cancelled.
          reviewEpoch.current += 1;
          setReview(null);
        }}
        onConfirm={() => void confirm()}
        open={review !== null}
        startWithReview
        title={
          review?.update
            ? review.update.title
            : review?.mode === "schedule"
              ? "Review and schedule"
              : "Review and send"
        }
        triggerRef={trigger}
      >
        {review ? (
          <div className="ui-stack-tight" data-renewal-field="exact-review">
            {refusedCommunication ? (
              // S272 R-S272-3: open the communication that already holds this renewal.
              <p data-renewal-field="refused-communication">
                <a
                  href={`/gmail-hub?communication=${encodeURIComponent(refusedCommunication)}`}
                >
                  {SEQUENCE_REFUSAL_ACTION_LABELS.open_related}
                </a>
              </p>
            ) : null}
            {reloading ? (
              // S274 R-S274-5: confirm stays disabled while the review is read again.
              <p data-renewal-field="review-reloading" role="status">
                Loading the current message from the lease…
              </p>
            ) : review.changes ? (
              // S274 R-S274-5: each changed value with its previous value, from the server's read.
              <div
                className="renewal-notice ui-stack-tight"
                data-renewal-field="review-changed"
                role="status"
              >
                <p>
                  {TARGET_CHANGED_LEAD} The message below is current. Confirm again to{" "}
                  {review.mode === "schedule" ? "schedule" : "send"} it.
                </p>
                <ul aria-label="What changed">
                  {review.changes.map((change) => (
                    <li key={change.key}>{changedInputLine(change)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {/* S281 R-S281-2: the decision first: recipients, subject, the lease in staff
                terms, the amounts and dates the message states, then the timing; the message
                body last, in its own scroll area, with the buttons kept in view. */}
            <p data-renewal-field="review-recipients">
              From {review.sequence.senderEmail} · To {review.to.join(", ")}
              {review.cc.length ? ` · Cc ${review.cc.join(", ")}` : ""}
            </p>
            <p>
              <strong>{review.subject}</strong>
            </p>
            {api.leaseLabel ? (
              <p data-renewal-field="review-lease">{api.leaseLabel}</p>
            ) : null}
            <div className="ui-stack-tight" data-renewal-field="review-terms">
              {/* S277 R-S277-6 / R-S277-2: what the rent in this message rests on. */}
              {api.channel === "owner" && !api.renewOrNot ? (
                <RecommendationBasisLine
                  field="review-rent-basis"
                  proposal={preparation?.rent ?? null}
                />
              ) : api.channel === "tenant" ? (
                <WorkingBaseBasisLine field="review-rent-basis" />
              ) : null}
              {reviewDates ? (
                <p data-renewal-field="review-dates">{reviewDates}</p>
              ) : null}
            </div>
            {unknownAuthorization ? (
              <a
                href={`/gmail-hub?communication=${encodeURIComponent(unknownAuthorization)}`}
              >
                Open this communication to check the send
              </a>
            ) : null}
            {canIncludeFollowUps ? (
              <label>
                <input
                  type="checkbox"
                  checked={followUps}
                  disabled={busy}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    // S276 R-S276-7 (ARCH-S276-3): the first tick in this review fills the form
                    // from the one starting projection; a later tick keeps what staff typed.
                    if (checked && !followUpSeed) {
                      const start = followUpStartingValues({
                        subject: review?.subject ?? "",
                        start: review?.followUpStart ?? null,
                      });
                      setFollowUpSubject(start.subject);
                      setFollowUpBody(start.body);
                      setEveryDays(start.everyDays);
                      setFollowUpTime(start.time);
                      setFollowUpZone(start.timeZone);
                      setFollowUpEnd(start.endDate);
                      setFollowUpLimit(start.sendLimit);
                      setFollowUpSeed(start);
                    }
                    setFollowUps(checked);
                  }}
                />
                Authorize follow-ups after the tenant offer
              </label>
            ) : null}
            {includesFollowUps ? (
              <fieldset className="ui-stack-tight" disabled={busy}>
                <legend>Follow-up message and timing</legend>
                {followUpSeed ? (
                  <p data-renewal-field="follow-up-start">{followUpSeed.line}</p>
                ) : null}
                {followUpSeed && !followUpSeed.published ? (
                  <p data-renewal-field="follow-up-unpublished" role="note">
                    {FOLLOW_UP_START_WORDS.unpublished}
                  </p>
                ) : null}
                <label>
                  Follow-up subject{" "}
                  <input
                    value={followUpSubject}
                    maxLength={300}
                    onChange={(event) => setFollowUpSubject(event.target.value)}
                  />
                </label>
                <label>
                  Follow-up message{" "}
                  <textarea
                    value={followUpBody}
                    rows={4}
                    maxLength={20_000}
                    onChange={(event) => setFollowUpBody(event.target.value)}
                  />
                </label>
                {review.signatureParagraph ? (
                  <p>
                    Sender signature:{" "}
                    {review.signatureParagraph.map((run) => run.text).join("")}
                  </p>
                ) : (
                  <p>Saved blank signature</p>
                )}
                <p>Follow-up attachments: none</p>
                <label>
                  Every how many days{" "}
                  <input
                    type="number"
                    min={1}
                    max={366}
                    value={everyDays}
                    onChange={(event) => setEveryDays(event.target.value)}
                  />
                </label>
                <label>
                  Local send time{" "}
                  <input
                    type="time"
                    value={followUpTime}
                    onChange={(event) => setFollowUpTime(event.target.value)}
                  />
                </label>
                <label>
                  Timezone{" "}
                  <input
                    value={followUpZone}
                    onChange={(event) => setFollowUpZone(event.target.value)}
                  />
                </label>
                <label>
                  Inclusive end date{" "}
                  <input
                    type="date"
                    value={followUpEnd}
                    onChange={(event) => setFollowUpEnd(event.target.value)}
                  />
                </label>
                <label>
                  Total send limit, including the offer{" "}
                  <input
                    type="number"
                    min={2}
                    max={1000}
                    value={followUpLimit}
                    onChange={(event) => setFollowUpLimit(event.target.value)}
                  />
                </label>
                {followUpPlan ? (
                  <p role="status">
                    Expected first follow-up{" "}
                    {formatZonedInstant(followUpPlan.due, followUpPlan.schedule.timeZone)}
                    .
                    {followUpPlan.schedule.sendLimit
                      ? ` Up to ${followUpPlan.schedule.sendLimit - 1} follow-ups.`
                      : ""}{" "}
                    Follow-ups start after confirmed acceptance and pause on a verified
                    tenant reply.
                  </p>
                ) : (
                  <p>
                    Enter the complete message, recurrence and at least one stopping
                    bound.
                  </p>
                )}
              </fieldset>
            ) : null}
            {review.update ? (
              // S273 R-S273-4: the earlier date and time while still in the future; otherwise the
              // fields start empty and Send now is offered.
              <p data-renewal-field="update-timing">
                {review.mode === "schedule"
                  ? review.update.carried
                    ? UNSENT_MESSAGE_WORDS.carriedTime
                    : UNSENT_MESSAGE_WORDS.noCarriedTime
                  : null}{" "}
                <Button
                  disabled={busy || reloading}
                  onClick={() =>
                    setReview((previous) =>
                      previous
                        ? {
                            ...previous,
                            mode: previous.mode === "schedule" ? "send" : "schedule",
                          }
                        : previous,
                    )
                  }
                  size="compact"
                  variant="secondary"
                >
                  {review.mode === "schedule"
                    ? UNSENT_MESSAGE_WORDS.sendNow
                    : UNSENT_MESSAGE_WORDS.scheduleInstead}
                </Button>
              </p>
            ) : null}
            {review.mode === "schedule" ? (
              <div className="ui-row">
                <Field
                  error={scheduleDate ? undefined : "Choose a send date."}
                  htmlFor={`${base}-schedule-date`}
                  label="Date"
                  required
                >
                  <input
                    disabled={busy}
                    onChange={(event) => setScheduleDate(event.target.value)}
                    type="date"
                    value={scheduleDate}
                  />
                </Field>
                <Field
                  error={scheduleTime ? undefined : "Choose a send time."}
                  htmlFor={`${base}-schedule-time`}
                  label="Time (Central)"
                  required
                >
                  <input
                    disabled={busy}
                    onChange={(event) => setScheduleTime(event.target.value)}
                    type="time"
                    value={scheduleTime}
                  />
                </Field>
              </div>
            ) : null}
            <div
              aria-label="Message body"
              className="draft-box renewal-review-body"
              data-renewal-field="review-body"
              role="region"
              tabIndex={0}
            >
              {review.body}
            </div>
          </div>
        ) : null}
      </ConfirmationDialog>
      <ConfirmationDialog
        busy={api.draft.pending}
        fallbackFocusRef={draftRecovery}
        busyLabel="Working…"
        confirmDisabled={!api.draft.preview}
        confirmLabel="Create this unsent draft"
        description="Review the exact unsent draft. Confirming creates it in the displayed managed mailbox. Nothing is sent; a person sends it from Gmail."
        onCancel={() => {
          closeDraft();
          api.draft.cancel();
        }}
        onAfterClose={finishDraftRecovery}
        onConfirm={() => {
          void api.draft.create().then(closeDraft);
        }}
        open={draftOpen}
        startWithReview
        title={staleDraft ? KICKOFF_WORDS.replaceDraft : KICKOFF_WORDS.createGmailDraft}
        triggerRef={trigger}
      >
        {api.draft.preview ? (
          <div className="ui-stack-tight" data-renewal-field="draft-review">
            <p>
              From {api.senderEmail} · To {api.draft.preview.to}
            </p>
            <p>
              <strong>{api.draft.preview.subject}</strong>
            </p>
            <div className="draft-box">{api.draft.preview.body}</div>
            {staleDraft ? (
              <p role="note">
                The earlier draft stays in Gmail until you delete it there; send only this
                one.
              </p>
            ) : null}
          </div>
        ) : (
          <p role="status">{api.notice || "Preparing the exact draft for review…"}</p>
        )}
      </ConfirmationDialog>
      {repair?.secondary ? (
        // S273 R-S273-3: cancelling the scheduled or held message is its own confirmed action.
        <ConfirmationDialog
          busy={busy}
          busyLabel="Cancelling…"
          confirmLabel={repair.secondary.label}
          confirmVariant="destructive"
          description={UNSENT_MESSAGE_WORDS.cancelDescription}
          error={cancelOpen && message ? message : undefined}
          onCancel={() => setCancelOpen(false)}
          onConfirm={() => void cancelUnsent()}
          open={cancelOpen}
          title={unsentWords.cancelTitle}
          triggerRef={cancelTrigger}
        >
          {repair.line ? <p>{repair.line}</p> : null}
        </ConfirmationDialog>
      ) : null}
    </>
  );
}
