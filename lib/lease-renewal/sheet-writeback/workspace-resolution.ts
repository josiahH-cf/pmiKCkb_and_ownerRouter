// Fresh, server-only S98 lease→Sheet resolution. Normal product proposals never accept a row,
// tenant, property, field, value, or source from browser JSON: they are rebuilt from the exact
// RentVine hyperlink join, the current source candidates, and the current human decision records.

import type { AuthenticatedUser } from "@/lib/auth/session";
import { canonicalJson } from "@/lib/execution/preview-hash";
import { getLeaseRenewalResolution } from "@/lib/firestore/lease-renewal-resolutions";
import { getWritebackApproval } from "@/lib/firestore/lease-renewal-writeback-approvals";
import type {
  LeaseRenewalResolutionRecord,
  LeaseRenewalWritebackApprovalRecord,
} from "@/lib/firestore/types";
import type { RawLease } from "@/lib/integrations/rentvine/client";
import { RENTVINE_SOURCE, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import { RENEWAL_TAB_SCHEMAS, resolveHeaders } from "@/lib/lease-renewal/headers";
import { buildLiveRenewalConfig } from "@/lib/lease-renewal/live-config";
import { runLiveRenewalReview } from "@/lib/lease-renewal/live-run";
import { LIVE_REVIEW_RUN_ID } from "@/lib/lease-renewal/live-review";
import { renewalDecisionRecordKey } from "@/lib/lease-renewal/pipeline";
import { renewalReconciliationSourceTriggerKey } from "@/lib/lease-renewal/approval-queue-mapping";
import {
  PROOF_NOTE_PREFIX,
  parseRowNote,
  type SheetFieldUpdateAuthorization,
  type SheetFieldUpdateEffectInput,
  type SheetRowAppendEffectInput,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";
import { OPERATING_SHEET_TAB } from "@/lib/lease-renewal/sheet-writeback/live";
import { sheetResponsesToTablesWithJoinIds } from "@/lib/lease-renewal/sheet-links";
import { writebackApprovalMatchesResolution } from "@/lib/lease-renewal/writeback-approval";
import { writebackAuthorizationTokenForResolution } from "@/lib/lease-renewal/writeback-authorization-token";

export class SheetWorkspaceResolutionError extends Error {
  constructor(
    public readonly code:
      | "source_unavailable"
      | "lease_identity_mismatch"
      | "row_join_ambiguous"
      | "row_state_mismatch"
      | "resolution_missing"
      | "resolution_stale"
      | "approval_stale"
      | "proposal_stale",
  ) {
    super(`Operating-Sheet workspace resolution refused (${code}).`);
    this.name = "SheetWorkspaceResolutionError";
  }
}

export interface FreshOperatingSheetLeaseContext {
  leaseId: string;
  propertyId: string;
  tenantName: string;
  sourceReadAtIso: string;
  header: string[];
  columns: Map<string, number>;
  tenantColumnIndex: number;
  row: null | {
    rowNumber: number;
    rowKey: string | null;
    anchorTenantName: string;
    currentRentValue: string;
    currentRentSourceTriggerKey: string | null;
    currentRentCandidateFingerprint: string | null;
  };
}

export interface AuthorizedCurrentRentUpdate {
  resolution: LeaseRenewalResolutionRecord;
  approval: LeaseRenewalWritebackApprovalRecord;
  authorization: SheetFieldUpdateAuthorization;
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

/** One complete, fresh, read-only source rebuild for a canonical lease workspace. */
export async function resolveFreshOperatingSheetLeaseContext(
  leaseId: string,
  readAtIso = new Date().toISOString(),
): Promise<FreshOperatingSheetLeaseContext> {
  const config = buildLiveRenewalConfig();
  if (!config.ok || !config.sheetsReader.batchGetFormulas) {
    throw new SheetWorkspaceResolutionError("source_unavailable");
  }
  try {
    const [evaluated, formulas, notesByTab, lease] = await Promise.all([
      config.sheetsReader.batchGet(config.spreadsheetId, [OPERATING_SHEET_TAB]),
      config.sheetsReader.batchGetFormulas(config.spreadsheetId, [OPERATING_SHEET_TAB]),
      config.sheetsReader.batchGetNotes
        ? config.sheetsReader.batchGetNotes(config.spreadsheetId, [OPERATING_SHEET_TAB])
        : Promise.reject(new Error("Sheet note read unavailable")),
      config.rentvineClient.getLease(leaseId),
    ]);
    if (leaseViewId(lease) !== leaseId) {
      throw new SheetWorkspaceResolutionError("lease_identity_mismatch");
    }
    const propertyId = propertyIdOf(lease);
    if (!propertyId) throw new SheetWorkspaceResolutionError("lease_identity_mismatch");

    const joined = sheetResponsesToTablesWithJoinIds(evaluated, formulas);
    const rawTable = joined.tables[0] ?? [];
    const rawJoins = joined.tableJoinIds[0] ?? [];
    const rawNotes = notesByTab[OPERATING_SHEET_TAB] ?? [];
    const { filteredTables, filteredJoins } = filteredForPipeline(
      joined.tables,
      joined.tableJoinIds,
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

    const matchingRows = exactOperatingSheetRowIndexes({
      rowCount: rawTable.length,
      joins: rawJoins,
      notes: rawNotes,
      tenantColumnIndex,
      leaseId,
      propertyId,
    });
    if (matchingRows.length > 1) {
      throw new SheetWorkspaceResolutionError("row_join_ambiguous");
    }
    if (matchingRows.length === 0) {
      return {
        leaseId,
        propertyId,
        tenantName: candidates[0].joinValue,
        sourceReadAtIso: readAtIso,
        header,
        columns,
        tenantColumnIndex,
        row: null,
      };
    }

    const rawRowIndex = matchingRows[0];
    if (rawRowIndex <= headerResolution.headerRowIndex) {
      throw new SheetWorkspaceResolutionError("row_state_mismatch");
    }
    const row = rawTable[rawRowIndex] ?? [];
    const note = rawNotes[rawRowIndex]?.[tenantColumnIndex] ?? "";
    const parsedNote = note ? parseRowNote(note) : null;
    if (
      parsedNote &&
      (parsedNote.proof ||
        parsedNote.leaseId !== leaseId ||
        parsedNote.propertyId !== propertyId)
    ) {
      throw new SheetWorkspaceResolutionError("row_state_mismatch");
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
        outcome.queueMapping?.queueItem.source_trigger_key === sourceTriggerKey,
    );
    return {
      leaseId,
      propertyId,
      tenantName: candidates[0].joinValue,
      sourceReadAtIso: readAtIso,
      header,
      columns,
      tenantColumnIndex,
      row: {
        rowNumber: rawRowIndex + 1,
        rowKey: parsedNote?.operationId ?? null,
        anchorTenantName: row[tenantColumnIndex] ?? "",
        currentRentValue: row[rentColumnIndex] ?? "",
        currentRentSourceTriggerKey:
          currentRentOutcome?.queueMapping?.queueItem.source_trigger_key ?? null,
        currentRentCandidateFingerprint: currentRentOutcome?.candidateFingerprint ?? null,
      },
    };
  } catch (error) {
    if (error instanceof SheetWorkspaceResolutionError) throw error;
    throw new SheetWorkspaceResolutionError("source_unavailable");
  }
}

/** Load the exact current human resolution and current Admin approval for this fresh discrepancy. */
export async function resolveAuthorizedCurrentRentUpdate(
  actor: AuthenticatedUser,
  context: FreshOperatingSheetLeaseContext,
): Promise<AuthorizedCurrentRentUpdate> {
  const sourceTriggerKey = context.row?.currentRentSourceTriggerKey;
  const candidateFingerprint = context.row?.currentRentCandidateFingerprint;
  if (!sourceTriggerKey || !candidateFingerprint) {
    throw new SheetWorkspaceResolutionError("resolution_missing");
  }
  const [resolution, approval] = await Promise.all([
    getLeaseRenewalResolution(actor, sourceTriggerKey),
    getWritebackApproval(actor, sourceTriggerKey),
  ]);
  return authorizedCurrentRentUpdateFromRecords(context, resolution, approval);
}

/** Pure validation used by both the live loader and adversarial source/decision drift tests. */
export function authorizedCurrentRentUpdateFromRecords(
  context: FreshOperatingSheetLeaseContext,
  resolution: LeaseRenewalResolutionRecord | null,
  approval: LeaseRenewalWritebackApprovalRecord | null,
): AuthorizedCurrentRentUpdate {
  const sourceTriggerKey = context.row?.currentRentSourceTriggerKey;
  const candidateFingerprint = context.row?.currentRentCandidateFingerprint;
  if (!sourceTriggerKey || !candidateFingerprint) {
    throw new SheetWorkspaceResolutionError("resolution_missing");
  }
  if (!resolution?.updated_at || !resolution.proposed_writeback) {
    throw new SheetWorkspaceResolutionError("resolution_missing");
  }
  if (
    resolution.run_id !== LIVE_REVIEW_RUN_ID ||
    resolution.field_key !== "current_rent" ||
    resolution.source_trigger_key !== sourceTriggerKey ||
    resolution.candidate_fingerprint !== candidateFingerprint ||
    resolution.status !== "Resolved" ||
    resolution.proposed_writeback.status !== "Queued"
  ) {
    throw new SheetWorkspaceResolutionError("resolution_stale");
  }
  if (
    !approval ||
    approval.state !== "Approved" ||
    !writebackApprovalMatchesResolution(resolution, approval)
  ) {
    throw new SheetWorkspaceResolutionError("approval_stale");
  }
  const authorizationToken = writebackAuthorizationTokenForResolution(resolution);
  if (!authorizationToken || !approval.updated_at) {
    throw new SheetWorkspaceResolutionError("approval_stale");
  }
  return {
    resolution,
    approval,
    authorization: {
      sourceTriggerKey,
      runId: resolution.run_id,
      fieldKey: resolution.field_key,
      proposedValue: resolution.proposed_writeback.value,
      sourceOfValue: resolution.proposed_writeback.source_of_value,
      candidateFingerprint,
      resolutionUpdatedAt: resolution.updated_at,
      authorizationToken,
      approvalId: approval.id,
      approvalUpdatedAt: approval.updated_at,
      approvalDecidedByUid: approval.decided_by_uid,
    },
  };
}

/** Revalidate every immutable term before the claim/effect. Throws on any source/decision drift. */
export function assertProposalMatchesFreshLeaseContext(
  proposal: SheetWritebackProposal,
  context: FreshOperatingSheetLeaseContext,
  authorized: AuthorizedCurrentRentUpdate | null,
): void {
  if (
    proposal.scope.kind !== "lease_workspace" ||
    proposal.scope.leaseId !== context.leaseId ||
    proposal.scope.propertyId !== context.propertyId ||
    proposal.effects.length !== 1
  ) {
    throw new SheetWorkspaceResolutionError("proposal_stale");
  }
  const effect = proposal.effects[0].effect;
  if (effect.kind === "row_append") {
    if (
      context.row !== null ||
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
  if (!context.row || !authorized) {
    throw new SheetWorkspaceResolutionError("proposal_stale");
  }
  const expected: SheetFieldUpdateEffectInput = {
    kind: "field_update",
    field: "current_rent",
    rowNumber: context.row.rowNumber,
    rowKey: context.row.rowKey,
    anchorTenantName: context.row.anchorTenantName,
    expectedValue: context.row.currentRentValue,
    afterValue: authorized.authorization.proposedValue,
    source: authorized.authorization.sourceOfValue,
    authorization: authorized.authorization,
  };
  if (canonicalJson(effect) !== canonicalJson(expected)) {
    throw new SheetWorkspaceResolutionError("proposal_stale");
  }
}

/** Construct the one server-derived effect allowed for the fresh workspace state. */
export function effectForFreshLeaseContext(
  context: FreshOperatingSheetLeaseContext,
  authorized: AuthorizedCurrentRentUpdate | null,
  operationId: string,
): SheetRowAppendEffectInput | SheetFieldUpdateEffectInput {
  if (!context.row) {
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
  if (!authorized) throw new SheetWorkspaceResolutionError("approval_stale");
  return {
    kind: "field_update",
    field: "current_rent",
    rowNumber: context.row.rowNumber,
    rowKey: context.row.rowKey,
    anchorTenantName: context.row.anchorTenantName,
    expectedValue: context.row.currentRentValue,
    afterValue: authorized.authorization.proposedValue,
    source: authorized.authorization.sourceOfValue,
    authorization: authorized.authorization,
  };
}
