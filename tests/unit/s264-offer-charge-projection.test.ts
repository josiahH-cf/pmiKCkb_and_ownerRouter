import { describe, expect, it } from "vitest";

import {
  emptyOfferChargeSelection,
  moneyToCents,
  projectOfferCharges,
  type OfferChargeSelection,
  type OfferChargeSource,
  type OfferSourceLine,
} from "@/lib/lease-renewal/offer-charges";
import {
  OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
  type OfferChargeMappingEntry,
  type OfferChargeMappingsRead,
} from "@/lib/lease-renewal/offer-charge-mapping";
import { projectTenantResourceRequirements } from "@/lib/lease-renewal/tenant-resource-decisions";
import type { MessageCharge } from "@/lib/lease-renewal/renewal-message-content";

// S264 R-S264-1/2/3/5/7 (AC-S264-1, AC-S264-3, AC-S264-5, AC-S264-7): the one tenant charge
// projection over synthetic RentVine lines and synthetic approved mappings. No real account ids,
// charge ids, amounts or customer values.

const LEASE = "7264";
const RENEWAL = "2027-02-01";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function line(
  overrides: Partial<OfferSourceLine> & { chargeId: string },
): OfferSourceLine {
  return {
    accountId: "9001",
    accountName: "Synthetic Pet Rent",
    description: "Synthetic pet rent",
    classification: "non_rent",
    amount: "45.00",
    frequency: "1",
    startDate: "2026-02-01",
    endDate: null,
    endDateRaw: null,
    statusId: 1,
    version: `v-${overrides.chargeId}`,
    ...overrides,
  };
}

function read(lines: OfferSourceLine[]): OfferChargeSource {
  return { state: "read", asOf: "2026-11-10", lines, version: `src-${lines.length}` };
}

function mapping(
  overrides: Partial<OfferChargeMappingEntry> & { accountId: string },
): OfferChargeMappingEntry {
  return {
    entryId: uuid(Number(overrides.accountId)),
    accountName: "Synthetic account",
    displayLabel: "Pet rent",
    family: "pet",
    frequencyMonths: 1,
    applicability: "active_on_renewal_date",
    requirement: null,
    approval: { reference: "Synthetic approval note", approvedOn: "2026-11-01" },
    ...overrides,
  };
}

function mappings(
  entries: OfferChargeMappingEntry[],
  version = 3,
): OfferChargeMappingsRead {
  return {
    readable: true,
    record: {
      schemaVersion: OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
      version,
      entries,
      updatedAt: "2026-11-02T15:00:00.000Z",
      updatedByUid: "synthetic-admin",
    },
  };
}

const PET = mapping({ accountId: "9001" });
const CREDIT = mapping({
  accountId: "9002",
  displayLabel: "Credit reporting",
  family: "credit_reporting",
});
const INSURANCE = mapping({
  accountId: "9003",
  displayLabel: "Insurance program",
  family: "insurance",
});
const RBP = mapping({
  accountId: "9004",
  displayLabel: "Resident Benefits Package",
  family: "rbp",
});

function project(input: {
  lines?: OfferSourceLine[];
  source?: OfferChargeSource;
  entries?: OfferChargeMappingEntry[];
  selection?: OfferChargeSelection | null;
  rent?: number | null;
  effectiveDate?: string | null;
  legacy?: MessageCharge[];
  mappingsRead?: OfferChargeMappingsRead;
}) {
  return projectOfferCharges({
    leaseId: LEASE,
    source: input.source ?? read(input.lines ?? []),
    mappings: input.mappingsRead ?? mappings(input.entries ?? [PET, CREDIT]),
    selection: input.selection ?? null,
    terms: {
      rent: input.rent === undefined ? 920 : input.rent,
      effectiveDate: input.effectiveDate === undefined ? RENEWAL : input.effectiveDate,
    },
    legacyCharges: input.legacy ?? [],
  });
}

const row = (review: ReturnType<typeof project>, rowKey: string) =>
  review.rows.find((entry) => entry.rowKey === rowKey);

describe("S264 AC-S264-1 inventory and projection matrix", () => {
  it("a verified active pet line is proposed as selected with its source; an ended line and an unmapped lookalike never change the total", () => {
    const review = project({
      lines: [
        line({ chargeId: "501" }),
        line({
          chargeId: "502",
          startDate: "2025-02-01",
          endDate: "2026-01-31",
          endDateRaw: "2026-01-31",
          statusId: 3,
        }),
        line({
          chargeId: "503",
          accountId: "9555",
          accountName: "Synthetic Pet Fee Misc",
          amount: "40.00",
        }),
      ],
    });
    expect(row(review, "rentvine:501")).toMatchObject({
      status: "selected",
      label: "Pet rent",
      amountCents: 4500,
      comparison: "unchanged",
      sourceRef: `rentvine:lease:${LEASE}:recurring-charge:501`,
    });
    expect(row(review, "rentvine:501")?.sourceLabel).toContain("Synthetic Pet Rent");
    expect(row(review, "rentvine:502")?.status).toBe("historical");
    expect(row(review, "rentvine:503")).toMatchObject({
      status: "needs_decision",
      choices: ["include", "exclude"],
    });
    expect(row(review, "rentvine:503")?.gaps[0]).toMatch(
      /No approved offer mapping names RentVine account 9555/,
    );
    // Base plus the one verified line; the ended line and the lookalike add nothing.
    expect(review.totals.monthlyKnownCents).toBe(92000 + 4500);
    expect(review.totals.monthlyComplete).toBe(false);
    expect(review.lead).toMatchObject({ rowKey: "rentvine:503" });
    // Leaving the lookalike out, with its reason, resolves the offer.
    const resolved = project({
      lines: [line({ chargeId: "501" }), line({ chargeId: "503", accountId: "9555" })],
      selection: {
        ...emptyOfferChargeSelection(),
        decisions: [
          {
            rowKey: "rentvine:503",
            choice: "exclude",
            reason: "Synthetic: covered by the pet line above",
            renewalAmountCents: null,
            effectiveDate: null,
            correctionSource: null,
            reviewed: { sourceVersion: "v-503", renewalDate: RENEWAL, mappingVersion: 3 },
          },
        ],
      },
    });
    expect(row(resolved, "rentvine:503")?.status).toBe("excluded");
    expect(resolved.totals.monthlyKnownCents).toBe(96500);
    expect(resolved.totals.monthlyComplete).toBe(true);
    expect(resolved.holds).toEqual([]);
  });

  it("two distinct active lines of one family with the same label both count; a repeated source identity is refused before counting", () => {
    const two = project({
      lines: [line({ chargeId: "601" }), line({ chargeId: "602", amount: "25.00" })],
    });
    expect(two.rows.filter((entry) => entry.status === "selected")).toHaveLength(2);
    expect(
      two.totals.monthlyLines.map((entry) => [entry.label, entry.amountCents]),
    ).toEqual([
      ["Pet rent", 4500],
      ["Pet rent", 2500],
    ]);
    expect(two.totals.monthlyKnownCents).toBe(92000 + 4500 + 2500);
    const repeated = project({
      lines: [line({ chargeId: "611" }), line({ chargeId: "611", amount: "50.00" })],
    });
    expect(
      repeated.rows.map((entry) => [entry.rowKey, entry.status, entry.choices]),
    ).toEqual([["rentvine:611", "needs_decision", ["exclude"]]]);
    expect(repeated.rows[0]!.gaps[0]).toMatch(/more than once, so no copy is counted/);
    expect(repeated.totals.monthlyLines).toEqual([]);
  });

  it("future, expired, missing mapping or cadence, contradictory amounts and unclear dates each keep their exact disposition", () => {
    const review = project({
      lines: [
        line({ chargeId: "701", startDate: "2027-05-01" }),
        line({ chargeId: "702", endDate: "2027-01-31", endDateRaw: "2027-01-31" }),
        line({ chargeId: "703", accountId: "9002", frequency: "3", amount: "39.00" }),
        line({ chargeId: "704", amount: "45.005" }),
        line({ chargeId: "705", endDate: RENEWAL, endDateRaw: RENEWAL }),
        line({ chargeId: "706", statusId: 2 }),
        line({ chargeId: "707", endDate: null, endDateRaw: "13/45/2027" }),
        line({ chargeId: "708", accountId: "9999", classification: "unknown" }),
      ],
    });
    expect(row(review, "rentvine:701")?.status).toBe("future");
    expect(row(review, "rentvine:702")?.status).toBe("historical");
    expect(row(review, "rentvine:703")?.gaps[0]).toMatch(
      /supports monthly, and this line is charged every 3 months/,
    );
    expect(row(review, "rentvine:704")?.gaps).toContain(
      "The RentVine amount for this line is not a valid amount.",
    );
    expect(row(review, "rentvine:705")?.gaps[0]).toMatch(
      /ends on the renewal start date/,
    );
    expect(row(review, "rentvine:706")?.gaps[0]).toMatch(
      /inactive while its dates cover/,
    );
    expect(row(review, "rentvine:707")?.gaps[0]).toMatch(
      /end date for this line is not a real date/,
    );
    expect(row(review, "rentvine:708")?.gaps[0]).toMatch(
      /does not say whether this account is rent/,
    );
    for (const key of ["703", "704", "705", "706", "707", "708"])
      expect(row(review, `rentvine:${key}`)?.status).toBe("needs_decision");
    expect(review.totals.monthlyLines).toEqual([]);
    // Unknown is neither selected nor presumed absent: it holds the review.
    expect(review.holds.length).toBeGreaterThan(0);
  });

  it("no renewal date means no line is resolved: each stays unknown and the fix is the working start date", () => {
    const review = project({ lines: [line({ chargeId: "801" })], effectiveDate: null });
    expect(row(review, "rentvine:801")?.status).toBe("needs_decision");
    expect(review.composition.notes.map((note) => note.field)).toContain(
      "offerCharges.renewalDate",
    );
  });

  it("a legacy family-only record stays inspectable and counts only after a deliberate disposition", () => {
    const legacy: MessageCharge[] = [
      {
        id: "pet",
        applicable: true,
        amount: 45,
        cadence: "monthly",
        effectiveDate: RENEWAL,
        source: "Synthetic earlier staff entry",
        comparison: "unchanged",
      },
      {
        id: "rbp",
        applicable: false,
        amount: null,
        cadence: null,
        effectiveDate: null,
        source: null,
        comparison: "unverified",
      },
    ];
    const pending = project({ source: { state: "not_read" }, legacy });
    expect(row(pending, "legacy:pet")).toMatchObject({
      status: "needs_decision",
      origin: "legacy",
    });
    expect(row(pending, "legacy:rbp")).toBeUndefined();
    expect(pending.totals.monthlyLines).toEqual([]);
    const used = project({
      source: { state: "not_read" },
      legacy,
      selection: {
        ...emptyOfferChargeSelection(),
        decisions: [
          {
            rowKey: "legacy:pet",
            choice: "include",
            reason: null,
            renewalAmountCents: null,
            effectiveDate: null,
            correctionSource: null,
            reviewed: { sourceVersion: null, renewalDate: RENEWAL, mappingVersion: 3 },
          },
        ],
      },
    });
    expect(row(used, "legacy:pet")).toMatchObject({
      status: "selected",
      amountCents: 4500,
    });
    expect(used.totals.monthlyKnownCents).toBe(96500);
  });

  it("source drift, a changed renewal date or a mapping revision asks for review and never silently replaces a reviewed decision", () => {
    const decided: OfferChargeSelection = {
      ...emptyOfferChargeSelection(),
      decisions: [
        {
          rowKey: "rentvine:901",
          choice: "include",
          reason: null,
          renewalAmountCents: 5000,
          effectiveDate: null,
          correctionSource: "Synthetic signed pet addendum",
          reviewed: { sourceVersion: "v-901", renewalDate: RENEWAL, mappingVersion: 3 },
        },
      ],
    };
    const current = project({ lines: [line({ chargeId: "901" })], selection: decided });
    expect(row(current, "rentvine:901")).toMatchObject({
      status: "selected",
      amountCents: 5000,
      comparison: "changed",
    });
    const drift = project({
      lines: [line({ chargeId: "901", version: "v-901-b", amount: "50.00" })],
      selection: decided,
    });
    expect(row(drift, "rentvine:901")).toMatchObject({ status: "needs_review" });
    expect(row(drift, "rentvine:901")?.gaps[0]).toMatch(/RentVine changed this line/);
    expect(row(drift, "rentvine:901")?.decision?.renewalAmountCents).toBe(5000);
    const redated = project({
      lines: [line({ chargeId: "901" })],
      selection: decided,
      effectiveDate: "2027-03-01",
    });
    expect(row(redated, "rentvine:901")?.gaps[0]).toMatch(/renewal start date changed/);
    const remapped = project({
      lines: [line({ chargeId: "901" })],
      selection: decided,
      mappingsRead: mappings([PET, CREDIT], 4),
    });
    expect(row(remapped, "rentvine:901")?.gaps[0]).toMatch(/mapping changed/);
    for (const review of [drift, redated, remapped]) {
      expect(review.totals.monthlyComplete).toBe(false);
      expect(review.holds.length).toBeGreaterThan(0);
    }
  });

  it("unreadable mappings and an unavailable source hold the review without guessing", () => {
    const unreadable = project({
      lines: [line({ chargeId: "951" })],
      mappingsRead: { readable: false, record: null },
    });
    expect(row(unreadable, "rentvine:951")).toMatchObject({
      status: "needs_decision",
      choices: ["exclude"],
    });
    const unavailable = project({ source: { state: "unavailable" } });
    expect(unavailable.holds[0]).toMatch(/could not be read/);
    expect(unavailable.totals.monthlyComplete).toBe(false);
    expect(unavailable.composition.unchangedStatement).toBe(false);
  });
});

describe("S264 AC-S264-3 exact totals in integer cents", () => {
  it("$920 base plus $45 pet rent and $13 credit reporting is $978 monthly, with a separate case-approved $35 one-time fee", () => {
    const review = project({
      lines: [
        line({ chargeId: "1001" }),
        line({ chargeId: "1002", accountId: "9002", amount: "13.00" }),
      ],
      selection: {
        ...emptyOfferChargeSelection(),
        caseEntries: [
          {
            id: uuid(1),
            family: "renewal_processing",
            amountCents: 3500,
            effectiveDate: RENEWAL,
            trigger: "Synthetic: renewal signed after the posted date",
            source: "Synthetic case approval reference",
          },
        ],
      },
    });
    expect(review.totals).toMatchObject({
      baseCents: 92000,
      monthlyKnownCents: 97800,
      monthlyComplete: true,
      oneTimeKnownCents: 3500,
      oneTimeComplete: true,
    });
    expect(review.totals.monthlyLines.map((entry) => entry.label)).toEqual([
      "Pet rent",
      "Credit reporting",
    ]);
    expect(review.totals.oneTimeLines.map((entry) => entry.label)).toEqual([
      "Renewal processing fee",
    ]);
  });

  it("zero, empty and incomplete stay distinct, and an incomplete total shows only a labeled known subtotal", () => {
    const empty = project({ lines: [] });
    expect(empty.totals.oneTimeLines).toEqual([]);
    expect(empty.totals.oneTimeComplete).toBe(true);
    const zero = project({
      lines: [],
      selection: {
        ...emptyOfferChargeSelection(),
        caseEntries: [
          {
            id: uuid(2),
            family: "pet_processing",
            amountCents: 0,
            effectiveDate: RENEWAL,
            trigger: "Synthetic: fee waived for this case",
            source: "Synthetic case approval",
          },
        ],
      },
    });
    expect(zero.totals.oneTimeLines).toHaveLength(1);
    expect(zero.totals.oneTimeKnownCents).toBe(0);
    expect(zero.totals.oneTimeComplete).toBe(true);
    const incomplete = project({
      lines: [line({ chargeId: "1101" })],
      selection: {
        ...emptyOfferChargeSelection(),
        caseEntries: [
          {
            id: uuid(3),
            family: "insurance",
            amountCents: null,
            effectiveDate: RENEWAL,
            trigger: null,
            source: "Synthetic insurance enrollment record",
          },
        ],
      },
    });
    expect(incomplete.totals.monthlyComplete).toBe(false);
    expect(incomplete.totals.monthlyKnownCents).toBe(96500);
    expect(incomplete.totals.gaps).toContain("Insurance: the amount is not known yet.");
    const noBase = project({ lines: [line({ chargeId: "1102" })], rent: null });
    expect(noBase.totals.baseCents).toBeNull();
    expect(noBase.totals.monthlyComplete).toBe(false);
    expect(noBase.totals.gaps).toContain("The renewal base rent is not entered yet.");
  });

  it("a supported non-monthly line keeps its own cadence and never joins the monthly total", () => {
    const quarterly = mapping({
      accountId: "9010",
      displayLabel: "Synthetic yard service",
      family: "utilities",
      frequencyMonths: 3,
    });
    const review = project({
      lines: [
        line({ chargeId: "1201", accountId: "9010", frequency: "3", amount: "90.00" }),
      ],
      entries: [quarterly],
    });
    expect(review.totals.otherRecurring).toEqual([
      {
        rowKey: "rentvine:1201",
        label: "Synthetic yard service",
        amountCents: 9000,
        months: 3,
      },
    ]);
    expect(review.totals.monthlyKnownCents).toBe(92000);
  });

  it("money is exact cents: cents are kept, fractions of a cent and malformed amounts are refused", () => {
    expect(moneyToCents("45")).toBe(4500);
    expect(moneyToCents("45.5")).toBe(4550);
    expect(moneyToCents("1,013.07")).toBe(101307);
    expect(moneyToCents(13.01)).toBe(1301);
    expect(moneyToCents(0.1 + 0.2)).toBe(30);
    expect(moneyToCents("45.005")).toBeNull();
    expect(moneyToCents("-4")).toBeNull();
    expect(moneyToCents("abc")).toBeNull();
    expect(moneyToCents(Number.NaN)).toBeNull();
  });
});

describe("S264 AC-S264-1 a line no mapping names, decided for this lease only", () => {
  const unmapped = line({ chargeId: "1901", accountId: "9777", amount: "35.00" });
  const include = (classification?: "pet" | "utilities" | "rbp" | "insurance") =>
    project({
      lines: [unmapped],
      selection: {
        ...emptyOfferChargeSelection(),
        decisions: [
          {
            rowKey: "rentvine:1901",
            choice: "include",
            reason: "Synthetic signed pet addendum for this lease",
            renewalAmountCents: null,
            effectiveDate: null,
            correctionSource: null,
            reviewed: {
              sourceVersion: "v-1901",
              renewalDate: RENEWAL,
              mappingVersion: 3,
            },
            ...(classification ? { classification } : {}),
          },
        ],
      },
    });

  it("counts only once it says what the charge is, with its case source, and publishes no mapping", () => {
    const unnamed = include();
    expect(row(unnamed, "rentvine:1901")).toMatchObject({
      status: "selected",
      family: null,
      gaps: ["Choose what this charge is for this lease."],
    });
    expect(unnamed.totals.monthlyComplete).toBe(false);
    expect(unnamed.holds[0]).toMatch(/Choose what this charge is for this lease/);
    const named = include("pet");
    expect(row(named, "rentvine:1901")).toMatchObject({
      status: "selected",
      family: "pet",
      label: "Pet rent",
      amountCents: 3500,
      gaps: [],
      mappingEntryId: null,
    });
    expect(named.totals).toMatchObject({
      monthlyKnownCents: 95500,
      monthlyComplete: true,
    });
    expect(named.holds).toEqual([]);
    // A later Admin mapping of the same account is a mapping change: the decision is reviewed again.
    const remapped = project({
      lines: [unmapped],
      mappingsRead: mappings([PET, CREDIT, mapping({ accountId: "9777" })], 4),
      selection: {
        ...emptyOfferChargeSelection(),
        decisions: [row(named, "rentvine:1901")!.decision!],
      },
    });
    expect(row(remapped, "rentvine:1901")?.status).toBe("needs_review");
  });
});

describe("S264 AC-S264-5 conditional policy stays source-bound", () => {
  it("no fee appears by default, and recurring pet rent infers no processing fee, deposit or animal rule", () => {
    const review = project({ lines: [line({ chargeId: "1301" })] });
    expect(review.rows.map((entry) => entry.family)).toEqual(["pet"]);
    expect(review.totals.oneTimeLines).toEqual([]);
    expect(
      review.composition.lines.some((entry) => /processing/i.test(entry.label)),
    ).toBe(false);
  });

  it("a case amount counts only with its stated trigger and authorized source", () => {
    const review = project({
      lines: [],
      selection: {
        ...emptyOfferChargeSelection(),
        caseEntries: [
          {
            id: uuid(4),
            family: "pet_processing",
            amountCents: 2750,
            effectiveDate: RENEWAL,
            trigger: null,
            source: null,
          },
        ],
      },
    });
    expect(review.rows[0]!.gaps).toEqual([
      "Pet processing fee: name the authorized case source or approved policy.",
      "Pet processing fee: state what triggers this fee.",
    ]);
    expect(review.holds[0]).toMatch(/Pet processing fee/);
  });

  it("only a verified covered utility mapping names Water / sewer; another utility keeps its own verified label", () => {
    const trash = mapping({
      accountId: "9020",
      displayLabel: "Synthetic trash service",
      family: "utilities",
    });
    const review = project({
      lines: [line({ chargeId: "1401", accountId: "9020", amount: "18.00" })],
      entries: [trash],
    });
    expect(row(review, "rentvine:1401")?.label).toBe("Synthetic trash service");
  });

  it("a guarantor or other separate requirement is never an offer charge", () => {
    const guarantor = mapping({
      accountId: "9030",
      displayLabel: "Synthetic guarantor coverage",
      family: "separate_requirement",
      requirement: "Guarantor coverage stays a separate obligation",
    });
    const review = project({
      lines: [line({ chargeId: "1501", accountId: "9030", amount: "20.00" })],
      entries: [guarantor],
    });
    expect(row(review, "rentvine:1501")).toMatchObject({
      status: "separate",
      material: false,
    });
    expect(review.totals.monthlyLines).toEqual([]);
    expect(review.holds).toEqual([]);
  });
});

describe("S264 AC-S264-7 material transition decisions feed S265's requirements", () => {
  const insuranceLine = line({ chargeId: "1601", accountId: "9003", amount: "12.50" });
  const decide = (insurance: OfferChargeSelection["transitions"]["insurance"]) =>
    project({
      lines: [insuranceLine],
      entries: [INSURANCE],
      selection: {
        ...emptyOfferChargeSelection(),
        transitions: { insurance, rbp: null },
      },
    });

  it("selected insurance with no decision is unknown: it holds, and its wording and flyer stay out", () => {
    const unknown = decide(null);
    expect(unknown.decisions.insuranceTransition).toBe("unknown");
    expect(unknown.lead?.text).toMatch(/insurance transition/);
    expect(projectTenantResourceRequirements(unknown.decisions, false).holds).toEqual([
      "insurance_transition",
    ]);
    // A choice without its source stays source pending.
    expect(
      decide({ choice: "applies", source: null }).decisions.insuranceTransition,
    ).toBe("unknown");
  });

  it("verified No needs no flyer; verified Yes requires the S265 insurance flyer", () => {
    const no = decide({
      choice: "does_not_apply",
      source: "Synthetic tenant policy on file",
    });
    expect(projectTenantResourceRequirements(no.decisions, false)).toMatchObject({
      required: [],
      holds: [],
    });
    const yes = decide({ choice: "applies", source: "Synthetic program enrollment" });
    expect(projectTenantResourceRequirements(yes.decisions, false).required).toEqual([
      "insurance_flyer",
    ]);
  });

  it("a relevant RBP charge resolves unchanged, new or changed; unknown keeps its review task", () => {
    const rbpLine = line({ chargeId: "1701", accountId: "9004", amount: "30.00" });
    const at = (rbp: OfferChargeSelection["transitions"]["rbp"]) =>
      project({
        lines: [rbpLine],
        entries: [RBP],
        selection: {
          ...emptyOfferChargeSelection(),
          transitions: { insurance: null, rbp },
        },
      });
    expect(at(null).decisions.rbpChange).toBe("unknown");
    expect(projectTenantResourceRequirements(at(null).decisions, false).holds).toEqual([
      "rbp_change",
    ]);
    expect(
      projectTenantResourceRequirements(
        at({ choice: "unchanged", source: "Synthetic package notice" }).decisions,
        false,
      ),
    ).toMatchObject({ required: [], holds: [] });
    for (const choice of ["new", "changed"] as const)
      expect(
        projectTenantResourceRequirements(
          at({ choice, source: "Synthetic package notice" }).decisions,
          false,
        ).required,
      ).toEqual(["rbp_flyer"]);
  });

  it("when neither transition is relevant, no decision is asked for", () => {
    const review = project({ lines: [line({ chargeId: "1801" })] });
    expect(review.decisions).toMatchObject({
      insuranceTransition: null,
      rbpChange: null,
    });
    expect(review.transitions.insurance.relevant).toBe(false);
    expect(review.transitions.rbp.relevant).toBe(false);
  });
});
