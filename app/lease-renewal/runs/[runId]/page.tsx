import { AppShell } from "@/components/layout/AppShell";
import { LeaseRenewalRunClient } from "@/components/lease-renewal/LeaseRenewalRunClient";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { can } from "@/lib/auth/roles";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import {
  listWritebackApprovalActivityForRun,
  listWritebackApprovalsForRun,
} from "@/lib/firestore/lease-renewal-writeback-approvals";
import { buildRenewalRunView } from "@/lib/lease-renewal/run-view";
import { getSimulationRun, listSimulationRuns } from "@/lib/lease-renewal/simulation";

interface LeaseRenewalRunPageProps {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<{ flag?: string }>;
}

export default async function LeaseRenewalRunPage({
  params,
  searchParams,
}: LeaseRenewalRunPageProps) {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("read");
  const { runId } = await params;
  // A ?flag= deep link (from the reconcile redirect route or a queue row) scrolls to and highlights
  // that flag's card so the resolve control lands in view (S13 C1).
  const highlightFieldKey = (await searchParams)?.flag?.trim() || null;
  const run = getSimulationRun(runId);

  if (!run) {
    return (
      <AppShell user={user}>
        <section className="content">
          <h1 className="section-title">Lease Renewal Run</h1>
          <article className="panel">
            <p className="muted">This renewal run is unavailable.</p>
          </article>
        </section>
      </AppShell>
    );
  }

  const label =
    listSimulationRuns().find((entry) => entry.runId === runId)?.label ?? runId;

  // The flags are recomputed deterministically; only persisted resolutions + write-back approvals +
  // their append-only decision history need Firestore. Degrade to "no saved resolutions" if Firestore
  // is unavailable (e.g. no local ADC). The activity is one run-scoped query, grouped by flag key.
  let resolutions: Awaited<ReturnType<typeof listResolutionsForRun>> = [];
  let approvals: Awaited<ReturnType<typeof listWritebackApprovalsForRun>> = [];
  let approvalActivity: Awaited<ReturnType<typeof listWritebackApprovalActivityForRun>> =
    new Map();
  let resolutionsError = false;
  try {
    resolutions = await listResolutionsForRun(user, runId);
    approvals = await listWritebackApprovalsForRun(user, runId);
    approvalActivity = await listWritebackApprovalActivityForRun(user, runId);
  } catch {
    resolutionsError = true;
  }

  const view = buildRenewalRunView(run, resolutions, label, approvals, approvalActivity);

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Lease Renewal Run</h1>
        <LeaseRenewalRunClient
          canDefer={can(user.role, "edit")}
          canResolve={can(user.role, "approve")}
          highlightFieldKey={highlightFieldKey}
          isAdmin={can(user.role, "manageAdmin")}
          resolutionsError={resolutionsError}
          view={view}
        />
        <article className="panel">
          <h2 className="section-subtitle">Renewal communication</h2>
          <p className="muted">
            This run is Test-only. Owner and tenant message actions use internal Test
            receipts; no Live Gmail thread can be loaded, linked, drafted, labeled, or
            sent from this run.
          </p>
        </article>
      </section>
    </AppShell>
  );
}
