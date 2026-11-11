// S264 R-S264-6 at the tenant decision's consumers. A tenant acceptance recorded with the exact
// offer it answered (a confirmed send, or an app-prepared offer staff verified was sent) covers the
// current offer only while the current offer's charges are the ones it answered. When one changed
// (a charge-only edit leaves the base and dates as answered), the answer stays exactly as recorded
// and the work relying on it waits: Offer the tenant is not done, and the source updates that apply
// the accepted renewal hold before their claim, with the exact difference.
//
// An acceptance not tied to one exact offer, and one whose current offer could not be read, keep
// their recorded reading here; the tenant response editor says what each needs. Every answer
// recorded before offers were kept is such an answer, and holding them would leave no way to
// verify them. A hold binds to its answer's event, so an answer recorded since is never held by a
// read of an earlier one. Pure and client-safe.

import {
  currentManualTenantOutcome,
  type RenewalWorkspaceState,
} from "./workspace-state";

/** How the recorded acceptance stands against the current offer's charges, as a read carries it. */
export interface TenantAcceptanceRead {
  /** The acceptance's own event on the work record. */
  readonly eventId: string;
  readonly state: "covers" | "earlier_offer" | "not_attributed" | "unknown";
  /** The exact difference, in staff words, when the acceptance answers an earlier offer. */
  readonly line: string | null;
}

/** The current acceptance answers an earlier offer's charges: its event and the exact difference. */
export interface TenantAcceptanceHold {
  readonly eventId: string;
  readonly line: string;
}

/**
 * The read that decides for the work record as it stands: only for its current tenant acceptance
 * (the same answer event, on the current terms). The first read of that event that could compare
 * the offers decides, so a newer read listed first takes precedence over an older one; a read of
 * another event, or one that could not read the current offer, says nothing.
 */
export function currentAcceptanceRead(
  state: RenewalWorkspaceState | null | undefined,
  reads: readonly (TenantAcceptanceRead | null | undefined)[],
): TenantAcceptanceRead | null {
  const response = state?.tenantResponse;
  if (!state || !response || currentManualTenantOutcome(state) !== "accepted")
    return null;
  return (
    reads.find(
      (entry): entry is TenantAcceptanceRead =>
        !!entry && entry.eventId === response.eventId && entry.state !== "unknown",
    ) ?? null
  );
}

/** The hold on the work record as it stands, from the read that decides (above). */
export function currentAcceptanceHold(
  state: RenewalWorkspaceState | null | undefined,
  reads: readonly (TenantAcceptanceRead | null | undefined)[],
): TenantAcceptanceHold | null {
  const read = currentAcceptanceRead(state, reads);
  return read?.state === "earlier_offer" && read.line
    ? { eventId: read.eventId, line: read.line }
    : null;
}

/**
 * Whether a RentVine update applies the accepted renewal: the lease dates, the future rent
 * schedule and the other recurring charge changes do. The current base rent correction fixes a
 * fact that is wrong today (S117, S237) and never waits on the tenant's answer.
 */
export function rentvineUpdateReliesOnAcceptance(
  businessIntent: string | null | undefined,
): boolean {
  return businessIntent !== "current_base";
}

/** The operating Sheet fields whose value is the accepted renewal's own terms. */
export const SHEET_FIELDS_FROM_ACCEPTED_TERMS: ReadonlySet<string> = new Set([
  "renewal_date",
]);

/** Whether an operating Sheet update carries the accepted renewal's terms. */
export function sheetUpdateReliesOnAcceptance(effect: {
  readonly kind: string;
  readonly field?: string;
}): boolean {
  return (
    effect.kind === "field_update" &&
    typeof effect.field === "string" &&
    SHEET_FIELDS_FROM_ACCEPTED_TERMS.has(effect.field)
  );
}

/** The words a held source update and Finish up show beside their exact previews. */
export const TENANT_ACCEPTANCE_HOLD_WORDS = {
  label: "Tenant acceptance",
  /** The one next step, in the tenant response editor (Offer the tenant's own step label). */
  next: "Record the tenant's answer for the current offer",
  update: "This update waits until the tenant's answer covers the current offer.",
  finishUp: "These updates wait until the tenant's answer covers the current offer.",
} as const;

/** The tenant response editor, where the answer for the current offer is recorded. */
export const TENANT_RESPONSE_TARGET = "renewal-manual-tenant_response";
