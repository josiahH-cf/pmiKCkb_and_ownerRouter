// @vitest-environment jsdom
// S251 R-S251-6: "Keep the current rent" sets the working rent to the current rent as a recorded
// staff choice. A different working rent staff already saved is never replaced silently: the
// control asks first (replace it, or keep the saved one). The assisted controls are listed in
// the renewal control inventory with the capability their routes enforce. Synthetic values only.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const manual = {
  leaseId: "9103",
  pending: false,
  state: { rentChoice: null, ownerResponse: null } as Record<string, unknown>,
  record: vi.fn(async () => undefined),
};
const working = {
  record: null as unknown,
  save: vi.fn(async () => true),
};

vi.mock("@/components/lease-renewal/RenewalManualWorkspace", () => ({
  useRenewalManualWorkspace: () => manual,
}));
vi.mock("@/components/lease-renewal/RenewalWorkingRecord", () => ({
  useRenewalWorkingRecord: () => working,
}));

import {
  AssistedRenewalControls,
  keepCurrentRentReplaces,
} from "@/components/lease-renewal/RenewalHousingAssistance";
import { RENEWAL_CONTROL_INVENTORY } from "@/lib/lease-renewal/role-action-governance";

function savedRent(rent: number) {
  return {
    fields: {
      terms_rent: {
        value: rent,
        revision: 1,
        recordedAt: "2026-11-01T15:00:00.000Z",
        recordedByLabel: "Sample Staff",
      },
    },
  };
}

function keepCurrent() {
  fireEvent.click(screen.getByRole("radio", { name: "Keep the current rent" }));
  fireEvent.click(screen.getByRole("button", { name: "Record the rent choice" }));
}

beforeEach(() => {
  manual.record.mockClear();
  working.save.mockClear();
  working.record = null;
});
afterEach(() => cleanup());

describe("S251 R-S251-6: Keep the current rent asks before replacing a saved working rent", () => {
  it("replaces only a different, saved working rent", () => {
    expect(keepCurrentRentReplaces(null, 1500)).toBe(false);
    expect(keepCurrentRentReplaces(1500, 1500)).toBe(false);
    expect(keepCurrentRentReplaces(1500.004, 1500)).toBe(false);
    expect(keepCurrentRentReplaces(1600, 1500)).toBe(true);
    expect(keepCurrentRentReplaces(1600, null)).toBe(false);
    expect(keepCurrentRentReplaces(1600, 0)).toBe(false);
  });

  it("with no saved working rent, records the choice and sets the working rent", async () => {
    render(<AssistedRenewalControls currentRent={1500} />);
    keepCurrent();
    await waitFor(() => expect(working.save).toHaveBeenCalledTimes(1));
    expect(manual.record).toHaveBeenCalledWith({
      kind: "rent_choice",
      choice: "keep_current",
    });
    expect(working.save).toHaveBeenCalledWith("terms_rent", 1500, {
      origin: "adopted_source",
      sourceLabel: "RentVine contractual base rent",
      context: "Keep the current rent",
    });
    expect(
      screen.queryByRole("group", { name: "Replace the saved working rent?" }),
    ).toBeNull();
  });

  it("with a different saved working rent, asks first and saves nothing until staff choose", async () => {
    working.record = savedRent(1600);
    render(<AssistedRenewalControls currentRent={1500} />);
    keepCurrent();
    const ask = await screen.findByRole("group", {
      name: "Replace the saved working rent?",
    });
    expect(ask.textContent).toContain("$1,600.00");
    expect(ask.textContent).toContain("$1,500.00");
    expect(manual.record).not.toHaveBeenCalled();
    expect(working.save).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Replace it with the current rent" }),
    );
    await waitFor(() => expect(working.save).toHaveBeenCalledTimes(1));
    expect(manual.record).toHaveBeenCalledTimes(1);
    expect(working.save).toHaveBeenCalledWith("terms_rent", 1500, expect.anything());
  });

  it("keeping the saved working rent records the choice and leaves the rent as saved", async () => {
    working.record = savedRent(1600);
    render(<AssistedRenewalControls currentRent={1500} />);
    keepCurrent();
    fireEvent.click(
      await screen.findByRole("button", { name: "Keep the saved working rent" }),
    );
    await waitFor(() => expect(manual.record).toHaveBeenCalledTimes(1));
    expect(working.save).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain(
      "The working rent you saved stays as it is",
    );
  });

  it("choosing Propose a change instead closes the question", async () => {
    working.record = savedRent(1600);
    render(<AssistedRenewalControls currentRent={1500} />);
    keepCurrent();
    await screen.findByRole("group", { name: "Replace the saved working rent?" });
    fireEvent.click(screen.getByRole("radio", { name: "Propose a change" }));
    expect(
      screen.queryByRole("group", { name: "Replace the saved working rent?" }),
    ).toBeNull();
  });
});

describe("S251: the assisted controls are in the renewal control inventory", () => {
  it.each([
    ["Save the Housing assistance field", "save_working_record", "working-record"],
    [
      "Record the owner's answer on renewing an assisted lease",
      "save_renewal_progress",
      "workspace",
    ],
    [
      "Record the rent choice for an assisted lease",
      "save_renewal_progress",
      "workspace",
    ],
    [
      "Set the working rent to the current rent when keeping it",
      "save_working_record",
      "working-record",
    ],
  ])("%s", (control, capability, route) => {
    const entry = RENEWAL_CONTROL_INVENTORY.find((row) => row.control === control);
    expect(entry).toMatchObject({
      source: "components/lease-renewal/RenewalHousingAssistance.tsx",
      capability,
      enforcementSources: [`app/api/lease-renewal/${route}/route.ts`],
    });
  });
});
