import { describe, expect, it } from "vitest";

import {
  ArtifactFieldMapSchema,
  type ArtifactFieldMap,
} from "@/lib/lease-documents/artifact-intake-contract";
import {
  FORM_OPEN_QUESTIONS,
  FORM_QUESTION_IDS,
  checkFormOpenQuestions,
  chargePolicyOpenQuestionIssue,
  fieldMapOpenQuestionIssues,
  isFormQuestionOpen,
  shippedFormSurfaces,
  type FormOpenQuestionsFile,
} from "@/lib/lease-documents/form-open-questions";

// S253 ARCH-S253-3, AC-S253-4, R-S253-1, R-S253-11: one checked data file carries the eight open
// form questions. The check fails when a map, policy or input supplies a value for a listed item,
// when a listed item is removed without a recorded answer, and when a registration field or check
// for assistance animals is added. Synthetic maps only.

const PAGE = {
  pageIndex: 0,
  width: 612,
  height: 792,
  rotation: 0 as const,
  cropBox: null,
};

function ownerAcknowledgmentMap(
  change: (map: Record<string, unknown>) => void = () => undefined,
): ArtifactFieldMap {
  const map: Record<string, unknown> = {
    schemaVersion: "artifact-field-map/v1",
    artifactKind: "owner_acknowledgment",
    mapVersion: "synthetic-owner-v1",
    templateVersion: "publication:synthetic-owner-0001",
    formFamily: "synthetic-family",
    formFamilyExtensionCompatible: true,
    audience: "owner",
    allowedPacketContexts: ["owner_acknowledgment"],
    fields: [
      {
        fieldId: "Property",
        factKey: "property.address",
        meaning: "SYNTHETIC property address",
        required: true,
        multiplicity: "single",
        allowedSourceSystems: ["rentvine", "renewal_staff_entry"],
      },
    ],
    signers: [
      {
        signerRole: "owner",
        participantKind: "owner",
        required: true,
        location: "Owner signature",
      },
    ],
    reviewNote: "SYNTHETIC review",
    static: {
      pages: [PAGE],
      regions: [
        {
          regionId: "Property",
          fieldId: "Property",
          slot: 0,
          pageIndex: 0,
          rect: { x: 72, y: 600, width: 300, height: 16 },
          format: "text",
          fontSize: 10,
          align: "left",
          existing: "blank",
        },
      ],
      protectedRegions: [
        {
          pageIndex: 0,
          rect: { x: 330, y: 660, width: 180, height: 16 },
          kind: "execution_date",
        },
        {
          pageIndex: 0,
          rect: { x: 72, y: 100, width: 200, height: 30 },
          kind: "signature",
        },
      ],
    },
  };
  change(map);
  return ArtifactFieldMapSchema.parse(map);
}

function brochureMap(
  change: (map: Record<string, unknown>) => void = () => undefined,
): ArtifactFieldMap {
  const map: Record<string, unknown> = {
    schemaVersion: "artifact-field-map/v1",
    artifactKind: "brokerage_disclosure",
    mapVersion: "synthetic-brochure-v1",
    templateVersion: "publication:synthetic-brochure-0001",
    formFamily: "synthetic-family",
    formFamilyExtensionCompatible: true,
    audience: "tenant",
    allowedPacketContexts: ["renewal_extension", "full_lease_packet"],
    fields: [],
    signers: [],
    reviewNote: "SYNTHETIC review",
    unchangedAttachment: true,
    static: {
      pages: [PAGE],
      regions: [],
      protectedRegions: [0, 1, 2, 3].map((index) => ({
        pageIndex: 0,
        rect: { x: 72 + index * 60, y: 40, width: 40, height: 24 },
        kind: "initial",
        signerRole: "tenant",
      })),
    },
  };
  change(map);
  return ArtifactFieldMapSchema.parse(map);
}

const SHIPPED_MAPS = () => [ownerAcknowledgmentMap(), brochureMap()];

function withData(change: (data: FormOpenQuestionsFile) => void) {
  const data = JSON.parse(JSON.stringify(FORM_OPEN_QUESTIONS)) as FormOpenQuestionsFile;
  change(data);
  return data;
}

describe("S253 the open form questions are one checked list (ARCH-S253-3)", () => {
  it("lists exactly the eight open questions with who is asked and what each one holds", () => {
    expect(FORM_OPEN_QUESTIONS.open.map((entry) => entry.id)).toEqual([
      ...FORM_QUESTION_IDS,
    ]);
    expect(FORM_QUESTION_IDS).toHaveLength(8);
    expect(
      Object.fromEntries(
        FORM_OPEN_QUESTIONS.open.map((entry) => [entry.id, entry.askedOf]),
      ),
    ).toEqual({
      deposit_schedule: "Dan",
      every_time_covers: "Dan",
      assistance_animal_rule: "Dan, or the authority Dan names",
      owner_explanation_starting_text: "Bailey",
      lease_executed_on: "Dan",
      tenant_initial_boxes: "Bailey",
      agency_selections: "Bailey",
      organization_names_and_signers: "Dan and the document authority",
    });
    for (const entry of FORM_OPEN_QUESTIONS.open) {
      expect(entry.question.length).toBeGreaterThan(20);
      expect(entry.holdsOnly.length).toBeGreaterThan(10);
      expect(entry.worksMeanwhile.length).toBeGreaterThan(10);
      expect(entry.rules.length).toBeGreaterThan(0);
      expect(isFormQuestionOpen(entry.id)).toBe(true);
    }
  });

  it("records each settled answer once, with who answered, who relayed it, the date and its scope", () => {
    expect(FORM_OPEN_QUESTIONS.settled.length).toBeGreaterThanOrEqual(5);
    const open = new Set<string>(FORM_OPEN_QUESTIONS.open.map((entry) => entry.id));
    for (const answer of FORM_OPEN_QUESTIONS.settled) {
      expect(answer).toMatchObject({
        answeredBy: "Dan",
        relayedBy: "the owner",
        date: "2026-11-05",
      });
      expect(answer.answer.length).toBeGreaterThan(10);
      expect(answer.scope.length).toBeGreaterThan(10);
      // A settled item is absent from the open list, so it is never asked again.
      expect(open.has(answer.id)).toBe(false);
    }
  });

  it("passes on what the application ships", () => {
    expect(
      checkFormOpenQuestions(shippedFormSurfaces({ fieldMaps: SHIPPED_MAPS() })),
    ).toEqual([]);
  });
});

describe("S253 the check fails when a listed item is given a value (AC-S253-4)", () => {
  const failing = (extra: Parameters<typeof shippedFormSurfaces>[0]) =>
    checkFormOpenQuestions(shippedFormSurfaces({ fieldMaps: SHIPPED_MAPS(), ...extra }));

  it("a policy that says what one fee covers", () => {
    const content = {
      residentBenefitPackage: null,
      insuranceProgram: null,
      animals: null,
      petProcessingFee: { amountCents: 5_000, unit: "agreement", source: "Synthetic" },
    };
    expect(failing({ chargePolicies: [content] }).join(" ")).toMatch(/every_time_covers/);
    expect(chargePolicyOpenQuestionIssue(content)).toMatch(
      /what one processing fee covers/i,
    );
    expect(
      chargePolicyOpenQuestionIssue({
        ...content,
        petProcessingFee: { ...content.petProcessingFee, unit: null },
      }),
    ).toBeNull();
  });

  it("a shipped policy that carries a deposit schedule, or a shipped deposit", () => {
    const tiers = {
      residentBenefitPackage: null,
      insuranceProgram: null,
      animals: {
        basis: "fido_score",
        tiers: [
          {
            tierId: "all",
            label: "Every score",
            min: 1,
            maxExclusive: null,
            monthlyCents: 0,
            oneTimeCents: 0,
            refundableDepositCents: 11_000,
          },
        ],
        treatments: { pet: "tiered", assistance_animal: "no_charge" },
        agreementFor: { pet: true, assistance_animal: false },
        juvenileWeightBasis: null,
      },
    };
    expect(failing({ chargePolicies: [tiers] }).join(" ")).toMatch(/deposit_schedule/);
    expect(failing({ shippedDeposits: 1 }).join(" ")).toMatch(/deposit_schedule/);
  });

  it("a registration field or check for assistance animals", () => {
    const base = shippedFormSurfaces();
    expect(
      failing({ animalInputKeys: [...base.animalInputKeys, "registrationNumber"] }).join(
        " ",
      ),
    ).toMatch(/assistance_animal_rule/);
    expect(
      failing({
        factDefinitions: {
          ...base.factDefinitions,
          "animal.service_certificate": { label: "Service animal certificate on file" },
        },
      }).join(" "),
    ).toMatch(/assistance_animal_rule/);
    const map = ownerAcknowledgmentMap((raw) => {
      (raw.fields as Array<Record<string, unknown>>)[0].meaning =
        "Assistance animal registration number";
    });
    expect(failing({ fieldMaps: [map] }).join(" ")).toMatch(/assistance_animal_rule/);
  });

  it("a shipped starting text or a shipped explanation", () => {
    expect(failing({ startingTexts: ["Synthetic starting text"] }).join(" ")).toMatch(
      /owner_explanation_starting_text/,
    );
    expect(failing({ shippedExplanations: 1 }).join(" ")).toMatch(
      /owner_explanation_starting_text/,
    );
    expect(failing({ startingTexts: [""] })).toEqual([]);
  });

  it("a map that could fill Lease executed on", () => {
    const unprotected = ownerAcknowledgmentMap((raw) => {
      const geometry = raw.static as { protectedRegions: Array<{ kind: string }> };
      geometry.protectedRegions = geometry.protectedRegions.filter(
        (region) => region.kind !== "execution_date",
      );
    });
    expect(failing({ fieldMaps: [unprotected] }).join(" ")).toMatch(/lease_executed_on/);
    expect(fieldMapOpenQuestionIssues(unprotected).join(" ")).toMatch(
      /Lease executed on/,
    );
    const mapped = ownerAcknowledgmentMap((raw) => {
      (raw.fields as Array<Record<string, unknown>>)[0].factKey =
        "owner_acknowledgment.lease_executed_on";
    });
    expect(failing({ fieldMaps: [mapped] }).join(" ")).toMatch(/lease_executed_on/);
    expect(fieldMapOpenQuestionIssues(ownerAcknowledgmentMap())).toEqual([]);
  });

  it("a brochure map that fills an agency selection or assigns a tenant to a box", () => {
    const selected = ArtifactFieldMapSchema.parse({
      ...brochureMap(),
      unchangedAttachment: undefined,
      fields: [
        {
          fieldId: "Agency",
          factKey: "brokerage.agency_choice",
          meaning: "SYNTHETIC agency choice",
          required: false,
          multiplicity: "single",
          allowedSourceSystems: ["renewal_staff_entry"],
        },
      ],
      signers: [
        {
          signerRole: "tenant",
          participantKind: "tenant",
          required: true,
          location: "Tenant signature",
        },
      ],
      static: {
        ...brochureMap().static!,
        regions: [
          {
            regionId: "Agency",
            fieldId: "Agency",
            slot: 0,
            pageIndex: 0,
            rect: { x: 72, y: 500, width: 12, height: 12 },
            format: "checkmark",
            fontSize: 10,
            align: "left",
            existing: "blank",
          },
        ],
      },
    });
    expect(failing({ fieldMaps: [selected] }).join(" ")).toMatch(/agency_selections/);
    expect(fieldMapOpenQuestionIssues(selected).join(" ")).toMatch(/agency selection/i);
    // The reviewed contract has no way to give one tenant a box; a raw record that tries is caught.
    const assigned = {
      ...brochureMap(),
      static: {
        ...brochureMap().static!,
        protectedRegions: brochureMap().static!.protectedRegions.map((region, slot) => ({
          ...region,
          slot,
        })),
      },
    } as unknown as ArtifactFieldMap;
    expect(failing({ fieldMaps: [assigned] }).join(" ")).toMatch(/tenant_initial_boxes/);
    expect(fieldMapOpenQuestionIssues(brochureMap())).toEqual([]);
  });

  it("a fact that would carry one form's printed organization onto another", () => {
    const base = shippedFormSurfaces();
    expect(
      failing({
        factDefinitions: {
          ...base.factDefinitions,
          "form.organization_name": { label: "Organization printed on the form" },
        },
      }).join(" "),
    ).toMatch(/organization_names_and_signers/);
  });
});

describe("S253 a listed item leaves the list only with a recorded answer (ARCH-S253-3)", () => {
  const check = (data: FormOpenQuestionsFile) =>
    checkFormOpenQuestions(shippedFormSurfaces({ data, fieldMaps: SHIPPED_MAPS() }));

  it("fails when an open question is removed without an answer", () => {
    const removed = withData((data) => {
      data.open = data.open.filter((entry) => entry.id !== "lease_executed_on");
    });
    expect(check(removed).join(" ")).toMatch(
      /lease_executed_on.*without a recorded answer/,
    );
  });

  it("passes when the removed question carries its recorded answer, and its hold lifts", () => {
    const answered = withData((data) => {
      data.open = data.open.filter((entry) => entry.id !== "every_time_covers");
      data.settled.push({
        id: "every_time_covers",
        item: "What one processing fee covers",
        answer: "SYNTHETIC answer for this test: one fee for each agreement.",
        answeredBy: "Dan",
        relayedBy: "the owner",
        date: "2026-11-05",
        scope: "SYNTHETIC scope for this test only.",
      });
    });
    expect(check(answered)).toEqual([]);
    expect(isFormQuestionOpen("every_time_covers", answered)).toBe(false);
    expect(
      chargePolicyOpenQuestionIssue(
        {
          residentBenefitPackage: null,
          insuranceProgram: null,
          animals: null,
          petProcessingFee: {
            amountCents: 5_000,
            unit: "agreement",
            source: "Synthetic",
          },
        },
        answered,
      ),
    ).toBeNull();
  });

  it("fails when an answer is incomplete, or an item is both open and settled", () => {
    const incomplete = withData((data) => {
      data.open = data.open.filter((entry) => entry.id !== "agency_selections");
      data.settled.push({
        id: "agency_selections",
        item: "Agency selections",
        answer: "",
        answeredBy: "",
        relayedBy: "the owner",
        date: "2026-11-05",
        scope: "",
      });
    });
    expect(check(incomplete).join(" ")).toMatch(/agency_selections/);
    const both = withData((data) => {
      data.settled.push({
        id: "lease_executed_on",
        item: "Lease executed on",
        answer: "SYNTHETIC answer that leaves the question listed as open.",
        answeredBy: "Dan",
        relayedBy: "the owner",
        date: "2026-11-05",
        scope: "SYNTHETIC scope for this test only.",
      });
    });
    expect(check(both).join(" ")).toMatch(/lease_executed_on.*both open and settled/);
  });

  it("fails when an open question names a rule the check does not know", () => {
    const unknown = withData((data) => {
      data.open[0].rules = ["a_rule_nobody_wrote"];
    });
    expect(check(unknown).join(" ")).toMatch(/a_rule_nobody_wrote/);
  });
});
