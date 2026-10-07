// S66 (ARCH-S66-1, ARCH-S66-2): assemble one lease's packet evaluation inputs from their owners.
//
// The Admin-approved per-lease mapping (when one exists and is current), the staff packet inputs,
// the published charge policy and the owner approval bound to the Working terms each keep their
// own source. Current RentVine reads are offered for adoption; an adopted value the source no
// longer reports conflicts until staff adopt the current value or record a deliberate correction.
// Pure: no I/O and no provider or source write.

import type { RawLease } from "@/lib/integrations/rentvine/client";
import { leaseEndDateIso, leaseViewId } from "@/lib/integrations/rentvine/lease-mapper";
import {
  calculateRenewalCharges,
  CHARGE_POLICY_SOURCE_SYSTEM,
  type CalculatedCharges,
  type ChargePolicyRecord,
} from "@/lib/lease-documents/charge-policy";
import {
  PACKET_INPUT_SOURCE_SYSTEM,
  packetInputFacts,
  packetInputParties,
  type PacketAnimalInput,
  type PacketInputContact,
  type PacketInputsRecord,
} from "@/lib/lease-documents/packet-inputs";
import type {
  PacketAnimal,
  PacketAnimalFact,
  PacketCharge,
  PacketFact,
  PacketParticipant,
} from "@/lib/lease-documents/packet-types";
import { projectRenewalDeskIdentity } from "@/lib/lease-renewal/desk-identity";
import { toLeaseTermIsoDate } from "@/lib/lease-renewal/lease-term";

export interface SourceParty {
  side: "tenant" | "owner";
  name: string;
  email: string | null;
  /** The exact source location of this person on the current lease read. */
  sourceRef: string;
}

/** The current RentVine lease read as packet facts and source people; nothing is inferred. */
export function rentVinePacketSource(
  view: RawLease,
  observedAt: string,
): { facts: PacketFact[]; parties: SourceParty[] } {
  const identity = projectRenewalDeskIdentity(view);
  const id = leaseViewId(view) ?? "unknown";
  const facts: PacketFact[] = [];
  const fact = (fieldKey: string, value: string, reference: string) =>
    facts.push({
      fieldKey,
      normalizedValue: value,
      displayValue: value,
      source: { system: "rentvine", reference, retrievedAt: observedAt },
      confidence: "Verified",
      applicability: "Applicable",
      verifiedBy: "rentvine",
      blockingScope: "packet",
    });
  const address = identity.unit?.address ?? identity.address;
  if (address) fact("property.address", address.label, address.sourceRef);
  const start = toLeaseTermIsoDate(view.startDate);
  if (start) fact("lease.current_start_date", start, `rentvine:lease:${id}:startDate`);
  const end = leaseEndDateIso(view);
  if (end) fact("lease.current_end_date", end, `rentvine:lease:${id}:endDate`);
  const parties: SourceParty[] = [
    ...identity.tenants.map((party) => ({ party, side: "tenant" as const })),
    ...identity.owners.map((party) => ({ party, side: "owner" as const })),
  ].map(({ party, side }) => ({
    side,
    name: party.label,
    email: party.email?.label.toLowerCase() ?? null,
    sourceRef: party.sourceRef,
  }));
  return { facts, parties };
}

export interface LegacyPacketSources {
  facts: PacketFact[];
  participants: PacketParticipant[];
  charges: PacketCharge[];
  animals: PacketAnimal[];
  contacts: Array<{
    participantRef: string;
    fullName: string;
    email: string;
    role: string;
  }>;
}

export interface AssembledPacketSources {
  facts: PacketFact[];
  participants: PacketParticipant[];
  charges: PacketCharge[];
  animals: PacketAnimal[];
  contacts: Array<{
    participantRef: string;
    fullName: string;
    email: string;
    role: string;
  }>;
  /** The charges calculated from the packet inputs and published policy, when they were used. */
  calculated: CalculatedCharges | null;
  /** Source values a staff entry deliberately replaced, kept visible beside the entry. */
  replacedSourceFacts: PacketFact[];
  notices: string[];
}

function animalFacts(
  record: PacketInputsRecord,
  animal: PacketAnimalInput,
  calculated: CalculatedCharges,
): PacketAnimalFact[] {
  const source = {
    system: PACKET_INPUT_SOURCE_SYSTEM,
    reference: `packet-inputs:${record.leaseId}:animals:${animal.animalId}`,
    retrievedAt: record.animals.updatedAt ?? record.updatedAt,
    version: String(record.animals.revision),
  };
  const facts: PacketAnimalFact[] = [];
  const add = (key: PacketAnimalFact["key"], value: string | number | null) => {
    if (value !== null) facts.push({ key, value, source, confidence: "Verified" });
  };
  add("name", animal.name);
  add("species", animal.species);
  add("breed", animal.breed);
  add("weight", animal.weight);
  add("weight_unit", animal.weightUnit);
  add("maturity", animal.maturity);
  add("fido_score", animal.fidoScore);
  add(
    "policy_treatment",
    animal.treatment === null
      ? null
      : animal.treatment === "pet"
        ? "Pet"
        : "Assistance animal",
  );
  const result = calculated.animals.find((entry) => entry.animalId === animal.animalId);
  const policySource = (cadence: string) => {
    const charge = calculated.charges.find(
      (entry) => entry.chargeId === `animal:${animal.animalId}:${cadence}`,
    );
    return (
      charge?.source ?? {
        system: CHARGE_POLICY_SOURCE_SYSTEM,
        reference: "charge-policy",
        retrievedAt: record.updatedAt,
      }
    );
  };
  for (const [cadence, key] of [
    ["monthly", "monthly_charge"],
    ["one_time", "one_time_fee"],
    ["refundable_deposit", "refundable_deposit"],
  ] as const) {
    const amount = result?.amounts[cadence];
    if (amount !== null && amount !== undefined)
      facts.push({
        key,
        value: Math.round(amount) / 100,
        source: policySource(cadence),
        confidence: "Verified",
      });
  }
  return facts;
}

/**
 * Combine every owner of the packet's inputs. A current Admin mapping keeps the sections it
 * carries (legacy behavior); the staff packet inputs supply the rest. Owner-approved Working terms
 * arrive as their own facts from `currentOwnerApproval`.
 */
export function assemblePacketSources(input: {
  leaseId: string;
  mapping: LegacyPacketSources | null;
  inputs: PacketInputsRecord | null;
  policy: ChargePolicyRecord | null;
  source: { facts: PacketFact[]; parties: SourceParty[] };
  approvedTermFacts: PacketFact[];
}): AssembledPacketSources {
  const notices: string[] = [];
  const staffFacts = packetInputFacts(input.inputs);
  const entries = input.inputs?.facts ?? {};
  // Current source values are offered to staff, who adopt or correct them; the packet uses the
  // adopted value with its own provenance, so an identical reread never creates a new snapshot.
  // A value adopted from the source that the source no longer reports is a conflict until staff
  // adopt the current value or record a deliberate correction with a reason.
  const replacedSourceFacts = input.source.facts.filter(
    (fact) => entries[fact.fieldKey]?.overridesSource,
  );
  const conflictFacts: PacketFact[] = [];
  for (const fact of input.source.facts) {
    const entry = entries[fact.fieldKey];
    if (
      !entry ||
      entry.overridesSource ||
      entry.origin !== "adopted_source" ||
      JSON.stringify(entry.value) === JSON.stringify(fact.normalizedValue)
    )
      continue;
    conflictFacts.push({
      ...fact,
      // The adopted entry time keeps this marker identical across rereads of the same source.
      source: {
        ...fact.source,
        retrievedAt: entry.recordedAt,
        version: "current-source",
      },
      confidence: "Conflict",
    });
    notices.push(
      `${fact.fieldKey}: RentVine now reports a different value than the one adopted. Adopt the current value or record a correction with a reason.`,
    );
  }
  const parties = packetInputParties(input.inputs);

  // A person adopted from a verified source contact stays verified only while the current lease
  // read still lists that contact with the same email.
  const unmatched = new Set<string>();
  for (const person of input.inputs?.people.entries ?? []) {
    if (person.emailBasis !== "verified_contact") continue;
    const match = input.source.parties.find(
      (party) => party.sourceRef === person.contactRef && party.email === person.email,
    );
    if (!match) {
      unmatched.add(person.personId);
      notices.push(
        `${person.fullName}: the RentVine contact this person was adopted from changed or is missing. Review the person before the packet is prepared.`,
      );
    }
  }
  const inputParticipants = parties.participants.map((participant) =>
    unmatched.has(participant.participantId.split(":")[0])
      ? { ...participant, confidence: "Needs Review" as const }
      : participant,
  );
  const inputContacts: PacketInputContact[] = parties.contacts.filter(
    (contact) => !unmatched.has(contact.participantRef.split(":")[0]),
  );

  const mapping = input.mapping;
  const mappingHasPeople = (mapping?.participants.length ?? 0) > 0;
  const mappingHasEconomics =
    (mapping?.charges.length ?? 0) > 0 || (mapping?.animals.length ?? 0) > 0;

  let calculated: CalculatedCharges | null = null;
  let charges: PacketCharge[];
  let animals: PacketAnimal[];
  if (mappingHasEconomics && mapping) {
    charges = mapping.charges;
    animals = mapping.animals;
  } else {
    calculated = calculateRenewalCharges({
      leaseId: input.leaseId,
      policy: input.policy,
      facts: [...(mapping?.facts ?? []), ...staffFacts],
      animals: input.inputs?.animals.entries ?? [],
      overrides: input.inputs?.chargeOverrides.entries ?? [],
    });
    charges = calculated.charges;
    animals = (input.inputs?.animals.entries ?? []).map((animal) => ({
      animalId: animal.animalId,
      facts: animalFacts(input.inputs!, animal, calculated!),
      agreementApplicable: calculated!.agreementApplicable[animal.animalId] ?? null,
      chargeIds: calculated!.charges
        .filter((charge) => charge.animalId === animal.animalId)
        .map((charge) => charge.chargeId),
      ...(calculated!.policyVersion ? { policyVersion: calculated!.policyVersion } : {}),
    }));
    for (const issue of calculated.issues) notices.push(issue.label);
  }

  return {
    facts: [
      ...(mapping?.facts ?? []),
      ...conflictFacts,
      ...staffFacts,
      ...(mappingHasPeople ? [] : parties.facts),
      ...(calculated?.facts ?? []),
      ...input.approvedTermFacts,
    ],
    participants: mappingHasPeople ? mapping!.participants : inputParticipants,
    charges,
    animals,
    contacts: mappingHasPeople ? mapping!.contacts : inputContacts,
    calculated,
    replacedSourceFacts,
    notices,
  };
}
