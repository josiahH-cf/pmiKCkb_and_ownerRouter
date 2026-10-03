// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { focusRenewalDashboardControl } from "@/components/lease-renewal/RenewalDashboardNavigation";
import type { RentChargeOutcomeRow } from "@/lib/lease-renewal/rent-charge-outcomes";
import { projectRenewalActions } from "@/lib/lease-renewal/renewal-actions";
import type { RenewalWorkspaceState } from "@/lib/lease-renewal/workspace-state";
import {
  focusPane,
  renderWorkspace,
  settle,
  stubRenewalRoutes,
  workspaceElement,
  type FetchCall,
} from "@/tests/helpers/focus-workspace";
import {
  AFTER_ACCEPTANCE,
  actionFixture,
  manualFixture,
} from "@/tests/helpers/renewal-action-fixtures";

// S144 (ARCH-S144-1/2, BEH-S144-1/2, AC-S144-1..3): actions run in the Focus pane through their
// existing Full view controls and routes. The pane advances only on the read-back record; a
// conflict, a duplicate click, a pending request and a return from Gmail keep input and evidence
// meaning without replaying anything.

const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  router.refresh.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// S155/S156 (0f02e013): a staff record saves when its outcome is chosen; a text entry saves
// when its control is left. There is no record button and no required source narrative.
async function recordOutreach(user: UserEvent) {
  const form = document.getElementById("renewal-manual-owner_outreach")!;
  await user.selectOptions(within(form).getByLabelText("Owner outreach outcome"), "done");
  return form;
}
function recordBody(call: FetchCall) {
  const body: Record<string, unknown> = { ...(call.body ?? {}) };
  delete body.operationId;
  return body;
}

describe("S144 Focus in-pane actions", { timeout: 60_000 }, () => {
  it("records owner outreach in the pane through the Full view route and advances on readback", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    await recordOutreach(user);
    await settle();

    expect(routes.writes()).toHaveLength(1);
    expect(recordBody(routes.writes()[0]!)).toEqual({
      operation: "record",
      cycleId: "b4bc3b81-c402-4f62-a2e2-c605c67867fb",
      expectedRevision: 5,
      action: { kind: "activity", activity: "owner_outreach", outcome: "done" },
      leaseId: "lease-318-cedar-7",
    });
    const pane = focusPane();
    // S156: the owner response is awaited, so the next ready task (the tenant offer) is shown;
    // the awaited response stays listed as waiting.
    expect(
      within(pane).getByRole("heading", { name: "Tenant offer delivered" }),
    ).toHaveFocus();
    expect(within(pane).getByText("Ready for you.")).toBeVisible();
    expect(
      within(pane).getByText("Recorded. Next: Tenant offer delivered."),
    ).toBeInTheDocument();
    expect(
      within(pane).getByText(
        "Saved. Any listed Sheet update still needs its own confirmation.",
      ),
    ).toBeVisible();
    await user.click(within(pane).getByText(/All renewal work/));
    expect(
      within(pane).getByRole("heading", { name: "Waiting on someone else (1)" }),
    ).toBeVisible();

    // The same record appears in Full view.
    await user.click(screen.getByRole("button", { name: "Full view" }));
    expect(
      within(document.getElementById("renewal-manual-owner_outreach")!).getByText(
        /Owner outreach : done/,
      ),
    ).toBeVisible();
  });

  it("sends exactly the request the Full view control sends", async () => {
    const user = userEvent.setup();
    const focusRoutes = stubRenewalRoutes(manualFixture());
    await renderWorkspace({ manual: manualFixture() });
    await recordOutreach(user);
    await settle();
    const focusBody = recordBody(focusRoutes.writes()[0]!);
    cleanup();
    vi.unstubAllGlobals();

    const fullRoutes = stubRenewalRoutes(manualFixture());
    await renderWorkspace({ manual: manualFixture() });
    await user.click(screen.getByRole("button", { name: "Full view" }));
    await recordOutreach(user);
    await settle();
    expect(recordBody(fullRoutes.writes()[0]!)).toEqual(focusBody);
  });

  it("retries on a concurrent change elsewhere and keeps input on a same-item conflict", async () => {
    // S155: a 409 is read back; a change to another item saves again on the new revision, while
    // a change to this item is a real conflict that keeps the entry with "Save my entry".
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    routes.replace({ ...routes.state()!, revision: 6 });
    await recordOutreach(user);
    await settle(10);
    expect(routes.state()!.activities.owner_outreach?.outcome).toBe("done");
    expect(routes.writes().map((call) => call.body?.expectedRevision)).toEqual([5, 6]);
    cleanup();
    vi.unstubAllGlobals();

    const conflicting = stubRenewalRoutes(manualFixture());
    await renderWorkspace({ manual: manualFixture() });
    const form = document.getElementById("renewal-manual-owner_outreach")!;
    const source = within(form).getByLabelText(/Source or channel/);
    await user.type(source, "Owner phone call");
    const theirs = { ...conflicting.state()!, revision: 6 };
    theirs.activities = {
      ...theirs.activities,
      owner_outreach: {
        eventId: "00000000-0000-4000-8000-00000000beef",
        actorUid: "other-operator",
        recordedAt: "2026-09-30T16:00:00.000Z",
        source: "Their call",
        termsRevision: theirs.termsRevision,
        outcome: "waiting",
      },
    };
    conflicting.replace(theirs);
    await user.tab();
    await settle(10);
    expect(within(form).getByText(/Changed elsewhere\./)).toBeInTheDocument();
    expect(
      within(form).getByRole("button", { name: "Save my entry" }),
    ).toBeInTheDocument();
    expect(source).toHaveValue("Owner phone call");
    // The other operator's record stands; nothing here replaced it.
    expect(conflicting.state()!.activities.owner_outreach?.actorUid).toBe(
      "other-operator",
    );
    expect(
      conflicting.writes().filter((call) => call.body?.operation === "record"),
    ).toHaveLength(1);
  });

  it("finishes a pending save across a view switch with exactly one request", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    const release = routes.holdNextRecord();
    const form = await recordOutreach(user);
    expect(within(form).getByText("Saving owner outreach")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Full view" }));
    await act(async () => {
      release();
      await settle();
    });
    expect(routes.writes()).toHaveLength(1);
    expect(routes.state()!.activities.owner_outreach?.outcome).toBe("done");
    expect(within(form).getByText("Saved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    expect(
      within(focusPane()).getByRole("heading", { name: "Tenant offer delivered" }),
    ).toBeVisible();
  });

  it("chooses the task that owns a control requested from inside another task", async () => {
    stubRenewalRoutes(manualFixture());
    await renderWorkspace({ manual: manualFixture() });
    expect(document.getElementById("renewal-manual-tenant_offer")).not.toBeVisible();
    act(() => {
      focusRenewalDashboardControl("renewal-manual-tenant_offer");
    });
    await settle();
    expect(
      within(focusPane()).getByRole("heading", { name: "Tenant offer delivered" }),
    ).toBeVisible();
    expect(document.getElementById("renewal-manual-tenant_offer")).toBeVisible();
    expect(document.getElementById("renewal-card-message-tenant")).toBeVisible();
    expect(
      document.activeElement?.closest("#renewal-manual-tenant_offer"),
    ).not.toBeNull();
  });

  it("keeps input, selection and evidence meaning when returning from Gmail", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    // Unsaved typing (the control was not left) stays through the return from Gmail.
    const form = document.getElementById("renewal-manual-owner_outreach")!;
    await user.type(
      within(form).getByLabelText(/Source or channel/),
      "Owner email draft reviewed",
    );
    await act(async () => {
      window.dispatchEvent(new Event("blur"));
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
      await settle();
    });
    expect(
      within(focusPane()).getByRole("heading", { name: "Owner outreach" }),
    ).toBeVisible();
    expect(within(form).getByLabelText(/Source or channel/)).toHaveValue(
      "Owner email draft reviewed",
    );
    // Returning from Gmail records nothing; only the staff record completes outreach.
    expect(routes.writes()).toEqual([]);
    expect(within(focusPane()).getByText("Ready for you.")).toBeVisible();
  });

  it("shows an ambiguous provider effect without offering a retry", async () => {
    const rows: RentChargeOutcomeRow[] = [
      {
        id: "rentvine:ambiguous",
        destination: "rentvine",
        intent: "current",
        label: "RentVine recurring charge create",
        state: "ambiguous",
        stateLabel: "Needs reconciliation",
        detail: "The outcome of the last attempt is unknown.",
        anchor: "#rentvine-updates-title",
        attention: true,
      },
    ];
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({
      manual: manualFixture(),
      rentChargeStatus: rows,
      role: "Admin",
    });
    await user.click(within(focusPane()).getByText(/All renewal work/));
    await user.click(
      within(focusPane()).getByRole("button", {
        name: "RentVine recurring charge create",
      }),
    );
    await settle();
    expect(
      within(focusPane()).getByText(
        "The last outcome needs a check before anything else happens here.",
      ),
    ).toBeVisible();
    expect(document.getElementById("renewal-rent-and-charges")).toBeVisible();
    expect(routes.writes()).toEqual([]);
  });

  it("states the Sheet pause as policy", async () => {
    stubRenewalRoutes(manualFixture());
    await renderWorkspace({ manual: manualFixture(), sheetWritebackPaused: true });
    const notes = within(focusPane()).getByRole("list", { name: "Lease notes" });
    expect(
      within(notes).getByText(
        /Operating-Sheet writes and new Sheet proposals are paused/,
      ),
    ).toBeVisible();
    expect(within(notes).getByText("Paused by policy:")).toBeVisible();
  });

  it("derives the next action again after a reload from the stored record", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    const view = await renderWorkspace({ manual: manualFixture() });
    await recordOutreach(user);
    await settle();
    view.unmount();
    const stored: RenewalWorkspaceState = routes.state()!;
    render(workspaceElement({ manual: stored }));
    await settle();
    // S152: a reload opens in Focus again, on the task derived from the stored record.
    expect(screen.getByRole("button", { name: "Focus view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(focusPane()).getByRole("heading", { name: "Tenant offer delivered" }),
    ).toBeVisible();
    await user.click(within(focusPane()).getByText(/All renewal work/));
    expect(
      within(focusPane()).getByRole("button", {
        name: "Record owner response",
      }),
    ).toBeInTheDocument();
  });
});

describe("S144 action-to-control parity", { timeout: 120_000 }, () => {
  it("finds every applicable action's control in the rendered Full view", async () => {
    const states = [
      manualFixture(),
      manualFixture({ done: ["owner_outreach"] }),
      manualFixture({
        owner: "approved_terms",
        tenant: "accepted",
        done: ["owner_outreach", "tenant_offer"],
      }),
      manualFixture({ owner: "declined_non_renewal", done: ["owner_outreach"] }),
    ];
    for (const state of states) {
      stubRenewalRoutes(state);
      await renderWorkspace({ manual: state });
      const projection = projectRenewalActions(
        actionFixture({ manual: state, correctionPanel: false }).snapshot,
      );
      for (const action of projection.actions) {
        if (!action.control || action.status === "not_applicable") continue;
        for (const target of action.control.targets)
          expect(
            document.getElementById(target),
            `${action.id} -> ${target}`,
          ).not.toBeNull();
        // S156 ARCH-2: no staff action waits on another staff action.
        if (action.group === "staff_work") {
          expect(action.status, action.id).not.toBe("dependency_blocked");
          expect(action.prerequisites, action.id).toEqual([]);
        }
      }
      cleanup();
      vi.unstubAllGlobals();
    }
    expect(AFTER_ACCEPTANCE.length).toBe(13);
  });
});
