import { createHash } from "node:crypto";

import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/session";
import {
  ARTIFACT_CATALOG_COLLECTION,
  decideArtifactFamily,
  readArtifactIntakeManifest,
  receiveArtifactFamily,
  recordArtifactFieldMap,
  type ArtifactIntakeDeps,
} from "@/lib/firestore/lease-artifact-intake";
import {
  buildFillWorksheet,
  fillArtifact,
  projectFamilyReadiness,
  projectIntakeCheckpoints,
} from "@/lib/lease-documents/artifact-intake";
import type { ArtifactFieldMap } from "@/lib/lease-documents/artifact-intake-contract";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import { ApprovedLeaseCatalogSchema } from "@/lib/lease-documents/live-source-schema";
import type {
  LeaseArtifactKind,
  PacketEvaluationInput,
  PacketFact,
} from "@/lib/lease-documents/packet-types";
import type { PublicationVersionRecord } from "@/lib/publication/types";
import { FakeFirestore } from "../helpers/fake-firestore";

// S130 (F10, AC-S130-6, AC-S130-8): a local end-to-end run from no materials to SYNTHETIC reviewed
// materials through every checkpoint. A no-pet, no-HOA, post-1978, no-city-addendum lease omits
// the conditional families while the required renewal extension blocks its packet when it is
// missing. The provider-native family fills to comparable values; the PDF family stays a worksheet
// with a manual handoff. No provider is constructed, nothing is uploaded and the real meeting
// record stays pending.

const admin: AuthenticatedUser = {
  uid: "admin-1",
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
} as AuthenticatedUser;
const OP = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pdf = (body: string) => new Uint8Array(Buffer.from(`%PDF-1.4\n${body}\n%%EOF`));
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const CONTEXT_FAMILIES: LeaseArtifactKind[] = [
  "renewal_extension",
  "animal_agreement",
  "lead_disclosure",
  "city_addendum",
  "hoa_artifact",
];
const FILES: Record<string, Uint8Array> = Object.fromEntries(
  CONTEXT_FAMILIES.map((kind, index) => [
    `synthetic-${kind.replace(/_/g, "-")}-0001`,
    pdf(
      `<< /Type /Catalog ${index % 2 === 0 ? "/AcroForm << >>" : ""} >> << /Type /Page >> ${kind}`,
    ),
  ]),
);
const publicationId = (kind: LeaseArtifactKind) =>
  `synthetic-${kind.replace(/_/g, "-")}-0001`;

function publication(id: string): PublicationVersionRecord {
  const bytes = FILES[id];
  return {
    id,
    connectorId: "connector",
    contentByteSize: bytes.byteLength,
    contentHash: sha(bytes),
    contentRef: {
      byteSize: bytes.byteLength,
      chunkCount: 1,
      contentHash: sha(bytes),
      contentId: id,
      storage: "firestore-chunks-v1",
    },
    createdAt: "2026-09-20T12:00:00Z",
    createdByUid: "admin-1",
    detectedMimeType: "application/pdf",
    fileName: `${id}.pdf`,
    path: `/${id}.pdf`,
    policyId: "policy-1",
    resourceId: `resource-${id}`,
    resourceType: "file",
    rootId: "root",
    sensitivity: "Low",
    spaceId: "renewals",
    validated: true,
    versionNumber: 1,
  };
}

const deps: ArtifactIntakeDeps = {
  readPublication: vi.fn(async (id: string) => publication(id)),
  readActiveVersionId: vi.fn(async (resourceId: string) =>
    resourceId.replace("resource-", ""),
  ),
  readContent: vi.fn(
    async (reference: { contentId: string }) => FILES[reference.contentId],
  ),
};

const APPLICABILITY: Partial<
  Record<LeaseArtifactKind, ArtifactFieldMap["applicability"]>
> = {
  animal_agreement: { kind: "any_animal_applicable", ruleVersion: "synthetic-rule" },
  lead_disclosure: {
    kind: "year_built_before",
    fieldKey: "property.year_built",
    yearExclusive: 1978,
    ruleVersion: "synthetic-rule",
  },
  city_addendum: {
    kind: "fact_equals",
    fieldKey: "property.city_addendum_required",
    expectedValue: true,
    ruleVersion: "synthetic-rule",
  },
  hoa_artifact: {
    kind: "fact_equals",
    fieldKey: "property.hoa_governed",
    expectedValue: true,
    ruleVersion: "synthetic-rule",
  },
};

function map(kind: LeaseArtifactKind): ArtifactFieldMap {
  return {
    schemaVersion: "artifact-field-map/v1",
    artifactKind: kind,
    mapVersion: `${kind}-synthetic-v1`,
    templateVersion: `publication:${publicationId(kind)}`,
    formFamily: "synthetic-family",
    formFamilyExtensionCompatible: true,
    audience: "tenant",
    allowedPacketContexts: ["renewal_extension"],
    ...(APPLICABILITY[kind] ? { applicability: APPLICABILITY[kind] } : {}),
    fields: [
      {
        fieldId: "Rent",
        factKey: "renewal.approved_rent",
        meaning: "Approved monthly rent",
        required: true,
        multiplicity: "single",
        allowedSourceSystems: ["staff_recorded_owner_approval"],
      },
      {
        fieldId: "Tenant name",
        factKey: "party.name",
        meaning: "Tenant legal name",
        required: true,
        multiplicity: "per_party",
        allowedSourceSystems: ["rentvine"],
      },
    ],
    signers: [
      {
        signerRole: "tenant",
        participantKind: "tenant",
        required: true,
        location: "Tenant signature",
      },
    ],
    reviewNote: "SYNTHETIC review",
  };
}

const source = (system: string, reference: string) => ({
  system,
  reference,
  retrievedAt: "2026-09-20T12:00:00.000Z",
});
const fact = (
  fieldKey: string,
  value: string | number | boolean,
  system = "rentvine",
): PacketFact => ({
  fieldKey,
  normalizedValue: value,
  displayValue: String(value),
  source: source(system, `${system}:${fieldKey}`),
  confidence: "Verified",
  applicability: "Applicable",
  verifiedBy: "synthetic",
  blockingScope: "synthetic",
});
const FACTS: PacketFact[] = [
  fact("transaction.type", "existing_renewal"),
  fact("management.origin", "pmi_managed"),
  fact("active_lease.executed", true),
  fact("active_lease.form_family", "synthetic-family"),
  fact("renewal.approved_rent", 1200, "staff_recorded_owner_approval"),
  fact("property.year_built", 1990),
  fact("property.city_addendum_required", false),
  fact("property.hoa_governed", false),
  fact("insurance.coverage_method", "not_applicable_under_policy"),
  fact("party.T1.name", "Tenant One"),
];
const PARTICIPANTS: PacketEvaluationInput["participants"] = [
  {
    participantId: "T1",
    kind: "tenant",
    signerRole: "tenant",
    source: source("rentvine", "rentvine:party:T1"),
    confidence: "Verified",
    authoritativeOrder: 0,
  },
];

describe("S130 local end-to-end: no materials to synthetic reviewed materials through every checkpoint", () => {
  it("advances each checkpoint only on recorded evidence, omits conditional families for a reviewed lease, blocks on a missing required form and never invents an upload", async () => {
    const fake = new FakeFirestore();
    const db = fake as unknown as Firestore;
    const evidence = (
      manifest: Awaited<ReturnType<typeof readArtifactIntakeManifest>>,
      extra: Partial<Parameters<typeof projectIntakeCheckpoints>[0]> = {},
    ) =>
      projectIntakeCheckpoints({
        manifest,
        filledValuesVerified: false,
        packetState: null,
        providerReceiptId: null,
        returnedStateInspected: false,
        ...extra,
      });

    // Checkpoint 0: nothing received.
    let manifest = await readArtifactIntakeManifest(db);
    expect(evidence(manifest).map((checkpoint) => checkpoint.state)).toEqual([
      "pending",
      "blocked",
      "blocked",
      "blocked",
      "blocked",
      "pending",
      "pending",
    ]);

    // Checkpoint 1: intake of the five context families through the publication path.
    let op = 1;
    for (const kind of CONTEXT_FAMILIES) {
      const result = await receiveArtifactFamily(
        admin,
        {
          kind,
          publicationSource: {
            system: "s21_publication",
            reference: `publication:${publicationId(kind)}`,
            contentHash: sha(FILES[publicationId(kind)]),
          },
          ...(kind === "hoa_artifact"
            ? {
                providerBindings: {
                  dotloopDocumentRef: "doc-synthetic-hoa",
                  dotloopTemplateRef: "template-synthetic-hoa",
                },
              }
            : {}),
          operationId: OP(op++),
        },
        db,
        deps,
        "2026-09-20T12:00:00Z",
      );
      expect(result.entry.state).toBe("received");
    }
    manifest = await readArtifactIntakeManifest(db);
    expect(manifest.entries.hoa_artifact?.classification?.format).toBe("provider_native");
    expect(manifest.entries.renewal_extension?.classification?.format).toBe(
      "fillable_pdf",
    );
    expect(manifest.entries.animal_agreement?.classification?.format).toBe("static_pdf");
    expect(
      evidence(manifest)
        .slice(0, 3)
        .map((checkpoint) => checkpoint.state),
    ).toEqual(["in_progress", "pending", "blocked"]);

    // Checkpoint 2 and 3: review coverage and mappings, then approve each exact version.
    for (const kind of CONTEXT_FAMILIES) {
      const reviewed = await recordArtifactFieldMap(
        admin,
        {
          kind,
          fieldMap: map(kind),
          detectedFieldIds: ["Rent", "Tenant name"],
          expectedRevision: 1,
        },
        db,
        "2026-09-20T12:30:00Z",
      );
      expect(reviewed.state).toBe("reviewed");
    }
    manifest = await readArtifactIntakeManifest(db);
    expect(
      evidence(manifest)
        .slice(0, 3)
        .map((checkpoint) => checkpoint.state),
    ).toEqual(["in_progress", "done", "pending"]);
    for (const kind of CONTEXT_FAMILIES) {
      const approved = await decideArtifactFamily(
        admin,
        {
          kind,
          decision: "approve",
          reason: "SYNTHETIC approval",
          expectedRevision: 2,
          operationId: OP(op++),
        },
        db,
        deps,
        "2026-09-20T13:00:00Z",
      );
      expect(approved.entry.state).toBe("approved");
    }
    manifest = await readArtifactIntakeManifest(db);
    expect(evidence(manifest).map((checkpoint) => checkpoint.state)).toEqual([
      "in_progress",
      "done",
      "done",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);

    // The catalog the packet evaluation consumes now carries exactly the five approved versions.
    const record = ApprovedLeaseCatalogSchema.parse(
      fake.store.get(`${ARTIFACT_CATALOG_COLLECTION}/current`),
    );
    expect(record.catalog.artifacts.map((artifact) => artifact.kind).sort()).toEqual(
      [...CONTEXT_FAMILIES].sort(),
    );
    const input: PacketEvaluationInput = {
      leaseId: "L1",
      transactionId: "L1",
      facts: FACTS,
      participants: PARTICIPANTS,
      charges: [
        {
          chargeId: "rbp-synthetic",
          kind: "resident_benefit_package",
          applicable: false,
          source: source("rentvine", "rentvine:charge:rbp-synthetic"),
          confidence: "Verified",
          policyVersion: "synthetic-policy-v1",
        },
      ],
      animals: [],
      catalog: record.catalog,
    };
    const evaluation = evaluateRenewalPacket(input);
    expect(evaluation.blockers).toEqual([]);
    expect(evaluation.state).toBe("Ready for preview");
    expect(
      evaluation.manifest?.includedArtifacts.map((artifact) => artifact.kind),
    ).toEqual(["renewal_extension"]);
    expect(
      evaluation.manifest?.excludedArtifacts
        .map((artifact) => [artifact.kind, artifact.ruleResult])
        .sort(),
    ).toEqual([
      ["animal_agreement", "Not applicable"],
      ["city_addendum", "Not applicable"],
      ["hoa_artifact", "Not applicable"],
      ["lead_disclosure", "Not applicable"],
    ]);
    const readiness = projectFamilyReadiness({
      manifest,
      evaluation,
      connection: "disconnected",
      actionExecutable: false,
    });
    expect(readiness.families.filter((family) => family.blocking)).toEqual([]);
    expect(
      readiness.families.find((family) => family.kind === "animal_agreement")
        ?.applicability,
    ).toBe("not_applicable");
    expect(
      readiness.dependencies.map((dependency) => [dependency.id, dependency.state]),
    ).toEqual([
      ["materials", "ready"],
      ["mappings", "ready"],
      ["connection", "missing"],
      ["action_key", "missing"],
      ["confirmation", "pending_person"],
    ]);

    // Checkpoint 4: the fill boundary. Provider-native values are comparable; the PDF stays a worksheet.
    const hoa = fillArtifact({
      format: "provider_native",
      worksheet: buildFillWorksheet(map("hoa_artifact"), {
        facts: FACTS,
        participants: PARTICIPANTS,
        animals: [],
      }),
    });
    expect(hoa).toMatchObject({
      kind: "provider_field_values",
      values: { Rent: "1200", "Tenant name[T1]": "Tenant One" },
    });
    const renewal = fillArtifact({
      format: "fillable_pdf",
      worksheet: buildFillWorksheet(map("renewal_extension"), {
        facts: FACTS,
        participants: PARTICIPANTS,
        animals: [],
      }),
    });
    expect(renewal).toMatchObject({
      kind: "machine_autofill_unavailable",
      handoff: "manual_dotloop",
    });
    expect(
      evidence(manifest, { filledValuesVerified: true, packetState: evaluation.state })
        .slice(3, 5)
        .map((checkpoint) => checkpoint.state),
    ).toEqual(["done", "pending"]);

    // A genuinely required form blocks its packet when its approved material is replaced.
    const replacement = pdf(
      "<< /Type /Catalog /AcroForm << >> >> << /Type /Page >> replacement",
    );
    FILES["synthetic-renewal-extension-0002"] = replacement;
    await receiveArtifactFamily(
      admin,
      {
        kind: "renewal_extension",
        publicationSource: {
          system: "s21_publication",
          reference: "publication:synthetic-renewal-extension-0002",
          contentHash: sha(replacement),
        },
        operationId: OP(op++),
      },
      db,
      deps,
      "2026-09-21T12:00:00Z",
    );
    const rewritten = ApprovedLeaseCatalogSchema.parse(
      fake.store.get(`${ARTIFACT_CATALOG_COLLECTION}/current`),
    );
    const blocked = evaluateRenewalPacket({ ...input, catalog: rewritten.catalog });
    expect(blocked.state).toBe("Needs input");
    expect(
      blocked.blockers.map((blocker) => [blocker.code, blocker.scope]),
    ).toContainEqual(["artifact_unavailable", "renewal_extension"]);
    manifest = await readArtifactIntakeManifest(db);
    const afterReplacement = projectFamilyReadiness({
      manifest,
      evaluation: blocked,
      connection: "disconnected",
      actionExecutable: false,
    });
    expect(
      afterReplacement.families.find((family) => family.kind === "renewal_extension"),
    ).toMatchObject({ materials: "received", blocking: false, applicability: "unknown" });
    expect(manifest.entries.renewal_extension?.supersedes).toBe(
      "publication:synthetic-renewal-extension-0001",
    );

    // Checkpoints 5 to 7 stay pending: no provider effect was dispatched and no state was read back.
    const final = evidence(manifest);
    expect(final.slice(4).map((checkpoint) => checkpoint.state)).toEqual([
      "pending",
      "pending",
      "pending",
    ]);
    expect(final[5].detail).toMatch(/Not run/);
    expect(final[6].detail).toMatch(/Pending meeting/);
    expect(vi.mocked(deps.readContent).mock.calls).toHaveLength(6);
    expect([...fake.store.keys()].some((key) => /dotloop|upload|loop/i.test(key))).toBe(
      false,
    );
  });
});
