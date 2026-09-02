// Auditable, app-plane disposition workflow for RentVine ↔ operating-Sheet discrepancies (I05).
// It records decisions only. This module has no provider import and exposes no correction executor.

import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { canonicalJson } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { DISCREPANCY_CATEGORIES } from "@/lib/lease-renewal/discrepancy";

export const DISCREPANCY_DISPOSITION_HEADS_COLLECTION =
  "renewal_discrepancy_disposition_heads";
export const DISCREPANCY_DISPOSITION_VERSIONS_COLLECTION =
  "renewal_discrepancy_disposition_versions";

export const DISCREPANCY_DISPOSITION_STATUSES = [
  "waiting_on_client",
  "proposed",
  "approved",
  "rejected",
  "completed",
] as const;
export type DiscrepancyDispositionStatus =
  (typeof DISCREPANCY_DISPOSITION_STATUSES)[number];

// The three exact S97 successor keys plus the Sheet writeback are the authoring vocabulary; the
// retired broad identifier stays last so historical disposition versions keep parsing and can
// still advance through their remaining statuses.
export const CORRECTION_TRANSACTION_KEYS = [
  "rentvine.lease.renewal_dates.update",
  "rentvine.lease.recurring_charge.update",
  "rentvine.lease.recurring_charge.create",
  "google_sheets.renewal_checklist.writeback",
  "rentvine.lease.renewal_writeback",
] as const;
export type CorrectionTransactionKey = (typeof CORRECTION_TRANSACTION_KEYS)[number];

const InputSchema = z
  .object({
    lease_id: z.string().trim().min(1).max(120),
    sheet_row_number: z.number().int().positive(),
    source_hash: z.string().regex(/^[a-f0-9]{64}$/),
    field: z.string().trim().min(1).max(100),
    category: z.enum(DISCREPANCY_CATEGORIES),
    authoritative_source: z.enum([
      "rentvine",
      "operating_sheet",
      "client_decision",
      "not_determined",
    ]),
    proposed_correction: z.string().trim().min(1).max(2_000),
    reason: z.string().trim().min(3).max(2_000),
    owner_uid: z.string().trim().min(1).max(128),
    status: z.enum(DISCREPANCY_DISPOSITION_STATUSES),
    evidence_refs: z.array(z.string().trim().min(1).max(500)).max(20),
    transaction_key: z.enum(CORRECTION_TRANSACTION_KEYS).optional(),
    current_rent_definition_ref: z.string().trim().min(1).max(500).optional(),
    effect_receipt_ref: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type RecordDiscrepancyDispositionInput = z.input<typeof InputSchema>;

export interface RenewalDiscrepancyDisposition {
  id: string;
  version: number;
  versionId: string;
  leaseId: string;
  sheetRowNumber: number;
  sourceHash: string;
  field: string;
  category: (typeof DISCREPANCY_CATEGORIES)[number];
  authoritativeSource:
    | "rentvine"
    | "operating_sheet"
    | "client_decision"
    | "not_determined";
  proposedCorrection: string;
  reason: string;
  ownerUid: string;
  status: DiscrepancyDispositionStatus;
  evidenceRefs: string[];
  transactionKey?: CorrectionTransactionKey;
  currentRentDefinitionRef?: string;
  effectReceiptRef?: string;
  recordHash: string;
  recordedAt: string;
  recordedByUid: string;
}

function assertEditor(actor: AuthenticatedUser): void {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError(
      "You do not have permission to disposition renewal discrepancies.",
      403,
    );
  }
}

function assertReader(actor: AuthenticatedUser): void {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "You do not have permission to read renewal discrepancy dispositions.",
      403,
    );
  }
}

export function discrepancyDispositionId(input: {
  leaseId: string;
  sheetRowNumber: number;
  field: string;
}): string {
  return createHash("sha256")
    .update(
      canonicalJson({
        lease_id: input.leaseId,
        sheet_row_number: input.sheetRowNumber,
        field: input.field,
      }),
    )
    .digest("hex");
}

export async function recordRenewalDiscrepancyDisposition(
  actor: AuthenticatedUser,
  input: RecordDiscrepancyDispositionInput,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<RenewalDiscrepancyDisposition> {
  assertEditor(actor);
  const parsed = InputSchema.parse(input);
  assertDispositionState(parsed);
  const id = discrepancyDispositionId({
    leaseId: parsed.lease_id,
    sheetRowNumber: parsed.sheet_row_number,
    field: parsed.field,
  });
  const headRef = db.collection(DISCREPANCY_DISPOSITION_HEADS_COLLECTION).doc(id);

  return db.runTransaction(async (transaction) => {
    const head = await transaction.get(headRef);
    const priorVersion = Number(head.data()?.version ?? 0);
    const version = priorVersion + 1;
    const versionId = `${id}:v${String(version).padStart(6, "0")}`;
    const body = {
      id,
      version,
      version_id: versionId,
      lease_id: parsed.lease_id,
      sheet_row_number: parsed.sheet_row_number,
      source_hash: parsed.source_hash,
      field: parsed.field,
      category: parsed.category,
      authoritative_source: parsed.authoritative_source,
      proposed_correction: parsed.proposed_correction,
      reason: parsed.reason,
      owner_uid: parsed.owner_uid,
      status: parsed.status,
      evidence_refs: parsed.evidence_refs,
      ...(parsed.transaction_key ? { transaction_key: parsed.transaction_key } : {}),
      ...(parsed.current_rent_definition_ref
        ? { current_rent_definition_ref: parsed.current_rent_definition_ref }
        : {}),
      ...(parsed.effect_receipt_ref
        ? { effect_receipt_ref: parsed.effect_receipt_ref }
        : {}),
      recorded_at: now,
      recorded_by_uid: actor.uid,
    };
    const recordHash = createHash("sha256").update(canonicalJson(body)).digest("hex");
    const stored = { ...body, record_hash: recordHash };
    transaction.create(
      db.collection(DISCREPANCY_DISPOSITION_VERSIONS_COLLECTION).doc(versionId),
      stored,
    );
    transaction.set(headRef, {
      id,
      version,
      current_version_id: versionId,
      lease_id: parsed.lease_id,
      sheet_row_number: parsed.sheet_row_number,
      field: parsed.field,
      status: parsed.status,
      record_hash: recordHash,
      updated_at: now,
      updated_by_uid: actor.uid,
    });
    return fromStored(stored);
  });
}

export async function listRenewalDiscrepancyDispositions(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalDiscrepancyDisposition[]> {
  assertReader(actor);
  const trimmed = leaseId.trim();
  if (!trimmed) return [];
  const snapshot = await db
    .collection(DISCREPANCY_DISPOSITION_VERSIONS_COLLECTION)
    .where("lease_id", "==", trimmed)
    .get();
  return snapshot.docs
    .map((doc) => fromStored(doc.data()))
    .sort(
      (left, right) =>
        left.recordedAt.localeCompare(right.recordedAt) ||
        left.versionId.localeCompare(right.versionId),
    );
}

export interface ApprovedCorrectionTransactionContract {
  dispositionId: string;
  dispositionVersion: number;
  dispositionHash: string;
  transactionKey: CorrectionTransactionKey;
  exactPriorValue: string;
  exactProposedValue: string;
  rollbackValue: string;
  confirmationHash: string;
}

/**
 * Final pure fence before any future provider-specific correction executor. This module still does
 * not execute; it only proves that an approved, exact, rollbackable source contract is present.
 */
export function assertApprovedCorrectionTransactionContract(
  disposition: RenewalDiscrepancyDisposition,
  contract: ApprovedCorrectionTransactionContract,
): void {
  if (
    disposition.status !== "approved" ||
    disposition.authoritativeSource === "not_determined" ||
    !disposition.transactionKey ||
    contract.dispositionId !== disposition.id ||
    contract.dispositionVersion !== disposition.version ||
    contract.dispositionHash !== disposition.recordHash ||
    contract.transactionKey !== disposition.transactionKey ||
    !contract.exactPriorValue ||
    !contract.exactProposedValue ||
    !contract.rollbackValue ||
    !/^[a-f0-9]{64}$/.test(contract.confirmationHash)
  ) {
    throw new EditableLayerError(
      "Correction execution requires the exact approved source transaction and rollback contract.",
      409,
    );
  }
}

function assertDispositionState(parsed: z.output<typeof InputSchema>): void {
  if (
    (parsed.status === "approved" || parsed.status === "completed") &&
    (parsed.authoritative_source === "not_determined" || !parsed.transaction_key)
  ) {
    throw new EditableLayerError(
      "Approval requires an authoritative source and source-specific transaction key.",
      409,
    );
  }
  if (
    parsed.field === "current_rent" &&
    (parsed.status === "approved" || parsed.status === "completed") &&
    !parsed.current_rent_definition_ref
  ) {
    throw new EditableLayerError(
      "Current-rent correction waits for the client-approved current-rent definition.",
      409,
    );
  }
  if (parsed.status === "completed" && !parsed.effect_receipt_ref) {
    throw new EditableLayerError(
      "A completed correction requires an exact provider effect receipt.",
      409,
    );
  }
}

function fromStored(raw: Record<string, unknown>): RenewalDiscrepancyDisposition {
  return {
    id: String(raw.id),
    version: Number(raw.version),
    versionId: String(raw.version_id),
    leaseId: String(raw.lease_id),
    sheetRowNumber: Number(raw.sheet_row_number),
    sourceHash: String(raw.source_hash),
    field: String(raw.field),
    category: z.enum(DISCREPANCY_CATEGORIES).parse(raw.category),
    authoritativeSource: z
      .enum(["rentvine", "operating_sheet", "client_decision", "not_determined"])
      .parse(raw.authoritative_source),
    proposedCorrection: String(raw.proposed_correction),
    reason: String(raw.reason),
    ownerUid: String(raw.owner_uid),
    status: z.enum(DISCREPANCY_DISPOSITION_STATUSES).parse(raw.status),
    evidenceRefs: Array.isArray(raw.evidence_refs)
      ? raw.evidence_refs.filter((value): value is string => typeof value === "string")
      : [],
    ...(typeof raw.transaction_key === "string"
      ? { transactionKey: z.enum(CORRECTION_TRANSACTION_KEYS).parse(raw.transaction_key) }
      : {}),
    ...(typeof raw.current_rent_definition_ref === "string"
      ? { currentRentDefinitionRef: raw.current_rent_definition_ref }
      : {}),
    ...(typeof raw.effect_receipt_ref === "string"
      ? { effectReceiptRef: raw.effect_receipt_ref }
      : {}),
    recordHash: String(raw.record_hash),
    recordedAt: String(raw.recorded_at),
    recordedByUid: String(raw.recorded_by_uid),
  };
}
