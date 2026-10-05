"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { isProgrammaticFocusMove } from "./RenewalDashboardNavigation";
import { formatCalendarDate, formatBusinessTimestamp } from "@/lib/date-display";
import {
  RenewalSectionHeading,
  renewalCardTitle,
} from "@/components/lease-renewal/RenewalSectionHeading";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  AUTOSAVE_IDLE,
  AutosaveStatus,
  withEdited,
  type AutosaveState,
} from "./AutosaveStatus";
import { WorkingDateField, WorkingMoneyField } from "./RenewalWorkingRecord";
import { Button, Card, Field } from "@/components/ui";
import { projectCycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import {
  currentManualOwnerTerms,
  MANUAL_ACTIVITIES,
  STAFF_RECORD_SOURCE,
  currentStaffActivity,
  manualActionLabel,
  manualRenewalSummary,
  type ManualActivity,
  type RenewalCycleBasis,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { SHEET_FIELD_LABELS } from "@/lib/lease-renewal/sheet-writeback/field-intent";

interface ManualContext {
  writebackPaused: boolean;
  state: RenewalWorkspaceState | null;
  leaseId: string;
  /** True while current staff records are unread or a deliberate action is in flight. */
  pending: boolean;
  /** S144: true until current staff records are read back after a failed read. */
  readUnavailable: boolean;
  /** S144: the latest save or read outcome, shown again by the Focus view. */
  message: string;
  /** S155: the saving / saved / failed state of each independently saved record. */
  states: Readonly<Record<string, AutosaveState>>;
  /**
   * Saves one staff record. S154: the first save establishes the lease's work record, so no cycle
   * step comes first. It resolves when the save is confirmed and rejects when it is not.
   */
  record: (action: RenewalWorkspaceAction) => Promise<void>;
  prepareSource: (
    field: keyof typeof SHEET_FIELD_LABELS,
    eventId: string,
  ) => Promise<void>;
}
const Context = createContext<ManualContext | null>(null);
export function useRenewalManualWorkspace() {
  return useContext(Context);
}
interface ManualProviderProps {
  writebackPaused?: boolean;
  unavailable?: boolean;
  leaseId: string;
  initialState: RenewalWorkspaceState | null | undefined;
  children: ReactNode;
  cycleBasis?: RenewalCycleBasis | null;
}
export function RenewalManualProvider(props: ManualProviderProps) {
  return props.initialState === undefined && !props.unavailable ? (
    <>{props.children}</>
  ) : (
    // The provider stays mounted when the first save establishes the work record, so entries in
    // other controls are never lost to a remount.
    <ActiveManualProvider
      key={`${props.leaseId}:${props.unavailable ? "unavailable" : "ready"}`}
      {...props}
    />
  );
}

/** The independently saved record an action belongs to; its status and retries are keyed by it. */
export function manualRecordKey(action: RenewalWorkspaceAction): string {
  return action.kind === "activity"
    ? `activity:${action.activity}`
    : action.kind === "complete" || action.kind === "reopen"
      ? "completion"
      : action.kind;
}
function recordEvent(state: RenewalWorkspaceState | null, key: string): string | null {
  if (!state) return null;
  if (key.startsWith("activity:"))
    return state.activities[key.slice(9) as ManualActivity]?.eventId ?? null;
  if (key === "owner_response") return state.ownerResponse?.eventId ?? null;
  if (key === "tenant_response") return state.tenantResponse?.eventId ?? null;
  if (key === "completion") return state.completion?.eventId ?? null;
  return state.preparation ? String(state.preparation.revision) : null;
}
function newerState(
  current: RenewalWorkspaceState | null,
  candidate: RenewalWorkspaceState | null | undefined,
) {
  if (!candidate) return current;
  return !current ||
    candidate.cycleId !== current.cycleId ||
    candidate.revision >= current.revision
    ? candidate
    : current;
}

function ActiveManualProvider({
  leaseId,
  initialState,
  children,
  cycleBasis,
  writebackPaused = false,
  unavailable = false,
}: ManualProviderProps) {
  const [pausedReadback, setPaused] = useState<boolean | null>(null);
  // The freshest server observation of the Sheet switch wins: a save or reload response is newer
  // than the page that rendered this provider.
  const paused = pausedReadback ?? writebackPaused;
  const [readUnavailable, setReadUnavailable] = useState(unavailable);
  const [recordedState, setState] = useState(initialState ?? null),
    [deliberate, setDeliberate] = useState(false),
    [message, setMessage] = useState("");
  const [states, setStates] = useState<Record<string, AutosaveState>>({});
  const [history, setHistory] = useState<Array<Record<string, unknown>> | null>(null);
  const router = useRouter();
  const state = useMemo(
    () =>
      initialState &&
      recordedState &&
      initialState.cycleId === recordedState.cycleId &&
      initialState.revision > recordedState.revision
        ? initialState
        : (recordedState ?? initialState ?? null),
    [initialState, recordedState],
  );
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  // S154: a page refresh that shows a different work record (a new cycle established by a save,
  // or the first record) replaces what this provider recorded; a refresh of the same record keeps
  // the newer revision through the memo above.
  const seenInitialCycle = useRef(initialState?.cycleId ?? null);
  useEffect(() => {
    const cycleId = initialState?.cycleId ?? null;
    if (cycleId === seenInitialCycle.current) return;
    seenInitialCycle.current = cycleId;
    setState(initialState ?? null);
    setStates({});
  }, [initialState]);
  const readUnavailableRef = useRef(readUnavailable);
  useEffect(() => {
    readUnavailableRef.current = readUnavailable;
  }, [readUnavailable]);
  // One save at a time, in the order staff made them, each against the latest saved revision.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const outstanding = useRef(new Map<string, { key: string; id: string }>());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );
  const setRecordState = useCallback((key: string, value: AutosaveState) => {
    setStates((current) => ({ ...current, [key]: value }));
  }, []);
  const applyState = useCallback((next: RenewalWorkspaceState | null | undefined) => {
    stateRef.current = newerState(stateRef.current, next);
    setState((current) => newerState(current, next));
  }, []);
  // The rest of the page (guidance, desk status) follows saved work without taking focus away
  // from the control staff are typing in.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 1200);
  }, [router]);

  const readCurrent = useCallback(async () => {
    const response = await fetch(
      `/api/lease-renewal/workspace?leaseId=${encodeURIComponent(leaseId)}`,
    );
    const value = await response.json();
    if (typeof value.writeback_paused === "boolean") setPaused(value.writeback_paused);
    if (!response.ok)
      throw new Error(value.error ?? "Current records could not be read.");
    return value as {
      state: RenewalWorkspaceState | null;
      activity: Array<Record<string, unknown>>;
    };
  }, [leaseId]);

  const run = useCallback(
    async (key: string, action: RenewalWorkspaceAction): Promise<void> => {
      if (readUnavailableRef.current) {
        const text = "Reload current staff records before recording work.";
        setMessage(text);
        setRecordState(key, { phase: "failed", message: text });
        throw new Error(text);
      }
      setRecordState(key, { phase: "saving" });
      setMessage("");
      for (let attempt = 0; attempt < 2; attempt++) {
        const basis = stateRef.current;
        const payload = {
          operation: "record",
          leaseId,
          cycleId: basis?.cycleId ?? null,
          expectedRevision: basis?.revision ?? 0,
          action,
        };
        const payloadKey = JSON.stringify(payload);
        const prior = outstanding.current.get(key);
        const operationId = prior?.key === payloadKey ? prior.id : crypto.randomUUID();
        outstanding.current.set(key, { key: payloadKey, id: operationId });
        let response: Response;
        let result: {
          state?: RenewalWorkspaceState | null;
          error?: string;
          writeback_paused?: boolean;
        };
        try {
          response = await fetch("/api/lease-renewal/workspace", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...payload, operationId }),
          });
          result = await response.json();
        } catch {
          // The response was lost. The same request stays outstanding so saving the same entry
          // again returns the first result instead of recording it twice.
          const text = "The save did not finish.";
          setMessage(`${text} Your entry is kept.`);
          setRecordState(key, { phase: "failed", message: text });
          throw new Error(text);
        }
        if (typeof result.writeback_paused === "boolean")
          setPaused(result.writeback_paused);
        if (response.ok) {
          outstanding.current.delete(key);
          applyState(result.state);
          setRecordState(key, { phase: "saved" });
          setMessage("Saved. Any listed Sheet update still needs its own confirmation.");
          scheduleRefresh();
          return;
        }
        // A refused request was never stored; a later save uses a new request.
        outstanding.current.delete(key);
        if (response.status === 409 && attempt === 0) {
          // Someone saved first. Read the current record: if this same item changed, it is a
          // real conflict to show; if only other items changed, save again on the new revision.
          let latest: RenewalWorkspaceState | null;
          let readable = true;
          try {
            latest = (await readCurrent()).state;
          } catch {
            latest = null;
            readable = false;
          }
          const changedHere =
            !readable ||
            recordEvent(latest, key) !== recordEvent(basis, key) ||
            (basis !== null && latest !== null && latest.cycleId !== basis.cycleId);
          if (readable) {
            stateRef.current = latest;
            setState(latest);
          }
          if (!changedHere) continue;
          const text =
            "Another operator changed this item. Review the current record, then save your entry again if it still applies.";
          setMessage(text);
          setRecordState(key, { phase: "failed", message: text, conflict: true });
          scheduleRefresh();
          throw new Error(text);
        }
        const text = result.error ?? "The record could not be saved.";
        setMessage(text);
        setRecordState(key, {
          phase: "failed",
          message: text,
          conflict: response.status === 409,
        });
        throw new Error(text);
      }
    },
    [applyState, leaseId, readCurrent, scheduleRefresh, setRecordState],
  );

  const record = useCallback(
    (action: RenewalWorkspaceAction) => {
      const key = manualRecordKey(action);
      const result = queue.current.then(() => run(key, action));
      queue.current = result.catch(() => undefined);
      return result;
    },
    [run],
  );

  async function prepareSource(field: keyof typeof SHEET_FIELD_LABELS, eventId: string) {
    if (paused) {
      setMessage("Saved in the app. Sheet updates are paused.");
      return;
    }
    const current = stateRef.current;
    if (!current) return;
    setDeliberate(true);
    try {
      const response = await fetch("/api/lease-renewal/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "prepare_source",
          leaseId,
          cycleId: current.cycleId,
          field,
          eventId,
        }),
      });
      const result = await response.json();
      if (typeof result.writeback_paused === "boolean")
        setPaused(result.writeback_paused);
      if (!response.ok)
        throw new Error(result.error ?? "This Sheet update could not be prepared.");
      applyState(result.state);
      setMessage(
        "Sheet update prepared. Review and confirm its exact change under Lease details.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This Sheet update could not be prepared.",
      );
    } finally {
      setDeliberate(false);
    }
  }
  async function reload() {
    setDeliberate(true);
    try {
      const value = await readCurrent();
      stateRef.current = value.state;
      setState(value.state);
      setReadUnavailable(false);
      setHistory(value.activity);
      outstanding.current.clear();
      setMessage("Current staff records read back. Your unsaved entries are kept.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Current records could not be read.",
      );
    } finally {
      setDeliberate(false);
    }
  }
  const summary = manualRenewalSummary(state);
  return (
    <Context.Provider
      value={{
        writebackPaused: paused,
        state,
        leaseId,
        pending: deliberate || readUnavailable,
        readUnavailable,
        message,
        states,
        record,
        prepareSource,
      }}
    >
      <Card
        id="renewal-card-manual-records"
        title={renewalCardTitle("renewal-cycle", "Recorded renewal work")}
      >
        <p>
          {readUnavailable
            ? "Current staff records could not be read. Reload before recording work"
            : summary.label}
          . Provider evidence is shown separately below.
        </p>
        {state ? (
          <p>
            {state.basis.kind === "lease_bound"
              ? `Work saved on this lease without a cycle date · ${state.basis.source}.`
              : `Work recorded against ${state.basis.kind === "lease_end" ? "lease end" : "review date"} ${formatCalendarDate(state.basis.dateIso)} · ${state.basis.source}.`}
          </p>
        ) : readUnavailable ? null : (
          <p id="renewal-manual-cycle" tabIndex={-1}>
            No staff activity recorded yet.
          </p>
        )}
        {state ? (
          <CycleSourceDateNote state={state} cycleBasis={cycleBasis ?? null} />
        ) : null}
        {state ? (
          <p>
            <a href={`#renewal-manual-${summary.nextActivity}`}>
              Suggested next: {manualActionLabel(summary.nextActivity)}
            </a>
          </p>
        ) : null}
        <Button onClick={() => void reload()} disabled={deliberate} variant="secondary">
          Reload records and history
        </Button>
        {message ? <p role="status">{message}</p> : null}
        {history ? (
          <details>
            <summary>Staff activity history ({history.length})</summary>
            <ol>
              {history.map((entry) => (
                <li key={String(entry.id)}>
                  {formatBusinessTimestamp(
                    typeof entry.recorded_at === "string" ? entry.recorded_at : null,
                  )}{" "}
                  · {String(entry.actor_uid)} ·{" "}
                  {String((entry.action as Record<string, unknown>)?.kind)}
                  <pre style={{ whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(entry.action, null, 2)}
                  </pre>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </Card>
      {children}
    </Context.Provider>
  );
}
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/**
 * S123 (R-F02-04): when RentVine now reports a different lease end than the recorded cycle, say
 * so beside the recorded basis and terms. The recorded facts stay as written. Nothing renders
 * while the provider still reports the recorded date.
 */
function CycleSourceDateNote({
  state,
  cycleBasis,
}: {
  state: RenewalWorkspaceState;
  cycleBasis: RenewalCycleBasis | null;
}) {
  const change = projectCycleSourceDateChange(
    state.basis,
    cycleBasis?.kind === "lease_end" ? cycleBasis.dateIso : null,
  );
  if (change.state !== "changed" && change.state !== "current_unavailable") return null;
  const terms = currentManualOwnerTerms(state);
  return (
    <p role="note" data-renewal-cycle-source-date={change.state}>
      {change.label}
      {change.state === "changed"
        ? terms
          ? ` Owner-approved terms recorded on this cycle: ${USD.format(terms.rent)} from ${formatCalendarDate(terms.effectiveDate)} to ${formatCalendarDate(terms.endDate)}. They remain as recorded.`
          : " Previous terms were not recorded for this cycle."
        : null}
    </p>
  );
}
const ACTIVITIES_BEFORE_RESPONSE: readonly ManualActivity[] = [
  "owner_outreach",
  "tenant_offer",
];
export function RenewalManualSection({
  section,
}: {
  section: "owner" | "tenant" | "documents";
}) {
  const context = useRenewalManualWorkspace();
  if (!context) return null;
  const { state } = context;
  if (context.readUnavailable && !state)
    return <p>Reload current staff records above before recording work.</p>;
  const summary = manualRenewalSummary(state);
  const activities = Object.entries(MANUAL_ACTIVITIES)
    .filter(
      ([key, value]) =>
        value.section === section &&
        (key !== "non_renewal_handoff" || summary.nonRenewal),
    )
    .map(([key]) => key as ManualActivity);
  // S120 (R120.1): the outreach or delivery record comes before the response it precedes in
  // time; the remaining activities keep their order after the response.
  const beforeResponse = activities.filter((key) =>
    ACTIVITIES_BEFORE_RESPONSE.includes(key),
  );
  const afterResponse = activities.filter(
    (key) => !ACTIVITIES_BEFORE_RESPONSE.includes(key),
  );
  const activityForm = (key: ManualActivity) => <ActivityForm key={key} activity={key} />;
  const completionState = context.states.completion ?? AUTOSAVE_IDLE;
  return (
    <Card title={renewalCardTitle(`staff-work-${section}`, "Work recorded by staff")}>
      {beforeResponse.map(activityForm)}
      {section === "owner" ? <ResponseForm audience="owner" /> : null}
      {section === "tenant" ? <ResponseForm audience="tenant" /> : null}
      {afterResponse.map(activityForm)}
      {section === "documents" ? (
        <>
          <div id="renewal-manual-complete" tabIndex={-1} className="ui-stack">
            <RenewalSectionHeading id="staff-completion" as="h3">
              {summary.label}
            </RenewalSectionHeading>
            {summary.complete || summary.nextActivity !== "complete" ? (
              <p>
                {summary.complete
                  ? "This renewal is recorded complete by staff. That record is separate from verified completion in RentVine, Gmail or Dotloop."
                  : `Suggested next: ${manualActionLabel(summary.nextActivity)}.`}
              </p>
            ) : null}
            <Button
              data-renewal-next-control
              disabled={context.pending}
              onClick={() =>
                void context
                  .record({ kind: summary.complete ? "reopen" : "complete" })
                  .catch(() => undefined)
              }
            >
              {summary.complete
                ? "Reopen recorded completion"
                : "Record staff completion"}
            </Button>
            <AutosaveStatus state={completionState} subject="Completion" />
          </div>
          <RenewalSectionHeading id="source-updates" as="h3">
            Source updates
          </RenewalSectionHeading>
          {state && Object.values(state.sourceUpdates).length ? (
            <ul>
              {Object.values(state.sourceUpdates).map((update) => (
                <li key={update.eventId}>
                  {SHEET_FIELD_LABELS[update.intent.field]}: {String(update.intent.value)}{" "}
                  :{" "}
                  {update.state === "verified"
                    ? "Read back after confirmed update"
                    : context.writebackPaused
                      ? "Saved in the app. Sheet updates are paused"
                      : "Saved in the app. The Sheet changes only when you confirm its update"}
                  {update.reason ? ` · ${update.reason}` : ""}.{" "}
                  <a href="#renewal-step-verify-renewal">Review Sheet updates</a>
                  {update.state !== "verified" ? (
                    <Button
                      variant="secondary"
                      disabled={context.pending || context.writebackPaused}
                      onClick={() =>
                        void context.prepareSource(update.intent.field, update.eventId)
                      }
                    >
                      Prepare the Sheet update for{" "}
                      {SHEET_FIELD_LABELS[update.intent.field].toLowerCase()}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No source update is recorded for this lease.</p>
          )}
        </>
      ) : null}
    </Card>
  );
}
function toLocalDateTime(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function savedSource(source: string | undefined): string {
  return source && source !== STAFF_RECORD_SOURCE ? source : "";
}
function ActivityForm({ activity }: { activity: ManualActivity }) {
  const context = useRenewalManualWorkspace()!,
    state = context.state,
    definition = MANUAL_ACTIVITIES[activity],
    current = state ? currentStaffActivity(state, activity) : null,
    historical = state?.activities[activity];
  const id = useId(),
    [outcome, setOutcome] = useState(current?.outcome ?? "not_started"),
    [source, setSource] = useState(savedSource(current?.source)),
    [reason, setReason] = useState(current?.reason ?? ""),
    [occurredAt, setOccurredAt] = useState(toLocalDateTime(current?.occurredAt));
  // The fields the person has typed in since the last save. A newer saved record (another
  // operator, a new work record) refreshes every other field, so a later autosave never carries a
  // stale value over a colleague's entry.
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const touch = (field: string) =>
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)));
  const setDirty = (value: boolean) => {
    if (!value) setTouched(new Set());
  };
  const savedEvent = current?.eventId ?? null;
  const [seenEvent, setSeenEvent] = useState(savedEvent);
  if (savedEvent !== seenEvent) {
    setSeenEvent(savedEvent);
    if (!touched.has("outcome")) setOutcome(current?.outcome ?? "not_started");
    if (!touched.has("source")) setSource(savedSource(current?.source));
    if (!touched.has("reason")) setReason(current?.reason ?? "");
    if (!touched.has("occurredAt")) setOccurredAt(toLocalDateTime(current?.occurredAt));
  }
  const isNext = manualRenewalSummary(state).nextActivity === activity;
  const key = `activity:${activity}`;
  // A typed detail that differs from the saved record is not saved yet.
  const detailEdited =
    source.trim() !== savedSource(current?.source) ||
    reason.trim() !== (current?.reason ?? "") ||
    occurredAt !== toLocalDateTime(current?.occurredAt);
  const saveState = withEdited(context.states[key] ?? AUTOSAVE_IDLE, detailEdited);
  type Outcome = typeof outcome;
  function save(next: Partial<{ outcome: Outcome }> = {}) {
    const value = next.outcome ?? outcome;
    const when = occurredAt ? new Date(occurredAt) : null;
    void context
      .record({
        kind: "activity",
        activity,
        outcome: value,
        ...(source.trim() ? { source: source.trim() } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        ...(when && !Number.isNaN(when.getTime())
          ? { occurredAt: when.toISOString() }
          : {}),
      })
      .then(() => setDirty(false))
      .catch(() => undefined);
  }
  // A text entry saves when the person leaves the control and it differs from the saved record.
  // Focus moved by the page itself (a refresh, a chosen task) keeps the entry as a draft.
  function saveDetail() {
    if (isProgrammaticFocusMove()) return;
    if (
      source.trim() === savedSource(current?.source) &&
      reason.trim() === (current?.reason ?? "") &&
      occurredAt === toLocalDateTime(current?.occurredAt)
    ) {
      setDirty(false);
      return;
    }
    save();
  }
  return (
    <details id={`renewal-manual-${activity}`} open={isNext || undefined}>
      <summary>
        {definition.label} :{" "}
        {current?.outcome.replaceAll("_", " ") ??
          (historical ? "Recorded before the terms changed" : "Not recorded")}
      </summary>
      <div className="ui-stack">
        <Field htmlFor={`${id}-outcome`} label={`${definition.label} outcome`}>
          <select
            data-renewal-next-control
            disabled={context.pending}
            id={`${id}-outcome`}
            value={outcome}
            onChange={(event) => {
              const value = event.target.value as Outcome;
              setOutcome(value);
              save({ outcome: value });
            }}
          >
            <option value="not_started">Not started</option>
            <option value="waiting">Waiting</option>
            <option value="done">Done: recorded by staff</option>
            {definition.conditional ? (
              <option value="not_applicable">Not applicable to this lease</option>
            ) : null}
          </select>
        </Field>
        <Field
          htmlFor={`${id}-source`}
          label="Source or channel (optional)"
          hint="For example a call, an email or a document."
        >
          <input
            disabled={context.pending}
            id={`${id}-source`}
            maxLength={240}
            value={source}
            onBlur={saveDetail}
            onChange={(event) => {
              setSource(event.target.value);
              touch("source");
            }}
          />
        </Field>
        <Field htmlFor={`${id}-reason`} label="Comment (optional)">
          <input
            disabled={context.pending}
            id={`${id}-reason`}
            maxLength={1000}
            value={reason}
            onBlur={saveDetail}
            onChange={(event) => {
              setReason(event.target.value);
              touch("reason");
            }}
          />
        </Field>
        <Field htmlFor={`${id}-when`} label="When the work happened (optional)">
          <input
            disabled={context.pending}
            type="datetime-local"
            id={`${id}-when`}
            value={occurredAt}
            onBlur={saveDetail}
            onChange={(event) => {
              setOccurredAt(event.target.value);
              touch("occurredAt");
            }}
          />
        </Field>
        <AutosaveStatus
          onRetry={() => save()}
          state={saveState}
          subject={definition.label}
        />
        {current ? (
          <p>
            Recorded {formatBusinessTimestamp(current.recordedAt)} by {current.actorUid}.
            Source: {current.source}.
          </p>
        ) : null}
      </div>
    </details>
  );
}
function ResponseForm({ audience }: { audience: "owner" | "tenant" }) {
  const context = useRenewalManualWorkspace()!,
    state = context.state,
    current = audience === "owner" ? state?.ownerResponse : state?.tenantResponse;
  const initialOutcome = audience === "owner" ? "no_response" : "awaiting_response";
  const id = useId(),
    [outcome, setOutcome] = useState<string>(current?.outcome ?? initialOutcome),
    [source, setSource] = useState(savedSource(current?.source));
  const [dirty, setDirty] = useState(false);
  const savedEvent = current?.eventId ?? null;
  const [seenEvent, setSeenEvent] = useState(savedEvent);
  if (savedEvent !== seenEvent) {
    setSeenEvent(savedEvent);
    if (!dirty) {
      setOutcome(current?.outcome ?? initialOutcome);
      setSource(savedSource(current?.source));
    }
  }
  const key = audience === "owner" ? "owner_response" : "tenant_response";
  const saveState = withEdited(
    context.states[key] ?? AUTOSAVE_IDLE,
    dirty && source.trim() !== savedSource(current?.source),
  );
  const options =
    audience === "owner"
      ? [
          ["no_response", "No response"],
          ["approved_terms", "Approved"],
          ["revision_requested", "Revision requested"],
          ["declined_non_renewal", "Declined / non-renewal"],
        ]
      : [
          ["awaiting_response", "Awaiting response"],
          ["accepted", "Accepted"],
          ["counter_change_requested", "Counter / change requested"],
          ["declined_nonrenewing", "Declined / not renewing"],
          ["needs_verification", "Needs verification"],
        ];
  function save(nextOutcome: string = outcome) {
    const common = source.trim() ? { source: source.trim() } : {};
    const action: RenewalWorkspaceAction =
      audience === "owner"
        ? {
            kind: "owner_response",
            outcome: nextOutcome as
              | "approved_terms"
              | "revision_requested"
              | "declined_non_renewal"
              | "no_response",
            ...common,
          }
        : {
            kind: "tenant_response",
            outcome: nextOutcome as
              | "awaiting_response"
              | "accepted"
              | "counter_change_requested"
              | "declined_nonrenewing"
              | "needs_verification",
            ...common,
          };
    void context
      .record(action)
      .then(() => setDirty(false))
      .catch(() => undefined);
  }
  const recordedTerms = audience === "owner" ? state?.ownerResponse?.terms : undefined;
  return (
    <div id={`renewal-manual-${audience}_response`} tabIndex={-1} className="ui-stack">
      <RenewalSectionHeading
        id={audience === "owner" ? "owner-response" : "tenant-response"}
        as="h3"
      >
        {audience === "owner" ? "Owner response" : "Tenant response"}
      </RenewalSectionHeading>
      <Field
        htmlFor={`${id}-outcome`}
        label={`${audience === "owner" ? "Owner" : "Tenant"} response`}
      >
        <select
          disabled={context.pending}
          id={`${id}-outcome`}
          data-renewal-next-control
          value={outcome}
          onChange={(event) => {
            setOutcome(event.target.value);
            save(event.target.value);
          }}
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field htmlFor={`${id}-source`} label="Response source or channel (optional)">
        <input
          disabled={context.pending}
          id={`${id}-source`}
          maxLength={240}
          value={source}
          onBlur={() => {
            if (source.trim() === savedSource(current?.source)) setDirty(false);
            else save();
          }}
          onChange={(event) => {
            setSource(event.target.value);
            setDirty(true);
          }}
        />
      </Field>
      <AutosaveStatus
        onRetry={() => save()}
        state={saveState}
        subject={audience === "owner" ? "Owner response" : "Tenant response"}
      />
      {current ? (
        <p>
          Recorded {formatBusinessTimestamp(current.recordedAt)} by {current.actorUid}.{" "}
          {state && current.termsRevision !== state.termsRevision
            ? "Recorded before the owner response changed."
            : ""}
        </p>
      ) : null}
      {audience === "owner" ? (
        <div className="ui-stack" id="renewal-working-terms">
          <RenewalSectionHeading id="working-terms" as="h3">
            Working renewal terms
          </RenewalSectionHeading>
          <WorkingMoneyField field="terms_rent" label="Working monthly rent" />
          <WorkingDateField field="terms_effective_date" label="Working effective date" />
          <WorkingDateField field="terms_end_date" label="Working term end date" />
          {recordedTerms ? (
            <p className="muted">
              Owner-approved terms recorded earlier on this cycle:{" "}
              {USD.format(recordedTerms.rent)} from{" "}
              {formatCalendarDate(recordedTerms.effectiveDate)} to{" "}
              {formatCalendarDate(recordedTerms.endDate)}.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
