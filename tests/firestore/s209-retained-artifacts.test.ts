import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { beforeAll, beforeEach, afterAll, afterEach, it, expect, vi } from "vitest";
import { FIRESTORE_EMULATOR_TARGET } from "./emulator-target";
import { createMaintenanceTicket } from "@/lib/firestore/maintenance-tickets";
import {
  uploadMaintenanceArtifact as upload,
  readMaintenanceArtifact as read,
  finalizeMaintenanceArtifact as finalize,
} from "@/lib/firestore/maintenance-artifacts";
import {
  FirestorePublicationContentStore,
  publicationContentChunkDocumentId,
} from "@/lib/publication/content";
import { readMaintenanceCaseHistory } from "@/lib/firestore/maintenance-case-records";
const actor = {
  uid: "artifact-staff",
  email: "artifact-staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor" as const,
};
let env: RulesTestEnvironment, app: ReturnType<typeof initializeApp>, db: Firestore;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "pmi-kc-kb-artifact-test",
    firestore: {
      ...FIRESTORE_EMULATOR_TARGET,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
  app = initializeApp(
    { projectId: "pmi-kc-kb-artifact-test" },
    `artifacts-${process.pid}`,
  );
  db = getFirestore(app);
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await env.cleanup();
  await deleteApp(app);
});
async function ticket() {
  return createMaintenanceTicket(
    actor,
    {
      creation_id: randomUUID(),
      summary: "Local fixture evidence",
      description: "Current work fixture",
      priority: "Normal",
      unit: { unitId: "unit:17", label: "Fixture unit", confidence: "Verified" },
    },
    db,
    "91",
  );
}
const bytes = Buffer.from(
  "%PDF-1.7\nLocal deterministic reviewed invoice fixture.\n%%EOF",
);
function input() {
  return {
    operationId: randomUUID(),
    expectedVersion: 1,
    filename: "fixture-invoice.pdf",
    mimeType: "application/pdf" as const,
    purpose: "invoice" as const,
    approvedForIndefiniteRetention: true as const,
    containsRawCommunications: false as const,
    base64: bytes.toString("base64"),
  };
}
it("retains original bytes/hash once with an owning timeline and legal hold; cleanup cannot delete or overwrite them", async () => {
  const t = await ticket(),
    command = input(),
    one = await upload(actor, t.id, command, db);
  expect(one).toMatchObject({
    id: command.operationId,
    state: "retained",
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    product_retention_class: "indefinite",
  });
  expect(await upload(actor, t.id, command, db)).toEqual(one);
  const result = await read(actor, t.id, command.operationId, db, true);
  expect(Buffer.from(result.bytes!)).toEqual(bytes);
  const raw = await db
    .collection("maintenance_retained_artifacts")
    .doc(command.operationId)
    .get();
  await raw.ref.update({ legal_hold: true });
  expect(
    (
      await readMaintenanceCaseHistory(actor, t.id, { db, at: "2038-10-09T00:00:00Z" })
    ).events.map((e) => e.kind),
  ).toEqual(["create", "retained_artifact"]);
  expect((await read(actor, t.id, command.operationId, db)).artifact.legal_hold).toBe(
    true,
  );
  const content = raw.data()!.content;
  await expect(new FirestorePublicationContentStore(db).delete(content)).rejects.toThrow(
    /indefinite/,
  );
  await expect(
    new FirestorePublicationContentStore(db).put({
      content: bytes,
      contentId: content.contentId,
      contentHash: content.contentHash,
    }),
  ).rejects.toThrow(/immutable/);
  expect((await db.collection("maintenance_ticket_activity").get()).size).toBe(2);
});
it("partial upload keeps one original identity and resumes only exact immutable bytes; absence is not proof of failed work", async () => {
  const t = await ticket(),
    command = input(),
    original = FirestorePublicationContentStore.prototype.putImmutable;
  const large = Buffer.concat([bytes, Buffer.alloc(500000, 32)]);
  command.base64 = large.toString("base64");
  vi.spyOn(
    FirestorePublicationContentStore.prototype,
    "putImmutable",
  ).mockImplementationOnce(async function (
    this: FirestorePublicationContentStore,
    value,
  ) {
    const chunk = value.content.slice(0, 384 * 1024);
    await db
      .collection("publication_content_chunks")
      .doc(publicationContentChunkDocumentId(value.contentId, 0))
      .set({
        byteSize: chunk.length,
        chunkBase64: Buffer.from(chunk).toString("base64"),
        chunkHash: createHash("sha256").update(chunk).digest("hex"),
        contentId: value.contentId,
        index: 0,
      });
    throw Error("Lost connection after first chunk");
  });
  await expect(upload(actor, t.id, command, db)).rejects.toMatchObject({ status: 409 });
  expect((await read(actor, t.id, command.operationId, db)).artifact.state).toBe(
    "uploading",
  );
  await expect(
    finalize(actor, t.id, command.operationId, 1, false, db),
  ).rejects.toThrow();
  await expect(
    upload(actor, t.id, { ...command, base64: bytes.toString("base64") }, db),
  ).rejects.toMatchObject({ status: 409 });
  vi.restoreAllMocks();
  expect(FirestorePublicationContentStore.prototype.putImmutable).toBe(original);
  expect((await upload(actor, t.id, command, db)).state).toBe("retained");
  expect((await db.collection("maintenance_retained_artifacts").get()).size).toBe(1);
  expect(
    Buffer.from((await read(actor, t.id, command.operationId, db, true)).bytes!),
  ).toEqual(large);
});
it("a changed case holds the exact uploaded file for deliberate current review without inventing a second copy or discarding old context", async () => {
  const t = await ticket(),
    command = input(),
    original = FirestorePublicationContentStore.prototype.putImmutable;
  vi.spyOn(
    FirestorePublicationContentStore.prototype,
    "putImmutable",
  ).mockImplementationOnce(async function (
    this: FirestorePublicationContentStore,
    value,
  ) {
    await db.collection("maintenance_tickets").doc(t.id).update({ record_version: 2 });
    return original.call(this, value);
  });
  expect((await upload(actor, t.id, command, db)).state).toBe("needs_review");
  await expect(
    read({ ...actor, uid: "other-staff" }, t.id, command.operationId, db),
  ).rejects.toMatchObject({ status: 404 });
  expect((await finalize(actor, t.id, command.operationId, 2, false, db)).state).toBe(
    "needs_review",
  );
  expect((await finalize(actor, t.id, command.operationId, 2, true, db)).state).toBe(
    "retained",
  );
  expect((await finalize(actor, t.id, command.operationId, 2, true, db)).state).toBe(
    "retained",
  );
  expect(
    (await db.collection("maintenance_tickets").doc(t.id).get()).data()?.record_version,
  ).toBe(3);
  expect(
    (await read({ ...actor, uid: "other-staff" }, t.id, command.operationId, db)).artifact
      .state,
  ).toBe("retained");
});
it("refuses raw retention purposes, active PDF bytes, forged MIME, stale versions and cross-boundary readers before admitting a new file", async () => {
  const t = await ticket();
  for (const change of [
    { purpose: "transcript" },
    { containsRawCommunications: true },
    { base64: Buffer.from("%PDF-1.7 /JavaScript bad %%EOF").toString("base64") },
    { mimeType: "image/png" },
    { expectedVersion: 0 },
  ])
    await expect(
      upload(actor, t.id, { ...input(), ...change } as ReturnType<typeof input>, db),
    ).rejects.toBeTruthy();
  expect((await db.collection("maintenance_retained_artifacts").get()).empty).toBe(true);
  for (const bad of [
    { ...actor, role: "Vendor" },
    { ...actor, email: "canary-admin@pmikcmetro.com" },
  ])
    await expect(upload(bad as typeof actor, t.id, input(), db)).rejects.toMatchObject({
      status: 403,
    });
});
