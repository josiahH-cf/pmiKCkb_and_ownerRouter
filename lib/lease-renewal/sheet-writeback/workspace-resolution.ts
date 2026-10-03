import { currentRentCorrectionKey } from "@/lib/lease-renewal/current-rent-correction";
// Fresh, server-only S98 lease→Sheet resolution. Normal product proposals never accept a row,
// tenant, property, field, value, or source from browser JSON: they are rebuilt from the exact
// RentVine hyperlink join, the current source candidates, the lease's saved lookup selection
// (S158) and the lease's working current rent (S160).

import {
  sheetCellRepresentationPreserved,
  type SheetCellEvidence,
} from "@/lib/google-sheets/cell-evidence";
import {
  WORKING_CURRENT_RENT_SOURCE_LABEL,
  parseSheetFieldIntent,
  sheetIntentValue,
  type SheetFieldIntent,
} from "@/lib/lease-renewal/sheet-writeback/field-intent";
import {
  hashSheetHeader,
  sheetCellValueMatches,
} from "@/lib/lease-renewal/sheet-writeback/execution-service";
import { canonicalJson } from "@/lib/execution/preview-hash";
import { readSheetWorkingRecord } from "@/lib/firestore/renewal-sheet-working-inputs";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { RENTVINE_SOURCE, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import { runLiveRenewalReview } from "@/lib/lease-renewal/live-run";
import { LIVE_REVIEW_RUN_ID } from "@/lib/lease-renewal/live-review";
import { renewalDecisionRecordKey } from "@/lib/lease-renewal/pipeline";
import { renewalReconciliationSourceTriggerKey } from "@/lib/lease-renewal/approval-queue-mapping";
import {
  NO_SHEET_LOOKUP_BINDING,
  applyOperatorRowBindings,
  columnLetters,
  parseSheetCell,
  quoteSheetTab,
  sheetCellA1,
  sheetLookupBinding,
  type OperatingSheetLookupBinding,
} from "@/lib/lease-renewal/sheet-lookup";
import {
  PROOF_NOTE_PREFIX,
  parseRowNote,
  type SheetFieldUpdateEffectInput,
  type SheetRowAppendEffectInput,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { OPERATING_SHEET_TAB } from "@/lib/lease-renewal/sheet-writeback/live";
import {
  describeOperatorSelectionLimit,
  resolveOperatorSheetTarget,
} from "@/lib/lease-renewal/sheet-writeback/lookup-target";
import {
  appendIntentRefusal,
  associateOperatingSheetRow,
  type OperatingSheetRowAssociation,
} from "@/lib/lease-renewal/sheet-writeback/row-association";
import {
  audienceRosterFromLease,
  effectForAudienceEmailIntent,
  type AudienceRosters,
} from "@/lib/lease-renewal/sheet-writeback/audience-emails";
import {
  SheetWorkspaceResolutionError,
  type SheetWorkspaceResolutionCode,
} from "@/lib/lease-renewal/sheet-writeback/resolution-error";
import { sheetResponsesToTablesWithJoinIds } from "@/lib/lease-renewal/sheet-links";

export { SheetWorkspaceResolutionError } from "@/lib/lease-renewal/sheet-writeback/resolution-error";

export interface FreshOperatingSheetLeaseContext {
  leaseId: string;
  propertyId: string;
  tenantName: string;
  sourceReadAtIso: string;
  header: string[];
  columns: Map<string, number>;
  tenantColumnIndex: number;
  tabId?: number | null;
  /**
   * S116/S158: the one fresh lease/row association. `row` is present exactly for an exact row or
   * a readable operator-selected row; an ambiguous association keeps `row` null and refuses both
   * append and update.
   */
  association: OperatingSheetRowAssociation;
  /**
   * S158: set when the operator-selected location governing this read is readable but not an
   * eligible update target. Every effect builder refuses with exactly this message.
   */
  targetRefusal?: {
    code: "selected_row_not_writable" | "selected_cell_not_writable";
    message: string;
  } | null;
  /** S158: the A1 cell a field's selected cell points at on the operating tab, when one applies. */
  fieldCells?: Record<string, string>;
  /**
   * S116 (R116.3): the complete source-backed address set per audience from the fresh lease
   * roster, or the refusal a person resolves at the source. Absent when the roster was not read.
   */
  rosters?: AudienceRosters;
  row: null | {
    rowNumber: number;
    rowKey: string | null;
    anchorTenantName: string;
    currentRentValue: string;
    currentRentAgreement?: "agree" | "conflict" | "single_source" | "missing";
    fieldValues?: Record<string, string>;
    formulaFields?: string[];
    cellEvidence?: Record<string, SheetCellEvidence>;
    currentRentSourceTriggerKey: string | null;
    currentRentCandidateFingerprint: string | null;
  };
}

export interface ResolveFreshLeaseContextOptions {
  /**
   * The lease's saved lookup selection. Omitted: it is read from the working record. Null: the
   * automatic lookup. A caller revalidating an effect passes the selection it previewed with.
   */
  binding?: OperatingSheetLookupBinding | null;
}

/**
 * Resolve the physical rows owned by one exact lease/property. A provider hyperlink is the normal
 * join; an S98 normal-row system note is the durable fallback for app-appended rows. Proof rows are
 * never product rows, and a conflicting link/note or same-lease/different-property note fails the
 * whole targeted resolution closed.
 */
export function exactOperatingSheetRowIndexes(input: {
  rowCount: number;
  joins: readonly (string | null)[];
  notes: readonly (readonly (string | null)[])[];
  tenantColumnIndex: number;
  leaseId: string;
  propertyId: string;
}): number[] {
  const expectedJoin = `lease:${input.leaseId}`;
  return Array.from({ length: input.rowCount }, (_, rowIndex) => rowIndex).flatMap(
    (rowIndex) => {
      const rowNotes = input.notes[rowIndex] ?? [];
      if (rowNotes.some((note) => note?.startsWith(PROOF_NOTE_PREFIX))) return [];
      const systemNote = rowNotes[input.tenantColumnIndex] ?? "";
      const parsedSystemNote = systemNote ? parseRowNote(systemNote) : null;
      const hyperlinkJoin = input.joins[rowIndex] ?? null;
      if (
        parsedSystemNote &&
        !parsedSystemNote.proof &&
        hyperlinkJoin !== null &&
        hyperlinkJoin !== `lease:${parsedSystemNote.leaseId}` &&
        (parsedSystemNote.leaseId === input.leaseId || hyperlinkJoin === expectedJoin)
      ) {
        throw new SheetWorkspaceResolutionError("row_state_mismatch");
      }
      if (
        parsedSystemNote &&
        !parsedSystemNote.proof &&
        parsedSystemNote.leaseId === input.leaseId &&
        parsedSystemNote.propertyId !== input.propertyId
      ) {
        throw new SheetWorkspaceResolutionError("row_state_mismatch");
      }
      const systemNoteMatches =
        parsedSystemNote !== null &&
        !parsedSystemNote.proof &&
        parsedSystemNote.leaseId === input.leaseId &&
        parsedSystemNote.propertyId === input.propertyId;
      return hyperlinkJoin === expectedJoin || systemNoteMatches ? [rowIndex] : [];
    },
  );
}

function propertyIdOf(lease: RawLease): string | null {
  const property =
    lease.property && typeof lease.property === "object" && !Array.isArray(lease.property)
      ? (lease.property as Record<string, unknown>)
      : null;
  for (const source of [property, lease]) {
    if (!source) continue;
    for (const key of ["propertyID", "propertyId"]) {
      const value = source[key];
      const normalized =
        value === undefined || value === null ? "" : String(value).trim();
      if (/^[1-9]\d*$/.test(normalized)) return normalized;
    }
  }
  return null;
}

/** The lease's unit id from the measured export view (`unit.unitID`), or null. */
function unitIdOf(lease: RawLease): string | null {
  const unit =
    lease.unit && typeof lease.unit === "object" && !Array.isArray(lease.unit)
      ? (lease.unit as Record<string, unknown>)
      : null;
  const value = unit?.unitID;
  const normalized = value === undefined || value === null ? "" : String(value).trim();
  return /^[1-9]\d*$/.test(normalized) ? normalized : null;
}

function filteredForPipeline(
  tables: readonly (readonly (readonly string[])[])[],
  joins: readonly (readonly (string | null)[])[],
  notes: readonly (readonly (readonly (string | null)[])[])[],
) {
  const filteredTables: string[][][] = [];
  const filteredJoins: (string | null)[][] = [];
  for (let tableIndex = 0; tableIndex < tables.length; tableIndex += 1) {
    const table: string[][] = [];
    const tableJoins: (string | null)[] = [];
    for (let rowIndex = 0; rowIndex < (tables[tableIndex]?.length ?? 0); rowIndex += 1) {
      const rowNotes = notes[tableIndex]?.[rowIndex] ?? [];
      const proof = rowNotes.some((note) => note?.startsWith(PROOF_NOTE_PREFIX));
      if (proof) continue;
      table.push([...(tables[tableIndex]?.[rowIndex] ?? [])]);
      // An app-appended normal row intentionally has no caller-supplied hyperlink. Its exact
      // lease/property identity lives in the system note, so feed that durable identity back into
      // the read pipeline. This prevents a second append and lets later discrepancies reconcile
      // against the same exact row.
      const normalNotes = rowNotes
        .map((note) => (note ? parseRowNote(note) : null))
        .filter(
          (note): note is NonNullable<ReturnType<typeof parseRowNote>> =>
            note !== null && !note.proof,
        );
      const distinctNormalIdentities = new Set(
        normalNotes.map((note) => `${note.leaseId}:${note.propertyId}`),
      );
      if (distinctNormalIdentities.size > 1) {
        throw new SheetWorkspaceResolutionError("row_state_mismatch");
      }
      tableJoins.push(
        joins[tableIndex]?.[rowIndex] ??
          (normalNotes[0] ? `lease:${normalNotes[0].leaseId}` : null),
      );
    }
    filteredTables.push(table);
    filteredJoins.push(tableJoins);
  }
  return { filteredTables, filteredJoins };
}

/** The lease's saved lookup selection, or a refusal that names the unreadable selection. */
async function loadLookupBinding(leaseId: string): Promise<OperatingSheetLookupBinding> {
  try {
    return sheetLookupBinding(await readSheetWorkingRecord(leaseId));
  } catch {
    throw new SheetWorkspaceResolutionError("lookup_unavailable");
  }
}

/** One complete, fresh, read-only source rebuild for a canonical lease workspace. */
export async function resolveFreshOperatingSheetLeaseContext(
  leaseId: string,
  readAtIso = new Date().toISOString(),
  inspectField?: string,
  options: ResolveFreshLeaseContextOptions = {},
): Promise<FreshOperatingSheetLeaseContext> {
  const config = buildLiveRenewalConfig();
  if (!config.ok || !config.sheetsReader.batchGetFormulas) {
    throw new SheetWorkspaceResolutionError("source_unavailable");
  }
  // S158: the operator's selection is read before the Sheet so that an unreadable selection is
  // reported as such, never silently replaced by the automatic lookup.
  const binding =
    options.binding !== undefined
      ? (options.binding ?? NO_SHEET_LOOKUP_BINDING)
      : await loadLookupBinding(leaseId);
  try {
    const [evaluated, formulas, notesByTab, richLinksByTab, lease] = await Promise.all([
      config.sheetsReader.batchGet(config.spreadsheetId, [OPERATING_SHEET_TAB]),
      config.sheetsReader.batchGetFormulas(config.spreadsheetId, [OPERATING_SHEET_TAB]),
      // S116: a missing note layer no longer fails the read; it makes the association
      // `metadata_incomplete`, which refuses append and update without hiding the workspace.
      config.sheetsReader.batchGetNotes
        ? config.sheetsReader.batchGetNotes(config.spreadsheetId, [OPERATING_SHEET_TAB])
        : Promise.resolve(null),
      // S116: links attached to cell text are part of the exact-link join; a reader without that
      // layer keeps the formula-only behavior.
      config.sheetsReader.batchGetRichLinks
        ? config.sheetsReader.batchGetRichLinks(config.spreadsheetId, [
            OPERATING_SHEET_TAB,
          ])
        : Promise.resolve(undefined),
      config.rentvineClient.getLease(leaseId),
    ]);
    if (leaseViewId(lease) !== leaseId) {
      throw new SheetWorkspaceResolutionError("lease_identity_mismatch");
    }
    const propertyId = propertyIdOf(lease);
    if (!propertyId) throw new SheetWorkspaceResolutionError("lease_identity_mismatch");

    const tabId =
      (await config.sheetsReader
        .getTabId?.(config.spreadsheetId, OPERATING_SHEET_TAB)
        .catch(() => null)) ?? null;
    const joined = sheetResponsesToTablesWithJoinIds(
      evaluated,
      formulas,
      richLinksByTab ? [richLinksByTab[OPERATING_SHEET_TAB]] : undefined,
    );
    const rawTable = joined.tables[0] ?? [];
    const rawJoins = joined.tableJoinIds[0] ?? [];
    const rawNotes = notesByTab?.[OPERATING_SHEET_TAB] ?? [];
    const layers = {
      notes: notesByTab !== null,
      cellLinks: richLinksByTab !== undefined,
    };
    // S158: the selected row wins in the read pipeline's join as well, so the same row carries the
    // lease's Sheet facts here and on the desk. A row that links to another lease is never taken.
    const joinsForPipeline = binding.row
      ? applyOperatorRowBindings({
          titles: [OPERATING_SHEET_TAB],
          tableJoinIds: joined.tableJoinIds,
          bindings: new Map([[leaseId, binding.row.value]]),
        }).tableJoinIds
      : joined.tableJoinIds;
    const { filteredTables, filteredJoins } = filteredForPipeline(
      joined.tables,
      joinsForPipeline,
      [rawNotes],
    );
    const live = await runLiveRenewalReview({
      rentvineClient: config.rentvineClient,
      runId: LIVE_REVIEW_RUN_ID,
      readTimestamp: readAtIso,
      tables: filteredTables,
      tableJoinIds: filteredJoins,
    });
    if (!live.exportComplete) {
      throw new SheetWorkspaceResolutionError("source_unavailable");
    }
    const expectedJoin = `lease:${leaseId}`;
    const candidates = live.pipelineInput.nonSheetCandidates.filter(
      (candidate) =>
        candidate.source === RENTVINE_SOURCE && candidate.joinId === expectedJoin,
    );
    if (candidates.length !== 1 || !candidates[0].joinValue.trim()) {
      throw new SheetWorkspaceResolutionError("lease_identity_mismatch");
    }

    const headerResolution = resolveHeaders(rawTable, RENEWAL_TAB_SCHEMAS.Renewals);
    if (headerResolution.headerRowIndex === null) {
      throw new SheetWorkspaceResolutionError("source_unavailable");
    }
    const header = [...(rawTable[headerResolution.headerRowIndex] ?? [])];
    const columns = new Map<string, number>();
    for (const [field, index] of Object.entries(headerResolution.resolvedFields)) {
      columns.set(field, index);
    }
    const tenantColumnIndex = columns.get("tenant_name");
    const rentColumnIndex = columns.get("current_rent");
    if (tenantColumnIndex === undefined || rentColumnIndex === undefined) {
      throw new SheetWorkspaceResolutionError("source_unavailable");
    }

    // S158: the operator's selection governs this read, or this one field's update, when one
    // exists; otherwise one automatic association governs everything below. Only an exact row or
    // a readable selected row yields a row; every other state keeps `row` null.
    const target = resolveOperatorSheetTarget({
      binding,
      inspectField,
      operatingTabTitle: OPERATING_SHEET_TAB,
      rawTable,
      rawJoins,
      rawNotes,
      headerRowIndex: headerResolution.headerRowIndex,
      columns,
      tenantColumnIndex,
      leaseId,
      propertyId,
    });
    const association: OperatingSheetRowAssociation =
      target.kind === "automatic"
        ? associateOperatingSheetRow({
            rawTable,
            rawJoins,
            rawNotes,
            headerRowIndex: headerResolution.headerRowIndex,
            tenantColumnIndex,
            leaseId,
            propertyId,
            unitId: unitIdOf(lease),
            tenantName: candidates[0].joinValue,
            layers,
          })
        : {
            kind: "operator_selected",
            via: target.via,
            tabTitle: target.tabTitle,
            rowNumber: target.rowNumber,
            ...(target.cell ? { cell: target.cell } : {}),
            limit: target.limit,
          };
    const targetRefusal =
      target.kind === "selected" && target.limit !== null
        ? {
            code:
              target.via === "cell"
                ? ("selected_cell_not_writable" as const)
                : ("selected_row_not_writable" as const),
            message: describeOperatorSelectionLimit(target),
          }
        : null;
    const rosters: AudienceRosters = {
      owner: audienceRosterFromLease(lease, "owner"),
      tenant: audienceRosterFromLease(lease, "tenant"),
    };
    // A selected row stays readable for its values unless it is not a row of this tab at all.
    const selectedReadable =
      target.kind === "selected" &&
      !["other_tab", "header_row", "outside_rows", "proof_row"].includes(
        target.limit ?? "",
      );
    const rawRowIndex =
      association.kind === "exact_link" || association.kind === "app_note"
        ? association.rowNumber - 1
        : selectedReadable
          ? target.rowNumber - 1
          : null;
    const base = {
      leaseId,
      propertyId,
      tenantName: candidates[0].joinValue,
      sourceReadAtIso: readAtIso,
      header,
      columns,
      tenantColumnIndex,
      tabId,
      association,
      targetRefusal,
      rosters,
    };
    if (rawRowIndex === null) return { ...base, row: null };

    const row = rawTable[rawRowIndex] ?? [];
    const note = rawNotes[rawRowIndex]?.[tenantColumnIndex] ?? "";
    const parsedNote = note ? parseRowNote(note) : null;
    if (
      target.kind === "automatic" &&
      parsedNote &&
      (parsedNote.proof ||
        parsedNote.leaseId !== leaseId ||
        parsedNote.propertyId !== propertyId)
    ) {
      throw new SheetWorkspaceResolutionError("row_state_mismatch");
    }
    const ownNote =
      parsedNote &&
      !parsedNote.proof &&
      parsedNote.leaseId === leaseId &&
      parsedNote.propertyId === propertyId
        ? parsedNote
        : null;
    const formulaFields = [...columns]
      .filter(([, index]) =>
        String(
          formulas.valueRanges?.[0]?.values?.[rawRowIndex]?.[index] ?? "",
        ).startsWith("="),
      )
      .map(([field]) => field);
    // S158: a selected cell that holds a formula stays readable and is refused as a target here,
    // with the limit named, rather than failing later as a generic row-state mismatch.
    const refusal =
      targetRefusal ??
      (target.kind === "selected" &&
      target.via === "cell" &&
      inspectField &&
      formulaFields.includes(inspectField)
        ? {
            code: "selected_cell_not_writable" as const,
            message: `Cell ${target.cell} on tab "${target.tabTitle}" stays readable, but the app does not update it: it holds a formula. Your working values are unchanged.`,
          }
        : null);
    let cellEvidence: Record<string, SheetCellEvidence> | undefined;
    if (inspectField && columns.has(inspectField) && !refusal) {
      if (!config.sheetsReader.getCellEvidence)
        throw new SheetWorkspaceResolutionError("source_unavailable");
      const cell = await config.sheetsReader.getCellEvidence(
        config.spreadsheetId,
        `${quoteSheetTab(OPERATING_SHEET_TAB)}!${columnLetters(columns.get(inspectField)!)}${rawRowIndex + 1}`,
      );
      if (cell.formattedValue !== (row[columns.get(inspectField)!] ?? ""))
        throw new SheetWorkspaceResolutionError("row_state_mismatch");
      cellEvidence = { [inspectField]: cell };
    }
    const fieldValues = Object.fromEntries(
      [...columns].map(([field, index]) => [field, row[index] ?? ""]),
    );
    // S158 (BEH-S158-3): a selected cell changes only its own field's displayed value, read from
    // the same tab read; a cell on another tab is read by the lookup itself.
    const fieldCells: Record<string, string> = {};
    for (const [field, selection] of Object.entries(binding.cells)) {
      if (field === inspectField || selection.value.tabTitle !== OPERATING_SHEET_TAB)
        continue;
      const cell = parseSheetCell(selection.value.cell);
      if (!cell || cell.rowNumber - 1 >= rawTable.length) continue;
      const notes = rawNotes[cell.rowNumber - 1] ?? [];
      if (notes.some((entry) => entry?.startsWith(PROOF_NOTE_PREFIX))) continue;
      fieldValues[field] = rawTable[cell.rowNumber - 1]?.[cell.columnIndex] ?? "";
      fieldCells[field] = sheetCellA1(cell.columnIndex, cell.rowNumber);
    }
    const recordKey = renewalDecisionRecordKey(expectedJoin, {
      tab: "Renewals",
      tabNumber: null,
      sourceRowIndex: rawRowIndex,
    });
    const sourceTriggerKey = renewalReconciliationSourceTriggerKey(
      LIVE_REVIEW_RUN_ID,
      recordKey,
      "current_rent",
    );
    const currentRentOutcome = live.run.outcomes.find(
      (outcome) =>
        outcome.fieldKey === "current_rent" &&
        (outcome.queueMapping?.queueItem.source_trigger_key ??
          currentRentCorrectionKey(outcome, LIVE_REVIEW_RUN_ID)) === sourceTriggerKey,
    );
    return {
      ...base,
      targetRefusal: refusal,
      ...(Object.keys(fieldCells).length > 0 ? { fieldCells } : {}),
      row: {
        ...(cellEvidence ? { cellEvidence } : {}),
        rowNumber: rawRowIndex + 1,
        rowKey: ownNote?.operationId ?? null,
        anchorTenantName: row[tenantColumnIndex] ?? "",
        currentRentValue: row[rentColumnIndex] ?? "",
        currentRentAgreement: currentRentOutcome?.reconciliation.agreement,
        fieldValues,
        formulaFields,
        currentRentSourceTriggerKey: currentRentOutcome ? sourceTriggerKey : null,
        currentRentCandidateFingerprint: currentRentOutcome?.candidateFingerprint ?? null,
      },
    };
  } catch (error) {
    if (error instanceof SheetWorkspaceResolutionError) throw error;
    throw new SheetWorkspaceResolutionError("source_unavailable");
  }
}

/** The working current rent an update was prepared from; the value is the binding, not a role. */
export interface WorkingCurrentRentInput {
  readonly workingCurrentRent: number | null;
}

/** Revalidate every immutable term before the claim/effect. Throws on any source/decision drift. */
export function assertProposalMatchesFreshLeaseContext(
  proposal: SheetWritebackProposal,
  context: FreshOperatingSheetLeaseContext,
  working: WorkingCurrentRentInput | null,
  after = false,
): void {
  if (
    proposal.scope.kind !== "lease_workspace" ||
    proposal.scope.leaseId !== context.leaseId ||
    proposal.scope.propertyId !== context.propertyId ||
    proposal.effects.length !== 1 ||
    proposal.headerHash !== hashSheetHeader(context.header, context.columns)
  ) {
    throw new SheetWorkspaceResolutionError("proposal_stale");
  }
  const effect = proposal.effects[0].effect;
  if (effect.kind === "row_append") {
    // S116: a saved append stays valid only while the fresh read still confirms absence.
    if (
      context.row !== null ||
      appendIntentRefusal(context.association) !== null ||
      effect.mode !== "normal" ||
      effect.leaseId !== context.leaseId ||
      effect.propertyId !== context.propertyId ||
      effect.tenantName !== context.tenantName ||
      Object.keys(effect.fields).length !== 0
    ) {
      throw new SheetWorkspaceResolutionError("proposal_stale");
    }
    return;
  }
  if (
    !context.row ||
    context.targetRefusal ||
    context.row.formulaFields?.includes(effect.field)
  ) {
    throw new SheetWorkspaceResolutionError("proposal_stale");
  }
  if (after) {
    if (
      (effect.cellEvidence &&
        (!context.row.cellEvidence?.[effect.field] ||
          !sheetCellRepresentationPreserved(
            effect.cellEvidence,
            context.row.cellEvidence[effect.field],
            effect.afterValue,
          ))) ||
      effect.rowNumber !== context.row.rowNumber ||
      effect.rowKey !== context.row.rowKey ||
      effect.anchorTenantName !== context.row.anchorTenantName ||
      !sheetCellValueMatches(
        effect.afterValue,
        context.row.fieldValues?.[effect.field] ?? context.row.currentRentValue,
      )
    ) {
      throw new SheetWorkspaceResolutionError("proposal_stale");
    }
    return;
  }
  if (effect.audienceIntent) {
    // S116: the saved audience-email update stays valid only while the fresh roster, header and
    // cell still produce the identical effect; roster or collaborator drift invalidates it.
    let expected: SheetFieldUpdateEffectInput;
    try {
      expected = effectForAudienceEmailIntent(context, effect.audienceIntent.audience);
    } catch {
      throw new SheetWorkspaceResolutionError("proposal_stale");
    }
    if (canonicalJson(effect) !== canonicalJson(expected))
      throw new SheetWorkspaceResolutionError("proposal_stale");
    return;
  }
  if (effect.staffIntent && !effect.authorization) {
    let expected: SheetFieldUpdateEffectInput;
    try {
      expected = effectForSheetFieldIntent(context, effect.staffIntent, {
        workingCurrentRent: working?.workingCurrentRent ?? null,
      });
    } catch (error) {
      // S160: a changed working value is reported as exactly that, never as a generic drift.
      if (
        error instanceof SheetWorkspaceResolutionError &&
        (error.code === "working_value_changed" || error.code === "working_value_missing")
      )
        throw error;
      throw new SheetWorkspaceResolutionError("proposal_stale");
    }
    if (canonicalJson(effect) !== canonicalJson(expected))
      throw new SheetWorkspaceResolutionError("proposal_stale");
    return;
  }
  // S160: an update authorized by a reconciliation approval is a retired shape; it is never
  // confirmable again. Staff prepare a fresh preview from the working current rent instead.
  throw new SheetWorkspaceResolutionError("proposal_stale");
}

/** Construct the one server-derived append allowed for the fresh workspace state. */
export function effectForFreshLeaseContext(
  context: FreshOperatingSheetLeaseContext,
  operationId: string,
): SheetRowAppendEffectInput {
  const refusal = appendIntentRefusal(context.association);
  if (context.row || refusal) {
    throw new SheetWorkspaceResolutionError(refusal ?? "row_state_mismatch");
  }
  return {
    kind: "row_append",
    mode: "normal",
    operationId,
    leaseId: context.leaseId,
    propertyId: context.propertyId,
    tenantName: context.tenantName,
    fields: {},
  };
}

/** S160: the current-rent Sheet update prepared from the lease's working current rent. */
export function effectForWorkingCurrentRent(
  context: FreshOperatingSheetLeaseContext,
  workingCurrentRent: number | null,
): SheetFieldUpdateEffectInput {
  if (workingCurrentRent === null)
    throw new SheetWorkspaceResolutionError("working_value_missing");
  return effectForSheetFieldIntent(
    context,
    {
      field: "current_rent",
      value: workingCurrentRent,
      source: WORKING_CURRENT_RENT_SOURCE_LABEL,
    },
    { workingCurrentRent },
  );
}

function refuse(code: SheetWorkspaceResolutionCode, message?: string): never {
  throw new SheetWorkspaceResolutionError(code, message);
}

export function effectForSheetFieldIntent(
  context: FreshOperatingSheetLeaseContext,
  raw: SheetFieldIntent,
  options: { workingCurrentRent?: number | null } = {},
): SheetFieldUpdateEffectInput {
  const intent = parseSheetFieldIntent(raw);
  // S158: a selected location that is readable but not a target refuses with its own limit.
  if (context.targetRefusal)
    refuse(context.targetRefusal.code, context.targetRefusal.message);
  if (!context.row)
    refuse(
      "row_state_mismatch",
      "The app has no Sheet row for this lease to update. Choose this lease's row under Operating Sheet lookup in Lease information, or add the row.",
    );
  if (!context.columns.has(intent.field))
    refuse(
      "row_state_mismatch",
      "The operating tab has no recognized column for this field, so the app does not update it.",
    );
  if (context.row.formulaFields?.includes(intent.field))
    refuse(
      "row_state_mismatch",
      "This Sheet cell holds a formula, so the app does not replace it. The current read stays available.",
    );
  if (intent.field === "current_rent") {
    // S160: the current-rent update is bound to the working current rent, never a typed amount.
    const working = options.workingCurrentRent ?? null;
    if (working === null) refuse("working_value_missing");
    if (working !== intent.value) refuse("working_value_changed");
  }
  const expectedValue =
    context.row.fieldValues?.[intent.field] ??
    (intent.field === "current_rent" ? context.row.currentRentValue : undefined);
  if (expectedValue === undefined)
    refuse(
      "row_state_mismatch",
      "The operating tab has no recognized column for this field, so the app does not update it.",
    );
  const afterValue = sheetIntentValue(
    intent,
    expectedValue,
    context.row.cellEvidence?.[intent.field]?.checkbox,
  );
  if (sheetCellValueMatches(afterValue, expectedValue)) refuse("no_change");
  return {
    kind: "field_update",
    field: intent.field,
    rowNumber: context.row.rowNumber,
    rowKey: context.row.rowKey,
    anchorTenantName: context.row.anchorTenantName,
    expectedValue,
    afterValue,
    ...(context.row.cellEvidence?.[intent.field]
      ? { cellEvidence: context.row.cellEvidence[intent.field] }
      : {}),
    source: intent.source,
    staffIntent: intent,
  };
}
