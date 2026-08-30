// Per-lease LIVE renewal progress — pure transitions for the pinned six-step evidence model.
// Reconciliation and source facts remain provider-derived; this stores app-owned decisions, exact
// receipt references, branch state, deterministic invalidation, and evidence-gated completion.
//
// It changes NO system of record: RentVine stays read-only, the Sheet stays read-only. This state lives
// in the KB's own Firestore (see lib/firestore/lease-renewal-progress.ts). This module is the PURE core:
// stage arithmetic + transition validation, no I/O and no Date.now(). The Firestore layer calls these
// planners inside a transaction; the route maps a thrown EditableLayerError to its HTTP status.

import { EditableLayerError } from "@/lib/firestore/errors";
import type { MarketCompAttributeField } from "@/lib/lease-renewal/market-comp-query-basis";
import {
  RENEWAL_PROCESS_VERSION,
  buildRenewalEvidenceReference,
  missingRenewalCompletionEvidence,
  normalizeRenewalEvidenceMap,
  renewalEvidenceInvalidatedBy,
  replaceRenewalEvidence,
  type RenewalEvidenceKey,
  type RenewalEvidenceMap,
  type RenewalEvidenceReference,
  type RenewalTenantOutcome,
  type RenewalTenantOutcomeState,
} from "@/lib/lease-renewal/renewal-process";
import type { OwnerDecision } from "@/lib/lease-renewal/tenant-draft";

/** Stage indices into the S72 six-step model. Legacy aliases remain source-compatible. */
export const RENEWAL_STAGE = {
  verify: 0,
  data: 0,
  owner: 1,
  tenant: 2,
  documents: 3,
  build: 3,
  signatures: 4,
  compliance: 5,
  close: 5,
} as const;

/** Highest valid stage index (compliance and close). */
export const MAX_RENEWAL_STAGE = RENEWAL_STAGE.close;

/**
 * The operator's comp basis for the owner email + (gated) write-back proposal. Every field here is the
 * operator's OWN input. The app MAY separately compute a comp-derived suggested rent number, but only
 * behind explicit per-number Admin approval (S29, D-RENT-SUGGEST); this comp basis never becomes that
 * suggestion on its own. All optional so a decision can be recorded before the comps are gathered.
 */
/** One provider comparable, kept in provider order with its correlation intact (S60). */
export interface RenewalMarketProviderComp {
  rent: number;
  correlation?: number;
  distanceMiles?: number;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  listedDate?: string;
  lastSeenDate?: string;
  daysOld?: number;
  daysOnMarket?: number;
}

export interface RenewalMarketProviderSubject {
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
}

/** Month-keyed rental trend distilled from the provider's /markets history (S60). */
export interface RenewalMarketProviderTrend {
  zipCode: string;
  retrievedAt: string;
  /** Keyed YYYY-MM. Only the provider's own aggregate figures; never a synthesized value. */
  months: Record<string, { averageRent?: number; medianRent?: number }>;
}

/**
 * S60: the PROVIDER-RETRIEVED comp basis, persisted verbatim so the owner draft prints the number
 * it actually retrieved under the source it actually came from. Kept strictly apart from the
 * operator-typed fields below: neither ever overwrites the other, and a draft never combines one
 * basis's numbers with the other's label.
 */
export interface RenewalMarketProviderBasis {
  /** The provider's own source label (e.g. "RentCast"). */
  source: string;
  rangeLow: number;
  rangeHigh: number;
  pointEstimate: number;
  compCount: number;
  retrievedAt: string;
  radiusMiles?: number;
  requestedCompCount?: number;
  lookupSubjectAttributes?: boolean;
  providerVersion?: string;
  cacheState?: "live" | "cache";
  omittedAttributes?: { field: MarketCompAttributeField; reason: string }[];
  unitFilters?: {
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
    propertyType?: string;
  };
  subjectProperty?: RenewalMarketProviderSubject;
  comps?: RenewalMarketProviderComp[];
  trend?: RenewalMarketProviderTrend;
}

export interface RenewalMarketBasis {
  /** Operator-typed comp-range low ("Comp low (typed)" in the UI). */
  rangeLow?: number;
  /** Operator-typed comp-range high ("Comp high (typed)" in the UI). */
  rangeHigh?: number;
  /** The specific number from the PMI/franchise rental-analysis tool. */
  pmiNumber?: number;
  /** The stored Drive ref (drive:<id>) for the uploaded comps screenshot (S28a). */
  compScreenshotRef?: string;
  /** Display-only attribution metadata for the lookup the operator ran. NEVER labels typed numbers. */
  compSource?: string;
  /** ISO timestamp the comp range was retrieved (RentCast receipt). Display string only; no number. */
  compRetrievedAt?: string;
  /** S60: the provider-retrieved basis, kept apart from the typed fields above. */
  provider?: RenewalMarketProviderBasis;
}

/** The recorded owner rent decision that unlocks the tenant offer. Values are the operator's inputs. */
export interface RenewalOwnerDecision {
  decision: OwnerDecision;
  /** Owner-approved monthly rent to offer. Finite and strictly positive. */
  offeredRent: number;
  /** Optional monthly charges surfaced on the tenant offer. */
  charges?: { rbp?: number; insurance?: number };
  /** Optional tenant info-gathering form link. */
  infoFormUrl?: string;
  /** Optional operator comp basis (typed range + PMI number). */
  market?: RenewalMarketBasis;
}

/** Browser/server write input. Screenshot provenance is derived inside the Firestore transaction. */
export type RenewalOwnerDecisionWriteInput = Omit<RenewalOwnerDecision, "market"> & {
  market?: Omit<RenewalMarketBasis, "compScreenshotRef">;
};

/** One lease's app-owned progress pinned to one process definition. */
export interface RenewalProgress {
  leaseId: string;
  processVersion: string;
  stageIndex: number;
  ownerDecision: RenewalOwnerDecision | null;
  ownerDecisionRevision: number;
  tenantOfferDraftId: string | null;
  tenantOutcome: RenewalTenantOutcome | null;
  evidence: RenewalEvidenceMap;
  complete: boolean;
}

/** The value-shape a transition planner returns (identity omitted — the store owns the leaseId). */
export interface RenewalProgressPlan {
  processVersion: string;
  stageIndex: number;
  ownerDecision: RenewalOwnerDecision | null;
  ownerDecisionRevision: number;
  tenantOfferDraftId: string | null;
  tenantOutcome: RenewalTenantOutcome | null;
  evidence: RenewalEvidenceMap;
  complete: boolean;
}

const OWNER_DECISIONS: readonly OwnerDecision[] = ["keep_same", "increase", "custom"];
const DEDICATED_TRANSITION_EVIDENCE: readonly RenewalEvidenceKey[] = [
  "owner-decision",
  "tenant-draft-receipt",
  "tenant-outcome",
  "app-completion",
];

function clampStage(index: number): number {
  if (!Number.isInteger(index)) return RENEWAL_STAGE.data;
  return Math.min(Math.max(index, RENEWAL_STAGE.data), MAX_RENEWAL_STAGE);
}

function assertMoney(value: number, label: string, allowZero: boolean): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new EditableLayerError(`${label} must be a number.`, 400);
  }
  if (allowZero ? value < 0 : value <= 0) {
    throw new EditableLayerError(
      allowZero ? `${label} cannot be negative.` : `${label} must be greater than zero.`,
      400,
    );
  }
  return value;
}

/**
 * Validate + normalize a proposed owner decision. Throws EditableLayerError (400) on any bad input, so
 * the offered rent is always positive, the decision is one of the three, and charges (when present) are
 * non-negative. The infoFormUrl is trusted as-validated upstream (the route enforces a URL shape).
 */
export function normalizeOwnerDecision(
  input: RenewalOwnerDecision,
): RenewalOwnerDecision {
  if (!OWNER_DECISIONS.includes(input.decision)) {
    throw new EditableLayerError("Unknown owner decision.", 400);
  }
  assertMoney(input.offeredRent, "Offered rent", false);
  const charges: { rbp?: number; insurance?: number } = {};
  if (input.charges?.rbp !== undefined) {
    charges.rbp = assertMoney(input.charges.rbp, "Resident benefit package", true);
  }
  if (input.charges?.insurance !== undefined) {
    charges.insurance = assertMoney(input.charges.insurance, "Insurance", true);
  }
  const normalized: RenewalOwnerDecision = {
    decision: input.decision,
    offeredRent: input.offeredRent,
  };
  if (charges.rbp !== undefined || charges.insurance !== undefined) {
    normalized.charges = charges;
  }
  if (input.infoFormUrl && input.infoFormUrl.trim() !== "") {
    normalized.infoFormUrl = input.infoFormUrl.trim();
  }
  const market = normalizeMarketBasis(input.market);
  if (market) normalized.market = market;
  return normalized;
}

/**
 * Validate + normalize the operator's comp basis. Numbers must be non-negative and finite (a comp is
 * never negative). Returns undefined when nothing was entered, so a decision without comps carries no
 * `market` field. Never invents a value.
 */
function normalizeMarketBasis(
  input: RenewalMarketBasis | undefined,
): RenewalMarketBasis | undefined {
  if (!input) return undefined;
  const market: RenewalMarketBasis = {};
  if (input.rangeLow !== undefined) {
    market.rangeLow = assertMoney(input.rangeLow, "Comp range low", true);
  }
  if (input.rangeHigh !== undefined) {
    market.rangeHigh = assertMoney(input.rangeHigh, "Comp range high", true);
  }
  if (input.pmiNumber !== undefined) {
    market.pmiNumber = assertMoney(input.pmiNumber, "PMI rental-analysis number", true);
  }
  if (
    market.rangeLow !== undefined &&
    market.rangeHigh !== undefined &&
    market.rangeHigh < market.rangeLow
  ) {
    throw new EditableLayerError(
      "Comp range high cannot be less than comp range low.",
      400,
    );
  }
  // S28a display-only attribution + the stored screenshot ref. Trimmed, blank dropped; never a number, so
  // the no-invented-number invariant is untouched by these fields.
  if (input.compScreenshotRef && input.compScreenshotRef.trim() !== "") {
    market.compScreenshotRef = input.compScreenshotRef.trim();
  }
  if (input.compSource && input.compSource.trim() !== "") {
    market.compSource = input.compSource.trim();
  }
  if (input.compRetrievedAt && input.compRetrievedAt.trim() !== "") {
    market.compRetrievedAt = input.compRetrievedAt.trim();
  }
  const provider = normalizeProviderBasis(input.provider);
  if (provider) market.provider = provider;
  return Object.keys(market).length > 0 ? market : undefined;
}

/**
 * S60: validate the provider-retrieved basis with the same never-fabricate discipline. Every number
 * must be finite and coherent or the whole block is refused — a partially-valid provider block would
 * be a fabrication wearing a provider label. Returns undefined when absent.
 */
function normalizeProviderBasis(
  input: RenewalMarketProviderBasis | undefined,
): RenewalMarketProviderBasis | undefined {
  if (!input) return undefined;
  const source = typeof input.source === "string" ? input.source.trim() : "";
  const retrievedAt =
    typeof input.retrievedAt === "string" ? input.retrievedAt.trim() : "";
  if (source === "" || retrievedAt === "") {
    throw new EditableLayerError(
      "A provider comp basis needs its source label and retrieval time.",
      400,
    );
  }
  const rangeLow = assertMoney(input.rangeLow, "Provider range low", true);
  const rangeHigh = assertMoney(input.rangeHigh, "Provider range high", true);
  const pointEstimate = assertMoney(input.pointEstimate, "Provider point estimate", true);
  if (rangeHigh < rangeLow) {
    throw new EditableLayerError(
      "Provider range high cannot be less than provider range low.",
      400,
    );
  }
  if (!Number.isInteger(input.compCount) || input.compCount < 1) {
    throw new EditableLayerError(
      "A provider comp basis needs a positive comp count.",
      400,
    );
  }
  const provider: RenewalMarketProviderBasis = {
    source,
    rangeLow,
    rangeHigh,
    pointEstimate,
    compCount: input.compCount,
    retrievedAt,
  };
  if (input.radiusMiles !== undefined) {
    provider.radiusMiles = assertMoney(input.radiusMiles, "Provider radius", true);
  }
  if (input.requestedCompCount !== undefined) {
    if (
      !Number.isInteger(input.requestedCompCount) ||
      input.requestedCompCount < 1 ||
      input.requestedCompCount > 100
    ) {
      throw new EditableLayerError(
        "Provider requested comp count must be an integer from 1 to 100.",
        400,
      );
    }
    provider.requestedCompCount = input.requestedCompCount;
  }
  if (input.lookupSubjectAttributes !== undefined) {
    if (typeof input.lookupSubjectAttributes !== "boolean") {
      throw new EditableLayerError(
        "Provider subject-attribute lookup must be true or false.",
        400,
      );
    }
    provider.lookupSubjectAttributes = input.lookupSubjectAttributes;
  }
  if (input.providerVersion !== undefined) {
    const providerVersion =
      typeof input.providerVersion === "string" ? input.providerVersion.trim() : "";
    if (providerVersion === "") {
      throw new EditableLayerError("Provider version cannot be blank.", 400);
    }
    provider.providerVersion = providerVersion;
  }
  if (input.cacheState !== undefined) {
    if (input.cacheState !== "live" && input.cacheState !== "cache") {
      throw new EditableLayerError("Provider cache state is invalid.", 400);
    }
    provider.cacheState = input.cacheState;
  }
  if (input.omittedAttributes !== undefined) {
    const allowed = new Set<MarketCompAttributeField>([
      "bedrooms",
      "bathrooms",
      "squareFootage",
      "propertyType",
    ]);
    provider.omittedAttributes = input.omittedAttributes.map((omission) => {
      const reason = typeof omission.reason === "string" ? omission.reason.trim() : "";
      if (!allowed.has(omission.field) || reason === "") {
        throw new EditableLayerError(
          "Every omitted provider attribute needs a known field and reason.",
          400,
        );
      }
      return { field: omission.field, reason };
    });
  }
  if (input.unitFilters) {
    const filters: NonNullable<RenewalMarketProviderBasis["unitFilters"]> = {};
    if (input.unitFilters.bedrooms !== undefined) {
      filters.bedrooms = assertMoney(input.unitFilters.bedrooms, "Bedrooms", true);
    }
    if (input.unitFilters.bathrooms !== undefined) {
      filters.bathrooms = assertMoney(input.unitFilters.bathrooms, "Bathrooms", true);
    }
    if (input.unitFilters.squareFootage !== undefined) {
      filters.squareFootage = assertMoney(
        input.unitFilters.squareFootage,
        "Square footage",
        true,
      );
    }
    if (
      typeof input.unitFilters.propertyType === "string" &&
      input.unitFilters.propertyType.trim() !== ""
    ) {
      filters.propertyType = input.unitFilters.propertyType.trim();
    }
    if (Object.keys(filters).length > 0) provider.unitFilters = filters;
  }
  if (input.subjectProperty) {
    const subject: RenewalMarketProviderSubject = {};
    if (
      typeof input.subjectProperty.propertyType === "string" &&
      input.subjectProperty.propertyType.trim() !== ""
    ) {
      subject.propertyType = input.subjectProperty.propertyType.trim();
    }
    if (input.subjectProperty.bedrooms !== undefined) {
      subject.bedrooms = assertMoney(
        input.subjectProperty.bedrooms,
        "Provider subject bedrooms",
        true,
      );
    }
    if (input.subjectProperty.bathrooms !== undefined) {
      subject.bathrooms = assertMoney(
        input.subjectProperty.bathrooms,
        "Provider subject bathrooms",
        true,
      );
    }
    if (input.subjectProperty.squareFootage !== undefined) {
      subject.squareFootage = assertMoney(
        input.subjectProperty.squareFootage,
        "Provider subject square footage",
        false,
      );
    }
    if (Object.keys(subject).length > 0) provider.subjectProperty = subject;
  }
  if (input.comps !== undefined) {
    if (!Array.isArray(input.comps)) {
      throw new EditableLayerError("Provider comps must be a list.", 400);
    }
    provider.comps = input.comps.map((comp) => {
      const rent = assertMoney(comp.rent, "Provider comp rent", true);
      const normalized: RenewalMarketProviderComp = { rent };
      if (comp.correlation !== undefined) {
        if (
          typeof comp.correlation !== "number" ||
          !Number.isFinite(comp.correlation) ||
          comp.correlation < 0 ||
          comp.correlation > 1
        ) {
          throw new EditableLayerError(
            "A comp correlation must sit between 0 and 1.",
            400,
          );
        }
        normalized.correlation = comp.correlation;
      }
      if (comp.distanceMiles !== undefined) {
        normalized.distanceMiles = assertMoney(comp.distanceMiles, "Comp distance", true);
      }
      if (typeof comp.propertyType === "string" && comp.propertyType.trim() !== "") {
        normalized.propertyType = comp.propertyType.trim();
      }
      if (comp.bedrooms !== undefined) {
        normalized.bedrooms = assertMoney(comp.bedrooms, "Comp bedrooms", true);
      }
      if (comp.bathrooms !== undefined) {
        normalized.bathrooms = assertMoney(comp.bathrooms, "Comp bathrooms", true);
      }
      if (comp.squareFootage !== undefined) {
        normalized.squareFootage = assertMoney(
          comp.squareFootage,
          "Comp square footage",
          false,
        );
      }
      for (const [field, value] of [
        ["listedDate", comp.listedDate],
        ["lastSeenDate", comp.lastSeenDate],
      ] as const) {
        if (value === undefined) continue;
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
          throw new EditableLayerError(
            "Comp " +
              (field === "listedDate" ? "listed" : "last-seen") +
              " date is invalid.",
            400,
          );
        }
        normalized[field] = trimmed;
      }
      if (comp.daysOld !== undefined) {
        normalized.daysOld = assertMoney(comp.daysOld, "Comp age", true);
      }
      if (comp.daysOnMarket !== undefined) {
        normalized.daysOnMarket = assertMoney(
          comp.daysOnMarket,
          "Comp days on market",
          true,
        );
      }
      return normalized;
    });
  }
  if (input.trend !== undefined) {
    const zip = typeof input.trend.zipCode === "string" ? input.trend.zipCode.trim() : "";
    const trendRetrievedAt =
      typeof input.trend.retrievedAt === "string" ? input.trend.retrievedAt.trim() : "";
    if (!/^\d{5}$/.test(zip) || trendRetrievedAt === "") {
      throw new EditableLayerError(
        "A market trend needs its 5-digit zip and retrieval time.",
        400,
      );
    }
    const months: RenewalMarketProviderTrend["months"] = {};
    for (const [month, values] of Object.entries(input.trend.months ?? {})) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        throw new EditableLayerError("Trend months must be keyed YYYY-MM.", 400);
      }
      const entry: { averageRent?: number; medianRent?: number } = {};
      if (values?.averageRent !== undefined) {
        entry.averageRent = assertMoney(values.averageRent, "Trend average rent", true);
      }
      if (values?.medianRent !== undefined) {
        entry.medianRent = assertMoney(values.medianRent, "Trend median rent", true);
      }
      if (Object.keys(entry).length > 0) months[month] = entry;
    }
    if (Object.keys(months).length > 0) {
      provider.trend = { zipCode: zip, retrievedAt: trendRetrievedAt, months };
    }
  }
  return provider;
}

function appEvidence(ref: string): RenewalEvidenceReference {
  return buildRenewalEvidenceReference({
    ref,
    source: "app_record",
    disposition: "verified",
  });
}

function assertCurrentProcess(current: RenewalProgress | null): RenewalProgress {
  if (!current) {
    throw new EditableLayerError("Start the renewal by recording current evidence.", 409);
  }
  if (current.processVersion !== RENEWAL_PROCESS_VERSION) {
    throw new EditableLayerError(
      "This lease has legacy progress. Review it and re-record the owner decision to pin renewal-v1 before continuing.",
      409,
    );
  }
  return current;
}

function evidenceHasCurrentOwnerDecision(current: RenewalProgress): boolean {
  return Boolean(
    current.ownerDecision &&
    normalizeRenewalEvidenceMap(current.evidence)["owner-decision"],
  );
}

export function ownerDecisionIsCurrent(current: RenewalProgress | null): boolean {
  return Boolean(
    current &&
    current.processVersion === RENEWAL_PROCESS_VERSION &&
    evidenceHasCurrentOwnerDecision(current),
  );
}

/**
 * Record the human owner's current decision. This explicit operator action is also the safe migration
 * seam for a legacy four-step record: it pins renewal-v1, retains the prior value for review until the
 * new save succeeds, and invalidates every tenant/packet/signature/compliance reference downstream.
 */
export function planRecordOwnerDecision(
  current: RenewalProgress | null,
  decision: RenewalOwnerDecision,
): RenewalProgressPlan {
  const ownerDecision = normalizeOwnerDecision(decision);
  const ownerDecisionRevision = (current?.ownerDecisionRevision ?? 0) + 1;
  const changed = replaceRenewalEvidence(
    current?.evidence ?? {},
    "owner-decision",
    appEvidence(`lease-progress:owner-decision:r${ownerDecisionRevision}`),
  );
  const evidence: RenewalEvidenceMap = {
    ...changed.evidence,
    // This is an app shape invariant, not a claim about a provider value: charges remain separate
    // fields and cannot be folded into offeredRent/base rent by this planner.
    "recurring-charges-separated": appEvidence(
      "app-contract:base-rent-and-recurring-charges:v1",
    ),
  };
  return {
    processVersion: RENEWAL_PROCESS_VERSION,
    stageIndex: RENEWAL_STAGE.owner,
    ownerDecision,
    ownerDecisionRevision,
    tenantOfferDraftId: null,
    tenantOutcome: null,
    evidence,
    complete: false,
  };
}

/**
 * Stamp the exact UNSENT tenant-offer Gmail draft receipt. A draft never completes the tenant-decision
 * step and never advances to documents; only a source-backed accepted outcome can do that.
 */
export function planRecordTenantOfferDraft(
  current: RenewalProgress | null,
  draftId: string,
): RenewalProgressPlan {
  const active = assertCurrentProcess(current);
  if (!evidenceHasCurrentOwnerDecision(active)) {
    throw new EditableLayerError(
      "Record the current owner decision before drafting the tenant offer.",
      409,
    );
  }
  const trimmed = draftId.trim();
  if (trimmed === "") {
    throw new EditableLayerError("A tenant-offer draft id is required.", 400);
  }
  if (active.tenantOfferDraftId === trimmed) {
    return {
      processVersion: active.processVersion,
      stageIndex: active.stageIndex,
      ownerDecision: active.ownerDecision,
      ownerDecisionRevision: active.ownerDecisionRevision,
      tenantOfferDraftId: active.tenantOfferDraftId,
      tenantOutcome: active.tenantOutcome,
      evidence: active.evidence,
      complete: active.complete,
    };
  }
  const changed = replaceRenewalEvidence(
    active.evidence,
    "tenant-draft-receipt",
    buildRenewalEvidenceReference({
      ref: `gmail-draft:${trimmed}`,
      source: "gmail_receipt",
      disposition: "verified",
    }),
  );
  return {
    processVersion: active.processVersion,
    stageIndex: RENEWAL_STAGE.tenant,
    ownerDecision: active.ownerDecision,
    ownerDecisionRevision: active.ownerDecisionRevision,
    tenantOfferDraftId: trimmed,
    tenantOutcome: null,
    evidence: changed.evidence,
    complete: false,
  };
}

/**
 * Record a source-backed tenant outcome. Counter/change removes the current owner-decision evidence
 * and all dependent previews while retaining the last value for operator review. Decline exits to the
 * separate non-renewal handoff; accepted is the only branch that may enter document work.
 */
export function planRecordTenantOutcome(
  current: RenewalProgress | null,
  state: RenewalTenantOutcomeState,
  evidenceReference: RenewalEvidenceReference,
): RenewalProgressPlan {
  const active = assertCurrentProcess(current);
  if (!evidenceHasCurrentOwnerDecision(active) || !active.tenantOfferDraftId) {
    throw new EditableLayerError(
      "Create the current tenant-offer draft from a current owner decision before recording an outcome.",
      409,
    );
  }
  const evidence = buildRenewalEvidenceReference(evidenceReference);
  if (evidence.disposition !== "verified") {
    throw new EditableLayerError("A tenant outcome needs verified evidence.", 400);
  }
  if (evidence.source !== "gmail_receipt" && evidence.source !== "app_record") {
    throw new EditableLayerError(
      "A tenant outcome needs a linked Gmail receipt or verified app record.",
      400,
    );
  }
  let changed = replaceRenewalEvidence(active.evidence, "tenant-outcome", evidence);
  let tenantOfferDraftId: string | null = active.tenantOfferDraftId;
  let stageIndex: number = RENEWAL_STAGE.tenant;

  if (state === "counter_change_requested") {
    const reopened = { ...changed.evidence };
    delete reopened["owner-decision"];
    for (const key of renewalEvidenceInvalidatedBy("owner-decision")) {
      delete reopened[key];
    }
    // Preserve the counter evidence after clearing the stale accepted-path evidence.
    reopened["tenant-outcome"] = evidence;
    changed = { evidence: reopened, invalidated: [] };
    tenantOfferDraftId = null;
    stageIndex = RENEWAL_STAGE.owner;
  } else if (state === "accepted") {
    stageIndex = RENEWAL_STAGE.documents;
  } else if (state === "declined_nonrenewing") {
    const exited = { ...changed.evidence };
    for (const key of renewalEvidenceInvalidatedBy("tenant-outcome")) {
      delete exited[key];
    }
    exited["tenant-outcome"] = evidence;
    changed = { evidence: exited, invalidated: [] };
  }

  return {
    processVersion: active.processVersion,
    stageIndex,
    ownerDecision: active.ownerDecision,
    ownerDecisionRevision: active.ownerDecisionRevision,
    tenantOfferDraftId,
    tenantOutcome: { state, evidence },
    evidence: changed.evidence,
    complete: false,
  };
}

/**
 * Add or replace one validated evidence reference. Changing an upstream reference invalidates its exact
 * transitive dependents; unrelated evidence remains intact. This app-owned planner invokes no provider.
 */
export function planRecordRenewalEvidence(
  current: RenewalProgress | null,
  key: RenewalEvidenceKey,
  reference: RenewalEvidenceReference,
): RenewalProgressPlan {
  const active = assertCurrentProcess(current);
  if (DEDICATED_TRANSITION_EVIDENCE.includes(key)) {
    throw new EditableLayerError(
      `${key} evidence must be recorded through its dedicated state transition.`,
      409,
    );
  }
  const changed = replaceRenewalEvidence(active.evidence, key, reference);
  const invalidated = new Set(changed.invalidated);
  const ownerDecision = active.ownerDecision;
  const tenantOfferDraftId = invalidated.has("tenant-draft-receipt")
    ? null
    : active.tenantOfferDraftId;
  const tenantOutcome = invalidated.has("tenant-outcome") ? null : active.tenantOutcome;
  let stageIndex = clampStage(active.stageIndex);
  if (invalidated.has("owner-decision")) stageIndex = RENEWAL_STAGE.owner;
  else if (invalidated.has("tenant-outcome")) stageIndex = RENEWAL_STAGE.tenant;
  else if (invalidated.has("packet-snapshot")) stageIndex = RENEWAL_STAGE.documents;
  else if (invalidated.has("signatures-complete")) {
    stageIndex = RENEWAL_STAGE.signatures;
  } else if (invalidated.has("app-completion")) {
    stageIndex = RENEWAL_STAGE.compliance;
  }
  return {
    processVersion: active.processVersion,
    stageIndex,
    ownerDecision,
    ownerDecisionRevision: active.ownerDecisionRevision,
    tenantOfferDraftId,
    tenantOutcome,
    evidence: changed.evidence,
    complete: false,
  };
}

/** Mark app completion only after exact accepted-path evidence is present. */
export function planMarkComplete(
  current: RenewalProgress | null,
  completionReference?: RenewalEvidenceReference,
): RenewalProgressPlan {
  const active = assertCurrentProcess(current);
  const missing = missingRenewalCompletionEvidence(active.evidence, active.tenantOutcome);
  if (missing.length > 0) {
    throw new EditableLayerError(
      `Renewal compliance evidence is incomplete: ${missing.join(", ")}.`,
      409,
    );
  }
  if (!completionReference) {
    throw new EditableLayerError(
      "An exact app-completion evidence reference is required.",
      400,
    );
  }
  const changed = replaceRenewalEvidence(
    active.evidence,
    "app-completion",
    completionReference,
  );
  return {
    processVersion: active.processVersion,
    stageIndex: RENEWAL_STAGE.close,
    ownerDecision: active.ownerDecision,
    ownerDecisionRevision: active.ownerDecisionRevision,
    tenantOfferDraftId: active.tenantOfferDraftId,
    tenantOutcome: active.tenantOutcome,
    evidence: changed.evidence,
    complete: true,
  };
}

/**
 * The coarse desk stage is only a pointer. A legacy index is never reinterpreted as renewal-v1; it
 * returns to Data/Owner review until the explicit owner-decision migration seam pins the version.
 */
export function effectiveStageIndex(
  progress: RenewalProgress | null,
  derivedFallback: number,
): number {
  if (!progress) return derivedFallback;
  if (progress.processVersion !== RENEWAL_PROCESS_VERSION) {
    return progress.ownerDecision ? RENEWAL_STAGE.owner : RENEWAL_STAGE.data;
  }
  return clampStage(progress.stageIndex);
}
