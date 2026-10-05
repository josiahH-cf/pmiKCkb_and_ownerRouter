// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AskForm } from "@/components/ask/AskForm";
import { RefineWithAi } from "@/components/email/RefineWithAi";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const revision = () =>
  Response.json({
    status: "revised",
    body: "Earlier proposed wording",
    requestedValues: [],
    removedValues: [],
  });
const request = { surface: "renewal_owner", leaseId: "7001" };
function answer(summary: string) {
  return Response.json({
    version: "assistant-conversation/v1",
    kind: "answer",
    summary,
    interpretation: [],
    groups: [],
    clarification: null,
    knowledgeQuestion: null,
    interpretedBy: "deterministic",
    conversation: { version: 1, actorKey: "b".repeat(32), turns: [] },
    contextReset: false,
  });
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("S171 owning AI generation and scope", () => {
  it("keeps newer manual draft edits and makes an earlier proposal reachable without applying or saving it", async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetch);
    const apply = vi.fn();
    const mounted = render(
      <RefineWithAi
        request={request}
        currentBody="Initial edited text"
        onApply={apply}
      />,
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Make this shorter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refine wording" }));
    expect(screen.getByText("Requested: Make this shorter")).toBeVisible();
    mounted.rerender(
      <RefineWithAi request={request} currentBody="New manual text" onApply={apply} />,
    );
    await act(async () => pending.resolve(revision()));
    const review = screen.getByText(
      "Review earlier wording without replacing current edits",
    );
    fireEvent.click(review);
    expect(screen.getByText("Earlier proposed wording")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Use this revision" })).toBeNull();
    expect(apply).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("retires a pending revision when the actual record/audience changes", async () => {
    const pending = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending.promise),
    );
    const apply = vi.fn();
    const mounted = render(
      <RefineWithAi request={request} currentBody="Owner text" onApply={apply} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Shorter" } });
    fireEvent.click(screen.getByRole("button", { name: "Refine wording" }));
    mounted.rerender(
      <RefineWithAi
        request={{ surface: "renewal_tenant", leaseId: "7002" }}
        currentBody="Other record text"
        onApply={apply}
      />,
    );
    await act(async () => pending.resolve(revision()));
    expect(screen.queryByText("Earlier proposed wording")).toBeNull();
    expect(screen.queryByRole("button", { name: "Stop waiting" })).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });
  it("retries a stopped Dashboard question under the same operation identity and ignores its late original result", async () => {
    const pending = deferred<Response>();
    const calls: { operationId: string; question: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        calls.push(JSON.parse(String(init?.body)));
        return calls.length === 1 ? pending.promise : answer("Recovered current answer");
      }),
    );
    render(<AskForm ownerKey="fixture-owner" />);
    fireEvent.change(screen.getByLabelText(/Question/), {
      target: { value: "Jane Doe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get answer" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Stop waiting" }));
    await screen.findByRole("button", { name: "Retry" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Recovered current answer");
    expect(calls).toHaveLength(2);
    expect(calls[1].operationId).toBe(calls[0].operationId);
    expect(calls[1].question).toBe("Jane Doe");
    await act(async () => pending.resolve(answer("Retired original answer")));
    expect(screen.queryByText("Retired original answer")).toBeNull();
    expect(screen.getByText("Recovered current answer")).toBeVisible();
  });
  it("does not show or save a delayed answer after the signed-in account changes", async () => {
    const pending = deferred<Response>();
    const fetch = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetch);
    const mounted = render(<AskForm ownerKey="fixture-owner-first" />);
    fireEvent.change(screen.getByLabelText(/Question/), {
      target: { value: "Jane Doe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Get answer" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    mounted.rerender(<AskForm ownerKey="fixture-owner-second" />);
    await act(async () => pending.resolve(answer("Retired account answer")));
    expect(screen.queryByText("Retired account answer")).toBeNull();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
