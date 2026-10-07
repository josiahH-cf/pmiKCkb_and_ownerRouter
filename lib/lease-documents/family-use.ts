// S66 (AC-S66-6): the Admin-approved use of each lease-document family.
//
// One versioned record decides which families a packet can need: a mandatory family holds its packet
// until approved material exists; a conditional family is decided by its reviewed predicate (or the
// labeled engineering default, or an explicit per-lease question) and holds only when it applies or
// its applicability is unknown; a family the configuration does not use never holds a packet. File
// names, file counts and the word Required in a file name never decide applicability, and nothing
// here approves a legal version or a file.

import { z } from "zod";

import {
  LEASE_ARTIFACT_KINDS,
  type FormFamilyUse,
  type LeaseArtifactKind,
} from "@/lib/lease-documents/packet-types";

export const FAMILY_USE_SCHEMA_VERSION = "lease-artifact-family-use/v1";
export const FAMILY_USES = ["mandatory", "conditional", "not_used"] as const;
export type FamilyUse = (typeof FAMILY_USES)[number];

/**
 * Engineering defaults, labeled as such until an Admin records a use: the lease, extension and owner
 * acknowledgment are required in their own packet contexts; the animal, lead, city and HOA families
 * are decided by their rules; the three further reference types are unused until configured.
 */
export const DEFAULT_FAMILY_USE: Readonly<Record<LeaseArtifactKind, FamilyUse>> = {
  standard_lease: "mandatory",
  renewal_extension: "mandatory",
  owner_acknowledgment: "mandatory",
  animal_agreement: "conditional",
  lead_disclosure: "conditional",
  city_addendum: "conditional",
  hoa_artifact: "conditional",
  kcrar_additional_disclosures: "not_used",
  brokerage_disclosure: "not_used",
  insurance_program_addendum: "not_used",
};

export const FAMILY_USE_LABELS: Readonly<Record<FamilyUse, string>> = {
  mandatory: "Required",
  conditional: "When it applies",
  not_used: "Not used",
};

const kind = z.enum(LEASE_ARTIFACT_KINDS);

export const FamilyUseRecordSchema = z
  .object({
    schemaVersion: z.literal(FAMILY_USE_SCHEMA_VERSION),
    version: z.number().int().positive(),
    families: z.partialRecord(
      kind,
      z
        .object({
          use: z.enum(FAMILY_USES),
          recordedAt: z.string().datetime(),
          recordedByUid: z.string().trim().min(1).max(128),
        })
        .strict(),
    ),
    updatedAt: z.string().datetime(),
    updatedByUid: z.string().trim().min(1).max(128),
  })
  .strict();
export type FamilyUseRecord = z.infer<typeof FamilyUseRecordSchema>;

export const SetFamilyUseInputSchema = z
  .object({
    kind,
    use: z.enum(FAMILY_USES),
    /** 0 when no record exists yet. */
    expectedVersion: z.number().int().nonnegative(),
    operationId: z.string().uuid(),
  })
  .strict();
export type SetFamilyUseInput = z.infer<typeof SetFamilyUseInputSchema>;

/** Every family's current use, labeled with where it came from. */
export function resolveFamilyUse(
  record: FamilyUseRecord | null,
  observedAt: string,
): FormFamilyUse[] {
  return LEASE_ARTIFACT_KINDS.map((familyKind) => {
    const recorded = record?.families[familyKind];
    return {
      kind: familyKind,
      use: recorded?.use ?? DEFAULT_FAMILY_USE[familyKind],
      source: recorded
        ? {
            system: "lease_artifact_family_use",
            reference: `family-use:${familyKind}:v${record!.version}`,
            retrievedAt: recorded.recordedAt,
            version: String(record!.version),
          }
        : {
            system: "engineering_default",
            reference: `family-use-default:${familyKind}`,
            retrievedAt: observedAt,
            version: "family-use-default-v1",
          },
    };
  });
}

/** Apply one Admin decision to the record, producing the next version. */
export function nextFamilyUseRecord(
  current: FamilyUseRecord | null,
  input: SetFamilyUseInput,
  actorUid: string,
  nowIso: string,
): FamilyUseRecord {
  return {
    schemaVersion: FAMILY_USE_SCHEMA_VERSION,
    version: (current?.version ?? 0) + 1,
    families: {
      ...(current?.families ?? {}),
      [input.kind]: { use: input.use, recordedAt: nowIso, recordedByUid: actorUid },
    },
    updatedAt: nowIso,
    updatedByUid: actorUid,
  };
}
