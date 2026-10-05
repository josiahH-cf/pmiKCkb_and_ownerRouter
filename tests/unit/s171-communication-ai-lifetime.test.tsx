// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThreadSummaryPanel } from "@/components/gmail-hub/ThreadSummaryPanel";
import { AnticipatoryDraftComposer } from "@/components/gmail-hub/AnticipatoryDraftComposer";
const owners = [
  {
    name: "summary",
    Component: ThreadSummaryPanel,
    action: "Summarize thread",
    error: /Could not summarize/,
    payload: {
      ok: true,
      usedModel: true,
      summary: "Completed fixture summary",
      waiting_on: "Review",
      suggested_next_action: "Review source",
      errors: [],
    },
    completed: "Completed fixture summary",
  },
  {
    name: "draft",
    Component: AnticipatoryDraftComposer,
    action: "Compose draft",
    error: /Could not compose/,
    payload: {
      ok: true,
      usedModel: true,
      draft: "Completed fixture draft",
      refusedBeforeModel: false,
      errors: [],
    },
    completed: "Completed fixture draft",
  },
];
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function prepare(name: string) {
  if (name === "summary")
    fireEvent.change(screen.getByLabelText("Thread text"), {
      target: { value: "Pasted local fixture" },
    });
}
describe.each(owners)(
  "S171 actual $name AI owner",
  ({ name, Component, action, error, payload, completed }) => {
    it("keeps the last completed result while the next request waits and fails", async () => {
      let reject!: (reason: Error) => void;
      const pending = new Promise<Response>((_, no) => {
        reject = no;
      });
      let calls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => (++calls === 1 ? Response.json(payload) : pending)),
      );
      render(<Component />);
      prepare(name);
      fireEvent.click(screen.getByRole("button", { name: action }));
      await screen.findByText(completed);
      fireEvent.click(screen.getByRole("button", { name: action }));
      expect(screen.getByText(completed)).toBeVisible();
      await act(async () => reject(new Error("Synthetic unavailable model response")));
      expect(screen.getByText(completed)).toBeVisible();
      expect(screen.getByText(error)).toBeVisible();
      expect(screen.getByRole("button", { name: action })).toBeEnabled();
      expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
    });
    it("ends a stalled success-response body without inventing a result or leaving pending forever", async () => {
      vi.useFakeTimers();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })),
      );
      render(<Component />);
      prepare(name);
      fireEvent.click(screen.getByRole("button", { name: action }));
      await act(async () => vi.advanceTimersByTimeAsync(60_001));
      expect(screen.getByRole("button", { name: action })).toBeEnabled();
      expect(screen.getByText(error)).toBeVisible();
      expect(screen.queryByText(completed)).toBeNull();
      if (name === "summary")
        expect(screen.getByLabelText("Thread text")).toHaveValue("Pasted local fixture");
    });
  },
);
it("S170 the actual Admin draft copy bounds waiting and retains the displayed fallback", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(owners[1].payload)),
  );
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn(() => new Promise(() => {})) },
  });
  render(<AnticipatoryDraftComposer />);
  fireEvent.click(screen.getByRole("button", { name: "Compose draft" }));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  fireEvent.click(screen.getByRole("button", { name: "Copy draft" }));
  expect(screen.getByRole("status", { name: "Copying draft" })).toBeVisible();
  await act(async () => vi.advanceTimersByTimeAsync(8_001));
  expect(screen.getByText(/Select and copy the displayed draft/)).toBeVisible();
  expect(screen.getByText(owners[1].completed)).toBeVisible();
  expect(screen.getByRole("button", { name: "Copy draft" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
});
it("S170 a delayed earlier draft copy cannot label the newly completed draft copied", async () => {
  let finish!: () => void;
  const clipboard = new Promise<void>((resolve) => {
    finish = resolve;
  });
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => clipboard) } });
  let reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        ...owners[1].payload,
        draft: ++reads === 1 ? "Earlier fixture draft" : "Current fixture draft",
      }),
    ),
  );
  render(<AnticipatoryDraftComposer />);
  fireEvent.click(screen.getByRole("button", { name: "Compose draft" }));
  await screen.findByText("Earlier fixture draft");
  fireEvent.click(screen.getByRole("button", { name: "Copy draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Compose draft" }));
  await screen.findByText("Current fixture draft");
  await act(async () => finish());
  expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  expect(screen.getByRole("button", { name: "Copy draft" })).toBeEnabled();
});
