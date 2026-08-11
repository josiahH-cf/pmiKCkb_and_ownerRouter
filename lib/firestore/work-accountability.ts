import { createHash } from "node:crypto";

import type {
  DocumentData,
  DocumentReference,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";

import { canAccessSpaceId } from "@/lib/space-scope-resources";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  addRetentionPeriod,
  assertFiniteIso,
  assertTransitionAllowed,
  durationMinutes,
  idleCutoffAt,
  isTerminalTaskState,
  normalizeOpaqueId,
  normalizeShortText,
  shouldAcknowledgeHeartbeat,
  WorkAccountabilityError,
} from "@/lib/work-accountability/model";
import { listWorkAssignableUsers } from "@/lib/work-accountability/roster";
import {
  ExistingWorkSourceResolver,
  type WorkSourceResolver,
} from "@/lib/work-accountability/source-resolver";
import {
  WORK_RETENTION_POLICY_VERSION,
  WORK_TASK_STATES,
  type WorkAccountabilitySnapshot,
  type WorkActiveSessionLock,
  type WorkAssignableUser,
  type WorkDerivationMappingHead,
  type WorkDerivationMappingRecord,
  type WorkExpectationHead,
  type WorkExpectationRecord,
  type WorkExpectationSnapshot,
  type WorkRetentionCandidate,
  type WorkRetentionPlan,
  type WorkRetentionQueueRecord,
  type WorkRetentionReceipt,
  type WorkSessionCorrectionRecord,
  type WorkSessionEndReason,
  type WorkSessionRecord,
  type WorkSourceType,
  type WorkTaskActivityAction,
  type WorkTaskActivityRecord,
  type WorkTaskRecord,
  type WorkTaskState,
} from "@/lib/work-accountability/types";

export const WORK_ACCOUNTABILITY_COLLECTIONS = {
  tasks: "work_tasks",
  taskActivity: "work_task_activity",
  sessions: "work_sessions",
  activeSessions: "work_active_sessions",
  corrections: "work_session_corrections",
  expectations: "work_expectations",
  expectationHeads: "work_expectation_heads",
  mappings: "work_derivation_mappings",
  mappingHeads: "work_derivation_mapping_heads",
  retentionQueue: "work_retention_queue",
  retentionReceipts: "work_retention_receipts",
} as const;

const NON_ENUMERATING_DENIAL = "Work record not found or unavailable.";
const DEFAULT_RETENTION_LIMIT = 100;
const MAX_RETENTION_LIMIT = 250;
const SNAPSHOT_RECORD_LIMIT = 500;

export interface CreateWorkTaskInput {
  space_id: string;
  source: { type: WorkSourceType; id?: string };
  task_type: string;
  title: string;
  assignee_uid?: string;
  next_action: string;
  due_at?: string;
  expectation_key?: string;
  idempotency_key: string;
}

export interface DeriveWorkTaskInput {
  mapping_key: string;
  source_id: string;
  idempotency_key: string;
}

export interface TransitionWorkTaskInput {
  task_id: string;
  expected_version: number;
  next_state: WorkTaskState;
  reason?: string;
  outcome_note?: string;
  idempotency_key: string;
}

export interface ReassignWorkTaskInput {
  task_id: string;
  expected_version: number;
  assignee_uid: string;
  reason: string;
  idempotency_key: string;
}

export interface StartWorkSessionInput {
  task_id: string;
  expected_task_version: number;
  idempotency_key: string;
}

export interface HeartbeatWorkSessionInput {
  session_id: string;
  expected_version: number;
}

export interface CorrectWorkSessionInput {
  session_id: string;
  expected_version: number;
  effective_start_at: string;
  effective_end_at: string;
  task_id?: string;
  reason: string;
  idempotency_key: string;
}

export interface CreateWorkExpectationInput {
  expectation_key: string;
  task_type: string;
  space_id?: string;
  minimum_minutes: number;
  maximum_minutes: number;
  rationale: string;
  idempotency_key: string;
}

export interface RebaseWorkExpectationInput {
  task_id: string;
  expectation_key: string;
  expected_task_version: number;
  reason: string;
  idempotency_key: string;
}

export interface CreateWorkMappingInput {
  mapping_key: string;
  source_type: Exclude<WorkSourceType, "manual">;
  actionable_unit: string;
  task_type: string;
  title: string;
  next_action: string;
  space_id?: string;
  assignee_uid?: string;
  rationale: string;
  idempotency_key: string;
}

export interface WorkAccountabilityStoreDependencies {
  db?: Firestore;
  now?: () => string;
  sourceResolver?: WorkSourceResolver;
  listAssignableUsers?: () => Promise<WorkAssignableUser[]>;
}

interface EndSessionPlan {
  end_at: string;
  reason: WorkSessionEndReason;
  correction_state?: WorkSessionRecord["correction_state"];
}

export class WorkAccountabilityStore {
  private readonly db: Firestore;
  private readonly now: () => string;
  private readonly sourceResolver: WorkSourceResolver;
  private readonly listAssignableUsers: () => Promise<WorkAssignableUser[]>;

  constructor(dependencies: WorkAccountabilityStoreDependencies = {}) {
    this.db = dependencies.db ?? getAdminFirestore();
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.sourceResolver =
      dependencies.sourceResolver ?? new ExistingWorkSourceResolver(this.db);
    this.listAssignableUsers =
      dependencies.listAssignableUsers ?? (() => listWorkAssignableUsers());
  }

  async listSnapshot(
    actor: AuthenticatedUser,
    view: "mine" | "team" = "mine",
  ): Promise<WorkAccountabilitySnapshot> {
    if (view === "team") assertAdmin(actor);
    const taskQuery =
      view === "team"
        ? this.db.collection(WORK_ACCOUNTABILITY_COLLECTIONS.tasks)
        : this.db
            .collection(WORK_ACCOUNTABILITY_COLLECTIONS.tasks)
            .where("assignee_uid", "==", actor.uid);
    const sessionQuery =
      view === "team"
        ? this.db.collection(WORK_ACCOUNTABILITY_COLLECTIONS.sessions)
        : this.db
            .collection(WORK_ACCOUNTABILITY_COLLECTIONS.sessions)
            .where("staff_uid", "==", actor.uid);

    const [taskSnapshot, sessionSnapshot, lockSnapshot] = await Promise.all([
      taskQuery.limit(SNAPSHOT_RECORD_LIMIT).get(),
      sessionQuery.limit(SNAPSHOT_RECORD_LIMIT).get(),
      this.db
        .collection(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions)
        .doc(normalizeOpaqueId(actor.uid, "User id"))
        .get(),
    ]);
    const assignedTasks = taskSnapshot.docs
      .map((doc) => readRecord<WorkTaskRecord>(doc.id, doc.data()))
      .filter((task) => view === "team" || canAccessSpaceId(actor, task.space_id));
    const rawSessions = sessionSnapshot.docs.map((doc) =>
      readRecord<WorkSessionRecord>(doc.id, doc.data()),
    );
    const assignedTaskIds = new Set(assignedTasks.map((task) => task.id));
    const historicalTaskIds = Array.from(
      new Set(
        rawSessions
          .map((session) => session.task_id)
          .filter((taskId) => !assignedTaskIds.has(taskId)),
      ),
    );
    const historicalTaskSnapshots = await Promise.all(
      historicalTaskIds.map((taskId) => this.taskRef(taskId).get()),
    );
    const historicalTasks = historicalTaskSnapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => readRecord<WorkTaskRecord>(snapshot.id, snapshot.data()!))
      .filter((task) => view === "team" || canAccessSpaceId(actor, task.space_id));
    const tasks = [...assignedTasks, ...historicalTasks].sort(compareTasks);
    const visibleTaskIds = new Set(tasks.map((task) => task.id));
    const sessions = rawSessions
      .filter((session) => view === "team" || visibleTaskIds.has(session.task_id))
      .sort((left, right) =>
        right.effective_start_at.localeCompare(left.effective_start_at),
      );

    let currentSession: WorkSessionRecord | undefined;
    if (lockSnapshot.exists) {
      const lock = readRecord<WorkActiveSessionLock>(
        lockSnapshot.id,
        lockSnapshot.data()!,
      );
      currentSession = sessions.find(
        (session) => session.id === lock.session_id && session.state === "Active",
      );
    }

    const [expectations, mappings] =
      view === "team"
        ? await Promise.all([this.listActiveExpectations(), this.listActiveMappings()])
        : [[], []];

    return {
      tasks,
      editable_task_ids:
        view === "team" ? tasks.map((task) => task.id) : Array.from(assignedTaskIds),
      sessions,
      ...(currentSession ? { current_session: currentSession } : {}),
      expectations,
      mappings,
      server_now: this.readNow(),
      record_limit: SNAPSHOT_RECORD_LIMIT,
      may_be_truncated:
        taskSnapshot.docs.length === SNAPSHOT_RECORD_LIMIT ||
        sessionSnapshot.docs.length === SNAPSHOT_RECORD_LIMIT,
    };
  }

  async createTask(
    actor: AuthenticatedUser,
    input: CreateWorkTaskInput,
  ): Promise<WorkTaskRecord> {
    const normalized = normalizeTaskInput(input);
    if (!canAccessSpaceId(actor, normalized.space_id)) throwNonEnumerating();
    const sourceResolution = await this.sourceResolver.resolve(actor, {
      type: normalized.source.type,
      id: normalized.source.id,
      space_id: normalized.space_id,
    });
    const roster = await this.listAssignableUsers();
    const requestedAssignee =
      normalized.assignee_uid ?? (actor.role === "Admin" ? undefined : actor.uid);
    if (actor.role !== "Admin" && requestedAssignee !== actor.uid) {
      throwNonEnumerating();
    }
    const assignee = requestedAssignee
      ? assertAssignable(requestedAssignee, normalized.space_id, roster)
      : undefined;
    const sourceVerified = sourceResolution.source.status === "verified";
    const effectiveAssignee = sourceVerified ? assignee?.uid : undefined;
    const now = this.readNow();
    const taskId = deterministicId("task", actor.uid, normalized.idempotency_key);
    const taskRef = this.taskRef(taskId);

    return this.db.runTransaction(async (transaction) => {
      const existing = await transaction.get(taskRef);
      if (existing.exists) {
        const task = readRecord<WorkTaskRecord>(existing.id, existing.data()!);
        assertTaskReadable(actor, task);
        return task;
      }
      const expectation = await this.readExpectationSnapshot(
        transaction,
        normalized.expectation_key ??
          expectationKey(normalized.space_id, normalized.task_type),
      );
      const state: WorkTaskState =
        sourceVerified && effectiveAssignee ? "Not started" : "Blocked";
      const task: WorkTaskRecord = {
        id: taskId,
        space_id: normalized.space_id,
        source: sourceResolution.source,
        task_type: normalized.task_type,
        title: normalized.title,
        ...(effectiveAssignee ? { assignee_uid: effectiveAssignee } : {}),
        ...(actor.role === "Admin" ? { assigner_uid: actor.uid } : {}),
        creator_uid: actor.uid,
        state,
        next_action: normalized.next_action,
        ...(normalized.due_at ? { due_at: normalized.due_at } : {}),
        ...(!sourceVerified
          ? { blocker_reason: "Linked source could not be verified." }
          : !effectiveAssignee
            ? { blocker_reason: "An active managed staff assignee is required." }
            : {}),
        ...(expectation ? { expectation_snapshot: expectation } : {}),
        created_at: now,
        updated_at: now,
        record_version: 1,
        retention_policy_version: WORK_RETENTION_POLICY_VERSION,
        legal_hold: false,
      };
      transaction.create(taskRef, task);
      this.appendTaskActivity(transaction, task, actor.uid, {
        action: "created",
        previous_state: undefined,
        reason_code: sourceVerified ? "explicit_create" : "source_unverified",
        idempotency_key: normalized.idempotency_key,
        at: now,
      });
      return task;
    });
  }

  async createExpectation(
    actor: AuthenticatedUser,
    input: CreateWorkExpectationInput,
  ): Promise<WorkExpectationRecord> {
    assertAdmin(actor);
    const normalized = normalizeExpectationInput(input);
    if (normalized.space_id && !canAccessSpaceId(actor, normalized.space_id)) {
      throwNonEnumerating();
    }
    const now = this.readNow();
    const recordId = deterministicId(
      "expectation",
      actor.uid,
      normalized.idempotency_key,
    );
    const recordRef = this.expectationRef(recordId);
    const headRef = this.expectationHeadRef(normalized.expectation_key);

    return this.db.runTransaction(async (transaction) => {
      const [existing, headSnapshot] = await Promise.all([
        transaction.get(recordRef),
        transaction.get(headRef),
      ]);
      if (existing.exists) {
        return readRecord<WorkExpectationRecord>(existing.id, existing.data()!);
      }
      const head = headSnapshot.exists
        ? readRecord<WorkExpectationHead>(headSnapshot.id, headSnapshot.data()!)
        : undefined;
      const version = (head?.version ?? 0) + 1;
      if (head) {
        const previousRef = this.expectationRef(head.expectation_id);
        const previousSnapshot = await transaction.get(previousRef);
        if (!previousSnapshot.exists) {
          throw new WorkAccountabilityError(
            "The current expectation version is unavailable.",
            409,
            "expectation_head_drift",
          );
        }
        transaction.update(previousRef, {
          status: "superseded",
          superseded_at: now,
          retention_expires_at: addRetentionPeriod(now),
        });
        this.queueRetention(transaction, {
          target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.expectations,
          target_id: head.expectation_id,
          expires_at: addRetentionPeriod(now),
          anchor_kind: "record_time",
          at: now,
        });
      }
      const record: WorkExpectationRecord = {
        id: recordId,
        expectation_key: normalized.expectation_key,
        task_type: normalized.task_type,
        ...(normalized.space_id ? { space_id: normalized.space_id } : {}),
        version,
        minimum_minutes: normalized.minimum_minutes,
        maximum_minutes: normalized.maximum_minutes,
        effective_at: now,
        manager_uid: actor.uid,
        rationale: normalized.rationale,
        status: "active",
        created_at: now,
        retention_policy_version: WORK_RETENTION_POLICY_VERSION,
        legal_hold: false,
      };
      transaction.create(recordRef, record);
      transaction.set(headRef, {
        expectation_key: normalized.expectation_key,
        expectation_id: recordId,
        version,
        updated_at: now,
      } satisfies WorkExpectationHead);
      return record;
    });
  }

  async createMapping(
    actor: AuthenticatedUser,
    input: CreateWorkMappingInput,
  ): Promise<WorkDerivationMappingRecord> {
    assertAdmin(actor);
    const normalized = normalizeMappingInput(input);
    if (normalized.space_id && !canAccessSpaceId(actor, normalized.space_id)) {
      throwNonEnumerating();
    }
    if (normalized.assignee_uid) {
      assertAssignable(
        normalized.assignee_uid,
        normalized.space_id,
        await this.listAssignableUsers(),
      );
    }
    const now = this.readNow();
    const recordId = deterministicId("mapping", actor.uid, normalized.idempotency_key);
    const recordRef = this.mappingRef(recordId);
    const headRef = this.mappingHeadRef(normalized.mapping_key);

    return this.db.runTransaction(async (transaction) => {
      const [existing, headSnapshot] = await Promise.all([
        transaction.get(recordRef),
        transaction.get(headRef),
      ]);
      if (existing.exists) {
        return readRecord<WorkDerivationMappingRecord>(existing.id, existing.data()!);
      }
      const head = headSnapshot.exists
        ? readRecord<WorkDerivationMappingHead>(headSnapshot.id, headSnapshot.data()!)
        : undefined;
      const version = (head?.version ?? 0) + 1;
      if (head) {
        const previousRef = this.mappingRef(head.mapping_id);
        const previousSnapshot = await transaction.get(previousRef);
        if (!previousSnapshot.exists) {
          throw new WorkAccountabilityError(
            "The current mapping version is unavailable.",
            409,
            "mapping_head_drift",
          );
        }
        transaction.update(previousRef, {
          status: "superseded",
          superseded_at: now,
          retention_expires_at: addRetentionPeriod(now),
        });
        this.queueRetention(transaction, {
          target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.mappings,
          target_id: head.mapping_id,
          expires_at: addRetentionPeriod(now),
          anchor_kind: "record_time",
          at: now,
        });
      }
      const record: WorkDerivationMappingRecord = {
        id: recordId,
        mapping_key: normalized.mapping_key,
        source_type: normalized.source_type,
        actionable_unit: normalized.actionable_unit,
        task_type: normalized.task_type,
        title: normalized.title,
        next_action: normalized.next_action,
        ...(normalized.space_id ? { space_id: normalized.space_id } : {}),
        ...(normalized.assignee_uid ? { assignee_uid: normalized.assignee_uid } : {}),
        version,
        status: "active",
        effective_at: now,
        manager_uid: actor.uid,
        rationale: normalized.rationale,
        created_at: now,
        retention_policy_version: WORK_RETENTION_POLICY_VERSION,
        legal_hold: false,
      };
      transaction.create(recordRef, record);
      transaction.set(headRef, {
        mapping_key: normalized.mapping_key,
        mapping_id: recordId,
        version,
        updated_at: now,
      } satisfies WorkDerivationMappingHead);
      return record;
    });
  }

  async deriveTask(
    actor: AuthenticatedUser,
    input: DeriveWorkTaskInput,
  ): Promise<WorkTaskRecord> {
    assertAdmin(actor);
    const mappingKey = normalizeShortText(input.mapping_key, "Mapping key", 160);
    const sourceId = normalizeOpaqueId(input.source_id, "Source id");
    normalizeOpaqueId(input.idempotency_key, "Idempotency key");
    const headSnapshot = await this.mappingHeadRef(mappingKey).get();
    if (!headSnapshot.exists) {
      throw new WorkAccountabilityError("Approved task mapping not found.", 404);
    }
    const head = readRecord<WorkDerivationMappingHead>(
      headSnapshot.id,
      headSnapshot.data()!,
    );
    const mappingSnapshot = await this.mappingRef(head.mapping_id).get();
    if (!mappingSnapshot.exists) {
      throw new WorkAccountabilityError("Approved task mapping not found.", 404);
    }
    const mapping = readRecord<WorkDerivationMappingRecord>(
      mappingSnapshot.id,
      mappingSnapshot.data()!,
    );
    if (mapping.status !== "active" || mapping.version !== head.version) {
      throw new WorkAccountabilityError("Approved task mapping changed. Refresh.", 409);
    }
    const requestedSpace = mapping.space_id ?? defaultSourceSpace(mapping.source_type);
    if (!requestedSpace || !canAccessSpaceId(actor, requestedSpace))
      throwNonEnumerating();
    const sourceResolution = await this.sourceResolver.resolve(actor, {
      type: mapping.source_type,
      id: sourceId,
      space_id: requestedSpace,
    });
    const roster = await this.listAssignableUsers();
    const assignee = mapping.assignee_uid
      ? assertAssignable(mapping.assignee_uid, requestedSpace, roster)
      : undefined;
    const sourceVerified = sourceResolution.source.status === "verified";
    const generationKey = [
      mapping.source_type,
      sourceId,
      mapping.actionable_unit,
      String(mapping.version),
      assignee?.uid ?? "unassigned",
    ].join(":");
    const taskId = deterministicId("derived-task", generationKey);
    const now = this.readNow();

    return this.db.runTransaction(async (transaction) => {
      const taskRef = this.taskRef(taskId);
      const existing = await transaction.get(taskRef);
      if (existing.exists) {
        return readRecord<WorkTaskRecord>(existing.id, existing.data()!);
      }
      const [currentHeadSnapshot, currentMappingSnapshot] = await Promise.all([
        transaction.get(this.mappingHeadRef(mappingKey)),
        transaction.get(this.mappingRef(mapping.id)),
      ]);
      if (!currentHeadSnapshot.exists || !currentMappingSnapshot.exists) {
        throw new WorkAccountabilityError(
          "Approved task mapping changed. Refresh.",
          409,
          "mapping_changed",
        );
      }
      const currentHead = readRecord<WorkDerivationMappingHead>(
        currentHeadSnapshot.id,
        currentHeadSnapshot.data()!,
      );
      const currentMapping = readRecord<WorkDerivationMappingRecord>(
        currentMappingSnapshot.id,
        currentMappingSnapshot.data()!,
      );
      if (
        currentHead.mapping_id !== mapping.id ||
        currentHead.version !== mapping.version ||
        currentMapping.status !== "active"
      ) {
        throw new WorkAccountabilityError(
          "Approved task mapping changed. Refresh.",
          409,
          "mapping_changed",
        );
      }
      const expectation = await this.readExpectationSnapshot(
        transaction,
        expectationKey(requestedSpace, mapping.task_type),
      );
      const effectiveAssignee = sourceVerified ? assignee?.uid : undefined;
      const state: WorkTaskState = effectiveAssignee ? "Not started" : "Blocked";
      const task: WorkTaskRecord = {
        id: taskId,
        space_id: requestedSpace,
        source: sourceResolution.source,
        task_type: mapping.task_type,
        title: mapping.title,
        ...(effectiveAssignee ? { assignee_uid: effectiveAssignee } : {}),
        assigner_uid: actor.uid,
        creator_uid: actor.uid,
        state,
        next_action: mapping.next_action,
        ...(!sourceVerified
          ? { blocker_reason: "Linked source could not be verified." }
          : !effectiveAssignee
            ? { blocker_reason: "Approved mapping has no active staff assignee." }
            : {}),
        ...(expectation ? { expectation_snapshot: expectation } : {}),
        mapping_id: mapping.id,
        mapping_version: mapping.version,
        generation_key: generationKey,
        created_at: now,
        updated_at: now,
        record_version: 1,
        retention_policy_version: WORK_RETENTION_POLICY_VERSION,
        legal_hold: false,
      };
      transaction.create(taskRef, task);
      this.appendTaskActivity(transaction, task, actor.uid, {
        action: "derived",
        previous_state: undefined,
        reason_code: sourceVerified ? "approved_mapping" : "source_unverified",
        idempotency_key: generationKey,
        at: now,
      });
      return task;
    });
  }

  async startSession(
    actor: AuthenticatedUser,
    input: StartWorkSessionInput,
  ): Promise<WorkSessionRecord> {
    const taskId = normalizeOpaqueId(input.task_id, "Task id");
    const idempotencyKey = normalizeOpaqueId(input.idempotency_key, "Idempotency key");
    assertPositiveVersion(input.expected_task_version, "Task version");
    const now = this.readNow();
    const candidateSessionId = deterministicId("session", actor.uid, idempotencyKey);

    return this.db.runTransaction(async (transaction) => {
      const taskRef = this.taskRef(taskId);
      const lockRef = this.activeSessionRef(actor.uid);
      const candidateRef = this.sessionRef(candidateSessionId);
      const [taskSnapshot, lockSnapshot, candidateSnapshot] = await Promise.all([
        transaction.get(taskRef),
        transaction.get(lockRef),
        transaction.get(candidateRef),
      ]);
      if (!taskSnapshot.exists) throwNonEnumerating();
      const target = readRecord<WorkTaskRecord>(taskSnapshot.id, taskSnapshot.data()!);
      assertTaskOwned(actor, target);

      if (candidateSnapshot.exists) {
        const existing = readRecord<WorkSessionRecord>(
          candidateSnapshot.id,
          candidateSnapshot.data()!,
        );
        if (existing.staff_uid !== actor.uid || existing.task_id !== taskId) {
          throw new WorkAccountabilityError(
            "The idempotency key was already used for different work.",
            409,
            "idempotency_conflict",
          );
        }
        return existing;
      }

      const lock = lockSnapshot.exists
        ? readRecord<WorkActiveSessionLock>(lockSnapshot.id, lockSnapshot.data()!)
        : undefined;
      let priorSession: WorkSessionRecord | undefined;
      let priorTask: WorkTaskRecord | undefined;
      if (lock) {
        const priorSessionSnapshot = await transaction.get(
          this.sessionRef(lock.session_id),
        );
        if (priorSessionSnapshot.exists) {
          priorSession = readRecord<WorkSessionRecord>(
            priorSessionSnapshot.id,
            priorSessionSnapshot.data()!,
          );
          const priorTaskSnapshot = await transaction.get(
            this.taskRef(priorSession.task_id),
          );
          if (priorTaskSnapshot.exists) {
            priorTask = readRecord<WorkTaskRecord>(
              priorTaskSnapshot.id,
              priorTaskSnapshot.data()!,
            );
          }
        }
      }

      if (
        priorSession?.state === "Active" &&
        priorSession.task_id === taskId &&
        assertFiniteIso(now, "Server time") <
          assertFiniteIso(
            idleCutoffAt(priorSession.last_acknowledged_activity_at),
            "Idle cutoff",
          )
      ) {
        return priorSession;
      }
      if (target.record_version !== input.expected_task_version) {
        throwVersionConflict("Task");
      }
      if (isTerminalTaskState(target.state)) {
        throw new WorkAccountabilityError(
          "Completed or cancelled work must be reopened before it can start.",
          409,
          "terminal_task",
        );
      }
      if (target.state === "In progress" && priorSession?.task_id !== taskId) {
        throw new WorkAccountabilityError(
          "This task is already marked in progress. Refresh before starting.",
          409,
          "session_lock_drift",
        );
      }

      let refreshedTarget = target;
      if (priorSession?.state === "Active") {
        const cutoff = idleCutoffAt(priorSession.last_acknowledged_activity_at);
        const crossedCutoff =
          assertFiniteIso(now, "Server time") >= assertFiniteIso(cutoff, "Idle cutoff");
        const endPlan: EndSessionPlan = crossedCutoff
          ? {
              end_at: cutoff,
              reason: "disconnect_review",
              correction_state: "needs_review",
            }
          : { end_at: now, reason: "task_switch" };
        const ended = endSessionRecord(priorSession, endPlan, now);
        transaction.set(this.sessionRef(ended.id), ended);
        transaction.delete(lockRef);
        this.queueRetention(transaction, {
          target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.sessions,
          target_id: ended.id,
          expires_at: ended.retention_expires_at!,
          anchor_kind: "record_time",
          at: now,
        });

        if (priorTask && !isTerminalTaskState(priorTask.state)) {
          const pausedPrior: WorkTaskRecord = {
            ...priorTask,
            state: "Paused",
            updated_at: now,
            record_version: priorTask.record_version + 1,
          };
          transaction.set(this.taskRef(pausedPrior.id), pausedPrior);
          this.appendTaskActivity(transaction, pausedPrior, actor.uid, {
            action: crossedCutoff ? "paused" : "switched",
            previous_state: priorTask.state,
            reason_code: crossedCutoff ? "disconnect_review" : "task_switch",
            idempotency_key: `${idempotencyKey}:end-prior:${priorSession.id}`,
            at: now,
          });
          if (priorTask.id === target.id) refreshedTarget = pausedPrior;
        }
      } else if (lock) {
        transaction.delete(lockRef);
      }

      const previousState = refreshedTarget.state;
      const startedTask: WorkTaskRecord = {
        ...refreshedTarget,
        state: "In progress",
        updated_at: now,
        record_version: refreshedTarget.record_version + 1,
        blocker_reason: undefined,
      };
      delete startedTask.blocker_reason;
      const session: WorkSessionRecord = {
        id: candidateSessionId,
        task_id: taskId,
        original_task_id: taskId,
        staff_uid: actor.uid,
        state: "Active",
        original_start_at: now,
        last_acknowledged_activity_at: now,
        effective_start_at: now,
        effective_minutes: 0,
        correction_state: "none",
        idempotency_key: stableHash(idempotencyKey),
        record_version: 1,
        created_at: now,
        updated_at: now,
        retention_policy_version: WORK_RETENTION_POLICY_VERSION,
        legal_hold: false,
      };
      const activeLock: WorkActiveSessionLock = {
        staff_uid: actor.uid,
        session_id: session.id,
        task_id: taskId,
        session_version: session.record_version,
        updated_at: now,
      };
      transaction.create(candidateRef, session);
      transaction.set(taskRef, startedTask);
      transaction.set(lockRef, activeLock);
      this.appendTaskActivity(transaction, startedTask, actor.uid, {
        action: previousState === "Not started" ? "started" : "resumed",
        previous_state: previousState,
        reason_code: "explicit_start",
        idempotency_key: `${idempotencyKey}:start`,
        at: now,
      });
      return session;
    });
  }

  async transitionTask(
    actor: AuthenticatedUser,
    input: TransitionWorkTaskInput,
  ): Promise<WorkTaskRecord> {
    const normalized = normalizeTransitionInput(input);
    const now = this.readNow();
    const activityId = deterministicId(
      "task-activity",
      normalized.task_id,
      normalized.idempotency_key,
      "transition",
    );

    return this.db.runTransaction(async (transaction) => {
      const taskRef = this.taskRef(normalized.task_id);
      const [taskSnapshot, activitySnapshot] = await Promise.all([
        transaction.get(taskRef),
        transaction.get(
          this.db
            .collection(WORK_ACCOUNTABILITY_COLLECTIONS.taskActivity)
            .doc(activityId),
        ),
      ]);
      if (!taskSnapshot.exists) throwNonEnumerating();
      const task = readRecord<WorkTaskRecord>(taskSnapshot.id, taskSnapshot.data()!);
      assertTaskMutable(actor, task);
      const action = activityForTransition(task.state, normalized.next_state);
      if (activitySnapshot.exists) return task;
      if (task.record_version !== normalized.expected_version) {
        throwVersionConflict("Task");
      }
      if (
        isTerminalTaskState(task.state) &&
        normalized.next_state === "Paused" &&
        actor.role !== "Admin"
      ) {
        throwNonEnumerating();
      }
      assertTransitionAllowed(task.state, normalized.next_state);

      const lockRef = task.assignee_uid
        ? this.activeSessionRef(task.assignee_uid)
        : undefined;
      const lockSnapshot = lockRef ? await transaction.get(lockRef) : undefined;
      const lock = lockSnapshot?.exists
        ? readRecord<WorkActiveSessionLock>(lockSnapshot.id, lockSnapshot.data()!)
        : undefined;
      const activeSessionSnapshot =
        lock && lock.task_id === task.id
          ? await transaction.get(this.sessionRef(lock.session_id))
          : undefined;
      const activeSession = activeSessionSnapshot?.exists
        ? readRecord<WorkSessionRecord>(
            activeSessionSnapshot.id,
            activeSessionSnapshot.data()!,
          )
        : undefined;

      if (activeSession?.state === "Active") {
        const intendedReason = endReasonForTransition(normalized.next_state);
        const endPlan = cutoffAwareEndPlan(activeSession, now, intendedReason);
        const ended = endSessionRecord(activeSession, endPlan, now);
        transaction.set(this.sessionRef(ended.id), ended);
        if (lockRef) transaction.delete(lockRef);
        this.queueRetention(transaction, {
          target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.sessions,
          target_id: ended.id,
          expires_at: ended.retention_expires_at!,
          anchor_kind: "record_time",
          at: now,
        });
      } else if (lockRef && lock) {
        transaction.delete(lockRef);
      }

      const nextTask = transitionedTask(task, normalized, now);
      transaction.set(taskRef, nextTask);
      this.appendTaskActivity(transaction, nextTask, actor.uid, {
        action,
        record_id: activityId,
        previous_state: task.state,
        reason_code: reasonCodeForTransition(task.state, normalized.next_state),
        ...(normalized.reason ? { reason_text: normalized.reason } : {}),
        idempotency_key: normalized.idempotency_key,
        at: now,
      });
      if (isTerminalTaskState(nextTask.state)) {
        this.queueRetention(transaction, {
          target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.tasks,
          target_id: nextTask.id,
          expires_at: nextTask.retention_expires_at!,
          anchor_kind: "task_terminal",
          governing_task_id: nextTask.id,
          at: now,
        });
      }
      return nextTask;
    });
  }

  async reassignTask(
    actor: AuthenticatedUser,
    input: ReassignWorkTaskInput,
  ): Promise<WorkTaskRecord> {
    assertAdmin(actor);
    const taskId = normalizeOpaqueId(input.task_id, "Task id");
    const assigneeUid = normalizeOpaqueId(input.assignee_uid, "Assignee id");
    const reason = normalizeShortText(input.reason, "Reassignment reason", 500);
    const idempotencyKey = normalizeOpaqueId(input.idempotency_key, "Idempotency key");
    assertPositiveVersion(input.expected_version, "Task version");
    const roster = await this.listAssignableUsers();
    const now = this.readNow();
    const activityId = deterministicId(
      "task-activity",
      taskId,
      idempotencyKey,
      "reassigned",
    );

    return this.db.runTransaction(async (transaction) => {
      const taskRef = this.taskRef(taskId);
      const [taskSnapshot, activitySnapshot] = await Promise.all([
        transaction.get(taskRef),
        transaction.get(
          this.db
            .collection(WORK_ACCOUNTABILITY_COLLECTIONS.taskActivity)
            .doc(activityId),
        ),
      ]);
      if (!taskSnapshot.exists) throwNonEnumerating();
      const task = readRecord<WorkTaskRecord>(taskSnapshot.id, taskSnapshot.data()!);
      if (activitySnapshot.exists) return task;
      if (task.record_version !== input.expected_version) throwVersionConflict("Task");
      assertAssignable(assigneeUid, task.space_id, roster);
      if (task.assignee_uid) {
        const lock = await transaction.get(this.activeSessionRef(task.assignee_uid));
        if (lock.exists) {
          const active = readRecord<WorkActiveSessionLock>(lock.id, lock.data()!);
          if (active.task_id === task.id) {
            throw new WorkAccountabilityError(
              "Pause this task before changing its assignee.",
              409,
              "active_reassignment",
            );
          }
        }
      }
      const next: WorkTaskRecord = {
        ...task,
        assignee_uid: assigneeUid,
        assigner_uid: actor.uid,
        updated_at: now,
        record_version: task.record_version + 1,
      };
      transaction.set(taskRef, next);
      this.appendTaskActivity(transaction, next, actor.uid, {
        action: "reassigned",
        previous_state: task.state,
        reason_code: "admin_reassignment",
        reason_text: reason,
        idempotency_key: idempotencyKey,
        at: now,
      });
      return next;
    });
  }

  async heartbeat(
    actor: AuthenticatedUser,
    input: HeartbeatWorkSessionInput,
  ): Promise<WorkSessionRecord> {
    const sessionId = normalizeOpaqueId(input.session_id, "Session id");
    assertPositiveVersion(input.expected_version, "Session version");
    const now = this.readNow();
    return this.db.runTransaction(async (transaction) => {
      const sessionRef = this.sessionRef(sessionId);
      const sessionSnapshot = await transaction.get(sessionRef);
      if (!sessionSnapshot.exists) throwNonEnumerating();
      const session = readRecord<WorkSessionRecord>(
        sessionSnapshot.id,
        sessionSnapshot.data()!,
      );
      assertSessionOwned(actor, session);
      if (session.state === "Ended") return session;
      if (session.record_version !== input.expected_version) {
        throwVersionConflict("Session");
      }
      const taskSnapshot = await transaction.get(this.taskRef(session.task_id));
      if (!taskSnapshot.exists) {
        throw new WorkAccountabilityError(
          "The active task is unavailable. Refresh.",
          409,
          "active_task_missing",
        );
      }
      const task = readRecord<WorkTaskRecord>(taskSnapshot.id, taskSnapshot.data()!);
      const lockRef = this.activeSessionRef(actor.uid);
      const lockSnapshot = await transaction.get(lockRef);
      const lock = lockSnapshot.exists
        ? readRecord<WorkActiveSessionLock>(lockSnapshot.id, lockSnapshot.data()!)
        : undefined;
      if (!lock || lock.session_id !== session.id) {
        throw new WorkAccountabilityError(
          "The active session changed. Refresh.",
          409,
          "session_lock_changed",
        );
      }

      const cutoff = idleCutoffAt(session.last_acknowledged_activity_at);
      if (assertFiniteIso(now, "Server time") >= assertFiniteIso(cutoff, "Idle cutoff")) {
        return this.endActiveSessionInTransaction(
          transaction,
          task,
          session,
          lockRef,
          {
            end_at: cutoff,
            reason: "idle_timeout",
          },
          now,
          `idle:${session.record_version}`,
        );
      }
      if (!shouldAcknowledgeHeartbeat(session.last_acknowledged_activity_at, now)) {
        return session;
      }
      const next: WorkSessionRecord = {
        ...session,
        last_acknowledged_activity_at: now,
        updated_at: now,
        record_version: session.record_version + 1,
      };
      transaction.set(sessionRef, next);
      transaction.set(lockRef, {
        ...lock,
        session_version: next.record_version,
        updated_at: now,
      } satisfies WorkActiveSessionLock);
      return next;
    });
  }

  async reconcileOwnSession(actor: AuthenticatedUser): Promise<WorkSessionRecord | null> {
    return (await this.reconcileSessionForUid(actor.uid, this.readNow())).session;
  }

  async reconcileTeamSessions(
    actor: AuthenticatedUser,
    limit = 100,
  ): Promise<{ scanned: number; ended: number }> {
    assertAdmin(actor);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new WorkAccountabilityError(
        "Team reconciliation limit must be between 1 and 100.",
      );
    }
    const lockSnapshot = await this.db
      .collection(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions)
      .limit(limit)
      .get();
    const now = this.readNow();
    let ended = 0;
    for (let offset = 0; offset < lockSnapshot.docs.length; offset += 10) {
      const batch = lockSnapshot.docs.slice(offset, offset + 10);
      const results = await Promise.all(
        batch.map((lock) => this.reconcileSessionForUid(lock.id, now)),
      );
      ended += results.filter((result) => result.ended_now).length;
    }
    return { scanned: lockSnapshot.docs.length, ended };
  }

  private reconcileSessionForUid(
    uid: string,
    now: string,
  ): Promise<{ session: WorkSessionRecord | null; ended_now: boolean }> {
    return this.db.runTransaction(async (transaction) => {
      const lockRef = this.activeSessionRef(uid);
      const lockSnapshot = await transaction.get(lockRef);
      if (!lockSnapshot.exists) return { session: null, ended_now: false };
      const lock = readRecord<WorkActiveSessionLock>(
        lockSnapshot.id,
        lockSnapshot.data()!,
      );
      const sessionSnapshot = await transaction.get(this.sessionRef(lock.session_id));
      if (!sessionSnapshot.exists) {
        transaction.delete(lockRef);
        return { session: null, ended_now: false };
      }
      const session = readRecord<WorkSessionRecord>(
        sessionSnapshot.id,
        sessionSnapshot.data()!,
      );
      if (session.staff_uid !== uid) throwNonEnumerating();
      if (session.state === "Ended") {
        transaction.delete(lockRef);
        return { session, ended_now: false };
      }
      const cutoff = idleCutoffAt(session.last_acknowledged_activity_at);
      if (assertFiniteIso(now, "Server time") < assertFiniteIso(cutoff, "Idle cutoff")) {
        return { session, ended_now: false };
      }
      const taskSnapshot = await transaction.get(this.taskRef(session.task_id));
      if (!taskSnapshot.exists) {
        throw new WorkAccountabilityError(
          "The active task is unavailable. Refresh.",
          409,
          "active_task_missing",
        );
      }
      const task = readRecord<WorkTaskRecord>(taskSnapshot.id, taskSnapshot.data()!);
      const ended = this.endActiveSessionInTransaction(
        transaction,
        task,
        session,
        lockRef,
        {
          end_at: cutoff,
          reason: "disconnect_review",
          correction_state: "needs_review",
        },
        now,
        `disconnect:${session.record_version}`,
      );
      return { session: ended, ended_now: true };
    });
  }

  async correctSession(
    actor: AuthenticatedUser,
    input: CorrectWorkSessionInput,
  ): Promise<WorkSessionRecord> {
    const sessionId = normalizeOpaqueId(input.session_id, "Session id");
    const newTaskId = input.task_id
      ? normalizeOpaqueId(input.task_id, "Task id")
      : undefined;
    const reason = normalizeShortText(input.reason, "Correction reason", 500);
    const idempotencyKey = normalizeOpaqueId(input.idempotency_key, "Idempotency key");
    assertPositiveVersion(input.expected_version, "Session version");
    const effectiveStart = new Date(
      assertFiniteIso(input.effective_start_at, "Effective start"),
    ).toISOString();
    const effectiveEnd = new Date(
      assertFiniteIso(input.effective_end_at, "Effective end"),
    ).toISOString();
    const effectiveMinutes = durationMinutes(effectiveStart, effectiveEnd);
    const correctionId = deterministicId("session-correction", sessionId, idempotencyKey);
    const now = this.readNow();

    return this.db.runTransaction(async (transaction) => {
      const sessionRef = this.sessionRef(sessionId);
      const correctionRef = this.db
        .collection(WORK_ACCOUNTABILITY_COLLECTIONS.corrections)
        .doc(correctionId);
      const [sessionSnapshot, correctionSnapshot] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(correctionRef),
      ]);
      if (!sessionSnapshot.exists) throwNonEnumerating();
      const session = readRecord<WorkSessionRecord>(
        sessionSnapshot.id,
        sessionSnapshot.data()!,
      );
      assertSessionMutable(actor, session);
      if (correctionSnapshot.exists) return session;
      if (session.record_version !== input.expected_version) {
        throwVersionConflict("Session");
      }
      if (session.state !== "Ended" || !session.effective_end_at) {
        throw new WorkAccountabilityError(
          "Only an ended session can be corrected.",
          409,
          "active_correction_refused",
        );
      }
      if (
        assertFiniteIso(effectiveEnd, "Effective end") >
        assertFiniteIso(now, "Server time")
      ) {
        throw new WorkAccountabilityError("A correction cannot end in the future.");
      }

      const targetTaskId = newTaskId ?? session.task_id;
      const [oldTaskSnapshot, targetTaskSnapshot, allSessionsSnapshot] =
        await Promise.all([
          transaction.get(this.taskRef(session.task_id)),
          transaction.get(this.taskRef(targetTaskId)),
          transaction.get(
            this.db
              .collection(WORK_ACCOUNTABILITY_COLLECTIONS.sessions)
              .where("staff_uid", "==", session.staff_uid),
          ),
        ]);
      if (!oldTaskSnapshot.exists || !targetTaskSnapshot.exists) throwNonEnumerating();
      const oldTask = readRecord<WorkTaskRecord>(
        oldTaskSnapshot.id,
        oldTaskSnapshot.data()!,
      );
      const targetTask = readRecord<WorkTaskRecord>(
        targetTaskSnapshot.id,
        targetTaskSnapshot.data()!,
      );
      if (
        (targetTask.id !== session.task_id &&
          targetTask.assignee_uid !== session.staff_uid) ||
        (actor.role !== "Admin" && !canAccessSpaceId(actor, targetTask.space_id))
      ) {
        throwNonEnumerating();
      }
      const overlaps = allSessionsSnapshot.docs
        .map((doc) => readRecord<WorkSessionRecord>(doc.id, doc.data()))
        .filter(
          (other) =>
            other.id !== session.id &&
            other.state === "Ended" &&
            other.effective_end_at !== undefined,
        )
        .some((other) =>
          intervalsOverlap(
            effectiveStart,
            effectiveEnd,
            other.effective_start_at,
            other.effective_end_at!,
          ),
        );
      if (overlaps) {
        throw new WorkAccountabilityError(
          "The corrected time overlaps another work session.",
          409,
          "session_overlap",
        );
      }

      const next: WorkSessionRecord = {
        ...session,
        task_id: targetTaskId,
        effective_start_at: effectiveStart,
        effective_end_at: effectiveEnd,
        effective_minutes: effectiveMinutes,
        correction_state: "corrected",
        updated_at: now,
        record_version: session.record_version + 1,
        retention_expires_at: addRetentionPeriod(now),
      };
      const correction: WorkSessionCorrectionRecord = {
        id: correctionId,
        session_id: session.id,
        staff_uid: session.staff_uid,
        previous_task_id: session.task_id,
        new_task_id: targetTaskId,
        previous_effective_start_at: session.effective_start_at,
        previous_effective_end_at: session.effective_end_at,
        new_effective_start_at: effectiveStart,
        new_effective_end_at: effectiveEnd,
        previous_effective_minutes: session.effective_minutes,
        new_effective_minutes: effectiveMinutes,
        actor_uid: actor.uid,
        reason,
        previous_session_version: session.record_version,
        new_session_version: next.record_version,
        idempotency_key: stableHash(idempotencyKey),
        created_at: now,
        retention_policy_version: WORK_RETENTION_POLICY_VERSION,
        retention_expires_at: addRetentionPeriod(now),
        legal_hold: false,
      };
      transaction.set(sessionRef, next);
      transaction.create(correctionRef, correction);
      this.queueRetention(transaction, {
        target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.sessions,
        target_id: next.id,
        expires_at: next.retention_expires_at!,
        anchor_kind: "record_time",
        at: now,
      });
      this.queueRetention(transaction, {
        target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.corrections,
        target_id: correction.id,
        expires_at: correction.retention_expires_at,
        anchor_kind: "record_time",
        at: now,
      });
      this.extendTerminalTaskRetention(transaction, oldTask, now);
      if (targetTask.id !== oldTask.id) {
        this.extendTerminalTaskRetention(transaction, targetTask, now);
      }
      return next;
    });
  }

  async rebaseTaskExpectation(
    actor: AuthenticatedUser,
    input: RebaseWorkExpectationInput,
  ): Promise<WorkTaskRecord> {
    assertAdmin(actor);
    const taskId = normalizeOpaqueId(input.task_id, "Task id");
    const expectationKeyValue = normalizeShortText(
      input.expectation_key,
      "Expectation key",
      160,
    );
    const reason = normalizeShortText(input.reason, "Rebase reason", 500);
    const idempotencyKey = normalizeOpaqueId(input.idempotency_key, "Idempotency key");
    assertPositiveVersion(input.expected_task_version, "Task version");
    const now = this.readNow();
    const activityId = deterministicId(
      "task-activity",
      taskId,
      idempotencyKey,
      "expectation_rebased",
    );
    return this.db.runTransaction(async (transaction) => {
      const taskRef = this.taskRef(taskId);
      const [taskSnapshot, activitySnapshot] = await Promise.all([
        transaction.get(taskRef),
        transaction.get(
          this.db
            .collection(WORK_ACCOUNTABILITY_COLLECTIONS.taskActivity)
            .doc(activityId),
        ),
      ]);
      if (!taskSnapshot.exists) throwNonEnumerating();
      const task = readRecord<WorkTaskRecord>(taskSnapshot.id, taskSnapshot.data()!);
      if (activitySnapshot.exists) return task;
      if (task.record_version !== input.expected_task_version)
        throwVersionConflict("Task");
      if (isTerminalTaskState(task.state)) {
        throw new WorkAccountabilityError(
          "Only open work can be rebased to a new expectation.",
          409,
        );
      }
      const snapshot = await this.readExpectationSnapshot(
        transaction,
        expectationKeyValue,
      );
      if (!snapshot) {
        throw new WorkAccountabilityError("Active expectation not found.", 404);
      }
      const expectationSnapshot = await transaction.get(
        this.expectationRef(snapshot.expectation_id),
      );
      const expectation = readRecord<WorkExpectationRecord>(
        expectationSnapshot.id,
        expectationSnapshot.data()!,
      );
      if (
        expectation.task_type !== task.task_type ||
        (expectation.space_id && expectation.space_id !== task.space_id)
      ) {
        throw new WorkAccountabilityError(
          "The expectation does not match this task type and Space.",
          409,
          "expectation_mismatch",
        );
      }
      const next: WorkTaskRecord = {
        ...task,
        expectation_snapshot: snapshot,
        updated_at: now,
        record_version: task.record_version + 1,
      };
      transaction.set(taskRef, next);
      this.appendTaskActivity(transaction, next, actor.uid, {
        action: "expectation_rebased",
        previous_state: task.state,
        reason_code: "admin_expectation_rebase",
        reason_text: reason,
        idempotency_key: idempotencyKey,
        at: now,
      });
      return next;
    });
  }

  async previewRetention(
    actor: AuthenticatedUser,
    options: { as_of?: string; limit?: number } = {},
  ): Promise<WorkRetentionPlan> {
    assertAdmin(actor);
    const asOf = options.as_of
      ? new Date(assertFiniteIso(options.as_of, "Retention time")).toISOString()
      : this.readNow();
    const limit = normalizeRetentionLimit(options.limit);
    const queueSnapshot = await this.db
      .collection(WORK_ACCOUNTABILITY_COLLECTIONS.retentionQueue)
      .where("expires_at", "<=", asOf)
      .limit(limit * 3)
      .get();
    const queue = queueSnapshot.docs
      .map((doc) => readRecord<WorkRetentionQueueRecord>(doc.id, doc.data()))
      .filter((record) => !record.legal_hold)
      .sort(
        (left, right) =>
          left.expires_at.localeCompare(right.expires_at) ||
          left.queue_id.localeCompare(right.queue_id),
      );

    const candidates: WorkRetentionCandidate[] = [];
    for (const record of queue) {
      if (candidates.length >= limit) break;
      const targetSnapshot = await this.db
        .collection(record.target_collection)
        .doc(record.target_id)
        .get();
      if (!targetSnapshot.exists) {
        candidates.push(toRetentionCandidate(record));
        continue;
      }
      const target = targetSnapshot.data()!;
      if (target.legal_hold === true || target.state === "Active") continue;
      if (record.anchor_kind === "task_terminal") {
        const governingTaskId = record.governing_task_id;
        if (!governingTaskId) continue;
        const taskSnapshot = await this.taskRef(governingTaskId).get();
        if (!taskSnapshot.exists) continue;
        const task = readRecord<WorkTaskRecord>(taskSnapshot.id, taskSnapshot.data()!);
        if (
          !isTerminalTaskState(task.state) ||
          !task.retention_expires_at ||
          task.retention_expires_at > asOf ||
          task.legal_hold
        ) {
          continue;
        }
      }
      if (targetSnapshot.exists && (await this.hasRetentionDependency(record))) {
        continue;
      }
      candidates.push(toRetentionCandidate(record));
    }
    const planBase = { as_of: asOf, limit, candidates };
    return {
      ...planBase,
      plan_hash: stableHash(JSON.stringify(planBase)),
    };
  }

  async executeRetention(
    actor: AuthenticatedUser,
    input: { plan: WorkRetentionPlan; confirmation_hash: string },
  ): Promise<WorkRetentionReceipt> {
    assertAdmin(actor);
    if (input.confirmation_hash !== input.plan.plan_hash) {
      throw new WorkAccountabilityError(
        "Retention confirmation does not match the preview.",
        409,
        "retention_confirmation_mismatch",
      );
    }
    const receiptId = deterministicId("retention-receipt", input.plan.plan_hash);
    const receiptRef = this.db
      .collection(WORK_ACCOUNTABILITY_COLLECTIONS.retentionReceipts)
      .doc(receiptId);
    const existingReceipt = await receiptRef.get();
    if (existingReceipt.exists) {
      return readRecord<WorkRetentionReceipt>(
        existingReceipt.id,
        existingReceipt.data()!,
      );
    }
    const currentPlan = await this.previewRetention(actor, {
      as_of: input.plan.as_of,
      limit: input.plan.limit,
    });
    if (currentPlan.plan_hash !== input.plan.plan_hash) {
      throw new WorkAccountabilityError(
        "Retention candidates changed. Create and confirm a new preview.",
        409,
        "retention_plan_changed",
      );
    }
    const now = this.readNow();

    return this.db.runTransaction(async (transaction) => {
      const replaySnapshot = await transaction.get(receiptRef);
      if (replaySnapshot.exists) {
        return readRecord<WorkRetentionReceipt>(
          replaySnapshot.id,
          replaySnapshot.data()!,
        );
      }
      const snapshots = await Promise.all(
        currentPlan.candidates.map(async (candidate) => {
          const targetRef = this.db
            .collection(candidate.target_collection)
            .doc(candidate.target_id);
          const queueRef = this.db
            .collection(WORK_ACCOUNTABILITY_COLLECTIONS.retentionQueue)
            .doc(candidate.queue_id);
          const governingTaskRef = candidate.governing_task_id
            ? this.taskRef(candidate.governing_task_id)
            : undefined;
          const activeLocksQuery = candidate.governing_task_id
            ? this.db
                .collection(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions)
                .where("task_id", "==", candidate.governing_task_id)
            : undefined;
          const staleSessionLocksQuery =
            candidate.target_collection === WORK_ACCOUNTABILITY_COLLECTIONS.sessions
              ? this.db
                  .collection(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions)
                  .where("session_id", "==", candidate.target_id)
              : undefined;
          const taskActivityQuery =
            candidate.target_collection === WORK_ACCOUNTABILITY_COLLECTIONS.tasks
              ? this.db
                  .collection(WORK_ACCOUNTABILITY_COLLECTIONS.taskActivity)
                  .where("task_id", "==", candidate.target_id)
                  .limit(1)
              : undefined;
          const taskSessionsQuery =
            candidate.target_collection === WORK_ACCOUNTABILITY_COLLECTIONS.tasks
              ? this.db
                  .collection(WORK_ACCOUNTABILITY_COLLECTIONS.sessions)
                  .where("task_id", "==", candidate.target_id)
                  .limit(1)
              : undefined;
          const sessionCorrectionsQuery =
            candidate.target_collection === WORK_ACCOUNTABILITY_COLLECTIONS.sessions
              ? this.db
                  .collection(WORK_ACCOUNTABILITY_COLLECTIONS.corrections)
                  .where("session_id", "==", candidate.target_id)
                  .limit(1)
              : undefined;
          const [
            target,
            queue,
            governingTask,
            activeLocks,
            staleSessionLocks,
            taskActivity,
            taskSessions,
            sessionCorrections,
          ] = await Promise.all([
            transaction.get(targetRef),
            transaction.get(queueRef),
            governingTaskRef ? transaction.get(governingTaskRef) : undefined,
            activeLocksQuery ? transaction.get(activeLocksQuery) : undefined,
            staleSessionLocksQuery ? transaction.get(staleSessionLocksQuery) : undefined,
            taskActivityQuery ? transaction.get(taskActivityQuery) : undefined,
            taskSessionsQuery ? transaction.get(taskSessionsQuery) : undefined,
            sessionCorrectionsQuery
              ? transaction.get(sessionCorrectionsQuery)
              : undefined,
          ]);
          return {
            candidate,
            targetRef,
            queueRef,
            target,
            queue,
            governingTask,
            activeLocks,
            staleSessionLocks,
            taskActivity,
            taskSessions,
            sessionCorrections,
          };
        }),
      );
      const removed: Array<{ collection: string; id: string }> = [];
      let skipped = 0;
      for (const item of snapshots) {
        if (!item.queue.exists) {
          skipped += 1;
          continue;
        }
        const queue = readRecord<WorkRetentionQueueRecord>(
          item.queue.id,
          item.queue.data()!,
        );
        const target = item.target.exists ? item.target.data()! : undefined;
        const governingTask = item.governingTask?.exists
          ? readRecord<WorkTaskRecord>(item.governingTask.id, item.governingTask.data()!)
          : undefined;
        const terminalAnchorInvalid =
          item.target.exists &&
          queue.anchor_kind === "task_terminal" &&
          (!governingTask ||
            !isTerminalTaskState(governingTask.state) ||
            !governingTask.retention_expires_at ||
            governingTask.retention_expires_at > currentPlan.as_of ||
            governingTask.legal_hold ||
            (item.activeLocks?.docs.length ?? 0) > 0);
        const hasDependentRecord =
          item.target.exists &&
          ((item.candidate.target_collection === WORK_ACCOUNTABILITY_COLLECTIONS.tasks &&
            ((item.taskActivity?.docs.length ?? 0) > 0 ||
              (item.taskSessions?.docs.length ?? 0) > 0)) ||
            (item.candidate.target_collection ===
              WORK_ACCOUNTABILITY_COLLECTIONS.sessions &&
              (item.sessionCorrections?.docs.length ?? 0) > 0));
        if (
          queue.legal_hold ||
          queue.expires_at > currentPlan.as_of ||
          target?.legal_hold === true ||
          target?.state === "Active" ||
          terminalAnchorInvalid ||
          hasDependentRecord
        ) {
          skipped += 1;
          continue;
        }
        for (const lock of item.staleSessionLocks?.docs ?? []) {
          transaction.delete(lock.ref);
          removed.push({
            collection: WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions,
            id: lock.id,
          });
        }
        if (item.target.exists) transaction.delete(item.targetRef);
        transaction.delete(item.queueRef);
        removed.push({
          collection: item.candidate.target_collection,
          id: item.candidate.target_id,
        });
      }
      const receipt: WorkRetentionReceipt = {
        id: receiptId,
        plan_hash: currentPlan.plan_hash,
        as_of: currentPlan.as_of,
        actor_uid: actor.uid,
        removed_targets: removed,
        removed_count: removed.length,
        skipped_count: skipped,
        created_at: now,
        retention_policy_version: WORK_RETENTION_POLICY_VERSION,
        retention_expires_at: addRetentionPeriod(now),
        legal_hold: false,
      };
      transaction.create(receiptRef, receipt);
      this.queueRetention(transaction, {
        target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.retentionReceipts,
        target_id: receipt.id,
        expires_at: receipt.retention_expires_at,
        anchor_kind: "record_time",
        at: now,
      });
      return receipt;
    });
  }

  private endActiveSessionInTransaction(
    transaction: Transaction,
    task: WorkTaskRecord,
    session: WorkSessionRecord,
    lockRef: DocumentReference,
    plan: EndSessionPlan,
    now: string,
    idempotencyKey: string,
  ): WorkSessionRecord {
    const ended = endSessionRecord(session, plan, now);
    transaction.set(this.sessionRef(ended.id), ended);
    transaction.delete(lockRef);
    this.queueRetention(transaction, {
      target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.sessions,
      target_id: ended.id,
      expires_at: ended.retention_expires_at!,
      anchor_kind: "record_time",
      at: now,
    });
    if (!isTerminalTaskState(task.state)) {
      const paused: WorkTaskRecord = {
        ...task,
        state: "Paused",
        updated_at: now,
        record_version: task.record_version + 1,
      };
      transaction.set(this.taskRef(paused.id), paused);
      this.appendTaskActivity(transaction, paused, session.staff_uid, {
        action: "paused",
        previous_state: task.state,
        reason_code: plan.reason,
        idempotency_key: `${idempotencyKey}:${session.id}`,
        at: now,
      });
    }
    return ended;
  }

  private extendTerminalTaskRetention(
    transaction: Transaction,
    task: WorkTaskRecord,
    anchor: string,
  ): void {
    if (!isTerminalTaskState(task.state)) return;
    const proposed = addRetentionPeriod(anchor);
    if (task.retention_expires_at && task.retention_expires_at >= proposed) return;
    const next = { ...task, retention_expires_at: proposed };
    transaction.set(this.taskRef(task.id), next);
    this.queueRetention(transaction, {
      target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.tasks,
      target_id: task.id,
      expires_at: proposed,
      anchor_kind: "task_terminal",
      governing_task_id: task.id,
      at: anchor,
    });
  }

  private async hasRetentionDependency(
    record: WorkRetentionQueueRecord,
  ): Promise<boolean> {
    if (record.target_collection === WORK_ACCOUNTABILITY_COLLECTIONS.tasks) {
      const [activity, sessions, locks] = await Promise.all([
        this.db
          .collection(WORK_ACCOUNTABILITY_COLLECTIONS.taskActivity)
          .where("task_id", "==", record.target_id)
          .limit(1)
          .get(),
        this.db
          .collection(WORK_ACCOUNTABILITY_COLLECTIONS.sessions)
          .where("task_id", "==", record.target_id)
          .limit(1)
          .get(),
        this.db
          .collection(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions)
          .where("task_id", "==", record.target_id)
          .limit(1)
          .get(),
      ]);
      return !activity.empty || !sessions.empty || !locks.empty;
    }
    if (record.target_collection === WORK_ACCOUNTABILITY_COLLECTIONS.sessions) {
      const corrections = await this.db
        .collection(WORK_ACCOUNTABILITY_COLLECTIONS.corrections)
        .where("session_id", "==", record.target_id)
        .limit(1)
        .get();
      return !corrections.empty;
    }
    return false;
  }

  private async listActiveExpectations(): Promise<WorkExpectationRecord[]> {
    const snapshot = await this.db
      .collection(WORK_ACCOUNTABILITY_COLLECTIONS.expectations)
      .where("status", "==", "active")
      .limit(SNAPSHOT_RECORD_LIMIT)
      .get();
    return snapshot.docs
      .map((doc) => readRecord<WorkExpectationRecord>(doc.id, doc.data()))
      .sort((left, right) => left.expectation_key.localeCompare(right.expectation_key));
  }

  private async listActiveMappings(): Promise<WorkDerivationMappingRecord[]> {
    const snapshot = await this.db
      .collection(WORK_ACCOUNTABILITY_COLLECTIONS.mappings)
      .where("status", "==", "active")
      .limit(SNAPSHOT_RECORD_LIMIT)
      .get();
    return snapshot.docs
      .map((doc) => readRecord<WorkDerivationMappingRecord>(doc.id, doc.data()))
      .sort((left, right) => left.mapping_key.localeCompare(right.mapping_key));
  }

  private async readExpectationSnapshot(
    transaction: Transaction,
    key: string,
  ): Promise<WorkExpectationSnapshot | undefined> {
    const headSnapshot = await transaction.get(this.expectationHeadRef(key));
    if (!headSnapshot.exists) return undefined;
    const head = readRecord<WorkExpectationHead>(headSnapshot.id, headSnapshot.data()!);
    const recordSnapshot = await transaction.get(
      this.expectationRef(head.expectation_id),
    );
    if (!recordSnapshot.exists) {
      throw new WorkAccountabilityError(
        "The matching expectation is unavailable. Refresh and retry.",
        409,
        "expectation_head_drift",
      );
    }
    const record = readRecord<WorkExpectationRecord>(
      recordSnapshot.id,
      recordSnapshot.data()!,
    );
    if (record.status !== "active" || record.version !== head.version) {
      throw new WorkAccountabilityError(
        "The matching expectation changed. Refresh and retry.",
        409,
        "expectation_changed",
      );
    }
    return {
      expectation_id: record.id,
      expectation_key: record.expectation_key,
      version: record.version,
      minimum_minutes: record.minimum_minutes,
      maximum_minutes: record.maximum_minutes,
      effective_at: record.effective_at,
    };
  }

  private readNow(): string {
    const now = this.now();
    return new Date(assertFiniteIso(now, "Server time")).toISOString();
  }

  private taskRef(id: string) {
    return this.db.collection(WORK_ACCOUNTABILITY_COLLECTIONS.tasks).doc(id);
  }

  private sessionRef(id: string) {
    return this.db.collection(WORK_ACCOUNTABILITY_COLLECTIONS.sessions).doc(id);
  }

  private expectationRef(id: string) {
    return this.db.collection(WORK_ACCOUNTABILITY_COLLECTIONS.expectations).doc(id);
  }

  private expectationHeadRef(key: string) {
    return this.db
      .collection(WORK_ACCOUNTABILITY_COLLECTIONS.expectationHeads)
      .doc(deterministicId("expectation-head", key));
  }

  private mappingRef(id: string) {
    return this.db.collection(WORK_ACCOUNTABILITY_COLLECTIONS.mappings).doc(id);
  }

  private mappingHeadRef(key: string) {
    return this.db
      .collection(WORK_ACCOUNTABILITY_COLLECTIONS.mappingHeads)
      .doc(deterministicId("mapping-head", key));
  }

  private activeSessionRef(uid: string) {
    return this.db
      .collection(WORK_ACCOUNTABILITY_COLLECTIONS.activeSessions)
      .doc(normalizeOpaqueId(uid, "User id"));
  }

  private appendTaskActivity(
    transaction: Transaction,
    task: WorkTaskRecord,
    actorUid: string,
    input: {
      action: WorkTaskActivityAction;
      record_id?: string;
      previous_state: WorkTaskState | undefined;
      reason_code: string;
      reason_text?: string;
      idempotency_key: string;
      at: string;
    },
  ): WorkTaskActivityRecord {
    const activityId =
      input.record_id ??
      deterministicId("task-activity", task.id, input.idempotency_key, input.action);
    const activity: WorkTaskActivityRecord = {
      id: activityId,
      task_id: task.id,
      actor_uid: actorUid,
      action: input.action,
      ...(input.previous_state ? { previous_state: input.previous_state } : {}),
      new_state: task.state,
      reason_code: input.reason_code,
      ...(input.reason_text ? { reason_text: input.reason_text } : {}),
      idempotency_key: stableHash(input.idempotency_key),
      task_version: task.record_version,
      created_at: input.at,
      retention_policy_version: WORK_RETENTION_POLICY_VERSION,
      legal_hold: false,
    };
    transaction.create(
      this.db.collection(WORK_ACCOUNTABILITY_COLLECTIONS.taskActivity).doc(activityId),
      activity,
    );
    this.queueRetention(transaction, {
      target_collection: WORK_ACCOUNTABILITY_COLLECTIONS.taskActivity,
      target_id: activityId,
      expires_at: addRetentionPeriod(input.at),
      anchor_kind: "task_terminal",
      governing_task_id: task.id,
      at: input.at,
    });
    return activity;
  }

  private queueRetention(
    transaction: Transaction,
    input: Omit<WorkRetentionCandidate, "queue_id"> & { at: string },
  ): WorkRetentionQueueRecord {
    const queueId = deterministicId(
      "retention",
      input.target_collection,
      input.target_id,
    );
    const record: WorkRetentionQueueRecord = {
      queue_id: queueId,
      target_collection: input.target_collection,
      target_id: input.target_id,
      expires_at: input.expires_at,
      anchor_kind: input.anchor_kind,
      ...(input.governing_task_id ? { governing_task_id: input.governing_task_id } : {}),
      legal_hold: false,
      created_at: input.at,
      retention_policy_version: WORK_RETENTION_POLICY_VERSION,
    };
    transaction.set(
      this.db.collection(WORK_ACCOUNTABILITY_COLLECTIONS.retentionQueue).doc(queueId),
      record,
    );
    return record;
  }
}

function normalizeTaskInput(input: CreateWorkTaskInput): CreateWorkTaskInput {
  const spaceId = normalizeOpaqueId(input.space_id, "Space id");
  const sourceType = input.source.type;
  const dueAt = input.due_at
    ? new Date(assertFiniteIso(input.due_at, "Due time")).toISOString()
    : undefined;
  return {
    space_id: spaceId,
    source: {
      type: sourceType,
      ...(sourceType !== "manual"
        ? { id: normalizeOpaqueId(input.source.id, "Source id") }
        : {}),
    },
    task_type: normalizeShortText(input.task_type, "Task type", 100),
    title: normalizeShortText(input.title, "Task title", 160),
    ...(input.assignee_uid
      ? { assignee_uid: normalizeOpaqueId(input.assignee_uid, "Assignee id") }
      : {}),
    next_action: normalizeShortText(input.next_action, "Next action", 240),
    ...(dueAt ? { due_at: dueAt } : {}),
    ...(input.expectation_key
      ? {
          expectation_key: normalizeShortText(
            input.expectation_key,
            "Expectation key",
            160,
          ),
        }
      : {}),
    idempotency_key: normalizeOpaqueId(input.idempotency_key, "Idempotency key"),
  };
}

function normalizeExpectationInput(
  input: CreateWorkExpectationInput,
): CreateWorkExpectationInput {
  if (
    !Number.isSafeInteger(input.minimum_minutes) ||
    !Number.isSafeInteger(input.maximum_minutes) ||
    input.minimum_minutes <= 0 ||
    input.maximum_minutes < input.minimum_minutes
  ) {
    throw new WorkAccountabilityError(
      "Expected minutes must be positive integers and maximum must be at least minimum.",
    );
  }
  return {
    expectation_key: normalizeShortText(input.expectation_key, "Expectation key", 160),
    task_type: normalizeShortText(input.task_type, "Task type", 100),
    ...(input.space_id
      ? { space_id: normalizeOpaqueId(input.space_id, "Space id") }
      : {}),
    minimum_minutes: input.minimum_minutes,
    maximum_minutes: input.maximum_minutes,
    rationale: normalizeShortText(input.rationale, "Rationale", 500),
    idempotency_key: normalizeOpaqueId(input.idempotency_key, "Idempotency key"),
  };
}

function normalizeMappingInput(input: CreateWorkMappingInput): CreateWorkMappingInput {
  return {
    mapping_key: normalizeShortText(input.mapping_key, "Mapping key", 160),
    source_type: input.source_type,
    actionable_unit: normalizeShortText(input.actionable_unit, "Actionable unit", 160),
    task_type: normalizeShortText(input.task_type, "Task type", 100),
    title: normalizeShortText(input.title, "Task title", 160),
    next_action: normalizeShortText(input.next_action, "Next action", 240),
    ...(input.space_id
      ? { space_id: normalizeOpaqueId(input.space_id, "Space id") }
      : {}),
    ...(input.assignee_uid
      ? { assignee_uid: normalizeOpaqueId(input.assignee_uid, "Assignee id") }
      : {}),
    rationale: normalizeShortText(input.rationale, "Rationale", 500),
    idempotency_key: normalizeOpaqueId(input.idempotency_key, "Idempotency key"),
  };
}

function assertAssignable(
  uid: string,
  spaceId: string | undefined,
  roster: readonly WorkAssignableUser[],
): WorkAssignableUser {
  const candidate = roster.find((user) => user.uid === uid);
  if (!candidate) {
    throw new WorkAccountabilityError(
      "The assignee is not an active managed staff identity.",
      409,
      "assignee_unavailable",
    );
  }
  if (
    spaceId &&
    !canAccessSpaceId(
      {
        uid: candidate.uid,
        email: candidate.email,
        hd: candidate.email.split("@")[1] ?? "",
        role: candidate.role,
        scopes: candidate.scopes,
      },
      spaceId,
    )
  ) {
    throw new WorkAccountabilityError(
      "The assignee cannot access the task Space.",
      409,
      "assignee_scope_denied",
    );
  }
  return candidate;
}

function assertTaskReadable(actor: AuthenticatedUser, task: WorkTaskRecord): void {
  if (
    actor.role !== "Admin" &&
    (task.assignee_uid !== actor.uid || !canAccessSpaceId(actor, task.space_id))
  ) {
    throwNonEnumerating();
  }
}

function assertAdmin(actor: AuthenticatedUser): void {
  if (actor.role !== "Admin") throwNonEnumerating();
}

function throwNonEnumerating(): never {
  throw new WorkAccountabilityError(NON_ENUMERATING_DENIAL, 404, "not_found");
}

function readRecord<T>(id: string, data: DocumentData): T {
  return { ...data, id } as T;
}

function deterministicId(...parts: string[]): string {
  return `wa_${stableHash(parts.join("\u001f")).slice(0, 40)}`;
}

function stableHash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function expectationKey(spaceId: string, taskType: string): string {
  return `${spaceId}:${taskType}`;
}

function defaultSourceSpace(
  sourceType: Exclude<WorkSourceType, "manual">,
): string | undefined {
  if (sourceType === "renewal_lease") return "lease-renewals";
  if (sourceType === "maintenance_ticket") return "maintenance-work-order-intake";
  return undefined;
}

function compareTasks(left: WorkTaskRecord, right: WorkTaskRecord): number {
  const leftTerminal = isTerminalTaskState(left.state) ? 1 : 0;
  const rightTerminal = isTerminalTaskState(right.state) ? 1 : 0;
  if (leftTerminal !== rightTerminal) return leftTerminal - rightTerminal;
  const leftDue = left.due_at ?? "9999";
  const rightDue = right.due_at ?? "9999";
  return (
    leftDue.localeCompare(rightDue) || right.updated_at.localeCompare(left.updated_at)
  );
}

function normalizeTransitionInput(
  input: TransitionWorkTaskInput,
): TransitionWorkTaskInput {
  if (!(WORK_TASK_STATES as readonly string[]).includes(input.next_state)) {
    throw new WorkAccountabilityError("Invalid work state.");
  }
  if (input.next_state === "In progress") {
    throw new WorkAccountabilityError(
      "In progress begins only through the explicit Start work action.",
      409,
      "explicit_start_required",
    );
  }
  assertPositiveVersion(input.expected_version, "Task version");
  const reason = input.reason
    ? normalizeShortText(input.reason, "Transition reason", 500)
    : undefined;
  if ((input.next_state === "Blocked" || input.next_state === "Cancelled") && !reason) {
    throw new WorkAccountabilityError(`${input.next_state} work requires a reason.`);
  }
  return {
    task_id: normalizeOpaqueId(input.task_id, "Task id"),
    expected_version: input.expected_version,
    next_state: input.next_state,
    ...(reason ? { reason } : {}),
    ...(input.outcome_note
      ? {
          outcome_note: normalizeShortText(input.outcome_note, "Outcome note", 500),
        }
      : {}),
    idempotency_key: normalizeOpaqueId(input.idempotency_key, "Idempotency key"),
  };
}

function activityForTransition(
  current: WorkTaskState,
  next: WorkTaskState,
): WorkTaskActivityAction {
  if (next === "Paused" && isTerminalTaskState(current)) return "reopened";
  if (next === "Paused") return "paused";
  if (next === "Blocked") return "blocked";
  if (next === "Completed") return "completed";
  if (next === "Cancelled") return "cancelled";
  return current === "Not started" ? "started" : "resumed";
}

function reasonCodeForTransition(current: WorkTaskState, next: WorkTaskState): string {
  if (next === "Paused" && isTerminalTaskState(current)) return "admin_reopen";
  if (next === "Paused") return "manual_pause";
  if (next === "Blocked") return "blocked";
  if (next === "Completed") return "completed";
  if (next === "Cancelled") return "cancelled";
  return "explicit_start";
}

function endReasonForTransition(next: WorkTaskState): WorkSessionEndReason {
  if (next === "Blocked") return "blocked";
  if (next === "Completed") return "completed";
  if (next === "Cancelled") return "cancelled";
  return "manual_pause";
}

function transitionedTask(
  current: WorkTaskRecord,
  input: TransitionWorkTaskInput,
  now: string,
): WorkTaskRecord {
  if (
    isTerminalTaskState(current.state) &&
    input.next_state === "Paused" &&
    !input.reason
  ) {
    throw new WorkAccountabilityError("Reopening work requires a reason.");
  }
  const next: WorkTaskRecord = {
    ...current,
    state: input.next_state,
    updated_at: now,
    record_version: current.record_version + 1,
  };
  if (input.next_state === "Blocked") {
    next.blocker_reason = input.reason;
  } else {
    delete next.blocker_reason;
  }
  if (input.next_state === "Completed") {
    next.completed_at = now;
    next.retention_expires_at = addRetentionPeriod(now);
    if (input.outcome_note) next.outcome_note = input.outcome_note;
  }
  if (input.next_state === "Cancelled") {
    next.cancel_reason = input.reason;
    next.cancelled_at = now;
    next.retention_expires_at = addRetentionPeriod(now);
  }
  if (isTerminalTaskState(current.state) && input.next_state === "Paused") {
    next.reopen_reason = input.reason;
    delete next.completed_at;
    delete next.cancelled_at;
    delete next.retention_expires_at;
  }
  return next;
}

function cutoffAwareEndPlan(
  session: WorkSessionRecord,
  now: string,
  intendedReason: WorkSessionEndReason,
): EndSessionPlan {
  const cutoff = idleCutoffAt(session.last_acknowledged_activity_at);
  if (assertFiniteIso(now, "Server time") >= assertFiniteIso(cutoff, "Idle cutoff")) {
    return {
      end_at: cutoff,
      reason: "disconnect_review",
      correction_state: "needs_review",
    };
  }
  return { end_at: now, reason: intendedReason };
}

function endSessionRecord(
  session: WorkSessionRecord,
  plan: EndSessionPlan,
  now: string,
): WorkSessionRecord {
  if (session.state !== "Active") return session;
  const endAt = new Date(assertFiniteIso(plan.end_at, "Session end")).toISOString();
  return {
    ...session,
    state: "Ended",
    original_end_at: endAt,
    end_reason: plan.reason,
    effective_end_at: endAt,
    effective_minutes: durationMinutes(session.effective_start_at, endAt),
    correction_state: plan.correction_state ?? session.correction_state,
    record_version: session.record_version + 1,
    updated_at: now,
    retention_expires_at: addRetentionPeriod(endAt),
  };
}

function assertTaskOwned(actor: AuthenticatedUser, task: WorkTaskRecord): void {
  if (task.assignee_uid !== actor.uid || !canAccessSpaceId(actor, task.space_id)) {
    throwNonEnumerating();
  }
}

function assertTaskMutable(actor: AuthenticatedUser, task: WorkTaskRecord): void {
  if (actor.role === "Admin") return;
  assertTaskOwned(actor, task);
}

function assertSessionOwned(actor: AuthenticatedUser, session: WorkSessionRecord): void {
  if (session.staff_uid !== actor.uid) throwNonEnumerating();
}

function assertSessionMutable(
  actor: AuthenticatedUser,
  session: WorkSessionRecord,
): void {
  if (actor.role !== "Admin") assertSessionOwned(actor, session);
}

function assertPositiveVersion(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new WorkAccountabilityError(`${label} must be a positive integer.`);
  }
}

function throwVersionConflict(label: string): never {
  throw new WorkAccountabilityError(
    `${label} changed. Refresh before retrying.`,
    409,
    "version_conflict",
  );
}

function intervalsOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
): boolean {
  return (
    assertFiniteIso(leftStart, "Interval start") <
      assertFiniteIso(rightEnd, "Interval end") &&
    assertFiniteIso(rightStart, "Interval start") <
      assertFiniteIso(leftEnd, "Interval end")
  );
}

function normalizeRetentionLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_RETENTION_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RETENTION_LIMIT) {
    throw new WorkAccountabilityError(
      `Retention limit must be between 1 and ${MAX_RETENTION_LIMIT}.`,
    );
  }
  return limit;
}

function toRetentionCandidate(record: WorkRetentionQueueRecord): WorkRetentionCandidate {
  return {
    queue_id: record.queue_id,
    target_collection: record.target_collection,
    target_id: record.target_id,
    expires_at: record.expires_at,
    anchor_kind: record.anchor_kind,
    ...(record.governing_task_id ? { governing_task_id: record.governing_task_id } : {}),
  };
}
