import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  prepareDerivedArtifact,
  approveDerivedArtifact,
  readCurrentDerivedArtifact,
  readDerivedArtifactContent,
  readDerivedArtifactStatus,
  readHistoricalDerivedArtifactContent,
  DERIVED_ARTIFACT_COLLECTIONS,
  derivedHeadId,
} from "@/lib/firestore/lease-derived-artifacts";
import {
  ArtifactFieldMapSchema,
  StaticPdfGeometrySchema,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  STATIC_ADAPTER,
  inspectStaticPdf,
  readStaticPdfValuesByOrder,
} from "@/lib/lease-documents/static-pdf";
import {
  geometry,
  objectsHolding,
  staticOriginal,
} from "@/tests/fixtures/synthetic-static";
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
    // S182: ordinary staff approve exact output; a verification identity never does.
    await expect(
      approveDerivedArtifact(
        {
          ...admin,
          uid: "canary-editor",
          email: "canary-editor@pmikcmetro.com",
          role: "Editor",
        },
        t.approval(record),
        t.db,
        t.deps,
      ),
    ).rejects.toThrow(/Verification accounts/);
    await expect(t.read(record.id + "wrong")).rejects.toThrow(/current/);
    // S167: a read by an account without the Renewals Space used to be refused here. Every staff
    // account now reads the current artifact.
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
  it("S182: two ordinary staff prepare and approve the exact output without an Admin", async () => {
    const t = await setup();
    const preparer = {
      ...admin,
      uid: "editor-a",
      email: "editor-a@pmikcmetro.com",
      role: "Editor" as const,
    };
    const colleague = {
      ...admin,
      uid: "editor-b",
      email: "editor-b@pmikcmetro.com",
      role: "Approver" as const,
    };
    const record = await prepareDerivedArtifact(preparer, t.prepare, t.db, t.deps);
    await expect(
      approveDerivedArtifact(colleague, t.approval(record), t.db, t.deps),
    ).resolves.toMatchObject({
      id: record.id,
      approval: { actorUid: "editor-b", outputHash: record.outputHash },
    });
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

describe("S130 static route through the persisted filled output (AC-S130-11/12/13)", () => {
  /** Re-evaluate after a catalog or fact change so the current packet head matches it. */
  function reseat(t: Awaited<ReturnType<typeof setup>>) {
    const evaluation = evaluateRenewalPacket(t.input);
    expect(evaluation.blockers).toEqual([]);
    t.context.snapshot = { ...t.context.snapshot!, ...evaluation };
    t.fake.seed(
      `${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId("123", "123")}`,
      { snapshot_id: t.request.snapshotId, payload_hash: evaluation.payloadHash },
    );
  }

  /** A reviewed static map over the synthetic static original, with `tenantSlots` name slots. */
  async function staticSetup(tenantSlots: number, omitFacts: readonly string[] = []) {
    const t = await setup();
    const original = await staticOriginal();
    const base = await geometry(original);
    const extraSlots = [
      { x: 300, y: 596, width: 200, height: 16 },
      { x: 300, y: 300, width: 200, height: 16 },
    ]
      .slice(0, tenantSlots - 1)
      .map((rect, index) => ({
        regionId: `TenantName${index + 1}`,
        fieldId: "TenantName",
        slot: index + 1,
        pageIndex: 0,
        rect,
        format: "text" as const,
        fontSize: 11,
        align: "left" as const,
        existing: "blank" as const,
      }));
    const map = ArtifactFieldMapSchema.parse({
      ...t.artifact.fillMapping!.map,
      fields: [
        {
          fieldId: "TenantName",
          factKey: "party.name",
          meaning: "SYNTHETIC tenant name",
          required: true,
          multiplicity: "per_party",
          allowedSourceSystems: ["rentvine"],
        },
        {
          fieldId: "Rent",
          factKey: "renewal.synthetic_rent_cents",
          meaning: "SYNTHETIC rent",
          required: true,
          multiplicity: "single",
          allowedSourceSystems: ["rentvine"],
        },
        {
          fieldId: "Effective",
          factKey: "renewal.synthetic_effective_date",
          meaning: "SYNTHETIC effective date",
          required: false,
          multiplicity: "single",
          allowedSourceSystems: ["rentvine"],
        },
      ],
      static: StaticPdfGeometrySchema.parse({
        ...base,
        regions: [
          ...base.regions.map((region) =>
            region.regionId === "Rent" ? { ...region, format: "money_cents" } : region,
          ),
          ...extraSlots,
        ],
      }),
    });
    const served = {
      content: original,
      contentType: "application/pdf",
      fileName: "synthetic-static.pdf",
    };
    t.deps.original = vi.fn(async () => served);
    t.deps.historicalOriginal = vi.fn(async () => served);
    t.artifact.contentHash = sha(original);
    t.artifact.fillMapping = { map, mapHash: mapHashOf(map), intakeRevision: 4 };
    t.input.facts.push(
      s66Fact("party.fixture-tenant-a.name", "Synthetic A"),
      s66Fact("party.fixture-tenant-b.name", "Synthetic B"),
      s66Fact("renewal.synthetic_rent_cents", 95_000),
      s66Fact("renewal.synthetic_effective_date", "2027-01-01"),
    );
    t.input.facts = t.input.facts.filter((fact) => !omitFacts.includes(fact.fieldKey));
    reseat(t);
    return { ...t, original };
  }

  it("fills reviewed regions with the snapshot values, keeps unused slots blank and reuses exact bytes", async () => {
    const t = await staticSetup(3);
    const record = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
    expect(record.adapter).toBe(STATIC_ADAPTER);
    expect(record.comparison.regionOrder).toEqual([
      "TenantName",
      "Rent",
      "Effective",
      "TenantName1",
      "TenantName2",
    ]);
    const expected = {
      TenantName: "Synthetic A",
      Rent: "$950.00",
      Effective: "January 1, 2027",
      TenantName1: "Synthetic B",
      TenantName2: "",
    };
    expect(record.comparison.allFields).toEqual(expected);
    const saved = (await t.read(record.id)).content;
    expect(
      await readStaticPdfValuesByOrder(saved, record.comparison.regionOrder!),
    ).toEqual(expected);
    // The earlier variable values are gone from normal text extraction; fixed wording remains.
    const texts = (await inspectStaticPdf(saved)).runs.map((run) => run.text);
    expect(texts).not.toContain("Old Tenant Name");
    expect(texts).not.toContain("$900.00");
    expect(texts).toEqual(
      expect.arrayContaining(["RESIDENTIAL LEASE EXTENSION", "Tenant signature"]),
    );
    // A replacement preparation of the same accepted identity yields the same exact bytes.
    const again = await prepareDerivedArtifact(
      admin,
      { ...t.prepare, operationId: op(3), expectedCurrentId: record.id },
      t.db,
      t.deps,
    );
    expect(again.id).not.toBe(record.id);
    expect(again.outputHash).toBe(record.outputHash);
    const approved = await approveDerivedArtifact(
      admin,
      { ...t.approval(again), operationId: op(4) },
      t.db,
      t.deps,
    );
    const downloaded = await readDerivedArtifactContent(
      admin,
      { ...t.request, derivedId: approved.id, requireApproval: true },
      t.db,
      t.deps,
    );
    expect(sha(downloaded.content)).toBe(record.outputHash);
    const historical = await readHistoricalDerivedArtifactContent(
      admin,
      { ...t.request, derivedId: approved.id, requireApproval: true },
      t.db,
      t.deps,
    );
    expect(historical.content).toEqual(downloaded.content);
  });

  it("refuses more parties than reviewed slots and a missing required value, never dropping anyone", async () => {
    const t = await staticSetup(1);
    await expect(prepareDerivedArtifact(admin, t.prepare, t.db, t.deps)).rejects.toThrow(
      /TenantName: 2 are recorded but the reviewed form has capacity for 1/,
    );
    const u = await staticSetup(2, ["renewal.synthetic_rent_cents"]);
    await expect(prepareDerivedArtifact(admin, u.prepare, u.db, u.deps)).rejects.toThrow(
      /Required mapped values are missing/,
    );
  });

  it("clears an unused repeated AcroForm slot that holds an earlier value", async () => {
    const t = await setup();
    const blank = await PDFDocument.load(
      await syntheticAcroform(["Amount", "Party 1", "Party 2", "Party 3"]),
    );
    blank.getForm().getTextField("Party 3").setText("Earlier person");
    const original = await blank.save({ useObjectStreams: false });
    const served = {
      content: original,
      contentType: "application/pdf",
      fileName: "synthetic-prefilled.pdf",
    };
    t.deps.original = vi.fn(async () => served);
    t.artifact.contentHash = sha(original);
    t.input.facts.push(
      s66Fact("party.fixture-tenant-a.name", "Synthetic A"),
      s66Fact("party.fixture-tenant-b.name", "Synthetic B"),
    );
    const map = t.artifact.fillMapping!.map;
    map.fields.push({
      fieldId: "Parties",
      factKey: "party.name",
      meaning: "Synthetic participant",
      required: true,
      multiplicity: "per_party",
      pdfFieldNames: ["Party 1", "Party 2", "Party 3"],
      allowedSourceSystems: ["rentvine"],
    });
    t.artifact.fillMapping!.mapHash = mapHashOf(map);
    const evaluation = evaluateRenewalPacket(t.input);
    t.context.snapshot = { ...t.context.snapshot!, ...evaluation };
    t.fake.seed(
      `${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId("123", "123")}`,
      { snapshot_id: t.request.snapshotId, payload_hash: evaluation.payloadHash },
    );
    const record = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
    const saved = (await t.read(record.id)).content;
    expect(await readAcroformValues(saved)).toMatchObject({
      "Party 1": "Synthetic A",
      "Party 2": "Synthetic B",
      "Party 3": "",
    });
    // The cleared person's earlier appearance is not left behind as an unused object.
    expect(await objectsHolding(original, ["Earlier person"])).not.toEqual([]);
    expect(await objectsHolding(saved, ["Earlier person"])).toEqual([]);
  });

  it("clears unused repeated selection slots that hold an earlier choice", async () => {
    const t = await setup();
    const pdf = await PDFDocument.load(await syntheticAcroform(["Amount"]));
    const page = pdf.getPage(0),
      form = pdf.getForm();
    for (const slot of [1, 2, 3]) {
      const y = 300 - slot * 60;
      const kind = form.createDropdown(`Kind ${slot}`);
      kind.addOptions(["Adult", "Minor"]);
      kind.addToPage(page, { x: 30, y, width: 160, height: 24 });
      const pick = form.createRadioGroup(`Pick ${slot}`);
      pick.addOptionToPage("Yes", page, { x: 220, y, width: 20, height: 20 });
      pick.addOptionToPage("No", page, { x: 260, y, width: 20, height: 20 });
    }
    form.getDropdown("Kind 3").select("Minor");
    form.getRadioGroup("Pick 3").select("Yes");
    const original = await pdf.save({ useObjectStreams: false });
    const served = {
      content: original,
      contentType: "application/pdf",
      fileName: "synthetic-prefilled-choices.pdf",
    };
    t.deps.original = vi.fn(async () => served);
    t.artifact.contentHash = sha(original);
    t.input.facts.push(
      ...["a", "b"].flatMap((party) => [
        s66Fact(`party.fixture-tenant-${party}.kind`, "Adult"),
        s66Fact(`party.fixture-tenant-${party}.pick`, "No"),
      ]),
    );
    const map = t.artifact.fillMapping!.map;
    for (const [fieldId, attribute] of [
      ["Kind", "kind"],
      ["Pick", "pick"],
    ])
      map.fields.push({
        fieldId: `${fieldId}s`,
        factKey: `party.${attribute}`,
        meaning: `Synthetic ${attribute}`,
        required: true,
        multiplicity: "per_party",
        pdfFieldNames: [1, 2, 3].map((slot) => `${fieldId} ${slot}`),
        allowedSourceSystems: ["rentvine"],
      });
    t.artifact.fillMapping!.mapHash = mapHashOf(map);
    const evaluation = evaluateRenewalPacket(t.input);
    t.context.snapshot = { ...t.context.snapshot!, ...evaluation };
    t.fake.seed(
      `${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId("123", "123")}`,
      { snapshot_id: t.request.snapshotId, payload_hash: evaluation.payloadHash },
    );
    const record = await prepareDerivedArtifact(admin, t.prepare, t.db, t.deps);
    const saved = (await t.read(record.id)).content;
    expect(await readAcroformValues(saved)).toMatchObject({
      "Kind 1": "Adult",
      "Kind 2": "Adult",
      "Kind 3": "",
      "Pick 1": "No",
      "Pick 2": "No",
      "Pick 3": "",
    });
    // No appearance in the saved file still draws the earlier choice.
    expect(await objectsHolding(original, ["Minor"], { streams: true })).not.toEqual([]);
    expect(await objectsHolding(saved, ["Minor"], { streams: true })).toEqual([]);
  });

  it("labels an unchanged approved attachment and keeps an unmapped original a manual handoff", async () => {
    const t = await setup();
    delete t.artifact.fillMapping;
    reseat(t);
    await expect(
      readDerivedArtifactStatus(admin, t.request, t.db, t.deps),
    ).resolves.toEqual({
      supported: false,
      reason:
        "This original needs a reviewed field or region mapping before a filled PDF can be prepared. Until then a person completes it in Dotloop.",
      record: null,
    });
    t.artifact.unchangedAttachment = true;
    reseat(t);
    await expect(
      readDerivedArtifactStatus(admin, t.request, t.db, t.deps),
    ).resolves.toEqual({
      supported: false,
      unchangedAttachment: true,
      reason:
        "Unchanged approved attachment: it has no variable values and is used exactly as approved.",
      record: null,
    });
    await expect(prepareDerivedArtifact(admin, t.prepare, t.db, t.deps)).rejects.toThrow(
      /exact approved field or region mapping/,
    );
  });
});
