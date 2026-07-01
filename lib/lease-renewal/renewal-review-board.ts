// Server gather for the Approval Queue's renewal review sub-tab (OQ-UI-1). Assembles the value-free
// review board from the deterministic simulation runs, layering in persisted resolutions so the board
// can show what still needs a human. Flags are computed deterministically (no Firestore needed), so a
// resolutions read failure degrades to "nothing resolved yet" rather than hiding the review entirely.
//
// Read-only: no writes, `production_allowed: false` upstream. The board only routes Dan to the built
// resolve surface; it never resolves, approves, or writes anything itself.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import { listWritebackApprovalsForRun } from "@/lib/firestore/lease-renewal-writeback-approvals";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import {
  buildRenewalReviewBoard,
  type RenewalReviewBoard,
} from "@/lib/approval/renewal-review";
import { buildRenewalRunView } from "@/lib/lease-renewal/run-view";
import { getSimulationRun, listSimulationRuns } from "@/lib/lease-renewal/simulation";

/**
 * Load the renewal review board for the current user. Never throws: reconciliation flags are
 * deterministic, so only the per-run resolution overlay can fail, and it degrades to an empty
 * resolution set. Returns an empty board when no runs exist.
 */
export async function loadRenewalReviewBoard(
  user: AuthenticatedUser,
): Promise<RenewalReviewBoard> {
  const summaries = listSimulationRuns();
  const views = [];

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

  return buildRenewalReviewBoard(views);
}
