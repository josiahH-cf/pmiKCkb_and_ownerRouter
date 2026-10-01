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

import { AFTER_ACCEPTANCE, manualFixture } from "@/tests/helpers/renewal-action-fixtures";
import {
  focusPane,
  renderWorkspace,
  settle,
  stubRenewalRoutes,
} from "@/tests/helpers/focus-workspace";

// S143 (ARCH-S143-1/2, BEH-S143-1/2, AC-S143-1..3): the lease-level Full view / Focus view switch.
// Full view stays the default and returns intact; Focus view is a separate one-task surface over
// the S142 projection; switching and choosing a task change presentation only.

const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");

function sectionSignature(container: HTMLElement) {
  return [...container.querySelectorAll("[id^='renewal-section-']")].map((element) => ({
    id: element.id,
    text: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  router.refresh.mockClear();
  router.push.mockClear();
  router.replace.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("S143 Focus view switch", { timeout: 60_000 }, () => {
  it("opens in Full view with an accessible lease-level switch", async () => {
    stubRenewalRoutes(manualFixture());
    await renderWorkspace({ manual: manualFixture() });
    const group = screen.getByRole("group", { name: "Lease view" });
    expect(within(group).getByRole("button", { name: "Full view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(group).getByRole("button", { name: "Focus view" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.queryByRole("region", { name: "Focus view" })).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Renewal dashboard sections" }),
    ).toBeVisible();
  });

  it("shows one task in Focus view and restores Full view exactly, with no requests or navigation", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    const { container } = await renderWorkspace({ manual: manualFixture() });
    const before = sectionSignature(container);
    const requestsBefore = routes.calls.length;

    await user.click(screen.getByRole("button", { name: "Focus view" }));
    const pane = focusPane();
    expect(screen.getByRole("button", { name: "Focus view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Focus view" })).toHaveFocus();
    expect(within(pane).getByRole("heading", { name: "Owner outreach" })).toBeVisible();
    expect(within(pane).getByText("Ready for you.")).toBeVisible();
    // The task's existing controls are shown in place; the rest of the dashboard is hidden.
    expect(document.getElementById("renewal-manual-owner_outreach")).toBeVisible();
    expect(document.getElementById("renewal-card-message-owner")).toBeVisible();
    expect(document.getElementById("renewal-manual-tenant_offer")).not.toBeVisible();
    expect(document.getElementById("renewal-section-lease-details")).not.toBeVisible();
    expect(document.getElementById("renewal-next-action")).not.toBeVisible();
    expect(
      screen.queryByRole("navigation", { name: "Renewal dashboard sections" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Process guide" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Full view" }));
    expect(screen.queryByRole("region", { name: "Focus view" })).toBeNull();
    expect(document.querySelectorAll("[data-renewal-focus-hidden]")).toHaveLength(0);
    expect(document.querySelectorAll("[hidden]:not(aside)")).toHaveLength(0);
    expect(sectionSignature(container)).toEqual(before);
    expect(
      screen.getByRole("navigation", { name: "Renewal dashboard sections" }),
    ).toBeVisible();
    expect(routes.calls.length).toBe(requestsBefore);
    expect(routes.writes()).toEqual([]);
    expect(router.refresh).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("keeps unsaved input through both switches without submitting it", async () => {
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    const form = document.getElementById("renewal-manual-owner_outreach")!;
    const source = within(form).getByLabelText(/Source or channel/);
    await user.type(source, "Owner phone call on Monday");
    await user.click(screen.getByRole("button", { name: "Full view" }));
    expect(
      within(document.getElementById("renewal-manual-owner_outreach")!).getByLabelText(
        /Source or channel/,
      ),
    ).toHaveValue("Owner phone call on Monday");
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    expect(source).toHaveValue("Owner phone call on Monday");
    expect(routes.writes()).toEqual([]);
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
    await user.click(screen.getByRole("button", { name: "Focus view" }));
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

  it("states waiting, blocked, unreadable and completed outcomes distinctly", async () => {
    const user = userEvent.setup();
    const waiting = manualFixture({ done: ["owner_outreach"] });
    stubRenewalRoutes(waiting);
    await renderWorkspace({ manual: waiting });
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    expect(within(focusPane()).getByText("Waiting on the owner.")).toBeVisible();
    // A waiting response keeps its usable record control and follow-up tools.
    expect(document.getElementById("renewal-manual-owner_response")).toBeVisible();
    cleanup();

    const fresh = manualFixture();
    stubRenewalRoutes(fresh);
    await renderWorkspace({ manual: fresh });
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    const all = within(focusPane()).getByText(/All renewal work/);
    await user.click(all);
    await user.click(
      within(focusPane()).getByRole("button", { name: "Record tenant response" }),
    );
    await settle();
    const blocked = focusPane();
    expect(within(blocked).getByText(/^Starts after: /)).toBeVisible();
    expect(
      within(blocked).getByRole("button", { name: "Work on Owner outreach" }),
    ).toBeVisible();
    cleanup();

    stubRenewalRoutes(null);
    await renderWorkspace({ manualReadUnavailable: true });
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    await user.click(within(focusPane()).getByText(/All renewal work/));
    await user.click(within(focusPane()).getByRole("button", { name: "Owner outreach" }));
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
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    expect(within(focusPane()).getByText("Completed: recorded by staff.")).toBeVisible();
    expect(
      within(focusPane()).getByText("Every required step is recorded."),
    ).toBeVisible();
  });

  it("keeps an inspection-only lease to source inspection", async () => {
    stubRenewalRoutes(null);
    const user = userEvent.setup();
    await renderWorkspace({ workflowAvailable: false });
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    const pane = focusPane();
    expect(within(pane).queryByRole("heading", { name: "Owner outreach" })).toBeNull();
    expect(screen.queryByText("Reviewed cycle date and source")).toBeNull();
  });

  it("returns to Full view at the chosen task's control", async () => {
    stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    await user.click(
      within(focusPane()).getByRole("button", { name: "Show this task in Full view" }),
    );
    expect(screen.queryByRole("region", { name: "Focus view" })).toBeNull();
    expect(screen.getByRole("button", { name: "Full view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(document.activeElement?.closest("#renewal-card-message-owner")).not.toBeNull();
  });
});
