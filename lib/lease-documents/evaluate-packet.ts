import { activeArtifactForKind } from "@/lib/lease-documents/artifact-catalog";
import type {
  ArtifactPredicate,
  BoundPacketField,
  LeaseArtifactVersion,
  PacketAnimal,
  PacketArtifactResult,
  PacketAudience,
  PacketBlocker,
  PacketCharge,
  PacketClassificationEvidence,
  PacketContext,
  PacketEvaluation,
  PacketEvaluationInput,
  PacketFact,
  PacketParticipant,
  PacketSourceReference,
} from "@/lib/lease-documents/packet-types";
import { stablePacketHash, stablePacketJson } from "@/lib/lease-documents/stable-hash";

const CLASSIFICATION_KEYS = {
  transactionType: "transaction.type",
  managementOrigin: "management.origin",
  activeLeaseExecuted: "active_lease.executed",
  formFamily: "active_lease.form_family",
} as const;

const INSURANCE_COVERAGE_METHOD_KEY = "insurance.coverage_method";

interface FactSelection {
  fact: PacketFact | null;
  conflict: boolean;
  blocker: PacketBlocker | null;
}

interface ClassificationResult {
  context: PacketContext | null;
  evidence: PacketClassificationEvidence | null;
  blockers: PacketBlocker[];
}

interface PredicateResult {
  result: "include" | "exclude" | "unknown";
  reason: string;
  blockers: PacketBlocker[];
}

/**
 * Deterministically evaluate an S66 packet without constructing a provider or generating legal
 * copy. For identical input versions the returned payload hash is identical.
 */
export function evaluateRenewalPacket(input: PacketEvaluationInput): PacketEvaluation {
  const audience = input.audience ?? "tenant";
  const classification =
    audience === "owner"
      ? classifyOwnerAcknowledgment(input)
      : classifyTenantPacket(input);
  const blockers = [...classification.blockers];
  const context = classification.context;

  let manifest: PacketEvaluation["manifest"] = null;
  if (context) {
    const artifactResolution = resolveArtifacts(input, context, audience);
    blockers.push(...artifactResolution.blockers);

    const participantResolution = resolveParticipants(
      input.participants,
      audience,
      artifactResolution.included,
    );
    blockers.push(...participantResolution.blockers);
    if (audience === "tenant") {
      blockers.push(...validateCharges(input.charges, input.facts));
      blockers.push(...validateAnimals(input.animals));
    }

    manifest = {
      packetContext: context,
      audience,
      includedArtifacts: artifactResolution.included,
      excludedArtifacts: artifactResolution.excluded,
      fields: artifactResolution.fields,
      participants: participantResolution.participants,
      charges: audience === "tenant" ? input.charges : [],
      animals: audience === "tenant" ? input.animals : [],
    };
  }

  const uniqueBlockers = dedupeBlockers(blockers);
  const state: PacketEvaluation["state"] = uniqueBlockers.some(
    (blocker) => blocker.code === "conflicting_fact",
  )
    ? "Conflict"
    : uniqueBlockers.length > 0
      ? "Needs input"
      : "Ready for preview";

  const sourceVersions = collectSourceVersions(input, manifest);
  const hashPayload = {
    schemaVersion: 1,
    leaseId: input.leaseId,
    transactionId: input.transactionId,
    packetContext: context,
    classificationEvidence: classification.evidence,
    state,
    manifest,
    blockers: uniqueBlockers,
    catalogVersion: input.catalog.catalogVersion,
    ruleVersion: input.catalog.ruleVersion,
    sourceVersions,
  };

  return {
    ...hashPayload,
    payloadHash: stablePacketHash(hashPayload),
  };
}

function classifyTenantPacket(input: PacketEvaluationInput): ClassificationResult {
  const transaction = selectFact(input.facts, CLASSIFICATION_KEYS.transactionType);
  if (!transaction.fact) {
    return {
      context: null,
      evidence: null,
      blockers: compactBlockers([transaction.blocker]),
    };
  }
  if (transaction.conflict) {
    return {
      context: null,
      evidence: null,
      blockers: compactBlockers([transaction.blocker]),
    };
  }

  if (transaction.fact.normalizedValue === "new_tenancy") {
    return {
      context: "full_lease_packet",
      evidence: { transactionType: transaction.fact },
      blockers: [],
    };
  }
  if (transaction.fact.normalizedValue !== "existing_renewal") {
    return {
      context: null,
      evidence: { transactionType: transaction.fact },
      blockers: [
        invalidFactBlocker(
          CLASSIFICATION_KEYS.transactionType,
          "Verified transaction type must be existing renewal or new tenancy.",
          "packet_classification",
        ),
      ],
    };
  }

  const management = selectFact(input.facts, CLASSIFICATION_KEYS.managementOrigin);
  if (!management.fact || management.conflict) {
    return {
      context: null,
      evidence: { transactionType: transaction.fact },
      blockers: compactBlockers([management.blocker]),
    };
  }
  if (management.fact.normalizedValue === "inherited") {
    return {
      context: "full_lease_packet",
      evidence: {
        transactionType: transaction.fact,
        managementOrigin: management.fact,
      },
      blockers: [],
    };
  }
  if (management.fact.normalizedValue !== "pmi_managed") {
    return {
      context: null,
      evidence: {
        transactionType: transaction.fact,
        managementOrigin: management.fact,
      },
      blockers: [
        invalidFactBlocker(
          CLASSIFICATION_KEYS.managementOrigin,
          "Management origin must be verified as PMI managed or inherited.",
          "packet_classification",
        ),
      ],
    };
  }

  const executed = selectFact(input.facts, CLASSIFICATION_KEYS.activeLeaseExecuted);
  const formFamily = selectFact(input.facts, CLASSIFICATION_KEYS.formFamily);
  const evidence: PacketClassificationEvidence = {
    transactionType: transaction.fact,
    managementOrigin: management.fact,
    ...(executed.fact ? { activeLeaseExecuted: executed.fact } : {}),
    ...(formFamily.fact ? { formFamily: formFamily.fact } : {}),
  };
  const decidingBlockers = compactBlockers([executed.blocker, formFamily.blocker]);
  if (!executed.fact || !formFamily.fact || executed.conflict || formFamily.conflict) {
    return { context: null, evidence, blockers: decidingBlockers };
  }
  if (executed.fact.normalizedValue !== true) {
    return {
      context: null,
      evidence,
      blockers: [
        invalidFactBlocker(
          CLASSIFICATION_KEYS.activeLeaseExecuted,
          "The active executed lease must be verified before packet choice.",
          "packet_classification",
        ),
      ],
    };
  }

  const family = input.catalog.formFamilies.filter(
    (policy) => policy.formFamily === String(formFamily.fact!.normalizedValue),
  );
  if (family.length !== 1 || !validSource(family[0]?.source)) {
    return {
      context: null,
      evidence,
      blockers: [
        missingFactBlocker(
          CLASSIFICATION_KEYS.formFamily,
          "Approved form-family compatibility is unavailable.",
          "packet_classification",
        ),
      ],
    };
  }
  evidence.formFamilyPolicy = family[0];
  return {
    context: family[0].extensionCompatible ? "renewal_extension" : "full_lease_packet",
    evidence,
    blockers: [],
  };
}

function classifyOwnerAcknowledgment(input: PacketEvaluationInput): ClassificationResult {
  const proof = input.tenantCompletionProof;
  const expectedHash = input.expectedTenantPacketHash;
  const required = proof ? unique(proof.requiredTenantParticipantIds) : [];
  const executed = proof ? unique(proof.executedTenantParticipantIds) : [];
  const participantsMatch =
    required.length > 0 &&
    required.length === executed.length &&
    required.every((id) => executed.includes(id));
  const ready =
    proof !== undefined &&
    expectedHash !== undefined &&
    /^[a-f0-9]{64}$/.test(expectedHash) &&
    proof.tenantPacketHash === expectedHash &&
    proof.authenticatedReadback === true &&
    proof.allRequiredArtifactsExecuted === true &&
    proof.providerReceiptId.trim() !== "" &&
    participantsMatch;

  return ready
    ? { context: "owner_acknowledgment", evidence: null, blockers: [] }
    : {
        context: "owner_acknowledgment",
        evidence: null,
        blockers: [
          {
            code: "owner_ack_proof_unavailable",
            label:
              "Authenticated provider readback for the exact fully executed tenant packet is required.",
            scope: "owner_acknowledgment",
          },
        ],
      };
}

function resolveArtifacts(
  input: PacketEvaluationInput,
  context: PacketContext,
  audience: PacketAudience,
): {
  included: PacketArtifactResult[];
  excluded: PacketArtifactResult[];
  fields: BoundPacketField[];
  blockers: PacketBlocker[];
} {
  const included: PacketArtifactResult[] = [];
  const excluded: PacketArtifactResult[] = [];
  const fields: BoundPacketField[] = [];
  const blockers: PacketBlocker[] = [];
  const requirements = input.catalog.requirements.filter((requirement) =>
    requirement.packetContexts.includes(context),
  );

  for (const requirement of requirements) {
    const active = activeArtifactForKind(input.catalog, requirement.kind, context);
    const candidates = input.catalog.artifacts.filter(
      (artifact) =>
        artifact.kind === requirement.kind &&
        artifact.allowedPacketContexts.includes(context),
    );
    const ruleCandidate = active ?? (candidates.length === 1 ? candidates[0] : null);
    if (!ruleCandidate) {
      blockers.push({
        code: "artifact_unavailable",
        label: `Approved artifact unavailable: ${requirement.label}`,
        scope: requirement.kind,
      });
      continue;
    }

    const predicate = evaluatePredicate(
      ruleCandidate.predicate,
      input.facts,
      input.animals,
    );
    blockers.push(...predicate.blockers);
    if (predicate.result === "exclude") {
      excluded.push(artifactResult(ruleCandidate, "Not applicable", predicate.reason));
      continue;
    }
    if (predicate.result === "unknown") {
      excluded.push(artifactResult(ruleCandidate, "Needs input", predicate.reason));
      continue;
    }

    if (
      !active ||
      !validArtifact(active) ||
      active.audience !== audience ||
      candidates.filter((artifact) => artifact.status === "active").length !== 1
    ) {
      blockers.push({
        code: "artifact_unavailable",
        label: `Approved artifact unavailable: ${requirement.label}`,
        scope: requirement.kind,
        ...(ruleCandidate.version ? { sourceReference: ruleCandidate.version } : {}),
      });
      continue;
    }

    included.push(artifactResult(active, "Included", predicate.reason));
    const bound = bindArtifactFields(active, input.facts);
    fields.push(...bound.fields);
    blockers.push(...bound.blockers);
  }

  return { included, excluded, fields, blockers };
}

function bindArtifactFields(
  artifact: LeaseArtifactVersion,
  facts: PacketFact[],
): { fields: BoundPacketField[]; blockers: PacketBlocker[] } {
  const fields: BoundPacketField[] = [];
  const blockers: PacketBlocker[] = [];
  for (const binding of artifact.fieldBindings) {
    const selection = selectFact(facts, binding.factKey);
    if (!selection.fact) {
      if (binding.required) blockers.push(...compactBlockers([selection.blocker]));
      continue;
    }
    if (selection.conflict) {
      blockers.push(...compactBlockers([selection.blocker]));
      continue;
    }
    const fact = selection.fact;
    if (
      !binding.allowedSourceSystems.includes(fact.source.system) ||
      !validDocumentValue(fact.normalizedValue)
    ) {
      blockers.push(
        invalidFactBlocker(
          binding.factKey,
          `Field ${binding.fieldId} is not backed by a permitted exact source.`,
          artifact.kind,
        ),
      );
      continue;
    }
    fields.push({
      artifactId: artifact.artifactId,
      artifactVersion: artifact.version,
      artifactContentHash: artifact.contentHash,
      fieldId: binding.fieldId,
      factKey: binding.factKey,
      normalizedValue: fact.normalizedValue,
      displayValue: fact.displayValue,
      source: fact.source,
      confidence: "Verified",
      applicability: fact.applicability,
      ...(fact.ruleVersion ? { ruleVersion: fact.ruleVersion } : {}),
    });
  }
  return { fields, blockers };
}

function evaluatePredicate(
  predicate: ArtifactPredicate,
  facts: PacketFact[],
  animals: PacketAnimal[],
): PredicateResult {
  if (predicate.kind === "always") {
    return {
      result: "include",
      reason: `Required by ${predicate.ruleVersion}.`,
      blockers: [],
    };
  }
  if (predicate.kind === "any_animal_applicable") {
    if (animals.some((animal) => animal.agreementApplicable === null)) {
      return {
        result: "unknown",
        reason: "Animal-agreement applicability needs verified policy treatment.",
        blockers: [
          {
            code: "animal_fact_unavailable",
            label: "Animal-agreement applicability needs verified policy treatment.",
            scope: "animal_agreement",
          },
        ],
      };
    }
    const applicable = animals.some((animal) => animal.agreementApplicable === true);
    return {
      result: applicable ? "include" : "exclude",
      reason: applicable
        ? `At least one animal is applicable under ${predicate.ruleVersion}.`
        : `No animal is applicable under ${predicate.ruleVersion}.`,
      blockers: [],
    };
  }

  const selection = selectFact(facts, predicate.fieldKey);
  if (!selection.fact || selection.conflict) {
    return {
      result: "unknown",
      reason: `${predicate.fieldKey} is not verified.`,
      blockers: compactBlockers([selection.blocker]),
    };
  }
  if (predicate.kind === "year_built_before") {
    const value = selection.fact.normalizedValue;
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return {
        result: "unknown",
        reason: `${predicate.fieldKey} is malformed.`,
        blockers: [
          invalidFactBlocker(
            predicate.fieldKey,
            "Year built must be a verified integer.",
            "lead_disclosure",
          ),
        ],
      };
    }
    return {
      result: value < predicate.yearExclusive ? "include" : "exclude",
      reason: `${predicate.fieldKey}=${value} evaluated by ${predicate.ruleVersion}.`,
      blockers: [],
    };
  }
  const matches =
    stablePacketJson(selection.fact.normalizedValue) ===
    stablePacketJson(predicate.expectedValue);
  return {
    result: matches ? "include" : "exclude",
    reason: `${predicate.fieldKey} evaluated by ${predicate.ruleVersion}.`,
    blockers: [],
  };
}

function resolveParticipants(
  input: PacketParticipant[],
  audience: PacketAudience,
  artifacts: PacketArtifactResult[],
): { participants: PacketParticipant[]; blockers: PacketBlocker[] } {
  const kind = audience === "tenant" ? "tenant" : "owner";
  const candidates = input.filter((participant) => participant.kind === kind);
  const blockers: PacketBlocker[] = [];
  const byId = new Map<string, PacketParticipant>();
  for (const participant of candidates) {
    const existing = byId.get(participant.participantId);
    if (existing && stablePacketJson(existing) !== stablePacketJson(participant)) {
      blockers.push({
        code: "conflicting_fact",
        label: `Conflicting participant identity: ${participant.participantId}`,
        scope: `${audience}_participants`,
      });
      continue;
    }
    if (
      participant.participantId.trim() === "" ||
      participant.signerRole.trim() === "" ||
      participant.confidence !== "Verified" ||
      !validSource(participant.source)
    ) {
      blockers.push({
        code: "participant_unavailable",
        label: `Verified ${audience} participant role is unavailable.`,
        scope: `${audience}_participants`,
      });
      continue;
    }
    byId.set(participant.participantId, participant);
  }
  if (byId.size === 0) {
    blockers.push({
      code: "participant_unavailable",
      label: `At least one verified ${audience} participant is required.`,
      scope: `${audience}_participants`,
    });
  }

  const allowedSignerRoles = unique(
    artifacts.flatMap((artifact) => artifact.signerRoles ?? []),
  );
  // An artifact with no signature role metadata cannot consume a signer. This catches a missing
  // catalog map without inventing which participant should sign which field.
  if (artifacts.length > 0 && allowedSignerRoles.length === 0) {
    blockers.push({
      code: "participant_unavailable",
      label: "Artifact participant-role metadata is unavailable.",
      scope: `${audience}_participants`,
    });
  } else {
    for (const participant of byId.values()) {
      if (!allowedSignerRoles.includes(participant.signerRole)) {
        blockers.push({
          code: "participant_unavailable",
          label: `Signer role ${participant.signerRole} is not mapped by the active artifacts.`,
          scope: `${audience}_participants`,
        });
      }
    }
  }
  return {
    participants: [...byId.values()].sort(
      (left, right) =>
        left.authoritativeOrder - right.authoritativeOrder ||
        left.participantId.localeCompare(right.participantId),
    ),
    blockers,
  };
}

function validateCharges(charges: PacketCharge[], facts: PacketFact[]): PacketBlocker[] {
  const blockers: PacketBlocker[] = [];
  const rbp = charges.filter((charge) => charge.kind === "resident_benefit_package");
  if (rbp.length !== 1) {
    blockers.push({
      code: "charge_unavailable",
      label: "Resident Benefit Package applicability is required.",
      scope: "resident_benefit_package",
    });
  } else {
    blockers.push(...validateCharge(rbp[0]));
  }

  const method = selectFact(facts, INSURANCE_COVERAGE_METHOD_KEY);
  if (!method.fact || method.conflict) {
    blockers.push(...compactBlockers([method.blocker]));
  } else if (
    ![
      "pmi_program",
      "verified_external_coverage",
      "not_applicable_under_policy",
    ].includes(String(method.fact.normalizedValue))
  ) {
    blockers.push(
      invalidFactBlocker(
        INSURANCE_COVERAGE_METHOD_KEY,
        "Insurance coverage method is not an approved verified value.",
        "insurance",
      ),
    );
  } else {
    const insurance = charges.filter((charge) => charge.kind === "insurance");
    if (method.fact.normalizedValue === "pmi_program" && insurance.length !== 1) {
      blockers.push({
        code: "charge_unavailable",
        label: "The approved PMI insurance charge is required.",
        scope: "insurance",
      });
    }
    for (const charge of insurance) blockers.push(...validateCharge(charge));
  }

  for (const charge of charges.filter(
    (candidate) =>
      candidate.kind !== "resident_benefit_package" && candidate.kind !== "insurance",
  )) {
    blockers.push(...validateCharge(charge));
  }
  return blockers;
}

function validateCharge(charge: PacketCharge): PacketBlocker[] {
  if (
    charge.applicable === null ||
    charge.confidence !== "Verified" ||
    !charge.source ||
    !validSource(charge.source) ||
    !charge.policyVersion
  ) {
    return [
      {
        code: "charge_unavailable",
        label: `Verified applicability, policy, and source are required for ${charge.chargeId}.`,
        scope: charge.targetArtifactKind ?? charge.kind,
      },
    ];
  }
  if (
    charge.applicable &&
    (!Number.isSafeInteger(charge.amountCents) || (charge.amountCents ?? -1) < 0)
  ) {
    return [
      {
        code: "charge_unavailable",
        label: `Approved cents are required for applicable charge ${charge.chargeId}.`,
        scope: charge.targetArtifactKind ?? charge.kind,
      },
    ];
  }
  return [];
}

function validateAnimals(animals: PacketAnimal[]): PacketBlocker[] {
  const blockers: PacketBlocker[] = [];
  const ids = new Set<string>();
  for (const animal of animals) {
    if (animal.animalId.trim() === "" || ids.has(animal.animalId)) {
      blockers.push({
        code: "conflicting_fact",
        label: "Each animal requires one distinct stable identity.",
        scope: "animal_agreement",
      });
      continue;
    }
    ids.add(animal.animalId);
    if (animal.agreementApplicable === null || !animal.policyVersion) {
      blockers.push({
        code: "animal_fact_unavailable",
        label: `Verified agreement applicability is required for animal ${animal.animalId}.`,
        scope: "animal_agreement",
      });
    }
    const requiredKeys = ["species", "breed", "weight", "policy_treatment"] as const;
    for (const key of requiredKeys) {
      const matches = animal.facts.filter((fact) => fact.key === key);
      if (
        matches.length !== 1 ||
        matches[0].confidence !== "Verified" ||
        !validSource(matches[0].source) ||
        !validDocumentValue(matches[0].value)
      ) {
        blockers.push({
          code: "animal_fact_unavailable",
          label: `Verified ${key} is required for animal ${animal.animalId}.`,
          scope: "animal_agreement",
          fieldKey: `animals.${animal.animalId}.${key}`,
        });
      }
    }
  }
  return blockers;
}

function selectFact(facts: PacketFact[], fieldKey: string): FactSelection {
  const matches = facts.filter((fact) => fact.fieldKey === fieldKey);
  const verified = matches.filter(
    (fact) =>
      fact.confidence === "Verified" &&
      fact.applicability !== "Unknown" &&
      validSource(fact.source) &&
      fact.verifiedBy.trim() !== "" &&
      validDocumentValue(fact.normalizedValue),
  );
  const values = unique(verified.map((fact) => stablePacketJson(fact.normalizedValue)));
  const conflict =
    matches.some((fact) => fact.confidence === "Conflict") || values.length > 1;
  if (conflict) {
    return {
      fact: null,
      conflict: true,
      blocker: {
        code: "conflicting_fact",
        label: `Authoritative sources conflict for ${fieldKey}.`,
        scope: matches[0]?.blockingScope ?? "packet",
        fieldKey,
      },
    };
  }
  if (verified.length > 0 && values.length === 1) {
    return { fact: verified[0], conflict: false, blocker: null };
  }
  return {
    fact: null,
    conflict: false,
    blocker:
      matches.length > 0
        ? invalidFactBlocker(
            fieldKey,
            `Verified value and exact provenance are required for ${fieldKey}.`,
            matches[0].blockingScope,
          )
        : missingFactBlocker(fieldKey, `Verified ${fieldKey} is required.`, "packet"),
  };
}

function validArtifact(artifact: LeaseArtifactVersion): boolean {
  return (
    artifact.artifactId.trim() !== "" &&
    artifact.version.trim() !== "" &&
    /^[a-f0-9]{64}$/.test(artifact.contentHash) &&
    artifact.formFamily.trim() !== "" &&
    artifact.signatureLocations.every((location) => location.trim() !== "") &&
    artifact.signerRoles.length > 0 &&
    artifact.signerRoles.every((role) => role.trim() !== "") &&
    validSource(artifact.publicationSource)
  );
}

function validSource(
  source: PacketSourceReference | undefined,
): source is PacketSourceReference {
  return Boolean(
    source &&
    source.system.trim() !== "" &&
    source.system.toLowerCase() !== "boom" &&
    source.reference.trim() !== "" &&
    source.retrievedAt.trim() !== "",
  );
}

function validDocumentValue(value: unknown): value is string | number | boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "boolean";
}

function artifactResult(
  artifact: LeaseArtifactVersion,
  ruleResult: PacketArtifactResult["ruleResult"],
  reason: string,
): PacketArtifactResult {
  return {
    artifactId: artifact.artifactId,
    kind: artifact.kind,
    label: artifact.label,
    version: artifact.version,
    contentHash: artifact.contentHash,
    audience: artifact.audience,
    signerRoles: artifact.signerRoles,
    signatureLocations: artifact.signatureLocations,
    ruleVersion: artifact.predicate.ruleVersion,
    ruleResult,
    reason,
    source: artifact.publicationSource,
  };
}

function collectSourceVersions(
  input: PacketEvaluationInput,
  manifest: PacketEvaluation["manifest"],
): PacketSourceReference[] {
  const sources = [
    input.catalog.source,
    ...input.catalog.formFamilies.map((family) => family.source),
    ...input.catalog.artifacts.map((artifact) => artifact.publicationSource),
    ...input.facts.map((fact) => fact.source),
    ...input.participants.map((participant) => participant.source),
    ...input.charges.flatMap((charge) => (charge.source ? [charge.source] : [])),
    ...input.animals.flatMap((animal) => animal.facts.map((fact) => fact.source)),
    ...(manifest?.fields.map((field) => field.source) ?? []),
  ].filter(validSource);
  const byIdentity = new Map<string, PacketSourceReference>();
  for (const source of sources) {
    byIdentity.set(stablePacketJson(source), source);
  }
  return [...byIdentity.values()].sort((left, right) =>
    stablePacketJson(left).localeCompare(stablePacketJson(right)),
  );
}

function missingFactBlocker(
  fieldKey: string,
  label: string,
  scope: string,
): PacketBlocker {
  return { code: "missing_fact", label, scope, fieldKey };
}

function invalidFactBlocker(
  fieldKey: string,
  label: string,
  scope: string,
): PacketBlocker {
  return { code: "invalid_fact", label, scope, fieldKey };
}

function compactBlockers(values: Array<PacketBlocker | null>): PacketBlocker[] {
  return values.filter((value): value is PacketBlocker => value !== null);
}

function dedupeBlockers(blockers: PacketBlocker[]): PacketBlocker[] {
  const byIdentity = new Map<string, PacketBlocker>();
  for (const blocker of blockers) byIdentity.set(stablePacketJson(blocker), blocker);
  return [...byIdentity.values()].sort((left, right) =>
    stablePacketJson(left).localeCompare(stablePacketJson(right)),
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
