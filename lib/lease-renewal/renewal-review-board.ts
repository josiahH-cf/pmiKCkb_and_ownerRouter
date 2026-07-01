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
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import { listWritebackApprovalsForRun } from "@/lib/firestore/lease-renewal-writeback-approvals";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import { buildRenewalRunView, type RenewalRunView } from "@/lib/lease-renewal/run-view";
import { getSimulationRun, listSimulationRuns } from "@/lib/lease-renewal/simulation";

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

    let resolutions: LeaseRenewalResolutionRecord[] = [];
    let approvals: LeaseRenewalWritebackApprovalRecord[] = [];
    try {
      resolutions = await listResolutionsForRun(user, summary.runId);
      approvals = await listWritebackApprovalsForRun(user, summary.runId);
    } catch {
      // ADC/Firestore unavailable — the flags still render; resolution + approval state degrade
      // to "open / awaiting".
      resolutions = [];
      approvals = [];
    }

    views.push(buildRenewalRunView(run, resolutions, summary.label, approvals));
  }

  return views;
}
