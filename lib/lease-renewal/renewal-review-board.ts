// Server gather for Approval/Attention renewal projections. Production is Live-only: this module
// reads the ordinary Live review and never constructs deterministic sample or persisted Test runs.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { listResolutionsForRun } from "@/lib/firestore/lease-renewal-resolutions";
import { listWritebackApprovalsForRun } from "@/lib/firestore/lease-renewal-writeback-approvals";
import {
  LIVE_REVIEW_RUN_ID,
  loadLiveRenewalReview,
  type LiveReviewStatus,
} from "@/lib/lease-renewal/live-review";
import type { RenewalRunView } from "@/lib/lease-renewal/run-view";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";

export interface RenewalRunViewContext {
  views: RenewalRunView[];
  /** The same current-source runs from which `views` were projected. */
  runs: RenewalRunResult[];
  sourceStatus: "available" | Exclude<LiveReviewStatus, "ok">;
  overlayStatus: "available" | "unavailable";
}

/**
 * Build the value-free Approval projection from the one Live-backed renewal review. Connection,
 * Firestore, or source-read failures degrade to no rows and never substitute invented records.
 */
export async function loadRenewalRunViewContext(
  user: AuthenticatedUser,
): Promise<RenewalRunViewContext> {
  let resolutions: Awaited<ReturnType<typeof listResolutionsForRun>> = [];
  let approvals: Awaited<ReturnType<typeof listWritebackApprovalsForRun>> = [];
  let overlayStatus: RenewalRunViewContext["overlayStatus"] = "available";
  try {
    [resolutions, approvals] = await Promise.all([
      listResolutionsForRun(user, LIVE_REVIEW_RUN_ID),
      listWritebackApprovalsForRun(user, LIVE_REVIEW_RUN_ID),
    ]);
  } catch {
    // The Live read remains useful without saved decision overlays.
    overlayStatus = "unavailable";
  }

  const outcome = await loadLiveRenewalReview(new Date().toISOString(), {
    resolutions,
    approvals,
  });
  return outcome.status === "ok"
    ? {
        views: [outcome.view],
        runs: [outcome.run],
        sourceStatus: "available",
        overlayStatus,
      }
    : {
        views: [],
        runs: [],
        sourceStatus: outcome.status,
        overlayStatus,
      };
}

export async function loadRenewalRunViews(
  user: AuthenticatedUser,
): Promise<RenewalRunView[]> {
  return (await loadRenewalRunViewContext(user)).views;
}
