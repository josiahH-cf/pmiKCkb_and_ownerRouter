// The Renewal Desk — the lease-renewal landing surface. Shows the operator their renewal workload by
// disposition (actionable / needs review / skipped / out of window) and walks each actionable lease
// toward the per-lease workspace. Server component (no client state; collapsibles are native <details>).
//
// One component of a multi-process app — it composes the shared components/ui primitives and demotes
// the plumbing (raw run, classification counts) into a quiet "Data diagnostics" disclosure.

import Link from "next/link";
import type { ReactNode } from "react";

import { RenewalAuthorityPanel } from "@/components/lease-renewal/RenewalAuthorityPanel";
import { RenewalDeskRefresh } from "@/components/lease-renewal/RenewalDeskRefresh";
import { RenewalFollowUpStatus } from "@/components/lease-renewal/RenewalFollowUpStatus";
import {
  Card,
  Disclosure,
  EmptyState,
  Metric,
  ModeChip,
  PageHeader,
  StatusPill,
  Stepper,
} from "@/components/ui";
import {
  buildOrderedRenewalAttention,
  type AttentionItem,
} from "@/lib/lease-renewal/attention";
import type { Role } from "@/lib/auth/roles";
import {
  LEASE_EXPORT_MAX_AGE_MS,
  LEASE_EXPORT_TTL_MS,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  RENEWAL_STEPS,
  type DeskDataCurrency,
  type DeskLeaseSummary,
  type RenewalDeskView,
} from "@/lib/lease-renewal/desk-model";
import {
  DEFAULT_RENEWAL_DESK_QUERY,
  RENEWAL_DESK_DUE_STATES,
  RENEWAL_DESK_WAITING_STATES,
  applyRenewalDeskQuery,
  buildRenewalDeskFilterOptions,
  serializeRenewalDeskQuery,
  type RenewalDeskQueryState,
} from "@/lib/lease-renewal/desk-query";

function leaseHrefFor(id: string): string {
  return `/lease-renewal/live/desk/lease/${encodeURIComponent(id)}`;
}

/** Age copy from the snapshot timestamp (never render time). */
export function formatSnapshotAge(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 90) return seconds === 1 ? "1 second" : `${seconds} seconds`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/**
 * S58: exactly ONE of the four currency states renders at all times, in precedence order:
 * too-old-to-act, refreshing, could-not-refresh, updated-with-age.
 */
function DataCurrencyBanner({ currency }: Readonly<{ currency: DeskDataCurrency }>) {
  const age = formatSnapshotAge(currency.ageMs);
  const maxMinutes = Math.round(LEASE_EXPORT_MAX_AGE_MS / 60_000);
  if (currency.state === "expired") {
    return (
      <Card>
        <div role="status">
          <h2 className="ui-card-title">Data too old to act on</h2>
          <p className="muted">
            This lease data is {age} old, past the {maxMinutes}-minute limit. Composing
            and recording are paused until a refresh completes. You can still look at the
            list.
          </p>
        </div>
      </Card>
    );
  }
  if (currency.refreshing) {
    return (
      <p className="muted" role="status">
        Refreshing lease data. Showing data from {age} ago while the new read completes.
      </p>
    );
  }
  if (currency.lastError) {
    return (
      <p className="muted" role="status">
        Last updated {age} ago. The latest refresh did not complete; the app will retry.
      </p>
    );
  }
  return (
    <p className="muted" role="status">
      Updated {age} ago.
    </p>
  );
}

export function RenewalDesk({
  view,
  liveReviewHref,
  role = "Editor",
  query = DEFAULT_RENEWAL_DESK_QUERY,
}: Readonly<{
  view: RenewalDeskView;
  liveReviewHref?: string;
  role?: Role;
  query?: RenewalDeskQueryState;
}>) {
  const { summary } = view.cohort;
  const result = applyRenewalDeskQuery(view.items, query);
  const options = buildRenewalDeskFilterOptions(view.items);
  const attention = buildOrderedRenewalAttention(result.items, leaseHrefFor);

  return (
    <div className="ui-stack">
      <PageHeader
        actions={
          <>
            <ModeChip tone="live">Live data</ModeChip>
            <RenewalDeskRefresh
              readAtMs={Date.parse(view.dataCurrency.readAtIso)}
              ttlMs={LEASE_EXPORT_TTL_MS}
            />
            {liveReviewHref ? (
              <Link className="text-link" href={liveReviewHref}>
                View live review →
              </Link>
            ) : null}
          </>
        }
        subtitle={
          view.readComplete
            ? `${summary.total} leases in your current renewal window`
            : `${summary.total} leases loaded so far (partial read)`
        }
        title="Renewals"
      />

      <RenewalAuthorityPanel role={role} />

      <DataCurrencyBanner currency={view.dataCurrency} />

      {view.readComplete ? null : (
        <Card>
          <div role="status">
            <h2 className="ui-card-title">Live read incomplete</h2>
            <p className="muted">
              The lease read stopped before it reached the whole portfolio, so this page
              shows a partial list. Some leases are missing. Reload to read again, and if
              this notice stays, check the RentVine connection.
            </p>
          </div>
        </Card>
      )}

      <DeskControls options={options} query={query} />

      {attention.length > 0 ? (
        <section aria-label="Needs your attention" className="ui-stack">
          <h2 className="section-subtitle">Needs your attention</h2>
          {attention.map((item) => (
            <AttentionCard item={item} key={item.dedupeKey ?? item.leaseId} />
          ))}
        </section>
      ) : null}

      <div className="ui-metric-grid">
        <Metric label="Visible" value={result.totalAfterQuery} />
        <Metric label="Actionable" value={summary.actionable} />
        <Metric label="Needs review" value={summary.needsReview} />
        <Metric label="Skipped" value={summary.skipped} />
        <Metric label="Out of window" value={summary.outOfWindow} />
      </div>

      <section aria-label="Renewal worklist" className="ui-stack">
        <div className="ui-spread">
          <h2 className="section-subtitle">Renewal worklist</h2>
          <span className="muted" role="status">
            Showing {result.totalAfterQuery} of {result.totalBeforeQuery} leases
          </span>
        </div>
        {result.items.length === 0 ? (
          <EmptyState
            action={
              <Link className="secondary-button" href="/lease-renewal/live/desk">
                Clear all controls
              </Link>
            }
            description="No source-backed lease matches this URL view. Clear one or more controls to restore the worklist."
            title="No matching renewals"
          />
        ) : (
          <ol className="renewal-worklist">
            {result.items.map((lease) => (
              <li key={lease.id || lease.identity.address?.sourceRef}>
                <RenewalWorklistCard
                  href={lease.id ? leaseHrefFor(lease.id) : null}
                  lease={lease}
                />
              </li>
            ))}
          </ol>
        )}
      </section>

      <Disclosure summary="Data diagnostics">
        <p className="muted">
          Live RentVine and Sheet read. {summary.total} leases classified
          {view.readComplete ? "" : " from an incomplete read"}.
        </p>
        <p>
          <Link className="text-link" href="/processes/lease-renewal">
            View process definition
          </Link>
        </p>
      </Disclosure>
    </div>
  );
}

type FilterOptions = ReturnType<typeof buildRenewalDeskFilterOptions>;

const SORT_LABELS: Record<RenewalDeskQueryState["sort"], string> = {
  due: "Due state and date",
  end_date: "Lease end date",
  month: "Lease end month",
  owner: "Owner",
  tenant: "Tenant",
  workflow_step: "Workflow step",
  waiting_on: "Waiting on",
  conflicts: "Source conflicts",
};

const DUE_LABELS: Record<RenewalDeskQueryState["due"], string> = {
  all: "All due states",
  due: "Due now",
  not_due: "Not due",
  needs_verification: "Due state needs verification",
  unset: "Timing policy unset",
  disabled: "Timing disabled",
  not_applicable: "Not applicable",
};

const WAITING_LABELS: Record<RenewalDeskQueryState["waiting"], string> = {
  all: "All waiting states",
  owner: "Owner",
  tenant: "Tenant",
  team: "PMI KC team",
  document_coordinator: "Document coordinator",
  unresolved_source: "Unresolved source",
  not_waiting: "Not waiting externally",
  needs_verification: "Needs Verification",
};

function queryHref(query: RenewalDeskQueryState): string {
  const encoded = serializeRenewalDeskQuery(query);
  return encoded ? `/lease-renewal/live/desk?${encoded}` : "/lease-renewal/live/desk";
}

function DeskControls({
  query,
  options,
}: Readonly<{ query: RenewalDeskQueryState; options: FilterOptions }>) {
  return (
    <Card>
      <form
        action="/lease-renewal/live/desk"
        aria-label="Renewal worklist controls"
        className="renewal-desk-controls"
        method="get"
      >
        <div className="renewal-desk-control renewal-desk-search">
          <label className="field-label" htmlFor="renewal-desk-search">
            Search renewals
          </label>
          <input
            className="ui-input"
            defaultValue={query.q}
            id="renewal-desk-search"
            maxLength={120}
            name="q"
            placeholder="Tenant, owner, address, property, or exact lease ID"
            type="search"
          />
        </div>

        <DeskSelect
          id="renewal-desk-sort"
          label="Sort renewals"
          name="sort"
          value={query.sort}
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </DeskSelect>
        <DeskSelect
          id="renewal-desk-direction"
          label="Sort direction"
          name="direction"
          value={query.direction}
        >
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </DeskSelect>
        <DeskSelect
          id="renewal-desk-scope"
          label="Worklist scope"
          name="scope"
          value={query.scope}
        >
          <option value="active">Current window and tracked incomplete</option>
          <option value="tracked">Tracked incomplete outside window</option>
          <option value="all">All loaded leases</option>
        </DeskSelect>
        <DeskSelect
          id="renewal-desk-end-date"
          label="End date filter"
          name="endDate"
          value={query.endDate}
        >
          <option value="">All end dates</option>
          <option value="missing">Missing end date</option>
          {query.endDate &&
          query.endDate !== "missing" &&
          !options.endDates.includes(query.endDate) ? (
            <option value={query.endDate}>{query.endDate} (not in current read)</option>
          ) : null}
          {options.endDates.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </DeskSelect>
        <DeskSelect
          id="renewal-desk-month"
          label="End month filter"
          name="month"
          value={query.month}
        >
          <option value="">All end months</option>
          {query.month && !options.months.includes(query.month) ? (
            <option value={query.month}>{query.month} (not in current read)</option>
          ) : null}
          {options.months.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </DeskSelect>
        <DeskSelect
          id="renewal-desk-due"
          label="Due state filter"
          name="due"
          value={query.due}
        >
          {["all", ...RENEWAL_DESK_DUE_STATES].map((value) => (
            <option key={value} value={value}>
              {DUE_LABELS[value as RenewalDeskQueryState["due"]]}
            </option>
          ))}
        </DeskSelect>
        <DeskSelect
          id="renewal-desk-owner"
          label="Owner filter"
          name="owner"
          value={query.owner}
        >
          <option value="">All verified owners</option>
          {query.owner && !options.owners.includes(query.owner) ? (
            <option value={query.owner}>{query.owner} (not in current read)</option>
          ) : null}
          {options.owners.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </DeskSelect>
        <DeskSelect
          id="renewal-desk-tenant"
          label="Tenant filter"
          name="tenant"
          value={query.tenant}
        >
          <option value="">All verified tenants</option>
          {query.tenant && !options.tenants.includes(query.tenant) ? (
            <option value={query.tenant}>{query.tenant} (not in current read)</option>
          ) : null}
          {options.tenants.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </DeskSelect>
        <DeskSelect
          id="renewal-desk-step"
          label="Workflow step filter"
          name="step"
          value={query.step}
        >
          <option value="">All workflow steps</option>
          <option value="needs_verification">Step needs verification</option>
          {query.step &&
          query.step !== "needs_verification" &&
          !options.steps.some((option) => option.value === query.step) ? (
            <option value={query.step}>{query.step} (not in current read)</option>
          ) : null}
          {options.steps.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </DeskSelect>
        <DeskSelect
          id="renewal-desk-waiting"
          label="Waiting on filter"
          name="waiting"
          value={query.waiting}
        >
          {["all", ...RENEWAL_DESK_WAITING_STATES].map((value) => (
            <option key={value} value={value}>
              {WAITING_LABELS[value as RenewalDeskQueryState["waiting"]]}
            </option>
          ))}
        </DeskSelect>
        <DeskSelect
          id="renewal-desk-conflicts"
          label="Source conflict filter"
          name="conflicts"
          value={query.conflicts}
        >
          <option value="all">All conflict states</option>
          <option value="with">Has source conflicts</option>
          <option value="without">No verified source conflicts</option>
        </DeskSelect>

        <div className="renewal-desk-control-actions">
          <button className="primary-button" type="submit">
            Apply view
          </button>
          {query.q ? (
            <Link className="secondary-button" href={queryHref({ ...query, q: "" })}>
              Clear search
            </Link>
          ) : null}
          <Link className="text-link" href="/lease-renewal/live/desk">
            Reset all controls
          </Link>
        </div>
      </form>
    </Card>
  );
}

function DeskSelect({
  id,
  label,
  name,
  value,
  children,
}: Readonly<{
  id: string;
  label: string;
  name: string;
  value: string;
  children: ReactNode;
}>) {
  return (
    <div className="renewal-desk-control">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select className="ui-input" defaultValue={value} id={id} name={name}>
        {children}
      </select>
    </div>
  );
}

function AttentionCard({ item }: Readonly<{ item: AttentionItem }>) {
  return (
    <Card>
      <div className="ui-spread">
        <div>
          <h3 className="ui-card-title">{item.addressLabel}</h3>
          <p className="muted">{item.headline}</p>
        </div>
        <Link className="primary-button" href={item.href}>
          {item.actionLabel}
        </Link>
      </div>
    </Card>
  );
}

function RenewalWorklistCard({
  lease,
  href,
}: Readonly<{ lease: DeskLeaseSummary; href: string | null }>) {
  const tenants =
    lease.tenantNameLabels.length > 0
      ? lease.tenantNameLabels.join(", ")
      : "Needs Verification";
  const owners =
    lease.ownerNameLabels.length > 0
      ? lease.ownerNameLabels.join(", ")
      : "Needs Verification";
  const nextAction =
    lease.openConflicts > 0
      ? "Resolve the exact source conflicts before continuing."
      : lease.followUp?.due.state === "due"
        ? lease.followUp.nextAction
        : (lease.nextAction ??
          "Review this lease’s cohort reason before recording renewal work.");

  return (
    <Card className="renewal-worklist-card">
      <div className="ui-stack">
        <div className="ui-spread">
          <h3 className="ui-card-title">{lease.addressLabel}</h3>
          <div className="ui-row">
            {lease.openConflicts > 0 ? (
              <StatusPill value="Action Required">
                {lease.openConflicts} source conflict
                {lease.openConflicts === 1 ? "" : "s"}
              </StatusPill>
            ) : null}
            <span className="ui-tag">{lease.reasonLabel}</span>
            {lease.retention.state === "tracked_incomplete" ? (
              <StatusPill value="Action Required">Tracked incomplete</StatusPill>
            ) : null}
          </div>
        </div>

        <dl className="renewal-fact-grid">
          <div>
            <dt>Lease ID</dt>
            <dd>{lease.id || "Needs Verification"}</dd>
          </div>
          <div>
            <dt>Property</dt>
            <dd>{lease.propertyNameLabel ?? "Needs Verification"}</dd>
          </div>
          <div>
            <dt>Tenant</dt>
            <dd>{tenants}</dd>
          </div>
          <div>
            <dt>Owner</dt>
            <dd>{owners}</dd>
          </div>
          <div>
            <dt>Lease end</dt>
            <dd>{lease.endDateIso ?? "Needs Verification"}</dd>
          </div>
          <div>
            <dt>Current step</dt>
            <dd>
              {lease.stageLabel && lease.processVersion
                ? lease.stageLabel + " · " + lease.processVersion
                : "Needs Verification"}
            </dd>
          </div>
        </dl>

        <p className="muted renewal-retention-reason">{lease.retention.label}</p>
        {lease.stageIndex >= 0 ? (
          <Stepper currentIndex={lease.stageIndex} steps={RENEWAL_STEPS} />
        ) : null}
        {lease.followUp ? (
          <RenewalFollowUpStatus compact projection={lease.followUp} />
        ) : (
          <p className="muted">
            Waiting, last-contact, and due state: Needs Verification
          </p>
        )}
        <div className="ui-spread">
          <span className="muted">Next: {nextAction}</span>
          {href ? (
            <Link
              aria-label={"Open lease " + lease.id}
              className="secondary-button"
              href={href}
            >
              Open
            </Link>
          ) : (
            <span className="muted">
              Resolve the lease ID before opening a workspace.
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
