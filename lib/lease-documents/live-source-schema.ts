import { z } from "zod";
import { LEASE_ARTIFACT_KINDS, PACKET_CONTEXTS } from "./packet-types";
const text = z.string().trim().min(1).max(500);
const participantRef = text.regex(
  /^[^,\r\n]+$/,
  "A participant reference must be one unambiguous token.",
);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const value = z.union([z.string().max(2000), z.number().finite(), z.boolean()]);
export const PacketSourceSchema = z
  .object({
    system: text,
    reference: text,
    retrievedAt: z.string().datetime(),
    effectiveAt: text.optional(),
    version: text.optional(),
  })
  .strict();
const confidence = z.enum(["Verified", "Likely", "Needs Review", "Conflict"]);
const kind = z.enum(LEASE_ARTIFACT_KINDS);
const context = z.enum(PACKET_CONTEXTS);
const predicate = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("always"), ruleVersion: text }).strict(),
  z
    .object({
      kind: z.literal("year_built_before"),
      fieldKey: text,
      yearExclusive: z.number().int(),
      ruleVersion: text,
    })
    .strict(),
  z
    .object({
      kind: z.literal("fact_equals"),
      fieldKey: text,
      expectedValue: value,
      ruleVersion: text,
    })
    .strict(),
  z.object({ kind: z.literal("any_animal_applicable"), ruleVersion: text }).strict(),
]);
const artifact = z
  .object({
    artifactId: text,
    kind,
    label: text,
    version: text,
    contentHash: hash,
    formFamily: text,
    status: z.enum(["active", "inactive", "superseded"]),
    effectiveFrom: text,
    effectiveUntil: text.optional(),
    allowedPacketContexts: z.array(context).min(1),
    jurisdiction: text.optional(),
    predicate,
    fieldBindings: z
      .array(
        z
          .object({
            fieldId: text,
            factKey: text,
            required: z.boolean(),
            allowedSourceSystems: z.array(text).min(1),
          })
          .strict(),
      )
      .max(100),
    signerRoles: z.array(text).min(1),
    signatureLocations: z.array(text).min(1),
    audience: z.enum(["tenant", "owner"]),
    supersedesArtifactId: text.optional(),
    publicationSource: PacketSourceSchema,
    providerBindings: z
      .object({ dotloopDocumentRef: text, dotloopTemplateRef: text.optional() })
      .strict()
      .optional(),
  })
  .strict();
export const LeaseArtifactCatalogSchema = z
  .object({
    catalogVersion: text,
    ruleVersion: text,
    activeAt: z.string().datetime(),
    source: PacketSourceSchema,
    requirements: z.array(
      z.object({ kind, label: text, packetContexts: z.array(context).min(1) }).strict(),
    ),
    formFamilies: z.array(
      z
        .object({
          formFamily: text,
          extensionCompatible: z.boolean(),
          source: PacketSourceSchema,
        })
        .strict(),
    ),
    artifacts: z.array(artifact).max(100),
  })
  .strict();
const fact = z
  .object({
    fieldKey: text,
    normalizedValue: value,
    displayValue: text,
    source: PacketSourceSchema,
    confidence,
    applicability: z.enum(["Applicable", "Not applicable", "Unknown"]),
    verifiedBy: text,
    ruleVersion: text.optional(),
    target: z.object({ artifactKind: kind, fieldId: text }).strict().optional(),
    blockingScope: text,
  })
  .strict();
const participant = z
  .object({
    participantId: text,
    kind: z.enum(["tenant", "owner"]),
    signerRole: text,
    source: PacketSourceSchema,
    confidence,
    authoritativeOrder: z.number().int().nonnegative(),
    providerBindings: z
      .object({ dotloopParticipantRef: participantRef })
      .strict()
      .optional(),
  })
  .strict();
const charge = z
  .object({
    chargeId: text,
    kind: z.enum(["resident_benefit_package", "insurance", "animal", "other"]),
    applicable: z.boolean().nullable(),
    amountCents: z.number().int().nonnegative().optional(),
    source: PacketSourceSchema.optional(),
    confidence,
    policyVersion: text.optional(),
    targetArtifactKind: kind.optional(),
  })
  .strict();
const animal = z
  .object({
    animalId: text,
    facts: z.array(
      z
        .object({
          key: z.enum(["species", "name", "breed", "weight", "policy_treatment"]),
          value: z.union([text, z.number().finite()]),
          source: PacketSourceSchema,
          confidence,
        })
        .strict(),
    ),
    agreementApplicable: z.boolean().nullable(),
    chargeIds: z.array(text),
    policyVersion: text.optional(),
  })
  .strict();
export const ApprovedPacketSourcesSchema = z
  .object({
    schemaVersion: z.literal("approved-renewal-packet-sources/v1"),
    data_mode: z.literal("live"),
    leaseId: z.string().regex(/^[1-9]\d*$/),
    cycleId: z.string().uuid(),
    termsRevision: z.number().int().positive(),
    leaseSourceHash: hash,
    approvedByUid: text,
    approvedAt: z.string().datetime(),
    source: PacketSourceSchema,
    facts: z.array(fact).max(150),
    participants: z.array(participant).max(50),
    charges: z.array(charge).max(100),
    animals: z.array(animal).max(50),
    contacts: z
      .array(
        z
          .object({
            participantRef,
            fullName: text,
            email: z.string().email(),
            role: z.enum(["TENANT", "LANDLORD", "PROPERTY_MANAGER", "ADMIN", "OTHER"]),
          })
          .strict(),
      )
      .max(50),
  })
  .strict()
  .superRefine((record, ctx) => {
    const refs = record.participants
      .map((p) => p.providerBindings?.dotloopParticipantRef)
      .filter(Boolean);
    if (
      new Set(refs).size !== refs.length ||
      new Set(record.contacts.map((c) => c.participantRef)).size !==
        record.contacts.length
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Participant/contact references must be unique within this approved mapping.",
      });
    if (record.contacts.some((c) => !refs.includes(c.participantRef)))
      ctx.addIssue({
        code: "custom",
        message: "Every contact must map to an actual packet participant.",
      });
  });

export const ApprovedLeaseCatalogSchema = z
  .object({
    schemaVersion: z.literal("approved-lease-catalog/v1"),
    data_mode: z.literal("live"),
    approvedByUid: text,
    approvedAt: z.string().datetime(),
    catalog: LeaseArtifactCatalogSchema,
  })
  .strict();
export type ApprovedPacketSources = z.infer<typeof ApprovedPacketSourcesSchema>;
