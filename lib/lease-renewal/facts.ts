import {
  LEASE_RENEWAL_PLANNED_READS,
  RENEWAL_FACT_CONFIDENCE,
} from "@/lib/lease-renewal/constants";

/**
 * Domain model for imported renewal facts and the deterministic confidence gates from
 * docs/products/lease-renewal-agent.md: only facts that are both Verified and approved
 * can flow into owner-facing drafts without a visible warning; Likely facts may be used
 * in internal summaries but must be reviewed before approval; Conflict facts block
 * owner-facing drafts and executable actions until a human resolves them; and the run
 * keeps a missing-facts list against the planned read set.
 *
 * Pure and non-executable: no I/O, no external system access, no runtime trigger.
 */

export type RenewalFactConfidence = (typeof RENEWAL_FACT_CONFIDENCE)[number];

export interface RenewalFact {
  name: string;
  value?: string;
  source: string;
  recorded_at: string;
  confidence: RenewalFactConfidence;
  approved: boolean;
}

export interface RenewalFactGateResult {
  owner_draft_ready: boolean;
  blocking_conflicts: string[];
  needs_review: string[];
  facts_requiring_warning: string[];
  missing_facts: string[];
}

export function evaluateRenewalFactGates(
  facts: RenewalFact[],
  plannedReads: readonly string[] = LEASE_RENEWAL_PLANNED_READS,
): RenewalFactGateResult {
  const blockingConflicts: string[] = [];
  const needsReview: string[] = [];
  const factsRequiringWarning: string[] = [];
  const presentNames = new Set(facts.map((fact) => fact.name));

  for (const fact of facts) {
    if (fact.confidence === "Conflict") {
      blockingConflicts.push(fact.name);
    }

    if (fact.confidence === "Likely" || fact.confidence === "Needs Review") {
      needsReview.push(fact.name);
    }

    if (!(fact.confidence === "Verified" && fact.approved)) {
      factsRequiringWarning.push(fact.name);
    }
  }

  const missingFacts = plannedReads.filter((name) => !presentNames.has(name));

  return {
    owner_draft_ready:
      blockingConflicts.length === 0 &&
      factsRequiringWarning.length === 0 &&
      missingFacts.length === 0,
    blocking_conflicts: blockingConflicts,
    needs_review: needsReview,
    facts_requiring_warning: factsRequiringWarning,
    missing_facts: missingFacts,
  };
}
