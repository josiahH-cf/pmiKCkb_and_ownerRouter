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

import {
  OperatingSheetLookup,
  type OperatingSheetLookupCurrent,
} from "@/components/lease-renewal/OperatingSheetLookup";
import {
  RenewalWorkingRecordProvider,
  WorkingMoneyField,
} from "@/components/lease-renewal/RenewalWorkingRecord";
import type { OperatingSheetLookupView } from "@/lib/lease-renewal/sheet-lookup-read";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

// S158: lease information shows where the app looks in the operating Sheet, lets staff choose the
// actual tab and row or one field's cell, shows the backend read of that location with honest
// provenance, and keeps the selection and every other control when the read fails. Synthetic data.

const LEASE = "701";
const CONTEXT = "signed-workspace-context-token";
const SELECTED_AT = "2026-10-02T15:00:00.000Z";
const READ_AT = "2026-10-02T16:00:00.000Z";

function record(fields: Record<string, unknown>): RenewalWorkingRecord {
  return {
    schemaVersion: "renewal-working-record/v1",
    leaseId: LEASE,
    revision: Math.max(1, Object.keys(fields).length),
    fields: Object.fromEntries(
      Object.entries(fields).map(([field, value], index) => [
        field,
        {
          value: value as never,
          revision: index + 1,
          eventId: `0f1c8f6e-6d1c-4bd3-9d7a-00000000000${index + 1}`,
          recordedAt: SELECTED_AT,
          recordedByUid: "editor-1",
          recordedByLabel: "editor1@pmikcmetro.com",
          origin: "staff_entry" as const,
        },
      ]),
    ),
  };
}

const CURRENT: OperatingSheetLookupCurrent = {
  state: "row",
  tabTitle: "Lease Renewal",
  rowNumber: 12,
  how: "automatic_link",
  explanation: null,
  values: [
    { field: "current_rent", label: "Current base rent", value: "$1,250" },
    { field: "market_value", label: "Market value", value: "$1,400" },
  ],
};

function view(
  overrides: Partial<OperatingSheetLookupView> = {},
): OperatingSheetLookupView {
  return {
    readAtIso: READ_AT,
    tabs: { state: "available", titles: ["Lease Renewal", "Renewals 2026"] },
    row: null,
    cells: [],
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

let fetchMock: ReturnType<typeof vi.fn>;
let lookupView: OperatingSheetLookupView;
let stored: RenewalWorkingRecord | null;

/** Routes each request the way the two real endpoints answer. */
function installFetch() {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/lease-renewal/operating-sheet") {
      return jsonResponse(200, { status: "ok", lookup: lookupView });
    }
    if (url === "/api/lease-renewal/working-record") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        field: string;
        value: unknown;
      };
      const fields = {
        ...Object.fromEntries(
          Object.entries(stored?.fields ?? {}).map(([field, entry]) => [
            field,
            entry.value,
          ]),
        ),
        [body.field]: body.value,
      };
      stored = record(fields);
      return jsonResponse(200, { record: stored, duplicate: false });
    }
    throw new Error(`unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

const callsTo = (url: string, method: string) =>
  fetchMock.mock.calls.filter(
    ([target, init]) =>
      target === url && ((init as RequestInit | undefined)?.method ?? "GET") === method,
  );
const posted = (call: unknown[]) =>
  JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;

beforeEach(() => {
  lookupView = view();
  stored = null;
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderLookup(
  initialRecord: RenewalWorkingRecord | null = null,
  options: { canEdit?: boolean; current?: OperatingSheetLookupCurrent | null } = {},
) {
  stored = initialRecord;
  return render(
    <RenewalWorkingRecordProvider
      canEdit={options.canEdit ?? true}
      initialRecord={initialRecord}
      leaseId={LEASE}
    >
      <OperatingSheetLookup
        current={options.current === undefined ? CURRENT : options.current}
        sheetDestination={{
          kind: "external",
          href: "https://docs.google.com/spreadsheets/d/synthetic-sheet-id-0000000/edit#gid=0&range=12%3A12",
          label: "Opens this lease's matched operating Sheet location in a new tab.",
        }}
        workspaceContext={CONTEXT}
      />
      <WorkingMoneyField field="current_rent" />
    </RenewalWorkingRecordProvider>,
  );
}

async function openChooser() {
  fireEvent.click(screen.getByText("Choose where the app looks"));
  await waitFor(() =>
    expect(screen.getByLabelText("Tab for this lease's row")).not.toBeDisabled(),
  );
}

describe("S158 operating Sheet lookup in lease information", () => {
  it("BEH-S158-1: shows where the app looks, the observed values and the existing Sheet link", () => {
    renderLookup();
    const section = screen.getByRole("region", { name: "Operating Sheet lookup" });
    expect(section).toHaveTextContent(/row 12 on tab .Lease Renewal./);
    expect(section).toHaveTextContent("Current base rent");
    expect(section).toHaveTextContent("$1,250");
    expect(section).toHaveTextContent("Market value");
    expect(
      within(section).getByRole("link", { name: /open this row in the sheet/i }),
    ).toHaveAttribute("href", expect.stringContaining("docs.google.com/spreadsheets"));
    // Nothing is read from the provider just to show the automatic lookup.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("BEH-S158-2/4/8: choosing an actual tab and row saves the selection in the app and then reads that location, with no Sheet write", async () => {
    renderLookup();
    await openChooser();
    lookupView = view({
      row: {
        tabTitle: "Renewals 2026",
        rowNumber: 14,
        provenance: "operator_selected",
        selectedBy: "editor1@pmikcmetro.com",
        selectedAtIso: SELECTED_AT,
        state: "read",
        readAtIso: READ_AT,
        headerRecognized: true,
        cells: [
          {
            cell: "E14",
            header: "Current Rent",
            field: "current_rent",
            label: "Current base rent",
            value: "$1,900",
          },
        ],
      },
    });
    fireEvent.change(screen.getByLabelText("Tab for this lease's row"), {
      target: { value: "Renewals 2026" },
    });
    fireEvent.change(screen.getByLabelText("Row number"), { target: { value: "14" } });
    fireEvent.blur(screen.getByLabelText("Row number"));

    await waitFor(() =>
      expect(callsTo("/api/lease-renewal/working-record", "POST")).toHaveLength(1),
    );
    expect(posted(callsTo("/api/lease-renewal/working-record", "POST")[0])).toMatchObject(
      {
        leaseId: LEASE,
        field: "sheet_row",
        value: { tabTitle: "Renewals 2026", rowNumber: 14 },
      },
    );
    const section = screen.getByRole("region", { name: "Operating Sheet lookup" });
    await waitFor(() => expect(section).toHaveTextContent("$1,900"));
    expect(section).toHaveTextContent(/row 14 on tab .Renewals 2026./);
    // Honest provenance: who selected it and when it was read, never a match claim.
    expect(section).toHaveTextContent(/Selected by editor1@pmikcmetro.com/);
    expect(section).toHaveTextContent(/Read /);
    const selection = within(section).getByTestId("sheet-lookup-selected-row");
    expect(selection.textContent).not.toMatch(/matched|verified/i);
    // The selection is an app save plus a read: the Sheet route only ever received GETs.
    expect(callsTo("/api/lease-renewal/operating-sheet", "POST")).toHaveLength(0);
    for (const [, init] of callsTo("/api/lease-renewal/operating-sheet", "GET"))
      expect((init as RequestInit).headers).toMatchObject({
        "x-renewal-workspace-context": CONTEXT,
        "x-renewal-sheet-read": "lookup",
      });
  });

  it("BEH-S158-2/3: choosing a cell for one existing field saves only that field's selection", async () => {
    renderLookup(record({ sheet_row: { tabTitle: "Lease Renewal", rowNumber: 12 } }));
    await openChooser();
    lookupView = view({
      cells: [
        {
          field: "market_value",
          label: "Market value",
          tabTitle: "Renewals 2026",
          cell: "G42",
          provenance: "operator_selected",
          selectedBy: "editor1@pmikcmetro.com",
          selectedAtIso: SELECTED_AT,
          state: "read",
          readAtIso: READ_AT,
          value: "$1,475",
        },
      ],
    });
    fireEvent.change(screen.getByLabelText("Field"), {
      target: { value: "market_value" },
    });
    fireEvent.change(screen.getByLabelText("Tab for this field's cell"), {
      target: { value: "Renewals 2026" },
    });
    fireEvent.change(screen.getByLabelText("Cell"), { target: { value: "g42" } });
    fireEvent.blur(screen.getByLabelText("Cell"));

    await waitFor(() =>
      expect(callsTo("/api/lease-renewal/working-record", "POST")).toHaveLength(1),
    );
    expect(posted(callsTo("/api/lease-renewal/working-record", "POST")[0])).toMatchObject(
      {
        field: "sheet_cell.market_value",
        value: { tabTitle: "Renewals 2026", cell: "G42" },
      },
    );
    // The row selection was not touched by the cell selection.
    expect(stored?.fields.sheet_row.value).toEqual({
      tabTitle: "Lease Renewal",
      rowNumber: 12,
    });
    const section = screen.getByRole("region", { name: "Operating Sheet lookup" });
    await waitFor(() => expect(section).toHaveTextContent("$1,475"));
    expect(section).toHaveTextContent(/Market value: cell G42 on tab .Renewals 2026./);
  });

  it("BEH-S155 convention: an unfinished or invalid location stays typed and saves nothing", async () => {
    renderLookup();
    await openChooser();
    fireEvent.change(screen.getByLabelText("Tab for this lease's row"), {
      target: { value: "Renewals 2026" },
    });
    for (const value of ["", "abc", "1", "0"]) {
      fireEvent.change(screen.getByLabelText("Row number"), { target: { value } });
      fireEvent.blur(screen.getByLabelText("Row number"));
    }
    fireEvent.change(screen.getByLabelText("Field"), {
      target: { value: "market_value" },
    });
    fireEvent.change(screen.getByLabelText("Tab for this field's cell"), {
      target: { value: "Renewals 2026" },
    });
    for (const value of ["G", "42", "G42:H44", "=G42"]) {
      fireEvent.change(screen.getByLabelText("Cell"), { target: { value } });
      fireEvent.blur(screen.getByLabelText("Cell"));
    }
    expect(callsTo("/api/lease-renewal/working-record", "POST")).toHaveLength(0);
    expect((screen.getByLabelText("Cell") as HTMLInputElement).value).toBe("=G42");
  });

  it("BEH-S158-7, AC-S158-2: a failed read names the problem, keeps the selection and leaves other work usable", async () => {
    lookupView = view({
      row: {
        tabTitle: "Renewals 2026",
        rowNumber: 40,
        provenance: "operator_selected",
        selectedBy: "editor1@pmikcmetro.com",
        selectedAtIso: SELECTED_AT,
        state: "problem",
        problem:
          'Row 40 on tab "Renewals 2026" could not be read. It is outside the rows and columns of that tab.',
      },
    });
    renderLookup(
      record({
        sheet_row: { tabTitle: "Renewals 2026", rowNumber: 40 },
        current_rent: 1850,
      }),
    );
    const section = screen.getByRole("region", { name: "Operating Sheet lookup" });
    await waitFor(() =>
      expect(section).toHaveTextContent(
        /Row 40 on tab .Renewals 2026. could not be read/,
      ),
    );
    // The saved selection is still shown for correction, and the working value is untouched.
    expect(section).toHaveTextContent(/row 40 on tab .Renewals 2026./);
    const rent = screen.getByLabelText("Working current rent") as HTMLInputElement;
    expect(rent.value).toBe("1850");
    expect(rent).not.toBeDisabled();
    // Unrelated work still saves.
    fireEvent.change(rent, { target: { value: "1900" } });
    fireEvent.blur(rent);
    await waitFor(() =>
      expect(callsTo("/api/lease-renewal/working-record", "POST")).toHaveLength(1),
    );
    expect(posted(callsTo("/api/lease-renewal/working-record", "POST")[0])).toMatchObject(
      { field: "current_rent", value: 1900 },
    );
    // Returning to the automatic lookup is one deliberate control.
    fireEvent.click(screen.getByRole("button", { name: "Use the automatic lookup" }));
    await waitFor(() =>
      expect(callsTo("/api/lease-renewal/working-record", "POST")).toHaveLength(2),
    );
    expect(posted(callsTo("/api/lease-renewal/working-record", "POST")[1])).toMatchObject(
      { field: "sheet_row", value: null },
    );
  });

  it("BEH-S158-7: an unavailable workbook or lookup request is reported here only", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/lease-renewal/operating-sheet")
        return jsonResponse(503, { error: "The Sheet connection is unavailable." });
      throw new Error("unexpected");
    });
    renderLookup(record({ sheet_row: { tabTitle: "Renewals 2026", rowNumber: 14 } }));
    const section = screen.getByRole("region", { name: "Operating Sheet lookup" });
    await waitFor(() =>
      expect(section).toHaveTextContent("The Sheet connection is unavailable."),
    );
    expect(section).toHaveTextContent(/row 14 on tab .Renewals 2026./);
    expect(screen.getByLabelText("Working current rent")).not.toBeDisabled();
  });

  it("BEH-S158-4/11: reopening the lease reads the saved selection again, identically at phone and desktop widths", async () => {
    const saved = record({ sheet_row: { tabTitle: "Renewals 2026", rowNumber: 14 } });
    lookupView = view({
      row: {
        tabTitle: "Renewals 2026",
        rowNumber: 14,
        provenance: "operator_selected",
        selectedBy: "editor1@pmikcmetro.com",
        selectedAtIso: SELECTED_AT,
        state: "read",
        readAtIso: READ_AT,
        headerRecognized: false,
        cells: [
          { cell: "B14", header: "", field: null, label: "Column B", value: "1175" },
        ],
      },
    });
    const widths = [390, 1280].map((width) => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      const { container, unmount } = renderLookup(saved);
      return { container, unmount };
    });
    const html: string[] = [];
    for (const { container, unmount } of widths) {
      await waitFor(() => expect(container).toHaveTextContent("1175"));
      html.push(
        container.innerHTML.replace(
          / (id|for|aria-describedby|aria-labelledby|aria-controls)="[^"]*"/g,
          "",
        ),
      );
      unmount();
    }
    expect(html[0]).toBe(html[1]);
    expect(html[0]).toContain("Column B");
    expect(callsTo("/api/lease-renewal/operating-sheet", "GET").length).toBe(2);
  });

  it("keeps the lookup readable, without selection controls, for a read-only role", () => {
    renderLookup(null, { canEdit: false });
    expect(
      screen.getByRole("region", { name: "Operating Sheet lookup" }),
    ).toHaveTextContent("$1,250");
    expect(screen.queryByText("Choose where the app looks")).not.toBeInTheDocument();
  });

  it("BEH-S158-1: states plainly when the app has not found one row, and still offers the selection", async () => {
    renderLookup(null, {
      current: {
        state: "unresolved",
        tabTitle: "Lease Renewal",
        rowNumber: null,
        how: null,
        explanation:
          "A Sheet row carries this tenant's name but no RentVine lease link the app can read.",
        values: [],
      },
    });
    const section = screen.getByRole("region", { name: "Operating Sheet lookup" });
    expect(section).toHaveTextContent(/has not found one row for this lease/);
    expect(section).toHaveTextContent(/carries this tenant's name/);
    expect(section.textContent).not.toMatch(/—/);
    await openChooser();
    expect(screen.getByLabelText("Row number")).not.toBeDisabled();
  });
});
