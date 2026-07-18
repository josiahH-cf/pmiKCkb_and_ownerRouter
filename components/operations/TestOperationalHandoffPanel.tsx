import Link from "next/link";

import type { TestOperationalHandoff } from "@/lib/operations/test-handoffs";

export function TestOperationalHandoffPanel({
  handoffs,
  title = "Test operational handoffs",
}: Readonly<{
  handoffs: readonly TestOperationalHandoff[];
  title?: string;
}>) {
  return (
    <section aria-label={title} className="panel ui-stack">
      <div>
        <h2>{title}</h2>
        <p className="muted">
          Read-only bodyless projections from the owning Test record. These cards share
          one run or ticket identity across surfaces and never prove a Live provider or
          real-world outcome.
        </p>
      </div>
      {handoffs.length === 0 ? (
        <p className="muted">
          No isolated Test owning record is available in this scope.
        </p>
      ) : (
        handoffs.map((handoff) => (
          <article className="ui-callout ui-stack" key={handoff.id}>
            <div className="ui-spread">
              <strong>
                {handoff.kind === "lease_renewal"
                  ? "Lease Renewal Test"
                  : "Maintenance Test"}
              </strong>
              <span className="queue-pill" data-value="Test">
                TEST · {handoff.status}
              </span>
            </div>
            <dl className="review-grid">
              <div>
                <dt>Owning record</dt>
                <dd>{handoff.owning_record_id}</dd>
              </div>
              <div>
                <dt>Next owner</dt>
                <dd>{handoff.next_owner}</dd>
              </div>
              <div>
                <dt>Due state</dt>
                <dd>{handoff.due_state}</dd>
              </div>
              <div>
                <dt>Blocker</dt>
                <dd>{handoff.blocker}</dd>
              </div>
              <div>
                <dt>Exact next action</dt>
                <dd>{handoff.exact_next_action}</dd>
              </div>
              <div>
                <dt>Latest evidence identity</dt>
                <dd>{handoff.evidence_identity}</dd>
              </div>
              <div>
                <dt>Bodyless Test evidence count</dt>
                <dd>{handoff.receipt_count}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{handoff.updated_at}</dd>
              </div>
            </dl>
            <p>
              <Link className="secondary-button" href={handoff.owning_record_href}>
                Open exact owning Test record
              </Link>
            </p>
          </article>
        ))
      )}
    </section>
  );
}
