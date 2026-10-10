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

const routerMock = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

import { RenewalCorrections } from "@/components/lease-renewal/RenewalCorrections";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import { RentAndCharges } from "@/components/lease-renewal/RentAndCharges";
import type { DeskReconItem } from "@/lib/lease-renewal/desk-model";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";
import type { RenewalChargeInventory } from "@/lib/lease-renewal/writeback/charge-inventory-model";
import {
  FIXTURE_LEASE_ID,
  PET_FEE,
  fixtureCharge,
  fixtureInventory,
  fixtureWorkingRecord,
  jsonResponse,
  postedBody,
} from "@/tests/helpers/rent-charge-fixtures";

// S157/S160: staff edit the working current rent directly, keep it over conflicting source
// reads, see each source difference, and prepare the RentVine rent charge update from it without
// a request, review, approval or retyped amount. Every value is synthetic.

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse(200, { record: null }));
  vi.stubGlobal("fetch", fetchMock);
  routerMock.refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RENT_CHARGE = fixtureCharge("301");
const PREVIEW_HASH = "e".repeat(64);

function card(options: {
  inventory?: RenewalChargeInventory | null;
  record?: RenewalWorkingRecord | null;
  contractual?: number | null;
  rows?: readonly RentChargeOutcomeRow[];
  canEdit?: boolean;
}) {
  return (
    <RenewalWorkingRecordProvider
      canEdit={options.canEdit ?? true}
      initialRecord={options.record ?? null}
      leaseId={FIXTURE_LEASE_ID}
    >
      <RentAndCharges
        chargeInventory={
          options.inventory === undefined
            ? fixtureInventory([RENT_CHARGE])
            : options.inventory
        }
        rentChargeStatus={options.rows ?? []}
        summary={{
          currentRent: options.contractual === undefined ? 1150 : options.contractual,
          leaseTotalRent: 1215,
          unitListedRent: 1395,
        }}
      />
    </RenewalWorkingRecordProvider>
  );
}

function rentvineRow(state: RentChargeOutcomeRow["state"]): RentChargeOutcomeRow {
  const labels: Record<string, string> = {
    prepared: "Prepared, awaiting confirmation",
    failed: "Declined without change",
    verified: "Read back after the confirmed update",
    succeeded: "Applied with receipt",
  };
  return {
    id: `rentvine:${state}`,
    destination: "rentvine",
    intent: "current",
    label: "RentVine recurring charge update",
    state,
    stateLabel: labels[state] ?? state,
    detail: "Charge amount to 1250.00.",
    anchor: "#rentvine-updates-title",
    attention: state === "failed",
    previewHash: PREVIEW_HASH,
  };
}

const currentRentCheck: DeskReconItem = {
  fieldKey: "current_rent",
  fieldLabel: "Current base rent",
  agreement: "conflict",
  sourceTriggerKey: "current-key",
  candidateFingerprint: "c".repeat(64),
  candidates: [
    {
      source: "RentVine",
      sourceSystem: "RentVine",
      value: "1180",
      confidence: "Verified",
    },
    {
      source: "Operating Sheet",
      sourceSystem: "Google Sheets",
      value: "1150",
      confidence: "Verified",
    },
  ],
};

function corrections(options: {
  record?: RenewalWorkingRecord | null;
  role?: "Editor" | "Admin";
  canEdit?: boolean;
  dataCheck?: readonly DeskReconItem[];
  sheetValues?: Record<string, string> | null;
}) {
  return (
    <RenewalWorkingRecordProvider
      canEdit={options.canEdit ?? true}
      initialRecord={options.record ?? null}
      leaseId={FIXTURE_LEASE_ID}
    >
      <RenewalCorrections
        dataCheck={options.dataCheck ?? [currentRentCheck]}
        inventory={fixtureInventory([RENT_CHARGE])}
        leaseId={FIXTURE_LEASE_ID}
        rentvinePreviewHash={null}
        role={options.role ?? "Editor"}
        sheetPreviewHash={null}
        sheetValues={
          options.sheetValues === undefined
            ? { current_rent: "1150", renewal_date: "2026-12-31" }
            : options.sheetValues
        }
        workspaceContext="secure-context"
      />
    </RenewalWorkingRecordProvider>
  );
}

function chooseCurrentRent() {
  fireEvent.change(screen.getByLabelText("Fact to correct"), {
    target: { value: "current_rent" },
  });
}

function requestsTo(route: string) {
  return fetchMock.mock.calls.filter((call) => String(call[0]).endsWith(route));
}

function operational(container: HTMLElement) {
  return container.querySelector('[data-rent-fact="operational"]') as HTMLElement;
}

describe("S157 direct working current rent", () => {
  it("BEH-S157-1/3/4: the working current rent saves directly with no request, approval or narrative, and reads back the server attribution", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        record: fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } }),
      }),
    );
    render(card({}));
    const input = screen.getByLabelText("Working current rent") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1250" } });
    fireEvent.blur(input);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/lease-renewal/working-record");
    const body = postedBody(fetchMock.mock.calls[0]);
    expect(body).toMatchObject({
      field: "current_rent",
      value: 1250,
      origin: "staff_entry",
    });
    expect(body).not.toHaveProperty("context");
    expect(body).not.toHaveProperty("sourceLabel");
    expect(body).not.toHaveProperty("reason");
    expect(requestsTo("correction-review")).toHaveLength(0);
    expect(requestsTo("resolve")).toHaveLength(0);
    expect(requestsTo("writeback-approvals")).toHaveLength(0);
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByText(/Entered by editor1@pmikcmetro.com/)).toBeInTheDocument();
    expect(screen.queryByText(/call|observed on|message from/i)).not.toBeInTheDocument();
  });

  it("BEH-S157-2: working renewal terms never change the current rent shown", () => {
    const { container } = render(
      card({
        record: fixtureWorkingRecord({
          terms_rent: { value: 1500, revision: 1 },
          terms_effective_date: { value: "2027-01-01", revision: 2 },
        }),
      }),
    );
    expect(operational(container)).toHaveTextContent("1180.00");
    expect(operational(container)).not.toHaveTextContent("1500");
    const status = screen.getByRole("region", { name: "Update status by destination" });
    const terms = within(status)
      .getByText(/Working renewal terms/)
      .closest("li")!;
    expect(terms).toHaveTextContent("Saved in the app");
    expect(terms).toHaveTextContent("1500.00");
    expect(terms).toHaveTextContent("01/01/2027");
    expect(terms).toHaveTextContent(/today.s rent and the Sheet current rent/i);
    expect(within(status).queryByText(/Working current rent/)).not.toBeInTheDocument();
  });

  it("BEH-S157-5 / AC-S157-1: a later conflicting RentVine read keeps the retained value and shows the new source values", () => {
    const record = fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } });
    const view = render(card({ record, contractual: 1150 }));
    expect(operational(view.container)).toHaveTextContent("1250.00");
    expect(screen.getByLabelText("Working current rent")).toHaveValue("1250");

    // Both sources now read different amounts; the page re-renders with the same stored record.
    view.rerender(
      card({
        record,
        contractual: 1320,
        inventory: fixtureInventory([
          fixtureCharge("301", { projection: { amount: "1300.00" } }),
        ]),
      }),
    );
    expect(operational(view.container)).toHaveTextContent("1250.00");
    expect(operational(view.container)).toHaveTextContent("Staff working value");
    expect(screen.getByLabelText("Working current rent")).toHaveValue("1250");
    expect(
      view.container.querySelector('[data-rent-fact="rent-charge"]'),
    ).toHaveTextContent("1300.00");
    expect(
      view.container.querySelector('[data-rent-fact="contractual"]'),
    ).toHaveTextContent("1320.00");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("BEH-S157-6: the difference between the working value and each source stays visible in the card and the corrections list", () => {
    const record = fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } });
    const { container } = render(card({ record, contractual: 1150 }));
    const field = container.querySelector("#renewal-working-current-rent") as HTMLElement;
    expect(field).toHaveTextContent(/RentVine rent charge: \$1,180\.00/);
    expect(field).toHaveTextContent(/differs from the working value \$1,250\.00/);
    const comparisons = within(field).getByRole("list", {
      name: "Working value compared with each source",
    });
    const items = within(comparisons).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("data-source-comparison"))).toEqual([
      "differs",
      "differs",
    ]);
    expect(items[0]).toHaveTextContent(/RentVine rent charge/);
    expect(items[0]).toHaveTextContent("1180.00");
    expect(items[1]).toHaveTextContent(/RentVine contractual lease rent/);
    expect(items[1]).toHaveTextContent("1150.00");
    cleanup();

    render(corrections({ record }));
    chooseCurrentRent();
    const sources = screen.getByRole("list", { name: "Observed current rent by source" });
    const rows = within(sources).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("RentVine");
    expect(rows[0]).toHaveTextContent("1180");
    expect(rows[0]).toHaveTextContent(/differs from the working value 1250\.00/i);
    expect(rows[1]).toHaveTextContent("Operating Sheet");
    expect(rows[1]).toHaveTextContent("1150");
    expect(rows[1]).toHaveTextContent(/differs from the working value 1250\.00/i);
  });

  it("BEH-S157-7: a source mismatch is advisory; the corrections card carries no review, approval or resolve-first language and other work proceeds", async () => {
    const record = fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } });
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith("operating-sheet")
        ? jsonResponse(200, { proposal: { preview_hash: "a".repeat(64) } })
        : jsonResponse(200, { proposal: { preview_hash: "b".repeat(64) } }),
    );
    render(corrections({ record, dataCheck: [currentRentCheck] }));
    chooseCurrentRent();
    const panel = screen.getByRole("region", { name: "Correct a lease fact" });
    expect(panel.textContent).not.toMatch(
      /for review|for approval|Approver|Admin|must be resolved|before continuing|required before/i,
    );
    expect(
      screen.queryByRole("button", { name: /Save current-rent (proposal|decision)/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Review approval/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Value source / reason")).not.toBeInTheDocument();
    expect(
      within(panel).getByRole("link", { name: "Edit the working current rent" }),
    ).toHaveAttribute("href", "#renewal-working-current-rent");

    // Another ordinary action on the same lease, with the mismatch still open.
    fireEvent.change(screen.getByLabelText("Fact to correct"), {
      target: { value: "renewal_date" },
    });
    fireEvent.change(screen.getByLabelText("Reviewed renewal date"), {
      target: { value: "2027-12-31" },
    });
    fireEvent.change(screen.getByLabelText("Destinations"), {
      target: { value: "both" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare selected destination previews" }),
    );
    await waitFor(() => expect(requestsTo("rentvine-writeback")).toHaveLength(1));
    expect(requestsTo("operating-sheet")).toHaveLength(1);
    expect(postedBody(requestsTo("operating-sheet")[0])).toMatchObject({
      operation: "propose",
      intent: "update_field",
      fieldIntent: { field: "renewal_date", value: "2027-12-31" },
    });
    expect(postedBody(requestsTo("rentvine-writeback")[0])).toMatchObject({
      operation: "propose",
      effects: [{ kind: "renewal_dates_update", after: { endDate: "2027-12-31" } }],
    });
    expect(postedBody(requestsTo("rentvine-writeback")[0])).not.toHaveProperty(
      "evidenceRef",
    );
    expect(requestsTo("resolve")).toHaveLength(0);
    expect(requestsTo("correction-review")).toHaveLength(0);
  });

  it("BEH-S157-8: adopting an observed source value is an application edit that dispatches nothing to a provider", async () => {
    const record = fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        record: fixtureWorkingRecord(
          {
            current_rent: {
              value: 1150,
              revision: 2,
              origin: "adopted_source",
              sourceLabel: "Operating Sheet",
            },
          },
          2,
        ),
      }),
    );
    render(corrections({ record }));
    chooseCurrentRent();
    fireEvent.click(
      screen.getByRole("button", { name: "Use the Operating Sheet value" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/lease-renewal/working-record");
    expect(postedBody(fetchMock.mock.calls[0])).toMatchObject({
      field: "current_rent",
      value: 1150,
      origin: "adopted_source",
      sourceLabel: "Operating Sheet",
    });
    expect(requestsTo("rentvine-writeback")).toHaveLength(0);
    expect(requestsTo("operating-sheet")).toHaveLength(0);
    const sources = screen.getByRole("list", { name: "Observed current rent by source" });
    await waitFor(() =>
      expect(within(sources).getAllByRole("listitem")[1]).toHaveTextContent(
        /matches the working value/i,
      ),
    );
  });

  it("BEH-S157-9 / AC-S157-3: a matching source clears the visible difference without any claim that this app changed the source", () => {
    const record = fixtureWorkingRecord({ current_rent: { value: 1180, revision: 1 } });
    const { container } = render(card({ record, contractual: 1180 }));
    const field = container.querySelector("#renewal-working-current-rent") as HTMLElement;
    expect(field).not.toHaveTextContent(/differs/);
    expect(field).toHaveTextContent(/matches the working value/);
    expect(field.querySelector('[data-working-differs="true"]')).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Prepare RentVine rent charge update" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector("[data-rent-update-note]")).toHaveTextContent(
      /already reads 1180\.00/,
    );
    expect(container.textContent).not.toMatch(
      /applied|receipt|synchroniz|updated by this app|changed by this app/i,
    );
    const status = screen.getByRole("region", { name: "Update status by destination" });
    expect(status.querySelector('[data-outcome-destination="rentvine"]')).toBeNull();
  });

  it("BEH-S157-11 / AC-S157-3: app-saved, prepared, failed and verified states stay distinct, and a failed update fabricates no receipt", () => {
    const record = fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } });
    const { container } = render(
      card({ record, rows: [rentvineRow("failed"), rentvineRow("prepared")] }),
    );
    const status = screen.getByRole("region", { name: "Update status by destination" });
    const app = within(status)
      .getByText(/Working current rent/)
      .closest("li")!;
    expect(app).toHaveAttribute("data-outcome-state", "recorded");
    expect(app).toHaveTextContent("Saved in the app");
    expect(app).toHaveTextContent("1250.00");
    expect(app).toHaveTextContent(/RentVine and the Sheet/);
    const failed = status.querySelector('[data-outcome-state="failed"]')!;
    expect(failed).toHaveTextContent("Declined without change");
    const prepared = status.querySelector('[data-outcome-state="prepared"]')!;
    expect(prepared).toHaveTextContent("Prepared, awaiting confirmation");
    expect(status.textContent).not.toMatch(/Applied with receipt|synchroniz/i);
    expect(container.querySelector('[data-rent-fact="operational"]')).toHaveTextContent(
      "1250.00",
    );
    cleanup();

    render(card({ record, rows: [rentvineRow("verified")] }));
    const verified = screen
      .getByRole("region", { name: "Update status by destination" })
      .querySelector('[data-outcome-state="verified"]')!;
    expect(verified).toHaveTextContent("Read back after the confirmed update");
  });
});

describe("S160 RentVine rent charge update beside the working value", () => {
  it("BEH-S160-2: prepares the current_base proposal from the working value and the one identified charge, with no retyping and no narrative, then points at the RentVine updates panel", async () => {
    const record = fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        status: "proposed",
        proposal: { preview_hash: "f".repeat(64) },
      }),
    );
    const { container } = render(card({ record, rows: [rentvineRow("prepared")] }));
    const note = container.querySelector("[data-rent-update-note]")!;
    expect(note).toHaveTextContent(/1180\.00 to 1250\.00/);
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare RentVine rent charge update" }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/lease-renewal/rentvine-writeback");
    const body = postedBody(fetchMock.mock.calls[0]);
    expect(body).toEqual({
      operation: "propose",
      leaseId: FIXTURE_LEASE_ID,
      expectedPriorPreviewHash: PREVIEW_HASH,
      businessIntent: "current_base",
      effects: [
        {
          kind: "recurring_charge_update",
          chargeId: "301",
          changes: { amount: "1250.00" },
        },
      ],
    });
    expect(body).not.toHaveProperty("confirm");
    const notice = await screen.findByText(/choose Apply RentVine update/);
    expect(notice.closest("[role='status']")).not.toBeNull();
    expect(
      within(notice.closest("[role='status']") as HTMLElement).getByRole("link", {
        name: "RentVine updates",
      }),
    ).toHaveAttribute("href", "#rentvine-updates-title");
    expect(routerMock.refresh).toHaveBeenCalled();
    expect(screen.getByLabelText("Working current rent")).toHaveValue("1250");
  });

  it("BEH-S160-11 / BEH-S154-8: each missing input is named locally and the rest of the card stays usable", () => {
    const record = fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } });
    const button = () =>
      screen.queryByRole("button", { name: "Prepare RentVine rent charge update" });
    const note = (container: HTMLElement) =>
      container.querySelector("[data-rent-update-note]")?.textContent ?? "";

    const noValue = render(card({}));
    expect(button()).not.toBeInTheDocument();
    expect(note(noValue.container)).toMatch(/Enter a working current rent/);
    expect(screen.getByLabelText("Working current rent")).toBeEnabled();
    cleanup();

    const unavailable = render(card({ record, inventory: null }));
    expect(button()).not.toBeInTheDocument();
    expect(note(unavailable.container)).toMatch(/charge list is unavailable/);
    expect(screen.getByLabelText("Working current rent")).toHaveValue("1250");
    cleanup();

    const several = render(
      card({
        record,
        inventory: fixtureInventory([
          fixtureCharge("311", { projection: { amount: "700.00" } }),
          fixtureCharge("312", { projection: { amount: "480.00" } }),
        ]),
      }),
    );
    expect(button()).not.toBeInTheDocument();
    expect(note(several.container)).toMatch(/more than one current rent-account charge/);
    expect(
      within(several.container).getByRole("link", { name: "RentVine updates" }),
    ).toHaveAttribute("href", "#rentvine-updates-title");
    cleanup();

    const none = render(card({ record, inventory: fixtureInventory([PET_FEE]) }));
    expect(button()).not.toBeInTheDocument();
    expect(note(none.container)).toMatch(/no current rent-account recurring charge/);
    cleanup();

    const viewer = render(card({ record, canEdit: false }));
    expect(button()).not.toBeInTheDocument();
    expect(note(viewer.container)).toMatch(/Editor access/);
    expect(screen.getByLabelText("Working current rent")).toBeDisabled();
  });

  it("shows a refused preparation locally and keeps the working value", async () => {
    const record = fixtureWorkingRecord({ current_rent: { value: 1250, revision: 1 } });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error:
          "The active RentVine proposal changed. Reload this lease workspace before replacing it.",
      }),
    );
    render(card({ record }));
    fireEvent.click(
      screen.getByRole("button", { name: "Prepare RentVine rent charge update" }),
    );
    expect(
      await screen.findByText(/The active RentVine proposal changed/),
    ).toBeInTheDocument();
    expect(postedBody(fetchMock.mock.calls[0])).toMatchObject({
      expectedPriorPreviewHash: null,
    });
    expect(screen.getByLabelText("Working current rent")).toHaveValue("1250");
    expect(
      screen.getByRole("button", { name: "Prepare RentVine rent charge update" }),
    ).toBeEnabled();
  });
});
