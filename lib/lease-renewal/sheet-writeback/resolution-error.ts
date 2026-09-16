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
  | "no_change";

export class SheetWorkspaceResolutionError extends Error {
  constructor(public readonly code: SheetWorkspaceResolutionCode) {
    super(`Operating-Sheet workspace resolution refused (${code}).`);
    this.name = "SheetWorkspaceResolutionError";
  }
}
