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
