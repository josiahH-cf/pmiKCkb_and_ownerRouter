// @vitest-environment jsdom

// S249 review fix A (R-S249-14 second half / BEH-S249-6 / L42): Finish up shows the RentVine and
// operating Sheet update previews assembled from the final working terms, each with its own apply
// control, and showing them sends nothing. Synthetic values only.
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/lease-renewal/RenewalWorkingRecord", () => ({
  useRenewalWorkingRecord: () => null,
}));

import { FinishUpSourcePreviews } from "@/components/lease-renewal/RenewalFinishUpPreviews";
import type { FinishUpPreparation } from "@/lib/lease-renewal/finish-up-preparation";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ---- A: Finish up shows the assembled previews and writes nothing --------------------------------

describe("S249 A: Finish up's source update previews", () => {
  const facts = {
    lease: "101 Sample Pl, lease 9101",
    source: "RentVine, account pmikcmetro, read 11/05/2026",
    target: "Lease renewal dates",
    current: "ends 12/31/2026",
    proposed: "ends 12/31/2027",
    timing: "Lease end date",
    consequence: "Lease start date stays 01/01/2026; no other lease field changes.",
  };
  const preparation: FinishUpPreparation = {
    terms: { rent: 1420, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
    termsMissing: [],
    applyTarget: "renewal-rent-and-charges",
    rentvine: {
      state: "ready",
      previews: [{ key: "rentvine-dates", title: "RentVine lease end date", facts }],
      notes: [],
    },
    sheet: {
      state: "ready",
      previews: [
        {
          key: "sheet-renewal_date",
          title: "Operating Sheet renewal date",
          facts: { ...facts, source: "Operating renewal Sheet", target: "Renewal date" },
        },
      ],
      notes: ["The Sheet current rent changes when the renewal rent starts"],
    },
  };

  it("shows each exact preview with its own apply control and sends nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<FinishUpSourcePreviews preparation={preparation} />);
    expect(
      screen.getByRole("region", { name: "RentVine update preview" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Operating Sheet update preview" }),
    ).toBeInTheDocument();
    expect(screen.getAllByLabelText("Exact update preview")).toHaveLength(2);
    expect(
      screen.getAllByRole("button", { name: "Review and apply in Rent and charges" }),
    ).toHaveLength(2);
    expect(
      screen.getByText(/Final working terms: \$1,420\.00 per month/),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("before the terms are final it names what they still need", () => {
    render(
      <FinishUpSourcePreviews
        preparation={{
          terms: null,
          termsMissing: ["the effective date"],
          rentvine: null,
          sheet: null,
          applyTarget: "renewal-rent-and-charges",
        }}
      />,
    );
    expect(
      screen.getByText(/Enter the effective date in Working renewal terms/),
    ).toBeInTheDocument();
  });
});
