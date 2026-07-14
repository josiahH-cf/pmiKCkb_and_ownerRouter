import type { Firestore } from "firebase-admin/firestore";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  bodylessRetentionAuditFields,
  buildCommunicationsLegalHoldTransition,
  COMMUNICATIONS_RETENTION_POLICY_VERSION,
  COMMUNICATIONS_RETENTION_TARGETS,
  CommunicationsLegalHoldInputSchema,
  type CommunicationsLegalHoldInput,
  type CommunicationsRetentionCandidate,
  type CommunicationsRetentionCollection,
  isCommunicationsCleanupEligible,
  legalHoldAuditId,
  parseRetentionCandidate,
  planCommunicationsCleanup,
} from "@/lib/gmail-hub/retention-policy";

export const GMAIL_RETENTION_AUDIT_COLLECTION = "gmail_retention_audit";

export interface CommunicationsCleanupStore {
  listCandidates(): Promise<CommunicationsRetentionCandidate[]>;
  deleteIfEligible(
    candidate: CommunicationsRetentionCandidate,
    nowMs: number,
  ): Promise<boolean>;
  writeCountsAudit(input: {
    nowMs: number;
    plannedCount: number;
    deletedCounts: Readonly<Record<string, number>>;
  }): Promise<void>;
}

export async function runCommunicationsCleanup(input: {
  store: CommunicationsCleanupStore;
  nowMs: number;
  limit?: number;
}) {
  const plan = planCommunicationsCleanup(
    await input.store.listCandidates(),
    input.nowMs,
    input.limit,
  );
  const deletedCounts: Record<string, number> = {};
  let deletedCount = 0;
  for (const candidate of plan.candidates) {
    if (await input.store.deleteIfEligible(candidate, input.nowMs)) {
      deletedCount += 1;
      deletedCounts[candidate.retention_class] =
        (deletedCounts[candidate.retention_class] ?? 0) + 1;
    }
  }
  await input.store.writeCountsAudit({
    nowMs: input.nowMs,
    plannedCount: plan.candidates.length,
    deletedCounts,
  });
  return {
    policyVersion: COMMUNICATIONS_RETENTION_POLICY_VERSION,
    plannedCount: plan.candidates.length,
    deletedCount,
    deletedCounts,
  };
}

export class FirestoreCommunicationsCleanupStore implements CommunicationsCleanupStore {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async listCandidates() {
    const candidates: CommunicationsRetentionCandidate[] = [];
    for (const collection of Object.keys(
      COMMUNICATIONS_RETENTION_TARGETS,
    ) as CommunicationsRetentionCollection[]) {
      const snapshot = await this.db.collection(collection).get();
      for (const doc of snapshot.docs) {
        const candidate = parseRetentionCandidate(collection, doc.id, doc.data());
        if (candidate) candidates.push(candidate);
      }
    }
    return candidates;
  }

  async deleteIfEligible(candidate: CommunicationsRetentionCandidate, nowMs: number) {
    const ref = this.db.collection(candidate.collection).doc(candidate.id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const current = snapshot.exists
        ? parseRetentionCandidate(candidate.collection, snapshot.id, snapshot.data())
        : null;
      if (!current || !isCommunicationsCleanupEligible(current, nowMs)) return false;
      if (
        current.retention_anchor_at_ms !== candidate.retention_anchor_at_ms ||
        current.expires_at_ms !== candidate.expires_at_ms
      ) {
        return false;
      }
      transaction.delete(ref);
      return true;
    });
  }

  async writeCountsAudit(input: {
    nowMs: number;
    plannedCount: number;
    deletedCounts: Readonly<Record<string, number>>;
  }) {
    const auditId = `cleanup-${input.nowMs}`;
    await this.db
      .collection(GMAIL_RETENTION_AUDIT_COLLECTION)
      .doc(auditId)
      .set(
        {
          action: "cleanup_completed",
          policy_version: COMMUNICATIONS_RETENTION_POLICY_VERSION,
          planned_count: input.plannedCount,
          deleted_count: Object.values(input.deletedCounts).reduce(
            (total, count) => total + count,
            0,
          ),
          deleted_counts: input.deletedCounts,
          created_at_ms: input.nowMs,
          ...bodylessRetentionAuditFields(input.nowMs),
        },
        { merge: false },
      );
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
