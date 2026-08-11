import type {
  LeaseArtifactCatalog,
  LeaseArtifactKind,
  LeaseArtifactVersion,
  PacketEvaluationInput,
  PacketFact,
  PacketParticipant,
  PacketSourceReference,
} from "@/lib/lease-documents/packet-types";

const OBSERVED_AT = "2026-08-10T12:00:00.000Z";

export function s66Source(
  system: string,
  reference = `${system}:fixture`,
): PacketSourceReference {
  return {
    system,
    reference,
    retrievedAt: OBSERVED_AT,
    version: "fixture-v1",
  };
}

export function s66Fact(
  fieldKey: string,
  normalizedValue: string | number | boolean,
  system = "rentvine",
): PacketFact {
  return {
    fieldKey,
    normalizedValue,
    displayValue: String(normalizedValue),
    source: s66Source(system, `${system}:${fieldKey}`),
    confidence: "Verified",
    applicability: "Applicable",
    verifiedBy: "fixture-rule",
    ruleVersion: "fixture-rule-v1",
    blockingScope: "tenant_packet",
  };
}

function artifact(
  kind: LeaseArtifactKind,
  options: Partial<LeaseArtifactVersion> = {},
): LeaseArtifactVersion {
  const audience = kind === "owner_acknowledgment" ? "owner" : "tenant";
  const packetContexts: LeaseArtifactVersion["allowedPacketContexts"] =
    kind === "standard_lease"
      ? ["full_lease_packet"]
      : kind === "renewal_extension"
        ? ["renewal_extension"]
        : kind === "owner_acknowledgment"
          ? ["owner_acknowledgment"]
          : ["renewal_extension", "full_lease_packet"];
  const index = [
    "standard_lease",
    "renewal_extension",
    "animal_agreement",
    "lead_disclosure",
    "city_addendum",
    "hoa_artifact",
    "owner_acknowledgment",
  ].indexOf(kind);
  return {
    artifactId: `fixture-${kind}`,
    kind,
    label: `Fixture ${kind.replaceAll("_", " ")}`,
    version: "fixture-v1",
    contentHash: String(index + 1).repeat(64),
    formFamily: "fixture-standard-family",
    status: "active",
    effectiveFrom: "2026-01-01",
    allowedPacketContexts: packetContexts,
    predicate:
      kind === "lead_disclosure"
        ? {
            kind: "year_built_before",
            fieldKey: "property.year_built",
            yearExclusive: 1978,
            ruleVersion: "fixture-lead-v1",
          }
        : kind === "city_addendum"
          ? {
              kind: "fact_equals",
              fieldKey: "property.city_addendum_applicable",
              expectedValue: true,
              ruleVersion: "fixture-city-v1",
            }
          : kind === "hoa_artifact"
            ? {
                kind: "fact_equals",
                fieldKey: "property.hoa_applicable",
                expectedValue: true,
                ruleVersion: "fixture-hoa-v1",
              }
            : kind === "animal_agreement"
              ? { kind: "any_animal_applicable", ruleVersion: "fixture-animal-v1" }
              : { kind: "always", ruleVersion: "fixture-always-v1" },
    fieldBindings:
      kind === "renewal_extension" || kind === "standard_lease"
        ? [
            {
              fieldId: "fixture-monthly-rent-field",
              factKey: "lease.monthly_rent_cents",
              required: true,
              allowedSourceSystems: ["rentvine"],
            },
          ]
        : [],
    signerRoles: [audience === "tenant" ? "tenant_signer" : "owner_signer"],
    signatureLocations: [`fixture-${audience}-signature-slot`],
    audience,
    publicationSource: s66Source("s21_publication", `publication:${kind}:fixture-v1`),
    providerBindings: {
      dotloopDocumentRef: `fixture-document-ref-${kind}`,
      ...(kind === "renewal_extension" || kind === "standard_lease"
        ? { dotloopTemplateRef: `fixture-template-${kind}` }
        : {}),
    },
    ...options,
  };
}

export function s66Catalog(): LeaseArtifactCatalog {
  return {
    catalogVersion: "fixture-catalog-v1",
    ruleVersion: "fixture-rules-v1",
    activeAt: OBSERVED_AT,
    source: s66Source("s21_publication", "catalog:fixture-v1"),
    requirements: [
      {
        kind: "standard_lease",
        label: "Fixture standard lease",
        packetContexts: ["full_lease_packet"],
      },
      {
        kind: "renewal_extension",
        label: "Fixture renewal extension",
        packetContexts: ["renewal_extension"],
      },
      {
        kind: "animal_agreement",
        label: "Fixture animal agreement",
        packetContexts: ["renewal_extension", "full_lease_packet"],
      },
      {
        kind: "lead_disclosure",
        label: "Fixture lead disclosure",
        packetContexts: ["renewal_extension", "full_lease_packet"],
      },
      {
        kind: "city_addendum",
        label: "Fixture city addendum",
        packetContexts: ["renewal_extension", "full_lease_packet"],
      },
      {
        kind: "hoa_artifact",
        label: "Fixture HOA artifact",
        packetContexts: ["renewal_extension", "full_lease_packet"],
      },
      {
        kind: "owner_acknowledgment",
        label: "Fixture owner acknowledgment",
        packetContexts: ["owner_acknowledgment"],
      },
    ],
    formFamilies: [
      {
        formFamily: "fixture-standard-family",
        extensionCompatible: true,
        source: s66Source("s21_publication", "form-family:fixture-standard"),
      },
      {
        formFamily: "fixture-nonstandard-family",
        extensionCompatible: false,
        source: s66Source("s21_publication", "form-family:fixture-nonstandard"),
      },
    ],
    artifacts: [
      artifact("standard_lease"),
      artifact("renewal_extension"),
      artifact("animal_agreement"),
      artifact("lead_disclosure"),
      artifact("city_addendum"),
      artifact("hoa_artifact"),
      artifact("owner_acknowledgment"),
    ],
  };
}

function participant(
  participantId: string,
  kind: "tenant" | "owner",
  order: number,
): PacketParticipant {
  return {
    participantId,
    kind,
    signerRole: kind === "tenant" ? "tenant_signer" : "owner_signer",
    source: s66Source("rentvine", `participant:${participantId}`),
    confidence: "Verified",
    authoritativeOrder: order,
    providerBindings: { dotloopParticipantRef: `fixture-dotloop-${participantId}` },
  };
}

export function readyS66Input(): PacketEvaluationInput {
  return {
    leaseId: "fixture-lease",
    transactionId: "fixture-transaction",
    facts: [
      s66Fact("transaction.type", "existing_renewal", "workflow"),
      s66Fact("management.origin", "pmi_managed", "executed_lease"),
      s66Fact("active_lease.executed", true, "executed_lease"),
      s66Fact("active_lease.form_family", "fixture-standard-family", "executed_lease"),
      s66Fact("lease.monthly_rent_cents", 123_456),
      s66Fact("property.year_built", 1978),
      s66Fact("property.city_addendum_applicable", false, "company_policy"),
      s66Fact("property.hoa_applicable", false, "company_policy"),
      s66Fact(
        "insurance.coverage_method",
        "not_applicable_under_policy",
        "company_policy",
      ),
    ],
    participants: [
      participant("fixture-tenant-a", "tenant", 0),
      participant("fixture-tenant-b", "tenant", 1),
      participant("fixture-owner-a", "owner", 0),
      participant("fixture-owner-b", "owner", 1),
    ],
    charges: [
      {
        chargeId: "fixture-rbp",
        kind: "resident_benefit_package",
        applicable: false,
        confidence: "Verified",
        source: s66Source("company_policy", "charge:fixture-rbp"),
        policyVersion: "fixture-policy-v1",
      },
    ],
    animals: [],
    catalog: s66Catalog(),
  };
}
