"use client";
import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field } from "@/components/ui";
import {
  MANUAL_ACTIVITIES,
  currentStaffActivity,
  manualRenewalSummary,
  type ManualActivity,
  type RenewalCycleBasis,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { parseCurrencyInput } from "@/lib/currency-input";
import { SHEET_FIELD_LABELS } from "@/lib/lease-renewal/sheet-writeback/field-intent";

interface ManualContext {
  state: RenewalWorkspaceState | null;
  leaseId: string;
  pending: boolean;
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
    <ActiveManualProvider
      key={`${props.leaseId}:${props.unavailable ? "unavailable" : (props.initialState?.cycleId ?? "pending")}`}
      {...props}
    />
  );
}
function ActiveManualProvider({
  leaseId,
  initialState,
  children,
  cycleBasis,
  unavailable = false,
}: ManualProviderProps) {
  const [readUnavailable, setReadUnavailable] = useState(unavailable);
  const [recordedState, setState] = useState(initialState ?? null),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  const [history, setHistory] = useState<Array<Record<string, unknown>> | null>(null);
  const outstanding = useRef<{ key: string; id: string } | null>(null),
    router = useRouter();
  const state =
    initialState &&
    recordedState &&
    initialState.cycleId === recordedState.cycleId &&
    initialState.revision > recordedState.revision
      ? initialState
      : recordedState;
  async function prepareSource(field: keyof typeof SHEET_FIELD_LABELS, eventId: string) {
    if (!state) return;
    setPending(true);
    try {
      const response = await fetch("/api/lease-renewal/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "prepare_source",
          leaseId,
          cycleId: state.cycleId,
          field,
          eventId,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "This source proposal could not be prepared.");
      setState(result.state);
      setMessage(
        "Source preparation read back. Review its exact Sheet confirmation in Lease details.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This source proposal could not be prepared.",
      );
    } finally {
      setPending(false);
    }
  }
  async function submit(payload: Record<string, unknown>) {
    if (readUnavailable) {
      setMessage("Reload current staff records before recording work.");
      return;
    }
    const key = JSON.stringify(payload);
    if (outstanding.current?.key !== key)
      outstanding.current = { key, id: crypto.randomUUID() };
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/lease-renewal/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...payload,
          leaseId,
          operationId: outstanding.current.id,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "The activity could not be recorded.");
      setState(result.state);
      outstanding.current = null;
      setMessage(
        "Staff record saved and read back. Any listed Sheet update still needs its own confirmation.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The recording response was lost. Retry the same entry to recover it.",
      );
      throw error;
    } finally {
      setPending(false);
    }
  }
  async function record(action: RenewalWorkspaceAction) {
    if (!state) return;
    await submit({
      operation: "record",
      cycleId: state.cycleId,
      expectedRevision: state.revision,
      action,
    });
  }
  async function reload() {
    setPending(true);
    try {
      const response = await fetch(
        `/api/lease-renewal/workspace?leaseId=${encodeURIComponent(leaseId)}`,
      );
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error ?? "Current records could not be read.");
      setState(value.state);
      setReadUnavailable(false);
      setHistory(value.activity);
      outstanding.current = null;
      setMessage(
        "Current staff records read back. Review unsaved inputs before recording them.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Current records could not be read.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Context.Provider
      value={{
        state,
        leaseId,
        pending: pending || readUnavailable,
        record,
        prepareSource,
      }}
    >
      <Card title="Recorded renewal work">
        <p>
          {readUnavailable
            ? "Current staff records could not be read. Reload before recording work"
            : manualRenewalSummary(state).label}
          . Provider evidence is shown separately below.
        </p>
        {state ? (
          <p>
            Cycle based on{" "}
            {state.basis.kind === "lease_end" ? "lease end" : "review date"}{" "}
            {state.basis.dateIso} · {state.basis.source}.
          </p>
        ) : null}
        <CycleControl
          current={state}
          basis={cycleBasis ?? null}
          pending={pending || readUnavailable}
          start={async (basis) =>
            submit({
              operation: "start_cycle",
              basis,
              expectedCycleId: state?.cycleId ?? null,
              expectedRevision: state?.revision ?? 0,
              reason: state
                ? "Staff explicitly started the next reviewed renewal cycle"
                : "Staff selected the reviewed current renewal cycle",
            })
          }
        />
        {state ? (
          <p>
            <a href={`#renewal-manual-${manualRenewalSummary(state).nextActivity}`}>
              Continue recorded work
            </a>
          </p>
        ) : null}
        <Button onClick={() => void reload()} disabled={pending} variant="secondary">
          Reload records and history
        </Button>
        {message ? <p role="status">{message}</p> : null}
        {history ? (
          <details>
            <summary>Staff activity history ({history.length})</summary>
            <ol>
              {history.map((entry) => (
                <li key={String(entry.id)}>
                  {String(entry.recorded_at)} · {String(entry.actor_uid)} ·{" "}
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
function CycleControl({
  current,
  basis,
  pending,
  start,
}: {
  current: RenewalWorkspaceState | null;
  basis: RenewalCycleBasis | null;
  pending: boolean;
  start: (basis: RenewalCycleBasis) => Promise<void>;
}) {
  const id = useId(),
    [date, setDate] = useState(basis?.dateIso ?? ""),
    [source, setSource] = useState(basis?.source ?? ""),
    [reviewed, setReviewed] = useState(false);
  const form = (
    <div id="renewal-manual-cycle" className="ui-stack" tabIndex={-1}>
      <p>
        {current
          ? "Starting another cycle preserves this cycle as history. Its approvals and completion will not carry over."
          : "Select the current reviewed cycle before saving preparation or staff activity."}
      </p>
      <Field
        htmlFor={`${id}-date`}
        label={
          basis?.kind === "lease_end"
            ? "Verified lease end for this cycle"
            : "Reviewed periodic-review date"
        }
      >
        <input
          data-renewal-next-control
          id={`${id}-date`}
          type="date"
          value={date}
          readOnly={basis?.kind === "lease_end"}
          onChange={(event) => setDate(event.target.value)}
        />
      </Field>
      <Field htmlFor={`${id}-source`} label="Cycle date source">
        <input
          id={`${id}-source`}
          value={source}
          readOnly={basis?.kind === "lease_end"}
          onChange={(event) => setSource(event.target.value)}
        />
      </Field>
      <label>
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(event) => setReviewed(event.target.checked)}
        />
        I reviewed this cycle and want to record work against it.
      </label>
      <Button
        disabled={pending || !date || !source.trim() || !reviewed}
        onClick={() =>
          void start(
            basis?.kind === "lease_end"
              ? basis
              : { kind: "review_date", dateIso: date, source },
          ).catch(() => undefined)
        }
      >
        {current ? "Start new renewal cycle" : "Use this reviewed cycle"}
      </Button>
    </div>
  );
  return current ? (
    <details>
      <summary>Start a new renewal cycle</summary>
      {form}
    </details>
  ) : (
    form
  );
}
export function RenewalManualSection({
  section,
}: {
  section: "owner" | "tenant" | "documents";
}) {
  const context = useRenewalManualWorkspace();
  if (!context) return null;
  const { state } = context;
  if (!state)
    return <p>Manual recording is available after selecting the reviewed cycle above.</p>;
  const summary = manualRenewalSummary(state);
  return (
    <Card title="Work recorded by staff">
      <p>
        Record work completed in another channel or tool. These records do not send
        messages or verify provider effects.
      </p>
      {section === "owner" ? (
        <ResponseForm key={`owner-${state.cycleId}`} audience="owner" />
      ) : null}
      {section === "tenant" ? (
        <ResponseForm key={`tenant-${state.cycleId}`} audience="tenant" />
      ) : null}
      {Object.entries(MANUAL_ACTIVITIES)
        .filter(
          ([key, value]) =>
            value.section === section &&
            (key !== "non_renewal_handoff" || summary.nonRenewal),
        )
        .map(([key]) => (
          <ActivityForm
            key={`${state.cycleId}-${key}`}
            activity={key as ManualActivity}
          />
        ))}
      {section === "documents" ? (
        <>
          <div id="renewal-manual-complete" tabIndex={-1} className="ui-stack">
            <h3>{summary.label}</h3>
            <p>
              {summary.complete
                ? "This cycle is completed by staff attestation. This does not establish verified completion in RentVine, Gmail or Dotloop."
                : summary.nextActivity === "complete"
                  ? "The applicable manual checklist is ready for an explicit staff completion record."
                  : "Complete the applicable manual checklist and required outcome branch first."}
            </p>
            <Button
              data-renewal-next-control
              disabled={
                context.pending ||
                (!summary.complete && summary.nextActivity !== "complete")
              }
              onClick={() =>
                void context
                  .record({
                    kind: summary.complete ? "reopen" : "complete",
                    source: "Staff reviewed the current cycle checklist",
                  })
                  .catch(() => undefined)
              }
            >
              {summary.complete
                ? "Reopen recorded completion"
                : "Record staff completion"}
            </Button>
          </div>
          <h3>Source updates</h3>
          {Object.values(state.sourceUpdates).length ? (
            <ul>
              {Object.values(state.sourceUpdates).map((update) => (
                <li key={update.eventId}>
                  {SHEET_FIELD_LABELS[update.intent.field]}: {String(update.intent.value)}{" "}
                  :{" "}
                  {update.state === "verified"
                    ? "Read back after confirmed update"
                    : "Pending separate Sheet confirmation"}
                  {update.reason ? ` · ${update.reason}` : ""}.{" "}
                  <a href="#renewal-step-verify-renewal">Review Sheet updates</a>
                  {update.state !== "verified" ? (
                    <Button
                      variant="secondary"
                      disabled={context.pending}
                      onClick={() =>
                        void context.prepareSource(update.intent.field, update.eventId)
                      }
                    >
                      Prepare saved{" "}
                      {SHEET_FIELD_LABELS[update.intent.field].toLowerCase()} value
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>No source update recorded for this cycle.</p>
          )}
        </>
      ) : null}
    </Card>
  );
}
function ActivityForm({ activity }: { activity: ManualActivity }) {
  const context = useRenewalManualWorkspace()!,
    state = context.state!,
    definition = MANUAL_ACTIVITIES[activity],
    current = currentStaffActivity(state, activity),
    historical = state.activities[activity];
  const id = useId(),
    [outcome, setOutcome] = useState(current?.outcome ?? "not_started"),
    [source, setSource] = useState(current?.source ?? ""),
    [reason, setReason] = useState(current?.reason ?? ""),
    [applicabilityPolicy, setApplicabilityPolicy] = useState(
      current?.applicabilityPolicy ?? "",
    ),
    [policyReviewed, setPolicyReviewed] = useState(false),
    [occurredAt, setOccurredAt] = useState("");
  const isNext = manualRenewalSummary(state).nextActivity === activity;
  return (
    <details id={`renewal-manual-${activity}`} open={isNext || undefined}>
      <summary>
        {definition.label} :{" "}
        {current?.outcome.replaceAll("_", " ") ??
          (historical ? "Needs review after changed terms" : "Not recorded")}
      </summary>
      <div className="ui-stack">
        <Field htmlFor={`${id}-outcome`} label={`${definition.label} outcome`}>
          <select
            data-renewal-next-control
            id={`${id}-outcome`}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as typeof outcome)}
          >
            <option value="not_started">Not started</option>
            <option value="waiting">Waiting</option>
            <option value="done">Done: recorded by staff</option>
            {definition.conditional ? (
              <option value="not_applicable">Not applicable to this lease</option>
            ) : null}
          </select>
        </Field>
        <Field htmlFor={`${id}-source`} label="Source or channel">
          <input
            id={`${id}-source`}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
        </Field>
        <Field
          htmlFor={`${id}-reason`}
          label={
            outcome === "not_applicable"
              ? "Source-based reason this is not applicable"
              : "Comment (optional)"
          }
        >
          <input
            id={`${id}-reason`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {outcome === "not_applicable" ? (
          <>
            <Field
              htmlFor={`${id}-policy`}
              label="Existing approved policy or artifact predicate"
            >
              <input
                id={`${id}-policy`}
                value={applicabilityPolicy}
                maxLength={240}
                onChange={(event) => {
                  setApplicabilityPolicy(event.target.value);
                  setPolicyReviewed(false);
                }}
              />
            </Field>
            <label>
              <input
                type="checkbox"
                checked={policyReviewed}
                onChange={(event) => setPolicyReviewed(event.target.checked)}
              />
              I checked this lease against the cited existing approved rule and it permits
              Not applicable. I am recording that review, not granting an exception.
            </label>
            <p>
              If applicability or policy is unknown, keep this work Not started or
              Waiting. Required documents and signatures cannot be waived here; their
              artifact predicates remain in the packet review.
            </p>
          </>
        ) : null}
        <Field htmlFor={`${id}-when`} label="Actual occurrence time (optional)">
          <input
            type="datetime-local"
            id={`${id}-when`}
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </Field>
        <Button
          disabled={
            context.pending ||
            !source.trim() ||
            (outcome === "not_applicable" &&
              (!reason.trim() || !applicabilityPolicy.trim() || !policyReviewed))
          }
          onClick={() =>
            void context
              .record({
                kind: "activity",
                activity,
                outcome,
                source,
                ...(reason ? { reason } : {}),
                ...(outcome === "not_applicable" ? { applicabilityPolicy } : {}),
                ...(occurredAt ? { occurredAt: new Date(occurredAt).toISOString() } : {}),
              })
              .catch(() => undefined)
          }
        >
          Record {definition.label.toLowerCase()}
        </Button>
        {current ? (
          <p>
            Recorded {current.recordedAt} by {current.actorUid}. Source: {current.source}.
          </p>
        ) : null}
      </div>
    </details>
  );
}
function ResponseForm({ audience }: { audience: "owner" | "tenant" }) {
  const context = useRenewalManualWorkspace()!,
    state = context.state!,
    current = audience === "owner" ? state.ownerResponse : state.tenantResponse;
  const id = useId(),
    [outcome, setOutcome] = useState(
      current?.outcome ?? (audience === "owner" ? "no_response" : "awaiting_response"),
    ),
    [source, setSource] = useState(current?.source ?? ""),
    [rent, setRent] = useState(state.ownerResponse?.terms?.rent.toString() ?? ""),
    [effective, setEffective] = useState(state.ownerResponse?.terms?.effectiveDate ?? ""),
    [end, setEnd] = useState(state.ownerResponse?.terms?.endDate ?? "");
  const parsed = parseCurrencyInput(rent),
    approved = audience === "owner" && outcome === "approved_terms";
  const options =
    audience === "owner"
      ? [
          ["no_response", "No response"],
          ["approved_terms", "Explicit approval of exact terms"],
          ["revision_requested", "Revision requested"],
          ["declined_non_renewal", "Declined / non-renewal"],
        ]
      : [
          ["awaiting_response", "Awaiting response"],
          ["accepted", "Accepted current exact terms"],
          ["counter_change_requested", "Counter / change requested"],
          ["declined_nonrenewing", "Declined / not renewing"],
          ["needs_verification", "Needs verification"],
        ];
  const valid =
    !!source.trim() &&
    (!approved || (parsed.ok && parsed.value > 0 && !!effective && end > effective));
  async function save() {
    const action: RenewalWorkspaceAction =
      audience === "owner"
        ? {
            kind: "owner_response",
            outcome: outcome as
              | "approved_terms"
              | "revision_requested"
              | "declined_non_renewal"
              | "no_response",
            source,
            ...(approved && parsed.ok
              ? { terms: { rent: parsed.value, effectiveDate: effective, endDate: end } }
              : {}),
          }
        : {
            kind: "tenant_response",
            outcome: outcome as
              | "awaiting_response"
              | "accepted"
              | "counter_change_requested"
              | "declined_nonrenewing"
              | "needs_verification",
            source,
          };
    await context.record(action);
  }
  return (
    <div id={`renewal-manual-${audience}_response`} tabIndex={-1} className="ui-stack">
      <h3>
        {audience === "owner" ? "Owner response and exact terms" : "Tenant response"}
      </h3>
      <Field
        htmlFor={`${id}-outcome`}
        label={`${audience === "owner" ? "Owner" : "Tenant"} response`}
      >
        <select
          id={`${id}-outcome`}
          data-renewal-next-control
          value={outcome}
          onChange={(event) => setOutcome(event.target.value as typeof outcome)}
        >
          {options.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {approved ? (
        <>
          <Field htmlFor={`${id}-rent`} label="Exact owner-approved monthly base rent">
            <input
              id={`${id}-rent`}
              inputMode="decimal"
              value={rent}
              onChange={(event) => setRent(event.target.value)}
            />
          </Field>
          <Field htmlFor={`${id}-effective`} label="Approved effective date">
            <input
              id={`${id}-effective`}
              type="date"
              value={effective}
              onChange={(event) => setEffective(event.target.value)}
            />
          </Field>
          <Field htmlFor={`${id}-end`} label="Approved term end date">
            <input
              id={`${id}-end`}
              type="date"
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </Field>
        </>
      ) : null}
      <Field htmlFor={`${id}-source`} label="Response source or channel">
        <input
          id={`${id}-source`}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
      </Field>
      <Button
        disabled={context.pending || !valid}
        onClick={() => void save().catch(() => undefined)}
      >
        Record {audience} response
      </Button>
      {current ? (
        <p>
          Recorded {current.recordedAt} by {current.actorUid}.{" "}
          {current.termsRevision !== state.termsRevision
            ? "Needs review after changed terms."
            : ""}
        </p>
      ) : null}
    </div>
  );
}
