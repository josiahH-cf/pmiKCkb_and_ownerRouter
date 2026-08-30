import { createHash } from "node:crypto";

import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { DiscrepancyDispositionPanel } from "@/components/lease-renewal/DiscrepancyDispositionPanel";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { getRenewalProgress } from "@/lib/firestore/lease-renewal-progress";
import { getCurrentPacketSnapshot } from "@/lib/firestore/lease-document-packet-snapshots";
import { getApprovedRentSuggestion } from "@/lib/firestore/lease-renewal-rent-suggestion-approvals";
import { listRenewalDiscrepancyDispositions } from "@/lib/firestore/renewal-discrepancy-dispositions";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import { getRenewalCompScreenshotActionView } from "@/lib/lease-renewal/comp-screenshot-action";
import {
  findLeaseViewById,
  leaseCurrentRent,
  leasePortfolioId,
} from "@/lib/integrations/rentvine/lease-mapper";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import { canonicalJson } from "@/lib/execution/preview-hash";
import { getLiveLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import {
  loadLiveRenewalLeaseWorkspace,
  type LiveDeskStatus,
} from "@/lib/lease-renewal/live-desk";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

interface LiveLeaseWorkspacePageProps {
  params: Promise<{ leaseId: string }>;
}

// Renewals-space Editors and up. One live lease's renewal workspace, read-only / draft-only. The email step
// renders the gated live composer; there is no sample email button and no sheet write-back here.
export const dynamic = "force-dynamic";

const PANELS: Record<
  LiveDeskStatus,
  { title: string; body: string; link?: { href: string; label: string } }
> = {
  not_configured: {
    title: "Live sources aren’t connected",
    body: "Connect RentVine and the renewal sheet to open a live lease.",
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
  const user = await requirePageCapability(renewalRoleCapability("read_workspace"));
  const { leaseId } = await params;

  const progress = await getRenewalProgress(user, leaseId);
  const packetSnapshot = await getCurrentPacketSnapshot(user, leaseId, leaseId);
  // S60 (AC-S60-10): the approval re-verify recomputes against the AUTHORITATIVE current rent from
  // the shared live read (a coalesced cache read the workspace loader reuses). Null when the live
  // source is unavailable, which leaves the recompute visibly unclamped rather than guessed.
  const liveConfig = buildLiveRenewalConfig();
  const readTimestamp = new Date().toISOString();
  let authoritativeCurrentRent: number | null = null;
  let authoritativePortfolioId: string | null = null;
  if (liveConfig.ok) {
    try {
      const views = await getLiveLeaseViews(
        liveConfig.rentvineClient,
        Date.parse(readTimestamp),
      );
      const view = findLeaseViewById(views, leaseId);
      authoritativeCurrentRent = view ? (leaseCurrentRent(view) ?? null) : null;
      authoritativePortfolioId = view ? (leasePortfolioId(view) ?? null) : null;
    } catch {
      authoritativeCurrentRent = null;
    }
  }
  // S29: the exact Admin-approved comp-derived rent number (or null). It flows into the owner-draft preview
  // only when an Approved record still matches the current recompute; it is never the raw computed value.
  const approvedSuggestion = await getApprovedRentSuggestion(
    user,
    leaseId,
    authoritativeCurrentRent,
    authoritativePortfolioId,
  );
  const compScreenshotAction = await getRenewalCompScreenshotActionView();
  let resolutions: Awaited<ReturnType<typeof listResolutionsForRun>> = [];
  try {
    resolutions = await listResolutionsForRun(user, "live-review");
  } catch {
    // A missing decision store must never make a source value look resolved.
    resolutions = [];
  }
  const outcome = await loadLiveRenewalLeaseWorkspace(
    leaseId,
    readTimestamp,
    liveConfig,
    progress,
    approvedSuggestion,
    resolutions,
    packetSnapshot,
  );
  const dispositions = await listRenewalDiscrepancyDispositions(user, leaseId).catch(
    () => [],
  );

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/lease-renewal/live/desk">
          ← Live renewal desk
        </Link>
        {outcome.status === "ok" ? (
          <>
            <RenewalWorkspace
              compScreenshotExecutable={compScreenshotAction.executable}
              packetSnapshot={packetSnapshot}
              role={user.role}
              workspace={outcome.workspace}
            />
            <DiscrepancyDispositionPanel
              initialDispositions={dispositions}
              leaseId={leaseId}
              ownerUid={user.uid}
              sourceHash={createHash("sha256")
                .update(
                  canonicalJson({
                    lease_id: leaseId,
                    read_at: outcome.workspace.dataCurrency?.readAtIso ?? readTimestamp,
                    data_check: outcome.workspace.dataCheck,
                  }),
                )
                .digest("hex")}
            />
          </>
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
