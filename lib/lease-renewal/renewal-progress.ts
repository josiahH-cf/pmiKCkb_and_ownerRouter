// Per-lease LIVE renewal PROGRESS — the small, app-owned state machine that makes the live workspace
// clickable front-to-back (Phase A). The reconciliation, facts, recipients, and drafts all stay derived
// from RentVine + the Sheet exactly as before; this adds ONLY the operator's own forward progress:
//   • the owner's recorded rent decision (which unlocks + shapes the tenant offer),
//   • the id of the tenant-offer Gmail draft once one has been created,
//   • whether the operator has marked the renewal complete.
//
// It changes NO system of record: RentVine stays read-only, the Sheet stays read-only. This state lives
// in the KB's own Firestore (see lib/firestore/lease-renewal-progress.ts). This module is the PURE core:
// stage arithmetic + transition validation, no I/O and no Date.now(). The Firestore layer calls these
// planners inside a transaction; the route maps a thrown EditableLayerError to its HTTP status.

import { EditableLayerError } from "@/lib/firestore/errors";
import type { OwnerDecision } from "@/lib/lease-renewal/tenant-draft";

/** Stage indices into RENEWAL_STEPS (data → owner → tenant → build). */
export const RENEWAL_STAGE = {
  data: 0,
  owner: 1,
  tenant: 2,
  build: 3,
} as const;

/** Highest valid stage index (build). */
export const MAX_RENEWAL_STAGE = RENEWAL_STAGE.build;

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
  bedrooms?: number;
  bathrooms?: number;
  daysOnMarket?: number;
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
  unitFilters?: {
    bedrooms?: number;
    bathrooms?: number;
    squareFootage?: number;
    propertyType?: string;
  };
  comps?: RenewalMarketProviderComp[];
  trend?: RenewalMarketProviderTrend;
}

export interface RenewalMarketBasis {
  /** Operator-typed comp-range low ("Comp low (typed)" in the UI; persisted key name retained). */
  zillowLow?: number;
  /** Operator-typed comp-range high ("Comp high (typed)" in the UI; persisted key name retained). */
  zillowHigh?: number;
  /** The specific number from the PMI/franchise rental-analysis tool. */
  pmiNumber?: number;
  /** The comps-search URL the operator used (property address only; no tenant PII). */
  compsUrl?: string;
  /** The stored Drive ref (drive:<id>) for the uploaded comps screenshot (S28a; distinct from compsUrl). */
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
  /** Optional operator comp basis (Zillow range + PMI number + comps URL). */
  market?: RenewalMarketBasis;
}

/** Browser/server write input. Screenshot provenance is derived inside the Firestore transaction. */
export type RenewalOwnerDecisionWriteInput = Omit<RenewalOwnerDecision, "market"> & {
  market?: Omit<RenewalMarketBasis, "compScreenshotRef">;
};

/** One lease's forward progress. `stageIndex` is the furthest step the operator has reached. */
export interface RenewalProgress {
  leaseId: string;
  stageIndex: number;
  ownerDecision: RenewalOwnerDecision | null;
  tenantOfferDraftId: string | null;
  complete: boolean;
}

/** The value-shape a transition planner returns (identity omitted — the store owns the leaseId). */
export interface RenewalProgressPlan {
  stageIndex: number;
  ownerDecision: RenewalOwnerDecision | null;
  tenantOfferDraftId: string | null;
  complete: boolean;
}

const OWNER_DECISIONS: readonly OwnerDecision[] = ["keep_same", "increase", "custom"];

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
 * never negative); the comps URL is trimmed and dropped when blank. Returns undefined when nothing was
 * entered, so a decision without comps carries no `market` field. Never invents a value.
 */
function normalizeMarketBasis(
  input: RenewalMarketBasis | undefined,
): RenewalMarketBasis | undefined {
  if (!input) return undefined;
  const market: RenewalMarketBasis = {};
  if (input.zillowLow !== undefined) {
    market.zillowLow = assertMoney(input.zillowLow, "Zillow low", true);
  }
  if (input.zillowHigh !== undefined) {
    market.zillowHigh = assertMoney(input.zillowHigh, "Zillow high", true);
  }
  if (input.pmiNumber !== undefined) {
    market.pmiNumber = assertMoney(input.pmiNumber, "PMI rental-analysis number", true);
  }
  if (
    market.zillowLow !== undefined &&
    market.zillowHigh !== undefined &&
    market.zillowHigh < market.zillowLow
  ) {
    throw new EditableLayerError("Zillow high cannot be less than Zillow low.", 400);
  }
  if (input.compsUrl && input.compsUrl.trim() !== "") {
    market.compsUrl = input.compsUrl.trim();
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
      if (comp.bedrooms !== undefined) {
        normalized.bedrooms = assertMoney(comp.bedrooms, "Comp bedrooms", true);
      }
      if (comp.bathrooms !== undefined) {
        normalized.bathrooms = assertMoney(comp.bathrooms, "Comp bathrooms", true);
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

/**
 * Record the owner's rent decision. This is the seam that makes the flow move: it (re)places the lease at
 * the Tenant-offer step and clears any prior tenant draft, since a changed decision invalidates a draft
 * built from the old numbers. Always leaves `complete: false` — a new decision reopens the work.
 */
export function planRecordOwnerDecision(
  _current: RenewalProgress | null,
  decision: RenewalOwnerDecision,
): RenewalProgressPlan {
  return {
    stageIndex: RENEWAL_STAGE.tenant,
    ownerDecision: normalizeOwnerDecision(decision),
    tenantOfferDraftId: null,
    complete: false,
  };
}

/**
 * Stamp the tenant-offer Gmail draft id and advance to Build docs. Requires a recorded owner decision —
 * a tenant offer without a decision would be an out-of-order state. Idempotent for the same draft id.
 */
export function planRecordTenantOfferDraft(
  current: RenewalProgress | null,
  draftId: string,
): RenewalProgressPlan {
  if (!current || !current.ownerDecision) {
    throw new EditableLayerError(
      "Record the owner decision before drafting the tenant offer.",
      409,
    );
  }
  const trimmed = draftId.trim();
  if (trimmed === "") {
    throw new EditableLayerError("A tenant-offer draft id is required.", 400);
  }
  return {
    stageIndex: Math.max(clampStage(current.stageIndex), RENEWAL_STAGE.build),
    ownerDecision: current.ownerDecision,
    tenantOfferDraftId: trimmed,
    complete: current.complete,
  };
}

/**
 * Mark the renewal complete (operator confirms the process is done for this lease). Requires that the
 * owner decision was recorded — you cannot complete a lease no one has decided. Pins the stage to Build.
 */
export function planMarkComplete(current: RenewalProgress | null): RenewalProgressPlan {
  if (!current || !current.ownerDecision) {
    throw new EditableLayerError(
      "Record the owner decision before marking the renewal complete.",
      409,
    );
  }
  return {
    stageIndex: RENEWAL_STAGE.build,
    ownerDecision: current.ownerDecision,
    tenantOfferDraftId: current.tenantOfferDraftId,
    complete: true,
  };
}

/**
 * The stage the workspace should show. When the operator has recorded progress, that wins; otherwise the
 * data-derived fallback (open conflict → Data check, else Owner decision) computed by the live desk holds.
 */
export function effectiveStageIndex(
  progress: RenewalProgress | null,
  derivedFallback: number,
): number {
  if (!progress) return derivedFallback;
  return clampStage(progress.stageIndex);
}
