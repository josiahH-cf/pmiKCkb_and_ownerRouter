import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { getRenewalProgress } from "@/lib/firestore/lease-renewal-progress";
import { getApprovedRentSuggestion } from "@/lib/firestore/lease-renewal-rent-suggestion-approvals";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import {
  loadLiveRenewalLeaseWorkspace,
  type LiveDeskStatus,
} from "@/lib/lease-renewal/live-desk";

interface LiveLeaseWorkspacePageProps {
  params: Promise<{ leaseId: string }>;
}

// Owner-gated (Admin only). One live lease's renewal workspace, read-only / draft-only. The email step
// renders the gated live composer; there is no sample email button and no sheet write-back here.
export const dynamic = "force-dynamic";

const PANELS: Record<
  LiveDeskStatus,
  { title: string; body: string; link?: { href: string; label: string } }
> = {
  not_configured: {
    title: "Live sources aren’t connected",
    body: "Connect RentVine and the renewal sheet to open a live lease. Until then, the Renewal Desk runs on sample data.",
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

export default async function LiveRenewalLeaseWorkspacePage({
  params,
}: LiveLeaseWorkspacePageProps) {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("manageAdmin");
  const { leaseId } = await params;

  const progress = await getRenewalProgress(user, leaseId);
  // S29: the exact Admin-approved comp-derived rent number (or null). It flows into the owner-draft preview
  // only when an Approved record still matches the current recompute; it is never the raw computed value.
  const approvedSuggestion = await getApprovedRentSuggestion(user, leaseId);
  const outcome = await loadLiveRenewalLeaseWorkspace(
    leaseId,
    new Date().toISOString(),
    buildLiveRenewalConfig(),
    progress,
    approvedSuggestion,
  );

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/lease-renewal/live/desk">
          ← Live renewal desk
        </Link>
        {outcome.status === "ok" ? (
          <RenewalWorkspace mode="live" workspace={outcome.workspace} />
        ) : outcome.status === "not_found" ? (
          <article className="panel">
            <p className="muted">This live renewal is unavailable.</p>
          </article>
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
