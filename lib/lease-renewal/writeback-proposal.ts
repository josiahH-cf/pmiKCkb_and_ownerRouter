// Append-only write-back PROPOSAL generator (Q-WRITEBACK-METHOD — owner 2026-07-01 chose method (a)).
//
// Turns a flag-raising reconciliation into a value-bearing PROPOSAL a human approves: the value the app
// would append to a NEW, append-only column (never mutating an existing cell — zero risk to the team's
// data). Suggestion-only, needs approval, never auto-applied, and NOT executed here (no live Sheets
// call; executing the write still needs an approved per-action spec). The cell-anchored
// compare-and-set model (method (b)) lives in `writeback.ts` and stays the graduate-later path. A field
// that has no safe suggestion yields a value-LESS proposal — a value is never invented. Pure + deterministic.

import type { FieldReconciliation } from "@/lib/lease-renewal/reconciliation";
import type { WriteBackState } from "@/lib/lease-renewal/writeback";

export const WRITEBACK_METHOD_APPEND_ONLY = "append_only_column" as const;

const APPEND_ONLY_COLUMN_PREFIX = "KB Proposed";

export interface WritebackProposal {
  fieldKey: string;
  fieldLabel: string;
  method: typeof WRITEBACK_METHOD_APPEND_ONLY;
  /** The append-only column header the proposal targets — a NEW column, never an existing cell. */
  proposedColumnHeader: string;
  /** The value to append if approved, or null when nothing can be safely proposed (needs human input). */
  proposedValue: string | null;
  /** Human-facing source label that won the suggestion, or null when there is no winner. */
  sourceSystem: string | null;
  /** Plain-English why (or why not) — never an invented fact. */
  rationale: string;
  /** Approval state: Proposed when a value is ready, Blocked when it needs human input first. */
  status: Extract<WriteBackState, "Proposed" | "Blocked">;
  /** Binding guardrails, surfaced so the UI cannot misrepresent them. */
  requiresApproval: true;
  autoApplyAllowed: false;
  suggestionOnly: true;
  /** True only when a concrete value is ready to append (drives the value-free "proposal ready" badge). */
  valueReady: boolean;
}

function displayValue(value: string | number | boolean | null): string | null {
  if (value === null) return null;
  if (typeof value === "boolean") return value ? "yes" : "no";
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Build the append-only write-back proposal for a reconciliation, or null when it raised no flag.
 * A flag with a suggested winner yields a Proposed value; a blocked / missing / no-winner flag yields a
 * value-less Blocked proposal (a value is never invented).
 */
export function buildWritebackProposal(
  reconciliation: FieldReconciliation,
  context: { fieldLabel: string },
): WritebackProposal | null {
  if (!reconciliation.raise_flag) return null;

  const { fieldLabel } = context;
  const proposedColumnHeader = `${APPEND_ONLY_COLUMN_PREFIX} — ${fieldLabel}`;
  const base = {
    fieldKey: reconciliation.field_key,
    fieldLabel,
    method: WRITEBACK_METHOD_APPEND_ONLY,
    proposedColumnHeader,
    requiresApproval: true as const,
    autoApplyAllowed: false as const,
    suggestionOnly: true as const,
  };

  const winner = reconciliation.suggested_winner;
  const winnerValue = winner ? displayValue(winner.value) : null;

  if (!winner || winnerValue === null) {
    const why = reconciliation.blocked_reason
      ? `${reconciliation.blocked_reason} — no value proposed`
      : reconciliation.agreement === "missing"
        ? "the field is missing a source — provide one before a value can be proposed"
        : "no precedence winner — needs a human decision";
    return {
      ...base,
      proposedValue: null,
      sourceSystem: null,
      rationale: `No append-only proposal: ${why}. No value is ever invented.`,
      status: "Blocked",
      valueReady: false,
    };
  }

  const winningCandidate = reconciliation.candidates.find(
    (candidate) => candidate.source === winner.source,
  );
  const sourceSystem = winningCandidate?.source_system ?? winner.source;

  return {
    ...base,
    proposedValue: winnerValue,
    sourceSystem,
    rationale:
      `Append "${winnerValue}" from ${sourceSystem} to a new "${proposedColumnHeader}" column ` +
      "(suggestion only — needs approval; appended, never overwrites an existing cell).",
    status: "Proposed",
    valueReady: true,
  };
}
