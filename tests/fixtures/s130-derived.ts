import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { expect, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  readDerivedArtifactContent,
  type DerivedArtifactDeps,
  type DerivedContext,
} from "@/lib/firestore/lease-derived-artifacts";
import {
  LEASE_DOCUMENT_PACKET_COLLECTIONS,
  packetHeadId,
} from "@/lib/firestore/lease-document-packet-snapshots";
import { FirestorePublicationContentStore } from "@/lib/publication/content";
import { mapHashOf } from "@/lib/lease-documents/artifact-intake";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import {
  syntheticAcroform,
  syntheticAcceptanceAcroform,
} from "@/tests/fixtures/synthetic-acroform";
import { readyS66Input, s66Fact, s66Source } from "@/tests/fixtures/s66-packet";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
export const admin = {
  uid: "synthetic-admin",
  email: "synthetic@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
} as AuthenticatedUser;
export const op = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
export const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
export async function setupSyntheticDerived() {
  const fake = new FakeFirestore(),
    db = fake as unknown as Firestore;
  const original = await syntheticAcroform(["Amount", "Preserved"]);
  const input = readyS66Input();
  input.leaseId = "123";
  input.transactionId = "123";
  const artifact = input.catalog.artifacts.find(
    (item) => item.kind === "renewal_extension",
  )!;
  artifact.contentHash = sha(original);
  artifact.publicationSource.reference = "publication:synthetic-original-0001";
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
    reviewNote: "SYNTHETIC test mapping",
  };
  artifact.fillMapping = { map, mapHash: mapHashOf(map), intakeRevision: 3 };
  const evaluation = evaluateRenewalPacket(input);
  expect(evaluation.state).toBe("Ready for preview");
  const context: DerivedContext = {
    input,
    snapshot: {
      ...evaluation,
      snapshotId: "synthetic-snapshot",
      snapshotVersion: 1,
      current: true,
      visibleState: "Ready for preview",
      createdAt: "2026-09-28T00:00:00Z",
      actorUid: admin.uid,
      previousSnapshotId: null,
    },
  };
  fake.seed(`${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId("123", "123")}`, {
    snapshot_id: context.snapshot!.snapshotId,
    payload_hash: context.snapshot!.payloadHash,
  });
  const deps: DerivedArtifactDeps = {
    historicalOriginal: vi.fn(async () => ({
      content: original,
      fileName: "synthetic.pdf",
      contentType: "application/pdf",
    })),
    resolve: vi.fn(async () => context),
    original: vi.fn(async () => ({
      content: original,
      fileName: "synthetic.pdf",
      contentType: "application/pdf",
    })),
    content: new FirestorePublicationContentStore(db),
    now: () => "2026-09-28T00:00:00.000Z",
  };
  const request = {
    leaseId: "123",
    snapshotId: "synthetic-snapshot",
    artifactId: artifact.artifactId,
  };
  const prepare = {
    ...request,
    action: "prepare",
    operationId: op(1),
    expectedCurrentId: null,
  };
  const read = (derivedId: string) =>
    readDerivedArtifactContent(admin, { ...request, derivedId }, db, deps);
  const approval = (record: { id: string; outputHash: string }) => ({
    ...request,
    action: "approve",
    operationId: op(2),
    derivedId: record.id,
    outputHash: record.outputHash,
    inspected: true,
  });
  return {
    fake,
    db,
    original,
    input,
    artifact,
    context,
    deps,
    request,
    prepare,
    read,
    approval,
  };
}

export const acceptanceFields = {
  Amount: "123456",
  Zero: "0",
  Date: "2026-12-31",
  "Party 1": "Synthetic A",
  "Party 2": "Synthetic B",
  "Animal 1": "Synthetic A",
  "Animal 2": "Synthetic B",
  Preserved: "",
  Checked: true,
  Unchecked: false,
  Radio: "Option B",
  Dropdown: "Option B",
  List: "Option A",
  "Human signature": null,
};
export const originalAcceptanceFields = {
  Amount: "",
  Zero: "",
  Date: "",
  "Party 1": "",
  "Party 2": "",
  "Animal 1": "",
  "Animal 2": "",
  Preserved: "",
  Checked: false,
  Unchecked: false,
  Radio: "",
  Dropdown: "",
  List: "",
  "Human signature": null,
};

export async function setupSyntheticAcceptance() {
  const t = await setupSyntheticDerived();
  const original = await syntheticAcceptanceAcroform();
  const source = async () => ({
    content: original,
    contentType: "application/pdf",
    fileName: "synthetic-all-fields.pdf",
  });
  t.deps.original = vi.fn(source);
  t.deps.historicalOriginal = vi.fn(source);
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
  for (const [fieldId, value] of Object.entries({
    Zero: 0,
    Date: "2026-12-31",
    Checked: true,
    Unchecked: false,
    Radio: "Option B",
    Dropdown: "Option B",
    List: "Option A",
  })) {
    const factKey = `synthetic.${fieldId.toLowerCase()}`;
    t.input.facts.push(s66Fact(factKey, value));
    map.fields.push({
      fieldId,
      factKey,
      meaning: `Synthetic ${fieldId}`,
      required: true,
      multiplicity: "single",
      allowedSourceSystems: ["rentvine"],
    });
  }
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
  t.context.snapshot = { ...t.context.snapshot!, ...evaluation };
  t.fake.seed(
    `${LEASE_DOCUMENT_PACKET_COLLECTIONS.heads}/${packetHeadId("123", "123")}`,
    { snapshot_id: t.request.snapshotId, payload_hash: evaluation.payloadHash },
  );
  return { ...t, original };
}
