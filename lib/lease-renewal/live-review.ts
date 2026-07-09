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
import {
  runFullyLiveRenewalReview,
  type FullyLiveRenewalRunResult,
} from "@/lib/lease-renewal/live-run";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";
import { buildRenewalRunView, type RenewalRunView } from "@/lib/lease-renewal/run-view";
import { RentVineAuthError } from "@/lib/integrations/rentvine/client";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalActivityRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";

const LIVE_REVIEW_LABEL = "Live renewal review";
// Shared run id for the live review. The resolve route rebuilds this run to match a flag by
// source_trigger_key (`lease_renewal:reconcile:live-review:{field}`), which is derived from
// runId + field_key only — so a rebuild at resolve time lines up with the flag rendered on the page.
export const LIVE_REVIEW_RUN_ID = "live-review";
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

/**
 * Persisted-decision overlay for the live review. All optional; the live page loads them (try/catch)
 * for run_id LIVE_REVIEW_RUN_ID and threads them so the live surface shows the SAME saved
 * resolutions / approvals / decision history the run page shows. The page omits it (defaults empty)
 * when Firestore is unavailable, degrading to an unresolved view.
 */
export interface LiveReviewOverlay {
  resolutions?: LeaseRenewalResolutionRecord[];
  approvals?: LeaseRenewalWritebackApprovalRecord[];
  activityByKey?: ReadonlyMap<string, LeaseRenewalWritebackApprovalActivityRecord[]>;
}

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
 * Internal shared run builder. Builds the live config, runs the fully-live read-only review with the
 * SAME tabs + runId used everywhere else (so a rebuild's source_trigger_keys line up with the page
 * render), and maps any thrown read error to a safe category. Reused by loadLiveRenewalReview (which
 * projects the view) and rebuildLiveRenewalRun (which the resolve route matches a flag against).
 * `readTimestamp` is injected by the caller so this module has no Date dependency.
 */
async function runLiveReview(
  readTimestamp: string,
): Promise<
  | { status: "ok"; result: FullyLiveRenewalRunResult }
  | { status: Exclude<LiveReviewStatus, "ok"> }
> {
  const config = buildLiveRenewalConfig();
  if (!config.ok) return { status: config.reason };

  try {
    const result = await runFullyLiveRenewalReview({
      rentvineClient: config.rentvineClient,
      sheetsReader: config.sheetsReader,
      spreadsheetId: config.spreadsheetId,
      tabTitles: LIVE_REVIEW_TABS,
      runId: LIVE_REVIEW_RUN_ID,
      readTimestamp,
    });
    return { status: "ok", result };
  } catch (error) {
    return { status: categorizeLiveReviewError(error) };
  }
}

/**
 * Run the owner-gated live review (read-only). Reads process.env for config and makes exactly one
 * Sheet read + one RentVine read. `readTimestamp` is injected by the caller so this module has no
 * Date dependency (matching the pipeline's no-Date.now() discipline). The optional `overlay` layers
 * the persisted resolutions / approvals / decision history onto the projected view (the live page
 * loads them for run_id LIVE_REVIEW_RUN_ID and degrades to an unresolved view when Firestore fails).
 */
export async function loadLiveRenewalReview(
  readTimestamp: string,
  overlay: LiveReviewOverlay = {},
): Promise<LiveReviewOutcome> {
  const outcome = await runLiveReview(readTimestamp);
  if (outcome.status !== "ok") return { status: outcome.status };

  const { result } = outcome;
  return {
    status: "ok",
    view: buildRenewalRunView(
      result.run,
      overlay.resolutions ?? [],
      LIVE_REVIEW_LABEL,
      overlay.approvals ?? [],
      overlay.activityByKey ?? new Map(),
    ),
    meta: {
      sheetTabsRead: result.sheetTabsRead,
      liveRentvineCandidates: result.liveRentvineCandidates,
      skippedLeases: result.skippedLeases,
      productionAllowed: result.run.production_allowed,
    },
  };
}

/**
 * Rebuild ONLY the live-review run (no view projection) for the resolve route to match a flag by
 * source_trigger_key. Returns null when the live sources are unconfigured or a read fails — it never
 * throws and never surfaces the underlying error (which could carry configuration detail). Shares
 * runLiveReview with loadLiveRenewalReview so the rebuilt run uses the identical tabs + runId.
 */
export async function rebuildLiveRenewalRun(
  readTimestamp: string,
): Promise<RenewalRunResult | null> {
  const outcome = await runLiveReview(readTimestamp);
  return outcome.status === "ok" ? outcome.result.run : null;
}
