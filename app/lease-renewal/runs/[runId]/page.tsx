import { AppShell } from "@/components/layout/AppShell";
import { LeaseRenewalRunClient } from "@/components/lease-renewal/LeaseRenewalRunClient";
import { requirePageCapability } from "@/lib/auth/page-guards";
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
}

export default async function LeaseRenewalRunPage({ params }: LeaseRenewalRunPageProps) {
  const user = await requirePageCapability("read");
  const { runId } = await params;
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
          canResolve={can(user.role, "approve")}
          isAdmin={can(user.role, "manageAdmin")}
          resolutionsError={resolutionsError}
          view={view}
        />
      </section>
    </AppShell>
  );
}
