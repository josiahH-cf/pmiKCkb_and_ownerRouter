// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PersonalViewProvider,
  PersonalViewStatus,
  usePersonalView,
} from "@/components/layout/PersonalViewProvider";
import type { PersonalViewValue } from "@/lib/ui/personal-views";

const empty: PersonalViewValue = { query: "", layout: { columns: {} } };
const first: PersonalViewValue = {
  query: "status=pending",
  layout: { columns: { c0: 480 } },
};
const latest: PersonalViewValue = {
  query: "status=approved",
  layout: { columns: { c0: 608 } },
};
const preference = (revision: number, value = empty) => ({
  preference: { surface: "approvals", revision, value, updatedAt: null },
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function Consumer() {
  const view = usePersonalView("approvals");
  return (
    <>
      <output data-testid="view">{JSON.stringify(view.value)}</output>
      <button onClick={() => view.change(first)}>First view</button>
      <button onClick={() => view.change(latest)}>Latest view</button>
      <PersonalViewStatus surface="approvals" />
    </>
  );
}
function owner(accountId = "fixture-first") {
  return (
    <PersonalViewProvider accountId={accountId} canSave>
      <Consumer />
    </PersonalViewProvider>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S177 actual account-owned view lifecycle", () => {
  it("deduplicates its read and keeps a deliberate edit made before the GET finishes", async () => {
    const read = deferred<Response>();
    const requests = vi.fn(async (_input: unknown, init?: RequestInit) =>
      init?.method === "POST" ? Response.json(preference(5, first)) : read.promise,
    );
    vi.stubGlobal("fetch", requests);
    render(owner());
    fireEvent.click(screen.getByRole("button", { name: "First view" }));
    expect(requests).toHaveBeenCalledTimes(1);
    await act(async () => read.resolve(Response.json(preference(4))));
    await screen.findByText("View saved");
    expect(screen.getByTestId("view")).toHaveTextContent(JSON.stringify(first));
    expect(requests).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(requests.mock.calls[1][1]?.body))).toMatchObject({
      expectedRevision: 4,
      value: first,
    });
  });

  it("serializes and coalesces later edits against the acknowledged revision", async () => {
    const pending = deferred<Response>();
    const posts: unknown[] = [];
    const requests = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method !== "POST") return Response.json(preference(4));
      posts.push(JSON.parse(String(init.body)));
      return posts.length === 1 ? pending.promise : Response.json(preference(6, latest));
    });
    vi.stubGlobal("fetch", requests);
    render(owner());
    await waitFor(() =>
      expect(screen.getByTestId("view")).toHaveTextContent(JSON.stringify(empty)),
    );
    fireEvent.click(screen.getByRole("button", { name: "First view" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Latest view" }));
    expect(posts).toHaveLength(1);
    await act(async () => pending.resolve(Response.json(preference(5, first))));
    await screen.findByText("View saved");
    expect(posts).toEqual([
      { surface: "approvals", expectedRevision: 4, value: first },
      { surface: "approvals", expectedRevision: 5, value: latest },
    ]);
    expect(screen.getByTestId("view")).toHaveTextContent(JSON.stringify(latest));
  });

  it("retires a waiting account before any save can dispatch for that account", async () => {
    const read = deferred<Response>();
    let readCount = 0;
    const requests = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method === "POST") throw new Error("A retired account must not save");
      return ++readCount === 1 ? read.promise : Response.json(preference(0));
    });
    vi.stubGlobal("fetch", requests);
    const mounted = render(owner());
    fireEvent.click(screen.getByRole("button", { name: "First view" }));
    mounted.rerender(owner("fixture-second"));
    await act(async () => read.resolve(Response.json(preference(4))));
    expect(screen.getByTestId("view")).toHaveTextContent(JSON.stringify(empty));
    expect(requests.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  });

  it("requires explicit fresh read recovery after a save response is lost", async () => {
    const posts: unknown[] = [];
    let reads = 0;
    const requests = vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.method !== "POST")
        return Response.json(
          preference(++reads === 1 ? 4 : 5, reads === 1 ? empty : first),
        );
      posts.push(JSON.parse(String(init.body)));
      if (posts.length === 1)
        throw new Error("Lost response; original CAS may have committed");
      return Response.json(preference(6, first));
    });
    vi.stubGlobal("fetch", requests);
    render(owner());
    fireEvent.click(screen.getByRole("button", { name: "First view" }));
    const recover = await screen.findByRole("button", {
      name: "Recover and save current view",
    });
    expect(screen.queryByText("View saved")).toBeNull();
    expect(posts).toHaveLength(1);
    expect(screen.getByTestId("view")).toHaveTextContent(JSON.stringify(first));
    fireEvent.click(recover);
    await screen.findByText("View saved");
    expect(reads).toBe(2);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toMatchObject({ expectedRevision: 5, value: first });
  });

  it("refuses a success-shaped response whose readback is a different private view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: unknown, init?: RequestInit) =>
        Response.json(preference(init?.method === "POST" ? 5 : 4, empty)),
      ),
    );
    render(owner());
    fireEvent.click(screen.getByRole("button", { name: "First view" }));
    await screen.findByRole("button", { name: "Recover and save current view" });
    expect(screen.queryByText("View saved")).toBeNull();
    expect(screen.getByTestId("view")).toHaveTextContent(JSON.stringify(first));
  });
});
