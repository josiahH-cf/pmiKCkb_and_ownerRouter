import Link from "next/link";
import type {
  WritebackApprovalQueue,
  WritebackApprovalQueueGroup,
} from "@/lib/approval/writeback-approval-queue";
import type { WritebackApprovalState } from "@/lib/lease-renewal/writeback-approval";

// Read-only cross-run write-back queue body (F-WRITEBACK-QUEUE). Every QUEUED write-back proposal,
// grouped by approval state, deep-linking to its run page. Value-free: no proposed value, reason, or
// decider — those live behind the run-page link. There is NO approve/return affordance here; acting
// stays on the run page (the Admin control), mirroring the renewal review sub-tab's read/triage posture.
const STATE_HEADING: Record<WritebackApprovalState, string> = {
  "Awaiting Approval": "Awaiting approval",
  Approved: "Approved: ready to write (not executed)",
  "Returned for Revision": "Returned",
};

export function WritebackQueuePanel({
  queue,
}: Readonly<{ queue?: WritebackApprovalQueue }>) {
  if (!queue || queue.counts.total === 0) {
    return (
      <section className="panel" aria-label="Write-back queue">
        <p className="muted">No write-back proposals are queued right now.</p>
      </section>
    );
  }

  return (
    <div className="ui-stack writeback-queue" aria-label="Write-back queue">
      <p className="muted">
        {queue.counts.total} queued write-back proposal
        {queue.counts.total === 1 ? "" : "s"} across all runs:{" "}
        {queue.counts.awaitingApproval} awaiting approval · {queue.counts.approved}{" "}
        approved (ready to write, not executed) · {queue.counts.returned} returned.
        Approve or return each on its run page. Nothing is written to the sheet here.
      </p>

      {queue.groups.map((group) => (
        <QueueStateGroup group={group} key={group.state} />
      ))}
    </div>
  );
}

// Decided states are background, not work: they collapse to a counts-only summary by default (S13
// B4 — the queue asks only for what it needs) and expand on demand. "Awaiting approval" stays open.
const DECIDED_STATES: ReadonlySet<WritebackApprovalState> = new Set([
  "Approved",
  "Returned for Revision",
]);

function QueueStateGroup({ group }: Readonly<{ group: WritebackApprovalQueueGroup }>) {
  const rows =
    group.rows.length === 0 ? (
      <p className="muted">None.</p>
    ) : (
      <ul className="ui-rows">
        {group.rows.map((row) => (
          <li className="ui-spread" key={`${row.runId}:${row.fieldKey}`}>
            <div>
              <Link className="text-link" href={row.href}>
                <strong>{row.fieldLabel}</strong>
                <span className="muted"> · {row.runLabel}</span>
              </Link>
              <p className="muted">
                Authorization receipt: {row.authorizationReceiptId ?? "pending"} · Reason:{" "}
                {row.decisionReasonRecorded ? "recorded" : "pending"} · Provider
                execution: not executed
              </p>
            </div>
            <span className="queue-pill" data-value={row.severity}>
              {row.severity}
            </span>
          </li>
        ))}
      </ul>
    );

  if (DECIDED_STATES.has(group.state) && group.rows.length > 0) {
    return (
      <details className="panel ui-collapse">
        <summary>
          <h3 className="ui-card-title">
            {STATE_HEADING[group.state]} ({group.rows.length})
          </h3>
          <span className="muted"> Already decided. Open to view.</span>
        </summary>
        {rows}
      </details>
    );
  }

  return (
    <article className="panel ui-stack">
      <h3 className="ui-card-title">
        {STATE_HEADING[group.state]} ({group.rows.length})
      </h3>
      {rows}
    </article>
  );
}
