/**
 * S66 lease-document packet truth types.
 *
 * These records deliberately carry metadata and source references, never legal bodies. Legal
 * artifacts remain S21-owned immutable publications; S66 evaluates which exact publication and
 * fields would be consumed before S34 is allowed to construct a provider request.
 */

export const PACKET_CONTEXTS = [
  "renewal_extension",
  "full_lease_packet",
  "owner_acknowledgment",
] as const;
export type PacketContext = (typeof PACKET_CONTEXTS)[number];

export const PACKET_PREPARATION_STATES = [
  "Not evaluated",
  "Needs input",
  "Conflict",
  "Ready for preview",
  "Previewed",
  "Approved",
  "Superseded",
] as const;
export type PacketPreparationState = (typeof PACKET_PREPARATION_STATES)[number];

export const PACKET_EXECUTION_STATES = [
  "Provider pending",
  "Partially executed",
  "Executed",
  "Failed",
  "Cancelled",
] as const;
export type PacketExecutionState = (typeof PACKET_EXECUTION_STATES)[number];

export type PacketVisibleState = PacketPreparationState | PacketExecutionState;
export type PacketAudience = "tenant" | "owner";
export type PacketParticipantKind = "tenant" | "owner";
export type FactConfidence = "Verified" | "Likely" | "Needs Review" | "Conflict";
export type FactApplicability = "Applicable" | "Not applicable" | "Unknown";

export interface PacketSourceReference {
  /** Documented source system, e.g. rentvine or executed_lease. Boom is forbidden by policy. */
  system: string;
  /** Opaque stable record/version reference. It must not contain a legal body or contact value. */
  reference: string;
  retrievedAt: string;
  effectiveAt?: string;
  version?: string;
}

export interface PacketFact {
  fieldKey: string;
  normalizedValue: string | number | boolean;
  displayValue: string;
  source: PacketSourceReference;
  confidence: FactConfidence;
  applicability: FactApplicability;
  verifiedBy: string;
  ruleVersion?: string;
  /** Optional exact artifact/field destination. Catalog bindings remain authoritative. */
  target?: { artifactKind: LeaseArtifactKind; fieldId: string };
  blockingScope: string;
}

export interface PacketParticipant {
  /** Stable source identity; never deduplicate by a display name or email. */
  participantId: string;
  kind: PacketParticipantKind;
  signerRole: string;
  source: PacketSourceReference;
  confidence: FactConfidence;
  authoritativeOrder: number;
  providerBindings?: { dotloopParticipantRef: string };
}

export interface PacketCharge {
  chargeId: string;
  kind: "resident_benefit_package" | "insurance" | "animal" | "other";
  applicable: boolean | null;
  amountCents?: number;
  source?: PacketSourceReference;
  confidence: FactConfidence;
  policyVersion?: string;
  targetArtifactKind?: LeaseArtifactKind;
}

export interface PacketAnimalFact {
  key: "species" | "name" | "breed" | "weight" | "policy_treatment";
  value: string | number;
  source: PacketSourceReference;
  confidence: FactConfidence;
}

export interface PacketAnimal {
  animalId: string;
  facts: PacketAnimalFact[];
  agreementApplicable: boolean | null;
  chargeIds: string[];
  policyVersion?: string;
}

export const LEASE_ARTIFACT_KINDS = [
  "standard_lease",
  "renewal_extension",
  "animal_agreement",
  "lead_disclosure",
  "city_addendum",
  "hoa_artifact",
  "owner_acknowledgment",
] as const;
export type LeaseArtifactKind = (typeof LEASE_ARTIFACT_KINDS)[number];

export type ArtifactPredicate =
  | { kind: "always"; ruleVersion: string }
  | {
      kind: "year_built_before";
      fieldKey: string;
      yearExclusive: number;
      ruleVersion: string;
    }
  | {
      kind: "fact_equals";
      fieldKey: string;
      expectedValue: string | number | boolean;
      ruleVersion: string;
    }
  | { kind: "any_animal_applicable"; ruleVersion: string };

export interface ArtifactFieldBinding {
  fieldId: string;
  factKey: string;
  required: boolean;
  allowedSourceSystems: string[];
}

export interface LeaseArtifactVersion {
  artifactId: string;
  kind: LeaseArtifactKind;
  label: string;
  version: string;
  contentHash: string;
  formFamily: string;
  status: "active" | "inactive" | "superseded";
  effectiveFrom: string;
  effectiveUntil?: string;
  allowedPacketContexts: PacketContext[];
  jurisdiction?: string;
  predicate: ArtifactPredicate;
  fieldBindings: ArtifactFieldBinding[];
  signerRoles: string[];
  signatureLocations: string[];
  audience: PacketAudience;
  supersedesArtifactId?: string;
  publicationSource: PacketSourceReference;
  providerBindings?: {
    dotloopDocumentRef: string;
    dotloopTemplateRef?: string;
  };
}

export interface ArtifactRequirement {
  kind: LeaseArtifactKind;
  label: string;
  packetContexts: PacketContext[];
}

export interface FormFamilyPolicy {
  formFamily: string;
  extensionCompatible: boolean;
  source: PacketSourceReference;
}

export interface LeaseArtifactCatalog {
  catalogVersion: string;
  ruleVersion: string;
  activeAt: string;
  source: PacketSourceReference;
  requirements: ArtifactRequirement[];
  formFamilies: FormFamilyPolicy[];
  artifacts: LeaseArtifactVersion[];
}

export interface PacketClassificationEvidence {
  transactionType: PacketFact;
  managementOrigin?: PacketFact;
  activeLeaseExecuted?: PacketFact;
  formFamily?: PacketFact;
  formFamilyPolicy?: FormFamilyPolicy;
}

export interface PacketBlocker {
  code:
    | "missing_fact"
    | "invalid_fact"
    | "conflicting_fact"
    | "missing_provenance"
    | "artifact_unavailable"
    | "participant_unavailable"
    | "charge_unavailable"
    | "animal_fact_unavailable"
    | "owner_ack_proof_unavailable";
  label: string;
  scope: string;
  fieldKey?: string;
  sourceReference?: string;
}

export interface BoundPacketField {
  artifactId: string;
  artifactVersion: string;
  artifactContentHash: string;
  fieldId: string;
  factKey: string;
  normalizedValue: string | number | boolean;
  displayValue: string;
  source: PacketSourceReference;
  confidence: "Verified";
  applicability: FactApplicability;
  ruleVersion?: string;
}

export interface PacketArtifactResult {
  artifactId?: string;
  kind: LeaseArtifactKind;
  label: string;
  version?: string;
  contentHash?: string;
  audience: PacketAudience;
  signerRoles?: string[];
  signatureLocations?: string[];
  ruleVersion?: string;
  ruleResult: "Included" | "Not applicable" | "Needs input";
  reason: string;
  source?: PacketSourceReference;
}

export interface PacketManifest {
  packetContext: PacketContext;
  audience: PacketAudience;
  includedArtifacts: PacketArtifactResult[];
  excludedArtifacts: PacketArtifactResult[];
  fields: BoundPacketField[];
  participants: PacketParticipant[];
  charges: PacketCharge[];
  animals: PacketAnimal[];
}

export interface PacketEvaluationInput {
  leaseId: string;
  transactionId: string;
  audience?: PacketAudience;
  facts: PacketFact[];
  participants: PacketParticipant[];
  charges: PacketCharge[];
  animals: PacketAnimal[];
  catalog: LeaseArtifactCatalog;
  /** Exact prior execution evidence is accepted only for the owner-ack helper, never as a checkbox. */
  tenantCompletionProof?: AuthenticatedTenantCompletionProof;
  expectedTenantPacketHash?: string;
}

export interface PacketEvaluation {
  leaseId: string;
  transactionId: string;
  packetContext: PacketContext | null;
  classificationEvidence: PacketClassificationEvidence | null;
  state: "Needs input" | "Conflict" | "Ready for preview";
  manifest: PacketManifest | null;
  blockers: PacketBlocker[];
  catalogVersion: string;
  ruleVersion: string;
  sourceVersions: PacketSourceReference[];
  payloadHash: string;
}

export interface AuthenticatedTenantCompletionProof {
  tenantPacketHash: string;
  providerReceiptId: string;
  authenticatedReadback: boolean;
  allRequiredArtifactsExecuted: boolean;
  requiredTenantParticipantIds: string[];
  executedTenantParticipantIds: string[];
  readAt: string;
}

export interface RenewalPacketSnapshot extends PacketEvaluation {
  snapshotId: string;
  snapshotVersion: number;
  actorUid: string;
  createdAt: string;
  previousSnapshotId: string | null;
  current: boolean;
  visibleState: PacketVisibleState;
  execution?: {
    idempotencyKey: string;
    receiptId?: string;
    state: PacketExecutionState;
    reconciledAt?: string;
    errorClass?: string;
  };
}

export interface PacketHead {
  leaseId: string;
  transactionId: string;
  snapshotId: string;
  snapshotVersion: number;
  payloadHash: string;
}
