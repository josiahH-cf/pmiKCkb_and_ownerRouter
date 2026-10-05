// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} data-prefetch={String(prefetch)} />
  ),
}));
import { RenewalDeskInventory } from "@/components/lease-renewal/RenewalDeskInventory";
import { PersonalViewProvider } from "@/components/layout/PersonalViewProvider";
import { resetRenewalDeskViewMemoryForTests } from "@/components/lease-renewal/RenewalDeskViewMemory";
import { canonicalPersonalView } from "@/lib/ui/personal-views";
import {
  DEFAULT_RENEWAL_DESK_QUERY_V2,
  parseRenewalDeskQueryV2,
} from "@/lib/lease-renewal/desk-query-v2";
import { getRenewalDeskView } from "@/tests/helpers/sample-desk";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function owner(scopeKey = "fixture-admitted-scope") {
  const source = getRenewalDeskView();
  return (
    <RenewalDeskInventory
      view={{
        ...source,
        dataCurrency: { ...source.dataCurrency, readAtIso: new Date().toISOString() },
      }}
      query={DEFAULT_RENEWAL_DESK_QUERY_V2}
      role="Editor"
      tokens={{ owner: [], tenant: [] }}
      partyAvailable={false}
      scopeKey={scopeKey}
      dependentStateComplete
      sheetWritebackPaused={false}
    />
  );
}
function selectAll() {
  fireEvent.click(screen.getByRole("link", { name: /^All leases/ }));
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
  window.sessionStorage.clear();
  resetRenewalDeskViewMemoryForTests();
});

describe("S168/S170 actual admitted inventory", () => {
  it("saves Clear filters with sort/layout retained, then Reset view with canonical table defaults", async () => {
    const query = "v=2&sort=end_date&direction=desc&q=Fixture+Private+Search&scope=all";
    let preference = {
      surface: "renewals",
      revision: 4,
      value: { query, layout: { columns: { c0: 480 }, panelWidth: 640 } },
    };
    const writes: { expectedRevision: number; value: typeof preference.value }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        if (url === "/api/lease-renewal/desk-admission")
          return Response.json({
            scopeKey: "fixture-admitted-scope",
            refreshAfter: null,
          });
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          writes.push(body);
          preference = {
            ...preference,
            revision: preference.revision + 1,
            value: canonicalPersonalView(
              "renewals",
              body.value,
            )! as typeof preference.value,
          };
        }
        return Response.json({ preference });
      }),
    );
    window.history.replaceState({}, "", "/lease-renewal/live/desk");
    const source = getRenewalDeskView();
    render(
      <PersonalViewProvider accountId="fixture-account" canSave>
        <RenewalDeskInventory
          view={{
            ...source,
            dataCurrency: { ...source.dataCurrency, readAtIso: new Date().toISOString() },
          }}
          query={parseRenewalDeskQueryV2(new URLSearchParams(query))}
          role="Editor"
          tokens={{ owner: [], tenant: [] }}
          partyAvailable={false}
          scopeKey="fixture-admitted-scope"
          dependentStateComplete
          sheetWritebackPaused={false}
          viewMemory={{
            accountId: "fixture-account",
            savedRevision: 4,
            source: "saved",
            savedView: query,
            memory: "saved",
          }}
        />
      </PersonalViewProvider>,
    );
    await act(async () => {});
    expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("link", { name: "Clear filters" }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].value).toEqual({
      query: "v=2&sort=end_date&direction=desc",
      layout: { columns: { c0: 480 }, panelWidth: 640 },
    });
    await screen.findAllByText("View saved", { exact: true });
    fireEvent.click(screen.getByRole("link", { name: "Reset view" }));
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toMatchObject({
      expectedRevision: 5,
      value: { query: "", layout: { columns: {} } },
    });
    expect(window.location.search).toBe("?v=2");
    await waitFor(() =>
      expect(preference.value).toEqual({ query: "", layout: { columns: {} } }),
    );
  });
  it("acknowledges a delayed view while retaining the completed rows, then reuses all admitted rows", async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn((_input: unknown) => pending.promise);
    vi.stubGlobal("fetch", fetch);
    const mounted = render(owner());
    expect(screen.queryByText("12 Elm Ct, Unit 9")).toBeNull();
    selectAll();
    expect(
      screen.getByText(/table still shows the previous completed selection/),
    ).toBeVisible();
    expect(screen.queryByText("12 Elm Ct, Unit 9")).toBeNull();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () =>
      pending.resolve(
        Response.json({ scopeKey: "fixture-admitted-scope", refreshAfter: null }),
      ),
    );
    expect(screen.getByText("12 Elm Ct, Unit 9")).toBeVisible();
    expect(mounted.container.querySelector("[data-admitted-view]")).toHaveAttribute(
      "data-admitted-view",
      expect.stringContaining("scope=all"),
    );
    expect(fetch.mock.calls[0][0]).toBe("/api/lease-renewal/desk-admission");
    expect(screen.queryByText(/previous completed selection/)).toBeNull();
  });

  it("keeps the previous source and offers recovery on an admission failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Synthetic unavailable admission" }, { status: 503 }),
      ),
    );
    render(owner());
    selectAll();
    await screen.findByRole("alert");
    expect(screen.queryByText("12 Elm Ct, Unit 9")).toBeNull();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.getByRole("link", { name: /^All leases/ })).toBeVisible();
    expect(screen.queryByText(/previous completed selection/)).toBeNull();
  });

  it.each([401, 403])(
    "hides the previous inventory when the current admission refuses access (%s)",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({ error: "Synthetic permission refusal" }, { status }),
        ),
      );
      render(owner());
      selectAll();
      await screen.findByText("Your access changed.");
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.getByRole("button", { name: "Reload Renewals" })).toBeVisible();
    },
  );

  it("ignores a delayed older selection after a newer view has been admitted", async () => {
    const pending = deferred<Response>();
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ++reads === 1
          ? pending.promise
          : Response.json({ scopeKey: "fixture-admitted-scope", refreshAfter: null }),
      ),
    );
    const mounted = render(owner());
    selectAll();
    await waitFor(() => expect(reads).toBe(1));
    const sort = screen.getByRole("button", { name: /^Renewal date/ });
    fireEvent.submit(sort.closest("form")!);
    await waitFor(() =>
      expect(
        mounted.container
          .querySelector("[data-admitted-view]")
          ?.getAttribute("data-admitted-view"),
      ).toContain("sort=end_date"),
    );
    const latest = mounted.container
      .querySelector("[data-admitted-view]")
      ?.getAttribute("data-admitted-view");
    await act(async () =>
      pending.resolve(
        Response.json({ scopeKey: "fixture-admitted-scope", refreshAfter: null }),
      ),
    );
    expect(mounted.container.querySelector("[data-admitted-view]")).toHaveAttribute(
      "data-admitted-view",
      latest,
    );
    expect(screen.queryByText("12 Elm Ct, Unit 9")).toBeNull();
  });

  it("retires an old account's response before it can expose rows in a replacement scope", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending.promise),
    );
    const mounted = render(owner());
    selectAll();
    mounted.rerender(owner("fixture-new-account-scope"));
    await act(async () =>
      pending.resolve(
        Response.json({ scopeKey: "fixture-admitted-scope", refreshAfter: null }),
      ),
    );
    expect(screen.queryByText("12 Elm Ct, Unit 9")).toBeNull();
    expect(screen.queryByText(/previous completed selection/)).toBeNull();
  });
});
