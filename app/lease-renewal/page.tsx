import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { LeaseExecutionReadiness } from "@/components/lease-renewal/LeaseExecutionReadiness";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { can } from "@/lib/auth/roles";
import { getRenewalDeskView } from "@/lib/lease-renewal/sample-desk";

// The Renewal Desk — the lease-renewal landing. Renders the synthetic sample batch (read-only);
// no live read, no write, no system-of-record update. Admins also get a link into the owner-gated
// live review (the live read itself only happens on that route).
export default async function LeaseRenewalDeskPage() {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("read");
  const view = getRenewalDeskView();

  return (
    <AppShell user={user}>
      <section className="content">
        <RenewalDesk
          liveReviewHref={
            can(user.role, "manageAdmin") ? "/lease-renewal/live" : undefined
          }
          view={view}
        />
        {can(user.role, "manageAdmin") ? (
          <p>
            <Link className="secondary-button" href="/lease-renewal/live/desk">
              Open the live renewal desk (real leases)
            </Link>
          </p>
        ) : null}
        {can(user.role, "manageAdmin") ? (
          <p>
            <Link className="secondary-button" href="/lease-renewal/live/notices">
              Live renewal notices (compose drafts)
            </Link>
          </p>
        ) : null}
        <LeaseExecutionReadiness />
      </section>
    </AppShell>
  );
}
