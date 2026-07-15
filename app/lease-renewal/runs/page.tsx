import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { LeaseTestRunsWorkspace } from "@/components/lease-renewal/LeaseTestRunsWorkspace";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { listLeaseTestRuns } from "@/lib/firestore/lease-renewal-test-runs";
import { listSimulationRuns } from "@/lib/lease-renewal/simulation";

export default async function LeaseRenewalRunsPage() {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("read");
  const runs = listSimulationRuns();
  let testRuns: Awaited<ReturnType<typeof listLeaseTestRuns>> = [];
  let testRunsUnavailable: string | undefined;
  try {
    testRuns = await listLeaseTestRuns(user);
  } catch {
    testRunsUnavailable =
      "Persistent Test renewals are unavailable in this session. Refresh Google credentials or check Firestore, then reload.";
  }

  return (
    <AppShell user={user}>
      <section className="content ui-stack">
        <h1 className="section-title">Lease Renewal</h1>
        <p className="workflow-test-banner">
          TEST DATA is isolated from Live records. Persistent Test runs write
          app/Firestore progress and internal evidence only; they never call a provider or
          count as Live proof.
        </p>
        <LeaseTestRunsWorkspace
          initialRuns={testRuns}
          unavailableNote={testRunsUnavailable}
        />
        <article className="panel">
          <h2 className="section-subtitle">Deterministic source-review sample</h2>
          <p className="muted">
            This original in-memory sample remains available for reconciliation review. It
            does not persist a journey or execute Test actions.
          </p>
          <ul className="lr-run-list">
            {runs.map((run) => (
              <li key={run.runId}>
                <Link href={`/lease-renewal/runs/${run.runId}`}>{run.label}</Link>
                <p className="muted">{run.description}</p>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </AppShell>
  );
}
