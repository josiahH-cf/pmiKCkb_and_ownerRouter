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
import { RenewalSaveFocus } from "@/components/lease-renewal/RenewalSaveFocus";
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
function submitApproval() {
  const owner = within(screen.getByRole("region", { name: "Owner fixture" }));
  fireEvent.change(owner.getByLabelText("Owner response"), {
    target: { value: "approved_terms" },
  });
  fireEvent.change(owner.getByLabelText("Exact owner-approved monthly base rent"), {
    target: { value: "1250" },
  });
  fireEvent.change(owner.getByLabelText("Approved effective date"), {
    target: { value: "2027-01-01" },
  });
  fireEvent.change(owner.getByLabelText("Approved term end date"), {
    target: { value: "2027-12-31" },
  });
  fireEvent.change(owner.getByLabelText("Response source or channel"), {
    target: { value: "Fixture exact approved terms" },
  });
  const button = owner.getByRole("button", { name: "Record owner response" });
  button.focus();
  fireEvent.click(button);
  return button;
}
describe("S127 successful app-save focus and authoritative refreshed issues", () => {
  it("waits for actual save/readback and refreshed revision, opens the next unresolved control, and preserves a dirty sibling", async () => {
    const before = initial();
    let after = before;
    let complete!: () => void;
    const delayed = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const fetch = vi.fn(async (_url: string, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body));
      expect(body.expectedRevision).toBe(before.revision);
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
    const button = submitApproval();
    expect(button).toHaveFocus();
    expect(router.refresh).not.toHaveBeenCalled();
    await act(async () => complete());
    await screen.findByText("Saved in app; Sheet updates paused.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(button).toHaveFocus(); // The old server projection cannot choose the new destination.
    mounted.rerender(manualTree(after));
    expect(button).toHaveFocus(); // Props alone cannot finish the still-pending refresh.
    await act(async () => finishRefresh());
    const next = screen.getByLabelText("Tenant offer delivered outcome");
    await waitFor(() => expect(next).toHaveFocus());
    expect(next.closest("details")).toHaveAttribute("open");
    expect(screen.getByLabelText("Unrelated draft note")).toHaveValue(
      "Keep this unsaved note",
    );
    expect(
      within(screen.getByRole("region", { name: "Owner fixture" })).getByLabelText(
        "Response source or channel",
      ),
    ).toHaveValue("Fixture exact approved terms");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(projection(after).primary.destination).toMatchObject({
      controlId: "renewal-manual-tenant_offer",
    });
  });

  it.each([403, 409, 500])(
    "keeps failed %s save input and never queues focus on a later read",
    async (status) => {
      const state = initial();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({ error: "Review the changed record." }, { status }),
        ),
      );
      const mounted = render(manualTree(state));
      const button = submitApproval();
      await screen.findByText("Review the changed record.");
      expect(router.refresh).not.toHaveBeenCalled();
      mounted.rerender(manualTree(state));
      expect(button).toHaveFocus();
      expect(screen.getByLabelText("Exact owner-approved monthly base rent")).toHaveValue(
        "1250",
      );
    },
  );

  it.each(["stale", "wrong_cycle", "unavailable", "other_lease"] as const)(
    "retires a %s refreshed projection rather than stealing focus on a later ordinary reload",
    async (kind) => {
      const before = initial();
      let after = before;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url, options) => {
          const body = JSON.parse(options.body);
          after = planRenewalWorkspaceAction(before, body.action, {
            ...metadata,
            eventId: body.operationId,
          });
          return Response.json({ state: after, writeback_paused: true });
        }),
      );
      const mounted = render(manualTree(before));
      submitApproval();
      await screen.findByText("Saved in app; Sheet updates paused.");
      const unsuitable =
        kind === "wrong_cycle"
          ? { ...after, cycleId: "different-cycle" }
          : kind === "stale"
            ? before
            : after;
      mounted.rerender(
        manualTree(
          unsuitable,
          projection(unsuitable),
          kind !== "unavailable",
          kind === "other_lease" ? "702" : "701",
        ),
      );
      await act(async () => finishRefresh());
      const unrelated = screen.getByLabelText("Unrelated draft note");
      unrelated.focus();
      mounted.rerender(manualTree(after));
      expect(unrelated).toHaveFocus();
    },
  );

  it("retires a failed refresh with no new props before an unrelated later reload", async () => {
    const before = initial();
    let after = before;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, options) => {
        const body = JSON.parse(options.body);
        after = planRenewalWorkspaceAction(before, body.action, {
          ...metadata,
          eventId: body.operationId,
        });
        return Response.json({ state: after, writeback_paused: true });
      }),
    );
    const mounted = render(manualTree(before));
    submitApproval();
    await screen.findByText("Saved in app; Sheet updates paused.");
    await act(async () => finishRefresh()); // Failed/cancelled RSC: no new projection arrived.
    const unrelated = screen.getByLabelText("Unrelated draft note");
    unrelated.focus();
    mounted.rerender(manualTree(after));
    expect(unrelated).toHaveFocus();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

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
      "Current staff records read back. Review unsaved inputs before recording them.",
    );
    mounted.rerender(manualTree(state));
    expect(button).toHaveFocus();
    expect(router.refresh).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
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
