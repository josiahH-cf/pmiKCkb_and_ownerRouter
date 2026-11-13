// S276 R-S276-1 (BEH-S276-1, AC-S276-1): the tenant response review names the response, the offer
// it answers (the working base rent, the renewal dates and the selected charges total from the
// current offer snapshot, or that no offer has been sent from the app yet) and what follows (the
// reminders stop, then the step the path projects). Pure checks on synthetic values.
import { describe, expect, it } from "vitest";

import {
  TENANT_RESPONSE_REVIEW_WORDS,
  describeAnsweredOffer,
  describeOfferTerms,
  describeWhatFollows,
  tenantResponseReview,
} from "@/lib/lease-renewal/tenant-response-review";
import { offerTerms, type OfferAnswersView } from "@/lib/lease-renewal/offer-answers";
import { nextStepWords } from "@/lib/lease-renewal/renewal-stage";
import type { FrozenOfferSnapshot } from "@/lib/lease-renewal/offer-snapshot";

const TERMS = {
  rent: 1450,
  effectiveDate: "2027-01-01",
  endDate: "2027-12-31",
  chargesCents: 3500,
  chargeCount: 2,
};

function view(
  sent: boolean,
  current: OfferAnswersView["current"] = {
    snapshotId: "offer:9276:cycle:aaaa",
    snapshotHash: "a".repeat(64),
    summary: "Rent $1,450.00 per month; Pet rent $35.00 per month",
    charged: true,
    terms: TERMS,
  },
): OfferAnswersView {
  return {
    current,
    candidates: sent
      ? [
          {
            kind: "linked_communication",
            sequenceId: "sequence-1",
            occurrenceId: "occurrence-1",
            at: "2026-11-12T18:00:00.000Z",
            snapshotId: "offer:9276:cycle:aaaa",
            summary: "Rent $1,450.00 per month; Pet rent $35.00 per month",
            current: true,
            terms: TERMS,
          },
        ]
      : [],
    tenant: null,
    owner: null,
    acceptance: null,
  };
}

describe("S276 R-S276-1: the tenant response review", () => {
  it("BEH-S276-1 / AC-S276-1: names the current offer's rent, dates and selected charges total", () => {
    expect(describeOfferTerms(TERMS)).toBe(
      "Rent $1,450.00 per month from 01/01/2027 to 12/31/2027. Selected charges: $35.00 in total.",
    );
    expect(
      tenantResponseReview({
        outcome: "accepted",
        view: view(true),
        nextStep: "Send the renewal information form",
      }),
    ).toEqual({
      response: "Response: Accepted.",
      answers:
        "Answers: Rent $1,450.00 per month from 01/01/2027 to 12/31/2027. Selected charges: $35.00 in total.",
      follows: "Reminders for this offer stop. Next: send the renewal information form.",
    });
  });

  it("AC-S276-1: the summary matches the current offer snapshot's own terms", () => {
    const snapshot = {
      base: { rent: 1450, revision: 2 },
      dates: {
        effectiveDate: "2027-01-01",
        effectiveRevision: 1,
        endDate: "2027-12-31",
        endRevision: 1,
      },
      rows: [{ amountCents: 2500 }, { amountCents: 1000 }],
    } as unknown as FrozenOfferSnapshot["snapshot"];
    expect(offerTerms(snapshot)).toEqual(TERMS);
  });

  it("R-S276-1: with no offer sent from the app the summary says so", () => {
    expect(describeAnsweredOffer(view(false))).toBe(
      "No offer has been sent from the app yet.",
    );
    expect(describeAnsweredOffer(null)).toBe("No offer has been sent from the app yet.");
    expect(describeAnsweredOffer(null, true)).toBe(
      TENANT_RESPONSE_REVIEW_WORDS.offerUnread,
    );
    expect(describeOfferTerms({ ...TERMS, chargeCount: 0, chargesCents: 0 })).toBe(
      "Rent $1,450.00 per month from 01/01/2027 to 12/31/2027. No other charges selected.",
    );
  });

  it("R-S276-1: the next step is the step the path projects, not fixed text", () => {
    expect(nextStepWords("information_form")).toBe("Send the renewal information form");
    expect(nextStepWords("non_renewal_handoff")).toBe("Record the non-renewal handoff");
    expect(
      describeWhatFollows("declined_nonrenewing", nextStepWords("non_renewal_handoff")),
    ).toBe("Reminders for this offer stop. Next: record the non-renewal handoff.");
    expect(describeWhatFollows("counter_change_requested", "Record owner response")).toBe(
      "Reminders for this offer stop. Next: record owner response.",
    );
  });

  it("BEH-S276-5 / R-S276-5: clearing the response says stopped reminders stay stopped", () => {
    expect(describeWhatFollows("awaiting_response", "Record tenant response")).toBe(
      "Reminders that were stopped stay stopped until you resume them in Communications.",
    );
  });
});
