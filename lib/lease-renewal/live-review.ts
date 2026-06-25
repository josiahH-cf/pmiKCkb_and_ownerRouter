// Server-only orchestrator for the owner-gated live renewal review.
//
// Builds the live clients, runs the fully-live read-only review (one Google Sheet read + one RentVine
// read), and projects the result into the SAME serialization-safe RenewalRunView the simulation
// review already renders. The review is read-only: it carries `production_allowed: false`, makes no
// write, and performs no system-of-record update.
//
// Returns a discriminated outcome so the page can degrade to a clear panel when the sources are not
// connected or a read fails — error CATEGORIES only, never the underlying message (which could carry
// configuration detail). The PII values live inside the returned view and are rendered only inside the
// authenticated app (design §6.1); they are never logged here.

import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import { runFullyLiveRenewalReview } from "@/lib/lease-renewal/live-run";
import { buildRenewalRunView, type RenewalRunView } from "@/lib/lease-renewal/run-view";
import { RentVineAuthError } from "@/lib/integrations/rentvine/client";

const LIVE_REVIEW_LABEL = "Live renewal review";
// Parity with `smoke:renewal-review --live`: the single "Lease Renewal" tab, fuzzy (name) join, the
// full lease set (no cohort pre-filter). This reproduces the calibration result reviewers have seen.
const LIVE_REVIEW_TABS = ["Lease Renewal"];

export interface LiveReviewMeta {
  sheetTabsRead: number;
  liveRentvineCandidates: number;
  skippedLeases: number;
  productionAllowed: boolean;
}

export type LiveReviewStatus =
  | "ok"
  | "not_configured"
  | "account_mismatch"
  | "auth_error"
  | "read_error";

export type LiveReviewOutcome =
  | { status: "ok"; view: RenewalRunView; meta: LiveReviewMeta }
  | { status: Exclude<LiveReviewStatus, "ok"> };

// Heuristic markers of an authentication/authorization failure (stale ADC, blocked scope, bad/expired
// RentVine credentials). Anything else is treated as a transient read error.
const AUTH_HINT_RE =
  /credential|token|\bauth\b|ADC|default credentials|invalid_grant|invalid_rapt|\brapt\b|permission|unauthor|forbidden|401|403/i;

/** Map a thrown live-read error to a safe category. Pure; surfaces no message. */
export function categorizeLiveReviewError(error: unknown): "auth_error" | "read_error" {
  if (error instanceof RentVineAuthError) return "auth_error";
  const message = error instanceof Error ? error.message : String(error);
  return AUTH_HINT_RE.test(message) ? "auth_error" : "read_error";
}

/**
 * Run the owner-gated live review (read-only). Reads process.env for config and makes exactly one
 * Sheet read + one RentVine read. `readTimestamp` is injected by the caller so this module has no
 * Date dependency (matching the pipeline's no-Date.now() discipline).
 */
export async function loadLiveRenewalReview(
  readTimestamp: string,
): Promise<LiveReviewOutcome> {
  const config = buildLiveRenewalConfig();
  if (!config.ok) return { status: config.reason };

  try {
    const result = await runFullyLiveRenewalReview({
      rentvineClient: config.rentvineClient,
      sheetsReader: config.sheetsReader,
      spreadsheetId: config.spreadsheetId,
      tabTitles: LIVE_REVIEW_TABS,
      runId: "live-review",
      readTimestamp,
    });

    return {
      status: "ok",
      view: buildRenewalRunView(result.run, [], LIVE_REVIEW_LABEL),
      meta: {
        sheetTabsRead: result.sheetTabsRead,
        liveRentvineCandidates: result.liveRentvineCandidates,
        skippedLeases: result.skippedLeases,
        productionAllowed: result.run.production_allowed,
      },
    };
  } catch (error) {
    return { status: categorizeLiveReviewError(error) };
  }
}
