// Durable per-lease S97 renewal-writeback proposals. The proposal preview hash is the immutable
// generation identity. Replacement and discard use compare-and-set and inspect every deterministic
// execution record in the same Firestore transaction, so a route that loaded an older generation
// can never claim it after a newer generation becomes active.

import type { Firestore, Transaction } from "firebase-admin/firestore";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { canonicalJson } from "@/lib/execution/preview-hash";
import type { ExternalExecutionRecord } from "@/lib/external-execution/types";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { EXTERNAL_EXECUTION_COLLECTIONS } from "@/lib/firestore/external-action-executions";
import {
  RECURRING_CHARGE_CREATE_BASELINE_VERSION,
  RENEWAL_WRITEBACK_KEYS,
  RENEWAL_WRITEBACK_PROPOSAL_VERSION,
  legacyRenewalWritebackExecutionId,
  renewalWritebackExecutionId,
  renewalWritebackReversalExecutionId,
  type RenewalWritebackProposal,
  type ValidatedRenewalWritebackEffect,
} from "@/lib/lease-renewal/writeback/proposal-contract";

export const RENEWAL_WRITEBACK_PROPOSALS_COLLECTION = "renewal_writeback_proposals";
export const RENEWAL_WRITEBACK_PROPOSAL_HISTORY_SUBCOLLECTION = "history";

const IsoSchema = z
  .string()
  .min(20)
  .max(40)
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid ISO timestamp");
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const LeaseDateStateSchema = z
  .object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    increaseEligibilityDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  })
  .strict();

const ChargeProjectionSchema = z
  .object({
    leaseRecurringChargeID: z.string(),
    leaseID: z.string(),
    accountID: z.string(),
    amount: z.string(),
    description: z.string(),
    dayDue: z.string(),
    frequency: z.string(),
    startDate: z.string(),
    isMoveInCharge: z.string(),
    isFromImport: z.string(),
    endDate: z.string().nullable(),
    nextChargeDate: z.string().nullable(),
    rentIncreaseID: z.string().nullable(),
    importSourceKey: z.string().nullable(),
    recurringStatusID: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();

const ChargeChangesSchema = z
  .object({
    accountID: z.string().optional(),
    amount: z.string().optional(),
    description: z.string().optional(),
    dayDue: z.string().optional(),
    frequency: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().nullable().optional(),
  })
  .strict();

const ChargeCreateBaselineSchema = z
  .object({
    version: z.literal(RECURRING_CHARGE_CREATE_BASELINE_VERSION),
    candidates: z.array(
      z
        .object({
          chargeId: z.string().regex(/^[1-9]\d*$/),
          projectionHash: HashSchema,
        })
        .strict(),
    ),
  })
  .strict();

const EffectInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("renewal_dates_update"),
      before: LeaseDateStateSchema,
      after: z
        .object({
          endDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable()
            .optional(),
          increaseEligibilityDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable()
            .optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("recurring_charge_update"),
      chargeId: z.string().regex(/^[1-9]\d*$/),
      before: ChargeProjectionSchema,
      changes: ChargeChangesSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("recurring_charge_create"),
      create: z
        .object({
          accountID: z.string(),
          amount: z.string(),
          description: z.string(),
          dayDue: z.string(),
          frequency: z.string(),
          startDate: z.string(),
          endDate: z.string().optional(),
        })
        .strict(),
      // Legacy stored proposals predate baseline capture. They remain readable for durable status
      // and contextHash-compatible receipts, but execution/reconciliation fails closed without it.
      baseline: ChargeCreateBaselineSchema.optional(),
    })
    .strict(),
]);

const ReversalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("restore_dates"), restore: LeaseDateStateSchema }).strict(),
  z
    .object({
      kind: z.literal("restore_charge_fields"),
      chargeId: z.string().regex(/^[1-9]\d*$/),
      restore: ChargeChangesSchema,
    })
    .strict(),
  z.object({ kind: z.literal("delete_created_charge") }).strict(),
  z.object({ kind: z.literal("none"), reason: z.string().min(1) }).strict(),
]);

const ValidatedEffectSchema = z
  .object({
    index: z.number().int().min(0),
    actionKey: z.enum(RENEWAL_WRITEBACK_KEYS),
    effect: EffectInputSchema,
    reversal: ReversalSchema,
    effectHash: HashSchema,
  })
  .strict();

const StoredProposalSchema = z
  .object({
    version: z.literal(RENEWAL_WRITEBACK_PROPOSAL_VERSION),
    leaseId: z.string().regex(/^[1-9]\d*$/),
    account: z.string().min(1),
    actorUid: z.string().min(1).max(128),
    actorEmail: z.string().email(),
    actorRole: z.string().min(1).max(40),
    leaseState: LeaseDateStateSchema,
    sourceReadAtIso: IsoSchema,
    evidenceRef: z.string().min(1).max(500),
    effects: z.array(ValidatedEffectSchema).min(1).max(20),
    previewHash: HashSchema,
    createdAtIso: IsoSchema,
    confirmationExpiresAtIso: IsoSchema,
  })
  .strict();

const SucceededEffectEvidenceSchema = z
  .object({
    effect_hash: HashSchema,
    execution_id: z.string().min(1).max(500),
    receipt_result_hash: HashSchema,
  })
  .strict();

const StoredProposalArchiveSchema = z
  .object({
    version: z.literal("renewal-writeback-proposal-archive/v1"),
    proposal: StoredProposalSchema,
    succeeded_effects: z.array(SucceededEffectEvidenceSchema).min(1).max(20),
    archived_at: IsoSchema,
    archived_by_uid: z.string().min(1).max(128),
    archived_reason: z.enum(["replacement", "discard"]),
  })
  .strict();

export interface RenewalWritebackProposalArchive {
  readonly proposal: RenewalWritebackProposal;
  readonly succeededEffects: readonly {
    readonly effectHash: string;
    readonly executionId: string;
    readonly receiptResultHash: string;
  }[];
  readonly archivedAtIso: string;
  readonly archivedReason: "replacement" | "discard";
}

function assertEditor(actor: AuthenticatedUser): void {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError(
      "Editor access is required to save a RentVine update proposal.",
      403,
    );
  }
}

function assertReader(actor: AuthenticatedUser): void {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "You do not have permission to read RentVine update proposals.",
      403,
    );
  }
}

function proposalFromStoredData(data: Record<string, unknown>): RenewalWritebackProposal {
  return StoredProposalSchema.parse(
    Object.fromEntries(
      Object.entries(data).filter(
        ([key]) => key !== "updated_at" && key !== "updated_by_uid",
      ),
    ),
  ) as RenewalWritebackProposal;
}

function assertExecutionBinding(
  record: ExternalExecutionRecord,
  proposal: RenewalWritebackProposal,
  effect: ValidatedRenewalWritebackEffect,
  executionId: string,
): void {
  if (
    record.id !== executionId ||
    record.dataMode !== "live" ||
    record.workflowId !== `s97:${proposal.leaseId}` ||
    record.actionId !== executionId ||
    record.actionKey !== effect.actionKey ||
    record.contextHash !== proposal.previewHash ||
    record.previewHash !== effect.effectHash ||
    record.idempotencyKey !== executionId
  ) {
    throw new EditableLayerError(
      "This lease has mismatched RentVine update recovery state and cannot be changed.",
      409,
    );
  }
}

async function currentGenerationState(
  transaction: Transaction,
  db: Firestore,
  proposal: RenewalWritebackProposal,
): Promise<{
  succeededEffects: {
    effect_hash: string;
    execution_id: string;
    receipt_result_hash: string;
  }[];
}> {
  const records: Array<{
    effect: ValidatedRenewalWritebackEffect;
    executionId: string;
    record: ExternalExecutionRecord;
  }> = [];
  for (const effect of proposal.effects) {
    const currentId = renewalWritebackExecutionId(proposal, effect);
    const legacyId = legacyRenewalWritebackExecutionId(proposal, effect);
    const currentRef = db
      .collection(EXTERNAL_EXECUTION_COLLECTIONS.records)
      .doc(currentId);
    const legacyRef = db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(legacyId);
    const [current, legacy] = await Promise.all([
      transaction.get(currentRef),
      currentId === legacyId ? Promise.resolve(null) : transaction.get(legacyRef),
    ]);
    let executionId: string | null = null;
    let record: ExternalExecutionRecord | null = null;
    if (current.exists) {
      executionId = currentId;
      record = current.data() as ExternalExecutionRecord;
      assertExecutionBinding(record, proposal, effect, executionId);
    } else if (legacy?.exists) {
      const candidate = legacy.data() as ExternalExecutionRecord;
      // One legacy id can collide across fresh generations. It belongs to this generation only
      // when its context hash is the exact proposal preview hash.
      if (candidate.contextHash === proposal.previewHash) {
        executionId = legacyId;
        record = candidate;
        assertExecutionBinding(record, proposal, effect, executionId);
      }
    }
    if (executionId && record) records.push({ effect, executionId, record });
  }

  for (const { record } of records) {
    if (record.state === "running" || record.state === "ambiguous") {
      throw new EditableLayerError(
        "This lease has a RentVine update awaiting a durable outcome. Reconcile it before replacing or discarding the proposal.",
        409,
      );
    }
  }

  const succeeded = records.filter(({ record }) => record.state === "succeeded");
  const reversals = await Promise.all(
    succeeded.map(async ({ record }) => {
      if (!record.receipt || !HashSchema.safeParse(record.receipt.resultHash).success) {
        throw new EditableLayerError(
          "This lease has incomplete RentVine update recovery state and cannot be changed.",
          409,
        );
      }
      const reversalId = renewalWritebackReversalExecutionId(
        record.id,
        record.receipt.resultHash,
      );
      const snapshot = await transaction.get(
        db.collection(EXTERNAL_EXECUTION_COLLECTIONS.records).doc(reversalId),
      );
      return snapshot.exists
        ? { id: reversalId, record: snapshot.data() as ExternalExecutionRecord }
        : null;
    }),
  );
  for (const reversal of reversals) {
    if (
      reversal &&
      (reversal.record.state === "running" || reversal.record.state === "ambiguous")
    ) {
      throw new EditableLayerError(
        "This lease has a RentVine reversal awaiting a durable outcome. Reconcile it before replacing or discarding the proposal.",
        409,
      );
    }
  }

  return {
    succeededEffects: succeeded.map(({ effect, executionId, record }) => ({
      effect_hash: effect.effectHash,
      execution_id: executionId,
      receipt_result_hash: record.receipt!.resultHash,
    })),
  };
}

function assertExistingArchiveMatches(
  data: Record<string, unknown> | undefined,
  proposal: RenewalWritebackProposal,
  succeededEffects: readonly {
    effect_hash: string;
    execution_id: string;
    receipt_result_hash: string;
  }[],
): void {
  if (!data) return;
  const parsed = StoredProposalArchiveSchema.safeParse(data);
  if (
    !parsed.success ||
    parsed.data.proposal.previewHash !== proposal.previewHash ||
    canonicalJson(parsed.data.succeeded_effects) !== canonicalJson(succeededEffects)
  ) {
    throw new EditableLayerError(
      "This lease has conflicting immutable RentVine update history.",
      409,
    );
  }
}

/** Persist the active proposal using compare-and-set against the generation the caller reviewed. */
export async function saveRenewalWritebackProposal(
  actor: AuthenticatedUser,
  proposal: RenewalWritebackProposal,
  expectedPriorPreviewHash?: string | null,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  assertEditor(actor);
  if (proposal.actorUid !== actor.uid) {
    throw new EditableLayerError(
      "A proposal can be saved only by the actor who assembled it.",
      409,
    );
  }
  if (expectedPriorPreviewHash === undefined) {
    throw new EditableLayerError("The proposal replacement generation is required.", 409);
  }
  if (
    expectedPriorPreviewHash !== null &&
    !HashSchema.safeParse(expectedPriorPreviewHash).success
  ) {
    throw new EditableLayerError("The proposal replacement generation is invalid.", 409);
  }
  const parsed = StoredProposalSchema.parse(proposal) as RenewalWritebackProposal;
  const ref = db.collection(RENEWAL_WRITEBACK_PROPOSALS_COLLECTION).doc(parsed.leaseId);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const currentHash = existing.exists
      ? String(existing.get("previewHash") ?? "")
      : null;
    if (currentHash !== expectedPriorPreviewHash) {
      throw new EditableLayerError(
        "The active RentVine proposal changed. Reload this lease workspace before replacing it.",
        409,
      );
    }
    let archive:
      | {
          proposal: RenewalWritebackProposal;
          succeededEffects: {
            effect_hash: string;
            execution_id: string;
            receipt_result_hash: string;
          }[];
        }
      | undefined;
    if (existing.exists) {
      const prior = proposalFromStoredData(existing.data() ?? {});
      const state = await currentGenerationState(transaction, db, prior);
      if (state.succeededEffects.length > 0) {
        archive = { proposal: prior, succeededEffects: state.succeededEffects };
      }
    }
    const archiveRef = archive
      ? ref
          .collection(RENEWAL_WRITEBACK_PROPOSAL_HISTORY_SUBCOLLECTION)
          .doc(archive.proposal.previewHash)
      : null;
    const archiveSnapshot = archiveRef ? await transaction.get(archiveRef) : null;
    if (archive) {
      assertExistingArchiveMatches(
        archiveSnapshot?.exists ? archiveSnapshot.data() : undefined,
        archive.proposal,
        archive.succeededEffects,
      );
    }
    const now = new Date().toISOString();
    transaction.set(ref, {
      ...parsed,
      updated_at: now,
      updated_by_uid: actor.uid,
    });
    if (archive && archiveRef && !archiveSnapshot?.exists) {
      transaction.create(archiveRef, {
        version: "renewal-writeback-proposal-archive/v1",
        proposal: archive.proposal,
        succeeded_effects: archive.succeededEffects,
        archived_at: now,
        archived_by_uid: actor.uid,
        archived_reason: "replacement",
      });
    }
  });
}

/** Load and re-validate the active proposal for a lease; null when none is saved. */
export async function getRenewalWritebackProposal(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalWritebackProposal | null> {
  assertReader(actor);
  const trimmed = leaseId.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return null;
  const snapshot = await db
    .collection(RENEWAL_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(trimmed)
    .get();
  if (!snapshot.exists) return null;
  return proposalFromStoredData(snapshot.data() ?? {});
}

/** Load one exact active or immutable archived generation for receipt recovery. */
export async function getRenewalWritebackProposalGeneration(
  actor: AuthenticatedUser,
  leaseId: string,
  previewHash: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalWritebackProposal | null> {
  assertReader(actor);
  const trimmed = leaseId.trim();
  if (!/^[1-9]\d*$/.test(trimmed) || !HashSchema.safeParse(previewHash).success) {
    return null;
  }
  const ref = db.collection(RENEWAL_WRITEBACK_PROPOSALS_COLLECTION).doc(trimmed);
  const active = await ref.get();
  if (active.exists && active.get("previewHash") === previewHash) {
    return proposalFromStoredData(active.data() ?? {});
  }
  const archived = await ref
    .collection(RENEWAL_WRITEBACK_PROPOSAL_HISTORY_SUBCOLLECTION)
    .doc(previewHash)
    .get();
  if (!archived.exists) return null;
  const parsed = StoredProposalArchiveSchema.parse(archived.data());
  if (parsed.proposal.leaseId !== trimmed) {
    throw new EditableLayerError(
      "Archived RentVine update history belongs to a different lease.",
      409,
    );
  }
  return parsed.proposal as RenewalWritebackProposal;
}

/** List immutable receipt-bearing proposal generations retained for recovery and audit. */
export async function listRenewalWritebackProposalHistory(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalWritebackProposalArchive[]> {
  assertReader(actor);
  const trimmed = leaseId.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return [];
  const snapshot = await db
    .collection(RENEWAL_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(trimmed)
    .collection(RENEWAL_WRITEBACK_PROPOSAL_HISTORY_SUBCOLLECTION)
    .orderBy("archived_at", "desc")
    .limit(20)
    .get();
  return snapshot.docs.map((document) => {
    const parsed = StoredProposalArchiveSchema.parse(document.data());
    if (parsed.proposal.leaseId !== trimmed) {
      throw new EditableLayerError(
        "Archived RentVine update history belongs to a different lease.",
        409,
      );
    }
    return {
      proposal: parsed.proposal as RenewalWritebackProposal,
      succeededEffects: parsed.succeeded_effects.map((entry) => ({
        effectHash: entry.effect_hash,
        executionId: entry.execution_id,
        receiptResultHash: entry.receipt_result_hash,
      })),
      archivedAtIso: parsed.archived_at,
      archivedReason: parsed.archived_reason,
    };
  });
}

/** Remove only the exact active generation after preserving any succeeded recovery evidence. */
export async function discardRenewalWritebackProposal(
  actor: AuthenticatedUser,
  leaseId: string,
  expectedPreviewHash?: string,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  assertEditor(actor);
  const trimmed = leaseId.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new EditableLayerError("A valid lease id is required.", 400);
  }
  if (!expectedPreviewHash || !HashSchema.safeParse(expectedPreviewHash).success) {
    throw new EditableLayerError("The proposal generation is invalid.", 409);
  }
  const ref = db.collection(RENEWAL_WRITEBACK_PROPOSALS_COLLECTION).doc(trimmed);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.get("previewHash") !== expectedPreviewHash) {
      throw new EditableLayerError(
        "The active RentVine proposal changed. Reload before discarding it.",
        409,
      );
    }
    const current = proposalFromStoredData(snapshot.data() ?? {});
    const state = await currentGenerationState(transaction, db, current);
    const archiveRef =
      state.succeededEffects.length > 0
        ? ref
            .collection(RENEWAL_WRITEBACK_PROPOSAL_HISTORY_SUBCOLLECTION)
            .doc(current.previewHash)
        : null;
    const archiveSnapshot = archiveRef ? await transaction.get(archiveRef) : null;
    if (archiveRef) {
      assertExistingArchiveMatches(
        archiveSnapshot?.exists ? archiveSnapshot.data() : undefined,
        current,
        state.succeededEffects,
      );
    }
    const now = new Date().toISOString();
    transaction.delete(ref);
    if (archiveRef && !archiveSnapshot?.exists) {
      transaction.create(archiveRef, {
        version: "renewal-writeback-proposal-archive/v1",
        proposal: current,
        succeeded_effects: state.succeededEffects,
        archived_at: now,
        archived_by_uid: actor.uid,
        archived_reason: "discard",
      });
    }
  });
}
