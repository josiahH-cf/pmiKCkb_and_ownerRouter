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
import { afterEach, describe, expect, it, vi } from "vitest";

import { MaintenancePreapprovalImport } from "@/components/maintenance/MaintenancePreapprovalImport";
import type { PreapprovalImportPlan } from "@/lib/maintenance/rentvine-preapproval-import";

// S108 amendment (B-MNT1): the Admin previews RentVine's limits, sees each change and every RentVine
// maintenance note, and records them in one confirmation that sends only the preview hash and date.
// Values are synthetic.

const PLAN: PreapprovalImportPlan = {
  propertiesRead: 3,
  planHash: "a".repeat(64),
  rows: [
    {
      propertyKey: "10",
      label: "1 Sample St, Sampletown",
      amountCents: 50_000,
      currentAmountCents: null,
      currentVersion: null,
      action: "add",
      maintenanceNotes: "Call the owner for HVAC work.",
    },
    {
      propertyKey: "11",
      label: "2 Sample St, Sampletown",
      amountCents: 25_000,
      currentAmountCents: 20_000,
      currentVersion: 1,
      action: "update",
      maintenanceNotes: null,
    },
    {
      propertyKey: "12",
      label: "3 Sample St, Sampletown",
      amountCents: 40_000,
      currentAmountCents: 40_000,
      currentVersion: 2,
      action: "unchanged",
      maintenanceNotes: null,
    },
  ],
  skipped: [
    { propertyKey: "13", label: "4 Sample St, Sampletown", reason: "invalid_amount" },
  ],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(handler: (init?: RequestInit) => { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const { status, body } = handler(init);
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("S108 RentVine preapproval import panel (BEH-S108-4)", () => {
  it("previews every change and note, then records with the preview hash and date", async () => {
    const fetchMock = stubFetch((init) =>
      init?.method === "POST"
        ? {
            status: 200,
            body: {
              status: "imported",
              recorded: 2,
              preapprovals: [
                {
                  property_key: "10",
                  amount_cents: 50_000,
                  effective_from_iso: "2026-10-01T00:00:00.000Z",
                  recorded_by_uid: "admin-1",
                  version: 1,
                },
                {
                  property_key: "11",
                  amount_cents: 25_000,
                  effective_from_iso: "2026-10-01T00:00:00.000Z",
                  recorded_by_uid: "admin-1",
                  version: 2,
                },
              ],
            },
          }
        : { status: 200, body: { status: "ok", plan: PLAN } },
    );
    const onRecorded = vi.fn();
    render(<MaintenancePreapprovalImport onRecorded={onRecorded} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Preview RentVine maintenance limits" }),
    );
    expect(
      await screen.findByText(
        "Read 3 RentVine properties: 1 to add, 1 to change, 1 already matches.",
      ),
    ).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("$500.00")).toBeInTheDocument();
    expect(within(table).getByText("Change amount")).toBeInTheDocument();
    expect(within(table).getByText("Already matches")).toBeInTheDocument();
    expect(
      within(table).getByText(
        /RentVine maintenance notes: Call the owner for HVAC work\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "4 Sample St, Sampletown: RentVine's maintenance limit is not a plain dollar amount.",
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Effective from/), {
      target: { value: "2026-10-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review the import" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Record 2 preapprovals from RentVine, effective 10/01/2026.",
    );
    expect(dialog).toHaveTextContent(
      "1 of these properties have RentVine maintenance notes shown in the preview.",
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Record these preapprovals" }),
    );

    await waitFor(() => expect(onRecorded).toHaveBeenCalledTimes(1));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({
      plan_hash: PLAN.planHash,
      effective_from: "2026-10-01",
    });
    expect(onRecorded.mock.calls[0][0]).toHaveLength(2);
    expect(
      await screen.findByText("Recorded 2 preapprovals from RentVine."),
    ).toBeInTheDocument();
  });

  it("shows why the preview is unavailable and records nothing", async () => {
    const fetchMock = stubFetch(() => ({
      status: 503,
      body: { code: "auth_error", error: "RentVine refused the read." },
    }));
    const onRecorded = vi.fn();
    render(<MaintenancePreapprovalImport onRecorded={onRecorded} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Preview RentVine maintenance limits" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "RentVine refused the read.",
    );
    expect(
      screen.queryByRole("button", { name: "Review the import" }),
    ).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onRecorded).not.toHaveBeenCalled();
  });
});
