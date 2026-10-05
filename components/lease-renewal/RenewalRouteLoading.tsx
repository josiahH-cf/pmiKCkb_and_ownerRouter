"use client";

import { usePathname } from "next/navigation";

import { Card } from "@/components/ui/Card";

/** The first-load placeholder for the renewal worklist, or for one lease opened directly. */
export function RenewalRouteLoading() {
  const lease = usePathname()?.includes("/desk/lease/") ?? false;
  return (
    <section aria-busy="true" aria-live="polite" className="content" role="status">
      <Card>
        <div className="renewal-loading">
          <span aria-hidden="true" className="renewal-loading-indicator" />
          <div>
            <h1 className="ui-card-title">
              {lease ? "Opening lease" : "Updating renewals"}
            </h1>
            <p className="muted">
              {lease
                ? "Reading the current records for this lease."
                : "Applying the selected scope, filters, and sort order."}
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}
