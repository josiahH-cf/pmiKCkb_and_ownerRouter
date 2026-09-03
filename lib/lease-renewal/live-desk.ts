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
  leaseCurrentRent,
  leaseEndDateIso,
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
  getLiveLeaseSnapshotAtOrAfter,
  type AttemptedLiveLeaseSnapshotResult,
  type LiveLeaseCurrency,
  type LiveLeaseSnapshotResult,
} from "@/lib/lease-renewal/live-lease-cache";
import {
  runRenewalPipeline,
  type ReconciledFieldOutcome,
} from "@/lib/lease-renewal/pipeline";
import type { ReconCandidate } from "@/lib/lease-renewal/reconciliation";
import {
  buildOwnerRenewalDraft,
  ownerDraftMarketFromBasis,
  type OwnerDraftInput,
} from "@/lib/lease-renewal/owner-draft";
import { evaluateRenewalReadiness } from "@/lib/lease-renewal/renewal-readiness";
import {
  DEFAULT_NOTICE_RULE_SET,
  buildEffectiveRuleView,
  detectNoticeStatus,
  resolveNoticeRule,
  type EffectiveRuleView,
  type NoticeRuleSnapshot,
} from "@/lib/lease-renewal/notice-rules";
import type { WorkflowCommunicationLink } from "@/lib/gmail-hub/workflow-context";
import {
  buildRenewalFollowUpProjection,
  type RenewalFollowUpProjectionInput,
  type RenewalProcessWaitingFallback,
} from "@/lib/lease-renewal/follow-up-projection";
import {
  RENEWAL_STEPS,
  STAGE_NEXT_ACTION,
  compareLeaseEndDate,
  humanizeCohortReason,
  type DeskLeaseRow,
  type DeskLeaseSummary,
  type DeskLeaseSummaryBase,
  type DeskReconCandidate,
  type DeskReconItem,
  type RenewalDeskRetentionState,
  type RenewalDeskView,
  type RenewalLeaseWorkspace,
} from "@/lib/lease-renewal/desk-model";
import { buildDeskLeaseGuidance } from "@/lib/lease-renewal/desk-guidance";
import { projectRenewalDeskIdentity } from "@/lib/lease-renewal/desk-identity";
import {
  buildRenewalDeskWindow,
  withRenewalDeskQueryKeys,
} from "@/lib/lease-renewal/desk-query";
import { readRenewalSheetGridsWithLinks } from "@/lib/lease-renewal/sheet-links";
import type { RawGrid } from "@/lib/lease-renewal/sheet-types";
import {
  effectiveStageIndex,
  ownerDecisionIsCurrent,
  type RenewalProgress,
} from "@/lib/lease-renewal/renewal-progress";
import {
  RENEWAL_PROCESS_VERSION,
  buildRenewalEvidenceReference,
  projectRenewalProcess,
  removeRenewalEvidence,
  replaceRenewalEvidence,
  type RenewalEvidenceBlocker,
  type RenewalEvidenceKey,
  type RenewalEvidenceMap,
  type RenewalEvidenceSource,
  type RenewalProcessProjection,
} from "@/lib/lease-renewal/renewal-process";
import { buildTenantOfferDraft } from "@/lib/lease-renewal/tenant-draft";
import { resolveRenewalRecipient } from "@/lib/lease-renewal/recipient-resolution";
import type { LeaseRenewalResolutionRecord } from "@/lib/firestore/types";
import { parseCurrencyInput } from "@/lib/currency-input";
import type { RenewalPacketSnapshot } from "@/lib/lease-documents/packet-types";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { buildRentvineDestination } from "@/lib/lease-renewal/desk-destinations";
import {
  projectEffectiveDataCheck,
  type EffectiveDataCheckProjection,
} from "@/lib/lease-renewal/effective-data-check";

// Parity with the live review: the single "Lease Renewal" tab, name join, no cohort pre-filter inside
// the pipeline (the desk classifies the cohort itself). The run id is inert here (the desk never uses
// source_trigger_keys); it only labels the read.
const LIVE_DESK_TABS = ["Lease Renewal"];
// Must match the resolution surface so one record-specific decision reaches this workspace.
const LIVE_DESK_RUN_ID = "live-review";
const RENT_FIELD_KEY = "current_rent";

/** Preserve the three-state packet read contract: unavailable, proved absent, or present. */
export function packetSnapshotFromBatch(
  packetSnapshotsByLease: ReadonlyMap<string, RenewalPacketSnapshot | null> | undefined,
  leaseId: string,
): RenewalPacketSnapshot | null | undefined {
  if (!packetSnapshotsByLease || !packetSnapshotsByLease.has(leaseId)) return undefined;
  return packetSnapshotsByLease.get(leaseId)!;
}

/** The desk degrades to one of these typed statuses instead of throwing (mirrors live-notices). */
export type LiveDeskStatus = "not_configured" | "account_mismatch" | "read_error";

export type LiveRenewalDeskResult =
  | { status: "ok"; view: RenewalDeskView }
  | { status: LiveDeskStatus };

export type LiveRenewalLeaseWorkspaceResult =
  | { status: "ok"; workspace: RenewalLeaseWorkspace }
  | { status: LiveDeskStatus | "not_found" };

export interface RenewalFollowUpSources {
  communicationState: "current" | "unreadable";
  links: readonly WorkflowCommunicationLink[];
  policy: NoticeRuleSnapshot;
  dismissedAttentionKeys?: readonly string[];
}

const EMPTY_FOLLOW_UP_SOURCES: RenewalFollowUpSources = {
  communicationState: "current",
  links: [],
  policy: {
    state: "missing",
    ruleSet: DEFAULT_NOTICE_RULE_SET,
    version: null,
    updatedAtIso: null,
  },
};

export interface LiveOwnerCurrentRentDecision {
  currentRent: number | null;
  currentRentEvidence: NonNullable<OwnerDraftInput["currentRentEvidence"]>;
}

export type LiveOwnerCurrentRentDecisionResult =
  | { status: "ok"; decision: LiveOwnerCurrentRentDecision }
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
 * Resolve the one current-rent decision shared by the workspace preview and the governed owner
 * draft. A raw provider value is deliberately not enough to earn Verified: only a fresh agreement
 * or an exact record-specific human resolution does that in `deriveCurrentRentFact`.
 */
function resolveOwnerCurrentRentDecision(
  view: RawLease,
  dataCheck: EffectiveDataCheckProjection,
  currency: LiveLeaseCurrency,
): LiveOwnerCurrentRentDecision {
  const rentCheck = dataCheck.items.find((item) => item.fieldKey === RENT_FIELD_KEY);
  const rentResolution = dataCheck.resolutionsByField.get(RENT_FIELD_KEY);
  const resolvedRentRaw =
    rentResolution?.kind === "flag_incorrect" ? null : rentResolution?.value;
  const parsedResolvedRent = resolvedRentRaw
    ? parseCurrencyInput(resolvedRentRaw)
    : undefined;
  const resolvedRent =
    parsedResolvedRent?.ok && parsedResolvedRent.value > 0
      ? parsedResolvedRent.value
      : undefined;
  const unresolvedAgreement =
    rentResolution?.priorAgreement ?? rentCheck?.agreement ?? "missing";

  return {
    currentRent: resolvedRent ?? leaseCurrentRent(view) ?? null,
    currentRentEvidence: {
      agreement:
        resolvedRent !== undefined
          ? "resolved"
          : unresolvedAgreement === "resolved" || unresolvedAgreement === "dismissed"
            ? "missing"
            : unresolvedAgreement,
      currencyState: currency.state,
      readAtIso: new Date(currency.readAtMs).toISOString(),
      ...(resolvedRent !== undefined
        ? {
            resolvedSource: rentResolution?.source ?? "Human-resolved current rent",
          }
        : {}),
    },
  };
}

/**
 * Read one lease's reconciled current-rent decision for a governed owner-draft action. This is a
 * read-only seam: it performs the same complete RentVine snapshot + operating-Sheet comparison as
 * the Live workspace and returns only the decision/evidence needed by the draft service.
 */
export async function loadLiveOwnerCurrentRentDecision(
  leaseId: string,
  readTimestamp: string,
  config: LiveRenewalConfig,
  resolutions: readonly LeaseRenewalResolutionRecord[] = [],
): Promise<LiveOwnerCurrentRentDecisionResult> {
  if (!config.ok) return { status: config.reason };
  try {
    const { snapshot, currency } = await getLiveLeaseSnapshot(
      config.rentvineClient,
      Date.parse(readTimestamp),
    );
    const view = snapshot.views.find((candidate) => leaseIdOf(candidate) === leaseId);
    if (!view) return { status: snapshot.complete ? "not_found" : "read_error" };
    const { tables, tableJoinIds } = await readRenewalSheetGridsWithLinks({
      reader: config.sheetsReader,
      spreadsheetId: config.spreadsheetId,
      tabTitles: LIVE_DESK_TABS,
    });
    const portfolioOutcomes = reconcileLeaseFields(
      snapshot.views,
      tables,
      readTimestamp,
      tableJoinIds,
    );
    const dataCheck = projectEffectiveDataCheck(
      buildLeaseDataCheck(view, portfolioOutcomes),
      resolutions,
      LIVE_DESK_RUN_ID,
    );
    return {
      status: "ok",
      decision: resolveOwnerCurrentRentDecision(view, dataCheck, currency),
    };
  } catch {
    return { status: "read_error" };
  }
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
function outcomeToDeskItem(outcome: ReconciledFieldOutcome): DeskReconItem {
  const recon = outcome.reconciliation;
  const openConflict = recon.raise_flag && recon.agreement === "conflict";
  const agreement: DeskReconItem["agreement"] = openConflict
    ? "conflict"
    : recon.agreement === "conflict"
      ? "agree"
      : recon.agreement;
  return {
    fieldKey: outcome.fieldKey,
    // Preserve the canonical pipeline label. Persisted decisions include this label in their exact
    // identity contract, so a workspace-only synonym would make an otherwise current decision look
    // stale even when its trigger and candidate fingerprint still match.
    fieldLabel: outcome.fieldLabel,
    ...(outcome.queueMapping?.queueItem.source_trigger_key
      ? { sourceTriggerKey: outcome.queueMapping.queueItem.source_trigger_key }
      : {}),
    candidateFingerprint: outcome.candidateFingerprint,
    agreement,
    candidates: recon.candidates.map(toDeskCandidate),
  };
}

/**
 * Build the portfolio's reconciliation once. One full association pass is required so a duplicated
 * fallback name or exact id fails closed instead of allowing the same Sheet row to verify two leases.
 * When the field cannot be reconciled (RentVine carries no rent, or no sheet row matches this lease),
 * it renders a facts-only "Needs input" item rather than fabricating a pass.
 */
function reconcileLeaseFields(
  views: readonly RawLease[],
  tables: RawGrid[],
  readTimestamp: string,
  tableJoinIds?: readonly (readonly (string | null)[])[],
): readonly ReconciledFieldOutcome[] {
  const mapping = mapLeasesToNonSheetCandidates([...views], { readTimestamp });
  return runRenewalPipeline({
    runId: LIVE_DESK_RUN_ID,
    tables,
    tableJoinIds,
    nonSheetCandidates: mapping.candidates,
  }).outcomes;
}

function fieldOutcome(
  outcomes: readonly ReconciledFieldOutcome[],
  fieldKey: string,
): ReconciledFieldOutcome | undefined {
  const matches = outcomes.filter((candidate) => candidate.fieldKey === fieldKey);
  return matches.length === 1 ? matches[0] : undefined;
}

function buildRentDeskItem(
  view: RawLease,
  outcomes: readonly ReconciledFieldOutcome[],
): DeskReconItem {
  const outcome = fieldOutcome(outcomes, RENT_FIELD_KEY);
  if (outcome) return outcomeToDeskItem(outcome);

  const rent = leaseCurrentRent(view);
  return {
    fieldKey: RENT_FIELD_KEY,
    fieldLabel: "Current rent",
    agreement: "missing",
    candidates: rent !== undefined ? [rentvineCandidate(String(rent))] : [],
  };
}

/** The lease-end Data-check item — a RentVine fact (single source). "Needs input" when absent. */
function buildEndDateDeskItem(
  view: RawLease,
  outcomes: readonly ReconciledFieldOutcome[],
): DeskReconItem {
  const outcome = fieldOutcome(outcomes, "renewal_date");
  if (outcome) return outcomeToDeskItem(outcome);
  const endIso = leaseEndDateIso(view);
  return {
    fieldKey: "renewal_date",
    fieldLabel: "Renewal date",
    agreement: endIso ? "single_source" : "missing",
    candidates: endIso ? [rentvineCandidate(endIso)] : [],
  };
}

/** One lease's Data-check: rent (real reconciliation) then lease-end (RentVine fact). */
function buildLeaseDataCheck(
  view: RawLease,
  portfolioOutcomes: readonly ReconciledFieldOutcome[],
): DeskReconItem[] {
  const leaseId = leaseIdOf(view);
  const expectedJoinId = leaseId ? `lease:${leaseId}` : null;
  const outcomes = expectedJoinId
    ? portfolioOutcomes.filter((outcome) =>
        outcome.matchedCandidateJoinIds?.includes(expectedJoinId),
      )
    : [];
  return [buildRentDeskItem(view, outcomes), buildEndDateDeskItem(view, outcomes)];
}

function rentvineSourceUrlForLease(
  leaseId: string,
  tableJoinIds: readonly (readonly (string | null)[])[],
  tableSourceUrls: readonly (readonly (string | null)[])[],
): string | null {
  const expected = `lease:${leaseId}`;
  const matches: (string | null)[] = [];
  for (let tableIndex = 0; tableIndex < tableJoinIds.length; tableIndex += 1) {
    (tableJoinIds[tableIndex] ?? []).forEach((joinId, rowIndex) => {
      if (joinId === expected) {
        matches.push(tableSourceUrls[tableIndex]?.[rowIndex] ?? null);
      }
    });
  }
  return matches.length === 1 ? matches[0] : null;
}

function inRenewalWindow(endDateIso: string, windows: readonly DateWindow[]): boolean {
  return windows.some(
    (window) => endDateIso >= window.startIso && endDateIso <= window.endIso,
  );
}

function retentionFor(
  classification: CohortLease,
  windows: readonly DateWindow[],
  progress: RenewalProgress | null,
  progressStateAvailable = true,
): RenewalDeskRetentionState {
  // A definitive source-backed skip is not renewal work, even if obsolete progress survived from a
  // prior classification. It remains visible as a skipped source row without a process/action.
  if (classification.disposition === "skip") {
    return { state: "outside", label: "Excluded from the renewal workflow" };
  }
  const endDateIso = classification.endDateIso;
  if (!endDateIso) {
    return {
      state: "needs_verification",
      label: "End date needs verification; retained for review",
    };
  }
  if (inRenewalWindow(endDateIso, windows)) {
    return {
      state: "window",
      label: "Inside the current-month renewal window",
    };
  }
  if (progress && !progress.complete) {
    return {
      state: "tracked_incomplete",
      label: "Tracked incomplete renewal retained outside the active window",
    };
  }
  if (!progressStateAvailable) {
    return {
      state: "needs_verification",
      label: "Saved progress unavailable; retained until tracking state can be verified",
    };
  }
  return { state: "outside", label: "Outside the active renewal window" };
}

function toLiveSummary(
  view: RawLease,
  classification: CohortLease,
  windows: readonly DateWindow[],
  dataCheck?: DeskReconItem[],
  progress?: RenewalProgress | null,
  progressStateAvailable = true,
): DeskLeaseSummaryBase {
  const leaseId = classification.leaseId ?? "";
  const identity = projectRenewalDeskIdentity(view);
  const retention = retentionFor(
    classification,
    windows,
    progress ?? null,
    progressStateAvailable,
  );
  const isActionable = classification.disposition === "actionable";
  const processVisible =
    progressStateAvailable && (isActionable || retention.state === "tracked_incomplete");
  const openConflicts = dataCheck
    ? dataCheck.filter((item) => item.agreement === "conflict").length
    : 0;
  // The stage is the operator's RECORDED progress when present, otherwise derived from the live read:
  // still on the data check while a conflict is open, otherwise ready for the owner decision. Typed as a
  // plain number (not a literal union) so the `>= 0` guarded tuple indexing matches the sample projection.
  const derivedStage = openConflicts > 0 ? 0 : 1;
  const stageIndex: number = processVisible
    ? effectiveStageIndex(progress ?? null, derivedStage)
    : -1;
  const step = stageIndex >= 0 ? RENEWAL_STEPS[stageIndex] : undefined;
  const tenantLabels = identity.tenants.map((fact) => fact.label);
  const ownerLabels = identity.owners.map((fact) => fact.label);
  return {
    id: leaseId,
    addressLabel: identity.address?.label ?? `Lease ${leaseId || "Needs Verification"}`,
    propertyNameLabel: identity.property?.label ?? null,
    tenantNameLabel: tenantLabels[0] ?? "Needs Verification",
    tenantNameLabels: tenantLabels,
    ownerNameLabels: ownerLabels,
    identity,
    endDateIso: classification.endDateIso,
    disposition: classification.disposition,
    reason: classification.reason,
    reasonLabel: humanizeCohortReason(classification.reason),
    retention,
    processVersion: processVisible
      ? (progress?.processVersion ?? RENEWAL_PROCESS_VERSION)
      : null,
    workflowStepId: step?.id ?? null,
    stageIndex,
    stageLabel: step?.label ?? null,
    nextAction: stageIndex >= 0 ? STAGE_NEXT_ACTION[stageIndex] : null,
    openConflicts,
  };
}

function buildLiveNotice(
  endDateIso: string | null,
  referenceDateIso: string,
  policy: NoticeRuleSnapshot,
  context: { leaseId: string; propertyKey?: string | null },
): EffectiveRuleView | null {
  if (!endDateIso) return null;
  const rule = resolveNoticeRule(policy.ruleSet, context);
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

/** Exact property key from the measured live view; an absent key stays absent. */
function propertyKeyOf(view: RawLease): string | null {
  const property =
    view.property && typeof view.property === "object" && !Array.isArray(view.property)
      ? (view.property as Record<string, unknown>)
      : undefined;
  for (const source of [property, view] as const) {
    if (!source) continue;
    for (const key of ["propertyID", "propertyId"] as const) {
      const value = source[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
  }
  return null;
}

function processFollowUpHints(
  process: RenewalProcessProjection,
): Pick<RenewalFollowUpProjectionInput, "preferredPurpose" | "processFallback"> {
  const step = process.steps[process.currentStepIndex];
  if (!step) return {};
  const sourceRef = `renewal-process:${process.version}:${step.id}`;
  if (step.id === "verify-renewal") {
    return {
      processFallback: { party: "unresolved_source", sourceRef },
    };
  }
  if (step.id === "owner-decision") {
    return { preferredPurpose: "renewal_owner" };
  }
  if (step.id === "tenant-decision") {
    return { preferredPurpose: "renewal_tenant" };
  }
  if (
    step.id === "document-packet" ||
    step.id === "signatures-follow-up" ||
    step.id === "compliance-close"
  ) {
    const processFallback: RenewalProcessWaitingFallback = {
      party: "document_coordinator",
      sourceRef,
    };
    return { preferredPurpose: "renewal_tenant", processFallback };
  }
  return {};
}

function buildLiveFollowUp(input: {
  leaseId: string;
  view: RawLease;
  readTimestamp: string;
  sources: RenewalFollowUpSources;
  process?: RenewalProcessProjection;
}) {
  return buildRenewalFollowUpProjection({
    leaseId: input.leaseId,
    propertyKey: propertyKeyOf(input.view),
    asOfIso: input.readTimestamp,
    communicationState: input.sources.communicationState,
    links: input.sources.links,
    policy: input.sources.policy,
    dismissedAttentionKeys: input.sources.dismissedAttentionKeys,
    ...(input.process ? processFollowUpHints(input.process) : {}),
  });
}

/**
 * Feed the same S75 contact/policy truth into the exact S72 evidence graph. This is a read projection:
 * it never persists progress, and missing/unreadable current sources remove stale dependent proof.
 */
function applyLiveFollowUpEvidence(input: {
  evidence: RenewalEvidenceMap;
  leaseId: string;
  view: RawLease;
  readTimestamp: string;
  sources: RenewalFollowUpSources;
}): RenewalEvidenceMap {
  let evidence = input.evidence;
  const tenant = buildRenewalFollowUpProjection({
    leaseId: input.leaseId,
    propertyKey: propertyKeyOf(input.view),
    asOfIso: input.readTimestamp,
    communicationState: input.sources.communicationState,
    links: input.sources.links,
    policy: input.sources.policy,
    preferredPurpose: "renewal_tenant",
  });
  if (
    tenant.lastContact.state === "verified" &&
    tenant.lastContact.atIso &&
    tenant.lastContact.source?.purpose === "renewal_tenant" &&
    tenant.waiting.state !== "needs_verification"
  ) {
    evidence = overlayLiveEvidence(
      evidence,
      "tenant-contact-state",
      liveEvidenceReference(
        "gmail_receipt",
        `gmail:thread:${tenant.lastContact.source.threadId}:message:${tenant.lastContact.source.messageId}`,
        {
          waiting: tenant.waiting.party,
          lastContactAtIso: tenant.lastContact.atIso,
        },
        tenant.lastContact.atIso,
      ),
    );
  } else if (evidence["tenant-contact-state"]) {
    evidence = removeRenewalEvidence(evidence, "tenant-contact-state").evidence;
  }

  const resolved = resolveNoticeRule(input.sources.policy.ruleSet, {
    leaseId: input.leaseId,
    propertyKey: propertyKeyOf(input.view),
  });
  if (
    input.sources.policy.state === "saved" &&
    input.sources.policy.version !== null &&
    resolved.fullyVerified
  ) {
    const scope = resolved.followUpIntervalDays.scope;
    const key =
      scope === "lease"
        ? input.leaseId
        : scope === "property"
          ? (propertyKeyOf(input.view) ?? "missing")
          : "global";
    evidence = overlayLiveEvidence(
      evidence,
      "timing-policy-version",
      liveEvidenceReference(
        "policy_version",
        `notice-policy:active:v${input.sources.policy.version}:${scope}:${key}`,
        {
          version: input.sources.policy.version,
          scope,
          key,
          enabled: resolved.enabled.value,
          intervalDays: resolved.followUpIntervalDays.value,
        },
        input.sources.policy.updatedAtIso ?? input.readTimestamp,
      ),
    );
  } else if (evidence["timing-policy-version"]) {
    evidence = removeRenewalEvidence(evidence, "timing-policy-version").evidence;
  }
  return evidence;
}

function liveEvidenceReference(
  source: RenewalEvidenceSource,
  ref: string,
  fingerprintInput?: unknown,
  observedAt?: string,
) {
  return buildRenewalEvidenceReference({
    source,
    ref,
    disposition: "verified",
    ...(fingerprintInput === undefined
      ? {}
      : {
          fingerprint: hashExecutionPreview({
            evidenceVersion: "renewal-live-v1",
            value: fingerprintInput,
          }),
        }),
    ...(observedAt ? { observedAt } : {}),
  });
}

function overlayLiveEvidence(
  evidence: RenewalEvidenceMap,
  key: RenewalEvidenceKey,
  reference: ReturnType<typeof liveEvidenceReference>,
): RenewalEvidenceMap {
  if (!evidence[key]) return { ...evidence, [key]: reference };
  return replaceRenewalEvidence(evidence, key, reference).evidence;
}

function clearLiveEvidence(
  evidence: RenewalEvidenceMap,
  key: RenewalEvidenceKey,
): RenewalEvidenceMap {
  return removeRenewalEvidence(evidence, key).evidence;
}

export function buildLiveProcessEvidence(input: {
  leaseId: string;
  view: RawLease;
  endDateIso: string | null;
  currentRent: number | null;
  currentRentEvidence: LiveOwnerCurrentRentDecision["currentRentEvidence"];
  dataCheck: DeskReconItem[];
  dataCurrency: LiveLeaseCurrency;
  readComplete: boolean;
  progress: RenewalProgress | null;
  /** undefined means this surface did not load packet state; null means it proved none current. */
  packetSnapshot: RenewalPacketSnapshot | null | undefined;
}): {
  evidence: RenewalEvidenceMap;
  blockers: Partial<Record<RenewalEvidenceKey, RenewalEvidenceBlocker>>;
} {
  let evidence: RenewalEvidenceMap = { ...(input.progress?.evidence ?? {}) };
  const set = (
    key: RenewalEvidenceKey,
    source: RenewalEvidenceSource,
    ref: string,
    fingerprintInput?: unknown,
    observedAt?: string,
  ) => {
    evidence = overlayLiveEvidence(
      evidence,
      key,
      liveEvidenceReference(source, ref, fingerprintInput, observedAt),
    );
  };
  const clear = (key: RenewalEvidenceKey) => {
    evidence = clearLiveEvidence(evidence, key);
  };
  const blockers: Partial<Record<RenewalEvidenceKey, RenewalEvidenceBlocker>> = {};

  set("lease-tracked", "rentvine_snapshot", `rentvine:lease:${input.leaseId}:tracked`, {
    leaseId: input.leaseId,
  });
  set("lease-identity", "rentvine_snapshot", `rentvine:lease:${input.leaseId}:identity`, {
    leaseId: input.leaseId,
    view: input.view,
  });
  set(
    "recurring-charges-separated",
    "app_record",
    "app-contract:base-rent-and-recurring-charges:v1",
  );

  if (input.endDateIso) {
    set(
      "lease-end-date",
      "rentvine_snapshot",
      `rentvine:lease:${input.leaseId}:end-date`,
      { leaseId: input.leaseId, endDateIso: input.endDateIso },
    );
  } else {
    clear("lease-end-date");
    blockers["lease-end-date"] = {
      reason: "The current lease snapshot has no verified end date.",
      nextAction: "Resolve the missing end date from an authoritative source.",
    };
  }

  const baseRentVerified =
    input.currentRentEvidence.currencyState === "fresh" &&
    (input.currentRentEvidence.agreement === "agree" ||
      input.currentRentEvidence.agreement === "resolved");
  if (
    baseRentVerified &&
    typeof input.currentRent === "number" &&
    Number.isFinite(input.currentRent) &&
    input.currentRent > 0
  ) {
    set(
      "base-rent",
      "reconciliation_receipt",
      `renewal-current-rent:${input.leaseId}`,
      {
        leaseId: input.leaseId,
        currentRent: input.currentRent,
        agreement: input.currentRentEvidence.agreement,
        resolvedSource: input.currentRentEvidence.resolvedSource,
      },
      input.currentRentEvidence.readAtIso,
    );
  } else {
    clear("base-rent");
    blockers["base-rent"] = {
      reason: "Contractual base rent is missing, stale, ambiguous, or conflicting.",
      nextAction: "Resolve contractual base rent before continuing.",
    };
  }

  const blockingData = input.dataCheck.filter(
    (item) => item.agreement === "conflict" || item.agreement === "missing",
  );
  if (blockingData.length === 0) {
    set(
      "source-conflicts-resolved",
      "reconciliation_receipt",
      `renewal-reconciliation:${input.leaseId}:clear`,
      { leaseId: input.leaseId, dataCheck: input.dataCheck },
    );
  } else {
    clear("source-conflicts-resolved");
    blockers["source-conflicts-resolved"] = {
      reason: `${blockingData.length} blocking source item${blockingData.length === 1 ? " remains" : "s remain"}.`,
      nextAction: "Record an exact source disposition or leave the lease visibly held.",
    };
  }

  if (input.readComplete && input.dataCurrency.state !== "expired") {
    const observedAt = new Date(input.dataCurrency.readAtMs).toISOString();
    set(
      "source-snapshot-current",
      "rentvine_snapshot",
      `rentvine:lease:${input.leaseId}:snapshot`,
      { leaseId: input.leaseId, view: input.view, dataCheck: input.dataCheck },
      observedAt,
    );
  } else {
    clear("source-snapshot-current");
    blockers["source-snapshot-current"] = {
      reason: input.readComplete
        ? "The current lease snapshot is too old to act on."
        : "The current portfolio read did not complete.",
      nextAction: "Refresh the source read before recording new renewal work.",
    };
  }

  const ownerRecipients = resolveRenewalRecipient({
    lease: input.view,
    channel: "owner",
  });
  const tenantRecipients = resolveRenewalRecipient({
    lease: input.view,
    channel: "tenant",
  });
  if (ownerRecipients.verified && tenantRecipients.verified) {
    set(
      "renewal-recipients",
      "rentvine_snapshot",
      `rentvine:lease:${input.leaseId}:renewal-recipients`,
      { leaseId: input.leaseId, ownerRecipients, tenantRecipients },
    );
  } else {
    clear("renewal-recipients");
    blockers["renewal-recipients"] = {
      reason: "One or more authoritative owner/tenant recipients are unresolved.",
      nextAction:
        "Resolve every owner and tenant of record without guessing contact data.",
    };
  }
  if (tenantRecipients.verified) {
    set(
      "tenant-recipients",
      "rentvine_snapshot",
      `rentvine:lease:${input.leaseId}:tenant-recipients`,
      { leaseId: input.leaseId, tenantRecipients },
    );
  } else {
    clear("tenant-recipients");
    blockers["tenant-recipients"] = {
      reason: "One or more authoritative tenant recipients are unresolved.",
      nextAction: "Resolve every tenant of record before preparing an offer.",
    };
  }

  const packet = input.packetSnapshot;
  if (packet?.current) {
    set(
      "packet-catalog-version",
      "policy_version",
      `packet-catalog:${packet.catalogVersion}`,
      { catalogVersion: packet.catalogVersion },
    );
    set(
      "current-packet-version",
      "packet_snapshot",
      `packet:${packet.snapshotId}:v${packet.snapshotVersion}`,
      {
        snapshotId: packet.snapshotId,
        snapshotVersion: packet.snapshotVersion,
        payloadHash: packet.payloadHash,
      },
    );
    if (packet.state === "Ready for preview") {
      set("packet-facts", "packet_snapshot", `packet:${packet.snapshotId}:facts`, {
        snapshotId: packet.snapshotId,
        payloadHash: packet.payloadHash,
      });
      set(
        "packet-snapshot",
        "packet_snapshot",
        `packet:${packet.snapshotId}:${packet.payloadHash}`,
        { snapshotId: packet.snapshotId, payloadHash: packet.payloadHash },
      );
    } else {
      clear("packet-facts");
      clear("packet-snapshot");
    }
    if (packet.visibleState === "Executed" && packet.execution?.receiptId) {
      set(
        "dotloop-packet-readback",
        "dotloop_receipt",
        `dotloop-receipt:${packet.execution.receiptId}`,
        { receiptId: packet.execution.receiptId, payloadHash: packet.payloadHash },
      );
    } else {
      clear("dotloop-packet-readback");
    }
  } else if (packet === null) {
    clear("packet-catalog-version");
    clear("current-packet-version");
    clear("packet-facts");
    clear("packet-snapshot");
    clear("dotloop-packet-readback");
  } else {
    // An unavailable packet read is not proof that no packet exists. Remove any historical packet
    // claims from the current display projection and attach an explicit unavailable blocker so the
    // UI pauses dependent work without presenting an empty/current state.
    for (const key of [
      "packet-catalog-version",
      "current-packet-version",
      "packet-facts",
      "packet-snapshot",
      "dotloop-packet-readback",
    ] as const) {
      clear(key);
      blockers[key] = {
        reason: "Current document packet status could not be read.",
        nextAction: "Retry the packet status read before relying on document progress.",
      };
    }
  }

  return { evidence, blockers };
}

function effectiveProgressAfterEvidence(
  progress: RenewalProgress | null,
  evidence: RenewalEvidenceMap,
): RenewalProgress | null {
  if (!progress) return null;
  return {
    ...progress,
    evidence,
    tenantOfferDraftId: evidence["tenant-draft-receipt"]
      ? progress.tenantOfferDraftId
      : null,
    tenantOutcome: evidence["tenant-outcome"] ? progress.tenantOutcome : null,
    complete: progress.complete && Boolean(evidence["app-completion"]),
  };
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
  followUpSources: RenewalFollowUpSources = EMPTY_FOLLOW_UP_SOURCES,
  // S82: the same record-specific human resolutions the workspace consumes, read once in bulk, so
  // the table's rent-verification state reflects exact current resolutions.
  resolutions: readonly LeaseRenewalResolutionRecord[] = [],
  // Current packet truth read in one bounded batch by the caller. An absent map means the read was
  // unavailable; a present `null` entry proves there is no current packet. Both clear historical
  // packet evidence, but only the unavailable state attaches an explicit retry blocker.
  packetSnapshotsByLease:
    | ReadonlyMap<string, RenewalPacketSnapshot | null>
    | undefined = undefined,
  /** False when the caller could not read saved progress; desk guidance then fails closed. */
  progressStateAvailable = true,
  /** Exact lease generation already used to choose packet ids; avoids a second cache generation. */
  leaseSnapshotResult?: LiveLeaseSnapshotResult,
): Promise<LiveRenewalDeskResult> {
  if (!config.ok) return { status: config.reason };
  try {
    const { snapshot, currency } =
      leaseSnapshotResult ??
      (await getLiveLeaseSnapshot(config.rentvineClient, Date.parse(readTimestamp)));
    const { views, complete } = snapshot;
    const { tables, tableJoinIds, tableRentvineSourceUrls } =
      await readRenewalSheetGridsWithLinks({
        reader: config.sheetsReader,
        spreadsheetId: config.spreadsheetId,
        tabTitles: LIVE_DESK_TABS,
      });
    const portfolioOutcomes = reconcileLeaseFields(
      views,
      tables,
      readTimestamp,
      tableJoinIds,
    );
    const cohort = classifyRenewalCohort(views, { windows });
    // S82: one shared guidance attachment so every row carries rent/status/blocker/action truth.
    const toRow = (
      summary: DeskLeaseSummary,
      view: RawLease,
      guidanceInputs: {
        process: Parameters<typeof buildDeskLeaseGuidance>[0]["process"];
        dataCheck: DeskReconItem[] | null;
        rentDecision: LiveOwnerCurrentRentDecision | null;
      },
    ): DeskLeaseRow => {
      const process = progressStateAvailable ? guidanceInputs.process : null;
      const currentStep = process?.steps[process.currentStepIndex];
      return {
        ...summary,
        processState:
          process && currentStep
            ? {
                status: process.status,
                currentStepId: currentStep.id,
                currentStepState: currentStep.state,
              }
            : null,
        guidance: buildDeskLeaseGuidance({
          summary,
          process,
          dataCheck: guidanceInputs.dataCheck,
          rentvineCurrentRent: leaseCurrentRent(view) ?? null,
          rentDecision: guidanceInputs.rentDecision,
          currencyState: currency.state,
          readComplete: complete,
          progressStateAvailable,
        }),
      };
    };
    const summaries = cohort.classifications.map((classification) => {
      const view = views[classification.index];
      const progress = classification.leaseId
        ? (progressByLease?.get(classification.leaseId) ?? null)
        : null;
      const initialSummary = toLiveSummary(
        view,
        classification,
        windows,
        undefined,
        progress,
        progressStateAvailable,
      );
      const leaseId = classification.leaseId ?? leaseIdOf(view);
      // Source navigation is independent from workflow eligibility. If the operating Sheet carries
      // one exact validated RentVine lease link, surface it for every loaded row—including review,
      // out-of-window, and definitively skipped rows—without creating a renewal workspace.
      const rentvineDestination = leaseId
        ? buildRentvineDestination({
            sourceUrl: rentvineSourceUrlForLease(
              leaseId,
              tableJoinIds,
              tableRentvineSourceUrls,
            ),
            expectedHost: config.rentvineHost,
            leaseId,
          })
        : null;
      // Every non-skipped row can open the same inspection workspace, so every such row consumes
      // the same current data-check and rent decision as that workspace. Workflow/process actions
      // remain limited below to actionable or already-tracked leases.
      const effectiveDataCheck =
        leaseId && classification.disposition !== "skip"
          ? projectEffectiveDataCheck(
              buildLeaseDataCheck(view, portfolioOutcomes),
              resolutions,
              LIVE_DESK_RUN_ID,
            )
          : null;
      const dataCheck = effectiveDataCheck?.items ?? null;
      const currentRentDecision = effectiveDataCheck
        ? resolveOwnerCurrentRentDecision(view, effectiveDataCheck, currency)
        : null;
      const sourceAwareSummary = dataCheck
        ? toLiveSummary(
            view,
            classification,
            windows,
            dataCheck,
            progress,
            progressStateAvailable,
          )
        : initialSummary;
      if (
        classification.disposition === "actionable" ||
        initialSummary.retention.state === "tracked_incomplete"
      ) {
        const summary = sourceAwareSummary;
        if (!leaseId) {
          return toRow(withRenewalDeskQueryKeys(summary), view, {
            process: null,
            dataCheck,
            rentDecision: currentRentDecision,
          });
        }
        if (!effectiveDataCheck || !dataCheck || !currentRentDecision) {
          return toRow(withRenewalDeskQueryKeys(summary), view, {
            process: null,
            dataCheck,
            rentDecision: currentRentDecision,
          });
        }
        const processEvidence = buildLiveProcessEvidence({
          leaseId,
          view,
          endDateIso: classification.endDateIso,
          currentRent: currentRentDecision.currentRent,
          currentRentEvidence: currentRentDecision.currentRentEvidence,
          dataCheck,
          dataCurrency: currency,
          readComplete: complete,
          progress,
          packetSnapshot: packetSnapshotFromBatch(packetSnapshotsByLease, leaseId),
        });
        const evidence = applyLiveFollowUpEvidence({
          evidence: processEvidence.evidence,
          leaseId,
          view,
          readTimestamp,
          sources: followUpSources,
        });
        const effectiveProgress = effectiveProgressAfterEvidence(progress, evidence);
        const process = projectRenewalProcess({
          processVersion: effectiveProgress?.processVersion ?? RENEWAL_PROCESS_VERSION,
          evidence,
          evidenceBlockers: processEvidence.blockers,
          tenantOutcome: effectiveProgress?.tenantOutcome ?? null,
          complete: effectiveProgress?.complete ?? false,
        });
        return toRow(
          withRenewalDeskQueryKeys({
            ...summary,
            ...(rentvineDestination
              ? { sourceDestinations: { rentvine: rentvineDestination } }
              : {}),
            ...(progressStateAvailable
              ? {
                  processVersion: process.version,
                  workflowStepId: RENEWAL_STEPS[process.currentStepIndex]?.id ?? null,
                  stageIndex: process.currentStepIndex,
                  stageLabel: RENEWAL_STEPS[process.currentStepIndex]?.label ?? null,
                  nextAction: STAGE_NEXT_ACTION[process.currentStepIndex] ?? null,
                }
              : {
                  processVersion: null,
                  workflowStepId: null,
                  stageIndex: -1,
                  stageLabel: null,
                  nextAction: null,
                }),
            followUp: buildLiveFollowUp({
              leaseId,
              view,
              readTimestamp,
              sources: followUpSources,
              ...(progressStateAvailable ? { process } : {}),
            }),
          }),
          view,
          { process, dataCheck, rentDecision: currentRentDecision },
        );
      }
      const summary = sourceAwareSummary;
      return toRow(
        withRenewalDeskQueryKeys(
          leaseId
            ? {
                ...summary,
                ...(rentvineDestination
                  ? { sourceDestinations: { rentvine: rentvineDestination } }
                  : {}),
                followUp: buildLiveFollowUp({
                  leaseId,
                  view,
                  readTimestamp,
                  sources: followUpSources,
                }),
              }
            : summary,
        ),
        view,
        { process: null, dataCheck, rentDecision: currentRentDecision },
      );
    });
    // S70 AC-S70-1: the queue is ordered soonest-lease-end first. Before this it had no sort at all
    // and inherited RentVine export row order, which is what the client saw as "dates need to be in
    // chronological order". Same comparator as the attention fold above it.
    summaries.sort(compareLeaseEndDate);

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
        items: summaries,
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
 * stays null. A review or out-of-window lease remains openable so an operator can inspect and correct
 * its source-backed blockers; a definitive cohort exclusion remains outside the renewal workflow.
 * Returns `not_found` for an unknown or definitively skipped lease, or a typed degrade status.
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
  resolutions: readonly LeaseRenewalResolutionRecord[] = [],
  packetSnapshot: RenewalPacketSnapshot | null | undefined = undefined,
  followUpSources: RenewalFollowUpSources = EMPTY_FOLLOW_UP_SOURCES,
  /** Short-lived source-write barrier supplied by the workspace route; carries no lease values. */
  sourceRefreshAfterMs: number | null = null,
  /** Typed page-level attempt: success reuses one generation; failure forbids an intra-render retry. */
  leaseSnapshotAttempt?: AttemptedLiveLeaseSnapshotResult,
): Promise<LiveRenewalLeaseWorkspaceResult> {
  if (!config.ok) return { status: config.reason };
  try {
    if (leaseSnapshotAttempt?.status === "unavailable") {
      return { status: "read_error" };
    }
    const readAtMs = Date.parse(readTimestamp);
    const { snapshot, currency } =
      leaseSnapshotAttempt?.value ??
      (sourceRefreshAfterMs === null
        ? await getLiveLeaseSnapshot(config.rentvineClient, readAtMs)
        : await getLiveLeaseSnapshotAtOrAfter(
            config.rentvineClient,
            readAtMs,
            sourceRefreshAfterMs,
          ));
    const { views, complete } = snapshot;
    const view = views.find((candidate) => leaseIdOf(candidate) === leaseId);
    // S57: an incomplete read cannot prove absence — a lease missing from a partial portfolio reads
    // as a failed read, never as "not found".
    if (!view) return { status: complete ? "not_found" : "read_error" };

    // Use the exact current-window rule used by the desk. A lease must not become actionable merely
    // because it was opened: review and out-of-window leases remain inspectable with their original
    // disposition, while definitive skip signals still have no renewal workspace.
    const windows: DateWindow[] = [buildRenewalDeskWindow(readTimestamp.slice(0, 10))];
    const classification = classifyRenewalCohort([view], { windows }).classifications[0];
    if (classification.disposition === "skip") return { status: "not_found" };

    const { tables, tableJoinIds, tableRentvineSourceUrls } =
      await readRenewalSheetGridsWithLinks({
        reader: config.sheetsReader,
        spreadsheetId: config.spreadsheetId,
        tabTitles: LIVE_DESK_TABS,
      });
    const portfolioOutcomes = reconcileLeaseFields(
      views,
      tables,
      readTimestamp,
      tableJoinIds,
    );
    const effectiveDataCheck = projectEffectiveDataCheck(
      buildLeaseDataCheck(view, portfolioOutcomes),
      resolutions,
      LIVE_DESK_RUN_ID,
    );
    const dataCheck = effectiveDataCheck.items;
    const currentRentDecision = resolveOwnerCurrentRentDecision(
      view,
      effectiveDataCheck,
      currency,
    );
    const currentRent = currentRentDecision.currentRent;
    // S59: known unit attributes for the comp lookup; absent stays absent.
    const compAttributes = compAttributesOf(view);
    let summary = toLiveSummary(view, classification, windows, dataCheck, progress);
    const workflowAvailable =
      classification.disposition === "actionable" ||
      summary.retention.state === "tracked_incomplete";
    const rentvineDestination = buildRentvineDestination({
      sourceUrl: rentvineSourceUrlForLease(
        leaseId,
        tableJoinIds,
        tableRentvineSourceUrls,
      ),
      expectedHost: config.rentvineHost,
      leaseId,
    });
    if (rentvineDestination) {
      summary = {
        ...summary,
        sourceDestinations: { rentvine: rentvineDestination },
      };
    }

    const processEvidence = buildLiveProcessEvidence({
      leaseId,
      view,
      endDateIso: classification.endDateIso,
      currentRent,
      currentRentEvidence: currentRentDecision.currentRentEvidence,
      dataCheck,
      dataCurrency: currency,
      readComplete: complete,
      progress,
      packetSnapshot,
    });
    // Live source drift can invalidate stored downstream evidence without mutating Firestore during a
    // read. Project every coupled field through that effective evidence so stale draft/outcome/
    // completion flags cannot survive merely because their historical scalar is still present.
    const evidence = applyLiveFollowUpEvidence({
      evidence: processEvidence.evidence,
      leaseId,
      view,
      readTimestamp,
      sources: followUpSources,
    });
    const effectiveProgress = effectiveProgressAfterEvidence(progress, evidence);
    const process = projectRenewalProcess({
      processVersion: effectiveProgress?.processVersion ?? RENEWAL_PROCESS_VERSION,
      evidence,
      evidenceBlockers: processEvidence.blockers,
      tenantOutcome: effectiveProgress?.tenantOutcome ?? null,
      complete: effectiveProgress?.complete ?? false,
    });
    const followUp = buildLiveFollowUp({
      leaseId,
      view,
      readTimestamp,
      sources: followUpSources,
      ...(workflowAvailable ? { process } : {}),
    });
    summary = {
      ...summary,
      ...(workflowAvailable
        ? {
            processVersion: process.version,
            workflowStepId: RENEWAL_STEPS[process.currentStepIndex]?.id ?? null,
            stageIndex: process.currentStepIndex,
            stageLabel: RENEWAL_STEPS[process.currentStepIndex]?.label ?? null,
            nextAction: STAGE_NEXT_ACTION[process.currentStepIndex] ?? null,
          }
        : {}),
      followUp,
    };
    const deskSummary = withRenewalDeskQueryKeys(summary);

    // Once the owner decision is RECORDED, the Tenant-offer step shows a real offer built from those
    // numbers (not a placeholder). Without a recorded decision — or a lease with no end date — it stays
    // null and the Tenant-offer card invites composing below. The gated composer is still the only send.
    const endDateIso = classification.endDateIso;
    const tenantDraft =
      workflowAvailable &&
      ownerDecisionIsCurrent(effectiveProgress) &&
      effectiveProgress?.ownerDecision &&
      endDateIso
        ? buildTenantOfferDraft({
            tenantNameLabel: deskSummary.tenantNameLabel,
            leaseEndDateIso: endDateIso,
            ownerDecision: effectiveProgress.ownerDecision.decision,
            offeredRent: effectiveProgress.ownerDecision.offeredRent,
            ...(effectiveProgress.ownerDecision.charges
              ? { charges: effectiveProgress.ownerDecision.charges }
              : {}),
            ...(effectiveProgress.ownerDecision.infoFormUrl
              ? { infoFormUrl: effectiveProgress.ownerDecision.infoFormUrl }
              : {}),
          })
        : null;

    const workspace: RenewalLeaseWorkspace = {
      summary: deskSummary,
      workflowAvailable,
      steps: RENEWAL_STEPS,
      currentStepIndex: process.currentStepIndex,
      process,
      dataCheck,
      // A degenerate rentless lease has no meaningful owner draft; the Data-check reports the missing
      // rent as "Needs input" and the gated composer blocks an owner notice without a rent.
      ownerDraft: buildOwnerRenewalDraft({
        addressLabel: deskSummary.addressLabel,
        currentRent,
        currentRentEvidence: currentRentDecision.currentRentEvidence,
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
      notice: buildLiveNotice(
        endDateIso,
        readTimestamp.slice(0, 10),
        followUpSources.policy,
        {
          leaseId,
          propertyKey: propertyKeyOf(view),
        },
      ),
      followUp,
      // Effective current evidence drives the versioned progress controls in the workspace UI.
      ...(workflowAvailable
        ? {
            live: {
              leaseId,
              ownerDecision: effectiveProgress?.ownerDecision ?? null,
              ownerDecisionCurrent: ownerDecisionIsCurrent(effectiveProgress),
              tenantOfferDraftId: effectiveProgress?.tenantOfferDraftId ?? null,
              tenantOutcome: effectiveProgress?.tenantOutcome ?? null,
              processVersion:
                effectiveProgress?.processVersion ?? RENEWAL_PROCESS_VERSION,
              complete: effectiveProgress?.complete ?? false,
            },
          }
        : {}),
      // S58: expired data disables compose/record controls in the workspace UI; the routes refuse
      // server-side regardless.
      dataCurrency: toDeskCurrency(currency),
      ...(compAttributes ? { compAttributes } : {}),
      // S60: the authoritative rent for the internal under-market signal (never a draft input).
      ...(typeof currentRent === "number" && currentRent > 0 ? { currentRent } : {}),
    };
    return { status: "ok", workspace };
  } catch {
    return { status: "read_error" };
  }
}
