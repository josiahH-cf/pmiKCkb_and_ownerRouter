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
import { RenewalReviewUnavailableError } from "@/lib/lease-renewal/review-readiness";

export interface RenewalRunViewContext {
  views: RenewalRunView[];
  /** The same current-source runs from which `views` were projected. */
  runs: RenewalRunResult[];
  sourceStatus: "available" | "stale" | "expired" | Exclude<LiveReviewStatus, "ok">;
  overlayStatus: "available" | "unavailable";
  sourceReadAtIso?: string;
}

/**
 * Build the value-free Approval projection from the one Live-backed renewal review. Connection,
 * Firestore, or source-read failures degrade to no rows and never substitute invented records.
 */
export async function loadRenewalRunViewContext(
  user: AuthenticatedUser,
  options?: { readonly displayOnly?: boolean },
): Promise<RenewalRunViewContext> {
  let overlayStatus: RenewalRunViewContext["overlayStatus"] = "available";
  const overlay = Promise.all([
    listResolutionsForRun(user, LIVE_REVIEW_RUN_ID),
    listWritebackApprovalsForRun(user, LIVE_REVIEW_RUN_ID),
  ]).then(
    ([resolutions, approvals]) => ({ resolutions, approvals }),
    () => {
      overlayStatus = "unavailable";
      return { resolutions: [], approvals: [] };
    },
  );

  const at = new Date().toISOString();
  const outcome = options?.displayOnly
    ? await loadLiveRenewalReview(user, at, overlay, options)
    : await loadLiveRenewalReview(user, at, overlay);
  return outcome.status === "ok"
    ? {
        views: [outcome.view],
        runs: [outcome.run],
        sourceStatus:
          outcome.meta.currencyState === "fresh"
            ? "available"
            : outcome.meta.currencyState,
        overlayStatus,
        ...(outcome.meta.readAtIso ? { sourceReadAtIso: outcome.meta.readAtIso } : {}),
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
  options?: { readonly displayOnly?: boolean },
): Promise<RenewalRunView[]> {
  const context = await loadRenewalRunViewContext(user, options);
  // S280 R-S280-4: a stale or expired read still throws (no caller may decide on it), and carries
  // its views so the Dashboard can keep them as retained rows with their read time.
  if (context.sourceStatus !== "available" || context.overlayStatus !== "available")
    throw new RenewalReviewUnavailableError(context);
  return context.views;
}
