// S116 (accepted Q3A): Owner emails and Tenant emails on the operating Renewals tab.
//
// Each field holds the complete current source-backed address set for one audience. The value is
// prepared only from the fresh lease roster through the existing narrow exact-confirmed field
// update; a missing column names the exact headers to add and the app never creates a column; an
// incomplete or colliding roster refuses instead of writing a partial list. Pure over the fresh
// lease context; the roster itself comes from the same resolver the message drafts use.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import { resolveSeparatedRenewalDraftRecipient } from "@/lib/lease-renewal/execution/renewal-draft-preview";
import {
  SHEET_AUDIENCE_EMAIL_FIELDS,
  type SheetAudienceEmailField,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import { OPERATING_SHEET_TAB } from "@/lib/lease-renewal/sheet-writeback/live";
import type { SheetFieldUpdateEffectInput } from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { SheetWorkspaceResolutionError } from "@/lib/lease-renewal/sheet-writeback/resolution-error";
import type { FreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";

export type AudienceRoster =
  | { status: "ready"; to: string; cc: string[] }
  | { status: "blocked"; reasons: string[] };

export interface AudienceRosters {
  owner: AudienceRoster;
  tenant: AudienceRoster;
}

export type Audience = "owner" | "tenant";

/** The complete same-audience recipient set from the lease, or the refusal a person resolves. */
export function audienceRosterFromLease(
  lease: RawLease,
  channel: Audience,
): AudienceRoster {
  const result = resolveSeparatedRenewalDraftRecipient({ lease, channel });
  return result.status === "ready"
    ? { status: "ready", to: result.resolution.to, cc: [...(result.resolution.cc ?? [])] }
    : { status: "blocked", reasons: result.reasons };
}

/** Deterministic, human-copyable, no cap: To first, then every Cc, in roster order. */
export function formatAudienceEmails(
  roster: Extract<AudienceRoster, { status: "ready" }>,
): string {
  return [roster.to, ...roster.cc].join(", ");
}

export const AUDIENCE_EMAIL_SETUP = `Setup needed: add the exact columns "Owner emails" and "Tenant emails" to the "${OPERATING_SHEET_TAB}" tab. The app reads them back after they exist; it does not create columns.`;

export function audienceEmailField(audience: Audience): SheetAudienceEmailField {
  return audience === "owner" ? "owner_emails" : "tenant_emails";
}

export interface AudienceEmailRosterView {
  audience: Audience;
  field: SheetAudienceEmailField;
  label: string;
  /** Physical column of the confirmed header, or null when the tab has no such column. */
  column: number | null;
  /** The cell's current value on the matched row; null without a row or column. */
  current: string | null;
  /** The complete formatted roster; null while the roster is blocked. */
  proposed: string | null;
  state: "column_missing" | "row_missing" | "roster_blocked" | "current" | "update";
  reasons: string[];
  setup: string | null;
}

/** Per-audience view for the panel: what the Sheet holds, what the roster says, what is possible. */
export function audienceEmailRoster(
  context: FreshOperatingSheetLeaseContext,
  audience: Audience,
): AudienceEmailRosterView {
  const field = audienceEmailField(audience);
  const label = SHEET_AUDIENCE_EMAIL_FIELDS[field].label;
  const column = context.columns.get(field) ?? null;
  const roster: AudienceRoster = context.rosters?.[audience] ?? {
    status: "blocked",
    reasons: ["The lease roster was not read with this workspace; refresh the page."],
  };
  const proposed = roster.status === "ready" ? formatAudienceEmails(roster) : null;
  const base = {
    audience,
    field,
    label,
    column,
    proposed,
    setup: null,
    reasons: [] as string[],
  };
  if (column === null) {
    return {
      ...base,
      current: null,
      state: "column_missing",
      setup: AUDIENCE_EMAIL_SETUP,
    };
  }
  if (!context.row) return { ...base, current: null, state: "row_missing" };
  const current = context.row.fieldValues?.[field] ?? "";
  if (roster.status === "blocked") {
    return { ...base, current, state: "roster_blocked", reasons: roster.reasons };
  }
  return { ...base, current, state: proposed === current ? "current" : "update" };
}

/**
 * The one server-derived effect for an audience email update, or a refusal naming why nothing is
 * prepared. The value, row, cell and source read are bound so any drift invalidates the proposal.
 */
export function effectForAudienceEmailIntent(
  context: FreshOperatingSheetLeaseContext,
  audience: Audience,
): SheetFieldUpdateEffectInput {
  const view = audienceEmailRoster(context, audience);
  if (view.state === "column_missing")
    throw new SheetWorkspaceResolutionError("email_column_missing");
  if (view.state === "roster_blocked")
    throw new SheetWorkspaceResolutionError("recipient_roster_blocked");
  if (
    view.state === "row_missing" ||
    !context.row ||
    context.row.formulaFields?.includes(view.field)
  )
    throw new SheetWorkspaceResolutionError("row_state_mismatch");
  if (view.state === "current" || view.proposed === null || view.current === null)
    throw new SheetWorkspaceResolutionError("no_change");
  return {
    kind: "field_update",
    field: view.field,
    rowNumber: context.row.rowNumber,
    rowKey: context.row.rowKey,
    anchorTenantName: context.row.anchorTenantName,
    expectedValue: view.current,
    afterValue: view.proposed,
    ...(context.row.cellEvidence?.[view.field]
      ? { cellEvidence: context.row.cellEvidence[view.field] }
      : {}),
    source: `rentvine:lease:${context.leaseId}:${audience} roster read ${context.sourceReadAtIso}`,
    audienceIntent: { audience, field: view.field, value: view.proposed },
  };
}
