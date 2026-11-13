// S274 ARCH-S274-3 / AC-S274-4: the typed list of changed inputs a refusal at confirm and a hold
// at the due time carry, and the one staff wording derived from it. One change per input kind the
// review displays: a recipient, the sender signature, the rent to recommend, a working date and an
// applicable charge, each named with both values. Synthetic values only.
import { describe, expect, it } from "vitest";
import {
  LEASE_READ_NOT_SETTLED_MESSAGE,
  LEASE_READ_REREAD_WAITS_MS,
  LeaseReadNotSettledError,
  CommunicationTargetChangedError,
  SOURCE_FACTS_INPUT,
  TARGET_CHANGED_LEAD,
  changedInputLine,
  changedInputLines,
  changedReviewedInputs,
  formatReviewedDate,
  formatReviewedMoney,
  reviewedInput,
  targetChangedMessage,
  type ReviewedInput,
} from "@/lib/gmail-hub/reviewed-inputs";
import { renewalReviewedInputs } from "@/lib/gmail-hub/renewal-reviewed-inputs";
import type { RenewalMessageFacts } from "@/lib/lease-renewal/renewal-message-content";

function facts(overrides: Partial<RenewalMessageFacts> = {}): RenewalMessageFacts {
  return {
    outgoingContract: true,
    channel: "owner",
    ownerIntent: "recommend_rent",
    signatureConfigured: true,
    names: ["Example Owner"],
    firstNames: ["Example"],
    address: "100 Sample Street",
    currentBaseRent: { value: 1350, source: "Current rent" },
    leaseEndDate: "2026-12-31",
    ownerTerms: null,
    range: { low: 1300, high: 1500, source: "RentCast" },
    suggestedRent: { value: 1400, source: "Comparison", kind: "proposal" },
    recommendationReason: null,
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    charges: [],
    insuranceTransition: null,
    leaseOrigin: null,
    otherChargesComparison: null,
    informationForm: null,
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: null,
    attachments: [],
    ...overrides,
  } as RenewalMessageFacts;
}

function owner(
  overrides: Partial<Parameters<typeof renewalReviewedInputs>[0]> = {},
): ReviewedInput[] {
  return renewalReviewedInputs({
    channel: "owner",
    reply: false,
    to: ["owner@example.invalid"],
    cc: [],
    signature: {
      name: "Example Staff",
      role: "Leasing",
      phone: null,
      hours: null,
      website: null,
    },
    signatureSetup: {
      uid: "staff",
      email: "staff@pmikcmetro.com",
      revision: 1,
      contentHash: "a".repeat(64),
      choice: "filled",
    },
    facts: facts(),
    publication: { name: "Renewal owner v2.0", contentHash: "b".repeat(64) },
    offerSnapshotHash: null,
    notice: { scopeHash: "c".repeat(64), semanticHash: "d".repeat(64) },
    dispositionRevision: 0,
    blockers: [],
    ...overrides,
  });
}

function tenant(
  overrides: Partial<Parameters<typeof renewalReviewedInputs>[0]> = {},
  factOverrides: Partial<RenewalMessageFacts> = {},
): ReviewedInput[] {
  return owner({
    channel: "tenant",
    to: ["tenant@example.invalid"],
    facts: facts({
      channel: "tenant",
      ownerIntent: undefined,
      ownerTerms: {
        rent: 1425,
        effectiveDate: "2027-01-01",
        endDate: "2027-12-31",
        source: "Working renewal terms",
      },
      charges: [
        {
          id: "pet",
          applicable: true,
          amount: 25,
          cadence: "monthly",
          effectiveDate: "2027-01-01",
          source: "Staff",
        },
      ],
      insuranceTransition: { applicable: false, source: "Staff" },
      ...factOverrides,
    }),
    ...overrides,
  });
}

describe("S274 ARCH-S274-3: the changed-input list and its wording", () => {
  it("formats money and dates the way the review shows them", () => {
    expect(formatReviewedMoney(1425)).toBe("$1,425.00");
    expect(formatReviewedMoney(1400.5)).toBe("$1,400.50");
    expect(formatReviewedMoney(null)).toBeNull();
    expect(formatReviewedDate("2027-12-31")).toBe("12/31/2027");
    expect(formatReviewedDate(null)).toBeNull();
  });

  it("an unchanged review lists nothing", () => {
    expect(changedReviewedInputs(owner(), owner())).toEqual([]);
  });

  it("AC-S274-4: a recipient change names To with both values", () => {
    const changes = changedReviewedInputs(
      owner(),
      owner({ to: ["new@example.invalid"] }),
    );
    expect(changes).toEqual([
      {
        key: "to",
        label: "To",
        previous: "owner@example.invalid",
        current: "new@example.invalid",
      },
    ]);
    expect(changedInputLine(changes[0]!)).toBe(
      "To: was owner@example.invalid, now new@example.invalid",
    );
  });

  it("AC-S274-4: a signature change names the sender signature with both values", () => {
    const changes = changedReviewedInputs(
      owner(),
      owner({
        signature: {
          name: "Example Staff",
          role: "Leasing manager",
          phone: null,
          hours: null,
          website: null,
        },
        signatureSetup: {
          uid: "staff",
          email: "staff@pmikcmetro.com",
          revision: 2,
          contentHash: "e".repeat(64),
          choice: "filled",
        },
      }),
    );
    expect(changes.map(changedInputLine)).toEqual([
      "Sender signature: was Example Staff, Leasing, now Example Staff, Leasing manager",
    ]);
  });

  it("AC-S274-4 / BEH-S274-2: a rent to recommend change reads with both values", () => {
    const changes = changedReviewedInputs(
      owner(),
      owner({
        facts: facts({
          suggestedRent: { value: 1425, source: "Comparison", kind: "proposal" },
        }),
      }),
    );
    expect(changes.map(changedInputLine)).toEqual([
      "Rent to recommend: was $1,400.00, now $1,425.00",
    ]);
  });

  it("AC-S274-4: a working date change on the tenant offer names that date", () => {
    const changes = changedReviewedInputs(
      tenant(),
      tenant(
        {},
        {
          ownerTerms: {
            rent: 1425,
            effectiveDate: "2027-01-01",
            endDate: "2027-06-30",
            source: "Working renewal terms",
          },
        },
      ),
    );
    expect(changes.map(changedInputLine)).toEqual([
      "Renewal end date: was 12/31/2027, now 06/30/2027",
    ]);
  });

  it("AC-S274-4: an applicable charge change names the charge with both values", () => {
    const changes = changedReviewedInputs(
      tenant(),
      tenant(
        {},
        {
          charges: [
            {
              id: "pet",
              applicable: true,
              amount: 35,
              cadence: "monthly",
              effectiveDate: "2027-01-01",
              source: "Staff",
            },
          ],
        },
      ),
    );
    expect(changes.map(changedInputLine)).toEqual([
      "Pet rent: was $25.00, per month, effective 01/01/2027, now $35.00, per month, effective 01/01/2027",
    ]);
  });

  it("a new hold is named by its text; a notice change is named without values", () => {
    const hold =
      "This cycle is retired. Restore it to renewals before preparing or releasing a message.";
    const changes = changedReviewedInputs(
      owner(),
      owner({
        notice: { scopeHash: "c".repeat(64), semanticHash: "f".repeat(64) },
        blockers: [hold],
      }),
    );
    expect(changes.map(changedInputLine)).toEqual([
      "Notice status changed",
      `New hold: ${hold}`,
    ]);
  });

  it("an input no longer present reads as not set; one newly present reads as was not set", () => {
    const removed = changedReviewedInputs(tenant(), tenant({}, { charges: [] })).map(
      changedInputLine,
    );
    expect(removed).toEqual([
      "Pet rent: was $25.00, per month, effective 01/01/2027, now not set",
    ]);
    expect(
      changedInputLine({
        key: "x",
        label: "Cc",
        previous: null,
        current: "a@example.invalid",
      }),
    ).toBe("Cc: was not set, now a@example.invalid");
  });

  it("without the reviewed list nothing narrower than the source is named", () => {
    expect(changedReviewedInputs(null, owner())).toEqual([]);
    expect(changedInputLines([])).toEqual(["Lease or recipient facts changed"]);
    expect(new CommunicationTargetChangedError([]).changes).toEqual([SOURCE_FACTS_INPUT]);
  });

  it("R-S274-5: the refusal text keeps the earlier lead and lists each change", () => {
    const message = targetChangedMessage([
      {
        key: "rentToRecommend",
        label: "Rent to recommend",
        previous: "$1,400.00",
        current: "$1,425.00",
      },
    ]);
    expect(message).toBe(
      `${TARGET_CHANGED_LEAD} Rent to recommend: was $1,400.00, now $1,425.00. Review the current message before Send or Schedule.`,
    );
  });

  it("R-S274-3: the still-reading result is typed, retryable and says nothing was sent", () => {
    const error = new LeaseReadNotSettledError("generation_not_ready");
    expect(error.code).toBe("lease_read_not_settled");
    expect(error.retryable).toBe(true);
    expect(error.status).toBe(409);
    expect(error.message).toBe(LEASE_READ_NOT_SETTLED_MESSAGE);
    expect(LEASE_READ_NOT_SETTLED_MESSAGE).toBe(
      "The lease is being re-read. Nothing was sent. Try again in a moment.",
    );
  });

  it("R-S274-1: the bound is three re-reads over about ten seconds", () => {
    expect(LEASE_READ_REREAD_WAITS_MS).toHaveLength(3);
    expect(
      LEASE_READ_REREAD_WAITS_MS.reduce((sum, ms) => sum + ms, 0),
    ).toBeLessThanOrEqual(10_000);
  });

  it("a reviewed input never carries an undefined member (stored records refuse them)", () => {
    const input = reviewedInput("to", "To", undefined);
    expect(input).toEqual({ key: "to", label: "To", value: null });
    expect(Object.values(owner()).flatMap((entry) => Object.values(entry))).not.toContain(
      undefined,
    );
  });

  it("a linked reply lists no lease content", () => {
    const keys = owner({ reply: true }).map((entry) => entry.key);
    expect(keys).toEqual(["to", "cc", "signature", "notice", "retirement"]);
  });
});
