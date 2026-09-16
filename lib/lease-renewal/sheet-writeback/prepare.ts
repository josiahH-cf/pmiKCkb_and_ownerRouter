import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { SheetFieldIntent } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import { hashSheetHeader } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import { OPERATING_SHEET_TAB } from "@/lib/lease-renewal/sheet-writeback/live";
import { appendIntentRefusal } from "@/lib/lease-renewal/sheet-writeback/row-association";
import { effectForAudienceEmailIntent } from "@/lib/lease-renewal/sheet-writeback/audience-emails";
import {
  buildSheetWritebackProposal,
  type SheetWritebackEffectInput,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  SheetWorkspaceResolutionError,
  effectForFreshLeaseContext,
  effectForSheetFieldIntent,
  resolveAuthorizedCurrentRentUpdate,
  resolveFreshOperatingSheetLeaseContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
export async function assembleSheetProposal(
  user: AuthenticatedUser,
  spreadsheetId: string,
  leaseId: string,
  intent:
    | "append_missing_row"
    | "update_approved_current_rent"
    | "update_field"
    | "update_audience_emails",
  fieldIntent?: SheetFieldIntent,
  evidenceRef?: string,
  audience?: "owner" | "tenant",
): Promise<SheetWritebackProposal> {
  const context = await resolveFreshOperatingSheetLeaseContext(
    leaseId,
    undefined,
    fieldIntent?.field,
  );
  // S116: an append needs a confirmed absence; an ambiguous association refuses both append and
  // update for this lease until the Sheet row association is corrected at its source.
  if (intent === "append_missing_row") {
    const refusal = appendIntentRefusal(context.association);
    if (refusal) throw new SheetWorkspaceResolutionError(refusal);
  } else if (context.association.kind === "ambiguous") {
    throw new SheetWorkspaceResolutionError("row_join_ambiguous");
  } else if (intent === "update_approved_current_rent" && context.row === null) {
    throw new SheetWorkspaceResolutionError("row_state_mismatch");
  }
  const authorized =
    context.row && intent === "update_approved_current_rent"
      ? await resolveAuthorizedCurrentRentUpdate(user, context)
      : null;
  const effects: SheetWritebackEffectInput[] = [
    intent === "update_audience_emails" && audience
      ? effectForAudienceEmailIntent(context, audience)
      : intent === "update_field" && fieldIntent
        ? effectForSheetFieldIntent(context, fieldIntent)
        : effectForFreshLeaseContext(context, authorized, `op-${randomUUID()}`),
  ];

  return buildSheetWritebackProposal({
    generationId: `proposal-${randomUUID()}`,
    spreadsheetId,
    tabTitle: OPERATING_SHEET_TAB,
    headerHash: hashSheetHeader(context.header, context.columns),
    headerWidth: context.header.length,
    tenantColumnIndex: context.tenantColumnIndex,
    scope: {
      kind: "lease_workspace",
      leaseId: context.leaseId,
      propertyId: context.propertyId,
    },
    actorUid: user.uid,
    actorEmail: user.email ?? "",
    actorRole: user.role,
    sourceReadAtIso: context.sourceReadAtIso,
    evidenceRef: evidenceRef ?? `workspace:${context.leaseId}:fresh-live-join`,
    effects,
    nowMs: Date.now(),
  });
}
