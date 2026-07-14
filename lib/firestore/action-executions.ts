import { createHash } from "node:crypto";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { decideExecutionAuthority } from "@/lib/execution/authority";
import type {
  ActionExecutionActivityAction,
  ActionExecutionActivityRecord,
  ActionExecutionRecord,
  ActionExecutionState,
  ExecutionClassification,
} from "@/lib/execution/types";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

const COLLECTIONS = {
  activity: "action_execution_activity",
  executions: "action_executions",
} as const;

export interface PrepareActionExecutionRecordInput {
  classification: ExecutionClassification & {
    kind: NonNullable<ExecutionClassification["kind"]>;
    risk: Exclude<ExecutionClassification["risk"], "Blocked">;
  };
  idempotencyKey: string;
  previewHash: string;
  scopeRef?: string;
}

export interface ApproveActionExecutionInput {
  previewHash: string;
  reason: string;
}

export interface CompleteActionExecutionInput {
  correctionReference?: string;
  resultCode: string;
}

export async function prepareActionExecutionRecord(
  actor: AuthenticatedUser,
  input: PrepareActionExecutionRecordInput,
  db: Firestore = getAdminFirestore(),
) {
  const idempotencyKey = requireText(input.idempotencyKey, "Idempotency key");
  const previewHash = requireHash(input.previewHash, "Preview hash");
  const idempotencyHash = digest(
    `${actor.uid}\u0000${input.classification.actionKey}\u0000${idempotencyKey}`,
  );
  const id = `exec_${idempotencyHash.slice(0, 40)}`;

  await db.runTransaction(async (transaction) => {
    const ref = executionRef(db, id);
    const snapshot = await transaction.get(ref);
    const existing = snapshot.data();

    if (existing) {
      const record = readRecord<ActionExecutionRecord>(snapshot.id, existing);
      assertIdempotentMatch(record, actor, input.classification.actionKey, previewHash);
      return;
    }

    const state: ActionExecutionState =
      input.classification.risk === "High" ? "Awaiting Admin" : "Ready";
    const record = stripUndefined({
      id,
      action_key: input.classification.actionKey,
      action_kind: input.classification.kind,
      actor_role: actor.role,
      actor_uid: actor.uid,
      attempt_count: 0,
      idempotency_hash: idempotencyHash,
      preview_hash: previewHash,
      requires_action_registry: input.classification.requiresActionRegistry,
      risk: input.classification.risk,
      scope_ref: input.scopeRef,
      state,
    }) as Omit<ActionExecutionRecord, "created_at" | "updated_at">;

    transaction.set(ref, {
      ...record,
      created_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
    appendActivity(transaction, db, {
      action: "prepared",
      actionKey: record.action_key,
      actorUid: actor.uid,
      executionId: id,
      toState: state,
    });
  });

  return getActionExecution(actor, id, db);
}

export async function getActionExecution(
  actor: AuthenticatedUser,
  executionId: string,
  db: Firestore = getAdminFirestore(),
) {
  const snapshot = await executionRef(db, executionId).get();
  const record = readRequiredExecution(snapshot.id, snapshot.data());
  assertCanView(actor, record);
  return record;
}

export async function listActionExecutionActivity(
  actor: AuthenticatedUser,
  executionId: string,
  db: Firestore = getAdminFirestore(),
) {
  await getActionExecution(actor, executionId, db);
  const snapshot = await db
    .collection(COLLECTIONS.activity)
    .where("execution_id", "==", executionId)
    .get();

  return snapshot.docs
    .map((doc) => readRecord<ActionExecutionActivityRecord>(doc.id, doc.data()))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export async function approveActionExecution(
  actor: AuthenticatedUser,
  executionId: string,
  input: ApproveActionExecutionInput,
  db: Firestore = getAdminFirestore(),
) {
  if (actor.role !== "Admin") {
    throw new EditableLayerError(
      "Only an Admin can approve a consequential execution.",
      403,
    );
  }

  const previewHash = requireHash(input.previewHash, "Preview hash");
  const reason = requireText(input.reason, "High-risk approval reason");

  await db.runTransaction((transaction) =>
    approveActionExecutionInTransaction(transaction, db, actor, executionId, {
      previewHash,
      reason,
    }),
  );

  return getActionExecution(actor, executionId, db);
}

/** Atomic seam used by Approval Queue so queue approval and execution approval cannot drift. */
export async function approveActionExecutionInTransaction(
  transaction: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  executionId: string,
  input: ApproveActionExecutionInput,
) {
  if (actor.role !== "Admin") {
    throw new EditableLayerError(
      "Only an Admin can approve a consequential execution.",
      403,
    );
  }
  const previewHash = requireHash(input.previewHash, "Preview hash");
  const reason = requireText(input.reason, "High-risk approval reason");
  const ref = executionRef(db, executionId);
  const snapshot = await transaction.get(ref);
  const current = readRequiredExecution(snapshot.id, snapshot.data());

  if (current.risk !== "High" || current.state !== "Awaiting Admin") {
    throw new EditableLayerError(
      "Only an awaiting High-risk execution can be approved.",
      409,
    );
  }
  if (current.preview_hash !== previewHash) {
    throw new EditableLayerError(
      "The approval preview is stale; review the current preview before approving.",
      409,
    );
  }

  const approval = {
    approvedByRole: actor.role,
    approvedByUid: actor.uid,
    previewHash,
    reason,
  } as const;
  const decision = decideExecutionAuthority({
    actor,
    approval,
    classification: classificationFromRecord(current),
    previewHash,
  });

  if (!decision.canExecute) {
    throw new EditableLayerError(decision.reason, 409);
  }

  transaction.update(ref, {
    approval,
    state: "Approved",
    updated_at: FieldValue.serverTimestamp(),
  });
  appendActivity(transaction, db, {
    action: "approved",
    actionKey: current.action_key,
    actorUid: actor.uid,
    executionId,
    fromState: current.state,
    reason,
    toState: "Approved",
  });
}

export async function returnActionExecution(
  actor: AuthenticatedUser,
  executionId: string,
  reasonInput: string,
  db: Firestore = getAdminFirestore(),
) {
  if (actor.role !== "Admin") {
    throw new EditableLayerError("Only an Admin can return an execution.", 403);
  }
  const reason = requireText(reasonInput, "Return reason");
  await transitionAwaitingExecution(
    actor,
    executionId,
    "Returned",
    "returned",
    reason,
    db,
  );
  return getActionExecution(actor, executionId, db);
}

export async function revokeActionExecution(
  actor: AuthenticatedUser,
  executionId: string,
  reasonInput: string,
  db: Firestore = getAdminFirestore(),
) {
  if (actor.role !== "Admin") {
    throw new EditableLayerError("Only an Admin can revoke an execution.", 403);
  }
  const reason = requireText(reasonInput, "Revocation reason");
  await transitionAwaitingExecution(actor, executionId, "Revoked", "revoked", reason, db);
  return getActionExecution(actor, executionId, db);
}

export async function claimActionExecution(
  actor: AuthenticatedUser,
  executionId: string,
  previewHashInput: string,
  db: Firestore = getAdminFirestore(),
) {
  const previewHash = requireHash(previewHashInput, "Preview hash");

  await db.runTransaction(async (transaction) => {
    const ref = executionRef(db, executionId);
    const snapshot = await transaction.get(ref);
    const current = readRequiredExecution(snapshot.id, snapshot.data());
    assertCanExecute(actor, current);

    if (current.preview_hash !== previewHash) {
      throw new EditableLayerError(
        "The execution preview changed after preparation; prepare a new execution.",
        409,
      );
    }
    if (current.attempt_count !== 0) {
      throw new EditableLayerError(
        "This execution already has an attempt and cannot be retried automatically.",
        409,
      );
    }

    const decision = decideExecutionAuthority({
      actor,
      approval: current.approval,
      classification: classificationFromRecord(current),
      previewHash,
    });
    if (!decision.canExecute) {
      throw new EditableLayerError(decision.reason, 409);
    }

    transaction.update(ref, {
      attempt_count: 1,
      state: "Executing",
      updated_at: FieldValue.serverTimestamp(),
    });
    appendActivity(transaction, db, {
      action: "claimed",
      actionKey: current.action_key,
      actorUid: actor.uid,
      executionId,
      fromState: current.state,
      toState: "Executing",
    });
  });

  return getActionExecution(actor, executionId, db);
}

export async function completeActionExecution(
  actor: AuthenticatedUser,
  executionId: string,
  input: CompleteActionExecutionInput,
  db: Firestore = getAdminFirestore(),
) {
  const resultCode = requireText(input.resultCode, "Execution result code");
  await finishExecution(
    actor,
    executionId,
    "Succeeded",
    "succeeded",
    resultCode,
    input.correctionReference,
    db,
  );
  return getActionExecution(actor, executionId, db);
}

export async function failActionExecution(
  actor: AuthenticatedUser,
  executionId: string,
  errorCodeInput: string,
  needsReconciliation: boolean,
  db: Firestore = getAdminFirestore(),
) {
  const errorCode = requireText(errorCodeInput, "Execution error code");
  const state: ActionExecutionState = needsReconciliation
    ? "Needs reconciliation"
    : "Failed";
  await finishExecution(
    actor,
    executionId,
    state,
    needsReconciliation ? "reconciliation_required" : "failed",
    errorCode,
    undefined,
    db,
  );
  return getActionExecution(actor, executionId, db);
}

function classificationFromRecord(
  record: ActionExecutionRecord,
): ExecutionClassification {
  return {
    actionKey: record.action_key,
    blockers: [],
    defaultRisk: record.risk,
    kind: record.action_kind,
    requiresActionRegistry: record.requires_action_registry,
    risk: record.risk,
  };
}

async function transitionAwaitingExecution(
  actor: AuthenticatedUser,
  executionId: string,
  toState: "Returned" | "Revoked",
  action: "returned" | "revoked",
  reason: string,
  db: Firestore,
) {
  await db.runTransaction((transaction) =>
    transitionActionExecutionInTransaction(
      transaction,
      db,
      actor,
      executionId,
      toState,
      action,
      reason,
    ),
  );
}

export async function returnActionExecutionInTransaction(
  transaction: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  executionId: string,
  reasonInput: string,
) {
  if (actor.role !== "Admin") {
    throw new EditableLayerError("Only an Admin can return an execution.", 403);
  }
  return transitionActionExecutionInTransaction(
    transaction,
    db,
    actor,
    executionId,
    "Returned",
    "returned",
    requireText(reasonInput, "Return reason"),
  );
}

export async function revokeActionExecutionInTransaction(
  transaction: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  executionId: string,
  reasonInput: string,
) {
  if (actor.role !== "Admin") {
    throw new EditableLayerError("Only an Admin can revoke an execution.", 403);
  }
  return transitionActionExecutionInTransaction(
    transaction,
    db,
    actor,
    executionId,
    "Revoked",
    "revoked",
    requireText(reasonInput, "Revocation reason"),
  );
}

async function transitionActionExecutionInTransaction(
  transaction: Transaction,
  db: Firestore,
  actor: AuthenticatedUser,
  executionId: string,
  toState: "Returned" | "Revoked",
  action: "returned" | "revoked",
  reason: string,
) {
  const ref = executionRef(db, executionId);
  const snapshot = await transaction.get(ref);
  const current = readRequiredExecution(snapshot.id, snapshot.data());
  if (current.state !== "Awaiting Admin" && current.state !== "Approved") {
    throw new EditableLayerError(
      "Only an awaiting or approved execution can be returned or revoked.",
      409,
    );
  }
  transaction.update(ref, {
    state: toState,
    updated_at: FieldValue.serverTimestamp(),
  });
  appendActivity(transaction, db, {
    action,
    actionKey: current.action_key,
    actorUid: actor.uid,
    executionId,
    fromState: current.state,
    reason,
    toState,
  });
}

async function finishExecution(
  actor: AuthenticatedUser,
  executionId: string,
  toState: "Succeeded" | "Failed" | "Needs reconciliation",
  action: "succeeded" | "failed" | "reconciliation_required",
  code: string,
  correctionReference: string | undefined,
  db: Firestore,
) {
  await db.runTransaction(async (transaction) => {
    const ref = executionRef(db, executionId);
    const snapshot = await transaction.get(ref);
    const current = readRequiredExecution(snapshot.id, snapshot.data());
    assertCanExecute(actor, current);
    if (current.state !== "Executing" || current.attempt_count !== 1) {
      throw new EditableLayerError(
        "Only the claimed one-attempt execution can be completed.",
        409,
      );
    }

    transaction.update(
      ref,
      stripUndefined({
        correction_reference: correctionReference,
        last_error_code: toState === "Succeeded" ? undefined : code,
        result_code: toState === "Succeeded" ? code : undefined,
        state: toState,
        updated_at: FieldValue.serverTimestamp(),
      }),
    );
    appendActivity(transaction, db, {
      action,
      actionKey: current.action_key,
      actorUid: actor.uid,
      executionId,
      fromState: current.state,
      toState,
    });
  });
}

function appendActivity(
  transaction: Transaction,
  db: Firestore,
  input: {
    action: ActionExecutionActivityAction;
    actionKey: string;
    actorUid: string;
    executionId: string;
    fromState?: ActionExecutionState;
    reason?: string;
    toState: ActionExecutionState;
  },
) {
  const id = uuidv7();
  transaction.set(
    db.collection(COLLECTIONS.activity).doc(id),
    stripUndefined({
      id,
      action: input.action,
      action_key: input.actionKey,
      actor_uid: input.actorUid,
      created_at: FieldValue.serverTimestamp(),
      execution_id: input.executionId,
      from_state: input.fromState,
      reason: input.reason,
      to_state: input.toState,
    }),
  );
}

function assertIdempotentMatch(
  record: ActionExecutionRecord,
  actor: AuthenticatedUser,
  actionKey: string,
  previewHash: string,
) {
  if (
    record.actor_uid !== actor.uid ||
    record.action_key !== actionKey ||
    record.preview_hash !== previewHash
  ) {
    throw new EditableLayerError(
      "The idempotency key was already used for a different execution preview.",
      409,
    );
  }
}

function assertCanView(actor: AuthenticatedUser, record: ActionExecutionRecord) {
  if (actor.role !== "Admin" && record.actor_uid !== actor.uid) {
    throw new EditableLayerError("This execution is not available to this user.", 404);
  }
}

function assertCanExecute(actor: AuthenticatedUser, record: ActionExecutionRecord) {
  if (actor.role !== "Admin" && record.actor_uid !== actor.uid) {
    throw new EditableLayerError("This user cannot execute this action instance.", 403);
  }
}

function executionRef(db: Firestore, id: string) {
  return db.collection(COLLECTIONS.executions).doc(id);
}

function readRequiredExecution(id: string, data: Record<string, unknown> | undefined) {
  if (!data) {
    throw new EditableLayerError("Action execution was not found.", 404);
  }
  return readRecord<ActionExecutionRecord>(id, data);
}

function readRecord<T>(id: string, data: Record<string, unknown>) {
  return normalizeFirestoreValue({ id, ...data }) as T;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return toDate.call(value).toISOString();
    }
  }
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function requireText(value: string, label: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new EditableLayerError(`${label} is required.`, 400);
  if (trimmed.length > 500) {
    throw new EditableLayerError(`${label} must be 500 characters or fewer.`, 400);
  }
  return trimmed;
}

function requireHash(value: string, label: string) {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(trimmed)) {
    throw new EditableLayerError(`${label} must be a SHA-256 hash.`, 400);
  }
  return trimmed;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
