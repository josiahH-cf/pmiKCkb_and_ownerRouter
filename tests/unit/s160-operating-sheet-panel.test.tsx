// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OperatingSheetPanel,
  type SheetWritebackEffectStatus,
} from "@/components/lease-renewal/OperatingSheetPanel";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import type { SheetWritebackClientProposal } from "@/lib/lease-renewal/sheet-writeback/client-projection";
import type { RenewalWorkingRecord } from "@/lib/lease-renewal/working-record";

// S160 (Sheet side) and the S159 panel behavior: ordinary staff prepare and confirm a supported
// Sheet update beside the working value, from an exact preview, with no approval hand-off. A
// paused switch or a limited selection is stated on the Sheet update only. Synthetic data.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const LEASE = "115";
const CONTEXT = "signed-workspace-context-token";
const fetchMock = vi.fn();

function working(fields: Record<string, unknown>): RenewalWorkingRecord {
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
          recordedAt: "2026-10-02T15:00:00.000Z",
          recordedByUid: "editor-1",
          recordedByLabel: "editor1@pmikcmetro.com",
          origin: "staff_entry" as const,
        },
      ]),
    ),
  };
}

function fieldProposal(
  overrides: Partial<SheetWritebackClientProposal> = {},
): SheetWritebackClientProposal {
  return {
    spreadsheet_id: "sheet-live-1",
    tab_title: "Lease Renewal",
    actor_email: "editor1@pmikcmetro.com",
    source_read_at: "2026-10-02T15:30:00.000Z",
    evidence_ref: "workspace:115:fresh-live-join",
    preview_hash: "c".repeat(64),
    created_at: "2026-10-02T15:30:00.000Z",
    confirmation_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    effects: [
      {
        index: 0,
        action_key: "google_sheets.renewal_checklist.field_update",
        kind: "field_update",
        effect_hash: "d".repeat(64),
        effect: {
          kind: "field_update",
          field: "current_rent",
          rowNumber: 4,
          rowKey: null,
          anchorTenantName: "Fresh Real Tenant",
          expectedValue: "$1,250",
          afterValue: "1850",
          source: "Working current rent",
          staffIntent: {
            field: "current_rent",
            value: 1850,
            source: "Working current rent",
          },
        },
        reversal_kind: "restore_field",
      },
    ],
    ...overrides,
  };
}

function statusFor(
  proposal: SheetWritebackClientProposal,
  state: string,
): SheetWritebackEffectStatus[] {
  return proposal.effects.map((effect) => ({
    ...effect,
    execution_id: `s98:sheet-live-1:${effect.effect_hash}`,
    state,
    attempt_count: state === "not_started" ? 0 : 1,
    reversal_state: null,
    effect_executable: true,
    reversal_executable: false,
  }));
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return { ok: status < 400, status, json: async () => payload };
}
const bodyOf = (index: number) =>
  JSON.parse((fetchMock.mock.calls[index] as [string, { body: string }])[1].body);

function renderPanel(
  props: Partial<Parameters<typeof OperatingSheetPanel>[0]> = {},
  record: RenewalWorkingRecord | null = working({ current_rent: 1850 }),
) {
  return render(
    <RenewalWorkingRecordProvider canEdit initialRecord={record} leaseId={LEASE}>
      <OperatingSheetPanel
        association={{ kind: "exact_link", rowNumber: 4 }}
        fieldCells={{ current_rent: "E4", market_value: "F4" }}
        identity={{ addressLabel: "12 Synthetic Way", leaseId: LEASE }}
        initialFieldValues={{ current_rent: "$1,250", market_value: "$1,400" }}
        initialProposal={null}
        role="Editor"
        workspaceContext={CONTEXT}
        {...props}
      />
    </RenewalWorkingRecordProvider>,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S160 staff prepare and confirm a supported Sheet update", () => {
  it("BEH-S160-2: the current-rent update is prepared from the saved working current rent, with nothing retyped", async () => {
    const proposal = fieldProposal();
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: "proposed", proposal }));
    renderPanel();
    fireEvent.click(screen.getByText("Correct an operating Sheet field"));
    fireEvent.change(screen.getByLabelText("Field to update"), {
      target: { value: "current_rent" },
    });
    // The working value sits beside the action; no second amount or source box is asked for.
    expect(
      (screen.getByLabelText("Working current rent") as HTMLInputElement).value,
    ).toBe("1850");
    expect(screen.queryByLabelText("New value")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Source of this value/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Resolve and approve/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Preview the Sheet update from the working current rent",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toEqual({
      operation: "propose",
      workspaceContext: CONTEXT,
      intent: "update_working_current_rent",
      expectedPriorPreviewHash: null,
    });
  });

  it("BEH-S160-2: with no working current rent the operator is asked for one here, and nothing is requested", () => {
    renderPanel({}, null);
    fireEvent.click(screen.getByText("Correct an operating Sheet field"));
    fireEvent.change(screen.getByLabelText("Field to update"), {
      target: { value: "current_rent" },
    });
    expect(screen.getByLabelText("Working current rent")).toBeInTheDocument();
    expect(
      screen.getByText(/Enter the working current rent above to prepare this update/),
    ).toBeInTheDocument();
    const preview = screen.getByRole("button", {
      name: "Preview the Sheet update from the working current rent",
    });
    expect(preview).toBeDisabled();
    fireEvent.click(preview);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("BEH-S160-3: the preview names the lease, tab, cell, current value, proposed value and consequence", () => {
    const proposal = fieldProposal();
    renderPanel({
      association: {
        kind: "operator_selected",
        via: "row",
        tabTitle: "Lease Renewal",
        rowNumber: 4,
        limit: null,
      },
      initialEffects: statusFor(proposal, "not_started"),
      initialProposal: proposal,
    });
    const panel = screen.getByRole("article");
    expect(panel).toHaveTextContent("12 Synthetic Way, lease 115");
    expect(panel).toHaveTextContent(/tab Lease Renewal, cell E4/);
    expect(panel).toHaveTextContent(/the row staff selected/);
    expect(panel).toHaveTextContent("Current base rent");
    expect(panel).toHaveTextContent("$1,250");
    expect(panel).toHaveTextContent("1850");
    expect(panel).toHaveTextContent(/Replaces this one cell only/);
  });

  it("BEH-S160-4/5: S184: an Editor applies the displayed exact update with one action, with no approval hand-off", async () => {
    const proposal = fieldProposal();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "executed", duplicate: false, receipt: {} }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "ok",
        proposal,
        effects: statusFor(proposal, "succeeded"),
      }),
    );
    renderPanel({
      initialEffects: statusFor(proposal, "not_started"),
      initialProposal: proposal,
    });
    expect(screen.queryByText(/Admin action/)).not.toBeInTheDocument();
    expect(screen.queryByText(/an Admin confirms/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply Sheet update" }));
    await waitFor(() =>
      expect(
        screen.getByText(/Applied to the operating Sheet with a receipt/),
      ).toBeInTheDocument(),
    );
    expect(bodyOf(0)).toEqual({
      operation: "execute",
      workspaceContext: CONTEXT,
      previewHash: proposal.preview_hash,
      effectHash: proposal.effects[0].effect_hash,
      confirm: true,
    });
  });

  it("AC-S184-3: repeated Apply while the first request is pending dispatches once", async () => {
    const proposal = fieldProposal();
    let settle!: (value: ReturnType<typeof jsonResponse>) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "ok", proposal, effects: statusFor(proposal, "succeeded") }),
    );
    renderPanel({
      initialProposal: proposal,
      initialEffects: statusFor(proposal, "not_started"),
    });
    const apply = screen.getByRole("button", { name: "Apply Sheet update" });
    fireEvent.click(apply);
    fireEvent.click(apply);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(apply).toBeDisabled();
    settle(jsonResponse({ status: "executed", receipt: {}, duplicate: false }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Apply Sheet update" }),
      ).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2); // one execution, one durable status read
  });

  it("ARCH-S160-1: every staff role is offered the same confirmation; none is sent to an access request", () => {
    const proposal = fieldProposal();
    for (const role of ["Editor", "Approver", "Admin"] as const) {
      const { unmount } = renderPanel({
        role,
        initialEffects: statusFor(proposal, "not_started"),
        initialProposal: proposal,
      });
      expect(screen.getByText("Apply Sheet update")).toBeInTheDocument();
      expect(screen.queryByText(/Request access/i)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("BEH-S160-4: a recognized field update needs no source narrative", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "proposed", proposal: fieldProposal() }),
    );
    renderPanel();
    fireEvent.click(screen.getByText("Correct an operating Sheet field"));
    fireEvent.change(screen.getByLabelText("Field to update"), {
      target: { value: "market_value" },
    });
    fireEvent.change(screen.getByLabelText("New value"), { target: { value: "1475" } });
    expect(screen.getByLabelText(/Note about this value/)).not.toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Preview Sheet field update" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodyOf(0)).toEqual({
      operation: "propose",
      workspaceContext: CONTEXT,
      intent: "update_field",
      expectedPriorPreviewHash: null,
      fieldIntent: { field: "market_value", value: 1475 },
    });
  });
});

describe("S159 Sheet state is stated on the Sheet update only", () => {
  it("BEH-S159-1/6: a refused update is reported beside the update and the working value stays editable", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error:
            "The operating Sheet could not be read just now, so this update was not prepared. Nothing else on this lease waits on it.",
          error_type: "source_unavailable",
        },
        409,
      ),
    );
    renderPanel();
    fireEvent.click(screen.getByText("Correct an operating Sheet field"));
    fireEvent.change(screen.getByLabelText("Field to update"), {
      target: { value: "current_rent" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "Preview the Sheet update from the working current rent",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/could not be read just now/),
    );
    expect(screen.getByLabelText("Working current rent")).not.toBeDisabled();
  });

  it("BEH-S159-1, AC-S159-1: while Sheet updates are off the panel says so locally and keeps the working value usable", () => {
    renderPanel({ writebackPaused: true });
    expect(screen.getByRole("article")).toHaveTextContent(/Sheet updates are off/);
    fireEvent.click(screen.getByText("Correct an operating Sheet field"));
    fireEvent.change(screen.getByLabelText("Field to update"), {
      target: { value: "current_rent" },
    });
    expect(screen.getByLabelText("Working current rent")).not.toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: "Preview the Sheet update from the working current rent",
      }),
    ).toBeDisabled();
  });

  it("BEH-S158-10: a selected location that cannot be updated is explained here, and no row is offered to add", () => {
    renderPanel({
      association: {
        kind: "operator_selected",
        via: "row",
        tabTitle: "Archive 2025",
        rowNumber: 9,
        limit: "other_tab",
      },
      initialFieldValues: undefined,
    });
    const panel = screen.getByRole("article");
    expect(panel).toHaveTextContent(/stays readable/);
    expect(screen.queryByText("Add Sheet row")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Correct an operating Sheet field"),
    ).not.toBeInTheDocument();
  });

  it("AC-S159-1: an unresolved row match points to the lookup instead of stopping at the Sheet", () => {
    renderPanel({
      association: {
        kind: "ambiguous",
        reason: "plausible_unlinked_row",
        rowNumbers: [7],
      },
      initialFieldValues: undefined,
    });
    expect(screen.getByRole("article")).toHaveTextContent(
      /choose this lease's row under Operating Sheet lookup in Lease information/,
    );
  });
});
