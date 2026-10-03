// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { RentAndCharges } from "@/components/lease-renewal/RentAndCharges";
import type { RenewalAttemptRecord } from "@/lib/lease-renewal/execution/attempt-continuation";
import {
  projectRentChargeOutcomes,
  type RentChargeOutcomeRow,
} from "@/lib/lease-renewal/rent-charge-outcomes";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import { projectCurrentBaseReadback } from "@/lib/lease-renewal/writeback/current-base-readback";
import {
  renewalWritebackExecutionId,
  type RenewalWritebackProposal,
} from "@/lib/lease-renewal/writeback/proposal-contract";
import {
  ENDED_RENT,
  FIXTURE_LEASE_ID,
  FUTURE_RENT,
  INSURANCE_FEE,
  PET_FEE,
  fixtureCharge,
  fixtureInventory,
  fixtureWorkingRecord,
  jsonResponse,
  postedBody,
} from "@/tests/helpers/rent-charge-fixtures";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S153: the lease workspace shows the operational current rent from actual charge evidence and
// keeps the contractual, aggregate, listing and working amounts under their own labels. Nothing
// here sums, splits or selects a charge; every amount is synthetic.

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse(200, { record: null }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RENT_CHARGE = fixtureCharge("301");

function renderCard(options: {
  inventory: RenewalChargeInventory | null;
  record?: RenewalWorkingRecord | null;
  contractual?: number | null;
  total?: number | null;
  listing?: number | null;
  rows?: readonly RentChargeOutcomeRow[];
  canEdit?: boolean;
}) {
  return render(
    <RenewalWorkingRecordProvider
      canEdit={options.canEdit ?? true}
      initialRecord={options.record ?? null}
      leaseId={FIXTURE_LEASE_ID}
    >
      <RentAndCharges
        chargeInventory={options.inventory}
        rentChargeStatus={options.rows ?? []}
        summary={{
          currentRent: options.contractual === undefined ? 1150 : options.contractual,
          leaseTotalRent: options.total === undefined ? 1227 : options.total,
          unitListedRent: options.listing === undefined ? 1395 : options.listing,
        }}
      />
    </RenewalWorkingRecordProvider>,
  );
}

function fact(container: HTMLElement, name: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-rent-fact="${name}"]`);
  if (!element) throw new Error(`Missing rent fact ${name}`);
  return element;
}

describe("S153 current rent and charge presentation", () => {
  it("BEH-S153-1/4: one identified current rent charge is the prominent current rent, with its actual amount and billing period", () => {
    const { container } = renderCard({
      inventory: fixtureInventory([RENT_CHARGE, PET_FEE]),
      contractual: 1150,
    });
    expect(screen.getByText("Current rent")).toBeInTheDocument();
    const operational = fact(container, "operational");
    expect(operational).toHaveTextContent("1180.00");
    expect(operational).toHaveTextContent("RentVine rent-account recurring charge");
    expect(operational).not.toHaveTextContent("1150");
    const charge = fact(container, "rent-charge");
    expect(charge).toHaveTextContent("1180.00");
    expect(charge).toHaveTextContent("every 1 month(s) on day 1");
    expect(charge).toHaveTextContent("Billing period: 02/01/2026 to no end date");
    expect(fact(container, "contractual")).toHaveTextContent("1150.00");
    expect(
      container.querySelector('[data-current-rent-basis="rent_charge"]'),
    ).not.toBeNull();
  });

  it("BEH-S153-2 / AC-S153-2: fees and a future rent charge never change the amount labelled current rent", () => {
    const { container } = renderCard({
      inventory: fixtureInventory([RENT_CHARGE, PET_FEE, INSURANCE_FEE, FUTURE_RENT]),
      contractual: 1150,
      total: 1227,
    });
    const operational = fact(container, "operational");
    expect(operational).toHaveTextContent("1180.00");
    for (const inflated of ["1227", "1300", "1215", "1192"])
      expect(operational).not.toHaveTextContent(inflated);
    expect(fact(container, "lease-total")).toHaveTextContent("1227.00");
    expect(fact(container, "rent-charge")).not.toHaveTextContent("1300");
    expect(
      container.querySelector('[data-current-rent-basis="rent_charge"]'),
    ).not.toBeNull();
  });

  it("BEH-S153-3: the contractual, aggregate and listing amounts keep distinct labels and values", () => {
    const { container } = renderCard({
      inventory: fixtureInventory([RENT_CHARGE]),
      contractual: 1150,
      total: 1227,
      listing: 1395,
    });
    const labels = [
      "Current rent",
      "Current rent charge (RentVine)",
      "Contractual lease rent",
      "Lease total (RentVine)",
      "Unit listed rent (reference)",
    ];
    for (const label of labels) expect(screen.getByText(label)).toBeInTheDocument();
    expect(fact(container, "contractual")).toHaveTextContent("1150.00");
    expect(fact(container, "contractual")).toHaveTextContent("RentVine lease detail");
    expect(fact(container, "lease-total")).toHaveTextContent("1227.00");
    expect(fact(container, "lease-total")).toHaveTextContent(
      "sum of active recurring charges",
    );
    expect(fact(container, "listing")).toHaveTextContent("1395.00");
    expect(fact(container, "listing")).toHaveTextContent("a reference, not a lease term");
  });

  it("BEH-S153-5 / AC-S153-1: several current rent candidates are shown as recorded, with the helper's attention, and never summed or chosen", () => {
    const first = fixtureCharge("311", { projection: { amount: "700.00" } });
    const second = fixtureCharge("312", {
      projection: { amount: "480.00", description: "Rent (second account)" },
    });
    const { container } = renderCard({
      inventory: fixtureInventory([first, second, PET_FEE]),
      contractual: 1150,
      total: 1215,
      record: fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } }),
    });
    const operational = fact(container, "operational");
    // The working value leads; without it the contractual amount would carry its own label.
    expect(operational).toHaveTextContent("1250.00");
    expect(operational).toHaveTextContent("Staff working value");
    expect(operational).not.toHaveTextContent("1180");
    const charge = fact(container, "rent-charge");
    expect(charge).toHaveTextContent("700.00");
    expect(charge).toHaveTextContent("480.00");
    expect(charge).not.toHaveTextContent("1180");
    expect(container.querySelector("[data-rent-attention]")).toHaveTextContent(
      /more than one current rent-account charge/,
    );
    expect(
      screen.queryByRole("button", { name: "Prepare RentVine rent charge update" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector("[data-rent-update-note]")).toHaveTextContent(
      /more than one current rent-account charge/,
    );
    expect(
      container.querySelector('[data-current-rent-evidence="several"]'),
    ).not.toBeNull();
  });

  it("BEH-S153-5: an unclear schedule, no rent charge and an unavailable inventory each show the actual evidence and attention", () => {
    const unclear = renderCard({
      inventory: fixtureInventory([fixtureCharge("321", { current: null })]),
    });
    expect(unclear.container.querySelector("[data-rent-attention]")).toHaveTextContent(
      /not confirmed as current/,
    );
    expect(fact(unclear.container, "rent-charge")).toHaveTextContent(
      "schedule boundary needs review",
    );
    expect(fact(unclear.container, "operational")).toHaveTextContent(
      "RentVine contractual lease amount",
    );
    cleanup();

    const none = renderCard({ inventory: fixtureInventory([PET_FEE]) });
    expect(none.container.querySelector("[data-rent-attention]")).toHaveTextContent(
      "RentVine lists no current rent-account recurring charge for this lease.",
    );
    expect(fact(none.container, "operational")).toHaveTextContent("1150.00");
    cleanup();

    const unavailable = renderCard({ inventory: null });
    expect(
      unavailable.container.querySelector("[data-rent-attention]"),
    ).toHaveTextContent(
      "The recurring charge list is unavailable right now, so rent billing is not confirmed.",
    );
    expect(
      unavailable.container.querySelector('[data-current-rent-evidence="unavailable"]'),
    ).not.toBeNull();
    expect(fact(unavailable.container, "operational")).toHaveTextContent("1150.00");
  });

  it("BEH-S153-6: a working rent is usable while the charge evidence is unresolved, with its provenance labelled and unrelated work still offered", async () => {
    const { container } = renderCard({ inventory: null });
    const input = screen.getByLabelText("Working current rent") as HTMLInputElement;
    expect(input).toBeEnabled();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        record: fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } }),
      }),
    );
    fireEvent.change(input, { target: { value: "1250" } });
    fireEvent.blur(input);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/lease-renewal/working-record");
    expect(postedBody(fetchMock.mock.calls[0])).toMatchObject({
      leaseId: FIXTURE_LEASE_ID,
      field: "current_rent",
      value: 1250,
    });
    await waitFor(() =>
      expect(fact(container, "operational")).toHaveTextContent("1250.00"),
    );
    expect(fact(container, "operational")).toHaveTextContent("Staff working value");
    expect(container.querySelector("[data-rent-attention]")).toHaveTextContent(
      /unavailable right now/,
    );
    expect(
      screen.getByRole("link", { name: "Prepare future renewal rent" }),
    ).toHaveAttribute("href", "#renewal-future-rent");
  });

  it("BEH-S153-7 / AC-S153-2: current applicable charges are emphasized and historical and future charges stay reachable in a disclosure in the same card", () => {
    const { container } = renderCard({
      inventory: fixtureInventory([RENT_CHARGE, PET_FEE, FUTURE_RENT, ENDED_RENT]),
    });
    const charges = screen.getByRole("region", { name: "Recurring charges (RentVine)" });
    const current = within(charges).getByRole("list", { name: "Current charges" });
    const currentItems = within(current).getAllByRole("listitem");
    expect(currentItems).toHaveLength(2);
    expect(currentItems[0]).toHaveTextContent("Rent account");
    expect(currentItems[0]).toHaveTextContent("1180.00");
    expect(currentItems[1]).toHaveTextContent("Pet fee");
    expect(currentItems[1]).toHaveTextContent("Other recurring charge");
    const disclosure = charges.querySelector("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure!.querySelector("summary")).toHaveTextContent(
      "Charges outside the current schedule (2)",
    );
    const others = within(disclosure as HTMLElement).getAllByRole("listitem");
    expect(others.map((item) => item.textContent)).toEqual([
      expect.stringContaining("1300.00"),
      expect.stringContaining("1100.00"),
    ]);
    expect(others[0]).toHaveTextContent("outside current schedule");
    expect(container.querySelector(".panel")).toContainElement(disclosure);
    expect(fact(container, "operational")).toHaveTextContent("1180.00");
  });

  it("BEH-S153-8: the charge billing period is labelled separately from the lease dates", () => {
    const { container } = renderCard({
      inventory: fixtureInventory(
        [fixtureCharge("331", { projection: { endDate: "2027-01-31" } })],
        { startDate: "2026-01-01", endDate: "2026-12-31" },
      ),
    });
    const charge = fact(container, "rent-charge");
    expect(charge).toHaveTextContent("Billing period: 02/01/2026 to 01/31/2027");
    expect(charge).toHaveTextContent("Lease dates (RentVine): 01/01/2026 to 12/31/2026");
  });

  it("BEH-S153-10 / AC-S153-3: a verified charge update with an unchanged contractual rent reports both, and never claims a base-rent setter", () => {
    const proposal = {
      leaseId: FIXTURE_LEASE_ID,
      account: "pmikcmetro",
      previewHash: "a".repeat(64),
      confirmationExpiresAtIso: "2026-10-02T20:00:00.000Z",
      businessIntent: "current_base",
      effects: [
        {
          index: 0,
          effectHash: "b".repeat(64),
          actionKey: "rentvine.lease.recurring_charge.update",
          effect: {
            kind: "recurring_charge_update",
            chargeId: "301",
            before: { amount: "1180.00", startDate: "2026-02-01", endDate: null },
            changes: { amount: "1300.00" },
          },
        },
      ],
    } as unknown as RenewalWritebackProposal;
    const attempts: RenewalAttemptRecord[] = [
      {
        executionId: renewalWritebackExecutionId(proposal, proposal.effects[0]),
        actionKey: proposal.effects[0].actionKey,
        state: "succeeded",
        attemptCount: 1,
        updatedAtIso: "2026-10-02T15:30:00.000Z",
      },
    ];
    const rows = projectRentChargeOutcomes({
      manualState: null,
      rentvineProposal: proposal,
      attempts,
      sheetProposal: null,
      sheetEffects: null,
      currentBaseReadback: projectCurrentBaseReadback({
        proposal,
        attempts,
        currentRent: 1180,
      }),
      nowMs: Date.parse("2026-10-02T15:40:00.000Z"),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      destination: "rentvine",
      state: "mismatch",
      previewHash: "a".repeat(64),
    });
    expect(rows[0].detail).toMatch(/Charge applied at 1300\.00/);
    expect(rows[0].detail).toMatch(/contractual lease rent still reads 1180\.00/);
    expect(rows[0].detail).not.toMatch(/base.rent (was )?(set|updated|changed) to/i);
    expect(rows[0].detail).toMatch(/no general base-rent setter/);

    const { container } = renderCard({
      inventory: fixtureInventory([
        fixtureCharge("301", { projection: { amount: "1300.00" } }),
      ]),
      contractual: 1180,
      rows,
    });
    const status = screen.getByRole("region", { name: "Update status by destination" });
    const mismatch = within(status).getByRole("status");
    expect(mismatch).toHaveTextContent("Charge applied; lease base rent still differs");
    expect(mismatch).toHaveTextContent("1300.00");
    expect(mismatch).toHaveTextContent("1180.00");
    expect(status.textContent).not.toMatch(/synchroniz/i);
    // The card itself keeps the readback and the contractual amount under separate labels.
    expect(fact(container, "operational")).toHaveTextContent("1300.00");
    expect(fact(container, "operational")).toHaveTextContent(
      "RentVine rent-account recurring charge",
    );
    expect(fact(container, "contractual")).toHaveTextContent("1180.00");
  });

  it("replaces the review and Admin copy with the working-value and future-rent links", () => {
    const { container } = renderCard({ inventory: fixtureInventory([RENT_CHARGE]) });
    const card = container.querySelector(".panel") as HTMLElement;
    expect(card.textContent).not.toMatch(/approved|Admin-confirmed|Admin confirms/i);
    expect(card.textContent).not.toMatch(
      /Individual charges do not redefine contractual base rent/,
    );
    expect(
      within(card).getByRole("link", { name: "Correct the current rent" }),
    ).toHaveAttribute("href", "#renewal-working-current-rent");
    expect(
      within(card).getByRole("link", { name: "Prepare future renewal rent" }),
    ).toHaveAttribute("href", "#renewal-future-rent");
    expect(card.querySelector("#renewal-working-current-rent")).toContainElement(
      screen.getByLabelText("Working current rent"),
    );
  });
});

describe("S153 consumers in the lease workspace", () => {
  it("BEH-S153-9: the Focus pane facts and the Rent and charges card share the working-value precedence and provenance label", async () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    const inventory = fixtureInventory([RENT_CHARGE, PET_FEE]);
    const record = fixtureWorkingRecord({
      current_rent: { value: 1250, revision: 1 },
      terms_rent: { value: 1500, revision: 2 },
    });
    render(
      <RenewalWorkspace
        chargeInventory={inventory}
        manualState={null}
        rentChargeStatus={[]}
        role="Editor"
        selectedStepId="verify-renewal"
        workingRecord={record}
        workspace={workspace}
      />,
    );
    const pane = screen.getByRole("region", { name: "Focus view" });
    const paneRent = within(pane).getByText("Current rent").nextElementSibling!;
    expect(paneRent).toHaveTextContent("$1,250.00");
    expect(paneRent).toHaveTextContent("Staff working value");
    expect(within(pane).getByText("Contractual lease rent (RentVine)")).toBeVisible();
    const paneTerms = within(pane).getByText("Working renewal terms").nextElementSibling!;
    expect(paneTerms).toHaveTextContent("$1,500.00");
    expect(within(pane).queryByText("Owner-approved terms")).not.toBeInTheDocument();
    expect(
      within(pane).queryByText("Current base rent (RentVine)"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Full view" }));
    const area = screen.getByRole("region", { name: "Rent and charges working area" });
    const operational = area.querySelector('[data-rent-fact="operational"]');
    expect(operational).toHaveTextContent("1250.00");
    expect(operational).toHaveTextContent("Staff working value");
    expect(area.querySelector('[data-rent-fact="rent-charge"]')).toHaveTextContent(
      "1180.00",
    );
  });
});
