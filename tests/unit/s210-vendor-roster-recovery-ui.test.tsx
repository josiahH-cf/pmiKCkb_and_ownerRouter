// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { MaintenanceVendorRoster } from "@/components/maintenance/MaintenanceVendorRoster";
const operationId = "221f1e86-8f82-4db1-b47a-f4b097d6d437";
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});
it("recovers a committed roster save from its URL when local fields disappeared without creating another save", async () => {
  window.history.replaceState(
    {},
    "",
    `/maintenance/vendors?vendor_roster_operation=${operationId}`,
  );
  const fetch = vi.fn(async (url: string, _options?: RequestInit) =>
    Response.json(
      url.includes("operation_id=")
        ? { operationId, state: "committed", committedVersion: 1 }
        : { roster: [], vendors: [] },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<MaintenanceVendorRoster actorUid="admin-fixture" canManage />);
  await screen.findByText(/original local fields are unavailable/i);
  expect(screen.getByRole("button", { name: "Save vendor preferences" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Retry exact original roster save" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Check original roster save" }));
  await screen.findByText(/Original roster save committed at version 1/);
  expect(fetch.mock.calls.every((call) => call.length === 1 || !call[1]?.method)).toBe(
    true,
  );
  expect(window.location.search).not.toContain("vendor_roster_operation");
});
it("an absent original receipt keeps editing blocked until an exact app-owned cutoff settles it", async () => {
  window.history.replaceState(
    {},
    "",
    `/maintenance/vendors?vendor_roster_operation=${operationId}`,
  );
  const fetch = vi.fn(async (url: string, options?: RequestInit) =>
    Response.json(
      options?.method === "DELETE"
        ? {
            operationId,
            state: "stopped",
            detail: "Original roster save stopped before commitment.",
          }
        : url.includes("operation_id=")
          ? {
              operationId,
              state: "not_recorded",
              detail: "Absence does not establish failure.",
            }
          : { roster: [], vendors: [] },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<MaintenanceVendorRoster actorUid="admin-fixture" canManage />);
  await screen.findByRole("button", { name: "Check original roster save" });
  fireEvent.click(screen.getByRole("button", { name: "Check original roster save" }));
  await screen.findByText("Absence does not establish failure.");
  expect(screen.getByRole("button", { name: "Save vendor preferences" })).toBeDisabled();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Stop original roster save if it has not committed",
    }),
  );
  await screen.findByText("Original roster save stopped before commitment.");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save vendor preferences" })).toBeEnabled(),
  );
  expect(fetch.mock.calls.filter((call) => call[1]?.method === "DELETE")).toHaveLength(1);
  expect(fetch.mock.calls.some((call) => call[1]?.method === "POST")).toBe(false);
});
