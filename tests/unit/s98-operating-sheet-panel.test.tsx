// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  OperatingSheetPanel,
  type SheetWritebackEffectStatus,
} from "@/components/lease-renewal/OperatingSheetPanel";
import type { SheetWritebackClientProposal } from "@/lib/lease-renewal/sheet-writeback/client-projection";

const fetchMock = vi.fn();

function appendProposal(
  overrides: Partial<SheetWritebackClientProposal> = {},
): SheetWritebackClientProposal {
  return {
    spreadsheet_id: "sheet-live-1",
    tab_title: "Lease Renewal",
    actor_email: "editor@pmikcmetro.com",
    source_read_at: "2026-09-01T12:00:00.000Z",
    evidence_ref: "workspace:115",
    preview_hash: "c".repeat(64),
    created_at: "2026-09-01T12:00:00.000Z",
    confirmation_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    effects: [
      {
        index: 0,
        action_key: "google_sheets.renewal_checklist.row_append",
        kind: "row_append",
        effect_hash: "d".repeat(64),
        effect: {
          kind: "row_append",
          mode: "normal",
          operationId: "op-12345678",
          leaseId: "115",
          propertyId: "84",
          tenantName: "Fresh Real Tenant",
          fields: {},
        },
        reversal_kind: "delete_appended_row",
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
  }));
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () => payload,
  };
}

describe("S98 operating-sheet panel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers only the append form when the lease has no Sheet row", () => {
    render(
      <OperatingSheetPanel
        hasSheetRow={false}
        initialProposal={null}
        leaseId="115"
        role="Editor"
      />,
    );
    expect(screen.getByText("Add Sheet row")).toBeInTheDocument();
    expect(screen.queryByText("Update in Sheet")).not.toBeInTheDocument();
    expect(screen.getByText(/no exact Sheet row/i)).toBeInTheDocument();
  });

  it("offers only the field-update form when the lease has an exact Sheet row", () => {
    render(
      <OperatingSheetPanel
        hasSheetRow
        initialProposal={null}
        leaseId="115"
        role="Editor"
        sheetRowNumber={41}
      />,
    );
    expect(screen.getByText("Update in Sheet")).toBeInTheDocument();
    expect(screen.queryByText("Add Sheet row")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Exact Sheet row number")).toHaveValue("41");
  });

  it("submits an append proposal with the exact typed body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "proposed", proposal: appendProposal() }),
    );
    render(
      <OperatingSheetPanel
        hasSheetRow={false}
        initialProposal={null}
        leaseId="115"
        role="Editor"
        tenantNameSuggestion="Fresh Real Tenant"
      />,
    );
    fireEvent.click(screen.getByText("Save proposal from fresh Sheet state"));
    await waitFor(() => {
      expect(
        screen.getByText(/Proposal saved from the fresh Sheet header/),
      ).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      operation: "propose",
      evidenceRef: "workspace:115",
      effects: [
        {
          kind: "row_append",
          leaseId: "115",
          tenantName: "Fresh Real Tenant",
          fields: {},
        },
      ],
    });
  });

  it("keeps execution behind a separate two-step confirmation for Admins", async () => {
    const proposal = appendProposal();
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
    render(
      <OperatingSheetPanel
        hasSheetRow={false}
        initialProposal={proposal}
        leaseId="115"
        role="Admin"
      />,
    );
    expect(screen.queryByText("Confirm this exact effect once")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Review and confirm…"));
    fireEvent.click(screen.getByText("Confirm this exact effect once"));
    await waitFor(() => {
      expect(
        screen.getByText(/Applied to the operating Sheet with a receipt/),
      ).toBeInTheDocument();
    });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toEqual({
      operation: "execute",
      previewHash: proposal.preview_hash,
      effectHash: proposal.effects[0].effect_hash,
      confirm: true,
    });
  });

  it("shows reconciliation without a retry control on an ambiguous outcome", () => {
    const proposal = appendProposal();
    render(
      <OperatingSheetPanel
        hasSheetRow={false}
        initialEffects={statusFor(proposal, "ambiguous")}
        initialProposal={proposal}
        leaseId="115"
        role="Admin"
      />,
    );
    expect(screen.getByText(/The Sheet outcome is unproven/)).toBeInTheDocument();
    expect(screen.getByText("Reconcile from Sheet state")).toBeInTheDocument();
    expect(screen.queryByText("Review and confirm…")).not.toBeInTheDocument();
    expect(screen.queryByText(/retry/i)).not.toBeInTheDocument();
  });

  it("requires a separate preview and confirmation for the receipted reversal", async () => {
    const proposal = appendProposal();
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "reversal_preview",
        reversal: {
          reversalExecutionId: "rev-1",
          forwardExecutionId: "fwd-1",
          previewHash: "e".repeat(64),
          expiresAtIso: new Date(Date.now() + 5 * 60_000).toISOString(),
          kind: "delete_appended_row",
          currentRowNumber: 41,
        },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "reversed", duplicate: false, receipt: {} }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "ok", proposal, effects: statusFor(proposal, "succeeded") }),
    );
    render(
      <OperatingSheetPanel
        hasSheetRow={false}
        initialEffects={statusFor(proposal, "succeeded")}
        initialProposal={proposal}
        leaseId="115"
        role="Admin"
      />,
    );
    expect(
      screen.queryByText("Confirm the reversal exactly once"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Review reversal…"));
    await waitFor(() => {
      expect(screen.getByText("Confirm the reversal exactly once")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Confirm the reversal exactly once"));
    await waitFor(() => {
      expect(
        screen.getByText("Reversal applied with its own receipt."),
      ).toBeInTheDocument();
    });
    const [, executeInit] = fetchMock.mock.calls[1] as [string, { body: string }];
    const executeBody = JSON.parse(executeInit.body) as Record<string, unknown>;
    expect(executeBody.operation).toBe("reverse_execute");
    expect(executeBody.confirm).toBe(true);
    expect((executeBody.reversal as Record<string, unknown>).reversalExecutionId).toBe(
      "rev-1",
    );
  });

  it("announces a declined write as an alert without changing state", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: "The write flag is off.", error_type: "action_not_production_allowed" },
        409,
      ),
    );
    const proposal = appendProposal();
    render(
      <OperatingSheetPanel
        hasSheetRow={false}
        initialProposal={proposal}
        leaseId="115"
        role="Admin"
      />,
    );
    fireEvent.click(screen.getByText("Review and confirm…"));
    fireEvent.click(screen.getByText("Confirm this exact effect once"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("The write flag is off.");
    });
  });

  it("hands non-Admin roles to the exact execute access-request surface", () => {
    const proposal = appendProposal();
    for (const role of ["Editor", "Approver"] as const) {
      const { unmount } = render(
        <OperatingSheetPanel
          hasSheetRow={false}
          initialProposal={proposal}
          leaseId="115"
          role={role}
        />,
      );
      expect(screen.getByText("Add Sheet row")).toBeInTheDocument();
      expect(
        screen.getByText(/Executing this Sheet write is an Admin action/),
      ).toBeInTheDocument();
      expect(screen.queryByText("Review and confirm…")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("marks an expired proposal and offers no confirmation control", () => {
    const proposal = appendProposal({
      confirmation_expires_at: new Date(Date.now() - 60_000).toISOString(),
    });
    render(
      <OperatingSheetPanel
        hasSheetRow={false}
        initialProposal={proposal}
        leaseId="115"
        role="Admin"
      />,
    );
    expect(screen.getByText(/confirmation window has expired/)).toBeInTheDocument();
    expect(screen.queryByText("Review and confirm…")).not.toBeInTheDocument();
  });
});
