import Link from "next/link";

import { AppShell } from "@/components/layout/AppShell";
import { LeaseDecisionProjectionPanel } from "@/components/lease-renewal/LeaseDecisionProjectionPanel";
import { requirePageCapability, requirePageSpaceAccess } from "@/lib/auth/page-guards";
import { listLeaseTestRuns } from "@/lib/firestore/lease-renewal-test-runs";
import {
  listResolutionActivityForRun,
  listResolutionsForProperty,
} from "@/lib/firestore/lease-renewal-resolutions";
import {
  listWritebackApprovalActivityForRun,
  listWritebackApprovalsForProperty,
} from "@/lib/firestore/lease-renewal-writeback-approvals";
import type { LeaseRenewalWritebackApprovalActivityRecord } from "@/lib/firestore/types";
import {
  getPropertyActivity,
  type PropertyRunActivity,
} from "@/lib/lease-renewal/property-repository";
import { normalizeRenewalReturnTo } from "@/lib/lease-renewal/property-history-link";
import { buildLeaseRenewalDecisionProjections } from "@/lib/lease-renewal/decision-projection";
import {
  buildTestRenewalSimulation,
  getSimulationRun,
  listSimulationRuns,
} from "@/lib/lease-renewal/simulation";

// Admin-only, and it reads persisted decision Activity on each render, so never statically cached.
export const dynamic = "force-dynamic";

interface PropertyPageProps {
  params: Promise<{ propertyKey: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}

export default async function LeaseRenewalPropertyPage({
  params,
  searchParams,
}: PropertyPageProps) {
  await requirePageSpaceAccess("renewals");
  const user = await requirePageCapability("manageAdmin");
  const { propertyKey: rawKey } = await params;
  const propertyKey = decodeURIComponent(rawKey);
  const returnTo = normalizeRenewalReturnTo((await searchParams)?.returnTo);

  // getSimulationRun is pure and always available, so the header renders even with Firestore down.
  // Only the append-only Activity needs Firestore; wrap those reads (also covers demo runs with no
  // local ADC) and degrade to a note instead of throwing.
  const runs: PropertyRunActivity[] = [];
  let activityUnavailable = false;
  for (const summary of listSimulationRuns()) {
    const run = getSimulationRun(summary.runId);
    if (!run) continue;
    let resolutionActivity: Awaited<ReturnType<typeof listResolutionActivityForRun>> = [];
    let approvalActivity: LeaseRenewalWritebackApprovalActivityRecord[] = [];
    try {
      resolutionActivity = await listResolutionActivityForRun(user, run.runId);
      const approvalByKey = await listWritebackApprovalActivityForRun(user, run.runId);
      approvalActivity = [...approvalByKey.values()].flat();
    } catch {
      activityUnavailable = true;
    }
    runs.push({ run, resolutionActivity, approvalActivity });
  }

  // Persistent Test reconciliation decisions share the exact run id used by their owning Test
  // journey. Include those app-plane histories beside the sample history; never synthesize a Test
  // run when its isolated Firestore owning record cannot be read.
  try {
    const testRuns = (await listLeaseTestRuns(user)).slice(0, 10);
    for (const testRun of testRuns) {
      const run = buildTestRenewalSimulation(testRun.id);
      let resolutionActivity: Awaited<ReturnType<typeof listResolutionActivityForRun>> =
        [];
      let approvalActivity: LeaseRenewalWritebackApprovalActivityRecord[] = [];
      try {
        resolutionActivity = await listResolutionActivityForRun(user, run.runId);
        const approvalByKey = await listWritebackApprovalActivityForRun(user, run.runId);
        approvalActivity = [...approvalByKey.values()].flat();
      } catch {
        activityUnavailable = true;
      }
      runs.push({ run, resolutionActivity, approvalActivity });
    }
  } catch {
    activityUnavailable = true;
  }

  const bucket = getPropertyActivity(runs, propertyKey);
  let currentDecisionProjections: ReturnType<
    typeof buildLeaseRenewalDecisionProjections
  > = [];
  try {
    const [propertyResolutions, propertyApprovals] = await Promise.all([
      listResolutionsForProperty(user, propertyKey),
      listWritebackApprovalsForProperty(user, propertyKey),
    ]);
    currentDecisionProjections = buildLeaseRenewalDecisionProjections(
      propertyResolutions,
      propertyApprovals,
    );
  } catch {
    activityUnavailable = true;
  }

  return (
    <AppShell user={user}>
      <section className="content">
        <Link className="back-link" href={returnTo ?? "/lease-renewal"}>
          ← {returnTo ? "Back to renewal" : "Renewals"}
        </Link>
        <h1 className="section-title">Property decision history</h1>
        <p className="muted">
          Property key <code>{propertyKey}</code>
        </p>
        {activityUnavailable ? (
          <p className="workflow-blocker">
            Saved decisions could not be loaded (Firestore unavailable). Reload once the
            connection is back to see this decision history.
          </p>
        ) : null}
        <LeaseDecisionProjectionPanel
          decisions={currentDecisionProjections}
          emptyMessage="No current decision or write-back authorization is attributable to this property yet. Legacy or name-joined records are not guessed onto a property."
          title="Current decision and authorization state"
        />
        {bucket ? (
          <article className="panel">
            <p className="muted">
              {bucket.resolutionCount} resolution decisions and {bucket.approvalCount}{" "}
              write-back approvals recorded for this property.
            </p>
            <ol className="activity-list">
              {bucket.entries.map((entry, index) => (
                <li key={`${entry.timestamp}-${index}`}>
                  <span className="activity-action">{entry.action}</span> by{" "}
                  <span className="activity-actor">{entry.actorUid}</span> at{" "}
                  <span className="activity-time">{entry.timestamp}</span>
                  <p className="muted">{entry.reason}</p>
                </li>
              ))}
            </ol>
          </article>
        ) : (
          <article className="panel">
            <p className="muted">
              No decisions have been recorded for this property yet.
            </p>
          </article>
        )}
      </section>
    </AppShell>
  );
}
