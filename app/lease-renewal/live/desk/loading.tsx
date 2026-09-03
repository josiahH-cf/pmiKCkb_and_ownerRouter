import { Card } from "@/components/ui";

export default function RenewalDeskLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="content" role="status">
      <Card>
        <div className="renewal-loading">
          <span aria-hidden="true" className="renewal-loading-indicator" />
          <div>
            <h1 className="ui-card-title">Updating renewals</h1>
            <p className="muted">Applying the selected scope, filters, and sort order.</p>
          </div>
        </div>
      </Card>
    </section>
  );
}
