import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  MAX_PUBLICATION_CONTENT_BYTES,
  type PublicationContentReference,
} from "@/lib/publication/types";
import { PublicationValidationError } from "@/lib/publication/validation";

// 384 KiB becomes 512 KiB after Base64 encoding, leaving ample room below
// Firestore's 1 MiB document limit for the integrity metadata.
export const PUBLICATION_CONTENT_CHUNK_BYTES = 384 * 1024;
export const PUBLICATION_CONTENT_CHUNK_COLLECTION = "publication_content_chunks";

export interface PublicationContentStore {
  put(input: {
    content: Uint8Array;
    contentHash: string;
    contentId: string;
  }): Promise<PublicationContentReference>;
  read(reference: PublicationContentReference): Promise<Uint8Array>;
  delete(reference: PublicationContentReference): Promise<void>;
}

/**
 * Reads a Web stream without ever retaining bytes beyond the configured cap.
 * A body that is larger than its declared size or policy limit is cancelled as
 * soon as the first offending chunk arrives.
 */
export async function readBoundedPublicationBody(
  body: ReadableStream<Uint8Array> | null,
  declaredByteSize: number,
  maxBytes: number,
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(declaredByteSize) ||
    declaredByteSize < 0 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 0
  ) {
    throw new PublicationValidationError("oversize");
  }
  if (declaredByteSize > maxBytes) {
    throw new PublicationValidationError("oversize");
  }
  if (!body) {
    if (declaredByteSize === 0) return new Uint8Array();
    throw new PublicationValidationError("content_size_mismatch");
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let completed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      if (!value || value.byteLength === 0) continue;

      const nextTotal = total + value.byteLength;
      if (!Number.isSafeInteger(nextTotal) || nextTotal > maxBytes) {
        throw new PublicationValidationError("oversize");
      }
      if (nextTotal > declaredByteSize) {
        throw new PublicationValidationError("content_size_mismatch");
      }

      // Copy only after both bounds pass so an offending chunk is never retained.
      chunks.push(value.slice());
      total = nextTotal;
    }
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }

  if (total !== declaredByteSize) {
    throw new PublicationValidationError("content_size_mismatch");
  }

  const content = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    content.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return content;
}

/** Server-only content storage with independently integrity-checked sub-MiB docs. */
export class FirestorePublicationContentStore implements PublicationContentStore {
  constructor(private readonly db: Firestore) {}

  async put(input: {
    content: Uint8Array;
    contentHash: string;
    contentId: string;
  }): Promise<PublicationContentReference> {
    assertContentIdentity(input.content, input.contentHash, input.contentId);
    const chunkCount = Math.ceil(
      input.content.byteLength / PUBLICATION_CONTENT_CHUNK_BYTES,
    );
    const writtenIndexes: number[] = [];

    try {
      for (let index = 0; index < chunkCount; index += 1) {
        const start = index * PUBLICATION_CONTENT_CHUNK_BYTES;
        const chunk = input.content.slice(
          start,
          Math.min(start + PUBLICATION_CONTENT_CHUNK_BYTES, input.content.byteLength),
        );
        await this.db
          .collection(PUBLICATION_CONTENT_CHUNK_COLLECTION)
          .doc(chunkDocumentId(input.contentId, index))
          .set({
            byteSize: chunk.byteLength,
            chunkBase64: Buffer.from(chunk).toString("base64"),
            chunkHash: sha256(chunk),
            contentId: input.contentId,
            index,
          });
        writtenIndexes.push(index);
      }
    } catch (error) {
      await Promise.all(
        writtenIndexes.map((index) =>
          this.db
            .collection(PUBLICATION_CONTENT_CHUNK_COLLECTION)
            .doc(chunkDocumentId(input.contentId, index))
            .delete(),
        ),
      ).catch(() => undefined);
      throw error;
    }

    return {
      byteSize: input.content.byteLength,
      chunkCount,
      contentHash: input.contentHash,
      contentId: input.contentId,
      storage: "firestore-chunks-v1",
    };
  }

  async read(reference: PublicationContentReference): Promise<Uint8Array> {
    assertPublicationContentReference(reference);
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (let index = 0; index < reference.chunkCount; index += 1) {
      const snapshot = await this.db
        .collection(PUBLICATION_CONTENT_CHUNK_COLLECTION)
        .doc(chunkDocumentId(reference.contentId, index))
        .get();
      const data = snapshot.data();
      if (
        !data ||
        data.contentId !== reference.contentId ||
        data.index !== index ||
        typeof data.chunkBase64 !== "string" ||
        typeof data.chunkHash !== "string" ||
        typeof data.byteSize !== "number"
      ) {
        throw new Error("Publication content is unavailable or corrupt.");
      }
      const chunk = new Uint8Array(Buffer.from(data.chunkBase64, "base64"));
      if (chunk.byteLength !== data.byteSize || sha256(chunk) !== data.chunkHash) {
        throw new Error("Publication content is unavailable or corrupt.");
      }
      total += chunk.byteLength;
      if (total > reference.byteSize || total > MAX_PUBLICATION_CONTENT_BYTES) {
        throw new Error("Publication content is unavailable or corrupt.");
      }
      chunks.push(chunk);
    }

    if (total !== reference.byteSize) {
      throw new Error("Publication content is unavailable or corrupt.");
    }
    const content = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      content.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (sha256(content) !== reference.contentHash) {
      throw new Error("Publication content is unavailable or corrupt.");
    }
    return content;
  }

  async delete(reference: PublicationContentReference): Promise<void> {
    assertPublicationContentReference(reference);
    await Promise.all(
      Array.from({ length: reference.chunkCount }, (_, index) =>
        this.db
          .collection(PUBLICATION_CONTENT_CHUNK_COLLECTION)
          .doc(chunkDocumentId(reference.contentId, index))
          .delete(),
      ),
    );
  }
}

function assertContentIdentity(
  content: Uint8Array,
  contentHash: string,
  contentId: string,
) {
  if (
    content.byteLength > MAX_PUBLICATION_CONTENT_BYTES ||
    !/^[0-9a-f]{64}$/.test(contentHash) ||
    sha256(content) !== contentHash ||
    !/^[A-Za-z0-9:_-]{1,200}$/.test(contentId)
  ) {
    throw new Error("Publication content cannot be stored.");
  }
}

export function assertPublicationContentReference(
  reference: PublicationContentReference,
  expected?: { byteSize: number; contentHash: string; contentId?: string },
) {
  const maximumChunks = Math.ceil(
    MAX_PUBLICATION_CONTENT_BYTES / PUBLICATION_CONTENT_CHUNK_BYTES,
  );
  if (
    reference.storage !== "firestore-chunks-v1" ||
    !/^[A-Za-z0-9:_-]{1,200}$/.test(reference.contentId) ||
    !Number.isSafeInteger(reference.byteSize) ||
    reference.byteSize < 0 ||
    reference.byteSize > MAX_PUBLICATION_CONTENT_BYTES ||
    !Number.isSafeInteger(reference.chunkCount) ||
    reference.chunkCount < 0 ||
    reference.chunkCount > maximumChunks ||
    reference.chunkCount !==
      Math.ceil(reference.byteSize / PUBLICATION_CONTENT_CHUNK_BYTES) ||
    !/^[0-9a-f]{64}$/.test(reference.contentHash) ||
    (expected !== undefined &&
      (reference.byteSize !== expected.byteSize ||
        reference.contentHash !== expected.contentHash ||
        (expected.contentId !== undefined && reference.contentId !== expected.contentId)))
  ) {
    throw new Error("Publication content reference is invalid.");
  }
}

function chunkDocumentId(contentId: string, index: number) {
  return `${contentId}_${index.toString().padStart(3, "0")}`;
}

function sha256(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}
