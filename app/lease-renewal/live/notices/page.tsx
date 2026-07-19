import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { LiveRenewalNotices } from "@/components/lease-renewal/LiveRenewalNotices";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { loadLiveRenewalNotices } from "@/lib/lease-renewal/live-notices";

// Owner-gated (Admin only): reads live RentVine on each render, so never statically cached. The live
// read only happens here; the sample Renewal Desk stays the default landing.
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 120;

export default async function LiveRenewalNoticesPage() {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("manageAdmin");

  // The renewal window is computed here (the pure loader never calls Date.now()): leases ending on a
  // month boundary between today and ~4 months out are the actionable batch.
  const now = new Date();
  const startIso = now.toISOString().slice(0, 10);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + WINDOW_DAYS);
  const endIso = end.toISOString().slice(0, 10);

  const result = await loadLiveRenewalNotices([{ startIso, endIso }], now.toISOString());

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/lease-renewal">
          ← Renewals
        </Link>
        <LiveRenewalNotices result={result} windowEndIso={endIso} />
      </section>
    </AppShell>
  );
}
