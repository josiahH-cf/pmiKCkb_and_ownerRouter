import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  prepareDerivedArtifact,
  readDerivedArtifactContent,
} from "@/lib/firestore/lease-derived-artifacts";
import {
  ArtifactFieldMapSchema,
  type ArtifactFieldMap,
} from "@/lib/lease-documents/artifact-intake-contract";
import { evaluateRenewalPacket } from "@/lib/lease-documents/evaluate-packet";
import {
  AGENCY_SELECTIONS_NOTE,
  EXECUTION_DATE_NOTE,
  formNotesOf,
} from "@/lib/lease-documents/form-notes";
import {
  FORM_OPEN_QUESTIONS,
  fieldMapOpenQuestionIssues,
  type FormQuestionId,
} from "@/lib/lease-documents/form-open-questions";
import { OWNER_EXPLANATION_FACT } from "@/lib/lease-documents/owner-explanation";
import type { PacketEvaluationInput } from "@/lib/lease-documents/packet-types";
import {
  readStaticPageRuns,
  readStaticPdfValues,
} from "@/lib/lease-documents/static-pdf";
import {
  ONE_PATH_EXECUTION_DATE_AREA,
  ONE_PATH_ORGANIZATIONS,
} from "@/tests/browser/one-path-forms-seed.mjs";
import { admin } from "@/tests/fixtures/s130-derived";
import {
  onePathCatalog,
  onePathEvaluationInputs,
  onePathView,
  setupOnePathLease,
} from "@/tests/fixtures/s253-one-path";

// S253 R-S253-11: each open question holds only the output its row names, and the work its row
// says goes on meanwhile does go on. One fixture per row, on the rehearsal seed's synthetic forms.

beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
});
afterEach(() => vi.unstubAllEnvs());

/** The forms a packet holds, and every blocker it raises. */
function held(input: PacketEvaluationInput) {
  const evaluation = evaluateRenewalPacket(input);
  return {
    forms: [
      ...new Set((evaluation.manifest?.formHolds ?? []).map((hold) => hold.artifactKind)),
    ],
    blockers: evaluation.blockers.map((blocker) => blocker.code),
    included: evaluation.manifest?.includedArtifacts.map((artifact) => artifact.kind),
  };
}

const EXPLANATION = "SYNTHETIC explanation for the owner.";

const MATRIX: Record<FormQuestionId, () => Promise<void>> = {
  // Holds only: a deposit filled in without staff. Works: a deposit staff record with its source.
  deposit_schedule: async () => {
    const { catalog } = await onePathCatalog();
    const unrecorded = onePathEvaluationInputs(catalog, { animals: "one_pet" });
    expect(unrecorded.assembled.calculated!.petAgreement.depositCents).toBeNull();
    expect(held(unrecorded.tenant)).toMatchObject({
      forms: ["animal_agreement"],
      blockers: [],
    });
    const recorded = onePathEvaluationInputs(catalog, {
      animals: "one_pet",
      deposits: [30_000],
    });
    expect(recorded.assembled.calculated!.petAgreement).toMatchObject({
      depositCents: 30_000,
      totalCents: 35_000,
    });
    expect(held(recorded.tenant)).toMatchObject({ forms: [], blockers: [] });
  },

  // Holds only: totals for an agreement with more than one ordinary pet. Works: one pet.
  every_time_covers: async () => {
    const { catalog } = await onePathCatalog();
    const two = onePathEvaluationInputs(catalog, {
      animals: "two_pets",
      deposits: [30_000, 20_000],
    });
    expect(two.assembled.calculated!.petAgreement).toMatchObject({
      depositCents: null,
      totalCents: null,
    });
    expect(held(two.tenant)).toMatchObject({ forms: ["animal_agreement"], blockers: [] });
    const one = onePathEvaluationInputs(catalog, {
      animals: "one_pet",
      deposits: [30_000],
    });
    expect(one.assembled.calculated!.petAgreement.totalCents).toBe(35_000);
    expect(held(one.tenant)).toMatchObject({ forms: [], blockers: [] });
  },

  // Holds only: the assistance animal's fee, deposit and agreement decision. Works: ordinary pets.
  assistance_animal_rule: async () => {
    const { catalog } = await onePathCatalog();
    const mixed = onePathEvaluationInputs(catalog, {
      animals: "pet_and_assistance_animal",
      deposits: [30_000, null],
    });
    const calculated = mixed.assembled.calculated!;
    const [pet, assisted] = mixed.inputs.animals.entries;
    expect(calculated.heldAnimalIds).toEqual([assisted.animalId]);
    expect(calculated.agreementApplicable).toEqual({
      [pet.animalId]: true,
      [assisted.animalId]: null,
    });
    expect(
      calculated.charges.filter((charge) => charge.animalId === assisted.animalId),
    ).toEqual([]);
    expect(calculated.petAgreement.totalCents).toBe(35_000);
    expect(held(mixed.tenant)).toMatchObject({ forms: [], blockers: [] });
    expect(held(mixed.tenant).included).toContain("animal_agreement");
  },

  // Holds only: a prefilled starting text. Works: staff write the explanation on the lease.
  owner_explanation_starting_text: async () => {
    const { catalog } = await onePathCatalog();
    const blank = onePathEvaluationInputs(catalog, {});
    expect(onePathView(blank).ownerExplanation).toMatchObject({
      text: null,
      startingText: "",
    });
    expect(held(blank.tenant)).toMatchObject({ forms: [], blockers: [] });
    const written = onePathEvaluationInputs(catalog, { explanation: EXPLANATION });
    expect(written.owner.facts.map((fact) => fact.fieldKey)).toContain(
      OWNER_EXPLANATION_FACT,
    );
    expect(held(written.owner)).toMatchObject({
      forms: [],
      blockers: ["owner_ack_proof_unavailable"],
    });
  },

  // Holds only: filling that date. Works: the rest of the owner acknowledgment.
  lease_executed_on: async () => {
    const t = await setupOnePathLease({ explanation: EXPLANATION });
    const record = await prepareDerivedArtifact(
      admin,
      t.prepareRequest("owner_acknowledgment"),
      t.db,
      t.deps,
    );
    const { content } = await readDerivedArtifactContent(
      admin,
      { ...t.request("owner_acknowledgment"), derivedId: record.id },
      t.db,
      t.deps,
    );
    const map = ArtifactFieldMapSchema.parse(t.forms.owner_acknowledgment.fieldMap);
    expect(await readStaticPdfValues(content, map.static!)).toMatchObject({
      Property: "801 Example Street, Sample City",
      "OwnerName-1": "Sample Owner 1",
      Explanation: EXPLANATION,
    });
    const area = ONE_PATH_EXECUTION_DATE_AREA.rect;
    expect(
      (await readStaticPageRuns(content, 0)).filter(
        (run) =>
          run.x < area.x + area.width &&
          area.x < run.x + run.width &&
          run.y < area.y + area.height &&
          area.y < run.y + run.height,
      ),
    ).toEqual([]);
    expect(formNotesOf(map).notes).toEqual([EXECUTION_DATE_NOTE]);
  },

  // Holds only: per-tenant guidance and a lease with more than four tenants. Works: four boxes.
  tenant_initial_boxes: async () => {
    const { catalog, forms } = await onePathCatalog();
    const map = ArtifactFieldMapSchema.parse(forms.brokerage_disclosure.fieldMap);
    expect(formNotesOf(map, 4)).toMatchObject({
      notes: ["Tenant initials: four boxes", AGENCY_SELECTIONS_NOTE],
      questions: [],
    });
    expect(formNotesOf(map, 5).questions).toEqual([
      "More than four tenants: confirm how initials are collected",
    ]);
    // No box is given to one tenant or marked unused: a map that tries is refused.
    const assigned = {
      ...map,
      static: {
        ...map.static!,
        protectedRegions: map.static!.protectedRegions.map((region, index) => ({
          ...region,
          ...(index === 0 ? { tenantPosition: 1 } : {}),
        })),
      },
    } as unknown as ArtifactFieldMap;
    expect(fieldMapOpenQuestionIssues(assigned)).toEqual([
      "A tenant initial box is given to one tenant or marked unused. Every box is left for initials until the business confirms the order.",
    ]);
    for (const tenants of [4, 5]) {
      const lease = onePathEvaluationInputs(catalog, { tenants });
      expect(held(lease.tenant)).toMatchObject({ forms: [], blockers: [] });
      expect(held(lease.tenant).included).toContain("brokerage_disclosure");
    }
  },

  // Holds only: filled agency choices on the brochure. Works: choices left for the signer.
  agency_selections: async () => {
    const { catalog, forms } = await onePathCatalog();
    const brochure = catalog.artifacts.find((a) => a.kind === "brokerage_disclosure")!;
    // The brochure is used exactly as approved: there is nowhere a choice could be filled.
    expect(brochure.unchangedAttachment).toBe(true);
    expect(brochure.fillMapping).toBeUndefined();
    expect(brochure.fieldBindings).toEqual([]);
    const map = ArtifactFieldMapSchema.parse(forms.brokerage_disclosure.fieldMap);
    expect(formNotesOf(map).notes).toContain(
      "Agency selections are left for the signer until they are confirmed for the case",
    );
    const lease = onePathEvaluationInputs(catalog, {});
    expect(held(lease.tenant)).toMatchObject({ forms: [], blockers: [] });
  },

  // Holds only: a change to printed organization text. Works: the per-form list of what prints.
  organization_names_and_signers: async () => {
    const { catalog, forms } = await onePathCatalog();
    for (const kind of [
      "animal_agreement",
      "owner_acknowledgment",
      "brokerage_disclosure",
    ] as const)
      expect(
        formNotesOf(ArtifactFieldMapSchema.parse(forms[kind].fieldMap)).printed,
      ).toEqual([`Page 1, Organization: ${ONE_PATH_ORGANIZATIONS[kind]}`]);
    // A field that would write an organization name onto a form is refused.
    const owner = ArtifactFieldMapSchema.parse(forms.owner_acknowledgment.fieldMap);
    const copying = {
      ...owner,
      fields: owner.fields.map((field) =>
        field.fieldId === "Property"
          ? { ...field, factKey: "form.organization_name" }
          : field,
      ),
    };
    expect(fieldMapOpenQuestionIssues(copying)).toEqual([
      "A field would write an organization name onto this form. Each form keeps the organization text it prints.",
    ]);
    const lease = onePathEvaluationInputs(catalog, {
      animals: "one_pet",
      deposits: [30_000],
      explanation: EXPLANATION,
    });
    expect(held(lease.tenant)).toMatchObject({ forms: [], blockers: [] });
    expect(held(lease.owner)).toMatchObject({
      forms: [],
      blockers: ["owner_ack_proof_unavailable"],
    });
  },
};

describe("S253 R-S253-11: each open question holds only its own output", () => {
  it("has one fixture for every open question and none for a settled one", () => {
    expect(Object.keys(MATRIX).sort()).toEqual(
      FORM_OPEN_QUESTIONS.open.map((entry) => entry.id).sort(),
    );
  });

  for (const entry of FORM_OPEN_QUESTIONS.open)
    it(`${entry.id}: holds only "${entry.holdsOnly}"; meanwhile "${entry.worksMeanwhile}"`, async () => {
      await MATRIX[entry.id as FormQuestionId]();
    });
});

describe("S253 R-S253-1: the open-question file and the holds packet agree", () => {
  const holds = readFileSync(join(process.cwd(), "docs", "open-blockers.md"), "utf8")
    .replace(/\s+/g, " ")
    .toLowerCase();
  // The words the holds packet uses for each question still asked.
  const ASKED: Record<FormQuestionId, RegExp> = {
    deposit_schedule: /which screening result or schedule sets the deposit/,
    every_time_covers: /what "every time" covers/,
    assistance_animal_rule: /approved assistance-animal exceptions and wording/,
    owner_explanation_starting_text: /starting text for the owner explanation/,
    lease_executed_on: /"lease executed on" date/,
    tenant_initial_boxes:
      /which tenant uses which box, unused boxes, more than four tenants/,
    agency_selections: /agency selections and signing details/,
    organization_names_and_signers:
      /approved form versions, organization names, representatives and authorized signers/,
  };
  // The words it uses for each meaning the answers settled.
  const SETTLED: Record<string, RegExp> = {
    pet_processing_fee_amount: /the ordinary pet processing fee is \$\d+, not \$\d+/,
    pet_deposit_separate:
      /the refundable deposit is separate and follows the pet screening result/,
    pet_agreement_amount_blanks:
      /the first amount blank is the deposit and the second is the fee plus the deposit/,
    assistance_animal_statement:
      /an exception for a registered service animal; no registration requirement is added/,
    owner_acknowledgment_large_box:
      /the owner acknowledgment's large box holds an explanation written for that lease/,
    brochure_footer_boxes: /the brochure's four footer boxes are tenant initial boxes/,
  };

  it("names every open question as still asked", () => {
    expect(Object.keys(ASKED).sort()).toEqual(
      FORM_OPEN_QUESTIONS.open.map((entry) => entry.id).sort(),
    );
    for (const [id, words] of Object.entries(ASKED))
      expect(words.test(holds), `${id} is still asked in the holds packet`).toBe(true);
  });

  it("carries every settled meaning, and asks none of them again", () => {
    expect(Object.keys(SETTLED).sort()).toEqual(
      FORM_OPEN_QUESTIONS.settled.map((entry) => entry.id).sort(),
    );
    for (const [id, words] of Object.entries(SETTLED))
      expect(words.test(holds), `${id} is settled in the holds packet`).toBe(true);
    const open = new Set(FORM_OPEN_QUESTIONS.open.map((entry) => entry.id));
    for (const answer of FORM_OPEN_QUESTIONS.settled)
      expect(open.has(answer.id)).toBe(false);
  });

  it("states no fee amount, so the amount lives only in the published policy", () => {
    const file = readFileSync(
      join(process.cwd(), "lib", "lease-documents", "form-open-questions.json"),
      "utf8",
    );
    expect(file).not.toMatch(/\$\s?\d/);
    expect(file).not.toMatch(/\b(50|150)\b/);
  });
});
