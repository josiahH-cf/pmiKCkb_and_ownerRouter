// The live renewal review — the owner-gated surface that shows the REAL reconciliation items (with
// values) the team needs to decide, read from RentVine + the renewal sheet. Read-only: it renders the
// items but never resolves them and never sends. Server component (no client state).
//
// It composes the shared components/ui primitives and demotes the plumbing (read manifest counts) into
// a quiet "Read details" disclosure, matching the Renewal Desk. Severity colors and the candidate /
// confidence shape are reused verbatim from the simulation run view so the two surfaces read alike.

import {
  Disclosure,
  EmptyState,
  Metric,
  ModeChip,
  PageHeader,
  StatusPill,
} from "@/components/ui";
import { displaySourceLabel } from "@/lib/lease-renewal/source-display";
import type { LiveReviewMeta } from "@/lib/lease-renewal/live-review";
import type { RenewalFlagView, RenewalRunView } from "@/lib/lease-renewal/run-view";

// Humanize the reconciliation agreement label into the operator's language.
const AGREEMENT_LABEL: Record<string, string> = {
  conflict: "Two sources disagree",
  single_source: "Only one source has this",
  missing: "Missing from every source",
  agree: "Sources agree",
};

function humanizeAgreement(agreement: string): string {
  return AGREEMENT_LABEL[agreement] ?? agreement;
}

export function LiveRenewalReview({
  view,
  meta,
}: Readonly<{ view: RenewalRunView; meta: LiveReviewMeta }>) {
  return (
    <div className="ui-stack">
      <PageHeader
        actions={<ModeChip tone="live">Live data</ModeChip>}
        subtitle={`${view.totalFlags} item${
          view.totalFlags === 1 ? "" : "s"
        } need a human decision`}
        title="Live renewal review"
      />

      <p className="muted">
        Live, read-only view of RentVine and the renewal sheet. Nothing here is sent and
        no record is changed — review each item, then make the fix at the source.
      </p>

      {view.groups.length === 0 ? (
        <EmptyState
          description="Every reconciled field agrees across sources. Nothing needs a decision right now."
          title="No open items"
        />
      ) : (
        view.groups.map((group) => (
          <section
            aria-label={`${group.severity} items`}
            className="ui-stack-tight"
            key={group.severity}
          >
            <h2 className="section-subtitle">
              <StatusPill value={group.severity} /> {group.flags.length} item
              {group.flags.length === 1 ? "" : "s"}
            </h2>
            {group.flags.map((flag) => (
              <LiveFlagCard flag={flag} key={flag.sourceTriggerKey} />
            ))}
          </section>
        ))
      )}

      <Disclosure summary="Read details">
        <p className="muted">
          One read-only RentVine export and one renewal-sheet read. This view performs no
          write and carries production_allowed:{" "}
          <strong>{String(meta.productionAllowed)}</strong>.
        </p>
        <div className="ui-metric-grid">
          <Metric label="Sheet tabs read" value={meta.sheetTabsRead} />
          <Metric label="Live RentVine leases" value={meta.liveRentvineCandidates} />
          <Metric label="Records reconciled" value={view.manifest.totalRecords} />
          <Metric label="Open items" value={view.totalFlags} />
        </div>
      </Disclosure>
    </div>
  );
}

function LiveFlagCard({ flag }: Readonly<{ flag: RenewalFlagView }>) {
  return (
    <article className="lr-flag-card">
      <header className="lr-flag-head">
        <strong>{flag.fieldLabel}</strong>
        <StatusPill value={flag.severity} />
        <span className="muted">{humanizeAgreement(flag.agreement)}</span>
      </header>

      <p>{flag.actionNeeded}</p>

      <ul className="lr-candidates">
        {flag.candidates.map((candidate, index) => (
          <li key={`${candidate.source}-${index}`}>
            <strong>{displaySourceLabel(candidate.sourceSystem)}:</strong>{" "}
            {candidate.value}
            {candidate.confidence ? (
              <span className="muted"> ({candidate.confidence})</span>
            ) : null}{" "}
            {candidate.locationRef ? <a href={candidate.locationRef}>evidence</a> : null}
          </li>
        ))}
      </ul>

      {flag.suggestedWinner ? (
        <p className="muted">
          Suggested source:{" "}
          <strong>{displaySourceLabel(flag.suggestedWinner.source)}</strong> (
          {flag.suggestedWinner.value}). Suggestion only, needs human approval.
        </p>
      ) : flag.blockedReason ? (
        <p className="muted">Blocked: {flag.blockedReason} — needs a human decision.</p>
      ) : null}
    </article>
  );
}
