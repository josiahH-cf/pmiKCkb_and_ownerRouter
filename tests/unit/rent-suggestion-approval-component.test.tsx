// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RentSuggestionApproval,
  type RentSuggestionData,
} from "@/components/lease-renewal/RentSuggestionApproval";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => cleanup());

const SUGGESTED: RentSuggestionData = {
  suggestion: {
    // Two comps so the median (2350) is distinct from every comp value (no ambiguous text match).
    suggestedRent: 2350,
    status: "suggested",
    comps: [
      { rent: 2200, source: "Zillow low" },
      { rent: 2500, source: "Zillow high" },
    ],
    rationale: "Median of 2 comparable rents ($2,200, $2,500) is $2,350.",
  },
  approval: null,
  canApprove: true,
};

const NEEDS_VERIFICATION: RentSuggestionData = {
  suggestion: {
    suggestedRent: null,
    status: "needs_verification",
    comps: [],
    rationale: "No comparable rents are available, so the number needs verification.",
  },
  approval: null,
  canApprove: true,
};

describe("RentSuggestionApproval (AC-S29-6)", () => {
  it("shows the number ALWAYS beside its comp sources", () => {
    render(<RentSuggestionApproval initialData={SUGGESTED} leaseId="5001" />);
    // The number is present...
    expect(screen.getByText("$2,350")).toBeInTheDocument();
    // ...and so is its comp source list.
    expect(screen.getByText("Zillow low")).toBeInTheDocument();
    expect(screen.getByText("Zillow high")).toBeInTheDocument();
    expect(screen.getByText(/Comparable rents/)).toBeInTheDocument();
  });

  it("shows the Admin approve/return control when the caller can approve", () => {
    render(<RentSuggestionApproval initialData={SUGGESTED} leaseId="5001" />);
    expect(
      screen.getByRole("button", { name: /Approve this number/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Return for revision/ }),
    ).toBeInTheDocument();
  });

  it("hides the approve control from a non-Admin (read-only)", () => {
    render(
      <RentSuggestionApproval
        initialData={{ ...SUGGESTED, canApprove: false }}
        leaseId="5001"
      />,
    );
    // The number and its comps still render read-only...
    expect(screen.getByText("$2,350")).toBeInTheDocument();
    expect(screen.getByText("Zillow low")).toBeInTheDocument();
    // ...but there is no approve/return affordance.
    expect(screen.queryByRole("button", { name: /Approve this number/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Return for revision/ })).toBeNull();
    expect(screen.getByText(/Only an Admin can approve/)).toBeInTheDocument();
  });

  it("renders Needs Verification with NO number and NO approve control when comps are absent", () => {
    render(<RentSuggestionApproval initialData={NEEDS_VERIFICATION} leaseId="5001" />);
    expect(screen.getByText("Needs Verification")).toBeInTheDocument();
    // No dollar figure anywhere.
    expect(screen.queryByText(/\$\d/)).toBeNull();
    // No approve control even though canApprove is true, because there is no number to approve.
    expect(screen.queryByRole("button", { name: /Approve this number/ })).toBeNull();
  });
});

// S62: the owner-policy label and the precedence rendering (AC-S62-2, AC-S62-6).
describe("owner-policy suggestion rendering (S62)", () => {
  it("names the policy in the label and keeps the comp median visible beside it", () => {
    render(
      <RentSuggestionApproval
        initialData={{
          suggestion: {
            suggestedRent: 1449,
            status: "suggested",
            method: "owner_policy_percent",
            comps: [
              {
                rent: 1449,
                source: "Owner policy: +3.5% (portfolio 27)",
                label: "MKD standing agreement.",
              },
            ],
            rationale:
              "Owner policy: +3.5% (portfolio 27): $1,400 current rent plus 3.5% is $1,449.",
            context: { compMedian: 1520 },
          },
          approval: null,
          canApprove: true,
        }}
        leaseId="L-27"
      />,
    );
    // AC-S62-2: the label names the policy, not a comp-derived phrasing (it appears both as
    // the comp source and inside the rationale, so match all).
    expect(
      screen.getAllByText(/Owner policy: \+3\.5% \(portfolio 27\)/).length,
    ).toBeGreaterThanOrEqual(1);
    // AC-S62-6: the comp median stays visible beside the rule-proposed number.
    expect(screen.getByText(/comp median for this lease is \$1,520/)).toBeInTheDocument();
    expect(screen.getByText(/nothing is hidden/)).toBeInTheDocument();
  });

  it("renders no comparison line for a plain comp-median suggestion", () => {
    render(
      <RentSuggestionApproval
        initialData={{
          suggestion: {
            suggestedRent: 2300,
            status: "suggested",
            method: "comp_median",
            comps: [{ rent: 2300, source: "PMI rental analysis" }],
            rationale: "Median of 1 comparable rent ($2,300) is $2,300.",
          },
          approval: null,
          canApprove: false,
        }}
        leaseId="L-99"
      />,
    );
    expect(screen.queryByText(/comp median for this lease/)).not.toBeInTheDocument();
  });
});
