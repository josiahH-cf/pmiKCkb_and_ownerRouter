// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SYNTHETIC_APPROVAL } from "../helpers/owner-approval";
import { SYNTHETIC_APPROVAL_CHOICES } from "../helpers/owner-approval-form";
import {
  RenewalManualProvider,
  RenewalManualSection,
} from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { buildRenewalEvidenceReference } from "@/lib/lease-renewal/renewal-process";
import {
  emptyRenewalWorkspace,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S234 R-S234-2/4/5 on the mounted screens: a disagreeing earlier owner record is named, the
// owner's requested change travels with "Revision requested" and the next step says to update the
// terms and ask again, and a tenant answer recorded before the terms changed says so.

vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const CYCLE = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const META = { actorUid: "operator", recordedAt: "2026-09-10T12:00:00.000Z" };
let event = 0;
function apply(state: RenewalWorkspaceState, action: RenewalWorkspaceAction) {
  return planRenewalWorkspaceAction(state, action, { ...META, eventId: `e${++event}` });
}
const initial = () =>
  emptyRenewalWorkspace("701", CYCLE, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
const outreachDone = () =>
  apply(initial(), {
    kind: "activity",
    activity: "owner_outreach",
    outcome: "done",
    source: "Owner call",
  });

describe("S234 owner outcome screens", () => {
  it("R-S234-4: saves the owner's requested change with Revision requested and suggests updating the terms", async () => {
    let state = apply(outreachDone(), {
      kind: "owner_response",
      outcome: "revision_requested",
    });
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      state = planRenewalWorkspaceAction(state, body.action, {
        ...META,
        eventId: body.operationId,
      });
      return Response.json({ state });
    });
    vi.stubGlobal("fetch", request);
    render(
      <RenewalManualProvider
        leaseId="701"
        initialState={state}
        ownerApproval={SYNTHETIC_APPROVAL_CHOICES}
      >
        <RenewalManualSection section="owner" />
      </RenewalManualProvider>,
    );
    expect(
      screen.getByRole("link", {
        name: "Suggested next: Update the working terms and ask the owner again",
      }),
    ).toHaveAttribute("href", "#renewal-manual-owner_response");
    const note = screen.getByLabelText("What the owner asked to change");
    fireEvent.change(note, { target: { value: "Owner asked for a lower rent." } });
    fireEvent.blur(note);
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String(request.mock.calls[0][1]?.body)).action).toEqual({
      kind: "owner_response",
      outcome: "revision_requested",
      reason: "Owner asked for a lower rent.",
    });
    await waitFor(() =>
      expect(state.ownerResponse?.reason).toBe("Owner asked for a lower rent."),
    );
    // Blurring again without a change saves nothing more.
    fireEvent.blur(screen.getByLabelText("What the owner asked to change"));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("R-S234-4: shows no revision note for other owner responses", () => {
    render(
      <RenewalManualProvider
        leaseId="701"
        initialState={apply(outreachDone(), {
          kind: "owner_response",
          outcome: "no_response",
        })}
        ownerApproval={SYNTHETIC_APPROVAL_CHOICES}
      >
        <RenewalManualSection section="owner" />
      </RenewalManualProvider>,
    );
    expect(screen.queryByLabelText("What the owner asked to change")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Suggested next: Record owner response" }),
    ).toBeInTheDocument();
  });

  it("R-S234-5: says a tenant answer recorded before the terms changed does not answer them", () => {
    let state = apply(outreachDone(), {
      kind: "activity",
      activity: "tenant_offer",
      outcome: "done",
      source: "Tenant email",
    });
    state = apply(state, {
      kind: "tenant_response",
      outcome: "accepted",
      source: "Tenant call",
    });
    state = apply(state, {
      kind: "owner_response",
      outcome: "approved_terms",
      approval: SYNTHETIC_APPROVAL,
    });
    render(
      <RenewalManualProvider
        leaseId="701"
        initialState={state}
        ownerApproval={SYNTHETIC_APPROVAL_CHOICES}
      >
        <RenewalManualSection section="tenant" />
      </RenewalManualProvider>,
    );
    expect(
      screen.getByText(
        /Recorded before the terms changed; it does not answer the current terms\./,
      ),
    ).toBeInTheDocument();
    // Tenant acceptance is never shown as the owner's approval.
    expect(screen.queryByText(/Approved by/)).toBeNull();
  });

  it("R-S234-2: names an earlier owner record that disagrees with the staff record", () => {
    const sample = getRenewalLeaseWorkspace("lease-318-cedar-7");
    if (!sample) throw new Error("Missing sample workspace.");
    const workspace = {
      ...sample,
      live: {
        leaseId: "701",
        ownerDecision: null,
        ownerDecisionCurrent: false,
        ownerOutcome: {
          state: "revision_requested" as const,
          evidence: buildRenewalEvidenceReference({
            ref: "fixture:owner-response",
            source: "gmail_receipt",
            disposition: "verified",
          }),
        },
        ownerResponseRecordable: true,
        tenantOfferDraftId: null,
        tenantOutcome: null,
        processVersion: sample.process.version,
        complete: false,
      },
    };
    const approved = apply(outreachDone(), {
      kind: "owner_response",
      outcome: "approved_terms",
      approval: SYNTHETIC_APPROVAL,
    });
    const view = render(
      <RenewalWorkspace
        workspace={{
          ...workspace,
          summary: { ...workspace.summary, endDateIso: "2026-12-31" },
        }}
        manualState={approved}
        selectedStepId="owner-decision"
      />,
    );
    const conflict = view.container.querySelector(
      '[data-renewal-field="owner-outcome-conflict"]',
    );
    expect(conflict).toHaveTextContent(
      "Earlier owner record differs — review: the earlier owner decision record says revision requested; the staff record says approved. This lease uses the staff record.",
    );
    view.unmount();
    // The same records in agreement show no conflict.
    const agreeing = render(
      <RenewalWorkspace
        workspace={{
          ...workspace,
          summary: { ...workspace.summary, endDateIso: "2026-12-31" },
          live: {
            ...workspace.live,
            ownerOutcome: {
              ...workspace.live.ownerOutcome,
              state: "approved_terms" as const,
            },
          },
        }}
        manualState={approved}
        selectedStepId="owner-decision"
      />,
    );
    expect(
      agreeing.container.querySelector('[data-renewal-field="owner-outcome-conflict"]'),
    ).toBeNull();
  });
});
