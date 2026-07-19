// Live renewal-notices desk data: read the live RentVine leases, keep the actionable renewal cohort,
// and project each to a compact row the notices page renders a draft composer for. Server-only read;
// no writes. The row builder is pure (injectable views + windows); the loader wraps it with the cached
// live RentVine read and degrades to a typed status when the source is not connected.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseTenantName } from "@/lib/integrations/rentvine/lease-mapper";
import { classifyRenewalCohort, type DateWindow } from "@/lib/lease-renewal/cohort";
import {
  buildLiveRentVineConfig,
  type LiveRentVineConfig,
} from "@/lib/lease-renewal/live-config";
import { getLiveLeaseViews } from "@/lib/lease-renewal/live-lease-cache";
import { resolveRenewalRecipient } from "@/lib/lease-renewal/recipient-resolution";

export interface LiveRenewalNoticeRow {
  /** The RentVine lease id the composer drafts against (as the export exposes it, e.g. "4821"). */
  leaseId: string;
  tenantName?: string;
  leaseEndIso?: string;
  /** Whether a verified recipient resolves for each channel today (drives the "ready"/"needs" chips). */
  tenantRecipientVerified: boolean;
  ownerRecipientVerified: boolean;
}

export type LiveRenewalNoticesResult =
  | { status: "ok"; rows: LiveRenewalNoticeRow[]; scanned: number }
  | { status: "not_configured" | "account_mismatch" | "read_error" };

/**
 * Project live lease views to actionable renewal-notice rows. Pure and deterministic: an id-less lease
 * is dropped (there is nothing to draft against); tenant name is best-effort and omitted when absent.
 */
export function buildLiveRenewalNoticeRows(
  views: RawLease[],
  windows: DateWindow[],
): LiveRenewalNoticeRow[] {
  const cohort = classifyRenewalCohort(views, { windows });
  const rows: LiveRenewalNoticeRow[] = [];
  for (const classification of cohort.actionable) {
    if (!classification.leaseId) continue;
    const view = views[classification.index];
    const tenantName = leaseTenantName(view);
    rows.push({
      leaseId: classification.leaseId,
      ...(tenantName ? { tenantName } : {}),
      ...(classification.endDateIso ? { leaseEndIso: classification.endDateIso } : {}),
      tenantRecipientVerified: resolveRenewalRecipient({ lease: view, channel: "tenant" })
        .verified,
      ownerRecipientVerified: resolveRenewalRecipient({ lease: view, channel: "owner" })
        .verified,
    });
  }
  return rows;
}

/**
 * Load the live renewal-notice rows via one RentVine export read. Returns a typed degraded status
 * (`not_configured`/`account_mismatch`/`read_error`) instead of throwing, so the page renders a clear
 * panel. `config` is injectable for tests.
 */
export async function loadLiveRenewalNotices(
  windows: DateWindow[],
  readTimestamp: string,
  config: LiveRentVineConfig = buildLiveRentVineConfig(),
): Promise<LiveRenewalNoticesResult> {
  if (!config.ok) return { status: config.reason };
  try {
    // Shared short-TTL cache: the desk render + the Preview/Create reads coalesce to one export read.
    const views = await getLiveLeaseViews(
      config.rentvineClient,
      Date.parse(readTimestamp),
    );
    return {
      status: "ok",
      rows: buildLiveRenewalNoticeRows(views, windows),
      scanned: views.length,
    };
  } catch {
    return { status: "read_error" };
  }
}
