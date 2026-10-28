// S236 ARCH-S236-1 / R-S236-2 / R-S236-4: staff-attested returned-state records. One record per
// lease, cycle, packet snapshot, document (the manifest kind) and document content hash holds the
// document's "Sent for signature" entry and append-only signer entries with their evidence. Each
// change is one staff action with actor and time from the server and an operation id; a change the
// editor did not read is refused with the current state. A record attaches only to the lease's
// current cycle, its current packet snapshot and that document's current version, and a signer
// entry only to a packet person who holds that role. Nothing here reads or writes Dotloop, so no
// provider value can set a signed state (ARCH-S236-3).

import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { isVerificationAccount } from "@/lib/auth/canary-policy";
import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  assertMutationAllowed,
  requireEnvironmentDescriptor,
} from "@/lib/environment/descriptor";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { readArtifactIntakeManifest } from "@/lib/firestore/lease-artifact-intake";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
  packetHeadId,
} from "@/lib/firestore/lease-document-packet-snapshots";
import {
  currentRenewalWorkspaceState,
  renewalWorkspaceHeadRefs,
} from "@/lib/firestore/renewal-workspace";
import {
  SIGNER_ROLES,
  type ArtifactIntakeManifest,
} from "@/lib/lease-documents/artifact-intake-contract";
import type { PacketPersonInput } from "@/lib/lease-documents/packet-inputs";
import { LEASE_ARTIFACT_KINDS } from "@/lib/lease-documents/packet-types";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";
import type {
  ReturnedDocumentInput,
  ReturnedSignerEntry,
  ReturnedStateRecord,
} from "@/lib/lease-documents/returned-state";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";

export const RETURNED_STATE_COLLECTIONS = {
  records: "lease_document_returned_states",
  activity: "lease_document_returned_state_activity",
} as const;

/** More records than this for one lease cycle refuses instead of showing a partial roster. */
export const RETURNED_STATE_HISTORY_LIMIT = 200;

const HASH = z.string().regex(/^[a-f0-9]{64}$/);
const ISO = z
  .string()
  .max(40)
  .refine((value) => Number.isFinite(Date.parse(value)), "Enter a valid date and time.");
const text = (max: number) => z.string().trim().min(1).max(max);

const EvidenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("dotloop_observed"),
      documentName: text(500),
      viewedAt: ISO,
    })
    .strict(),
  z.object({ kind: z.literal("signed_copy"), storageRef: text(500) }).strict(),
]);

export const RecordReturnedStateSchema = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    cycleId: text(100),
    snapshotId: text(200),
    kind: z.enum(LEASE_ARTIFACT_KINDS),
    documentContentHash: HASH,
    expectedRevision: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
    change: z.discriminatedUnion("kind", [
      z
        .object({ kind: z.literal("sent_for_signature"), at: ISO, how: text(200) })
        .strict(),
      z
        .object({
          kind: z.literal("signer"),
          signerRole: z.enum(SIGNER_ROLES),
          personId: z.string().uuid(),
          status: z.enum(["signed", "declined_voided"]),
          observedAt: ISO,
          evidence: EvidenceSchema,
        })
        .strict(),
    ]),
  })
  .strict();
export type RecordReturnedStateInput = z.infer<typeof RecordReturnedStateSchema>;

const StoredSignerSchema = z
  .object({
    signer_role: z.enum(SIGNER_ROLES),
    person_id: z.string(),
    status: z.enum(["signed", "declined_voided"]),
    observed_at: z.string(),
    evidence: EvidenceSchema,
    event_id: z.string(),
    recorded_by_uid: z.string(),
    recorded_at: z.string(),
  })
  .strict();
const StoredRecordSchema = z
  .object({
    schema_version: z.literal("returned-state/v1"),
    lease_id: z.string(),
    cycle_id: z.string(),
    snapshot_id: z.string(),
    kind: z.enum(LEASE_ARTIFACT_KINDS),
    document_content_hash: HASH,
    sent_for_signature: z
      .object({
        at: z.string(),
        how: z.string(),
        event_id: z.string(),
        recorded_by_uid: z.string(),
        recorded_at: z.string(),
      })
      .strict()
      .nullable(),
    signers: z.array(StoredSignerSchema).max(100),
    revision: z.number().int().positive(),
    updated_by_uid: z.string(),
    updated_at: z.string(),
  })
  .passthrough();
type StoredRecord = z.infer<typeof StoredRecordSchema>;

/** A stored record with the revision a later change must name. */
export type StoredReturnedStateRecord = ReturnedStateRecord & {
  readonly revision: number;
};

/** The context a record must bind to; the caller resolves it from the current app records. */
export interface ReturnedStateContext {
  readonly leaseId: string;
  readonly cycleId: string | null;
  readonly snapshotId: string | null;
  readonly documents: readonly ReturnedDocumentInput[];
  readonly people: readonly PacketPersonInput[];
}

export function returnedStateDocId(input: {
  leaseId: string;
  cycleId: string;
  snapshotId: string;
  kind: string;
  documentContentHash: string;
}): string {
  return createHash("sha256")
    .update(
      [
        input.leaseId,
        input.cycleId,
        input.snapshotId,
        input.kind,
        input.documentContentHash,
      ].join("\u0000"),
    )
    .digest("hex");
}

function assertActor(actor: AuthenticatedUser, write = false) {
  if (write) assertMutationAllowed(requireEnvironmentDescriptor());
  if (
    !can(actor.role, write ? renewalRoleCapability("record_returned_state") : "read") ||
    (write && isVerificationAccount(actor))
  )
    throw new EditableLayerError(
      write
        ? "Editor access is required to record a returned document. Continue read-only or ask an Admin to review your role."
        : "Renewal workspace read access is required.",
      403,
    );
}

function parseStored(raw: unknown): StoredRecord {
  const parsed = StoredRecordSchema.safeParse(raw);
  if (!parsed.success)
    throw new EditableLayerError(
      "A returned-document record for this lease is unreadable; nothing was changed.",
      409,
    );
  return parsed.data;
}

function toRecord(stored: StoredRecord): StoredReturnedStateRecord {
  return {
    revision: stored.revision,
    kind: stored.kind,
    leaseId: stored.lease_id,
    cycleId: stored.cycle_id,
    snapshotId: stored.snapshot_id,
    documentContentHash: stored.document_content_hash,
    sentForSignature: stored.sent_for_signature
      ? { at: stored.sent_for_signature.at, how: stored.sent_for_signature.how }
      : null,
    signers: stored.signers.map(
      (entry): ReturnedSignerEntry => ({
        signerRole: entry.signer_role,
        personId: entry.person_id,
        status: entry.status,
        observedAt: entry.observed_at,
        evidence: entry.evidence,
      }),
    ),
    recordedByUid: stored.updated_by_uid,
    recordedAt: stored.updated_at,
  };
}

/**
 * Every record of one lease cycle, current and superseded snapshots alike, so an earlier version's
 * signature is shown as such and never counted. More than the bound refuses.
 */
export async function listReturnedStateRecords(
  actor: AuthenticatedUser,
  leaseId: string,
  cycleId: string,
  db: Firestore = getAdminFirestore(),
): Promise<StoredReturnedStateRecord[]> {
  assertActor(actor);
  const page = await db
    .collection(RETURNED_STATE_COLLECTIONS.records)
    .where("lease_id", "==", leaseId)
    .where("cycle_id", "==", cycleId)
    .limit(RETURNED_STATE_HISTORY_LIMIT + 1)
    .get();
  if (page.size > RETURNED_STATE_HISTORY_LIMIT)
    throw new EditableLayerError(
      "This renewal has more returned-document records than the app can show at once. Ask an engineer to review them.",
      409,
    );
  return page.docs.map((doc) => toRecord(parseStored(doc.data())));
}

/** R-S236-7: whether any returned-state record exists for a packet document of this family. */
export async function hasReturnedStateRecordForKind(
  kind: string,
  db: Firestore = getAdminFirestore(),
): Promise<boolean> {
  const page = await db
    .collection(RETURNED_STATE_COLLECTIONS.records)
    .where("kind", "==", kind)
    .limit(1)
    .get();
  return !page.empty;
}

/**
 * R-S236-7: the Admin "inspect returned state" checkpoint, from records instead of a constant. It
 * is satisfied once staff have recorded a returned document for a packet that uses an approved
 * family. Never throws: an unreadable store reads as not yet inspected.
 */
/** The Admin intake manifest with its R-S236-7 checkpoint input, as one never-throwing read. */
export async function readIntakeManifestWithReturnedState(db?: Firestore): Promise<{
  manifest: ArtifactIntakeManifest;
  returnedStateInspected: boolean;
}> {
  const manifest = await readArtifactIntakeManifest(db);
  return {
    manifest,
    returnedStateInspected: await readReturnedStateInspected(manifest, db),
  };
}

export async function readReturnedStateInspected(
  manifest: ArtifactIntakeManifest,
  db?: Firestore,
): Promise<boolean> {
  const approved = Object.values(manifest.entries).flatMap((entry) =>
    entry?.state === "approved" ? [entry.kind] : [],
  );
  if (!approved.length) return false;
  try {
    const firestore = db ?? getAdminFirestore();
    const found = await Promise.all(
      approved.map((kind) => hasReturnedStateRecordForKind(kind, firestore)),
    );
    return found.some(Boolean);
  } catch {
    return false;
  }
}

const STALE =
  "This document's signing record changed. Your entry is kept; reload and review the current record before saving again.";

/**
 * Record one staff-attested change. The same operation id with the same request returns the stored
 * record as a duplicate; a different request under that id is refused. Only this record and its
 * activity entry are written.
 */
export async function recordReturnedState(
  actor: AuthenticatedUser,
  raw: unknown,
  context: ReturnedStateContext,
  db: Firestore = getAdminFirestore(),
): Promise<{ record: StoredReturnedStateRecord; duplicate: boolean }> {
  assertActor(actor, true);
  const input = RecordReturnedStateSchema.parse(raw);
  if (input.leaseId !== context.leaseId)
    throw new EditableLayerError("This record belongs to another lease.", 409);
  if (!context.cycleId || input.cycleId !== context.cycleId)
    throw new EditableLayerError(
      "This record names a renewal cycle that is not this lease's current cycle. Reload before recording.",
      409,
    );
  if (!context.snapshotId || input.snapshotId !== context.snapshotId)
    throw new EditableLayerError(
      "This record names a packet that is not this lease's current packet. Reload before recording.",
      409,
    );
  const document = context.documents.find((entry) => entry.kind === input.kind);
  if (!document)
    throw new EditableLayerError("This document is not part of the current packet.", 409);
  if (document.contentHash !== input.documentContentHash)
    throw new EditableLayerError(
      "This document version is no longer current. Reload and review the current version before recording.",
      409,
    );
  if (input.change.kind === "signer") {
    const { personId, signerRole } = input.change;
    const holder = context.people.find((person) => person.personId === personId);
    if (!holder?.roles.some((role) => role.signerRole === signerRole))
      throw new EditableLayerError(
        "This person is not recorded in that signing role for this lease's packet.",
        409,
      );
  }
  const requestHash = hashExecutionPreview({ actorUid: actor.uid, ...input });
  const recordRef = db
    .collection(RETURNED_STATE_COLLECTIONS.records)
    .doc(returnedStateDocId(input));
  const eventRef = db
    .collection(RETURNED_STATE_COLLECTIONS.activity)
    .doc(input.operationId);
  const workspaceRefs = renewalWorkspaceHeadRefs(db, input.leaseId);
  const packetHeadRef = db
    .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.heads)
    .doc(packetHeadId(input.leaseId, input.leaseId));
  const outcome = await db.runTransaction(async (transaction) => {
    const [prior, current, dated, leaseBound, packetHead] = await Promise.all([
      transaction.get(eventRef),
      transaction.get(recordRef),
      transaction.get(workspaceRefs.dated),
      transaction.get(workspaceRefs.leaseBound),
      transaction.get(packetHeadRef),
    ]);
    if (prior.exists) {
      if (prior.get("request_hash") !== requestHash)
        throw new EditableLayerError(
          "This saved request changed. Reload before saving it again.",
          409,
        );
      return { duplicate: true };
    }
    // The cycle and packet are re-read inside the transaction: a restart or re-evaluation that
    // landed after the page read refuses instead of attaching to the wrong cycle or packet.
    const workspace = currentRenewalWorkspaceState(db, input.leaseId, dated, leaseBound);
    if (workspace?.cycleId !== input.cycleId)
      throw new EditableLayerError(
        "This lease's renewal cycle changed. Reload before recording.",
        409,
      );
    if (packetHead.get("snapshot_id") !== input.snapshotId)
      throw new EditableLayerError(
        "This lease's packet changed. Reload before recording.",
        409,
      );
    const stored = current.exists ? parseStored(current.data()) : null;
    if ((stored?.revision ?? 0) !== input.expectedRevision)
      throw new EditableLayerError(STALE, 409);
    const now = new Date().toISOString();
    const audit = {
      event_id: input.operationId,
      recorded_by_uid: actor.uid,
      recorded_at: now,
    };
    const next = {
      schema_version: "returned-state/v1" as const,
      lease_id: input.leaseId,
      cycle_id: input.cycleId,
      snapshot_id: input.snapshotId,
      kind: input.kind,
      document_content_hash: input.documentContentHash,
      sent_for_signature:
        input.change.kind === "sent_for_signature"
          ? { at: input.change.at, how: input.change.how, ...audit }
          : (stored?.sent_for_signature ?? null),
      signers:
        input.change.kind === "signer"
          ? [
              ...(stored?.signers ?? []),
              {
                signer_role: input.change.signerRole,
                person_id: input.change.personId,
                status: input.change.status,
                observed_at: input.change.observedAt,
                evidence: input.change.evidence,
                ...audit,
              },
            ]
          : (stored?.signers ?? []),
      revision: (stored?.revision ?? 0) + 1,
      updated_by_uid: actor.uid,
      updated_at: now,
    };
    if (next.signers.length > 100)
      throw new EditableLayerError(
        "This document has more signer entries than the app keeps. Ask an engineer to review it.",
        409,
      );
    transaction.set(
      recordRef,
      stampProductRecordRetention("lease_renewal_progress", next, current.data()),
    );
    transaction.create(
      eventRef,
      stampProductRecordRetention("lease_renewal_progress", {
        lease_id: input.leaseId,
        cycle_id: input.cycleId,
        snapshot_id: input.snapshotId,
        kind: input.kind,
        document_content_hash: input.documentContentHash,
        record_id: recordRef.id,
        request_hash: requestHash,
        change_kind: input.change.kind,
        actor_uid: actor.uid,
        actor_label: actor.email,
        recorded_at: now,
        previous_revision: stored?.revision ?? 0,
        next_revision: next.revision,
      }),
    );
    return { duplicate: false };
  });
  const saved = await recordRef.get();
  return { record: toRecord(parseStored(saved.data())), ...outcome };
}
