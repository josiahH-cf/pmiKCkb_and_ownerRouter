// S66 (AC-S66-1, AC-S66-4): the app-owned renewal packet inputs store. One current document per
// lease plus append-only activity. A fact or section revision the editor did not read is a real
// concurrent edit and is refused with the current state; an operation id makes a retry return the
// first result. The actor and time come from the server. Saving reaches no provider and writes no
// RentVine charge, Sheet value or Dotloop document.

import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";

import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  PacketInputsRecordSchema,
  SavePacketInputsSchema,
  planPacketInputsSave,
  type PacketInputsRecord,
} from "@/lib/lease-documents/packet-inputs";

export const PACKET_INPUT_COLLECTIONS = {
  head: "lease_document_packet_inputs",
  activity: "lease_document_packet_input_activity",
} as const;

export function packetInputsDocId(leaseId: string): string {
  return createHash("sha256").update(leaseId).digest("hex");
}

export function packetInputsRef(db: Firestore, leaseId: string) {
  return db.collection(PACKET_INPUT_COLLECTIONS.head).doc(packetInputsDocId(leaseId));
}

/** A stored record for this lease, or a refusal when it is malformed or names another lease. */
export function parsePacketInputs(raw: unknown, leaseId: string): PacketInputsRecord {
  const parsed = PacketInputsRecordSchema.safeParse(raw);
  if (!parsed.success || parsed.data.leaseId !== leaseId)
    throw new EditableLayerError(
      "The saved packet inputs for this lease are unreadable; nothing was changed.",
      409,
    );
  return parsed.data;
}

/** Read inside a caller's transaction (owner-approval capture, claims). */
export async function readPacketInputsIn(
  transaction: Transaction,
  db: Firestore,
  leaseId: string,
): Promise<PacketInputsRecord | null> {
  const snapshot = await transaction.get(packetInputsRef(db, leaseId));
  return snapshot.exists ? parsePacketInputs(snapshot.data(), leaseId) : null;
}

function assertActor(actor: AuthenticatedUser, write = false) {
  if (write) assertMutationAllowed(requireEnvironmentDescriptor());
  if (
    !can(actor.role, write ? "edit" : "read") ||
    (write && isVerificationAccount(actor))
  )
    throw new EditableLayerError(
      write
        ? "Editor access is required to save packet inputs. Continue read-only or ask an Admin to review your role."
        : "Renewal workspace read access is required.",
      403,
    );
}

export async function getPacketInputs(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<PacketInputsRecord | null> {
  assertActor(actor);
  const snapshot = await packetInputsRef(db, leaseId).get();
  return snapshot.exists ? parsePacketInputs(snapshot.data(), leaseId) : null;
}

/** Never throws: the packet reader names an unreadable record instead of failing the page. */
export async function readPacketInputsForPacket(
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<{ readable: boolean; record: PacketInputsRecord | null; hash: string }> {
  try {
    const snapshot = await packetInputsRef(db, leaseId).get();
    if (!snapshot.exists)
      return { readable: true, record: null, hash: hashExecutionPreview({}) };
    const record = parsePacketInputs(snapshot.data(), leaseId);
    return { readable: true, record, hash: hashExecutionPreview({ ...record }) };
  } catch {
    return {
      readable: false,
      record: null,
      hash: hashExecutionPreview({ unreadable: true }),
    };
  }
}

/**
 * Save packet inputs atomically. The same operation id with the same request returns the stored
 * record as a duplicate; a different request under that id is refused. Nothing else is written.
 */
export async function savePacketInputs(
  actor: AuthenticatedUser,
  raw: unknown,
  db: Firestore = getAdminFirestore(),
): Promise<{ record: PacketInputsRecord | null; duplicate: boolean; changed: string[] }> {
  assertActor(actor, true);
  const input = SavePacketInputsSchema.parse(raw);
  const requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const head = packetInputsRef(db, input.leaseId);
  const event = db.collection(PACKET_INPUT_COLLECTIONS.activity).doc(input.operationId);
  const outcome = await db.runTransaction(async (transaction) => {
    const [snapshot, prior] = await Promise.all([
      transaction.get(head),
      transaction.get(event),
    ]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This saved request changed. Reload before saving it again.",
          409,
        );
      return { duplicate: true, changed: (prior.get("changed") as string[]) ?? [] };
    }
    const current = snapshot.exists
      ? parsePacketInputs(snapshot.data(), input.leaseId)
      : null;
    const now = new Date().toISOString();
    const planned = planPacketInputsSave(current, input, {
      actorUid: actor.uid,
      nowIso: now,
      eventId: input.operationId,
    });
    if (planned.changed.length > 0) transaction.set(head, planned.record);
    transaction.create(event, {
      lease_id: input.leaseId,
      request_hash: requestHash,
      actor_uid: actor.uid,
      actor_label: actor.email,
      recorded_at: now,
      changed: planned.changed,
      previous_revision: current?.revision ?? 0,
      next_revision:
        planned.changed.length > 0 ? planned.record.revision : (current?.revision ?? 0),
    });
    return { duplicate: false, changed: planned.changed };
  });
  const record = await getPacketInputs(actor, input.leaseId, db);
  return { record, ...outcome };
}
