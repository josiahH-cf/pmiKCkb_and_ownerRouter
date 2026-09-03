// S82 — the canonical table-first Renewal Desk worklist. One semantic <table>, one row per loaded
// lease, with column-owned sort and filter controls, exact-value shortcuts, active-filter chips, a
// Clear filters control, and truthful zero states. Server component: every control is a GET link or
// GET form over the canonical `renewal-desk-query/v2` URL contract — no client state, no mutation.

import Link from "next/link";
import type { ReactNode } from "react";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import {
  RenewalDeskGetForm,
  RenewalDeskSubmitButton,
} from "@/components/lease-renewal/RenewalDeskGetForm";
import { Icon } from "@/components/ui/Icon";
import { can, type Role } from "@/lib/auth/roles";
import type {
  DeskLeaseAction,
  DeskLeaseRow,
  DeskGuidanceDestination,
} from "@/lib/lease-renewal/desk-model";
import {
  PARTY_FILTER_TOKEN_PATTERN,
  RENEWAL_DESK_V2_STEPS,
  buildActiveFilterChips,
  clearRenewalDeskFilters,
  hasActiveRenewalDeskFilters,
  serializeRenewalDeskQueryV2,
  withDateDimension,
  type RenewalDeskQueryV2State,
  type RenewalDeskDateDiagnostic,
  type RenewalDeskV2Sort,
  type RenewalOverallStatus,
  type RenewalRentVerificationState,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  buildDeskHref,
  buildWorkspaceHref,
  encodeDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import {
  ACCESS_RETURN_TEXT_SEARCH_NOTICE,
  accessReturnClearsTextSearch,
  buildRenewalDeskAccessReturn,
} from "@/lib/lease-renewal/access-return";
import {
  EXTERNAL_LINK_REL,
  EXTERNAL_LINK_TARGET,
} from "@/lib/lease-renewal/desk-destinations";
import { LEASE_TERM_LABELS, type LeaseTerm } from "@/lib/lease-renewal/lease-term";

export interface DeskPartyShortcuts {
  readonly available: boolean;
  /** Active-key token for one row party, from the server resolver; null renders plain text. */
  tokenFor(partyKind: "owner" | "tenant", normalizedLabel: string): string | null;
}

export interface DeskPartyFilterOption {
  readonly label: string;
  readonly token: string;
}

export interface DeskPartyFilterOptions {
  readonly owner: readonly DeskPartyFilterOption[];
  readonly tenant: readonly DeskPartyFilterOption[];
}

export const PARTY_FILTERING_UNAVAILABLE_NOTICE = "Party filtering is unavailable.";
export const UNFILTERED_EMPTY_COPY = "No renewals are in the current worklist.";
export const FILTERED_EMPTY_COPY = "No renewals match these filters.";

const OVERALL_STATUS_LABEL: Record<RenewalOverallStatus, string> = {
  needs_verification: "Needs verification",
  blocked: "Blocked",
  complete: "Complete",
  waiting: "Waiting",
  ready: "Ready",
  needs_review: "Needs review",
};

const OVERALL_STATUS_TONE: Record<RenewalOverallStatus, string> = {
  needs_verification: "caution",
  blocked: "error",
  complete: "verified",
  waiting: "caution",
  ready: "accent",
  needs_review: "neutral",
};

const RENT_VERIFICATION_LABEL: Record<RenewalRentVerificationState, string> = {
  verified: "Verified",
  needs_verification: "Needs verification",
  unavailable: "Unavailable",
};

const RENT_VERIFICATION_TONE: Record<RenewalRentVerificationState, string> = {
  verified: "verified",
  needs_verification: "caution",
  unavailable: "neutral",
};

const STATUS_GLYPH: Record<string, "check" | "warning" | "error" | "info"> = {
  verified: "check",
  accent: "info",
  caution: "warning",
  error: "error",
  neutral: "info",
};

const STEP_FILTER_LABELS: Record<(typeof RENEWAL_DESK_V2_STEPS)[number], string> = {
  "verify-renewal": "Verify renewal",
  "owner-decision": "Owner decision",
  "tenant-decision": "Tenant decision",
  "document-packet": "Document packet",
  "signatures-follow-up": "Signatures and follow-up",
  "compliance-close": "Compliance close",
  needs_verification: "Phase needs verification",
};

const SCOPE_LABELS: Record<RenewalDeskQueryV2State["scope"], string> = {
  active: "Current window and tracked incomplete",
  tracked: "Tracked incomplete outside the window",
  periodic_review: "Month-to-month periodic review due",
  all: "All loaded leases",
};

/** S103: attention-first term ordering for the header filter. */
const TERM_FILTER_ORDER: readonly LeaseTerm[] = [
  "needs_review",
  "month_to_month",
  "fixed_term",
];

const DATE_DIAGNOSTIC_MESSAGES: Record<RenewalDeskDateDiagnostic, string> = {
  end_date_malformed: "The exact renewal date was not valid and was not applied.",
  month_malformed: "The renewal month was not valid and was not applied.",
  range_incomplete: "Choose both a start and end date to apply a range.",
  range_malformed:
    "One or both range dates were not valid, so the range was not applied.",
  range_reversed: "The range end must be on or after the range start.",
  range_too_long: "Renewal date ranges can cover at most 120 days.",
};

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function href(state: RenewalDeskQueryV2State): string {
  return buildDeskHref(state);
}

/** Build stable, deduplicated choices from only rows in the current authorized projection. */
export function buildDeskPartyFilterOptions(
  rows: readonly DeskLeaseRow[],
  shortcuts: DeskPartyShortcuts,
): DeskPartyFilterOptions {
  const collect = (kind: "owner" | "tenant"): DeskPartyFilterOption[] => {
    if (!shortcuts.available) return [];
    const byToken = new Map<string, DeskPartyFilterOption>();
    for (const row of rows) {
      const labels = kind === "owner" ? row.ownerNameLabels : row.tenantNameLabels;
      const normalized =
        kind === "owner"
          ? row.queryKeys.normalizedOwners
          : row.queryKeys.normalizedTenants;
      labels.forEach((label, index) => {
        const token = shortcuts.tokenFor(kind, normalized[index] ?? "");
        if (!token || !PARTY_FILTER_TOKEN_PATTERN.test(token)) return;
        if (!byToken.has(token)) byToken.set(token, { label, token });
      });
    }
    return [...byToken.values()].sort((left, right) =>
      left.label.localeCompare(right.label, "en-US"),
    );
  };
  return { owner: collect("owner"), tenant: collect("tenant") };
}

function formStateKey(state: RenewalDeskQueryV2State): string {
  return serializeRenewalDeskQueryV2(state);
}

/** Hidden inputs preserving every nondefault key except the ones this form owns. */
function PreservedState({
  state,
  except,
}: Readonly<{ state: RenewalDeskQueryV2State; except: readonly string[] }>) {
  const canonical = serializeRenewalDeskQueryV2(state);
  const params = new URLSearchParams(canonical);
  const inputs: ReactNode[] = [];
  for (const [key, value] of params.entries()) {
    if (except.includes(key)) continue;
    inputs.push(<input key={key} name={key} type="hidden" value={value} />);
  }
  if (!params.has("v")) inputs.push(<input key="v" name="v" type="hidden" value="2" />);
  return <>{inputs}</>;
}

function SortHeader({
  column,
  label,
  state,
}: Readonly<{
  column: RenewalDeskV2Sort;
  label: string;
  state: RenewalDeskQueryV2State;
}>) {
  const active = state.sort === column;
  const nextDirection = active && state.direction === "asc" ? "desc" : "asc";
  const ariaSort = active
    ? state.direction === "asc"
      ? "ascending"
      : "descending"
    : undefined;
  return (
    <th aria-sort={ariaSort} scope="col">
      <RenewalDeskGetForm
        className="renewal-th-sort"
        pendingLabel={`Sorting renewals by ${label}.`}
        stateKey={formStateKey(state)}
      >
        <PreservedState except={["sort", "direction"]} state={state} />
        <input name="sort" type="hidden" value={column} />
        <input name="direction" type="hidden" value={nextDirection} />
        <RenewalDeskSubmitButton
          className="renewal-th-sort-button"
          pendingText="Sorting…"
        >
          <span>{label}</span>
          {active ? (
            <span
              aria-hidden="true"
              className="renewal-th-sort-direction"
              data-direction={state.direction}
            >
              <Icon name="chevron-right" size={14} />
            </span>
          ) : null}
          <span className="sr-only">
            {active
              ? state.direction === "asc"
                ? ", sorted ascending. Activate to reverse."
                : ", sorted descending. Activate to reverse."
              : ". Activate to sort."}
          </span>
        </RenewalDeskSubmitButton>
      </RenewalDeskGetForm>
    </th>
  );
}

function HeaderFilter({
  label,
  children,
  defaultOpen = false,
}: Readonly<{ label: string; children: ReactNode; defaultOpen?: boolean }>) {
  return (
    <details className="renewal-th-filter" open={defaultOpen || undefined}>
      <summary>{label}</summary>
      <div className="renewal-th-filter-panel">{children}</div>
    </details>
  );
}

function PartyHeaderFilter({
  kind,
  options,
  state,
}: Readonly<{
  kind: "owner" | "tenant";
  options: readonly DeskPartyFilterOption[];
  state: RenewalDeskQueryV2State;
}>) {
  const name = kind === "owner" ? "ownerKey" : "tenantKey";
  const selectedToken = state[name];
  const selectedAvailable =
    selectedToken === "" || options.some((option) => option.token === selectedToken);
  const label = kind === "owner" ? "Owner" : "Tenant";
  return (
    <HeaderFilter label={`Filter ${kind}`}>
      {!selectedAvailable ? (
        <p className="renewal-filter-validation" role="status">
          The selected {kind} is no longer available in this worklist. Choose another
          value or apply “All {kind}s.”
        </p>
      ) : null}
      <SelectFilter
        label={label}
        name={name}
        options={[
          { value: "", label: `All ${kind}s` },
          ...options.map((option) => ({ value: option.token, label: option.label })),
        ]}
        state={state}
        value={selectedAvailable ? selectedToken : ""}
      />
    </HeaderFilter>
  );
}

function RenewalDateFilters({ state }: Readonly<{ state: RenewalDeskQueryV2State }>) {
  const diagnostics = state.dateDiagnostics ?? [];
  const dateExcept = ["endDate", "month", "from", "through"] as const;
  const currentExact = state.endDate && state.endDate !== "missing" ? state.endDate : "";
  return (
    <HeaderFilter label="Filter renewal date" defaultOpen={diagnostics.length > 0}>
      {diagnostics.length > 0 ? (
        <div
          aria-label="Renewal date filter problems"
          className="renewal-filter-validation"
          role="alert"
        >
          <strong>The date filter was not fully applied:</strong>
          <ul>
            {diagnostics.map((diagnostic) => (
              <li key={diagnostic}>{DATE_DIAGNOSTIC_MESSAGES[diagnostic]}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <RenewalDeskGetForm
        className="renewal-th-filter-form"
        pendingLabel="Applying exact renewal date filter."
        stateKey={formStateKey(state)}
      >
        <PreservedState except={dateExcept} state={state} />
        <label className="field-label" htmlFor="renewal-filter-endDate">
          Exact date
        </label>
        <input
          className="ui-input"
          defaultValue={currentExact}
          id="renewal-filter-endDate"
          name="endDate"
          required
          type="date"
        />
        <RenewalDeskSubmitButton className="secondary-button" pendingText="Applying…">
          Apply exact date
        </RenewalDeskSubmitButton>
      </RenewalDeskGetForm>

      <RenewalDeskGetForm
        className="renewal-th-filter-form"
        pendingLabel="Filtering for leases with a missing renewal date."
        stateKey={formStateKey(state)}
      >
        <PreservedState except={dateExcept} state={state} />
        <input name="endDate" type="hidden" value="missing" />
        <RenewalDeskSubmitButton className="secondary-button" pendingText="Applying…">
          Show missing dates
        </RenewalDeskSubmitButton>
      </RenewalDeskGetForm>

      <RenewalDeskGetForm
        className="renewal-th-filter-form"
        pendingLabel="Applying renewal month filter."
        stateKey={formStateKey(state)}
      >
        <PreservedState except={dateExcept} state={state} />
        <label className="field-label" htmlFor="renewal-filter-month">
          Month
        </label>
        <input
          className="ui-input"
          defaultValue={state.month}
          id="renewal-filter-month"
          name="month"
          required
          type="month"
        />
        <RenewalDeskSubmitButton className="secondary-button" pendingText="Applying…">
          Apply month
        </RenewalDeskSubmitButton>
      </RenewalDeskGetForm>

      <RenewalDeskGetForm
        className="renewal-th-filter-form"
        pendingLabel="Applying renewal date range."
        stateKey={formStateKey(state)}
      >
        <PreservedState except={dateExcept} state={state} />
        <label className="field-label" htmlFor="renewal-filter-from">
          Range start
        </label>
        <input
          className="ui-input"
          defaultValue={state.from}
          id="renewal-filter-from"
          name="from"
          required
          type="date"
        />
        <label className="field-label" htmlFor="renewal-filter-through">
          Range end (at most 120 days)
        </label>
        <input
          className="ui-input"
          defaultValue={state.through}
          id="renewal-filter-through"
          name="through"
          required
          type="date"
        />
        <RenewalDeskSubmitButton className="secondary-button" pendingText="Applying…">
          Apply range
        </RenewalDeskSubmitButton>
      </RenewalDeskGetForm>

      <SelectFilter
        label="Lease term"
        name="term"
        options={[
          { value: "all", label: "All lease terms" },
          ...TERM_FILTER_ORDER.map((value) => ({
            value,
            label: LEASE_TERM_LABELS[value],
          })),
        ]}
        state={state}
        value={state.term}
      />
    </HeaderFilter>
  );
}

function SelectFilter({
  name,
  label,
  value,
  options,
  state,
}: Readonly<{
  name: keyof RenewalDeskQueryV2State & string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  state: RenewalDeskQueryV2State;
}>) {
  const id = `renewal-filter-${name}`;
  return (
    <RenewalDeskGetForm
      className="renewal-th-filter-form"
      pendingLabel={`Applying ${label.toLowerCase()} filter.`}
      stateKey={formStateKey(state)}
    >
      <PreservedState except={[name]} state={state} />
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select className="ui-input" defaultValue={value} id={id} name={name}>
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <RenewalDeskSubmitButton className="secondary-button" pendingText="Applying…">
        Apply
      </RenewalDeskSubmitButton>
    </RenewalDeskGetForm>
  );
}

function currentDestinationHref(
  destination: DeskGuidanceDestination,
  leaseId: string,
  deskView: string | null,
): string | null {
  if (destination.kind === "workspace_phase" && leaseId) {
    return buildWorkspaceHref({ leaseId, step: destination.stepId, deskView });
  }
  return null;
}

function ActionCell({
  row,
  role,
  deskView,
  state,
}: Readonly<{
  row: DeskLeaseRow;
  role: Role;
  deskView: string | null;
  state: RenewalDeskQueryV2State;
}>) {
  const { guidance } = row;
  const canOpenWorkspace = row.id !== "" && row.disposition !== "skip";
  const rendersCausalBlockers =
    guidance.blockers.length > 0 &&
    (guidance.action.kind === "blocked" || guidance.action.kind === "needs_verification");
  if (rendersCausalBlockers) {
    return (
      <ul className="renewal-blocker-list">
        {guidance.blockers.map((blocker) => {
          const lacksCapability = Boolean(
            blocker.requiredCapability && !can(role, blocker.requiredCapability),
          );
          const target = canOpenWorkspace
            ? currentDestinationHref(blocker.destination, row.id, deskView)
            : null;
          return (
            <li
              data-blocker-destination-kind={blocker.destination.kind}
              data-blocker-id={blocker.id}
              data-blocker-phase-id={blocker.phaseId ?? "none"}
              data-blocker-step-id={
                blocker.destination.kind === "workspace_phase"
                  ? blocker.destination.stepId
                  : "none"
              }
              data-blocker-type={blocker.type}
              data-required-capability={blocker.requiredCapability ?? "none"}
              key={blocker.id}
            >
              {lacksCapability && blocker.requiredCapability ? (
                <span className="renewal-action-cell">
                  <span>{blocker.label}</span>
                  <RequestAccessLink
                    returnTo={buildRenewalDeskAccessReturn(state)}
                    surface={
                      blocker.requiredCapability === "approve"
                        ? "renewal_desk.resolve_reconciliation"
                        : "renewal_desk.save_progress"
                    }
                  />
                  {accessReturnClearsTextSearch(state) ? (
                    <span className="muted">{ACCESS_RETURN_TEXT_SEARCH_NOTICE}</span>
                  ) : null}
                </span>
              ) : target ? (
                <Link className="text-link" href={target}>
                  {blocker.label}
                </Link>
              ) : (
                <span>{blocker.label}</span>
              )}
            </li>
          );
        })}
      </ul>
    );
  }
  const action: DeskLeaseAction = guidance.action;
  if (
    action.kind === "act" &&
    action.requiredCapability &&
    !can(role, action.requiredCapability)
  ) {
    return (
      <span className="renewal-action-cell">
        <span>{action.label}</span>
        {action.requiredCapability === "approve" ? (
          <RequestAccessLink
            returnTo={buildRenewalDeskAccessReturn(state)}
            surface="renewal_desk.resolve_reconciliation"
          />
        ) : (
          <RequestAccessLink
            returnTo={buildRenewalDeskAccessReturn(state)}
            surface="renewal_desk.save_progress"
          />
        )}
        {accessReturnClearsTextSearch(state) ? (
          <span className="muted">{ACCESS_RETURN_TEXT_SEARCH_NOTICE}</span>
        ) : null}
      </span>
    );
  }
  if (canOpenWorkspace && "destination" in action) {
    const target = currentDestinationHref(action.destination, row.id, deskView);
    if (target) {
      return (
        <Link className="text-link" href={target}>
          {action.label}
        </Link>
      );
    }
  }
  return <span>{"label" in action ? action.label : ""}</span>;
}

function StatusBadge({
  tone,
  children,
}: Readonly<{ tone: string; children: ReactNode }>) {
  return (
    <span className="renewal-status-badge" data-tone={tone}>
      <span aria-hidden="true">
        <Icon name={STATUS_GLYPH[tone] ?? "info"} size={14} />
      </span>
      <span>{children}</span>
    </span>
  );
}

function PartyCell({
  labels,
  normalized,
  kind,
  shortcuts,
  state,
}: Readonly<{
  labels: readonly string[];
  normalized: readonly string[];
  kind: "owner" | "tenant";
  shortcuts: DeskPartyShortcuts;
  state: RenewalDeskQueryV2State;
}>) {
  if (labels.length === 0) return <span>Needs Verification</span>;
  return (
    <ul className="renewal-party-list">
      {labels.map((label, index) => {
        const token = shortcuts.available
          ? shortcuts.tokenFor(kind, normalized[index] ?? "")
          : null;
        if (!token || !PARTY_FILTER_TOKEN_PATTERN.test(token)) {
          return <li key={`${label}-${index}`}>{label}</li>;
        }
        const key = kind === "owner" ? "ownerKey" : "tenantKey";
        return (
          <li key={`${label}-${index}`}>
            <Link
              className="text-link"
              href={href({ ...state, [key]: token })}
              title={`Show only this ${kind}'s leases`}
            >
              {label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function RenewalDeskTable({
  rows,
  totalLoaded,
  totalInScope,
  totalBeforeQuery,
  state,
  role,
  shortcuts,
  partyOptions,
  sourceReadOk,
  sourceReadComplete = sourceReadOk,
  dependentStateComplete = true,
}: Readonly<{
  rows: readonly DeskLeaseRow[];
  /** Preferred truthful count contract. */
  totalLoaded?: number;
  totalInScope?: number;
  /** @deprecated Compatibility input for callers migrating to totalLoaded. */
  totalBeforeQuery?: number;
  state: RenewalDeskQueryV2State;
  role: Role;
  shortcuts: DeskPartyShortcuts;
  /** Choices derived from the full current authorized projection, before filtering. */
  partyOptions?: DeskPartyFilterOptions;
  /** True only for a complete canonical source read; partial/failed reads cannot claim empty. */
  sourceReadOk: boolean;
  /** False labels every displayed count as partial even when cached rows remain usable. */
  sourceReadComplete?: boolean;
  /** False when filters/status depend on unavailable auxiliary reads; portfolio counts stay exact. */
  dependentStateComplete?: boolean;
}>) {
  const deskView = encodeDeskView(state);
  const chips = buildActiveFilterChips(state);
  const filtersActive = hasActiveRenewalDeskFilters(state);
  const clearedHref = href(clearRenewalDeskFilters(state));
  const loadedCount = totalLoaded ?? totalBeforeQuery ?? rows.length;
  const scopeCount = totalInScope ?? loadedCount;
  const availablePartyOptions =
    partyOptions ?? buildDeskPartyFilterOptions(rows, shortcuts);

  return (
    <section aria-label="Renewal worklist" className="ui-stack">
      <div className="renewal-table-toolbar">
        <span className="renewal-table-count" role="status">
          Matching: {rows.length} · Selected scope: {scopeCount} · Total loaded:{" "}
          {loadedCount}
          {sourceReadComplete ? "" : " (partial portfolio read)"}
        </span>
        <span
          className="renewal-scope-indicator"
          data-dependent-state-complete={dependentStateComplete ? "true" : "false"}
        >
          <strong>Dependent status:</strong>{" "}
          {dependentStateComplete
            ? "Current"
            : "Incomplete: refresh before relying on status filters"}
        </span>
        <span className="renewal-scope-indicator">
          <strong>Worklist scope:</strong> {SCOPE_LABELS[state.scope]}
        </span>
        {chips.length > 0 ? (
          <ul aria-label="Active filters" className="renewal-filter-chips">
            {chips.map((chip) => (
              <li key={chip.key}>
                <span className="renewal-filter-chip">
                  <span>{chip.label}</span>
                  <Link
                    aria-label={`Remove filter: ${chip.label}`}
                    className="renewal-filter-chip-remove"
                    href={href(chip.withoutFilter)}
                  >
                    <Icon label="" name="close" size={12} />
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {filtersActive ? (
          <Link className="secondary-button" href={clearedHref}>
            Clear filters
          </Link>
        ) : (
          <span aria-disabled="true" className="secondary-button is-disabled">
            Clear filters
          </span>
        )}
        {!shortcuts.available ? (
          <span className="muted">{PARTY_FILTERING_UNAVAILABLE_NOTICE}</span>
        ) : null}
      </div>

      <div
        className="renewal-table-scroll"
        role="region"
        aria-label="Renewal table"
        tabIndex={0}
      >
        <table className="renewal-table">
          <caption className="sr-only">
            Current renewal worklist: one row per lease with location, parties, renewal
            date, lease term, RentVine current base rent, overall status, rent
            verification, and the current action.
          </caption>
          <thead>
            <tr>
              <SortHeader column="lease" label="Lease / location" state={state} />
              <SortHeader column="owner" label="Owner" state={state} />
              <SortHeader column="tenant" label="Tenant" state={state} />
              <SortHeader column="end_date" label="Renewal date" state={state} />
              <SortHeader column="base_rent" label="Current base rent" state={state} />
              <SortHeader column="overall_status" label="Overall status" state={state} />
              <SortHeader
                column="rent_verification"
                label="Rent verification"
                state={state}
              />
              <SortHeader column="blocked" label="Action" state={state} />
            </tr>
            <tr className="renewal-th-filter-row">
              <th scope="col">
                <HeaderFilter label="Filter lease/location">
                  <RenewalDeskGetForm
                    className="renewal-th-filter-form"
                    pendingLabel="Applying lease or location filter."
                    stateKey={formStateKey(state)}
                  >
                    <PreservedState except={["lease"]} state={state} />
                    <label className="field-label" htmlFor="renewal-filter-lease">
                      Lease id, address, or property
                    </label>
                    <input
                      className="ui-input"
                      defaultValue={state.lease}
                      id="renewal-filter-lease"
                      maxLength={120}
                      name="lease"
                      type="text"
                    />
                    <RenewalDeskSubmitButton
                      className="secondary-button"
                      pendingText="Applying…"
                    >
                      Apply
                    </RenewalDeskSubmitButton>
                  </RenewalDeskGetForm>
                </HeaderFilter>
              </th>
              <th scope="col">
                {shortcuts.available ? (
                  <PartyHeaderFilter
                    kind="owner"
                    options={availablePartyOptions.owner}
                    state={state}
                  />
                ) : (
                  <span className="muted">{PARTY_FILTERING_UNAVAILABLE_NOTICE}</span>
                )}
              </th>
              <th scope="col">
                {shortcuts.available ? (
                  <PartyHeaderFilter
                    kind="tenant"
                    options={availablePartyOptions.tenant}
                    state={state}
                  />
                ) : (
                  <span className="muted">{PARTY_FILTERING_UNAVAILABLE_NOTICE}</span>
                )}
              </th>
              <th scope="col">
                <RenewalDateFilters state={state} />
              </th>
              <th scope="col">
                <span className="muted">RentVine source value</span>
              </th>
              <th scope="col">
                <HeaderFilter label="Filter status">
                  <SelectFilter
                    label="Overall status"
                    name="overallStatus"
                    options={[
                      { value: "all", label: "All statuses" },
                      ...Object.entries(OVERALL_STATUS_LABEL).map(([value, label]) => ({
                        value,
                        label,
                      })),
                    ]}
                    state={state}
                    value={state.overallStatus}
                  />
                  <SelectFilter
                    label="Workflow phase"
                    name="step"
                    options={[
                      { value: "", label: "All phases" },
                      ...RENEWAL_DESK_V2_STEPS.map((value) => ({
                        value,
                        label: STEP_FILTER_LABELS[value],
                      })),
                    ]}
                    state={state}
                    value={state.step}
                  />
                  <SelectFilter
                    label="Due state"
                    name="due"
                    options={[
                      { value: "all", label: "All due states" },
                      { value: "due", label: "Due now" },
                      { value: "not_due", label: "Not due" },
                      {
                        value: "needs_verification",
                        label: "Due state needs verification",
                      },
                      { value: "unset", label: "Timing policy unset" },
                      { value: "disabled", label: "Timing disabled" },
                      { value: "not_applicable", label: "Not applicable" },
                    ]}
                    state={state}
                    value={state.due}
                  />
                  <SelectFilter
                    label="Waiting on"
                    name="waiting"
                    options={[
                      { value: "all", label: "All waiting states" },
                      { value: "owner", label: "Owner" },
                      { value: "tenant", label: "Tenant" },
                      { value: "team", label: "PMI KC team" },
                      { value: "document_coordinator", label: "Document coordinator" },
                      { value: "unresolved_source", label: "Unresolved source" },
                      { value: "not_waiting", label: "Not waiting externally" },
                      { value: "needs_verification", label: "Needs verification" },
                    ]}
                    state={state}
                    value={state.waiting}
                  />
                  <SelectFilter
                    label="Source conflicts"
                    name="conflicts"
                    options={[
                      { value: "all", label: "All conflict states" },
                      { value: "with", label: "Has source conflicts" },
                      { value: "without", label: "No verified source conflicts" },
                    ]}
                    state={state}
                    value={state.conflicts}
                  />
                  <SelectFilter
                    label="Worklist scope"
                    name="scope"
                    options={[
                      { value: "active", label: "Current window and tracked incomplete" },
                      { value: "tracked", label: "Tracked incomplete outside window" },
                      {
                        value: "periodic_review",
                        label: "Month-to-month periodic review due",
                      },
                      { value: "all", label: "All loaded leases" },
                    ]}
                    state={state}
                    value={state.scope}
                  />
                </HeaderFilter>
              </th>
              <th scope="col">
                <HeaderFilter label="Filter verification">
                  <SelectFilter
                    label="Rent verification"
                    name="rentVerification"
                    options={[
                      { value: "all", label: "All verification states" },
                      { value: "verified", label: "Verified" },
                      { value: "needs_verification", label: "Needs verification" },
                      { value: "unavailable", label: "Unavailable" },
                    ]}
                    state={state}
                    value={state.rentVerification}
                  />
                </HeaderFilter>
              </th>
              <th scope="col">
                <HeaderFilter label="Filter blocked">
                  <SelectFilter
                    label="Blocked state"
                    name="blocked"
                    options={[
                      { value: "all", label: "All" },
                      { value: "blocked", label: "Blocked" },
                      { value: "not_blocked", label: "Not blocked" },
                    ]}
                    state={state}
                    value={state.blocked}
                  />
                </HeaderFilter>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="renewal-table-empty" colSpan={8}>
                  {!sourceReadOk
                    ? "The portfolio read did not complete, so this table cannot claim an empty worklist. Refresh to read again."
                    : loadedCount === 0
                      ? UNFILTERED_EMPTY_COPY
                      : !dependentStateComplete
                        ? "Supporting status did not complete, so these filters cannot claim there are no matching renewals. Clear filters or refresh to read again."
                        : filtersActive
                          ? FILTERED_EMPTY_COPY
                          : UNFILTERED_EMPTY_COPY}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <DeskRow
                  deskView={deskView}
                  key={row.id || row.identity.address?.sourceRef || row.addressLabel}
                  role={role}
                  row={row}
                  shortcuts={shortcuts}
                  state={state}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DeskRow({
  row,
  state,
  role,
  shortcuts,
  deskView,
}: Readonly<{
  row: DeskLeaseRow;
  state: RenewalDeskQueryV2State;
  role: Role;
  shortcuts: DeskPartyShortcuts;
  deskView: string | null;
}>) {
  const { guidance } = row;
  // Definitive cohort exclusions do not have a renewal workspace. Review and out-of-window rows do:
  // those are precisely the leases for which an operator may need to verify/correct source facts.
  // Keeping this predicate beside the rendered metadata lets browser assurance choose a destination
  // that the server loader can truthfully resolve without depending on live row order.
  const workspaceAvailable = row.id !== "" && row.disposition !== "skip";
  const workspaceHref = workspaceAvailable
    ? buildWorkspaceHref({ leaseId: row.id, deskView })
    : null;
  const rentVerificationHref = workspaceAvailable
    ? currentDestinationHref(guidance.rentVerification.destination, row.id, deskView)
    : null;
  const status = guidance.overallStatus;
  const actionDestination =
    "destination" in guidance.action
      ? guidance.action.destination
      : ({ kind: "none" } as const);
  const actionStepId =
    actionDestination.kind === "workspace_phase" ? actionDestination.stepId : "none";
  const actionRequiredCapability =
    "requiredCapability" in guidance.action
      ? (guidance.action.requiredCapability ?? "none")
      : "none";
  return (
    <tr
      data-action-kind={guidance.action.kind}
      data-blocker-count={String(guidance.blockers.length)}
      data-disposition={row.disposition}
      data-is-blocked={guidance.isBlocked ? "true" : "false"}
      data-lease-id={row.id}
      data-process-current-step={row.processState?.currentStepId ?? "none"}
      data-process-current-step-state={row.processState?.currentStepState ?? "none"}
      data-process-status={row.processState?.status ?? "none"}
      data-rent-verification={guidance.rentVerification.state}
      data-rent-verification-differs={
        guidance.rentVerification.verifiedByResolutionDiffers ? "true" : "false"
      }
      data-retention-state={row.retention.state}
      data-status={status}
      data-waiting-party={row.followUp?.waiting.party ?? "none"}
      data-workspace-available={workspaceAvailable ? "true" : "false"}
    >
      <th className="renewal-td-lease" scope="row">
        {workspaceHref ? (
          <Link className="renewal-lease-link" href={workspaceHref}>
            {row.addressLabel}
          </Link>
        ) : (
          <span>{row.addressLabel}</span>
        )}
        <span className="renewal-td-secondary">
          {row.propertyNameLabel ? `${row.propertyNameLabel} · ` : ""}
          Lease {row.id || "Needs Verification"}
        </span>
      </th>
      <td>
        <PartyCell
          kind="owner"
          labels={row.ownerNameLabels}
          normalized={row.queryKeys.normalizedOwners}
          shortcuts={shortcuts}
          state={state}
        />
      </td>
      <td>
        <PartyCell
          kind="tenant"
          labels={row.tenantNameLabels}
          normalized={row.queryKeys.normalizedTenants}
          shortcuts={shortcuts}
          state={state}
        />
      </td>
      <td>
        {row.endDateIso ? (
          <Link
            className="text-link"
            href={href(
              withDateDimension(state, { kind: "endDate", value: row.endDateIso }),
            )}
            title="Show only this renewal date"
          >
            {row.endDateIso}
          </Link>
        ) : (
          <Link
            className="text-link"
            href={href(withDateDimension(state, { kind: "endDate", value: "missing" }))}
            title="Show only leases with a missing renewal date"
          >
            Needs Verification
          </Link>
        )}
        <span
          className="renewal-td-secondary"
          data-renewal-field="lease-term"
          data-lease-term={row.leaseTerm.term}
        >
          <Link
            className="text-link"
            href={href({ ...state, term: row.leaseTerm.term })}
            title="Show only this lease term"
          >
            {LEASE_TERM_LABELS[row.leaseTerm.term]}
          </Link>
          {row.leaseTerm.term === "month_to_month"
            ? row.leaseTerm.nextReviewIso
              ? ` · review due ${row.leaseTerm.nextReviewIso}`
              : " · review date needs review"
            : ""}
        </span>
      </td>
      <td className="renewal-td-rent">
        {guidance.currentBaseRent !== null ? (
          rentVerificationHref ? (
            <Link className="text-link" href={rentVerificationHref}>
              {CURRENCY.format(guidance.currentBaseRent)}
            </Link>
          ) : (
            <span>{CURRENCY.format(guidance.currentBaseRent)}</span>
          )
        ) : rentVerificationHref ? (
          <Link className="text-link" href={rentVerificationHref}>
            Needs Verification
          </Link>
        ) : (
          <span>Needs Verification</span>
        )}
        {row.sourceDestinations?.rentvine ? (
          <a
            aria-label={`Open lease ${row.id} in RentVine in a new tab`}
            className="renewal-source-link"
            href={row.sourceDestinations.rentvine.href}
            rel={EXTERNAL_LINK_REL}
            target={EXTERNAL_LINK_TARGET}
            title={row.sourceDestinations.rentvine.label}
          >
            Open in RentVine ↗
          </a>
        ) : (
          <span className="renewal-td-secondary">RentVine</span>
        )}
      </td>
      <td data-renewal-field="overall-status" data-status={status}>
        <Link
          className="renewal-status-link"
          href={href({ ...state, overallStatus: status })}
          title="Show only this status"
        >
          <StatusBadge tone={OVERALL_STATUS_TONE[status]}>
            {OVERALL_STATUS_LABEL[status]}
          </StatusBadge>
        </Link>
        {row.stageLabel ? (
          <span className="renewal-td-secondary">{row.stageLabel}</span>
        ) : null}
      </td>
      <td
        data-renewal-field="rent-verification"
        data-rent-verification={guidance.rentVerification.state}
        data-rent-verification-differs={
          guidance.rentVerification.verifiedByResolutionDiffers ? "true" : "false"
        }
      >
        {rentVerificationHref ? (
          <Link className="renewal-status-link" href={rentVerificationHref}>
            <StatusBadge tone={RENT_VERIFICATION_TONE[guidance.rentVerification.state]}>
              {RENT_VERIFICATION_LABEL[guidance.rentVerification.state]}
            </StatusBadge>
          </Link>
        ) : (
          <StatusBadge tone={RENT_VERIFICATION_TONE[guidance.rentVerification.state]}>
            {RENT_VERIFICATION_LABEL[guidance.rentVerification.state]}
          </StatusBadge>
        )}
        {guidance.rentVerification.verifiedByResolutionDiffers ? (
          <span className="renewal-td-secondary">
            Verified by resolution · differs from RentVine
          </span>
        ) : null}
      </td>
      <td
        className="renewal-td-action"
        data-action-destination-kind={actionDestination.kind}
        data-action-kind={guidance.action.kind}
        data-action-required-capability={actionRequiredCapability}
        data-action-step-id={actionStepId}
        data-blocker-count={String(guidance.blockers.length)}
        data-renewal-field="action"
      >
        <ActionCell deskView={deskView} role={role} row={row} state={state} />
      </td>
    </tr>
  );
}
