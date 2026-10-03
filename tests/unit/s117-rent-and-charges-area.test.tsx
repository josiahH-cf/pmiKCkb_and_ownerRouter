// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { RenewalCorrections } from "@/components/lease-renewal/RenewalCorrections";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import {
  FUTURE_RENT,
  fixtureCharge,
  fixtureInventory,
  fixtureWorkingRecord,
} from "@/tests/helpers/rent-charge-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

afterEach(cleanup);

// S117 (R117.1, R117.4) as carried into S153/S157: the one Rent and charges working area with the
// operational current rent, its labelled sources, the charges, the working value and each
// destination's own update state. Every value is synthetic.

const inventory = fixtureInventory([
  fixtureCharge("301"),
  FUTURE_RENT,
  fixtureCharge("302", {
    accountId: "12",
    accountLabel: null,
    classification: "non_rent",
    projection: { accountID: "12", amount: "35.00", description: "Rent" },
  }),
]);

const rows: RentChargeOutcomeRow[] = [
  {
    id: "rentvine:b",
    destination: "rentvine",
    intent: "current",
    label: "RentVine recurring charge update",
    state: "mismatch",
    stateLabel: "Charge applied; lease base rent still differs",
    detail:
      "Charge applied at 1300.00 and read back. The lease's contractual lease rent still reads 1180.00; RentVine has no general base-rent setter, so that amount changes only in the RentVine lease record.",
    anchor: "#rentvine-updates-title",
    attention: true,
    previewHash: "a".repeat(64),
  },
  {
    id: "sheet:d",
    destination: "sheet",
    intent: "current",
    label: "Sheet Renewal date",
    state: "prepared",
    stateLabel: "Prepared, awaiting confirmation",
    detail: "Row 41: 2026-12-31 to 2027-01-31.",
    anchor: "#operating-sheet-title",
    attention: false,
  },
];

function renderArea(options: { workingRecord?: RenewalWorkingRecord | null } = {}) {
  const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
  const view = render(
    <RenewalWorkspace
      workspace={workspace}
      role="Editor"
      selectedStepId="verify-renewal"
      manualState={null}
      chargeInventory={inventory}
      rentChargeStatus={rows}
      workingRecord={options.workingRecord ?? null}
      correctionPanel={
        <RenewalCorrections
          leaseId={workspace.summary.id}
          role="Editor"
          dataCheck={workspace.dataCheck}
          sheetValues={null}
          workspaceContext={null}
          inventory={inventory}
          sheetPreviewHash={null}
          rentvinePreviewHash={null}
        />
      }
      rentvineUpdatesPanel={<div>RentVine proposal controls</div>}
      operatingSheetPanel={<div>Sheet proposal controls</div>}
    />,
  );
  // S152: Focus view is the default; the working area is the same mounted region in Full view.
  fireEvent.click(screen.getByRole("button", { name: "Full view" }));
  return view;
}

describe("S117 Rent and charges working area (R117.1, R117.4)", () => {
  it("AC-S117-1: Rent and charges is one working area inside Lease details with distinct current, contractual, reference, charge and future values", () => {
    const { container } = renderArea();
    const details = screen.getByRole("region", { name: "Lease details" });
    const area = within(details).getByRole("region", {
      name: "Rent and charges working area",
    });
    expect(within(area).getByRole("heading", { name: "Rent and charges" })).toBeVisible();
    for (const label of [
      "Current rent",
      "Current rent charge (RentVine)",
      "Contractual lease rent",
      "Lease total (RentVine)",
      "Unit listed rent (reference)",
    ]) {
      expect(within(area).getByText(label)).toBeInTheDocument();
    }
    const operational = area.querySelector('[data-rent-fact="operational"]');
    expect(operational).toHaveTextContent("1180.00");
    expect(operational).toHaveTextContent("RentVine rent-account recurring charge");
    const charges = within(area).getByRole("region", {
      name: "Recurring charges (RentVine)",
    });
    const current = within(
      within(charges).getByRole("list", { name: "Current charges" }),
    ).getAllByRole("listitem");
    expect(current).toHaveLength(2);
    expect(current[0]).toHaveTextContent("Rent account");
    expect(current[0]).toHaveTextContent("1180.00");
    expect(current[0]).toHaveTextContent("within current schedule");
    expect(current[1]).toHaveTextContent("Other recurring charge");
    expect(current[1]).toHaveTextContent("35.00");
    expect(current[1]).not.toHaveTextContent("Rent account");
    const others = within(
      within(charges).getByRole("list", { name: "Earlier and future charges" }),
    ).getAllByRole("listitem");
    expect(others).toHaveLength(1);
    expect(others[0]).toHaveTextContent("1300.00");
    expect(others[0]).toHaveTextContent("Billing period: 01/01/2027 to 12/31/2027");
    expect(others[0]).toHaveTextContent("outside current schedule");

    expect(
      within(area).getByRole("link", { name: "Correct the current rent" }),
    ).toHaveAttribute("href", "#renewal-working-current-rent");
    expect(
      within(area).getByRole("link", { name: "Prepare future renewal rent" }),
    ).toHaveAttribute("href", "#renewal-future-rent");
    const working = container.querySelector("#renewal-working-current-rent");
    expect(working).not.toBeNull();
    expect(
      within(working as HTMLElement).getByLabelText("Working current rent"),
    ).toBeEnabled();
    const correct = container.querySelector("#renewal-correct-a-fact");
    expect(correct).not.toBeNull();
    expect(
      within(correct as HTMLElement).getByLabelText("Fact to correct"),
    ).toBeInTheDocument();
    const future = container.querySelector("#renewal-future-rent");
    expect(future?.textContent).toContain("Prepare future renewal rent in RentVine");
    expect(area).toContainElement(working as HTMLElement);
    expect(area).toContainElement(correct as HTMLElement);
    expect(area).toContainElement(future as HTMLElement);
    expect(area).toContainElement(screen.getByText("RentVine proposal controls"));
    expect(area).toContainElement(screen.getByText("Sheet proposal controls"));
    expect(area.textContent).not.toMatch(/approved|Admin/);

    const dataCheck = within(details).getByRole("heading", { name: "Data check" });
    expect(
      area.compareDocumentPosition(dataCheck) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("AC-S117-4: update status by destination shows each destination's own state and a base-rent mismatch as attention, never as synchronized", () => {
    renderArea({
      workingRecord: fixtureWorkingRecord({ current_rent: { value: 1300, revision: 1 } }),
    });
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
    ).toContain("Prepared, awaiting confirmation");
    const app = within(status)
      .getByText(/Working current rent/)
      .closest("li");
    expect(app).toHaveAttribute("data-outcome-state", "recorded");
    expect(app?.textContent).toContain("Saved in the app");
    expect(status.textContent).not.toMatch(/synchroniz/i);
    expect(within(status).getAllByRole("link", { name: "Review" })).toHaveLength(3);
  });
});
