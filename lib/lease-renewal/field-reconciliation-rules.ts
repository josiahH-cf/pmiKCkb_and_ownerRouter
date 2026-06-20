// Source-precedence defaults for reconciliation (connector design §3.4).
//
// SUGGESTION ONLY. Per OQ-PREC-1 (Dan must confirm these defaults), no precedence rule is
// auto-applied yet — PRECEDENCE_CONFIRMED is false, so even a "low after review" status flag stays
// suggestion-only. An unlisted field type has NO rule and routes to Blocked "no precedence rule".
// Pure data + lookups; no I/O.

export type AutoApplyPolicy = "no" | "low_after_review";

export interface PrecedenceRule {
  fieldType: string;
  /** Source identifiers, highest precedence first. */
  order: readonly string[];
  autoApply: AutoApplyPolicy;
}

/**
 * OQ-PREC-1 gate. Until Dan confirms the §3.4 defaults this stays false, so suggested winners are
 * never auto-applied — every resolution requires a human decision.
 */
export const PRECEDENCE_CONFIRMED = false;

export const PRECEDENCE_TABLE: Record<string, PrecedenceRule> = {
  lease_dates_renewal_timing: {
    fieldType: "lease_dates_renewal_timing",
    order: ["rentvine", "sheet_tab3"],
    autoApply: "no",
  },
  current_rent: {
    fieldType: "current_rent",
    order: ["rentvine", "sheet_tab3"],
    autoApply: "no",
  },
  market_value: {
    fieldType: "market_value",
    order: ["pmi_rental_analysis", "zillow"],
    autoApply: "no",
  },
  property_attributes_operational: {
    fieldType: "property_attributes_operational",
    order: ["rentvine_building", "sheet_tab17", "sheet_tab18"],
    autoApply: "no",
  },
  lease_contract_terms: {
    fieldType: "lease_contract_terms",
    order: ["active_lease_doc", "rentvine_building", "spreadsheet"],
    autoApply: "no",
  },
  owner_renewal_decision: {
    fieldType: "owner_renewal_decision",
    order: ["owner_email", "sheet_tab3"],
    autoApply: "no",
  },
  tenant_intake: {
    fieldType: "tenant_intake",
    order: ["google_form", "spreadsheet"],
    autoApply: "no",
  },
  address_canonicalization: {
    fieldType: "address_canonicalization",
    order: ["rentvine", "spreadsheet"],
    autoApply: "no",
  },
  status_workflow_flags: {
    fieldType: "status_workflow_flags",
    order: ["spreadsheet", "inferred"],
    autoApply: "low_after_review",
  },
};

export const FIELD_TYPE_OF_FIELD: Record<string, string> = {
  renewal_date: "lease_dates_renewal_timing",
  current_rent: "current_rent",
  market_value: "market_value",
  inspections_cadence: "property_attributes_operational",
  lawn_care: "lease_contract_terms",
  utilities_needed: "lease_contract_terms",
  owner_pricing_confirmed: "owner_renewal_decision",
  tenant_name: "tenant_intake",
  address: "address_canonicalization",
  esign_complete: "status_workflow_flags",
  info_form_sent: "status_workflow_flags",
  form_returned: "status_workflow_flags",
};

export function getPrecedenceRule(fieldKey: string): PrecedenceRule | undefined {
  const fieldType = FIELD_TYPE_OF_FIELD[fieldKey];
  return fieldType ? PRECEDENCE_TABLE[fieldType] : undefined;
}

/**
 * Suggest (never bind) the highest-precedence source present. Returns null when no candidate
 * sits in the rule's order. Suggestion only — see reconcileField for the auto-apply gate.
 */
export function suggestWinnerSource(
  rule: PrecedenceRule,
  presentSources: readonly string[],
): string | null {
  let winner: string | null = null;
  let winnerIndex = Number.POSITIVE_INFINITY;
  for (const source of presentSources) {
    const index = rule.order.indexOf(source);
    if (index !== -1 && index < winnerIndex) {
      winnerIndex = index;
      winner = source;
    }
  }
  return winner;
}
