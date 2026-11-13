// S278 R-S278-4 / R-S278-5 (ARCH-S278-3): one confirmation for a lease row's listed Sheet cells.
// The confirmation binds the ordered set of effect hashes in one proposal for one existing row.
// Before the first write the whole set is read again: any changed row identity, header or listed
// current value refuses the whole confirmation and nothing is written. The cells are then applied
// in list order, each through the existing exact field update (`SheetWritebackService
// .executeEffect`) with its own one-attempt claim, compare-and-swap write, read-back and receipt.
// The run stops at the first cell that conflicts, is refused or cannot be read back; the cells
// after it stay pending and unattempted, and nothing retries on its own. The exact action key is
// evaluated once per cell, exactly as for a single update; this module changes no gate.

import type { ExternalActionReceipt } from "@/lib/external-execution/types";
import type { OperatingSheetLookupBinding } from "@/lib/lease-renewal/sheet-lookup";
import { hashSheetHeader } from "@/lib/lease-renewal/sheet-writeback/execution-service";
import {
  SHEET_FIELD_UPDATE_KEY,
  type SheetWritebackProposal,
  type ValidatedSheetWritebackEffect,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import {
  SHEET_SET_MAX_CELLS,
  SHEET_SET_WORDS,
  sheetFieldLabel,
} from "@/lib/lease-renewal/sheet-writeback/set-words";
import type { FreshOperatingSheetLeaseContext } from "@/lib/lease-renewal/sheet-writeback/workspace-resolution";

/** Why a set confirmation does not match its proposal; the route refuses before any write. */
export class SheetSetShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetSetShapeError";
  }
}

/**
 * True when every effect is a staff-intent field update of one existing row, at most ten of them,
 * with no current rent (bound to the working current rent), audience email, append or retired
 * approval shape. Single proposals keep their own path; this is the set's shape.
 */
export function isSheetCellSet(proposal: SheetWritebackProposal): boolean {
  if (
    proposal.scope.kind !== "lease_workspace" ||
    proposal.effects.length < 1 ||
    proposal.effects.length > SHEET_SET_MAX_CELLS
  )
    return false;
  const first = proposal.effects[0]!.effect;
  if (first.kind !== "field_update") return false;
  const fields = new Set<string>();
  for (const entry of proposal.effects) {
    const effect = entry.effect;
    if (
      entry.actionKey !== SHEET_FIELD_UPDATE_KEY ||
      effect.kind !== "field_update" ||
      !effect.staffIntent ||
      effect.authorization ||
      effect.audienceIntent ||
      effect.field === "current_rent" ||
      effect.rowNumber !== first.rowNumber ||
      effect.rowKey !== first.rowKey ||
      effect.anchorTenantName !== first.anchorTenantName ||
      fields.has(effect.field)
    )
      return false;
    fields.add(effect.field);
  }
  return true;
}

/**
 * ARCH-S278-3: the confirmation names exactly this proposal's effects, in its order, and the
 * proposal is one row's listed cells. Anything else is refused before any claim or write.
 */
export function assertSheetSetConfirmation(
  proposal: SheetWritebackProposal,
  effectHashes: readonly string[],
): void {
  if (!isSheetCellSet(proposal))
    throw new SheetSetShapeError(
      "This preview is not one lease row's listed Sheet cells, so it is confirmed one update at a time.",
    );
  if (
    effectHashes.length !== proposal.effects.length ||
    effectHashes.some((hash, index) => proposal.effects[index]!.effectHash !== hash)
  )
    throw new SheetSetShapeError(
      "This confirmation does not name the previewed cells in their order. Review the current preview and confirm that one.",
    );
}

/** The field labels of the listed cells whose fresh read differs from the preview. */
export interface SheetSetRecheck {
  readonly changed: readonly string[];
}

/**
 * R-S278-4: the one whole-set recheck before the first write. The row identity, the header and
 * every listed current value must still equal the preview; a field that now has its own selected
 * cell is also a change. Pure over the fresh read.
 */
export function recheckSheetSet(
  proposal: SheetWritebackProposal,
  context: FreshOperatingSheetLeaseContext,
  binding?: OperatingSheetLookupBinding | null,
): SheetSetRecheck {
  const changed: string[] = [];
  if (
    proposal.scope.kind !== "lease_workspace" ||
    proposal.scope.leaseId !== context.leaseId ||
    proposal.scope.propertyId !== context.propertyId ||
    proposal.headerHash !== hashSheetHeader(context.header, context.columns)
  )
    return { changed: [SHEET_SET_WORDS.headerChanged] };
  const row = context.row;
  const first = proposal.effects[0]?.effect;
  if (
    !row ||
    context.targetRefusal ||
    first?.kind !== "field_update" ||
    row.rowNumber !== first.rowNumber ||
    row.rowKey !== first.rowKey ||
    row.anchorTenantName !== first.anchorTenantName
  )
    return { changed: [SHEET_SET_WORDS.rowChanged] };
  for (const entry of proposal.effects) {
    const effect = entry.effect;
    if (effect.kind !== "field_update") {
      changed.push(SHEET_SET_WORDS.rowChanged);
      continue;
    }
    const now = row.fieldValues?.[effect.field];
    if (
      now === undefined ||
      now !== effect.expectedValue ||
      row.formulaFields?.includes(effect.field) ||
      Boolean(binding?.cells?.[effect.field])
    )
      changed.push(sheetFieldLabel(effect.field));
  }
  return { changed };
}

export type SheetSetCellState = "done" | "failed" | "unattempted";

export interface SheetSetCellResult {
  readonly effectHash: string;
  readonly field: string;
  readonly label: string;
  readonly state: SheetSetCellState;
  readonly duplicate?: boolean;
  readonly receipt?: {
    readonly providerRef: string;
    readonly resultHash: string;
    readonly reconciled: boolean;
    readonly createdAt: string;
  };
  readonly error?: string;
  readonly errorType?: string;
}

export type SheetSetRunOutcome =
  | {
      readonly state: "refused";
      readonly changed: readonly string[];
      readonly message: string;
    }
  | {
      readonly state: "ran";
      readonly results: readonly SheetSetCellResult[];
      readonly summary: readonly string[];
    };

/** R-S278-5: the three groups by field name: written, the one that stopped, and unattempted. */
export function sheetSetGroups(results: readonly SheetSetCellResult[]): {
  readonly written: readonly string[];
  readonly stopped: { readonly label: string; readonly reason: string } | null;
  readonly unattempted: readonly string[];
} {
  const failed = results.find((result) => result.state === "failed");
  return {
    written: results.filter((result) => result.state === "done").map((r) => r.label),
    stopped: failed ? { label: failed.label, reason: failed.error ?? "" } : null,
    unattempted: results
      .filter((result) => result.state === "unattempted")
      .map((result) => result.label),
  };
}

/** The lines the list and the preview state after a run. */
export function sheetSetSummary(results: readonly SheetSetCellResult[]): string[] {
  const groups = sheetSetGroups(results);
  if (!groups.stopped && groups.unattempted.length === 0)
    return [SHEET_SET_WORDS.allWritten(groups.written.length)];
  const lines: string[] = [];
  if (groups.written.length) lines.push(SHEET_SET_WORDS.written(groups.written));
  if (groups.stopped)
    lines.push(
      SHEET_SET_WORDS.stopped(groups.stopped.label, groups.stopped.reason).trim(),
    );
  if (groups.unattempted.length)
    lines.push(SHEET_SET_WORDS.unattempted(groups.unattempted));
  lines.push(SHEET_SET_WORDS.stopNote);
  return lines;
}

function fieldOf(entry: ValidatedSheetWritebackEffect): string {
  return entry.effect.kind === "field_update" ? entry.effect.field : "row";
}

/**
 * ARCH-S278-3: run one confirmed set. `recheck` reads the row again once; `executeOne` is the
 * existing per-cell execution with its own claim, write, read-back and receipt.
 */
export async function runSheetUpdateSet(input: {
  readonly proposal: SheetWritebackProposal;
  readonly effectHashes: readonly string[];
  readonly recheck: () => Promise<SheetSetRecheck>;
  readonly executeOne: (
    entry: ValidatedSheetWritebackEffect,
  ) => Promise<{ readonly receipt: ExternalActionReceipt; readonly duplicate: boolean }>;
  readonly describeError: (error: unknown) => {
    readonly message: string;
    readonly type: string;
  };
}): Promise<SheetSetRunOutcome> {
  assertSheetSetConfirmation(input.proposal, input.effectHashes);
  const recheck = await input.recheck();
  if (recheck.changed.length > 0)
    return {
      state: "refused",
      changed: recheck.changed,
      message: SHEET_SET_WORDS.changed(recheck.changed),
    };
  const results: SheetSetCellResult[] = [];
  let stopped = false;
  for (const entry of input.proposal.effects) {
    const field = fieldOf(entry);
    const base = {
      effectHash: entry.effectHash,
      field,
      label: sheetFieldLabel(field),
    };
    if (stopped) {
      results.push({ ...base, state: "unattempted" });
      continue;
    }
    try {
      const outcome = await input.executeOne(entry);
      results.push({
        ...base,
        state: "done",
        duplicate: outcome.duplicate,
        receipt: {
          providerRef: outcome.receipt.providerRef,
          resultHash: outcome.receipt.resultHash,
          reconciled: outcome.receipt.reconciled,
          createdAt: outcome.receipt.createdAt,
        },
      });
    } catch (error) {
      const described = input.describeError(error);
      results.push({
        ...base,
        state: "failed",
        error: described.message,
        errorType: described.type,
      });
      stopped = true;
    }
  }
  return { state: "ran", results, summary: sheetSetSummary(results) };
}
