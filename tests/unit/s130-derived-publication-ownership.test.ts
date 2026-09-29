import type { Firestore } from "firebase-admin/firestore";
import { PDFDocument } from "pdf-lib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  prepareDerivedArtifact,
  approveDerivedArtifact,
  DERIVED_ARTIFACT_COLLECTIONS,
} from "@/lib/firestore/lease-derived-artifacts";
import {
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
  packetHeadId,
} from "@/lib/firestore/lease-document-packet-snapshots";
import {
  FirestorePublicationContentStore,
  PUBLICATION_CONTENT_CHUNK_COLLECTION,
  PUBLICATION_CONTENT_CHUNK_BYTES,
} from "@/lib/publication/content";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { readAcroformValues } from "@/lib/lease-documents/acroform-pdf";
import { setupSyntheticDerived, admin, sha } from "@/tests/fixtures/s130-derived";

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const chunks = (t: Awaited<ReturnType<typeof setupSyntheticDerived>>) =>
  [...t.fake.store].filter(([path]) =>
    path.startsWith(`${PUBLICATION_CONTENT_CHUNK_COLLECTION}/`),
  );

describe("S130 exclusive staging bytes with immutable operation publication", () => {
  it("a failed concurrent chunk writer cannot delete a peer's already-published same-operation output", async () => {
    const t = await setupSyntheticDerived();
    const pdf = await PDFDocument.load(t.original, { updateMetadata: false });
    pdf.setSubject("SYNTHETIC PADDING ".repeat(14_000));
    const original = await pdf.save({ useObjectStreams: false });
    expect(original.byteLength).toBeGreaterThan(PUBLICATION_CONTENT_CHUNK_BYTES);
    t.deps.original = async () => ({
      content: original,
      contentType: "application/pdf",
      fileName: "synthetic.pdf",
    });
    t.artifact.contentHash = sha(original);
    const evaluation = evaluateRenewalPacket(t.input);
    t.context.snapshot = { ...t.context.snapshot!, ...evaluation };
    t.fake.seed(
      `${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId("123", "123")}`,
      {
        snapshot_id: t.request.snapshotId,
        payload_hash: evaluation.payloadHash,
      },
    );
    const reachedSecondChunk = barrier(),
      releaseFailure = barrier();
    let losingContentId = "";
    const failingContent = new FirestorePublicationContentStore({
      collection(name: string) {
        return {
          doc(id: string) {
            const ref = t.db.collection(name).doc(id);
            return {
              get: () => ref.get(),
              delete: () => ref.delete(),
              set: async (data: Record<string, unknown>) => {
                losingContentId = String(data.contentId);
                if (data.index === 1) {
                  reachedSecondChunk.release();
                  await releaseFailure.promise;
                  throw new Error("synthetic_second_chunk_failure");
                }
                return ref.set(data);
              },
            };
          },
        };
      },
    } as unknown as Firestore);
    const losing = prepareDerivedArtifact(admin, t.prepare, t.db, {
      ...t.deps,
      content: failingContent,
    }).then(
      () => null,
      (error: unknown) => error,
    );
    await reachedSecondChunk.promise;
    try {
      const winner = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
      const savedBeforeFailure = (await t.read(winner.id)).content;
      releaseFailure.release();
      expect(await losing).toMatchObject({ message: "synthetic_second_chunk_failure" });
      const after = await t.read(winner.id);
      expect(after.content).toEqual(savedBeforeFailure);
      expect(after.record.contentRef.contentId).not.toBe(losingContentId);
      expect(
        chunks(t).every(([, value]) => value.contentId === winner.contentRef.contentId),
      ).toBe(true);
      expect(await readAcroformValues(after.content)).toEqual({
        Amount: "123456",
        Preserved: "",
        "Human signature": null,
      });
      expect(
        (await approveDerivedArtifact(admin, t.approval(winner), t.db, t.deps)).approval
          ?.outputHash,
      ).toBe(sha(savedBeforeFailure));
      expect(sha(original)).toBe(t.artifact.contentHash);
    } finally {
      releaseFailure.release();
      await losing;
    }
  });

  it.each([false, true])(
    "discards only a losing staging copy when a concurrent immutable record wins (different actor: %s)",
    async (differentActor) => {
      const t = await setupSyntheticDerived();
      const staged = barrier(),
        resume = barrier();
      let losingContentId = "";
      const losingContent = {
        ...t.deps.content,
        put: async (input: Parameters<typeof t.deps.content.put>[0]) => {
          const ref = await t.deps.content.put(input);
          losingContentId = ref.contentId;
          staged.release();
          await resume.promise;
          return ref;
        },
        read: t.deps.content.read.bind(t.deps.content),
        delete: t.deps.content.delete.bind(t.deps.content),
      };
      const losing = prepareDerivedArtifact(admin, t.prepare, t.db, {
        ...t.deps,
        content: losingContent,
      }).then(
        (record) => ({ record }),
        (error: unknown) => ({ error }),
      );
      await staged.promise;
      try {
        const winner = await prepareDerivedArtifact(
          differentActor ? { ...admin, uid: "synthetic-second-admin" } : admin,
          t.prepare,
          t.db,
          t.deps,
        );
        resume.release();
        const outcome = await losing;
        if (differentActor)
          expect(outcome).toMatchObject({
            error: { message: "Preparation identity conflict." },
          });
        else expect(outcome).toMatchObject({ record: winner });
        expect(losingContentId).not.toBe(winner.contentRef.contentId);
        expect(chunks(t)).toHaveLength(winner.contentRef.chunkCount);
        expect(
          chunks(t).every(([, value]) => value.contentId === winner.contentRef.contentId),
        ).toBe(true);
        expect(sha((await t.read(winner.id)).content)).toBe(winner.outputHash);
      } finally {
        resume.release();
        await losing;
      }
    },
  );

  it("preserves exact published bytes across a lost transaction reply and idempotent retry", async () => {
    const t = await setupSyntheticDerived();
    const originalTransaction = t.fake.runTransaction.bind(t.fake);
    const failure = vi
      .spyOn(t.fake, "runTransaction")
      .mockImplementationOnce(async (callback) => {
        await originalTransaction(callback);
        throw new Error("synthetic_lost_commit_reply");
      });
    await expect(prepareDerivedArtifact(admin, t.prepare, t.db, t.deps)).rejects.toThrow(
      "synthetic_lost_commit_reply",
    );
    failure.mockRestore();
    const stored = [...t.fake.store].find(([path]) =>
      path.startsWith(`${DERIVED_ARTIFACT_COLLECTIONS.records}/`),
    )![1];
    const before = chunks(t);
    const record = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
    expect(record.id).toBe(stored.id);
    expect(chunks(t)).toEqual(before);
    expect(sha((await t.read(record.id)).content)).toBe(record.outputHash);
  });

  it("retains staging bytes when an ambiguous commit has no authoritative record readback", async () => {
    const t = await setupSyntheticDerived();
    vi.spyOn(t.fake, "runTransaction").mockRejectedValueOnce(
      new Error("synthetic_commit_unknown"),
    );
    await expect(prepareDerivedArtifact(admin, t.prepare, t.db, t.deps)).rejects.toThrow(
      "synthetic_commit_unknown",
    );
    expect(chunks(t).length).toBeGreaterThan(0);
    expect(
      [...t.fake.store.keys()].some((path) =>
        path.startsWith(`${DERIVED_ARTIFACT_COLLECTIONS.records}/`),
      ),
    ).toBe(false);
  });

  it("cleans its unpublished staging bytes after a definite stale-packet refusal", async () => {
    const t = await setupSyntheticDerived();
    const put = t.deps.content.put.bind(t.deps.content);
    vi.spyOn(t.deps.content, "put").mockImplementationOnce(async (input) => {
      const ref = await put(input);
      t.fake.seed(
        `${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId("123", "123")}`,
        { snapshot_id: "synthetic-successor", payload_hash: "a".repeat(64) },
      );
      return ref;
    });
    await expect(prepareDerivedArtifact(admin, t.prepare, t.db, t.deps)).rejects.toThrow(
      /current packet changed/,
    );
    expect(chunks(t)).toHaveLength(0);
  });
});
