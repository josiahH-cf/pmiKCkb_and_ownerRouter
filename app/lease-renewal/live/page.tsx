import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { LiveRenewalReview } from "@/components/lease-renewal/LiveRenewalReview";
import { requirePageCapability } from "@/lib/auth/page-guards";
import {
  loadLiveRenewalReview,
  type LiveReviewStatus,
} from "@/lib/lease-renewal/live-review";

// Owner-gated (Admin only). Reads live data on each render, so never statically cached.
export const dynamic = "force-dynamic";

type PanelStatus = Exclude<LiveReviewStatus, "ok">;

const PANELS: Record<
  PanelStatus,
  { title: string; body: string; link?: { href: string; label: string } }
> = {
  not_configured: {
    title: "Live sources aren’t connected",
    body: "Connect RentVine and the renewal sheet to run a live review. Until then, the Renewal Desk runs on sample data.",
    link: { href: "/connections", label: "Open Connection Center" },
  },
  account_mismatch: {
    title: "Wrong RentVine account",
    body: "The configured RentVine account isn’t the PMI KC Metro tenant. An admin needs to correct the connection before a live read can run.",
    link: { href: "/connections", label: "Open Connection Center" },
  },
  auth_error: {
    title: "Live read couldn’t authenticate",
    body: "Access to RentVine or Google has expired. An admin needs to refresh the connection, then reload this page.",
    link: { href: "/connections", label: "Open Connection Center" },
  },
  read_error: {
    title: "Live read didn’t complete",
    body: "The live read couldn’t finish — this is usually a temporary network issue. Reload to try again.",
  },
};

export default async function LiveRenewalReviewPage() {
  const user = await requirePageCapability("manageAdmin");
  const outcome = await loadLiveRenewalReview(new Date().toISOString());

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/lease-renewal">
          ← Renewals
        </Link>
        {outcome.status === "ok" ? (
          <LiveRenewalReview meta={outcome.meta} view={outcome.view} />
        ) : (
          <LiveReviewPanel status={outcome.status} />
        )}
      </section>
    </AppShell>
  );
}

function LiveReviewPanel({ status }: Readonly<{ status: PanelStatus }>) {
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
