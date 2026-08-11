import type {
  ArtifactRequirement,
  LeaseArtifactCatalog,
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
