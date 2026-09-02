// Durable S98 operating-Sheet proposals: one active proposal per spreadsheet+tab, superseded by
// each save. Every execution confirmation binds the stored previewHash, so a superseded proposal's
// confirmations refuse instead of racing.

import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  SHEET_WRITEBACK_KEYS,
  SHEET_WRITEBACK_PROPOSAL_VERSION,
  type SheetWritebackProposal,
} from "@/lib/lease-renewal/sheet-writeback/proposal-contract";

export const SHEET_WRITEBACK_PROPOSALS_COLLECTION = "operating_sheet_proposals";

const IsoSchema = z.string().min(20).max(40);
const OpaqueIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{7,63}$/);

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
    spreadsheetId: z.string().min(1).max(120),
    tabTitle: z.string().min(1).max(120),
    headerHash: z.string().regex(/^[a-f0-9]{64}$/),
    headerWidth: z.number().int().min(1).max(60),
    tenantColumnIndex: z.number().int().min(0).max(59),
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

function proposalDocId(spreadsheetId: string, tabTitle: string): string {
  return `${spreadsheetId.slice(0, 24)}:${tabTitle.replaceAll("/", "_").slice(0, 40)}`;
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

/** Persist the single active proposal for its tab, superseding any prior one. */
export async function saveSheetWritebackProposal(
  actor: AuthenticatedUser,
  proposal: SheetWritebackProposal,
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
  await db
    .collection(SHEET_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(proposalDocId(parsed.spreadsheetId, parsed.tabTitle))
    .set({
      ...parsed,
      updated_at: new Date().toISOString(),
      updated_by_uid: actor.uid,
    });
}

/** Load and re-validate the active proposal for a tab; null when none is saved. */
export async function getSheetWritebackProposal(
  actor: AuthenticatedUser,
  spreadsheetId: string,
  tabTitle: string,
  db: Firestore = getAdminFirestore(),
): Promise<SheetWritebackProposal | null> {
  assertReader(actor);
  if (!spreadsheetId.trim() || !tabTitle.trim()) return null;
  const snapshot = await db
    .collection(SHEET_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(proposalDocId(spreadsheetId, tabTitle))
    .get();
  if (!snapshot.exists) return null;
  const raw = Object.fromEntries(
    Object.entries(snapshot.data() ?? {}).filter(
      ([key]) => key !== "updated_at" && key !== "updated_by_uid",
    ),
  );
  return StoredProposalSchema.parse(raw) as SheetWritebackProposal;
}

/** Remove the active proposal (app-plane only; provider receipts stay durable). */
export async function discardSheetWritebackProposal(
  actor: AuthenticatedUser,
  spreadsheetId: string,
  tabTitle: string,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  assertEditor(actor);
  if (!spreadsheetId.trim() || !tabTitle.trim()) {
    throw new EditableLayerError("A valid sheet target is required.", 400);
  }
  await db
    .collection(SHEET_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(proposalDocId(spreadsheetId, tabTitle))
    .delete();
}
