// Server-only loaders for the owner-gated LIVE Renewal Desk (read-only / draft-only).
//
// This module projects the neutral `RenewalDeskView` / `RenewalLeaseWorkspace` shapes from a REAL
// live read, so the
// existing `RenewalDesk` / `RenewalWorkspace` components render live leases unchanged. It makes exactly
// one RentVine export read (shared, cached) plus one Google Sheet read, then reconciles each lease's
// rent through the REAL pipeline (`runRenewalPipeline`) so the desk's conflict / data-check state is the
// genuine reconciliation, never fabricated.
//
// GOVERNANCE, held intact:
//   • Draft-only: this module never composes or sends a message. The only send path stays the existing
//     gated `/api/lease-renewal/renewal-notice-draft`, surfaced by `RenewalNoticeDraftComposer`.
//   • Read-only sheet: it reads the renewal sheet; it never writes back.
//   • PII-safe: lease values live only inside the returned view (rendered inside the auth boundary).
//     Nothing here is logged; on failure it returns an error CATEGORY only, never the message.
//
// Pure over injected config (defaults to env), with no Date.now() — the read timestamp is an input.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import {
  RENTVINE_SOURCE,
  RENTVINE_SOURCE_SYSTEM,
  leaseAddressLabel,
  leaseCurrentRent,
  leaseEndDateIso,
  leaseTenantName,
  mapLeasesToNonSheetCandidates,
} from "@/lib/integrations/rentvine/lease-mapper";
import {
  classifyRenewalCohort,
  type CohortLease,
  type DateWindow,
} from "@/lib/lease-renewal/cohort";
import {
  buildLiveRenewalConfig,
  type LiveRenewalConfig,
} from "@/lib/lease-renewal/live-config";
import {
  getLiveLeaseSnapshot,
  type LiveLeaseCurrency,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  runRenewalPipeline,
  type ReconciledFieldOutcome,
} from "@/lib/lease-renewal/pipeline";
import type { ReconCandidate } from "@/lib/lease-renewal/reconciliation";
import {
  buildOwnerRenewalDraft,
  ownerDraftMarketFromBasis,
} from "@/lib/lease-renewal/owner-draft";
import { evaluateRenewalReadiness } from "@/lib/lease-renewal/renewal-readiness";
import {
  DEFAULT_NOTICE_RULE_SET,
  buildEffectiveRuleView,
  detectNoticeStatus,
  resolveNoticeRule,
  type EffectiveRuleView,
} from "@/lib/lease-renewal/notice-rules";
import {
  RENEWAL_STEPS,
  STAGE_NEXT_ACTION,
  humanizeCohortReason,
  type DeskLeaseSummary,
  type DeskReconCandidate,
  type DeskReconItem,
  type RenewalDeskView,
  type RenewalLeaseWorkspace,
} from "@/lib/lease-renewal/desk-model";
import { readRenewalSheetGrids } from "@/lib/google-sheets/read-client";
import type { RawGrid } from "@/lib/lease-renewal/sheet-types";
import {
  effectiveStageIndex,
  type RenewalProgress,
} from "@/lib/lease-renewal/renewal-progress";
import { buildTenantOfferDraft } from "@/lib/lease-renewal/tenant-draft";

// Parity with the live review: the single "Lease Renewal" tab, name join, no cohort pre-filter inside
// the pipeline (the desk classifies the cohort itself). The run id is inert here (the desk never uses
// source_trigger_keys); it only labels the read.
const LIVE_DESK_TABS = ["Lease Renewal"];
const LIVE_DESK_RUN_ID = "live-desk";
const RENT_FIELD_KEY = "current_rent";

/** The desk degrades to one of these typed statuses instead of throwing (mirrors live-notices). */
export type LiveDeskStatus = "not_configured" | "account_mismatch" | "read_error";

export type LiveRenewalDeskResult =
  | { status: "ok"; view: RenewalDeskView }
  | { status: LiveDeskStatus };

export type LiveRenewalLeaseWorkspaceResult =
  | { status: "ok"; workspace: RenewalLeaseWorkspace }
  | { status: LiveDeskStatus | "not_found" };

/** Coerce a RentVine numeric field (number or numeric string) to a finite number, else undefined. */
function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function coerceZip(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = value.trim().match(/^\d{5}/);
  return match ? match[0] : undefined;
}

/**
 * S59: the lease's known unit attributes for the comp lookup, from the LIVE-MEASURED export paths
 * (`unit.beds`, `unit.fullBaths` + half of `unit.halfBaths`, `unit.postalCode` falling back to
 * `property.postalCode`). An absent attribute is omitted, never guessed; `property.propertyTypeID`
 * is a RentVine-internal id with no documented RentCast mapping, so propertyType is deliberately
 * not derived from it.
 */
function compAttributesOf(
  view: RawLease,
): { bedrooms?: number; bathrooms?: number; postalCode?: string } | undefined {
  const unit =
    view.unit && typeof view.unit === "object" && !Array.isArray(view.unit)
      ? (view.unit as Record<string, unknown>)
      : undefined;
  const property =
    view.property && typeof view.property === "object" && !Array.isArray(view.property)
      ? (view.property as Record<string, unknown>)
      : undefined;
  const bedrooms = coerceFiniteNumber(unit?.beds);
  const fullBaths = coerceFiniteNumber(unit?.fullBaths);
  const halfBaths = coerceFiniteNumber(unit?.halfBaths);
  const bathrooms =
    fullBaths !== undefined || halfBaths !== undefined
      ? (fullBaths ?? 0) + 0.5 * (halfBaths ?? 0)
      : undefined;
  const postalCode = coerceZip(unit?.postalCode) ?? coerceZip(property?.postalCode);
  if (bedrooms === undefined && bathrooms === undefined && postalCode === undefined) {
    return undefined;
  }
  return {
    ...(bedrooms !== undefined ? { bedrooms } : {}),
    ...(bathrooms !== undefined && bathrooms > 0 ? { bathrooms } : {}),
    ...(postalCode ? { postalCode } : {}),
  };
}

/** S58: project the cache's currency facts into the serializable desk shape. */
function toDeskCurrency(currency: LiveLeaseCurrency) {
  return {
    state: currency.state,
    readAtIso: new Date(currency.readAtMs).toISOString(),
    ageMs: currency.ageMs,
    refreshing: currency.refreshing,
    lastError: currency.lastError,
  };
}

/** Stable lease id keys (byte-identical to the cohort + the draft route's own resolver). */
function leaseIdOf(view: RawLease): string | undefined {
  for (const key of ["leaseID", "leaseId", "id"]) {
    const value = view[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return undefined;
}

function rentvineCandidate(value: string): DeskReconCandidate {
  return {
    source: RENTVINE_SOURCE,
    sourceSystem: RENTVINE_SOURCE_SYSTEM,
    value,
    confidence: "Verified",
  };
}

function toDeskCandidate(candidate: ReconCandidate): DeskReconCandidate {
  return {
    source: candidate.source,
    sourceSystem: candidate.source_system,
    value: candidate.value === null ? "" : String(candidate.value),
    confidence: candidate.confidence ?? "",
  };
}

/**
 * Map a REAL reconciliation outcome to a Data-check item. A rent "conflict" that the pipeline suppressed
 * (the §2.3 add-on downgrade: `raise_flag` false) is NOT an open conflict, so it reads as reconciled;
 * only a raised conflict shows as "conflict". Agreement passes straight through otherwise.
 */
function outcomeToDeskItem(
  outcome: ReconciledFieldOutcome,
  fieldLabel: string,
): DeskReconItem {
  const recon = outcome.reconciliation;
  const openConflict = recon.raise_flag && recon.agreement === "conflict";
  const agreement: DeskReconItem["agreement"] = openConflict
    ? "conflict"
    : recon.agreement === "conflict"
      ? "agree"
      : recon.agreement;
  return {
    fieldKey: outcome.fieldKey,
    fieldLabel,
    agreement,
    candidates: recon.candidates.map(toDeskCandidate),
  };
}

/**
 * Build one lease's rent Data-check item from the REAL reconciliation. Reconciles ONLY this lease's
 * RentVine candidate against the live sheet (via the real pipeline, so the add-on suppression applies).
 * When the field cannot be reconciled (RentVine carries no rent, or no sheet row matches this lease),
 * it renders a facts-only "Needs input" item rather than fabricating a pass.
 */
function buildRentDeskItem(
  view: RawLease,
  tables: RawGrid[],
  readTimestamp: string,
): DeskReconItem {
  const mapping = mapLeasesToNonSheetCandidates([view], { readTimestamp });
  const run = runRenewalPipeline({
    runId: LIVE_DESK_RUN_ID,
    tables,
    nonSheetCandidates: mapping.candidates,
  });
  const outcome = run.outcomes.find(
    (candidate) =>
      candidate.fieldKey === RENT_FIELD_KEY &&
      candidate.reconciliation.candidates.some((c) => c.source === RENTVINE_SOURCE),
  );
  if (outcome) return outcomeToDeskItem(outcome, "Rent");

  const rent = leaseCurrentRent(view);
  return {
    fieldKey: RENT_FIELD_KEY,
    fieldLabel: "Rent",
    agreement: "missing",
    candidates: rent !== undefined ? [rentvineCandidate(String(rent))] : [],
  };
}

/** The lease-end Data-check item — a RentVine fact (single source). "Needs input" when absent. */
function buildEndDateDeskItem(view: RawLease): DeskReconItem {
  const endIso = leaseEndDateIso(view);
  return {
    fieldKey: "renewal_date",
    fieldLabel: "Lease end date",
    agreement: endIso ? "single_source" : "missing",
    candidates: endIso ? [rentvineCandidate(endIso)] : [],
  };
}

/** One lease's Data-check: rent (real reconciliation) then lease-end (RentVine fact). */
function buildLeaseDataCheck(
  view: RawLease,
  tables: RawGrid[],
  readTimestamp: string,
): DeskReconItem[] {
  return [buildRentDeskItem(view, tables, readTimestamp), buildEndDateDeskItem(view)];
}

function toLiveSummary(
  view: RawLease,
  classification: CohortLease,
  dataCheck?: DeskReconItem[],
  progress?: RenewalProgress | null,
): DeskLeaseSummary {
  const leaseId = classification.leaseId ?? "";
  const isActionable = classification.disposition === "actionable";
  const openConflicts = dataCheck
    ? dataCheck.filter((item) => item.agreement === "conflict").length
    : 0;
  // The stage is the operator's RECORDED progress when present, otherwise derived from the live read:
  // still on the data check while a conflict is open, otherwise ready for the owner decision. Typed as a
  // plain number (not a literal union) so the `>= 0` guarded tuple indexing matches the sample projection.
  const derivedStage = openConflicts > 0 ? 0 : 1;
  const stageIndex: number = isActionable
    ? effectiveStageIndex(progress ?? null, derivedStage)
    : -1;
  return {
    id: leaseId,
    addressLabel: leaseAddressLabel(view) ?? `Lease ${leaseId}`,
    tenantNameLabel: leaseTenantName(view) ?? `Lease ${leaseId}`,
    endDateIso: classification.endDateIso,
    disposition: classification.disposition,
    reason: classification.reason,
    reasonLabel: humanizeCohortReason(classification.reason),
    stageIndex,
    stageLabel: stageIndex >= 0 ? RENEWAL_STEPS[stageIndex].label : null,
    nextAction: stageIndex >= 0 ? STAGE_NEXT_ACTION[stageIndex] : null,
    openConflicts,
  };
}

function buildLiveNotice(
  endDateIso: string | null,
  referenceDateIso: string,
): EffectiveRuleView | null {
  if (!endDateIso) return null;
  // Live surfaces read the built-in default rule set (values UNVERIFIED); there is no per-lease rule
  // override, so the empty context resolves to those defaults with provenance shown on the view.
  const rule = resolveNoticeRule(DEFAULT_NOTICE_RULE_SET, {});
  return buildEffectiveRuleView(
    rule,
    detectNoticeStatus(
      rule,
      {
        leaseEndDateIso: endDateIso,
        renewalLetterSentIso: null,
        tenantResponded: false,
      },
      referenceDateIso,
    ),
  );
}

/**
 * Load the live Renewal Desk (read-only). One shared RentVine export read + one Sheet read; classifies
 * the cohort and, for each actionable lease, reconciles its rent through the REAL pipeline so the open
 * conflict count is genuine. `config` is injectable for tests. Returns a typed degrade status instead of
 * throwing, and never surfaces the underlying error message (PII / config safety).
 */
export async function loadLiveRenewalDesk(
  windows: DateWindow[],
  readTimestamp: string,
  config: LiveRenewalConfig = buildLiveRenewalConfig(),
  progressByLease?: Map<string, RenewalProgress>,
): Promise<LiveRenewalDeskResult> {
  if (!config.ok) return { status: config.reason };
  try {
    const { snapshot, currency } = await getLiveLeaseSnapshot(
      config.rentvineClient,
      Date.parse(readTimestamp),
    );
    const { views, complete } = snapshot;
    const { tables } = await readRenewalSheetGrids({
      reader: config.sheetsReader,
      spreadsheetId: config.spreadsheetId,
      tabTitles: LIVE_DESK_TABS,
    });
    const cohort = classifyRenewalCohort(views, { windows });
    const summaries = cohort.classifications.map((classification) => {
      const view = views[classification.index];
      const progress = classification.leaseId
        ? (progressByLease?.get(classification.leaseId) ?? null)
        : null;
      if (classification.disposition === "actionable") {
        return toLiveSummary(
          view,
          classification,
          buildLeaseDataCheck(view, tables, readTimestamp),
          progress,
        );
      }
      return toLiveSummary(view, classification);
    });

    return {
      status: "ok",
      view: {
        windows,
        cohort,
        // S57: a paged read that hit its page cap is rendered as an explicit partial, never as the
        // portfolio. The desk component keys its incomplete-read notice off this flag.
        readComplete: complete,
        // S58: the snapshot's age facts drive the desk's four-state currency banner.
        dataCurrency: toDeskCurrency(currency),
        actionable: summaries.filter((s) => s.disposition === "actionable"),
        review: summaries.filter((s) => s.disposition === "review"),
        skipped: summaries.filter((s) => s.disposition === "skip"),
        outOfWindow: summaries.filter((s) => s.disposition === "out_of_window"),
      },
    };
  } catch {
    return { status: "read_error" };
  }
}

/**
 * Load ONE live lease's renewal workspace by RentVine id (read-only / draft-only). Resolves the lease
 * from the shared live read, reconciles its rent through the REAL pipeline for the Data-check, and builds
 * the owner draft + notice view + readiness checklist from live facts via the existing builders. The
 * tenant/owner email step is drafted only through the gated live composer (never here), so `tenantDraft`
 * stays null. Returns `not_found` for an unknown or non-actionable lease, or a typed degrade status.
 */
export async function loadLiveRenewalLeaseWorkspace(
  leaseId: string,
  readTimestamp: string,
  config: LiveRenewalConfig = buildLiveRenewalConfig(),
  progress: RenewalProgress | null = null,
  // S29: an Admin-approved comp-derived rent number, resolved server-side by the caller from the
  // rent-suggestion control plane. When present it flows into the owner-draft preview with its distinct
  // "Comp-derived suggestion (Admin-approved)" source label. Absent → the draft is unchanged.
  approvedSuggestion: {
    value: number;
    comps: { rent: number; source: string; label?: string }[];
  } | null = null,
): Promise<LiveRenewalLeaseWorkspaceResult> {
  if (!config.ok) return { status: config.reason };
  try {
    const { snapshot, currency } = await getLiveLeaseSnapshot(
      config.rentvineClient,
      Date.parse(readTimestamp),
    );
    const { views, complete } = snapshot;
    const view = views.find((candidate) => leaseIdOf(candidate) === leaseId);
    // S57: an incomplete read cannot prove absence — a lease missing from a partial portfolio reads
    // as a failed read, never as "not found".
    if (!view) return { status: complete ? "not_found" : "read_error" };

    // Classify this one lease against its own end-date window, so its disposition matches what the desk
    // shows for a linked (actionable) lease without threading the page's batch windows through.
    const endIso = leaseEndDateIso(view);
    const windows: DateWindow[] = endIso ? [{ startIso: endIso, endIso }] : [];
    const classification = classifyRenewalCohort([view], { windows }).classifications[0];
    if (classification.disposition !== "actionable") return { status: "not_found" };

    const { tables } = await readRenewalSheetGrids({
      reader: config.sheetsReader,
      spreadsheetId: config.spreadsheetId,
      tabTitles: LIVE_DESK_TABS,
    });
    const dataCheck = buildLeaseDataCheck(view, tables, readTimestamp);
    // S59: known unit attributes for the comp lookup; absent stays absent.
    const compAttributes = compAttributesOf(view);
    const summary = toLiveSummary(view, classification, dataCheck, progress);

    // Once the owner decision is RECORDED, the Tenant-offer step shows a real offer built from those
    // numbers (not a placeholder). Without a recorded decision — or a lease with no end date — it stays
    // null and the Tenant-offer card invites composing below. The gated composer is still the only send.
    const endDateIso = classification.endDateIso;
    const tenantDraft =
      progress?.ownerDecision && endDateIso
        ? buildTenantOfferDraft({
            tenantNameLabel: summary.tenantNameLabel,
            leaseEndDateIso: endDateIso,
            ownerDecision: progress.ownerDecision.decision,
            offeredRent: progress.ownerDecision.offeredRent,
            ...(progress.ownerDecision.charges
              ? { charges: progress.ownerDecision.charges }
              : {}),
            ...(progress.ownerDecision.infoFormUrl
              ? { infoFormUrl: progress.ownerDecision.infoFormUrl }
              : {}),
          })
        : null;

    const workspace: RenewalLeaseWorkspace = {
      summary,
      steps: RENEWAL_STEPS,
      currentStepIndex: summary.stageIndex >= 0 ? summary.stageIndex : 0,
      dataCheck,
      // A degenerate rentless lease has no meaningful owner draft; the Data-check reports the missing
      // rent as "Needs input" and the gated composer blocks an owner notice without a rent.
      ownerDraft: buildOwnerRenewalDraft({
        addressLabel: summary.addressLabel,
        currentRent: leaseCurrentRent(view) ?? 0,
        // Feed the recorded comp basis so the owner email shows the provider/manual range + PMI number
        // source-tagged. Absent comps stay absent (visible Needs Verification markers) — never invented.
        // S29: an Admin-approved comp-derived number (server-resolved) rides in with its distinct source
        // label and takes precedence over the operator's own PMI number; an unapproved suggestion never does.
        ...(progress?.ownerDecision?.market || approvedSuggestion
          ? {
              market: {
                ...(progress?.ownerDecision?.market
                  ? ownerDraftMarketFromBasis(progress.ownerDecision.market)
                  : {}),
                ...(approvedSuggestion
                  ? {
                      approvedSuggestion: {
                        value: approvedSuggestion.value,
                        comps: approvedSuggestion.comps,
                      },
                    }
                  : {}),
              },
            }
          : {}),
      }),
      tenantDraft,
      // RentVine carries none of the build-out readiness inputs, so every check honestly reads
      // "Needs input" rather than a fabricated pass.
      readiness: evaluateRenewalReadiness({}),
      notice: buildLiveNotice(endDateIso, readTimestamp.slice(0, 10)),
      // The operator's recorded progress drives the Phase-A controls in the workspace UI.
      live: {
        leaseId,
        ownerDecision: progress?.ownerDecision ?? null,
        tenantOfferDraftId: progress?.tenantOfferDraftId ?? null,
        complete: progress?.complete ?? false,
      },
      // S58: expired data disables compose/record controls in the workspace UI; the routes refuse
      // server-side regardless.
      dataCurrency: toDeskCurrency(currency),
      ...(compAttributes ? { compAttributes } : {}),
      // S60: the authoritative rent for the internal under-market signal (never a draft input).
      ...(leaseCurrentRent(view) !== undefined
        ? { currentRent: leaseCurrentRent(view) }
        : {}),
    };
    return { status: "ok", workspace };
  } catch {
    return { status: "read_error" };
  }
}
