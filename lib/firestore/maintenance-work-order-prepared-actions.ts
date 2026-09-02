// S99 server-side snapshot of one prepared external work-order action. The S20 bridge binds
// execute/reconcile to the EXACT prepared action (execution id, values, refs); persisting the
// assembled action here lets a later request replay that identity verbatim instead of
// re-deriving values that fresh provider state could have changed. Bodyless beyond the reviewed
// preview values; browser code never reads or writes this collection.

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { getAdminFirestore } from "@/lib/firestore/admin";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { ExternalActionPreparationInput } from "@/lib/external-execution/s20-bridge";

export const WORK_ORDER_PREPARED_ACTION_COLLECTION =
  "maintenance_work_order_prepared_actions";

const PreparedActionSchema = z
  .object({
    execution_id: z.string().min(1).max(300),
    ticket_ref: z.string().min(1).max(200).nullable(),
    action: z
      .object({
        workflowId: z.string().min(1),
        actionId: z.string().min(1),
        actionKey: z.enum([
          "rentvine.work_order.create",
          "rentvine.work_order.update_status",
        ]),
        dataMode: z.literal("live"),
        values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
        sourceRefs: z.array(z.string().min(1)).min(1),
        contractRef: z.string().min(1),
        connectionRef: z.string().min(1),
        mappingRef: z.string().min(1),
      })
      .strict(),
    prepared_by_uid: z.string().min(1).max(200),
  })
  .strict();

export type PreparedWorkOrderAction = z.infer<typeof PreparedActionSchema>;

export async function savePreparedWorkOrderAction(
  actor: AuthenticatedUser,
  record: PreparedWorkOrderAction,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError("Preparing a work-order action requires edit.", 403);
  }
  const parsed = PreparedActionSchema.parse(record);
  await db
    .collection(WORK_ORDER_PREPARED_ACTION_COLLECTION)
    .doc(parsed.execution_id)
    .set({ ...parsed, updated_at: FieldValue.serverTimestamp() });
}

export async function loadPreparedWorkOrderAction(
  actor: AuthenticatedUser,
  executionId: string,
  db: Firestore = getAdminFirestore(),
): Promise<PreparedWorkOrderAction | null> {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "Reading a prepared work-order action requires read.",
      403,
    );
  }
  const snapshot = await db
    .collection(WORK_ORDER_PREPARED_ACTION_COLLECTION)
    .doc(executionId)
    .get();
  if (!snapshot.exists) return null;
  const data = { ...snapshot.data() };
  delete data["updated_at"];
  return PreparedActionSchema.parse(data);
}

/** Rehydrate the exact prepared action for the S20 bridge. */
export function preparedActionInput(
  record: PreparedWorkOrderAction,
): ExternalActionPreparationInput {
  return {
    workflowId: record.action.workflowId,
    actionId: record.action.actionId,
    actionKey: record.action.actionKey,
    dataMode: "live",
    values: { ...record.action.values },
    sourceRefs: [...record.action.sourceRefs],
    contractRef: record.action.contractRef,
    connectionRef: record.action.connectionRef,
    mappingRef: record.action.mappingRef,
  };
}
