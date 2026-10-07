// S66 (AC-S66-1, AC-S66-4, AC-S66-5): the app-owned renewal packet inputs of one lease.
//
// Staff enter or correct lease facts, the actual people and organizations with their signer roles,
// and the animals once; the packet evaluator, filled files and the Dotloop handoff all read this
// one record. Each fact and each section carries its own revision, so a stale concurrent edit is
// refused with the current value while unrelated work stays usable. Saving inputs never reads or
// writes RentVine, the operating Sheet or Dotloop, and a staff value is never relabeled as a
// provider value: it keeps its own actor, time and provenance beside the source it corrects.

import { z } from "zod";

import {
  PARTICIPANT_KIND_FOR_ROLE,
  SIGNER_ROLES,
  type SignerRole,
} from "@/lib/lease-documents/artifact-intake-contract";
import type {
  PacketFact,
  PacketParticipant,
  PacketSourceReference,
} from "@/lib/lease-documents/packet-types";
import { EditableLayerError } from "@/lib/errors/editable-layer-error";
import {
  DOTLOOP_PARTICIPANT_ROLES,
  type DotloopParticipantRole,
} from "@/lib/integrations/dotloop/participant-roles";

export const PACKET_INPUTS_SCHEMA_VERSION = "renewal-packet-inputs/v1";
/** The source system of a value staff entered or reviewed in the packet inputs. */
export const PACKET_INPUT_SOURCE_SYSTEM = "renewal_staff_entry";

// The documented Dotloop participant roles a reviewed signer may be handed off as.
export { DOTLOOP_PARTICIPANT_ROLES, type DotloopParticipantRole };

/** The Dotloop role a signer role is handed off as unless staff choose another documented one. */
export const DEFAULT_DOTLOOP_ROLE: Readonly<Record<SignerRole, DotloopParticipantRole>> =
  {
    tenant: "TENANT",
    owner: "LANDLORD",
    property_manager: "PROPERTY_MANAGER",
    broker: "MANAGING_BROKER",
    guarantor: "OTHER",
  };

export const SIGNER_ROLE_LABELS: Readonly<Record<SignerRole, string>> = {
  tenant: "Tenant",
  owner: "Owner or landlord",
  property_manager: "PMI manager",
  broker: "Broker",
  guarantor: "Guarantor",
};

export const FACT_ORIGINS = ["staff_entry", "adopted_source"] as const;
export type PacketFactOrigin = (typeof FACT_ORIGINS)[number];

const uid = z.string().trim().min(1).max(128);
const isoTime = z.string().datetime();
export const packetFactKey = z
  .string()
  .max(120)
  .regex(
    /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/,
    "A fact key is a dotted lowercase name such as property.year_built.",
  );
export const packetFactValue = z.union([
  z.string().trim().min(1).max(500),
  z.number().finite(),
  z.boolean(),
]);
export type PacketFactValue = z.infer<typeof packetFactValue>;

const FactEntrySchema = z
  .object({
    value: packetFactValue,
    displayValue: z.string().trim().min(1).max(500),
    revision: z.number().int().positive(),
    eventId: z.string().uuid(),
    recordedAt: isoTime,
    recordedByUid: uid,
    origin: z.enum(FACT_ORIGINS),
    sourceLabel: z.string().trim().min(1).max(160).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    /** Staff deliberately correct the current source value; the reason says why. */
    overridesSource: z.literal(true).optional(),
  })
  .strict();
export type PacketFactEntry = z.infer<typeof FactEntrySchema>;

const RoleSchema = z
  .object({
    signerRole: z.enum(SIGNER_ROLES),
    /** 1-based order among the people holding this signer role. */
    order: z.number().int().min(1).max(20),
    dotloopRole: z.enum(DOTLOOP_PARTICIPANT_ROLES),
  })
  .strict();

export const PacketPersonInputSchema = z
  .object({
    personId: z.string().uuid(),
    kind: z.enum(["person", "organization"]),
    fullName: z.string().trim().min(1).max(160),
    email: z.string().trim().toLowerCase().email().max(254).nullable(),
    /** Where the email came from: a verified source contact or an explicit staff review. */
    emailBasis: z.enum(["verified_contact", "staff_reviewed"]).nullable(),
    /** The source contact this person was adopted from, when one was used. */
    contactRef: z.string().trim().min(1).max(200).nullable(),
    roles: z.array(RoleSchema).max(5),
  })
  .strict();
export type PacketPersonInput = z.infer<typeof PacketPersonInputSchema>;

export const ANIMAL_TREATMENTS = ["pet", "assistance_animal"] as const;
export type AnimalTreatment = (typeof ANIMAL_TREATMENTS)[number];

export const PacketAnimalInputSchema = z
  .object({
    animalId: z.string().uuid(),
    name: z.string().trim().min(1).max(80).nullable(),
    species: z.string().trim().min(1).max(60).nullable(),
    breed: z.string().trim().min(1).max(80).nullable(),
    weight: z.number().finite().positive().max(500).nullable(),
    weightUnit: z.enum(["lb", "kg"]).nullable(),
    /** Whether the weight is the animal's current weight or an expected adult weight. */
    weightBasis: z.enum(["current", "expected_adult"]).nullable(),
    maturity: z.enum(["adult", "juvenile"]).nullable(),
    /** The pet-screening FIDO score as recorded; null when unknown. */
    fidoScore: z.number().int().min(1).max(5).nullable(),
    /** Unknown until staff record it; never inferred. */
    treatment: z.enum(ANIMAL_TREATMENTS).nullable(),
  })
  .strict();
export type PacketAnimalInput = z.infer<typeof PacketAnimalInputSchema>;

export const ChargeOverrideInputSchema = z
  .object({
    chargeId: z.string().trim().min(1).max(120),
    amountCents: z.number().int().nonnegative().max(10_000_000),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type ChargeOverrideInput = z.infer<typeof ChargeOverrideInputSchema>;

const StoredOverrideSchema = ChargeOverrideInputSchema.extend({
  recordedAt: isoTime,
  recordedByUid: uid,
}).strict();
export type StoredChargeOverride = z.infer<typeof StoredOverrideSchema>;

function section<T extends z.ZodTypeAny>(entry: T, max: number) {
  return z
    .object({
      revision: z.number().int().nonnegative(),
      entries: z.array(entry).max(max),
      updatedAt: isoTime.optional(),
      updatedByUid: uid.optional(),
    })
    .strict();
}

function peopleIssues(people: readonly PacketPersonInput[]): string | null {
  if (new Set(people.map((person) => person.personId)).size !== people.length)
    return "Each person needs one distinct identity.";
  const slots = new Set<string>();
  for (const person of people) {
    if ((person.email === null) !== (person.emailBasis === null))
      return `Record where ${person.fullName}'s email comes from, or leave both empty.`;
    if (new Set(person.roles.map((role) => role.signerRole)).size !== person.roles.length)
      return `${person.fullName} holds the same signer role twice.`;
    for (const role of person.roles) {
      const slot = `${role.signerRole}#${role.order}`;
      if (slots.has(slot))
        return `Two people hold ${SIGNER_ROLE_LABELS[role.signerRole]} position ${role.order}.`;
      slots.add(slot);
    }
  }
  for (const role of SIGNER_ROLES) {
    const orders = people
      .flatMap((person) => person.roles)
      .filter((entry) => entry.signerRole === role)
      .map((entry) => entry.order)
      .sort((a, b) => a - b);
    if (orders.some((order, index) => order !== index + 1))
      return `${SIGNER_ROLE_LABELS[role]} positions must run 1, 2, 3 without a gap.`;
  }
  return null;
}

export const PacketInputsRecordSchema = z
  .object({
    schemaVersion: z.literal(PACKET_INPUTS_SCHEMA_VERSION),
    leaseId: z.string().regex(/^[1-9]\d*$/),
    revision: z.number().int().positive(),
    facts: z.record(packetFactKey, FactEntrySchema),
    people: section(PacketPersonInputSchema, 30),
    animals: section(PacketAnimalInputSchema, 20),
    chargeOverrides: section(StoredOverrideSchema, 60),
    updatedAt: isoTime,
    updatedByUid: uid,
  })
  .strict()
  .superRefine((record, ctx) => {
    const issue = peopleIssues(record.people.entries);
    if (issue) ctx.addIssue({ code: "custom", message: issue });
    const animals = record.animals.entries.map((animal) => animal.animalId);
    if (new Set(animals).size !== animals.length)
      ctx.addIssue({
        code: "custom",
        message: "Each animal needs one distinct identity.",
      });
    const overrides = record.chargeOverrides.entries.map((entry) => entry.chargeId);
    if (new Set(overrides).size !== overrides.length)
      ctx.addIssue({ code: "custom", message: "One override per charge." });
  });
export type PacketInputsRecord = z.infer<typeof PacketInputsRecordSchema>;

const FactChangeSchema = z
  .object({
    fieldKey: packetFactKey,
    /** The fact revision the editor last read; 0 when the fact has never been saved. */
    expectedRevision: z.number().int().nonnegative(),
    /** Null deliberately clears the staff value; any source value then stands alone. */
    value: packetFactValue.nullable(),
    origin: z.enum(FACT_ORIGINS).default("staff_entry"),
    sourceLabel: z.string().trim().min(1).max(160).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    overridesSource: z.boolean().optional(),
  })
  .strict();

export const SavePacketInputsSchema = z
  .object({
    leaseId: z.string().regex(/^[1-9]\d*$/),
    operationId: z.string().uuid(),
    facts: z.array(FactChangeSchema).max(40).optional(),
    people: z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        entries: z.array(PacketPersonInputSchema).max(30),
      })
      .strict()
      .optional(),
    animals: z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        entries: z.array(PacketAnimalInputSchema).max(20),
      })
      .strict()
      .optional(),
    chargeOverrides: z
      .object({
        expectedRevision: z.number().int().nonnegative(),
        entries: z.array(ChargeOverrideInputSchema).max(60),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (input) =>
      (input.facts?.length ?? 0) > 0 ||
      input.people !== undefined ||
      input.animals !== undefined ||
      input.chargeOverrides !== undefined,
    "Nothing to save.",
  );
export type SavePacketInputs = z.input<typeof SavePacketInputsSchema>;

/** Plain-language labels for the facts the packet editor always offers. */
export const PACKET_FACT_DEFINITIONS: Readonly<
  Record<
    string,
    {
      label: string;
      type: "text" | "number" | "boolean" | "date" | "money" | "choice";
      choices?: ReadonlyArray<{ value: string; label: string }>;
    }
  >
> = {
  "transaction.type": {
    label: "Transaction",
    type: "choice",
    choices: [{ value: "existing_renewal", label: "Renewal of the existing lease" }],
  },
  "management.origin": {
    label: "Management origin",
    type: "choice",
    choices: [
      { value: "pmi_managed", label: "Managed by PMI since the lease began" },
      { value: "inherited", label: "Inherited from another manager" },
    ],
  },
  "active_lease.executed": {
    label: "The current lease is fully signed",
    type: "boolean",
  },
  "active_lease.form_family": { label: "Current lease form family", type: "text" },
  "insurance.coverage_method": {
    label: "Renter's insurance",
    type: "choice",
    choices: [
      { value: "pmi_program", label: "PMI insurance program" },
      { value: "verified_external_coverage", label: "Verified outside coverage" },
      { value: "not_applicable_under_policy", label: "Not applicable under policy" },
    ],
  },
  "charges.resident_benefit_package.enrolled": {
    label: "Resident Benefit Package enrolled",
    type: "boolean",
  },
  "property.address": { label: "Property address", type: "text" },
  "property.year_built": { label: "Year built", type: "number" },
  "property.city_addendum_required": {
    label: "City addendum required",
    type: "boolean",
  },
  "property.hoa_governed": { label: "Governed by an HOA", type: "boolean" },
  "landlord.legal_entity": { label: "Landlord legal entity", type: "text" },
  "lease.original_date": { label: "Original lease date", type: "date" },
  "renewal.return_by_date": { label: "Return the signed renewal by", type: "date" },
  "renewal.fallback_term": {
    label: "If not renewed",
    type: "choice",
    choices: [
      { value: "month_to_month", label: "Continue month to month" },
      { value: "termination", label: "Lease ends on the end date" },
    ],
  },
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** The default display text for a staff value; it never changes the stored value. */
export function displayFactValue(fieldKey: string, value: PacketFactValue): string {
  const definition = PACKET_FACT_DEFINITIONS[fieldKey];
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (definition?.type === "choice") {
    const choice = definition.choices?.find((entry) => entry.value === value);
    if (choice) return choice.label;
  }
  if (definition?.type === "money" && typeof value === "number")
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (definition?.type === "date" && typeof value === "string") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match) return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}, ${match[1]}`;
  }
  return String(value);
}

function validateFactValue(fieldKey: string, value: PacketFactValue): PacketFactValue {
  const definition = PACKET_FACT_DEFINITIONS[fieldKey];
  if (!definition) return value;
  const fail = (message: string): never => {
    throw new EditableLayerError(`${definition.label}: ${message}`, 400);
  };
  switch (definition.type) {
    case "boolean":
      if (typeof value !== "boolean") fail("choose Yes or No.");
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isInteger(value))
        fail("enter a whole number.");
      return value;
    case "money":
      if (
        typeof value !== "number" ||
        value < 0 ||
        Math.round(value * 100) !== value * 100
      )
        fail("enter an amount with cents precision.");
      return value;
    case "date":
      if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
      )
        fail("enter a valid date.");
      return value;
    case "choice":
      if (!definition.choices?.some((choice) => choice.value === value))
        fail("choose one of the listed options.");
      return value;
    default:
      if (typeof value !== "string") fail("enter text.");
      return value;
  }
}

/** An empty record shape, for planning the first save of a lease. */
export function emptyPacketInputs(leaseId: string, nowIso: string, actorUid: string) {
  return {
    schemaVersion: PACKET_INPUTS_SCHEMA_VERSION,
    leaseId,
    revision: 0,
    facts: {},
    people: { revision: 0, entries: [] },
    animals: { revision: 0, entries: [] },
    chargeOverrides: { revision: 0, entries: [] },
    updatedAt: nowIso,
    updatedByUid: actorUid,
  } as unknown as PacketInputsRecord;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

/**
 * Apply one save to the current record. A stale fact or section revision is a real concurrent edit
 * and is refused with the section named; nothing in this save is applied then. Returns the next
 * record and which parts changed (an unchanged save changes nothing and keeps attribution).
 */
export function planPacketInputsSave(
  current: PacketInputsRecord | null,
  raw: SavePacketInputs,
  meta: { actorUid: string; nowIso: string; eventId: string },
): { record: PacketInputsRecord; changed: string[] } {
  const input = SavePacketInputsSchema.parse(raw);
  const base = current ?? emptyPacketInputs(input.leaseId, meta.nowIso, meta.actorUid);
  if (base.leaseId !== input.leaseId)
    throw new EditableLayerError("These inputs belong to a different lease.", 409);
  const facts = { ...base.facts };
  const changed: string[] = [];
  for (const change of input.facts ?? []) {
    const entry = facts[change.fieldKey];
    if ((entry?.revision ?? 0) !== change.expectedRevision)
      throw new EditableLayerError(
        `Another operator changed ${PACKET_FACT_DEFINITIONS[change.fieldKey]?.label ?? change.fieldKey}. Your entry is kept; review the current value before saving again.`,
        409,
      );
    if (change.value === null) {
      if (!entry) continue;
      delete facts[change.fieldKey];
      changed.push(`fact:${change.fieldKey}`);
      continue;
    }
    if (change.origin === "adopted_source" && !change.sourceLabel)
      throw new EditableLayerError("Name the source this value was adopted from.", 400);
    if (change.overridesSource && !change.reason)
      throw new EditableLayerError(
        "Say why this value replaces the current source value.",
        400,
      );
    const value = validateFactValue(change.fieldKey, change.value);
    const next: PacketFactEntry = {
      value,
      displayValue: displayFactValue(change.fieldKey, value),
      revision: (entry?.revision ?? 0) + 1,
      eventId: meta.eventId,
      recordedAt: meta.nowIso,
      recordedByUid: meta.actorUid,
      origin: change.origin,
      ...(change.origin === "adopted_source" && change.sourceLabel
        ? { sourceLabel: change.sourceLabel }
        : {}),
      ...(change.reason ? { reason: change.reason } : {}),
      ...(change.overridesSource ? { overridesSource: true as const } : {}),
    };
    if (
      entry &&
      stableJson({
        ...entry,
        revision: 0,
        eventId: "",
        recordedAt: "",
        recordedByUid: "",
      }) ===
        stableJson({
          ...next,
          revision: 0,
          eventId: "",
          recordedAt: "",
          recordedByUid: "",
        })
    )
      continue;
    facts[change.fieldKey] = next;
    changed.push(`fact:${change.fieldKey}`);
  }
  const sectionUpdate = <T>(
    name: string,
    label: string,
    currentSection: { revision: number; entries: T[] },
    update: { expectedRevision: number; entries: T[] } | undefined,
  ) => {
    if (!update) return currentSection;
    if (currentSection.revision !== update.expectedRevision)
      throw new EditableLayerError(
        `Another operator changed the ${label}. Your entries are kept; review the current list before saving again.`,
        409,
      );
    if (stableJson(currentSection.entries) === stableJson(update.entries))
      return currentSection;
    changed.push(name);
    return {
      revision: currentSection.revision + 1,
      entries: update.entries,
      updatedAt: meta.nowIso,
      updatedByUid: meta.actorUid,
    };
  };
  const people = sectionUpdate(
    "people",
    "people and signer roles",
    base.people,
    input.people,
  );
  const peopleIssue = peopleIssues(people.entries);
  if (peopleIssue) throw new EditableLayerError(peopleIssue, 400);
  const animals = sectionUpdate("animals", "animals", base.animals, input.animals);
  const priorOverrides = new Map(
    base.chargeOverrides.entries.map((entry) => [entry.chargeId, entry]),
  );
  const chargeOverrides = sectionUpdate(
    "chargeOverrides",
    "charge overrides",
    base.chargeOverrides,
    input.chargeOverrides
      ? {
          expectedRevision: input.chargeOverrides.expectedRevision,
          // An unchanged override keeps who recorded it and when.
          entries: input.chargeOverrides.entries.map((entry) => {
            const prior = priorOverrides.get(entry.chargeId);
            return prior &&
              prior.amountCents === entry.amountCents &&
              prior.reason === entry.reason
              ? prior
              : { ...entry, recordedAt: meta.nowIso, recordedByUid: meta.actorUid };
          }),
        }
      : undefined,
  );
  if (changed.length === 0) return { record: base, changed };
  const record = PacketInputsRecordSchema.parse({
    ...base,
    revision: base.revision + 1,
    facts,
    people,
    animals,
    chargeOverrides,
    updatedAt: meta.nowIso,
    updatedByUid: meta.actorUid,
  });
  return { record, changed };
}

function inputSource(
  reference: string,
  retrievedAt: string,
  version: number,
  system: string = PACKET_INPUT_SOURCE_SYSTEM,
): PacketSourceReference {
  return { system, reference, retrievedAt, version: String(version) };
}

const FACT_SCOPES: ReadonlyArray<[string, string]> = [
  ["transaction.", "packet_classification"],
  ["management.", "packet_classification"],
  ["active_lease.", "packet_classification"],
  ["insurance.", "insurance"],
  ["charges.", "charges"],
  ["property.year_built", "lead_disclosure"],
  ["property.city_addendum_required", "city_addendum"],
  ["property.hoa_governed", "hoa_artifact"],
];

function scopeOf(fieldKey: string): string {
  if (fieldKey.startsWith("family.")) return fieldKey.split(".")[1] ?? "packet";
  return FACT_SCOPES.find(([prefix]) => fieldKey.startsWith(prefix))?.[1] ?? "packet";
}

/** Staff facts as packet facts, each carrying its own actor, time and revision. */
export function packetInputFacts(record: PacketInputsRecord | null): PacketFact[] {
  if (!record) return [];
  return Object.entries(record.facts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fieldKey, entry]) => ({
      fieldKey,
      normalizedValue: entry.value,
      displayValue: entry.displayValue,
      source: inputSource(
        `packet-inputs:${record.leaseId}:${fieldKey}`,
        entry.recordedAt,
        entry.revision,
      ),
      confidence: "Verified" as const,
      applicability: "Applicable" as const,
      verifiedBy: entry.recordedByUid,
      blockingScope: scopeOf(fieldKey),
    }));
}

/** One participant per person and signer role; a person may hold several roles. */
export function participantIdOf(personId: string, signerRole: SignerRole): string {
  return `${personId}:${signerRole}`;
}

export interface PacketInputContact {
  participantRef: string;
  fullName: string;
  email: string;
  role: DotloopParticipantRole;
  signerRole: SignerRole;
  order: number;
}

/**
 * The reviewed people as packet participants, their name/email party facts and the handoff
 * contacts. A person without a usable reviewed email is still a participant for filled files; the
 * Dotloop handoff names the missing email for that signer instead of inventing one.
 */
export function packetInputParties(record: PacketInputsRecord | null): {
  participants: PacketParticipant[];
  facts: PacketFact[];
  contacts: PacketInputContact[];
} {
  if (!record || record.people.entries.length === 0)
    return { participants: [], facts: [], contacts: [] };
  const retrievedAt = record.people.updatedAt ?? record.updatedAt;
  const participants: PacketParticipant[] = [];
  const facts: PacketFact[] = [];
  const contacts: PacketInputContact[] = [];
  const sideOrder: Record<string, number> = {
    tenant: 0,
    owner: 1,
    agent: 2,
    guarantor: 3,
  };
  for (const person of record.people.entries) {
    for (const role of person.roles) {
      const participantId = participantIdOf(person.personId, role.signerRole);
      const kind = PARTICIPANT_KIND_FOR_ROLE[role.signerRole];
      const source = inputSource(
        `packet-inputs:${record.leaseId}:people:${person.personId}`,
        retrievedAt,
        record.people.revision,
        person.emailBasis === "verified_contact" && person.contactRef
          ? "verified_contact"
          : PACKET_INPUT_SOURCE_SYSTEM,
      );
      participants.push({
        participantId,
        kind,
        signerRole: role.signerRole,
        source,
        confidence: "Verified",
        authoritativeOrder: sideOrder[kind] * 100 + role.order,
        providerBindings: { dotloopParticipantRef: participantId },
      });
      const fact = (attribute: string, value: string): PacketFact => ({
        fieldKey: `party.${participantId}.${attribute}`,
        normalizedValue: value,
        displayValue: value,
        source,
        confidence: "Verified",
        applicability: "Applicable",
        verifiedBy: record.people.updatedByUid ?? record.updatedByUid,
        blockingScope: `${kind}_participants`,
      });
      facts.push(fact("name", person.fullName));
      if (person.email) {
        facts.push(fact("email", person.email));
        contacts.push({
          participantRef: participantId,
          fullName: person.fullName,
          email: person.email,
          role: role.dotloopRole,
          signerRole: role.signerRole,
          order: role.order,
        });
      }
    }
  }
  return { participants, facts, contacts };
}
