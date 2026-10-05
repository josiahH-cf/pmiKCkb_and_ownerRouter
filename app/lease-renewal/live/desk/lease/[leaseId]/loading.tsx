import { Card } from "@/components/ui";

/** Opening one lease reads that lease; the worklist's own loading wording does not apply here. */
export default function RenewalLeaseLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="content" role="status">
      <Card>
        <div className="renewal-loading">
          <span aria-hidden="true" className="renewal-loading-indicator" />
          <div>
            <h1 className="ui-card-title">Opening lease</h1>
            <p className="muted">Reading the current records for this lease.</p>
          </div>
        </div>
      </Card>
    </section>
  );
}
