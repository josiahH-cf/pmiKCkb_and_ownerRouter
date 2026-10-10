// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, screen, within, render } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/lease-renewal/live/desk/lease/fixture",
  useSearchParams: () => new URLSearchParams(),
}));
import {
  renderWorkspace,
  stubRenewalRoutes,
  viewButton,
} from "@/tests/helpers/focus-workspace";
import { RenewalCopyValue } from "@/components/lease-renewal/RenewalCopyValue";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("keeps one editable Status log in the primary workflow through Focus/Full changes and a closed facts panel", async () => {
  const route = stubRenewalRoutes(null);
  await renderWorkspace({
    extra: {
      workStatus: {
        available: true,
        record: null,
        history: [],
        notes: [],
        currentCycleId: null,
      },
    },
  });
  const log = screen.getByRole("region", { name: "Staff status and Status log" });
  const note = within(log).getByLabelText("Add a note");
  expect(note).toBeVisible();
  fireEvent.change(note, { target: { value: "Keep this unsaved fixture note" } });
  fireEvent.click(viewButton("Full view"));
  expect(note).toHaveValue("Keep this unsaved fixture note");
  fireEvent.click(viewButton("Focus view"));
  expect(note).toBeVisible();
  expect(document.querySelectorAll(".renewal-status-note-input")).toHaveLength(1);
  const next = document.getElementById("renewal-next-action"),
    recorded = document.getElementById("renewal-card-manual-records");
  expect(next?.parentElement).toBe(recorded?.parentElement);
  expect(next).toBeVisible();
  expect(recorded).toBeVisible();
  expect(route.writes()).toHaveLength(0);
});
it("provides a specifically named copy icon, exact local value, and a selectable refusal fallback", async () => {
  const copy = vi.fn().mockRejectedValue(new Error("clipboard denied"));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copy },
  });
  render(<RenewalCopyValue label="working renewal rent" value="$1,337" />);
  const button = screen.getByRole("button", {
    name: "Copy working renewal rent: $1,337",
  });
  expect(button.querySelector("svg")).not.toBeNull();
  fireEvent.click(button);
  await screen.findByText(/Copy was not confirmed/);
  expect(copy).toHaveBeenCalledExactlyOnceWith("$1,337");
  expect(screen.getByText("$1,337")).toBeVisible();
});
