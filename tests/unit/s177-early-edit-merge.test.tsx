// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PersonalViewProvider,
  usePersonalView,
} from "@/components/layout/PersonalViewProvider";
import { DataTableFrame } from "@/components/ui/DataTableFrame";
import type { PersonalViewSurface, PersonalViewValue } from "@/lib/ui/personal-views";

const preference = (
  surface: PersonalViewSurface,
  revision: number,
  value: PersonalViewValue,
) => ({ preference: { surface, revision, value, updatedAt: null } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function stubStore(surface: PersonalViewSurface, read: Promise<Response>) {
  const requests = vi.fn(async (_input: unknown, init?: RequestInit) => {
    if (init?.method !== "POST") return read;
    const body = JSON.parse(String(init.body)) as {
      expectedRevision: number;
      value: PersonalViewValue;
    };
    return Response.json(preference(surface, body.expectedRevision + 1, body.value));
  });
  vi.stubGlobal("fetch", requests);
  return requests;
}
const saves = (requests: ReturnType<typeof stubStore>) =>
  requests.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)));
function SortChoice() {
  const view = usePersonalView("renewals");
  return (
    <button onClick={() => view.change({ ...view.value, query: "v=2&sort=end_date" })}>
      Sort by renewal date
    </button>
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("S177 a view chosen before the stored view loads keeps the saved sizing", () => {
  it("saves only the chosen sort over the stored columns and panel width", async () => {
    const read = deferred<Response>();
    const requests = stubStore("renewals", read.promise);
    render(
      <PersonalViewProvider accountId="fixture-account" canSave>
        <SortChoice />
      </PersonalViewProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sort by renewal date" }));
    await act(async () =>
      read.resolve(
        Response.json(
          preference("renewals", 7, {
            query: "v=2&scope=all",
            layout: { columns: { c0: 640 }, panelWidth: 512 },
          }),
        ),
      ),
    );
    await vi.waitFor(() => expect(saves(requests)).toHaveLength(1));
    expect(saves(requests)[0]).toMatchObject({
      surface: "renewals",
      expectedRevision: 7,
      value: {
        query: "v=2&sort=end_date",
        layout: { columns: { c0: 640 }, panelWidth: 512 },
      },
    });
  });

  it("remembers one resized column and leaves the remembered filters and other widths alone", async () => {
    const stored: PersonalViewValue = {
      query: "status=pending",
      layout: { columns: { c1: 200 } },
    };
    const requests = stubStore(
      "approvals",
      Promise.resolve(Response.json(preference("approvals", 3, stored))),
    );
    render(
      <PersonalViewProvider accountId="fixture-account" canSave>
        <DataTableFrame label="Approvals table" surface="approvals">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Owner</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Fixture item</td>
                <td>Fixture owner</td>
                <td>Pending</td>
              </tr>
            </tbody>
          </table>
        </DataTableFrame>
      </PersonalViewProvider>,
    );
    const owner = screen.getByRole("separator", { name: "Resize Owner column" });
    await vi.waitFor(() => expect(owner).toHaveAttribute("aria-valuenow", "200"));
    fireEvent.keyDown(screen.getByRole("separator", { name: "Resize Item column" }), {
      key: "ArrowRight",
    });
    await vi.waitFor(() => expect(saves(requests)).toHaveLength(1));
    expect(saves(requests)[0].value).toEqual({
      query: "status=pending",
      layout: { columns: { c0: 176, c1: 200 } },
    });
  });
});
