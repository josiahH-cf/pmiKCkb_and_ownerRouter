// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReindexPanel } from "@/components/admin/ReindexPanel";
import type { ReindexCommandPlan } from "@/lib/admin/reindex-command";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function planFor(space: string): ReindexCommandPlan {
  return {
    runnable: true,
    command: `npm run import:agent-search -- --data-store=${space}`,
    notes: [`Current sources for ${space}`],
    sourceCount: 1,
    sourceFingerprint: `${space}-fingerprint`,
  };
}
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
function mount() {
  return render(
    <ReindexPanel
      spaces={[
        { id: "space-a", name: "Space A" },
        { id: "space-b", name: "Space B" },
      ]}
      initialRequests={["space-a", "space-b"].map((spaceId) => ({
        id: `request-${spaceId}`,
        spaceId,
        status: "requested" as const,
        requestedByUid: "synthetic-admin",
        createdAt: "2026-11-03T12:00:00Z",
      }))}
    />,
  );
}
async function showInitialPlan() {
  fireEvent.click(screen.getAllByRole("button", { name: "Review current handoff" })[0]);
  await screen.findByText(planFor("space-a").command);
}

it("removes a runnable plan as soon as another current review starts", async () => {
  const next = deferred();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ plan: planFor("space-a") }))
      .mockReturnValueOnce(next.promise),
  );
  mount();
  await showInitialPlan();
  fireEvent.click(screen.getAllByRole("button", { name: "Review current handoff" })[0]);
  try {
    expect(screen.queryByText(planFor("space-a").command)).not.toBeInTheDocument();
  } finally {
    await act(async () =>
      next.resolve(Response.json({ error: "unavailable" }, { status: 503 })),
    );
  }
});

it("does not leave a runnable plan after the replacement review fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json({ plan: planFor("space-a") }))
      .mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 })),
  );
  mount();
  await showInitialPlan();
  fireEvent.click(screen.getAllByRole("button", { name: "Review current handoff" })[0]);
  await screen.findByText("Could not review the current handoff.");
  expect(screen.queryByText(planFor("space-a").command)).not.toBeInTheDocument();
  expect(screen.queryByText("Reviewed command (run separately)")).not.toBeInTheDocument();
});

it("invalidates a reviewed command and its confirmation when the selected Space changes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ plan: planFor("space-a") })),
  );
  mount();
  await showInitialPlan();
  const confirmation = screen.getByRole("checkbox");
  fireEvent.click(confirmation);
  fireEvent.change(screen.getByLabelText("Space to re-index"), {
    target: { value: "space-b" },
  });
  expect(screen.getByLabelText("Space to re-index")).toHaveValue("space-b");
  expect(screen.queryByText(planFor("space-a").command)).not.toBeInTheDocument();
  expect(confirmation).not.toBeChecked();
});

it("keeps the current Space B review when a superseded Space A response arrives later", async () => {
  const first = deferred(),
    second = deferred();
  const fetch = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  vi.stubGlobal("fetch", fetch);
  mount();
  fireEvent.click(screen.getAllByRole("button", { name: "Review current handoff" })[0]);
  fireEvent.change(screen.getByLabelText("Space to re-index"), {
    target: { value: "space-b" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Review current handoff" })[1]);
  await act(async () => second.resolve(Response.json({ plan: planFor("space-b") })));
  await act(async () => first.resolve(Response.json({ plan: planFor("space-a") })));
  await waitFor(() =>
    expect(
      screen.getAllByRole("button", { name: "Review current handoff" })[1],
    ).not.toBeDisabled(),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
    "/api/admin/reindex?spaceId=space-a",
    "/api/admin/reindex?spaceId=space-b",
  ]);
  expect(screen.getByLabelText("Space to re-index")).toHaveValue("space-b");
  expect(screen.queryByText(planFor("space-a").command)).not.toBeInTheDocument();
  expect(screen.getByText(planFor("space-b").command)).toBeInTheDocument();
});
