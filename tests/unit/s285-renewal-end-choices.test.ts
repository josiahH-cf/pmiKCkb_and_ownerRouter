import { describe, expect, it } from "vitest";

import {
  RENEWAL_END_BASIS,
  STANDARD_RENEWAL_TERM_MONTHS,
  chosenEndInconsistency,
  proposeRenewalEnd,
  renewalEndChoices,
  wholeLeaseMonths,
} from "@/lib/lease-renewal/renewal-date-proposal";

// S285 R-S285-1 (ARCH-S285-1, AC-S285-1): the end-date choices staff make. `proposeRenewalEnd` is
// the one end-date calculation, called only with the months a choice states; computing the choices
// saves nothing. Synthetic dates only.

const eligible = {
  term: "fixed_term" as const,
  nonRenewal: false,
  endEmpty: true,
};

describe("AC-S285-1 the end is the day before the same calendar day 12 months later", () => {
  it.each([
    ["2027-01-01", "2027-12-31", "12/31/2027"],
    ["2026-12-01", "2027-11-30", "11/30/2027"],
    ["2027-01-31", "2028-01-30", "01/30/2028"],
    // A leap year in the set: 03/01/2027 + 12 months - 1 day is February 29, 2028.
    ["2027-03-01", "2028-02-29", "02/29/2028"],
    // And a common year: the last day of February is the 28th.
    ["2026-03-01", "2027-02-28", "02/28/2027"],
  ])("ARCH-S285-1: a start of %s offers an end of %s", (startIso, endIso, shown) => {
    const result = renewalEndChoices({ ...eligible, startIso });
    expect(result.state).toBe("choices");
    if (result.state !== "choices") return;
    expect(result.choices).toEqual([
      {
        kind: "standard",
        months: STANDARD_RENEWAL_TERM_MONTHS,
        endIso,
        label: `Use a 12 month term (ends ${shown})`,
        basis: RENEWAL_END_BASIS.standard,
      },
    ]);
    // The one calculation, with the months the choice states.
    expect(
      proposeRenewalEnd(startIso, { months: 12, convention: "inclusive_end" }),
    ).toEqual({ state: "suggested", endIso });
  });

  it("AC-S285-1: a February 29 start offers no choice and shows the enter-the-end line", () => {
    expect(renewalEndChoices({ ...eligible, startIso: "2028-02-29" })).toEqual({
      state: "enter",
      line: "The renewal start falls on a day that does not repeat in the end month. Enter the renewal end date.",
    });
  });
});

describe("AC-S285-1 the current lease's length is a second choice only when it is not 12 months", () => {
  it("R-S285-1: a 6 month current lease adds the second choice", () => {
    const result = renewalEndChoices({
      ...eligible,
      startIso: "2027-01-01",
      currentLease: { startIso: "2026-07-01", endIso: "2026-12-31" },
    });
    expect(result).toMatchObject({
      state: "choices",
      choices: [
        { kind: "standard", endIso: "2027-12-31" },
        {
          kind: "current_length",
          months: 6,
          endIso: "2027-06-30",
          label: "Use the current lease's length, 6 months (ends 06/30/2027)",
          basis: RENEWAL_END_BASIS.currentLength,
        },
      ],
    });
  });

  it("R-S285-1: a 12 month current lease adds no second choice", () => {
    const result = renewalEndChoices({
      ...eligible,
      startIso: "2027-01-01",
      currentLease: { startIso: "2026-01-01", endIso: "2026-12-31" },
    });
    expect(result.state === "choices" ? result.choices.map((c) => c.kind) : []).toEqual([
      "standard",
    ]);
  });

  it("R-S285-1: a current lease that is not a whole number of months adds no second choice", () => {
    expect(wholeLeaseMonths("2026-07-01", "2026-12-15")).toBeNull();
    expect(wholeLeaseMonths("2026-07-01", "2026-12-31")).toBe(6);
    expect(wholeLeaseMonths("2026-01-31", "2026-07-30")).toBe(6);
    expect(wholeLeaseMonths("2026-01-01", "2026-12-31")).toBe(12);
    expect(wholeLeaseMonths(null, "2026-12-31")).toBeNull();
    const result = renewalEndChoices({
      ...eligible,
      startIso: "2027-01-01",
      currentLease: { startIso: "2026-07-01", endIso: "2026-12-15" },
    });
    expect(result.state === "choices" ? result.choices.length : 0).toBe(1);
  });
});

describe("AC-S285-1 who is offered a choice", () => {
  it("R-S285-1: month-to-month, non-renewal, inspection-only, a saved end and no start show no option", () => {
    const start = { startIso: "2027-01-01" };
    expect(renewalEndChoices({ ...eligible, ...start, term: "month_to_month" })).toEqual({
      state: "none",
      reason: "not_fixed_term",
    });
    expect(renewalEndChoices({ ...eligible, ...start, term: "needs_review" })).toEqual({
      state: "none",
      reason: "not_fixed_term",
    });
    expect(renewalEndChoices({ ...eligible, ...start, term: null })).toEqual({
      state: "none",
      reason: "not_fixed_term",
    });
    expect(renewalEndChoices({ ...eligible, ...start, nonRenewal: true })).toEqual({
      state: "none",
      reason: "non_renewal",
    });
    expect(renewalEndChoices({ ...eligible, ...start, endEmpty: false })).toEqual({
      state: "none",
      reason: "end_saved",
    });
    expect(renewalEndChoices({ ...eligible, startIso: null })).toEqual({
      state: "none",
      reason: "no_start",
    });
    expect(renewalEndChoices({ ...eligible, startIso: "2027-02-30" })).toEqual({
      state: "none",
      reason: "no_start",
    });
  });
});

describe("AC-S285-1 a saved end stays when the start changes, and the inconsistency is shown", () => {
  it("R-S285-1 / S263 R-S263-3: an end chosen as a 12 month term that no longer matches the start is named", () => {
    expect(
      chosenEndInconsistency({
        startIso: "2027-01-01",
        endIso: "2027-12-31",
        basis: RENEWAL_END_BASIS.standard,
      }),
    ).toBeNull();
    expect(
      chosenEndInconsistency({
        startIso: "2027-02-01",
        endIso: "2027-12-31",
        basis: RENEWAL_END_BASIS.standard,
      }),
    ).toBe(
      "The saved end date was chosen as a 12 month term and no longer matches the start date. Review the end date.",
    );
    expect(
      chosenEndInconsistency({
        startIso: "2027-02-01",
        endIso: "2027-06-30",
        basis: RENEWAL_END_BASIS.currentLength,
        currentLease: { startIso: "2026-07-01", endIso: "2026-12-31" },
      }),
    ).toBe(
      "The saved end date was chosen as the current lease's length and no longer matches the start date. Review the end date.",
    );
    // A typed end is staff's own; nothing is inferred about it.
    expect(
      chosenEndInconsistency({
        startIso: "2027-02-01",
        endIso: "2027-12-31",
        basis: null,
      }),
    ).toBeNull();
  });
});
