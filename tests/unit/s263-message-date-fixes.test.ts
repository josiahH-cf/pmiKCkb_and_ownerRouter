import { describe, expect, it } from "vitest";

import {
  messageInputTarget,
  projectMessageReadiness,
} from "@/lib/lease-renewal/message-readiness";
import {
  composeRenewalMessage,
  type RenewalMessageFacts,
} from "@/lib/lease-renewal/renewal-message-content";

// S263 R-S263-3/4 (BEH-S263-3, AC-S263-4): in Offer the tenant each missing date names its own
// exact fix, the renewal start before the renewal end, and the current lease end is verified in
// Check the numbers. Only the existing message and readiness projections are read, so the same
// assertions run against the code before this change. Synthetic values only.

const tenant = (overrides: Partial<RenewalMessageFacts> = {}): RenewalMessageFacts => ({
  channel: "tenant",
  names: ["Sam Tenant"],
  firstNames: ["Sam"],
  address: "1 Example St",
  currentBaseRent: null,
  leaseEndDate: "2026-11-30",
  ownerTerms: {
    rent: 1875,
    effectiveDate: null,
    endDate: null,
    source: "Working renewal terms",
  },
  range: null,
  suggestedRent: null,
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
});

const DATE_FIELDS = ["leaseEndDate", "renewalStartDate", "renewalEndDate"];

describe("AC-S263-4 exact date fixes in the tenant offer", () => {
  it("AC-S263-4: a missing start and end open their own fields, start first, with the exact fix names", () => {
    const message = composeRenewalMessage(tenant());
    const readiness = projectMessageReadiness({
      channel: "tenant",
      missing: message.missing,
    });
    const dates = readiness.items.filter((item) => DATE_FIELDS.includes(item.field));
    expect(dates.map((item) => [item.field, item.target])).toEqual([
      [
        "renewalStartDate",
        {
          kind: "control",
          id: "renewal-working-terms-start",
          label: "Enter renewal start date",
        },
      ],
      [
        "renewalEndDate",
        {
          kind: "control",
          id: "renewal-working-terms-end",
          label: "Enter renewal end date",
        },
      ],
    ]);
    // The rent keeps its own entry and target.
    expect(readiness.items.some((item) => item.field === "ownerTerms")).toBe(false);
  });

  it("AC-S263-4: an end that is not after the start points to the end date", () => {
    const message = composeRenewalMessage(
      tenant({
        ownerTerms: {
          rent: 1875,
          effectiveDate: "2026-12-01",
          endDate: "2026-11-30",
          source: "Working renewal terms",
        },
      }),
    );
    expect(message.missing).toContainEqual({
      field: "renewalEndDate",
      message: "The renewal end date is not after the start date.",
    });
  });

  it("AC-S263-4: an unverified lease end holds only the offer's lease-end sentence, fixed by Verify current lease end", () => {
    const message = composeRenewalMessage(
      tenant({
        leaseEndDate: null,
        ownerTerms: {
          rent: 1875,
          effectiveDate: "2026-12-01",
          endDate: "2027-11-30",
          source: "Working renewal terms",
        },
      }),
    );
    expect(message.missing.map((item) => item.field)).toEqual(
      expect.arrayContaining(["leaseEndDate"]),
    );
    expect(messageInputTarget("tenant", "leaseEndDate")).toEqual({
      kind: "control",
      id: "renewal-correct-a-fact",
      label: "Verify current lease end",
    });
    // The working dates themselves still fill the offer.
    expect(message.plainText).toContain("12/01/2026");
    expect(message.plainText).toContain("11/30/2027");
  });
});
