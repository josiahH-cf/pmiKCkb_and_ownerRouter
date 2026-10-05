// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));
import {
  renderWorkspace,
  settle,
  stubRenewalRoutes,
} from "@/tests/helpers/focus-workspace";
import { manualFixture } from "@/tests/helpers/renewal-action-fixtures";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("S176 the actual Full workspace leads with labels and actions, retaining staff/source truth without repeated instructions", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-30T17:00:00.000Z"));
  const manual = manualFixture();
  const routes = stubRenewalRoutes(manual);
  const view = await renderWorkspace({ manual });
  fireEvent.click(screen.getByRole("button", { name: "Full view" }));
  await settle();
  const duplicateDirections = [
    "Enter what you know. Each value saves",
    "This list summarizes recorded source facts",
    "The listings, report or review supporting your numbers, when you want it on record",
    "Prepare one below with the exact changes",
    "Enter only the exact changes. Saving reads fresh RentVine state",
    "To prepare one, choose the field under",
    "To prepare one, use Add Sheet row below",
    "Capture comp data to compute a suggestion. The app never fabricates a number",
    "Filled PDFs use the packet controls for preparation",
  ].filter((text) => view.container.textContent?.replace(/\s+/g, " ").includes(text));
  expect(duplicateDirections).toEqual([]);
  expect(view.container.textContent).not.toMatch(
    /Enter what you know\. Each value saves|This list summarizes recorded source facts|The listings, report or review supporting your numbers, when you want it on record/,
  );
  expect(screen.getAllByLabelText("Working monthly rent")[0]).toBeVisible();
  expect(screen.getAllByLabelText("Working effective date")[0]).toBeVisible();
  expect(screen.getByRole("button", { name: "Lease information" })).toBeEnabled();
  expect(
    screen.getAllByText(/Provider evidence is shown separately/).length,
  ).toBeGreaterThan(0);
  expect(routes.calls.filter((call) => call.method !== "GET")).toHaveLength(0);
}, 30_000);
