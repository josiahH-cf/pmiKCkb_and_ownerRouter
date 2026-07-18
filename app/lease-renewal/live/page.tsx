import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { LeaseBusinessContractPanel } from "@/components/lease-renewal/LeaseBusinessContractPanel";
import { LiveRenewalReview } from "@/components/lease-renewal/LiveRenewalReview";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { can } from "@/lib/auth/roles";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import {
  listWritebackApprovalActivityForRun,
  listWritebackApprovalsForRun,
} from "@/lib/firestore/lease-renewal-writeback-approvals";
import {
  LIVE_REVIEW_RUN_ID,
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
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("manageAdmin");

  // The live flags are recomputed on each render; only persisted resolutions + write-back approvals +
  // their append-only decision history need Firestore. Load them for run_id "live-review" (the same id
  // the live run is built under) and degrade to a non-fatal banner when Firestore is unavailable.
  let resolutions: Awaited<ReturnType<typeof listResolutionsForRun>> = [];
  let approvals: Awaited<ReturnType<typeof listWritebackApprovalsForRun>> = [];
  let activityByKey: Awaited<ReturnType<typeof listWritebackApprovalActivityForRun>> =
    new Map();
  let resolutionsError = false;
  try {
    resolutions = await listResolutionsForRun(user, LIVE_REVIEW_RUN_ID);
    approvals = await listWritebackApprovalsForRun(user, LIVE_REVIEW_RUN_ID);
    activityByKey = await listWritebackApprovalActivityForRun(user, LIVE_REVIEW_RUN_ID);
  } catch {
    resolutionsError = true;
  }

  const outcome = await loadLiveRenewalReview(new Date().toISOString(), {
    resolutions,
    approvals,
    activityByKey,
  });

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href="/lease-renewal">
          ← Renewals
        </Link>
        {outcome.status === "ok" ? (
          <LiveRenewalReview
            canDefer={can(user.role, "edit")}
            canResolve={can(user.role, "approve")}
            isAdmin={can(user.role, "manageAdmin")}
            meta={outcome.meta}
            resolutionsError={resolutionsError}
            view={outcome.view}
          />
        ) : (
          <LiveReviewPanel status={outcome.status} />
        )}
        <LeaseBusinessContractPanel />
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
