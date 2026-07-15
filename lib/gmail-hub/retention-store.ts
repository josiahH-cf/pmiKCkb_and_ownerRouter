import type { Firestore } from "firebase-admin/firestore";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  assertCommunicationsCleanupLimit,
  bodylessRetentionAuditFields,
  buildCommunicationsLegalHoldTransition,
  COMMUNICATIONS_RETENTION_POLICY_VERSION,
  COMMUNICATIONS_RETENTION_TARGETS,
  CommunicationsLegalHoldInputSchema,
  DEFAULT_COMMUNICATIONS_CLEANUP_LIMIT,
  hashRetentionText,
  MAX_COMMUNICATIONS_CLEANUP_LIMIT,
  type CommunicationsLegalHoldInput,
  type CommunicationsRetentionCandidate,
  type CommunicationsRetentionCollection,
  isCommunicationsCleanupEligible,
  legalHoldAuditId,
  parseRetentionCandidate,
  planCommunicationsCleanup,
} from "@/lib/gmail-hub/retention-policy";

export const GMAIL_RETENTION_AUDIT_COLLECTION = "gmail_retention_audit";
export const GMAIL_RETENTION_CLEANUP_RUN_COLLECTION = "gmail_retention_cleanup_runs";

export interface CommunicationsCleanupRunProgress {
  completed?: boolean;
  deletedCounts: Readonly<Record<string, number>>;
  failedCount: number;
  plannedCount: number;
  processedCount: number;
}

export interface CommunicationsCleanupRunInitialization {
  candidateHashes: readonly string[];
  cleanupLimit: number;
  completed: boolean;
  plannedCount: number;
}

export interface CommunicationsCleanupStore {
  /** Returns at most `collection count * limit` query-filtered records for a globally limited plan. */
  listCandidates(
    nowMs: number,
    limit: number,
  ): Promise<CommunicationsRetentionCandidate[]>;
  deleteIfEligible(
    candidate: CommunicationsRetentionCandidate,
    nowMs: number,
    runId?: string,
  ): Promise<boolean>;
  initializeRun?(input: {
    candidateHashes: readonly string[];
    cleanupLimit: number;
    runId: string;
    nowMs: number;
    plannedCount: number;
  }): Promise<CommunicationsCleanupRunInitialization | void>;
  recordFailure?(
    candidate: CommunicationsRetentionCandidate,
    runId: string,
  ): Promise<void>;
  /**
   * Accounts for frozen, bodyless candidate hashes that a bounded resume query can no longer
   * resolve. They are failed (and therefore retried under a new run), never silently skipped.
   */
  recordUnresolvedHashes?(
    candidateHashes: readonly string[],
    runId: string,
  ): Promise<void>;
  readRunProgress?(runId: string): Promise<CommunicationsCleanupRunProgress>;
  writeCountsAudit(input: {
    runId: string;
    nowMs: number;
    plannedCount: number;
    failedCount: number;
    deletedCounts: Readonly<Record<string, number>>;
  }): Promise<"created" | "duplicate">;
}

export async function runCommunicationsCleanup(input: {
  store: CommunicationsCleanupStore;
  nowMs: number;
  limit?: number;
  runId?: string;
}) {
  const limit = input.limit ?? DEFAULT_COMMUNICATIONS_CLEANUP_LIMIT;
  assertCommunicationsCleanupLimit(limit);
  const runId = normalizeCleanupRunId(input.runId ?? `cleanup-${input.nowMs}`);
  const plan = planCommunicationsCleanup(
    await input.store.listCandidates(input.nowMs, limit),
    input.nowMs,
    limit,
  );
  const candidateHashes = plan.candidates.map(cleanupCandidateHash);
  const deletedCounts: Record<string, number> = {};
  let deletedCount = 0;
  let failedCount = 0;
  const initialized = await input.store.initializeRun?.({
    candidateHashes,
    cleanupLimit: limit,
    runId,
    nowMs: input.nowMs,
    plannedCount: plan.candidates.length,
  });
  if (initialized) assertCleanupRunInitialization(initialized);
  const frozenCandidateHashes = initialized ? new Set(initialized.candidateHashes) : null;
  const candidates = initialized?.completed
    ? []
    : plan.candidates.filter(
        (candidate) =>
          frozenCandidateHashes === null ||
          frozenCandidateHashes.has(cleanupCandidateHash(candidate)),
      );
  if (initialized && !initialized.completed) {
    const resolvedHashes = new Set(candidates.map(cleanupCandidateHash));
    const unresolvedHashes = initialized.candidateHashes.filter(
      (candidateHash) => !resolvedHashes.has(candidateHash),
    );
    if (unresolvedHashes.length > 0) {
      await input.store.recordUnresolvedHashes?.(unresolvedHashes, runId);
    }
  }
  for (const candidate of candidates) {
    try {
      if (await input.store.deleteIfEligible(candidate, input.nowMs, runId)) {
        deletedCount += 1;
        deletedCounts[candidate.retention_class] =
          (deletedCounts[candidate.retention_class] ?? 0) + 1;
      }
    } catch {
      // Keep the worker bounded and bodyless: a failed candidate is counted, not logged with its id
      // or provider error. A later run safely retries because deletion rechecks inside a transaction.
      failedCount += 1;
      await input.store.recordFailure?.(candidate, runId);
    }
  }
  const progress = await input.store.readRunProgress?.(runId);
  const finalDeletedCounts = progress ? { ...progress.deletedCounts } : deletedCounts;
  const finalFailedCount = progress?.failedCount ?? failedCount;
  const finalPlannedCount = progress?.plannedCount ?? plan.candidates.length;
  const finalProcessedCount = progress?.processedCount ?? candidates.length - failedCount;
  const finalDeletedCount = Object.values(finalDeletedCounts).reduce(
    (total, count) => total + count,
    0,
  );
  const cleanupLimit = initialized?.cleanupLimit ?? limit;
  if (
    initialized &&
    (finalPlannedCount !== initialized.plannedCount || cleanupLimit !== limit)
  ) {
    throw new Error("Cleanup run progress does not match its frozen plan.");
  }
  assertCleanupRunCounts({
    cleanupLimit,
    deletedCounts: finalDeletedCounts,
    failedCount: finalFailedCount,
    plannedCount: finalPlannedCount,
  });
  if (finalProcessedCount + finalFailedCount !== finalPlannedCount) {
    throw new Error(
      "Cleanup run cannot finalize until every frozen candidate is processed or failed.",
    );
  }
  const auditStatus = await input.store.writeCountsAudit({
    runId,
    nowMs: input.nowMs,
    plannedCount: finalPlannedCount,
    failedCount: finalFailedCount,
    deletedCounts: finalDeletedCounts,
  });
  return {
    policyVersion: COMMUNICATIONS_RETENTION_POLICY_VERSION,
    runId,
    plannedCount: finalPlannedCount,
    deletedCount: progress ? finalDeletedCount : deletedCount,
    failedCount: finalFailedCount,
    deletedCounts: finalDeletedCounts,
    auditStatus,
  };
}

export class FirestoreCommunicationsCleanupStore implements CommunicationsCleanupStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async listCandidates(nowMs: number, limit: number) {
    assertCommunicationsCleanupLimit(limit);
    const candidates: CommunicationsRetentionCandidate[] = [];
    for (const collection of Object.keys(
      COMMUNICATIONS_RETENTION_TARGETS,
    ) as CommunicationsRetentionCollection[]) {
      // Each collection query is independently bounded. Taking the first global `limit` after the
      // merge still includes the globally earliest candidates: no collection needs more than `limit`
      // rows to contribute to a plan of that size.
      const snapshot = await this.db
        .collection(collection)
        .where("legal_hold", "==", false)
        .where("expires_at_ms", "<=", nowMs)
        .orderBy("expires_at_ms", "asc")
        .limit(limit)
        .get();
      for (const doc of snapshot.docs) {
        const candidate = parseRetentionCandidate(collection, doc.id, doc.data());
        if (candidate) candidates.push(candidate);
      }
    }
    return candidates;
  }

  async initializeRun(input: {
    candidateHashes: readonly string[];
    cleanupLimit: number;
    runId: string;
    nowMs: number;
    plannedCount: number;
  }): Promise<CommunicationsCleanupRunInitialization> {
    assertCommunicationsCleanupLimit(input.cleanupLimit);
    const candidateHashes = assertCandidateHashes(input.candidateHashes);
    if (
      candidateHashes.length !== input.plannedCount ||
      input.plannedCount > input.cleanupLimit
    ) {
      throw new Error("Cleanup run candidate hashes do not match the bounded plan.");
    }
    const runId = normalizeCleanupRunId(input.runId);
    const ref = this.cleanupRunRef(runId);
    const auditRef = this.db
      .collection(GMAIL_RETENTION_AUDIT_COLLECTION)
      .doc(cleanupAuditId(runId));
    return this.db.runTransaction(async (transaction) => {
      const [snapshot, auditSnapshot] = await Promise.all([
        transaction.get(ref),
        transaction.get(auditRef),
      ]);
      if (snapshot.exists) {
        const existing = snapshot.data() as Record<string, unknown>;
        if (
          existing.run_id_hash !== hashRetentionText(runId) ||
          existing.started_at_ms !== input.nowMs ||
          existing.policy_version !== COMMUNICATIONS_RETENTION_POLICY_VERSION
        ) {
          throw new Error("Cleanup run id was already used for a different run.");
        }
        const state = parseCleanupRunState(existing);
        if (state.cleanupLimit !== input.cleanupLimit) {
          throw new Error("Cleanup run id was already used with a different limit.");
        }
        if (state.completed !== auditSnapshot.exists) {
          throw new Error("Cleanup run completion and audit state disagree.");
        }
        return cleanupRunInitialization(state);
      }
      if (auditSnapshot.exists) {
        throw new Error(
          "Cleanup run was already completed and its frozen plan is no longer available.",
        );
      }
      transaction.create(ref, {
        cleanup_limit: input.cleanupLimit,
        run_id_hash: hashRetentionText(runId),
        policy_version: COMMUNICATIONS_RETENTION_POLICY_VERSION,
        started_at_ms: input.nowMs,
        planned_count: input.plannedCount,
        planned_candidate_hashes: candidateHashes,
        processed_hashes: [],
        failed_hashes: [],
        failed_count: 0,
        deleted_counts: {},
        ...bodylessRetentionAuditFields(input.nowMs),
      });
      return {
        candidateHashes,
        cleanupLimit: input.cleanupLimit,
        completed: false,
        plannedCount: input.plannedCount,
      };
    });
  }

  async deleteIfEligible(
    candidate: CommunicationsRetentionCandidate,
    nowMs: number,
    runId?: string,
  ) {
    const ref = this.db.collection(candidate.collection).doc(candidate.id);
    return this.db.runTransaction(async (transaction) => {
      const runRef = runId ? this.cleanupRunRef(normalizeCleanupRunId(runId)) : null;
      const [snapshot, runSnapshot] = await Promise.all([
        transaction.get(ref),
        runRef ? transaction.get(runRef) : Promise.resolve(null),
      ]);
      const candidateHash = cleanupCandidateHash(candidate);
      if (runRef) {
        if (!runSnapshot?.exists) throw new Error("Cleanup run was not initialized.");
        const run = runSnapshot.data() as Record<string, unknown>;
        const state = parseCleanupRunState(run);
        if (state.completed || !state.candidateHashes.includes(candidateHash)) {
          return false;
        }
        if (
          state.processedHashes.includes(candidateHash) ||
          state.failedHashes.includes(candidateHash)
        ) {
          return false;
        }
      }
      const current = snapshot.exists
        ? parseRetentionCandidate(candidate.collection, snapshot.id, snapshot.data())
        : null;
      if (!current || !isCommunicationsCleanupEligible(current, nowMs)) {
        if (runRef && runSnapshot) {
          const state = parseCleanupRunState(
            runSnapshot.data() as Record<string, unknown>,
          );
          const processedHashes = [...state.processedHashes, candidateHash];
          assertCleanupRunMutation(state, processedHashes, state.failedHashes);
          transaction.update(runRef, {
            processed_hashes: processedHashes,
          });
        }
        return false;
      }
      if (
        current.retention_anchor_at_ms !== candidate.retention_anchor_at_ms ||
        current.expires_at_ms !== candidate.expires_at_ms
      ) {
        if (runRef && runSnapshot) {
          const state = parseCleanupRunState(
            runSnapshot.data() as Record<string, unknown>,
          );
          const processedHashes = [...state.processedHashes, candidateHash];
          assertCleanupRunMutation(state, processedHashes, state.failedHashes);
          transaction.update(runRef, {
            processed_hashes: processedHashes,
          });
        }
        return false;
      }
      transaction.delete(ref);
      if (runRef && runSnapshot) {
        const state = parseCleanupRunState(runSnapshot.data() as Record<string, unknown>);
        const processedHashes = [...state.processedHashes, candidateHash];
        assertCleanupRunMutation(state, processedHashes, state.failedHashes);
        const counts = state.deletedCounts;
        const nextCounts = {
          ...counts,
          [candidate.retention_class]: (counts[candidate.retention_class] ?? 0) + 1,
        };
        assertCleanupRunCounts({
          cleanupLimit: state.cleanupLimit,
          deletedCounts: nextCounts,
          failedCount: state.failedHashes.length,
          plannedCount: state.plannedCount,
        });
        if (sumCounts(nextCounts) > processedHashes.length) {
          throw new Error("Cleanup run deletion counts exceed processed candidates.");
        }
        transaction.update(runRef, {
          processed_hashes: processedHashes,
          deleted_counts: nextCounts,
        });
      }
      return true;
    });
  }

  async recordFailure(candidate: CommunicationsRetentionCandidate, runId: string) {
    const ref = this.cleanupRunRef(normalizeCleanupRunId(runId));
    const candidateHash = cleanupCandidateHash(candidate);
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("Cleanup run was not initialized.");
      const run = snapshot.data() as Record<string, unknown>;
      const state = parseCleanupRunState(run);
      if (state.completed) return;
      if (!state.candidateHashes.includes(candidateHash)) {
        throw new Error("Cleanup failure is outside the frozen run plan.");
      }
      if (
        state.processedHashes.includes(candidateHash) ||
        state.failedHashes.includes(candidateHash)
      ) {
        return;
      }
      const failedHashes = [...state.failedHashes, candidateHash];
      assertCleanupRunMutation(state, state.processedHashes, failedHashes);
      transaction.update(ref, {
        failed_hashes: failedHashes,
        failed_count: failedHashes.length,
      });
    });
  }

  async recordUnresolvedHashes(candidateHashes: readonly string[], runId: string) {
    const unresolved = assertCandidateHashes(candidateHashes);
    if (unresolved.length === 0) return;
    const ref = this.cleanupRunRef(normalizeCleanupRunId(runId));
    await this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw new Error("Cleanup run was not initialized.");
      const state = parseCleanupRunState(snapshot.data() as Record<string, unknown>);
      if (state.completed) return;
      const planned = new Set(state.candidateHashes);
      if (unresolved.some((candidateHash) => !planned.has(candidateHash))) {
        throw new Error("Cleanup unresolved hash is outside the frozen run plan.");
      }
      const failedHashes = [
        ...state.failedHashes,
        ...unresolved.filter(
          (candidateHash) =>
            !state.processedHashes.includes(candidateHash) &&
            !state.failedHashes.includes(candidateHash),
        ),
      ];
      assertCleanupRunMutation(state, state.processedHashes, failedHashes);
      transaction.update(ref, {
        failed_hashes: failedHashes,
        failed_count: failedHashes.length,
      });
    });
  }

  async readRunProgress(runId: string): Promise<CommunicationsCleanupRunProgress> {
    const snapshot = await this.cleanupRunRef(normalizeCleanupRunId(runId)).get();
    if (!snapshot.exists) throw new Error("Cleanup run was not initialized.");
    const state = parseCleanupRunState(snapshot.data() as Record<string, unknown>);
    return {
      completed: state.completed,
      deletedCounts: state.deletedCounts,
      failedCount: state.failedHashes.length,
      plannedCount: state.plannedCount,
      processedCount: state.processedHashes.length,
    };
  }

  async writeCountsAudit(input: {
    runId: string;
    nowMs: number;
    plannedCount: number;
    failedCount: number;
    deletedCounts: Readonly<Record<string, number>>;
  }) {
    const auditRef = this.db
      .collection(GMAIL_RETENTION_AUDIT_COLLECTION)
      .doc(cleanupAuditId(input.runId));
    const runRef = this.cleanupRunRef(normalizeCleanupRunId(input.runId));
    return this.db.runTransaction(async (transaction) => {
      const [auditSnapshot, runSnapshot] = await Promise.all([
        transaction.get(auditRef),
        transaction.get(runRef),
      ]);
      const progress = runSnapshot.exists
        ? parseCleanupRunState(runSnapshot.data() as Record<string, unknown>)
        : null;
      if (
        runSnapshot.exists &&
        (runSnapshot.data()?.run_id_hash !== hashRetentionText(input.runId) ||
          runSnapshot.data()?.started_at_ms !== input.nowMs)
      ) {
        throw new Error("Cleanup audit does not match its frozen run.");
      }
      if (auditSnapshot.exists) {
        if (progress && !progress.completed) {
          throw new Error("Cleanup run completion and audit state disagree.");
        }
        return "duplicate" as const;
      }
      if (progress?.completed) {
        throw new Error("Cleanup run completion and audit state disagree.");
      }
      const deletedCounts = progress ? progress.deletedCounts : input.deletedCounts;
      const failedCount = progress ? progress.failedHashes.length : input.failedCount;
      const plannedCount = progress ? progress.plannedCount : input.plannedCount;
      assertCleanupRunCounts({
        cleanupLimit: progress?.cleanupLimit ?? MAX_COMMUNICATIONS_CLEANUP_LIMIT,
        deletedCounts,
        failedCount,
        plannedCount,
      });
      if (
        progress &&
        progress.processedHashes.length + progress.failedHashes.length !== plannedCount
      ) {
        throw new Error(
          "Cleanup run cannot finalize until every frozen candidate is processed or failed.",
        );
      }
      transaction.create(auditRef, {
        action: "cleanup_completed",
        run_id_hash: hashRetentionText(input.runId),
        policy_version: COMMUNICATIONS_RETENTION_POLICY_VERSION,
        planned_count: plannedCount,
        deleted_count: Object.values(deletedCounts).reduce(
          (total, count) => total + count,
          0,
        ),
        failed_count: failedCount,
        deleted_counts: deletedCounts,
        created_at_ms: input.nowMs,
        ...bodylessRetentionAuditFields(input.nowMs),
      });
      if (runSnapshot.exists) {
        transaction.update(runRef, {
          completed_at_ms: input.nowMs,
          audit_id: auditRef.id,
        });
      }
      return "created" as const;
    });
  }

  private cleanupRunRef(runId: string) {
    return this.db
      .collection(GMAIL_RETENTION_CLEANUP_RUN_COLLECTION)
      .doc(cleanupAuditId(runId));
  }
}

export async function applyCommunicationsLegalHold(
  actor: AuthenticatedUser,
  input: CommunicationsLegalHoldInput,
  db: Firestore = getAdminFirestore(),
  nowMs = Date.now(),
) {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError("Only an Admin may change a legal hold.", 403);
  }
  const parsed = CommunicationsLegalHoldInputSchema.parse(input);
  const recordRef = db.collection(parsed.collection).doc(parsed.recordId);
  const auditId = legalHoldAuditId(parsed);
  const auditRef = db.collection(GMAIL_RETENTION_AUDIT_COLLECTION).doc(auditId);
  return db.runTransaction(async (transaction) => {
    const [recordSnapshot, auditSnapshot] = await Promise.all([
      transaction.get(recordRef),
      transaction.get(auditRef),
    ]);
    if (!recordSnapshot.exists) {
      throw new EditableLayerError(
        "The bodyless communications record was not found; deleted data cannot be restored.",
        404,
      );
    }
    const candidate = parseRetentionCandidate(
      parsed.collection,
      recordSnapshot.id,
      recordSnapshot.data(),
    );
    if (!candidate) {
      throw new EditableLayerError(
        "The record does not carry the approved communications retention policy.",
        409,
      );
    }
    if (auditSnapshot.exists) {
      const existingAudit = auditSnapshot.data() as Record<string, unknown>;
      const expectedAction =
        parsed.action === "hold" ? "legal_hold_applied" : "legal_hold_released";
      if (
        existingAudit.action !== expectedAction ||
        existingAudit.actor_uid !== actor.uid ||
        existingAudit.collection !== parsed.collection ||
        existingAudit.case_ref_hash !== hashRetentionText(parsed.caseReference) ||
        existingAudit.reason_hash !== hashRetentionText(parsed.reason)
      ) {
        throw new EditableLayerError(
          "That legal-hold idempotency key was already used for a different decision.",
          409,
        );
      }
      return { status: "duplicate" as const, legalHold: candidate.legal_hold };
    }

    const transition = buildCommunicationsLegalHoldTransition({
      actorUid: actor.uid,
      candidate,
      decision: parsed,
      nowMs,
    });
    transaction.update(recordRef, transition.update);
    transaction.create(auditRef, transition.audit);
    return { status: "changed" as const, legalHold: transition.legalHold };
  });
}

export function cleanupAuditId(runId: string) {
  return `cleanup-${hashRetentionText(normalizeCleanupRunId(runId)).slice(0, 40)}`;
}

export function cleanupCandidateHash(candidate: CommunicationsRetentionCandidate) {
  return hashRetentionText(
    `${candidate.collection}\u0000${candidate.id}\u0000${candidate.retention_anchor_at_ms}\u0000${candidate.expires_at_ms}`,
  );
}

interface CleanupRunState extends CommunicationsCleanupRunInitialization {
  deletedCounts: Record<string, number>;
  failedHashes: string[];
  processedHashes: string[];
}

function cleanupRunInitialization(
  state: CleanupRunState,
): CommunicationsCleanupRunInitialization {
  return {
    candidateHashes: [...state.candidateHashes],
    cleanupLimit: state.cleanupLimit,
    completed: state.completed,
    plannedCount: state.plannedCount,
  };
}

function parseCleanupRunState(value: Record<string, unknown>): CleanupRunState {
  if (value.policy_version !== COMMUNICATIONS_RETENTION_POLICY_VERSION) {
    throw new Error("Cleanup run has an unsupported retention policy version.");
  }
  const candidateHashes = assertCandidateHashes(value.planned_candidate_hashes);
  const processedHashes = assertCandidateHashes(value.processed_hashes);
  const failedHashes = assertCandidateHashes(value.failed_hashes);
  const cleanupLimit = exactCount(value.cleanup_limit, "cleanup limit");
  const plannedCount = exactCount(value.planned_count, "planned count");
  const failedCount = exactCount(value.failed_count, "failed count");
  const completed = value.completed_at_ms !== undefined;
  if (
    completed &&
    (!isFiniteTimestamp(value.completed_at_ms) ||
      typeof value.audit_id !== "string" ||
      value.audit_id.length === 0)
  ) {
    throw new Error("Completed cleanup run metadata is invalid.");
  }
  if (!completed && value.audit_id !== undefined) {
    throw new Error("Incomplete cleanup run unexpectedly references an audit.");
  }
  const initialization = {
    candidateHashes,
    cleanupLimit,
    completed,
    plannedCount,
  };
  assertCleanupRunInitialization(initialization);
  if (failedCount !== failedHashes.length) {
    throw new Error("Cleanup run failed count does not match its candidate hashes.");
  }
  assertCleanupRunMutation(initialization, processedHashes, failedHashes);
  const deletedCounts = assertDeletedCounts(value.deleted_counts);
  assertCleanupRunCounts({
    cleanupLimit,
    deletedCounts,
    failedCount,
    plannedCount,
  });
  if (sumCounts(deletedCounts) > processedHashes.length) {
    throw new Error("Cleanup run deletion counts exceed processed candidates.");
  }
  return {
    ...initialization,
    deletedCounts,
    failedHashes,
    processedHashes,
  };
}

function assertCleanupRunInitialization(input: CommunicationsCleanupRunInitialization) {
  assertCommunicationsCleanupLimit(input.cleanupLimit);
  if (typeof input.completed !== "boolean") {
    throw new Error("Cleanup run completion state is invalid.");
  }
  const candidateHashes = assertCandidateHashes(input.candidateHashes);
  if (
    !Number.isInteger(input.plannedCount) ||
    input.plannedCount < 0 ||
    input.plannedCount !== candidateHashes.length ||
    input.plannedCount > input.cleanupLimit
  ) {
    throw new Error("Cleanup run candidate hashes do not match the bounded plan.");
  }
}

function assertCleanupRunMutation(
  state: CommunicationsCleanupRunInitialization,
  processedHashes: readonly string[],
  failedHashes: readonly string[],
) {
  const processed = assertCandidateHashes(processedHashes);
  const failed = assertCandidateHashes(failedHashes);
  const planned = new Set(state.candidateHashes);
  if (
    processed.some((hash) => !planned.has(hash)) ||
    failed.some((hash) => !planned.has(hash)) ||
    processed.some((hash) => failed.includes(hash)) ||
    processed.length + failed.length > state.plannedCount ||
    processed.length + failed.length > state.cleanupLimit
  ) {
    throw new Error("Cleanup run progress exceeds its frozen candidate plan.");
  }
}

function assertCleanupRunCounts(input: {
  cleanupLimit: number;
  deletedCounts: Readonly<Record<string, number>>;
  failedCount: number;
  plannedCount: number;
}) {
  assertCommunicationsCleanupLimit(input.cleanupLimit);
  const deletedCounts = assertDeletedCounts(input.deletedCounts);
  if (
    !Number.isInteger(input.plannedCount) ||
    input.plannedCount < 0 ||
    input.plannedCount > input.cleanupLimit ||
    !Number.isInteger(input.failedCount) ||
    input.failedCount < 0 ||
    sumCounts(deletedCounts) + input.failedCount > input.plannedCount
  ) {
    throw new Error("Cleanup run counts exceed its frozen plan or limit.");
  }
}

function assertCandidateHashes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("Cleanup run candidate hashes are missing.");
  }
  const hashes = value.map((item) => {
    if (typeof item !== "string" || !/^[a-f0-9]{64}$/.test(item)) {
      throw new Error("Cleanup run candidate hash is invalid.");
    }
    return item;
  });
  if (new Set(hashes).size !== hashes.length) {
    throw new Error("Cleanup run candidate hashes must be unique.");
  }
  return hashes;
}

function assertDeletedCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Cleanup run deletion counts are invalid.");
  }
  const counts = Object.fromEntries(Object.entries(value));
  if (
    Object.values(counts).some(
      (count) => typeof count !== "number" || !Number.isInteger(count) || count < 0,
    )
  ) {
    throw new Error("Cleanup run deletion counts are invalid.");
  }
  return counts as Record<string, number>;
}

function exactCount(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Cleanup run ${label} is invalid.`);
  }
  return value;
}

function sumCounts(counts: Readonly<Record<string, number>>) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function isFiniteTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function normalizeCleanupRunId(runId: string) {
  const normalized = runId.trim();
  if (
    normalized.length < 8 ||
    normalized.length > 200 ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new Error(
      "Communications cleanup run id must be 8-200 letters, digits, underscores, or hyphens.",
    );
  }
  return normalized;
}
