import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { listSimulationRuns } from "@/lib/lease-renewal/simulation";

export default async function LeaseRenewalRunsPage() {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("read");
  const runs = listSimulationRuns();

  return (
    <AppShell user={user}>
      <section className="content">
        <h1 className="section-title">Lease Renewal</h1>
        <p className="workflow-test-banner">
          Test run only, on sample data. These runs perform no live read, no write, and no
          system-of-record update.
        </p>
        <article className="panel">
          <h2 className="section-subtitle">Renewal runs</h2>
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
