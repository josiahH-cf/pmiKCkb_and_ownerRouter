// S249 review fix H: "Reason to include" carries the guard edited wording carries (no amounts,
// digits, links or email addresses) with the same refusal wording style, and a stored reason that
// fails it never reaches the owner body. Synthetic values only.
import { describe, expect, it } from "vitest";

import {
  composeRenewalMessage,
  MESSAGE_CHARGES,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import { RecommendationReasonSchema } from "@/lib/lease-renewal/renewal-message-preparation";

/** The refusal the reason reads, in the edited wording's style. */
const REFUSAL =
  "Keep amounts, dates, links and contacts out of the reason to include; the message states them in their labeled fact fields.";

// ---- H: "Reason to include" carries the edited wording's guard ----------------------------------

function ownerFacts(overrides: Partial<RenewalMessageFacts> = {}): RenewalMessageFacts {
  return {
    channel: "owner",
    names: ["Example Owner"],
    firstNames: ["Example"],
    address: "100 Sample Street",
    currentBaseRent: { value: 1350, source: "reviewed:base-rent" },
    leaseEndDate: "2026-12-31",
    ownerTerms: null,
    range: { low: 1300, high: 1500, source: "RentCast comparison" },
    suggestedRent: { value: 1425, source: "Example basis", kind: "proposal" },
    comps: [],
    trend: null,
    sparseCompsQualification: null,
    charges: Object.keys(MESSAGE_CHARGES).map((id) => ({
      id: id as keyof typeof MESSAGE_CHARGES,
      applicable: false,
      amount: null,
      cadence: null,
      effectiveDate: null,
      source: "reviewed:charge-inventory",
      comparison: "unchanged" as const,
    })),
    insuranceTransition: null,
    leaseOrigin: { kind: "pmi", source: "reviewed:original-lease" },
    otherChargesComparison: null,
    informationForm: null,
    insuranceFlyer: null,
    rbpFlyer: null,
    signature: {
      name: "Example Staff",
      email: "example-staff@example.invalid",
      role: null,
      phone: null,
      hours: null,
      website: null,
      source: "managed:current-staff",
    },
    attachments: [],
    ...overrides,
  };
}

describe("S249 H: the reason refuses what the edited wording refuses, in the same style", () => {
  it.each([
    ["an amount", "Rents rose to $1,500 nearby"],
    ["a digit", "Rents rose 5 percent this year"],
    ["a link", "See https://example.invalid/market for the trend"],
    ["a bare link", "See www.example.invalid for the trend"],
    ["an email address", "Ask owner@example.invalid about the market"],
  ])("refuses %s with the labeled-fields wording", (_label, reason) => {
    const parsed = RecommendationReasonSchema.safeParse(reason);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(REFUSAL);
  });

  it("keeps a plain one-line reason", () => {
    expect(
      RecommendationReasonSchema.safeParse("Current market conditions").success,
    ).toBe(true);
  });

  it("a stored reason that fails the guard never reaches the owner body, and the callout says what to take out", () => {
    const content = composeRenewalMessage(
      ownerFacts({ recommendationReason: "Call owner@example.invalid about $1,600" }),
    );
    expect(content.plainText).not.toContain("owner@example.invalid");
    expect(content.plainText).not.toContain("$1,600");
    expect(content.missing).toContainEqual({
      field: "recommendationReason",
      message:
        "The reason to include stays out of the message until amounts, dates, links and contacts are taken out of it.",
    });
  });
});
