import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { LiveRenewalNotices } from "@/components/lease-renewal/LiveRenewalNotices";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { loadLiveRenewalNotices } from "@/lib/lease-renewal/live-notices";

// Editors and up (D4): drafting renewal notices is core Editor work, so this desk matches the draft
// API's own "edit" gate instead of standing behind an Admin-only wall. It reads live RentVine on each
// render, so it is never statically cached; the sample Renewal Desk stays the default landing, and
// every draft the desk creates is unsent and still passes the production gate before it is written.
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 120;

export default async function LiveRenewalNoticesPage() {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("edit");

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
