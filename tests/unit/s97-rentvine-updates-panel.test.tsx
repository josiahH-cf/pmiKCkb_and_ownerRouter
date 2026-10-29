// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
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
import { formatBusinessTimestamp } from "@/lib/date-display";
import { RenewalManualProvider } from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalWorkingRecordProvider } from "@/components/lease-renewal/RenewalWorkingRecord";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";

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
    expect(screen.getByText("No RentVine update is prepared.")).toBeVisible();
    expect(document.body.textContent).not.toMatch(
      /Prepare one below with the exact changes|Enter only the exact changes\. Saving reads/,
    );
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
    // S117 (R117.3): the decision-point preview reads in business words, not field keys.
    expect(screen.getByText("ends 08/31/2026")).toBeInTheDocument();
    expect(screen.getByText("ends 08/31/2027")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Lease start date stays 09/01/2025; no other lease field changes.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reversal available: restore the receipted prior dates."),
    ).toBeInTheDocument();
  });

  it("loads missing durable history through a genuine GET without a mutation request", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "ok", proposal: null, effects: [], history: [] }),
    });
    render(<RentvineUpdatesPanel initialProposal={null} leaseId="4821" role="Admin" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/lease-renewal/rentvine-writeback?leaseId=4821",
      { method: "GET", cache: "no-store", signal: expect.any(AbortSignal) },
    );
  });

  it("finishes its durable status read when React runs the effect twice", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ status: "ok", proposal: null, effects: [], history: [] }),
    }));
    render(
      <StrictMode>
        <RentvineUpdatesPanel initialProposal={null} leaseId="4821" role="Admin" />
      </StrictMode>,
    );
    await waitFor(() => expect(screen.queryByText("Working…")).not.toBeInTheDocument());
    expect(
      screen.getByRole("button", {
        name: "Save proposal from fresh RentVine state",
        hidden: true,
      }),
    ).toBeEnabled();
    expect(
      fetchMock.mock.calls.every(([, init]) => (init as RequestInit).method === "GET"),
    ).toBe(true);
  });

  it("states a refused durable status read and stops waiting when React runs the effect twice", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      json: async () => ({
        error:
          "A Live provider action requires the Production environment with Live data.",
        error_type: "environment_context_not_allowed",
      }),
    }));
    render(
      <StrictMode>
        <RentvineUpdatesPanel initialProposal={null} leaseId="4821" role="Admin" />
      </StrictMode>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "A Live provider action requires the Production environment with Live data.",
    );
    await waitFor(() => expect(screen.queryByText("Working…")).not.toBeInTheDocument());
  });

  it("S160 BEH-S160-1/4 (S156 BEH-S156-7): an Editor reaches the one-action exact update with no access handoff, approval or attestation", () => {
    const reviewed = datesProposal();
    render(
      <RentvineUpdatesPanel
        initialEffects={statusFor(reviewed, "not_started")}
        initialProposal={reviewed}
        leaseId="4821"
        role="Editor"
      />,
    );
    // S160 (cafa02a7): the panel projects the same `execute_source_write` row the route enforces,
    // so the Editor sees the confirmation rather than an Admin handoff.
    expect(screen.queryByText(/Admin action/)).not.toBeInTheDocument();
    expect(screen.queryByText(/needs Editor access/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Request access" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Apply RentVine update")).toBeInTheDocument();
    expect(screen.queryByText("Confirm this exact effect once")).not.toBeInTheDocument();
    // The control sequence is review, then one exact confirmation: no checkbox stands in for a
    // removed business approval.
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(
      screen.queryByText(/I attest|I confirm that|approved by/i),
    ).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses one visible Apply action and posts the exact hashes once", async () => {
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
    fireEvent.click(screen.getByText("Apply RentVine update"));
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
    expect(screen.queryByText("Apply RentVine update")).not.toBeInTheDocument();
    // S237 R-S237-7: the locked state, no retry and the named recovery route, with no archive control.
    const locked = document.querySelector(
      '[data-renewal-field="ambiguous-locked-state"]',
    );
    expect(locked).toHaveTextContent(/Nothing is retried automatically/);
    expect(locked).toHaveTextContent(/stay locked while this attempt is uncertain/);
    expect(locked).toHaveTextContent(/engineering readback and a manual clear/);
    expect(screen.queryByRole("button", { name: /archive/i })).toBeNull();
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
    expect(screen.queryByText("Apply RentVine update")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Apply RentVine update"));
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
  it("uses the verified billing item and one changed amount without asking for provider ids", async () => {
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
        initialInventory={{
          leaseId: "4821",
          asOfDate: "2026-09-10",
          leaseDates: {
            startDate: "2025-09-01",
            endDate: "2026-08-31",
            increaseEligibilityDate: null,
          },
          charges: [
            {
              id: "301",
              accountId: "9",
              accountLabel: "Residential rent",
              classification: "rent",
              current: true,
              projection: {
                leaseRecurringChargeID: "301",
                leaseID: "4821",
                accountID: "9",
                amount: "1200",
                description: "Rent",
                dayDue: "1",
                frequency: "1",
                startDate: "01/01/2026",
                endDate: null,
                isMoveInCharge: "0",
                isFromImport: "0",
                nextChargeDate: null,
                rentIncreaseID: null,
                importSourceKey: null,
                recurringStatusID: 1,
              },
            },
          ],
        }}
      />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Prepare a RentVine update proposal"));
    expect(screen.queryByLabelText("Charge id")).toBeNull();
    expect(screen.queryByLabelText("Account id")).toBeNull();
    fireEvent.change(screen.getByLabelText("Billing correction"), {
      target: { value: "current_base" },
    });
    fireEvent.change(screen.getByLabelText("Recurring charge to correct"), {
      target: { value: "301" },
    });
    const amount = screen.getByLabelText("Amount (e.g. 1450.00)", {
      selector: "input:not(:disabled)",
    });
    expect(amount).toHaveValue(1200);
    fireEvent.change(amount, { target: { value: "1250" } });
    fireEvent.click(screen.getByText("Save proposal from fresh RentVine state"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.businessIntent).toBe("current_base");
    expect(body.effects).toEqual([
      { kind: "recurring_charge_update", chargeId: "301", changes: { amount: "1250" } },
    ]);
  });
});

/** A Working rent saved again (revision 2) after the owner approved revision 1. */
const S237_BASIS_INPUTS = {
  working: {
    schemaVersion: "renewal-working-record/v1" as const,
    leaseId: "4821",
    revision: 4,
    fields: Object.fromEntries(
      (
        [
          ["terms_rent", 1750, 2, "2026-10-20T15:00:00.000Z"],
          ["terms_effective_date", "2026-12-01", 1, "2026-10-20T15:01:00.000Z"],
          ["terms_end_date", "2027-11-30", 1, "2026-10-20T15:02:00.000Z"],
        ] as const
      ).map(([field, value, revision, recordedAt]) => [
        field,
        {
          value,
          revision,
          eventId: `${field}-${revision}`,
          recordedAt,
          recordedByUid: "editor-1",
          recordedByLabel: "editor1@pmikcmetro.com",
          origin: "staff_entry" as const,
        },
      ]),
    ),
  },
  workspace: {
    ...emptyRenewalWorkspace("4821", "1c0a4d7e-7d3b-4a6e-9f4c-2a5f9e6b8d10", {
      kind: "lease_end",
      dateIso: "2026-11-30",
      source: "RentVine lease end",
    }),
    termsRevision: 1,
    ownerResponse: {
      eventId: "approval",
      actorUid: "editor-1",
      recordedAt: "2026-10-21T15:00:00.000Z",
      source: "Staff record",
      termsRevision: 1,
      outcome: "approved_terms" as const,
      approvedWorkingTerms: {
        rent: 1750,
        effectiveDate: "2026-12-01",
        endDate: "2027-11-30",
        fieldRevisions: { rent: 1, effectiveDate: 1, endDate: 1 },
        economicsHash: "e".repeat(64),
        chargePolicyVersion: null,
      },
    },
  },
  economicsHash: "e".repeat(64),
  returned: null,
};

describe("S237 R-S237-1 terms basis beside the preview", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  it("shows the Working terms, approval coverage and executed documents and posts the same exact body", async () => {
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
        termsBasisInputs={S237_BASIS_INPUTS}
      />,
    );
    const basis = document.querySelector('[data-renewal-field="terms-basis"]');
    expect(basis).toHaveTextContent(
      `Working renewal terms revision 2, saved ${formatBusinessTimestamp("2026-10-20T15:02:00.000Z")}. Owner approval no longer covers these terms: the Working rent changed after it was recorded. Executed documents: Not recorded. Shown for review only; it does not change this update.`,
    );
    // The basis is never a prerequisite: Apply stays available and posts only the exact hashes.
    fireEvent.click(screen.getByText("Apply RentVine update"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)).toEqual({
      operation: "execute",
      leaseId: "4821",
      previewHash: proposal.preview_hash,
      effectHash: proposal.effects[0].effect_hash,
      confirm: true,
    });
  });

  it("PR #163 review: recomputes the basis and what still differs from a Working terms save without a page refresh", () => {
    const CYCLE = S237_BASIS_INPUTS.workspace.cycleId;
    const record = (
      revision: number,
      rentRevision: number,
      endDate: string,
      endRevision: number,
    ) => ({
      ...S237_BASIS_INPUTS.working,
      revision,
      fields: {
        ...S237_BASIS_INPUTS.working.fields,
        terms_rent: {
          ...S237_BASIS_INPUTS.working.fields.terms_rent,
          revision: rentRevision,
        },
        terms_end_date: {
          ...S237_BASIS_INPUTS.working.fields.terms_end_date,
          value: endDate,
          revision: endRevision,
        },
      },
    });
    const approvedTerms = record(3, 1, "2027-11-30", 1);
    // The page's server reads: the approval covers these terms and the packet names them.
    const basisInputs = {
      ...S237_BASIS_INPUTS,
      working: approvedTerms,
      returned: {
        unavailable: null,
        signaturesComplete: true,
        overall: "Fully executed",
        packetTermsCurrent: true,
        packetTermsBasis: {
          cycleId: CYCLE,
          sourceVersions: [
            {
              system: "staff_recorded_owner_approval",
              reference: `renewal-cycle:${CYCLE}:working-terms:1.1.1`,
              retrievedAt: "2026-10-21T15:00:00.000Z",
              version: "1",
            },
          ],
          createdAt: "2026-10-22T15:00:00.000Z",
        },
      },
    };
    const differencesInputs = {
      working: approvedTerms,
      workspace: S237_BASIS_INPUTS.workspace,
      rentvine: {
        inventory: {
          leaseId: "4821",
          leaseDates: {
            startDate: "2025-12-01",
            endDate: "2027-11-30",
            increaseEligibilityDate: null,
          },
          asOfDate: "2026-10-22",
          charges: [],
        },
        readAt: "2026-10-22T16:00:00.000Z",
      },
      sheet: null,
    };
    const panel = (
      <RentvineUpdatesPanel
        initialEffects={statusFor(datesProposal(), "not_started")}
        initialProposal={datesProposal()}
        leaseId="4821"
        role="Admin"
        termsBasisInputs={basisInputs}
        remainingDifferencesInputs={differencesInputs}
      />
    );
    const tree = (working: ReturnType<typeof record>) => (
      <RenewalWorkingRecordProvider canEdit initialRecord={working} leaseId="4821">
        <RenewalManualProvider initialState={S237_BASIS_INPUTS.workspace} leaseId="4821">
          {panel}
        </RenewalManualProvider>
      </RenewalWorkingRecordProvider>
    );
    const view = render(tree(approvedTerms));
    const basis = () =>
      document.querySelector('[data-renewal-field="terms-basis"]')?.textContent ?? "";
    const endRow = () =>
      document.querySelector('[data-renewal-difference="lease_end_date"]')?.textContent ??
      "";
    expect(basis()).toContain("Owner approval covers these terms and charges");
    expect(basis()).toContain(
      "Executed documents: Fully executed by staff record, not provider-verified",
    );
    expect(endRow()).toMatch(/Lease end date: 2027-11-30; source 2027-11-30 .*Matches\./);
    // Staff save the Working rent again and a new end date; the page's server reads are unchanged.
    view.rerender(tree(record(5, 2, "2027-12-31", 2)));
    expect(basis()).toContain(
      "Owner approval no longer covers these terms: the Working rent and end date changed after it was recorded",
    );
    expect(basis()).toContain(
      "Executed documents: signatures are for earlier Working terms",
    );
    expect(endRow()).toMatch(/Lease end date: 2027-12-31; source 2027-11-30 .*Differs\./);
  });
});
