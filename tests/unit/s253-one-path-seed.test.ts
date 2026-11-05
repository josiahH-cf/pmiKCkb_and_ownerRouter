import { afterEach, describe, expect, it, vi } from "vitest";

import {
  classifyUploadedForm,
  mapHashOf,
  validateFieldMap,
} from "@/lib/lease-documents/artifact-intake";
import {
  ArtifactFieldMapSchema,
  ArtifactIntakeEntrySchema,
} from "@/lib/lease-documents/artifact-intake-contract";
import { fieldMapOpenQuestionIssues } from "@/lib/lease-documents/form-open-questions";
import { ApprovedLeaseCatalogSchema } from "@/lib/lease-documents/live-source-schema";
import {
  PacketInputsRecordSchema,
  displayFactValue,
} from "@/lib/lease-documents/packet-inputs";
import {
  readStaticPdfLines,
  validateStaticGeometry,
} from "@/lib/lease-documents/static-pdf";
import {
  FirestorePublicationContentStore,
  publicationContentChunkDocumentId,
} from "@/lib/publication/content";
import type { PublicationContentReference } from "@/lib/publication/types";
import {
  ONE_PATH_ANIMAL_PROFILES,
  ONE_PATH_FAMILY_USE_STEPS,
  ONE_PATH_OLD_FEE_TEXT,
  ONE_PATH_ORGANIZATIONS,
  buildOnePathForms,
  onePathIntakeEntry,
  onePathPacketInputs,
  onePathPacketInputsDocId,
  onePathPublication,
  seedOnePathForms,
} from "@/tests/browser/one-path-forms-seed.mjs";
import { SEEDED_AT, onePathCatalog } from "@/tests/fixtures/s253-one-path";
import { FakeFirestore } from "@/tests/helpers/fake-firestore";
import type { Firestore } from "firebase-admin/firestore";

// S253 deliverable 7: the rehearsal seed is checked against the application's own contracts, so
// what a rehearsal seeds is exactly what the Admin review path would have recorded. Everything in
// it is invented; it publishes no fee and records no deposit, explanation or starting text.

afterEach(() => vi.unstubAllEnvs());

const text = async (bytes: Uint8Array) =>
  (await readStaticPdfLines(bytes)).map((line) => line.text).join("\n");

describe("S253 rehearsal seed: synthetic forms of the reviewed shape", () => {
  it("seeds maps the reviewed contract accepts, each bound to its exact original", async () => {
    const forms = await buildOnePathForms();
    expect(Object.keys(forms).sort()).toEqual([
      "animal_agreement",
      "brokerage_disclosure",
      "owner_acknowledgment",
      "renewal_extension",
    ]);
    for (const form of Object.values(forms)) {
      const map = ArtifactFieldMapSchema.parse(form.fieldMap);
      expect(map.artifactKind).toBe(form.kind);
      expect(map.templateVersion).toBe(form.reference);
      expect(form.mapHash).toBe(mapHashOf(map));
      // The file check the Admin review runs before a static map can be recorded.
      expect(await validateStaticGeometry(form.bytes, map.static!)).toEqual([]);
      expect(fieldMapOpenQuestionIssues(map)).toEqual([]);
      const entry = ArtifactIntakeEntrySchema.parse({
        ...onePathIntakeEntry(form, SEEDED_AT),
        id: form.kind,
      });
      expect(entry.state).toBe("approved");
      expect(validateFieldMap(map, entry, null)).toEqual({ ok: true, issues: [] });
      // The classification is the one the application computes from the same bytes.
      expect(entry.classification).toEqual(
        classifyUploadedForm({
          content: form.bytes,
          detectedMimeType: "application/pdf",
          byteSize: form.byteSize,
        }),
      );
      expect(entry.classification?.format).toBe("static_pdf");
    }
  });

  it("has the shape of the reviewed forms: fee sentence, two blanks, four rows, a large box, four footer boxes", async () => {
    const forms = await buildOnePathForms();
    const pet = ArtifactFieldMapSchema.parse(forms.animal_agreement.fieldMap);
    const regions = (fieldId: string) =>
      pet.static!.regions.filter((region) => region.fieldId === fieldId);
    expect(regions("ProcessingFee")).toMatchObject([
      { existing: "replace", format: "money" },
    ]);
    expect(regions("Deposit")).toMatchObject([{ existing: "blank", format: "money" }]);
    expect(regions("Total")).toMatchObject([{ existing: "blank", format: "money" }]);
    // The deposit blank comes first on the line and the total second.
    expect(regions("Deposit")[0].rect.x).toBeLessThan(regions("Total")[0].rect.x);
    expect(regions("AnimalName")).toHaveLength(4);
    expect(pet.static!.pages).toHaveLength(2);
    // The original states one fee in its text and shows another over it.
    const petText = await text(forms.animal_agreement.bytes);
    expect(petText).toContain(ONE_PATH_OLD_FEE_TEXT);
    expect(petText).toMatch(/processing fee of/);

    const owner = ArtifactFieldMapSchema.parse(forms.owner_acknowledgment.fieldMap);
    expect(owner.static!.regions.filter((r) => r.format === "paragraphs")).toHaveLength(
      1,
    );
    expect(
      owner.static!.protectedRegions.filter((r) => r.kind === "execution_date"),
    ).toHaveLength(1);
    expect(owner.static!.regions.filter((r) => r.fieldId === "OwnerName")).toHaveLength(
      2,
    );

    const brochure = ArtifactFieldMapSchema.parse(forms.brokerage_disclosure.fieldMap);
    expect(brochure.unchangedAttachment).toBe(true);
    expect(brochure.fields).toEqual([]);
    expect(brochure.static!.pages.map((page) => page.rotation)).toEqual([90, 90]);
    expect(brochure.static!.protectedRegions).toHaveLength(4);
    expect(
      brochure.static!.protectedRegions.every(
        (region) => region.kind === "initial" && region.signerRole === "tenant",
      ),
    ).toBe(true);
  });

  it("prints two different invented organization names, each on its own form only", async () => {
    const forms = await buildOnePathForms();
    const owner = await text(forms.owner_acknowledgment.bytes);
    const brochure = await text(forms.brokerage_disclosure.bytes);
    expect(ONE_PATH_ORGANIZATIONS.owner_acknowledgment).not.toBe(
      ONE_PATH_ORGANIZATIONS.brokerage_disclosure,
    );
    expect(owner).toContain(ONE_PATH_ORGANIZATIONS.owner_acknowledgment);
    expect(owner).not.toContain(ONE_PATH_ORGANIZATIONS.brokerage_disclosure);
    expect(brochure).toContain(ONE_PATH_ORGANIZATIONS.brokerage_disclosure);
    expect(brochure).not.toContain(ONE_PATH_ORGANIZATIONS.owner_acknowledgment);
    for (const name of Object.values(ONE_PATH_ORGANIZATIONS))
      expect(name).toMatch(/^(Example|Sample) (Example|Sample) /);
  });

  it("becomes the approved catalog through the application's own projection", async () => {
    const { catalog, forms } = await onePathCatalog();
    expect(catalog.artifacts.map((artifact) => artifact.kind).sort()).toEqual([
      "animal_agreement",
      "brokerage_disclosure",
      "owner_acknowledgment",
      "renewal_extension",
    ]);
    const brochure = catalog.artifacts.find((a) => a.kind === "brokerage_disclosure")!;
    expect(brochure.unchangedAttachment).toBe(true);
    expect(brochure.fillMapping).toBeUndefined();
    expect(brochure.contentHash).toBe(forms.brokerage_disclosure.contentHash);
    for (const kind of ["animal_agreement", "owner_acknowledgment"] as const)
      expect(catalog.artifacts.find((a) => a.kind === kind)!.fillMapping?.mapHash).toBe(
        forms[kind].mapHash,
      );
    // The one Admin step the seed leaves: the brochure's use.
    expect(ONE_PATH_FAMILY_USE_STEPS).toEqual([
      { kind: "brokerage_disclosure", use: "mandatory" },
    ]);
    expect(
      catalog.familyUse?.find((entry) => entry.kind === "brokerage_disclosure")?.use,
    ).toBe("mandatory");
  });

  it("builds the differing pet agreement as a different file under its own publication", async () => {
    const usual = (await buildOnePathForms()).animal_agreement;
    const differing = (await buildOnePathForms({ differingPetAgreement: true }))
      .animal_agreement;
    expect(differing.contentHash).not.toBe(usual.contentHash);
    expect(differing.reference).not.toBe(usual.reference);
    const map = ArtifactFieldMapSchema.parse(differing.fieldMap);
    expect(await validateStaticGeometry(differing.bytes, map.static!)).toEqual([]);
    const lines = await readStaticPdfLines(differing.bytes);
    expect(
      lines.filter(
        (line) => line.pageIndex === 1 && line.text.includes(ONE_PATH_OLD_FEE_TEXT),
      ),
    ).toHaveLength(1);
  });
});

describe("S253 rehearsal seed: lease inputs carry no fee, deposit or explanation", () => {
  it("seeds packet inputs the store accepts for every animal profile", () => {
    for (const animals of ONE_PATH_ANIMAL_PROFILES) {
      const record = PacketInputsRecordSchema.parse(
        onePathPacketInputs({ leaseId: "7301", tenants: 5, animals }, SEEDED_AT),
      );
      expect(
        record.people.entries.filter((p) => p.roles[0].signerRole === "tenant"),
      ).toHaveLength(5);
      expect(record.ownerExplanation).toBeUndefined();
      expect(record.animals.entries.every((animal) => animal.deposit === undefined)).toBe(
        true,
      );
      expect(record.chargeOverrides.entries).toEqual([]);
      for (const [fieldKey, entry] of Object.entries(record.facts))
        expect(entry.displayValue).toBe(displayFactValue(fieldKey, entry.value));
      for (const person of record.people.entries) {
        expect(person.email).toMatch(/@example\.invalid$/);
        expect(person.fullName).toMatch(/^(Example|Sample) /);
      }
    }
    expect(ONE_PATH_ANIMAL_PROFILES).toEqual([
      "none",
      "one_pet",
      "two_pets",
      "assistance_animal",
      "pet_and_assistance_animal",
    ]);
  });

  it("gives each lease its own identities, so nothing is shared between two leases", () => {
    const ids = (leaseId: string) => {
      const record = PacketInputsRecordSchema.parse(
        onePathPacketInputs({ leaseId, tenants: 2, animals: "one_pet" }, SEEDED_AT),
      );
      return [
        ...record.people.entries.map((person) => person.personId),
        ...record.animals.entries.map((animal) => animal.animalId),
      ];
    };
    const first = ids("7301");
    expect(new Set([...first, ...ids("7302")]).size).toBe(first.length * 2);
    // Seeding again writes the same documents.
    expect(ids("7301")).toEqual(first);
  });

  it("refuses to write anywhere but the emulator", async () => {
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
    await expect(
      seedOnePathForms(new FakeFirestore() as never, { leases: [{ leaseId: "7301" }] }),
    ).rejects.toThrow(/emulator only/);
  });

  it("writes the originals, the approved entries and the lease inputs, and publishes nothing", async () => {
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:1");
    const fake = new FakeFirestore();
    const { forms } = await seedOnePathForms(fake as never, {
      nowIso: SEEDED_AT,
      leases: [
        { leaseId: "7301", animals: "one_pet" },
        { leaseId: "7302", tenants: 5 },
      ],
    });
    const collections = new Set([...fake.store.keys()].map((path) => path.split("/")[0]));
    expect([...collections].sort()).toEqual([
      "lease_artifact_catalogs",
      "lease_artifact_intake",
      "lease_document_packet_inputs",
      "publication_content_chunks",
      "publication_resources",
      "publication_versions",
    ]);
    // No fee, policy, deposit, explanation or starting text is seeded.
    const everything = JSON.stringify([...fake.store.values()]);
    for (const absent of [
      "petProcessingFee",
      "ownerExplanation",
      '"deposit"',
      "startingText",
    ])
      expect(everything).not.toContain(absent);
    // The placeholder is not a catalog: the lease reads as pending until an Admin records a use.
    expect(
      ApprovedLeaseCatalogSchema.safeParse(
        fake.store.get("lease_artifact_catalogs/current"),
      ).success,
    ).toBe(false);
    expect(
      PacketInputsRecordSchema.safeParse(
        fake.store.get(
          `lease_document_packet_inputs/${onePathPacketInputsDocId("7302")}`,
        ),
      ).success,
    ).toBe(true);
    // Each original reads back byte for byte through the application's publication store.
    for (const form of Object.values(forms)) {
      const publication = onePathPublication(form, SEEDED_AT);
      const version = fake.store.get(`publication_versions/${form.publicationId}`)!;
      expect(version).toMatchObject({
        validated: true,
        data_mode: "live",
        spaceId: "lease-renewals",
        contentHash: form.contentHash,
        renewalArtifactKind: form.kind,
      });
      expect(
        fake.store.get(`publication_resources/${version.resourceId as string}`),
      ).toMatchObject({ activeVersionId: form.publicationId });
      const reference = version.contentRef as PublicationContentReference;
      expect(publication.chunk.id).toBe(
        publicationContentChunkDocumentId(reference.contentId, 0),
      );
      const read = await new FirestorePublicationContentStore(
        fake as unknown as Firestore,
      ).read(reference);
      expect(Buffer.from(read).equals(Buffer.from(form.bytes))).toBe(true);
    }
  });

  it("keeps an existing catalog when it seeds again", async () => {
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:1");
    const fake = new FakeFirestore();
    fake.seed("lease_artifact_catalogs/current", { kept: true });
    await seedOnePathForms(fake as never, { nowIso: SEEDED_AT });
    expect(fake.store.get("lease_artifact_catalogs/current")).toEqual({ kept: true });
  });
});
