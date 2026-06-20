// Per-field reconciliation for the renewal sheet connector (Phase-1, read-only) — design §3.2.
//
// Compares a field's candidates across sources (sheet, Rentvine read-authoritative, building
// level, Google Form), classifies agreement, suggests a winner from the §3.4 precedence table
// (SUGGESTION ONLY — never auto-applied), routes severity (§3.3), and decides whether to raise a
// flag. This is where "Conflict" confidence is legitimately set — across sources, post-ingest —
// which ingest itself never does. An unlisted field type degrades to Blocked "no precedence rule",
// never a guess. Pure and deterministic; no I/O, no external system, no write.

import {
  getPrecedenceRule,
  PRECEDENCE_CONFIRMED,
  suggestWinnerSource,
} from "@/lib/lease-renewal/field-reconciliation-rules";
import type { NormalizedConfidence } from "@/lib/lease-renewal/normalized-value";
import {
  severityForField,
  type FieldContext,
  type Severity,
} from "@/lib/lease-renewal/severity";

export type Agreement = "agree" | "conflict" | "single_source" | "missing";
export type DraftConfidence = NormalizedConfidence | "Conflict";

export interface ReconCandidate {
  /** Precedence identifier (e.g. "rentvine", "sheet_tab3"); matches the §3.4 order. */
  source: string;
  /** Human-facing source label. */
  source_system: string;
  value: string | number | boolean | null;
  raw?: string;
  location_ref?: string;
  read_timestamp?: string;
  confidence?: NormalizedConfidence;
}

export interface FieldReconciliation {
  field_key: string;
  candidates: ReconCandidate[];
  agreement: Agreement;
  /** Suggested winning source + value (suggestion only) or null when no rule / nothing to suggest. */
  suggested_winner: { source: string; value: ReconCandidate["value"] } | null;
  suggestion_only: true;
  /** Always false until OQ-PREC-1 confirms the precedence table (PRECEDENCE_CONFIRMED). */
  auto_apply_allowed: boolean;
  severity: Severity;
  severity_rule: number;
  confidence_for_draft: DraftConfidence;
  raise_flag: boolean;
  blocked_reason?: string;
}

const CONFIDENCE_RANK: Record<NormalizedConfidence, number> = {
  Verified: 0,
  Likely: 1,
  "Needs Review": 2,
};

function hasValue(candidate: ReconCandidate): boolean {
  return candidate.value !== null && String(candidate.value).trim() !== "";
}

/** Comparable form for equality: strings trimmed/lowercased; numbers/booleans stringified. */
function comparable(value: ReconCandidate["value"]): string {
  if (typeof value === "string") return value.trim().toLowerCase().replace(/\s+/g, " ");
  return String(value);
}

function worstConfidence(candidates: ReconCandidate[]): NormalizedConfidence {
  let worst: NormalizedConfidence = "Verified";
  for (const candidate of candidates) {
    const rung = candidate.confidence ?? "Likely";
    if (CONFIDENCE_RANK[rung] > CONFIDENCE_RANK[worst]) worst = rung;
  }
  return worst;
}

function classifyAgreement(present: ReconCandidate[]): Agreement {
  if (present.length === 0) return "missing";
  if (present.length === 1) return "single_source";
  const first = comparable(present[0].value);
  return present.every((candidate) => comparable(candidate.value) === first)
    ? "agree"
    : "conflict";
}

/**
 * Reconcile one field across its candidate sources. `context.implicatesOwnerCharge` escalates an
 * inspection-cadence conflict from Medium to High (the $130 owner charge, §3.2 Case A).
 */
export function reconcileField(
  fieldKey: string,
  candidates: ReconCandidate[],
  context: FieldContext = {},
): FieldReconciliation {
  const present = candidates.filter(hasValue);
  const agreement = classifyAgreement(present);
  const rule = getPrecedenceRule(fieldKey);
  const noPrecedenceRule = rule === undefined;

  const winnerSource =
    rule && (agreement === "conflict" || agreement === "single_source")
      ? suggestWinnerSource(
          rule,
          present.map((candidate) => candidate.source),
        )
      : null;
  const winnerCandidate = winnerSource
    ? (present.find((candidate) => candidate.source === winnerSource) ?? null)
    : null;

  // Severity only matters for flag-worthy states; benign agree/single-source still compute it but
  // do not raise a flag.
  const isConflictLike = agreement === "conflict" || agreement === "missing";
  const decision = severityForField(
    fieldKey,
    { noPrecedenceRule: noPrecedenceRule && isConflictLike },
    context,
  );

  const confidence_for_draft: DraftConfidence =
    agreement === "conflict"
      ? "Conflict"
      : agreement === "missing"
        ? "Needs Review"
        : agreement === "single_source"
          ? (present[0].confidence ?? "Likely")
          : worstConfidence(present);

  const raise_flag =
    agreement === "conflict" ||
    (agreement === "missing" &&
      (decision.severity === "High" || decision.severity === "Blocked"));

  // Auto-apply is gated on OQ-PREC-1 AND a Low severity AND a low_after_review policy. Until
  // PRECEDENCE_CONFIRMED flips, this is always false — every resolution needs a human.
  const auto_apply_allowed =
    PRECEDENCE_CONFIRMED &&
    rule?.autoApply === "low_after_review" &&
    decision.severity === "Low";

  return {
    field_key: fieldKey,
    candidates,
    agreement,
    suggested_winner: winnerCandidate
      ? { source: winnerCandidate.source, value: winnerCandidate.value }
      : null,
    suggestion_only: true,
    auto_apply_allowed,
    severity: decision.severity,
    severity_rule: decision.rule,
    confidence_for_draft,
    raise_flag,
    // Only attach the Blocked reason when the routed severity is actually Blocked — a High-class
    // field with no precedence rule (rule 1 fires before rule 2) must not carry a contradictory
    // "no precedence rule" message.
    ...(noPrecedenceRule && isConflictLike && decision.severity === "Blocked"
      ? { blocked_reason: "no precedence rule" }
      : {}),
  };
}
