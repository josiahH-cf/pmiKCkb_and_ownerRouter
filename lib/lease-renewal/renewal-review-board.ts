// Server gather for the Approval Queue's renewal surfaces (OQ-UI-1). Assembles the per-run renewal
// views from the deterministic simulation runs, layering in persisted resolutions + write-back
// approvals so the value-free review board AND the cross-run write-back queue can both be projected
// from ONE gather (buildRenewalReviewBoard / buildWritebackApprovalQueue, applied by the page). Flags
// are computed deterministically (no Firestore needed), so a resolutions read failure degrades to
// "nothing resolved yet" rather than hiding the review entirely.
//
// Read-only: no writes, `production_allowed: false` upstream. It only routes Dan to the built resolve
// surface; it never resolves, approves, or writes anything itself.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { listLeaseTestRuns } from "@/lib/firestore/lease-renewal-test-runs";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import { listWritebackApprovalsForRun } from "@/lib/firestore/lease-renewal-writeback-approvals";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import { buildRenewalRunView, type RenewalRunView } from "@/lib/lease-renewal/run-view";
import {
  buildTestRenewalSimulation,
  getSimulationRun,
  listSimulationRuns,
} from "@/lib/lease-renewal/simulation";
import { LEASE_TEST_RUN_STATUS_LABELS } from "@/lib/lease-renewal/test-workflow";

/**
 * Assemble the per-run renewal views (flags + resolution + write-back approval overlay) for the
 * current user. Never throws: reconciliation flags are deterministic, so only the per-run resolution
 * overlay can fail, and it degrades to an empty resolution/approval set. This is the single Firestore
 * gather that both the value-free review board AND the cross-run write-back queue project from — build
 * them from one call so neither surface adds a duplicate read. Does NOT load approval Activity, so the
 * views (and everything projected from them) stay free of the decision history (run-page only).
 */
export async function loadRenewalRunViews(
  user: AuthenticatedUser,
): Promise<RenewalRunView[]> {
  const summaries = listSimulationRuns();
  const views: RenewalRunView[] = [];

  for (const summary of summaries) {
    const run = getSimulationRun(summary.runId);
    if (!run) continue;

    views.push(await buildRunView(user, run, summary.label));
  }

  // Persistent Test runs are real app-plane owning records, not the browser-only sample. Project
  // their deterministic, invented reconciliation graph with the exact persisted run identity so a
  // decision made on the run page appears in Approval/Notifications after refresh. A failed Test-run
  // read never hides the sample board and never falls back to Live data.
  try {
    const testRuns = (await listLeaseTestRuns(user)).slice(0, 10);
    for (const testRun of testRuns) {
      views.push(
        await buildRunView(
          user,
          buildTestRenewalSimulation(testRun.id),
          `TEST · ${LEASE_TEST_RUN_STATUS_LABELS[testRun.status]} · ${testRun.id}`,
        ),
      );
    }
  } catch {
    // Firestore unavailable — preserve the deterministic sample board only. We deliberately do not
    // invent a persistent Test run or silently project it as Live.
  }

  return views;
}

async function buildRunView(
  user: AuthenticatedUser,
  run: ReturnType<typeof buildTestRenewalSimulation>,
  label: string,
) {
  let resolutions: LeaseRenewalResolutionRecord[] = [];
  let approvals: LeaseRenewalWritebackApprovalRecord[] = [];
  try {
    resolutions = await listResolutionsForRun(user, run.runId);
    approvals = await listWritebackApprovalsForRun(user, run.runId);
  } catch {
    // ADC/Firestore unavailable — the deterministic flags still render; resolution + approval state
    // degrade to open/awaiting without asserting that a decision exists.
  }
  return buildRenewalRunView(run, resolutions, label, approvals);
}
