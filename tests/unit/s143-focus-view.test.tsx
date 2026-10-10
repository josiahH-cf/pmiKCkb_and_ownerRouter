// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { focusRenewalDashboardControl } from "@/components/lease-renewal/RenewalDashboardNavigation";
import { AFTER_ACCEPTANCE, manualFixture } from "@/tests/helpers/renewal-action-fixtures";
import {
  focusPane,
  renderWorkspace,
  settle,
  stubRenewalRoutes,
  viewButton,
} from "@/tests/helpers/focus-workspace";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S143 (ARCH-S143-1/2, BEH-S143-1/2, AC-S143-1..3): the lease-level Full view / Focus view switch.
// S152 (f2a50650): Focus view is the default and the selected view is marked; Full view returns
// intact. Focus view is a one-task surface over the S142 projection; switching and choosing a
// task change presentation only. S156 (b7693d4d): the task order is a suggestion, so no staff
// task "starts after" another.

const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");

function sectionSignature(container: HTMLElement) {
  return [...container.querySelectorAll("[id^='renewal-section-']")].map((element) => ({
    id: element.id,
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
  }));
}

/** Requests that reach a provider-facing route (drafts, sends, source writes, comps). */
function providerDispatches(calls: readonly { method: string; url: string }[]) {
  return calls.filter(
    (call) =>
      call.method !== "GET" &&
      !call.url.includes("/api/lease-renewal/workspace") &&
      !call.url.includes("/api/lease-renewal/working-record"),
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  router.refresh.mockClear();
  router.push.mockClear();
  router.replace.mockClear();
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

describe("S143 Focus view switch", { timeout: 60_000 }, () => {
  it("S152 BEH-1 / ARCH-1: opens in Focus view with the selected control marked first", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    await renderWorkspace({ manual: manualFixture() });
    const group = screen.getByRole("group", { name: "Lease view" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "Focus view",
      "Full view",
    ]);
    expect(viewButton("Focus view")).toHaveAttribute("aria-pressed", "true");
    expect(viewButton("Focus view")).toHaveAttribute("data-selected", "true");
    expect(viewButton("Full view")).toHaveAttribute("aria-pressed", "false");
    expect(viewButton("Full view")).not.toHaveAttribute("data-selected");
    const pane = focusPane();
    expect(within(pane).getByRole("heading", { name: "Owner outreach" })).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "Renewal dashboard sections" }),
    ).toBeNull();
    // Opening is a read: nothing was written and no provider was called.
    expect(routes.writes()).toEqual([]);
  });

  it("S152 BEH-1: a direct link to a control opens in Focus on the task that owns it", async () => {
    stubRenewalRoutes(manualFixture());
    window.location.hash = "#renewal-manual-tenant_offer";
    await renderWorkspace({ manual: manualFixture() });
    await settle(10);
    expect(viewButton("Focus view")).toHaveAttribute("aria-pressed", "true");
    expect(
      within(focusPane()).getByRole("heading", { name: "Tenant offer delivered" }),
    ).toBeVisible();
    expect(document.getElementById("renewal-manual-tenant_offer")).toBeVisible();
    expect(document.getElementById("renewal-manual-owner_outreach")).not.toBeVisible();
  });

  it("shows one task in Focus view and restores Full view exactly, with no requests or navigation", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    const { container } = await renderWorkspace({ manual: manualFixture() });
    const requestsBefore = routes.calls.length;

    const pane = focusPane();
    expect(within(pane).getByRole("heading", { name: "Owner outreach" })).toBeVisible();
    expect(within(pane).getByText("Ready for you.")).toBeVisible();
    // The task's existing controls are shown in place; the rest of the dashboard is hidden.
    expect(document.getElementById("renewal-manual-owner_outreach")).toBeVisible();
    expect(document.getElementById("renewal-card-message-owner")).toBeVisible();
    expect(document.getElementById("renewal-manual-tenant_offer")).not.toBeVisible();
    expect(document.getElementById("renewal-section-lease-details")).not.toBeVisible();
    // S197 keeps the paired Suggested next context visible in either view.
    expect(document.getElementById("renewal-next-action")).toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "Renewal dashboard sections" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Process guide" })).toBeNull();

    await user.click(viewButton("Full view"));
    expect(viewButton("Full view")).toHaveAttribute("aria-pressed", "true");
    expect(viewButton("Full view")).toHaveAttribute("data-selected", "true");
    expect(viewButton("Focus view")).toHaveAttribute("aria-pressed", "false");
    expect(viewButton("Full view")).toHaveFocus();
    expect(screen.queryByRole("region", { name: "Focus view" })).toBeNull();
    expect(document.querySelectorAll("[data-renewal-focus-hidden]")).toHaveLength(0);
    expect(document.querySelectorAll("[hidden]:not(aside)")).toHaveLength(0);
    expect(
      screen.getByRole("navigation", { name: "Renewal dashboard sections" }),
    ).toBeVisible();
    const full = sectionSignature(container);

    await user.click(viewButton("Focus view"));
    expect(viewButton("Focus view")).toHaveFocus();
    expect(
      within(focusPane()).getByRole("heading", { name: "Owner outreach" }),
    ).toBeVisible();
    await user.click(viewButton("Full view"));
    expect(sectionSignature(container)).toEqual(full);
    expect(routes.calls.length).toBe(requestsBefore);
    expect(routes.writes()).toEqual([]);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("S152 BEH-9 / AC-1: keeps a failed-save entry through both switches and sends nothing on a switch", async () => {
    // S155: a text entry saves when its control is left. The refused save keeps the entry with a
    // retry; switching views then changes nothing and sends nothing.
    const routes = stubRenewalRoutes(manualFixture(), {
      refuseRecords: { status: 500, error: "The record could not be saved." },
    });
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    const form = document.getElementById("renewal-manual-owner_outreach")!;
    const source = within(form).getByLabelText(/Source or channel/);
    await user.type(source, "Owner phone call on Monday");
    await user.click(viewButton("Full view"));
    await settle();
    const writesAfterBlur = routes.writes();
    expect(writesAfterBlur).toHaveLength(1);
    expect(writesAfterBlur[0]!.url).toBe("/api/lease-renewal/workspace");
    expect(within(form).getByText(/Your entry is kept\./)).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(source).toHaveValue("Owner phone call on Monday");
    await user.click(viewButton("Focus view"));
    expect(source).toHaveValue("Owner phone call on Monday");
    expect(within(form).getByRole("button", { name: "Try again" })).toBeVisible();
    await user.click(viewButton("Full view"));
    expect(source).toHaveValue("Owner phone call on Monday");
    expect(routes.writes()).toEqual(writesAfterBlur);
    expect(providerDispatches(routes.calls)).toEqual([]);
  });

  it("S152 BEH-2: both views accept the same working edit without a mode-enabling action", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    // Focus view: record the shown task directly.
    const outreach = document.getElementById("renewal-manual-owner_outreach")!;
    await user.selectOptions(
      within(outreach).getByLabelText("Owner outreach outcome"),
      "done",
    );
    await settle(10);
    expect(routes.state()?.activities.owner_outreach?.outcome).toBe("done");
    // Full view: record another task the same way.
    await user.click(viewButton("Full view"));
    const offer = document.getElementById("renewal-manual-tenant_offer")!;
    await user.selectOptions(
      within(offer).getByLabelText("Tenant offer delivered outcome"),
      "done",
    );
    await settle(10);
    expect(routes.state()?.activities.tenant_offer?.outcome).toBe("done");
    expect(routes.writes().map((call) => call.body?.operation)).toEqual([
      "record",
      "record",
    ]);
    expect(providerDispatches(routes.calls)).toEqual([]);
  });

  it("S152 BEH-8 / AC-1: section navigation lands below the measured sticky toolbar", async () => {
    stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    const { container } = await renderWorkspace({ manual: manualFixture() });
    // The shell measures its toolbar and exposes the offset the scroll-margin rule reads
    // (jsdom reports a zero-height toolbar, so only the breathing room remains).
    const shell = container.querySelector<HTMLElement>(".renewal-workspace-shell")!;
    expect(shell.style.getPropertyValue("--renewal-sticky-offset")).toBe("12px");
    await user.click(viewButton("Full view"));
    const navigation = screen.getByRole("navigation", {
      name: "Renewal dashboard sections",
    });
    const comps = within(navigation).getByRole("link", {
      name: "Market rent comparison",
    });
    expect(comps).toHaveAttribute("href", "#renewal-section-comps");
    expect(focusRenewalDashboardControl("renewal-section-comps")).toBe(true);
    const section = document.getElementById("renewal-section-comps")!;
    expect(section.contains(document.activeElement)).toBe(true);
    expect(
      within(section).getByRole("heading", { name: "Market rent comparison" }),
    ).toBeVisible();
    // Focus controls stay reachable inside the pane.
    await user.click(viewButton("Focus view"));
    expect(
      within(focusPane()).getByRole("button", { name: "Show this task in Full view" }),
    ).toBeVisible();
  });

  it("S152 AC-3 / S156 BEH-1: choosing a different task dispatches nothing", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    // The suggestion is owner outreach; the tenant offer is offered as another ready task.
    await user.click(
      within(
        within(focusPane()).getByRole("navigation", { name: "Other ready tasks" }),
      ).getByRole("button", { name: "Tenant offer delivered" }),
    );
    await settle();
    expect(
      within(focusPane()).getByRole("heading", { name: "Tenant offer delivered" }),
    ).toHaveFocus();
    expect(within(focusPane()).getByText("Ready for you.")).toBeVisible();
    await user.click(viewButton("Full view"));
    await user.click(viewButton("Focus view"));
    expect(
      within(focusPane()).getByRole("heading", { name: "Tenant offer delivered" }),
    ).toBeVisible();
    expect(routes.writes()).toEqual([]);
    expect(providerDispatches(routes.calls)).toEqual([]);
  });

  it("offers the other independent ready tasks and moves focus to a chosen task", async () => {
    const accepted = manualFixture({
      owner: "approved_terms",
      tenant: "accepted",
      done: ["owner_outreach", "tenant_offer"],
    });
    stubRenewalRoutes(accepted);
    const user = userEvent.setup();
    await renderWorkspace({ manual: accepted });
    const pane = focusPane();
    expect(
      within(pane).getByRole("heading", { name: "Information form sent" }),
    ).toBeVisible();
    const others = within(pane).getByRole("navigation", { name: "Other ready tasks" });
    const offered = within(others)
      .getAllByRole("button")
      .map((button) => button.textContent);
    // Every other independent post-acceptance activity is offered beside optional work.
    for (const label of [
      "Information form returned",
      "Required documents prepared",
      "Pet registration follow-up",
      "Utility proof follow-up",
    ])
      expect(offered).toContain(label);
    expect(offered).not.toContain("Information form sent");
    await user.click(
      within(others).getByRole("button", { name: "Pet registration follow-up" }),
    );
    await settle();
    expect(
      within(focusPane()).getByRole("heading", { name: "Pet registration follow-up" }),
    ).toHaveFocus();
    expect(document.getElementById("renewal-manual-pet")).toBeVisible();
    expect(document.getElementById("renewal-manual-information_form")).not.toBeVisible();
  });

  it("states waiting, available, unreadable and completed outcomes distinctly", async () => {
    const user = userEvent.setup();
    const waiting = manualFixture({ done: ["owner_outreach"] });
    stubRenewalRoutes(waiting);
    await renderWorkspace({ manual: waiting });
    // The awaited owner response is listed as waiting; it holds no other task.
    await user.click(within(focusPane()).getByText(/All renewal work/));
    await user.click(
      within(focusPane()).getByRole("button", {
        name: "Record owner response",
      }),
    );
    await settle();
    expect(within(focusPane()).getByText("Waiting on the owner.")).toBeVisible();
    // A waiting response keeps its usable record control and follow-up tools.
    expect(document.getElementById("renewal-manual-owner_response")).toBeVisible();
    cleanup();

    // S156 ARCH-2: a later task chosen out of the suggested order is simply ready.
    const fresh = manualFixture();
    stubRenewalRoutes(fresh);
    await renderWorkspace({ manual: fresh });
    await user.click(
      within(
        within(focusPane()).getByRole("navigation", { name: "Other ready tasks" }),
      ).getByRole("button", { name: "Record tenant response" }),
    );
    await settle();
    const chosen = focusPane();
    expect(within(chosen).getByText("Ready for you.")).toBeVisible();
    expect(within(chosen).queryByText(/^Starts after/)).toBeNull();
    expect(within(chosen).queryByText(/Starts once this is recorded/)).toBeNull();
    expect(
      within(chosen).queryByRole("list", { name: "Work that comes first" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /Starts after earlier work/ }),
    ).toBeNull();
    cleanup();

    stubRenewalRoutes(null);
    await renderWorkspace({ manualReadUnavailable: true });
    await user.click(within(focusPane()).getByText(/All renewal work/));
    // The staff action itself (the shared guidance also lists an "Owner outreach" suggestion
    // without a control while the records are unreadable).
    await user.click(
      within(
        focusPane().querySelector<HTMLElement>(
          "[data-renewal-action-id='manual.owner_outreach']",
        )!,
      ).getByRole("button", { name: "Owner outreach" }),
    );
    await settle();
    expect(
      within(focusPane()).getByText(
        "Current staff records could not be read. Reload them before recording work.",
      ),
    ).toBeVisible();
    expect(
      within(focusPane()).getByRole("button", {
        name: "Work on Reload records and history",
      }),
    ).toBeVisible();
    cleanup();

    const complete = manualFixture({
      owner: "approved_terms",
      tenant: "accepted",
      done: ["owner_outreach", "tenant_offer", ...AFTER_ACCEPTANCE],
      completion: true,
    });
    stubRenewalRoutes(complete);
    await renderWorkspace({ manual: complete });
    expect(within(focusPane()).getByText("Completed: recorded by staff.")).toBeVisible();
    expect(
      within(focusPane()).getByText("Every required step is recorded."),
    ).toBeVisible();
  });

  it("S154 BEH-1/2: a lease outside the worklist opens in Focus on the staff lane", async () => {
    stubRenewalRoutes(null);
    const base = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    const workspace = {
      ...base,
      summary: {
        ...base.summary,
        disposition: "out_of_window" as const,
        reason: "out_of_window" as const,
        reasonLabel: "Outside this window",
        retention: {
          state: "outside" as const,
          label: "Outside the active renewal window",
        },
      },
    };
    await renderWorkspace({ workspace, manual: null });
    const pane = focusPane();
    expect(within(pane).getByRole("heading", { name: "Owner outreach" })).toBeVisible();
    expect(within(pane).getByText("Ready for you.")).toBeVisible();
    expect(document.getElementById("renewal-manual-owner_outreach")).toBeVisible();
    expect(screen.queryByText("Inspection only")).toBeNull();
    expect(screen.queryByText("Reviewed cycle date and source")).toBeNull();
  });

  it("returns to Full view at the chosen task's control", async () => {
    stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    await user.click(
      within(focusPane()).getByRole("button", { name: "Show this task in Full view" }),
    );
    expect(screen.queryByRole("region", { name: "Focus view" })).toBeNull();
    expect(viewButton("Full view")).toHaveAttribute("aria-pressed", "true");
    expect(document.activeElement?.closest("#renewal-card-message-owner")).not.toBeNull();
  });
});
