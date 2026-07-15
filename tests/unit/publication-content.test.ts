import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import {
  FirestorePublicationContentStore,
  PUBLICATION_CONTENT_CHUNK_BYTES,
  PUBLICATION_CONTENT_CHUNK_COLLECTION,
  readBoundedPublicationBody,
} from "@/lib/publication/content";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";

describe("bounded publication content", () => {
  it("streams an exact declared body without using an unbounded aggregate API", async () => {
    const content = bytes("synthetic-publication");
    const result = await readBoundedPublicationBody(
      stream(content.slice(0, 7), content.slice(7)),
      content.byteLength,
      content.byteLength,
    );
    expect(result).toEqual(content);
  });

  it("cancels a body that lies low about its declared length", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(bytes("declared"));
        controller.enqueue(bytes("-extra"));
      },
    });

    await expect(readBoundedPublicationBody(body, 8, 32)).rejects.toMatchObject({
      code: "content_size_mismatch",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels before retaining a chunk that crosses the policy limit", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(bytes("12345678"));
        controller.enqueue(bytes("9"));
      },
    });

    await expect(readBoundedPublicationBody(body, 8, 8)).rejects.toMatchObject({
      code: "oversize",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects a short body after end-of-stream", async () => {
    await expect(
      readBoundedPublicationBody(stream(bytes("short")), 6, 8),
    ).rejects.toMatchObject({ code: "content_size_mismatch" });
  });
});

describe("Firestore publication content store", () => {
  it("splits content below the document limit and verifies it on read", async () => {
    const fake = new FakeFirestore();
    const store = new FirestorePublicationContentStore(fake as unknown as Firestore);
    const content = new Uint8Array(PUBLICATION_CONTENT_CHUNK_BYTES + 17).fill(7);
    const reference = await store.put({
      content,
      contentHash: sha256(content),
      contentId: "synthetic-content-1",
    });

    expect(reference.chunkCount).toBe(2);
    const chunkDocs = Array.from(fake.store.entries()).filter(([path]) =>
      path.startsWith(`${PUBLICATION_CONTENT_CHUNK_COLLECTION}/`),
    );
    expect(chunkDocs).toHaveLength(2);
    for (const [, chunk] of chunkDocs) {
      expect(Buffer.byteLength(String(chunk.chunkBase64), "utf8")).toBeLessThan(
        1024 * 1024,
      );
    }
    const restored = await store.read(reference);
    expect(restored.byteLength).toBe(content.byteLength);
    expect(Buffer.compare(Buffer.from(restored), Buffer.from(content))).toBe(0);
  });

  it("fails closed when a stored chunk is changed", async () => {
    const fake = new FakeFirestore();
    const store = new FirestorePublicationContentStore(fake as unknown as Firestore);
    const content = bytes("synthetic-content");
    const reference = await store.put({
      content,
      contentHash: sha256(content),
      contentId: "synthetic-content-2",
    });
    const chunkPath = `${PUBLICATION_CONTENT_CHUNK_COLLECTION}/synthetic-content-2_000`;
    fake.store.set(chunkPath, {
      ...fake.store.get(chunkPath),
      chunkBase64: Buffer.from("changed").toString("base64"),
    });

    await expect(store.read(reference)).rejects.toThrow("unavailable or corrupt");
  });
});

function stream(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
}

function bytes(value: string) {
  return new TextEncoder().encode(value);
}

function sha256(content: Uint8Array) {
  return createHash("sha256").update(content).digest("hex");
}
