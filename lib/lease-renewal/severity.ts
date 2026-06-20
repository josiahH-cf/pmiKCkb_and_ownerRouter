// Severity routing for reconciliation flags (Phase-1, read-only) — connector design §3.3.
//
// First-match-wins over four rules:
//   1. legal / financial / tenant-notice-or-renewal timing / owner-or-tenant-facing OR feeds an
//      external write  -> High (Admin required; never auto-applied).
//   2. any candidate unparsed, join below threshold, column unmapped, or no precedence rule
//      -> Blocked (never a guessed write; routes to failed/blocked automation).
//   3. affects workflow/internal state only -> Medium.
//   4. cosmetic / normalization -> Low.
// Inspection cadence is operational (Medium) UNLESS it implicates the $130 owner charge, which is
// financial -> High (build plan §3 / design §3.2 Case A). Pure and deterministic.

export type Severity = "High" | "Blocked" | "Medium" | "Low";

export type FieldClass =
  | "legal"
  | "financial"
  | "timing"
  | "owner_facing"
  | "tenant_facing"
  | "operational"
  | "tenant_intake"
  | "cosmetic";

/** Classes that route to High under rule 1. */
export const HIGH_FIELD_CLASSES: ReadonlySet<FieldClass> = new Set<FieldClass>([
  "legal",
  "financial",
  "timing",
  "owner_facing",
  "tenant_facing",
]);

// Field → class. Unlisted fields default to operational (Medium); a missing precedence rule is
// handled separately as a Blocked flag by reconciliation.
export const FIELD_CLASS_REGISTRY: Record<string, FieldClass> = {
  renewal_date: "timing",
  current_rent: "financial",
  market_value: "financial",
  owner_charge_130: "financial",
  lawn_care: "legal",
  utilities_needed: "legal",
  owner_pricing_confirmed: "owner_facing",
  inspections_cadence: "operational",
  lease_start: "operational",
  address: "operational",
  tenant_name: "tenant_intake",
};

export interface SeverityFlags {
  /** Field feeds an external write surface (rule 1). */
  feedsExternalWrite?: boolean;
  /** Rule-2 blockers. */
  hasUnparsedCandidate?: boolean;
  joinBelowThreshold?: boolean;
  columnUnmapped?: boolean;
  noPrecedenceRule?: boolean;
}

export interface FieldContext {
  /** Inspection cadence that implicates the missed-inspection $130 owner charge -> financial. */
  implicatesOwnerCharge?: boolean;
}

export interface SeverityDecision {
  severity: Severity;
  rule: number;
  reason: string;
}

export function classifyField(fieldKey: string, context: FieldContext = {}): FieldClass {
  if (fieldKey === "inspections_cadence" && context.implicatesOwnerCharge) {
    return "financial";
  }
  return FIELD_CLASS_REGISTRY[fieldKey] ?? "operational";
}

/** Route a severity from a field class plus data-quality flags, first-match-wins. */
export function routeSeverity(fieldClass: FieldClass, flags: SeverityFlags = {}): SeverityDecision {
  if (HIGH_FIELD_CLASSES.has(fieldClass) || flags.feedsExternalWrite) {
    return {
      severity: "High",
      rule: 1,
      reason: flags.feedsExternalWrite
        ? "feeds an external write"
        : `${fieldClass} field requires Admin review`,
    };
  }

  if (
    flags.hasUnparsedCandidate ||
    flags.joinBelowThreshold ||
    flags.columnUnmapped ||
    flags.noPrecedenceRule
  ) {
    const reason = flags.noPrecedenceRule
      ? "no precedence rule"
      : flags.columnUnmapped
        ? "column unmapped"
        : flags.joinBelowThreshold
          ? "join below threshold"
          : "unparsed candidate";
    return { severity: "Blocked", rule: 2, reason: `${reason} — never a guessed write` };
  }

  if (fieldClass === "operational" || fieldClass === "tenant_intake") {
    return { severity: "Medium", rule: 3, reason: "affects internal/workflow state only" };
  }

  return { severity: "Low", rule: 4, reason: "cosmetic / normalization" };
}

/** Convenience: classify a field then route its severity. */
export function severityForField(
  fieldKey: string,
  flags: SeverityFlags = {},
  context: FieldContext = {},
): SeverityDecision {
  return routeSeverity(classifyField(fieldKey, context), flags);
}
