import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { RenewalDesk } from "@/components/lease-renewal/RenewalDesk";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { loadLiveRenewalDesk, type LiveDeskStatus } from "@/lib/lease-renewal/live-desk";

// Owner-gated (Admin only). Reads live RentVine + the renewal sheet on each render, so it is never
// statically cached. It is read-only and draft-only: no send, no sheet write-back. The sample Renewal
// Desk stays the default landing; this surfaces the real leases with their real reconciliation.
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 120;

const PANELS: Record<
  LiveDeskStatus,
  { title: string; body: string; link?: { href: string; label: string } }
> = {
  not_configured: {
    title: "Live sources aren’t connected",
    body: "Connect RentVine and the renewal sheet to run the live desk. Until then, the Renewal Desk runs on sample data.",
    link: { href: "/connections", label: "Open Connection Center" },
  },
  account_mismatch: {
    title: "Wrong RentVine account",
    body: "The configured RentVine account isn’t the PMI KC Metro tenant. An admin needs to correct the connection before a live read can run.",
    link: { href: "/connections", label: "Open Connection Center" },
  },
  read_error: {
    title: "Live read didn’t complete",
    body: "The live read couldn’t finish. This is usually a temporary network issue; reload to try again.",
  },
};

export default async function LiveRenewalDeskPage() {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("manageAdmin");

  // The renewal window is computed here (the pure loader never calls Date.now()): leases ending on a
  // month boundary between today and ~4 months out are the actionable batch.
  const now = new Date();
  const startIso = now.toISOString().slice(0, 10);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + WINDOW_DAYS);
  const endIso = end.toISOString().slice(0, 10);

  const outcome = await loadLiveRenewalDesk([{ startIso, endIso }], now.toISOString());

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/lease-renewal">
          ← Renewals
        </Link>
        {outcome.status === "ok" ? (
          <RenewalDesk mode="live" view={outcome.view} />
        ) : (
          <LiveDeskPanel status={outcome.status} />
        )}
      </section>
    </AppShell>
  );
}

function LiveDeskPanel({ status }: Readonly<{ status: LiveDeskStatus }>) {
  const panel = PANELS[status];
  return (
    <article className="panel">
      <h1 className="section-title">{panel.title}</h1>
      <p className="muted">{panel.body}</p>
      {panel.link ? (
        <p>
          <Link className="secondary-button" href={panel.link.href}>
            {panel.link.label}
          </Link>
        </p>
      ) : null}
    </article>
  );
}
