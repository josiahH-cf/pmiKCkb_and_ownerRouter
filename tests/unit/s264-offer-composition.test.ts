import { describe, expect, it } from "vitest";

import {
  composeRenewalMessage,
  SUPPLIED_RENEWAL_COPY,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { emptyMessagePreparationInputs } from "@/lib/lease-renewal/renewal-message-preparation";
import { outgoingRenewalReasons } from "@/lib/lease-renewal/outgoing-message-readiness";
import { projectMessageReadiness } from "@/lib/lease-renewal/message-readiness";
import {
  emptyOfferChargeSelection,
  offerChargeRowControlId,
  projectOfferCharges,
  type OfferChargeSelection,
  type OfferSourceLine,
} from "@/lib/lease-renewal/offer-charges";
import {
  OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
  type OfferChargeMappingEntry,
  type OfferChargeMappingsRead,
} from "@/lib/lease-renewal/offer-charge-mapping";

// S264 R-S264-4 / R-S264-7 (AC-S264-4, AC-S264-7): the exact tenant text composes from the one
// projection's rows. Base stays in the terms sentence, new or changed recurring lines and one-time
// fees are itemized under their own headings, and "All other charges stay the same." appears only
// when every current line was compared and continues. Synthetic values only.

const RENEWAL = "2027-02-01";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function line(
  chargeId: string,
  accountId: string,
  amount: string,
  frequency = "1",
): OfferSourceLine {
  return {
    chargeId,
    accountId,
    accountName: `Synthetic account ${accountId}`,
    description: "Synthetic line",
    classification: "non_rent",
    amount,
    frequency,
    startDate: "2026-02-01",
    endDate: null,
    endDateRaw: null,
    statusId: 1,
    version: `v-${chargeId}`,
  };
}
const entry = (
  accountId: string,
  displayLabel: string,
  family: OfferChargeMappingEntry["family"],
  frequencyMonths = 1,
): OfferChargeMappingEntry => ({
  entryId: uuid(Number(accountId)),
  accountId,
  accountName: `Synthetic account ${accountId}`,
  displayLabel,
  family,
  frequencyMonths,
  applicability: "active_on_renewal_date",
  requirement: null,
  approval: { reference: "Synthetic approval note", approvedOn: "2026-11-01" },
});
const MAPPINGS: OfferChargeMappingsRead = {
  readable: true,
  record: {
    schemaVersion: OFFER_CHARGE_MAPPINGS_SCHEMA_VERSION,
    version: 2,
    entries: [
      entry("9001", "Pet rent", "pet"),
      entry("9002", "Credit reporting", "credit_reporting"),
      entry("9003", "Insurance program", "insurance"),
      entry("9010", "Synthetic yard service", "utilities", 3),
    ],
    updatedAt: "2026-11-02T15:00:00.000Z",
    updatedByUid: "synthetic-admin",
  },
};

function review(lines: OfferSourceLine[], selection: OfferChargeSelection | null = null) {
  return projectOfferCharges({
    leaseId: "7264",
    source: { state: "read", asOf: "2026-11-10", lines, version: "src" },
    mappings: MAPPINGS,
    selection,
    terms: { rent: 920, effectiveDate: RENEWAL },
  });
}

function facts(offer: ReturnType<typeof review>): RenewalMessageFacts {
  const inputs = emptyMessagePreparationInputs();
  return {
    outgoingContract: true,
    signatureConfigured: true,
    channel: "tenant",
    names: ["Fixture Tenant"],
    firstNames: ["Fixture"],
    address: "701 Fixture Lane",
    currentBaseRent: null,
    leaseEndDate: "2027-01-31",
    ownerTerms: {
      rent: 920,
      effectiveDate: RENEWAL,
      endDate: "2028-01-31",
      source: "Working renewal terms",
    },
    range: null,
    suggestedRent: null,
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    // A family-only entry saved before row review never reaches the text by itself.
    charges: inputs.charges.map((charge) =>
      charge.id === "rbp"
        ? {
            ...charge,
            applicable: true,
            amount: 30,
            cadence: "monthly" as const,
            effectiveDate: RENEWAL,
            source: "Synthetic earlier entry",
            comparison: "changed" as const,
          }
        : charge,
    ),
    insuranceTransition: null,
    leaseOrigin: { kind: "pmi", source: "Synthetic original lease" },
    otherChargesComparison: { unchanged: true, source: "Synthetic earlier comparison" },
    informationForm: null,
    insuranceFlyer: {
      url: "https://fixture-rental.net/insurance-flyer.pdf",
      source: "Synthetic check",
    },
    rbpFlyer: null,
    signature: {
      name: "Fixture Staff",
      email: "fixture-staff@pmikcmetro.com",
      source: "Fixture signed-in staff",
      role: null,
      phone: null,
      hours: null,
      website: null,
    },
    attachments: [],
    offerCharges: offer.composition,
    resourceDecisions: offer.decisions,
  };
}

function compose(offer: ReturnType<typeof review>) {
  const content = composeRenewalMessage(facts(offer));
  return {
    content,
    reasons: outgoingRenewalReasons({ content, signatureConfigured: true, reply: false }),
  };
}

describe("S264 AC-S264-4 composition from the selected rows", () => {
  it("unchanged compared lines read as the verified statement; a changed line and a case fee are itemized under their headings", () => {
    const same = compose(
      review([line("101", "9001", "45.00"), line("102", "9002", "13.00")]),
    );
    expect(same.content.plainText).toContain(SUPPLIED_RENEWAL_COPY.tenant.unchanged);
    expect(same.content.plainText).not.toContain("Pet rent:");
    expect(same.content.plainText).not.toContain("Resident Benefits Package:");
    expect(same.reasons).toEqual([]);

    const changed = compose(
      review([line("101", "9001", "45.00"), line("102", "9002", "13.00")], {
        ...emptyOfferChargeSelection(),
        decisions: [
          {
            rowKey: "rentvine:101",
            choice: "include",
            reason: null,
            renewalAmountCents: 5000,
            effectiveDate: null,
            correctionSource: "Synthetic signed pet addendum",
            reviewed: { sourceVersion: "v-101", renewalDate: RENEWAL, mappingVersion: 2 },
          },
        ],
        caseEntries: [
          {
            id: uuid(1),
            family: "renewal_processing",
            amountCents: 3500,
            effectiveDate: RENEWAL,
            trigger: "Synthetic: signed after the posted date",
            source: "Synthetic case approval reference",
          },
        ],
      }),
    );
    const text = changed.content.plainText;
    expect(text).toContain(
      [
        SUPPLIED_RENEWAL_COPY.tenant.monthlyHeading,
        "",
        "Pet rent: $50.00 per month, effective 02/01/2027.",
        "",
        SUPPLIED_RENEWAL_COPY.tenant.oneTimeHeading,
        "",
        "Renewal processing fee: $35.00 one time, effective 02/01/2027.",
        "",
        SUPPLIED_RENEWAL_COPY.tenant.unchanged,
      ].join("\n"),
    );
    // The unchanged credit reporting line is covered by the statement, not repeated.
    expect(text).not.toContain("Credit reporting:");
    expect(changed.reasons).toEqual([]);
  });

  it("a line left out, a pending line or a line starting during the renewal withholds the statement", () => {
    const excluded = compose(
      review([line("101", "9001", "45.00"), line("102", "9002", "13.00")], {
        ...emptyOfferChargeSelection(),
        decisions: [
          {
            rowKey: "rentvine:102",
            choice: "exclude",
            reason: "Synthetic: tenant opted out in writing",
            renewalAmountCents: null,
            effectiveDate: null,
            correctionSource: null,
            reviewed: { sourceVersion: "v-102", renewalDate: RENEWAL, mappingVersion: 2 },
          },
        ],
      }),
    );
    expect(excluded.content.plainText).not.toContain(
      SUPPLIED_RENEWAL_COPY.tenant.unchanged,
    );
    expect(excluded.content.plainText).toContain("Pet rent: $45.00 per month");
    const pending = compose(
      review([line("101", "9001", "45.00"), line("103", "9555", "40.00")]),
    );
    expect(pending.content.plainText).not.toContain(
      SUPPLIED_RENEWAL_COPY.tenant.unchanged,
    );
    expect(pending.reasons[0]).toMatch(
      /^Review offer charges: Synthetic account 9555\. No approved offer mapping/,
    );
    expect(
      projectMessageReadiness({
        channel: "tenant",
        missing: pending.content.missing,
      }).items.find((item) =>
        item.message.startsWith("Review offer charges: Synthetic account 9555"),
      )?.target,
    ).toMatchObject({
      kind: "control",
      id: offerChargeRowControlId("rentvine:103"),
      label: "Review offer charges",
    });
    const future = compose(
      review([
        line("101", "9001", "45.00"),
        { ...line("104", "9001", "60.00"), startDate: "2027-06-01" },
      ]),
    );
    expect(future.content.plainText).not.toContain(
      SUPPLIED_RENEWAL_COPY.tenant.unchanged,
    );
  });

  it("a changed non-monthly line keeps its cadence as a named review gap and never reads as monthly", () => {
    // Unchanged, it continues under the compared statement.
    const continuing = compose(review([line("110", "9010", "90.00", "3")]));
    expect(continuing.content.plainText).toContain(
      SUPPLIED_RENEWAL_COPY.tenant.unchanged,
    );
    expect(continuing.reasons).toEqual([]);
    const quarterly = compose(
      review([line("110", "9010", "90.00", "3")], {
        ...emptyOfferChargeSelection(),
        decisions: [
          {
            rowKey: "rentvine:110",
            choice: "include",
            reason: null,
            renewalAmountCents: 9500,
            effectiveDate: null,
            correctionSource: "Synthetic vendor rate notice",
            reviewed: { sourceVersion: "v-110", renewalDate: RENEWAL, mappingVersion: 2 },
          },
        ],
      }),
    );
    expect(quarterly.content.plainText).toContain(
      "Synthetic yard service: $95.00 [Needs Verification: Synthetic yard service every 3 months wording], effective 02/01/2027.",
    );
    expect(quarterly.content.plainText).not.toContain("$95.00 per month");
    expect(quarterly.reasons).toContain(
      "Synthetic yard service is charged every 3 months. The approved wording names monthly and one-time charges only, so review this line before releasing the offer.",
    );
  });
});

describe("S264 AC-S264-7 transition decisions hold the outgoing review", () => {
  const insured = (insurance: OfferChargeSelection["transitions"]["insurance"]) =>
    compose(
      review([line("120", "9003", "12.50")], {
        ...emptyOfferChargeSelection(),
        transitions: { insurance, rbp: null },
      }),
    );

  it("unknown holds the review with its wording and flyer out; the hold opens the transition control", () => {
    const unknown = insured(null);
    expect(unknown.content.plainText).not.toContain(
      SUPPLIED_RENEWAL_COPY.tenant.insuranceChange,
    );
    expect(unknown.reasons).toContain(
      "Choose whether the insurance transition applies to this renewal, with its source, before releasing this offer. Its wording and flyer stay out until then.",
    );
    expect(
      projectMessageReadiness({
        channel: "tenant",
        missing: unknown.content.missing,
      }).items.find((item) => item.field === "offerCharges.insuranceTransition")?.target,
    ).toMatchObject({ kind: "control", id: "renewal-message-tenant-insurance-policy" });
  });

  it("a verified No needs no flyer or wording; a verified Yes carries both", () => {
    const no = insured({
      choice: "does_not_apply",
      source: "Synthetic tenant policy on file",
    });
    expect(no.reasons).toEqual([]);
    expect(no.content.plainText).not.toContain(
      SUPPLIED_RENEWAL_COPY.tenant.insuranceChange,
    );
    const yes = insured({ choice: "applies", source: "Synthetic program enrollment" });
    expect(yes.reasons).toEqual([]);
    expect(yes.content.plainText).toContain(SUPPLIED_RENEWAL_COPY.tenant.insuranceChange);
    expect(yes.content.plainText).toContain(
      "https://fixture-rental.net/insurance-flyer.pdf",
    );
  });
});
