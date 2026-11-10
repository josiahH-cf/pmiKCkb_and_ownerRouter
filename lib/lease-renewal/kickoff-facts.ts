// S249 ARCH-S249-1: the facts one lease's preparation projection reads, assembled from what the
// desk orchestration and the lease page already loaded plus one bulk read of stored comparisons
// (`kickoff-support.ts`). Pure: it reads no source and records nothing.

import type { DeskReconItem } from "@/lib/lease-renewal/desk-model";
import { RENTVINE_SOURCE_SYSTEM } from "@/lib/integrations/rentvine/lease-mapper";
import { marketBasisFromCapturedResult } from "@/lib/lease-renewal/market-observation";
import type { CapturedCompResult } from "@/lib/lease-renewal/market-observation";
import type {
  RenewalComparisonFacts,
  RenewalKickoffFacts,
  RenewalStoredComparison,
} from "@/lib/lease-renewal/renewal-preparation";
import {
  currentRentChoice,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import {
  recommendationFact,
  recommendedRentValue,
} from "@/lib/lease-renewal/current-cycle-terms";

/** One stored comps lookup for a lease, as the observation store keeps it. */
export interface KickoffObservationRow {
  readonly id: string;
  readonly leaseId: string;
  readonly cycleId: string;
  readonly recordedAt: string;
  readonly result: CapturedCompResult;
}

/** A batch preparation's settled outcome for one lease and cycle (the claim record). */
export interface KickoffPreparationOutcome {
  readonly cycleKey: string;
  readonly state: "claimed" | "prepared" | "reused" | "no_usable" | "failed";
  readonly reason: string | null;
}

/** What the desk and the lease page read once for every lease's projection. */
export interface KickoffSupportRead {
  /** Stored comps lookups by lease; null when the read failed (never read as "none"). */
  readonly observationsByLease: ReadonlyMap<
    string,
    readonly KickoffObservationRow[]
  > | null;
  /** The signed-in sender has a signature; null when unread. */
  readonly signature: boolean | null;
  readonly templateApproved: boolean | null;
  /** This month's comparison allowance is reached; null when unread. */
  readonly allowanceReached: boolean | null;
  /** Batch preparation outcomes by lease (S249 R-S249-3); absent or null when unread. */
  readonly preparationsByLease?: ReadonlyMap<string, KickoffPreparationOutcome> | null;
}

export const UNREAD_KICKOFF_SUPPORT: KickoffSupportRead = Object.freeze({
  observationsByLease: null,
  signature: null,
  templateApproved: null,
  allowanceReached: null,
  preparationsByLease: null,
});

/**
 * S251 R-S251-7 (ARCH-S251-4): a lease marked Housing assistance Yes is held back until "Propose
 * a change" is recorded for this cycle. Preparation asks this one predicate before any billed
 * lookup; S251 supplies the fact (the working record) and the rent choice (the staff record). A
 * staff member can still run a comparison by hand at any time with the lease's own control.
 */
export function heldBackForHousingAssistance(input: {
  /** "unread": the working record could not be read, so the fact is unknown and the lease waits. */
  readonly housingAssistance: { readonly program: string } | null | undefined | "unread";
  readonly rentChangeProposed?: boolean;
}): boolean {
  if (input.housingAssistance === "unread") return true;
  return Boolean(input.housingAssistance) && input.rentChangeProposed !== true;
}

export const HOUSING_ASSISTANCE_HOLD_REASON =
  "Held back: this lease has housing assistance, so the comparison waits until a rent change is proposed";

/** The hold while the lease's working record cannot be read (the server holds it the same way). */
export const HOUSING_ASSISTANCE_UNREAD_REASON =
  "Held back: this lease's Housing assistance could not be read just now, so no comparison starts by itself";

function storedFromProvider(
  provider: NonNullable<ReturnType<typeof marketBasisFromCapturedResult>["provider"]>,
  observationId: string | null,
  observedAtIso: string,
): RenewalStoredComparison {
  return {
    observationId,
    observedAtIso,
    source: provider.source,
    rangeLow: provider.rangeLow,
    rangeHigh: provider.rangeHigh,
    compCount: provider.compCount,
    comps: (provider.comps ?? []).map((comp) => ({
      rent: comp.rent,
      ...(comp.distanceMiles !== undefined ? { distanceMiles: comp.distanceMiles } : {}),
      ...(comp.bedrooms !== undefined ? { bedrooms: comp.bedrooms } : {}),
    })),
  };
}

/**
 * R-S249-2: the stored comparison for this lease and cycle. The staff record's saved preparation
 * comes first; else the newest stored lookup for the same cycle with a usable provider basis, so a
 * lookup made by batch preparation reaches the message with no second run.
 */
export function storedComparisonFor(input: {
  readonly manual: RenewalWorkspaceState | null;
  readonly observations: readonly KickoffObservationRow[];
}): RenewalStoredComparison | null {
  const preparation = input.manual?.preparation;
  const saved = preparation?.market.provider;
  if (saved)
    return storedFromProvider(
      saved,
      preparation?.observationId ?? null,
      saved.retrievedAt || preparation?.recordedAt || "",
    );
  const cycleId = input.manual?.cycleId;
  if (!cycleId) return null;
  const rows = [...input.observations]
    .filter((row) => row.cycleId === cycleId)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  for (const row of rows) {
    const provider = marketBasisFromCapturedResult(row.result).provider;
    if (provider) return storedFromProvider(provider, row.id, row.recordedAt);
  }
  return null;
}

function money(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** The operating Sheet's values in the data check, read as information only (D-OP-7). */
export function sheetValuesFrom(dataCheck: readonly DeskReconItem[] | null | undefined): {
  readonly rent: number | null;
  readonly endIso: string | null;
} {
  const sheet = (fieldKey: string) =>
    dataCheck
      ?.find((item) => item.fieldKey === fieldKey)
      ?.candidates.find(
        (candidate) =>
          candidate.sourceSystem !== RENTVINE_SOURCE_SYSTEM && candidate.value.trim(),
      )?.value;
  const end = sheet("renewal_date")?.trim() ?? null;
  return {
    rent: money(sheet("current_rent")),
    endIso: end && /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : null,
  };
}

/**
 * R-S249-5 / AC-S249-5: the rent staff typed. The working renewal rent first; else a recommended
 * rent staff entered in the comparison section themselves (reviewed, never a provider estimate).
 */
export function typedRecommendation(
  working: RenewalWorkingRecord | null | undefined,
  manual: RenewalWorkspaceState | null,
): number | null {
  // S262 R-S262-2: the shared working value until the working base has its own value, then
  // Rent to recommend's own fact. An unavailable recommendation never reads the approved rent.
  const workingRent = recommendedRentValue(working);
  if (workingRent !== null) return workingRent;
  const market = manual?.preparation?.market;
  return market &&
    market.recommendationBasis !== "provider" &&
    typeof market.pmiNumber === "number" &&
    market.pmiNumber > 0
    ? market.pmiNumber
    : null;
}

/** Preserve a saved adoption's recorded source without inferring an agreement for legacy data. */
export function workingRecommendationBasis(
  working: RenewalWorkingRecord | null | undefined,
): string | null {
  const fact = recommendationFact(working);
  const entry = fact.kind === "unavailable" ? null : fact.entry;
  return entry?.origin === "adopted_source" && entry.sourceLabel
    ? `Saved working rent from ${entry.sourceLabel}. Later proposals keep this saved amount.`
    : null;
}

/** The current RentVine rent-account charge amounts in a charge inventory; null when unread. */
export function currentRentChargeAmounts(
  inventory: RenewalChargeInventory | null | undefined,
): number[] | null {
  if (!inventory) return null;
  return inventory.charges
    .filter((charge) => charge.classification === "rent" && charge.current !== false)
    .map((charge) => Number(charge.projection.amount))
    .filter((amount) => Number.isFinite(amount) && amount > 0);
}

export interface KickoffFactsInput {
  readonly leaseId: string;
  /** The renewal cycle's date (the batch claim's cycle key). */
  readonly cycleDateIso: string | null;
  readonly contractualRent: number | null;
  readonly leaseEndIso: string | null;
  readonly workingCurrentRent: number | null | undefined;
  readonly address: string | null;
  readonly dataCheck: readonly DeskReconItem[] | null | undefined;
  readonly manual: RenewalWorkspaceState | null;
  readonly working: RenewalWorkingRecord | null | undefined;
  readonly sourceReadable: boolean;
  readonly ownerRecipient: RenewalKickoffFacts["ownerRecipient"];
  readonly support: KickoffSupportRead;
  /** The current RentVine rent charges, where this surface read them (the lease page). */
  readonly rentCharges?: readonly number[] | null;
  /** S251: the lease's Housing assistance Yes fact, from its working record ("unread": unknown). */
  readonly housingAssistance?: { readonly program: string } | null | "unread";
  /** S250: the covering standing agreement's rent, with its basis in words. */
  readonly agreementRent?: { readonly value: number; readonly basis: string } | null;
}

export function kickoffFactsFor(input: KickoffFactsInput): RenewalKickoffFacts {
  const sheet = sheetValuesFrom(input.dataCheck);
  const observations = input.support.observationsByLease;
  const stored = storedComparisonFor({
    manual: input.manual,
    observations: observations?.get(input.leaseId) ?? [],
  });
  const recorded = input.support.preparationsByLease?.get(input.leaseId) ?? null;
  const outcome =
    recorded && input.cycleDateIso && recorded.cycleKey === input.cycleDateIso
      ? recorded
      : null;
  const comparison: RenewalComparisonFacts = stored
    ? { state: "stored", comparison: stored }
    : heldBackForHousingAssistance({
          housingAssistance: input.housingAssistance,
          // S251 R-S251-7: Propose a change, recorded for this cycle, releases the hold.
          rentChangeProposed: currentRentChoice(input.manual) === "propose_change",
        })
      ? {
          state: "held_back",
          reason:
            input.housingAssistance === "unread"
              ? HOUSING_ASSISTANCE_UNREAD_REASON
              : HOUSING_ASSISTANCE_HOLD_REASON,
        }
      : outcome?.state === "no_usable"
        ? { state: "no_usable", reason: outcome.reason ?? "no usable comparables" }
        : observations === null && !input.manual?.preparation
          ? { state: "unreadable" }
          : input.support.allowanceReached === true
            ? { state: "allowance_reached" }
            : // ARCH-S249-3: this cycle's one claimed lookup already ran (or is running), so the
              // batch never offers it to the automatic start again.
              outcome
              ? { state: "none", attempted: true }
              : { state: "none" };
  return {
    numbers: {
      contractualRent: input.contractualRent,
      rentCharges: input.rentCharges ?? null,
      leaseEndIso: input.leaseEndIso,
      workingRent: input.workingCurrentRent ?? null,
      sheetRent: sheet.rent,
      sheetEndIso: sheet.endIso,
      sourceReadable: input.sourceReadable,
    },
    comparison,
    typedRent: typedRecommendation(input.working, input.manual),
    workingRentBasis: workingRecommendationBasis(input.working),
    agreementRent: input.agreementRent ?? null,
    currentRent: input.contractualRent,
    ownerRecipient: input.ownerRecipient,
    signature: input.support.signature,
    templateApproved: input.support.templateApproved,
    address: input.address,
  };
}
