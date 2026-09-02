// S82 — the canonical table-first Renewal Desk worklist. One semantic <table>, one row per loaded
// lease, with column-owned sort and filter controls, exact-value shortcuts, active-filter chips, a
// Clear filters control, and truthful zero states. Server component: every control is a GET link or
// GET form over the canonical `renewal-desk-query/v2` URL contract — no client state, no mutation.

import Link from "next/link";
import type { ReactNode } from "react";

import { RequestAccessLink } from "@/components/admin/RequestAccessLink";
import { Icon } from "@/components/ui/Icon";
import { can, type Role } from "@/lib/auth/roles";
import type {
  DeskLeaseAction,
  DeskLeaseRow,
  DeskGuidanceDestination,
} from "@/lib/lease-renewal/desk-model";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  RENEWAL_DESK_V2_STEPS,
  buildActiveFilterChips,
  clearRenewalDeskFilters,
  hasActiveRenewalDeskFilters,
  serializeRenewalDeskQueryV2,
  withDateDimension,
  type RenewalDeskQueryV2State,
  type RenewalDeskV2Sort,
  type RenewalOverallStatus,
  type RenewalRentVerificationState,
} from "@/lib/lease-renewal/desk-query-v2";
import {
  RENEWAL_DESK_ROUTE,
  buildDeskHref,
  buildWorkspaceHref,
  encodeDeskView,
} from "@/lib/lease-renewal/desk-view-continuation";
import {
  ACCESS_RETURN_TEXT_SEARCH_NOTICE,
  accessReturnClearsTextSearch,
} from "@/lib/lease-renewal/access-return";

export interface DeskPartyShortcuts {
  readonly available: boolean;
  /** Active-key token for one row party, from the server resolver; null renders plain text. */
  tokenFor(partyKind: "owner" | "tenant", normalizedLabel: string): string | null;
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

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function href(state: RenewalDeskQueryV2State): string {
  return buildDeskHref(state);
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
      <form action={RENEWAL_DESK_ROUTE} className="renewal-th-sort" method="get">
        <PreservedState except={["sort", "direction"]} state={state} />
        <input name="sort" type="hidden" value={column} />
        <input name="direction" type="hidden" value={nextDirection} />
        <button className="renewal-th-sort-button" type="submit">
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
        </button>
      </form>
    </th>
  );
}

function HeaderFilter({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <details className="renewal-th-filter">
      <summary>{label}</summary>
      <div className="renewal-th-filter-panel">{children}</div>
    </details>
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
    <form action={RENEWAL_DESK_ROUTE} className="renewal-th-filter-form" method="get">
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
      <button className="secondary-button" type="submit">
        Apply
      </button>
    </form>
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
  if (guidance.action.kind === "blocked") {
    return (
      <ul className="renewal-blocker-list">
        {guidance.blockers.map((blocker) => {
          const target = currentDestinationHref(blocker.destination, row.id, deskView);
          return (
            <li key={blocker.id}>
              {target ? (
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
          <RequestAccessLink surface="renewal_desk.resolve_reconciliation" />
        ) : (
          <RequestAccessLink surface="renewal_desk.save_progress" />
        )}
        {accessReturnClearsTextSearch(state) ? (
          <span className="muted">{ACCESS_RETURN_TEXT_SEARCH_NOTICE}</span>
        ) : null}
      </span>
    );
  }
  const target =
    "destination" in action
      ? currentDestinationHref(action.destination, row.id, deskView)
      : null;
  if (target) {
    return (
      <Link className="text-link" href={target}>
        {action.label}
      </Link>
    );
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
        if (!token) {
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
  totalBeforeQuery,
  state,
  role,
  shortcuts,
  sourceReadOk,
}: Readonly<{
  rows: readonly DeskLeaseRow[];
  totalBeforeQuery: number;
  state: RenewalDeskQueryV2State;
  role: Role;
  shortcuts: DeskPartyShortcuts;
  /** True only for a complete canonical source read; partial/failed reads cannot claim empty. */
  sourceReadOk: boolean;
}>) {
  const deskView = encodeDeskView(state);
  const chips = buildActiveFilterChips(state);
  const filtersActive = hasActiveRenewalDeskFilters(state);
  const clearedHref = href(clearRenewalDeskFilters(state));

  return (
    <section aria-label="Renewal worklist" className="ui-stack">
      <div className="renewal-table-toolbar">
        <span className="renewal-table-count" role="status">
          Showing {rows.length} of {totalBeforeQuery} renewals
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
            date, RentVine current base rent, overall status, rent verification, and the
            current action.
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
                  <form
                    action={RENEWAL_DESK_ROUTE}
                    className="renewal-th-filter-form"
                    method="get"
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
                    <button className="secondary-button" type="submit">
                      Apply
                    </button>
                  </form>
                </HeaderFilter>
              </th>
              <th scope="col">
                {shortcuts.available ? (
                  <span className="muted">Click an owner value to filter.</span>
                ) : (
                  <span className="muted">{PARTY_FILTERING_UNAVAILABLE_NOTICE}</span>
                )}
              </th>
              <th scope="col">
                {shortcuts.available ? (
                  <span className="muted">Click a tenant value to filter.</span>
                ) : (
                  <span className="muted">{PARTY_FILTERING_UNAVAILABLE_NOTICE}</span>
                )}
              </th>
              <th scope="col">
                <HeaderFilter label="Filter renewal date">
                  <form
                    action={RENEWAL_DESK_ROUTE}
                    className="renewal-th-filter-form"
                    method="get"
                  >
                    <PreservedState
                      except={["endDate", "month", "from", "through"]}
                      state={state}
                    />
                    <label className="field-label" htmlFor="renewal-filter-endDate">
                      Exact date (YYYY-MM-DD) or `missing`
                    </label>
                    <input
                      className="ui-input"
                      defaultValue={state.endDate}
                      id="renewal-filter-endDate"
                      maxLength={10}
                      name="endDate"
                      type="text"
                    />
                    <label className="field-label" htmlFor="renewal-filter-month">
                      Month (YYYY-MM)
                    </label>
                    <input
                      className="ui-input"
                      defaultValue={state.month}
                      id="renewal-filter-month"
                      maxLength={7}
                      name="month"
                      type="text"
                    />
                    <label className="field-label" htmlFor="renewal-filter-from">
                      Range from (YYYY-MM-DD)
                    </label>
                    <input
                      className="ui-input"
                      defaultValue={state.from}
                      id="renewal-filter-from"
                      maxLength={10}
                      name="from"
                      type="text"
                    />
                    <label className="field-label" htmlFor="renewal-filter-through">
                      Range through (at most 120 days)
                    </label>
                    <input
                      className="ui-input"
                      defaultValue={state.through}
                      id="renewal-filter-through"
                      maxLength={10}
                      name="through"
                      type="text"
                    />
                    <button className="secondary-button" type="submit">
                      Apply
                    </button>
                  </form>
                </HeaderFilter>
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
                    ? "The source read did not complete, so this table cannot claim an empty worklist. Refresh to read again."
                    : totalBeforeQuery === 0
                      ? UNFILTERED_EMPTY_COPY
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
  const workspaceHref = row.id ? buildWorkspaceHref({ leaseId: row.id, deskView }) : null;
  const rentVerificationHref = row.id
    ? currentDestinationHref(guidance.rentVerification.destination, row.id, deskView)
    : null;
  const status = guidance.overallStatus;
  return (
    <tr data-status={status}>
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
        <span className="renewal-td-secondary">RentVine</span>
      </td>
      <td>
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
      <td>
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
      <td className="renewal-td-action">
        <ActionCell deskView={deskView} role={role} row={row} state={state} />
      </td>
    </tr>
  );
}
