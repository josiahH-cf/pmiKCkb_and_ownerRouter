/**
 * Server-only S66 snapshot persistence. Packet snapshots are append-only; a small head record moves
 * optimistically, so a successor never rewrites the prior truth or its conflict evidence.
 */

import { createHash } from "node:crypto";

import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type {
  PacketEvaluation,
  PacketHead,
  PacketVisibleState,
  RenewalPacketSnapshot,
} from "@/lib/lease-documents/packet-types";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";

export const LEASE_DOCUMENT_PACKET_COLLECTIONS = {
  snapshots: "lease_document_packet_snapshots",
  heads: "lease_document_packet_heads",
  activity: "lease_document_packet_activity",
  executionProjections: "lease_document_packet_execution_projections",
} as const;

interface StoredPacketSnapshot extends PacketEvaluation {
  snapshot_id: string;
  snapshot_version: number;
  actor_uid: string;
  created_at: string;
  previous_snapshot_id?: string;
}

interface StoredPacketHead {
  lease_id: string;
  transaction_id: string;
  snapshot_id: string;
  snapshot_version: number;
  payload_hash: string;
}

interface StoredExecutionProjection {
  snapshot_id: string;
  idempotency_key: string;
  state: "Provider pending" | "Partially executed" | "Executed" | "Failed" | "Cancelled";
  receipt_id?: string;
  reconciled_at?: string;
  error_class?: string;
}

export interface SavePacketSnapshotInput {
  evaluation: PacketEvaluation;
  /** Null proves the caller observed no current snapshot; otherwise it is an optimistic version. */
  expectedCurrentSnapshotId: string | null;
  nowIso?: string;
}

export async function savePacketSnapshot(
  actor: AuthenticatedUser,
  input: SavePacketSnapshotInput,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalPacketSnapshot> {
  assertCan(actor, "edit");
  validateEvaluationIdentity(input.evaluation);
  const headId = packetHeadId(input.evaluation.leaseId, input.evaluation.transactionId);
  const nowIso = input.nowIso ?? new Date().toISOString();

  const snapshotId = await db.runTransaction(async (transaction) => {
    const headRef = db.collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.heads).doc(headId);
    const headSnapshot = await transaction.get(headRef);
    const current = headSnapshot.exists
      ? (normalizeFirestoreValue(headSnapshot.data()) as StoredPacketHead)
      : null;

    if (current?.payload_hash === input.evaluation.payloadHash) {
      return current.snapshot_id;
    }
    if ((current?.snapshot_id ?? null) !== input.expectedCurrentSnapshotId) {
      throw new EditableLayerError(
        "Packet truth changed while this evaluation was being saved. Reload before retrying.",
        409,
      );
    }

    const nextVersion = (current?.snapshot_version ?? 0) + 1;
    const nextSnapshotId = `packet_${uuidv7()}`;
    const snapshotRecord: StoredPacketSnapshot = {
      ...input.evaluation,
      snapshot_id: nextSnapshotId,
      snapshot_version: nextVersion,
      actor_uid: actor.uid,
      created_at: nowIso,
      ...(current ? { previous_snapshot_id: current.snapshot_id } : {}),
    };
    transaction.create(
      db.collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.snapshots).doc(nextSnapshotId),
      stampProductRecordRetention(
        "lease_renewal_progress",
        snapshotRecord as unknown as Record<string, unknown>,
      ),
    );
    transaction.set(
      headRef,
      stampProductRecordRetention("lease_renewal_progress", {
        lease_id: input.evaluation.leaseId,
        transaction_id: input.evaluation.transactionId,
        snapshot_id: nextSnapshotId,
        snapshot_version: nextVersion,
        payload_hash: input.evaluation.payloadHash,
        updated_at: FieldValue.serverTimestamp(),
      }),
    );
    const activityId = uuidv7();
    transaction.create(
      db.collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.activity).doc(activityId),
      stampProductRecordRetention("lease_renewal_progress", {
        id: activityId,
        lease_id: input.evaluation.leaseId,
        transaction_id: input.evaluation.transactionId,
        snapshot_id: nextSnapshotId,
        previous_snapshot_id: current?.snapshot_id ?? null,
        actor_uid: actor.uid,
        state: input.evaluation.state,
        payload_hash: input.evaluation.payloadHash,
        artifact_count: input.evaluation.manifest?.includedArtifacts.length ?? 0,
        participant_count: input.evaluation.manifest?.participants.length ?? 0,
        blocker_count: input.evaluation.blockers.length,
        created_at: FieldValue.serverTimestamp(),
      }),
    );
    return nextSnapshotId;
  });

  const result = await getPacketSnapshot(actor, snapshotId, db);
  if (!result) {
    throw new EditableLayerError(
      "Packet snapshot could not be read back after write.",
      404,
    );
  }
  return result;
}

export async function getCurrentPacketSnapshot(
  actor: AuthenticatedUser,
  leaseId: string,
  transactionId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalPacketSnapshot | null> {
  assertCan(actor, "read");
  const head = await getPacketHead(actor, leaseId, transactionId, db);
  return head ? getPacketSnapshot(actor, head.snapshotId, db) : null;
}

export async function getPacketHead(
  actor: AuthenticatedUser,
  leaseId: string,
  transactionId: string,
  db: Firestore = getAdminFirestore(),
): Promise<PacketHead | null> {
  assertCan(actor, "read");
  const doc = await db
    .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.heads)
    .doc(packetHeadId(leaseId, transactionId))
    .get();
  if (!doc.exists) return null;
  const data = normalizeFirestoreValue(doc.data()) as StoredPacketHead;
  return {
    leaseId: data.lease_id,
    transactionId: data.transaction_id,
    snapshotId: data.snapshot_id,
    snapshotVersion: data.snapshot_version,
    payloadHash: data.payload_hash,
  };
}

export async function getPacketSnapshot(
  actor: AuthenticatedUser,
  snapshotId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalPacketSnapshot | null> {
  assertCan(actor, "read");
  const doc = await db
    .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.snapshots)
    .doc(snapshotId)
    .get();
  if (!doc.exists) return null;
  const data = normalizeFirestoreValue(doc.data()) as StoredPacketSnapshot;
  const [headDoc, executionDoc] = await Promise.all([
    db
      .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.heads)
      .doc(packetHeadId(data.leaseId, data.transactionId))
      .get(),
    db
      .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.executionProjections)
      .doc(snapshotId)
      .get(),
  ]);
  const head = headDoc.exists
    ? (normalizeFirestoreValue(headDoc.data()) as StoredPacketHead)
    : null;
  const execution = executionDoc.exists
    ? (normalizeFirestoreValue(executionDoc.data()) as StoredExecutionProjection)
    : null;
  const current = head?.snapshot_id === snapshotId;
  const visibleState: PacketVisibleState = !current
    ? "Superseded"
    : (execution?.state ?? data.state);
  return {
    leaseId: data.leaseId,
    transactionId: data.transactionId,
    packetContext: data.packetContext,
    classificationEvidence: data.classificationEvidence,
    state: data.state,
    manifest: data.manifest,
    blockers: data.blockers,
    catalogVersion: data.catalogVersion,
    ruleVersion: data.ruleVersion,
    sourceVersions: data.sourceVersions,
    payloadHash: data.payloadHash,
    snapshotId: data.snapshot_id,
    snapshotVersion: data.snapshot_version,
    actorUid: data.actor_uid,
    createdAt: data.created_at,
    previousSnapshotId: data.previous_snapshot_id ?? null,
    current,
    visibleState,
    ...(execution
      ? {
          execution: {
            idempotencyKey: execution.idempotency_key,
            state: execution.state,
            ...(execution.receipt_id ? { receiptId: execution.receipt_id } : {}),
            ...(execution.reconciled_at ? { reconciledAt: execution.reconciled_at } : {}),
            ...(execution.error_class ? { errorClass: execution.error_class } : {}),
          },
        }
      : {}),
  };
}

/**
 * S34 may project provider state onto an immutable packet. Repeated equal state is a no-op; each
 * actual change appends metadata-only activity. Partial/failed evidence is never deleted.
 */
export async function recordPacketExecutionProjection(
  actor: AuthenticatedUser,
  input: StoredExecutionProjection,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalPacketSnapshot> {
  assertCan(actor, "approve");
  const snapshot = await getPacketSnapshot(actor, input.snapshot_id, db);
  if (!snapshot) throw new EditableLayerError("Packet snapshot was not found.", 404);
  const ref = db
    .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.executionProjections)
    .doc(input.snapshot_id);
  await db.runTransaction(async (transaction) => {
    const currentDoc = await transaction.get(ref);
    const current = currentDoc.exists
      ? (normalizeFirestoreValue(currentDoc.data()) as StoredExecutionProjection)
      : null;
    if (current && JSON.stringify(current) === JSON.stringify(input)) return;
    transaction.set(
      ref,
      stampProductRecordRetention("lease_renewal_progress", {
        ...input,
        updated_by_uid: actor.uid,
        updated_at: FieldValue.serverTimestamp(),
      }),
    );
    const activityId = uuidv7();
    transaction.create(
      db.collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.activity).doc(activityId),
      stampProductRecordRetention("lease_renewal_progress", {
        id: activityId,
        lease_id: snapshot.leaseId,
        transaction_id: snapshot.transactionId,
        snapshot_id: snapshot.snapshotId,
        actor_uid: actor.uid,
        state: input.state,
        payload_hash: snapshot.payloadHash,
        ...(input.receipt_id ? { receipt_id: input.receipt_id } : {}),
        ...(input.error_class ? { error_class: input.error_class } : {}),
        created_at: FieldValue.serverTimestamp(),
      }),
    );
  });
  return (await getPacketSnapshot(actor, input.snapshot_id, db))!;
}

export function packetHeadId(leaseId: string, transactionId: string): string {
  return createHash("sha256")
    .update(`${leaseId.trim()}\u0000${transactionId.trim()}`)
    .digest("hex");
}

function validateEvaluationIdentity(evaluation: PacketEvaluation): void {
  if (
    evaluation.leaseId.trim() === "" ||
    evaluation.transactionId.trim() === "" ||
    !/^[a-f0-9]{64}$/.test(evaluation.payloadHash)
  ) {
    throw new EditableLayerError(
      "A canonical lease, transaction, and payload hash are required.",
      400,
    );
  }
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested packet-truth action.",
      403,
    );
  }
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") return (toDate.call(value) as Date).toISOString();
  }
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}
