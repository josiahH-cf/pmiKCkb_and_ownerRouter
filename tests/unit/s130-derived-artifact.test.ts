import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  prepareDerivedArtifact,
  approveDerivedArtifact,
  readCurrentDerivedArtifact,
  readDerivedArtifactContent,
  readHistoricalDerivedArtifactContent,
  DERIVED_ARTIFACT_COLLECTIONS,
  derivedHeadId,
} from "@/lib/firestore/lease-derived-artifacts";
import {
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
  packetHeadId,
} from "@/lib/firestore/lease-document-packet-snapshots";
import { mapHashOf } from "@/lib/lease-documents/artifact-intake";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { bindCurrentPacketForDotloop } from "@/lib/lease-documents/dotloop-packet-binding";
import {
  bindApprovedDerivedPacket,
  bindRetainedDerivedPacket,
} from "@/lib/lease-documents/derived-packet-binding";
import { LiveDotloopProvider } from "@/lib/integrations/dotloop/renewal-provider";
import type { DotloopClient } from "@/lib/integrations/dotloop/client";
import { readAcroformValues } from "@/lib/lease-documents/acroform-pdf";
import { createFilledArtifactHandlers } from "@/app/api/lease-renewal/filled-artifact/route";
import { syntheticAcroform } from "@/tests/fixtures/synthetic-acroform";
import { s66Fact, s66Source } from "@/tests/fixtures/s66-packet";
import {
  setupSyntheticDerived as setup,
  setupSyntheticAcceptance,
  acceptanceFields,
  originalAcceptanceFields,
  admin,
  op,
  sha,
} from "@/tests/fixtures/s130-derived";
beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
});
afterEach(() => vi.unstubAllEnvs());
describe("S130 persisted actual output and exact reviewed transport", () => {
  it("retains exact original/output audit downloads and own-attempt identity after sources change, without permitting current execution", async () => {
    const t = await setup();
    const prepared = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
    const record = await approveDerivedArtifact(
      admin,
      t.approval(prepared),
      t.db,
      t.deps,
    );
    const packet = structuredClone({
      snapshot: t.context.snapshot!,
      currentHead: {
        leaseId: "123",
        transactionId: "123",
        snapshotId: t.request.snapshotId,
        snapshotVersion: 1,
        payloadHash: t.context.snapshot!.payloadHash,
      },
      catalog: t.input.catalog,
      confirmedPayloadHash: t.context.snapshot!.payloadHash,
    });
    const bound = await bindApprovedDerivedPacket(
      admin,
      bindCurrentPacketForDotloop(packet),
      packet,
      { db: t.db, deps: t.deps },
    );
    const retained = bound.documents.filter((item) => item.derivedArtifactId);
    const originalDownloaded = (await t.read(record.id)).content;
    t.input.facts[0].normalizedValue = "changed";
    t.fake.seed(
      `${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId("123", "123")}`,
      { snapshot_id: "successor", payload_hash: "a".repeat(64) },
    );
    await expect(t.read(record.id)).rejects.toThrow(/changed/);
    await expect(
      bindApprovedDerivedPacket(admin, bindCurrentPacketForDotloop(packet), packet, {
        db: t.db,
        deps: t.deps,
      }),
    ).rejects.toThrow(/changed/);
    const before = JSON.stringify([...t.fake.store]);
    const historical = await readHistoricalDerivedArtifactContent(
      admin,
      { ...t.request, derivedId: record.id, requireApproval: true },
      t.db,
      t.deps,
    );
    expect(historical.content).toEqual(originalDownloaded);
    expect(historical.original.content).toEqual(t.original);
    expect(
      await bindRetainedDerivedPacket(
        admin,
        bindCurrentPacketForDotloop(packet),
        packet,
        retained,
        { db: t.db, deps: t.deps },
      ),
    ).toEqual(bound);
    const handlers = createFilledArtifactHandlers({
      requireCapabilityInSpace: vi.fn(async () => admin),
      historicalContent: (actor, request) =>
        readHistoricalDerivedArtifactContent(actor, request, t.db, t.deps),
    });
    const response = await handlers.GET(
      new Request(
        `http://test/api?${new URLSearchParams({ ...t.request, derivedId: record.id, historical: "true", original: "true" })}`,
      ),
    );
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(t.original);
    expect(JSON.stringify([...t.fake.store])).toBe(before);
    await expect(
      readHistoricalDerivedArtifactContent(
        admin,
        { ...t.request, leaseId: "999", derivedId: record.id },
        t.db,
        t.deps,
      ),
    ).rejects.toThrow(/belong/);
    await expect(
      bindRetainedDerivedPacket(
        admin,
        bindCurrentPacketForDotloop(packet),
        packet,
        [{ ...retained[0], contentHash: "b".repeat(64) }],
        { db: t.db, deps: t.deps },
      ),
    ).rejects.toThrow(/exact approved/);
  });
  it("fills exact reviewed multi-party and multi-animal slots in the saved output", async () => {
    const t = await setup();
    const original = await syntheticAcroform([
      "Amount",
      "Party 1",
      "Party 2",
      "Animal 1",
      "Animal 2",
    ]);
    t.deps.original = vi.fn(async () => ({
      content: original,
      contentType: "application/pdf",
      fileName: "synthetic-repeats.pdf",
    }));
    t.artifact.contentHash = sha(original);
    t.input.facts.push(
      s66Fact("party.fixture-tenant-a.name", "Synthetic A"),
      s66Fact("party.fixture-tenant-b.name", "Synthetic B"),
    );
    t.input.animals = ["A", "B"].map((name) => ({
      animalId: `synthetic-animal-${name}`,
      agreementApplicable: false,
      chargeIds: [],
      policyVersion: "synthetic-v1",
      facts: (
        [
          ["name", `Synthetic ${name}`],
          ["species", "cat"],
          ["breed", "synthetic"],
          ["weight", 1],
          ["policy_treatment", "synthetic policy"],
        ] as const
      ).map(([key, value]) => ({
        key,
        value,
        source: s66Source("rentvine"),
        confidence: "Verified" as const,
      })),
    }));
    const map = t.artifact.fillMapping!.map;
    map.fields.push(
      {
        fieldId: "Parties",
        factKey: "party.name",
        meaning: "Synthetic participant",
        required: true,
        multiplicity: "per_party",
        pdfFieldNames: ["Party 1", "Party 2"],
        allowedSourceSystems: ["rentvine"],
      },
      {
        fieldId: "Animals",
        factKey: "animal.name",
        meaning: "Synthetic animal",
        required: true,
        multiplicity: "per_animal",
        pdfFieldNames: ["Animal 1", "Animal 2"],
        allowedSourceSystems: ["rentvine"],
      },
    );
    t.artifact.fillMapping!.mapHash = mapHashOf(map);
    const evaluation = evaluateRenewalPacket(t.input);
    expect(evaluation.blockers).toEqual([]);
    const changedParty = structuredClone(t.input);
    changedParty.facts.find(
      (fact) => fact.fieldKey === "party.fixture-tenant-a.name",
    )!.normalizedValue = "Changed synthetic party";
    expect(evaluateRenewalPacket(changedParty).payloadHash).not.toBe(
      evaluation.payloadHash,
    );
    t.context.snapshot = { ...t.context.snapshot!, ...evaluation };
    t.fake.seed(
      `${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId("123", "123")}`,
      { snapshot_id: t.request.snapshotId, payload_hash: evaluation.payloadHash },
    );
    const record = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
    expect(await readAcroformValues((await t.read(record.id)).content)).toEqual({
      Amount: "123456",
      "Party 1": "Synthetic A",
      "Party 2": "Synthetic B",
      "Animal 1": "Synthetic A",
      "Animal 2": "Synthetic B",
      "Human signature": null,
    });
  });
  it("prepares, downloads actual bytes, approves, binds and transports those same bytes with a deterministic client", async () => {
    const t = await setupSyntheticAcceptance();
    const handlers = createFilledArtifactHandlers({
      requireCapabilityInSpace: vi.fn(async () => admin),
      prepare: (actor, raw) => prepareDerivedArtifact(actor, raw, t.db, t.deps),
      approve: (actor, raw) => approveDerivedArtifact(actor, raw, t.db, t.deps),
      content: (actor, request) =>
        readDerivedArtifactContent(actor, request, t.db, t.deps),
    });
    const post = (body: unknown) =>
      handlers.POST(
        new Request("http://test/api", { method: "POST", body: JSON.stringify(body) }),
      );
    const response = await post(t.prepare);
    expect(response.status).toBe(200);
    const { record } = await response.json();
    const download = await handlers.GET(
      new Request(
        `http://test/api?${new URLSearchParams({ ...t.request, derivedId: record.id })}`,
      ),
    );
    expect(download.status).toBe(200);
    const downloaded = new Uint8Array(await download.arrayBuffer());
    expect(sha(downloaded)).toBe(record.outputHash);
    expect(await readAcroformValues(downloaded)).toEqual(acceptanceFields);
    expect(await readAcroformValues(t.original)).toEqual(originalAcceptanceFields);
    const packet = {
      snapshot: t.context.snapshot!,
      currentHead: {
        leaseId: "123",
        transactionId: "123",
        snapshotId: t.request.snapshotId,
        snapshotVersion: 1,
        payloadHash: t.context.snapshot!.payloadHash,
      },
      catalog: t.input.catalog,
      confirmedPayloadHash: t.context.snapshot!.payloadHash,
    };
    await expect(
      bindApprovedDerivedPacket(admin, bindCurrentPacketForDotloop(packet), packet, {
        db: t.db,
        deps: t.deps,
      }),
    ).rejects.toThrow(/approve/);
    expect((await post(t.approval(record))).status).toBe(200);
    const bound = await bindApprovedDerivedPacket(
      admin,
      bindCurrentPacketForDotloop(packet),
      packet,
      { db: t.db, deps: t.deps },
    );
    const target = bound.documents.find(
      (doc) => doc.artifactId === t.artifact.artifactId,
    )!;
    expect(target.contentHash).toBe(record.outputHash);
    expect(target.derivedArtifactId).toBe(record.id);
    const uploadDocument = vi.fn(async (input: { content: Uint8Array }) => {
      expect(input.content.byteLength).toBeGreaterThan(0);
      return { id: "synthetic-upload" };
    });
    const provider = new LiveDotloopProvider({
      client: {
        createFolder: vi.fn(async () => "synthetic-folder"),
        uploadDocument,
      } as unknown as DotloopClient,
      selection: {
        profileId: "synthetic-profile",
        templateId: bound.templateRef,
        transactionType: "LEASE_OFFER",
        initialStatus: "Active",
      },
      participants: [],
      artifactContent: async () => t.read(record.id),
    });
    await provider.uploadDocument({
      loopRef: "synthetic-loop",
      documentRef: target.documentRef,
      documentType: "Lease",
      contentHash: target.contentHash,
      idempotencyKey: "synthetic-one-attempt",
    });
    expect(uploadDocument).toHaveBeenCalledOnce();
    expect(uploadDocument.mock.calls[0][0].content).toEqual(downloaded);
    if (process.env.SYNTHETIC_PDF_ACCEPTANCE_DIR) {
      const directory = process.env.SYNTHETIC_PDF_ACCEPTANCE_DIR;
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "original.pdf"), t.original);
      await writeFile(join(directory, "downloaded.pdf"), downloaded);
      await writeFile(
        join(directory, "uploaded.pdf"),
        uploadDocument.mock.calls[0][0].content,
      );
      await writeFile(
        join(directory, "expected.json"),
        JSON.stringify(
          {
            synthetic: true,
            outputHash: record.outputHash,
            originalHash: sha(t.original),
            fields: record.comparison.allFields,
            originalFields: originalAcceptanceFields,
          },
          null,
          2,
        ),
      );
    }
  });
  it("recovers a lost prepare response without new output and refuses operation reuse", async () => {
    const t = await setup(),
      first = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
    expect((await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps)).id).toBe(
      first.id,
    );
    await expect(
      prepareDerivedArtifact(
        admin,
        { ...t.prepare, expectedCurrentId: first.id },
        t.db,
        t.deps,
      ),
    ).rejects.toThrow(/identity/);
  });
  it("retains the immutable output and preserves a legal hold when replacing its head", async () => {
    const t = await setup();
    const first = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
    const path = `${DERIVED_ARTIFACT_COLLECTIONS.heads}/${derivedHeadId(t.request.snapshotId, t.request.artifactId)}`;
    const head = t.fake.store.get(path)!;
    expect(head).toMatchObject({
      product_retention_policy: "product-record-retention:v1.0",
      product_retention_class: "indefinite",
      legal_hold: false,
    });
    head.legal_hold = true;
    const replacement = await prepareDerivedArtifact(
      admin,
      { ...t.prepare, operationId: op(9), expectedCurrentId: first.id },
      t.db,
      t.deps,
    );
    expect(t.fake.store.get(path)).toMatchObject({
      id: replacement.id,
      legal_hold: true,
    });
    expect(
      t.fake.store.get(`${DERIVED_ARTIFACT_COLLECTIONS.records}/${first.id}`),
    ).toMatchObject({
      outputHash: first.outputHash,
      product_retention_class: "indefinite",
    });
  });
  it("refuses forged output hashes, wrong roles, stale sources, corrupt chunks and superseded outputs while any staff role reads", async () => {
    const t = await setup(),
      record = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
    await expect(
      approveDerivedArtifact(
        admin,
        { ...t.approval(record), outputHash: "a".repeat(64) },
        t.db,
        t.deps,
      ),
    ).rejects.toThrow(/hash/);
    await expect(
      approveDerivedArtifact(
        { ...admin, role: "Editor" },
        t.approval(record),
        t.db,
        t.deps,
      ),
    ).rejects.toThrow(/cannot access/);
    await expect(t.read(record.id + "wrong")).rejects.toThrow(/current/);
    // S167: a read by an account without the Renewals Space used to be refused here. Every staff
    // account now reads the current artifact; the Editor role is still refused the approval above.
    await expect(
      readCurrentDerivedArtifact(
        { ...admin, uid: "editor-2", role: "Editor" },
        t.request,
        t.db,
        t.deps,
      ),
    ).resolves.toMatchObject({ id: record.id, outputHash: record.outputHash });
    const chunks = [...t.fake.store.keys()].filter((key) =>
      key.startsWith("publication_content_chunks/"),
    );
    t.fake.store.get(chunks[0])!.chunkBase64 = Buffer.from("corrupt").toString("base64");
    await expect(t.read(record.id)).rejects.toThrow();
    t.input.facts[0].normalizedValue = "changed";
    await expect(
      readCurrentDerivedArtifact(admin, t.request, t.db, t.deps),
    ).rejects.toThrow(/changed/);
  });
  it("refuses concurrent replacement on stale heads, source races and execution freeze", async () => {
    const t = await setup(),
      record = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
    await expect(
      prepareDerivedArtifact(admin, { ...t.prepare, operationId: op(3) }, t.db, t.deps),
    ).rejects.toThrow(/Another preparation/);
    t.fake.seed(
      `${LEASE_DOCUMENT_PACKET_COLLECTIONS.executionProjections}/${t.request.snapshotId}`,
      { state: "Provider pending" },
    );
    await expect(
      approveDerivedArtifact(admin, t.approval(record), t.db, t.deps),
    ).rejects.toThrow(/frozen/);
    expect(
      t.fake.store.get(
        `${DERIVED_ARTIFACT_COLLECTIONS.heads}/${derivedHeadId(t.request.snapshotId, t.request.artifactId)}`,
      )?.id,
    ).toBe(record.id);
  });
  it("requires exact repeated slot capacity and current reviewed mapping", async () => {
    const t = await setup();
    t.artifact.fillMapping!.map.fields[0].multiplicity = "per_party";
    t.artifact.fillMapping!.mapHash = mapHashOf(t.artifact.fillMapping!.map);
    const evaluation = evaluateRenewalPacket(t.input);
    t.context.snapshot = { ...t.context.snapshot!, ...evaluation };
    t.fake.seed(
      `${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId("123", "123")}`,
      {
        snapshot_id: t.context.snapshot.snapshotId,
        payload_hash: evaluation.payloadHash,
      },
    );
    await expect(prepareDerivedArtifact(admin, t.prepare, t.db, t.deps)).rejects.toThrow(
      /Required mapped|capacity/,
    );
  });
});
