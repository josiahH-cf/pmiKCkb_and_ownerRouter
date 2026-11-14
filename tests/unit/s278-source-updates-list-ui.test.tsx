// @vitest-environment jsdom
// S278 R-S278-3 (BEH-S278-4, AC-S278-3) mounted: Finish up Work shows "Source updates (5 pending)",
// one row per update with "Prepare and review", the combined "Review all 5 Sheet updates", the
// open-update wait and the focus move after a confirmed read-back. Showing it sends nothing.
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  RenewalManualProvider,
  RenewalManualSection,
} from "@/components/lease-renewal/RenewalManualWorkspace";
import { SHEET_FIELD_LABELS } from "@/lib/lease-renewal/sheet-writeback/field-intent";
import type { SourceUpdatesPageInput } from "@/lib/lease-renewal/source-updates-list";
import {
  emptyRenewalWorkspace,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CYCLE = "6f1c0d7e-2b9a-4c11-8d3e-5a7b9c1d2e3f";
const FIELDS = [
  ["owner_pricing_confirmed", true],
  ["renewal_letter_sent", "Done — recorded by staff"],
  ["tenant_responded", "Done — recorded by staff"],
  ["lease_docs_sent", "Done — recorded by staff"],
  ["esign_complete", true],
] as const;

function state(
  revision: number,
  overrides: Partial<Record<(typeof FIELDS)[number][0], object>> = {},
): RenewalWorkspaceState {
  const base = emptyRenewalWorkspace("9101", CYCLE, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  return {
    ...base,
    revision,
    sourceUpdates: Object.fromEntries(
      FIELDS.map(([field, value], index) => [
        field,
        {
          eventId: `00000000-0000-4000-8000-00000000000${index + 1}`,
          intent: { field, value, source: "Staff record" },
          state: "pending",
          ...(overrides[field] ?? {}),
        },
      ]),
    ) as RenewalWorkspaceState["sourceUpdates"],
  };
}

const PAGE: SourceUpdatesPageInput = {
  sheetValues: {
    owner_pricing_confirmed: "No",
    renewal_letter_sent: "",
    tenant_responded: "",
    lease_docs_sent: "",
    esign_complete: "No",
  },
  openSheetProposal: null,
};

function mount(initial: RenewalWorkspaceState, page: SourceUpdatesPageInput = PAGE) {
  return (
    <RenewalManualProvider leaseId="9101" initialState={initial} sourceUpdatesPage={page}>
      <RenewalManualSection section="documents" documentOutcome="finish-up" />
    </RenewalManualProvider>
  );
}

describe("S278 R-S278-3: the one list of source updates", () => {
  it("BEH-S278-4: shows five pending Sheet updates with one combined review and sends nothing by showing them", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(mount(state(4)));
    expect(
      screen.getByRole("heading", { name: "Source updates (5 pending)" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Prepare and review: / })).toHaveLength(
      5,
    );
    const row = document.querySelector(
      '[data-renewal-source-update="sheet:owner_pricing_confirmed"]',
    );
    expect(row).toHaveTextContent("Owner pricing confirmed: Yes.");
    expect(row).toHaveTextContent("In the Sheet now: No.");
    expect(row).toHaveTextContent("Basis: Staff record.");
    expect(
      screen.getByRole("button", { name: "Review all 5 Sheet updates" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("R-S278-4: Review all prepares one review of the listed recorded cells", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        state: state(5),
        prepared: ["Owner pricing confirmed", "Renewal letter sent"],
        leftOut: [],
        remaining: 0,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(mount(state(4)));
    fireEvent.click(screen.getByRole("button", { name: "Review all 5 Sheet updates" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/lease-renewal/workspace");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      operation: "prepare_source_set",
      leaseId: "9101",
      cycleId: CYCLE,
      marketValue: false,
    });
    expect(body.entries.map((entry: { field: string }) => entry.field)).toEqual([
      "owner_pricing_confirmed",
      "renewal_letter_sent",
      "tenant_responded",
      "lease_docs_sent",
      "esign_complete",
    ]);
    expect(await screen.findByText(/Apply 2 Sheet updates/)).toBeInTheDocument();
  });

  it("AC-S278-5: with the Sheet switch off every row still shows its preview values and no row can prepare a write", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <RenewalManualProvider
        leaseId="9101"
        initialState={state(4)}
        sourceUpdatesPage={PAGE}
        writebackPaused
      >
        <RenewalManualSection section="documents" documentOutcome="finish-up" />
      </RenewalManualProvider>,
    );
    const rows = document.querySelectorAll("[data-renewal-source-update]");
    expect(rows).toHaveLength(FIELDS.length);
    for (const [field, proposed] of FIELDS) {
      const row = document.querySelector(`[data-renewal-source-update="sheet:${field}"]`);
      const current = PAGE.sheetValues?.[field] || "Blank";
      const next = proposed === true ? "Yes" : proposed;
      expect(row).toHaveTextContent(
        `${SHEET_FIELD_LABELS[field]}: ${next}. In the Sheet now: ${current}. Basis: Staff record.`,
      );
      expect(row).toHaveTextContent("Sheet updates are paused. Saved in the app.");
      const button = screen.getByRole("button", {
        name: `Prepare and review: ${SHEET_FIELD_LABELS[field]}`,
      });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    const combined = screen.getByRole("button", { name: "Review all 5 Sheet updates" });
    expect(combined).toBeDisabled();
    fireEvent.click(combined);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-S278-3: while one update is open, the other rows wait for it", () => {
    render(
      mount(
        state(4, {
          renewal_letter_sent: { state: "prepared", proposalId: "proposal-open-1" },
        }),
        {
          ...PAGE,
          openSheetProposal: {
            previewHash: "c".repeat(64),
            fields: ["renewal_letter_sent"],
            settled: false,
          },
        },
      ),
    );
    expect(screen.getAllByText("Finish or discard the open update first.")).toHaveLength(
      4,
    );
    expect(screen.queryByRole("button", { name: /Review all/ })).toBeNull();
    expect(
      document.querySelector('[data-renewal-source-update="sheet:renewal_letter_sent"]'),
    ).toHaveTextContent("Prepared. Review it under Review Sheet updates");
  });

  it("BEH-S278-4: after a confirmed read-back the row shows done with its receipt time and focus moves to the next row", async () => {
    const view = render(mount(state(4)));
    view.rerender(
      mount(
        state(5, {
          owner_pricing_confirmed: {
            state: "verified",
            receiptAt: "2026-11-13T16:42:00.000Z",
            proposalId: "proposal-done-1",
          },
        }),
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Source updates (4 pending)" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector(
        '[data-renewal-source-update="sheet:owner_pricing_confirmed"]',
      ),
    ).toHaveTextContent(/Done\. Receipt /);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Prepare and review: Renewal letter sent" }),
      ).toHaveFocus(),
    );
  });
});
