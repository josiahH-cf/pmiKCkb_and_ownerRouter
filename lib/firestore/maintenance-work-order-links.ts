// S99 ticket <-> RentVine work-order link projection. One document per app ticket records the
// provider work-order identity, receipt reference, and durable attempt state. It is the
// spec-required read-only projection for S100/S90 AND the structural guard that at most one
// create attempt per ticket can be live: a pending, succeeded, or ambiguous link refuses a new
// create proposal, while a failed link frees one. Projection never changes the app ticket's
// lifecycle and grants no execution authority.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firestore/admin";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { EditableLayerError } from "@/lib/firestore/errors";

export const MAINTENANCE_WORK_ORDER_LINK_COLLECTION = "maintenance_work_order_links";

/**
 * S108: the last RentVine work-order state observed by a human-initiated read. It is a verbatim
 * projection of that read, never a target: the app never sets any of these values in RentVine.
 */
export const MaintenanceWorkOrderProviderSnapshotSchema = z
  .object({
    property_id: z.string().regex(/^[1-9][0-9]*$/),
    work_order_status_id: z.string().regex(/^[1-9][0-9]*$/),
    status_label: z.string().min(1).max(200),
    priority_id: z.string().regex(/^[1-9][0-9]*$/),
    is_owner_approved: z.enum(["0", "1"]),
    assigned_vendor_trade_id: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .nullable(),
    updated_at_iso: z.string().min(1).max(60).nullable(),
    read_at_iso: z.string().min(1).max(60),
  })
  .strict();

export type MaintenanceWorkOrderProviderSnapshot = z.infer<
  typeof MaintenanceWorkOrderProviderSnapshotSchema
>;

export const MaintenanceWorkOrderLinkSchema = z
  .object({
    ticket_ref: z.string().min(1).max(200),
    action_key: z.literal("rentvine.work_order.create"),
    execution_id: z.string().min(1).max(300),
    state: z.enum(["pending", "succeeded", "ambiguous", "failed"]),
    provider_work_order_id: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .optional(),
    provider_status_id: z
      .string()
      .regex(/^[1-9][0-9]*$/)
      .optional(),
    receipt_result_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    created_by_uid: z.string().min(1).max(200),
    attempt_seq: z.number().int().min(0),
    provider_snapshot: MaintenanceWorkOrderProviderSnapshotSchema.optional(),
  })
  .strict();

export type MaintenanceWorkOrderLink = z.infer<typeof MaintenanceWorkOrderLinkSchema>;

function requireEditor(actor: AuthenticatedUser): void {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError("Editing the work-order link requires edit.", 403);
  }
}

export async function getMaintenanceWorkOrderLink(
  actor: AuthenticatedUser,
  ticketRef: string,
  db: Firestore = getAdminFirestore(),
): Promise<MaintenanceWorkOrderLink | null> {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError("Reading the work-order link requires read.", 403);
  }
  const snapshot = await db
    .collection(MAINTENANCE_WORK_ORDER_LINK_COLLECTION)
    .doc(ticketRef)
    .get();
  if (!snapshot.exists) return null;
  const data = { ...snapshot.data() };
  delete data["created_at"];
  delete data["updated_at"];
  return MaintenanceWorkOrderLinkSchema.parse(data);
}

/** Create the pending link atomically; refuses when a live (non-failed) link already exists. */
export async function claimMaintenanceWorkOrderLink(
  actor: AuthenticatedUser,
  link: MaintenanceWorkOrderLink,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  requireEditor(actor);
  const parsed = MaintenanceWorkOrderLinkSchema.parse(link);
  const ref = db
    .collection(MAINTENANCE_WORK_ORDER_LINK_COLLECTION)
    .doc(parsed.ticket_ref);
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (current.exists) {
      const state = (current.data() as { state?: string }).state;
      if (state !== "failed") {
        throw new EditableLayerError(
          "This ticket already has a live RentVine create attempt; reconcile or finish it first.",
          409,
        );
      }
    }
    transaction.set(ref, {
      ...parsed,
      created_at: current.exists
        ? ((current.data() as Record<string, unknown>)["created_at"] ??
          FieldValue.serverTimestamp())
        : FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  });
}

/** Idempotent post-outcome projection; only the exact claimed execution may update its link. */
export async function projectMaintenanceWorkOrderOutcome(
  actor: AuthenticatedUser,
  input: {
    ticketRef: string;
    executionId: string;
    state: "succeeded" | "ambiguous" | "failed";
    providerWorkOrderId?: string;
    providerStatusId?: string;
    receiptResultHash?: string;
  },
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  requireEditor(actor);
  const ref = db.collection(MAINTENANCE_WORK_ORDER_LINK_COLLECTION).doc(input.ticketRef);
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) {
      throw new EditableLayerError("The work-order link claim is missing.", 409);
    }
    const data = current.data() as { execution_id?: string };
    if (data.execution_id !== input.executionId) {
      throw new EditableLayerError(
        "The work-order link belongs to a different execution.",
        409,
      );
    }
    transaction.update(ref, {
      state: input.state,
      ...(input.providerWorkOrderId
        ? { provider_work_order_id: input.providerWorkOrderId }
        : {}),
      ...(input.providerStatusId ? { provider_status_id: input.providerStatusId } : {}),
      ...(input.receiptResultHash
        ? { receipt_result_hash: input.receiptResultHash }
        : {}),
      updated_at: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * S108: record the provider snapshot observed by one human-initiated `rentvine.work_order.read`.
 *
 * It only ever updates an existing link, so a snapshot cannot appear without a create link and a
 * read that produced it, and it touches no other field: link state, execution identity, and the
 * receipt stay exactly as the S99 execution path left them. Reading is what authorizes this write,
 * so it requires the same read capability the S99 read route requires and no more.
 */
export async function recordMaintenanceWorkOrderSnapshot(
  actor: AuthenticatedUser,
  input: {
    ticketRef: string;
    providerWorkOrderId: string;
    snapshot: MaintenanceWorkOrderProviderSnapshot;
  },
  db: Firestore = getAdminFirestore(),
): Promise<"recorded" | "no_link" | "different_work_order"> {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError("Recording the work-order snapshot requires read.", 403);
  }
  const snapshot = MaintenanceWorkOrderProviderSnapshotSchema.parse(input.snapshot);
  const ref = db.collection(MAINTENANCE_WORK_ORDER_LINK_COLLECTION).doc(input.ticketRef);
  return db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) return "no_link" as const;
    const data = current.data() as { provider_work_order_id?: string };
    if (data.provider_work_order_id !== input.providerWorkOrderId) {
      return "different_work_order" as const;
    }
    transaction.update(ref, {
      provider_snapshot: snapshot,
      updated_at: FieldValue.serverTimestamp(),
    });
    return "recorded" as const;
  });
}
