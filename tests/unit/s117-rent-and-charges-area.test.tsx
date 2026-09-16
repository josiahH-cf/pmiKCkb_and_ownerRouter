// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { RenewalCorrections } from "@/components/lease-renewal/RenewalCorrections";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import type {
  RenewalChargeInventory,
  RenewalChargeOption,
} from "@/lib/lease-renewal/writeback/charge-inventory-model";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

afterEach(cleanup);

function charge(
  id: string,
  overrides: Omit<Partial<RenewalChargeOption>, "projection"> & {
    projection?: Partial<RenewalChargeOption["projection"]>;
  } = {},
): RenewalChargeOption {
  const { projection, ...rest } = overrides;
  return {
    id,
    accountId: "9",
    accountLabel: "Rent account",
    classification: "rent",
    current: true,
    ...rest,
    projection: {
      leaseRecurringChargeID: id,
      leaseID: "4821",
      accountID: "9",
      amount: "1180.00",
      description: "Rent",
      dayDue: "1",
      frequency: "1",
      startDate: "2026-01-01",
      endDate: null,
      nextChargeDate: "2026-10-01",
      isMoveInCharge: "0",
      isFromImport: "0",
      rentIncreaseID: null,
      importSourceKey: null,
      recurringStatusID: 1,
      ...projection,
    },
  };
}

const inventory: RenewalChargeInventory = {
  leaseId: "4821",
  asOfDate: "2026-09-16",
  leaseDates: {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    increaseEligibilityDate: null,
  },
  charges: [
    charge("301"),
    charge("303", {
      accountLabel: null,
      current: false,
      projection: {
        amount: "1300.00",
        startDate: "2027-01-01",
        endDate: "2027-12-31",
        recurringStatusID: 2,
        description: "Future rent",
      },
    }),
    charge("302", {
      accountId: "12",
      accountLabel: null,
      classification: "non_rent",
      projection: { accountID: "12", amount: "35.00", description: "Rent" },
    }),
  ],
};

const rows: RentChargeOutcomeRow[] = [
  {
    id: "rentvine:b",
    destination: "rentvine",
    intent: "current",
    label: "RentVine recurring charge update",
    state: "mismatch",
    stateLabel: "Charge applied; lease base rent still differs",
    detail:
      "Charge applied at 1300.00; the lease's contractual base rent still reads 1180.00. Review the lease in RentVine and refresh this lease before relying on the rent shown.",
    anchor: "#rentvine-updates-title",
    attention: true,
  },
  {
    id: "sheet:d",
    destination: "sheet",
    intent: "current",
    label: "Sheet Renewal date",
    state: "prepared",
    stateLabel: "Prepared, awaiting Admin confirmation",
    detail: "Row 41: 2026-12-31 to 2027-01-31.",
    anchor: "#operating-sheet-title",
    attention: false,
  },
];

function renderArea(overrides: { workflowAvailable?: boolean } = {}) {
  const base = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
  const workspace =
    overrides.workflowAvailable === false ? { ...base, workflowAvailable: false } : base;
  return render(
    <RenewalWorkspace
      workspace={workspace}
      role="Admin"
      selectedStepId="verify-renewal"
      manualState={null}
      chargeInventory={inventory}
      rentChargeStatus={rows}
      correctionPanel={
        <RenewalCorrections
          leaseId={workspace.summary.id}
          role="Admin"
          dataCheck={workspace.dataCheck}
          sheetValues={null}
          workspaceContext={null}
          inventory={inventory}
          sheetPreviewHash={null}
          rentvinePreviewHash={null}
          reviewHref={null}
        />
      }
      rentvineUpdatesPanel={<div>RentVine proposal controls</div>}
      operatingSheetPanel={<div>Sheet proposal controls</div>}
    />,
  );
}

describe("S117 Rent and charges working area (R117.1, R117.4)", () => {
  it("AC-S117-1: Rent and charges is one working area inside Lease details with distinct current, reference, charge and future values", () => {
    const { container } = renderArea();
    const details = screen.getByRole("region", { name: "Lease details" });
    const area = within(details).getByRole("region", {
      name: "Rent and charges working area",
    });
    expect(within(area).getByRole("heading", { name: "Rent and charges" })).toBeVisible();
    for (const label of [
      "Current contractual base rent",
      "Lease total (RentVine)",
      "Unit listed rent (reference)",
    ]) {
      expect(within(area).getByText(label)).toBeInTheDocument();
    }
    const charges = within(area).getByRole("region", {
      name: "Recurring charges (RentVine)",
    });
    const items = within(charges).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    const current = items.find((item) =>
      /within current schedule/.test(item.textContent ?? ""),
    );
    expect(current?.textContent).toContain("Rent account");
    expect(current?.textContent).toContain("1180.00");
    const future = items.find((item) => /Future rent/.test(item.textContent ?? ""));
    expect(future?.textContent).toContain("outside current schedule");
    const other = items.find((item) =>
      /Other recurring charge/.test(item.textContent ?? ""),
    );
    expect(other?.textContent).toContain("35.00");
    expect(other?.textContent).not.toContain("Rent account");

    expect(
      within(area).getByRole("link", { name: "Correct a current fact" }),
    ).toHaveAttribute("href", "#renewal-correct-a-fact");
    expect(
      within(area).getByRole("link", { name: "Prepare future approved rent" }),
    ).toHaveAttribute("href", "#renewal-future-rent");
    const correct = container.querySelector("#renewal-correct-a-fact");
    expect(correct).not.toBeNull();
    expect(
      within(correct as HTMLElement).getByLabelText("Fact to correct"),
    ).toBeInTheDocument();
    const future2 = container.querySelector("#renewal-future-rent");
    expect(future2?.textContent).toContain("Prepare future approved rent in RentVine");
    expect(area).toContainElement(correct as HTMLElement);
    expect(area).toContainElement(future2 as HTMLElement);
    expect(area).toContainElement(screen.getByText("RentVine proposal controls"));
    expect(area).toContainElement(screen.getByText("Sheet proposal controls"));

    const dataCheck = within(details).getByRole("heading", { name: "Data check" });
    expect(
      area.compareDocumentPosition(dataCheck) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("AC-S117-4: update status by destination shows each destination's own state and a base-rent mismatch as attention, never as synchronized", () => {
    renderArea();
    const area = screen.getByRole("region", { name: "Rent and charges working area" });
    const status = within(area).getByRole("region", {
      name: "Update status by destination",
    });
    const mismatch = within(status).getByRole("status");
    expect(mismatch.textContent).toContain(
      "Charge applied; lease base rent still differs",
    );
    expect(mismatch.textContent).toContain("1300.00");
    expect(mismatch.textContent).toContain("1180.00");
    expect(
      within(status)
        .getByText(/Sheet Renewal date/)
        .closest("li")?.textContent,
    ).toContain("Prepared, awaiting Admin confirmation");
    expect(status.textContent).not.toMatch(/synchroniz/i);
    expect(within(status).getAllByRole("link", { name: "Review" })).toHaveLength(2);
  });

  it("AC-S117-1: an inspection-only lease shows the same facts and charges without edit controls", () => {
    renderArea({ workflowAvailable: false });
    const area = screen.getByRole("region", { name: "Rent and charges working area" });
    expect(
      within(
        within(area).getByRole("region", { name: "Recurring charges (RentVine)" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(3);
    expect(
      within(area).queryByRole("link", { name: "Correct a current fact" }),
    ).toBeNull();
    expect(
      within(area).queryByRole("region", { name: "Update status by destination" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Fact to correct")).toBeNull();
  });
});
