// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { RenewalWorkspace } from "@/components/lease-renewal/RenewalWorkspace";
import type { Role } from "@/lib/auth/roles";
import type { RenewalProcessStepId } from "@/lib/lease-renewal/renewal-process";
import { emptyRenewalWorkspace } from "@/lib/lease-renewal/workspace-state";
import { fullViewSignature } from "@/tests/helpers/full-view-signature";
import { settle, stubRenewalRoutes } from "@/tests/helpers/focus-workspace";
import { getRenewalLeaseWorkspace } from "@/tests/helpers/sample-desk";

// S145 (BEH-S145-2, AC-S145-3): for every recorded baseline case, Focus view entered and left in
// both orders returns the Full view byte-for-byte to the recorded signature, with no request,
// save, navigation or refresh. The non-consolidated layout offers no switch at all.
// S152 (f2a50650): the lease opens in Focus view, so the Full view is reached through the switch
// first; every later round trip must return it unchanged.

const BASELINE = JSON.parse(
  readFileSync(
    join(__dirname, "..", "fixtures", "s193-communications-full-view-presentation.json"),
    "utf8",
  ),
) as Record<string, ReturnType<typeof fullViewSignature>>;
const CYCLE_ID = "b4bc3b81-c402-4f62-a2e2-c605c67867fb";
const PINNED_NOW = new Date("2026-09-30T17:00:00.000Z");

const CASES: readonly {
  name: string;
  leaseId: string;
  role: Role;
  selectedStepId?: RenewalProcessStepId;
}[] = [
  {
    name: "editor-owner-step-manual",
    leaseId: "lease-318-cedar-7",
    role: "Editor",
    selectedStepId: "owner-decision",
  },
  { name: "admin-default-manual", leaseId: "lease-318-cedar-7", role: "Admin" },
  { name: "approver-default-manual", leaseId: "lease-318-cedar-7", role: "Approver" },
  { name: "editor-maple-manual", leaseId: "lease-4821-maple-4", role: "Editor" },
  { name: "editor-walnut-manual", leaseId: "lease-1207-walnut-2", role: "Editor" },
];

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

async function renderCase(testCase: (typeof CASES)[number]) {
  const workspace = getRenewalLeaseWorkspace(testCase.leaseId)!;
  const manualState = emptyRenewalWorkspace(workspace.summary.id, CYCLE_ID, {
    kind: "lease_end",
    dateIso: "2026-12-31",
    source: "RentVine lease end",
  });
  const routes = stubRenewalRoutes(manualState);
  const view = render(
    <RenewalWorkspace
      workspace={workspace}
      role={testCase.role}
      manualState={manualState}
      {...(testCase.selectedStepId ? { selectedStepId: testCase.selectedStepId } : {})}
    />,
  );
  // Focus view hides the Full view regions in place (no accessible names), so the message
  // preparation cards are awaited by id.
  await waitFor(() => {
    expect(document.getElementById("renewal-card-message-owner")).not.toBeNull();
    expect(document.getElementById("renewal-card-message-tenant")).not.toBeNull();
  });
  await settle();
  return { view, routes };
}

async function showFullView(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Full view" }));
  await settle();
}

describe("S145 Focus round trip preserves the Full view", { timeout: 120_000 }, () => {
  for (const testCase of CASES)
    it(`${testCase.name}: Full view returns to the recorded baseline in both orders`, async () => {
      const { view, routes } = await renderCase(testCase);
      const user = userEvent.setup();
      expect(screen.getByRole("region", { name: "Focus view" })).toBeVisible();
      const requests = routes.calls.length;
      await showFullView(user);
      expect(screen.queryByRole("region", { name: "Focus view" })).toBeNull();
      expect(fullViewSignature(view.container)).toEqual(BASELINE[testCase.name]);

      await user.click(screen.getByRole("button", { name: "Focus view" }));
      expect(screen.getByRole("region", { name: "Focus view" })).toBeVisible();
      await user.click(screen.getByRole("button", { name: "Full view" }));
      await settle();
      expect(fullViewSignature(view.container)).toEqual(BASELINE[testCase.name]);

      await user.click(screen.getByRole("button", { name: "Focus view" }));
      await user.click(screen.getByRole("button", { name: "Full view" }));
      await user.click(screen.getByRole("button", { name: "Focus view" }));
      await user.click(screen.getByRole("button", { name: "Full view" }));
      await settle();
      expect(fullViewSignature(view.container)).toEqual(BASELINE[testCase.name]);
      expect(document.querySelectorAll("[data-renewal-focus-hidden]")).toHaveLength(0);
      expect(routes.calls.length).toBe(requests);
      expect(routes.writes()).toEqual([]);
      expect(router.refresh).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    });

  it("operates the switch from the keyboard and keeps focus on it", async () => {
    const { view } = await renderCase(CASES[1]!);
    const user = userEvent.setup();
    await showFullView(user);
    const focusButton = screen.getByRole("button", { name: "Focus view" });
    focusButton.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("region", { name: "Focus view" })).toBeVisible();
    expect(focusButton).toHaveFocus();
    // S152: the Focus button renders first, so Full view is the next stop.
    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Full view" })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.queryByRole("region", { name: "Focus view" })).toBeNull();
    expect(fullViewSignature(view.container)).toEqual(BASELINE[CASES[1]!.name]);
  });

  it("returns every disclosure as it was after working through tasks in Focus", async () => {
    const { view } = await renderCase(CASES[1]!);
    const user = userEvent.setup();
    await showFullView(user);
    const disclosures = () =>
      [...view.container.querySelectorAll("details")].map((details) => details.open);
    const before = disclosures();
    expect(before.filter((open) => !open).length).toBeGreaterThan(5);
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    const pane = screen.getByRole("region", { name: "Focus view" });
    await user.click(within(pane).getByText(/^All renewal work/));
    // Choosing each task reveals its controls, opening the disclosures on its path.
    for (const item of [...pane.querySelectorAll("[data-renewal-action-id]")]) {
      await user.click(within(item as HTMLElement).getByRole("button"));
      await settle();
    }
    expect(disclosures()).not.toEqual(before);
    await user.click(screen.getByRole("button", { name: "Full view" }));
    await settle();
    expect(disclosures()).toEqual(before);
    expect(fullViewSignature(view.container)).toEqual(BASELINE[CASES[1]!.name]);
  });

  it("copies the same lease values before and after a Focus round trip", async () => {
    await renderCase(CASES[1]!);
    const user = userEvent.setup();
    await showFullView(user);
    const clipboard = vi.spyOn(navigator.clipboard, "writeText");
    // The S114 whole-value and one-audience copy controls of the lease information.
    const copyAll = async () => {
      const before = clipboard.mock.calls.length;
      for (const button of screen.getAllByRole("button", {
        name: /^Copy (all .+ emails|all .+ names and emails|[^:]+: )/,
      }))
        await user.click(button);
      return clipboard.mock.calls.slice(before).map(([value]) => value);
    };
    const information = screen.getByRole("button", { name: "Lease information" });
    await user.click(information);
    const first = await copyAll();
    expect(first.length).toBeGreaterThan(3);
    await user.click(information);
    await user.click(screen.getByRole("button", { name: "Focus view" }));
    await user.click(screen.getByRole("button", { name: "Full view" }));
    await settle();
    await user.click(screen.getByRole("button", { name: "Lease information" }));
    expect(await copyAll()).toEqual(first);
  });

  it("offers no switch in the non-consolidated layout and leaves it unchanged", async () => {
    const workspace = getRenewalLeaseWorkspace("lease-318-cedar-7")!;
    stubRenewalRoutes(null);
    const view = render(<RenewalWorkspace workspace={workspace} role="Editor" />);
    await settle();
    expect(screen.queryByRole("group", { name: "Lease view" })).toBeNull();
    expect(fullViewSignature(view.container)).toEqual(
      BASELINE["editor-default-no-cycle"],
    );
  });
});
