// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import { RENEWAL_DASHBOARD_SECTIONS } from "@/lib/lease-renewal/dashboard-sections";
import {
  RENEWAL_PATH_LABELS,
  RENEWAL_PATH_STANDARD_STEPS,
} from "@/lib/lease-renewal/renewal-path";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { renewalStageContextFor } from "@/lib/lease-renewal/renewal-stage-context";
import { fullViewSignature } from "@/tests/helpers/full-view-signature";
import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
  viewButton,
} from "@/tests/helpers/focus-workspace";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S247 R-S247-4 to R-S247-11, BEH-S247-1 to BEH-S247-5, AC-S247-2 to AC-S247-4: the Guided view is
// the lease page's default, beside Focus view and Full view. It names every step of the path and
// holds one Now card with one primary action over the step's existing controls. Opening,
// choosing a step, switching views and following an older link change presentation only: no
// request, save, navigation or refresh. Full view keeps its recorded presentation.

const BASELINE = JSON.parse(
  readFileSync(
    join(__dirname, "..", "fixtures", "s253-animal-wording-full-view-presentation.json"),
    "utf8",
  ),
) as Record<string, ReturnType<typeof fullViewSignature>>;
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");
const LEASE_PATH = "/lease-renewal/live/desk/lease/lease-318-cedar-7";

function manualState(leaseId = "lease-318-cedar-7") {
  return emptyRenewalWorkspace(leaseId, CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
}

/** The staff status read the live page passes, with nothing saved yet. */
const WORK_STATUS = {
  available: true,
  record: null,
  history: [],
  notes: [],
  currentCycleId: CYCLE_ID,
} as const;

function guidedPane() {
  const pane = screen.getByRole("region", { name: "Guided view" });
  expect(pane).toBeVisible();
  return pane;
}

function nowCard() {
  return within(guidedPane()).getByRole("region", { name: "Now" });
}

function visible(id: string) {
  const element = document.getElementById(id);
  return Boolean(element && !element.closest("[hidden]"));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  router.refresh.mockClear();
  router.push.mockClear();
  router.replace.mockClear();
  window.history.replaceState(null, "", LEASE_PATH);
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("S247 Guided view", { timeout: 120_000 }, () => {
  it("keeps secondary header statuses in Focus and Full while Guided names the stage once", async () => {
    stubRenewalRoutes(manualState());
    const { container } = await renderWorkspace({
      manual: manualState(),
      view: "default",
      extra: { workStatus: WORK_STATUS },
    });
    const statuses = [...container.querySelectorAll("[data-renewal-secondary-status]")];
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) expect(status).not.toBeVisible();
    await userEvent.setup().click(viewButton("Full view"));
    for (const status of statuses) expect(status).toBeVisible();
  });

  it("continues a covered owner step to the tenant offer while keeping the message tools reachable", async () => {
    stubRenewalRoutes(manualState());
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    const context = renewalStageContextFor(
      { ...workspace.summary, guidance: workspace.guidance },
      null,
      null,
    );
    await renderWorkspace({
      workspace: {
        ...workspace,
        renewalStageContext: {
          ...context,
          standingAgreement: {
            label: "Example agreement",
            reason: "Owner pre-approved the rule",
          },
        },
      },
      manual: manualState(),
      view: "default",
    });
    const user = userEvent.setup();
    await user.click(
      within(guidedPane()).getByRole("button", { name: "Ask the owner" }),
    );
    expect(
      within(nowCard()).getByRole("button", { name: "Continue to Offer the tenant" }),
    ).toBeVisible();
    expect(
      within(nowCard()).queryByRole("button", { name: "Send the owner message" }),
    ).toBeNull();
    expect(nowCard()).toHaveTextContent(
      "Covered by Example agreement: no owner message needed",
    );
    await user.click(
      within(nowCard()).getByRole("button", { name: "Continue to Offer the tenant" }),
    );
    expect(nowCard()).toHaveAttribute("data-renewal-now-step", "offer-tenant");
  });

  it("BEH-S247-1: a lease opens in Guided view with the path strip and one Now card", async () => {
    const routes = stubRenewalRoutes(manualState());
    await renderWorkspace({
      manual: manualState(),
      view: "default",
      extra: { workStatus: WORK_STATUS },
    });
    const group = screen.getByRole("group", { name: "Lease view" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Guided view", "Focus view", "Full view"]);
    expect(viewButton("Guided view")).toHaveAttribute("aria-pressed", "true");
    const pane = guidedPane();
    const strip = within(pane).getByRole("navigation", { name: "Renewal path" });
    expect(
      within(strip)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(RENEWAL_PATH_STANDARD_STEPS.map((id) => RENEWAL_PATH_LABELS[id]));
    expect(
      within(strip)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      "Check the numbers",
      "Compare market rent",
      "Ask the owner",
      "Offer the tenant",
      "Documents and signatures",
      "Finish up",
      "Complete",
    ]);
    // Exactly one step is the current one, and the Now card has exactly one primary action.
    expect(strip.querySelectorAll("[aria-current='step']")).toHaveLength(1);
    const card = nowCard();
    expect(card.querySelectorAll("[data-renewal-now-primary]")).toHaveLength(1);
    expect(within(card).getByRole("button", { name: "Add a note" })).toBeVisible();
    expect(
      within(card).getByRole("button", { name: "Set status by hand" }),
    ).toBeVisible();
    // The staff status and its Status log stay reachable from Guided view.
    expect(
      screen.getByRole("region", { name: "Staff status and Status log" }),
    ).toBeVisible();
    // The five sections are links that open Full view; the Full view navigation steps aside.
    const sections = within(pane).getByRole("navigation", {
      name: "Every section in Full view",
    });
    expect(
      within(sections)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(RENEWAL_DASHBOARD_SECTIONS.map((section) => section.label));
    expect(
      screen.queryByRole("navigation", { name: "Renewal dashboard sections" }),
    ).toBeNull();
    expect(screen.queryByRole("region", { name: "Focus view" })).toBeNull();
    // AC-S247-4: opening is a read.
    expect(routes.writes()).toEqual([]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("BEH-S247-2: any later step can be worked while an earlier one is unfinished", async () => {
    const routes = stubRenewalRoutes(manualState());
    await renderWorkspace({ manual: manualState(), view: "default" });
    const user = userEvent.setup();
    const strip = within(guidedPane()).getByRole("navigation", { name: "Renewal path" });
    const current = strip.querySelector("[aria-current='step']")!;
    expect(current.textContent).not.toBe("Ask the owner");
    expect(visible("renewal-manual-owner_outreach")).toBe(false);
    await user.click(within(strip).getByRole("button", { name: "Ask the owner" }));
    await settle();
    expect(within(nowCard()).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Ask the owner",
    );
    expect(within(strip).getByRole("button", { name: "Ask the owner" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // The step's existing controls are shown in place, and the current step is unchanged.
    expect(visible("renewal-manual-owner_outreach")).toBe(true);
    expect(visible("renewal-card-message-owner")).toBe(true);
    expect(strip.querySelector("[aria-current='step']")?.textContent).toBe(
      current.textContent,
    );
    // Choosing a step leaves the address as it was and saves nothing.
    expect(window.location.search).toBe("");
    expect(routes.writes()).toEqual([]);
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("R-S247-11: an older step value opens Guided view at the step that holds it", async () => {
    stubRenewalRoutes(manualState());
    await renderWorkspace({
      manual: manualState(),
      view: "default",
      extra: { selectedStepId: "owner-decision" },
    });
    expect(within(nowCard()).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Ask the owner",
    );
  });

  it("R-S247-11: an older link to a control opens Full view at that control", async () => {
    stubRenewalRoutes(manualState());
    window.history.replaceState(null, "", `${LEASE_PATH}#renewal-manual-tenant_offer`);
    await renderWorkspace({ manual: manualState(), view: "default" });
    await settle(10);
    expect(viewButton("Full view")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("region", { name: "Guided view" })).toBeNull();
    expect(
      document
        .getElementById("renewal-manual-tenant_offer")!
        .contains(document.activeElement),
    ).toBe(true);
  });

  it("R-S247-9: a reload returns to the hand-chosen view and step; the next open starts in Guided view", async () => {
    const routes = stubRenewalRoutes(manualState());
    await renderWorkspace({ manual: manualState(), view: "default" });
    const user = userEvent.setup();
    const strip = within(guidedPane()).getByRole("navigation", { name: "Renewal path" });
    await user.click(within(strip).getByRole("button", { name: "Ask the owner" }));
    await user.click(viewButton("Focus view"));
    expect(screen.getByRole("region", { name: "Focus view" })).toBeVisible();
    // Switching changes neither the address nor any record.
    expect(window.location.search).toBe("");
    await user.click(viewButton("Guided view"));
    await user.click(viewButton("Full view"));
    // The page unloads for a reload: the view and step are kept in this tab only.
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    cleanup();
    const navigation = vi
      .spyOn(window.performance, "getEntriesByType")
      .mockReturnValue([{ type: "reload" } as unknown as PerformanceEntry]);
    await renderWorkspace({ manual: manualState(), view: "default" });
    await settle(5);
    expect(viewButton("Full view")).toHaveAttribute("aria-pressed", "true");
    await user.click(viewButton("Guided view"));
    expect(within(nowCard()).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Ask the owner",
    );
    // Opened any other way (not a reload), the lease starts in Guided view at its current step.
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    cleanup();
    navigation.mockReturnValue([{ type: "navigate" } as unknown as PerformanceEntry]);
    await renderWorkspace({ manual: manualState(), view: "default" });
    expect(viewButton("Guided view")).toHaveAttribute("aria-pressed", "true");
    navigation.mockRestore();
    expect(routes.writes()).toEqual([]);
  });

  it("R-S247-7: a section link opens Full view at that section", async () => {
    stubRenewalRoutes(manualState());
    await renderWorkspace({ manual: manualState(), view: "default" });
    const user = userEvent.setup();
    const sections = within(guidedPane()).getByRole("navigation", {
      name: "Every section in Full view",
    });
    await user.click(
      within(sections).getByRole("link", { name: "Tenant offer and response" }),
    );
    await settle();
    expect(viewButton("Full view")).toHaveAttribute("aria-pressed", "true");
    expect(document.activeElement?.closest("#renewal-section-tenant")).not.toBeNull();
  });

  it("R-S247-8: Set status by hand and Add a note reach the staff status controls", async () => {
    stubRenewalRoutes(manualState());
    await renderWorkspace({
      manual: manualState(),
      view: "default",
      extra: { workStatus: WORK_STATUS },
    });
    const user = userEvent.setup();
    const status = screen.getByRole("region", { name: "Staff status and Status log" });
    await user.click(
      within(nowCard()).getByRole("button", { name: "Set status by hand" }),
    );
    expect(status.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.tagName).toBe("SELECT");
    await user.click(within(nowCard()).getByRole("button", { name: "Add a note" }));
    expect(status.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
  });

  for (const name of ["admin-default-manual", "editor-maple-manual"] as const)
    it(`AC-S247-3 ${name}: Guided view and back leaves Full view at its recorded presentation`, async () => {
      const leaseId =
        name === "editor-maple-manual" ? "lease-4821-maple-4" : "lease-318-cedar-7";
      const state = manualState(leaseId);
      const routes = stubRenewalRoutes(state);
      const workspace = getRenewalLeaseWorkspace(leaseId)!;
      const view = render(
        <RenewalWorkspace
          manualState={state}
          role={name === "admin-default-manual" ? "Admin" : "Editor"}
          workspace={workspace}
        />,
      );
      await waitFor(() =>
        expect(document.getElementById("renewal-card-message-owner")).not.toBeNull(),
      );
      await settle();
      const user = userEvent.setup();
      expect(guidedPane()).toBeVisible();
      const requests = routes.calls.length;
      await user.click(viewButton("Full view"));
      await settle();
      expect(fullViewSignature(view.container)).toEqual(BASELINE[name]);
      await user.click(viewButton("Guided view"));
      const strip = within(guidedPane()).getByRole("navigation", {
        name: "Renewal path",
      });
      await user.click(within(strip).getByRole("button", { name: "Finish up" }));
      await user.click(viewButton("Full view"));
      await settle();
      expect(fullViewSignature(view.container)).toEqual(BASELINE[name]);
      expect(document.querySelectorAll("[data-renewal-focus-hidden]")).toHaveLength(0);
      expect(routes.calls.length).toBe(requests);
      expect(routes.writes()).toEqual([]);
      expect(router.refresh).not.toHaveBeenCalled();
    });

  it("BEH-S247-5: the path strip and the Now card are reachable by keyboard and announced", async () => {
    stubRenewalRoutes(manualState());
    await renderWorkspace({ manual: manualState(), view: "default" });
    const strip = within(guidedPane()).getByRole("navigation", { name: "Renewal path" });
    const finish = within(strip).getByRole("button", { name: "Finish up" });
    // Each step's state is read with its name, outside the button's own label.
    expect(finish).toHaveAccessibleDescription(/Open|Now|Done|Waiting|Covered/);
    act(() => finish.focus());
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    await settle();
    // Choosing a step moves focus to the Now card's heading.
    expect(document.activeElement).toBe(
      within(nowCard()).getByRole("heading", { level: 2 }),
    );
    expect(document.activeElement).toHaveTextContent("Finish up");
  });
});
