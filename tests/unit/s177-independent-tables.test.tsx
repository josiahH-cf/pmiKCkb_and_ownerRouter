// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PersonalViewProvider,
  usePersonalFilters,
  usePersonalView,
} from "@/components/layout/PersonalViewProvider";
import {
  DEFAULT_PERSONAL_VIEW,
  type PersonalViewSurface,
  type PersonalViewValue,
} from "@/lib/ui/personal-views";

// S177: one account, several tables on screen under the one provider. Each table reads and saves
// its own stored view; a change or a reset on one never reaches another. The stub keeps one record
// per table, as the server does.

type Stored = { revision: number; value: PersonalViewValue };

function stubStore(initial: Partial<Record<PersonalViewSurface, Stored>> = {}) {
  const store = new Map<string, Stored>(Object.entries(initial));
  const requests = vi.fn(async (input: unknown, init?: RequestInit) => {
    if (init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as {
        surface: PersonalViewSurface;
        expectedRevision: number;
        value: PersonalViewValue;
      };
      const next = { revision: body.expectedRevision + 1, value: body.value };
      store.set(body.surface, next);
      return Response.json({
        preference: { surface: body.surface, ...next, updatedAt: null },
      });
    }
    const surface = new URL(String(input), "http://localhost").searchParams.get(
      "surface",
    ) as PersonalViewSurface;
    const current = store.get(surface) ?? { revision: 0, value: DEFAULT_PERSONAL_VIEW };
    return Response.json({ preference: { surface, ...current, updatedAt: null } });
  });
  vi.stubGlobal("fetch", requests);
  return { requests, store };
}

const saves = (requests: ReturnType<typeof stubStore>["requests"]) =>
  requests.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(
      ([, init]) =>
        JSON.parse(String(init?.body)) as {
          surface: PersonalViewSurface;
          value: PersonalViewValue;
        },
    );

function Table({ surface, next }: { surface: PersonalViewSurface; next: string }) {
  const view = usePersonalView(surface);
  return (
    <section aria-label={surface}>
      <output>{view.loaded ? view.value.query || "default view" : "loading"}</output>
      <output>{`width ${view.value.layout.panelWidth ?? "default"}`}</output>
      <button onClick={() => view.change({ ...view.value, query: next })}>
        Change {surface}
      </button>
      <button onClick={() => view.change({ query: "", layout: { columns: {} } })}>
        Reset {surface}
      </button>
    </section>
  );
}

function StateFilter() {
  const [filters, setFilters] = usePersonalFilters("access-requests", {
    state: "pending",
    requesterQuery: "",
  });
  return (
    <label>
      Request state
      <select
        onChange={(event) => setFilters({ ...filters, state: event.target.value })}
        value={filters.state}
      >
        <option value="">All states</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
      </select>
    </label>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("S177 each table keeps its own remembered view", () => {
  it("restores each table's own stored view and saves a change to that table alone", async () => {
    const { requests, store } = stubStore({
      approvals: {
        revision: 4,
        value: {
          query: "status=pending",
          layout: { columns: { c1: 200 }, panelWidth: 400 },
        },
      },
      "maintenance-queue": {
        revision: 2,
        value: { query: "assignee=me", layout: { columns: {} } },
      },
    });
    render(
      <PersonalViewProvider accountId="fixture-account" canSave>
        <Table next="status=approved" surface="approvals" />
        <Table next="waiting=vendor" surface="maintenance-queue" />
        <Table next="state=pending" surface="work-team" />
      </PersonalViewProvider>,
    );
    const approvals = screen.getByRole("region", { name: "approvals" });
    const maintenance = screen.getByRole("region", { name: "maintenance-queue" });
    const team = screen.getByRole("region", { name: "work-team" });
    await vi.waitFor(() => expect(approvals).toHaveTextContent("status=pending"));
    expect(approvals).toHaveTextContent("width 400");
    await vi.waitFor(() => expect(maintenance).toHaveTextContent("assignee=me"));
    expect(maintenance).toHaveTextContent("width default");
    await vi.waitFor(() => expect(team).toHaveTextContent("default view"));

    fireEvent.click(screen.getByRole("button", { name: "Change maintenance-queue" }));
    await vi.waitFor(() => expect(saves(requests)).toHaveLength(1));
    expect(saves(requests)[0]).toMatchObject({
      surface: "maintenance-queue",
      value: { query: "waiting=vendor", layout: { columns: {} } },
    });
    await vi.waitFor(() => expect(maintenance).toHaveTextContent("waiting=vendor"));
    // The other tables on screen and their stored records are exactly as they were.
    expect(approvals).toHaveTextContent("status=pending");
    expect(approvals).toHaveTextContent("width 400");
    expect(team).toHaveTextContent("default view");
    expect(store.get("approvals")).toEqual({
      revision: 4,
      value: {
        query: "status=pending",
        layout: { columns: { c1: 200 }, panelWidth: 400 },
      },
    });
    expect(store.has("work-team")).toBe(false);
  });

  it("resets one table without touching another table's view", async () => {
    const { requests, store } = stubStore({
      approvals: {
        revision: 4,
        value: {
          query: "status=pending",
          layout: { columns: { c1: 200 }, panelWidth: 400 },
        },
      },
      "maintenance-queue": {
        revision: 2,
        value: { query: "assignee=me", layout: { columns: {} } },
      },
    });
    render(
      <PersonalViewProvider accountId="fixture-account" canSave>
        <Table next="status=approved" surface="approvals" />
        <Table next="waiting=vendor" surface="maintenance-queue" />
      </PersonalViewProvider>,
    );
    const approvals = screen.getByRole("region", { name: "approvals" });
    const maintenance = screen.getByRole("region", { name: "maintenance-queue" });
    await vi.waitFor(() => expect(approvals).toHaveTextContent("status=pending"));
    await vi.waitFor(() => expect(maintenance).toHaveTextContent("assignee=me"));

    fireEvent.click(screen.getByRole("button", { name: "Reset approvals" }));
    await vi.waitFor(() => expect(saves(requests)).toHaveLength(1));
    expect(saves(requests)[0]).toEqual({
      surface: "approvals",
      expectedRevision: 4,
      value: { query: "", layout: { columns: {} } },
    });
    await vi.waitFor(() => expect(approvals).toHaveTextContent("default view"));
    expect(approvals).toHaveTextContent("width default");
    expect(maintenance).toHaveTextContent("assignee=me");
    expect(store.get("maintenance-queue")).toEqual({
      revision: 2,
      value: { query: "assignee=me", layout: { columns: {} } },
    });
  });

  it("remembers a filter cleared to all when its default is a narrower choice", async () => {
    const first = stubStore();
    const { unmount } = render(
      <PersonalViewProvider accountId="fixture-account" canSave>
        <StateFilter />
      </PersonalViewProvider>,
    );
    const select = () => screen.getByLabelText("Request state") as HTMLSelectElement;
    await vi.waitFor(() => expect(select().value).toBe("pending"));
    await act(async () => {
      fireEvent.change(select(), { target: { value: "" } });
    });
    await vi.waitFor(() => expect(saves(first.requests)).toHaveLength(1));
    const remembered = first.store.get("access-requests")!;
    unmount();
    vi.unstubAllGlobals();

    // A later visit by the same account reads the stored view back.
    stubStore({ "access-requests": remembered });
    render(
      <PersonalViewProvider accountId="fixture-account" canSave>
        <StateFilter />
      </PersonalViewProvider>,
    );
    await vi.waitFor(() => expect(select().value).toBe(""));
  });
});
