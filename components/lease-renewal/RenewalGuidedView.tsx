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
} from "react";
import { createPortal } from "react-dom";

import { Button, ConfirmationDialog } from "@/components/ui";
import { formatCalendarDate } from "@/lib/date-display";
import { RENEWAL_DASHBOARD_SECTIONS } from "@/lib/lease-renewal/dashboard-sections";
import {
  NOT_PART_OF_PATH_LABEL,
  RENEWAL_PATH_DEFINITION,
  pathStepForLinkStep,
  type RenewalPathStepId,
} from "@/lib/lease-renewal/renewal-path";
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
  PricingBasisChooser,
  StandingAgreementSummary,
  StandingRuleNotice,
  standingAuthorityCurrent,
  useRenewalPricingPolicy,
} from "./RenewalPricingPolicy";
import { HousingAssistanceField } from "./RenewalHousingAssistance";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { housingAssistanceVariant } from "@/lib/lease-renewal/working-record";
import { nowSlotKey, useRenewalNowCard } from "./RenewalNowCardContext";
import {
  PreparedNumbersCheck,
  RentToRecommendField,
  StoredComparisonSummary,
} from "./RenewalKickoffFields";
import { PrepareThisLeaseButton } from "./RenewalKickoffPreparation";
import { FinishUpSourcePreviews } from "./RenewalFinishUpPreviews";

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
const STATUS_REGION = 'section[aria-label="Staff status and Status log"]';

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

export function RenewalGuidedView({
  context,
  facts,
  selectedStepId,
  canEdit,
}: Readonly<{
  context: RenewalStageContext;
  facts: RenewalFocusFacts;
  /** The page's `step` value: a path step, or an older step that names one (R-S247-11). */
  selectedStepId?: string;
  canEdit: boolean;
}>) {
  const view = useRenewalFocusView();
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
  const stage = useMemo(
    () =>
      projectRenewalStage(
        state,
        {
          ...context,
          staffRecordUnavailable: readUnavailable,
          housingAssistance,
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
    [state, context, readUnavailable, standingCovered, pricing, housingAssistance],
  );
  // The step shown: one chosen on this page, else the one a reload returns to (R-S247-9), else
  // the one the address names (an older `step` value names the path step that holds it,
  // R-S247-11), else the current step.
  const [chosen, setChosen] = useState<RenewalPathStepId | null>(null);
  const preferred =
    chosen ??
    pathStepForLinkStep(view?.restoredStep ?? null) ??
    pathStepForLinkStep(selectedStepId);
  const shownId =
    preferred && stage.steps.some((step) => step.id === preferred)
      ? preferred
      : stage.currentStepId;
  const rememberStep = view?.rememberStep;
  useEffect(() => {
    rememberStep?.(preferred);
  }, [rememberStep, preferred]);
  const shown = stage.steps.find((step) => step.id === shownId) ?? stage.steps[0]!;
  const guided = view?.view === "guided";
  const heading = useRef<HTMLHeadingElement | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const focusHeading = useRef(false);
  const [announcement, setAnnouncement] = useState("");

  const choose = useCallback((id: RenewalPathStepId) => {
    focusHeading.current = true;
    setChosen(id);
  }, []);

  // Reveal the shown step's existing controls in place; everything else stays mounted, hidden.
  useLayoutEffect(() => {
    if (!guided || !view?.slot) return;
    const body = view.slot.parentElement;
    if (!body) return;
    const contexts = [
      ...body.querySelectorAll<HTMLElement>("[data-renewal-focus-context]"),
    ].filter(
      // The recorded-work card names its own suggestion; the guided view names one next step,
      // so the card shows only when the staff record must be read again.
      (element) =>
        readUnavailable || !element.classList.contains("renewal-primary-progress"),
    );
    const targets = shown.controls
      .map((id) => document.getElementById(id))
      .filter(
        (element): element is HTMLElement => element !== null && body.contains(element),
      );
    view.applyReveal([view.slot, ...contexts, ...targets]);
    if (pendingFocus.current) {
      const id = pendingFocus.current;
      pendingFocus.current = null;
      focusRenewalDashboardControl(id, { viewRequest: false });
    } else if (focusHeading.current) {
      focusHeading.current = false;
      if (heading.current) focusProgrammatically(heading.current);
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
    const onRequest = (event: Event) => {
      if (view.view !== "guided") return;
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      const element = id ? document.getElementById(id) : null;
      if (!id || !element || !element.closest("[data-renewal-focus-hidden]")) return;
      event.preventDefault();
      const owner = stepOwning(stage.steps, element);
      if (owner) {
        pendingFocus.current = id;
        setChosen(owner.id);
      } else view.showInFull(id);
    };
    document.addEventListener(RENEWAL_FOCUS_REQUEST_EVENT, onRequest);
    return () => document.removeEventListener(RENEWAL_FOCUS_REQUEST_EVENT, onRequest);
  }, [view, stage]);

  if (!view || !guided || !view.slot) return null;
  return createPortal(
    <GuidedPane
      announcement={announcement}
      canEdit={canEdit}
      choose={choose}
      context={context}
      facts={facts}
      heading={heading}
      leaseId={context.leaseId}
      shown={shown}
      showInFull={(id) => view.showInFull(id)}
      stage={stage}
    />,
    view.slot,
  );
}

/** Focus an existing control; one outside the shown step chooses its step or opens Full view. */
function focusControl(target: string): boolean {
  return focusRenewalDashboardControl(target);
}

function GuidedPane({
  announcement,
  canEdit,
  choose,
  context,
  facts,
  heading,
  leaseId,
  shown,
  showInFull,
  stage,
}: Readonly<{
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
    <section
      aria-label="Guided view"
      className="panel ui-stack renewal-guided"
      data-renewal-guided
      data-renewal-presentation-control
    >
      <p
        className="renewal-guided-stage"
        data-renewal-field="stage-line"
        data-renewal-stage={stage.stage.key}
        data-renewal-current-step={stage.currentStepId}
      >
        {stage.stageLine}
      </p>
      {stage.handStatusLine ? (
        <p className="muted" data-renewal-field="hand-status">
          {stage.handStatusLine}
        </p>
      ) : null}
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
      <NowCard
        canEdit={canEdit}
        choose={choose}
        context={context}
        heading={heading}
        leaseId={leaseId}
        shown={shown}
        stage={stage}
      />
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
      <nav aria-label="Every section in Full view" className="renewal-guided-sections">
        <h3 className="renewal-focus-group">Every section in Full view</h3>
        <ul className="ui-row">
          {RENEWAL_DASHBOARD_SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                className="text-link renewal-workspace-link"
                href={`#renewal-section-${section.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  showInFull(`renewal-section-${section.id}`);
                }}
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>
    </section>
  );
}

function NowCard({
  canEdit,
  choose,
  context,
  heading,
  leaseId,
  shown,
  stage,
}: Readonly<{
  canEdit: boolean;
  choose: (id: RenewalPathStepId) => void;
  context: RenewalStageContext;
  heading: React.RefObject<HTMLHeadingElement | null>;
  leaseId: string;
  shown: RenewalPathStepView;
  stage: RenewalStage;
}>) {
  const router = useRouter();
  const manual = useRenewalManualWorkspace();
  const nowCard = useRenewalNowCard();
  const preparation = context.preparation ?? null;
  // The correction names the live staff record's cycle.
  const state = manual?.state ?? null;
  const definition = RENEWAL_PATH_DEFINITION[shown.id];
  const isCurrent = shown.id === stage.currentStepId;
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
  const [confirming, setConfirming] = useState(false);
  const operation = useRef(new Map<string, string>());
  const reasonId = useId();
  const confirmTrigger = useRef<HTMLButtonElement | null>(null);
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
  const primary = blocker ?? shown.primary ?? recordWhatHappened ?? definition.primary;
  // S249 R-S249-8: on the step that sends its audience's message, the one primary action is
  // "Review and send", given by the lease's one message record, while the step asks for its send.
  const filler = nowCard?.primaries[shown.id];
  const fillerActive =
    Boolean(filler) &&
    !blocker &&
    (shown.state === "current" || shown.state === "open") &&
    shown.primary?.label === definition.primary.label;
  const runPrimary = () => {
    if (fillerActive && filler) {
      filler.run();
      return;
    }
    if (!primary) return;
    if (blocker) {
      if (blocker.target === null) document.getElementById("renewal-refresh")?.click();
      else focusControl(blocker.target);
      return;
    }
    if (primary.label === "Continue to Compare market rent") {
      choose("compare-market");
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
    if (
      primary.label === RENEWAL_STAGE_NEXT_STEP.confirmFinished &&
      context.sourceRenewal
    ) {
      setConfirming(true);
      return;
    }
    const step = shown.primary ?? recordWhatHappened ?? definition.primary;
    if (!focusControl(step.target) && definition.controls[0])
      focusControl(definition.controls[0]);
  };

  return (
    <section
      aria-label="Now"
      className="ui-stack renewal-now-card"
      data-renewal-now-state={shown.state}
      data-renewal-now-step={shown.id}
      role="region"
    >
      <h2
        className="section-subtitle"
        id="renewal-now-heading"
        ref={heading}
        tabIndex={-1}
      >
        {isCurrent ? `Now: ${shown.label}` : shown.label}
      </h2>
      {isCurrent ? (
        <p data-renewal-field="next-step">Next step: {stage.nextStep.label}</p>
      ) : null}
      {shown.state === "not_part" ? (
        <p data-renewal-field="not-part">{NOT_PART_OF_PATH_LABEL}.</p>
      ) : shown.detail ? (
        <p data-renewal-field="now-detail">{shown.detail}</p>
      ) : null}
      {shown.state === "waiting" && isCurrent && stage.waiting ? (
        <p data-renewal-field="waiting">{renewalStageWaitingLine(stage.waiting)}</p>
      ) : null}
      {blocker ? (
        <p className="renewal-notice" role="alert">
          {context.staffRecordUnavailable || !blocker.target
            ? blocker.label
            : `Needs verification: ${blocker.label}`}
        </p>
      ) : null}
      {stage.check && isCurrent && !shown.detail?.startsWith("Needs a check") ? (
        <p className="renewal-notice" data-renewal-field="needs-check" role="note">
          Needs a check: {stage.check.sentence}
        </p>
      ) : null}
      {primary && shown.state !== "not_part" ? (
        <p>
          <Button
            busy={busy || (fillerActive && filler?.busy === true)}
            data-renewal-now-primary
            disabled={busy || (fillerActive && filler?.disabled === true)}
            onClick={runPrimary}
            ref={confirmTrigger}
          >
            {fillerActive && filler ? filler.label : primary.label}
          </Button>
          {fillerActive && filler?.reason ? (
            <span
              className="muted renewal-now-primary-reason"
              data-renewal-field="send-needs"
            >
              {" "}
              {filler.reason}
            </span>
          ) : null}
        </p>
      ) : null}
      {shown.state !== "not_part" ? (
        <dl className="renewal-now-facts">
          <div>
            <dt>Ready</dt>
            <dd>{definition.ready}</dd>
          </div>
          <div>
            <dt>You decide</dt>
            <dd>{definition.decides}</dd>
          </div>
        </dl>
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
      {/* S249 fills these named slots from the one preparation projection (the numbers check,
          the stored comparison, Rent to recommend) and from the lease's one message record (the
          message preview and its delivery actions, filled by the message editor). */}
      {shown.state !== "not_part"
        ? definition.slots.map((slot) => (
            <div
              className="renewal-now-slot"
              data-renewal-now-slot={slot}
              data-renewal-now-slot-key={nowSlotKey(shown.id, slot)}
              // Keyed by step, so a different step gets its own slot elements and registrations.
              key={nowSlotKey(shown.id, slot)}
              ref={nowCard?.slotRef}
            >
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
                  preparation={preparation}
                />
              ) : null}
              {preparation && slot === "rent-to-recommend" ? (
                <RentToRecommendField preparation={preparation} />
              ) : null}
            </div>
          ))
        : null}
      {/* S251 R-S251-1 / R-S251-2: "Housing assistance" is recorded on Check the numbers. */}
      {shown.id === "check-numbers" && shown.state !== "not_part" ? (
        <HousingAssistanceField
          mention={context.housingAssistanceMention === true}
          placement="now"
        />
      ) : null}
      {/* S250 R-S250-3 / R-S250-8: the pricing basis where the rent and the owner's decision are
          worked: the agreement in force, a message built on an earlier rule, and the chooser. */}
      {(shown.id === "compare-market" || shown.id === "ask-owner") &&
      shown.state !== "not_part" ? (
        <div className="ui-stack-tight" data-renewal-now-pricing-basis>
          <StandingAgreementSummary />
          <StandingRuleNotice />
          {canEdit ? <PricingBasisChooser context="now" /> : null}
        </div>
      ) : null}
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
                type="button"
              >
                {RENEWAL_STAGE_NEXT_STEP.notOutreach}
              </button>
            </p>
          ) : null}
          {correcting ? (
            <form
              className="ui-stack-tight"
              onSubmit={(event) => {
                event.preventDefault();
                if (!reason.trim()) return;
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
                    setCorrecting(false);
                    setReason("");
                  }
                });
              }}
            >
              <label htmlFor={reasonId}>Why this was not the renewal outreach</label>
              <textarea
                id={reasonId}
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                required
                rows={2}
                value={reason}
              />
              <div className="ui-row">
                <Button
                  disabled={busy || !reason.trim()}
                  size="compact"
                  type="submit"
                  variant="secondary"
                >
                  Remove the derived record
                </Button>
                <Button
                  onClick={() => setCorrecting(false)}
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
        <Button
          onClick={() => {
            const note = document.querySelector<HTMLTextAreaElement>(
              `${STATUS_REGION} textarea`,
            );
            if (note) focusProgrammatically(note);
          }}
          size="compact"
          variant="tertiary"
        >
          Add a note
        </Button>
        <Button
          onClick={() => {
            const select = document.querySelector<HTMLSelectElement>(
              `${STATUS_REGION} select`,
            );
            if (select) focusProgrammatically(select);
          }}
          size="compact"
          variant="tertiary"
        >
          Set status by hand
        </Button>
      </div>
      {message || manual?.message ? (
        <p role="status">{message || manual?.message}</p>
      ) : null}
      <ConfirmationDialog
        busy={busy}
        busyLabel="Recording…"
        confirmLabel="Record staff completion"
        description={
          context.sourceRenewal
            ? `This cycle recorded lease end ${formatCalendarDate(context.sourceRenewal.recordedDateIso)}. RentVine now reports lease end ${formatCalendarDate(context.sourceRenewal.sourceDateIso)}.`
            : undefined
        }
        error={confirming && message && !busy ? message : undefined}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          const dates = context.sourceRenewal;
          if (!dates) return;
          void post(
            {
              operation: "confirm_source_renewal",
              leaseId,
              recordedDateIso: dates.recordedDateIso,
              sourceDateIso: dates.sourceDateIso,
              cycleId: dates.cycleId,
              expectedRevision: dates.revision,
            },
            `confirm:${dates.cycleId}:${dates.revision}`,
            "Staff completion recorded, with the RentVine lease end as the evidence.",
          ).then((ok) => {
            if (ok) setConfirming(false);
          });
        }}
        open={confirming}
        title="Confirm this renewal is finished?"
        triggerRef={confirmTrigger}
      >
        <p>
          Confirming records this cycle as complete on the lease&rsquo;s staff record,
          with the RentVine lease end as the evidence. The record stays in this app, and
          you can reopen it from the lease.
        </p>
      </ConfirmationDialog>
    </section>
  );
}
