import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DERIVED_ARTIFACT_COLLECTIONS,
  prepareDerivedArtifact,
  readDerivedArtifactContent,
  readDerivedArtifactStatus,
} from "@/lib/firestore/lease-derived-artifacts";
import {
  ArtifactFieldMapSchema,
  type ArtifactFieldMap,
} from "@/lib/lease-documents/artifact-intake-contract";
import { ChargePolicyRecordSchema } from "@/lib/lease-documents/charge-policy";
import {
  HELD_ANIMAL_REASON,
  evaluateRenewalPacket,
} from "@/lib/lease-documents/evaluate-packet";
import {
  PET_AGREEMENT_DEPOSIT_FACT,
  PET_AGREEMENT_TOTAL_FACT,
  PET_FEE_CHARGE_ID,
} from "@/lib/lease-documents/pet-agreement-facts";
import {
  readStaticPageRuns,
  readStaticPdfLines,
  readStaticPdfValues,
} from "@/lib/lease-documents/static-pdf";
import { ONE_PATH_OLD_FEE_TEXT } from "@/tests/browser/one-path-forms-seed.mjs";
import { admin } from "@/tests/fixtures/s130-derived";
import {
  DEPOSIT_SOURCE,
  FEE_SOURCE,
  SEEDED_AT,
  STAFF_AT,
  feeAlonePolicy,
  onePathView,
  setupOnePathLease,
  type OnePathLeaseOptions,
} from "@/tests/fixtures/s253-one-path";
import { objectsHolding } from "@/tests/fixtures/synthetic-static";

// S253 BEH-S253-1, BEH-S253-2, AC-S253-1, AC-S253-2 through the real pipeline: the rehearsal seed's
// synthetic pet agreement, the catalog the application projects from its approved entry, staff
// saves, a fee an Admin publishes in the check, the packet evaluator and the filled-document store.
// Invented names and amounts only.

beforeEach(() => {
  vi.stubEnv("ENVIRONMENT_KIND", "demo");
  vi.stubEnv("DATA_CONTEXT", "demo");
});
afterEach(() => vi.unstubAllEnvs());

type Lease = Awaited<ReturnType<typeof setupOnePathLease>>;
type Form = Parameters<Lease["request"]>[0];

async function prepared(t: Lease, kind: Form) {
  const record = await prepareDerivedArtifact(
    admin,
    t.prepareRequest(kind),
    t.db,
    t.deps,
  );
  const { content } = await readDerivedArtifactContent(
    admin,
    { ...t.request(kind), derivedId: record.id },
    t.db,
    t.deps,
  );
  const map = ArtifactFieldMapSchema.parse(t.artifactOf(kind).fillMapping!.map);
  return {
    record,
    content,
    map,
    values: await readStaticPdfValues(content, map.static!),
    lines: (await readStaticPdfLines(content)).map((line) => line.text),
  };
}

const kept = (t: Lease) =>
  [...t.fake.store.keys()].filter(
    (path) =>
      path.startsWith(`${DERIVED_ARTIFACT_COLLECTIONS.records}/`) ||
      path.startsWith("publication_content_chunks/"),
  );

const onePet = (options: OnePathLeaseOptions = {}) =>
  setupOnePathLease({ animals: "one_pet", deposits: [30_000], ...options });

const NEEDS_DEPOSIT =
  "Example Pet 1: record the refundable deposit and where it comes from.";

describe("S253 BEH-S253-1: the fee, the deposit and the total for one ordinary pet", () => {
  it("shows the fee, the deposit and their exact sum on the lease before anything is prepared", async () => {
    const t = await onePet();
    const view = onePathView(t);
    expect(view.petAgreement).toEqual({
      feeCents: 5_000,
      feeUnit: null,
      feeSource: FEE_SOURCE,
      ordinaryPets: 1,
      depositCents: 30_000,
      totalCents: 35_000,
      needs: [],
    });
    expect(view.depositEntry).toBe("staff_record");
    // The deposit is kept with where it came from, who recorded it and when (R-S253-3).
    expect(t.inputs.animals.entries[0].deposit).toEqual({
      amountCents: 30_000,
      source: DEPOSIT_SOURCE,
      recordedAt: STAFF_AT,
      recordedByUid: "synthetic-editor",
    });
    expect(evaluateRenewalPacket(t.tenant)).toMatchObject({
      state: "Ready for preview",
      blockers: [],
    });
    expect(kept(t)).toEqual([]);
  });

  it("prints the deposit in the first amount blank and the total in the second", async () => {
    const t = await onePet();
    const { values, content, map, record } = await prepared(t, "animal_agreement");
    expect(values).toMatchObject({
      ProcessingFee: "$50.00",
      Deposit: "$300.00",
      Total: "$350.00",
      "AnimalName-1": "Example Pet 1",
      "AnimalDeposit-1": "$300.00",
      "AnimalName-2": "",
      "TenantName-1": "Example Tenant 1",
    });
    const regions = map.static!.regions;
    const runs = await readStaticPageRuns(content, 0);
    const drawn = (regionId: string) =>
      runs.find(
        (run) =>
          run.fillRegion === regions.findIndex((region) => region.regionId === regionId),
      )!;
    // Both amounts stand on the amount line, the deposit first and the total after it.
    expect(drawn("Deposit").text).toBe("$300.00");
    expect(drawn("Total").text).toBe("$350.00");
    expect(Math.abs(drawn("Deposit").y - drawn("Total").y)).toBeLessThan(0.5);
    expect(drawn("Deposit").x + drawn("Deposit").width).toBeLessThan(drawn("Total").x);
    expect(record.comparison).toMatchObject({ verified: true, removedRuns: 2 });
  });

  it("states the published fee in what a reader sees and in the text a program reads, and the old amount in neither", async () => {
    const t = await onePet();
    const original = t.forms.animal_agreement.bytes;
    const { content, lines, map } = await prepared(t, "animal_agreement");
    // The text a program reads from the file.
    expect(lines).toContain(
      "The tenant pays a non-refundable pet processing fee of $50.00 at signing,",
    );
    expect(lines).toContain(
      "plus a refundable deposit of $300.00 for a total of $350.00",
    );
    expect(lines.join("\n")).not.toContain(ONE_PATH_OLD_FEE_TEXT);
    // No object of the saved file still holds the old amount, shown or hidden.
    expect(await objectsHolding(original, [ONE_PATH_OLD_FEE_TEXT])).not.toEqual([]);
    expect(await objectsHolding(content, [ONE_PATH_OLD_FEE_TEXT])).toEqual([]);
    // What a reader sees where the fee stands: the drawn value and nothing under or over it.
    const fee = map.static!.regions.find((r) => r.regionId === "ProcessingFee")!.rect;
    const inFeeArea = async (bytes: Uint8Array) =>
      (await readStaticPageRuns(bytes, 0))
        .filter(
          (run) =>
            run.x < fee.x + fee.width &&
            fee.x < run.x + run.width &&
            run.y < fee.y + fee.height &&
            fee.y < run.y + run.height,
        )
        .map((run) => [run.text, run.fillRegion !== null]);
    expect(await inFeeArea(original)).toEqual([
      [ONE_PATH_OLD_FEE_TEXT, false],
      ["$50", false],
    ]);
    expect(await inFeeArea(content)).toEqual([["$50.00", true]]);
  });

  it("uses the amount an Admin published and the deposit staff recorded, exact to the cent", async () => {
    const t = await onePet({ deposits: [12_345], policy: feeAlonePolicy(7_525, 4) });
    expect(onePathView(t).petAgreement).toMatchObject({
      feeCents: 7_525,
      depositCents: 12_345,
      totalCents: 19_870,
    });
    const { values, lines } = await prepared(t, "animal_agreement");
    expect(values).toMatchObject({
      ProcessingFee: "$75.25",
      Deposit: "$123.45",
      Total: "$198.70",
    });
    expect(lines.join("\n")).not.toMatch(/\$50(\.00)?\b/);
  });
});

describe("S253 AC-S253-2: one fee on the finished form, or no file", () => {
  it("refuses the file made to differ: its text states another fee outside every reviewed region", async () => {
    const t = await onePet({ differingPetAgreement: true });
    await expect(
      prepareDerivedArtifact(admin, t.prepareRequest("animal_agreement"), t.db, t.deps),
    ).rejects.toThrow(
      /Page 2 of this form states a processing fee of \$150\.00 in its text, and the published fee is \$50\.00\. Use a corrected original, or a reviewed map region that replaces that exact text\./,
    );
    expect(kept(t)).toEqual([]);
    // The lease's other forms are prepared as usual.
    expect((await prepared(t, "renewal_extension")).record.comparison.verified).toBe(
      true,
    );
  });

  it("refuses an original whose conflicting fee text no reviewed region replaces", async () => {
    // The reader sees one amount and the file's text states another; no map region resolves it.
    const withoutFeeRegion = (map: ArtifactFieldMap): ArtifactFieldMap =>
      ArtifactFieldMapSchema.parse({
        ...map,
        mapVersion: "one-path-pet-no-fee-region",
        fields: map.fields.filter((field) => field.fieldId !== "ProcessingFee"),
        static: {
          ...map.static!,
          regions: map.static!.regions.filter(
            (region) => region.fieldId !== "ProcessingFee",
          ),
        },
      });
    const t = await onePet({ remap: { animal_agreement: withoutFeeRegion } });
    await expect(
      prepareDerivedArtifact(admin, t.prepareRequest("animal_agreement"), t.db, t.deps),
    ).rejects.toThrow(
      /Page 1 of this form states a processing fee of \$150\.00 in its text, and the published fee is \$50\.00\./,
    );
    expect(kept(t)).toEqual([]);
  });

  it("refuses a fee on the form that differs from the published amount", async () => {
    // A map that places another amount in the fee sentence: the form would state a fee nobody published.
    const otherAmount = (map: ArtifactFieldMap): ArtifactFieldMap =>
      ArtifactFieldMapSchema.parse({
        ...map,
        mapVersion: "one-path-pet-other-amount",
        fields: map.fields.map((field) =>
          field.fieldId === "ProcessingFee"
            ? { ...field, factKey: PET_AGREEMENT_TOTAL_FACT }
            : field,
        ),
      });
    const t = await onePet({ remap: { animal_agreement: otherAmount } });
    await expect(
      prepareDerivedArtifact(admin, t.prepareRequest("animal_agreement"), t.db, t.deps),
    ).rejects.toThrow(
      /states a processing fee of \$350\.00 in its text, and the published fee is \$50\.00/,
    );
    expect(kept(t)).toEqual([]);
  });

  it("with no fee published, keeps no pet agreement whose text states a processing fee", async () => {
    // A policy that prices pets by tier and publishes no processing fee, and a map that places
    // none of the three amounts: the form's own text would still state a fee nobody published.
    const tieredWithoutFee = ChargePolicyRecordSchema.parse({
      schemaVersion: "renewal-charge-policy/v1",
      version: 3,
      effectiveFrom: "2026-11-01",
      content: {
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
              monthlyCents: 2_500,
              oneTimeCents: 0,
              refundableDepositCents: 22_500,
            },
          ],
          treatments: { pet: "tiered", assistance_animal: "no_charge" },
          agreementFor: { pet: true, assistance_animal: false },
          juvenileWeightBasis: null,
        },
      },
      publishedAt: SEEDED_AT,
      publishedByUid: admin.uid,
    });
    const amounts = new Set(["ProcessingFee", "Deposit", "Total"]);
    const withoutAmounts = (map: ArtifactFieldMap): ArtifactFieldMap =>
      ArtifactFieldMapSchema.parse({
        ...map,
        mapVersion: "one-path-pet-no-amounts",
        fields: map.fields.filter((field) => !amounts.has(field.fieldId)),
        static: {
          ...map.static!,
          regions: map.static!.regions.filter((region) => !amounts.has(region.fieldId)),
        },
      });
    const t = await setupOnePathLease({
      animals: "one_pet",
      policy: tieredWithoutFee,
      remap: { animal_agreement: withoutAmounts },
    });
    const evaluation = evaluateRenewalPacket(t.tenant);
    expect(evaluation).toMatchObject({ state: "Ready for preview", blockers: [] });
    expect(evaluation.manifest!.formHolds).toBeUndefined();
    await expect(
      prepareDerivedArtifact(admin, t.prepareRequest("animal_agreement"), t.db, t.deps),
    ).rejects.toThrow(
      // Both amounts stand in the fee sentence: the earlier text and the overlay drawn over it.
      /Page 1 of this form states a processing fee of \$150\.00 and \$50\.00 in its text, and no processing fee is published\. An Admin publishes the pet processing fee before this form is prepared\./,
    );
    expect(kept(t)).toEqual([]);
    // The lease's other forms are prepared as usual.
    expect((await prepared(t, "renewal_extension")).record.comparison.verified).toBe(
      true,
    );
  });
});

describe("S253 BEH-S253-2: a missing part names the need, prints no total and holds one form", () => {
  it("no deposit recorded: the pet agreement alone waits and nothing reads as zero", async () => {
    const t = await setupOnePathLease({ animals: "one_pet" });
    const evaluation = evaluateRenewalPacket(t.tenant);
    expect(evaluation).toMatchObject({ state: "Ready for preview", blockers: [] });
    expect(evaluation.manifest!.formHolds).toEqual([
      {
        artifactKind: "animal_agreement",
        factKey: PET_AGREEMENT_DEPOSIT_FACT,
        label: NEEDS_DEPOSIT,
      },
      {
        artifactKind: "animal_agreement",
        factKey: PET_AGREEMENT_TOTAL_FACT,
        label: NEEDS_DEPOSIT,
      },
    ]);
    const view = onePathView(t);
    expect(view.petAgreement).toMatchObject({
      feeCents: 5_000,
      depositCents: null,
      totalCents: null,
      needs: [NEEDS_DEPOSIT],
    });
    expect(JSON.stringify(view.petAgreement)).not.toMatch(/:0[,}\]]/);
    // The form is never prepared with a blank where an amount belongs.
    await expect(
      prepareDerivedArtifact(admin, t.prepareRequest("animal_agreement"), t.db, t.deps),
    ).rejects.toThrow(
      "Approved animal agreement waits: Example Pet 1: record the refundable deposit and where it comes from. The lease's other forms can be prepared.",
    );
    expect(
      await readDerivedArtifactStatus(admin, t.request("animal_agreement"), t.db, t.deps),
    ).toMatchObject({ supported: true, record: null, holds: [NEEDS_DEPOSIT] });
    expect(kept(t)).toEqual([]);
    // The lease's other forms go on.
    expect((await prepared(t, "renewal_extension")).values).toMatchObject({
      "TenantName-1": "Example Tenant 1",
    });
  });

  it("more than one ordinary pet with the unit unset: both blanks wait, with deposits recorded or not", async () => {
    for (const deposits of [[30_000, 20_000], []]) {
      const t = await setupOnePathLease({ animals: "two_pets", deposits });
      const evaluation = evaluateRenewalPacket(t.tenant);
      expect(evaluation).toMatchObject({ state: "Ready for preview", blockers: [] });
      const labels = [
        ...new Set(evaluation.manifest!.formHolds!.map((hold) => hold.label)),
      ];
      expect(labels).toHaveLength(1);
      expect(labels[0]).toMatch(
        /more than one ordinary pet\. What one processing fee covers is an open question for the business, so the deposit and the total stay blank\./,
      );
      expect(t.assembled.calculated!.petAgreement).toMatchObject({
        ordinaryPets: 2,
        depositCents: null,
        totalCents: null,
      });
      // No fee charge is counted for a number of fees nobody confirmed.
      expect(t.tenant.charges.map((charge) => charge.chargeId)).not.toContain(
        PET_FEE_CHARGE_ID,
      );
      await expect(
        prepareDerivedArtifact(admin, t.prepareRequest("animal_agreement"), t.db, t.deps),
      ).rejects.toThrow(/waits: .*more than one ordinary pet/);
      expect(kept(t)).toEqual([]);
    }
  });

  it("an assistance animal with no published rule: only that the rule is needed", async () => {
    const t = await setupOnePathLease({ animals: "assistance_animal" });
    const evaluation = evaluateRenewalPacket(t.tenant);
    expect(evaluation).toMatchObject({ state: "Ready for preview", blockers: [] });
    const manifest = evaluation.manifest!;
    // No agreement decision is made: the form is neither included nor ruled out.
    expect(manifest.includedArtifacts.map((artifact) => artifact.kind)).not.toContain(
      "animal_agreement",
    );
    expect(
      manifest.excludedArtifacts.find((artifact) => artifact.kind === "animal_agreement"),
    ).toMatchObject({ ruleResult: "Needs input", reason: HELD_ANIMAL_REASON });
    expect(manifest.animals).toMatchObject([
      { heldBy: "assistance_animal_rule", agreementApplicable: null, chargeIds: [] },
    ]);
    // Never charged, never free, never zero: no charge and no amount exists for it at all.
    const animalId = t.inputs.animals.entries[0].animalId;
    expect(manifest.charges.filter((charge) => charge.animalId === animalId)).toEqual([]);
    const view = onePathView(t);
    expect(view.charges!.animals).toMatchObject([
      {
        status: "needs_rule",
        amounts: { monthly: null, one_time: null, refundable_deposit: null },
      },
    ]);
    expect(view.charges!.animals[0].reason).toMatch(
      /needs the approved rule for assistance animals/,
    );
    expect(view.petAgreement).toMatchObject({ depositCents: null, totalCents: null });
    expect(view.charges!.totals).toMatchObject({
      one_time: null,
      refundable_deposit: null,
    });
    // No amount of any kind is stated for the animal, so none can read as zero.
    expect(JSON.stringify(view.charges!.animals)).not.toMatch(/:0[,}\]]/);
    expect(view.petAgreement).toMatchObject({ ordinaryPets: 0, needs: [] });
    // The lease's other forms go on.
    expect((await prepared(t, "renewal_extension")).record.comparison.verified).toBe(
      true,
    );
  });

  it("an ordinary pet on the same lease still totals, and the assistance animal is placed on no form", async () => {
    const t = await setupOnePathLease({
      animals: "pet_and_assistance_animal",
      deposits: [30_000, null],
    });
    expect(evaluateRenewalPacket(t.tenant)).toMatchObject({
      state: "Ready for preview",
      blockers: [],
    });
    const { values, lines } = await prepared(t, "animal_agreement");
    expect(values).toMatchObject({
      Deposit: "$300.00",
      Total: "$350.00",
      "AnimalName-1": "Example Pet 1",
      "AnimalName-2": "",
    });
    expect(lines.join("\n")).not.toContain("Example Helper");
  });

  it("with nothing published the lease names the fee as the need and makes no total", async () => {
    const t = await setupOnePathLease({
      animals: "one_pet",
      deposits: [30_000],
      policy: null,
    });
    expect(t.assembled.calculated!.petAgreement).toMatchObject({
      feeCents: null,
      depositCents: 30_000,
      totalCents: null,
      needs: ["An Admin has not published the pet processing fee."],
    });
    expect(t.tenant.facts.map((fact) => fact.fieldKey)).not.toContain(
      PET_AGREEMENT_TOTAL_FACT,
    );
  });

  it("no printed amount of the form is ever used: the printed schedule changes nothing", async () => {
    // The synthetic form prints a schedule by screening score. The seeded pet has a score, and
    // no deposit appears until staff record one.
    const t = await setupOnePathLease({ animals: "one_pet" });
    expect(t.inputs.animals.entries[0].fidoScore).toBe(4);
    expect(
      (await readStaticPdfLines(t.forms.animal_agreement.bytes)).some((line) =>
        /Screening score 4: deposit \$222\.00/.test(line.text),
      ),
    ).toBe(true);
    expect(t.assembled.calculated!.petAgreement.depositCents).toBeNull();
    expect(t.tenant.facts.some((fact) => fact.normalizedValue === 222)).toBe(false);
    expect(t.tenant.charges.some((charge) => charge.amountCents === 22_200)).toBe(false);
  });
});
