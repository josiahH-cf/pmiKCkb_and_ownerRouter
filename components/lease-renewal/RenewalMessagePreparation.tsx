"use client";

import { RenewalSenderSignatureForm } from "./RenewalSenderSignatureForm";
import type {
  SenderSignatureChoice,
  SenderSignatureEvidence,
} from "@/lib/lease-renewal/sender-signature-choice";
import { Icon as MessageCopyIcon } from "@/components/ui";
import type { CommunicationSequence } from "@/lib/gmail-hub/sequence-model";
import type { UnsentMessageView } from "@/lib/lease-renewal/unsent-message";
import {
  describeSequenceState,
  SEQUENCE_PAUSE_CAUSE_LABELS,
} from "@/lib/gmail-hub/communication-state";
import { useMinuteClock } from "@/components/hooks/useMinuteClock";
import { describeNextDue } from "@/lib/gmail-hub/schedule-calendar";
import { workflowComposerHref } from "@/lib/gmail-hub/composer-navigation";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { boundedLocalWait, LocalWaitError } from "@/lib/ui/local-lifetime";
import { formatBusinessTimestamp } from "@/lib/date-display";

import { renewalCardTitle } from "@/components/lease-renewal/RenewalSectionHeading";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
  type ExternalDeskDestination,
} from "@/lib/lease-renewal/desk-destinations";
import { Button, Card, Field } from "@/components/ui";
import { DownloadLink } from "@/components/ui/DownloadLink";
import {
  AUTOSAVE_EDITED,
  AUTOSAVE_IDLE,
  AutosaveStatus,
  type AutosaveState,
} from "@/components/lease-renewal/AutosaveStatus";
import { useRenewalManualWorkspace } from "@/components/lease-renewal/RenewalManualWorkspace";
import { useRenewalWorkingRecord } from "@/components/lease-renewal/RenewalWorkingRecord";
import { useRenewalPolicy } from "@/components/lease-renewal/RenewalPolicyContext";
import {
  policyMessageGates,
  projectPolicyApplicability,
} from "@/lib/lease-renewal/policy-content";
import {
  focusRenewalDashboardControl,
  isRenewalPresentationMove,
} from "@/components/lease-renewal/RenewalDashboardNavigation";
import {
  composeRenewalMessage,
  markedValuesIn,
  MESSAGE_CHARGES,
  MessageChargeSchema,
  RenewalMessageEditsSchema,
  ownerCopyStatesTerm,
  responseRequestParagraph,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import {
  MESSAGE_CONTROL_IDS,
  OFFER_DATE_FIX_FIELDS,
  projectMessageReadiness,
  type MessageMissingInput,
} from "@/lib/lease-renewal/message-readiness";
import { startDateFixFromOffer } from "./RenewalDateProposal";
import { OwnerWordingPublication, type OwnerCopyView } from "./OwnerWordingPublication";
import {
  OfferCaseEntrySchema,
  OfferChargeDecisionSchema,
  OfferChargeSelectionSchema,
  emptyOfferChargeSelection,
  projectOfferCharges,
  type OfferChargeReview,
  type OfferChargeSelection,
  type OfferChargeSource,
} from "@/lib/lease-renewal/offer-charges";
import type { OfferChargeMappingsRead } from "@/lib/lease-renewal/offer-charge-mapping";
import {
  RenewalOfferChargeAdd,
  RenewalOfferCharges,
  useOfferChargeEvidenceHost,
} from "./RenewalOfferCharges";
import { offerChargesPriority } from "@/lib/lease-renewal/offer-charges-priority";
import { offerAnswersViewOf } from "./RenewalOfferAnswers";
import type { OfferAnswersView } from "@/lib/lease-renewal/offer-answers";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
import {
  emptyMessagePreparationInputs,
  RecommendationReasonSchema,
  MessagePreparationInputsSchema,
  type MessagePreparationInputs,
  type MessagePreparationRecord,
  type MessageRuleBasis,
} from "@/lib/lease-renewal/renewal-message-preparation";
import {
  RenewalNoticeDraftOutcomeSchema,
  type RenewalNoticeDraftOutcome,
} from "@/lib/lease-renewal/execution/renewal-notice-draft-contract";
import { formatRecipientsForCopy } from "@/lib/lease-renewal/recipient-resolution";
import { GEMINI_IN_GMAIL_HINT } from "@/lib/email-refinement/hint";
import { RefineWithAi } from "@/components/email/RefineWithAi";
import {
  gmailDraftSignal,
  gmailDraftMessageRevisionOf,
  messageRevisionOf,
} from "@/lib/lease-renewal/message-revision";
import {
  adoptedStandingRule,
  standingAdoptionSave,
} from "@/lib/lease-renewal/standing-agreement";
import {
  nowSlotKey,
  useRenewalNowCard,
  type NowCardResourceLead,
} from "./RenewalNowCardContext";
import {
  workingFieldLabel,
  messageWorkingFieldsFor,
} from "@/lib/lease-renewal/working-record";
import { focusWorkingField } from "./WorkingFieldEditor";
import {
  PreparedMessageSlot,
  draftPreviewWaitsOnGeneration,
  previewAgainWhileGenerationReplaced,
  type PreparedMessageData,
  type PreparedSignatureFields,
} from "@/components/lease-renewal/RenewalPreparedMessage";
import {
  AuthoredSubjectSchema,
  RefinedBodySchema,
  STALE_REFINED_BODY_MESSAGE,
  UNREADABLE_REFINED_BODY_MESSAGE,
  applyAuthoredSubject,
  applyRefinedBody,
  type RefinedBody,
  type RefinedBodyState,
} from "@/lib/lease-renewal/refined-message";

interface ChargeInventoryLine {
  id: string;
  label: string;
  amount: number;
  frequency: number;
  startDate: string | null;
  current: boolean | null;
  sourceRef: string;
}

interface Preparation {
  /** S116: the complete same-audience recipient set, or the refusal a person resolves at the source. */
  recipients?:
    | { status: "ready"; to: string; cc: string[] }
    | { status: "blocked"; reasons: string[] };
  destinations?: {
    gmailDrafts: ExternalDeskDestination | null;
    lease: ExternalDeskDestination | null;
    messages: ExternalDeskDestination | null;
    owners: Array<{
      name: string;
      record: ExternalDeskDestination;
      messages: ExternalDeskDestination;
    }>;
  };
  previousDraftAttempts?: Array<{
    executionId: string;
    cycleId: string;
    state: string;
    recoveryAvailable: boolean;
  }>;
  availableCompScreenshot?: {
    receiptId: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
  } | null;
  draftAttempt: {
    executionId: string;
    state: string;
    recoveryAvailable: boolean;
    outcome: RenewalNoticeDraftOutcome | null;
    /** The exact draft the attempt prepared; its revision says whether it is older (S249). */
    preview?: { subject: string; body: string } | null;
  } | null;
  /**
   * S249 R-S249-9: the last Gmail draft whose creation is recorded, and how many earlier created
   * drafts it replaced (each still in the sender's Gmail). The draft head above moves to a new
   * attempt as soon as it is previewed, so the "older" signal reads this.
   */
  createdDrafts?: {
    latest: { executionId: string; subject: string; body: string; recordedAt: string };
    earlier: number;
  } | null;
  /** S249 ARCH-S249-2: the saved message record's revision. */
  messageRevision?: string;
  /** S250 R-S250-7: the agreement rule the shown rent was built on; every save carries it. */
  ruleBasis?: MessageRuleBasis | null;
  /** S250 R-S250-7: the message keeps an earlier rule's rent; the current one is offered. */
  earlierRule?: {
    agreement: string;
    earlier: string;
    current: string;
    currentRent: number;
    currentBasis: MessageRuleBasis;
  } | null;
  senderEmail: string;
  /** The work record this message is stored under; null until its first save establishes one. */
  cycleId: string | null;
  saved: MessagePreparationRecord | null;
  inputs: MessagePreparationInputs;
  facts: RenewalMessageFacts;
  /** The server's own callout for the saved message; a more specific wording is carried over. */
  content?: { missing?: Array<{ field: string; message: string }> };
  sourceFingerprint: string;
  signatureMatchesActor: boolean;
  priorSenderWording?: string | null;
  signatureSetup?: SenderSignatureEvidence | null;
  outgoingReasons?: readonly string[];
  /** S120: where the current signature came from. */
  signatureOrigin?:
    | { kind: "none" }
    | { kind: "saved" }
    | { kind: "retained_sender"; recordedAt: string }
    | { kind: "business_profile"; recordedAt: string; version: number };
  /** S120: the signed-in sender's own retained signature, if any. */
  retainedSignature?: MessagePreparationInputs["signature"] | null;
  /** S120: current non-rent recurring charges a person may deliberately fill a charge from. */
  chargeInventory?: ChargeInventoryLine[] | null;
  /**
   * S264: what the tenant offer's charge review is resolved from (the RentVine lines and the
   * approved mappings), the review saved with this revision, the server's projection and the
   * exact offer snapshot's identity. Absent for the owner message.
   */
  offerCharges?: {
    source: OfferChargeSource;
    mappings: OfferChargeMappingsRead;
    saved: OfferChargeSelection | null;
    review: OfferChargeReview;
    snapshotId: string;
    snapshotHash: string;
  } | null;
  /**
   * S264 R-S264-6: the offers a tenant decision can name and each recorded answer's coverage of
   * the current offer. Absent for the owner message; null when it could not be read.
   */
  offerAnswers?: OfferAnswersView | null;
  publication: { status: string; ref?: string; reason?: string };
  /** S285 R-S285-6: the owner copy version in use and the approver's publication control. */
  ownerCopy?: OwnerCopyView | null;
  /** S139/S161: the saved authored body and whether the facts changed after it was written. */
  bodyOverride?: RefinedBodyState | null;
  /** Hash of the body composed from the current facts; authored wording records it. */
  bodyBaseHash?: string;
  /** S161: the saved authored subject, or null for the composed subject. */
  subjectOverride?: string | null;
  notices: string[];
  /** S129/S161: policy notes for this audience, listed as information. */
  policyGates?: Array<{ field: string; message: string }>;
}

import { RenewalSecondaryWork, useRenewalOutcomeStage } from "./RenewalGuidedView";
import {
  applyTenantResourceInclusion,
  type TenantResourceInclusion,
} from "@/lib/lease-renewal/tenant-resource-inclusion";
import type { RenewalStageContext } from "@/lib/lease-renewal/renewal-stage";
import {
  GUIDED_SECONDARY_WORK_LABELS,
  includedResourceFix,
} from "@/lib/lease-renewal/guided-priority";
import {
  offCycleReadinessItem,
  type OffCycleReadinessItem,
} from "@/lib/lease-renewal/off-cycle-review";

type MessageOwnerProps = Readonly<{
  channel: "owner" | "tenant";
  canEdit: boolean;
  /** S265: whether the viewer maintains shared resource links (Admin); others read the handoff. */
  canManageResources?: boolean;
  /**
   * S270: the outcome's other secondary work (its outreach or contact records). With it, the
   * message options and these records share the outcome's one named group.
   */
  secondaryWork?: ReactNode;
  /** S270: Ask the owner's Working renewal terms reveal, in Work above the named group. */
  workingTerms?: ReactNode;
}>;

export function RenewalMessagePreparation({
  outcomeContext,
  ...props
}: MessageOwnerProps & { outcomeContext?: RenewalStageContext }) {
  return outcomeContext ? (
    <OutcomeMessagePreparation {...props} context={outcomeContext} />
  ) : (
    <MessageOwner {...props} />
  );
}

function OutcomeMessagePreparation({
  context,
  ...props
}: MessageOwnerProps & { context: RenewalStageContext }) {
  const { stage } = useRenewalOutcomeStage(context);
  const stepId = props.channel === "owner" ? "ask-owner" : "offer-tenant";
  const step = stage.steps.find((item) => item.id === stepId);
  const evidence = stage.evidence[props.channel];
  const waiting =
    step?.state === "waiting" || step?.state === "done" || step?.state === "covered";
  // S273 R-S273-3: a held or out-of-date message holds the step's send actions; its own repair or
  // recovery takes their place, so no second message is started beside it.
  const unsent = step?.unsent ?? null;
  const hold = Boolean(
    evidence?.unconfirmedSequenceId ||
    step?.scheduled ||
    unsent ||
    waiting ||
    (stage.currentStepId === stepId && stage.blocker),
  );
  // S282 ARCH-S282-3: the readiness list reads the same off-cycle blocker the Now card reads.
  const offCycleHold = offCycleReadinessItem(stage.blocker);
  const sequenceId =
    props.channel === "tenant"
      ? (evidence?.unconfirmedSequenceId ??
        evidence?.derived?.sequenceId ??
        evidence?.replySequenceId)
      : null;
  return (
    <>
      {sequenceId ? (
        <TenantOfferProgress sequenceId={sequenceId} leaseId={context.leaseId} />
      ) : null}
      <MessageOwner
        {...props}
        compact
        deliveryHeld={hold}
        offCycleHold={offCycleHold}
        unsent={unsent}
      />
    </>
  );
}

function TenantOfferProgress({
  sequenceId,
  leaseId,
}: Readonly<{ sequenceId: string; leaseId: string }>) {
  const [readback, setReadback] = useState<{
    id: string;
    sequence: CommunicationSequence | null;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/gmail-hub/sequences?id=${encodeURIComponent(sequenceId)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sequence unavailable.");
        const { sequence } = (await response.json()) as {
          sequence: CommunicationSequence;
        };
        if (
          sequence.id !== sequenceId ||
          sequence.context.entityId !== leaseId ||
          sequence.context.purpose !== "renewal_tenant"
        )
          throw new Error("Sequence scope changed.");
        if (!controller.signal.aborted) setReadback({ id: sequenceId, sequence });
      })
      .catch(() => {
        if (!controller.signal.aborted) setReadback({ id: sequenceId, sequence: null });
      });
    return () => controller.abort();
  }, [sequenceId, leaseId]);
  const nowMs = useMinuteClock();
  const sequence = readback?.id === sequenceId ? readback.sequence : null;
  const summary = sequence
    ? describeSequenceState({ ...sequence, scheduled: sequence.nextDueAtMs !== null })
    : null;
  return (
    <section className="ui-stack-tight" aria-label="Tenant delivery and follow-ups">
      {summary ? (
        <p>
          {summary.label} · {summary.confirmed}
        </p>
      ) : (
        <p>Current delivery details require a read.</p>
      )}
      {sequence?.lastSentAtMs ? (
        <p>Last confirmed send {formatBusinessTimestamp(sequence.lastSentAtMs)}.</p>
      ) : null}
      {sequence?.pause ? (
        <p>{SEQUENCE_PAUSE_CAUSE_LABELS[sequence.pause.cause]}</p>
      ) : null}
      {sequence?.nextDueAtMs &&
      sequence.authorization?.schedule &&
      sequence.confirmedCount > 0 &&
      nowMs !== null ? (
        <p>
          {describeNextDue(
            sequence.nextDueAtMs,
            sequence.authorization.schedule.timeZone,
            nowMs,
          )}
        </p>
      ) : null}
      <a
        className="text-link"
        href={`/gmail-hub?communication=${encodeURIComponent(sequenceId)}`}
      >
        Review this tenant communication
      </a>
    </section>
  );
}

function MessageOwner({
  channel,
  canEdit,
  canManageResources,
  compact = false,
  deliveryHeld = false,
  offCycleHold = null,
  unsent = null,
  secondaryWork,
  workingTerms,
}: MessageOwnerProps & {
  compact?: boolean;
  deliveryHeld?: boolean;
  /** S282 R-S282-4: the off-cycle end date row the readiness list shows while the hold stands. */
  offCycleHold?: OffCycleReadinessItem | null;
  /** S273 R-S273-3: the step's held or out-of-date unsent message, from the stage projection. */
  unsent?: UnsentMessageView | null;
}) {
  const context = useRenewalManualWorkspace();
  const working = useRenewalWorkingRecord();
  return context ? (
    <MessagePreparationEditor
      key={`${context.leaseId}:${channel}`}
      leaseId={context.leaseId}
      refreshBasis={`${context.state?.cycleId}:${context.state?.revision}:${context.state?.termsRevision}:${context.state?.preparation?.revision}:${working?.record?.revision ?? 0}`}
      channel={channel}
      canEdit={canEdit}
      canManageResources={canManageResources}
      compact={compact}
      deliveryHeld={deliveryHeld}
      offCycleHold={offCycleHold}
      unsent={unsent}
      secondaryWork={secondaryWork}
      workingTerms={workingTerms}
    />
  ) : (
    <>
      {workingTerms}
      {secondaryWork}
    </>
  );
}

/** The server's saved authored body as editor state. */
function savedOverride(saved: RefinedBodyState | null): {
  override: RefinedBody | null;
  state: RefinedBodyState["state"] | null;
} {
  return {
    override:
      saved && saved.state !== "unreadable"
        ? { text: saved.text, baseHash: saved.baseHash }
        : null,
    state: saved?.state ?? null,
  };
}

function externalLink(destination: ExternalDeskDestination, text: string) {
  return (
    <a
      href={destination.href}
      target={EXTERNAL_LINK_TARGET}
      rel={EXTERNAL_LINK_REL}
      title={destination.label}
    >
      {text}
    </a>
  );
}

/** Key-order independent comparison of saved and local values. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        )
      : entry,
  );
}

/** S161 (R-S161-5): a source staff leave blank is their own entry here; it is never asked for. */
const STAFF_ENTRY_SOURCE = "Staff entry on the message";
const NO_BASE_HASH = "0".repeat(64);
const STALE_ATTACHMENT_MESSAGE =
  "The selected screenshot is no longer the current one, so it is left off this message. Choose the current screenshot or clear the selection.";

/**
 * The inputs as they would be saved now. A finished entry is taken as typed. An unfinished or
 * unusable entry stays in its control, is named in `unfinished`, and falls back to its last saved
 * value here, so one half-typed field never holds back the rest of the message (S155).
 */
function savableInputs(
  raw: MessagePreparationInputs,
  saved: MessagePreparationInputs,
): { inputs: MessagePreparationInputs; unfinished: string[] } {
  const unfinished: string[] = [];
  const sourceOr = (value: string | null | undefined) =>
    value?.trim() || STAFF_ENTRY_SOURCE;
  const edits = RenewalMessageEditsSchema.safeParse(raw.edits);
  if (!edits.success) unfinished.push("Response request wording");
  const charges = raw.charges.map((charge) => {
    const parsed = MessageChargeSchema.safeParse({
      ...charge,
      source: charge.source?.trim() || null,
    });
    if (parsed.success) return parsed.data;
    unfinished.push(`${MESSAGE_CHARGES[charge.id]} charge`);
    return (
      saved.charges.find((value) => value.id === charge.id) ?? {
        id: charge.id,
        applicable: null,
        amount: null,
        cadence: null,
        effectiveDate: null,
        source: null,
        comparison: "unverified" as const,
      }
    );
  });
  let signature = saved.signature;
  const typed = raw.signature;
  if (!typed || !Object.values({ ...typed, source: "" }).some(Boolean)) signature = null;
  else {
    const parsed = MessagePreparationInputsSchema.shape.signature.safeParse({
      ...typed,
      source: sourceOr(typed.source),
      website: typed.website
        ? { url: typed.website.url, source: sourceOr(typed.website.source) }
        : null,
    });
    if (parsed.success) signature = parsed.data;
    else unfinished.push("Sender signature");
  }
  // S249 R-S249-6: the optional one-line reason; blank is no reason, an unusable one is unfinished.
  let recommendationReason = saved.recommendationReason ?? null;
  const typedReason = raw.recommendationReason?.trim() ?? "";
  if (!typedReason) recommendationReason = null;
  else {
    const parsed = RecommendationReasonSchema.safeParse(typedReason);
    if (parsed.success) recommendationReason = parsed.data;
    else unfinished.push("Reason to include");
  }
  return {
    inputs: {
      edits: edits.success ? edits.data : saved.edits,
      compScreenshotReceiptId: raw.compScreenshotReceiptId,
      charges,
      leaseOrigin: raw.leaseOrigin
        ? { kind: raw.leaseOrigin.kind, source: sourceOr(raw.leaseOrigin.source) }
        : null,
      insuranceTransition: raw.insuranceTransition
        ? {
            applicable: raw.insuranceTransition.applicable,
            source: sourceOr(raw.insuranceTransition.source),
          }
        : null,
      otherChargesComparison: raw.otherChargesComparison
        ? {
            unchanged: raw.otherChargesComparison.unchanged,
            source: sourceOr(raw.otherChargesComparison.source),
          }
        : null,
      signature,
      // Present only when there is one, so a message without a reason saves exactly as before.
      ...(recommendationReason ? { recommendationReason } : {}),
    },
    unfinished,
  };
}

interface LocalMessage {
  inputs: MessagePreparationInputs;
  override: RefinedBody | null;
  subjectText: string | null;
  /** S264: the tenant offer's charge review as entered here; null for the owner message. */
  offerCharges?: OfferChargeSelection | null;
}

/**
 * S264: the charge review as it would be saved now. A finished entry is taken as entered; an
 * unfinished one (a reason or source too short to keep) falls back to its saved value and is
 * named, so one half-typed field never holds back the rest of the review.
 */
function savableOfferCharges(
  raw: OfferChargeSelection,
  saved: OfferChargeSelection,
): { selection: OfferChargeSelection; unfinished: boolean } {
  let unfinished = false;
  const decisions = raw.decisions.flatMap((decision) => {
    const parsed = OfferChargeDecisionSchema.safeParse(decision);
    if (parsed.success) return [parsed.data];
    unfinished = true;
    return saved.decisions.filter((entry) => entry.rowKey === decision.rowKey);
  });
  const caseEntries = raw.caseEntries.flatMap((entry) => {
    const parsed = OfferCaseEntrySchema.safeParse(entry);
    if (parsed.success) return [parsed.data];
    unfinished = true;
    return saved.caseEntries.filter((value) => value.id === entry.id);
  });
  const transitions = OfferChargeSelectionSchema.shape.transitions.safeParse(
    raw.transitions,
  );
  if (!transitions.success) unfinished = true;
  const selection = OfferChargeSelectionSchema.safeParse({
    decisions,
    caseEntries,
    transitions: transitions.success ? transitions.data : saved.transitions,
  });
  return selection.success
    ? { selection: selection.data, unfinished }
    : { selection: saved, unfinished: true };
}

/** What one save would store for the local message, and what is still unfinished in it. */
function savePayload(
  local: LocalMessage,
  server: Preparation,
  /** S250 R-S250-7: a rebuild names the current rule; otherwise the rule shown is kept. */
  ruleBasis: MessageRuleBasis | null = server.ruleBasis ?? null,
) {
  const effective = savableInputs(local.inputs, server.inputs);
  const unfinished = [...effective.unfinished];
  // S264: the charge review saves with the tenant message through this same save.
  const offer = server.offerCharges
    ? savableOfferCharges(
        local.offerCharges ?? server.offerCharges.saved ?? emptyOfferChargeSelection(),
        server.offerCharges.saved ?? emptyOfferChargeSelection(),
      )
    : null;
  if (offer?.unfinished) unfinished.push("Review offer charges");
  const savedBody = savedOverride(server.bodyOverride ?? null).override;
  // Blank wording is not authored wording: the text then follows the standard wording.
  const body = local.override?.text.trim()
    ? RefinedBodySchema.safeParse(local.override)
    : null;
  const subject = local.subjectText?.trim()
    ? AuthoredSubjectSchema.safeParse(local.subjectText)
    : null;
  if (body && !body.success) unfinished.push("Email body");
  if (subject && !subject.success) unfinished.push("Subject");
  return {
    effective: effective.inputs,
    unfinished,
    /** S264: the charge review as it would be saved now, and whether part of it is unfinished. */
    offerCharges: offer?.selection ?? null,
    offerChargesUnfinished: Boolean(offer?.unfinished),
    /** The wording itself cannot be stored as typed, so a draft of it is not prepared yet. */
    wordingUnfinished: Boolean((body && !body.success) || (subject && !subject.success)),
    value: {
      inputs: effective.inputs,
      bodyOverride: body ? (body.success ? body.data : savedBody) : null,
      subjectOverride: subject
        ? subject.success
          ? subject.data
          : (server.subjectOverride ?? null)
        : null,
      ruleBasis,
      ...(offer ? { offerCharges: offer.selection } : {}),
    },
  };
}

/** The server's saved message in the same shape a save would send, for change detection. */
function savedPayload(server: Preparation): string {
  return canonical(
    savePayload(
      {
        inputs: server.inputs,
        override: savedOverride(server.bodyOverride ?? null).override,
        subjectText: server.subjectOverride ?? null,
        offerCharges: server.offerCharges?.saved ?? null,
      },
      server,
    ).value,
  );
}

/**
 * The message as entered here. S264: the charge review the editor shows is the server's source
 * lines and mappings with the review as entered here, through the same projection the server uses.
 */
function composedPreparation(
  current: Preparation,
  { inputs, override, subjectText, offerCharges }: LocalMessage,
  leaseId?: string,
) {
  const payload = current
    ? savePayload({ inputs, override, subjectText, offerCharges }, current)
    : null;
  let content: ReturnType<typeof composeRenewalMessage> | null = null;
  let offerReview: OfferChargeReview | null = null;
  let facts: RenewalMessageFacts | null = null;
  if (current && payload) {
    const effective = payload.effective;
    offerReview = current.offerCharges
      ? projectOfferCharges({
          leaseId: leaseId ?? "",
          source: current.offerCharges.source,
          mappings: current.offerCharges.mappings,
          selection: payload.offerCharges,
          terms: current.facts.ownerTerms
            ? {
                rent: current.facts.ownerTerms.rent,
                effectiveDate: current.facts.ownerTerms.effectiveDate,
              }
            : null,
          legacyCharges: effective.charges,
          legacyInsuranceTransition: effective.insuranceTransition,
          legacyOtherChargesComparison: effective.otherChargesComparison,
        })
      : null;
    facts = {
      ...current.facts,
      ...(offerReview
        ? {
            offerCharges: offerReview.composition,
            resourceDecisions: offerReview.decisions,
          }
        : {}),
    };
    content = composeRenewalMessage(
      {
        ...facts,
        attachments:
          inputs.compScreenshotReceiptId &&
          inputs.compScreenshotReceiptId === current.availableCompScreenshot?.receiptId
            ? [
                {
                  filename: current.availableCompScreenshot.filename,
                  source: `comp-screenshot-receipt:${inputs.compScreenshotReceiptId}`,
                },
              ]
            : [],
        charges: effective.charges,
        recommendationReason: effective.recommendationReason ?? null,
        leaseOrigin: effective.leaseOrigin,
        insuranceTransition: effective.insuranceTransition,
        otherChargesComparison: effective.otherChargesComparison,
        signature: effective.signature
          ? {
              ...effective.signature,
              email:
                current.signatureSetup !== undefined ||
                current.signatureMatchesActor ||
                canonical(effective.signature) !==
                  canonical(current.saved?.inputs.signature ?? null)
                  ? current.senderEmail
                  : (current.saved?.signatureEmail ?? current.senderEmail),
            }
          : null,
      },
      effective.edits,
    );
    const serverRange = current.content?.missing?.find(
      (entry) => entry.field === "range",
    );
    const localRange = content.missing.find((entry) => entry.field === "range");
    if (serverRange && localRange) localRange.message = serverRange.message;
    if (
      inputs.compScreenshotReceiptId &&
      inputs.compScreenshotReceiptId !== current.availableCompScreenshot?.receiptId
    )
      content.missing.push({ field: "attachment", message: STALE_ATTACHMENT_MESSAGE });
  }
  // S161 (R-S161-7): authored wording is the body exactly as written, also after the information
  // it started from changed. Only a deliberate return to the standard wording replaces it.
  const authoredBody = override && override.text.trim() ? override.text : null;
  const authoredSubject =
    subjectText !== null && subjectText.trim() ? subjectText.trim() : null;
  let shownContent = content;
  if (shownContent && authoredBody)
    shownContent = applyRefinedBody(shownContent, authoredBody);
  if (shownContent && authoredSubject)
    shownContent = applyAuthoredSubject(shownContent, authoredSubject);
  // S265 (R-S265-2): the same inclusion projection the server applies to the exact final content,
  // so an authored resource clause or link shows its own fix here too. S264: with this review's
  // transition decisions. S265 into S269: the inclusion also gives the Guided offer its first
  // required resource fix.
  let inclusion: TenantResourceInclusion | null = null;
  if (shownContent && current) {
    const applied = applyTenantResourceInclusion(shownContent, facts ?? current.facts);
    shownContent = applied.content;
    inclusion = applied.inclusion;
  }
  return { payload, content, shownContent, offerReview, inclusion };
}

function MessagePreparationEditor({
  leaseId,
  refreshBasis,
  channel,
  canEdit,
  canManageResources,
  compact,
  deliveryHeld,
  offCycleHold,
  unsent = null,
  secondaryWork,
  workingTerms,
}: {
  leaseId: string;
  refreshBasis: string;
  channel: "owner" | "tenant";
  canEdit: boolean;
  canManageResources?: boolean;
  compact: boolean;
  deliveryHeld: boolean;
  offCycleHold: OffCycleReadinessItem | null;
  /** S273 R-S273-3: the step's held or out-of-date unsent message. */
  unsent?: UnsentMessageView | null;
  secondaryWork?: ReactNode;
  workingTerms?: ReactNode;
}) {
  const router = useRouter();
  const working = useRenewalWorkingRecord();
  const nowCard = useRenewalNowCard();
  const [signatureSettingsOpen, setSignatureSettingsOpen] = useState(false);
  const [current, setCurrent] = useState<Preparation | null>(null);
  // S285 R-S285-3: an owner message whose copy states the term reads the working dates too.
  const ownerTermStated =
    channel === "owner" &&
    current?.facts.ownerIntent !== "renew_or_not" &&
    ownerCopyStatesTerm(current?.facts.ownerCopyVersion);
  const messageWorkingFields = messageWorkingFieldsFor(
    channel,
    current?.facts.ownerIntent === "renew_or_not",
    ownerTermStated,
  );
  const [inputs, setInputs] = useState(emptyMessagePreparationInputs);
  // S161: the authored body (typed here or accepted from a refinement) and the authored subject.
  // Null means the text follows the standard wording composed from the current information.
  const [override, setOverride] = useState<RefinedBody | null>(null);
  const replacePriorSenderWording = useRef(false);
  const [overrideState, setOverrideState] = useState<RefinedBodyState["state"] | null>(
    null,
  );
  const [previousOverride, setPreviousOverride] = useState<
    RefinedBody | null | undefined
  >(undefined);
  const [subjectText, setSubjectText] = useState<string | null>(null);
  // S264: the tenant offer's charge review as entered here; it saves with the message.
  const [offerSelection, setOfferSelection] = useState<OfferChargeSelection | null>(null);
  const [copying, setCopying] = useState(false);
  const [autosave, setAutosave] = useState<AutosaveState>(AUTOSAVE_IDLE);
  const [commitTick, setCommitTick] = useState(0);
  const [pending, setPending] = useState(false),
    [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const workingRefusal = useRef<{ field: string; message: string } | null>(null);
  const workingRefusalControl = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const refusal = workingRefusal.current;
    if (refusal && working?.hasUnsettled && !working.hasUnsettled([refusal.field])) {
      setNotice((shown) => (shown === refusal.message ? "" : shown));
      workingRefusal.current = null;
    }
  }, [working]);
  const [outcome, setOutcome] = useState<RenewalNoticeDraftOutcome | null>(null);
  // S249 R-S249-9: the message revision the unsent Gmail draft created here carries, and whether
  // creating it replaced an earlier created draft (which stays in Gmail).
  const [createdDraftRevision, setCreatedDraftRevision] = useState<string | null>(null);
  const [replacedHere, setReplacedHere] = useState(false);
  // What the card reads as the created draft when a create is confirmed (kept current below).
  const knownCreated = useRef<{ revision: string | null; executionId: string | null }>({
    revision: null,
    executionId: null,
  });
  // A lost preview response may have saved the wording. Retry the same request identity while
  // its exact local state and expected revision match; never invent another save on uncertainty.
  const previewSaveIdentity = useRef<{ key: string; operationId: string } | null>(null);
  const [loadedAtIso, setLoadedAtIso] = useState<string | null>(null);
  const base = useId();
  const loadSequence = useRef(0);
  const invalidateReads = useCallback(() => {
    loadSequence.current++;
  }, []);
  // Local entries the server has not confirmed, or cannot store yet. A refresh never replaces them.
  const touchedRef = useRef(false);
  const currentRef = useRef<Preparation | null>(null);
  // S250 R-S250-7: "Rebuild with the current rule" saves the message on the current rule.
  const ruleOverride = useRef<MessageRuleBasis | null>(null);
  const localRef = useRef<LocalMessage>({
    inputs,
    override,
    subjectText,
    offerCharges: offerSelection,
  });
  const lastSavedRef = useRef("");
  const outstanding = useRef<{ payload: string; id: string } | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const queued = useRef(false);
  // The save that runs a queued commit is the latest one, reached through a ref (the callback
  // cannot name itself while it is being declared).
  const runQueued = useRef<() => Promise<void>>(() => Promise.resolve());
  const readinessRef = useRef<HTMLDetailsElement | null>(null);
  const readinessSummaryId = `${MESSAGE_CONTROL_IDS.readiness(channel)}-summary`;
  // S131: the same applicability projection the policy panel shows; empty for an unrelated lease.
  const policy = useRenewalPolicy();
  const manual = useRenewalManualWorkspace();
  const policyGates = policy
    ? policyMessageGates(
        projectPolicyApplicability({
          productKey: "rhino",
          leaseId,
          manualState: manual?.state,
          material: policy.material,
          facts: policy.facts,
          sheetLegacyValue: policy.sheetLegacyValue,
          todayIso: policy.todayIso,
        }),
        channel,
        policy.material,
        policy.facts,
      )
    : [];
  // S129/S161: the server projected the same notes from the saved state; a note present on either
  // side is listed once.
  const policyNotes = [
    ...policyGates,
    ...(current?.policyGates ?? []).filter(
      (gate) => !policyGates.some((entry) => entry.field === gate.field),
    ),
  ];
  useEffect(() => {
    localRef.current = { inputs, override, subjectText, offerCharges: offerSelection };
  });
  /** Take the server's message as the local one. Only used while nothing local is unconfirmed. */
  const adopt = useCallback((result: Preparation) => {
    setInputs(result.inputs);
    const saved = savedOverride(result.bodyOverride ?? null);
    const savedSelection = result.offerCharges
      ? (result.offerCharges.saved ?? null)
      : null;
    localRef.current = {
      inputs: result.inputs,
      override: saved.override,
      subjectText: result.subjectOverride ?? null,
      offerCharges: savedSelection,
    };
    setOverride(saved.override);
    setOverrideState(saved.state);
    setPreviousOverride(undefined);
    setSubjectText(result.subjectOverride ?? null);
    setOfferSelection(savedSelection);
  }, []);
  const load = useCallback(() => {
    const sequence = ++loadSequence.current;
    return fetch(
      `/api/lease-renewal/message-preparation?leaseId=${encodeURIComponent(leaseId)}&channel=${channel}`,
      { cache: "no-store" },
    ).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The message could not be loaded.");
      const result = data as Preparation;
      if (sequence !== loadSequence.current) return;
      // A read that started before a save finished never replaces that save's newer revision.
      const known = currentRef.current;
      if (
        known &&
        known.cycleId === result.cycleId &&
        (result.saved?.revision ?? 0) < (known.saved?.revision ?? 0)
      )
        return;
      currentRef.current = result;
      lastSavedRef.current = savedPayload(result);
      setCurrent(result);
      setLoadedAtIso(new Date().toISOString());
      if (result.draftAttempt?.recoveryAvailable) {
        if (["Executing", "Needs reconciliation"].includes(result.draftAttempt.state))
          setOutcome({
            status: "needs_reconciliation",
            channel,
            executionId: result.draftAttempt.executionId,
            reason: "Recover the saved exact attempt before creating another draft.",
          });
        else if (result.draftAttempt.outcome) setOutcome(result.draftAttempt.outcome);
      }
      // S161 (R-S161-7): refreshed facts never replace wording or entries still held here.
      if (!touchedRef.current) adopt(result);
    });
  }, [adopt, channel, leaseId]);
  useEffect(() => {
    const attempt = current?.draftAttempt?.executionId;
    if (!attempt || window.location.hash !== `#renewal-draft-attempt-${attempt}`) return;
    focusRenewalDashboardControl(`renewal-draft-attempt-${attempt}`, {
      focusContainer: true,
    });
  }, [current?.draftAttempt?.executionId]);
  async function signatureSetupSaved(choice: SenderSignatureChoice) {
    setInputs((currentInputs) => ({ ...currentInputs, signature: choice.signature }));
    await load();
  }
  /** A transport reads the confirmed entered figures. Blank and unrelated fields stay usable. */
  async function settleWorkingFields(restoreFocus = true): Promise<boolean> {
    if (!working?.settle) return true;
    setNotice("");
    workingRefusalControl.current = null;
    const result = await working.settle(messageWorkingFields);
    if (!result.ok) {
      const control = result.controlId ? document.getElementById(result.controlId) : null;
      const label =
        control instanceof HTMLInputElement
          ? control.labels?.[0]?.textContent?.trim()
          : null;
      const message = `${label || workingFieldLabel(result.field)} is not confirmed. Your entry is kept; correct or retry its save before preparing this message.`;
      workingRefusal.current = { field: result.field, message };
      workingRefusalControl.current = control;
      setNotice(message);
      if (restoreFocus && control) focusWorkingField(control);
      return false;
    }
    // The normal projection is read after the acknowledgments. If another entry arrived while
    // that read was on its way, this action stops before preparing an older message.
    await load();
    if (working.hasUnsettled(messageWorkingFields)) {
      setNotice(
        "Your working figures changed while the message was being prepared. Your entries are kept; finish their save, then prepare the message again.",
      );
      return false;
    }
    return true;
  }
  useEffect(() => {
    let active = true;
    load().catch((error) => {
      if (active) setNotice(error.message);
    });
    return () => {
      active = false;
      invalidateReads();
    };
  }, [load, refreshBasis, invalidateReads]); // source and working changes refresh the facts; entries are kept

  /**
   * S155/S161: save the message as it stands. A completed entry saves by itself; nothing is
   * reviewed or confirmed. One save runs at a time and a later entry saves after it, so an older
   * response never replaces newer wording. A failed save keeps everything on screen and the same
   * unchanged request is retried under the same operation id.
   */
  const runAutosave = useCallback(
    (force = false): Promise<void> => {
      const server = currentRef.current;
      if (!canEdit || !server) return Promise.resolve();
      if (saving.current) {
        queued.current = true;
        return saving.current;
      }
      const local = localRef.current;
      // A rebuild chosen while an earlier save was in flight stays chosen until a save carries it.
      const rebuild = ruleOverride.current;
      const payload = savePayload(local, server, rebuild ?? server.ruleBasis ?? null);
      const serialized = canonical(payload.value);
      if (!force && serialized === lastSavedRef.current) {
        // Nothing differs from what is stored, so an edit that was undone is no longer pending.
        setAutosave((state) => (state.phase === "edited" ? AUTOSAVE_IDLE : state));
        return Promise.resolve();
      }
      const replacePrior =
        Boolean(server.priorSenderWording) && replacePriorSenderWording.current;
      const request = {
        kind: "save",
        ...(replacePrior ? { replacePriorSenderWording: true } : {}),
        leaseId,
        channel,
        ...(server.cycleId ? { cycleId: server.cycleId } : {}),
        expectedRevision: server.saved?.revision ?? 0,
        ...payload.value,
      };
      const requestKey = canonical(request);
      if (outstanding.current?.payload !== requestKey)
        outstanding.current = { payload: requestKey, id: crypto.randomUUID() };
      const operationId = outstanding.current.id;
      setAutosave({ phase: "saving" });
      const run = (async () => {
        try {
          const response = await fetch("/api/lease-renewal/message-preparation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...request, operationId }),
          });
          const data = (await response.json().catch(() => ({}))) as Preparation & {
            error?: string;
          };
          if (!response.ok) {
            setAutosave({
              phase: "failed",
              message: data.error ?? "The message could not be saved.",
              conflict: response.status === 409,
            });
            return;
          }
          outstanding.current = null;
          if (replacePrior) replacePriorSenderWording.current = false;
          if (rebuild && ruleOverride.current === rebuild) ruleOverride.current = null;
          currentRef.current = data;
          lastSavedRef.current = serialized;
          setCurrent(data);
          setLoadedAtIso(new Date().toISOString());
          const latest = localRef.current;
          const enteredSince = canonical(savePayload(latest, data).value) !== serialized;
          // Everything entered was stored as typed and nothing newer was entered meanwhile.
          if (!payload.unfinished.length && !enteredSince) touchedRef.current = false;
          const savedBody = data.bodyOverride ?? null;
          if (
            latest.override &&
            savedBody &&
            savedBody.state !== "unreadable" &&
            savedBody.text === latest.override.text.trim()
          )
            setOverrideState(savedBody.state);
          // S155: an entry made while this save was in flight is still unsaved; it saves next.
          setAutosave(
            queued.current
              ? { phase: "saving" }
              : enteredSince
                ? AUTOSAVE_EDITED
                : { phase: "saved" },
          );
        } catch {
          setAutosave({
            phase: "failed",
            message: "The connection was interrupted.",
          });
        }
      })().finally(() => {
        saving.current = null;
        if (queued.current) {
          queued.current = false;
          void runQueued.current();
        }
      });
      saving.current = run;
      return run;
    },
    [canEdit, channel, leaseId],
  );
  useEffect(() => {
    runQueued.current = () => runAutosave();
  }, [runAutosave]);
  // A commit is requested after the entry is in state (a blur, a choice, a button), so the save
  // that runs here always carries the latest values.
  useEffect(() => {
    if (commitTick > 0) void runAutosave();
  }, [commitTick, runAutosave]);
  const commit = () => setCommitTick((tick) => tick + 1);
  /**
   * S250 R-S250-7: save the message on the agreement's current rule, a deliberate choice. Until
   * then a message built on the earlier rule keeps that rule's rent.
   */
  async function rebuildRule() {
    const earlier = currentRef.current?.earlierRule;
    const target = earlier?.currentBasis;
    if (!target) return;
    setNotice("");
    const entry = working?.record?.fields.terms_rent;
    const adopted = entry ? adoptedStandingRule(entry) : null;
    if (adopted?.agreementId === target.agreementId && working && earlier) {
      // S277 ARCH-S277-1: an agreement amount saves through the one adoption writer.
      const saved = await working.save(
        "terms_rent",
        earlier.currentRent,
        standingAdoptionSave({
          agreementId: target.agreementId,
          agreementName: earlier.agreement,
          policyId: target.policyId,
          policyVersion: target.policyVersion,
          basis: earlier.current,
        }),
      );
      if (!saved) {
        setNotice(
          "The rent could not be rebuilt. Your saved rent is kept; choose Rebuild with the current rule to retry.",
        );
        return;
      }
    }
    ruleOverride.current = target;
    await runAutosave(true);
  }
  /** Try again after a failure. After a conflict, read the other person's save first, then save this entry. */
  async function retryAutosave() {
    if (autosave.phase === "failed" && autosave.conflict)
      await load().catch(() => undefined);
    await runAutosave(true);
  }
  function touch() {
    touchedRef.current = true;
    // An entry that is not stored yet says so until its save starts.
    if (autosave.phase !== "saving" && autosave.phase !== "edited")
      setAutosave(AUTOSAVE_EDITED);
    if (outcome?.status === "preview") setOutcome(null);
  }
  function change(next: MessagePreparationInputs) {
    setInputs(next);
    touch();
  }
  /** Authored wording is an ordinary entry: it is kept exactly and saves by itself. */
  function overrideChange(next: RefinedBody | null, remember = false) {
    if (next && currentRef.current?.priorSenderWording)
      replacePriorSenderWording.current = true;
    if (remember) setPreviousOverride(override);
    setOverride(next);
    setOverrideState(
      next
        ? overrideState === "stale" && next.baseHash === override?.baseHash
          ? "stale"
          : "applied"
        : null,
    );
    touch();
  }
  function returnToStandardWording() {
    if (currentRef.current?.priorSenderWording) {
      replacePriorSenderWording.current = true;
      overrideChange(null, true);
      void runAutosave(true);
      return;
    }
    overrideChange(null, true);
    commit();
  }
  function undoWording() {
    if (previousOverride === undefined) return;
    overrideChange(previousOverride);
    setPreviousOverride(undefined);
    commit();
  }
  const signature = inputs.signature;
  function signatureChange(
    field: "name" | "role" | "phone" | "hours" | "source",
    value: string,
  ) {
    change({
      ...inputs,
      signature: {
        name: "",
        role: null,
        phone: null,
        hours: null,
        website: null,
        source: "",
        ...signature,
        [field]: value || (field === "name" || field === "source" ? "" : null),
      },
    });
  }
  // The message is composed from what would be saved now, so what is shown, copied and drafted is
  // one and the same text. Composition never refuses: a gap is a named marker and a callout line.
  const composed = current
    ? composedPreparation(
        current,
        { inputs, override, subjectText, offerCharges: offerSelection },
        leaseId,
      )
    : null;
  const payload = composed?.payload ?? null;
  const content = composed?.content ?? null;
  const shownContent = composed?.shownContent ?? null;
  // S264: the charge review as entered here, through the server's own projection.
  const offerReview = composed?.offerReview ?? null;
  function offerChange(next: OfferChargeSelection) {
    setOfferSelection(next);
    touch();
  }
  const authoredBody = override && override.text.trim() ? override.text : null;
  const wordingChangedSince = Boolean(authoredBody && overrideState === "stale");
  const refineDisabledReason = !canEdit
    ? "Refining wording needs edit access to this renewal."
    : null;
  // S161 (R-S161-4): the concise missing-value callout. It is information; nothing waits on it.
  const readiness =
    current && shownContent
      ? projectMessageReadiness({
          channel,
          missing: shownContent.missing,
          policyGates: policyNotes,
          // S265: the Admin handoff accompanies the tenant audience review, which applies to the
          // outgoing offer contract; an older composition keeps its own notes unchanged.
          canManageResources: current.facts.outgoingContract
            ? canManageResources
            : undefined,
        })
      : null;
  // S265 into S269: the offer's first required resource fix takes its place in the Guided
  // priority (after the offer charges and only once the transition decisions are ready).
  const resourceLead: NowCardResourceLead | null =
    channel === "tenant"
      ? includedResourceFix(composed?.inclusion ?? null, readiness?.items ?? null)
      : null;
  const setResourceLead = nowCard?.setResourceLead;
  const resourceLabel = resourceLead?.label;
  const resourceHref = resourceLead?.href;
  const resourceReason = resourceLead?.reason;
  const resourceTransitionsReady = resourceLead?.transitionsReady;
  useEffect(() => {
    if (!setResourceLead || channel !== "tenant") return;
    setResourceLead(
      "offer-tenant",
      resourceLabel && resourceHref && resourceReason !== undefined
        ? {
            label: resourceLabel,
            href: resourceHref,
            reason: resourceReason,
            transitionsReady: resourceTransitionsReady !== false,
          }
        : null,
    );
  }, [
    setResourceLead,
    channel,
    resourceLabel,
    resourceHref,
    resourceReason,
    resourceTransitionsReady,
  ]);
  useEffect(
    () =>
      setResourceLead && channel === "tenant"
        ? () => setResourceLead("offer-tenant", null)
        : undefined,
    [setResourceLead, channel],
  );
  function openMissingInput(item: MessageMissingInput) {
    if (item.target.kind !== "control") return;
    // S263 R-S263-4: a date fix opened from the tenant offer can return to this same offer.
    if (
      channel === "tenant" &&
      (OFFER_DATE_FIX_FIELDS as readonly string[]).includes(item.field)
    )
      startDateFixFromOffer(item.field, MESSAGE_CONTROL_IDS.readiness(channel));
    focusRenewalDashboardControl(item.target.id);
  }
  /** S162 (R-S162-1/2/3): copy is exactly what is on screen, whatever the save is doing. */
  async function copy(kind: "subject" | "plain" | "formatted" | "recipients") {
    const content = shownContent;
    if (!content || copying) return;
    setCopying(true);
    const figuresWereUnconfirmed = working?.hasUnsettled?.(messageWorkingFields) ?? false;
    setNotice("Copying the displayed message…");
    try {
      if (kind === "recipients") {
        // S116: the complete To/Cc set, in the same order the draft carries it. Nothing is sent.
        if (current?.recipients?.status !== "ready") return;
        await boundedLocalWait(
          navigator.clipboard.writeText(
            formatRecipientsForCopy({
              to: current.recipients.to,
              cc: current.recipients.cc,
            }),
          ),
        );
        setNotice(
          `Recipients copied (${1 + current.recipients.cc.length} ${channel} ${
            current.recipients.cc.length === 0 ? "address" : "addresses"
          }). Nothing was sent.`,
        );
        return;
      }
      if (kind === "formatted") {
        await boundedLocalWait(
          navigator.clipboard.write([
            new ClipboardItem({
              "text/html": new Blob([content.htmlBody], { type: "text/html" }),
              "text/plain": new Blob([content.plainText], { type: "text/plain" }),
            }),
          ]),
        );
      } else
        await boundedLocalWait(
          navigator.clipboard.writeText(
            kind === "subject" ? content.subject : content.plainText,
          ),
        );
      setNotice(
        `${kind === "subject" ? "Subject" : "Body"} copied as shown. Attachments are separate. Nothing was sent.${figuresWereUnconfirmed && kind !== "subject" ? " Working figures were unconfirmed when this copy began. Check the saved figures before using this copy." : ""}`,
      );
    } catch (error) {
      setNotice(
        error instanceof LocalWaitError
          ? "Clipboard copying was not confirmed. Select and copy the displayed subject or body; your wording is kept."
          : "Clipboard access was denied. Select and copy the subject or body below; your wording is kept.",
      );
    } finally {
      setCopying(false);
    }
  }
  const openingComposer = useRef(false);
  async function openComposer(event: React.MouseEvent<HTMLAnchorElement>) {
    const server = currentRef.current;
    if (!canEdit || !server) return;
    const entry = savePayload(localRef.current, server);
    if (
      !working?.hasUnsettled?.(messageWorkingFields) &&
      canonical(entry.value) === lastSavedRef.current &&
      !entry.wordingUnfinished
    )
      return;
    event.preventDefault();
    if (openingComposer.current) return;
    // Open during the actual human click, then sever the opener before any asynchronous save.
    // A failed save closes the empty tab and keeps every word in the source editor.
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      setNotice("Allow the new tab, then use Compose again. Your wording is kept here.");
      return;
    }
    tab.opener = null;
    openingComposer.current = true;
    setNotice("");
    const href = event.currentTarget.href;
    try {
      if (!(await flush())) {
        tab.close();
        setNotice(
          (current) =>
            current ||
            "Your latest message could not be prepared. Your entries are kept here; correct or retry the save, then open Communications again.",
        );
        return;
      }
      tab.location.replace(href);
    } catch {
      tab.close();
      setNotice("Communications could not open. Your wording is kept here.");
    } finally {
      openingComposer.current = false;
    }
  }
  /**
   * S162: the deliberate unsent-draft step. The preview request carries exactly what is displayed
   * and, when it is not saved yet, the message itself, so the one action saves, binds and previews
   * it. Creation stays a separate exact confirmation of that preview. Nothing is ever sent.
   */
  async function draft(
    kind: "preview" | "create" | "reconcile",
    priorExecutionId?: string,
    deferWorkingFocus = false,
  ) {
    setPending(true);
    setConfirming(false);
    setNotice("");
    const confirmedPreview =
      kind === "create" && outcome?.status === "preview" ? outcome : null;
    try {
      let preview: Record<string, unknown> = {};
      let savedWith: string | null = null;
      if (kind === "preview") {
        if (!(await settleWorkingFields(!deferWorkingFocus))) {
          if (outcome?.status === "preview") setOutcome(null);
          if (deferWorkingFocus) {
            const control = workingRefusalControl.current;
            return () => {
              if (control) focusWorkingField(control);
            };
          }
          return;
        }
        // An autosave already on its way finishes first, so the two never save over each other.
        await saving.current?.catch(() => undefined);
        const server = currentRef.current;
        const shown = server
          ? composedPreparation(server, localRef.current, leaseId).shownContent
          : null;
        if (!server || !shown) return;
        const state = savePayload(localRef.current, server);
        if (state.wordingUnfinished) {
          setNotice(
            "The wording has characters that cannot be saved, so no draft was prepared. Remove double braces and control characters, then preview again.",
          );
          return;
        }
        const serialized = canonical(state.value);
        const needsSave = serialized !== lastSavedRef.current || !server.saved;
        if (needsSave) savedWith = serialized;
        const saveKey = canonical({
          leaseId,
          channel,
          sender: server.senderEmail,
          cycleId: server.cycleId,
          revision: server.saved?.revision ?? 0,
          value: state.value,
        });
        if (needsSave && previewSaveIdentity.current?.key !== saveKey)
          previewSaveIdentity.current = {
            key: saveKey,
            operationId: crypto.randomUUID(),
          };
        preview = {
          displayed: { subject: shown.subject, body: shown.plainText },
          ...(needsSave
            ? {
                save: {
                  ...(server.cycleId ? { cycleId: server.cycleId } : {}),
                  expectedRevision: server.saved?.revision ?? 0,
                  operationId: previewSaveIdentity.current!.operationId,
                  ...state.value,
                },
              }
            : {}),
        };
      }
      const request = {
        kind: "draft",
        leaseId,
        channel,
        ...preview,
        ...(kind === "create" && outcome?.status === "preview"
          ? {
              confirm: {
                executionId: outcome.executionId,
                previewHash: outcome.previewHash,
              },
            }
          : {}),
        ...(kind === "reconcile" &&
        (priorExecutionId || (outcome && "executionId" in outcome))
          ? {
              reconcile: {
                executionId:
                  priorExecutionId ??
                  (outcome && "executionId" in outcome ? outcome.executionId : ""),
              },
            }
          : {}),
      };
      const post = (body: unknown) =>
        fetch("/api/lease-renewal/message-preparation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).then(async (answer) => ({ response: answer, data: await answer.json() }));
      // S250 (L28): a review refused only because the lease's RentVine read is being replaced is
      // asked again, as its reason asks: previews only, a bounded few. The repeat carries what is
      // displayed and never the save the first request already made; a create, a reconcile or a
      // confirmation is never repeated.
      const previewOnly = {
        kind: "draft",
        leaseId,
        channel,
        ...(preview.displayed ? { displayed: preview.displayed } : {}),
      };
      let { response, data } = await post(request);
      if (kind === "preview" && response.ok)
        ({ response, data } = await previewAgainWhileGenerationReplaced(
          { response, data },
          () => post(previewOnly),
          (answer) => answer.response.ok && draftPreviewWaitsOnGeneration(answer.data),
        ));
      if (!response.ok && data.providerCallAttempted === false) {
        setNotice(data.error);
        if (kind === "create") setOutcome(null);
        // The message was saved but reads differently now: show the current message.
        if (data.code === "message_changed") {
          if (savedWith) lastSavedRef.current = savedWith;
          await load().catch(() => undefined);
        }
        return;
      }
      if (!response.ok)
        throw new Error(
          data.error ??
            "Gmail drafting is unavailable. Copy remains available; no new draft is confirmed.",
        );
      if (savedWith) {
        // The draft action saved the message. Read its new revision; what is on screen stays.
        lastSavedRef.current = savedWith;
        outstanding.current = null;
        await load().catch(() => undefined);
      }
      const parsed = RenewalNoticeDraftOutcomeSchema.parse(data);
      previewSaveIdentity.current = null;
      setOutcome(parsed);
      if (parsed.status === "blocked") setNotice(parsed.reasons.join(" "));
      if (parsed.status === "created" && confirmedPreview) {
        const made = gmailDraftMessageRevisionOf({
          subject: confirmedPreview.subject,
          body: confirmedPreview.body,
        });
        // A confirmed replacement: the earlier created draft stays in Gmail, and the card keeps
        // saying so.
        if (
          knownCreated.current.revision !== null &&
          knownCreated.current.executionId !== parsed.executionId
        )
          setReplacedHere(true);
        setCreatedDraftRevision(made);
      }
      const createdConfirmed =
        parsed.status === "created" ||
        (parsed.status === "reconciliation" && parsed.resolution === "created");
      if (createdConfirmed) {
        router.refresh();
        if (kind === "reconcile") void load().catch((error) => setNotice(error.message));
      }
      if (parsed.status === "created")
        setNotice(
          kind === "reconcile"
            ? "The existing unsent Gmail draft is confirmed. Nothing was sent."
            : "An unsent Gmail draft was created and recorded. Review it in Gmail before you send it; a person sends it.",
        );
      if (parsed.status === "needs_reconciliation" || parsed.status === "reconciliation")
        setNotice(parsed.reason);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Gmail drafting failed. Copy remains available.",
      );
      if (kind === "create" && outcome?.status === "preview")
        setOutcome({
          status: "needs_reconciliation",
          channel,
          executionId: outcome.executionId,
          reason:
            "The create response is uncertain. Recover this exact attempt before preparing another draft.",
        });
    } finally {
      setPending(false);
    }
  }
  const unresolved =
    outcome?.status === "needs_reconciliation" ||
    (outcome?.status === "reconciliation" && outcome.resolution !== "created");
  // S162 (R-S162-5, R-S162-9): only what the exact Gmail action needs is asked of it. Missing
  // business values, an unrecorded response and an unsaved message never withhold the step.
  const canDraft = Boolean(
    canEdit &&
    current &&
    shownContent &&
    current.publication.status === "approved" &&
    !current.priorSenderWording &&
    !unresolved,
  );
  /** Recover only an existing exact attempt; absence never falls through to a new preview. */
  async function recoverDraft(priorExecutionId?: string) {
    const executionId =
      priorExecutionId ??
      (outcome && "executionId" in outcome
        ? outcome.executionId
        : current?.draftAttempt?.executionId);
    if (executionId) await draft("reconcile", executionId);
  }
  const paragraph = responseRequestParagraph(
    channel,
    payload?.effective.edits ?? { responseRequest: "" },
    ownerTermStated ? "v2.1" : "v2.0",
  );
  const signatureEdited =
    canonical(signature ?? null) !== canonical(current?.inputs.signature ?? null);
  const retainedDiffers =
    Boolean(current?.retainedSignature) &&
    canonical(signature ?? null) !== canonical(current?.retainedSignature ?? null);
  const channelLabel = channel === "owner" ? "Owner" : "Tenant";
  // S249 ARCH-S249-2: the Now card's preview and delivery actions read this same message.
  const shownRevision = shownContent
    ? messageRevisionOf({ subject: shownContent.subject, body: shownContent.plainText })
    : null;
  // R-S249-9: the signal reads the last CREATED draft, never the draft head, which moves to a new
  // attempt at its preview: a cancelled replacement leaves the created draft reading older.
  const draftSignal = gmailDraftSignal({
    createdHere: createdDraftRevision,
    replacedHere,
    created: current?.createdDrafts ?? null,
    head: current?.draftAttempt ?? null,
  });
  const draftRevision = draftSignal.createdRevision;
  useEffect(() => {
    knownCreated.current = {
      revision: draftSignal.createdRevision,
      executionId: draftSignal.createdExecutionId,
    };
  }, [draftSignal.createdRevision, draftSignal.createdExecutionId]);
  /** Save what is on screen; true once the saved message reads back as shown. */
  async function flush(): Promise<boolean> {
    if (!canEdit || !currentRef.current) return false;
    if (!(await settleWorkingFields())) return false;
    if (saving.current) await saving.current;
    await runAutosave();
    if (saving.current) await saving.current;
    const latest = currentRef.current;
    const value = latest ? savePayload(localRef.current, latest) : null;
    return Boolean(
      value &&
      !value.wordingUnfinished &&
      canonical(value.value) === lastSavedRef.current &&
      !working?.hasUnsettled?.(messageWorkingFields),
    );
  }
  /** R-S249-11: the sender's own signature, set up on the Now card; a refusal names what is missing. */
  function saveSignature(fields: PreparedSignatureFields): string | null {
    const name = fields.name.trim();
    const role = fields.role.trim();
    const phone = fields.phone.trim();
    const missing = [
      ...(name ? [] : ["Sender name"]),
      ...(name.length > 240 ? ["Sender name (240 characters at most)"] : []),
      ...(role.length > 240
        ? ["Approved role / organization (240 characters at most)"]
        : []),
      ...(phone.length > 240 ? ["Verified phone (240 characters at most)"] : []),
    ];
    if (missing.length) return `To save your signature, add: ${missing.join(", ")}.`;
    change({
      ...inputs,
      signature: {
        name,
        role: role || null,
        phone: phone || null,
        hours: null,
        website: null,
        source: STAFF_ENTRY_SOURCE,
      },
    });
    commit();
    return null;
  }
  // R-S249-11: the values the shown message still marks in its own text.
  const marked = shownContent
    ? markedValuesIn(`${shownContent.subject}\n${shownContent.plainText}`)
    : [];
  const preparedData: PreparedMessageData | null =
    current && shownContent && shownRevision
      ? {
          channel,
          leaseId,
          canEdit,
          subject: shownContent.subject,
          plainText: shownContent.plainText,
          htmlBody: shownContent.htmlBody,
          revision: shownRevision,
          to: current.recipients?.status === "ready" ? current.recipients.to : null,
          cc: current.recipients?.status === "ready" ? current.recipients.cc : [],
          recipientReasons:
            current.recipients?.status === "blocked" ? current.recipients.reasons : [],
          senderEmail: current.senderEmail,
          templateApproved: current.publication.status === "approved",
          lastEditedAt: current.saved?.updatedAt ?? null,
          wordingChangedSince,
          canUndoWording: previousOverride !== undefined,
          earlierRule: current.earlierRule ?? null,
          marked,
          signaturePresent:
            current.signatureSetup === undefined
              ? Boolean(payload?.effective.signature)
              : current.signatureSetup !== null,
          outgoingReasons: current.outgoingReasons,
          renewOrNot: current.facts.ownerIntent === "renew_or_not",
          // S285 R-S285-3: the owner message states the term, so "Renewal dates" is a readiness line.
          ownerTermStated,
          reason: inputs.recommendationReason ?? "",
          composerHref: workflowComposerHref({
            leaseId,
            purpose: channel === "owner" ? "renewal_owner" : "renewal_tenant",
          }),
          draft: {
            available: canDraft,
            pending,
            createdRevision: draftRevision,
            earlierRemain: draftSignal.earlierRemain,
            recoveryRequired: unresolved,
            preview:
              outcome?.status === "preview"
                ? {
                    subject: outcome.subject,
                    body: outcome.body,
                    to: [outcome.recipient.to, ...(outcome.recipient.cc ?? [])].join(
                      ", ",
                    ),
                  }
                : null,
          },
          notice,
        }
      : null;
  const preparedPreviewInNow = Boolean(
    preparedData &&
    nowCard?.slots[
      nowSlotKey(channel === "owner" ? "ask-owner" : "offer-tenant", "message-preview")
    ],
  );
  // S264 (R-S264-2): Review offer charges is one control with one saved record. The prepared
  // tenant offer shows it where it is shown (the Now card in Guided, the section in Full);
  // otherwise it leads this card's own work.
  const focusView = useRenewalFocusView();
  const preparedHostsCharges =
    preparedPreviewInNow ||
    Boolean(preparedData && compact && focusView?.view === "full");
  const evidenceHost = useOfferChargeEvidenceHost(
    channel === "tenant" && Boolean(offerReview),
  );
  // S264 with S269: the first open charge row or transition choice leads Offer the tenant in
  // Guided, after the working terms; this editor names its own control and keeps its one save.
  const offerPriority = channel === "tenant" ? offerChargesPriority(offerReview) : null;
  const offerPriorityTarget = offerPriority?.target ?? null;
  const offerPriorityReady = offerPriority?.transitionsReady ?? true;
  const setOfferChargesLead = nowCard?.setOfferCharges;
  useEffect(() => {
    if (channel !== "tenant" || !setOfferChargesLead) return;
    setOfferChargesLead(
      offerPriorityTarget
        ? { target: offerPriorityTarget, transitionsReady: offerPriorityReady }
        : null,
    );
    return () => setOfferChargesLead(null);
  }, [channel, setOfferChargesLead, offerPriorityTarget, offerPriorityReady]);
  // S264 R-S264-6: the tenant message's read carries each recorded answer's coverage of the
  // current offer; the response editors show it from here, so a saved charge or answer shows it.
  const setOfferAnswers = nowCard?.setOfferAnswers;
  const offerAnswersRead = channel === "tenant" ? current?.offerAnswers : undefined;
  useEffect(() => {
    if (channel !== "tenant" || !setOfferAnswers) return;
    const view = offerAnswersViewOf(offerAnswersRead);
    // Absent means this read carries no work record yet; null or another shape was unreadable.
    setOfferAnswers({ view, failed: offerAnswersRead !== undefined && view === null });
  }, [channel, setOfferAnswers, offerAnswersRead]);
  useEffect(() => {
    if (channel !== "tenant" || !setOfferAnswers) return;
    return () => setOfferAnswers(null);
  }, [channel, setOfferAnswers]);
  const offerSelectionNow =
    offerSelection ?? current?.offerCharges?.saved ?? emptyOfferChargeSelection();
  const chargeReview =
    channel === "tenant" && offerReview ? (
      <RenewalOfferCharges
        canEdit={canEdit}
        evidenceHost={evidenceHost}
        onChange={offerChange}
        onCommit={commit}
        review={offerReview}
        selection={offerSelectionNow}
        unfinished={payload?.offerChargesUnfinished}
      />
    ) : null;
  return (
    <Card
      title={renewalCardTitle(
        channel === "owner" ? "message-preparation-owner" : "message-preparation-tenant",
        `${channelLabel} message preparation`,
      )}
      ariaLabel={`${channelLabel} message preparation`}
      id={`renewal-card-message-${channel}`}
    >
      {compact && !preparedData ? (
        <p data-renewal-field="waiting" role="status">
          Reading the current {channelLabel.toLowerCase()} message.
        </p>
      ) : null}
      {/* S249: the Now card's prepared message, rendered into its slots from this one record. */}
      {current?.priorSenderWording ? (
        <div className="renewal-notice ui-stack-tight">
          <p>Review prior sender wording before sending.</p>
          {canEdit ? (
            <Button onClick={returnToStandardWording}>
              Rebuild for the current sender
            </Button>
          ) : null}
          <details>
            <summary>Prior sender wording</summary>
            <div className="draft-box">{current.priorSenderWording}</div>
          </details>
        </div>
      ) : null}
      {preparedData ? (
        <PreparedMessageSlot
          data={preparedData}
          compactFull={compact}
          deliveryHeld={deliveryHeld}
          offCycleHold={offCycleHold}
          unsent={unsent}
          chargeReview={preparedHostsCharges ? chargeReview : null}
          onCopy={() => copy("formatted")}
          onDraftCreate={async () => {
            await draft("create");
          }}
          onDraftRecover={() => recoverDraft()}
          onDraftPreview={() => draft("preview", undefined, true)}
          onFlush={flush}
          onOpenComposer={(event) => void openComposer(event)}
          onReasonChange={(value) =>
            change({ ...inputs, recommendationReason: value || null })
          }
          onReasonCommit={commit}
          onRebuildRule={rebuildRule}
          onReturnToStandardWording={returnToStandardWording}
          onUndoWording={undoWording}
          onSaveSignature={saveSignature}
          onSignatureSetupSaved={
            current?.signatureSetup !== undefined ? signatureSetupSaved : undefined
          }
        />
      ) : null}
      {chargeReview && !preparedHostsCharges ? chargeReview : null}
      {workingTerms}
      <RenewalSecondaryWork
        // S270: one named group per outcome: the message options, then the outcome's records.
        label={
          secondaryWork !== undefined
            ? GUIDED_SECONDARY_WORK_LABELS[
                channel === "owner" ? "ask-owner" : "offer-tenant"
              ]!
            : `Edit ${channelLabel.toLowerCase()} message and manage delivery options`
        }
        stepId={
          secondaryWork !== undefined
            ? channel === "owner"
              ? "ask-owner"
              : "offer-tenant"
            : undefined
        }
      >
        <a
          className="primary-button"
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => void openComposer(event)}
          href={workflowComposerHref({
            leaseId,
            purpose: channel === "owner" ? "renewal_owner" : "renewal_tenant",
          })}
        >
          Compose {channel} message in Communications
        </a>
        {channel === "tenant" && offerReview ? (
          // S270: an authorized case charge is an optional choice of this offer; it joins the
          // same charge review and saves with the message.
          <RenewalOfferChargeAdd
            canEdit={canEdit}
            onChange={offerChange}
            onCommit={commit}
            selection={offerSelectionNow}
          />
        ) : null}
        <p className="muted">
          Edits save in the app. In Communications, review the exact message and use Send
          or Schedule when its current checks pass. Resume requires a fresh review. You
          can also create an unsent Gmail draft below and send it from Gmail.
        </p>
        {notice && !preparedPreviewInNow && !(compact && preparedData) ? (
          <p role="status">{notice}</p>
        ) : null}
        {[...new Set(current?.notices ?? [])].map((value) => (
          <p key={value} className="muted">
            {value}
          </p>
        ))}
        {!current ? (
          <Button
            disabled={pending}
            onClick={() => load().catch((error) => setNotice(error.message))}
          >
            Reload message preparation
          </Button>
        ) : (
          <>
            {/* S162: copy uses exactly the subject and body shown here, with their markers,
              whatever the save or the missing values are doing. */}
            <section
              aria-label="Copy the message"
              className="ui-stack-tight renewal-message-group"
            >
              <h3 className="renewal-message-group-title">Copy the message</h3>
              <Field htmlFor={MESSAGE_CONTROL_IDS.subject(channel)} label="Subject">
                <input
                  id={MESSAGE_CONTROL_IDS.subject(channel)}
                  readOnly={!canEdit}
                  value={subjectText ?? content?.subject ?? ""}
                  onChange={(event) => {
                    setSubjectText(
                      event.target.value === content?.subject ? null : event.target.value,
                    );
                    touch();
                  }}
                  onBlur={(event) => {
                    if (isRenewalPresentationMove(event.relatedTarget)) return;
                    if (subjectText !== null && !subjectText.trim()) setSubjectText(null);
                    commit();
                  }}
                />
              </Field>
              <div id={MESSAGE_CONTROL_IDS.recipients(channel)}>
                {current?.recipients ? (
                  current.recipients.status === "ready" ? (
                    <p className="renewal-message-recipients">
                      <strong>To:</strong> {current.recipients.to}
                      {current.recipients.cc.length > 0 ? (
                        <>
                          {" "}
                          <strong>Cc:</strong> {current.recipients.cc.join(", ")}
                        </>
                      ) : null}
                    </p>
                  ) : (
                    <ul className="renewal-message-recipients" role="status">
                      {[...new Set(current.recipients.reasons)].map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  )
                ) : null}
                {current.recipients?.status === "blocked" ? (
                  <p className="muted renewal-message-destinations">
                    {channel === "owner" && current.destinations?.owners.length ? (
                      current.destinations.owners.map((owner, index) => (
                        <span key={owner.record.href}>
                          {index > 0 ? " · " : ""}
                          {owner.name}:{" "}
                          {externalLink(owner.record, "open owner record in RentVine")}
                        </span>
                      ))
                    ) : current.destinations?.lease ? (
                      <>
                        {externalLink(
                          current.destinations.lease,
                          "Open lease record in RentVine",
                        )}
                        {". "}
                        {channel === "owner"
                          ? "Open its owner record to add the owner's email, then refresh this lease."
                          : "Check the tenant email addresses, then refresh this lease."}
                      </>
                    ) : (
                      "Refresh data to read this lease's recipient record links."
                    )}
                  </p>
                ) : null}
              </div>
              <div className="ui-actions">
                <Button
                  variant="secondary"
                  disabled={!shownContent || copying}
                  onClick={() => copy("subject")}
                >
                  Copy subject
                </Button>
                <Button
                  variant="secondary"
                  disabled={!shownContent || copying}
                  onClick={() => copy("formatted")}
                >
                  <MessageCopyIcon name="copy" size={16} /> Copy formatted body
                </Button>
                <Button
                  variant="secondary"
                  disabled={!shownContent || copying}
                  onClick={() => copy("plain")}
                >
                  <MessageCopyIcon name="copy" size={16} /> Copy plain text
                </Button>
                {current?.recipients ? (
                  <Button
                    variant="secondary"
                    disabled={current.recipients.status !== "ready" || copying}
                    onClick={() => copy("recipients")}
                  >
                    Copy recipients
                  </Button>
                ) : null}
              </div>
              {current.destinations?.gmailDrafts
                ? externalLink(
                    current.destinations.gmailDrafts,
                    "Open the Gmail Drafts folder",
                  )
                : null}
              {current.destinations ? (
                <p className="muted renewal-message-destinations">
                  RentVine:{" "}
                  {channel === "owner"
                    ? current.destinations.owners.map((owner, index) => (
                        <span key={owner.record.href}>
                          {index > 0 ? " · " : ""}
                          {externalLink(
                            owner.messages,
                            `${owner.name}: open owner messages in RentVine`,
                          )}
                          {current.recipients?.status !== "blocked" ? (
                            <>
                              {" · "}
                              {externalLink(
                                owner.record,
                                "open owner record in RentVine",
                              )}
                            </>
                          ) : null}
                        </span>
                      ))
                    : current.destinations.messages
                      ? externalLink(
                          current.destinations.messages,
                          "Open lease messages in RentVine",
                        )
                      : null}
                  {current.destinations.lease &&
                  !(
                    current.recipients?.status === "blocked" &&
                    (channel !== "owner" || current.destinations.owners.length === 0)
                  ) ? (
                    <>
                      {" · "}
                      {externalLink(
                        current.destinations.lease,
                        "Open lease record in RentVine",
                      )}
                    </>
                  ) : null}
                </p>
              ) : null}
            </section>
            {shownContent ? (
              <>
                <Field
                  htmlFor={MESSAGE_CONTROL_IDS.body(channel)}
                  label="Email body"
                  hint="Copy uses the wording shown, including unresolved markers. The unsent Gmail draft validates the current message before exact creation confirmation."
                >
                  <textarea
                    className="renewal-message-body"
                    id={MESSAGE_CONTROL_IDS.body(channel)}
                    readOnly={!canEdit}
                    rows={16}
                    value={override ? override.text : (content?.plainText ?? "")}
                    onChange={(event) =>
                      overrideChange(
                        event.target.value === content?.plainText
                          ? null
                          : {
                              text: event.target.value,
                              baseHash:
                                override?.baseHash ??
                                current.bodyBaseHash ??
                                NO_BASE_HASH,
                            },
                      )
                    }
                    onBlur={(event) => {
                      if (isRenewalPresentationMove(event.relatedTarget)) return;
                      if (override && !override.text.trim()) overrideChange(null);
                      commit();
                    }}
                  />
                </Field>
                {authoredBody && (!preparedPreviewInNow || !wordingChangedSince) ? (
                  <div className="ui-stack-tight">
                    <p className="muted" role="status">
                      {wordingChangedSince
                        ? STALE_REFINED_BODY_MESSAGE
                        : "Your wording is kept exactly as written. It is not replaced when the lease information changes."}
                    </p>
                    {canEdit ? (
                      <div className="ui-actions">
                        {previousOverride !== undefined && !preparedPreviewInNow ? (
                          <Button onClick={undoWording} type="button" variant="secondary">
                            Undo the last refinement
                          </Button>
                        ) : null}
                        <Button
                          onClick={returnToStandardWording}
                          type="button"
                          variant="secondary"
                        >
                          Return to the standard wording
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {overrideState === "unreadable" && !override ? (
                  <p role="status">{UNREADABLE_REFINED_BODY_MESSAGE}</p>
                ) : null}
                <details open>
                  <summary>Formatted preview</summary>
                  <div
                    aria-label={`${channel} formatted body`}
                    className="renewal-message-preview"
                    dangerouslySetInnerHTML={{ __html: shownContent.htmlBody }}
                  />
                </details>
                <fieldset
                  className="ui-stack-tight renewal-message-group"
                  disabled={!canEdit || pending}
                >
                  <RefineWithAi
                    appliedNotice="Revision applied to the email body. It saves by itself; edit it further if you like."
                    currentBody={shownContent.plainText}
                    disabledReason={refineDisabledReason}
                    id={MESSAGE_CONTROL_IDS.refine(channel)}
                    onApply={(revision) => {
                      overrideChange(
                        {
                          text: revision.body,
                          baseHash:
                            revision.baseHash ?? current.bodyBaseHash ?? NO_BASE_HASH,
                        },
                        true,
                      );
                      commit();
                    }}
                    request={{ surface: "renewal_message", leaseId, channel }}
                  />
                </fieldset>
              </>
            ) : null}
            {/* S285 R-S285-6: the approver's control for the owner wording that asks about the
                term, beside the owner template's publication. Nothing shows for an Editor. */}
            {channel === "owner" ? (
              <OwnerWordingPublication
                onPublished={() => void load().catch((error) => setNotice(error.message))}
                ownerCopy={current.ownerCopy}
              />
            ) : null}
            <section
              aria-label="Unsent Gmail draft"
              className="ui-stack-tight renewal-message-group"
              id={
                current.draftAttempt
                  ? `renewal-draft-attempt-${current.draftAttempt.executionId}`
                  : undefined
              }
              tabIndex={-1}
            >
              <h3 className="renewal-message-group-title">Unsent Gmail draft</h3>
              {current.publication.status !== "approved" ? (
                <p className="muted">{current.publication.reason}</p>
              ) : null}
              <div className="ui-actions">
                {canEdit ? (
                  <Button
                    disabled={!canDraft || pending}
                    onClick={() => draft("preview")}
                  >
                    Preview unsent Gmail draft
                  </Button>
                ) : null}
              </div>
              {outcome?.status === "preview" ? (
                <div className="ui-stack">
                  <p>
                    From {current.senderEmail} · To {outcome.recipient.to}
                    {outcome.recipient.cc?.length
                      ? ` · Cc ${outcome.recipient.cc.join(", ")}`
                      : ""}
                  </p>
                  <p>{outcome.subject}</p>
                  <div className="draft-box">{outcome.body}</div>
                  {(current.createdDrafts?.latest &&
                    current.createdDrafts.latest.executionId !== outcome.executionId) ||
                  (current.draftAttempt?.outcome?.status === "created" &&
                    current.draftAttempt.executionId !== outcome.executionId) ? (
                    <p role="note">
                      A Gmail draft from an earlier version of this message already
                      exists. Creating this one adds a second, separate unsent draft; the
                      app cannot replace the earlier one, so delete it in Gmail and send
                      only one.
                    </p>
                  ) : null}
                  {outcome.attachment ? (
                    <p>
                      {outcome.attachment.label} · {outcome.attachment.mimeType} ·{" "}
                      {outcome.attachment.sizeBytes} bytes
                    </p>
                  ) : null}
                  {!confirming ? (
                    <Button
                      disabled={pending || !canDraft}
                      onClick={() => setConfirming(true)}
                    >
                      Review creation confirmation
                    </Button>
                  ) : (
                    <div role="group" aria-label="Confirm exact unsent draft">
                      <p>
                        Create this exact unsent draft, with the recipients and wording
                        shown above, in the displayed managed mailbox? Nothing is sent.
                        Review it in Gmail before you send it; anything still marked stays
                        marked in the draft.
                      </p>
                      <Button onClick={() => setConfirming(false)}>Cancel</Button>
                      <Button
                        disabled={pending || !canDraft}
                        onClick={() => draft("create")}
                      >
                        Create this unsent draft
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
              {unresolved && !preparedPreviewInNow ? (
                <div>
                  <p>
                    Do not create a duplicate. Recover this exact attempt; copy remains
                    available.
                  </p>
                  <Button disabled={pending} onClick={() => recoverDraft()}>
                    Recover exact Gmail attempt
                  </Button>
                </div>
              ) : null}
              {outcome && "draftId" in outcome && outcome.draftId ? (
                <p className="muted">
                  {current.destinations?.gmailDrafts ? (
                    <a
                      href={current.destinations.gmailDrafts.href}
                      target={EXTERNAL_LINK_TARGET}
                      rel={EXTERNAL_LINK_REL}
                    >
                      Open the Drafts folder to find this draft
                    </a>
                  ) : (
                    "Open the Drafts folder in your managed Gmail mailbox to find this draft."
                  )}{" "}
                  Mailbox: {current.senderEmail}. A person sends from Gmail.
                </p>
              ) : null}
              {outcome?.status === "created" ||
              (outcome?.status === "reconciliation" &&
                outcome.resolution === "created") ? (
                <p className="muted">{GEMINI_IN_GMAIL_HINT}</p>
              ) : null}
            </section>
            {current.draftAttempt || outcome ? (
              <details className="ui-stack-tight renewal-message-group">
                <summary>Earlier Gmail draft</summary>
                <p>
                  This recorded attempt keeps its original status. New Gmail drafts use
                  the exact preview and confirmation above.
                </p>
                <p>{current.draftAttempt?.state ?? outcome?.status}</p>
                {current.draftAttempt?.recoveryAvailable ? (
                  unresolved ? null : (
                    <Button disabled={pending} onClick={() => recoverDraft()}>
                      Recover exact Gmail attempt
                    </Button>
                  )
                ) : (
                  <p>Its original managed sender must recover this attempt.</p>
                )}
                {outcome && "draftId" in outcome && outcome.draftId ? (
                  <p>
                    Earlier unsent draft confirmed in {current.senderEmail}. Nothing was
                    sent.
                  </p>
                ) : null}
              </details>
            ) : null}
            <fieldset
              id={MESSAGE_CONTROL_IDS.inputs(channel)}
              disabled={!canEdit}
              className="ui-stack"
              onBlur={(event) => {
                if (!isRenewalPresentationMove(event.relatedTarget)) commit();
              }}
              onChange={(event) => {
                // A choice saves when it is made; typed text saves when its field is left.
                const target = event.target as unknown;
                if (
                  target instanceof HTMLSelectElement ||
                  (target instanceof HTMLInputElement && target.type === "checkbox")
                )
                  commit();
              }}
            >
              <Field
                htmlFor={`${base}-response`}
                label="Response request (optional wording edit)"
                hint="Replaces the paragraph after the terms, charges and insurance wording, before the request to complete the renewal information form. Blank keeps approved wording; amounts, dates and recipients remain in the email body."
              >
                <textarea
                  className="renewal-message-body"
                  id={`${base}-response`}
                  value={inputs.edits.responseRequest}
                  onChange={(event) =>
                    change({ ...inputs, edits: { responseRequest: event.target.value } })
                  }
                />
              </Field>
              <p className="muted" data-testid="renewal-message-response-paragraph">
                Current paragraph in the preview (
                {paragraph.isDefault ? "approved default" : "your wording"}): &ldquo;
                {paragraph.text}&rdquo;
              </p>
              {channel === "tenant" ? (
                <>
                  <details>
                    <summary>Lease origin (optional detail)</summary>
                    <div className="ui-stack">
                      <Field
                        htmlFor={MESSAGE_CONTROL_IDS.origin(channel)}
                        label="Current lease origin"
                      >
                        <select
                          id={MESSAGE_CONTROL_IDS.origin(channel)}
                          value={inputs.leaseOrigin?.kind ?? ""}
                          onChange={(event) =>
                            change({
                              ...inputs,
                              leaseOrigin: event.target.value
                                ? {
                                    kind: event.target.value as "pmi" | "third_party",
                                    source: inputs.leaseOrigin?.source ?? "",
                                  }
                                : null,
                            })
                          }
                        >
                          <option value="">Not entered</option>
                          <option value="pmi">PMI lease</option>
                          <option value="third_party">Third-party lease</option>
                        </select>
                      </Field>
                      {inputs.leaseOrigin ? (
                        <Field
                          htmlFor={`${base}-origin-source`}
                          label="Lease-origin source (optional)"
                        >
                          <input
                            id={`${base}-origin-source`}
                            value={inputs.leaseOrigin.source}
                            onChange={(event) =>
                              change({
                                ...inputs,
                                leaseOrigin: {
                                  ...inputs.leaseOrigin!,
                                  source: event.target.value,
                                },
                              })
                            }
                          />
                        </Field>
                      ) : null}
                      {/* S264 R-S264-2: charges, the insurance transition and the unchanged
                        statement are decided in Review offer charges, their one editor. */}
                    </div>
                  </details>
                </>
              ) : null}
              {!compact || current.signatureSetup === undefined ? (
                <details
                  data-renewal-signature-editor={channel}
                  open={
                    current.signatureSetup === undefined
                      ? !current.signatureMatchesActor
                      : current.signatureSetup === null
                  }
                >
                  <summary>Managed sender signature · {current.senderEmail}</summary>
                  {current.signatureSetup !== undefined ? (
                    <>
                      <Button
                        size="compact"
                        variant="secondary"
                        type="button"
                        onClick={() => setSignatureSettingsOpen(!signatureSettingsOpen)}
                      >
                        {current.signatureSetup
                          ? "Edit saved signature"
                          : "Set up your signature"}
                      </Button>
                      {signatureSettingsOpen ? (
                        <RenewalSenderSignatureForm
                          onCancel={() => setSignatureSettingsOpen(false)}
                          onSaved={async (choice) => {
                            await signatureSetupSaved(choice);
                            setSignatureSettingsOpen(false);
                          }}
                        />
                      ) : null}
                    </>
                  ) : null}
                  <p className="muted" data-testid="renewal-message-signature-origin">
                    {signatureEdited
                      ? "Edited here. It saves with this message and is kept for your managed sender."
                      : current.signatureOrigin?.kind === "business_profile"
                        ? `Filled from your approved business profile (version ${current.signatureOrigin.version}). Existing saved messages keep their prior signature.`
                        : current.signatureOrigin?.kind === "retained_sender"
                          ? `Filled from your retained sender signature (saved ${formatBusinessTimestamp(current.signatureOrigin.recordedAt)}). Edit here to change it.`
                          : current.signatureOrigin?.kind === "saved"
                            ? current.signatureMatchesActor
                              ? "Saved with this message as your signature for this managed sender."
                              : "Saved with this message by another sender and shown as saved. Use your retained signature or edit it here if you prefer."
                            : "Signature shared across leases for this managed sender."}
                  </p>
                  {retainedDiffers ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        change({
                          ...inputs,
                          signature: current.retainedSignature ?? null,
                        });
                        commit();
                      }}
                    >
                      Use my retained signature
                    </Button>
                  ) : null}
                  <div className="ui-stack">
                    {(
                      [
                        ["name", "Sender name"],
                        ["role", "Approved role / organization"],
                        ["phone", "Verified phone (optional)"],
                        ["hours", "Verified hours (optional)"],
                        ["source", "Signature source (optional)"],
                      ] as const
                    ).map(([field, label]) => {
                      const id =
                        field === "name"
                          ? MESSAGE_CONTROL_IDS.signature(channel)
                          : `${base}-${field}`;
                      return (
                        <Field key={field} htmlFor={id} label={label}>
                          <input
                            id={id}
                            value={signature?.[field] ?? ""}
                            onChange={(event) =>
                              signatureChange(field, event.target.value)
                            }
                          />
                        </Field>
                      );
                    })}
                    <Field
                      htmlFor={`${base}-website`}
                      label="Verified website (optional)"
                    >
                      <input
                        id={`${base}-website`}
                        type="url"
                        value={signature?.website?.url ?? ""}
                        onChange={(event) =>
                          change({
                            ...inputs,
                            signature: {
                              ...(inputs.signature ?? {
                                name: "",
                                role: null,
                                phone: null,
                                hours: null,
                                source: "",
                                website: null,
                              }),
                              website: event.target.value
                                ? {
                                    url: event.target.value,
                                    source: inputs.signature?.source ?? "",
                                  }
                                : null,
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                </details>
              ) : null}
              {channel === "owner" ? (
                <div className="ui-stack">
                  {current.availableCompScreenshot ? (
                    <>
                      <label>
                        <input
                          id={MESSAGE_CONTROL_IDS.attachment}
                          type="checkbox"
                          checked={
                            inputs.compScreenshotReceiptId ===
                            current.availableCompScreenshot.receiptId
                          }
                          onChange={(event) =>
                            change({
                              ...inputs,
                              compScreenshotReceiptId: event.target.checked
                                ? current.availableCompScreenshot!.receiptId
                                : null,
                            })
                          }
                        />
                        Include this screenshot with the message:{" "}
                        {current.availableCompScreenshot.filename}
                      </label>
                      <DownloadLink
                        fileName={current.availableCompScreenshot.filename}
                        href={`/api/lease-renewal/message-attachment?leaseId=${encodeURIComponent(leaseId)}&receiptId=${encodeURIComponent(current.availableCompScreenshot.receiptId)}`}
                      >
                        Download the screenshot
                      </DownloadLink>
                      <p className="muted">Copied text does not include this file.</p>
                    </>
                  ) : (
                    <p
                      className="muted"
                      id={MESSAGE_CONTROL_IDS.attachment}
                      tabIndex={-1}
                    >
                      No current receipted screenshot is available.
                    </p>
                  )}
                  {inputs.compScreenshotReceiptId &&
                  inputs.compScreenshotReceiptId !==
                    current.availableCompScreenshot?.receiptId ? (
                    <Button
                      onClick={() => {
                        change({ ...inputs, compScreenshotReceiptId: null });
                        commit();
                      }}
                    >
                      Remove unavailable attachment selection
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
            {canEdit ? (
              <AutosaveStatus
                state={autosave}
                subject="Message"
                onRetry={retryAutosave}
              />
            ) : null}
            {payload?.unfinished.length ? (
              <p className="muted" data-testid="renewal-message-unfinished">
                Not saved yet: {payload.unfinished.join(", ")}. Each entry saves by itself
                once it is complete; everything else is already saved.
              </p>
            ) : null}
            {readiness ? (
              readiness.complete ? (
                <p className="muted" id={readinessSummaryId}>
                  {readiness.summary}
                </p>
              ) : (
                <details
                  open
                  ref={readinessRef}
                  id={MESSAGE_CONTROL_IDS.readiness(channel)}
                >
                  <summary id={readinessSummaryId}>{readiness.summary}</summary>
                  <ul aria-label="Marked values" className="ui-rows">
                    {readiness.items.map((item) => (
                      <li key={`${item.field}:${item.message}`}>
                        {item.target.kind === "control" ? (
                          <a
                            className="text-link"
                            href={`#${item.target.id}`}
                            onClick={() => openMissingInput(item)}
                          >
                            {item.target.label}
                          </a>
                        ) : (
                          <a className="text-link" href={item.target.href}>
                            {item.target.label}
                          </a>
                        )}
                        : {item.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )
            ) : null}
            {current ? (
              <details
                className="renewal-message-sources"
                id={`renewal-message-${channel}-sources`}
              >
                <summary>Message sources</summary>
                <p>
                  {loadedAtIso
                    ? `Lease facts and saved wording read at ${formatBusinessTimestamp(loadedAtIso)}.`
                    : "The latest source read is unavailable."}
                </p>
                <p>
                  Signed-in sender: {current.senderEmail}. Communications resolves the
                  responsible sender and current recipients for its saved app draft. Gmail
                  creation separately rechecks the source and exact confirmation.
                </p>
                <p id={MESSAGE_CONTROL_IDS.publication(channel)}>
                  Message template: {current.publication.status}
                  {current.publication.ref ? ` (${current.publication.ref})` : ""}.{" "}
                  {current.publication.reason ?? ""}
                </p>
                <p>
                  Editing and copy remain available. Review the exact recipients, wording
                  and attachments before creating an unsent Gmail draft. A person sends
                  from Gmail.
                </p>
              </details>
            ) : null}
            {current.previousDraftAttempts?.length ? (
              <details>
                <summary>
                  Earlier Gmail attempts for this lease (
                  {current.previousDraftAttempts.length})
                </summary>
                {current.previousDraftAttempts.map((attempt) => (
                  <div key={attempt.executionId}>
                    <p>
                      Earlier work record: {attempt.state}. This attempt remains separate
                      from the current message.
                    </p>
                    {attempt.recoveryAvailable ? (
                      <Button
                        disabled={pending}
                        onClick={() => recoverDraft(attempt.executionId)}
                      >
                        Recover earlier Gmail attempt
                      </Button>
                    ) : (
                      <p>Its original managed sender must recover this attempt.</p>
                    )}
                  </div>
                ))}
              </details>
            ) : null}
          </>
        )}
        {secondaryWork}
      </RenewalSecondaryWork>
    </Card>
  );
}
