import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PROGRAM_SOURCE_CAPABILITY,
  PROGRAM_SOURCE_PENDING_LABEL,
  evaluateProgramSourceReadiness,
  housingAssistanceWork,
  programContactLead,
  programSourceHint,
  type ProgramSourceCandidate,
} from "@/lib/lease-renewal/housing-assistance-source";
import { renewalPathSteps } from "@/lib/lease-renewal/renewal-path";
import {
  housingAssistanceFact,
  housingAssistanceVariant,
  type HousingAssistanceValue,
  type RenewalWorkingRecord,
} from "@/lib/lease-renewal/working-record";
import {
  APPROVED_READ,
  ASSISTED,
  MAPPING,
  NOW,
  POLICY,
  PROGRAM,
  SIMILAR,
  VERIFIED,
} from "@/tests/fixtures/s266-program-source";

// S266 (R-S266-1 to R-S266-3): the explicit assistance fact keeps Not set, No and program Yes
// distinct, the program contact leads the assisted outcome, and a future RentVine program source
// is qualified fail-closed. Synthetic values only; no provider is read.

const record = (value: HousingAssistanceValue | null): RenewalWorkingRecord => ({
  schemaVersion: "renewal-working-record/v1",
  leaseId: "9266",
  revision: 1,
  fields:
    value === null
      ? {}
      : {
          housing_assistance: {
            value,
            revision: 1,
            eventId: "00000000-0000-4000-8000-000000000266",
            recordedAt: "2026-11-10T15:00:00.000Z",
            recordedByUid: "synthetic-editor",
            recordedByLabel: "Example Staff",
            origin: "staff_entry",
          },
        },
});

const evaluate = (
  overrides: Partial<Parameters<typeof evaluateProgramSourceReadiness>[0]> = {},
) =>
  evaluateProgramSourceReadiness({
    capability: APPROVED_READ,
    fact: ASSISTED,
    mappings: [MAPPING],
    candidates: [VERIFIED],
    policy: POLICY,
    nowIso: NOW,
    ...overrides,
  });

describe("AC-S266-1: Not set, explicit No and program Yes stay distinct", () => {
  it("keeps ordinary Not set out of the active Work and preselects nothing", () => {
    expect(housingAssistanceWork({ fact: null })).toEqual({
      state: "not_set",
      active: false,
      reason: null,
      answer: null,
    });
  });

  it("brings the same field into Work for an explicit task, still with no answer chosen", () => {
    expect(housingAssistanceWork({ fact: null, explicitTask: true })).toEqual({
      state: "not_set",
      active: true,
      reason: "explicit_task",
      answer: null,
    });
  });

  it("treats a RentVine mention or recorded program work as an indication that leaves the answer unset", () => {
    for (const indication of [{ mention: true }, { recordedProgramWork: true }])
      expect(housingAssistanceWork({ fact: null, ...indication })).toEqual({
        state: "not_set",
        active: true,
        reason: "program_indication",
        answer: null,
      });
  });

  it("reads an explicit No and a program Yes as saved staff facts, never as Not set", () => {
    expect(housingAssistanceWork({ fact: { status: "no" }, mention: true })).toEqual({
      state: "no",
      active: false,
      reason: null,
      answer: "no",
    });
    expect(housingAssistanceWork({ fact: ASSISTED })).toEqual({
      state: "yes",
      active: false,
      reason: null,
      answer: "yes",
    });
    expect(housingAssistanceWork({ fact: ASSISTED, explicitTask: true })).toMatchObject({
      active: true,
      reason: "explicit_task",
      answer: "yes",
    });
  });

  it("reads the working record's Not set, No and Yes exactly, and only Yes changes the path (preservation)", () => {
    expect(housingAssistanceFact(record(null))).toBeNull();
    expect(housingAssistanceFact(record({ status: "no" }))).toEqual({ status: "no" });
    expect(housingAssistanceFact(record(ASSISTED))).toEqual(ASSISTED);
    expect(housingAssistanceVariant(record(null))).toBeNull();
    expect(housingAssistanceVariant(record({ status: "no" }))).toBeNull();
    expect(housingAssistanceVariant(record(ASSISTED))).toEqual({ program: PROGRAM });
  });
});

describe("AC-S266-2: the program contact leads the assisted outcome", () => {
  it("names the program and its saved contact, or the missing contact action", () => {
    expect(programContactLead(null)).toBeNull();
    expect(programContactLead({ status: "no" })).toBeNull();
    expect(programContactLead(ASSISTED)).toEqual({
      program: PROGRAM,
      contact: "SYNTHETIC staff contact, 555-0100",
      action: "contact_program",
    });
    expect(programContactLead({ status: "yes", program: PROGRAM })).toEqual({
      program: PROGRAM,
      contact: null,
      action: "enter_contact",
    });
  });

  it("keeps the program contact, the owner's answer and the rent choice in that order (preservation)", () => {
    const steps = renewalPathSteps({
      nonRenewal: null,
      monthToMonth: false,
      standingAgreement: null,
      housingAssistance: { program: PROGRAM, rentChoice: null },
    });
    const ids = steps.map((step) => step.id);
    expect(ids.indexOf("assisted-program-contact")).toBeLessThan(
      ids.indexOf("assisted-owner-renewal-answer"),
    );
    expect(ids.indexOf("assisted-owner-renewal-answer")).toBeLessThan(
      ids.indexOf("assisted-rent"),
    );
  });

  it("gives owner and tenant content only the variant, never the private contact or notes", () => {
    const variant = housingAssistanceVariant(record(ASSISTED));
    expect(Object.keys(variant ?? {})).toEqual(["program"]);
    expect(JSON.stringify(variant)).not.toContain("SYNTHETIC staff contact");
    expect(JSON.stringify(variant)).not.toContain("SYNTHETIC staff note");
    // The message builders read the variant alone; the full fact (with contact and notes) is never
    // imported into outgoing owner or tenant content.
    for (const source of [
      "lib/lease-renewal/current-renewal-message.ts",
      "lib/lease-renewal/renewal-message-content.ts",
      "lib/lease-renewal/owner-draft.ts",
      "lib/lease-renewal/tenant-draft.ts",
    ]) {
      const text = readFileSync(join(process.cwd(), source), "utf8");
      expect(text, source).not.toMatch(/housingAssistanceFact|programContactLead/);
    }
  });
});

describe("AC-S266-3: a future RentVine program source is qualified before use", () => {
  it("holds every lookup while no approved program read exists, and keeps the manual path", () => {
    expect(PROGRAM_SOURCE_CAPABILITY).toEqual({
      read: "absent",
      suggestions: "not_authorized",
    });
    const result = evaluate({ capability: PROGRAM_SOURCE_CAPABILITY });
    expect(result).toMatchObject({
      state: "source_pending",
      reason: "no_read_capability",
      manualPath: true,
      suggestion: null,
    });
    expect(programSourceHint(result)).toBe(
      `RentVine program source: ${PROGRAM_SOURCE_PENDING_LABEL}. No approved RentVine program read is available. Enter the known contact here.`,
    );
  });

  it("never sets Yes or No: an unrecorded or No lease has nothing to look up", () => {
    for (const fact of [null, { status: "no" as const }])
      expect(evaluate({ fact })).toMatchObject({
        state: "source_pending",
        reason: "not_assisted",
        suggestion: null,
      });
  });

  it("suggests the verified contact by its exact id for staff review, separate from the saved fact", () => {
    const result = evaluate();
    expect(result).toMatchObject({
      state: "verified",
      providerId: "SYNTHETIC-V-1001",
      manualPath: true,
      suggestion: {
        providerId: "SYNTHETIC-V-1001",
        contact: "SYNTHETIC provider contact, 555-0199",
      },
    });
    // The staff fact is untouched; the suggestion is a separate value staff may review.
    expect(ASSISTED).toMatchObject({ contact: "SYNTHETIC staff contact, 555-0100" });
    expect(programSourceHint(result)).toMatch(
      /^RentVine program source: verified record/,
    );
  });

  it("never matches two similarly named vendors, and a name alone is never enough", () => {
    expect(evaluate({ candidates: [SIMILAR, VERIFIED] })).toMatchObject({
      state: "verified",
      providerId: "SYNTHETIC-V-1001",
    });
    // With no verified mapping, even an identical name stays pending.
    expect(evaluate({ mappings: [], candidates: [VERIFIED, SIMILAR] })).toMatchObject({
      state: "source_pending",
      reason: "name_only",
    });
    expect(evaluate({ mappings: [], candidates: [] })).toMatchObject({
      state: "source_pending",
      reason: "no_mapping",
    });
    // A mapping for a differently written program is not this program's mapping.
    expect(
      evaluate({ mappings: [{ ...MAPPING, program: `${PROGRAM} West` }] }),
    ).toMatchObject({ state: "source_pending", reason: "name_only" });
  });

  const pending: Array<
    [string, Partial<Parameters<typeof evaluateProgramSourceReadiness>[0]>, string]
  > = [
    [
      "two mappings for the program",
      { mappings: [MAPPING, { ...MAPPING, providerId: "SYNTHETIC-V-1002" }] },
      "conflicting_mapping",
    ],
    ["a stale or incorrect id", { candidates: [SIMILAR] }, "missing_record"],
    [
      "duplicate records with the mapped id",
      { candidates: [VERIFIED, { ...VERIFIED, name: "Another listing" }] },
      "duplicate_record",
    ],
    [
      "a record without a stable id",
      {
        mappings: [{ ...MAPPING, providerId: "" }],
        candidates: [{ ...VERIFIED, providerId: null }],
      },
      "missing_id",
    ],
    [
      "a record the business does not maintain",
      { candidates: [{ ...VERIFIED, maintainedBy: "unknown" }] },
      "not_business_maintained",
    ],
    ["an inactive record", { candidates: [{ ...VERIFIED, active: false }] }, "inactive"],
    [
      "a record read too long ago",
      { candidates: [{ ...VERIFIED, observedAt: "2026-09-01T15:00:00.000Z" }] },
      "stale",
    ],
    [
      "a read time in the future",
      { candidates: [{ ...VERIFIED, observedAt: "2026-11-11T15:00:00.000Z" }] },
      "stale",
    ],
    [
      "a record without provenance",
      { candidates: [{ ...VERIFIED, provenance: null }] },
      "missing_provenance",
    ],
    [
      "provenance for another record",
      {
        candidates: [
          {
            ...VERIFIED,
            provenance: { ...VERIFIED.provenance!, reference: "vendor:SYNTHETIC-V-9" },
          },
        ],
      },
      "missing_provenance",
    ],
    [
      "fields that are not approved",
      {
        candidates: [
          { ...VERIFIED, fields: { ...VERIFIED.fields, paymentAccount: "SYNTHETIC" } },
        ],
      },
      "unapproved_fields",
    ],
    [
      "notes that differ from the staff notes",
      {
        candidates: [
          { ...VERIFIED, fields: { ...VERIFIED.fields, notes: "SYNTHETIC other note" } },
        ],
      },
      "conflicting_notes",
    ],
    [
      "a verified record whose use is not authorized",
      { capability: { read: "approved", suggestions: "not_authorized" } },
      "suggestions_not_authorized",
    ],
  ];
  it.each(pending)(
    "keeps %s source pending with its precise reason",
    (_, input, reason) => {
      const result = evaluate(input);
      expect(result).toMatchObject({
        state: "source_pending",
        reason,
        manualPath: true,
        suggestion: null,
      });
      expect(programSourceHint(result)).toContain(PROGRAM_SOURCE_PENDING_LABEL);
    },
  );

  it("returns a fresh result and never changes the staff fact or the candidates", () => {
    const fact = structuredClone(ASSISTED);
    const candidates: ProgramSourceCandidate[] = [structuredClone(VERIFIED)];
    evaluate({ fact, candidates });
    expect(fact).toEqual(ASSISTED);
    expect(candidates).toEqual([VERIFIED]);
  });
});
