// The one refusal type for operating-Sheet workspace resolution, kept in its own module so the
// audience-email preparation (S116) and the resolver can share it without a runtime import cycle.

export type SheetWorkspaceResolutionCode =
  | "source_unavailable"
  | "lease_identity_mismatch"
  | "row_join_ambiguous"
  | "row_state_mismatch"
  | "resolution_missing"
  | "resolution_stale"
  | "approval_stale"
  | "proposal_stale"
  /** S116: the Renewals tab has no confirmed column for the requested audience emails. */
  | "email_column_missing"
  /** S116: the audience roster is incomplete or collides across channels; nothing is prepared. */
  | "recipient_roster_blocked"
  /** S116: the Sheet cell already holds the complete current roster; there is nothing to update. */
  | "no_change"
  /** S158: the row staff selected is readable but is not an eligible row for a Sheet update. */
  | "selected_row_not_writable"
  /** S158: the cell staff selected is readable but is not this field's cell in a lease row. */
  | "selected_cell_not_writable"
  /** S158: the saved lookup selection could not be read, so no target can be resolved. */
  | "lookup_unavailable"
  /** S160: the current-rent Sheet update uses the working current rent, and none is saved. */
  | "working_value_missing"
  /** S160: the working current rent changed after this update was previewed. */
  | "working_value_changed";

/** Plain words per refusal, for the one update being attempted. None of them ends other work. */
export const SHEET_RESOLUTION_MESSAGES: Record<SheetWorkspaceResolutionCode, string> = {
  source_unavailable:
    "The operating Sheet could not be read just now, so this update was not prepared. Nothing else on this lease waits on it.",
  lease_identity_mismatch:
    "This lease could not be matched to one RentVine lease and property from the current read, so this update was not prepared.",
  row_join_ambiguous:
    "The app has not found one Sheet row for this lease, so this update was not prepared. Choose this lease's row under Operating Sheet lookup in Lease information, or correct the row's RentVine link in the Sheet.",
  row_state_mismatch:
    "The Sheet row or cell for this update is not in a state the app can update: the row changed, the column is missing, or the cell holds a formula. The current read stays available.",
  resolution_missing:
    "This update needs a current source decision that is not recorded. The current read stays available.",
  resolution_stale:
    "The source decision this update was based on has changed. Prepare it again from the current values.",
  approval_stale:
    "The approval this update was based on has changed. Prepare it again from the current values.",
  proposal_stale:
    "The Sheet row, header or value changed after this preview was prepared. Prepare a fresh preview from the current read.",
  email_column_missing:
    "The operating tab has no confirmed column for these email addresses. Add the column in the Sheet; the app reads it back afterwards.",
  recipient_roster_blocked:
    "The current lease roster is incomplete or has a collision, so no email update was prepared.",
  no_change: "The Sheet cell already holds this value, so there is nothing to update.",
  selected_row_not_writable:
    "The row staff selected stays readable, but it is not a row the app can update for this lease. Choose another row under Operating Sheet lookup, or use the automatic lookup.",
  selected_cell_not_writable:
    "The selected cell stays readable. It is not this field's column in a lease row, so the app does not update it. Your working value is unchanged.",
  lookup_unavailable:
    "The saved Sheet lookup selection could not be read, so this update was not prepared. Nothing else on this lease waits on it.",
  working_value_missing:
    "Enter a working current rent first. This Sheet update uses that value, so nothing was prepared.",
  working_value_changed:
    "The working current rent changed after this preview was prepared. Prepare a fresh Sheet preview from the current value.",
};

export class SheetWorkspaceResolutionError extends Error {
  /** The exact plain sentence for this refusal, when one more specific than the code's exists. */
  readonly plainMessage: string;

  constructor(
    public readonly code: SheetWorkspaceResolutionCode,
    plainMessage?: string,
  ) {
    super(`Operating-Sheet workspace resolution refused (${code}).`);
    this.name = "SheetWorkspaceResolutionError";
    this.plainMessage = plainMessage ?? SHEET_RESOLUTION_MESSAGES[code];
  }
}
