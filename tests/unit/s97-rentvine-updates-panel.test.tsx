// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RentvineUpdatesPanel,
  type RentvineWritebackEffectStatus,
} from "@/components/lease-renewal/RentvineUpdatesPanel";
import type { RentvineWritebackClientProposal } from "@/lib/lease-renewal/writeback/client-projection";

const fetchMock = vi.fn();

function datesProposal(
  overrides: Partial<RentvineWritebackClientProposal> = {},
): RentvineWritebackClientProposal {
  return {
    lease_id: "4821",
    account: "pmikcmetro",
    actor_uid: "editor-1",
    actor_email: "editor@pmikcmetro.com",
    lease_state: {
      startDate: "2025-09-01",
      endDate: "2026-08-31",
      increaseEligibilityDate: null,
    },
    source_read_at: "2026-09-01T12:00:00.000Z",
    evidence_ref: "workspace:4821",
    preview_hash: "c".repeat(64),
    created_at: "2026-09-01T12:00:00.000Z",
    confirmation_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    effects: [
      {
        index: 0,
        action_key: "rentvine.lease.renewal_dates.update",
        kind: "renewal_dates_update",
        effect_hash: "d".repeat(64),
        effect: {
          kind: "renewal_dates_update",
          before: {
            startDate: "2025-09-01",
            endDate: "2026-08-31",
            increaseEligibilityDate: null,
          },
          after: { endDate: "2027-08-31" },
        },
        reversal_kind: "restore_dates",
      },
    ],
    ...overrides,
  };
}

function statusFor(
  proposal: RentvineWritebackClientProposal,
  state: string,
): RentvineWritebackEffectStatus[] {
  return proposal.effects.map((effect) => ({
    ...effect,
    execution_id: `s97:${proposal.lease_id}:${effect.effect_hash}`,
    state,
    attempt_count: state === "not_started" ? 0 : 1,
    reversal_state: null,
  }));
}

describe("S97 RentVine updates panel", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows Review RentVine updates only when a typed proposal has a change", () => {
    const { unmount } = render(
      <RentvineUpdatesPanel initialProposal={null} leaseId="4821" role="Editor" />,
    );
    expect(screen.queryByText("Review RentVine updates")).not.toBeInTheDocument();
    expect(screen.getByText("Prepare a RentVine update proposal")).toBeInTheDocument();
    unmount();

    render(
      <RentvineUpdatesPanel
        initialProposal={datesProposal()}
        leaseId="4821"
        role="Editor"
      />,
    );
    expect(screen.getByText("Review RentVine updates")).toBeInTheDocument();
    expect(screen.getByText("endDate: 2026-08-31 → 2027-08-31")).toBeInTheDocument();
    expect(
      screen.getByText("startDate stays 2025-09-01 (copied unchanged)."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reversal available: restore the receipted prior dates."),
    ).toBeInTheDocument();
  });

  it("routes a non-Admin to the access-request handoff instead of execute controls", () => {
    render(
      <RentvineUpdatesPanel
        initialProposal={datesProposal()}
        leaseId="4821"
        role="Editor"
      />,
    );
    expect(
      screen.getByText("Executing this source write is an Admin action.", {
        exact: false,
      }),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Request access" });
    expect(link.getAttribute("href")).toContain(
      "/admin/access?v=1&capability=manageAdmin",
    );
    expect(screen.queryByText("Review and confirm…")).not.toBeInTheDocument();
  });

  it("requires the two-step exact confirmation and posts the exact hashes once", async () => {
    const proposal = datesProposal();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "executed",
          duplicate: false,
          receipt: { provider_ref: "lease:4821", result_hash: "e".repeat(64) },
          projection: "projected",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          proposal,
          effects: statusFor(proposal, "succeeded"),
          expired: false,
        }),
      });
    render(
      <RentvineUpdatesPanel
        initialEffects={statusFor(proposal, "not_started")}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    fireEvent.click(screen.getByText("Review and confirm…"));
    fireEvent.click(screen.getByText("Confirm this exact effect once"));
    await waitFor(() =>
      expect(screen.getByText(/Applied to RentVine with receipt/)).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const executeBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(executeBody).toEqual({
      operation: "execute",
      leaseId: "4821",
      previewHash: proposal.preview_hash,
      effectHash: proposal.effects[0].effect_hash,
      confirm: true,
    });
  });

  it("shows Needs reconciliation with last-known observations and no Retry control", () => {
    const proposal = datesProposal();
    render(
      <RentvineUpdatesPanel
        initialEffects={statusFor(proposal, "ambiguous")}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    expect(screen.getByText(/Needs reconciliation/)).toBeInTheDocument();
    expect(
      screen.getByText(/may report before, after, or drift without claiming causality/),
    ).toBeInTheDocument();
    expect(screen.getByText("Reconcile from provider state")).toBeInTheDocument();
    expect(screen.queryByText(/Retry/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Review and confirm…")).not.toBeInTheDocument();
  });

  it("keeps reversal a separately previewed and confirmed action", async () => {
    const proposal = datesProposal();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "reversal_preview",
        reversal: {
          reversalExecutionId: "s97:4821:reversal",
          forwardExecutionId: "s97:4821:forward",
          previewHash: "f".repeat(64),
          expiresAtIso: new Date(Date.now() + 60_000).toISOString(),
          kind: "restore_dates",
        },
      }),
    });
    render(
      <RentvineUpdatesPanel
        initialEffects={statusFor(proposal, "succeeded")}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    expect(
      screen.queryByText("Confirm the reversal exactly once"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Review reversal…"));
    await waitFor(() =>
      expect(screen.getByText("Confirm the reversal exactly once")).toBeInTheDocument(),
    );
    const previewBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(previewBody.operation).toBe("reverse_preview");
  });

  it("surfaces a declined request as a focusable alert without inventing progress", async () => {
    const proposal = datesProposal();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error:
          'Action "rentvine.lease.renewal_dates.update" is not enabled for execution (production_allowed:false).',
      }),
    });
    render(
      <RentvineUpdatesPanel
        initialEffects={statusFor(proposal, "not_started")}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    fireEvent.click(screen.getByText("Review and confirm…"));
    fireEvent.click(screen.getByText("Confirm this exact effect once"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("not enabled for execution");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets an Editor save a proposal built only from entered exact changes", async () => {
    const proposal = datesProposal();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "proposed", proposal }),
    });
    render(<RentvineUpdatesPanel initialProposal={null} leaseId="4821" role="Editor" />);
    fireEvent.click(screen.getByText("Prepare a RentVine update proposal"));
    fireEvent.change(screen.getByLabelText("New end date (YYYY-MM-DD)"), {
      target: { value: "2027-08-31" },
    });
    fireEvent.click(screen.getByText("Save proposal from fresh RentVine state"));
    await waitFor(() =>
      expect(screen.getByText("Review RentVine updates")).toBeInTheDocument(),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.operation).toBe("propose");
    expect(body.effects).toEqual([
      { kind: "renewal_dates_update", after: { endDate: "2027-08-31" } },
    ]);
  });
});
