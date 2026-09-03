// Durable S98 operating-Sheet proposals: one active proposal per canonical lease workspace (plus
// the isolated sealed-proof slot), never one global proposal for the entire spreadsheet/tab.
// Compare-and-set replacement and discard bind the stored previewHash so concurrent or
// cross-workspace generations refuse instead of superseding each other.

import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import {
  SHEET_WRITEBACK_KEYS,
  SHEET_WRITEBACK_PROPOSAL_VERSION,
  sheetWritebackExecutionId,
  type SheetWritebackProposal,
  type SheetWritebackProposalScope,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

export const SHEET_WRITEBACK_PROPOSALS_COLLECTION = "operating_sheet_proposals";
export const SHEET_APPEND_LIFECYCLES_COLLECTION = "operating_sheet_append_lifecycles";
export const SHEET_WRITEBACK_PROPOSAL_HISTORY_SUBCOLLECTION = "history";

export type SheetAppendLifecycleState =
  | "running"
  | "ambiguous"
  | "succeeded"
  | "failed"
  | "reversed";

const IsoSchema = z
  .string()
  .min(20)
  .max(40)
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid ISO timestamp");
const OpaqueIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{7,63}$/);
const DecimalIdSchema = z.string().regex(/^[1-9]\d*$/);
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);

const ScopeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("lease_workspace"),
      leaseId: DecimalIdSchema,
      propertyId: DecimalIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("sealed_proof"),
      leaseId: DecimalIdSchema,
      propertyId: DecimalIdSchema,
    })
    .strict(),
]);

const AuthorizationSchema = z
  .object({
    sourceTriggerKey: z.string().min(1).max(300),
    runId: z.string().min(1).max(120),
    fieldKey: z.string().min(1).max(60),
    proposedValue: z.string().max(500),
    sourceOfValue: z.string().min(1).max(500),
    candidateFingerprint: z.string().regex(/^rcf1_[a-f0-9]{64}$/),
    resolutionUpdatedAt: IsoSchema,
    authorizationToken: z.string().regex(/^rwat1_[a-f0-9]{64}$/),
    approvalId: z.string().min(1).max(300),
    approvalUpdatedAt: IsoSchema,
    approvalDecidedByUid: z.string().min(1).max(128),
  })
  .strict();

const FieldMapSchema = z.record(
  z.string(),
  z.object({ value: z.string(), source: z.string() }).strict(),
);

const EffectInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("row_append"),
      mode: z.enum(["normal", "proof"]),
      operationId: OpaqueIdSchema,
      leaseId: z.string().regex(/^[1-9]\d*$/),
      propertyId: z.string().regex(/^[1-9]\d*$/),
      tenantName: z.string().min(1),
      fields: FieldMapSchema,
      renewalDateHumanConfirmed: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("field_update"),
      field: z.string().min(1),
      rowNumber: z.number().int().min(2),
      rowKey: OpaqueIdSchema.nullable(),
      anchorTenantName: z.string(),
      expectedValue: z.string(),
      afterValue: z.string(),
      source: z.string().min(1),
      authorization: AuthorizationSchema.optional(),
    })
    .strict(),
]);

const ReversalSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("delete_appended_row"), operationId: OpaqueIdSchema })
    .strict(),
  z
    .object({
      kind: z.literal("restore_field"),
      field: z.string().min(1),
      rowNumber: z.number().int().min(2),
      rowKey: OpaqueIdSchema.nullable(),
      restoreValue: z.string(),
    })
    .strict(),
]);

const ValidatedEffectSchema = z
  .object({
    index: z.number().int().min(0),
    actionKey: z.enum(SHEET_WRITEBACK_KEYS),
    effect: EffectInputSchema,
    reversal: ReversalSchema,
    effectHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

const StoredProposalSchema = z
  .object({
    version: z.literal(SHEET_WRITEBACK_PROPOSAL_VERSION),
    generationId: OpaqueIdSchema,
    spreadsheetId: z.string().min(1).max(120),
    tabTitle: z.string().min(1).max(120),
    headerHash: z.string().regex(/^[a-f0-9]{64}$/),
    headerWidth: z.number().int().min(1).max(60),
    tenantColumnIndex: z.number().int().min(0).max(59),
    scope: ScopeSchema,
    actorUid: z.string().min(1).max(128),
    actorEmail: z.string().email(),
    actorRole: z.string().min(1).max(40),
    sourceReadAtIso: IsoSchema,
    evidenceRef: z.string().min(1).max(500),
    effects: z.array(ValidatedEffectSchema).min(1).max(10),
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    createdAtIso: IsoSchema,
    confirmationExpiresAtIso: IsoSchema,
  })
  .strict();

const StoredAppendLifecycleSchema = z
  .object({
    version: z.literal("operating-sheet-append-lifecycle/v1"),
    spreadsheet_id: z.string().min(1).max(120),
    tab_title: z.string().min(1).max(120),
    lease_id: DecimalIdSchema,
    property_id: DecimalIdSchema,
    proposal_preview_hash: HashSchema,
    effect_hash: HashSchema,
    execution_id: z.string().min(1).max(500),
    state: z.enum(["running", "ambiguous", "succeeded", "failed", "reversed"]),
    updated_at: IsoSchema,
  })
  .strict();

const StoredProposalArchiveSchema = z
  .object({
    version: z.literal("operating-sheet-proposal-archive/v1"),
    proposal: StoredProposalSchema,
    lifecycle: StoredAppendLifecycleSchema,
    archived_at: IsoSchema,
    archived_by_uid: z.string().min(1).max(128),
    archived_reason: z.enum(["replacement", "discard"]),
  })
  .strict();

export interface SheetWritebackProposalArchive {
  readonly proposal: SheetWritebackProposal;
  readonly executionId: string;
  readonly effectHash: string;
  readonly archivedAtIso: string;
  readonly archivedReason: "replacement" | "discard";
}

export type SheetWritebackStoreScope =
  | { readonly kind: "lease_workspace"; readonly leaseId: string }
  | { readonly kind: "sealed_proof" };

export function sheetWritebackProposalDocId(
  spreadsheetId: string,
  tabTitle: string,
  scope: SheetWritebackStoreScope,
): string {
  const scopeKey =
    scope.kind === "lease_workspace" ? `lease:${scope.leaseId}` : "sealed-proof";
  return createHash("sha256")
    .update(
      JSON.stringify({
        v: SHEET_WRITEBACK_PROPOSAL_VERSION,
        spreadsheet_id: spreadsheetId,
        tab_title: tabTitle,
        scope: scopeKey,
      }),
    )
    .digest("hex");
}

export function sheetAppendLifecycleDocId(
  spreadsheetId: string,
  tabTitle: string,
  leaseId: string,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        v: "operating-sheet-append-lifecycle/v1",
        spreadsheet_id: spreadsheetId,
        tab_title: tabTitle,
        lease_id: leaseId,
      }),
    )
    .digest("hex");
}

function scopeMatches(
  proposalScope: SheetWritebackProposalScope,
  storeScope: SheetWritebackStoreScope,
): boolean {
  return storeScope.kind === "lease_workspace"
    ? proposalScope.kind === "lease_workspace" &&
        proposalScope.leaseId === storeScope.leaseId
    : proposalScope.kind === "sealed_proof";
}

function proposalFromStoredData(data: Record<string, unknown>): SheetWritebackProposal {
  return StoredProposalSchema.parse(
    Object.fromEntries(
      Object.entries(data).filter(
        ([key]) => key !== "updated_at" && key !== "updated_by_uid",
      ),
    ),
  ) as SheetWritebackProposal;
}

function succeededArchiveTerms(input: {
  existing: Record<string, unknown> | undefined;
  lifecycle: Record<string, unknown> | undefined;
  execution: Record<string, unknown> | undefined;
  spreadsheetId: string;
  tabTitle: string;
  scope: SheetWritebackStoreScope;
}): {
  proposal: SheetWritebackProposal;
  lifecycle: z.infer<typeof StoredAppendLifecycleSchema>;
} | null {
  if (!input.lifecycle) return null;
  const lifecycle = StoredAppendLifecycleSchema.safeParse(input.lifecycle);
  if (!lifecycle.success) {
    throw new EditableLayerError(
      "This lease has malformed append recovery state and cannot be changed.",
      409,
    );
  }
  if (lifecycle.data.state === "failed" || lifecycle.data.state === "reversed") {
    return null;
  }
  if (!input.existing || input.scope.kind !== "lease_workspace") {
    throw new EditableLayerError(
      "This lease has incomplete append recovery state and cannot be changed.",
      409,
    );
  }
  let proposal: SheetWritebackProposal;
  try {
    proposal = proposalFromStoredData(input.existing);
  } catch {
    throw new EditableLayerError(
      "This lease has malformed append recovery state and cannot be changed.",
      409,
    );
  }
  const effect = proposal.effects.find(
    (entry) => entry.effectHash === lifecycle.data.effect_hash,
  );
  const receipt = input.execution?.receipt as Record<string, unknown> | undefined;
  const executionProvesSuccess =
    input.execution?.id === lifecycle.data.execution_id &&
    input.execution?.previewHash === proposal.previewHash &&
    input.execution?.contextHash === proposal.previewHash &&
    input.execution?.actionKey === "google_sheets.renewal_checklist.row_append" &&
    input.execution?.state === "succeeded" &&
    receipt !== undefined &&
    HashSchema.safeParse(receipt.resultHash).success;
  if (
    lifecycle.data.spreadsheet_id !== input.spreadsheetId ||
    lifecycle.data.tab_title !== input.tabTitle ||
    lifecycle.data.lease_id !== input.scope.leaseId ||
    lifecycle.data.property_id !== proposal.scope.propertyId ||
    lifecycle.data.proposal_preview_hash !== proposal.previewHash ||
    !scopeMatches(proposal.scope, input.scope) ||
    effect?.effect.kind !== "row_append" ||
    sheetWritebackExecutionId(proposal, effect) !== lifecycle.data.execution_id ||
    !executionProvesSuccess
  ) {
    throw new EditableLayerError(
      "This lease has mismatched append recovery state and cannot be changed.",
      409,
    );
  }
  return { proposal, lifecycle: lifecycle.data };
}

function lifecycleExecutionId(data: Record<string, unknown> | undefined): string | null {
  const lifecycle = StoredAppendLifecycleSchema.safeParse(data);
  return lifecycle.success &&
    ["running", "ambiguous", "succeeded"].includes(lifecycle.data.state)
    ? lifecycle.data.execution_id
    : null;
}

function assertExistingArchiveMatches(
  data: Record<string, unknown> | undefined,
  proposal: SheetWritebackProposal,
  lifecycle: z.infer<typeof StoredAppendLifecycleSchema>,
): void {
  if (!data) return;
  const parsed = StoredProposalArchiveSchema.safeParse(data);
  if (
    !parsed.success ||
    parsed.data.proposal.previewHash !== proposal.previewHash ||
    parsed.data.lifecycle.execution_id !== lifecycle.execution_id ||
    parsed.data.lifecycle.effect_hash !== lifecycle.effect_hash
  ) {
    throw new EditableLayerError(
      "This lease has conflicting immutable append history.",
      409,
    );
  }
}

function assertEditor(actor: AuthenticatedUser): void {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError(
      "Editor access is required to save a Sheet update proposal.",
      403,
    );
  }
}

function assertReader(actor: AuthenticatedUser): void {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "You do not have permission to read Sheet update proposals.",
      403,
    );
  }
}

/** Persist the active proposal for this exact workspace using compare-and-set replacement. */
export async function saveSheetWritebackProposal(
  actor: AuthenticatedUser,
  proposal: SheetWritebackProposal,
  scope: SheetWritebackStoreScope,
  expectedPriorPreviewHash: string | null | undefined,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  assertEditor(actor);
  if (proposal.actorUid !== actor.uid) {
    throw new EditableLayerError(
      "A proposal can be saved only by the actor who assembled it.",
      409,
    );
  }
  const parsed = StoredProposalSchema.parse(proposal);
  if (!scopeMatches(parsed.scope, scope)) {
    throw new EditableLayerError("The proposal belongs to a different workspace.", 409);
  }
  if (scope.kind === "lease_workspace" && expectedPriorPreviewHash === undefined) {
    throw new EditableLayerError("The proposal replacement generation is required.", 409);
  }
  if (
    expectedPriorPreviewHash !== undefined &&
    expectedPriorPreviewHash !== null &&
    !HashSchema.safeParse(expectedPriorPreviewHash).success
  ) {
    throw new EditableLayerError("The proposal replacement generation is invalid.", 409);
  }
  const ref = db
    .collection(SHEET_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(sheetWritebackProposalDocId(parsed.spreadsheetId, parsed.tabTitle, scope));
  const lifecycleRef =
    scope.kind === "lease_workspace"
      ? db
          .collection(SHEET_APPEND_LIFECYCLES_COLLECTION)
          .doc(
            sheetAppendLifecycleDocId(
              parsed.spreadsheetId,
              parsed.tabTitle,
              scope.leaseId,
            ),
          )
      : null;
  await db.runTransaction(async (transaction) => {
    const [existing, lifecycle] = await Promise.all([
      transaction.get(ref),
      lifecycleRef ? transaction.get(lifecycleRef) : Promise.resolve(null),
    ]);
    if (expectedPriorPreviewHash !== undefined) {
      const currentHash = existing.exists
        ? String(existing.get("previewHash") ?? "")
        : null;
      if (currentHash !== expectedPriorPreviewHash) {
        throw new EditableLayerError(
          "The active Sheet proposal changed. Reload this lease workspace before replacing it.",
          409,
        );
      }
    }
    const claimedExecutionId = lifecycleExecutionId(
      lifecycle?.exists ? lifecycle.data() : undefined,
    );
    const execution = claimedExecutionId
      ? await transaction.get(
          db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(claimedExecutionId),
        )
      : null;
    const archive = succeededArchiveTerms({
      existing: existing.exists ? existing.data() : undefined,
      lifecycle: lifecycle?.exists ? lifecycle.data() : undefined,
      execution: execution?.exists ? execution.data() : undefined,
      spreadsheetId: parsed.spreadsheetId,
      tabTitle: parsed.tabTitle,
      scope,
    });
    const archiveRef = archive
      ? ref
          .collection(SHEET_WRITEBACK_PROPOSAL_HISTORY_SUBCOLLECTION)
          .doc(archive.proposal.previewHash)
      : null;
    const archiveSnapshot = archiveRef ? await transaction.get(archiveRef) : null;
    if (archive) {
      assertExistingArchiveMatches(
        archiveSnapshot?.exists ? archiveSnapshot.data() : undefined,
        archive.proposal,
        archive.lifecycle,
      );
    }
    transaction.set(ref, {
      ...parsed,
      updated_at: new Date().toISOString(),
      updated_by_uid: actor.uid,
    });
    if (archive && archiveRef && !archiveSnapshot?.exists) {
      transaction.create(archiveRef, {
        version: "operating-sheet-proposal-archive/v1",
        proposal: archive.proposal,
        lifecycle: archive.lifecycle,
        archived_at: new Date().toISOString(),
        archived_by_uid: actor.uid,
        archived_reason: "replacement",
      });
    }
    if (lifecycle?.exists && lifecycleRef) transaction.delete(lifecycleRef);
  });
}

/** Load and re-validate the active proposal for a tab; null when none is saved. */
export async function getSheetWritebackProposal(
  actor: AuthenticatedUser,
  spreadsheetId: string,
  tabTitle: string,
  scope: SheetWritebackStoreScope,
  db: Firestore = getAdminFirestore(),
): Promise<SheetWritebackProposal | null> {
  assertReader(actor);
  if (!spreadsheetId.trim() || !tabTitle.trim()) return null;
  const snapshot = await db
    .collection(SHEET_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(sheetWritebackProposalDocId(spreadsheetId, tabTitle, scope))
    .get();
  if (!snapshot.exists) return null;
  const proposal = proposalFromStoredData(snapshot.data() ?? {});
  if (!scopeMatches(proposal.scope, scope)) {
    throw new EditableLayerError("The proposal belongs to a different workspace.", 409);
  }
  return proposal;
}

/** Load immutable succeeded-generation evidence after its active slot was replaced/discarded. */
export async function listSheetWritebackProposalHistory(
  actor: AuthenticatedUser,
  spreadsheetId: string,
  tabTitle: string,
  scope: Extract<SheetWritebackStoreScope, { kind: "lease_workspace" }>,
  db: Firestore = getAdminFirestore(),
): Promise<SheetWritebackProposalArchive[]> {
  assertReader(actor);
  if (!spreadsheetId.trim() || !tabTitle.trim()) return [];
  const snapshot = await db
    .collection(SHEET_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(sheetWritebackProposalDocId(spreadsheetId, tabTitle, scope))
    .collection(SHEET_WRITEBACK_PROPOSAL_HISTORY_SUBCOLLECTION)
    .orderBy("archived_at", "desc")
    .limit(20)
    .get();
  return snapshot.docs.map((document) => {
    const parsed = StoredProposalArchiveSchema.parse(document.data());
    if (!scopeMatches(parsed.proposal.scope, scope)) {
      throw new EditableLayerError(
        "Archived Sheet evidence belongs to a different workspace.",
        409,
      );
    }
    return {
      proposal: parsed.proposal as SheetWritebackProposal,
      executionId: parsed.lifecycle.execution_id,
      effectHash: parsed.lifecycle.effect_hash,
      archivedAtIso: parsed.archived_at,
      archivedReason: parsed.archived_reason,
    };
  });
}

/** Remove the active proposal (app-plane only; provider receipts stay durable). */
export async function discardSheetWritebackProposal(
  actor: AuthenticatedUser,
  spreadsheetId: string,
  tabTitle: string,
  scope: SheetWritebackStoreScope,
  expectedPreviewHash: string,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  assertEditor(actor);
  if (!spreadsheetId.trim() || !tabTitle.trim()) {
    throw new EditableLayerError("A valid sheet target is required.", 400);
  }
  if (!HashSchema.safeParse(expectedPreviewHash).success) {
    throw new EditableLayerError("The proposal generation is invalid.", 409);
  }
  const ref = db
    .collection(SHEET_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(sheetWritebackProposalDocId(spreadsheetId, tabTitle, scope));
  const lifecycleRef =
    scope.kind === "lease_workspace"
      ? db
          .collection(SHEET_APPEND_LIFECYCLES_COLLECTION)
          .doc(sheetAppendLifecycleDocId(spreadsheetId, tabTitle, scope.leaseId))
      : null;
  await db.runTransaction(async (transaction) => {
    const [snapshot, lifecycle] = await Promise.all([
      transaction.get(ref),
      lifecycleRef ? transaction.get(lifecycleRef) : Promise.resolve(null),
    ]);
    if (!snapshot.exists || snapshot.get("previewHash") !== expectedPreviewHash) {
      throw new EditableLayerError(
        "The active Sheet proposal changed. Reload before discarding it.",
        409,
      );
    }
    const rawScope = ScopeSchema.safeParse(snapshot.get("scope"));
    if (!rawScope.success || !scopeMatches(rawScope.data, scope)) {
      throw new EditableLayerError("The proposal belongs to a different workspace.", 409);
    }
    const claimedExecutionId = lifecycleExecutionId(
      lifecycle?.exists ? lifecycle.data() : undefined,
    );
    const execution = claimedExecutionId
      ? await transaction.get(
          db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(claimedExecutionId),
        )
      : null;
    const archive = succeededArchiveTerms({
      existing: snapshot.data(),
      lifecycle: lifecycle?.exists ? lifecycle.data() : undefined,
      execution: execution?.exists ? execution.data() : undefined,
      spreadsheetId,
      tabTitle,
      scope,
    });
    const archiveRef = archive
      ? ref
          .collection(SHEET_WRITEBACK_PROPOSAL_HISTORY_SUBCOLLECTION)
          .doc(archive.proposal.previewHash)
      : null;
    const archiveSnapshot = archiveRef ? await transaction.get(archiveRef) : null;
    if (archive) {
      assertExistingArchiveMatches(
        archiveSnapshot?.exists ? archiveSnapshot.data() : undefined,
        archive.proposal,
        archive.lifecycle,
      );
    }
    transaction.delete(ref);
    if (archive && archiveRef && !archiveSnapshot?.exists) {
      transaction.create(archiveRef, {
        version: "operating-sheet-proposal-archive/v1",
        proposal: archive.proposal,
        lifecycle: archive.lifecycle,
        archived_at: new Date().toISOString(),
        archived_by_uid: actor.uid,
        archived_reason: "discard",
      });
    }
    if (lifecycle?.exists && lifecycleRef) transaction.delete(lifecycleRef);
  });
}
