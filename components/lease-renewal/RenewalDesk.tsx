// The Renewal Desk — the lease-renewal landing surface. S82: one sortable, filterable semantic
// table is the only worklist. Each lease appears once with location, authoritative parties,
// RentVine renewal date and current contractual base rent, overall status, rent verification, and
// every current actionable blocker. Source trust (Live chip, currency, partial-read notice) and the
// existing refresh action remain because they change whether the table can be trusted. Server
// component; every control navigates one canonical GET URL.

import Link from "next/link";

import { RenewalDeskRefresh } from "@/components/lease-renewal/RenewalDeskRefresh";
import {
  RenewalDeskTable,
  type DeskPartyShortcuts,
} from "@/components/lease-renewal/RenewalDeskTable";
import { Card, ModeChip, PageHeader } from "@/components/ui";
import type { Role } from "@/lib/auth/roles";
import {
  LEASE_EXPORT_MAX_AGE_MS,
  LEASE_EXPORT_TTL_MS,
} from "@/lib/lease-renewal/live-lease-cache";
import type { DeskDataCurrency, RenewalDeskView } from "@/lib/lease-renewal/desk-model";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  applyRenewalDeskQueryV2,
  type PartyTokenMatcher,
  type RenewalDeskQueryV2State,
} from "@/lib/lease-renewal/desk-query-v2";

export interface DeskPartyFilterAccess extends DeskPartyShortcuts {
  matches: PartyTokenMatcher;
}

const NO_PARTY_ACCESS: DeskPartyFilterAccess = {
  available: false,
  tokenFor: () => null,
  matches: () => false,
};

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
  query = { ...DEFAULT_RENEWAL_DESK_QUERY_V2 },
  role = "Editor",
  partyFilters = NO_PARTY_ACCESS,
}: Readonly<{
  view: RenewalDeskView;
  liveReviewHref?: string;
  query?: RenewalDeskQueryV2State;
  role?: Role;
  partyFilters?: DeskPartyFilterAccess;
}>) {
  const { summary } = view.cohort;
  const result = applyRenewalDeskQueryV2(view.items, query, partyFilters.matches);

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

      <RenewalDeskTable
        role={role}
        rows={result.items}
        shortcuts={partyFilters}
        sourceReadOk={view.readComplete && !view.dataCurrency.lastError}
        state={query}
        totalBeforeQuery={result.totalBeforeQuery}
      />
    </div>
  );
}
