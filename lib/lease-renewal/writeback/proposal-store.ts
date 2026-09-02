// Durable per-lease S97 renewal-writeback proposals (ARCH-S97-1). One active proposal per lease:
// saving supersedes the prior one, and every execution confirmation is bound to the exact stored
// previewHash, so a superseded proposal's confirmations refuse instead of racing.

import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { EditableLayerError } from "@/lib/firestore/errors";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  RENEWAL_WRITEBACK_KEYS,
  RENEWAL_WRITEBACK_PROPOSAL_VERSION,
  type RenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-contract";

export const RENEWAL_WRITEBACK_PROPOSALS_COLLECTION = "renewal_writeback_proposals";

const IsoSchema = z.string().min(20).max(40);
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
    effectHash: z.string().regex(/^[a-f0-9]{64}$/),
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
    previewHash: z.string().regex(/^[a-f0-9]{64}$/),
    createdAtIso: IsoSchema,
    confirmationExpiresAtIso: IsoSchema,
  })
  .strict();

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

/** Persist the single active proposal for its lease, superseding any prior one. */
export async function saveRenewalWritebackProposal(
  actor: AuthenticatedUser,
  proposal: RenewalWritebackProposal,
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
    .collection(RENEWAL_WRITEBACK_PROPOSALS_COLLECTION)
    .doc(parsed.leaseId)
    .set({
      ...parsed,
      updated_at: new Date().toISOString(),
      updated_by_uid: actor.uid,
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
  const raw = Object.fromEntries(
    Object.entries(snapshot.data() ?? {}).filter(
      ([key]) => key !== "updated_at" && key !== "updated_by_uid",
    ),
  );
  return StoredProposalSchema.parse(raw) as RenewalWritebackProposal;
}

/** Remove the active proposal (app-plane only; provider receipts stay durable). */
export async function discardRenewalWritebackProposal(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  assertEditor(actor);
  const trimmed = leaseId.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new EditableLayerError("A valid lease id is required.", 400);
  }
  await db.collection(RENEWAL_WRITEBACK_PROPOSALS_COLLECTION).doc(trimmed).delete();
}
