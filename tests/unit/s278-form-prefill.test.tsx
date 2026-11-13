// @vitest-environment jsdom
// S278 R-S278-2 (BEH-S278-3, AC-S278-2): from a Finish up source preview, the action opens the
// owning form with the previewed new value filled in, marked "From the working terms", with focus
// on that input. Opening reads and writes nothing; a changed value previews the changed value.
import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { OperatingSheetPanel } from "@/components/lease-renewal/OperatingSheetPanel";
import { RentvineUpdatesPanel } from "@/components/lease-renewal/RentvineUpdatesPanel";
import {
  FinishUpSourcePreviews,
  finishUpPrefill,
  openFinishUpPreview,
} from "@/components/lease-renewal/RenewalFinishUpPreviews";
import { FROM_WORKING_TERMS } from "@/components/lease-renewal/sourceFormPrefill";
import type { FinishUpPreparation } from "@/lib/lease-renewal/finish-up-preparation";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";

const TERMS = { rent: 1500, effectiveDate: "2027-01-01", endDate: "2027-12-31" };
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const INVENTORY = {
  leaseDates: {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    increaseEligibilityDate: "2026-12-31",
  },
  charges: [],
} as unknown as RenewalChargeInventory;

const FACTS = {
  lease: "101 Sample Pl, lease 9101",
  source: "RentVine, account pmikcmetro, read 11/13/2026",
  target: "Lease renewal dates",
  current: "ends 12/31/2026",
  proposed: "ends 12/31/2027",
  timing: "Lease end date",
  consequence: "Lease start date stays 01/01/2026; no other lease field changes.",
};

describe("S278 R-S278-2: the form opens with the previewed value", () => {
  it("finishUpPrefill names the owning form and value for each preview", () => {
    expect(finishUpPrefill("rentvine-dates", TERMS)).toEqual({
      form: "rentvine_end_date",
      value: "2027-12-31",
    });
    expect(finishUpPrefill("sheet-renewal_date", TERMS)).toEqual({
      form: "sheet_field",
      field: "renewal_date",
      value: "2027-12-31",
    });
    expect(finishUpPrefill("rentvine-rent", TERMS)).toBeNull();
    expect(finishUpPrefill("rentvine-dates", null)).toBeNull();
  });

  it("BEH-S278-3: from the renewal end date preview, the RentVine form opens filled, marked and focused, with its own preview next", async () => {
    render(
      <RentvineUpdatesPanel
        initialHistory={[]}
        initialInventory={INVENTORY}
        initialProposal={null}
        leaseId="9101"
        role="Editor"
      />,
    );
    const input = screen.getByLabelText(/New end date/) as HTMLInputElement;
    expect(input.value).toBe("2026-12-31");
    expect(screen.queryByText(FROM_WORKING_TERMS)).toBeNull();
    act(() => openFinishUpPreview("renewal-rent-and-charges", "rentvine-dates", TERMS));
    await waitFor(() => expect(input.value).toBe("2027-12-31"));
    expect(input).toHaveAccessibleDescription(FROM_WORKING_TERMS);
    await waitFor(() => expect(input).toHaveFocus());
    expect(input.closest("details")).toHaveAttribute("open");
    // AC-S278-2: opening makes no provider call and no write.
    expect(fetchMock).not.toHaveBeenCalled();
    // Its own exact preview follows unchanged.
    expect(
      screen.getByRole("button", { name: "Save proposal from fresh RentVine state" }),
    ).toBeEnabled();
  });

  it("AC-S278-2: the Sheet form opens with the renewal date filled; a changed value previews the changed value", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "proposed", proposal: null }),
    });
    render(
      <OperatingSheetPanel
        association={{ kind: "exact_link", rowNumber: 41 }}
        fieldCells={{ renewal_date: "D41" }}
        initialFieldValues={{ renewal_date: "12/31/2026", renewal_letter_sent: "" }}
        initialProposal={null}
        role="Editor"
        workspaceContext="signed-workspace-context-token"
      />,
    );
    act(() =>
      openFinishUpPreview("renewal-rent-and-charges", "sheet-renewal_date", TERMS),
    );
    const value = (await screen.findByLabelText(/New value/)) as HTMLInputElement;
    await waitFor(() => expect(value.value).toBe("2027-12-31"));
    expect(screen.getByLabelText("Field to update")).toHaveValue("renewal_date");
    expect(value).toHaveAccessibleDescription(FROM_WORKING_TERMS);
    await waitFor(() => expect(value).toHaveFocus());
    expect(fetchMock).not.toHaveBeenCalled();
    // Staff change the value first: the mark goes and the preview carries the changed value.
    fireEvent.change(value, { target: { value: "2027-11-30" } });
    expect(value).not.toHaveAccessibleDescription(FROM_WORKING_TERMS);
    fireEvent.click(screen.getByRole("button", { name: "Preview Sheet field update" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, { body: string }])[1].body,
    );
    expect(body).toMatchObject({
      operation: "propose",
      intent: "update_field",
      fieldIntent: { field: "renewal_date", value: "2027-11-30" },
    });
  });

  it("R-S278-2: each Finish up preview offers its own action and showing them sends nothing", () => {
    const preparation: FinishUpPreparation = {
      terms: TERMS,
      termsMissing: [],
      applyTarget: "renewal-rent-and-charges",
      rentvine: {
        state: "ready",
        previews: [
          { key: "rentvine-dates", title: "RentVine lease end date", facts: FACTS },
        ],
        notes: [],
      },
      sheet: {
        state: "ready",
        previews: [
          {
            key: "sheet-renewal_date",
            title: "Operating Sheet renewal date",
            facts: {
              ...FACTS,
              source: "Operating renewal Sheet",
              target: "Renewal date",
            },
          },
        ],
        notes: [],
      },
    };
    render(<FinishUpSourcePreviews preparation={preparation} />);
    expect(
      document.querySelector('[data-renewal-finish-up-apply="rentvine-dates"]'),
    ).toHaveTextContent("Review and apply in Rent and charges");
    expect(
      document.querySelector('[data-renewal-finish-up-apply="sheet-renewal_date"]'),
    ).toHaveTextContent("Review and apply in Rent and charges");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
