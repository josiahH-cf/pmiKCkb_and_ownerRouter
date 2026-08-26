/** Canonical dual-source discrepancy language for RentVine + the operating renewal Sheet. */
export const DISCREPANCY_CATEGORIES = [
  "agree",
  "conflict",
  "rentvine_only",
  "sheet_only",
  "missing",
  "intentional_semantic_difference",
  "stale_snapshot",
  "identity_ambiguous",
] as const;

export type DiscrepancyCategory = (typeof DISCREPANCY_CATEGORIES)[number];

export interface DiscrepancyFacts {
  rentvinePresent: boolean;
  sheetPresent: boolean;
  valuesEqual?: boolean;
  intentionalSemanticDifference?: boolean;
  staleSnapshot?: boolean;
  identityAmbiguous?: boolean;
}

/**
 * Pure, value-free classifier. Callers compare values before invoking it; neither the input nor the
 * result needs to retain a rent, address, name, or provider record id.
 */
export function classifyDiscrepancy(facts: DiscrepancyFacts): DiscrepancyCategory {
  if (facts.identityAmbiguous) return "identity_ambiguous";
  if (!facts.rentvinePresent && !facts.sheetPresent) return "missing";
  if (facts.rentvinePresent && !facts.sheetPresent) return "rentvine_only";
  if (!facts.rentvinePresent && facts.sheetPresent) return "sheet_only";
  if (facts.intentionalSemanticDifference) return "intentional_semantic_difference";
  if (facts.staleSnapshot) return "stale_snapshot";
  return facts.valuesEqual ? "agree" : "conflict";
}

export interface DiscrepancyGuideEntry {
  category: DiscrepancyCategory;
  label: string;
  meaning: string;
  syntheticExample: string;
  nextStep: string;
}

/** Value-free, client-safe examples shown in Admin and reused by the action-center HTML. */
export const DISCREPANCY_GUIDE: readonly DiscrepancyGuideEntry[] = [
  {
    category: "agree",
    label: "Sources agree",
    meaning: "Both sources contain the same normalized fact.",
    syntheticExample: "The same example lease date appears in both sources.",
    nextStep: "No correction is needed.",
  },
  {
    category: "conflict",
    label: "Sources disagree",
    meaning: "Both sources contain the fact, but the normalized values differ.",
    syntheticExample: "The example lease has two different current-rent entries.",
    nextStep:
      "Confirm the intended value and record which source won; do not write automatically.",
  },
  {
    category: "rentvine_only",
    label: "RentVine only",
    meaning: "RentVine contains the fact and the Sheet does not.",
    syntheticExample: "The example lease exists in RentVine but its Sheet row is blank.",
    nextStep:
      "Confirm whether the Sheet should carry the fact before proposing a Sheet update.",
  },
  {
    category: "sheet_only",
    label: "Sheet only",
    meaning: "The Sheet contains the fact and RentVine does not.",
    syntheticExample: "The example Sheet row contains a date missing from RentVine.",
    nextStep: "Confirm the RentVine record and the meaning of the Sheet column.",
  },
  {
    category: "missing",
    label: "Missing in both",
    meaning: "Neither source contains the required fact.",
    syntheticExample: "The example lease has no renewal decision in either source.",
    nextStep: "Ask the process owner for the fact; do not guess.",
  },
  {
    category: "intentional_semantic_difference",
    label: "Different on purpose",
    meaning:
      "The fields have different business meanings even if their labels sound similar.",
    syntheticExample:
      "One example field is base rent and the other is total monthly charges.",
    nextStep: "Label both meanings clearly and compare like with like.",
  },
  {
    category: "stale_snapshot",
    label: "Read may be stale",
    meaning: "The comparison used a read older than the accepted currency window.",
    syntheticExample: "The example changed after the app's last read.",
    nextStep: "Refresh both sources before deciding.",
  },
  {
    category: "identity_ambiguous",
    label: "Lease match unclear",
    meaning: "The app cannot prove that the two rows describe the same lease.",
    syntheticExample:
      "Two example leases share a similar resident label without a stable id match.",
    nextStep: "Match by the stable lease id or have a person identify the correct row.",
  },
] as const;
