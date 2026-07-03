// Decisions-to-golden distillation (S13 Wave 3 H3). Turns recorded human decisions into value-free
// SIGNALS and PRE-FILLS a golden worksheet's PENDING entries with SUGGESTIONS, so the team labels
// faster. It NEVER auto-verifies: `reviewed` and every `meaningConfirmed` are left untouched, so
// applyDecisions still refuses until a human confirms. Pure: no I/O, no network.
//
// GOVERNANCE: a signal is (fieldKey, resolution_kind) — a category, never a client value. The
// distillation copies no proposed value, corrected value, reason text, or lease identifier into the
// worksheet; the offline CLI prints counts only. Ground truth stays the human's review.

import type {
  FlagDecision,
  GoldenWorksheet,
  WorksheetEntry,
} from "@/lib/lease-renewal/golden/labeling";
import type { LeaseRenewalResolutionRecord } from "@/lib/firestore/types";

export type DecisionResolutionKind = "pick_source" | "corrected_value" | "flag_incorrect";

/** A value-free decision signal distilled from a recorded human decision. No client values. */
export interface DecisionSignal {
  fieldKey: string;
  resolution_kind: DecisionResolutionKind;
}

export interface DistillationSummary {
  entries: number;
  /** Entries that were PENDING and got a suggestion. */
  prefilled: number;
  /** Distinct fieldKeys whose signal uniquely matched one entry and was pre-filled. */
  matchedFields: number;
  /** Distinct signal fieldKeys shared by >1 worksheet entry (left PENDING, never guessed). */
  ambiguousFields: number;
  /** Distinct signal fieldKeys that matched no worksheet entry at all. */
  unmatchedFields: number;
  /** Entries left untouched because they were already decided. */
  alreadyDecided: number;
}

/** Reduce recorded resolution records to value-free signals (drops every value + free-text reason). */
export function toDecisionSignals(
  records: readonly Pick<LeaseRenewalResolutionRecord, "field_key" | "resolution_kind">[],
): DecisionSignal[] {
  const signals: DecisionSignal[] = [];
  for (const record of records) {
    if (!record.resolution_kind) continue;
    signals.push({ fieldKey: record.field_key, resolution_kind: record.resolution_kind });
  }
  return signals;
}

/** Map a resolution kind to a SUGGESTED worksheet decision: a dismissal is a false positive (reject);
 *  a pick/correction treated the flag as real (accept). */
export function suggestDecision(
  kind: DecisionResolutionKind,
): Extract<FlagDecision, "accept" | "reject"> {
  return kind === "flag_incorrect" ? "reject" : "accept";
}

/**
 * Pre-fill a worksheet's PENDING entries with suggestions from recorded decisions. Two guards keep it
 * from GUESSING: (1) a fieldKey whose signals carry conflicting kinds is left PENDING; (2) a fieldKey
 * shared by MORE THAN ONE worksheet entry (same field, different rows/tenants) is left PENDING for all
 * of them — a signal keyed only by fieldKey cannot say which row it was, so fanning one decision out to
 * every same-field row would systematically mislabel the others. Never flips `reviewed` or any
 * `meaningConfirmed` — the human still reviews and applies. Pure + value-free.
 */
export function distillDecisionsIntoWorksheet(
  worksheet: GoldenWorksheet,
  signals: readonly DecisionSignal[],
): { worksheet: GoldenWorksheet; summary: DistillationSummary } {
  const byField = new Map<string, Set<DecisionResolutionKind>>();
  for (const signal of signals) {
    const set = byField.get(signal.fieldKey) ?? new Set<DecisionResolutionKind>();
    set.add(signal.resolution_kind);
    byField.set(signal.fieldKey, set);
  }

  // How many worksheet entries share each fieldKey — a field with >1 entry is not row-uniquely
  // addressable by a fieldKey-only signal, so it stays PENDING (guard 2).
  const entryCountByField = new Map<string, number>();
  for (const entry of worksheet.entries) {
    entryCountByField.set(
      entry.fieldKey,
      (entryCountByField.get(entry.fieldKey) ?? 0) + 1,
    );
  }

  const matchedFields = new Set<string>();
  const ambiguousFields = new Set<string>();
  let prefilled = 0;
  let alreadyDecided = 0;

  const entries: WorksheetEntry[] = worksheet.entries.map((entry) => {
    if (entry.decision !== "PENDING") {
      alreadyDecided += 1;
      return entry;
    }
    const kinds = byField.get(entry.fieldKey);
    if (!kinds || kinds.size !== 1) return entry; // no signal or conflicting kinds -> PENDING
    if ((entryCountByField.get(entry.fieldKey) ?? 0) > 1) {
      // Multiple rows share this field: a fieldKey-only signal cannot address one row. Never guess.
      ambiguousFields.add(entry.fieldKey);
      return entry;
    }
    matchedFields.add(entry.fieldKey);
    const kind = [...kinds][0];
    prefilled += 1;
    return {
      ...entry,
      decision: suggestDecision(kind),
      note:
        entry.note ||
        `Prefilled suggestion from a recorded decision (${kind}). Confirm before applying.`,
    };
  });

  const unmatchedFields = [...byField.keys()].filter(
    (key) => !matchedFields.has(key) && !ambiguousFields.has(key),
  ).length;

  return {
    // reviewed + meaningConfirmed are intentionally NOT touched: this never auto-verifies.
    worksheet: { ...worksheet, entries },
    summary: {
      entries: worksheet.entries.length,
      prefilled,
      matchedFields: matchedFields.size,
      ambiguousFields: ambiguousFields.size,
      unmatchedFields,
      alreadyDecided,
    },
  };
}
