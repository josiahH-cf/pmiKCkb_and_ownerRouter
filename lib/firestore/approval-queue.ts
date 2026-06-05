import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { canViewApprovalQueueItem, isQueueItemTerminal } from "@/lib/approval/queue";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  BulkApprovalQueueInputSchema,
  type BulkApprovalQueueInput,
  CreateApprovalQueueItemInputSchema,
  type CreateApprovalQueueItemInput,
  type ParsedBulkApprovalQueueInput,
  type ParsedTransitionApprovalQueueItemInput,
  type QueueRiskSignals,
  TransitionApprovalQueueItemInputSchema,
  type TransitionApprovalQueueItemInput,
} from "@/lib/firestore/schemas";
import type {
  ApprovalQueueActivityRecord,
  ApprovalQueueItemRecord,
  QueueActivityAction,
  QueueAudienceGroup,
  QueueItemStatus,
  QueueItemType,
  QueueRiskLevel,
} from "@/lib/firestore/types";

const COLLECTIONS = {
  queueItems: "approval_queue_items",
  queueActivity: "approval_queue_activity",
} as const;

const BULK_EXECUTE_BLOCKED_MESSAGE =
  "Bulk execute is not available until approved executable external-action runtime exists. No external write was attempted.";
const BULK_UNAVAILABLE_ITEM_MESSAGE = "Queue item is not available for this bulk action.";

// Approval-critical fields snapshotted into Activity when an open item refreshes.
const APPROVAL_CRITICAL_FIELDS = [
  "status",
  "risk",
  "assignee_uid",
  "required_approver_uid",
  "due_date",
  "action_needed",
  "affected_system_action",
  "direct_link",
] as const satisfies readonly (keyof ApprovalQueueItemRecord)[];

type FirestoreValue = Record<string, unknown>;

export interface ListApprovalQueueOptions {
  filters?: {
    process_run_id?: string;
    required_approver_uid?: string;
    assignee_uid?: string;
    risk?: QueueRiskLevel;
    status?: QueueItemStatus;
    due_date?: string;
    audience_group?: QueueAudienceGroup;
  };
  // ISO date (YYYY-MM-DD) used to rank overdue items first. Injectable for tests.
  referenceDate?: string;
}

export type BulkApprovalQueueOutcome = "updated" | "skipped" | "failed";

export interface BulkApprovalQueueResultItem {
  item?: ApprovalQueueItemRecord;
  item_id: string;
  message: string;
  outcome: BulkApprovalQueueOutcome;
}

export interface BulkApprovalQueueResult {
  results: BulkApprovalQueueResultItem[];
  summary: {
    failed: number;
    requested: number;
    skipped: number;
    updated: number;
  };
}

export function classifyQueueRisk(
  signals: QueueRiskSignals | undefined,
  ownership: { hasAssignee: boolean; hasApprover: boolean },
): QueueRiskLevel {
  if (
    signals?.blocking_issue === true ||
    !ownership.hasAssignee ||
    !ownership.hasApprover
  ) {
    return "Blocked";
  }

  if (
    signals?.external_write === true ||
    signals?.owner_or_tenant_facing === true ||
    signals?.legal_financial_timing === true
  ) {
    return "High";
  }

  if (signals?.internal_workflow_update === true) {
    return "Medium";
  }

  return "Low";
}

export function defaultAudienceGroup(itemType: QueueItemType): QueueAudienceGroup {
  if (itemType === "AutomationFailure") {
    return "Failed/Blocked automation";
  }

  return "Dan/Admin decisions";
}

export async function createApprovalQueueItem(
  actor: AuthenticatedUser,
  input: CreateApprovalQueueItemInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsed = CreateApprovalQueueItemInputSchema.parse(input);
  const { note, risk_signals, ...rest } = parsed;

  const hasAssignee = Boolean(rest.assignee_uid);
  const hasApprover = Boolean(rest.required_approver_uid);
  const risk = classifyQueueRisk(risk_signals, { hasAssignee, hasApprover });
  // Missing assignee or approver routes to Blocked + Admin triage rather than guessing.
  const status: QueueItemStatus =
    !hasAssignee || !hasApprover ? "Blocked" : "Ready for Approval";
  const audienceGroup = rest.audience_group ?? defaultAudienceGroup(rest.item_type);

  const resultId = await db.runTransaction(async (transaction) => {
    const existing = await findBySourceTriggerKey(
      transaction,
      db,
      rest.source_trigger_key,
    );
    const openDuplicate = existing.find((item) => !isTerminal(item.status));

    // Same-trigger duplicate that is still open: merge into it (refresh + history),
    // never create a second task.
    if (openDuplicate) {
      const updates = stripUndefined({
        ...rest,
        risk,
        audience_group: audienceGroup,
      });
      refreshOpenItem(transaction, db, actor, openDuplicate, updates, note);
      return openDuplicate.id;
    }

    const id = uuidv7();
    const closedDuplicate = existing.find((item) => isTerminal(item.status));

    transaction.set(itemRef(db, id), {
      id,
      ...stripUndefined({
        ...rest,
        risk,
        status,
        audience_group: audienceGroup,
        supersedes_item_id: closedDuplicate?.id,
      }),
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });

    // Closed same-trigger item: link the new item to it instead of reopening.
    if (closedDuplicate) {
      transaction.update(itemRef(db, closedDuplicate.id), {
        superseded_by_item_id: id,
        updated_at: FieldValue.serverTimestamp(),
      });
    }

    appendActivity(transaction, db, {
      itemId: id,
      actor,
      action: "created",
      newState: status,
      sourceTrigger: rest.item_type,
      reason: note,
    });

    return id;
  });

  return getApprovalQueueItem(actor, resultId, db);
}

export async function getApprovalQueueItem(
  actor: AuthenticatedUser,
  itemId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = await itemRef(db, itemId).get();
  const item = readRequiredItem(snapshot.id, snapshot.data());
  assertCanViewItem(actor, item);
  return item;
}

export async function listApprovalQueue(
  actor: AuthenticatedUser,
  options: ListApprovalQueueOptions = {},
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = await db.collection(COLLECTIONS.queueItems).get();
  const filters = options.filters ?? {};
  const referenceDate = options.referenceDate ?? today();

  return snapshot.docs
    .map((doc) => readRecord<ApprovalQueueItemRecord>(doc.id, doc.data()))
    .filter((item) => canViewApprovalQueueItem(actor, item))
    .filter((item) => matchesFilters(item, filters))
    .sort((left, right) => compareQueueItems(left, right, referenceDate));
}

export async function listApprovalQueueActivity(
  actor: AuthenticatedUser,
  itemId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  await getApprovalQueueItem(actor, itemId, db);
  const snapshot = await db
    .collection(COLLECTIONS.queueActivity)
    .where("item_id", "==", itemId)
    .get();

  return snapshot.docs
    .map((doc) => readRecord<ApprovalQueueActivityRecord>(doc.id, doc.data()))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export async function transitionApprovalQueueItem(
  actor: AuthenticatedUser,
  itemId: string,
  input: TransitionApprovalQueueItemInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const parsed = TransitionApprovalQueueItemInputSchema.parse(input);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(itemRef(db, itemId));
    const current = readRequiredItem(snapshot.id, snapshot.data());
    assertCanViewItem(actor, current);

    if (isTerminal(current.status)) {
      throw new EditableLayerError("This queue item is already closed.", 409);
    }

    const { updates, action, reason, newState } = planTransition(actor, current, parsed);

    transaction.update(itemRef(db, itemId), {
      ...updates,
      updated_at: FieldValue.serverTimestamp(),
    });
    appendActivity(transaction, db, {
      itemId,
      actor,
      action,
      previousState: current.status,
      newState,
      reason,
      sourceTrigger: current.item_type,
    });
  });

  return getApprovalQueueItem(actor, itemId, db);
}

export async function bulkTransitionApprovalQueueItems(
  actor: AuthenticatedUser,
  input: BulkApprovalQueueInput,
  db = getAdminFirestore(),
): Promise<BulkApprovalQueueResult> {
  assertCan(actor, "read");
  const parsed = BulkApprovalQueueInputSchema.parse(input);
  assertBulkActionInput(parsed);

  const results: BulkApprovalQueueResultItem[] = [];

  for (const itemId of parsed.item_ids) {
    results.push(await bulkTransitionApprovalQueueItem(actor, itemId, parsed, db));
  }

  return {
    results,
    summary: {
      failed: results.filter((result) => result.outcome === "failed").length,
      requested: parsed.item_ids.length,
      skipped: results.filter((result) => result.outcome === "skipped").length,
      updated: results.filter((result) => result.outcome === "updated").length,
    },
  };
}

interface TransitionPlan {
  updates: Partial<ApprovalQueueItemRecord>;
  action: QueueActivityAction;
  newState: QueueItemStatus;
  reason?: string;
}

function planTransition(
  actor: AuthenticatedUser,
  current: ApprovalQueueItemRecord,
  input: ParsedTransitionApprovalQueueItemInput,
): TransitionPlan {
  switch (input.action) {
    case "approve": {
      assertCan(actor, "approve");
      if (current.status !== "Ready for Approval") {
        throw new EditableLayerError(
          "Only Ready for Approval queue items can be approved.",
          409,
        );
      }
      if (current.risk === "High" && input.confirm_high_risk !== true) {
        throw new EditableLayerError(
          "High-risk approval requires explicit confirmation.",
          400,
        );
      }
      assertCanApprove(actor, current);
      return {
        updates: { status: "Approved", closed_at: serverTimestamp() },
        action: "approved",
        newState: "Approved",
      };
    }
    case "return": {
      assertCan(actor, "edit");
      const reason = requireReason(input.reason, "Return for Revision");
      return {
        updates: { status: "Returned" },
        action: "returned",
        newState: "Returned",
        reason,
      };
    }
    case "assign": {
      if (!can(actor.role, "manageAdmin")) {
        throw new EditableLayerError(
          "Only Admins can assign or reassign queue items.",
          403,
        );
      }
      return planAssign(current, input);
    }
    case "snooze": {
      assertCan(actor, "edit");
      const reason = requireReason(input.reason, "Snooze");

      if (!input.snooze_until) {
        throw new EditableLayerError("Snooze requires a date.", 400);
      }

      return {
        updates: { status: "Snoozed", snooze_until: input.snooze_until },
        action: "snoozed",
        newState: "Snoozed",
        reason,
      };
    }
    case "disable": {
      // Disable Action is Admin-only and preserved in history.
      if (!can(actor.role, "manageAdmin")) {
        throw new EditableLayerError("Only Admins can disable a queue action.", 403);
      }

      const reason = requireReason(input.reason, "Disable Action");
      return {
        updates: { status: "Disabled", closed_at: serverTimestamp() },
        action: "disabled",
        newState: "Disabled",
        reason,
      };
    }
    case "close": {
      assertCan(actor, "approve");
      return {
        updates: { status: "Closed", closed_at: serverTimestamp() },
        action: "closed",
        newState: "Closed",
        reason: input.reason?.trim() || undefined,
      };
    }
    default: {
      throw new EditableLayerError("Unsupported queue transition.", 400);
    }
  }
}

function planAssign(
  current: ApprovalQueueItemRecord,
  input: ParsedTransitionApprovalQueueItemInput,
): TransitionPlan {
  const assigneeUid = input.assignee_uid?.trim() || current.assignee_uid;
  const approverUid =
    input.required_approver_uid?.trim() || current.required_approver_uid;

  if (!input.assignee_uid?.trim() && !input.required_approver_uid?.trim()) {
    throw new EditableLayerError(
      "Assign requires an assignee or required approver.",
      400,
    );
  }

  const updates: Partial<ApprovalQueueItemRecord> = stripUndefined({
    assignee_uid: assigneeUid,
    required_approver_uid: approverUid,
  });

  // Filling a previously missing assignee/approver unblocks the item.
  if (current.status === "Blocked" && assigneeUid && approverUid) {
    updates.status = "Ready for Approval";
    return {
      updates,
      action: "unblocked",
      newState: "Ready for Approval",
    };
  }

  return { updates, action: "assigned", newState: current.status };
}

async function bulkTransitionApprovalQueueItem(
  actor: AuthenticatedUser,
  itemId: string,
  input: ParsedBulkApprovalQueueInput,
  db: Firestore,
): Promise<BulkApprovalQueueResultItem> {
  try {
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(itemRef(db, itemId));
      const data = snapshot.data();

      if (!data) {
        return unavailableBulkResult(itemId);
      }

      const current = readRecord<ApprovalQueueItemRecord>(snapshot.id, data);

      if (!canViewApprovalQueueItem(actor, current)) {
        return unavailableBulkResult(itemId);
      }

      if (input.action === "execute") {
        return appendSkippedBulkResult(
          transaction,
          db,
          actor,
          current,
          BULK_EXECUTE_BLOCKED_MESSAGE,
        );
      }

      if (isTerminal(current.status)) {
        return appendSkippedBulkResult(
          transaction,
          db,
          actor,
          current,
          "This queue item is already closed.",
        );
      }

      try {
        const transition = planTransition(actor, current, transitionInputFromBulk(input));

        transaction.update(itemRef(db, itemId), {
          ...transition.updates,
          updated_at: FieldValue.serverTimestamp(),
        });
        appendActivity(transaction, db, {
          itemId,
          actor,
          action: transition.action,
          previousState: current.status,
          newState: transition.newState,
          reason: transition.reason,
          sourceTrigger: current.item_type,
        });

        return {
          item_id: current.id,
          message: bulkUpdatedMessage(transition.action),
          outcome: "updated" as const,
        };
      } catch (error) {
        if (error instanceof EditableLayerError) {
          return appendSkippedBulkResult(transaction, db, actor, current, error.message);
        }

        throw error;
      }
    });

    if (result.outcome !== "updated") {
      return result;
    }

    return {
      ...result,
      item: await getApprovalQueueItem(actor, result.item_id, db),
    };
  } catch {
    return {
      item_id: itemId,
      message: "Bulk action failed for this item.",
      outcome: "failed",
    };
  }
}

function assertBulkActionInput(input: ParsedBulkApprovalQueueInput) {
  switch (input.action) {
    case "return": {
      requireReason(input.reason, "Return for Revision");
      return;
    }
    case "disable": {
      requireReason(input.reason, "Disable Action");
      return;
    }
    case "snooze": {
      requireReason(input.reason, "Snooze");
      if (!input.snooze_until) {
        throw new EditableLayerError("Snooze requires a date.", 400);
      }
      return;
    }
    case "assign": {
      if (!input.assignee_uid?.trim() && !input.required_approver_uid?.trim()) {
        throw new EditableLayerError(
          "Assign requires an assignee or required approver.",
          400,
        );
      }
      return;
    }
    case "approve":
    case "execute": {
      return;
    }
  }
}

function transitionInputFromBulk(
  input: ParsedBulkApprovalQueueInput,
): ParsedTransitionApprovalQueueItemInput {
  if (input.action === "execute") {
    throw new EditableLayerError("Execute cannot use queue transition input.", 400);
  }

  return {
    action: input.action,
    assignee_uid: input.assignee_uid,
    confirm_high_risk: input.confirm_high_risk,
    reason: input.reason,
    required_approver_uid: input.required_approver_uid,
    snooze_until: input.snooze_until,
  };
}

function unavailableBulkResult(itemId: string): BulkApprovalQueueResultItem {
  return {
    item_id: itemId,
    message: BULK_UNAVAILABLE_ITEM_MESSAGE,
    outcome: "skipped",
  };
}

function appendSkippedBulkResult(
  transaction: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  current: ApprovalQueueItemRecord,
  reason: string,
): BulkApprovalQueueResultItem {
  appendActivity(transaction, db, {
    itemId: current.id,
    actor,
    action: "skipped",
    previousState: current.status,
    newState: current.status,
    reason,
    sourceTrigger: current.item_type,
  });

  return {
    item_id: current.id,
    message: reason,
    outcome: "skipped",
  };
}

function bulkUpdatedMessage(action: QueueActivityAction) {
  const messages: Partial<Record<QueueActivityAction, string>> = {
    approved: "Queue item approved.",
    assigned: "Queue item assigned.",
    disabled: "Queue action disabled.",
    returned: "Queue item returned for revision.",
    snoozed: "Queue item snoozed.",
    unblocked: "Queue item assigned and unblocked.",
  };

  return messages[action] ?? "Queue item updated.";
}

function assertCanApprove(actor: AuthenticatedUser, item: ApprovalQueueItemRecord) {
  if (can(actor.role, "manageAdmin")) {
    // Admins may act as the explicit approver for any item.
    return;
  }

  // A non-Admin cannot approve their own item (the assignee/proposer).
  if (item.assignee_uid && item.assignee_uid === actor.uid) {
    throw new EditableLayerError(
      "You cannot approve your own queue item. Route it to the required approver.",
      403,
    );
  }

  // Only the designated approver (or an Admin) may approve.
  if (item.required_approver_uid && item.required_approver_uid !== actor.uid) {
    throw new EditableLayerError(
      "Only the required approver or an Admin can approve this queue item.",
      403,
    );
  }
}

function refreshOpenItem(
  transaction: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  current: ApprovalQueueItemRecord,
  updates: Partial<ApprovalQueueItemRecord>,
  reason: string | undefined,
) {
  transaction.update(itemRef(db, current.id), {
    ...stripUndefined(updates),
    updated_at: FieldValue.serverTimestamp(),
  });
  appendActivity(transaction, db, {
    itemId: current.id,
    actor,
    action: "refreshed",
    previousState: current.status,
    newState: (updates.status as QueueItemStatus | undefined) ?? current.status,
    reason,
    sourceTrigger: current.item_type,
    priorVersionSnapshot: snapshotApprovalCriticalFields(current),
  });
}

interface ActivityInput {
  itemId: string;
  actor: Pick<AuthenticatedUser, "uid">;
  action: QueueActivityAction;
  previousState?: string;
  newState?: string;
  reason?: string;
  sourceTrigger: string;
  priorVersionSnapshot?: string;
}

function appendActivity(transaction: Transaction, db: Firestore, input: ActivityInput) {
  const id = uuidv7();
  const record: Omit<ApprovalQueueActivityRecord, "created_at"> & {
    created_at: FieldValue;
  } = {
    id,
    item_id: input.itemId,
    actor_uid: input.actor.uid,
    action: input.action,
    source_trigger: input.sourceTrigger,
    created_at: FieldValue.serverTimestamp(),
    ...stripUndefined({
      previous_state: input.previousState,
      new_state: input.newState,
      reason: input.reason,
      prior_version_snapshot: input.priorVersionSnapshot,
    }),
  };

  transaction.set(db.collection(COLLECTIONS.queueActivity).doc(id), record);
}

async function findBySourceTriggerKey(
  transaction: Transaction,
  db: Firestore,
  sourceTriggerKey: string,
) {
  const snapshot = await transaction.get(
    db
      .collection(COLLECTIONS.queueItems)
      .where("source_trigger_key", "==", sourceTriggerKey),
  );

  return snapshot.docs.map((doc) =>
    readRecord<ApprovalQueueItemRecord>(doc.id, doc.data()),
  );
}

function snapshotApprovalCriticalFields(item: ApprovalQueueItemRecord) {
  const snapshot: Record<string, unknown> = {};

  for (const field of APPROVAL_CRITICAL_FIELDS) {
    if (item[field] !== undefined) {
      snapshot[field] = item[field];
    }
  }

  return JSON.stringify(snapshot);
}

function matchesFilters(
  item: ApprovalQueueItemRecord,
  filters: NonNullable<ListApprovalQueueOptions["filters"]>,
) {
  if (filters.process_run_id && item.process_run_ref.id !== filters.process_run_id) {
    return false;
  }
  if (
    filters.required_approver_uid &&
    item.required_approver_uid !== filters.required_approver_uid
  ) {
    return false;
  }
  if (filters.assignee_uid && item.assignee_uid !== filters.assignee_uid) {
    return false;
  }
  if (filters.risk && item.risk !== filters.risk) {
    return false;
  }
  if (filters.status && item.status !== filters.status) {
    return false;
  }
  if (filters.due_date && item.due_date !== filters.due_date) {
    return false;
  }
  if (filters.audience_group && item.audience_group !== filters.audience_group) {
    return false;
  }

  return true;
}

// Default view: Ready for Approval, Blocked, Failed, then overdue first, then by due date.
function compareQueueItems(
  left: ApprovalQueueItemRecord,
  right: ApprovalQueueItemRecord,
  referenceDate: string,
) {
  const rankDelta = statusRank(left.status) - statusRank(right.status);

  if (rankDelta !== 0) {
    return rankDelta;
  }

  const overdueDelta =
    Number(isOverdue(right, referenceDate)) - Number(isOverdue(left, referenceDate));

  if (overdueDelta !== 0) {
    return overdueDelta;
  }

  return (left.due_date ?? "9999-12-31").localeCompare(right.due_date ?? "9999-12-31");
}

function statusRank(status: QueueItemStatus) {
  const order: Record<QueueItemStatus, number> = {
    "Ready for Approval": 0,
    Blocked: 1,
    Failed: 2,
    Returned: 3,
    Snoozed: 4,
    Approved: 5,
    Completed: 5,
    Cancelled: 6,
    Disabled: 6,
    Closed: 6,
  };

  return order[status];
}

function isOverdue(item: ApprovalQueueItemRecord, referenceDate: string) {
  return Boolean(item.due_date) && item.due_date! < referenceDate;
}

function requireReason(reason: string | undefined, action: string) {
  const trimmed = reason?.trim();

  if (!trimmed) {
    throw new EditableLayerError(`${action} requires a plain-English reason.`, 400);
  }

  return trimmed;
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested approval-queue action.",
      403,
    );
  }
}

function isTerminal(status: QueueItemStatus) {
  return isQueueItemTerminal(status);
}

function assertCanViewItem(actor: AuthenticatedUser, item: ApprovalQueueItemRecord) {
  if (!canViewApprovalQueueItem(actor, item)) {
    throw new EditableLayerError(
      "Only the assignee, required approver, or an Admin can view this queue item.",
      403,
    );
  }
}

function itemRef(db: Firestore, id: string) {
  return db.collection(COLLECTIONS.queueItems).doc(id);
}

function serverTimestamp() {
  return FieldValue.serverTimestamp() as unknown as string;
}

function readRequiredItem(id: string, data: FirestoreValue | undefined) {
  if (!data) {
    throw new EditableLayerError("Queue item was not found.", 404);
  }

  return readRecord<ApprovalQueueItemRecord>(id, data);
}

function readRecord<T>(id: string, data: FirestoreValue) {
  return normalizeFirestoreValue({ id, ...data }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;

    if (typeof toDate === "function") {
      return toDate.call(value).toISOString();
    }
  }

  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        key,
        normalizeFirestoreValue(childValue),
      ]),
    );
  }

  return value;
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
