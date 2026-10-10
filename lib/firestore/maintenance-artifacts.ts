// Immutable app-owned retained core copies. Existing capture-photo Drive storage remains separate.
import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "./admin";
import { EditableLayerError } from "./errors";
import {
  FirestorePublicationContentStore,
  publicationContentChunkDocumentId,
} from "@/lib/publication/content";
import type { PublicationContentReference } from "@/lib/publication/types";
import { validateWorkflowAttachment } from "@/lib/gmail-runtime/workflow-mime";
import {
  MaintenanceArtifactInputSchema,
  type MaintenanceArtifactInput,
  type MaintenanceArtifactView,
} from "@/lib/maintenance/case-model";
import {
  assertMaintenanceCaseActor,
  maintenanceCaseId,
  MAINTENANCE_CASE_COLLECTIONS as C,
} from "./maintenance-case-records";
import { MAINTENANCE_TICKET_COLLECTIONS as T } from "./maintenance-tickets";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";
interface StoredArtifact extends MaintenanceArtifactView {
  content: PublicationContentReference;
  fingerprint: string;
  association_snapshot: unknown;
}
const sha = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function artifactView(record: StoredArtifact): MaintenanceArtifactView {
  const { content, fingerprint, association_snapshot, ...view } = record;
  void content;
  void fingerprint;
  void association_snapshot;
  return view;
}
export async function uploadMaintenanceArtifact(
  actor: AuthenticatedUser,
  ticketId: string,
  input: MaintenanceArtifactInput,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor, true);
  maintenanceCaseId(ticketId);
  const command = MaintenanceArtifactInputSchema.parse(input),
    bytes = Buffer.from(command.base64, "base64");
  if (bytes.toString("base64") !== command.base64)
    throw new EditableLayerError("Use the exact selected file bytes.", 400);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    validateWorkflowAttachment({ ...command, bytes, sha256 });
  } catch {
    throw new EditableLayerError(
      "Use a passive PDF, JPEG, PNG or WebP no larger than 5 MiB with matching name/type.",
      400,
    );
  }
  const { base64, ...terms } = command;
  void base64;
  const fingerprint = sha([ticketId, actor.uid, terms, sha256]),
    ref = db.collection(C.artifacts).doc(command.operationId),
    ticketRef = db.collection(T.tickets).doc(ticketId),
    at = new Date().toISOString(),
    contentId = `maintenance_artifact_${command.operationId}`;
  const record = await db.runTransaction(async (tx) => {
    const [prior, ticket] = await tx.getAll(ref, ticketRef);
    if (!ticket.exists || ticket.data()!.data_mode !== "live")
      throw new EditableLayerError("That maintenance case is unavailable.", 404);
    if (prior.exists) {
      const r = prior.data() as StoredArtifact;
      if (
        r.fingerprint !== fingerprint ||
        r.actor_uid !== actor.uid ||
        r.ticket_id !== ticketId
      )
        throw new EditableLayerError(
          "This retained-file identity belongs to different bytes or work. Recover the original upload.",
          409,
        );
      return r;
    }
    if ((ticket.data()!.record_version ?? 0) !== command.expectedVersion)
      throw new EditableLayerError(
        "The case changed before upload. Keep the file and read current work before another save.",
        409,
      );
    if ((ticket.data()!.retained_artifact_count ?? 0) >= 1000)
      throw new EditableLayerError(
        "This case has reached the bounded retained-artifact limit.",
        409,
      );
    const r = stampProductRecordRetention("maintenance_retained_artifacts", {
      id: command.operationId,
      ticket_id: ticketId,
      filename: command.filename,
      mimeType: command.mimeType,
      purpose: command.purpose,
      sizeBytes: bytes.length,
      sha256,
      state: "uploading" as const,
      recorded_at: at,
      actor_uid: actor.uid,
      reviewed_ticket_version: command.expectedVersion,
      association_snapshot: ticket.data()!.maintenance_association ?? null,
      fingerprint,
      content: {
        contentId,
        contentHash: sha256,
        byteSize: bytes.length,
        chunkCount: Math.ceil(bytes.length / (384 * 1024)),
        storage: "firestore-chunks-v1" as const,
      },
    });
    tx.create(ref, r);
    return r as StoredArtifact;
  });
  if (record.state === "retained") return artifactView(record);
  const contentStore = new FirestorePublicationContentStore(db);
  try {
    await contentStore.putImmutable({ contentId, contentHash: sha256, content: bytes });
    await contentStore.read(record.content);
    return await finalizeMaintenanceArtifact(
      actor,
      ticketId,
      command.operationId,
      command.expectedVersion,
      false,
      db,
    );
  } catch (error) {
    if (error instanceof EditableLayerError) throw error;
    throw new EditableLayerError(
      "The retained-file outcome needs reconciliation. Check this original file before adding it again.",
      409,
    );
  }
}
export async function finalizeMaintenanceArtifact(
  actor: AuthenticatedUser,
  ticketId: string,
  id: string,
  expectedVersion: number,
  explicitReview = false,
  db: Firestore = getAdminFirestore(),
) {
  assertMaintenanceCaseActor(actor, true);
  maintenanceCaseId(ticketId);
  z.string().uuid().parse(id);
  const ref = db.collection(C.artifacts).doc(id),
    prior = await ref.get(),
    record = prior.data() as StoredArtifact | undefined;
  if (!record || record.ticket_id !== ticketId || record.actor_uid !== actor.uid)
    throw new EditableLayerError(
      "The original retained-file result is unavailable.",
      404,
    );
  if (record.state === "retained") return artifactView(record);
  await new FirestorePublicationContentStore(db).read(record.content);
  for (let index = 0; index < record.content.chunkCount; index++) {
    const chunk = db
      .collection("publication_content_chunks")
      .doc(publicationContentChunkDocumentId(record.content.contentId, index));
    await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(chunk);
      if (!snapshot.exists) throw Error("Missing retained chunk");
      tx.set(
        chunk,
        stampProductRecordRetention(
          "maintenance_retained_artifacts",
          snapshot.data()!,
          snapshot.data(),
        ),
      );
    });
  }
  return db.runTransaction(async (tx) => {
    const [snapshot, ticket] = await tx.getAll(
      ref,
      db.collection(T.tickets).doc(ticketId),
    );
    const current = snapshot.data() as StoredArtifact | undefined;
    if (
      !current ||
      !ticket.exists ||
      ticket.data()!.data_mode !== "live" ||
      current.actor_uid !== actor.uid
    )
      throw new EditableLayerError(
        "The original retained-file result is unavailable.",
        404,
      );
    if (current.state === "retained") return artifactView(current);
    const version = ticket.data()!.record_version ?? 0;
    if (
      (ticket.data()!.retained_artifact_count ?? 0) >= 1000 ||
      version !== expectedVersion ||
      (!explicitReview && current.reviewed_ticket_version !== version)
    ) {
      const held = { ...current, state: "needs_review" as const };
      tx.set(ref, held);
      return artifactView(held);
    }
    const at = new Date().toISOString(),
      next = stampProductRecordRetention(
        "maintenance_tickets",
        {
          ...ticket.data(),
          record_version: version + 1,
          retained_artifact_count: (ticket.data()!.retained_artifact_count ?? 0) + 1,
          updated_at: at,
        },
        ticket.data(),
      ),
      retained = stampProductRecordRetention(
        "maintenance_retained_artifacts",
        {
          ...current,
          state: "retained" as const,
          reviewed_ticket_version: version,
          association_snapshot: ticket.data()!.maintenance_association ?? null,
        },
        snapshot.data(),
      );
    const eventId = uuidv7();
    tx.set(ticket.ref, next);
    tx.set(ref, retained);
    tx.create(
      db.collection(T.activity).doc(eventId),
      stampProductRecordRetention("maintenance_ticket_activity", {
        id: eventId,
        ticket_id: ticketId,
        ticket_version: version + 1,
        actor_uid: actor.uid,
        action: "retained_artifact",
        text: `Retained ${current.purpose}: ${current.filename}`,
        created_at: at,
      }),
    );
    tx.create(
      db.collection(C.events).doc(eventId),
      stampProductRecordRetention("maintenance_case_events", {
        id: eventId,
        ticket_id: ticketId,
        ticket_version: version + 1,
        kind: "retained_artifact",
        actor_kind: "staff",
        actor_id: actor.uid,
        occurred_at: at,
        recorded_at: at,
        summary: `Retained ${current.purpose}: ${current.filename}`,
        evidence_refs: [`artifact:${id}`],
        association: ticket.data()!.maintenance_association ?? null,
        artifact_snapshot: artifactView(retained),
      }),
    );
    return artifactView(retained);
  });
}
export async function readMaintenanceArtifact(
  actor: AuthenticatedUser,
  ticketId: string,
  id: string,
  db: Firestore = getAdminFirestore(),
  download = false,
) {
  assertMaintenanceCaseActor(actor);
  maintenanceCaseId(ticketId);
  z.string().uuid().parse(id);
  const [snapshot, ticket] = await Promise.all([
    db.collection(C.artifacts).doc(id).get(),
    db.collection(T.tickets).doc(ticketId).get(),
  ]);
  const record = snapshot.data() as StoredArtifact | undefined;
  if (
    !ticket.exists ||
    ticket.data()!.data_mode !== "live" ||
    !record ||
    record.ticket_id !== ticketId ||
    (record.state !== "retained" && record.actor_uid !== actor.uid)
  )
    throw new EditableLayerError("That retained file is unavailable in this case.", 404);
  const bytes = download
    ? await new FirestorePublicationContentStore(db).read(record.content)
    : null;
  return { artifact: artifactView(record), bytes };
}
