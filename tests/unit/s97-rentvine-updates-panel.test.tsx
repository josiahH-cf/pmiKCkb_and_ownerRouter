// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

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
    routerRefresh.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows Review RentVine updates only when a typed proposal has a change", () => {
    const { unmount } = render(
      <RentvineUpdatesPanel
        initialHistory={[]}
        initialProposal={null}
        leaseId="4821"
        role="Editor"
      />,
    );
    expect(screen.queryByText("Review RentVine updates")).not.toBeInTheDocument();
    expect(screen.getByText("Prepare a RentVine update proposal")).toBeInTheDocument();
    unmount();

    const reviewed = datesProposal();
    render(
      <RentvineUpdatesPanel
        initialEffects={statusFor(reviewed, "not_started")}
        initialProposal={reviewed}
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
    const reviewed = datesProposal();
    render(
      <RentvineUpdatesPanel
        initialEffects={statusFor(reviewed, "not_started")}
        initialProposal={reviewed}
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
    expect(routerRefresh).toHaveBeenCalledTimes(1);
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

  it("refreshes visible lease facts after forward reconciliation", async () => {
    const proposal = datesProposal();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "reconciled",
          receipt: { provider_ref: "s97-lease:4821", result_hash: "e".repeat(64) },
          projection: "projected",
          source_refresh: { status: "current", complete: true },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "ok",
          proposal,
          effects: statusFor(proposal, "succeeded"),
          lifecycle_locked: false,
          history: [],
        }),
      });
    render(
      <RentvineUpdatesPanel
        initialEffects={statusFor(proposal, "ambiguous")}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    fireEvent.click(screen.getByText("Reconcile from provider state"));
    await waitFor(() => expect(routerRefresh).toHaveBeenCalledTimes(1));
  });

  it("keeps replacement and discard locked while durable status is unknown or unresolved", () => {
    const proposal = datesProposal();
    const unresolved = render(
      <RentvineUpdatesPanel
        initialEffects={statusFor(proposal, "running")}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    expect(screen.getByText(/Replacement and discard stay unavailable/)).toBeVisible();
    fireEvent.click(screen.getByText("Prepare a RentVine update proposal"));
    expect(
      screen.getByRole("button", { name: "Save proposal from fresh RentVine state" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Discard the saved proposal" }),
    ).toBeDisabled();
    unresolved.unmount();

    fetchMock.mockReturnValueOnce(new Promise(() => undefined));
    render(
      <RentvineUpdatesPanel initialProposal={proposal} leaseId="4821" role="Admin" />,
    );
    expect(screen.getByText(/Checking durable status/)).toBeVisible();
    expect(screen.queryByText("Review and confirm…")).not.toBeInTheDocument();
  });

  it("keeps replacement and discard locked while a reversal is unresolved", () => {
    const proposal = datesProposal();
    const statuses = statusFor(proposal, "succeeded");
    statuses[0].reversal_state = "ambiguous";
    render(
      <RentvineUpdatesPanel
        initialEffects={statuses}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    expect(screen.getByText(/Replacement and discard stay unavailable/)).toBeVisible();
    fireEvent.click(screen.getByText("Prepare a RentVine update proposal"));
    expect(
      screen.getByRole("button", { name: "Save proposal from fresh RentVine state" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Discard the saved proposal" }),
    ).toBeDisabled();
  });

  it("loads immutable completed history even when no active proposal remains", async () => {
    const archivedProposal = datesProposal();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        proposal: null,
        effects: [],
        lifecycle_locked: false,
        history: [
          {
            generation_preview_hash: archivedProposal.preview_hash,
            archived_at: "2026-09-02T12:05:00.000Z",
            archived_reason: "discard",
            proposal: archivedProposal,
            effects: statusFor(archivedProposal, "succeeded"),
          },
        ],
      }),
    });
    render(<RentvineUpdatesPanel initialProposal={null} leaseId="4821" role="Admin" />);
    expect(await screen.findByText("Completed update recovery history")).toBeVisible();
    fireEvent.click(screen.getByText(/Generation archived/));
    expect(screen.getByText(/Applied with receipt/)).toBeVisible();
    expect(screen.getByText("Review archived reversal…")).toBeVisible();
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
    expect(previewBody.previewHash).toBe(proposal.preview_hash);
  });

  it("refreshes the visible workspace after a confirmed reversal", async () => {
    const proposal = datesProposal();
    fetchMock
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "reversed",
          duplicate: false,
          receipt: { provider_ref: "lease:4821", result_hash: "e".repeat(64) },
          source_refresh: { status: "current", complete: true },
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
        initialEffects={statusFor(proposal, "succeeded")}
        initialProposal={proposal}
        leaseId="4821"
        role="Admin"
      />,
    );
    fireEvent.click(screen.getByText("Review reversal…"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm the reversal exactly once" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/Reversal applied with its own receipt/),
      ).toBeInTheDocument(),
    );
    expect(routerRefresh).toHaveBeenCalledTimes(1);
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
    render(
      <RentvineUpdatesPanel
        initialHistory={[]}
        initialProposal={null}
        leaseId="4821"
        role="Editor"
      />,
    );
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
    expect(body.expectedPriorPreviewHash).toBeNull();
    expect(body.effects).toEqual([
      { kind: "renewal_dates_update", after: { endDate: "2027-08-31" } },
    ]);
  });
});
