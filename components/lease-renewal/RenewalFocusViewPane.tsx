"use client";
import { useRenewalPricingPolicy } from "@/components/lease-renewal/RenewalPricingPolicy";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { formatCalendarDate } from "@/lib/date-display";
import type { ActionGraphDiagnostic } from "@/lib/lease-renewal/action-graph";
import { operationalCurrentRent } from "@/lib/lease-renewal/current-rent";
import { describeRenewalTerms } from "@/lib/lease-renewal/current-rent-display";
import { effectiveRenewalTerms } from "@/lib/lease-renewal/effective-terms";
import {
  projectRenewalActions,
  selectRenewalAction,
  type RenewalAction,
  type RenewalActionManualInput,
  type RenewalActionProjection,
  type RenewalActionSnapshot,
  type RenewalActionStatus,
} from "@/lib/lease-renewal/renewal-actions";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import {
  focusProgrammatically,
  focusRenewalDashboardControl,
  RENEWAL_FOCUS_REQUEST_EVENT,
} from "./RenewalDashboardNavigation";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import { useRenewalWorkingRecord } from "./RenewalWorkingRecord";
import { createFocusReveal, type FocusReveal } from "./renewal-focus-reveal";

/**
 * S143/S144: the Focus view's single-task pane. It shows the chosen action from the S142
 * projection with its material context and reveals that action's existing Full view controls in
 * place below it; nothing here submits, saves or calls a provider. Each revealed control keeps
 * its own handler, route, validation, confirmation and readback, and the pane advances only when
 * the recomputed projection shows the action's owning completion evidence.
 */

export interface RenewalFocusFacts {
  /** The contractual lease rent from the RentVine lease detail. */
  readonly currentRent: number | null;
  /**
   * S153: the recurring charge inventory the page read (null when that read failed, undefined
   * when the page did not pass it), so the pane shows the same operational current rent as the
   * Rent and charges card.
   */
  readonly chargeInventory?: RenewalChargeInventory | null;
  readonly endDateIso: string | null;
  readonly lifecycleLabel: string | null;
  readonly dataExpired: boolean;
  /** True when the page header carries the existing source refresh control. */
  readonly refreshAvailable: boolean;
  readonly advisories: readonly {
    readonly id: string;
    readonly kindLabel: string;
    readonly reason: string;
  }[];
  /** Supporting reads that failed on this page, in the Full view notice's own words. */
  readonly unavailableReads?: readonly string[];
  /** The move-out disposition the Full view states at the top of the page, if any. */
  readonly moveOutNotice?: string | null;
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** The completed staff record and its existing Reopen control, shown once the renewal is complete. */
const COMPLETION_RECORD_TARGET = "renewal-manual-complete";

const GROUPS: readonly { status: RenewalActionStatus; label: string }[] = [
  { status: "ready_for_actor", label: "Ready for you" },
  { status: "ready_for_other_actor", label: "Ready for another person" },
  { status: "waiting", label: "Waiting on someone else" },
  { status: "dependency_blocked", label: "Starts after earlier work" },
  { status: "unknown", label: "Needs a check" },
  { status: "unresolved", label: "Review in Full view" },
  { status: "complete", label: "Done" },
  { status: "not_applicable", label: "Not part of this lease's path" },
];

/** The concrete rule problem behind a diagnostic, named with the actions it involves. */
function diagnosticText(
  diagnostic: ActionGraphDiagnostic,
  labels: (id: string) => string,
): string {
  switch (diagnostic.kind) {
    case "dependency_cycle":
      return `These steps each wait on another one of them: ${diagnostic.members.map(labels).join(", ")}.`;
    case "missing_reference":
      return `${labels(diagnostic.from)} names a prerequisite that is not defined: ${diagnostic.to}.`;
    case "impossible_condition":
      return `${labels(diagnostic.node)}. It needs: ${diagnostic.conditions.join("; ")}.`;
    case "duplicate_node":
      return `${labels(diagnostic.id)} is defined more than once.`;
  }
}

/** The diagnostic that explains why this action itself is unresolved, when there is one. */
function ownDiagnostic(
  action: RenewalAction,
  diagnostics: readonly ActionGraphDiagnostic[],
): ActionGraphDiagnostic | undefined {
  return diagnostics.find(
    (diagnostic) =>
      (diagnostic.kind === "dependency_cycle" &&
        diagnostic.members.includes(action.id)) ||
      (diagnostic.kind === "missing_reference" && diagnostic.from === action.id),
  );
}

function stateText(
  action: RenewalAction,
  labels: (id: string) => string,
  diagnostics: readonly ActionGraphDiagnostic[] = [],
): string {
  switch (action.status) {
    case "ready_for_actor":
      return "Ready for you.";
    case "ready_for_other_actor":
      return `Ready for ${action.responsible}. It stays listed here until they record it.`;
    case "waiting":
      return `Waiting on ${action.waitingOn ?? "another person"}.`;
    case "dependency_blocked":
      return action.blockedBy.length > 0
        ? `Starts after: ${action.blockedBy.map(labels).join(", ")}.`
        : `Starts once this is recorded: ${action.unmetConditions.join(", ")}.`;
    case "unknown":
      return action.reason === "source_unavailable"
        ? action.group === "staff_work"
          ? "Current staff records could not be read. Reload them before recording work."
          : "This information could not be read. Refresh to check it again."
        : action.reason === "completion_unknown"
          ? "The last outcome needs a check before anything else happens here."
          : action.reason === "prerequisite_unknown"
            ? "An earlier step could not be read, so this one waits for a refresh."
            : "Whether this applies needs a check.";
    case "unresolved": {
      if (action.reason === "no_control")
        return "This step is recorded outside this dashboard; its history is in Full view.";
      if (action.reason === "impossible_condition")
        return "The recorded responses conflict. Review them in Full view.";
      const diagnostic = ownDiagnostic(action, diagnostics);
      return `${diagnostic ? `${diagnosticText(diagnostic, labels)} ` : ""}This step's records need review in Full view.`;
    }
    case "complete":
      return completedText(action);
    case "not_applicable":
      return "Not part of this lease's path.";
  }
}

// Only staff work is recorded by staff; a refreshed source or a provider confirms the rest.
function completedText(action: RenewalAction): string {
  return action.group === "staff_work" ? "Recorded." : "Done.";
}

export function RenewalFocusViewPane({
  snapshot,
  facts,
}: Readonly<{ snapshot: RenewalActionSnapshot; facts: RenewalFocusFacts }>) {
  const view = useRenewalFocusView();
  const manual = useRenewalManualWorkspace();
  const pricing = useRenewalPricingPolicy();
  // The staff-record context carries the newest readback; without the staff lane the server
  // snapshot is the only record.
  const contextual = manual !== null;
  const readUnavailable = manual?.readUnavailable ?? false;
  const contextState = manual?.state ?? null;
  const projection = useMemo(() => {
    const input: RenewalActionManualInput = !contextual
      ? snapshot.manual
      : readUnavailable
        ? { readable: false }
        : { readable: true, state: contextState };
    const bound = pricing
      ? {
          ...snapshot,
          standingOwnerAuthority: {
            covered: pricing.view?.authority.covered === true,
            manualRevision: pricing.view?.manualRevision ?? -1,
            reason:
              pricing.view?.authority.reason ??
              "Current agreement evidence is unavailable.",
          },
        }
      : snapshot;
    return projectRenewalActions(bound, input);
  }, [snapshot, contextual, readUnavailable, contextState, pricing]);
  const manualState: RenewalWorkspaceState | null =
    !contextual && snapshot.manual.readable
      ? snapshot.manual.state
      : readUnavailable
        ? null
        : contextState;
  const focusView = view?.view === "focus";
  const selectedId = selectRenewalAction(projection, view?.selectedActionId ?? null);
  const selected = projection.actions.find((action) => action.id === selectedId) ?? null;
  const complete =
    projection.outcome.state === "complete_recorded_by_staff" ||
    projection.outcome.state === "complete_verified";
  const reveal = useRef<FocusReveal | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const result = useRef<HTMLParagraphElement | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const focusHeading = useRef(false);
  // True between a person choosing a task and the render that shows it.
  const chosenByPerson = useRef(false);
  const previous = useRef<{
    id: string | null;
    status: RenewalActionStatus | null;
    cycleId: string | null;
  }>({
    id: selectedId,
    status: selected?.status ?? null,
    cycleId: projection.cycleId,
  });
  const [announcement, setAnnouncement] = useState("");

  // Reveal only the chosen action's existing regions; everything else stays mounted but hidden.
  // A completed staff renewal shows its completion record, which holds the existing Reopen control.
  useLayoutEffect(() => {
    if (!focusView || !view?.slot) {
      reveal.current?.clear();
      reveal.current = null;
      return;
    }
    const body = view.slot.parentElement;
    if (!body) return;
    reveal.current ??= createFocusReveal(body);
    const targetIds = selected
      ? (selected.control?.targets ?? [])
      : projection.outcome.state === "complete_recorded_by_staff"
        ? [COMPLETION_RECORD_TARGET]
        : [];
    const targets = targetIds
      .map((id) => document.getElementById(id))
      .filter(
        (element): element is HTMLElement => element !== null && body.contains(element),
      );
    // S197: these owning context controls remain mounted and usable in either view.
    const contextTargets = [
      ...body.querySelectorAll<HTMLElement>("[data-renewal-focus-context]"),
    ];
    reveal.current.apply([view.slot, ...contextTargets, ...targets]);
    if (pendingFocus.current) {
      const id = pendingFocus.current;
      pendingFocus.current = null;
      focusRenewalDashboardControl(id, { viewRequest: false });
    } else if (focusHeading.current) {
      focusHeading.current = false;
      if (heading.current) focusProgrammatically(heading.current);
    }
  });
  useEffect(
    () => () => {
      reveal.current?.clear();
      reveal.current = null;
    },
    [],
  );

  // A new cycle or a finished task never keeps a stale choice; every change of the shown task, or of
  // its state, is announced, and a change the person did not make moves focus predictably.
  useEffect(() => {
    const before = previous.current;
    previous.current = {
      id: selectedId,
      status: selected?.status ?? null,
      cycleId: projection.cycleId,
    };
    const byPerson = chosenByPerson.current;
    chosenByPerson.current = false;
    if (!view) return;
    if (before.cycleId !== projection.cycleId && view.selectedActionId) {
      view.setSelectedActionId(null);
      return;
    }
    const chosen = view.selectedActionId
      ? projection.actions.find((action) => action.id === view.selectedActionId)
      : undefined;
    if (
      view.selectedActionId &&
      (!chosen || chosen.status === "complete" || chosen.status === "not_applicable")
    )
      view.setSelectedActionId(null);
    if (!focusView) return;
    const labels = (id: string) =>
      projection.actions.find((action) => action.id === id)?.label ?? id;
    if (before.id === selectedId) {
      // The same task, changed by a save elsewhere or a refreshed source.
      if (selected && before.status !== null && before.status !== selected.status)
        setAnnouncement(
          `${selected.label}: ${stateText(selected, labels, projection.diagnostics)}`,
        );
      return;
    }
    const prior = before.id
      ? projection.actions.find((action) => action.id === before.id)
      : undefined;
    const finished =
      prior !== undefined &&
      (prior.status === "complete" || prior.status === "not_applicable");
    const next = selected
      ? `Next: ${selected.label}. ${stateText(selected, labels, projection.diagnostics)}`
      : complete
        ? `${projection.outcome.label}. Every required step is recorded.`
        : "Nothing else is ready for you on this lease.";
    setAnnouncement(
      finished
        ? selected
          ? `${completedText(prior)} Next: ${selected.label}.`
          : `${completedText(prior)} ${complete ? `${projection.outcome.label}.` : "Nothing else is ready for you on this lease."}`
        : byPerson && selected
          ? `${selected.label}: ${stateText(selected, labels, projection.diagnostics)}`
          : next,
    );
    if (byPerson) return;
    // After a completion, focus leaves the finished task's controls for the next task or the
    // result; otherwise it moves only when it was lost. A control in the pane itself keeps it.
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      !document.contains(active) ||
      active.closest("[data-renewal-focus-hidden]") ||
      (finished && !view.slot?.contains(active))
    ) {
      const target = selected ? heading.current : result.current;
      if (target) focusProgrammatically(target);
    }
  }, [view, focusView, projection, selectedId, selected, complete]);

  // A link to a control outside the revealed task chooses the task that owns it, or returns to
  // Full view at that control; in Full view the request passes through unchanged.
  useEffect(() => {
    if (!view) return;
    const onRequest = (event: Event) => {
      if (view.view !== "focus") return;
      const id = (event as CustomEvent<{ id: string }>).detail?.id;
      const element = id ? document.getElementById(id) : null;
      if (!id || !element || !element.closest("[data-renewal-focus-hidden]")) return;
      event.preventDefault();
      const owner = projection.actions.find((action) =>
        action.control?.targets.some((target) =>
          document.getElementById(target)?.contains(element),
        ),
      );
      if (owner) {
        pendingFocus.current = id;
        if (owner.id !== selectedId) chosenByPerson.current = true;
        view.setSelectedActionId(owner.id);
      } else view.showInFull(id);
    };
    document.addEventListener(RENEWAL_FOCUS_REQUEST_EVENT, onRequest);
    return () => document.removeEventListener(RENEWAL_FOCUS_REQUEST_EVENT, onRequest);
  }, [view, projection, selectedId]);

  if (!view || !focusView || !view.slot) return null;
  const choose = (id: string) => {
    focusHeading.current = true;
    if (id !== selectedId) chosenByPerson.current = true;
    view.setSelectedActionId(id);
  };
  return createPortal(
    <FocusPane
      announcement={announcement}
      choose={choose}
      complete={complete}
      facts={facts}
      heading={heading}
      manualMessage={manual?.message ?? ""}
      manualState={manualState}
      projection={projection}
      result={result}
      selected={selected}
      showInFull={() => view.showInFull(selected?.control?.targets[0] ?? null)}
    />,
    view.slot,
  );
}

function FocusPane({
  announcement,
  choose,
  complete,
  facts,
  heading,
  manualMessage,
  manualState,
  projection,
  result,
  selected,
  showInFull,
}: Readonly<{
  announcement: string;
  choose: (id: string) => void;
  complete: boolean;
  facts: RenewalFocusFacts;
  heading: RefObject<HTMLHeadingElement | null>;
  manualMessage: string;
  manualState: RenewalWorkspaceState | null;
  projection: RenewalActionProjection;
  result: RefObject<HTMLParagraphElement | null>;
  selected: RenewalAction | null;
  showInFull: () => void;
}>) {
  const working = useRenewalWorkingRecord();
  const labels = (id: string) =>
    projection.actions.find((action) => action.id === id)?.label ?? id;
  const otherReady = projection.actions.filter(
    (action) => action.status === "ready_for_actor" && action.id !== selected?.id,
  );
  // S153/S156: the same working-value precedence and renewal terms the Rent and charges card uses.
  const workingRecord = working?.record ?? null;
  const terms = describeRenewalTerms(
    effectiveRenewalTerms(workingRecord, manualState),
    (value) => USD.format(value),
  );
  const rent = operationalCurrentRent({
    working: workingRecord,
    inventory: facts.chargeInventory,
    contractualRent: facts.currentRent,
  });
  // The recovery that clears an unreadable source, when the projection names one.
  const recovery = projection.actions.find(
    (action) =>
      action.group === "recovery" &&
      action.status !== "complete" &&
      (action.id === "source.staff_records") === (selected?.group === "staff_work"),
  );
  const missingControls =
    selected?.control &&
    !selected.control.refresh &&
    selected.control.targets.every((id) => !document.getElementById(id));
  const moveOutNotice =
    facts.moveOutNotice &&
    !facts.advisories.some((advisory) => advisory.reason === facts.moveOutNotice)
      ? facts.moveOutNotice
      : null;
  return (
    <section
      aria-label="Focus view"
      className="panel ui-stack renewal-focus-pane"
      data-renewal-focus-action={selected?.id ?? "none"}
      data-renewal-focus-status={selected?.status ?? "none"}
    >
      {complete ? (
        <p className="renewal-focus-outcome" role="status">
          <strong>{projection.outcome.label}.</strong>
        </p>
      ) : null}
      {selected ? (
        <div className="ui-stack renewal-focus-task">
          <h2
            className="section-subtitle"
            id="renewal-focus-task-heading"
            ref={heading}
            tabIndex={-1}
          >
            {selected.label}
          </h2>
          <p className="renewal-focus-state" data-renewal-focus-state={selected.status}>
            {stateText(selected, labels, projection.diagnostics)}
          </p>
          {selected.detail && selected.detail !== selected.label ? (
            <p className="muted">{selected.detail}</p>
          ) : null}
          {selected.status === "unknown" && recovery && recovery.id !== selected.id ? (
            <p>
              <button
                className="text-link"
                onClick={() => choose(recovery.id)}
                type="button"
              >
                Work on {recovery.label}
              </button>
            </p>
          ) : null}
          {selected.status === "dependency_blocked" &&
          selected.resolvableVia.length > 0 ? (
            <ul
              className="renewal-focus-prerequisites"
              aria-label="Work that comes first"
            >
              {selected.resolvableVia.map((id) => (
                <li key={id}>
                  <button className="text-link" onClick={() => choose(id)} type="button">
                    Work on {labels(id)}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {selected.control?.refresh && facts.refreshAvailable ? (
            // The page's own refresh control does the work; Focus adds no second refresh.
            <p>
              <button
                className="secondary-button"
                onClick={() => document.getElementById("renewal-refresh")?.click()}
                type="button"
              >
                Refresh this lease
              </button>
            </p>
          ) : null}
          {selected.control?.handoff === "external" ? (
            <p className="muted">
              The fix belongs in the source record; refresh this lease after updating it.
            </p>
          ) : null}
          {missingControls ? (
            <p className="muted">This task&apos;s controls are shown in Full view.</p>
          ) : null}
          <p className="muted">Done when: {selected.evidence}</p>
          {manualMessage ? <p role="status">{manualMessage}</p> : null}
          <p>
            <button className="secondary-button" onClick={showInFull} type="button">
              Show this task in Full view
            </button>
          </p>
        </div>
      ) : (
        <p className="renewal-focus-result" ref={result} tabIndex={-1}>
          {complete
            ? "Every required step is recorded."
            : "Nothing is ready for you on this lease right now."}
        </p>
      )}
      {projection.diagnostics.length > 0 ? (
        <ul aria-label="Rules that need review" className="renewal-focus-diagnostics">
          {projection.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.kind}-${index}`}>
              {diagnosticText(diagnostic, labels)}
            </li>
          ))}
        </ul>
      ) : null}
      <dl className="renewal-focus-context">
        {manualState ? (
          <div>
            <dt>Cycle</dt>
            <dd>
              {manualState.basis.kind === "lease_bound"
                ? "Saved on the lease, no cycle date"
                : `${manualState.basis.kind === "lease_end" ? "Lease end" : "Review date"} ${formatCalendarDate(manualState.basis.dateIso)}`}
            </dd>
          </div>
        ) : null}
        {terms ? (
          <div>
            <dt>Working renewal terms</dt>
            <dd>{terms}</dd>
          </div>
        ) : null}
        <div>
          <dt>Current rent</dt>
          <dd data-current-rent-basis={rent.basis}>
            {rent.amount === null ? "Needs Verification" : USD.format(rent.amount)}{" "}
            <span className="muted">{rent.label}</span>
          </dd>
        </div>
        <div>
          <dt>Contractual lease rent (RentVine)</dt>
          <dd>
            {typeof facts.currentRent === "number"
              ? USD.format(facts.currentRent)
              : "Needs Verification"}
          </dd>
        </div>
        <div>
          <dt>Lease ends</dt>
          <dd>{formatCalendarDate(facts.endDateIso, "Needs Verification")}</dd>
        </div>
        {facts.lifecycleLabel ? (
          <div>
            <dt>Status</dt>
            <dd>{facts.lifecycleLabel}</dd>
          </div>
        ) : null}
      </dl>
      {moveOutNotice ? (
        <p className="renewal-notice" role="note">
          {moveOutNotice}
        </p>
      ) : null}
      {facts.dataExpired ? (
        <p className="muted">
          Lease data is out of date. Refresh this lease to read the sources again.
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
      {facts.advisories.length > 0 ? (
        <ul className="renewal-focus-advisories" aria-label="Lease notes">
          {facts.advisories.map((advisory) => (
            <li key={advisory.id}>
              <span className="renewal-issue-kind">{advisory.kindLabel}:</span>{" "}
              {advisory.reason}
            </li>
          ))}
        </ul>
      ) : null}
      {otherReady.length > 0 ? (
        <nav aria-label="Other ready tasks" className="renewal-focus-ready">
          <p className="muted">Also ready for you:</p>
          <ul>
            {otherReady.map((action) => (
              <li key={action.id}>
                <button
                  className="text-link"
                  onClick={() => choose(action.id)}
                  type="button"
                >
                  {action.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <details className="renewal-focus-all">
        <summary>All renewal work ({projection.actions.length})</summary>
        {GROUPS.map((group) => {
          const members = projection.actions.filter(
            (action) => action.status === group.status,
          );
          if (members.length === 0) return null;
          return (
            <div className="ui-stack-tight" key={group.status}>
              <h3 className="renewal-focus-group">
                {group.label} ({members.length})
              </h3>
              <ul>
                {members.map((action) => (
                  <li key={action.id} data-renewal-action-id={action.id}>
                    <button
                      aria-current={action.id === selected?.id ? "true" : undefined}
                      className="text-link"
                      onClick={() => choose(action.id)}
                      type="button"
                    >
                      {action.label}
                    </button>
                    {action.requirement === "optional" ? (
                      <span className="muted"> (optional)</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </details>
      <p aria-live="polite" className="sr-only" role="status">
        {announcement}
      </p>
    </section>
  );
}
