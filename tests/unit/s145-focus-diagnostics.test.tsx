// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

// The real projection, optionally followed by fixture rules that the real resolver settles. The
// current renewal rules cannot form a cycle or name a missing prerequisite (the S145 server-rule
// matrix shows the only reachable diagnostic is the recorded branch conflict), so these fixture
// rules are the only way to show how the pane explains one.
const inject = vi.hoisted(() => ({ graph: null as null | "cycle" | "missing" }));
vi.mock("@/lib/lease-renewal/renewal-actions", async (original) => {
  const actual = await original<typeof import("@/lib/lease-renewal/renewal-actions")>();
  const { resolveActionGraph } = await import("@/lib/lease-renewal/action-graph");
  type Node = Parameters<typeof resolveActionGraph>[0][number];
  const LABELS: Record<string, string> = {
    "fixture.step_a": "Fixture step A",
    "fixture.step_b": "Fixture step B",
    "fixture.step_c": "Fixture step C",
  };
  const node = (id: string, requires: string, place: number): Node => ({
    id,
    priority: [9, place],
    applicability: "applicable",
    completion: "incomplete",
    requires: { kind: "node", id: requires },
    actor: "actor",
  });
  return {
    ...actual,
    projectRenewalActions: (
      ...args: Parameters<typeof actual.projectRenewalActions>
    ): ReturnType<typeof actual.projectRenewalActions> => {
      const projection = actual.projectRenewalActions(...args);
      if (!inject.graph) return projection;
      const resolution = resolveActionGraph(
        inject.graph === "cycle"
          ? [
              node("fixture.step_a", "fixture.step_b", 0),
              node("fixture.step_b", "fixture.step_a", 1),
            ]
          : [node("fixture.step_c", "fixture.absent", 2)],
      );
      const extra = resolution.order.map((id) => {
        const result = resolution.results[id]!;
        return {
          id,
          ref: { leaseId: projection.leaseId, cycleId: projection.cycleId, key: id },
          label: LABELS[id]!,
          detail: null,
          group: "process" as const,
          requirement: "required" as const,
          status: result.status,
          reason: result.reason,
          prerequisites: [],
          unmetConditions: result.unmetConditions,
          blockedBy: result.blockedBy,
          resolvableVia: result.resolvableVia,
          unlocks: result.unlocks,
          evidence: "A fixture rule's own evidence.",
          responsible: "an Editor",
          waitingOn: null,
          control: null,
        };
      });
      return {
        ...projection,
        actions: [...projection.actions, ...extra],
        diagnostics: [...projection.diagnostics, ...resolution.diagnostics],
      };
    },
  };
});

import { manualFixture } from "@/tests/helpers/renewal-action-fixtures";
import {
  focusPane,
  renderWorkspace,
  settle,
  stubRenewalRoutes,
} from "@/tests/helpers/focus-workspace";

// S145 (FV-36, FV-37, AC-S142-2): the Focus pane explains an unresolved rule with the actions it
// involves, keeps the affected work listed, completes nothing and leaves independent work ready.

const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PINNED_NOW);
  inject.graph = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  inject.graph = null;
});

async function choose(user: UserEvent, actionId: string) {
  const pane = focusPane();
  await user.click(within(pane).getByText(/^All renewal work/));
  const item = pane.querySelector(`[data-renewal-action-id="${actionId}"]`)!;
  await user.click(within(item as HTMLElement).getByRole("button"));
  await settle();
}

function rules() {
  return within(focusPane()).getByRole("list", { name: "Rules that need review" });
}

describe("S145 Focus rule diagnostics", { timeout: 60_000 }, () => {
  it("names both actions of a dependency cycle and keeps independent work ready (FV-36)", async () => {
    inject.graph = "cycle";
    const routes = stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    await settle();
    const cycle =
      "These steps each wait on another one of them: Fixture step A, Fixture step B.";
    expect(rules()).toHaveTextContent(cycle);
    // The independent staff work still leads; the cycle blocks nothing else.
    expect(within(focusPane()).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Owner outreach",
    );
    await choose(user, "fixture.step_a");
    const pane = focusPane();
    expect(within(pane).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Fixture step A",
    );
    expect(pane.querySelector(".renewal-focus-state")).toHaveTextContent(
      `${cycle} This step's records need review in Full view.`,
    );
    expect(pane.getAttribute("data-renewal-focus-status")).toBe("unresolved");
    expect(
      within(pane).getByRole("heading", { name: "Review in Full view (2)" }),
    ).toBeInTheDocument();
    expect(within(pane).queryByText("Every required step is recorded.")).toBeNull();
    expect(routes.writes()).toEqual([]);
  });

  it("keeps work that names a missing prerequisite listed with its diagnostic (FV-37)", async () => {
    inject.graph = "missing";
    stubRenewalRoutes(manualFixture());
    const user = userEvent.setup();
    await renderWorkspace({ manual: manualFixture() });
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    await settle();
    const missing =
      "Fixture step C names a prerequisite that is not defined: fixture.absent.";
    expect(rules()).toHaveTextContent(missing);
    await choose(user, "fixture.step_c");
    expect(focusPane().querySelector(".renewal-focus-state")).toHaveTextContent(missing);
    expect(
      within(focusPane()).getByRole("heading", { name: "Review in Full view (1)" }),
    ).toBeInTheDocument();
  });

  it("explains the recorded owner and tenant conflict from the real rules", async () => {
    const conflict = manualFixture({
      owner: "declined_non_renewal",
      tenant: "accepted",
      done: ["owner_outreach", "tenant_offer"],
    });
    stubRenewalRoutes(conflict);
    const user = userEvent.setup();
    await renderWorkspace({ manual: conflict });
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    await settle();
    expect(rules()).toHaveTextContent(
      "Recorded owner and tenant responses conflict. It needs: One consistent owner and tenant outcome.",
    );
    expect(
      within(focusPane()).queryByText("Every required step is recorded."),
    ).toBeNull();
  });
});
