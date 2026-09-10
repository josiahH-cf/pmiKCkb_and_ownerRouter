import { randomUUID } from "node:crypto";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { SheetFieldIntent } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import { hashSheetHeader } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import { OPERATING_SHEET_TAB } from "@/lib/lease-renewal/sheet-writeback/live";
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
  intent: "append_missing_row" | "update_approved_current_rent" | "update_field",
  fieldIntent?: SheetFieldIntent,
  evidenceRef?: string,
): Promise<SheetWritebackProposal> {
  const context = await resolveFreshOperatingSheetLeaseContext(
    leaseId,
    undefined,
    fieldIntent?.field,
  );
  if (
    (intent === "append_missing_row" && context.row !== null) ||
    (intent === "update_approved_current_rent" && context.row === null)
  ) {
    throw new SheetWorkspaceResolutionError("row_state_mismatch");
  }
  const authorized =
    context.row && intent === "update_approved_current_rent"
      ? await resolveAuthorizedCurrentRentUpdate(user, context)
      : null;
  const effects: SheetWritebackEffectInput[] = [
    intent === "update_field" && fieldIntent
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
