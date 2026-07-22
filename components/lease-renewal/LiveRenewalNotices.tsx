// Live renewal-notices list — the surface that gives the draft composer REAL RentVine lease ids.
// Server component: renders a degraded panel when the live source is not connected, otherwise lists the
// actionable renewal leases (one Card each) with a collapsed composer per lease. The composer does the
// authoritative recipient lookup + compose + create; nothing is sent from here.

import Link from "next/link";

import { Card, Disclosure, EmptyState } from "@/components/ui";
import { RenewalNoticeDraftComposer } from "@/components/lease-renewal/RenewalNoticeDraftComposer";
import type {
  LiveRenewalNoticeRow,
  LiveRenewalNoticesResult,
} from "@/lib/lease-renewal/live-notices";

type DegradedStatus = Exclude<LiveRenewalNoticesResult["status"], "ok">;

const PANELS: Record<
  DegradedStatus,
  { title: string; body: string; link?: { href: string; label: string } }
> = {
  not_configured: {
    title: "Live sources aren’t connected",
    body: "Connect RentVine to list live renewal leases and compose real drafts. Until then, the Renewal Desk runs on sample data.",
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

export function LiveRenewalNotices({
  result,
  windowEndIso,
}: Readonly<{ result: LiveRenewalNoticesResult; windowEndIso: string }>) {
  if (result.status !== "ok") {
    const panel = PANELS[result.status];
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

  return (
    <div className="ui-stack">
      <div>
        <h1 className="section-title">Live renewal notices</h1>
        <p className="muted">
          Actionable leases ending on a month boundary through {windowEndIso}, from a live
          RentVine read ({result.scanned} leases scanned). Compose an unsent Gmail draft
          per lease. You send each draft yourself from Gmail.
        </p>
      </div>
      {result.rows.length === 0 ? (
        <EmptyState
          description="No live lease ends on a month boundary in the current window."
          title="No actionable leases in the window"
        />
      ) : (
        <ul className="ui-rows">
          {result.rows.map((row) => (
            <li key={row.leaseId}>
              <Card>
                <Disclosure summary={<NoticeSummary row={row} />}>
                  <RenewalNoticeDraftComposer leaseId={row.leaseId} />
                </Disclosure>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NoticeSummary({ row }: Readonly<{ row: LiveRenewalNoticeRow }>) {
  return (
    <span>
      <strong>{row.tenantName ?? `Lease ${row.leaseId}`}</strong>
      {row.leaseEndIso ? ` · ends ${row.leaseEndIso}` : null}
      {" · "}
      <span className="muted">
        {row.tenantRecipientVerified ? "tenant ready" : "tenant needs verification"}
        {"; "}
        {row.ownerRecipientVerified ? "owner ready" : "owner needs verification"}
      </span>
    </span>
  );
}
