import { describe, expect, it } from "vitest";

import {
  composeRenewalMessage,
  MESSAGE_CHARGES,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";
import {
  messageRevisionLabel,
  messageRevisionOf,
} from "@/lib/lease-renewal/message-revision";
import { RecommendationReasonSchema } from "@/lib/lease-renewal/renewal-message-preparation";
import {
  KICKOFF_FIX_TARGETS,
  projectRenewalPreparation,
  sendReady,
  withLiveKickoff,
  type RenewalKickoffFacts,
} from "@/lib/lease-renewal/renewal-preparation";

// S249 ARCH-S249-2, R-S249-6, R-S249-7, R-S249-9, R-S249-10, R-S249-11: the one message record.
// Synthetic fixture values only.

const INTERNAL_SENTENCE = "The working offer remains a staff decision";

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
    suggestedRent: null,
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

describe("S249 R-S249-10: owner wording", () => {
  const kinds = ["working_offer", "provider_reference", "reviewed", "proposal"] as const;
  it.each(kinds)(
    "an owner body with a %s figure never carries internal working language",
    (kind) => {
      const body = composeRenewalMessage(
        ownerFacts({ suggestedRent: { value: 1425, source: "Example basis", kind } }),
      ).plainText;
      expect(body).not.toContain(INTERNAL_SENTENCE);
      expect(body).not.toContain("working renewal offer");
    },
  );

  it("a staff recommendation uses the approved suggestion wording", () => {
    for (const kind of ["working_offer", "reviewed", "proposal"] as const) {
      const body = composeRenewalMessage(
        ownerFacts({ suggestedRent: { value: 1425, source: "Example basis", kind } }),
      ).plainText;
      expect(body).toContain(
        "Our reviewed rental analysis suggests $1,425.00 per month.",
      );
    }
  });

  it("a provider estimate on its own is reference context and names no rent to the owner", () => {
    const body = composeRenewalMessage(
      ownerFacts({
        suggestedRent: {
          value: 1475,
          source: "RentCast reference",
          kind: "provider_reference",
        },
      }),
    ).plainText;
    expect(body).not.toContain("$1,475.00");
  });
});

describe("S249 R-S249-6: Reason to include", () => {
  it("is placed beside the recommendation exactly as typed", () => {
    const reason = "Current market conditions in the Northland support this figure.";
    const body = composeRenewalMessage(
      ownerFacts({
        suggestedRent: { value: 1425, source: "Example basis", kind: "proposal" },
        recommendationReason: reason,
      }),
    ).plainText;
    expect(body).toContain(
      `Our reviewed rental analysis suggests $1,425.00 per month. ${reason}`,
    );
  });

  it("is absent from the message when there is no recommendation to sit beside", () => {
    const body = composeRenewalMessage(
      ownerFacts({ recommendationReason: "Current market conditions" }),
    ).plainText;
    expect(body).not.toContain("Current market conditions");
  });

  it("accepts one plain line and refuses template tokens and control characters", () => {
    expect(
      RecommendationReasonSchema.safeParse("Current market conditions").success,
    ).toBe(true);
    expect(RecommendationReasonSchema.safeParse("Rent {{current_rent}}").success).toBe(
      false,
    );
    expect(RecommendationReasonSchema.safeParse("Two\nlines").success).toBe(false);
    expect(RecommendationReasonSchema.safeParse("x".repeat(301)).success).toBe(false);
  });
});

describe("S249 ARCH-S249-2 / R-S249-9: the message revision", () => {
  const message = {
    subject: "Renewal for 100 Sample Street",
    body: "Hello\n\nRent text.",
  };

  it("is the same for the same subject and body, wherever it is computed", () => {
    expect(messageRevisionOf(message)).toBe(messageRevisionOf({ ...message }));
    expect(messageRevisionOf(message)).toMatch(/^[a-f0-9]{12}$/);
    // Line endings and trailing spaces are not wording.
    expect(
      messageRevisionOf({ subject: message.subject, body: "Hello  \r\n\r\nRent text." }),
    ).toBe(messageRevisionOf(message));
  });

  it("changes when the rent, the reason or the wording changes", () => {
    const base = ownerFacts({
      suggestedRent: { value: 1425, source: "Example basis", kind: "proposal" },
    });
    const revision = (facts: RenewalMessageFacts) => {
      const content = composeRenewalMessage(facts);
      return messageRevisionOf({ subject: content.subject, body: content.plainText });
    };
    const first = revision(base);
    const lowered = revision({
      ...base,
      suggestedRent: { value: 1400, source: "Example basis", kind: "proposal" },
    });
    const reasoned = revision({
      ...base,
      recommendationReason: "Current market conditions",
    });
    expect(new Set([first, lowered, reasoned]).size).toBe(3);
    // A Gmail draft made from the first revision reads older than either later one.
    expect(lowered).not.toBe(first);
  });

  it("reads as a six character code", () => {
    expect(messageRevisionLabel("0a1b2c3d4e5f")).toBe("0A1B2C");
  });
});

function kickoffFacts(overrides: Partial<RenewalKickoffFacts> = {}): RenewalKickoffFacts {
  return {
    numbers: {
      contractualRent: 1350,
      rentCharges: [1350],
      leaseEndIso: "2026-12-31",
      workingRent: null,
      sheetRent: null,
      sheetEndIso: null,
      sourceReadable: true,
    },
    comparison: {
      state: "stored",
      comparison: {
        observationId: "observation-1",
        observedAtIso: "2026-11-04T15:00:00.000Z",
        source: "RentCast",
        rangeLow: 1300,
        rangeHigh: 1500,
        compCount: 3,
        comps: [
          { rent: 1380, distanceMiles: 0.4 },
          { rent: 1420, distanceMiles: 0.6 },
          { rent: 1460, distanceMiles: 0.9 },
        ],
      },
    },
    typedRent: null,
    agreementRent: null,
    currentRent: 1350,
    address: "100 Sample Street",
    ownerRecipient: { state: "ready" },
    signature: false,
    templateApproved: true,
    ...overrides,
  };
}

describe("S249 R-S249-11: readiness on the Now card", () => {
  it("names the missing signature with its fix in place, and is ready once it is set up", () => {
    const preparation = projectRenewalPreparation(kickoffFacts());
    expect(sendReady(preparation)).toBe(false);
    const signature = preparation.items.find((item) => item.key === "signature");
    expect(signature?.missing).toBe("your signature");
    expect(signature?.fix?.target).toBe(KICKOFF_FIX_TARGETS.signature);
    expect(sendReady(withLiveKickoff(preparation, { signature: true }))).toBe(true);
  });

  it("names the values the live message still marks, and a typed rent wins over the proposal", () => {
    const preparation = projectRenewalPreparation(kickoffFacts({ signature: true }));
    const live = withLiveKickoff(preparation, {
      marked: ["Response request date"],
      typedRent: 1410,
    });
    expect(live.items.find((item) => item.key === "marked_values")?.missing).toBe(
      "Response request date",
    );
    expect(live.rent).toMatchObject({ value: 1410, origin: "typed" });
    expect(sendReady(live)).toBe(false);
    expect(sendReady(withLiveKickoff(preparation, { marked: [] }))).toBe(true);
  });

  it("a lease with no rent to recommend is asked for one before Send", () => {
    const preparation = projectRenewalPreparation(
      kickoffFacts({ comparison: { state: "none" }, signature: true }),
    );
    const rent = preparation.items.find((item) => item.key === "rent");
    expect(rent?.ready).toBe(false);
    expect(rent?.fix?.target).toBe(KICKOFF_FIX_TARGETS.rentToRecommend);
    expect(sendReady(preparation)).toBe(false);
  });
});
