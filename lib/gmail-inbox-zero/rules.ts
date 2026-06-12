import {
  GMAIL_INBOX_ZERO_LABELS,
  GMAIL_INBOX_ZERO_PHASES,
  GMAIL_RULE_STATUSES,
} from "@/lib/gmail-inbox-zero/constants";

/**
 * Label-rule domain model and triage evaluation from docs/products/gmail-inbox-zero.md.
 * Rules determine what is suggested or applied: only Admin-approved rules participate,
 * auto-labeling is allowed only for exact matches of approved rules, the Shadow rollout
 * phase classifies only and applies nothing, and Dan's corrections become Proposed rule
 * changes that require Admin approval before becoming active. Nothing self-modifies.
 *
 * Pure and non-executable: no Gmail API, no I/O, no send capability. Message facts are
 * caller-supplied fixtures (sanitized scenarios or future approved ingestion).
 */

export type GmailInboxZeroLabel = (typeof GMAIL_INBOX_ZERO_LABELS)[number];
export type GmailInboxZeroPhase = (typeof GMAIL_INBOX_ZERO_PHASES)[number];
export type GmailRuleStatus = (typeof GMAIL_RULE_STATUSES)[number];

// Plain-English rules become structured fields after Admin approval. The structured
// criteria stay minimal: exact sender, exact sender/category mapping, and a subject
// containment pattern.
export interface LabelRuleCriteria {
  sender?: string;
  category?: string;
  subject_contains?: string;
}

export interface LabelRule {
  id: string;
  label: GmailInboxZeroLabel;
  plain_english: string;
  criteria?: LabelRuleCriteria;
  match_kind: "exact" | "pattern";
  status: GmailRuleStatus;
}

// Sanitized message facts used for evaluation; never live Gmail content.
export interface TriageMessageFacts {
  sender: string;
  subject: string;
  category?: string;
}

export interface TriageSuggestion {
  label: GmailInboxZeroLabel;
  rule_id: string;
  reason: string;
}

export interface TriageResult {
  suggestions: TriageSuggestion[];
  auto_apply: TriageSuggestion[];
}

export function matchesRule(rule: LabelRule, message: TriageMessageFacts): boolean {
  const criteria = rule.criteria;

  if (!criteria || Object.keys(criteria).length === 0) {
    return false;
  }

  if (criteria.sender !== undefined && criteria.sender !== message.sender) {
    return false;
  }

  if (criteria.category !== undefined && criteria.category !== message.category) {
    return false;
  }

  if (
    criteria.subject_contains !== undefined &&
    !message.subject.toLowerCase().includes(criteria.subject_contains.toLowerCase())
  ) {
    return false;
  }

  return true;
}

/**
 * Evaluate one message against the rule set for a rollout phase. Only Approved rules
 * participate; matches become suggestions. Auto-apply requires all of: an Approved
 * rule, an exact match kind, and a phase past Shadow (Shadow classifies only and
 * applies nothing).
 */
export function evaluateInboxTriage(
  rules: LabelRule[],
  message: TriageMessageFacts,
  phase: GmailInboxZeroPhase,
): TriageResult {
  const suggestions: TriageSuggestion[] = [];
  const autoApply: TriageSuggestion[] = [];

  for (const rule of rules) {
    if (rule.status !== "Approved" || !matchesRule(rule, message)) {
      continue;
    }

    const suggestion: TriageSuggestion = {
      label: rule.label,
      rule_id: rule.id,
      reason: rule.plain_english,
    };
    suggestions.push(suggestion);

    if (rule.match_kind === "exact" && phase !== "Shadow") {
      autoApply.push(suggestion);
    }
  }

  return { suggestions, auto_apply: autoApply };
}

// Dan's feedback (changing a label) enters the learning loop as a Proposed rule change;
// it never activates a rule by itself.
export interface LabelFeedback {
  thread_ref: string;
  previous_label?: GmailInboxZeroLabel;
  corrected_label: GmailInboxZeroLabel;
  noted_by: string;
  noted_at: string;
  message: TriageMessageFacts;
}

export function proposeRuleChangeFromFeedback(feedback: LabelFeedback): LabelRule {
  return {
    id: `proposed-${feedback.thread_ref}-${feedback.noted_at}`,
    label: feedback.corrected_label,
    plain_english: `Proposed from ${feedback.noted_by}'s correction on ${feedback.thread_ref}: label mail from ${feedback.message.sender} as ${feedback.corrected_label}${
      feedback.previous_label ? ` instead of ${feedback.previous_label}` : ""
    }. Requires Admin approval before becoming active.`,
    criteria: { sender: feedback.message.sender },
    match_kind: "exact",
    status: "Proposed",
  };
}
