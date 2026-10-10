import {
  communicationsRetentionFields,
  type CommunicationsRetentionFields,
} from "./retention-policy";
import { randomUUID, createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import type { PublicationContentReference } from "@/lib/publication/types";
import {
  validateWorkflowAttachment,
  type WorkflowMimeAttachment,
} from "@/lib/gmail-runtime/workflow-mime";
import type { CommunicationAttachment } from "./sequence-model";
import type { WorkflowCommunicationContext } from "./workflow-context";
import { COMMUNICATION_SEQUENCE_COLLECTIONS, sequenceHash } from "./sequence-store";
export function communicationScopeKey(c: WorkflowCommunicationContext) {
  return sequenceHash([c.lane, c.entityType, c.entityId, c.purpose]);
}
interface AttachmentRecord
  extends CommunicationAttachment, CommunicationsRetentionFields {
  scopeKey: string;
  actorUid: string;
  state: "uploading" | "ready" | "failed";
  createdAtMs: number;
  content: PublicationContentReference;
}
export class CommunicationAttachmentStore {
  constructor(readonly db: Firestore = getAdminFirestore()) {}
  private ref(id: string) {
    return this.db.collection(COMMUNICATION_SEQUENCE_COLLECTIONS.attachments).doc(id);
  }
  async put(input: {
    id: string;
    actorUid: string;
    context: WorkflowCommunicationContext;
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
    nowMs: number;
  }): Promise<CommunicationAttachment & { state: AttachmentRecord["state"] }> {
    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    validateWorkflowAttachment({ ...input, sha256 });
    const scopeKey = communicationScopeKey(input.context);
    const contentId = `communication_${input.id}_${randomUUID()}`;
    const record: AttachmentRecord = {
      id: input.id,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.length,
      sha256,
      scopeKey,
      actorUid: input.actorUid,
      state: "uploading",
      createdAtMs: input.nowMs,
      ...communicationsRetentionFields("workflow_link", input.nowMs),
      operational_hold: true,
      expires_at: null,
      expires_at_ms: null,
      content: {
        contentId,
        contentHash: sha256,
        byteSize: input.bytes.length,
        chunkCount: Math.ceil(input.bytes.length / (384 * 1024)),
        storage: "firestore-chunks-v1",
      },
    };
    const claim = await this.db.runTransaction(async (tx) => {
      const old = await tx.get(this.ref(input.id));
      if (old.exists) {
        const prior = old.data() as AttachmentRecord;
        if (
          prior.scopeKey !== scopeKey ||
          prior.sha256 !== sha256 ||
          prior.filename !== input.filename ||
          prior.mimeType !== input.mimeType ||
          prior.actorUid !== input.actorUid
        )
          throw new EditableLayerError(
            "This upload intent belongs to a different file or workflow.",
            409,
          );
        return { created: false, record: prior };
      }
      tx.create(this.ref(input.id), record);
      return { created: true, record };
    });
    if (!claim.created && claim.record.state === "ready") return this.view(claim.record);
    const admitted = claim.record;
    const store = new FirestorePublicationContentStore(this.db);
    try {
      await store.putImmutable({
        content: input.bytes,
        contentHash: sha256,
        contentId: admitted.content.contentId,
      });
      await store.read(admitted.content);
      return this.view(await this.publishReady(input.id));
    } catch {
      // The admitted upload's identity stays recoverable. A lost response never starts another upload.
      throw new EditableLayerError(
        "The file outcome needs reconciliation. Check this upload before adding it again.",
        409,
      );
    }
  }
  async metadata(id: string, context: WorkflowCommunicationContext) {
    const doc = await this.ref(id).get(),
      r = doc.data() as AttachmentRecord | undefined;
    if (!r || r.scopeKey !== communicationScopeKey(context))
      throw new EditableLayerError(
        "This file is not linked to the authorized workflow.",
        404,
      );
    return this.view(r);
  }
  async check(id: string, context: WorkflowCommunicationContext) {
    const s = await this.ref(id).get();
    const r = s.data() as AttachmentRecord | undefined;
    if (!r || r.scopeKey !== communicationScopeKey(context))
      throw new EditableLayerError(
        "This file is not linked to the authorized workflow.",
        404,
      );
    if (r.state === "uploading") {
      try {
        await new FirestorePublicationContentStore(this.db).read(r.content);
        return this.view(await this.publishReady(id));
      } catch {
        return this.view(r);
      }
    }
    return this.view(r);
  }
  async resolve(
    id: string,
    context: WorkflowCommunicationContext,
  ): Promise<WorkflowMimeAttachment & { identity: CommunicationAttachment }> {
    const s = await this.ref(id).get();
    const r = s.data() as AttachmentRecord | undefined;
    if (!r || r.scopeKey !== communicationScopeKey(context) || r.state !== "ready")
      throw new EditableLayerError(
        "A selected attachment is unavailable or still needs reconciliation.",
        409,
      );
    const bytes = await new FirestorePublicationContentStore(this.db).read(r.content);
    const result = {
      filename: r.filename,
      mimeType: r.mimeType,
      bytes,
      sha256: r.sha256,
    };
    validateWorkflowAttachment(result);
    return {
      ...result,
      identity: {
        id: r.id,
        filename: r.filename,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        sha256: r.sha256,
      },
    };
  }
  private async publishReady(id: string) {
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(this.ref(id)),
        current = doc.data() as AttachmentRecord | undefined;
      if (!current || doc.get("purged"))
        throw new EditableLayerError("This upload has been retired.", 409);
      const next: AttachmentRecord = {
        ...current,
        state: "ready",
        operational_hold: false,
        ...(current.legal_hold
          ? { expires_at: null, expires_at_ms: null }
          : communicationsRetentionFields("workflow_link", current.createdAtMs)),
      };
      tx.set(this.ref(id), next);
      return next;
    });
  }
  private view(r: AttachmentRecord) {
    return {
      id: r.id,
      filename: r.filename,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      sha256: r.sha256,
      state: r.state,
    };
  }
}
