// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { MaintenancePreapprovalControl } from "@/components/maintenance/MaintenancePreapprovalControl";
afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it("a URL-only unknown policy keeps fields disabled until the exact original cutoff wins", async () => {
  history.replaceState(
    null,
    "",
    "/?maintenance_policy_operation=0ce2a9b6-349d-4946-b5e7-56f5cfb7782c",
  );
  const fetch = vi.fn(async (_u: string, o?: RequestInit) =>
    Response.json(
      o?.method === "PATCH"
        ? { state: "cancelled", preapproval: null }
        : { state: "not_recorded", preapproval: null },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  render(<MaintenancePreapprovalControl ownerUid="fixture-admin" canManage />);
  await screen.findByRole("button", { name: "Check original policy receipt" });
  expect(screen.getByLabelText("Property ID")).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Retry the same policy save" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Stop if not admitted" }));
  await waitFor(() =>
    expect(new URL(location.href).searchParams.has("maintenance_policy_operation")).toBe(
      false,
    ),
  );
  expect(fetch.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
  expect(screen.getByLabelText("Property ID")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Read current policies" })).toBeEnabled();
});
