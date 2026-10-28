// S234 R-S234-3 (BEH-S234-2, AC-S234-2): which Working terms and charges the recorded owner approval
// covers, and whether it still covers them. Rent, effective date, end date and the calculated
// charges each make it stale on their own, with that reason. Pure and client-safe, so the desk
// row, the Owner approval section, the handoff and the packet read one answer. Terms recorded on an
// earlier owner response are never read here.

import {
  completeWorkingTerms,
  workingEntry,
  workingRenewalTerms,
  type RenewalWorkingRecord,
} from "./working-record";
import type { ApprovedWorkingTerms, RenewalWorkspaceState } from "./workspace-state";

export type ApprovalTermChange = "rent" | "effective_date" | "end_date";

export type OwnerApprovalCoverage =
  | { readonly state: "not_recorded" }
  | { readonly state: "no_working_terms" }
  | {
      readonly state: "terms_changed";
      readonly binding: ApprovedWorkingTerms;
      readonly changed: readonly ApprovalTermChange[];
    }
  | { readonly state: "charges_changed"; readonly binding: ApprovedWorkingTerms }
  /** The terms are covered; the charges were checked too only when `chargesChecked`. */
  | {
      readonly state: "current";
      readonly binding: ApprovedWorkingTerms;
      readonly chargesChecked: boolean;
    };

const TERM_FIELDS: readonly {
  change: ApprovalTermChange;
  field: string;
  value: (binding: ApprovedWorkingTerms) => number | string;
  revision: (binding: ApprovedWorkingTerms) => number;
}[] = [
  {
    change: "rent",
    field: "terms_rent",
    value: (b) => b.rent,
    revision: (b) => b.fieldRevisions.rent,
  },
  {
    change: "effective_date",
    field: "terms_effective_date",
    value: (b) => b.effectiveDate,
    revision: (b) => b.fieldRevisions.effectiveDate,
  },
  {
    change: "end_date",
    field: "terms_end_date",
    value: (b) => b.endDate,
    revision: (b) => b.fieldRevisions.endDate,
  },
];

/**
 * The recorded approval's coverage of the current Working terms and, when `economicsHash` is known,
 * the current calculated charges. A field counts as changed when its value or its revision differs
 * from the approval's, so re-saving the same value after a change still needs a new approval.
 */
export function ownerApprovalCoverage(input: {
  readonly workspace: RenewalWorkspaceState | null | undefined;
  readonly working: RenewalWorkingRecord | null | undefined;
  /** The current calculated charges' hash; null when this caller cannot compute them. */
  readonly economicsHash: string | null;
}): OwnerApprovalCoverage {
  const response = input.workspace?.ownerResponse;
  if (response?.outcome !== "approved_terms") return { state: "not_recorded" };
  const binding = response.approvedWorkingTerms;
  if (!binding) return { state: "no_working_terms" };
  const changed = TERM_FIELDS.filter(({ field, value, revision }) => {
    const entry = workingEntry(input.working, field);
    return entry?.value !== value(binding) || entry?.revision !== revision(binding);
  }).map(({ change }) => change);
  const complete = completeWorkingTerms(workingRenewalTerms(input.working));
  if (changed.length || !complete)
    return {
      state: "terms_changed",
      binding,
      changed: changed.length ? changed : TERM_FIELDS.map(({ change }) => change),
    };
  if (input.economicsHash === null)
    return { state: "current", binding, chargesChecked: false };
  if (binding.economicsHash !== input.economicsHash)
    return { state: "charges_changed", binding };
  return { state: "current", binding, chargesChecked: true };
}

const CHANGE_WORDS: Record<ApprovalTermChange, string> = {
  rent: "rent",
  effective_date: "effective date",
  end_date: "end date",
};

/** The changed Working terms in plain words: "rent", "rent and end date", … */
export function describeApprovalChanges(changed: readonly ApprovalTermChange[]): string {
  const words = changed.map((change) => CHANGE_WORDS[change]);
  return words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** The terms an approval covers, in one phrase, with each field's revision. */
export function describeCoveredTerms(
  binding: ApprovedWorkingTerms,
  format: { money: (value: number) => string; date: (iso: string) => string },
): string {
  const r = binding.fieldRevisions;
  return `${format.money(binding.rent)} per month from ${format.date(binding.effectiveDate)} to ${format.date(binding.endDate)} (Working revisions: rent ${r.rent}, effective date ${r.effectiveDate}, end date ${r.endDate})`;
}

/** One plain sentence for the approval's coverage state, naming exactly what changed. */
export function describeOwnerApprovalCoverage(
  coverage: OwnerApprovalCoverage,
  format: { money: (value: number) => string; date: (iso: string) => string },
): string {
  switch (coverage.state) {
    case "not_recorded":
      return "No recorded owner approval.";
    case "no_working_terms":
      return "The recorded owner approval does not name complete Working terms. Save the Working terms, then record the owner's approval again.";
    case "terms_changed":
      return `Owner approval no longer covers: ${describeApprovalChanges(coverage.changed)} changed. Record the owner's approval of the current terms.`;
    case "charges_changed":
      return "Owner approval no longer covers: charges changed. Record the owner's approval of the current terms and charges.";
    case "current":
      return coverage.chargesChecked
        ? `Owner approval covers the Working terms, ${describeCoveredTerms(coverage.binding, format)}, and the calculated charges.`
        : `Owner approval covers the Working terms, ${describeCoveredTerms(coverage.binding, format)}. The charges it covers are checked on the lease page.`;
  }
}

/**
 * The desk row's short form. The desk reads no charges, so it never says they are covered; a
 * stale approval names exactly what changed. Null when no approval is recorded (the row's next
 * action already says so).
 */
export function describeOwnerApprovalCoverageShort(
  coverage: OwnerApprovalCoverage,
  format: { money: (value: number) => string; date: (iso: string) => string },
): string | null {
  switch (coverage.state) {
    case "not_recorded":
      return null;
    case "no_working_terms":
      return "Owner approval names no complete Working terms.";
    case "terms_changed":
      return `Owner approval no longer covers: ${describeApprovalChanges(coverage.changed)} changed.`;
    case "charges_changed":
      return "Owner approval no longer covers: charges changed.";
    case "current": {
      const b = coverage.binding;
      const r = b.fieldRevisions;
      return `Owner approval covers ${format.money(b.rent)} from ${format.date(b.effectiveDate)} to ${format.date(b.endDate)} (Working revisions ${r.rent}, ${r.effectiveDate}, ${r.endDate})${coverage.chargesChecked ? " and the calculated charges." : "; charges are checked on the lease page."}`;
    }
  }
}
