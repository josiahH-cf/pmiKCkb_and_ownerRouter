// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

async function recordActivity(
  user: UserEvent,
  key: ManualActivity,
  notApplicable = false,
) {
  const label = MANUAL_ACTIVITIES[key].label;
  expect(heading()).toHaveTextContent(label);
  const form = document.getElementById(`renewal-manual-${key}`)!;
  expect(form).toBeVisible();
  await user.selectOptions(
    within(form).getByLabelText(`${label} outcome`),
    notApplicable ? "not_applicable" : "done",
  );
  await user.type(within(form).getByLabelText(/Source or channel/), `Record for ${key}`);
  if (notApplicable) {
    await user.type(
      within(form).getByLabelText(/Source-based reason/),
      "The lease carries no such obligation",
    );
    await user.type(
      within(form).getByLabelText(/Approved policy or document/),
      "Applicability rule v1",
    );
    await user.click(
      within(form).getByRole("checkbox", { name: /I checked this lease/ }),
    );
  }
  await user.click(
    within(form).getByRole("button", { name: `Record ${label.toLowerCase()}` }),
  );
  await settle();
}

async function recordOwnerResponse(
  user: UserEvent,
  outcome: "approved_terms" | "declined_non_renewal",
  rent = "1450",
) {
  expect(heading()).toHaveTextContent("Record owner response and exact terms");
  const form = document.getElementById("renewal-manual-owner_response")!;
  expect(form).toBeVisible();
  await user.selectOptions(within(form).getByLabelText("Owner response"), outcome);
  if (outcome === "approved_terms") {
    const rentInput = within(form).getByLabelText(
      /Exact owner-approved monthly base rent/,
    );
    await user.clear(rentInput);
    await user.type(rentInput, rent);
    fireEvent.change(within(form).getByLabelText(/Approved effective date/), {
      target: { value: "2027-01-01" },
    });
    fireEvent.change(within(form).getByLabelText(/Approved term end date/), {
      target: { value: "2027-12-31" },
    });
  }
  const source = within(form).getByLabelText(/Response source or channel/);
  await user.clear(source);
  await user.type(source, "Owner email");
  await user.click(within(form).getByRole("button", { name: "Record owner response" }));
  await settle();
}

async function recordTenantResponse(
  user: UserEvent,
  outcome: "accepted" | "counter_change_requested",
) {
  expect(heading()).toHaveTextContent("Record tenant response");
  const form = document.getElementById("renewal-manual-tenant_response")!;
  await user.selectOptions(within(form).getByLabelText("Tenant response"), outcome);
  const source = within(form).getByLabelText(/Response source or channel/);
  await user.clear(source);
  await user.type(source, "Tenant email");
  await user.click(within(form).getByRole("button", { name: "Record tenant response" }));
  await settle();
}

async function recordCompletion(user: UserEvent) {
  expect(heading()).toHaveTextContent("Review recorded completion");
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
    await openFocus(user);

    // Dirty input survives a switch, then the outreach is recorded from the pane.
    const outreach = document.getElementById("renewal-manual-owner_outreach")!;
    await user.type(within(outreach).getByLabelText(/Source or channel/), "Owner call");
    await user.click(screen.getByRole("button", { name: "Full view" }));
    await openFocus(user);
    await user.selectOptions(
      within(outreach).getByLabelText("Owner outreach outcome"),
      "done",
    );
    await user.click(
      within(outreach).getByRole("button", { name: "Record owner outreach" }),
    );
    await settle();
    expect(within(focusPane()).getByText("Waiting on the owner.")).toBeVisible();

    // A return from Gmail changes nothing.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await settle();
    });
    expect(heading()).toHaveTextContent("Record owner response and exact terms");

    await recordOwnerResponse(user, "approved_terms");
    await recordActivity(user, "tenant_offer");
    expect(within(focusPane()).getByText("Waiting on the tenant.")).toBeVisible();
    await recordTenantResponse(user, "accepted");
    await expectFullView(user, routes, "Manual work in progress");

    // Reload from the stored record mid-journey: the next action is derived again.
    view.unmount();
    view = render(workspaceElement({ manual: routes.state() }));
    await settle();
    await openFocus(user);
    expect(heading()).toHaveTextContent(MANUAL_ACTIVITIES.information_form.label);

    for (const key of AFTER_ACCEPTANCE)
      await recordActivity(user, key, key === "rhino" || key === "assisted_housing");
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
    await openFocus(user);
    await recordActivity(user, "owner_outreach");
    await recordOwnerResponse(user, "declined_non_renewal");
    await recordActivity(user, "non_renewal_handoff");
    await recordCompletion(user);
    expect(within(focusPane()).getByText("Completed: recorded by staff.")).toBeVisible();
    expect(manualRenewalSummary(routes.state())).toMatchObject({
      complete: true,
      nonRenewal: true,
    });
    await expectFullView(user, routes, "Completed: recorded by staff");
  });

  it("reopens the offer after a counter and new terms, then completes the accepted branch", async () => {
    const start = manualFixture({
      owner: "approved_terms",
      done: ["owner_outreach", "tenant_offer"],
    });
    const routes = stubRenewalRoutes(start);
    const user = userEvent.setup();
    render(workspaceElement({ manual: start }));
    await settle();
    await openFocus(user);
    await recordTenantResponse(user, "counter_change_requested");
    // The counter returns the owner response to staff before anything else.
    expect(heading()).toHaveTextContent("Record owner response and exact terms");
    expect(
      within(focusPane()).getByText(
        "The tenant requested a change to the current terms.",
      ),
    ).toBeVisible();
    await recordOwnerResponse(user, "approved_terms", "1425");
    // The new terms reopen only the terms-dependent offer.
    expect(routes.state()!.termsRevision).toBe(2);
    await recordActivity(user, "tenant_offer");
    await recordTenantResponse(user, "accepted");
    expect(heading()).toHaveTextContent(MANUAL_ACTIVITIES.information_form.label);
  });

  it("derives the next action again when a concurrent save arrives by refresh", async () => {
    const start = manualFixture({ owner: "approved_terms", done: ["owner_outreach"] });
    const routes = stubRenewalRoutes(start);
    const user = userEvent.setup();
    const view = render(workspaceElement({ manual: start }));
    await settle();
    await openFocus(user);
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
    expect(heading()).toHaveTextContent("Record tenant response");
    expect(within(focusPane()).getByText("Waiting on the tenant.")).toBeVisible();
    // The colleague's record is shown as theirs; nothing was submitted from this tab.
    expect(routes.writes()).toEqual([]);
  });

  it("puts unverified rent first and moves on when a late source refresh confirms it", async () => {
    const start = manualFixture();
    const routes = stubRenewalRoutes(start);
    const user = userEvent.setup();
    const unverified = actionFixture({ manual: start, rentAgreement: "single_source" });
    const view = render(
      workspaceElement({ workspace: unverified.workspace, manual: start }),
    );
    await settle();
    await openFocus(user);
    expect(heading()).toHaveTextContent("Verify contractual base rent");
    expect(document.getElementById("renewal-rent-and-charges")).toBeVisible();
    // Independent staff work stays offered while the rent is checked.
    expect(
      within(focusPane()).getByRole("navigation", { name: "Other ready tasks" }),
    ).toHaveTextContent("Owner outreach");

    // The refreshed source now agrees on the rent; staff recorded nothing, so nothing says so.
    view.rerender(
      workspaceElement({
        workspace: actionFixture({ manual: start }).workspace,
        manual: start,
      }),
    );
    await settle();
    expect(heading()).toHaveTextContent("Owner outreach");
    const announcement = within(focusPane())
      .getAllByRole("status")
      .find((node) => node.getAttribute("aria-live") === "polite")!;
    expect(announcement).toHaveTextContent("Done. Next: Owner outreach.");
    expect(announcement).not.toHaveTextContent("Recorded");
    expect(routes.writes()).toEqual([]);
  });
});
