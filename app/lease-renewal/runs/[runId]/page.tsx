import { AppShell } from "@/components/layout/AppShell";
import { LeaseRenewalRunClient } from "@/components/lease-renewal/LeaseRenewalRunClient";
import { requirePageCapability } from "@/lib/auth/page-guards";
import { can } from "@/lib/auth/roles";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
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

  // The flags are recomputed deterministically; only persisted resolutions need Firestore. Degrade
  // to "no saved resolutions" if Firestore is unavailable (e.g. no local ADC).
  let resolutions: Awaited<ReturnType<typeof listResolutionsForRun>> = [];
  let resolutionsError = false;
  try {
    resolutions = await listResolutionsForRun(user, runId);
  } catch {
    resolutionsError = true;
  }

  const view = buildRenewalRunView(run, resolutions, label);

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
