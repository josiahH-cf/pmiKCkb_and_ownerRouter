import type { Firestore } from "firebase-admin/firestore";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  bulkTransitionApprovalQueueItems,
  transitionApprovalQueueItem,
} from "@/lib/firestore/approval-queue";
import { getAdminFirestore } from "@/lib/firestore/admin";
import type {
  BulkApprovalQueueInput,
  TransitionApprovalQueueItemInput,
} from "@/lib/firestore/schemas";
import { syncProcessDefinitionQueueItemTransition } from "@/lib/firestore/workflows";

export async function transitionApprovalQueueItemWithWorkflowSync(
  actor: AuthenticatedUser,
  itemId: string,
  input: TransitionApprovalQueueItemInput,
  db: Firestore = getAdminFirestore(),
) {
  const item = await transitionApprovalQueueItem(actor, itemId, input, db);
  await syncProcessDefinitionQueueItemTransition(actor, item, db);
  return item;
}

export async function bulkTransitionApprovalQueueItemsWithWorkflowSync(
  actor: AuthenticatedUser,
  input: BulkApprovalQueueInput,
  db: Firestore = getAdminFirestore(),
) {
  const result = await bulkTransitionApprovalQueueItems(actor, input, db);

  for (const entry of result.results) {
    if (entry.outcome === "updated" && entry.item) {
      await syncProcessDefinitionQueueItemTransition(actor, entry.item, db);
    }
  }

  return result;
}
