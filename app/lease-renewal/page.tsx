import { AppShell } from "@/components/layout/AppShell";
import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { getRenewalDeskView } from "@/lib/lease-renewal/sample-desk";

// The Renewal Desk — the lease-renewal landing. Renders the synthetic sample batch (read-only);
// no live read, no write, no system-of-record update.
export default async function LeaseRenewalDeskPage() {
  const user = await requirePageCapability("read");
  const view = getRenewalDeskView();

  return (
    <AppShell user={user}>
      <section className="content">
        <RenewalDesk view={view} />
      </section>
    </AppShell>
  );
}
