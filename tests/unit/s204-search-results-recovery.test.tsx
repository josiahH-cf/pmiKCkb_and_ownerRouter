// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EntitySearchResults } from "@/components/search/EntitySearchResults";
const result = (id: string, label: string, cursor: string | null = null) => ({
  results: [
    {
      entity: {
        id,
        type: "lease",
        label,
        fields: [],
        relations: [],
        href: `/lease-renewal/live/desk/lease/${id}`,
        asOf: "2026-10-10T15:00:00Z",
      },
      match: { field: "Address", context: label },
    },
  ],
  nextCursor: cursor,
  limitations: [],
  readAt: "2026-10-10T15:00:00Z",
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});
it("filtering and browser back discard a late older page without losing the newer query, filter or correct record links", async () => {
  let finishOlder!: (response: Response) => void;
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    const u = new URL(String(input), "https://example.test");
    if (u.searchParams.has("cursor"))
      return new Promise<Response>((resolve) => {
        finishOlder = resolve;
      });
    if (u.searchParams.get("q") === "East")
      return Response.json(result("168", "East current"));
    if (u.searchParams.get("type") === "owner")
      return Response.json(result("702", "Filtered current"));
    return Response.json(result("701", "Miller initial", "original-page"));
  });
  vi.stubGlobal("fetch", transport);
  window.history.replaceState(null, "", "/search?q=Miller&type=all");
  render(<EntitySearchResults initialQuery="Miller" />);
  await screen.findByRole("link", { name: "Miller initial" });
  fireEvent.click(screen.getByRole("button", { name: "Load more results" }));
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
  fireEvent.change(screen.getByLabelText("Entity type"), { target: { value: "owner" } });
  await screen.findByRole("link", { name: "Filtered current" });
  await act(async () => {
    finishOlder(Response.json(result("999", "Late old record")));
  });
  expect(screen.queryByRole("link", { name: "Late old record" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Entity type")).toHaveValue("owner");
  window.history.replaceState(null, "", "/search?q=East&type=lease");
  fireEvent(window, new PopStateEvent("popstate"));
  const current = await screen.findByRole("link", { name: "East current" });
  expect(current).toHaveAttribute("href", "/search/open?type=lease&id=168");
  expect(screen.getByLabelText("Query")).toHaveValue("East");
  expect(screen.getByLabelText("Entity type")).toHaveValue("lease");
  expect(
    screen.queryByRole("link", { name: "Filtered current" }),
  ).not.toBeInTheDocument();
});
it("a failed next page retains existing results and restarts the exact query for a fresh source generation", async () => {
  const transport = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(result("701", "Available first page", "next-page")),
    )
    .mockRejectedValueOnce(new TypeError("Synthetic outage"))
    .mockResolvedValueOnce(Response.json(result("702", "Fresh restarted result")));
  vi.stubGlobal("fetch", transport);
  window.history.replaceState(null, "", "/search?q=Miller&type=lease");
  render(<EntitySearchResults initialQuery="Miller" initialType="lease" />);
  await screen.findByRole("link", { name: "Available first page" });
  fireEvent.click(screen.getByRole("button", { name: "Load more results" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("link", { name: "Available first page" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Restart current search" }));
  await screen.findByRole("link", { name: "Fresh restarted result" });
  expect(
    screen.queryByRole("link", { name: "Available first page" }),
  ).not.toBeInTheDocument();
  const retry = new URL(String(transport.mock.calls[2][0]), "https://example.test");
  expect(retry.searchParams.get("q")).toBe("Miller");
  expect(retry.searchParams.get("type")).toBe("lease");
  expect(retry.searchParams.has("cursor")).toBe(false);
});
