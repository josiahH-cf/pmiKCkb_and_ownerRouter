// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RenewalDeskViewMemory,
  RenewalDeskViewMemoryStatus,
  resetRenewalDeskViewMemoryForTests,
  type RenewalDeskViewMemoryProps,
} from "@/components/lease-renewal/RenewalDeskViewMemory";

// S166 (F15): a deliberate worklist change is remembered for the account; a view opened from a
// link is not. The fetch seam is counted; nothing here reaches a server.

const ROUTE = "/api/lease-renewal/desk-preferences";
const SAVED = "v=2&sort=end_date&direction=desc&scope=all";

type Props = Omit<RenewalDeskViewMemoryProps, "children">;

// Plain anchors stand in for the table's links: the wrapper reads the rendered href only.
const HREFS = {
  all: "/lease-renewal/live/desk?v=2&scope=all",
  active: "/lease-renewal/live/desk?v=2",
  bare: "/lease-renewal/live/desk",
  lease: "/lease-renewal/live/desk/lease/7001?deskView=v%3D2%26scope%3Dall",
};

function controls(): ReactNode {
  return (
    <>
      <RenewalDeskViewMemoryStatus />
      <a href={HREFS.all}>All leases</a>
      <a href={HREFS.active}>Active</a>
      <a href={HREFS.bare}>Bare desk</a>
      <a href={HREFS.lease}>7001 Sample St</a>
      <form action="/lease-renewal/live/desk" aria-label="Sort by end date" method="get">
        <input name="v" type="hidden" value="2" />
        <input name="direction" type="hidden" value="desc" />
        <input name="sort" type="hidden" value="end_date" />
        <button type="submit">Renewal date</button>
      </form>
    </>
  );
}

function view(props: Props) {
  return <RenewalDeskViewMemory {...props}>{controls()}</RenewalDeskViewMemory>;
}

const base: Props = {
  currentView: "",
  viewSource: "default",
  savedView: null,
  memory: "saved",
};

let fetchMock: ReturnType<typeof vi.fn>;

function respond(ok: boolean, body: unknown = {}, status = ok ? 200 : 500) {
  return Promise.resolve({ ok, status, json: async () => body } as Response);
}

function posts(): { url: string; body: unknown }[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    body: JSON.parse(String((init as RequestInit).body)),
  }));
}

/** Follow a control without letting jsdom try to navigate. */
function follow(element: HTMLElement) {
  element.addEventListener("click", (event) => event.preventDefault(), { once: true });
  fireEvent.click(element);
}

/** The browser's address after a navigation; the page then renders the view it names. */
function arriveAt(search: string) {
  window.history.replaceState({}, "", `/lease-renewal/live/desk${search}`);
}

beforeEach(() => {
  arriveAt("");
  window.sessionStorage.clear();
  resetRenewalDeskViewMemoryForTests();
  fetchMock = vi.fn(() => respond(true, { preference: { view: SAVED } }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S166 deliberate worklist changes are remembered (ARCH-S166-2)", () => {
  it("BEH-S166-5: choosing a view from the worklist saves it once the view has opened", async () => {
    const { rerender } = render(view(base));
    expect(fetchMock).not.toHaveBeenCalled();
    follow(screen.getByRole("link", { name: "All leases" }));
    // Nothing is saved until the chosen view is actually the one on screen.
    expect(fetchMock).not.toHaveBeenCalled();
    arriveAt("?v=2&scope=all");
    rerender(view({ ...base, currentView: "v=2&scope=all", viewSource: "explicit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(posts()).toEqual([{ url: ROUTE, body: { query: "v=2&scope=all" } }]);
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveAttribute("data-autosave", "saved"),
    );
  });

  it("BEH-S166-5: sorting through a worklist form is a deliberate change, after a full page load too", async () => {
    const first = render(view(base));
    fireEvent.submit(screen.getByRole("form", { name: "Sort by end date" }));
    first.unmount();
    // A native GET form reloads the page: the new page mounts fresh with the chosen view. The
    // address carries the fields in form order; the page reports the canonical view.
    arriveAt("?v=2&direction=desc&sort=end_date");
    render(
      view({
        ...base,
        currentView: "v=2&sort=end_date&direction=desc",
        viewSource: "explicit",
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(posts()[0].body).toEqual({ query: "v=2&sort=end_date&direction=desc" });
  });

  it("BEH-S166-7: Reset to default view saves the default for the account", async () => {
    const { rerender } = render(
      view({ ...base, currentView: SAVED, viewSource: "saved", savedView: SAVED }),
    );
    expect(screen.getByText("Showing your saved view.")).toBeInTheDocument();
    const reset = screen.getByRole("link", { name: "Reset to default view" });
    expect(reset).toHaveAttribute("href", "/lease-renewal/live/desk?v=2");
    follow(reset);
    arriveAt("?v=2");
    rerender(
      view({ ...base, currentView: "", viewSource: "explicit", savedView: SAVED }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(posts()[0].body).toEqual({ query: "v=2" });
    await waitFor(() =>
      expect(screen.queryByRole("link", { name: "Reset to default view" })).toBeNull(),
    );
  });

  it("BEH-S166-8 / BEH-S166-9 / AC-S166-3: a view opened from a link is shown and not saved; the remembered view stays", async () => {
    arriveAt("?v=2&overallStatus=blocked");
    render(
      view({
        ...base,
        currentView: "v=2&overallStatus=blocked",
        viewSource: "explicit",
        savedView: SAVED,
      }),
    );
    await screen.findByText(
      "This link opened its own view. Your saved view is unchanged.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open your saved view" })).toHaveAttribute(
      "href",
      "/lease-renewal/live/desk",
    );
    // Returning to the ordinary entry is not a change either.
    follow(screen.getByRole("link", { name: "Open your saved view" }));
    follow(screen.getByRole("link", { name: "Bare desk" }));
    follow(screen.getByRole("link", { name: "7001 Sample St" }));
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("BEH-S166-9: after following a link, the next deliberate change updates the remembered view", async () => {
    const linked: Props = {
      ...base,
      currentView: "v=2&overallStatus=blocked",
      viewSource: "explicit",
      savedView: SAVED,
    };
    arriveAt("?v=2&overallStatus=blocked");
    const { rerender } = render(view(linked));
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
    follow(screen.getByRole("link", { name: "All leases" }));
    arriveAt("?v=2&scope=all");
    rerender(view({ ...linked, currentView: "v=2&scope=all" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(posts()[0].body).toEqual({ query: "v=2&scope=all" });
  });

  it("BEH-S166-9: Remember this view keeps a linked view on request", async () => {
    arriveAt("?v=2&overallStatus=blocked");
    render(
      view({
        ...base,
        currentView: "v=2&overallStatus=blocked",
        viewSource: "explicit",
        savedView: SAVED,
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Remember this view" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(posts()[0].body).toEqual({ query: "v=2&overallStatus=blocked" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remember this view" })).toBeNull(),
    );
  });

  it("AC-S166-3: a chosen view that never opened is not saved when a different link opens instead", async () => {
    const first = render(view(base));
    follow(screen.getByRole("link", { name: "All leases" }));
    first.unmount();
    arriveAt("?v=2&overallStatus=blocked");
    render(
      view({
        ...base,
        currentView: "v=2&overallStatus=blocked",
        viewSource: "explicit",
        savedView: SAVED,
      }),
    );
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not save again when the chosen view is already the remembered one", async () => {
    const { rerender } = render(view({ ...base, savedView: "v=2&scope=all" }));
    follow(screen.getByRole("link", { name: "All leases" }));
    arriveAt("?v=2&scope=all");
    rerender(
      view({
        ...base,
        currentView: "v=2&scope=all",
        viewSource: "explicit",
        savedView: "v=2&scope=all",
      }),
    );
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the view on screen and offers the same save again when saving fails", async () => {
    fetchMock.mockImplementationOnce(() => respond(false, { error: "Try later." }));
    const { rerender } = render(view(base));
    follow(screen.getByRole("link", { name: "All leases" }));
    arriveAt("?v=2&scope=all");
    rerender(view({ ...base, currentView: "v=2&scope=all", viewSource: "explicit" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveAttribute("data-autosave", "failed"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(posts()[1].body).toEqual({ query: "v=2&scope=all" });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveAttribute("data-autosave", "saved"),
    );
  });

  it("never attempts a save for a verification account or where nothing can be kept", async () => {
    for (const memory of ["verification", "unavailable"] as const) {
      const rendered = render(view({ ...base, memory }));
      follow(screen.getByRole("link", { name: "All leases" }));
      arriveAt("?v=2&scope=all");
      rendered.rerender(
        view({ ...base, memory, currentView: "v=2&scope=all", viewSource: "explicit" }),
      );
      await act(async () => {});
      expect(screen.queryByRole("button", { name: "Remember this view" })).toBeNull();
      expect(screen.queryByRole("link", { name: "Reset to default view" })).toBeNull();
      rendered.unmount();
      arriveAt("");
      window.sessionStorage.clear();
      resetRenewalDeskViewMemoryForTests();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
