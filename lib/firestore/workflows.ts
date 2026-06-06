import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  createApprovalQueueItem,
  getApprovalQueueItem,
} from "@/lib/firestore/approval-queue";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  ActivateProcessDefinitionInputSchema,
  type ActivateProcessDefinitionInput,
  CreateProcessDefinitionInputSchema,
  type CreateProcessDefinitionInput,
  type ParsedCreateProcessDefinitionInput,
  type ParsedUpdateProcessDefinitionInput,
  StartWorkflowTestRunInputSchema,
  type StartWorkflowTestRunInput,
  SubmitProcessDefinitionInputSchema,
  type SubmitProcessDefinitionInput,
  UpdateProcessDefinitionInputSchema,
  type UpdateProcessDefinitionInput,
  type UpdateWorkflowRunInput,
  UpdateWorkflowRunInputSchema,
} from "@/lib/firestore/schemas";
import type {
  ApprovalQueueItemRecord,
  ProcessDefinitionActionReference,
  ProcessDefinitionRecord,
  ProcessDefinitionStatus,
  ProcessDefinitionStep,
  ProcessDefinitionVersionRecord,
  WorkflowRunRecord,
  WorkflowRunStatus,
  WorkflowRunTimelineEvent,
  WorkflowRunTimelineRecord,
} from "@/lib/firestore/types";

const COLLECTIONS = {
  processDefinitions: "process_definitions",
  processDefinitionVersions: "process_definition_versions",
  workflowRuns: "workflow_runs",
  workflowRunTimeline: "workflow_run_timeline",
} as const;

type FirestoreValue = Record<string, unknown>;

export interface ListWorkflowRunsOptions {
  definitionId?: string;
  limit?: number;
  simulationOnly?: boolean;
}

export async function listProcessDefinitions(
  actor: AuthenticatedUser,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = await db.collection(COLLECTIONS.processDefinitions).get();

  return snapshot.docs
    .map((doc) => readRecord<ProcessDefinitionRecord>(doc.id, doc.data()))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export async function getProcessDefinition(
  actor: AuthenticatedUser,
  definitionId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = await definitionRef(db, definitionId).get();
  return readRequiredProcessDefinition(snapshot.id, snapshot.data());
}

export async function createProcessDefinition(
  actor: AuthenticatedUser,
  input: CreateProcessDefinitionInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsed = CreateProcessDefinitionInputSchema.parse(input);
  const id = uuidv7();
  const record: Omit<ProcessDefinitionRecord, "created_at" | "updated_at"> & {
    created_at: FieldValue;
    updated_at: FieldValue;
  } = {
    id,
    ...normalizeDefinitionFields(parsed),
    status: "Draft",
    created_by_uid: actor.uid,
    updated_by_uid: actor.uid,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await definitionRef(db, id).set(record);
  return getProcessDefinition(actor, id, db);
}

export async function updateProcessDefinition(
  actor: AuthenticatedUser,
  definitionId: string,
  input: UpdateProcessDefinitionInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsed = UpdateProcessDefinitionInputSchema.parse(input);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(definitionRef(db, definitionId));
    const current = readRequiredProcessDefinition(snapshot.id, snapshot.data());
    assertDefinitionEditable(current);

    const updates = stripUndefined({
      ...normalizeDefinitionUpdateFields(parsed),
      updated_by_uid: actor.uid,
      updated_at: FieldValue.serverTimestamp(),
    });

    transaction.update(definitionRef(db, definitionId), updates);
  });

  return getProcessDefinition(actor, definitionId, db);
}

export async function submitProcessDefinitionForApproval(
  actor: AuthenticatedUser,
  definitionId: string,
  input: SubmitProcessDefinitionInput = {},
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsed = SubmitProcessDefinitionInputSchema.parse(input);
  const definition = await getProcessDefinition(actor, definitionId, db);

  if (definition.status === "Active" || definition.status === "Retired") {
    throw new EditableLayerError(
      "Only editable process definitions can be submitted for approval.",
      409,
    );
  }

  const queueItem = await createApprovalQueueItem(
    actor,
    {
      action_needed: `Review process definition "${definition.name}" for activation.`,
      assignee_uid: actor.uid,
      direct_link: `/processes/${definition.id}`,
      item_type: "ProcessDefinitionChange",
      process_run_ref: {
        id: `process-definition:${definition.id}`,
        label: definition.name,
      },
      required_approver_uid: definition.default_approver_uid,
      risk_signals: { internal_workflow_update: true },
      source_trigger_key: processDefinitionQueueTriggerKey(definition.id),
      note: parsed.note,
    },
    db,
  );

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(definitionRef(db, definitionId));
    const current = readRequiredProcessDefinition(snapshot.id, snapshot.data());

    if (current.status === "Active" || current.status === "Retired") {
      throw new EditableLayerError(
        "Only editable process definitions can be submitted for approval.",
        409,
      );
    }

    transaction.update(definitionRef(db, definitionId), {
      pending_queue_item_id: queueItem.id,
      status: "Pending Approval",
      submitted_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
      updated_by_uid: actor.uid,
    });
  });

  return getProcessDefinition(actor, definitionId, db);
}

export async function activateProcessDefinition(
  actor: AuthenticatedUser,
  definitionId: string,
  input: ActivateProcessDefinitionInput = {},
  db = getAdminFirestore(),
) {
  assertCan(actor, "manageAdmin");
  const parsed = ActivateProcessDefinitionInputSchema.parse(input);
  const definition = await getProcessDefinition(actor, definitionId, db);

  assertActivationGates(definition, parsed.override_reason);
  const approvedQueueItem = await getApprovalQueueItem(
    actor,
    definition.pending_queue_item_id!,
    db,
  );

  if (approvedQueueItem.status !== "Approved") {
    throw new EditableLayerError(
      "Activate requires an approved process-definition queue item.",
      409,
    );
  }

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(definitionRef(db, definitionId));
    const current = readRequiredProcessDefinition(snapshot.id, snapshot.data());
    assertReadyToActivate(current, parsed.override_reason);

    const versionSnapshot = await transaction.get(
      db
        .collection(COLLECTIONS.processDefinitionVersions)
        .where("definition_id", "==", definitionId),
    );
    const versionNumber = versionSnapshot.docs.length + 1;
    const versionId = uuidv7();
    const versionRecord: Omit<ProcessDefinitionVersionRecord, "created_at"> & {
      created_at: FieldValue;
    } = {
      id: versionId,
      definition_id: definitionId,
      version_number: versionNumber,
      activated_by_uid: actor.uid,
      snapshot_json: JSON.stringify({
        ...current,
        status: "Active" satisfies ProcessDefinitionStatus,
        active_version_id: versionId,
      }),
      created_at: FieldValue.serverTimestamp(),
      ...stripUndefined({
        activation_override_reason: parsed.override_reason,
      }),
    };

    transaction.set(
      db.collection(COLLECTIONS.processDefinitionVersions).doc(versionId),
      versionRecord,
    );
    transaction.update(definitionRef(db, definitionId), {
      active_version_id: versionId,
      activated_at: FieldValue.serverTimestamp(),
      activated_by_uid: actor.uid,
      status: "Active",
      updated_at: FieldValue.serverTimestamp(),
      updated_by_uid: actor.uid,
      ...stripUndefined({
        activation_override_reason: parsed.override_reason,
      }),
    });
  });

  return getProcessDefinition(actor, definitionId, db);
}

export async function startWorkflowTestRun(
  actor: AuthenticatedUser,
  definitionId: string,
  input: StartWorkflowTestRunInput = {},
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsed = StartWorkflowTestRunInputSchema.parse(input);
  const definition = await getProcessDefinition(actor, definitionId, db);

  if (definition.status === "Retired") {
    throw new EditableLayerError("Retired process definitions cannot be started.", 409);
  }

  const runId = uuidv7();
  const dueDate = parsed.due_date ?? today();
  const run: Omit<WorkflowRunRecord, "created_at" | "updated_at"> & {
    created_at: FieldValue;
    updated_at: FieldValue;
  } = {
    id: runId,
    definition_id: definition.id,
    definition_version_id: definition.active_version_id,
    process_name: definition.name,
    status: "In Progress",
    owner_uid: definition.default_approver_uid,
    next_action: definition.steps[0]?.title ?? "Review test run.",
    due_date: dueDate,
    is_test_run: true,
    simulation_only: true,
    production_metrics_included: false,
    started_by_uid: actor.uid,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await db.runTransaction(async (transaction) => {
    transaction.set(runRef(db, runId), stripUndefined(run));
    appendTimeline(transaction, db, {
      actor,
      eventType: "started",
      newStatus: "In Progress",
      runId,
      summary:
        parsed.note ??
        `Started simulation-only test run for process definition "${definition.name}".`,
    });

    if (definition.status === "Draft") {
      transaction.update(definitionRef(db, definition.id), {
        status: "Testing",
        updated_at: FieldValue.serverTimestamp(),
        updated_by_uid: actor.uid,
      });
    }
  });

  return getWorkflowRun(actor, runId, db);
}

export async function listWorkflowRuns(
  actor: AuthenticatedUser,
  options: ListWorkflowRunsOptions = {},
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = options.definitionId
    ? await db
        .collection(COLLECTIONS.workflowRuns)
        .where("definition_id", "==", options.definitionId)
        .get()
    : await db.collection(COLLECTIONS.workflowRuns).get();

  return snapshot.docs
    .map((doc) => readRecord<WorkflowRunRecord>(doc.id, doc.data()))
    .filter(
      (run) =>
        options.simulationOnly === undefined ||
        run.simulation_only === options.simulationOnly,
    )
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, options.limit);
}

export async function getWorkflowRun(
  actor: AuthenticatedUser,
  runId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  const snapshot = await runRef(db, runId).get();
  return readRequiredWorkflowRun(snapshot.id, snapshot.data());
}

export async function listWorkflowRunTimeline(
  actor: AuthenticatedUser,
  runId: string,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");
  await getWorkflowRun(actor, runId, db);
  const snapshot = await db
    .collection(COLLECTIONS.workflowRunTimeline)
    .where("run_id", "==", runId)
    .get();

  return snapshot.docs
    .map((doc) => readRecord<WorkflowRunTimelineRecord>(doc.id, doc.data()))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
}

export async function updateWorkflowRunOutcome(
  actor: AuthenticatedUser,
  runId: string,
  input: UpdateWorkflowRunInput,
  db = getAdminFirestore(),
) {
  assertCan(actor, "edit");
  const parsed = UpdateWorkflowRunInputSchema.parse(input);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(runRef(db, runId));
    const current = readRequiredWorkflowRun(snapshot.id, snapshot.data());

    if (!current.is_test_run || !current.simulation_only) {
      throw new EditableLayerError(
        "Only simulation-only test runs can be updated in this workflow foundation.",
        409,
      );
    }

    if (isTerminalRunStatus(current.status)) {
      throw new EditableLayerError("This workflow run is already closed.", 409);
    }

    const nextStatus: WorkflowRunStatus =
      parsed.action === "complete_test" ? "Completed" : "Failed";
    const updates = stripUndefined({
      status: nextStatus,
      outcome_notes: parsed.notes,
      blocker: parsed.action === "fail_test" ? parsed.notes : undefined,
      completed_at:
        parsed.action === "complete_test" ? FieldValue.serverTimestamp() : undefined,
      failed_at: parsed.action === "fail_test" ? FieldValue.serverTimestamp() : undefined,
      updated_at: FieldValue.serverTimestamp(),
    });

    transaction.update(runRef(db, runId), updates);
    appendTimeline(transaction, db, {
      actor,
      eventType: parsed.action === "complete_test" ? "completed" : "failed",
      newStatus: nextStatus,
      previousStatus: current.status,
      runId,
      summary:
        parsed.notes ??
        (parsed.action === "complete_test"
          ? "Simulation-only test run completed."
          : "Simulation-only test run failed."),
    });

    if (parsed.action === "complete_test") {
      transaction.update(definitionRef(db, current.definition_id), {
        last_successful_test_run_id: runId,
        updated_at: FieldValue.serverTimestamp(),
        updated_by_uid: actor.uid,
      });
    }
  });

  return getWorkflowRun(actor, runId, db);
}

export async function syncProcessDefinitionQueueItemTransition(
  actor: AuthenticatedUser,
  item: Pick<ApprovalQueueItemRecord, "id" | "item_type" | "process_run_ref" | "status">,
  db = getAdminFirestore(),
) {
  assertCan(actor, "read");

  const definitionId = processDefinitionIdFromQueueItem(item);

  if (!definitionId || item.status !== "Returned") {
    return;
  }

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(definitionRef(db, definitionId));
    const data = snapshot.data();

    if (!data) {
      return;
    }

    const current = readRecord<ProcessDefinitionRecord>(snapshot.id, data);

    if (
      current.pending_queue_item_id !== item.id ||
      current.status === "Active" ||
      current.status === "Retired"
    ) {
      return;
    }

    transaction.update(definitionRef(db, definitionId), {
      status: "Needs Revision",
      updated_at: FieldValue.serverTimestamp(),
      updated_by_uid: actor.uid,
    });
  });
}

function assertActivationGates(
  definition: ProcessDefinitionRecord,
  overrideReason: string | undefined,
) {
  assertReadyToActivate(definition, overrideReason);

  if (!definition.pending_queue_item_id) {
    throw new EditableLayerError(
      "Activate requires a submitted and approved process-definition queue item.",
      409,
    );
  }
}

function assertReadyToActivate(
  definition: ProcessDefinitionRecord,
  overrideReason: string | undefined,
) {
  if (definition.source_links.length === 0) {
    throw new EditableLayerError(
      "Activate requires at least one source or documentation link.",
      409,
    );
  }

  if (!definition.last_successful_test_run_id && !overrideReason?.trim()) {
    throw new EditableLayerError(
      "Activate requires a successful simulation test run or an Admin override reason.",
      409,
    );
  }

  if (definition.status === "Retired") {
    throw new EditableLayerError("Retired process definitions cannot be activated.", 409);
  }
}

function assertDefinitionEditable(definition: ProcessDefinitionRecord) {
  if (definition.status === "Pending Approval") {
    throw new EditableLayerError(
      "Process definitions cannot be edited while pending approval.",
      409,
    );
  }

  if (definition.status === "Active" || definition.status === "Retired") {
    throw new EditableLayerError(
      "Active or retired process definitions cannot be edited in this cycle.",
      409,
    );
  }
}

function normalizeDefinitionFields(input: ParsedCreateProcessDefinitionInput) {
  return {
    ...input,
    action_references: normalizeActionReferences(input.action_references),
    steps: normalizeSteps(input.steps),
  };
}

function normalizeDefinitionUpdateFields(input: ParsedUpdateProcessDefinitionInput) {
  return stripUndefined({
    ...input,
    action_references: input.action_references
      ? normalizeActionReferences(input.action_references)
      : undefined,
    steps: input.steps ? normalizeSteps(input.steps) : undefined,
  });
}

function normalizeSteps(
  steps: Array<{ description?: string; id?: string; title: string }>,
): ProcessDefinitionStep[] {
  return steps.map((step, index) =>
    stripUndefined({
      id: step.id?.trim() || `step-${index + 1}`,
      title: step.title,
      description: step.description,
    }),
  ) as ProcessDefinitionStep[];
}

function normalizeActionReferences(
  actions: Array<{
    approval_owner_uid?: string;
    expected_action: string;
    id?: string;
    label: string;
    missing_connection_or_permission?: string;
    readiness: ProcessDefinitionActionReference["readiness"];
    rollback_or_correction_note?: string;
    target_system: string;
  }>,
): ProcessDefinitionActionReference[] {
  return actions.map((action, index) =>
    stripUndefined({
      id: action.id?.trim() || `action-${index + 1}`,
      label: action.label,
      target_system: action.target_system,
      expected_action: action.expected_action,
      readiness: action.readiness,
      missing_connection_or_permission: action.missing_connection_or_permission,
      approval_owner_uid: action.approval_owner_uid,
      rollback_or_correction_note: action.rollback_or_correction_note,
    }),
  ) as ProcessDefinitionActionReference[];
}

function appendTimeline(
  transaction: Transaction,
  db: Firestore,
  input: {
    actor: Pick<AuthenticatedUser, "uid">;
    eventType: WorkflowRunTimelineEvent;
    newStatus?: WorkflowRunStatus;
    previousStatus?: WorkflowRunStatus;
    runId: string;
    summary: string;
  },
) {
  const id = uuidv7();
  const record: Omit<WorkflowRunTimelineRecord, "created_at"> & {
    created_at: FieldValue;
  } = {
    id,
    run_id: input.runId,
    actor_uid: input.actor.uid,
    event_type: input.eventType,
    summary: input.summary,
    created_at: FieldValue.serverTimestamp(),
    ...stripUndefined({
      previous_status: input.previousStatus,
      new_status: input.newStatus,
    }),
  };

  transaction.set(db.collection(COLLECTIONS.workflowRunTimeline).doc(id), record);
}

function processDefinitionQueueTriggerKey(definitionId: string) {
  return `process-definition:${definitionId}:approval`;
}

function processDefinitionIdFromQueueItem(
  item: Pick<ApprovalQueueItemRecord, "item_type" | "process_run_ref">,
) {
  if (item.item_type !== "ProcessDefinitionChange") {
    return null;
  }

  const prefix = "process-definition:";

  if (!item.process_run_ref.id.startsWith(prefix)) {
    return null;
  }

  return item.process_run_ref.id.slice(prefix.length);
}

function isTerminalRunStatus(status: WorkflowRunStatus) {
  return status === "Completed" || status === "Cancelled" || status === "Failed";
}

function definitionRef(db: Firestore, id: string) {
  return db.collection(COLLECTIONS.processDefinitions).doc(id);
}

function runRef(db: Firestore, id: string) {
  return db.collection(COLLECTIONS.workflowRuns).doc(id);
}

function readRequiredProcessDefinition(id: string, data: FirestoreValue | undefined) {
  if (!data) {
    throw new EditableLayerError("Process definition was not found.", 404);
  }

  return readRecord<ProcessDefinitionRecord>(id, data);
}

function readRequiredWorkflowRun(id: string, data: FirestoreValue | undefined) {
  if (!data) {
    throw new EditableLayerError("Workflow run was not found.", 404);
  }

  return readRecord<WorkflowRunRecord>(id, data);
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

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested workflow action.",
      403,
    );
  }
}
