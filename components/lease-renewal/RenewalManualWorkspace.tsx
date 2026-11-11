"use client";
import { fetchWithDeadline as fetch } from "@/lib/ui/fetch-lifetime";
import { isRenewalPresentationMove } from "./RenewalDashboardNavigation";
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
import {
  standingAuthorityCurrent,
  useRenewalPricingPolicy,
  useStandingOwnerAuthority,
} from "./RenewalPricingPolicy";
import { housingAssistanceVariant } from "@/lib/lease-renewal/working-record";
import {
  AssistedRenewalControls,
  HousingProgramContactLead,
} from "./RenewalHousingAssistance";
import {
  WorkingDateField,
  WorkingMoneyField,
  useRenewalWorkingRecord,
} from "./RenewalWorkingRecord";
import { useRenewalFocusView } from "./RenewalFocusViewContext";
import { tenantAnswerCoversCurrentTerms } from "@/lib/lease-renewal/tenant-answer-terms";
import { OwnerApprovalCoverageLine } from "./OwnerApprovalCoverageLine";
import { Button, Card, Field } from "@/components/ui";
import { projectCycleSourceDateChange } from "@/lib/lease-renewal/cycle-source-date";
import { STEP_FOR_ACTIVITY } from "@/lib/lease-renewal/renewal-stage";
import {
  currentManualOwnerTerms,
  MANUAL_ACTIVITIES,
  STAFF_RECORD_SOURCE,
  currentStaffActivity,
  derivedOutreachSheetIntent,
  manualActionLabel,
  manualRenewalSummary,
  type ManualActivity,
  type OwnerApprovalInput,
  type RenewalCycleBasis,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
  type StaffActivityRecord,
} from "@/lib/lease-renewal/workspace-state";
import {
  outreachFillFor,
  type DerivedOutreachRecord,
  type LeaseOutreachEvidence,
} from "@/lib/lease-renewal/outreach-evidence";
import {
  describeOwnerApproval,
  type OwnerApprovalChoices,
} from "@/lib/lease-renewal/owner-approval-evidence";
import { ContinueToTenantOffer, ManualOwnerAnswerApproval } from "./RenewalOwnerAnswer";
import {
  CurrentLeaseEndFact,
  RenewalEndDateCheck,
  RenewalStartSuggestion,
  ReturnToTenantOffer,
  WORKING_END_CONTROL_ID,
  WORKING_START_CONTROL_ID,
} from "./RenewalDateProposal";
import type { ApprovedBaseInput } from "@/lib/lease-renewal/owner-approval-scope";
import type { OfferAnswerInput } from "@/lib/lease-renewal/offer-answers";
import {
  OwnerOfferApproval,
  OwnerOfferCoverageLine,
  TenantOfferAnswer,
  useOfferAnswers,
} from "./RenewalOfferAnswers";
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
  record: (action: RenewalWorkspaceAction, offer?: OfferAnswerInput) => Promise<void>;
  prepareSource: (
    field: keyof typeof SHEET_FIELD_LABELS,
    eventId: string,
  ) => Promise<void>;
  /** S248 R-S248-11: prepare the Sheet update a derived outreach record holds. */
  prepareDerivedSource: (record: DerivedOutreachRecord) => Promise<void>;
  /** S234 R-S234-1: the owners of record and owner-thread replies an approval can name. */
  ownerApproval?: OwnerApprovalChoices;
  /** S248: the lease's message evidence, read into the staff lane as the desk row reads it. */
  outreachEvidence?: LeaseOutreachEvidence | null;
  /**
   * R-S269-3 / S270: each activity's unsaved entry by activity, for this lease page's lifetime, so
   * an entry survives its form moving (Finish up moves the next follow-up from Other follow-ups
   * into its Work when the one before it is recorded). Presentation state only; saves nothing.
   */
  activityDrafts?: Map<ManualActivity, ActivityDraft>;
}
/** An activity form's entry that differs from its saved record, with the fields typed in. */
interface ActivityDraft {
  readonly outcome: StaffActivityRecord["outcome"];
  readonly source: string;
  readonly reason: string;
  readonly occurredAt: string;
  readonly touched: readonly string[];
}
const Context = createContext<ManualContext | null>(null);
export function useRenewalManualWorkspace() {
  return useContext(Context);
}

/** The first follow-up with no done or not applicable record, in the outcome's order. */
function firstOpenFollowUp(
  state: RenewalWorkspaceState | null,
  activities: readonly ManualActivity[],
): ManualActivity | null {
  return (
    activities.find((key) => {
      const outcome = state ? currentStaffActivity(state, key)?.outcome : undefined;
      return outcome !== "done" && outcome !== "not_applicable";
    }) ?? null
  );
}

const FINISH_UP_ACTIVITIES = (Object.keys(MANUAL_ACTIVITIES) as ManualActivity[]).filter(
  (key) =>
    MANUAL_ACTIVITIES[key].section === "documents" &&
    STEP_FOR_ACTIVITY[key] === "finish-up",
);

/**
 * S270 / R-S269-3: the follow-up Finish up's Work holds. It is the first open follow-up when the
 * person arrives (the page opens, the view switches or the Guided outcome changes) and stays the
 * same while they work there, so recording it never moves its form, its focus or its typed
 * entries under them. The next one takes its place at the next arrival. Presentation only.
 */
export function useFinishUpLead(): ManualActivity | null {
  const state = useRenewalManualWorkspace()?.state ?? null;
  const view = useRenewalFocusView();
  const first = firstOpenFollowUp(state, FINISH_UP_ACTIVITIES);
  const arrival = `${view?.view ?? ""}:${view?.nowPresentation?.stepId ?? ""}`;
  const [kept, setKept] = useState<{
    readonly arrival: string;
    readonly lead: ManualActivity | null;
  } | null>(null);
  // Until the staff record is read, the lead follows it.
  if (state && (!kept || kept.arrival !== arrival)) setKept({ arrival, lead: first });
  return state && kept && kept.arrival === arrival ? kept.lead : first;
}
interface ManualProviderProps {
  writebackPaused?: boolean;
  unavailable?: boolean;
  leaseId: string;
  initialState: RenewalWorkspaceState | null | undefined;
  children: ReactNode;
  nextAction?: ReactNode;
  statusLog?: ReactNode;
  cycleBasis?: RenewalCycleBasis | null;
  ownerApproval?: OwnerApprovalChoices;
  /** S248: the lease's renewal message evidence (the stage context's), or none. */
  outreachEvidence?: LeaseOutreachEvidence | null;
}
export function RenewalManualProvider(props: ManualProviderProps) {
  return props.initialState === undefined && !props.unavailable ? (
    <>
      {props.nextAction}
      {props.statusLog}
      {props.children}
    </>
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
  nextAction,
  statusLog,
  cycleBasis,
  writebackPaused = false,
  unavailable = false,
  ownerApproval,
  outreachEvidence,
}: ManualProviderProps) {
  const pricing = useRenewalPricingPolicy();
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
  const reloadPricing = pricing?.reload;
  useEffect(() => {
    if (reloadPricing) void reloadPricing();
  }, [state?.revision, reloadPricing]);
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
  // S262 R-S262-2: an answer with an Amount approved changed the working terms in the same save.
  const workingForAnswers = useRenewalWorkingRecord();
  const reloadWorking = useRef(workingForAnswers?.reload);
  useEffect(() => {
    reloadWorking.current = workingForAnswers?.reload;
  }, [workingForAnswers?.reload]);
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
    async (
      key: string,
      action: RenewalWorkspaceAction,
      offer?: OfferAnswerInput,
    ): Promise<void> => {
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
          // S264 R-S264-6: the exact offer the answer covers, saved with the answer.
          ...(offer ? { offer } : {}),
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
          if (action.kind === "owner_response" && action.approvedBase)
            void reloadWorking.current?.();
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
    (action: RenewalWorkspaceAction, offer?: OfferAnswerInput) => {
      const key = manualRecordKey(action);
      const result = queue.current.then(() => run(key, action, offer));
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
        "Sheet update prepared. Read the exact change under Lease details, then choose Apply Sheet update.",
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
  async function prepareDerivedSource(record: DerivedOutreachRecord) {
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
          operation: "prepare_derived_source",
          leaseId,
          cycleId: current.cycleId,
          audience: record.audience,
          sequenceId: record.sequenceId,
          occurrenceId: record.occurrenceId,
        }),
      });
      const result = await response.json();
      if (typeof result.writeback_paused === "boolean")
        setPaused(result.writeback_paused);
      if (!response.ok)
        throw new Error(result.error ?? "This Sheet update could not be prepared.");
      applyState(result.state);
      setMessage(
        "Prepared from the app's confirmed send. Review the Sheet update and confirm it separately.",
      );
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
  const covered = useStandingOwnerAuthority(state?.revision ?? 0);
  const workingRecord = useRenewalWorkingRecord();
  const [activityDrafts] = useState(() => new Map<ManualActivity, ActivityDraft>());
  // S248: the same evidence fill the desk row reads; the recorded work card names its next step.
  const summary = manualRenewalSummary(state, {
    standingOwnerAuthority: covered,
    evidence: outreachFillFor(state, outreachEvidence),
    // S251: the lease's Housing assistance Yes fact orders the assisted steps.
    housingAssistance: housingAssistanceVariant(workingRecord?.record),
  });
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
        prepareDerivedSource,
        ownerApproval,
        outreachEvidence: outreachEvidence ?? null,
        activityDrafts,
      }}
    >
      <div className="renewal-primary-progress" data-renewal-focus-context>
        {nextAction}
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
                Suggested next: {manualActionLabel(summary.nextActivity, summary)}
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
      </div>
      {statusLog}
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
  "program_contact",
  "owner_outreach",
  "tenant_offer",
];
export function RenewalManualSection({
  section,
  documentOutcome,
  moveOutInitiated = false,
  currentRent = null,
  part,
  workingTermsApart = false,
  leadActivity,
}: {
  /**
   * S270: Ask the owner's outcome layout shows the one Working renewal terms editor as its own
   * named reveal (RenewalWorkingTermsReveal) instead of inside the owner's response.
   */
  workingTermsApart?: boolean;
  /** S270: the follow-up Finish up's Work holds (useFinishUpLead), shared by both parts. */
  leadActivity?: ManualActivity | null;
  section: "owner" | "tenant" | "documents";
  documentOutcome?: "documents" | "finish-up" | "complete";
  /**
   * S270: Finish up's active Work holds its first open follow-up and the source updates
   * ("lead"); its named group "Other follow-ups" holds the rest ("rest"). Each form has one owner.
   */
  part?: "lead" | "rest";
  /** S251 R-S251-6: the current rent "Keep the current rent" records as the working rent. */
  currentRent?: number | null;
  /**
   * S232 R-S232-5: RentVine shows a move-out notice. The page and its notice-timing issue direct
   * staff to the non-renewal handoff, so it is shown before any staff non-renewal is recorded.
   */
  moveOutInitiated?: boolean;
}) {
  const context = useRenewalManualWorkspace();
  const covered = useStandingOwnerAuthority(context?.state?.revision ?? 0);
  const workingRecord = useRenewalWorkingRecord();
  if (!context) return null;
  const { state } = context;
  if (context.readUnavailable && !state)
    return <p>Reload current staff records above before recording work.</p>;
  const fill = outreachFillFor(state, context.outreachEvidence);
  const assisted = housingAssistanceVariant(workingRecord?.record);
  const summary = manualRenewalSummary(state, {
    standingOwnerAuthority: covered,
    evidence: fill,
    housingAssistance: assisted,
  });
  // S248 R-S248-11: a derived tenant offer with no Sheet value held for it yet.
  const derivedIntent = fill?.tenant_offer
    ? derivedOutreachSheetIntent(fill.tenant_offer.activity)
    : null;
  const derivedSheetValue =
    state &&
    fill?.tenant_offer &&
    derivedIntent &&
    !state.sourceUpdates[derivedIntent.field]
      ? { record: fill.tenant_offer, intent: derivedIntent }
      : null;
  const activities = Object.entries(MANUAL_ACTIVITIES)
    .filter(
      ([key, value]) =>
        value.section === section &&
        (!documentOutcome ||
          STEP_FOR_ACTIVITY[key as ManualActivity] === documentOutcome ||
          (documentOutcome === "complete" && key === "non_renewal_handoff")) &&
        (key !== "non_renewal_handoff" || summary.nonRenewal || moveOutInitiated) &&
        // S251 R-S251-4: the program contact is part of the path only with Housing assistance
        // Yes; a record staff already made stays visible.
        (key !== "program_contact" ||
          Boolean(assisted) ||
          Boolean(state?.activities[key])),
    )
    .map(([key]) => key as ManualActivity);
  // S270: the first follow-up without a done or not applicable record leads Finish up.
  const leadFollowUp =
    part && documentOutcome === "finish-up"
      ? leadActivity !== undefined
        ? leadActivity
        : firstOpenFollowUp(state, activities)
      : null;
  const partActivities =
    part === "lead"
      ? activities.filter((key) => key === leadFollowUp)
      : part === "rest"
        ? activities.filter((key) => key !== leadFollowUp)
        : activities;
  // S120 (R120.1): the outreach or delivery record comes before the response it precedes in
  // time; the remaining activities keep their order after the response.
  const beforeResponse = partActivities.filter((key) =>
    ACTIVITIES_BEFORE_RESPONSE.includes(key),
  );
  const afterResponse = partActivities.filter(
    (key) => !ACTIVITIES_BEFORE_RESPONSE.includes(key),
  );
  const activityForm = (key: ManualActivity) => <ActivityForm key={key} activity={key} />;
  if (part === "rest")
    return partActivities.length > 0 ? (
      <div className="ui-stack" data-renewal-follow-ups="other">
        {beforeResponse.map(activityForm)}
        {afterResponse.map(activityForm)}
      </div>
    ) : null;
  const completionState = context.states.completion ?? AUTOSAVE_IDLE;
  return (
    <Card
      title={
        documentOutcome === "finish-up"
          ? "Follow-up work recorded by staff"
          : documentOutcome === "complete"
            ? "Completion recorded by staff"
            : renewalCardTitle(`staff-work-${section}`, "Work recorded by staff")
      }
    >
      {beforeResponse.map(activityForm)}
      {/* S251 R-S251-5 / R-S251-6: the owner's answer on renewing and the rent choice, shown only
          for a lease whose Housing assistance fact is Yes. */}
      {section === "owner" && assisted ? (
        <AssistedRenewalControls currentRent={currentRent} />
      ) : null}
      {section === "owner" ? (
        <ResponseForm audience="owner" workingTermsApart={workingTermsApart} />
      ) : null}
      {section === "tenant" ? <ResponseForm audience="tenant" /> : null}
      {afterResponse.map(activityForm)}
      {section === "documents" && (!documentOutcome || documentOutcome === "complete") ? (
        <div id="renewal-manual-complete" tabIndex={-1} className="ui-stack">
          <RenewalSectionHeading id="staff-completion" as="h3">
            {summary.label}
          </RenewalSectionHeading>
          {summary.complete || summary.nextActivity !== "complete" ? (
            <p>
              {summary.complete
                ? "This renewal is recorded complete by staff. That record is separate from verified completion in RentVine, Gmail or Dotloop."
                : `Suggested next: ${manualActionLabel(summary.nextActivity, summary)}.`}
            </p>
          ) : null}
          <Button
            data-renewal-next-control
            data-renewal-work-primary={documentOutcome === "complete" ? true : undefined}
            disabled={context.pending}
            onClick={() =>
              void context
                .record({ kind: summary.complete ? "reopen" : "complete" })
                .catch(() => undefined)
            }
          >
            {summary.complete ? "Reopen recorded completion" : "Record staff completion"}
          </Button>
          <AutosaveStatus state={completionState} subject="Completion" />
        </div>
      ) : null}
      {section === "documents" &&
      (!documentOutcome || documentOutcome === "finish-up") ? (
        <div className="ui-stack" id="renewal-manual-source-updates">
          <RenewalSectionHeading id="source-updates" as="h3">
            Source updates
          </RenewalSectionHeading>
          {state && derivedSheetValue ? (
            // S248 R-S248-11: the derived tenant offer holds the same Sheet value a staff record
            // holds; preparing it is a deliberate step and its update is confirmed separately.
            <p data-renewal-derived-source={derivedSheetValue.intent.field}>
              {SHEET_FIELD_LABELS[derivedSheetValue.intent.field]}:{" "}
              {String(derivedSheetValue.intent.value)} :{" "}
              {context.writebackPaused
                ? "Sheet updates are paused"
                : "The Sheet changes only when you confirm its update"}
              .{" "}
              <Button
                variant="secondary"
                disabled={context.pending || context.writebackPaused}
                onClick={() =>
                  void context.prepareDerivedSource(derivedSheetValue.record)
                }
              >
                Prepare the Sheet update for{" "}
                {SHEET_FIELD_LABELS[derivedSheetValue.intent.field].toLowerCase()}
              </Button>
            </p>
          ) : null}
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
        </div>
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
  const pricing = useRenewalPricingPolicy();
  const context = useRenewalManualWorkspace()!,
    state = context.state,
    definition = MANUAL_ACTIVITIES[activity],
    current = state ? currentStaffActivity(state, activity) : null,
    historical = state?.activities[activity];
  // R-S269-3 / S270: an unsaved entry kept for this activity (its form moved, as Finish up moves
  // the next follow-up into its Work) comes back exactly as it was left.
  const drafts = context.activityDrafts;
  const [kept] = useState(() => drafts?.get(activity) ?? null);
  const id = useId(),
    [outcome, setOutcome] = useState<StaffActivityRecord["outcome"]>(
      kept?.outcome ?? current?.outcome ?? "not_started",
    ),
    [source, setSource] = useState(kept?.source ?? savedSource(current?.source)),
    [reason, setReason] = useState(kept?.reason ?? current?.reason ?? ""),
    [occurredAt, setOccurredAt] = useState(
      kept?.occurredAt ?? toLocalDateTime(current?.occurredAt),
    );
  // The fields the person has typed in since the last save. A newer saved record (another
  // operator, a new work record) refreshes every other field, so a later autosave never carries a
  // stale value over a colleague's entry.
  const [touched, setTouched] = useState<ReadonlySet<string>>(
    () => new Set(kept?.touched ?? []),
  );
  const outcomeEdited = outcome !== (current?.outcome ?? "not_started");
  useEffect(() => {
    if (!drafts) return;
    if (touched.size > 0 || outcomeEdited)
      drafts.set(activity, {
        outcome,
        source,
        reason,
        occurredAt,
        touched: [...touched],
      });
    else drafts.delete(activity);
  }, [drafts, activity, outcome, source, reason, occurredAt, touched, outcomeEdited]);
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
  const workingRecord = useRenewalWorkingRecord();
  const isNext =
    manualRenewalSummary(state, {
      standingOwnerAuthority: standingAuthorityCurrent(
        pricing?.view,
        state?.revision ?? 0,
      ),
      evidence: outreachFillFor(state, context.outreachEvidence),
      housingAssistance: housingAssistanceVariant(workingRecord?.record),
    }).nextActivity === activity;
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
  function saveDetail(event: React.FocusEvent<HTMLInputElement>) {
    if (isRenewalPresentationMove(event.relatedTarget)) return;
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
        {/* S266 R-S266-2: the assisted outcome leads with the program and its contact input. */}
        {activity === "program_contact" ? <HousingProgramContactLead /> : null}
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
/**
 * S263/S270: the one Working renewal terms editor: the way back to a tenant offer that opened a
 * date fix, the verified current lease end kept apart from the working renewal dates, the dates
 * (and, in the earlier layout, the working rent) and the owner-approved terms recorded earlier.
 */
export function WorkingRenewalTermsFields({ rent }: Readonly<{ rent: boolean }>) {
  const recordedTerms = useRenewalManualWorkspace()?.state?.ownerResponse?.terms;
  return (
    <>
      <ReturnToTenantOffer />
      <CurrentLeaseEndFact />
      {rent ? (
        <WorkingMoneyField field="terms_rent" label="Working monthly rent" />
      ) : null}
      <WorkingDateField
        controlId={WORKING_START_CONTROL_ID}
        field="terms_effective_date"
        label="Working effective date"
      >
        <RenewalStartSuggestion />
      </WorkingDateField>
      <WorkingDateField
        controlId={WORKING_END_CONTROL_ID}
        field="terms_end_date"
        label="Working term end date"
      >
        <RenewalEndDateCheck />
      </WorkingDateField>
      {recordedTerms ? (
        <p className="muted">
          Owner-approved terms recorded earlier on this cycle:{" "}
          {USD.format(recordedTerms.rent)} from{" "}
          {formatCalendarDate(recordedTerms.effectiveDate)} to{" "}
          {formatCalendarDate(recordedTerms.endDate)}.
        </p>
      ) : null}
    </>
  );
}

function ResponseForm({
  audience,
  workingTermsApart = false,
}: {
  audience: "owner" | "tenant";
  /** S270: Ask the owner shows the Working renewal terms as its own named reveal. */
  workingTermsApart?: boolean;
}) {
  const outcomeLayout = useRenewalFocusView()?.outcomeLayout ?? false;
  const context = useRenewalManualWorkspace()!,
    state = context.state,
    current = audience === "owner" ? state?.ownerResponse : state?.tenantResponse;
  const workingContext = useRenewalWorkingRecord();
  // S234 R-S234-5: a tenant answer answers the terms it was recorded against. With a readable
  // Working record that includes each Working term's revision; otherwise the staff terms revision.
  const earlierTerms =
    !!state &&
    !!current &&
    (audience === "tenant" && workingContext && !workingContext.readUnavailable
      ? !tenantAnswerCoversCurrentTerms(state, workingContext.record)
      : current.termsRevision !== state.termsRevision);
  const initialOutcome = audience === "owner" ? "no_response" : "awaiting_response";
  const id = useId(),
    [outcome, setOutcome] = useState<string>(current?.outcome ?? initialOutcome),
    [source, setSource] = useState(savedSource(current?.source));
  const [dirty, setDirty] = useState(false);
  // S234 R-S234-4: the owner's requested change, saved with "Revision requested".
  const savedNote =
    audience === "owner" && current?.outcome === "revision_requested"
      ? (current.reason ?? "")
      : "";
  const [revisionNote, setRevisionNote] = useState(savedNote);
  const [noteEdited, setNoteEdited] = useState(false);
  const savedEvent = current?.eventId ?? null;
  const [seenEvent, setSeenEvent] = useState(savedEvent);
  if (savedEvent !== seenEvent) {
    setSeenEvent(savedEvent);
    if (!dirty) {
      setOutcome(current?.outcome ?? initialOutcome);
      setSource(savedSource(current?.source));
    }
    if (!noteEdited) setRevisionNote(savedNote);
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
          // S251: the owner's "Renew" answer on an assisted lease, shown once it is recorded.
          ...(current?.outcome === "renew_tenant" ? [["renew_tenant", "Renew"]] : []),
        ]
      : [
          ["awaiting_response", "Awaiting response"],
          ["accepted", "Accepted"],
          ["counter_change_requested", "Counter / change requested"],
          ["declined_nonrenewing", "Declined / not renewing"],
          ["needs_verification", "Needs verification"],
        ];
  function save(nextOutcome: string = outcome) {
    // S234 R-S234-1: an approval is recorded only with who approved, how and when.
    if (audience === "owner" && nextOutcome === "approved_terms") return;
    const common = {
      ...(source.trim() ? { source: source.trim() } : {}),
      // S234 R-S234-4: the owner's requested change travels with "Revision requested".
      ...(audience === "owner" &&
      nextOutcome === "revision_requested" &&
      revisionNote.trim()
        ? { reason: revisionNote.trim() }
        : {}),
    };
    const action: RenewalWorkspaceAction =
      audience === "owner"
        ? {
            kind: "owner_response",
            outcome: nextOutcome as
              | "approved_terms"
              | "revision_requested"
              | "declined_non_renewal"
              | "no_response"
              | "renew_tenant",
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
      .then(() => {
        setDirty(false);
        setNoteEdited(false);
      })
      .catch(() => undefined);
  }
  // S264 R-S264-6: the exact offer each answer covers, with the tenant message's own read (read
  // again after every save of this record).
  const offerAnswers = useOfferAnswers();
  const [ownerOffer, setOwnerOffer] = useState(false);
  // S262 R-S262-1/2: the reviewed answer with its Amount approved, saved in one transaction.
  function recordApproval(
    approval: OwnerApprovalInput,
    approvedBase: ApprovedBaseInput,
  ): Promise<boolean> {
    const reviewed = offerAnswers.view?.current;
    return context
      .record(
        {
          kind: "owner_response",
          outcome: "approved_terms",
          approval,
          approvedBase,
          ...(source.trim() ? { source: source.trim() } : {}),
        },
        // S264: the owner approved the reviewed offer's exact charges with the exact terms.
        ownerOffer && reviewed && approvedBase.scope !== "amount_only"
          ? {
              kind: "owner_reviewed_offer",
              snapshotId: reviewed.snapshotId,
              snapshotHash: reviewed.snapshotHash,
            }
          : undefined,
      )
      .then(() => {
        setDirty(false);
        setNewApproval(false);
        return true;
      })
      .catch(() => false);
  }
  const [newApproval, setNewApproval] = useState(false);
  const ownerApproval = audience === "owner" ? state?.ownerResponse : undefined;
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
            const selected = event.currentTarget.value;
            setOutcome(selected);
            save(selected);
          }}
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {audience === "owner" && outcome === "approved_terms" ? null : (
        <Field htmlFor={`${id}-source`} label="Response source or channel (optional)">
          <input
            disabled={context.pending}
            id={`${id}-source`}
            maxLength={240}
            value={source}
            onBlur={(event) => {
              if (isRenewalPresentationMove(event.relatedTarget)) return;
              if (source.trim() === savedSource(current?.source)) setDirty(false);
              else save();
            }}
            onChange={(event) => {
              setSource(event.target.value);
              setDirty(true);
            }}
          />
        </Field>
      )}
      {audience === "tenant" ? (
        <TenantOfferAnswer
          answers={offerAnswers}
          eventId={current?.eventId ?? null}
          canEdit
          onRecord={(offer) => {
            void context
              .record(
                {
                  kind: "tenant_response",
                  outcome: outcome as
                    | "accepted"
                    | "counter_change_requested"
                    | "declined_nonrenewing",
                  ...(source.trim() ? { source: source.trim() } : {}),
                },
                offer,
              )
              .catch(() => undefined);
          }}
          outcome={outcome}
          pending={context.pending}
        />
      ) : null}
      {audience === "owner" && outcome === "revision_requested" ? (
        <Field
          htmlFor={`${id}-revision`}
          label="What the owner asked to change"
          hint="Saved with Revision requested. The Working terms stay the one terms record; update them, then ask the owner again."
        >
          <textarea
            disabled={context.pending}
            id={`${id}-revision`}
            maxLength={1000}
            value={revisionNote}
            onBlur={() => {
              if (revisionNote.trim() !== savedNote) save("revision_requested");
            }}
            onChange={(event) => {
              setRevisionNote(event.target.value);
              setNoteEdited(true);
            }}
          />
        </Field>
      ) : null}
      {audience === "owner" && ownerApproval?.outcome === "approved_terms" ? (
        <>
          <p data-renewal-field="owner-approval-recorded">
            {ownerApproval.approval
              ? describeOwnerApproval(ownerApproval.approval, formatBusinessTimestamp)
              : "Approved (recorded before who approved and how were required)."}
          </p>
          <OwnerApprovalCoverageLine
            economicsHash={context.ownerApproval?.economicsHash ?? null}
            state={state}
          />
          <OwnerOfferCoverageLine
            answers={offerAnswers}
            eventId={ownerApproval.eventId}
          />
          {/* S262: the saved answer's offer amount and the way on to the tenant offer. */}
          <ContinueToTenantOffer working={workingContext?.record ?? null} />
        </>
      ) : null}
      {audience === "owner" &&
      outcome === "approved_terms" &&
      (ownerApproval?.outcome !== "approved_terms" || newApproval) ? (
        <>
          <OwnerOfferApproval
            answers={offerAnswers}
            checked={ownerOffer}
            disabled={context.pending}
            onChange={setOwnerOffer}
          />
          <ManualOwnerAnswerApproval
            choices={context.ownerApproval}
            disabled={context.pending}
            onSave={recordApproval}
          />
        </>
      ) : audience === "owner" && ownerApproval?.outcome === "approved_terms" ? (
        <div className="ui-row">
          <button
            className="text-link"
            disabled={context.pending}
            onClick={() => setNewApproval(true)}
            type="button"
          >
            Record a new approval
          </button>
        </div>
      ) : null}
      <AutosaveStatus
        onRetry={() => save()}
        state={saveState}
        subject={audience === "owner" ? "Owner response" : "Tenant response"}
      />
      {current ? (
        <p>
          Recorded {formatBusinessTimestamp(current.recordedAt)} by {current.actorUid}.{" "}
          {earlierTerms
            ? audience === "tenant"
              ? "Recorded before the terms changed; it does not answer the current terms."
              : "Recorded before the owner response changed."
            : ""}
        </p>
      ) : null}
      {/* S270: in Ask the owner's outcome layout the terms are their own named reveal. */}
      {audience === "owner" && !workingTermsApart ? (
        <div className="ui-stack" id="renewal-working-terms">
          <RenewalSectionHeading id="working-terms" as="h3">
            Working renewal terms
          </RenewalSectionHeading>
          <WorkingRenewalTermsFields rent={!outcomeLayout} />
        </div>
      ) : null}
    </div>
  );
}
