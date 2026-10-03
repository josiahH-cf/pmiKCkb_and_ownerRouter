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

import {
  MANUAL_ACTIVITIES,
  manualRenewalSummary,
  planRenewalWorkspaceAction,
  type ManualActivity,
  type RenewalWorkspaceState,
} from "@/lib/lease-renewal/workspace-state";
import {
  focusPane,
  settle,
  stubRenewalRoutes,
  workspaceElement,
  type RouteFake,
} from "@/tests/helpers/focus-workspace";
import {
  AFTER_ACCEPTANCE,
  actionFixture,
  manualFixture,
} from "@/tests/helpers/renewal-action-fixtures";

// S145 (ARCH-S145-1, BEH-S145-1, AC-S145-2): applicable renewal branches walked to their existing
// completion entirely in the Focus pane, through the real controls and a route fake that applies
// the real planner. Every step advances only on the read-back record; reload, a switch with dirty
// input, a return from Gmail and a concurrent update derive the next action again; Full view shows
// the same records and the same evidence meaning afterwards.

const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function heading() {
  return within(focusPane()).getByRole("heading", { level: 2 });
}
async function openFocus(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: "Focus view" }));
  await settle();
}

/**
 * S152: the lease opens in Focus view. S156 (b7693d4d): the task order is a suggestion, so a
 * journey chooses the task it needs when the pane suggests another one (BEH-S156-1).
 */
async function chooseTask(user: UserEvent, label: string) {
  if (heading().textContent?.trim() === label) return;
  const pane = focusPane();
  const ready = within(pane).queryByRole("navigation", { name: "Other ready tasks" });
  const offered = ready ? within(ready).queryByRole("button", { name: label }) : null;
  if (offered) {
    await user.click(offered);
  } else {
    const all = pane.querySelector<HTMLDetailsElement>("details.renewal-focus-all")!;
    if (!all.open) await user.click(within(all).getByText(/^All renewal work/));
    await user.click(within(all).getAllByRole("button", { name: label })[0]!);
  }
  await settle();
  expect(heading()).toHaveTextContent(label);
}

// S155 (0f02e013): a staff record saves when its outcome is chosen; Not applicable needs no
// reason, policy reference or attestation on a lease-dependent activity.
async function recordActivity(
  user: UserEvent,
  key: ManualActivity,
  notApplicable = false,
) {
  const label = MANUAL_ACTIVITIES[key].label;
  await chooseTask(user, label);
  const form = document.getElementById(`renewal-manual-${key}`)!;
  expect(form).toBeVisible();
  await user.selectOptions(
    within(form).getByLabelText(`${label} outcome`),
    notApplicable ? "not_applicable" : "done",
  );
  await settle();
}

async function recordOwnerResponse(
  user: UserEvent,
  outcome: "approved_terms" | "declined_non_renewal",
) {
  await chooseTask(user, "Record owner response");
  const form = document.getElementById("renewal-manual-owner_response")!;
  expect(form).toBeVisible();
  // S156: the response is the recorded fact alone; working terms are saved on the lease.
  expect(
    within(form).queryByLabelText(/Exact owner-approved monthly base rent/),
  ).toBeNull();
  await user.selectOptions(within(form).getByLabelText("Owner response"), outcome);
  await settle();
}

async function recordTenantResponse(
  user: UserEvent,
  outcome: "accepted" | "counter_change_requested",
) {
  await chooseTask(user, "Record tenant response");
  const form = document.getElementById("renewal-manual-tenant_response")!;
  await user.selectOptions(within(form).getByLabelText("Tenant response"), outcome);
  await settle();
}

async function recordCompletion(user: UserEvent) {
  await chooseTask(user, "Review recorded completion");
  const block = document.getElementById("renewal-manual-complete")!;
  expect(block).toBeVisible();
  await user.click(
    within(block).getByRole("button", { name: "Record staff completion" }),
  );
  await settle();
}

async function expectFullView(user: UserEvent, routes: RouteFake, label: string) {
  await user.click(screen.getByRole("button", { name: "Full view" }));
  await settle();
  const card = document.getElementById("renewal-card-manual-records")!;
  expect(card).toBeVisible();
  expect(card).toHaveTextContent(label);
  expect(manualRenewalSummary(routes.state()).label).toBe(label);
  await openFocus(user);
}

describe("S145 Focus journeys", { timeout: 300_000 }, () => {
  it("walks the accepted renewal branch to staff completion, across reload, a dirty switch and a Gmail return", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    let view = render(workspaceElement({ manual: manualFixture() }));
    await settle();
    expect(heading()).toHaveTextContent("Owner outreach");

    // Typing survives a switch; leaving the control saves the note (S155), and the outreach is
    // then recorded from the pane.
    const outreach = document.getElementById("renewal-manual-owner_outreach")!;
    await user.type(within(outreach).getByLabelText(/Source or channel/), "Owner call");
    await user.click(screen.getByRole("button", { name: "Full view" }));
    await openFocus(user);
    expect(within(outreach).getByLabelText(/Source or channel/)).toHaveValue(
      "Owner call",
    );
    await user.selectOptions(
      within(outreach).getByLabelText("Owner outreach outcome"),
      "done",
    );
    await settle();
    expect(routes.state()!.activities.owner_outreach).toMatchObject({
      outcome: "done",
      source: "Owner call",
    });
    // The owner response is awaited; the next ready staff task is shown.
    expect(heading()).toHaveTextContent(MANUAL_ACTIVITIES.tenant_offer.label);
    await chooseTask(user, "Record owner response");
    expect(within(focusPane()).getByText("Waiting on the owner.")).toBeVisible();

    // A return from Gmail changes nothing.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await settle();
    });
    expect(heading()).toHaveTextContent("Record owner response");

    await recordOwnerResponse(user, "approved_terms");
    expect(routes.state()!.ownerResponse).toMatchObject({ outcome: "approved_terms" });
    await recordActivity(user, "tenant_offer");
    await recordTenantResponse(user, "accepted");
    expect(routes.state()!.tenantResponse).toMatchObject({ outcome: "accepted" });
    await expectFullView(user, routes, "Manual work in progress");

    // Reload from the stored record mid-journey: the next action is derived again, in Focus.
    view.unmount();
    view = render(workspaceElement({ manual: routes.state() }));
    await settle();
    expect(screen.getByRole("button", { name: "Focus view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(focusPane()).toBeVisible();

    for (const key of AFTER_ACCEPTANCE)
      await recordActivity(user, key, key === "rhino" || key === "assisted_housing");
    for (const key of AFTER_ACCEPTANCE)
      expect(routes.state()!.activities[key]?.outcome, key).toBe(
        key === "rhino" || key === "assisted_housing" ? "not_applicable" : "done",
      );
    await recordCompletion(user);
    expect(within(focusPane()).getByText("Completed: recorded by staff.")).toBeVisible();
    await expectFullView(user, routes, "Completed: recorded by staff");
    expect(routes.state()!.completion).not.toBeNull();
    // Every save was one staff record; none was replayed.
    const writes = routes.writes();
    expect(new Set(writes.map((call) => call.body?.operationId)).size).toBe(
      writes.length,
    );
    view.unmount();
  });

  it("walks an owner decline to the non-renewal handoff and completion", async () => {
    const start = manualFixture();
    const routes = stubRenewalRoutes(start);
    const user = userEvent.setup();
    render(workspaceElement({ manual: start }));
    await settle();
    await recordActivity(user, "owner_outreach");
    await recordOwnerResponse(user, "declined_non_renewal");
    // A decline leads to the handoff; the renewal-branch work no longer applies.
    expect(heading()).toHaveTextContent(MANUAL_ACTIVITIES.non_renewal_handoff.label);
    await recordActivity(user, "non_renewal_handoff");
    expect(heading()).toHaveTextContent("Review recorded completion");
    await recordCompletion(user);
    expect(within(focusPane()).getByText("Completed: recorded by staff.")).toBeVisible();
    expect(manualRenewalSummary(routes.state())).toMatchObject({
      complete: true,
      nonRenewal: true,
    });
    await expectFullView(user, routes, "Completed: recorded by staff");
  });

  it("reopens the owner response after a counter, then completes the accepted branch", async () => {
    const start = manualFixture({
      owner: "approved_terms",
      done: ["owner_outreach", "tenant_offer"],
    });
    const routes = stubRenewalRoutes(start);
    const user = userEvent.setup();
    render(workspaceElement({ manual: start }));
    await settle();
    await recordTenantResponse(user, "counter_change_requested");
    // The counter returns the owner response to staff as the suggestion; the recorded counter
    // keeps the tenant answer open (and chosen) rather than finished.
    expect(manualRenewalSummary(routes.state()).nextActivity).toBe("owner_response");
    expect(heading()).toHaveTextContent("Record tenant response");
    expect(
      within(focusPane()).getByRole("navigation", { name: "Other ready tasks" }),
    ).toHaveTextContent("Record owner response");
    await chooseTask(user, "Record owner response");
    expect(
      within(focusPane()).getByText(
        "The tenant requested a change to the current terms.",
      ),
    ).toBeVisible();
    // S156: the tenant answer is not held behind the reopened response.
    expect(
      within(focusPane()).getByRole("navigation", { name: "Other ready tasks" }),
    ).toHaveTextContent("Record tenant response");
    await recordOwnerResponse(user, "approved_terms");
    // S156: the approval re-recorded unchanged keeps its terms revision and the delivered offer;
    // the standing counter is guidance, changed terms live on the working record, and the
    // tenant's acceptance is recorded directly (s145-server-rule-matrix pins the planner rule).
    expect(routes.state()!.termsRevision).toBe(1);
    expect(routes.state()!.activities.tenant_offer?.outcome).toBe("done");
    await recordTenantResponse(user, "accepted");
    await recordActivity(user, "information_form");
    expect(routes.state()!.activities.information_form?.outcome).toBe("done");
  });

  it("derives the next action again when a concurrent save arrives by refresh", async () => {
    const start = manualFixture({
      owner: "approved_terms",
      done: ["owner_outreach"],
    });
    const routes = stubRenewalRoutes(start);
    const user = userEvent.setup();
    const view = render(workspaceElement({ manual: start }));
    await settle();
    expect(heading()).toHaveTextContent(MANUAL_ACTIVITIES.tenant_offer.label);
    const form = document.getElementById("renewal-manual-tenant_offer")!;
    await user.type(
      within(form).getByLabelText(/Source or channel/),
      "Unsaved draft note",
    );

    // Another operator records the offer; the page refresh delivers the newer record.
    const concurrent: RenewalWorkspaceState = planRenewalWorkspaceAction(
      routes.state()!,
      {
        kind: "activity",
        activity: "tenant_offer",
        outcome: "done",
        source: "Colleague",
      },
      {
        actorUid: "fixture-colleague",
        recordedAt: "2026-09-30T17:00:00.000Z",
        eventId: "00000000-0000-4000-8000-000000000077",
      },
    );
    routes.replace(concurrent);
    view.rerender(workspaceElement({ manual: concurrent }));
    await settle();
    // The colleague's record is shown as theirs; nothing was submitted from this tab, and the
    // unsaved note stays typed (S155: an older entry never replaces a newer saved value).
    expect(routes.writes()).toEqual([]);
    expect(routes.state()!.activities.tenant_offer).toMatchObject({
      actorUid: "fixture-colleague",
      outcome: "done",
    });
    expect(within(form).getByLabelText(/Source or channel/)).toHaveValue(
      "Unsaved draft note",
    );
    // The offer is recorded, so the pane moves on; the awaited tenant answer is listed waiting.
    expect(heading()).not.toHaveTextContent(MANUAL_ACTIVITIES.tenant_offer.label);
    await chooseTask(user, "Record tenant response");
    expect(within(focusPane()).getByText("Waiting on the tenant.")).toBeVisible();
  });

  it("records the optional comp preparation in the pane and returns to the required task", async () => {
    const start = manualFixture();
    const routes = stubRenewalRoutes(start);
    const user = userEvent.setup();
    render(workspaceElement({ manual: start }));
    await settle();
    expect(heading()).toHaveTextContent("Owner outreach");
    const ready = within(focusPane()).getByRole("navigation", {
      name: "Other ready tasks",
    });
    await user.click(
      within(ready).getByRole("button", { name: "Market rent comparison" }),
    );
    await settle();
    expect(heading()).toHaveTextContent("Market rent comparison");
    const comps = document.getElementById("renewal-section-comps")!;
    expect(comps).toBeVisible();
    // S155: the preparation saves when its control is left.
    await user.type(
      within(comps).getByLabelText(/Source of the comparison and review notes/),
      "Comparable leases reviewed by staff",
    );
    await user.tab();
    await settle(10);
    // Saved staff work advances to the next ready task, the suggested outreach.
    expect(routes.state()!.preparation).toBeTruthy();
    expect(routes.state()!.preparation?.source).toBe(
      "Comparable leases reviewed by staff",
    );
    expect(heading()).toHaveTextContent("Owner outreach");
    const announcement = within(focusPane())
      .getAllByRole("status")
      .find((node) => node.getAttribute("aria-live") === "polite")!;
    expect(announcement).toHaveTextContent("Recorded. Next: Owner outreach.");
    expect(routes.writes()).toHaveLength(1);
  });

  it("S157 BEH-6/7: keeps a source difference visible while the staff lane leads and ordinary work proceeds", async () => {
    // The walnut lease carries a RentVine/Sheet rent conflict. S157 (8a3f929d): the difference
    // is advisory evidence, so the staff lane leads and the conflict stays listed as work for
    // the person who resolves it.
    const start = manualFixture({}, "lease-1207-walnut-2");
    const routes = stubRenewalRoutes(start);
    const user = userEvent.setup();
    const fixture = actionFixture({ manual: start, leaseId: "lease-1207-walnut-2" });
    expect(fixture.workspace.summary.openConflicts).toBe(1);
    expect(fixture.workspace.guidance.overallStatus).toBe("ready");
    render(
      workspaceElement({
        workspace: fixture.workspace,
        leaseId: "lease-1207-walnut-2",
        manual: start,
      }),
    );
    await settle();
    expect(heading()).toHaveTextContent("Owner outreach");
    expect(within(focusPane()).getByText("Ready for you.")).toBeVisible();
    const pane = focusPane();
    await user.click(within(pane).getByText(/^All renewal work/));
    const conflict = pane.querySelector<HTMLElement>(
      "[data-renewal-action-id='evidence.resolve-source-conflicts']",
    )!;
    expect(conflict).not.toBeNull();
    // S156-6 / S167-4: resolving the difference is ordinary staff work, ready for this Editor.
    expect(conflict.closest(".ui-stack-tight")!.querySelector("h3")).toHaveTextContent(
      /Ready for you/,
    );
    // BEH-7: the mismatch stays open while ordinary staff work is recorded.
    await recordActivity(user, "owner_outreach");
    expect(routes.state()!.activities.owner_outreach?.outcome).toBe("done");
    expect(
      focusPane().querySelector(
        "[data-renewal-action-id='evidence.resolve-source-conflicts']",
      ),
    ).not.toBeNull();
    // BEH-6: Full view keeps the difference and its source values in the data check.
    await user.click(screen.getByRole("button", { name: "Full view" }));
    await settle();
    const dataCheck = document.getElementById("renewal-card-data-check")!;
    expect(dataCheck).toBeVisible();
    expect(dataCheck).toHaveTextContent("Needs your decision");
    expect(dataCheck).toHaveTextContent("$1,250");
    expect(dataCheck).toHaveTextContent("$1,289");
  });
});
