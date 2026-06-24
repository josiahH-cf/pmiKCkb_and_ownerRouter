// Live renewal review entrypoint (read-only): swap the synthetic Rentvine feed for a real read.
//
// This is the additive sibling of `simulation.ts:getSimulationRun` — it is NOT wired into the SSR run
// page (which keeps rendering the pure simulation, so a page render never makes a network call). A
// live review is reached only through the opt-in smoke / a future feature-flagged route.
//
// It reads leases from Rentvine (read-only export) and maps them to the `source: "rentvine"`
// NonSheetCandidates the pipeline already reconciles. The sheet `tables` stay the synthetic sample
// until the live Google Sheet read lands (OQ-SHEET-1); they are injectable so that swap is a one-arg
// change. The building-level / Google-Form candidates also stay synthetic (separately gated). The
// pipeline result still carries `production_allowed: false` and a counts-only manifest — no writes.

import type { RentVineClient } from "@/lib/integrations/rentvine/client";
import {
  RENTVINE_SOURCE,
  leaseViewsFromExport,
  mapLeasesToNonSheetCandidates,
  type RentVineLeaseFieldMap,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  runRenewalPipeline,
  type NonSheetCandidate,
  type RenewalRunResult,
} from "@/lib/lease-renewal/pipeline";
import {
  SAMPLE_NON_SHEET_CANDIDATES,
  SAMPLE_RENEWAL_TABLES,
} from "@/lib/lease-renewal/sample-sheet";
import type { RawGrid } from "@/lib/lease-renewal/sheet-types";
import {
  readRenewalSheetGrids,
  type SheetsValuesReader,
} from "@/lib/google-sheets/read-client";

export interface LiveRenewalRunOptions {
  /** Only the read-only export read is used — a fake satisfies this in tests. */
  rentvineClient: Pick<RentVineClient, "listLeasesExport">;
  runId: string;
  /** Read timestamp captured at read time; accepted as INPUT, never Date.now(). */
  readTimestamp: string;
  fieldMap?: RentVineLeaseFieldMap;
  /** Optional Rentvine export query params (e.g. a lease-end window). */
  listParams?: Record<string, string | number>;
  /** Sheet grids; defaults to the synthetic sample until the live Sheet read (OQ-SHEET-1) lands. */
  tables?: RawGrid[];
  /**
   * Non-sheet candidates other than the live Rentvine read (building-level / Google Form). Defaults
   * to the synthetic set with the `source: "rentvine"` entries removed (those come from the live read).
   */
  otherCandidates?: NonSheetCandidate[];
}

export interface LiveRenewalRunResult {
  run: RenewalRunResult;
  liveRentvineCandidates: number;
  skippedLeases: number;
}

/**
 * Run the Phase-1 review over a live Rentvine read (read-only). Returns the pipeline result plus the
 * count of live candidates and skipped leases. Makes exactly one Rentvine read; no writes.
 */
export async function runLiveRenewalReview(
  options: LiveRenewalRunOptions,
): Promise<LiveRenewalRunResult> {
  const rows = await options.rentvineClient.listLeasesExport(options.listParams);
  const views = leaseViewsFromExport(rows);
  const mapping = mapLeasesToNonSheetCandidates(views, {
    readTimestamp: options.readTimestamp,
    fieldMap: options.fieldMap,
  });

  const others = (options.otherCandidates ?? SAMPLE_NON_SHEET_CANDIDATES).filter(
    (candidate) => candidate.source !== RENTVINE_SOURCE,
  );

  const run = runRenewalPipeline({
    runId: options.runId,
    tables: options.tables ?? SAMPLE_RENEWAL_TABLES,
    nonSheetCandidates: [...mapping.candidates, ...others],
  });

  return {
    run,
    liveRentvineCandidates: mapping.candidates.length,
    skippedLeases: mapping.skipped,
  };
}

export interface FullyLiveRenewalRunOptions extends Omit<
  LiveRenewalRunOptions,
  "tables"
> {
  /** Read-only Sheets reader (injected; a fake satisfies this in tests). */
  sheetsReader: SheetsValuesReader;
  spreadsheetId: string;
  /** In-scope tab titles; omit to read every tab (credential tabs excluded downstream by ingest). */
  tabTitles?: string[];
}

export interface FullyLiveRenewalRunResult extends LiveRenewalRunResult {
  /** Number of sheet tabs read into RawGrid[]. */
  sheetTabsRead: number;
}

/**
 * Run the Phase-1 review over BOTH live reads (read-only): the live Google Sheet provides the
 * `tables`, the live Rentvine export provides the `source: "rentvine"` candidates. One sheet read +
 * one Rentvine read; no writes. The result still carries `production_allowed: false`.
 */
export async function runFullyLiveRenewalReview(
  options: FullyLiveRenewalRunOptions,
): Promise<FullyLiveRenewalRunResult> {
  const sheet = await readRenewalSheetGrids({
    reader: options.sheetsReader,
    spreadsheetId: options.spreadsheetId,
    tabTitles: options.tabTitles,
  });
  const result = await runLiveRenewalReview({
    rentvineClient: options.rentvineClient,
    runId: options.runId,
    readTimestamp: options.readTimestamp,
    fieldMap: options.fieldMap,
    listParams: options.listParams,
    otherCandidates: options.otherCandidates,
    tables: sheet.tables,
  });
  return { ...result, sheetTabsRead: sheet.tables.length };
}
