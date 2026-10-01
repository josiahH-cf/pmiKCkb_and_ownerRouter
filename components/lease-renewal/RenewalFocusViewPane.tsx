"use client";

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
import {
  projectRenewalActions,
  selectRenewalAction,
  type RenewalAction,
  type RenewalActionManualInput,
  type RenewalActionProjection,
  type RenewalActionSnapshot,
  type RenewalActionStatus,
} from "@/lib/lease-renewal/renewal-actions";
import {
  currentManualOwnerTerms,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import {
  focusRenewalDashboardControl,
  RENEWAL_FOCUS_REQUEST_EVENT,
} from "./RenewalDashboardNavigation";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
import { useRenewalManualWorkspace } from "./RenewalManualWorkspace";
import { createFocusReveal, type FocusReveal } from "./renewal-focus-reveal";

/**
 * S143/S144: the Focus view's single-task pane. It shows the chosen action from the S142
 * projection with its material context and reveals that action's existing Full view controls in
 * place below it; nothing here submits, saves or calls a provider. Each revealed control keeps
 * its own handler, route, validation, confirmation and readback, and the pane advances only when
 * the recomputed projection shows the action's owning completion evidence.
 */

export interface RenewalFocusFacts {
  readonly currentRent: number | null;
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
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

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

function stateText(action: RenewalAction, labels: (id: string) => string): string {
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
    case "unresolved":
      return action.reason === "no_control"
        ? "This step is recorded outside this dashboard; its history is in Full view."
        : action.reason === "impossible_condition"
          ? "The recorded responses conflict. Review them in Full view."
          : "This step's records need review in Full view.";
    case "complete":
      return "Recorded.";
    case "not_applicable":
      return "Not part of this lease's path.";
  }
}

export function RenewalFocusViewPane({
  snapshot,
  facts,
}: Readonly<{ snapshot: RenewalActionSnapshot; facts: RenewalFocusFacts }>) {
  const view = useRenewalFocusView();
  const manual = useRenewalManualWorkspace();
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
    return projectRenewalActions(snapshot, input);
  }, [snapshot, contextual, readUnavailable, contextState]);
  const manualState: RenewalWorkspaceState | null =
    !contextual && snapshot.manual.readable
      ? snapshot.manual.state
      : readUnavailable
        ? null
        : contextState;
  const focusView = view?.view === "focus";
  const selectedId = selectRenewalAction(projection, view?.selectedActionId ?? null);
  const selected = projection.actions.find((action) => action.id === selectedId) ?? null;
  const reveal = useRef<FocusReveal | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const focusHeading = useRef(false);
  const previous = useRef<{ id: string | null; cycleId: string | null }>({
    id: selectedId,
    cycleId: projection.cycleId,
  });
  const [announcement, setAnnouncement] = useState("");

  // Reveal only the chosen action's existing regions; everything else stays mounted but hidden.
  useLayoutEffect(() => {
    if (!focusView || !view?.slot) {
      reveal.current?.clear();
      reveal.current = null;
      return;
    }
    const body = view.slot.parentElement;
    if (!body) return;
    reveal.current ??= createFocusReveal(body);
    const targets = (selected?.control?.targets ?? [])
      .map((id) => document.getElementById(id))
      .filter(
        (element): element is HTMLElement => element !== null && body.contains(element),
      );
    reveal.current.apply([view.slot, ...targets]);
    if (pendingFocus.current) {
      const id = pendingFocus.current;
      pendingFocus.current = null;
      focusRenewalDashboardControl(id, { viewRequest: false });
    } else if (focusHeading.current) {
      focusHeading.current = false;
      heading.current?.focus();
    }
  });
  useEffect(
    () => () => {
      reveal.current?.clear();
      reveal.current = null;
    },
    [],
  );

  // A new cycle or a finished task never keeps a stale choice; a finished task moves on predictably.
  useEffect(() => {
    const before = previous.current;
    previous.current = { id: selectedId, cycleId: projection.cycleId };
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
    if (!focusView || !before.id || before.id === selectedId) return;
    const prior = projection.actions.find((action) => action.id === before.id);
    if (!prior || (prior.status !== "complete" && prior.status !== "not_applicable"))
      return;
    setAnnouncement(
      selected
        ? `Recorded. Next: ${selected.label}.`
        : "Recorded. Nothing else is ready for you on this lease.",
    );
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      !document.contains(active) ||
      active.closest("[data-renewal-focus-hidden]")
    )
      heading.current?.focus();
  }, [view, focusView, projection, selectedId, selected]);

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
        view.setSelectedActionId(owner.id);
      } else view.showInFull(id);
    };
    document.addEventListener(RENEWAL_FOCUS_REQUEST_EVENT, onRequest);
    return () => document.removeEventListener(RENEWAL_FOCUS_REQUEST_EVENT, onRequest);
  }, [view, projection]);

  if (!view || !focusView || !view.slot) return null;
  const choose = (id: string) => {
    focusHeading.current = true;
    view.setSelectedActionId(id);
  };
  return createPortal(
    <FocusPane
      announcement={announcement}
      choose={choose}
      facts={facts}
      heading={heading}
      manualMessage={manual?.message ?? ""}
      manualState={manualState}
      projection={projection}
      selected={selected}
      showInFull={() => view.showInFull(selected?.control?.targets[0] ?? null)}
    />,
    view.slot,
  );
}

function FocusPane({
  announcement,
  choose,
  facts,
  heading,
  manualMessage,
  manualState,
  projection,
  selected,
  showInFull,
}: Readonly<{
  announcement: string;
  choose: (id: string) => void;
  facts: RenewalFocusFacts;
  heading: RefObject<HTMLHeadingElement | null>;
  manualMessage: string;
  manualState: RenewalWorkspaceState | null;
  projection: RenewalActionProjection;
  selected: RenewalAction | null;
  showInFull: () => void;
}>) {
  const labels = (id: string) =>
    projection.actions.find((action) => action.id === id)?.label ?? id;
  const otherReady = projection.actions.filter(
    (action) => action.status === "ready_for_actor" && action.id !== selected?.id,
  );
  const terms = manualState ? currentManualOwnerTerms(manualState) : null;
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
  const complete =
    projection.outcome.state === "complete_recorded_by_staff" ||
    projection.outcome.state === "complete_verified";
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
            {stateText(selected, labels)}
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
        <p>
          {complete
            ? "Every required step is recorded."
            : "Nothing is ready for you on this lease right now."}
        </p>
      )}
      <dl className="renewal-focus-context">
        {manualState ? (
          <div>
            <dt>Cycle</dt>
            <dd>
              {manualState.basis.kind === "lease_end" ? "Lease end" : "Review date"}{" "}
              {formatCalendarDate(manualState.basis.dateIso)}
            </dd>
          </div>
        ) : null}
        {terms ? (
          <div>
            <dt>Owner-approved terms</dt>
            <dd>
              {USD.format(terms.rent)} from {formatCalendarDate(terms.effectiveDate)} to{" "}
              {formatCalendarDate(terms.endDate)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Current base rent (RentVine)</dt>
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
      {facts.dataExpired ? (
        <p className="muted">
          Lease data is past the freshness limit; refresh before acting.
        </p>
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
