// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { ConsoleApproveButton } from "@/components/console/ConsoleApproveButton";
import { RenewalDeskRefresh } from "@/components/lease-renewal/RenewalDeskRefresh";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});
it("S170 a successful refresh keeps acknowledgement until the owning server snapshot arrives", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "refreshed" })),
  );
  const readAtMs = Date.now();
  const view = render(<RenewalDeskRefresh readAtMs={readAtMs} ttlMs={60_000} />);
  fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
  await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Refreshing" })).toBeDisabled();
  view.rerender(<RenewalDeskRefresh readAtMs={readAtMs + 1} ttlMs={60_000} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeEnabled(),
  );
});
it("S170 a failed owning source refresh keeps its error visible instead of claiming a completed reload", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ error: "Source unavailable" }, { status: 503 })),
  );
  render(<RenewalDeskRefresh readAtMs={Date.now()} ttlMs={60_000} />);
  fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Source unavailable");
  expect(router.refresh).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Refresh data" })).toBeEnabled();
});
it("S169 an uncertain inline approval remains fenced and leads to its original item readback", async () => {
  const fetch = vi.fn(async () => {
    throw new TypeError("Response lost");
  });
  vi.stubGlobal("fetch", fetch);
  render(<ConsoleApproveButton itemId="fixture-item" />);
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/not confirmed/i);
  expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Check approval status" })).toHaveAttribute(
    "href",
    "/approval-queue?item_id=fixture-item",
  );
  fireEvent.click(screen.getByRole("button", { name: "Approve" }));
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("S169 the real inline control refuses two deliveries before the pending render", async () => {
  const fetch = vi.fn(() => new Promise<Response>(() => {}));
  vi.stubGlobal("fetch", fetch);
  render(<ConsoleApproveButton itemId="fixture-item" />);
  const button = screen.getByRole("button", { name: "Approve" });
  await act(async () => {
    fireEvent.click(button);
    fireEvent.click(button);
  });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
});
