"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { Button, ConfirmationDialog, Field } from "@/components/ui";
import { formatCalendarDate } from "@/lib/date-display";
import { RENEWAL_DASHBOARD_SECTIONS } from "@/lib/lease-renewal/dashboard-sections";
import {
  NOT_PART_OF_PATH_LABEL,
  RENEWAL_PATH_DEFINITION,
  pathStepForLinkStep,
  type NowCardSlot,
  type RenewalPathStepId,
} from "@/lib/lease-renewal/renewal-path";
import { recommendationField } from "@/lib/lease-renewal/current-cycle-terms";
import {
  MESSAGE_CONTROL_IDS,
  WORKING_END_FIELD_ID,
  WORKING_START_FIELD_ID,
} from "@/lib/lease-renewal/message-readiness";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import { startDateFixFromOffer, useRenewalLeaseEnd } from "./RenewalDateProposal";
import {
  RENEWAL_STAGE_NEXT_STEP,
  projectRenewalStage,
  renewalStageWaitingLine,
  type RenewalPathStepState,
  type RenewalPathStepView,
  type RenewalStage,
  type RenewalStageContext,
} from "@/lib/lease-renewal/renewal-stage";
import type { RenewalIssue } from "@/lib/lease-renewal/renewal-issues";
import { currentAcceptanceRead } from "@/lib/lease-renewal/tenant-acceptance-hold";
import { fetchWithDeadline } from "@/lib/ui/fetch-lifetime";
import {
  focusProgrammatically,
  focusRenewalDashboardControl,
  RENEWAL_FOCUS_REQUEST_EVENT,
} from "./RenewalDashboardNavigation";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
import type { RenewalFocusFacts } from "./RenewalFocusViewPane";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import {
  standingAuthorityCurrent,
  useRenewalPricingPolicy,
} from "./RenewalPricingPolicy";
import {
  HOUSING_ASSISTANCE_TARGETS,
  HousingAssistanceField,
  programWorkRecorded,
} from "./RenewalHousingAssistance";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import {
  housingAssistanceFact,
  housingAssistanceVariant,
  workingRenewalTerms,
} from "@/lib/lease-renewal/working-record";
import { housingAssistanceWork } from "@/lib/lease-renewal/housing-assistance-source";
import { nowSlotKey, useRenewalNowCard } from "./RenewalNowCardContext";
import {
  PreparedNumbersCheck,
  RentToRecommendField,
  StoredComparisonSummary,
} from "./RenewalKickoffFields";
import {
  CurrentBaseRentSummary,
  OwnerCurrentBaseRent,
  useCurrentBaseRent,
} from "./RenewalCurrentBaseRent";
import { FOCUS_OPENED_ATTRIBUTE } from "./renewal-focus-reveal";
import {
  GUIDED_PRIORITY_WORDS,
  GUIDED_VERIFICATION_LABELS,
  guidedReturnLabel,
  projectGuidedPriority,
  type GuidedEditorState,
  type GuidedPriorityExtensions,
  type GuidedPriorityInput,
} from "@/lib/lease-renewal/guided-priority";
import { KICKOFF_WORDS } from "@/lib/lease-renewal/renewal-preparation";
import { PrepareThisLeaseButton } from "./RenewalKickoffPreparation";
import { FinishUpSourcePreviews } from "./RenewalFinishUpPreviews";
import {
  OWNER_DECISION_FROM_REPLY_ID,
  RenewalOwnerDecisionFromReply,
} from "./RenewalOwnerDecisionFromReply";
import { OWNER_DECISION_AFTER_REPLY_LABEL } from "@/lib/lease-renewal/workspace-state";
import { RenewalStageHeader } from "./RenewalStageHeader";

/**
 * S247 R-S247-4 to R-S247-10: the Guided view. A path strip names every step of this lease's
 * path; one Now card holds the step to work, with its primary action operating the step's
 * existing controls, which are shown in place below it (the S144 in-pane mechanism, shared with
 * Focus view). Any step can be chosen and worked at any time; choosing, switching views and
 * reloading save nothing and call nothing (AC-S247-4). The stage and the one next step come from
 * the same projection the desk row and the assistant read, recomputed from the live staff
 * record after each save.
 */

const STATE_WORDS: Record<RenewalPathStepState, string> = {
  done: "Done",
  current: "Now",
  open: "Open",
  waiting: "Waiting",
  covered: "Covered",
  not_part: NOT_PART_OF_PATH_LABEL,
};

const WORKSPACE_ROUTE = "/api/lease-renewal/workspace";

/** The existing control an issue's link opens, when it names one on this page. */
function issueTarget(issue: RenewalIssue | undefined): string | null {
  const destination = issue?.destination;
  if (!destination || destination.kind === "none") return null;
  if (destination.kind === "workspace_anchor") return destination.targetId;
  return destination.controlId ?? `renewal-step-${destination.stepId}`;
}

function stepOwning(
  steps: readonly RenewalPathStepView[],
  element: Element,
): RenewalPathStepView | undefined {
  return steps.find(
    (step) =>
      step.state !== "not_part" &&
      step.controls.some((id) => document.getElementById(id)?.contains(element)),
  );
}

/** S269: the one Rent to recommend editor; Guided holds it in Compare market rent's Work. */
const RENT_TO_RECOMMEND_ID = "renewal-now-rent-to-recommend";
/** S269: the Now card's one primary action, which an exact return focuses again. */
const NOW_PRIMARY_ID = "renewal-now-primary";

/**
 * S266: controls this view's Now card renders only on their own step, such as the Housing
 * assistance field on Check the numbers. A request for one chooses that step first. S269 adds
 * Rent to recommend, which leads Compare market rent's active Work in Guided view.
 */
const NOW_CARD_CONTROLS: Partial<Record<RenewalPathStepId, readonly string[]>> = {
  "check-numbers": [
    HOUSING_ASSISTANCE_TARGETS.now.field,
    HOUSING_ASSISTANCE_TARGETS.now.contact,
  ],
  "compare-market": [RENT_TO_RECOMMEND_ID],
};

/** S269 R-S269-3: the outcome a cross-outcome fix started in, and the control to return to. */
interface GuidedReturn {
  readonly stepId: RenewalPathStepId;
  readonly targetId: string;
}

/** The existing editors whose save state an outcome's priority reads (S155 autosave states). */
const OUTCOME_EDITORS: Partial<
  Record<RenewalPathStepId, readonly { field: string; label: string; target: string }[]>
> = {
  "check-numbers": [
    {
      field: "current_rent",
      label: "Working current rent",
      target: "renewal-working-current-rent",
    },
    {
      field: "housing_assistance",
      label: "Housing assistance",
      target: HOUSING_ASSISTANCE_TARGETS.now.field,
    },
  ],
  "compare-market": [
    {
      field: "terms_rent",
      label: KICKOFF_WORDS.rentToRecommend,
      target: RENT_TO_RECOMMEND_ID,
    },
  ],
  "ask-owner": [
    {
      field: "terms_effective_date",
      label: "Working effective date",
      target: WORKING_START_FIELD_ID,
    },
    {
      field: "terms_end_date",
      label: "Working term end date",
      target: WORKING_END_FIELD_ID,
    },
  ],
};

function outcomeEditors(
  stepId: RenewalPathStepId,
  states: Readonly<Record<string, { readonly phase: string; readonly message?: string }>>,
  record: RenewalWorkingRecord | null,
): GuidedEditorState[] {
  return (OUTCOME_EDITORS[stepId] ?? []).flatMap((editor) => {
    // S262: Rent to recommend saves its own fact once the offer basis has its own value.
    const field =
      editor.target === RENT_TO_RECOMMEND_ID ? recommendationField(record) : editor.field;
    const state = states[field];
    return state?.phase === "failed" || state?.phase === "saving"
      ? [
          {
            key: field,
            label: editor.label,
            target: editor.target,
            phase: state.phase,
            ...(state.message ? { message: state.message } : {}),
          },
        ]
      : [];
  });
}

function stepRenderingNowControl(
  steps: readonly RenewalPathStepView[],
  id: string,
): RenewalPathStepView | undefined {
  return steps.find(
    (step) => step.state !== "not_part" && NOW_CARD_CONTROLS[step.id]?.includes(id),
  );
}

export function useRenewalOutcomeStage(context: RenewalStageContext) {
  const manual = useRenewalManualWorkspace();
  const pricing = useRenewalPricingPolicy();
  const working = useRenewalWorkingRecord();
  const state = manual?.state ?? null;
  const readUnavailable = manual?.readUnavailable ?? context.staffRecordUnavailable;
  // S194: exact authority binds to this exact staff record revision, as Focus reads it; an S250
  // standing agreement covers by its rule and the working rent (the one coverage function).
  const standingCovered = pricing?.view
    ? standingAuthorityCurrent(pricing.view, state?.revision ?? 0)
    : context.standingAgreement !== null;
  // S251: the lease's live Housing assistance fact, so a save on this page reorders the path.
  const housingAssistance =
    working && !working.readUnavailable
      ? housingAssistanceVariant(working.record)
      : context.housingAssistance;
  // S264 R-S264-6: the tenant message's live read of the acceptance against the current offer
  // first, then this page's read; the stage counts either only for the current tenant answer.
  const liveAcceptance = useRenewalNowCard()?.offerAnswers?.view?.acceptance;
  const tenantAcceptance = currentAcceptanceRead(state, [
    liveAcceptance,
    context.tenantAcceptance,
  ]);
  const stage = useMemo(
    () =>
      projectRenewalStage(
        state,
        {
          ...context,
          staffRecordUnavailable: readUnavailable,
          housingAssistance,
          tenantAcceptance,
          // S250 R-S250-6: an applied agreement that no longer covers returns the owner step.
          standingLeft:
            pricing?.view?.authority.kind === "standing" &&
            !pricing.view.authority.covered
              ? { reason: pricing.view.authority.reason }
              : pricing?.view
                ? null
                : (context.standingLeft ?? null),
          standingAgreement: standingCovered
            ? {
                label:
                  pricing?.view?.authority.label ??
                  context.standingAgreement?.label ??
                  null,
                reason:
                  pricing?.view?.authority.reason ??
                  context.standingAgreement?.reason ??
                  "Standing owner authority covers this lease.",
              }
            : null,
        },
        { standingCovered },
      ),
    [
      state,
      context,
      readUnavailable,
      standingCovered,
      pricing,
      housingAssistance,
      tenantAcceptance,
    ],
  );
  return { stage, readUnavailable };
}

type SourceRenewalEvidence = NonNullable<RenewalStageContext["sourceRenewal"]>;

function RenewalSourceCompletionControl({
  dates,
  leaseId,
  guided = false,
}: Readonly<{ dates: SourceRenewalEvidence; leaseId: string; guided?: boolean }>) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const attempt = useRef<{ key: string; operationId: string } | null>(null);
  const inFlight = useRef(false);
  const [review, setReview] = useState<SourceRenewalEvidence | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function confirm() {
    if (!review || inFlight.current) return;
    const payload = {
      operation: "confirm_source_renewal",
      leaseId,
      recordedDateIso: review.recordedDateIso,
      sourceDateIso: review.sourceDateIso,
      cycleId: review.cycleId,
      expectedRevision: review.revision,
    };
    const key = JSON.stringify(payload);
    if (attempt.current?.key !== key)
      attempt.current = { key, operationId: crypto.randomUUID() };
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetchWithDeadline(WORKSPACE_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...payload, operationId: attempt.current.operationId }),
      });
      const result = (await response.json()) as { error?: string };
      if (response.ok) {
        attempt.current = null;
        setReview(null);
        setMessage(
          "Staff completion recorded, with the RentVine lease end as the evidence.",
        );
        router.refresh();
      } else {
        if (response.status < 500) attempt.current = null;
        setMessage(
          result.error ?? "The completion was not confirmed. Check this review again.",
        );
      }
    } catch {
      setMessage(
        "The response did not arrive. Confirm this same review to check the result.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        data-renewal-now-primary={guided ? true : undefined}
        data-renewal-work-primary
        data-renewal-now-target={guided ? "renewal-manual-complete" : undefined}
        onClick={() => {
          setMessage("");
          setReview(dates);
        }}
        ref={trigger}
        size="compact"
      >
        {RENEWAL_STAGE_NEXT_STEP.confirmFinished}
      </Button>
      {!review && message ? <p role="status">{message}</p> : null}
      <ConfirmationDialog
        busy={busy}
        busyLabel="Recording…"
        confirmLabel="Record staff completion"
        description={
          review
            ? `This cycle recorded lease end ${formatCalendarDate(review.recordedDateIso)}. RentVine now reports lease end ${formatCalendarDate(review.sourceDateIso)}.`
            : undefined
        }
        error={message || undefined}
        onCancel={() => setReview(null)}
        onConfirm={() => void confirm()}
        open={review !== null}
        title="Confirm this renewal is finished?"
        triggerRef={trigger}
      >
        <p>
          Confirming records this cycle as complete on the lease&rsquo;s staff record,
          with the RentVine lease end as the evidence. The record stays in this app, and
          you can reopen it from the lease.
        </p>
      </ConfirmationDialog>
    </>
  );
}

/** One Work entry and separate read-only facts for a Full outcome. */
export function RenewalFullOutcome({
  context,
  enabled = true,
  stepId,
  canEdit,
  evidence,
  children,
}: Readonly<{
  context: RenewalStageContext;
  enabled?: boolean;
  stepId: RenewalPathStepId;
  canEdit: boolean;
  evidence?: ReactNode;
  children?: ReactNode;
}>) {
  const view = useRenewalFocusView();
  const { stage } = useRenewalOutcomeStage(context);
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const full = enabled && view?.view === "full";
  const shownHere =
    enabled && view?.view === "guided" && view.nowPresentation?.stepId === stepId;
  const showVerification = full || shownHere;
  // S270: Verification starts closed again on another outcome (a view switch remounts it).
  const verification = useRef<HTMLDetailsElement | null>(null);
  useLayoutEffect(() => {
    if (verification.current) verification.current.open = false;
  }, [shownHere]);
  const step = stage.steps.find((item) => item.id === stepId) ?? {
    id: stepId,
    label: RENEWAL_PATH_DEFINITION[stepId].label,
    state: "not_part",
    primary: null,
    detail: null,
  };
  const current = step.id === stage.currentStepId;
  const blocker = current ? stage.blocker : null;
  const audience =
    stepId === "ask-owner" ? "owner" : stepId === "offer-tenant" ? "tenant" : null;
  const delivery = audience ? stage.evidence[audience] : null;
  // S269 rule 2 (AC-S269-1, both views): an unresolved send for this outcome's message leads with
  // its own check on the same attempt, ahead of the step's next action (such as recording an
  // earlier reply, which stays available through the Owner or Tenant response).
  const unresolvedSend =
    audience && delivery?.unconfirmedSequenceId && step.state !== "not_part"
      ? {
          label: RENEWAL_STAGE_NEXT_STEP.checkSend,
          target: `renewal-card-message-${audience}`,
        }
      : null;
  const primary =
    blocker ??
    unresolvedSend ??
    (step.state === "covered" && stepId === "ask-owner"
      ? {
          label: "Continue to Offer the tenant",
          target: "renewal-outcome-offer-tenant",
          continueTo: "offer-tenant" as const,
        }
      : step.primary);
  const reconcile =
    primary?.label === RENEWAL_STAGE_NEXT_STEP.checkSend
      ? delivery?.unconfirmedSequenceId
      : null;
  const messageOwnsPrimary =
    audience &&
    !blocker &&
    primary?.label === RENEWAL_PATH_DEFINITION[stepId].primary.label;
  const sourceCompletion =
    !blocker && primary?.label === RENEWAL_STAGE_NEXT_STEP.confirmFinished
      ? context.sourceRenewal
      : null;
  const completionOwnsPrimary =
    stepId === "complete" &&
    !blocker &&
    (primary?.label === RENEWAL_PATH_DEFINITION.complete.primary.label ||
      primary?.label === "Review the recorded completion");
  const hasAction =
    step.state !== "not_part" &&
    primary &&
    !messageOwnsPrimary &&
    !completionOwnsPrimary &&
    !sourceCompletion &&
    (!reconcile || canEdit);
  async function act() {
    if (!primary || busy) return;
    if (reconcile) {
      setBusy(true);
      try {
        const response = await fetchWithDeadline("/api/gmail-hub/sequences", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "reconcile", id: reconcile }),
        });
        setFeedback(
          response.ok
            ? "The communication was checked. Review the current result."
            : "The send is still unconfirmed. Check the same attempt again.",
        );
        if (response.ok) router.refresh();
      } catch {
        setFeedback("The send is still unconfirmed. Check the same attempt again.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if ("continueTo" in primary && primary.continueTo) {
      focusRenewalDashboardControl(`renewal-outcome-${primary.continueTo}`, {
        focusContainer: true,
      });
    } else if (primary.target) {
      focusRenewalDashboardControl(
        primary.target === "renewal-section-comps"
          ? "renewal-market-comparison-controls"
          : primary.target,
      );
    } else {
      document.getElementById("renewal-refresh")?.click();
    }
  }
  if (!enabled) return <>{children}</>;
  return (
    <section
      aria-label={full ? step.label : undefined}
      className="ui-stack-tight"
      data-renewal-outcome={full ? stepId : undefined}
      data-renewal-work-state={
        full ? (reconcile ? "reconcile" : blocker ? "blocked" : step.state) : undefined
      }
    >
      <h3 hidden={!full} id={`renewal-outcome-${stepId}`} tabIndex={-1}>
        {step.label}
      </h3>
      <div className="ui-stack-tight" data-renewal-work={full ? true : undefined}>
        <div className="ui-stack-tight" hidden={!full}>
          {blocker ? <p role="alert">{blocker.label}</p> : null}
          {step.state === "not_part" ? <p>{NOT_PART_OF_PATH_LABEL}.</p> : null}
          {step.state === "waiting" && stage.waiting && current ? (
            <p data-renewal-field="waiting">{renewalStageWaitingLine(stage.waiting)}</p>
          ) : null}
          {step.detail && !blocker && step.state !== "waiting" ? (
            <p>{step.detail}</p>
          ) : null}
          {sourceCompletion && canEdit && full ? (
            <RenewalSourceCompletionControl
              dates={sourceCompletion}
              leaseId={context.leaseId}
            />
          ) : null}
          {hasAction ? (
            <Button
              busy={busy}
              data-renewal-work-primary
              onClick={() => void act()}
              size="compact"
            >
              {primary.label}
            </Button>
          ) : null}
          {feedback ? <p role="status">{feedback}</p> : null}
        </div>
        {children}
      </div>
      <div hidden={!showVerification} data-renewal-verification-owner={stepId}>
        <details
          data-renewal-verification={showVerification ? true : undefined}
          id={`renewal-evidence-${stepId}`}
          key={view?.view}
          ref={verification}
        >
          {/* S270: the outcome's named read-only Verification. */}
          <summary>{GUIDED_VERIFICATION_LABELS[stepId]}</summary>
          {current && stage.check ? <p>{stage.check.sentence}</p> : null}
          {current && stage.evidenceLine && stage.evidenceLine !== step.detail ? (
            <p>{stage.evidenceLine}</p>
          ) : null}
          {evidence ?? <p>{RENEWAL_PATH_DEFINITION[stepId].ready}</p>}
          {/* S264: Review offer charges shows its ended and unrelated lines here, read only. */}
          {stepId === "offer-tenant" ? (
            <div
              data-renewal-offer-charge-evidence-host
              id="renewal-offer-charge-evidence"
            />
          ) : null}
        </details>
      </div>
    </section>
  );
}

/**
 * S270 R-S270-2: what keeps a named group open as current work: a failed or pending save, an
 * invalid field or a governing note marked `data-renewal-promote`.
 */
const CURRENT_WORK_SELECTOR =
  "[data-autosave='failed'], [data-autosave='saving'], [aria-invalid='true'], [data-renewal-promote]";

/** Why a named group holds current work now, or null. Reading it changes nothing. */
function groupPromotion(details: HTMLDetailsElement, leadTarget: string | null) {
  const marker = details.querySelector(CURRENT_WORK_SELECTOR);
  if (marker)
    return marker.hasAttribute("data-autosave")
      ? `save-${marker.getAttribute("data-autosave")}`
      : marker.hasAttribute("aria-invalid")
        ? "invalid"
        : "governing";
  // The shown Guided outcome's current required field or recovery (S269's lead).
  const target = leadTarget ? document.getElementById(leadTarget) : null;
  return target && details.contains(target) ? "lead" : null;
}

/**
 * Secondary actions remain mounted for continuity and their exact links. S270: each outcome has
 * one named group below its active Work, closed on ordinary entry, a view switch or another
 * outcome. An exact link opens it (focusRenewalDashboardControl opens the target's ancestors);
 * current work inside keeps it open through a switch; closing it with focus inside returns focus
 * to its summary. Opening and closing are presentation only.
 */
export function RenewalSecondaryWork({
  children,
  label,
  stepId,
  optionalHost = false,
}: Readonly<{
  children: ReactNode;
  label: string;
  /** S270: the outcome whose named group this is, in Guided and Full. */
  stepId?: RenewalPathStepId;
  /** S270: a place the Guided Now card fills with an optional editor (Housing assistance). */
  optionalHost?: boolean;
}>) {
  const view = useRenewalFocusView();
  const ref = useRef<HTMLDetailsElement | null>(null);
  const promoted = useNamedDisclosure(ref, { stepId });
  // The place the Guided Now card fills with an optional editor registers itself.
  const setGroupHost = view?.setGroupHost;
  const hostRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (stepId) setGroupHost?.(stepId, element);
    },
    [setGroupHost, stepId],
  );
  if (!view?.outcomeLayout) return <>{children}</>;
  return (
    <details
      className="renewal-secondary-work"
      data-renewal-group={stepId ? label : undefined}
      data-renewal-group-step={stepId}
      data-renewal-promoted={promoted ?? undefined}
      data-renewal-secondary-work
      ref={ref}
    >
      <summary>{label}</summary>
      <div className="ui-stack">
        {optionalHost && stepId ? (
          <div data-renewal-group-host={stepId} ref={hostRef} />
        ) : null}
        {children}
      </div>
    </details>
  );
}

/**
 * S270: the shared rules of a named disclosure (an outcome's group, or the Working renewal terms
 * reveal). It starts closed and closes again on a view switch or another outcome, unless it holds
 * current work: a failed or pending save, an invalid field, a marked governing note, the shown
 * Guided outcome's lead (its current required field) or `held` (a reason its owner gives). Current
 * work opens it and keeps it open through a switch. Closing it with focus inside returns focus to
 * its summary. Returns why it holds current work, for `data-renewal-promoted`.
 */
export function useNamedDisclosure(
  ref: React.RefObject<HTMLDetailsElement | null>,
  { stepId, held = null }: Readonly<{ stepId?: RenewalPathStepId; held?: string | null }>,
): string | null {
  const view = useRenewalFocusView();
  const viewName = view?.view ?? null;
  const shownStep =
    viewName === "guided" ? (view?.nowPresentation?.stepId ?? null) : null;
  const leadTarget =
    stepId && shownStep === stepId && view?.guidedLead?.stepId === stepId
      ? view.guidedLead.target
      : null;
  const [promoted, setPromoted] = useState<string | null>(null);
  const evaluate = useCallback(() => {
    const next = ref.current ? (held ?? groupPromotion(ref.current, leadTarget)) : null;
    setPromoted((current) => (current === next ? current : next));
  }, [ref, held, leadTarget]);
  useLayoutEffect(() => {
    evaluate();
  });
  // A save that fails or starts inside the group changes only attributes, so watch them.
  useEffect(() => {
    const details = ref.current;
    if (!details || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(evaluate);
    observer.observe(details, {
      attributes: true,
      attributeFilter: ["data-autosave", "aria-invalid", "data-renewal-promote"],
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [ref, evaluate]);
  const seen = useRef({ viewName, shownStep });
  const openedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    const details = ref.current;
    if (!details) return;
    const before = seen.current;
    seen.current = { viewName, shownStep };
    const switched = before.viewName !== viewName || before.shownStep !== shownStep;
    const current = held ?? groupPromotion(details, leadTarget);
    if (current) {
      // Current work opens with the group and stays open through a switch.
      if (switched || openedFor.current !== current) details.open = true;
      openedFor.current = current;
      return;
    }
    openedFor.current = null;
    if (!switched || details.contains(document.activeElement)) return;
    // A group the Guided reveal holds open for the shown outcome's control stays open.
    if (viewName === "guided" && details.hasAttribute(FOCUS_OPENED_ATTRIBUTE)) return;
    details.open = false;
  });
  // Closing the disclosure while focus is inside returns focus to its summary.
  const layout = view?.outcomeLayout ?? false;
  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    const summary = () => details.querySelector<HTMLElement>(":scope > summary");
    let inside = false;
    const onFocusIn = (event: FocusEvent) => {
      inside = event.target !== summary();
    };
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && !details.contains(event.relatedTarget))
        inside = false;
    };
    const onToggle = () => {
      if (details.open) return;
      const active = document.activeElement;
      const lost = active === null || active === document.body;
      const target = summary();
      if (
        target &&
        ((active !== target && active !== null && details.contains(active)) ||
          (inside && lost))
      )
        focusProgrammatically(target);
      inside = false;
    };
    details.addEventListener("focusin", onFocusIn);
    details.addEventListener("focusout", onFocusOut);
    details.addEventListener("toggle", onToggle);
    return () => {
      details.removeEventListener("focusin", onFocusIn);
      details.removeEventListener("focusout", onFocusOut);
      details.removeEventListener("toggle", onToggle);
    };
  }, [ref, layout]);
  return promoted;
}

export function RenewalGuidedView({
  context,
  facts,
  selectedStepId,
  canEdit,
  priorityExtensions,
}: Readonly<{
  context: RenewalStageContext;
  facts: RenewalFocusFacts;
  /** The page's `step` value: a path step, or an older step that names one (R-S247-11). */
  selectedStepId?: string;
  canEdit: boolean;
  /**
   * S269 extension point: the controls S262, S263, S264, S265 and S268 add, by owner and action
   * identity, so they take their place in the one priority (lib/lease-renewal/guided-priority).
   */
  priorityExtensions?: GuidedPriorityExtensions;
}>) {
  const view = useRenewalFocusView();
  const { stage, readUnavailable } = useRenewalOutcomeStage(context);
  // The step shown: one chosen on this page, else the one a reload returns to (R-S247-9), else
  // the one the address names (an older `step` value names the path step that holds it,
  // R-S247-11), else the current step.
  const [chosen, setChosen] = useState<RenewalPathStepId | "follow-current" | null>(null);
  const preferred =
    chosen === "follow-current"
      ? null
      : (chosen ??
        pathStepForLinkStep(view?.restoredStep ?? null) ??
        pathStepForLinkStep(selectedStepId));
  // S251: on an assisted lease Ask the owner is not part of the path until Propose a change;
  // a link to it opens the step that holds the owner message there, the renewing question.
  const linked =
    chosen === null &&
    preferred === "ask-owner" &&
    stage.steps.find((step) => step.id === "ask-owner")?.state === "not_part" &&
    stage.steps.some((step) => step.id === "assisted-owner-renewal-answer")
      ? "assisted-owner-renewal-answer"
      : preferred;
  const [priorStep, setPriorStep] = useState({
    current: stage.currentStepId,
    linked,
  });
  if (priorStep.current !== stage.currentStepId || priorStep.linked !== linked) {
    // A link or restored choice that was showing the then-current step follows its progress.
    // A deliberate inspection of some other step stays available in any order.
    const followsProgress =
      priorStep.current !== stage.currentStepId &&
      priorStep.linked === priorStep.current &&
      linked === priorStep.linked;
    if (followsProgress) setChosen("follow-current");
    setPriorStep({
      current: stage.currentStepId,
      linked: followsProgress ? null : linked,
    });
  }
  const shownId =
    linked && stage.steps.some((step) => step.id === linked)
      ? linked
      : stage.currentStepId;
  const rememberStep = view?.rememberStep;
  useEffect(() => {
    rememberStep?.(preferred);
  }, [rememberStep, preferred]);
  const shown = stage.steps.find((step) => step.id === shownId) ?? stage.steps[0]!;
  const guided = view?.view === "guided";
  const setNowPresentation = view?.setNowPresentation;
  useLayoutEffect(() => {
    if (!guided || !setNowPresentation) return;
    setNowPresentation({ stepId: shown.id, state: shown.state });
    return () => setNowPresentation(null);
  }, [guided, setNowPresentation, shown.id, shown.state]);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const focusHeading = useRef(false);
  const [announcement, setAnnouncement] = useState("");
  // R-S269-3: a cross-outcome fix keeps the outcome it started in, for its exact return.
  const [returnTo, setReturnTo] = useState<GuidedReturn | null>(null);
  const pendingReturn = useRef<GuidedReturn | null>(null);

  const choose = useCallback(
    (id: RenewalPathStepId) => {
      focusHeading.current = true;
      setReturnTo(null);
      setChosen(id === stage.currentStepId ? "follow-current" : id);
    },
    [stage.currentStepId],
  );
  /**
   * Follow an exact fix: reveal and focus its owning control, never operate it. A fix owned by
   * another outcome keeps this one for "Return to ...". Presentation only.
   */
  const followFix = useCallback((lead: GuidedPriorityInput, from: RenewalPathStepId) => {
    // The focus request below is answered synchronously by the listener in this view, which
    // takes the return when it opens another outcome.
    pendingReturn.current =
      lead.owner !== from ? { stepId: from, targetId: NOW_PRIMARY_ID } : null;
    focusRenewalDashboardControl(lead.target);
    pendingReturn.current = null;
  }, []);
  const returnToOrigin = useCallback(() => {
    if (!returnTo) return;
    pendingFocus.current = returnTo.targetId;
    setReturnTo(null);
    setChosen(
      returnTo.stepId === stage.currentStepId ? "follow-current" : returnTo.stepId,
    );
  }, [returnTo, stage.currentStepId]);
  const previouslyRevealed = useRef<RenewalPathStepId | null>(null);

  // Reveal the shown step's existing controls in place; everything else stays mounted, hidden.
  useLayoutEffect(() => {
    if (!guided || !view?.slot) return;
    const body = view.slot.parentElement;
    if (!body) return;
    const previous = previouslyRevealed.current;
    previouslyRevealed.current = shown.id;
    const oldFocus = document.activeElement;
    const focusedOldWork =
      previous !== null &&
      previous !== shown.id &&
      oldFocus instanceof HTMLElement &&
      view.nowSlot?.parentElement?.contains(oldFocus);
    const contexts = [
      ...body.querySelectorAll<HTMLElement>("[data-renewal-focus-context]"),
    ].filter(
      // The recorded-work card names its own suggestion; the guided view names one next step,
      // so the card shows only when the staff record must be read again.
      (element) =>
        readUnavailable || !element.classList.contains("renewal-primary-progress"),
    );
    const inactive =
      shown.id === stage.currentStepId &&
      (stage.stage.key === "retired" ||
        context.cycleDisposition?.state === "unavailable");
    const targets = (inactive ? [] : shown.controls)
      .map((id) => document.getElementById(id))
      .filter(
        (element): element is HTMLElement => element !== null && body.contains(element),
      );
    const verification = body.querySelector(
      `[data-renewal-verification-owner="${shown.id}"]`,
    );
    // S270: the place in the outcome's named group where the Now card puts an optional editor.
    const hosts = inactive
      ? []
      : [...body.querySelectorAll(`[data-renewal-group-host="${shown.id}"]`)];
    view.applyReveal(
      [
        view.slot,
        ...(verification ? [verification] : []),
        ...[view.nowSlot, view.afterSlot].filter(
          (element): element is HTMLElement => element !== null,
        ),
        ...contexts,
        ...targets,
        ...hosts,
      ],
      // S270: the shown outcome's own named group keeps its summary and its own closed state.
      { outcome: shown.id },
    );
    if (pendingFocus.current) {
      const id = pendingFocus.current;
      pendingFocus.current = null;
      focusRenewalDashboardControl(id, { viewRequest: false });
    } else if (focusHeading.current) {
      focusHeading.current = false;
      if (heading.current) focusProgrammatically(heading.current);
    } else if (focusedOldWork && oldFocus.closest("[hidden]") && heading.current) {
      focusProgrammatically(heading.current);
    }
  });

  // A change the person did not make (a save, a refreshed source) is announced.
  const previous = useRef({ current: stage.currentStepId, line: stage.stageLine });
  useEffect(() => {
    const before = previous.current;
    previous.current = { current: stage.currentStepId, line: stage.stageLine };
    if (before.current === stage.currentStepId && before.line === stage.stageLine) return;
    setAnnouncement(`${stage.stageLine}. Next step: ${stage.nextStep.label}.`);
  }, [stage]);

  // A link to a control outside the shown step chooses the step that holds it, or opens Full
  // view at that control; a control already shown passes through.
  useEffect(() => {
    if (!view) return;
    // R-S269-3: an exact fix that opens another outcome keeps the one it started in.
    const keepReturn = (owner: RenewalPathStepId) => {
      const origin = pendingReturn.current;
      if (origin && origin.stepId !== owner) setReturnTo(origin);
    };
    const onRequest = (event: Event) => {
      if (view.view !== "guided") return;
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      const element = id ? document.getElementById(id) : null;
      // S266: a Now card control of another step chooses that step; it takes focus once shown.
      const nowOwner =
        id && !element ? stepRenderingNowControl(stage.steps, id) : undefined;
      if (id && nowOwner) {
        event.preventDefault();
        pendingFocus.current = id;
        keepReturn(nowOwner.id);
        setChosen(nowOwner.id === stage.currentStepId ? "follow-current" : nowOwner.id);
        return;
      }
      if (!id || !element || !element.closest("[data-renewal-focus-hidden]")) return;
      event.preventDefault();
      const owner = stepOwning(stage.steps, element);
      if (owner) {
        pendingFocus.current = id;
        keepReturn(owner.id);
        setChosen(owner.id === stage.currentStepId ? "follow-current" : owner.id);
      } else view.showInFull(id);
    };
    document.addEventListener(RENEWAL_FOCUS_REQUEST_EVENT, onRequest);
    return () => document.removeEventListener(RENEWAL_FOCUS_REQUEST_EVENT, onRequest);
  }, [view, stage]);

  if (!view) return null;
  const header = view.stageSlot
    ? createPortal(
        <RenewalStageHeader
          canEdit={canEdit && !readUnavailable}
          disposition={context.cycleDisposition}
          leaseId={context.leaseId}
          stage={stage}
        />,
        view.stageSlot,
      )
    : null;
  if (!guided || !view.slot) return header;
  const pane = createPortal(
    <GuidedPane
      announcement={announcement}
      canEdit={canEdit}
      choose={choose}
      context={context}
      extensions={priorityExtensions}
      facts={facts}
      followFix={followFix}
      heading={heading}
      leaseId={context.leaseId}
      onReturn={returnToOrigin}
      returnTo={returnTo && returnTo.stepId !== shown.id ? returnTo : null}
      shown={shown}
      showInFull={(id) => view.showInFull(id)}
      stage={stage}
    />,
    view.slot,
  );
  return (
    <>
      {header}
      {pane}
    </>
  );
}

/** Focus an existing control; one outside the shown step chooses its step or opens Full view. */
function focusControl(target: string): boolean {
  return focusRenewalDashboardControl(target);
}

type GuidedLinks = Readonly<{
  /** S269: follow an exact fix to its owning control, keeping this outcome for its return. */
  followFix: (lead: GuidedPriorityInput, from: RenewalPathStepId) => void;
  /** S269: the outcome an exact fix started in, while another outcome is shown. */
  returnTo: GuidedReturn | null;
  onReturn: () => void;
  extensions?: GuidedPriorityExtensions;
}>;

function GuidedPane({
  announcement,
  canEdit,
  choose,
  context,
  extensions,
  facts,
  followFix,
  heading,
  leaseId,
  onReturn,
  returnTo,
  shown,
  showInFull,
  stage,
}: GuidedLinks &
  Readonly<{
    announcement: string;
    canEdit: boolean;
    choose: (id: RenewalPathStepId) => void;
    context: RenewalStageContext;
    facts: RenewalFocusFacts;
    heading: React.RefObject<HTMLHeadingElement | null>;
    leaseId: string;
    shown: RenewalPathStepView;
    showInFull: (id: string | null) => void;
    stage: RenewalStage;
  }>) {
  const view = useRenewalFocusView();
  // S249 R-S249-1 (D-OP-7): where the numbers check states "Numbers agree" on RentVine, an
  // operating Sheet difference is information on that check, never a second item to work.
  const alsoNeedsYou = facts.advisories.filter(
    (advisory) =>
      !(
        advisory.id === "advisory:current_rent_sources" &&
        (shown.id === "check-numbers" || context.preparation?.numbers.state === "agree")
      ),
  );
  return (
    <>
      {facts.moveOutNotice ? (
        <p className="renewal-notice" role="note">
          {facts.moveOutNotice}
        </p>
      ) : null}
      {facts.unavailableReads && facts.unavailableReads.length > 0 ? (
        <div role="note">
          <p className="muted">
            Some supporting renewal information could not be verified, so the actions that
            depend on it are paused:
          </p>
          <ul aria-label="Supporting information unavailable">
            {facts.unavailableReads.map((read) => (
              <li key={read}>{read}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <nav aria-label="Renewal path" className="renewal-path-strip">
        <ol className="renewal-path-steps">
          {stage.steps.map((step) => (
            <li
              className="renewal-path-step"
              data-renewal-path-state={step.state}
              data-renewal-path-step={step.id}
              key={step.id}
            >
              <button
                aria-current={step.id === stage.currentStepId ? "step" : undefined}
                aria-describedby={`renewal-path-state-${step.id}`}
                aria-pressed={step.id === shown.id}
                className="renewal-path-button"
                onClick={() => choose(step.id)}
                type="button"
              >
                {step.label}
              </button>
              <span className="renewal-path-state" id={`renewal-path-state-${step.id}`}>
                {STATE_WORDS[step.state]}
              </span>
            </li>
          ))}
        </ol>
      </nav>
      {view?.nowSlot
        ? createPortal(
            <NowCard
              canEdit={canEdit}
              choose={choose}
              context={context}
              extensions={extensions}
              facts={facts}
              followFix={followFix}
              heading={heading}
              leaseId={leaseId}
              onReturn={onReturn}
              returnTo={returnTo}
              shown={shown}
              stage={stage}
            />,
            view.nowSlot,
          )
        : null}
      {view?.afterSlot
        ? createPortal(
            <>
              {alsoNeedsYou.length > 0 ? (
                <section
                  aria-label="Also needs you"
                  className="ui-stack-tight renewal-also-needs"
                >
                  <h3 className="renewal-focus-group">Also needs you</h3>
                  <ul>
                    {alsoNeedsYou.map((advisory) => (
                      <li data-renewal-issue-id={advisory.id} key={advisory.id}>
                        <span className="renewal-issue-kind">{advisory.kindLabel}:</span>{" "}
                        {advisory.reason}{" "}
                        <button
                          className="text-link"
                          onClick={() =>
                            advisory.id === "advisory:current_rent_sources"
                              ? choose("check-numbers")
                              : showInFull(issueTarget(advisory.issue))
                          }
                          type="button"
                        >
                          Work on this
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {!view.outcomeLayout ? (
                <nav
                  aria-label="Every section in Full view"
                  className="renewal-guided-sections"
                >
                  <h3 className="renewal-focus-group">Every section in Full view</h3>
                  <ul className="ui-row">
                    {RENEWAL_DASHBOARD_SECTIONS.map((section) => (
                      <li key={section.id}>
                        <a
                          className="text-link renewal-workspace-link"
                          data-renewal-presentation-control
                          href={`#renewal-section-${section.id}`}
                          onClick={(event) => {
                            event.preventDefault();
                            const hash = event.currentTarget.hash;
                            if (window.location.hash !== hash)
                              window.history.replaceState(window.history.state, "", hash);
                            showInFull(hash.slice(1));
                          }}
                        >
                          {section.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}
              <p aria-live="polite" className="sr-only" role="status">
                {announcement}
              </p>
            </>,
            view.afterSlot,
          )
        : null}
    </>
  );
}

function NowCard({
  canEdit,
  choose,
  context,
  extensions,
  facts,
  followFix,
  heading,
  leaseId,
  onReturn,
  returnTo,
  shown,
  stage,
}: GuidedLinks &
  Readonly<{
    canEdit: boolean;
    choose: (id: RenewalPathStepId) => void;
    context: RenewalStageContext;
    facts: RenewalFocusFacts;
    heading: React.RefObject<HTMLHeadingElement | null>;
    leaseId: string;
    shown: RenewalPathStepView;
    stage: RenewalStage;
  }>) {
  const router = useRouter();
  const manual = useRenewalManualWorkspace();
  const nowCard = useRenewalNowCard();
  const focusView = useRenewalFocusView();
  const outcomeLayout = focusView?.outcomeLayout ?? false;
  const preparation = context.preparation ?? null;
  // The correction names the live staff record's cycle.
  const state = manual?.state ?? null;
  const definition = RENEWAL_PATH_DEFINITION[shown.id];
  const isCurrent = shown.id === stage.currentStepId;
  const coveredOwnerStep = shown.id === "ask-owner" && shown.state === "covered";
  const audience =
    shown.id === "ask-owner" ? "owner" : shown.id === "offer-tenant" ? "tenant" : null;
  const evidence = audience ? stage.evidence[audience] : null;
  const derived = audience
    ? (stage.derived.find((fact) => fact.record.audience === audience) ?? null)
    : null;
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const operation = useRef(new Map<string, string>());
  const reasonId = useId();
  const correctionTrigger = useRef<HTMLButtonElement | null>(null);
  const reasonField = useRef<HTMLTextAreaElement | null>(null);
  const correctionExit = useRef<"trigger" | "heading" | null>(null);
  useLayoutEffect(() => {
    if (correcting) {
      if (reasonField.current) focusProgrammatically(reasonField.current);
      return;
    }
    const exit = correctionExit.current;
    correctionExit.current = null;
    const target =
      exit === "heading"
        ? heading.current
        : exit === "trigger"
          ? correctionTrigger.current
          : null;
    if (target) focusProgrammatically(target);
  }, [correcting, heading]);
  const operationId = (key: string) => {
    let id = operation.current.get(key);
    if (!id) {
      id = crypto.randomUUID();
      operation.current.set(key, id);
    }
    return id;
  };

  async function post(body: Record<string, unknown>, key: string, done: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetchWithDeadline(WORKSPACE_ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, operationId: operationId(key) }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: unknown;
      } | null;
      if (!response.ok) {
        operation.current.delete(key);
        setMessage(
          typeof result?.error === "string" ? result.error : "This was not recorded.",
        );
        return false;
      }
      operation.current.delete(key);
      setMessage(done);
      router.refresh();
      return true;
    } catch {
      setMessage(
        "The response did not arrive, so it is not yet known whether this was recorded. Choose it again to finish it; it is recorded once.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function reconcile(sequenceId: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetchWithDeadline("/api/gmail-hub/sequences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reconcile", id: sequenceId }),
      });
      setMessage(
        response.ok
          ? "Checked with Gmail. The lease shows what Gmail confirmed."
          : "Gmail could not be checked just now. The message stays not confirmed.",
      );
      if (response.ok) router.refresh();
    } catch {
      setMessage("Gmail could not be checked just now. The message stays not confirmed.");
    } finally {
      setBusy(false);
    }
  }

  // The one primary action. A failed read is the thing to resolve first; a step waiting on someone
  // else asks staff to record what happened; every other step has its own action.
  const blocker = isCurrent ? stage.blocker : null;
  // A scheduled first message has not gone out: the step shows its schedule and the message's
  // own schedule controls, with nothing to record or send again yet.
  const recordWhatHappened =
    shown.state === "waiting" && audience && !shown.scheduled
      ? { label: "Record what happened", target: `renewal-manual-${audience}_response` }
      : null;
  const primary =
    coveredOwnerStep && !blocker
      ? { label: "Continue to Offer the tenant", target: "renewal-step-tenant-decision" }
      : (blocker ?? shown.primary ?? recordWhatHappened ?? definition.primary);
  // S252 (L36): an observed owner reply makes "Record the owner's decision" the step's action;
  // the decision is recorded here on the Now card, with nothing preselected.
  const replyDecision =
    canEdit &&
    isCurrent &&
    !blocker &&
    shown.id === "ask-owner" &&
    shown.primary?.label === OWNER_DECISION_AFTER_REPLY_LABEL &&
    manual?.ownerApproval &&
    manual.ownerApproval.replies.length > 0
      ? manual.ownerApproval
      : null;
  // S249 R-S249-8: on the step that sends its audience's message, the one primary action is
  // "Review and send", given by the lease's one message record, while the step asks for its send.
  const filler = nowCard?.primaries[shown.id];
  const fillerActive =
    Boolean(filler) &&
    !blocker &&
    (shown.state === "current" || shown.state === "open") &&
    shown.primary?.label === definition.primary.label;
  const sourceCompletion =
    !blocker && primary?.label === RENEWAL_STAGE_NEXT_STEP.confirmFinished
      ? context.sourceRenewal
      : null;

  // S269 R-S269-1: the one live priority this outcome leads with, read from the stage projection
  // and the facts this page already holds. Reading it saves, sends and looks up nothing.
  const working = useRenewalWorkingRecord();
  const leaseEnd = useRenewalLeaseEnd();
  const terms = workingRenewalTerms(working?.record ?? null);
  const baseFacts = {
    contractualRent: facts.currentRent,
    providerTotal: facts.leaseTotalRent ?? null,
    listedRent: facts.unitListedRent ?? null,
    chargeInventory: facts.chargeInventory,
  };
  const base = useCurrentBaseRent(baseFacts);
  const baseRentFix =
    base.check !== null && (base.state === "needs_verification" || base.check.leads);
  const housingActive = housingAssistanceWork({
    fact: housingAssistanceFact(working?.record),
    mention: context.housingAssistanceMention === true,
    recordedProgramWork: programWorkRecorded(state),
  }).active;
  const shownIndex = stage.steps.findIndex((step) => step.id === shown.id);
  const nextApplicable =
    stage.steps.slice(shownIndex + 1).find((step) => step.state !== "not_part") ?? null;
  // S265: the offer's first required resource fix, given by the one message editor, unless a
  // caller already supplies the slot.
  const resourceLead =
    shown.id === "offer-tenant" ? (nowCard?.resourceLeads["offer-tenant"] ?? null) : null;
  const leadExtensions: GuidedPriorityExtensions | undefined =
    resourceLead && !extensions?.includedResource
      ? {
          ...extensions,
          includedResource: {
            label: resourceLead.label,
            target: resourceLead.href,
            owner: "offer-tenant",
            reason: resourceLead.reason,
            transitionsReady: resourceLead.transitionsReady,
          },
        }
      : extensions;
  const priority = projectGuidedPriority({
    stage,
    shown,
    canEdit,
    editors: outcomeEditors(shown.id, working?.states ?? {}, working?.record ?? null),
    lease: {
      endMissing: leaseEnd ? leaseEnd.leaseEnd.state !== "verified" : !facts.endDateIso,
      baseRentFix,
      chargeFix:
        preparation?.charges?.state === "difference" ? preparation.charges.fix : null,
      numbersFix:
        preparation?.numbers.state === "difference" ? preparation.numbers.fix : null,
    },
    housingAssistanceActive: housingActive,
    comparison: preparation
      ? {
          state: preparation.comparison.state,
          fix: preparation.comparison.fix ?? null,
        }
      : null,
    working:
      working && !working.readUnavailable
        ? { rent: terms.rent, effectiveDate: terms.effectiveDate, endDate: terms.endDate }
        : null,
    message:
      audience && fillerActive && filler
        ? {
            ready: filler.label === KICKOFF_WORDS.reviewAndSend,
            label: filler.label,
            target: `renewal-card-message-${audience}`,
            reason: filler.reason ?? null,
          }
        : null,
    ownerReply: Boolean(replyDecision),
    assisted: stage.steps.some(
      (step) => step.id === "assisted-rent" && step.state !== "not_part",
    ),
    standingCovered: stage.steps.some(
      (step) => step.id === "ask-owner" && step.state === "covered",
    ),
    extensions: {
      // S265: with the offer's required resource fix (leadExtensions).
      ...leadExtensions,
      // S264: the one Review offer charges editor names its first open row or choice.
      ...(extensions?.offerCharges === undefined && nowCard?.offerCharges
        ? { offerCharges: nowCard.offerCharges }
        : {}),
    },
  });
  const lead = priority.lead;
  // S270 R-S270-2: a current required field or a save to recover opens the named group holding it.
  const setGuidedLead = focusView?.setGuidedLead;
  // A message whose first fix is a renewal date names that date field, so the Working renewal
  // terms reveal (not the whole options group) opens for it.
  const groupLead =
    lead && (priority.state === "missing" || priority.state === "recover")
      ? lead.key === "message-fix" &&
        lead.label === GUIDED_PRIORITY_WORDS.enterRenewalStart
        ? WORKING_START_FIELD_ID
        : lead.key === "message-fix" &&
            lead.label === GUIDED_PRIORITY_WORDS.enterRenewalEnd
          ? WORKING_END_FIELD_ID
          : lead.target
      : null;
  useLayoutEffect(() => {
    setGuidedLead?.(groupLead ? { stepId: shown.id, target: groupLead } : null);
  }, [setGuidedLead, shown.id, groupLead]);
  // S270: the optional Housing assistance editor sits in Correct other lease facts, the place
  // that group registers; it mounts once, there.
  const optionalHost = focusView?.groupHosts["check-numbers"] ?? null;
  // R-S269-2: Rent to recommend is the outcome's one editable field; Housing assistance joins the
  // active Work when it is material (S266) and keeps its place while someone is typing in it.
  const showRent =
    outcomeLayout && shown.id === "compare-market" && shown.state !== "not_part";
  const housingDesired: "work" | "optional" = housingActive ? "work" : "optional";
  const [housingPlacement, setHousingPlacement] = useState(housingDesired);
  const [housingFocused, setHousingFocused] = useState(false);
  if (!housingFocused && housingPlacement !== housingDesired)
    setHousingPlacement(housingDesired);
  // S261's own correction is the primary when the current base rent is the fix.
  const basePrimary =
    lead?.key === "current-base-rent" && working?.canEdit === true && !blocker;
  /** Follow an exact fix: reveal and focus its owner. A date fix from the offer keeps S263's return. */
  const follow = (input: GuidedPriorityInput) => {
    if (
      shown.id === "offer-tenant" &&
      (input.key === "renewal-start" || input.key === "renewal-end")
    ) {
      startDateFixFromOffer(
        input.key === "renewal-start" ? "renewalStartDate" : "renewalEndDate",
        MESSAGE_CONTROL_IDS.readiness("tenant"),
      );
      focusRenewalDashboardControl(input.target);
      return;
    }
    followFix(input, shown.id);
  };
  // The lead takes the primary's place where it is an exact fix, or where the outcome shows its
  // field and the action that follows it. Otherwise the stage's own primary stays.
  const leadPrimary: {
    readonly label: string;
    readonly target: string;
    readonly run: () => void;
  } | null = (() => {
    if (!lead || blocker || basePrimary) return null;
    // S269 rule 2: the unresolved send's own check on the same attempt is the one primary, even
    // where the step's next action records an earlier reply.
    if (priority.state === "reconcile" && lead.key === "check-send") {
      const sequenceId = evidence?.unconfirmedSequenceId;
      return sequenceId
        ? {
            label: lead.label,
            target: lead.target,
            run: () => void reconcile(sequenceId),
          }
        : null;
    }
    if (priority.state === "missing" || lead.key === "unfinished") {
      if (
        lead.key === "message-fix" ||
        lead.key === "housing-assistance" ||
        lead.key === "current-base-rent"
      )
        return null;
      // S265: the resource fix is its one Connections entry, a page of its own.
      if (lead.key === "included-resource")
        return {
          label: lead.label,
          target: lead.target,
          run: () => router.push(lead.target),
        };
      return { label: lead.label, target: lead.target, run: () => follow(lead) };
    }
    if (lead.key === "rent-to-recommend" && nextApplicable)
      return {
        label: `Continue to ${nextApplicable.label}`,
        target: `renewal-outcome-${nextApplicable.id}`,
        run: () => choose(nextApplicable.id),
      };
    if (lead.key === "owner-answer" && replyDecision)
      return {
        label: lead.label,
        target: lead.target,
        run: () => document.getElementById(lead.target)?.focus(),
      };
    return null;
  })();
  // A finished step offers the next one; it never offers its own first action again.
  const donePrimary =
    priority.state === "done" && nextApplicable && !leadPrimary
      ? {
          label: `Continue to ${nextApplicable.label}`,
          target: `renewal-outcome-${nextApplicable.id}`,
          run: () => choose(nextApplicable.id),
        }
      : null;
  const shownPrimary = leadPrimary ?? donePrimary;
  // S269: a ready message opens its exact review under the outcome's own words.
  const fillerLabel =
    fillerActive && filler
      ? filler.label === KICKOFF_WORDS.reviewAndSend && audience
        ? audience === "owner"
          ? GUIDED_PRIORITY_WORDS.reviewOwnerMessage
          : GUIDED_PRIORITY_WORDS.reviewTenantOffer
        : filler.label
      : null;
  const runPrimary = (event: MouseEvent<HTMLButtonElement>) => {
    if (shownPrimary) {
      shownPrimary.run();
      return;
    }
    if (coveredOwnerStep && !blocker) {
      choose("offer-tenant");
      return;
    }
    if (fillerActive && filler) {
      filler.run(event.currentTarget);
      return;
    }
    if (!primary) return;
    if (blocker) {
      if (blocker.target === null) document.getElementById("renewal-refresh")?.click();
      else focusControl(blocker.target);
      return;
    }
    // S254 L49: the agreed numbers continue to the next step on this lease's own path.
    if (shown.primary?.continueTo) {
      choose(shown.primary.continueTo);
      return;
    }
    if (
      primary.label === RENEWAL_STAGE_NEXT_STEP.checkSend &&
      evidence?.unconfirmedSequenceId
    ) {
      void reconcile(evidence.unconfirmedSequenceId);
      return;
    }
    if (primary.label === RENEWAL_STAGE_NEXT_STEP.sentFromGmail && audience && manual) {
      void manual
        .record({
          kind: "activity",
          activity: audience === "owner" ? "owner_outreach" : "tenant_offer",
          outcome: "done",
          source: "Sent from the Gmail draft",
        })
        .then(() => setMessage("Recorded by staff: the Gmail draft was sent."))
        .catch(() => undefined);
      return;
    }
    if (replyDecision && primary.label === OWNER_DECISION_AFTER_REPLY_LABEL) {
      document.getElementById(OWNER_DECISION_FROM_REPLY_ID)?.focus();
      return;
    }
    const step = shown.primary ?? recordWhatHappened ?? definition.primary;
    if (!focusControl(step.target) && definition.controls[0])
      focusControl(definition.controls[0]);
  };

  const waitingLine =
    shown.state === "waiting" && isCurrent && stage.waiting
      ? renewalStageWaitingLine(stage.waiting)
      : null;
  const blockerLine = blocker
    ? stage.stage.key === "retired" || context.staffRecordUnavailable || !blocker.target
      ? blocker.label
      : `Needs verification: ${blocker.label}`
    : null;
  // R-S269-2: one short cue leads under the heading. The waiting line, the blocker or the not
  // part line is that cue when it applies; otherwise the priority's own cue, when it has one.
  const cueKind: "waiting" | "blocker" | "not-part" | "priority" | null =
    shown.state === "not_part"
      ? "not-part"
      : blockerLine
        ? "blocker"
        : waitingLine
          ? "waiting"
          : priority.cue && priority.state !== "wait"
            ? "priority"
            : null;
  const waitingNode = waitingLine ? (
    <p
      data-renewal-field="waiting"
      data-renewal-priority-cue={cueKind === "waiting" ? true : undefined}
    >
      {waitingLine}
    </p>
  ) : null;
  const blockerNode = blockerLine ? (
    <p
      className="renewal-notice"
      data-renewal-priority-cue={cueKind === "blocker" ? true : undefined}
      role="alert"
    >
      {blockerLine}
    </p>
  ) : null;
  const slotNode = (slot: NowCardSlot) => (
    <div
      className="renewal-now-slot"
      data-renewal-now-slot={slot}
      data-renewal-now-slot-key={nowSlotKey(shown.id, slot)}
      // Keyed by step, so a different step gets its own slot elements and registrations.
      key={nowSlotKey(shown.id, slot)}
      ref={nowCard?.slotRef}
    >
      {/* S261: Current base rent is the first rent fact of the numbers check. */}
      {slot === "prepared-numbers-check" ? (
        <CurrentBaseRentSummary
          facts={baseFacts}
          primaryId={basePrimary ? NOW_PRIMARY_ID : undefined}
        />
      ) : null}
      {preparation && slot === "prepared-numbers-check" ? (
        <PreparedNumbersCheck preparation={preparation} />
      ) : null}
      {preparation && slot === "stored-comparison" ? (
        <StoredComparisonSummary
          action={
            preparation.comparison.state === "none" &&
            !preparation.comparison.attempted ? (
              <PrepareThisLeaseButton canPrepare={canEdit} leaseId={leaseId} />
            ) : null
          }
          // S270: the comparable rows are read in Verify market comparison.
          compact
          preparation={preparation}
          // The primary action carries the recovery when it is the lead.
          showFix={lead?.key !== "comparison-recovery"}
        />
      ) : null}
    </div>
  );
  // The numbers summary and the stored comparison are the decision facts of their outcomes, so
  // they lead its active Work; the message slots keep their place after the next step.
  const activeSlots: readonly NowCardSlot[] = [
    "prepared-numbers-check",
    "stored-comparison",
  ];
  const housingField =
    shown.id === "check-numbers" && shown.state !== "not_part" ? (
      <div
        className="ui-stack-tight"
        data-renewal-housing-slot={housingPlacement}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setHousingFocused(false);
        }}
        onFocus={() => setHousingFocused(true)}
      >
        {/* S251 R-S251-1 / R-S251-2: "Housing assistance" is recorded on Check the numbers. */}
        <HousingAssistanceField
          mention={context.housingAssistanceMention === true}
          placement="now"
        />
      </div>
    ) : null;
  const rentFirst = lead?.key === "rent-to-recommend" || lead?.key === "editor";
  const rentField = showRent ? <RentToRecommendField preparation={preparation} /> : null;
  const primaryNode =
    sourceCompletion && canEdit ? (
      <RenewalSourceCompletionControl dates={sourceCompletion} leaseId={leaseId} guided />
    ) : primary && !sourceCompletion && shown.state !== "not_part" && !basePrimary ? (
      <p>
        <Button
          busy={busy || (!shownPrimary && fillerActive && filler?.busy === true)}
          data-renewal-now-primary
          data-renewal-work-primary
          data-renewal-now-target={
            shownPrimary?.target ?? (fillerActive ? undefined : primary.target)
          }
          disabled={busy || (!shownPrimary && fillerActive && filler?.disabled === true)}
          id={NOW_PRIMARY_ID}
          onClick={runPrimary}
        >
          {shownPrimary?.label ?? fillerLabel ?? primary.label}
        </Button>
        {!shownPrimary && fillerActive && filler?.reason ? (
          <span
            className="muted renewal-now-primary-reason"
            data-renewal-field="send-needs"
          >
            {" "}
            {filler.reason}
          </span>
        ) : null}
      </p>
    ) : null;
  // While the unresolved send leads, the reply decision waits here; the Owner response in Full
  // view still records it (S269 rule 2).
  const replyNode =
    replyDecision && manual && priority.state !== "reconcile" ? (
      <RenewalOwnerDecisionFromReply
        choices={replyDecision}
        disabled={manual.pending}
        // S262: the reviewed answer learns whether its save was confirmed.
        onRecord={(action) => manual.record(action)}
      />
    ) : null;

  return (
    <>
      <h2
        className="section-subtitle"
        id="renewal-now-heading"
        ref={heading}
        tabIndex={-1}
      >
        {isCurrent && stage.stage.key === "retired"
          ? "Retired renewal cycle"
          : isCurrent
            ? `Now: ${shown.label}`
            : shown.label}
      </h2>
      <div
        className="ui-stack-tight"
        data-renewal-outcome={shown.id}
        data-renewal-priority-lead={lead?.key}
        data-renewal-priority-owner={lead?.owner}
        data-renewal-priority-state={priority.state}
        data-renewal-work
        data-renewal-work-state={
          priority.state === "reconcile" ? "reconcile" : blocker ? "blocked" : shown.state
        }
      >
        {cueKind === "not-part" ? (
          <p data-renewal-field="not-part" data-renewal-priority-cue>
            {NOT_PART_OF_PATH_LABEL}.
          </p>
        ) : cueKind === "blocker" ? (
          blockerNode
        ) : cueKind === "waiting" ? (
          waitingNode
        ) : cueKind === "priority" ? (
          <p data-renewal-priority-cue>{priority.cue}</p>
        ) : null}
        {cueKind !== "blocker" ? blockerNode : null}
        {cueKind !== "waiting" ? waitingNode : null}
        {stage.check && isCurrent && !shown.detail?.startsWith("Needs a check") ? (
          <p className="renewal-notice" data-renewal-field="needs-check" role="note">
            Needs a check: {stage.check.sentence}
          </p>
        ) : null}
        {/* R-S269-2: the active input group: the outcome's decision facts, its field, the one
            primary action or exact fix with its reason, and the exact return. */}
        <div
          className="ui-stack-tight renewal-active-group"
          data-renewal-active-group={shown.id}
        >
          {shown.state !== "not_part"
            ? definition.slots.filter((slot) => activeSlots.includes(slot)).map(slotNode)
            : null}
          {showRent ? <OwnerCurrentBaseRent facts={baseFacts} /> : null}
          {housingPlacement === "work" ? housingField : null}
          {rentFirst ? rentField : null}
          {primaryNode}
          {priority.crossOutcome && lead?.reason && priority.state !== "missing" ? (
            <p className="muted" data-renewal-priority-reason>
              {lead.reason}
            </p>
          ) : null}
          {replyNode}
          {rentFirst ? null : rentField}
          {returnTo ? (
            <p data-renewal-return={returnTo.stepId}>
              <Button onClick={onReturn} size="compact" variant="secondary">
                {guidedReturnLabel(returnTo.stepId)}
              </Button>
            </p>
          ) : null}
        </div>
        <p data-renewal-field="next-step">
          Next step: {stage.nextStep.label}
          {!isCurrent ? (
            <>
              {" "}
              <button
                className="text-link"
                onClick={() => choose(stage.currentStepId)}
                type="button"
              >
                Show current step
              </button>
            </>
          ) : null}
        </p>
        {shown.state !== "not_part" && shown.detail ? (
          <p data-renewal-field="now-detail">{shown.detail}</p>
        ) : null}
        {shown.id === "finish-up" && stage.finishUp.length > 0 ? (
          // R-S248-7: each item in its own words: recorded by staff or verified by the receipt.
          <ul aria-label="Finish up items" className="renewal-finish-up-items">
            {stage.finishUp.map((item) => (
              <li
                data-renewal-finish-up-item={item.key}
                data-renewal-finish-up-origin={item.origin ?? "open"}
                key={item.key}
              >
                {item.label}: {item.detail}
              </li>
            ))}
          </ul>
        ) : null}
        {shown.id === "finish-up" && shown.state !== "not_part" && nowCard?.finishUp ? (
          // R-S249-14 / L42: the source update previews the final terms call for. Read only.
          <FinishUpSourcePreviews preparation={nowCard.finishUp} />
        ) : null}
        {/* S249 fills the message slots from the lease's one message record (the message preview
          and its delivery actions, filled by the message editor). */}
        {shown.state !== "not_part"
          ? definition.slots.filter((slot) => !activeSlots.includes(slot)).map(slotNode)
          : null}
        {housingPlacement === "optional" && housingField
          ? outcomeLayout
            ? optionalHost
              ? createPortal(housingField, optionalHost)
              : null
            : housingField
          : null}
        {derived ? (
          <div className="ui-stack-tight" data-renewal-derived={derived.record.activity}>
            <p className="muted" data-renewal-field="derived-origin">
              {derived.attribution}
            </p>
            {canEdit && !correcting ? (
              <p>
                <button
                  className="text-link"
                  onClick={() => setCorrecting(true)}
                  ref={correctionTrigger}
                  type="button"
                >
                  {RENEWAL_STAGE_NEXT_STEP.notOutreach}
                </button>
              </p>
            ) : null}
            {correcting ? (
              <form
                aria-busy={busy || undefined}
                className="ui-stack-tight"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (busy || !reason.trim()) return;
                  const form = event.currentTarget;
                  void post(
                    {
                      operation: "correct_outreach",
                      leaseId,
                      // A lease with no work record yet has no cycle to name.
                      cycleId: state?.cycleId ?? null,
                      audience: derived.record.audience,
                      sequenceId: derived.record.sequenceId,
                      occurrenceId: derived.record.occurrenceId,
                      reason: reason.trim(),
                    },
                    `correct:${derived.record.occurrenceId}`,
                    "Removed: that message no longer counts as the renewal outreach. The record stays in its history.",
                  ).then((ok) => {
                    if (ok) {
                      if (form.contains(document.activeElement))
                        correctionExit.current = "heading";
                      setCorrecting(false);
                      setReason("");
                    }
                  });
                }}
              >
                <Field
                  htmlFor={reasonId}
                  label="Why this was not the renewal outreach"
                  required
                >
                  <textarea
                    maxLength={500}
                    onChange={(event) => setReason(event.target.value)}
                    readOnly={busy}
                    ref={reasonField}
                    required
                    rows={2}
                    value={reason}
                  />
                </Field>
                <div className="ui-row">
                  <Button
                    aria-disabled={busy || undefined}
                    disabled={!reason.trim()}
                    size="compact"
                    type="submit"
                    variant="secondary"
                  >
                    {busy ? "Removing the record..." : "Remove the derived record"}
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => {
                      correctionExit.current = "trigger";
                      setCorrecting(false);
                    }}
                    size="compact"
                    variant="tertiary"
                  >
                    Keep it
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : null}
        {evidence && evidence.corrected.length > 0 ? (
          <ul aria-label="Removed outreach records" className="muted">
            {evidence.corrected.map((entry) => (
              <li key={entry.occurrenceId}>
                Removed{" "}
                {formatCalendarDate(new Date(entry.atMs).toISOString().slice(0, 10))}:{" "}
                {entry.reason}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="ui-row renewal-now-secondary">
          {shown.state === "waiting" && audience && !shown.scheduled ? (
            <>
              {recordWhatHappened && primary !== recordWhatHappened ? (
                <Button
                  onClick={() => focusControl(recordWhatHappened.target)}
                  size="compact"
                  variant="secondary"
                >
                  {recordWhatHappened.label}
                </Button>
              ) : null}
              <Button
                onClick={() =>
                  focusControl(
                    audience === "owner"
                      ? "renewal-card-message-owner"
                      : "renewal-card-message-tenant",
                  )
                }
                size="compact"
                variant="secondary"
              >
                Send again
              </Button>
            </>
          ) : null}
          {shown.state === "waiting" && definition.next ? (
            <Button
              onClick={() => choose(definition.next!)}
              size="compact"
              variant="secondary"
            >
              Work a later step now
            </Button>
          ) : null}
        </div>
        {message || manual?.message ? (
          <p role="status">{message || manual?.message}</p>
        ) : null}
      </div>
      {outcomeLayout &&
      !(
        [
          "check-numbers",
          "compare-market",
          "ask-owner",
          "offer-tenant",
          "documents",
          "finish-up",
          "complete",
        ] as readonly RenewalPathStepId[]
      ).includes(shown.id) ? (
        <details data-renewal-verification key={shown.id}>
          {/* S270: the variant's equivalent named Verification. */}
          <summary>{GUIDED_VERIFICATION_LABELS[shown.id]}</summary>
          <p>{shown.detail ?? stage.evidenceLine ?? stage.stageLine}</p>
          {stage.check ? <p>{stage.check.sentence}</p> : null}
        </details>
      ) : null}
    </>
  );
}
