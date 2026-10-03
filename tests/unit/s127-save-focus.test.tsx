// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  RenewalSaveFocus,
  useRenewalSaveFocus,
} from "@/components/lease-renewal/RenewalSaveFocus";
import {
  RenewalManualProvider,
  RenewalManualSection,
} from "@/components/lease-renewal/RenewalManualWorkspace";
import { RenewalResourceLocations } from "@/components/lease-renewal/RenewalResourceLocations";
import { focusRenewalDashboardControl } from "@/components/lease-renewal/RenewalDashboardNavigation";
import { buildDeskLeaseGuidance } from "@/lib/lease-renewal/desk-guidance";
import {
  projectRenewalIssues,
  renewalPostSaveFocusTarget,
  RENEWAL_NEXT_ACTION_TARGET_ID,
  type RenewalIssueProjection,
} from "@/lib/lease-renewal/renewal-issues";
import {
  emptyRenewalWorkspace,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
let finishRefresh: () => void;
beforeEach(() => {
  // Model Next's transition staying pending until its RSC response has committed (or failed).
  router.refresh.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});
const metadata = {
  actorUid: "operator",
  recordedAt: "2026-09-29T03:00:00.000Z",
  eventId: "fixture-event",
};
function initial() {
  return planRenewalWorkspaceAction(
    emptyRenewalWorkspace("701", "b4bc3b81-c402-4f62-a2e2-c605c67867fb", {
      kind: "lease_end",
      dateIso: "2026-12-31",
      source: "Fixture reviewed lease end",
    }),
    {
      kind: "activity",
      activity: "owner_outreach",
      outcome: "done",
      source: "Fixture call",
    },
    metadata,
  );
}
function projection(state: RenewalWorkspaceState): RenewalIssueProjection {
  const sample = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
  const summary = {
    ...sample.summary,
    id: "701",
    disposition: "actionable" as const,
    manualProgress: manualRenewalSummary(state),
  };
  return projectRenewalIssues({
    guidance: buildDeskLeaseGuidance({
      summary,
      process: sample.process,
      dataCheck: [],
      rentvineCurrentRent: 1000,
      rentDecision: null,
      currencyState: "fresh",
      readComplete: true,
    }),
    summary,
    readComplete: true,
    currencyState: "fresh",
    progressStateAvailable: true,
    sheetWritebackPaused: true,
  });
}
function manualTree(
  state: RenewalWorkspaceState,
  projected = projection(state),
  readable = true,
  leaseId = "701",
) {
  return (
    <RenewalSaveFocus
      leaseId={leaseId}
      cycleId={state.cycleId}
      revision={state.revision}
      readable={readable}
      projection={projected}
      targetId={renewalPostSaveFocusTarget(projected, "Admin")}
    >
      <div id={RENEWAL_NEXT_ACTION_TARGET_ID} tabIndex={-1}>
        Current next-action readback
      </div>
      <label>
        Unrelated draft note
        <input aria-label="Unrelated draft note" defaultValue="" />
      </label>
      <RenewalManualProvider leaseId="701" initialState={state} writebackPaused>
        <section aria-label="Owner fixture">
          <RenewalManualSection section="owner" />
        </section>
        <section aria-label="Tenant fixture">
          <RenewalManualSection section="tenant" />
        </section>
        <RenewalManualSection section="documents" />
      </RenewalManualProvider>
    </RenewalSaveFocus>
  );
}
/**
 * S155/S156 (0f02e013): the owner response is a select that saves when chosen; there are no exact
 * approved-terms fields and no record button. Working terms live in their own autosaved fields.
 */
function chooseApproval() {
  const owner = within(screen.getByRole("region", { name: "Owner fixture" }));
  const select = owner.getByLabelText("Owner response");
  select.focus();
  fireEvent.change(select, { target: { value: "approved_terms" } });
  return select;
}

/** A consumer that requests the post-save focus with the manual version fence, as a control would. */
function SaveTrigger({ readback }: { readback?: { cycleId: string; revision: number } }) {
  const focusAfterSave = useRenewalSaveFocus();
  return (
    <button
      onClick={() => focusAfterSave?.(readback ? { manual: readback } : {})}
      type="button"
    >
      Simulated app save
    </button>
  );
}

describe("S155 autosaved staff records keep focus and input", () => {
  it("saves the chosen owner response without moving focus, preserves a dirty sibling, and refreshes once", async () => {
    const before = initial();
    let after = before;
    let complete!: () => void;
    const delayed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      expect(body.expectedRevision).toBe(before.revision);
      expect(body.action).toEqual({ kind: "owner_response", outcome: "approved_terms" });
      after = planRenewalWorkspaceAction(before, body.action, {
        ...metadata,
        eventId: body.operationId,
      });
      await delayed;
      return Response.json({ state: after, writeback_paused: true });
    });
    vi.stubGlobal("fetch", fetch);
    const mounted = render(manualTree(before));
    fireEvent.change(screen.getByLabelText("Unrelated draft note"), {
      target: { value: "Keep this unsaved note" },
    });
    const select = chooseApproval();
    expect(select).toHaveFocus();
    expect(select).toHaveValue("approved_terms");
    expect(router.refresh).not.toHaveBeenCalled();
    await act(async () => complete());
    await screen.findByText(
      "Saved. Any listed Sheet update still needs its own confirmation.",
    );
    // S155: no focus move on save; the page refresh is scheduled, never a focus request.
    expect(select).toHaveFocus();
    mounted.rerender(manualTree(after));
    expect(select).toHaveFocus();
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(select).toHaveFocus();
    expect(screen.getByLabelText("Unrelated draft note")).toHaveValue(
      "Keep this unsaved note",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    // S156: the response is the recorded fact alone; no terms are manufactured to hold it.
    expect(after.ownerResponse).toMatchObject({ outcome: "approved_terms" });
    expect(after.ownerResponse?.terms).toBeUndefined();
  });

  it("S156 ARCH-1 / BEH-4: an owner approval recorded without exact terms moves the suggestion on to the tenant offer", () => {
    // The owner response control offers no terms fields (working terms are saved on the lease
    // independently), so the guidance must advance on the recorded approval itself.
    const after = planRenewalWorkspaceAction(
      initial(),
      { kind: "owner_response", outcome: "approved_terms" },
      metadata,
    );
    expect(after.ownerResponse?.terms).toBeUndefined();
    expect(manualRenewalSummary(after).nextActivity).toBe("tenant_offer");
    expect(projection(after).primary.destination).toMatchObject({
      controlId: "renewal-manual-tenant_offer",
    });
  });

  it.each([403, 409, 500])(
    "keeps failed %s save input with a retry and never moves focus",
    async (status) => {
      const state = initial();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({ error: "Review the changed record." }, { status }),
        ),
      );
      const mounted = render(manualTree(state));
      const select = chooseApproval();
      const owner = within(screen.getByRole("region", { name: "Owner fixture" }));
      await owner.findByText(/Your entry is kept\./);
      expect(
        owner.getByRole("button", {
          name: status === 409 ? "Save my entry" : "Try again",
        }),
      ).toBeInTheDocument();
      expect(router.refresh).not.toHaveBeenCalled();
      mounted.rerender(manualTree(state));
      expect(select).toHaveFocus();
      expect(select).toHaveValue("approved_terms");
    },
  );

  it("does not focus from mount or explicit records/history reload", async () => {
    const state = initial();
    const fetch = vi.fn(async () =>
      Response.json({ state, activity: [], writeback_paused: true }),
    );
    vi.stubGlobal("fetch", fetch);
    const mounted = render(manualTree(state));
    expect(router.refresh).not.toHaveBeenCalled();
    const button = screen.getByRole("button", { name: "Reload records and history" });
    button.focus();
    fireEvent.click(button);
    await screen.findByText(
      "Current staff records read back. Your unsaved entries are kept.",
    );
    mounted.rerender(manualTree(state));
    expect(button).toHaveFocus();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("S127 successful app-save focus and authoritative refreshed issues", () => {
  it("waits for the refreshed revision before opening the next unresolved control", async () => {
    // Owner terms are on record; the simulated save records the tenant offer, so the refreshed
    // projection names the tenant response control.
    const before = planRenewalWorkspaceAction(
      initial(),
      {
        kind: "owner_response",
        outcome: "approved_terms",
        terms: { rent: 1250, effectiveDate: "2027-01-01", endDate: "2027-12-31" },
      },
      metadata,
    );
    const after = planRenewalWorkspaceAction(
      before,
      { kind: "activity", activity: "tenant_offer", outcome: "done" },
      metadata,
    );
    const tree = (state: RenewalWorkspaceState) => (
      <RenewalSaveFocus
        leaseId="701"
        cycleId={state.cycleId}
        revision={state.revision}
        readable
        projection={projection(state)}
        targetId={renewalPostSaveFocusTarget(projection(state), "Admin")}
      >
        <div id={RENEWAL_NEXT_ACTION_TARGET_ID} tabIndex={-1}>
          Current next-action readback
        </div>
        <SaveTrigger readback={{ cycleId: after.cycleId, revision: after.revision }} />
        <RenewalManualProvider leaseId="701" initialState={state} writebackPaused>
          <section aria-label="Tenant fixture">
            <RenewalManualSection section="tenant" />
          </section>
        </RenewalManualProvider>
      </RenewalSaveFocus>
    );
    const mounted = render(tree(before));
    const button = screen.getByRole("button", { name: "Simulated app save" });
    button.focus();
    fireEvent.click(button);
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(button).toHaveFocus(); // The old server projection cannot choose the new destination.
    mounted.rerender(tree(after));
    expect(button).toHaveFocus(); // Props alone cannot finish the still-pending refresh.
    await act(async () => finishRefresh());
    expect(projection(after).primary.destination).toMatchObject({
      controlId: "renewal-manual-tenant_response",
    });
    const next = screen.getByLabelText("Tenant response");
    await waitFor(() => expect(next).toHaveFocus());
  });

  it.each(["stale", "wrong_cycle", "unavailable", "other_lease"] as const)(
    "retires a %s refreshed projection rather than stealing focus on a later ordinary reload",
    async (kind) => {
      const before = initial();
      const after = planRenewalWorkspaceAction(
        before,
        { kind: "owner_response", outcome: "approved_terms" },
        metadata,
      );
      const tree = (
        state: RenewalWorkspaceState,
        projected = projection(state),
        readable = true,
        leaseId = "701",
      ) => (
        <RenewalSaveFocus
          leaseId={leaseId}
          cycleId={state.cycleId}
          revision={state.revision}
          readable={readable}
          projection={projected}
          targetId={renewalPostSaveFocusTarget(projected, "Admin")}
        >
          <div id={RENEWAL_NEXT_ACTION_TARGET_ID} tabIndex={-1}>
            Current next-action readback
          </div>
          <label>
            Unrelated draft note
            <input aria-label="Unrelated draft note" defaultValue="" />
          </label>
          <SaveTrigger readback={{ cycleId: after.cycleId, revision: after.revision }} />
          <RenewalManualProvider leaseId="701" initialState={state} writebackPaused>
            <section aria-label="Tenant fixture">
              <RenewalManualSection section="tenant" />
            </section>
          </RenewalManualProvider>
        </RenewalSaveFocus>
      );
      const mounted = render(tree(before));
      fireEvent.click(screen.getByRole("button", { name: "Simulated app save" }));
      const unsuitable =
        kind === "wrong_cycle"
          ? { ...after, cycleId: "different-cycle" }
          : kind === "stale"
            ? before
            : after;
      mounted.rerender(
        tree(
          unsuitable,
          projection(unsuitable),
          kind !== "unavailable",
          kind === "other_lease" ? "702" : "701",
        ),
      );
      await act(async () => finishRefresh());
      const unrelated = screen.getByLabelText("Unrelated draft note");
      unrelated.focus();
      mounted.rerender(tree(after));
      expect(unrelated).toHaveFocus();
    },
  );

  it("retires a failed refresh with no new props before an unrelated later reload", async () => {
    const before = initial();
    const after = planRenewalWorkspaceAction(
      before,
      { kind: "owner_response", outcome: "approved_terms" },
      metadata,
    );
    const tree = (state: RenewalWorkspaceState) => (
      <RenewalSaveFocus
        leaseId="701"
        cycleId={state.cycleId}
        revision={state.revision}
        readable
        projection={projection(state)}
        targetId={renewalPostSaveFocusTarget(projection(state), "Admin")}
      >
        <div id={RENEWAL_NEXT_ACTION_TARGET_ID} tabIndex={-1}>
          Current next-action readback
        </div>
        <label>
          Unrelated draft note
          <input aria-label="Unrelated draft note" defaultValue="" />
        </label>
        <SaveTrigger />
        <RenewalManualProvider leaseId="701" initialState={state} writebackPaused>
          <section aria-label="Tenant fixture">
            <RenewalManualSection section="tenant" />
          </section>
        </RenewalManualProvider>
      </RenewalSaveFocus>
    );
    const mounted = render(tree(before));
    fireEvent.click(screen.getByRole("button", { name: "Simulated app save" }));
    await act(async () => finishRefresh()); // Failed/cancelled RSC: no new projection arrived.
    const unrelated = screen.getByLabelText("Unrelated draft note");
    unrelated.focus();
    mounted.rerender(tree(after));
    expect(unrelated).toHaveFocus();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("covers a separate settings store save, focuses its refreshed issue, and retains another unfinished link", async () => {
    const state = initial();
    const make = (targetId: string) => ({
      ...projection(state),
      primary: {
        ...projection(state).primary,
        kind: "act" as const,
        destination: { kind: "workspace_anchor" as const, targetId },
      },
    });
    const tree = (value: RenewalIssueProjection) => (
      <RenewalSaveFocus
        leaseId="701"
        cycleId={state.cycleId}
        revision={state.revision}
        readable
        projection={value}
        targetId={renewalPostSaveFocusTarget(value, "Admin")}
      >
        <div id={RENEWAL_NEXT_ACTION_TARGET_ID} tabIndex={-1}>
          Readback
        </div>
        <RenewalResourceLocations
          role="Admin"
          initialSettings={{ version: 0, entries: {} }}
        />
      </RenewalSaveFocus>
    );
    const fetch = vi.fn(async () =>
      Response.json({
        settings: {
          version: 1,
          entries: {
            insurance_flyer: {
              id: "insurance_flyer",
              url: "https://fixture.invalid/flyer",
              verified: false,
              recordedAt: metadata.recordedAt,
              recordedByUid: "operator",
            },
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const mounted = render(tree(make("renewal-resource-insurance_flyer")));
    fireEvent.change(screen.getByLabelText("Insurance flyer"), {
      target: { value: "https://fixture.invalid/flyer" },
    });
    fireEvent.change(screen.getByLabelText("Renewal information form"), {
      target: { value: "https://fixture.invalid/unsaved" },
    });
    const button = screen.getByRole("button", { name: "Save insurance flyer" });
    button.focus();
    fireEvent.click(button);
    await screen.findByText("Link saved and read back.");
    expect(button).toHaveFocus();
    mounted.rerender(tree(make("renewal-resource-renewal_information_form")));
    await act(async () => finishRefresh());
    await waitFor(() =>
      expect(screen.getByLabelText("Renewal information form")).toHaveFocus(),
    );
    expect(screen.getByLabelText("Renewal information form")).toHaveValue(
      "https://fixture.invalid/unsaved",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("uses the current role/instruction when no actionable issue remains, never a provider execution button or hidden target", () => {
    const value = projection(initial());
    expect(
      renewalPostSaveFocusTarget(
        { ...value, primary: { ...value.primary, kind: "complete" } },
        "Admin",
      ),
    ).toBe(RENEWAL_NEXT_ACTION_TARGET_ID);
    expect(
      renewalPostSaveFocusTarget(
        { ...value, primary: { ...value.primary, requiredCapability: "manageAdmin" } },
        "Editor",
      ),
    ).toBe(RENEWAL_NEXT_ACTION_TARGET_ID);
    render(
      <>
        <div aria-hidden="true">
          <input id="renewal-hidden" />
        </div>
        <button id="renewal-provider">Confirm provider effect</button>
        <div id={RENEWAL_NEXT_ACTION_TARGET_ID}>
          Completion readback <a href="#">Unrelated link</a>
        </div>
      </>,
    );
    expect(focusRenewalDashboardControl("renewal-hidden", { allowButtons: false })).toBe(
      false,
    );
    expect(
      focusRenewalDashboardControl("renewal-provider", { allowButtons: false }),
    ).toBe(false);
    expect(
      focusRenewalDashboardControl(RENEWAL_NEXT_ACTION_TARGET_ID, {
        allowButtons: false,
        focusContainer: true,
      }),
    ).toBe(true);
    expect(document.getElementById(RENEWAL_NEXT_ACTION_TARGET_ID)).toHaveFocus();
  });
});
