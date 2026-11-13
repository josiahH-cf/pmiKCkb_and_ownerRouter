// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { SpaceDeskRunPanel } from "@/components/desk/SpaceDeskRunPanel";

// S283 R-S283-4, BEH-S283-5 and AC-S283-4: on a Space that still starts runs, a double click on
// Start run sends one start with one per-click key, and a refused start shows the server's reason
// in staff words instead of "Could not start a run.". Synthetic values only.

const REFUSAL =
  "This process has no assigned staff member yet. An Admin assigns one before a run can start.";

beforeEach(() => {
  router.refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function panel() {
  return render(
    <SpaceDeskRunPanel
      canEdit
      definitionId="move-in"
      definitionRevision={"a".repeat(64)}
      initialChecks={[]}
      run={null}
      steps={[]}
    />,
  );
}

describe("R-S283-4 Start run on a Space that still runs", () => {
  it("BEH-S283-5 a double click sends one start carrying one per-click key", async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    panel();
    const start = screen.getByRole("button", { name: "Start run" });
    fireEvent.click(start);
    fireEvent.click(start);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/process-definitions/move-in/runs");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ expected_revision: "a".repeat(64) });
    expect(body.start_key).toEqual(expect.stringMatching(/^[A-Za-z0-9-]{8,64}$/));
    await act(async () =>
      answer(Response.json({ run: { id: "run-1" } }, { status: 201 })),
    );
    await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  });

  it("BEH-S283-5 a refused start shows the server's reason in staff words", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: REFUSAL }, { status: 409 })),
    );
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    expect(await screen.findByText(REFUSAL)).toBeVisible();
    expect(screen.queryByText("Could not start a run.")).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("AC-S283-4 after a definite refusal the next click is a new start with a new key", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ error: REFUSAL }, { status: 409 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    await screen.findByText(REFUSAL);
    fireEvent.click(screen.getByRole("button", { name: "Start run" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const keys = fetchMock.mock.calls.map(
      (call) =>
        (
          JSON.parse(String((call as unknown as [string, RequestInit])[1].body)) as {
            start_key: string;
          }
        ).start_key,
    );
    expect(keys[0]).not.toBe(keys[1]);
  });
});
