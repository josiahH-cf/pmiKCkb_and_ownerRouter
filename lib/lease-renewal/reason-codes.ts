// Enumerated decision reason-code taxonomy (S13 Wave 3 H2). A small, fixed set of machine-readable
// codes attached ADDITIVELY to the two lease-renewal decision paths (flag resolution + write-back
// approval). Free-text reasons stay as optional elaboration; the code is what the learning loop reads
// so decisions become machine-readable AND value-scrubbable (a code carries no client value).
//
// GOVERNANCE: a reason code is a category, never a client value. It is safe to project into value-free
// metrics (H1) and safe to surface in a distillation worksheet (H3). Additive + optional so existing
// records and callers are unaffected.

export const DECISION_REASON_CODES = [
  "sheet_already_right",
  "stale_source",
  "data_entry_error",
  "rule_too_strict",
  "severity_wrong",
  "other",
] as const;

export type DecisionReasonCode = (typeof DECISION_REASON_CODES)[number];

/** Human labels for the reason-code select (operator-facing; plain language, no jargon). */
export const DECISION_REASON_CODE_LABELS: Record<DecisionReasonCode, string> = {
  sheet_already_right: "The sheet is already right",
  stale_source: "A source is out of date",
  data_entry_error: "A data-entry error",
  rule_too_strict: "The rule is too strict",
  severity_wrong: "The severity is wrong",
  other: "Other (see reason)",
};

export function isDecisionReasonCode(value: unknown): value is DecisionReasonCode {
  return (
    typeof value === "string" &&
    (DECISION_REASON_CODES as readonly string[]).includes(value)
  );
}
