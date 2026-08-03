// Server gather for Approval/Attention renewal projections. Production is Live-only: this module
// reads the ordinary Live review and never constructs deterministic sample or persisted Test runs.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import { listWritebackApprovalsForRun } from "@/lib/firestore/lease-renewal-writeback-approvals";
import {
  LIVE_REVIEW_RUN_ID,
  loadLiveRenewalReview,
} from "@/lib/lease-renewal/live-review";
import type { RenewalRunView } from "@/lib/lease-renewal/run-view";

/**
 * Build the value-free Approval projection from the one Live-backed renewal review. Connection,
 * Firestore, or source-read failures degrade to no rows and never substitute invented records.
 */
export async function loadRenewalRunViews(
  user: AuthenticatedUser,
): Promise<RenewalRunView[]> {
  let resolutions: Awaited<ReturnType<typeof listResolutionsForRun>> = [];
  let approvals: Awaited<ReturnType<typeof listWritebackApprovalsForRun>> = [];
  try {
    [resolutions, approvals] = await Promise.all([
      listResolutionsForRun(user, LIVE_REVIEW_RUN_ID),
      listWritebackApprovalsForRun(user, LIVE_REVIEW_RUN_ID),
    ]);
  } catch {
    // The Live read remains useful without saved decision overlays.
  }

  const outcome = await loadLiveRenewalReview(new Date().toISOString(), {
    resolutions,
    approvals,
  });
  return outcome.status === "ok" ? [outcome.view] : [];
}
