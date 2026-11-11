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
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Button, ConfirmationDialog, Field } from "@/components/ui";
import { formatBusinessTimestamp } from "@/lib/date-display";
import { renderEditableCommunicationBody } from "@/lib/gmail-hub/sequence-model";
import type {
  CommunicationSequence,
  RichCommunicationMessage,
} from "@/lib/gmail-hub/sequence-model";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";
import { BUSINESS_TIME_ZONE } from "@/lib/lease-renewal/business-calendar";
import { messageRevisionLabel } from "@/lib/lease-renewal/message-revision";
import { STALE_REFINED_BODY_MESSAGE } from "@/lib/lease-renewal/refined-message";
import { NOTICE_GENERATION_NOT_READY } from "@/lib/lease-renewal/notice-source-error";
import {
  RECOMMENDATION_REASON_REFUSAL,
  RecommendationReasonSchema,
} from "@/lib/lease-renewal/renewal-message-preparation";
import type { RenewalPathStepId } from "@/lib/lease-renewal/renewal-path";
import {
  KICKOFF_WORDS,
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
import {
  STANDING_AGREEMENT_WORDS,
  standingRuleBasis,
} from "@/lib/lease-renewal/standing-agreement";

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
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok)
    throw Object.assign(new Error(payload.error ?? "This was not completed."), {
      status: response.status,
    });
  return payload;
}

/** How long to wait before each further read of the review while the lease read is replaced. */
export const COMPOSITION_REREAD_WAITS_MS = [1_500, 3_000, 5_000] as const;

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

function tomorrowIso(): string {
  return new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
  });
}

export function PreparedMessageSlot({
  data,
  compactFull = false,
  deliveryHeld = false,
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
    /** S264: Review offer charges for the tenant offer, shown after its working terms. */
    chargeReview?: ReactNode;
  } & PreparedMessageHandlers
>) {
  const nowCard = useRenewalNowCard();
  const view = useRenewalFocusView();
  const full = compactFull && view?.view === "full";
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
  if (!nowCard || (!preview && !full)) return null;
  return (
    <PreparedMessageBlock
      actionsSlot={actions}
      api={api}
      chargeReview={chargeReview}
      full={full}
      deliveryHeld={deliveryHeld}
      preparation={nowCard?.preparation ?? null}
      previewSlot={preview}
      setPrimary={nowCard?.setPrimary ?? null}
      step={step}
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
  deliveryHeld,
  setPrimary,
  step,
}: Readonly<{
  api: PreparedMessageApi;
  chargeReview: ReactNode;
  preparation: RenewalPreparation | null;
  previewSlot: HTMLElement | null;
  actionsSlot: HTMLElement | null;
  full: boolean;
  deliveryHeld: boolean;
  setPrimary: NonNullable<ReturnType<typeof useRenewalNowCard>>["setPrimary"] | null;
  step: RenewalPathStepId;
}>) {
  const router = useRouter();
  const working = useRenewalWorkingRecord();
  const pricing = useRenewalPricingPolicy();
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
  const [unknownAuthorization, setUnknownAuthorization] = useState<string | null>(null);
  const confirmLock = useRef(false);
  const followUpSave = useRef<PendingSave | null>(null);

  const canIncludeFollowUps =
    api.channel === "tenant" && review?.mode === "send" && Boolean(review.noticeCycleId);
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
    draftOpenRef.current = draftOpen && Boolean(previewSlot);
  }, [draftOpen, previewSlot]);
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
      const heading = previewSlot
        ?.closest("[data-renewal-now-step]")
        ?.querySelector<HTMLElement>("#renewal-now-heading");
      if (heading)
        focusRenewalDashboardControl(heading.id, {
          focusContainer: true,
          viewRequest: false,
        });
    }
  }, [api.draft.pending, api.draft.recoveryRequired, previewSlot]);
  const typedRent = workingRenewalTerms(working?.record ?? null).rent;
  const workingRentBasis = workingRecommendationBasis(working?.record);
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
    ],
  );
  // The items Send needs. For the owner they come from the one projection; for the tenant offer
  // they are the same four read from its own message.
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
          ready: api.signaturePresent,
          missing: api.signaturePresent ? null : "your signature",
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
  const ready =
    (live ? sendReady(live) : needs.every((item) => item.ready)) &&
    !api.outgoingReasons?.length;
  const missingWords = needs.filter((item) => !item.ready && item.missing);
  const firstMissing = needs.find((item) => !item.ready);
  const reviewLabel = ready
    ? KICKOFF_WORDS.reviewAndSend
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

  /** Save the message, read the lease composition and save the communication draft for review. */
  const prepareReview = async (mode: "send" | "schedule") => {
    setBusy(true);
    setMessage("");
    setChangedReview(null);
    try {
      if (!(await api.flush())) {
        setMessage(
          "Your latest message could not be prepared for review. Your entries are kept; correct or retry the save.",
        );
        return;
      }
      const workingFields = messageWorkingFieldsFor(api.channel, api.renewOrNot);
      const workingVersion = working?.confirmedVersion?.(workingFields);
      const figuresChanged = () =>
        Boolean(
          working?.hasUnsettled?.(workingFields) ||
          working?.confirmedVersion?.(workingFields) !== workingVersion,
        );
      const changedMessage = `Working figures changed while this review was loading. Your entries are kept. Choose ${mode === "schedule" ? KICKOFF_WORDS.schedule : KICKOFF_WORDS.reviewAndSend} again to review the current message.`;
      const readComposition = () =>
        json<{
          context: WorkflowCommunicationContext;
          initial: RichCommunicationMessage;
          target: {
            to: string[];
            cc: string[];
            blockers?: string[];
            noticeCycleId?: string | null;
          };
          signatureParagraph?: RichCommunicationMessage["paragraphs"][number] | null;
          reviewedTargetHash: string;
        }>(
          `/api/gmail-hub/composition?purpose=${api.channel === "owner" ? "renewal_owner" : "renewal_tenant"}&lease=${encodeURIComponent(api.leaseId)}`,
        );
      let composition = await readComposition();
      // A lease read older than a minute starts the next RentVine read, and the review made on the
      // older one answers that the generation is being replaced. As the reason asks, the review is
      // read again once that next read lands: reads only, a bounded few, and the server decides.
      for (const waitMs of COMPOSITION_REREAD_WAITS_MS) {
        if (!onlyGenerationBeingReplaced(composition.target.blockers)) break;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        composition = await readComposition();
      }
      if (composition.target.blockers?.length) {
        setMessage(
          `This message cannot be sent yet: ${composition.target.blockers.join(" ")}`,
        );
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
                "The draft save did not answer. Choose Review and send again: the same save is sent again, so no second draft is made.",
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
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The review could not be prepared. Nothing was sent.",
      );
    } finally {
      setBusy(false);
    }
  };

  async function confirm() {
    if (
      !review ||
      unknownAuthorization ||
      confirmLock.current ||
      (review.mode === "schedule" && !scheduleReady) ||
      (includesFollowUps && (!followUpPlan || !followUpMessage))
    )
      return;
    confirmLock.current = true;
    setBusy(true);
    setMessage("");
    let sendingId: string | null = null;
    try {
      let sequence = review.sequence;
      let reviewedDraftHash = review.reviewedDraftHash;
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
      setMessage(
        review.mode === "schedule"
          ? `Scheduled for ${scheduleDate} at ${scheduleTime} Central. It counts as sent once Gmail accepts it.`
          : accepted
            ? `Sent. Gmail accepted the message; the lease now waits on the reply.${nextFollowUp}`
            : "The send is recorded, and Gmail has not confirmed it yet. The lease says what happens next.",
      );

      router.refresh();
    } catch (error) {
      if (sendingId && outcomeUnknown(error)) setUnknownAuthorization(sendingId);
      setMessage(
        error instanceof Error
          ? `${error.message} Check the lease before trying again; nothing is sent twice.`
          : "The response did not arrive. Check the lease before trying again; nothing is sent twice.",
      );
    } finally {
      confirmLock.current = false;
      setBusy(false);
    }
  }

  // R-S249-8: "Review and send" is the Now card's primary action while the step asks for its send.
  const runReview = (button: HTMLButtonElement) => {
    if (!ready) {
      if (firstMissing?.key === "signature") {
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
        `Before sending, add ${missingWords.map((item) => item.missing).join(", ")}.`);
  // The Now card holds one stable action; it always runs the latest review step.
  const latestRun = useRef(runReview);
  useEffect(() => {
    latestRun.current = runReview;
  });
  const stableRun = useCallback(
    (button: HTMLButtonElement) => latestRun.current(button),
    [],
  );
  useEffect(() => {
    if (!setPrimary) return;
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
  ]);
  useEffect(
    () => (setPrimary ? () => setPrimary(step, null) : undefined),
    [setPrimary, step],
  );

  if (!previewSlot && !full) return null;
  const previewBlock = (
    <section
      aria-label={api.channel === "owner" ? "Owner message" : "Tenant offer"}
      className="ui-stack-tight renewal-now-message"
      data-renewal-message-revision={api.revision}
    >
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
      <ul aria-label="What sending needs" className="renewal-now-readiness">
        {needs.map((item) => (
          <li data-renewal-ready={item.ready ? "ready" : "missing"} key={item.key}>
            {item.label}: {item.ready ? "Ready" : `Missing ${item.missing ?? ""}`}
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
  return (
    <>
      {full ? (
        <div className="ui-stack-tight" data-renewal-message-work={api.channel}>
          {!deliveryHeld && api.canEdit ? (
            <Button
              data-renewal-work-primary
              busy={busy}
              onClick={(event) => runReview(event.currentTarget)}
            >
              {reviewLabel}
            </Button>
          ) : null}
          {previewBlock}
          {!deliveryHeld ? actionsBlock : null}
        </div>
      ) : previewSlot ? (
        createPortal(previewBlock, previewSlot)
      ) : null}
      {actionsSlot && !deliveryHeld ? createPortal(actionsBlock, actionsSlot) : null}
      <ConfirmationDialog
        busy={busy}
        busyLabel={review?.mode === "schedule" ? "Scheduling…" : "Sending…"}
        confirmDisabled={
          !review ||
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
        onCancel={() => setReview(null)}
        onConfirm={() => void confirm()}
        open={review !== null}
        startWithReview
        title={review?.mode === "schedule" ? "Review and schedule" : "Review and send"}
        triggerRef={trigger}
      >
        {review ? (
          <div className="ui-stack-tight" data-renewal-field="exact-review">
            <p>
              From {review.sequence.senderEmail} · To {review.to.join(", ")}
              {review.cc.length ? ` · Cc ${review.cc.join(", ")}` : ""}
            </p>
            <p>
              <strong>{review.subject}</strong>
            </p>
            <div className="draft-box">{review.body}</div>
            <p>
              Lease {api.leaseId}
              {review.noticeCycleId ? ` · Cycle ${review.noticeCycleId}` : ""}
            </p>
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
                  onChange={(event) => setFollowUps(event.target.checked)}
                />
                Authorize follow-ups after the tenant offer
              </label>
            ) : null}
            {includesFollowUps ? (
              <fieldset className="ui-stack-tight" disabled={busy}>
                <legend>Follow-up message and timing</legend>
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
    </>
  );
}
