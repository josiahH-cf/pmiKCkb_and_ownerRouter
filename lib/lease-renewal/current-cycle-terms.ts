// S262 R-S262-5 (ARCH-S262-5, BEH-S262-5): the one current-cycle rule for future renewal terms.
//
// The lease's existing work record is the authority for the active renewal cycle. Rent to
// recommend, the working renewal base and the working renewal start and end read as current only
// for the cycle they were saved for. A value saved while the lease had no work record belongs to
// the lease's first cycle. A value saved before cycles were bound reads as current only when the
// structure or existing evidence ties its exact revision and purpose to the active cycle: the lease
// has had no other cycle, the owner approval recorded on the cycle captured exactly that revision,
// the tenant answer recorded on the cycle answered exactly that revision, or the S249 preparation
// named the cycle when it saved the rent. An earlier cycle's value is history; an unbound value
// waits for an explicit confirmation in its own field. Lease facts (the working current rent,
// housing assistance and the Sheet lookups) keep their lease scope.
//
// Pure and client-safe. The desk, Guided and Full, message composition, packet preparation,
// source-update previews and the exact claims all read this one rule.

import {
  CYCLE_SCOPED_WORKING_FIELDS,
  isCycleScopedWorkingField,
  type CycleScopedWorkingField,
  type HeldFutureTerm,
  type RenewalWorkingRecord,
  type WorkingFieldEntry,
} from "./working-record";

/** The parts of the active work record the projection reads. */
export interface ActiveCycleEvidence {
  readonly cycleId: string;
  /**
   * The cycle the work record replaced when it was established: null for the lease's first cycle.
   * Absent on records established before cycles were bound.
   */
  readonly previousCycleId?: string | null;
  readonly ownerResponse?: {
    readonly outcome?: string;
    readonly approvedWorkingTerms?: {
      readonly rent: number;
      readonly effectiveDate: string;
      readonly endDate: string;
      readonly fieldRevisions: {
        readonly rent: number;
        readonly effectiveDate: number;
        readonly endDate: number;
      };
    };
  } | null;
  readonly tenantResponse?: {
    readonly workingTermRevisions?: {
      readonly rent: number;
      readonly effectiveDate: number;
      readonly endDate: number;
    };
  } | null;
}

export type FutureTermScope = "current" | "earlier" | "unverified";

const TERM_KEY = {
  terms_rent: "rent",
  terms_effective_date: "effectiveDate",
  terms_end_date: "endDate",
} as const;

/** The S249 preparation stamps the cycle it saved the rent for in the entry's context. */
function contextNamesCycle(context: string | undefined, cycleId: string): boolean {
  if (!context) return false;
  try {
    const parsed = JSON.parse(context) as unknown;
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      (parsed as { cycleId?: unknown }).cycleId === cycleId
    )
      return true;
  } catch {
    // Not the JSON form; the standing-rule form names the cycle in its basis text.
  }
  return context.includes(`(${cycleId}).`);
}

function legacyEvidence(
  field: CycleScopedWorkingField,
  entry: WorkingFieldEntry,
  cycle: ActiveCycleEvidence,
): boolean {
  // Rent to recommend is never a legacy value: it exists only as its own bound fact.
  if (field === "recommended_rent") return false;
  const key = TERM_KEY[field];
  const approved =
    cycle.ownerResponse?.outcome === "approved_terms"
      ? cycle.ownerResponse.approvedWorkingTerms
      : undefined;
  if (
    approved &&
    approved.fieldRevisions[key] === entry.revision &&
    approved[key] === entry.value
  )
    return true;
  const answered = cycle.tenantResponse?.workingTermRevisions;
  if (answered && answered[key] > 0 && answered[key] === entry.revision) return true;
  return (
    field === "terms_rent" &&
    entry.origin === "adopted_source" &&
    contextNamesCycle(entry.context, cycle.cycleId)
  );
}

/** Whether one future-term value is current for the active cycle, earlier history, or unbound. */
export function futureTermScope(
  field: CycleScopedWorkingField,
  entry: WorkingFieldEntry,
  cycle: ActiveCycleEvidence | null,
): FutureTermScope {
  if (typeof entry.cycleId === "string")
    return cycle !== null && entry.cycleId === cycle.cycleId ? "current" : "earlier";
  // A value saved while the lease had no work record belongs to the lease's first cycle.
  if (entry.cycleId === null) {
    if (cycle === null || cycle.previousCycleId === null) return "current";
    return typeof cycle.previousCycleId === "string" ? "earlier" : "unverified";
  }
  // Saved before cycles were bound. A cleared value holds no figure, so nothing can leak from it.
  if (entry.value === null) return "current";
  // The lease has had no cycle, or only this one since cycles were bound: no other cycle can own it.
  if (cycle === null || cycle.previousCycleId === null) return "current";
  // A cycle established since cycles were bound replaced an earlier one: the value is that history.
  if (typeof cycle.previousCycleId === "string") return "earlier";
  return legacyEvidence(field, entry, cycle) ? "current" : "unverified";
}

/** Every stored entry of a record, including future terms a projection held back. */
function storedFields(record: RenewalWorkingRecord): Record<string, WorkingFieldEntry> {
  const fields: Record<string, WorkingFieldEntry> = { ...record.fields };
  for (const [field, held] of Object.entries(record.cycle?.held ?? {}))
    if (held && !fields[field]) fields[field] = held.entry;
  return fields;
}

/**
 * The record as the active cycle reads it: lease facts and the current future terms in `fields`,
 * every other future-term value held back in `cycle.held` with its scope. Reading never writes.
 */
export function projectCurrentCycleWorkingRecord(
  record: RenewalWorkingRecord | null | undefined,
  cycle: ActiveCycleEvidence | null | undefined,
): RenewalWorkingRecord | null {
  if (!record) return null;
  const stored = storedFields(record);
  const fields: Record<string, WorkingFieldEntry> = { ...stored };
  const held: Partial<Record<CycleScopedWorkingField, HeldFutureTerm>> = {};
  for (const field of CYCLE_SCOPED_WORKING_FIELDS) {
    const entry = stored[field];
    if (!entry) continue;
    const scope = futureTermScope(field, entry, cycle ?? null);
    if (scope === "current") continue;
    delete fields[field];
    held[field] = { entry, scope };
  }
  return {
    schemaVersion: record.schemaVersion,
    leaseId: record.leaseId,
    revision: record.revision,
    fields,
    cycle: { cycleId: cycle?.cycleId ?? null, held },
  };
}

/** A future-term value held back from the active cycle, or null. */
export function heldFutureTerm(
  record: RenewalWorkingRecord | null | undefined,
  field: string,
): HeldFutureTerm | null {
  if (!isCycleScopedWorkingField(field)) return null;
  return record?.cycle?.held[field] ?? null;
}

/** The stored entry for a field whether it is current or held back; the save's revision check. */
export function storedWorkingEntry(
  record: RenewalWorkingRecord | null | undefined,
  field: string,
): WorkingFieldEntry | null {
  return record?.fields[field] ?? heldFutureTerm(record, field)?.entry ?? null;
}

export function storedWorkingRevision(
  record: RenewalWorkingRecord | null | undefined,
  field: string,
): number {
  return storedWorkingEntry(record, field)?.revision ?? 0;
}

/**
 * S249 under R-S262-5: the field is authoritatively empty for the active cycle. An earlier
 * cycle's value leaves it empty; an unbound value is neither current nor empty.
 */
export function currentCycleFieldEmpty(
  record: RenewalWorkingRecord | null | undefined,
  field: CycleScopedWorkingField,
): boolean {
  const entry = record?.fields[field];
  if (entry && entry.value !== null) return false;
  return heldFutureTerm(record, field)?.scope !== "unverified";
}

/**
 * S262 R-S262-2: Rent to recommend. Until a recorded owner answer or a deliberate adoption gives
 * the working renewal base its own value, one working value serves both (S156/S249). After that
 * the recommendation is its own fact. When a recorded answer set the base and no earlier
 * recommendation can be established, the recommendation is unavailable: the approved rent is
 * never copied back into it.
 */
export type RecommendationFact =
  | { readonly kind: "shared"; readonly entry: WorkingFieldEntry | null }
  | { readonly kind: "independent"; readonly entry: WorkingFieldEntry }
  | { readonly kind: "unavailable" };

export function recommendationFact(
  record: RenewalWorkingRecord | null | undefined,
): RecommendationFact {
  const own = record?.fields.recommended_rent;
  if (own) return { kind: "independent", entry: own };
  const base = record?.fields.terms_rent ?? null;
  return base?.basis ? { kind: "unavailable" } : { kind: "shared", entry: base };
}

/** The current recommendation's amount, or null when none is set or it is unavailable. */
export function recommendedRentValue(
  record: RenewalWorkingRecord | null | undefined,
): number | null {
  const fact = recommendationFact(record);
  if (fact.kind === "unavailable") return null;
  const value = fact.entry?.value;
  return typeof value === "number" ? value : null;
}

/** The working field Rent to recommend saves into: the shared value, or its own fact. */
export function recommendationField(
  record: RenewalWorkingRecord | null | undefined,
): "terms_rent" | "recommended_rent" {
  return recommendationFact(record).kind === "shared" ? "terms_rent" : "recommended_rent";
}

/**
 * S262 "Use this amount for the offer": a current recommendation that differs from the independent
 * working renewal base, with the exact revisions the deliberate change is checked against.
 */
export function offerAdoptionCandidate(record: RenewalWorkingRecord | null | undefined): {
  readonly value: number;
  readonly recommendationRevision: number;
  readonly workingRevision: number;
  readonly workingValue: number | null;
} | null {
  const fact = recommendationFact(record);
  if (fact.kind !== "independent" || typeof fact.entry.value !== "number") return null;
  const base = record?.fields.terms_rent;
  const workingValue = typeof base?.value === "number" ? base.value : null;
  if (workingValue !== null && Math.abs(workingValue - fact.entry.value) < 0.005)
    return null;
  return {
    value: fact.entry.value,
    recommendationRevision: fact.entry.revision,
    workingRevision: storedWorkingRevision(record, "terms_rent"),
    workingValue,
  };
}
