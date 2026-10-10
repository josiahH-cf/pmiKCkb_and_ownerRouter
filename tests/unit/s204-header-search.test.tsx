// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, it, expect, vi } from "vitest";
import { GlobalEntitySearch } from "@/components/search/GlobalEntitySearch";
const page = (id = "123", label = "East 123 Fixture Road") => ({
  results: [
    {
      entity: {
        id,
        type: "lease",
        label,
        fields: [],
        relations: [],
        href: `/lease-renewal/live/desk/lease/${id}`,
        asOf: "2026-10-09T15:00:00Z",
      },
      match: { field: "Address", context: label },
    },
  ],
  nextCursor: null,
  limitations: [],
  readAt: "2026-10-09T15:00:00Z",
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("keeps an empty input private and pressing Enter without arrow selection opens all query results in a new tab", async () => {
  const fetch = vi.fn(async () => Response.json(page())),
    open = vi.spyOn(window, "open").mockReturnValue(null);
  vi.stubGlobal("fetch", fetch);
  render(<GlobalEntitySearch />);
  expect(fetch).not.toHaveBeenCalled();
  const input = screen.getByRole("combobox", { name: "Search records" });
  fireEvent.change(input, { target: { value: "East 1" } });
  await screen.findByRole("option", { name: /East 123 Fixture Road/ });
  expect(input).not.toHaveAttribute("aria-activedescendant");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(open).toHaveBeenCalledWith(
    "/search?q=East+1&type=all",
    "_blank",
    "noopener,noreferrer",
  );
});
it("opens only a deliberately selected suggestion and resets selection when suggestions change", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(page())),
  );
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  render(<GlobalEntitySearch />);
  const input = screen.getByRole("combobox", { name: "Search records" });
  fireEvent.change(input, { target: { value: "East 1" } });
  await screen.findByRole("option", { name: /East 123 Fixture Road/ });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input).toHaveAttribute("aria-activedescendant");
  fireEvent.keyDown(input, { key: "Enter" });
  expect(open).toHaveBeenLastCalledWith(
    "/search/open?type=lease&id=123",
    "_blank",
    "noopener,noreferrer",
  );
  fireEvent.change(input, { target: { value: "East" } });
  expect(input).not.toHaveAttribute("aria-activedescendant");
});
it("ignores an older request, keeps the query on failure and retries without submitting an enclosing form", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  let resolveOld!: (value: Response) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveOld = resolve;
        }),
    )
    .mockResolvedValueOnce(Response.json(page("168", "East 168 Fixture Road")))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(Response.json(page()));
  vi.stubGlobal("fetch", fetch);
  const submit = vi.fn((e) => e.preventDefault());
  render(
    <form onSubmit={submit}>
      <GlobalEntitySearch />
    </form>,
  );
  const input = screen.getByRole("combobox", { name: "Search records" });
  fireEvent.change(input, { target: { value: "Old" } });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: "East" } });
  await screen.findByRole("option", { name: /East 168/ });
  resolveOld(Response.json(page("999", "Old hidden response")));
  await waitFor(() =>
    expect(screen.queryByText("Old hidden response")).not.toBeInTheDocument(),
  );
  fireEvent.change(input, { target: { value: "Miller" } });
  await screen.findByRole("button", { name: "Retry search" });
  expect(input).toHaveValue("Miller");
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(submit).not.toHaveBeenCalled();
});
