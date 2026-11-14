import { randomUUID } from "node:crypto";
import { EditableLayerError } from "@/lib/firestore/errors";
import { isOperatingSheetWritebackPaused } from "@/lib/lease-renewal/sheet-writeback-policy";
import { readSheetWritebackRuntimeBinding } from "./runtime-binding";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { readSheetWorkingRecord } from "@/lib/firestore/renewal-sheet-working-inputs";
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
  effectForWorkingCurrentRent,
  resolveFreshOperatingSheetLeaseContext,
} from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";
import { sheetLookupBinding } from "@/lib/lease-renewal/sheet-lookup";
import { workingCurrentRent } from "@/lib/lease-renewal/working-record";
import {
  SHEET_SET_MAX_CELLS,
  SHEET_SET_WORDS,
} from "@/lib/lease-renewal/sheet-writeback/set-words";

export type SheetProposalIntent =
  | "append_missing_row"
  /** S160: the current-rent update prepared from the lease's working current rent. */
  | "update_working_current_rent"
  /** The earlier name an open page may still send; it prepares the same working value. */
  | "update_approved_current_rent"
  | "update_field"
  | "update_audience_emails";

/**
 * Assemble one exact Sheet proposal from the fresh server-resolved target. S158: the lease's
 * saved lookup selection governs the target row or cell. S160: the current-rent value is the
 * working current rent, read here, never a typed amount or an approval record.
 */
export async function assembleSheetProposal(
  user: AuthenticatedUser,
  spreadsheetId: string,
  leaseId: string,
  intent: SheetProposalIntent,
  fieldIntent?: SheetFieldIntent,
  evidenceRef?: string,
  audience?: "owner" | "tenant",
): Promise<SheetWritebackProposal> {
  if (isOperatingSheetWritebackPaused())
    throw new EditableLayerError(
      "Saved in app; Sheet updates paused. No proposal was created.",
      409,
    );
  const runtimeBinding = readSheetWritebackRuntimeBinding();
  if (!runtimeBinding)
    throw new EditableLayerError(
      "The Sheet update requires a verified runtime revision. Review and prepare it again after release.",
      409,
    );
  const currentRent =
    intent === "update_working_current_rent" || intent === "update_approved_current_rent";
  if (!currentRent && fieldIntent?.field === "current_rent")
    throw new SheetWorkspaceResolutionError(
      "working_value_changed",
      "Current base rent is prepared from the working current rent, not a typed amount. Enter it as the working current rent and prepare the update from there.",
    );
  // S158/S160: one read of the working record serves both the lookup selection and the value.
  let record: Awaited<ReturnType<typeof readSheetWorkingRecord>>;
  try {
    record = await readSheetWorkingRecord(leaseId);
  } catch {
    throw new SheetWorkspaceResolutionError("lookup_unavailable");
  }
  const workingRent = workingCurrentRent(record);
  if (currentRent && workingRent === null)
    throw new SheetWorkspaceResolutionError("working_value_missing");
  const context = await resolveFreshOperatingSheetLeaseContext(
    leaseId,
    undefined,
    currentRent ? "current_rent" : fieldIntent?.field,
    { binding: sheetLookupBinding(record) },
  );
  // S116/S158: an append needs a confirmed absence; an ambiguous association refuses both append
  // and update for this lease until a row is selected here or the Sheet row link is corrected.
  if (intent === "append_missing_row") {
    const refusal = appendIntentRefusal(context.association);
    if (refusal) throw new SheetWorkspaceResolutionError(refusal);
  } else if (context.association.kind === "ambiguous") {
    throw new SheetWorkspaceResolutionError("row_join_ambiguous");
  }
  const effects: SheetWritebackEffectInput[] = [
    intent === "update_audience_emails" && audience
      ? effectForAudienceEmailIntent(context, audience)
      : intent === "update_field" && fieldIntent
        ? effectForSheetFieldIntent(context, fieldIntent)
        : currentRent
          ? effectForWorkingCurrentRent(context, workingRent)
          : effectForFreshLeaseContext(context, `op-${randomUUID()}`),
  ];

  return buildSheetWritebackProposal({
    runtimeBinding,
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

/** S278 R-S278-4: one listed cell that is not part of the combined review, and why. */
export interface SheetSetLeftOut {
  readonly field: SheetFieldIntent["field"];
  readonly message: string;
  /** "refused": the cell cannot be updated now (its row, column or value); "own": review it alone. */
  readonly kind: "refused" | "own";
}

/**
 * S278 R-S278-4: assemble one proposal for a lease's one existing row holding the listed recorded
 * cells, from one fresh server read. Each cell is the same exact field update a single review
 * prepares (`effectForSheetFieldIntent`). A cell the read refuses (no change, a formula, a missing
 * column) or a field with its own selected cell is left out with its reason; the rest are
 * prepared together. Nothing is written.
 */
export async function assembleSheetProposalSet(
  user: AuthenticatedUser,
  spreadsheetId: string,
  leaseId: string,
  intents: readonly SheetFieldIntent[],
  evidenceRefFor: (fields: readonly SheetFieldIntent["field"][]) => string,
): Promise<{
  readonly proposal: SheetWritebackProposal | null;
  readonly leftOut: readonly SheetSetLeftOut[];
}> {
  if (isOperatingSheetWritebackPaused())
    throw new EditableLayerError(
      "Saved in app; Sheet updates paused. No proposal was created.",
      409,
    );
  const runtimeBinding = readSheetWritebackRuntimeBinding();
  if (!runtimeBinding)
    throw new EditableLayerError(
      "The Sheet update requires a verified runtime revision. Review and prepare it again after release.",
      409,
    );
  if (intents.length > SHEET_SET_MAX_CELLS)
    throw new EditableLayerError(
      `One review holds at most ${SHEET_SET_MAX_CELLS} Sheet updates.`,
      409,
    );
  let record: Awaited<ReturnType<typeof readSheetWorkingRecord>>;
  try {
    record = await readSheetWorkingRecord(leaseId);
  } catch {
    throw new SheetWorkspaceResolutionError("lookup_unavailable");
  }
  const binding = sheetLookupBinding(record);
  const leftOut: SheetSetLeftOut[] = [];
  const listed: SheetFieldIntent[] = [];
  for (const intent of intents) {
    if (intent.field === "current_rent")
      leftOut.push({
        field: intent.field,
        kind: "own",
        message:
          "Current base rent is prepared from the working current rent and reviewed on its own.",
      });
    else if (binding.cells[intent.field])
      leftOut.push({
        field: intent.field,
        kind: "own",
        message: SHEET_SET_WORDS.cellSelected,
      });
    else listed.push(intent);
  }
  if (listed.length === 0) return { proposal: null, leftOut };
  const context = await resolveFreshOperatingSheetLeaseContext(
    leaseId,
    undefined,
    listed.map((intent) => intent.field),
    { binding },
  );
  if (context.association.kind === "ambiguous")
    throw new SheetWorkspaceResolutionError("row_join_ambiguous");
  const effects: SheetWritebackEffectInput[] = [];
  const prepared: SheetFieldIntent["field"][] = [];
  for (const intent of listed) {
    try {
      effects.push(effectForSheetFieldIntent(context, intent));
      prepared.push(intent.field);
    } catch (error) {
      if (!(error instanceof SheetWorkspaceResolutionError)) throw error;
      leftOut.push({ field: intent.field, kind: "refused", message: error.plainMessage });
    }
  }
  if (effects.length === 0) return { proposal: null, leftOut };
  return {
    proposal: buildSheetWritebackProposal({
      runtimeBinding,
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
      evidenceRef: evidenceRefFor(prepared),
      effects,
      nowMs: Date.now(),
    }),
    leftOut,
  };
}
