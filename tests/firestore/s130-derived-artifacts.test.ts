import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { deleteApp, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import {
  prepareDerivedArtifact,
  approveDerivedArtifact,
  readDerivedArtifactContent,
  DERIVED_ARTIFACT_COLLECTIONS,
  type DerivedArtifactDeps,
} from "@/lib/firestore/lease-derived-artifacts";
import {
  savePacketSnapshot,
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
} from "@/lib/firestore/lease-document-packet-snapshots";
import {
  FirestorePublicationContentStore,
  PUBLICATION_CONTENT_CHUNK_BYTES,
  PUBLICATION_CONTENT_CHUNK_COLLECTION,
} from "@/lib/publication/content";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { mapHashOf } from "@/lib/lease-documents/artifact-intake";
import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import {
  claimActionExecution,
  prepareActionExecutionRecord,
  approveActionExecution,
  getActionExecution,
} from "@/lib/firestore/action-executions";
import { readAcroformValues } from "@/lib/lease-documents/acroform-pdf";
import { readyS66Input } from "@/tests/fixtures/s66-packet";
import { syntheticAcroform } from "@/tests/fixtures/synthetic-acroform";

const projectId = "pmi-kc-kb-s130-derived-test";
const actor = {
  uid: "synthetic-admin",
  email: "synthetic-admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin" as const,
};
let app: App, db: Firestore, testEnv: RulesTestEnvironment;
beforeAll(async () => {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !["127.0.0.1", "localhost"].includes(FIRESTORE_EMULATOR_TARGET.host)
  )
    throw new Error("Local emulator required");
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp({ projectId }, `s130-derived-${process.pid}`);
  db = getFirestore(app);
});
beforeEach(async () => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
  await testEnv.clearFirestore();
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await deleteApp(app);
  await testEnv.cleanup();
});
const op = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture(originalOverride?: Uint8Array) {
  const original = originalOverride ?? (await syntheticAcroform(["Amount"])),
    content = new FirestorePublicationContentStore(db);
  const originalHash = createHash("sha256").update(original).digest("hex");
  const originalRef = await content.put({
    content: original,
    contentHash: originalHash,
    contentId: "synthetic-original",
  });
  const input = readyS66Input();
  input.leaseId = "123";
  input.transactionId = "123";
  const artifact = input.catalog.artifacts.find(
    (item) => item.kind === "renewal_extension",
  )!;
  artifact.contentHash = originalHash;
  artifact.publicationSource.reference = "publication:synthetic-original";
  const map = {
    schemaVersion: "artifact-field-map/v1" as const,
    artifactKind: artifact.kind,
    mapVersion: "synthetic-v1",
    templateVersion: artifact.publicationSource.reference,
    formFamily: artifact.formFamily,
    formFamilyExtensionCompatible: true,
    audience: "tenant" as const,
    allowedPacketContexts: ["renewal_extension" as const],
    fields: [
      {
        fieldId: "Amount",
        factKey: "lease.monthly_rent_cents",
        meaning: "SYNTHETIC amount",
        required: true,
        multiplicity: "single" as const,
        allowedSourceSystems: ["rentvine"],
      },
    ],
    signers: [
      {
        signerRole: "tenant" as const,
        participantKind: "tenant" as const,
        required: true,
        location: "Human signature",
      },
    ],
    reviewNote: "SYNTHETIC only",
  };
  artifact.fillMapping = { map, mapHash: mapHashOf(map), intakeRevision: 3 };
  const snapshot = await savePacketSnapshot(
    actor,
    { evaluation: evaluateRenewalPacket(input), expectedCurrentSnapshotId: null },
    db,
  );
  const deps: DerivedArtifactDeps = {
    resolve: async () => ({ input, snapshot }),
    original: async () => ({
      content: await new FirestorePublicationContentStore(db).read(originalRef),
      contentType: "application/pdf",
      fileName: "synthetic.pdf",
    }),
    content,
    now: () => "2026-09-28T00:00:00.000Z",
  };
  const identity = {
    leaseId: "123",
    snapshotId: snapshot.snapshotId,
    artifactId: artifact.artifactId,
  };
  return {
    input,
    snapshot,
    artifact,
    original,
    originalRef,
    deps,
    identity,
    prepare: {
      ...identity,
      action: "prepare",
      operationId: op(1),
      expectedCurrentId: null,
    },
  };
}
describe("S130 actual Firestore derived byte ownership", () => {
  it("a failed same-operation chunk writer cannot remove the published peer's PDF", async () => {
    const padded = await PDFDocument.load(await syntheticAcroform(["Amount"]));
    // Keep the real form intact while forcing the actual content store's multi-chunk path.
    padded.setSubject("SYNTHETIC_PADDING".repeat(8_000));
    const original = await padded.save({ useObjectStreams: false });
    expect(original.byteLength).toBeGreaterThan(PUBLICATION_CONTENT_CHUNK_BYTES);
    const t = await fixture(original);
    let reachedSecondChunk!: () => void;
    const secondChunk = new Promise<void>((resolve) => {
      reachedSecondChunk = resolve;
    });
    let releaseFailure!: () => void;
    const failChunk = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    let failedContentId: string | undefined;
    let chunksWrittenBeforeFailure = 0;
    const failingDb = {
      collection(name: string) {
        expect(name).toBe(PUBLICATION_CONTENT_CHUNK_COLLECTION);
        const collection = db.collection(name);
        return {
          doc(id: string) {
            const reference = collection.doc(id);
            return {
              async set(value: { contentId: string; index: number }) {
                failedContentId = value.contentId;
                if (value.index === 1) {
                  reachedSecondChunk();
                  await failChunk;
                  throw new Error("SYNTHETIC second chunk failure");
                }
                await reference.set(value);
                chunksWrittenBeforeFailure += 1;
              },
              delete: () => reference.delete(),
            };
          },
        };
      },
    } as unknown as Firestore;
    const failedAttempt = prepareDerivedArtifact(actor, t.prepare, db, {
      ...t.deps,
      content: new FirestorePublicationContentStore(failingDb),
    }).then(
      () => ({ status: "fulfilled" as const }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    );
    await Promise.race([
      secondChunk,
      failedAttempt.then(() => {
        throw new Error("The failing attempt did not reach its second chunk");
      }),
    ]);
    let winner;
    try {
      expect(chunksWrittenBeforeFailure).toBe(1);
      // Same operation and request, started before the first attempt has a record to recover.
      winner = await prepareDerivedArtifact(actor, t.prepare, db, t.deps);
      expect(winner.contentRef.chunkCount).toBeGreaterThan(1);
      expect(winner.contentRef.contentId).not.toBe(failedContentId);
    } finally {
      releaseFailure();
    }
    const failed = await failedAttempt;
    expect(failed.status).toBe("rejected");
    if (failed.status !== "rejected")
      throw new Error("Expected the staged write to fail");
    expect(String(failed.error)).toContain("SYNTHETIC second chunk failure");
    const reconstructed = {
      ...t.deps,
      content: new FirestorePublicationContentStore(db),
    };
    const approved = await approveDerivedArtifact(
      actor,
      {
        ...t.identity,
        action: "approve",
        operationId: op(80),
        derivedId: winner.id,
        outputHash: winner.outputHash,
        inspected: true,
      },
      db,
      reconstructed,
    );
    const downloaded = await readDerivedArtifactContent(
      actor,
      { ...t.identity, derivedId: approved.id, requireApproval: true },
      db,
      reconstructed,
    );
    expect(createHash("sha256").update(downloaded.content).digest("hex")).toBe(
      winner.outputHash,
    );
    expect(await readAcroformValues(downloaded.content)).toEqual({
      Amount: "123456",
      "Human signature": null,
    });
    expect(await reconstructed.content.read(t.originalRef)).toEqual(original);
    expect(
      (
        await db
          .collection(PUBLICATION_CONTENT_CHUNK_COLLECTION)
          .where("contentId", "==", failedContentId)
          .get()
      ).size,
    ).toBe(0);
    expect((await db.collection(DERIVED_ARTIFACT_COLLECTIONS.records).get()).size).toBe(
      1,
    );
  }, 30_000);
  it.each(["replacement", "claim", "concurrent"])(
    "atomically fences the actual S20 claim when %s wins",
    async (order) => {
      const t = await fixture();
      const first = await prepareDerivedArtifact(actor, t.prepare, db, t.deps);
      const approved = await approveDerivedArtifact(
        actor,
        {
          ...t.identity,
          action: "approve",
          operationId: op(10),
          derivedId: first.id,
          outputHash: first.outputHash,
          inspected: true,
        },
        db,
        t.deps,
      );
      const previewHash = "a".repeat(64),
        contextHash = "b".repeat(64);
      const execution = await prepareActionExecutionRecord(
        actor,
        {
          classification: {
            actionKey: "dotloop.document.upload",
            kind: "document_write",
            risk: "High",
            defaultRisk: "High",
            requiresActionRegistry: true,
            blockers: [],
          },
          idempotencyKey: "synthetic-output-claim",
          previewHash,
          contextHash,
          scopeRef: `external-workflow:live:renewal-packet:${t.snapshot.snapshotId}`,
        },
        db,
      );
      await approveActionExecution(
        actor,
        execution.id,
        { previewHash, contextHash, reason: "Synthetic exact output review" },
        db,
      );
      const workspace = {
        cycleId: "synthetic-cycle",
        termsRevision: 0,
        ownerResponse: { outcome: "approved_terms" },
      };
      const catalog = { catalog: t.input.catalog },
        mapping = { synthetic: true };
      const workspaceId = createHash("sha256").update("123").digest("hex");
      await db.collection("lease_renewal_workspaces").doc(workspaceId).set(workspace);
      await db.collection("lease_artifact_catalogs").doc("current").set(catalog);
      await db.collection("lease_document_source_mappings").doc(workspaceId).set(mapping);
      await db.collection("dotloop_renewal_settings").doc("current").set({
        profile_id: "p",
        template_id: "t",
        transaction_type: "LEASE_OFFER",
        initial_status: "PRE_OFFER",
      });
      const publicationId = t.artifact.publicationSource.reference.slice(
        "publication:".length,
      );
      await db.collection("publication_versions").doc(publicationId).set({
        validated: true,
        contentHash: t.artifact.contentHash,
        spaceId: "renewals",
        data_mode: "live",
        resourceId: "synthetic-resource",
      });
      await db
        .collection("publication_resources")
        .doc("synthetic-resource")
        .set({ activeVersionId: publicationId });
      const prepared = {
        packet: { snapshot: t.snapshot, catalog: t.input.catalog },
        derivedDocuments: [
          {
            artifactId: t.artifact.artifactId,
            documentRef: "synthetic-document",
            derivedArtifactId: approved.id,
            derivedProvenanceHash: approved.provenanceHash,
            contentHash: approved.outputHash,
          },
        ],
        cycleId: workspace.cycleId,
        termsRevision: 0,
        ownerApprovalHash: hashExecutionPreview(workspace.ownerResponse),
        catalogRecordHash: hashExecutionPreview(catalog),
        mappingRecordHash: hashExecutionPreview(mapping),
        selection: {
          profileId: "p",
          templateId: "t",
          transactionType: "LEASE_OFFER",
          initialStatus: "PRE_OFFER",
        },
      };
      const companion = { leaseId: "123", prepared, previewHash, contextHash };
      await db
        .collection("lease_document_action_snapshots")
        .doc(execution.id)
        .set({ ...companion, snapshotHash: hashExecutionPreview(companion) });
      const claim = () =>
        claimActionExecution(actor, execution.id, previewHash, db, contextHash);
      const replace = () =>
        prepareDerivedArtifact(
          actor,
          { ...t.prepare, operationId: op(11), expectedCurrentId: first.id },
          db,
          t.deps,
        );
      const provider = vi.fn();
      if (order === "replacement") {
        await replace();
        await expect(claim()).rejects.toThrow(/changed/);
      } else if (order === "claim") {
        await claim();
        provider();
        await expect(replace()).rejects.toThrow(/frozen/);
      } else {
        const outcomes = await Promise.allSettled([
          claim().then(() => provider()),
          replace(),
        ]);
        expect(outcomes.filter((value) => value.status === "fulfilled")).toHaveLength(1);
        expect(outcomes.filter((value) => value.status === "rejected")).toHaveLength(1);
      }
      const observed = await getActionExecution(actor, execution.id, db);
      expect(provider).toHaveBeenCalledTimes(observed.attempt_count);
      const freeze = await db
        .collection(DERIVED_ARTIFACT_COLLECTIONS.freezes)
        .doc(t.snapshot.snapshotId)
        .get();
      expect(freeze.exists).toBe(observed.attempt_count === 1);
      if (observed.attempt_count === 1) {
        expect(freeze.get("claimedByExecutionId")).toBe(execution.id);
        expect(freeze.data()).toMatchObject({
          product_retention_policy: "product-record-retention:v1.0",
          product_retention_class: "indefinite",
          legal_hold: false,
        });
        await expect(
          approveDerivedArtifact(
            actor,
            {
              ...t.identity,
              action: "approve",
              operationId: op(12),
              derivedId: first.id,
              outputHash: first.outputHash,
              inspected: true,
            },
            db,
            t.deps,
          ),
        ).rejects.toThrow(/frozen/);
      }
    },
    30_000,
  );
  it("persists exact bytes across store reconstruction, serializes concurrent preparations and freezes after execution", async () => {
    const t = await fixture();
    const attempts = await Promise.allSettled([
      prepareDerivedArtifact(actor, t.prepare, db, t.deps),
      prepareDerivedArtifact(actor, { ...t.prepare, operationId: op(2) }, db, t.deps),
    ]);
    expect(attempts.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((value) => value.status === "rejected")).toHaveLength(1);
    const winner = attempts.find((value) => value.status === "fulfilled")!;
    if (winner.status !== "fulfilled") throw new Error("No winner");
    const record = winner.value;
    for (const collection of [
      DERIVED_ARTIFACT_COLLECTIONS.records,
      DERIVED_ARTIFACT_COLLECTIONS.heads,
    ]) {
      const saved = await db.collection(collection).get();
      expect(saved.size).toBe(1);
      expect(saved.docs[0].data()).toMatchObject({
        product_retention_policy: "product-record-retention:v1.0",
        product_retention_class: "indefinite",
        legal_hold: false,
      });
    }
    const reconstructed = {
      ...t.deps,
      content: new FirestorePublicationContentStore(db),
    };
    const approved = await approveDerivedArtifact(
      actor,
      {
        ...t.identity,
        action: "approve",
        operationId: op(3),
        derivedId: record.id,
        outputHash: record.outputHash,
        inspected: true,
      },
      db,
      reconstructed,
    );
    expect(approved.approval?.outputHash).toBe(record.outputHash);
    const downloaded = await readDerivedArtifactContent(
      actor,
      { ...t.identity, derivedId: record.id, requireApproval: true },
      db,
      reconstructed,
    );
    expect(await readAcroformValues(downloaded.content)).toEqual({
      Amount: "123456",
      "Human signature": null,
    });
    expect(await reconstructed.content.read(t.originalRef)).toEqual(t.original);
    await db
      .collection(LEASE_DOCUMENT_PACKET_COLLECTIONS.executionProjections)
      .doc(t.identity.snapshotId)
      .set({ state: "Provider pending" });
    await expect(
      prepareDerivedArtifact(
        actor,
        { ...t.prepare, operationId: op(4), expectedCurrentId: record.id },
        db,
        reconstructed,
      ),
    ).rejects.toThrow(/frozen/);
    expect((await db.collection(DERIVED_ARTIFACT_COLLECTIONS.records).get()).size).toBe(
      1,
    );
  });
  it("keeps derived records, heads and publication bytes closed to direct clients", async () => {
    const client = testEnv
      .authenticatedContext("synthetic-admin", {
        email: actor.email,
        email_verified: true,
        role: "Admin",
      })
      .firestore();
    for (const collection of [
      ...Object.values(DERIVED_ARTIFACT_COLLECTIONS),
      "publication_content_chunks",
    ]) {
      const target = doc(client, collection, "forbidden");
      await assertFails(setDoc(target, { outputHash: "a".repeat(64) }));
      await assertFails(getDoc(target));
    }
  });
});
