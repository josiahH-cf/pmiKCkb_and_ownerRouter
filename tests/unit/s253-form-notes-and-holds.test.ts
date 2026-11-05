import { describe, expect, it } from "vitest";

import {
  ArtifactFieldMapSchema,
  type ArtifactFieldMap,
} from "@/lib/lease-documents/artifact-intake-contract";
import type { CalculatedCharges } from "@/lib/lease-documents/charge-policy";
import { formHoldLabels, packetFormHolds } from "@/lib/lease-documents/form-holds";
import {
  AGENCY_SELECTIONS_NOTE,
  EXECUTION_DATE_NOTE,
  ORGANIZATION_DIFFERENCE_NOTE,
  formNotesOf,
  organizationDifferenceNote,
  tenantInitialBoxes,
  tenantInitialNote,
  tenantInitialQuestion,
} from "@/lib/lease-documents/form-notes";
import {
  isOwnerAcknowledgmentTransaction,
  ownerAcknowledgmentTransactionId,
  packetFilesPreparable,
} from "@/lib/lease-documents/owner-acknowledgment";
import {
  OWNER_EXPLANATION_FACT,
  OWNER_EXPLANATION_NEED,
  OWNER_EXPLANATION_TERMS_CHANGED,
} from "@/lib/lease-documents/owner-explanation";
import type {
  LeaseArtifactCatalog,
  PacketBlocker,
  PacketFact,
} from "@/lib/lease-documents/packet-types";
import {
  PET_AGREEMENT_DEPOSIT_FACT,
  PET_AGREEMENT_TOTAL_FACT,
  PET_PROCESSING_FEE_FACT,
} from "@/lib/lease-documents/pet-agreement-facts";
import {
  lostPrintedText,
  petFeeConsistencyIssues,
  statedProcessingFees,
} from "@/lib/lease-documents/prepared-form-checks";
import { buildOnePathForms } from "@/tests/browser/one-path-forms-seed.mjs";
import { onePathCatalog } from "@/tests/fixtures/s253-one-path";
import { s66Fact } from "@/tests/fixtures/s66-packet";
import { staticPage } from "@/tests/fixtures/synthetic-static";

// S253: the words the lease shows for a form (R-S253-8, R-S253-9, R-S253-10), the forms that wait
// on one named input (R-S253-11), and what a prepared form must still say (R-S253-5). Invented
// forms and amounts only.

describe("S253 the exact words the lease and its notes use", () => {
  it("keeps the wording the specification names", () => {
    expect(EXECUTION_DATE_NOTE).toBe(
      "Lease executed on is left blank until the business confirms which date belongs there",
    );
    expect(tenantInitialNote(4)).toBe("Tenant initials: four boxes");
    expect(tenantInitialQuestion(4)).toBe(
      "More than four tenants: confirm how initials are collected",
    );
    expect(OWNER_EXPLANATION_NEED).toBe("Needs the explanation for this lease");
    expect(OWNER_EXPLANATION_TERMS_CHANGED).toBe("Terms changed after this was written");
    // The count is the map's own: a form with another number of boxes says that number.
    expect(tenantInitialNote(1)).toBe("Tenant initials: one box");
    expect(tenantInitialNote(6)).toBe("Tenant initials: six boxes");
    expect(tenantInitialQuestion(2)).toBe(
      "More than two tenants: confirm how initials are collected",
    );
  });
});

describe("S253 form notes come from the reviewed map alone", () => {
  let maps: Record<string, ArtifactFieldMap>;
  const load = async () => {
    maps ??= Object.fromEntries(
      Object.values(await buildOnePathForms()).map((form) => [
        form.kind,
        ArtifactFieldMapSchema.parse(form.fieldMap),
      ]),
    );
    return maps;
  };

  it("says nothing for a form with nothing to say, or no map", async () => {
    const { renewal_extension } = await load();
    const empty = { notes: [], questions: [], printed: [], mapIssues: [] };
    expect(formNotesOf(null)).toEqual(empty);
    expect(formNotesOf(undefined, 9)).toEqual(empty);
    expect(formNotesOf(renewal_extension, 6)).toEqual(empty);
  });

  it("counts only the boxes kept for tenants, and asks only when the lease has more tenants", async () => {
    const { brokerage_disclosure, animal_agreement } = await load();
    expect(tenantInitialBoxes(brokerage_disclosure)).toBe(4);
    // The pet agreement's initial lines are shared by every signer and name no role: protected,
    // and no tenant's box.
    expect(
      animal_agreement.static!.protectedRegions.filter((r) => r.kind === "initial"),
    ).toHaveLength(4);
    expect(tenantInitialBoxes(animal_agreement)).toBe(0);
    expect(formNotesOf(animal_agreement, 9)).toMatchObject({ notes: [], questions: [] });
    // A box kept for another role, or for no role, is not a tenant's box.
    const mixed = {
      ...brokerage_disclosure,
      static: {
        ...brokerage_disclosure.static!,
        protectedRegions: brokerage_disclosure.static!.protectedRegions.map(
          (region, index) =>
            index === 0
              ? { ...region, signerRole: "property_manager" as const }
              : index === 1
                ? { pageIndex: region.pageIndex, rect: region.rect, kind: region.kind }
                : region,
        ),
      },
    };
    expect(tenantInitialBoxes(mixed)).toBe(2);
    expect(formNotesOf(mixed, 3).questions).toEqual([
      "More than two tenants: confirm how initials are collected",
    ]);
    // A form that repeats its tenant boxes on each page is counted by one page, never by the sum.
    const repeated = {
      ...brokerage_disclosure,
      static: {
        ...brokerage_disclosure.static!,
        protectedRegions: [0, 1].flatMap((pageIndex) =>
          brokerage_disclosure.static!.protectedRegions.map((region) => ({
            ...region,
            pageIndex,
          })),
        ),
      },
    };
    expect(repeated.static.protectedRegions).toHaveLength(8);
    expect(tenantInitialBoxes(repeated)).toBe(4);
    expect(formNotesOf(repeated, 5)).toMatchObject({
      notes: ["Tenant initials: four boxes", AGENCY_SELECTIONS_NOTE],
      questions: ["More than four tenants: confirm how initials are collected"],
    });
    expect(formNotesOf(brokerage_disclosure).notes).toEqual([
      "Tenant initials: four boxes",
      AGENCY_SELECTIONS_NOTE,
    ]);
    for (const [tenants, asks] of [
      [null, false],
      [1, false],
      [4, false],
      [5, true],
      [9, true],
    ] as const)
      expect(formNotesOf(brokerage_disclosure, tenants).questions).toEqual(
        asks ? ["More than four tenants: confirm how initials are collected"] : [],
      );
  });

  it("notes the execution date only where the map marks its area", async () => {
    const { owner_acknowledgment, animal_agreement } = await load();
    expect(formNotesOf(owner_acknowledgment).notes).toEqual([EXECUTION_DATE_NOTE]);
    expect(formNotesOf(animal_agreement).notes).not.toContain(EXECUTION_DATE_NOTE);
  });

  it("lists what each form prints, per page, as that form's own information", async () => {
    const { owner_acknowledgment } = await load();
    const listed = formNotesOf({
      ...owner_acknowledgment,
      printedParties: [
        { pageIndex: 0, kind: "organization", text: "Sample Example Property Group" },
        { pageIndex: 0, kind: "representative", text: "Example Representative" },
        { pageIndex: 0, kind: "signer", text: "Sample Signer" },
      ],
    });
    expect(listed.printed).toEqual([
      "Page 1, Organization: Sample Example Property Group",
      "Page 1, Representative: Example Representative",
      "Page 1, Signer: Sample Signer",
    ]);
  });

  it("says that two forms differ without saying which is right", () => {
    expect(ORGANIZATION_DIFFERENCE_NOTE).toBe(
      "These forms print different organization names. Each form keeps the text it prints.",
    );
    expect(organizationDifferenceNote([])).toBeNull();
    expect(organizationDifferenceNote([undefined, []])).toBeNull();
    expect(
      organizationDifferenceNote([["Example A"], ["Example A"], undefined]),
    ).toBeNull();
    expect(organizationDifferenceNote([["Example A"], ["Example B"]])).toBe(
      ORGANIZATION_DIFFERENCE_NOTE,
    );
    // The same names in another order are the same text.
    expect(
      organizationDifferenceNote([
        ["Example A", "Example B"],
        ["Example B", "Example A"],
      ]),
    ).toBeNull();
  });
});

describe("S253 a form waits on one named input (R-S253-11)", () => {
  const pet = (needs: string[]): Pick<CalculatedCharges, "petAgreement"> => ({
    petAgreement: {
      feeCents: 5_000,
      feeUnit: null,
      feeSource: "SYNTHETIC source",
      ordinaryPets: 1,
      depositCents: null,
      totalCents: null,
      needs,
    },
  });
  const fact = (key: string, value: string | number = 1): PacketFact =>
    s66Fact(key, value, "renewal_charge_policy");
  let catalog: LeaseArtifactCatalog;
  const load = async () => (catalog ??= (await onePathCatalog()).catalog);

  it("holds the pet agreement for each amount it places that the calculator cannot give", async () => {
    const holds = packetFormHolds({
      catalog: await load(),
      facts: [fact(PET_PROCESSING_FEE_FACT, 50), fact(OWNER_EXPLANATION_FACT, "text")],
      calculated: pet(["SYNTHETIC need one.", "SYNTHETIC need two."]),
    });
    expect(holds).toEqual([
      {
        artifactKind: "animal_agreement",
        factKey: PET_AGREEMENT_DEPOSIT_FACT,
        label: "SYNTHETIC need one. SYNTHETIC need two.",
      },
      {
        artifactKind: "animal_agreement",
        factKey: PET_AGREEMENT_TOTAL_FACT,
        label: "SYNTHETIC need one. SYNTHETIC need two.",
      },
    ]);
    expect(formHoldLabels(holds, "animal_agreement")).toEqual([
      "SYNTHETIC need one. SYNTHETIC need two.",
    ]);
    expect(formHoldLabels(holds, "renewal_extension")).toEqual([]);
    expect(formHoldLabels(undefined, "animal_agreement")).toEqual([]);
  });

  it("holds the owner acknowledgment only for the explanation nobody wrote", async () => {
    const all = [
      fact(PET_PROCESSING_FEE_FACT, 50),
      fact(PET_AGREEMENT_DEPOSIT_FACT, 300),
      fact(PET_AGREEMENT_TOTAL_FACT, 350),
    ];
    expect(
      packetFormHolds({ catalog: await load(), facts: all, calculated: pet([]) }),
    ).toEqual([
      {
        artifactKind: "owner_acknowledgment",
        factKey: OWNER_EXPLANATION_FACT,
        label: OWNER_EXPLANATION_NEED,
      },
    ]);
    expect(
      packetFormHolds({
        catalog: await load(),
        facts: [...all, fact(OWNER_EXPLANATION_FACT, "SYNTHETIC text")],
        calculated: pet([]),
      }),
    ).toEqual([]);
  });

  it("never holds a form for any other missing value: those stay ordinary questions", async () => {
    // With no calculator reason the pet agreement's missing amounts are ordinary missing facts,
    // and a missing address is never a hold.
    const holds = packetFormHolds({
      catalog: await load(),
      facts: [fact(OWNER_EXPLANATION_FACT, "SYNTHETIC text")],
      calculated: null,
    });
    expect(holds).toEqual([]);
    // A value that is present but unverified is not present.
    const unverified = {
      ...fact(OWNER_EXPLANATION_FACT, "text"),
      confidence: "Likely",
    } as PacketFact;
    expect(
      packetFormHolds({
        catalog: await load(),
        facts: [unverified],
        calculated: null,
      }).map((hold) => hold.artifactKind),
    ).toEqual(["owner_acknowledgment"]);
  });
});

describe("S253 the owner acknowledgment is its own packet", () => {
  const proof: PacketBlocker = {
    code: "owner_ack_proof_unavailable",
    label: "SYNTHETIC proof needed.",
    scope: "owner_acknowledgment",
  };
  const other: PacketBlocker = {
    code: "missing_fact",
    label: "SYNTHETIC fact needed.",
    scope: "packet",
  };
  const snapshot = (
    audience: "tenant" | "owner",
    state: "Needs input" | "Conflict" | "Ready for preview",
    blockers: PacketBlocker[],
  ) =>
    ({ state, blockers, manifest: { audience } }) as unknown as Parameters<
      typeof packetFilesPreparable
    >[0];

  it("is saved under its own identity beside the tenant packet", () => {
    expect(ownerAcknowledgmentTransactionId("701")).toBe("701:owner_acknowledgment");
    expect(isOwnerAcknowledgmentTransaction("701", "701:owner_acknowledgment")).toBe(
      true,
    );
    expect(isOwnerAcknowledgmentTransaction("701", "701")).toBe(false);
    expect(isOwnerAcknowledgmentTransaction("701", "702:owner_acknowledgment")).toBe(
      false,
    );
  });

  it("may be prepared while the tenant packet's proof is the only thing it lacks", () => {
    expect(packetFilesPreparable(snapshot("tenant", "Ready for preview", []))).toBe(true);
    expect(packetFilesPreparable(snapshot("owner", "Ready for preview", []))).toBe(true);
    expect(packetFilesPreparable(snapshot("owner", "Needs input", [proof]))).toBe(true);
    // Every other state keeps its refusal: a tenant packet is never prepared early.
    expect(packetFilesPreparable(snapshot("tenant", "Needs input", [proof]))).toBe(false);
    expect(packetFilesPreparable(snapshot("tenant", "Needs input", [other]))).toBe(false);
    expect(packetFilesPreparable(snapshot("owner", "Needs input", [proof, other]))).toBe(
      false,
    );
    expect(packetFilesPreparable(snapshot("owner", "Needs input", []))).toBe(false);
    expect(packetFilesPreparable(snapshot("owner", "Conflict", [proof]))).toBe(false);
    expect(
      packetFilesPreparable({ state: "Needs input", blockers: [proof], manifest: null }),
    ).toBe(false);
  });
});

describe("S253 R-S253-5: the fee a prepared form states", () => {
  const lines = (...texts: string[]) => texts.map((text) => ({ pageIndex: 0, text }));
  const cents = (...texts: string[]) =>
    statedProcessingFees(lines(...texts)).map((entry) => entry.cents);

  it("reads the amount a sentence gives for the processing fee, before or after the words", () => {
    expect(cents("The tenant pays a processing fee of $50.00 at signing.")).toEqual([
      5_000,
    ]);
    expect(cents("A $75 non-refundable pet processing fee is due.")).toEqual([7_500]);
    expect(cents("Processing Fee: $1,250.50")).toEqual([125_050]);
    expect(cents("a one-time processing fee in the amount of $ 40")).toEqual([4_000]);
  });

  it("does not take another amount of the sentence for the fee", () => {
    expect(cents("The processing fee and a deposit of $300.00 are due.")).toEqual([]);
    expect(cents("The processing fee plus the total of $350.00.")).toEqual([]);
    expect(cents("Monthly rent of $900.00 is due. No processing fee applies.")).toEqual(
      [],
    );
    expect(cents("Screening score 4: deposit $222.00")).toEqual([]);
  });

  it("reads a sentence that wraps between the words and the amount, on its own page only", () => {
    expect(
      cents("The tenant pays a non-refundable pet processing fee of", "$150 at signing."),
    ).toEqual([15_000]);
    expect(
      statedProcessingFees([
        { pageIndex: 0, text: "The tenant pays a processing fee of" },
        { pageIndex: 1, text: "$150 at signing." },
      ]),
    ).toEqual([]);
  });

  it("refuses a drawn fee that is not the published amount, and a file that states another", async () => {
    const page = (sentence: string) =>
      staticPage([`BT /F1 11 Tf 1 0 0 1 72 600 Tm (${sentence}) Tj ET`]);
    const agrees = await page("The tenant pays a processing fee of $50.00 at signing.");
    expect(
      await petFeeConsistencyIssues({
        output: agrees,
        publishedFeeCents: 5_000,
        drawnFees: ["$50.00"],
      }),
    ).toEqual([]);
    expect(
      await petFeeConsistencyIssues({
        output: agrees,
        publishedFeeCents: 5_000,
        drawnFees: ["$55.00"],
      }),
    ).toEqual([
      "The processing fee placed on this form reads $55.00, and the published fee is $50.00.",
    ]);
    expect(
      await petFeeConsistencyIssues({
        output: agrees,
        publishedFeeCents: 5_000,
        drawnFees: [""],
      }),
    ).toEqual([
      "The processing fee placed on this form reads blank, and the published fee is $50.00.",
    ]);
    expect(
      await petFeeConsistencyIssues({
        output: await page("The tenant pays a processing fee of $150 at signing."),
        publishedFeeCents: 5_000,
        drawnFees: [],
      }),
    ).toEqual([
      "Page 1 of this form states a processing fee of $150.00 in its text, and the published fee is $50.00. Use a corrected original, or a reviewed map region that replaces that exact text.",
    ]);
    // A file whose text cannot be read cannot be shown to agree, so it is not kept.
    expect(
      await petFeeConsistencyIssues({
        output: new Uint8Array([1, 2, 3]),
        publishedFeeCents: 5_000,
        drawnFees: ["$50.00"],
      }),
    ).toEqual([
      "This form's text could not be read to compare its processing fee with the published fee, so the file was not kept.",
    ]);
  });
});

describe("S253 R-S253-10: printed organization text survives preparation", () => {
  const page = (...texts: string[]) =>
    staticPage(
      texts.map(
        (text, index) => `BT /F1 11 Tf 1 0 0 1 72 ${700 - index * 20} Tm (${text}) Tj ET`,
      ),
    );

  it("names the page whose printed text a prepared file no longer shows", async () => {
    const original = await page("Of Sample Example Property Group", "SYNTHETIC body");
    const printed = [{ pageIndex: 0, text: "Sample Example Property Group" }];
    expect(await lostPrintedText({ original, output: original, printed })).toEqual([]);
    expect(
      await lostPrintedText({
        original,
        output: await page("Of Example Sample Brokerage Services", "SYNTHETIC body"),
        printed,
      }),
    ).toEqual([
      "Page 1: printed text this form carries would be changed by this map. A change to printed organization, representative or signer text needs its form, page, exact replacement, signing role and who confirmed it.",
    ]);
  });

  it("compares a form with itself only, and leaves text its own layer does not carry", async () => {
    const original = await page("SYNTHETIC body");
    // The reviewer listed text the file's text layer does not carry: nothing can be compared.
    expect(
      await lostPrintedText({
        original,
        output: original,
        printed: [{ pageIndex: 0, text: "Sample Example Property Group" }],
      }),
    ).toEqual([]);
    expect(await lostPrintedText({ original, output: original, printed: [] })).toEqual(
      [],
    );
  });
});
