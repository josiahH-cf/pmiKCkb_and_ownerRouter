// The Renewal Desk — the lease-renewal landing surface. Shows the operator their renewal workload by
// disposition (actionable / needs review / skipped / out of window) and walks each actionable lease
// toward the per-lease workspace. Server component (no client state; collapsibles are native <details>).
//
// One component of a multi-process app — it composes the shared components/ui primitives and demotes
// the plumbing (raw run, classification counts) into a quiet "Data diagnostics" disclosure.

import Link from "next/link";

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
import { buildRenewalAttention, type AttentionItem } from "@/lib/lease-renewal/attention";
import {
  RENEWAL_STEPS,
  type DeskLeaseSummary,
  type RenewalDeskView,
} from "@/lib/lease-renewal/desk-model";

function leaseHrefFor(id: string): string {
  return `/lease-renewal/live/desk/lease/${id}`;
}

export function RenewalDesk({
  view,
  liveReviewHref,
}: Readonly<{ view: RenewalDeskView; liveReviewHref?: string }>) {
  const { summary } = view.cohort;
  const attention = buildRenewalAttention(view.actionable, leaseHrefFor);

  return (
    <div className="ui-stack">
      <PageHeader
        actions={
          <>
            <ModeChip tone="live">Live data</ModeChip>
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

      {attention.length > 0 ? (
        <section aria-label="Needs your attention" className="ui-stack">
          <h2 className="section-subtitle">Needs your attention</h2>
          {attention.map((item) => (
            <AttentionCard item={item} key={item.leaseId} />
          ))}
        </section>
      ) : null}

      <div className="ui-metric-grid">
        <Metric label="Actionable" value={summary.actionable} />
        <Metric label="Needs review" value={summary.needsReview} />
        <Metric label="Skipped" value={summary.skipped} />
        <Metric label="Out of window" value={summary.outOfWindow} />
      </div>

      <section aria-label="Actionable renewals" className="ui-stack">
        <h2 className="section-subtitle">Your queue</h2>
        {view.actionable.length === 0 ? (
          <EmptyState
            description="No actionable renewals in this window."
            title="Nothing to work right now"
          />
        ) : (
          view.actionable.map((lease) => (
            <ActionableLeaseCard
              href={leaseHrefFor(lease.id)}
              key={lease.id}
              lease={lease}
            />
          ))
        )}
      </section>

      <CollapsedGroup
        leases={view.review}
        note="Off-cycle or missing end dates. Confirm before working."
        title="Needs review"
      />
      <CollapsedGroup
        leases={view.skipped}
        note="Set aside automatically. Open the lease to override."
        title="Skipped"
      />
      <CollapsedGroup
        leases={view.outOfWindow}
        note="Ends outside the current renewal batch."
        title="Out of window"
      />

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

function ActionableLeaseCard({
  lease,
  href,
}: Readonly<{ lease: DeskLeaseSummary; href: string }>) {
  return (
    <Card>
      <div className="ui-stack">
        <div className="ui-spread">
          <h3 className="ui-card-title">{lease.addressLabel}</h3>
          {lease.openConflicts > 0 ? (
            <StatusPill value="Action Required">
              {lease.openConflicts} source conflict{lease.openConflicts === 1 ? "" : "s"}
            </StatusPill>
          ) : lease.endDateIso ? (
            <span className="muted">Ends {lease.endDateIso}</span>
          ) : null}
        </div>
        <Stepper currentIndex={lease.stageIndex} steps={RENEWAL_STEPS} />
        <div className="ui-spread">
          <span className="muted">Next: {lease.nextAction}</span>
          <Link className="secondary-button" href={href}>
            Open
          </Link>
        </div>
      </div>
    </Card>
  );
}

function CollapsedGroup({
  title,
  leases,
  note,
}: Readonly<{ title: string; leases: DeskLeaseSummary[]; note: string }>) {
  if (leases.length === 0) return null;

  return (
    <Disclosure summary={`${title} (${leases.length})`}>
      <p className="muted">{note}</p>
      <ul className="ui-rows">
        {leases.map((lease) => (
          <li className="ui-spread" key={lease.id}>
            <span>{lease.addressLabel}</span>
            <span className="ui-tag">{lease.reasonLabel}</span>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}
