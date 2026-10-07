import type {
  ArtifactPredicate,
  ArtifactRequirement,
  LeaseArtifactCatalog,
  LeaseArtifactKind,
  LeaseArtifactVersion,
} from "@/lib/lease-documents/packet-types";

/**
 * Required S66 artifact families. This is a metadata requirement list, not legal content and not a
 * claim that an approved artifact currently exists.
 */
export const REQUIRED_LEASE_ARTIFACTS: readonly ArtifactRequirement[] = [
  {
    kind: "standard_lease",
    label: "Approved standard lease",
    packetContexts: ["full_lease_packet"],
  },
  {
    kind: "renewal_extension",
    label: "Approved renewal extension",
    packetContexts: ["renewal_extension"],
  },
  {
    kind: "animal_agreement",
    label: "Approved animal agreement",
    packetContexts: ["renewal_extension", "full_lease_packet"],
  },
  {
    kind: "lead_disclosure",
    label: "Approved lead-based-paint disclosure",
    packetContexts: ["renewal_extension", "full_lease_packet"],
  },
  {
    kind: "city_addendum",
    label: "Approved city addendum",
    packetContexts: ["renewal_extension", "full_lease_packet"],
  },
  {
    kind: "hoa_artifact",
    label: "Approved HOA artifact",
    packetContexts: ["renewal_extension", "full_lease_packet"],
  },
  {
    kind: "owner_acknowledgment",
    label: "Approved owner acknowledgment",
    packetContexts: ["owner_acknowledgment"],
  },
] as const;

/**
 * S66 (intake 051): every representable family, including the three further local reference types.
 * Legacy catalogs keep REQUIRED_LEASE_ARTIFACTS; a catalog with Admin family use lists these, and
 * only its configured use decides which families can hold a packet.
 */
export const LEASE_ARTIFACT_FAMILIES: readonly ArtifactRequirement[] = [
  ...REQUIRED_LEASE_ARTIFACTS,
  {
    kind: "kcrar_additional_disclosures",
    label: "Approved KCRAR additional disclosures",
    packetContexts: ["renewal_extension", "full_lease_packet"],
  },
  {
    kind: "brokerage_disclosure",
    label: "Approved brokerage disclosure brochure",
    packetContexts: ["renewal_extension", "full_lease_packet"],
  },
  {
    kind: "insurance_program_addendum",
    label: "Approved insurance program addendum",
    packetContexts: ["renewal_extension", "full_lease_packet"],
  },
] as const;

/**
 * Engineering defaults per family, labeled as such; a reviewed map or the Admin family use may name
 * its own predicate. The KCRAR additional disclosures and brokerage brochure have no default: their
 * applicability is an Admin decision, never inferred from a filename or the word Required in it.
 */
export const DEFAULT_FAMILY_PREDICATE: Partial<
  Record<LeaseArtifactKind, ArtifactPredicate>
> = {
  standard_lease: { kind: "always", ruleVersion: "intake-default-v1" },
  renewal_extension: { kind: "always", ruleVersion: "intake-default-v1" },
  animal_agreement: { kind: "any_animal_applicable", ruleVersion: "intake-default-v1" },
  lead_disclosure: {
    kind: "year_built_before",
    fieldKey: "property.year_built",
    yearExclusive: 1978,
    ruleVersion: "intake-default-v1",
  },
  city_addendum: {
    kind: "fact_equals",
    fieldKey: "property.city_addendum_required",
    expectedValue: true,
    ruleVersion: "intake-default-v1",
  },
  hoa_artifact: {
    kind: "fact_equals",
    fieldKey: "property.hoa_governed",
    expectedValue: true,
    ruleVersion: "intake-default-v1",
  },
  owner_acknowledgment: { kind: "always", ruleVersion: "intake-default-v1" },
  insurance_program_addendum: {
    kind: "fact_equals",
    fieldKey: "insurance.coverage_method",
    expectedValue: "pmi_program",
    ruleVersion: "intake-default-v1",
  },
};

/**
 * The explicit per-lease question for a conditional family with no reviewed rule: the family applies
 * only when a person records that it does. Nothing is inferred; until then the packet holds.
 */
export function explicitApplicabilityPredicate(
  kind: LeaseArtifactKind,
): ArtifactPredicate {
  return {
    kind: "fact_equals",
    fieldKey: `family.${kind}.applicable`,
    expectedValue: true,
    ruleVersion: "explicit-applicability-v1",
  };
}

export function familyLabel(kind: ArtifactRequirement["kind"]): string {
  return LEASE_ARTIFACT_FAMILIES.find((family) => family.kind === kind)?.label ?? kind;
}

/**
 * Current source-truth result of Spike S66-A. The application has no verified legal-artifact
 * metadata to publish into S66. Keeping the catalog explicitly empty makes every dependent result
 * a named blocker instead of allowing a caller-selected template or fallback copy.
 */
export function unavailableLeaseArtifactCatalog(
  observedAt: string,
): LeaseArtifactCatalog {
  return {
    catalogVersion: "unavailable-2026-08-10",
    ruleVersion: "s66-rules-v1",
    activeAt: observedAt,
    source: {
      system: "s21_publication_inventory",
      reference: "spike-s66-a:no-approved-lease-artifact-map",
      retrievedAt: observedAt,
      version: "2026-08-10",
    },
    requirements: [...REQUIRED_LEASE_ARTIFACTS],
    formFamilies: [],
    artifacts: [],
  };
}

/** Select one unambiguous active version. Duplicate active versions are refused as unavailable. */
export function activeArtifactForKind(
  catalog: LeaseArtifactCatalog,
  kind: LeaseArtifactVersion["kind"],
  packetContext: LeaseArtifactVersion["allowedPacketContexts"][number],
): LeaseArtifactVersion | null {
  const candidates = catalog.artifacts.filter(
    (artifact) =>
      artifact.kind === kind &&
      artifact.status === "active" &&
      artifact.allowedPacketContexts.includes(packetContext),
  );
  return candidates.length === 1 ? candidates[0] : null;
}
