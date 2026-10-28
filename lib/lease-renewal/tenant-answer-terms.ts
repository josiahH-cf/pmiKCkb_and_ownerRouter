// S234 R-S234-5: whether the recorded tenant answer still answers the current terms. An answer
// recorded with the Working term revisions it saw answers them only while those revisions stand; an
// answer recorded before revisions were kept answers them only if no Working term was saved after
// it. Either way it never answers once the staff terms revision has moved on. Pure.

import { workingEntry, type RenewalWorkingRecord } from "./working-record";
import type { RenewalWorkspaceState, WorkingTermRevisions } from "./workspace-state";

const FIELDS = {
  rent: "terms_rent",
  effectiveDate: "terms_effective_date",
  endDate: "terms_end_date",
} as const;

/** Each Working term's current revision, 0 when that term was never saved. */
export function currentWorkingTermRevisions(
  working: RenewalWorkingRecord | null | undefined,
): WorkingTermRevisions {
  return {
    rent: workingEntry(working, FIELDS.rent)?.revision ?? 0,
    effectiveDate: workingEntry(working, FIELDS.effectiveDate)?.revision ?? 0,
    endDate: workingEntry(working, FIELDS.endDate)?.revision ?? 0,
  };
}

export function tenantAnswerCoversCurrentTerms(
  state: RenewalWorkspaceState,
  working: RenewalWorkingRecord | null | undefined,
): boolean {
  const answer = state.tenantResponse;
  if (!answer || answer.termsRevision !== state.termsRevision) return false;
  if (answer.workingTermRevisions) {
    const current = currentWorkingTermRevisions(working);
    return (
      current.rent === answer.workingTermRevisions.rent &&
      current.effectiveDate === answer.workingTermRevisions.effectiveDate &&
      current.endDate === answer.workingTermRevisions.endDate
    );
  }
  const answeredAt = Date.parse(answer.recordedAt);
  return Object.values(FIELDS).every((field) => {
    const savedAt = workingEntry(working, field)?.recordedAt;
    if (!savedAt) return true;
    const at = Date.parse(savedAt);
    // An unreadable time cannot show the term was saved before the answer.
    return Number.isFinite(at) && Number.isFinite(answeredAt) && at <= answeredAt;
  });
}
