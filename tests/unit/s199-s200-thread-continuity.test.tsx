// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { AskForm } from "@/components/ask/AskForm";
import {
  fetchConversation,
  type HistoryPageOutcome,
} from "@/lib/assistant-history/client";
const ownerKey = "a".repeat(40),
  id = "c".repeat(32),
  key = "00000000-0000-4000-8000-000000000001";
const summary = {
  conversationId: id,
  conversationKey: key,
  title: "Long continuing discussion",
  createdAtIso: "2026-10-01T15:00:00Z",
  updatedAtIso: "2026-10-09T15:00:00Z",
  turnCount: 2,
  lastState: "completed",
  pinned: true,
  pinVersion: 1,
};
function answer(text: string) {
  return {
    version: "assistant-conversation/v1",
    kind: "answer",
    summary: text,
    interpretation: [],
    groups: [],
    clarification: null,
    knowledgeQuestion: null,
    interpretedBy: "deterministic",
    conversation: { version: 1, actorKey: "b".repeat(32), turns: [] },
    contextReset: false,
    answeredAtIso: "2026-10-01T15:00:00Z",
    execution: null,
  };
}
function page(active = true) {
  return Promise.resolve({
    status: "ok",
    page: {
      ownerKey,
      persisted: true,
      conversations: [summary],
      nextCursor: null,
      pinnedConversations: [summary],
      pinnedNextCursor: null,
      activeSelection: { conversationId: active ? id : null, version: 3 },
    },
  } as unknown as HistoryPageOutcome);
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("S199/S200 whole private thread continuity", () => {
  it("restores the active whole thread from durable selection with zero inference or effect requests", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url: String(url), method: init?.method ?? "GET" });
        return Response.json({
          ownerKey,
          conversation: summary,
          turns: [1, 2].map((n) => ({
            turnId: String(n),
            operationId: `operation-${n}`,
            seq: n,
            question: `Earlier question ${n}`,
            displayState: "completed",
            assistant: answer(`Displayed answer ${n}`),
            knowledge: null,
            answeredAtIso: "2026-10-01T15:00:00Z",
            createdAtIso: "2026-10-01T15:00:00Z",
            accessChanged: false,
            rerunOf: null,
          })),
        });
      }),
    );
    await act(async () => {
      render(<AskForm historyMode="saved" ownerKey={ownerKey} initialHistory={page()} />);
    });
    expect(await screen.findByText("Displayed answer 1")).toBeVisible();
    expect(screen.getByText("Displayed answer 2")).toBeVisible();
    expect(calls).toEqual([{ url: `/api/assistant/history/${id}`, method: "GET" }]);
  });
  it("places whole-thread pins above ordinary history and distinguishes saved questions", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await act(async () => {
      render(
        <AskForm historyMode="saved" ownerKey={ownerKey} initialHistory={page(false)} />,
      );
    });
    const pins = screen.getByRole("navigation", { name: "Pinned conversations" }),
      history = screen.getByRole("navigation", { name: "History" });
    expect(
      pins.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      within(pins).getByRole("button", { name: "Long continuing discussion" }),
    ).toBeVisible();
    expect(
      within(pins).getByRole("button", {
        name: "Unpin conversation: Long continuing discussion",
      }),
    ).toBeVisible();
    expect(
      within(history).queryByRole("button", { name: "Long continuing discussion" }),
    ).toBeNull();
    expect(screen.getByRole("navigation", { name: "Saved questions" })).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refreshes a previously opened pin so later accepted turns and changed access replace its cached answers", async () => {
    let read = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/metadata"))
          return Response.json({
            ownerKey,
            selection: { conversationId: id, version: 4 },
          });
        read++;
        return Response.json({
          ownerKey,
          conversation: summary,
          turns: [1, 2, ...(read > 1 ? [3] : [])].map((n) => ({
            turnId: String(n),
            operationId: `operation-${n}`,
            seq: n,
            question: `Earlier question ${n}`,
            displayState: "completed",
            assistant:
              n === 1 && read > 1
                ? answer("Earlier details are unavailable under your current access.")
                : answer(`Displayed answer ${n}`),
            knowledge: null,
            answeredAtIso: "2026-10-01T15:00:00Z",
            createdAtIso: "2026-10-01T15:00:00Z",
            accessChanged: n === 1 && read > 1,
            rerunOf: null,
          })),
        });
      }),
    );
    await act(async () => {
      render(<AskForm historyMode="saved" ownerKey={ownerKey} initialHistory={page()} />);
    });
    expect(await screen.findByText("Displayed answer 1")).toBeVisible();
    await userEvent.click(
      within(screen.getByRole("navigation", { name: "Pinned conversations" })).getByRole(
        "button",
        { name: "Long continuing discussion" },
      ),
    );
    expect(await screen.findByText("Displayed answer 3")).toBeVisible();
    expect(screen.queryByText("Displayed answer 1")).toBeNull();
    expect(
      screen.getByText("Earlier details are unavailable under your current access."),
    ).toBeVisible();
    expect(read).toBe(2);
  });

  it("loads every ordered turn page without inference and refuses a failed or cross-account continuation", async () => {
    const calls: string[] = [];
    let wrongOwner = false,
      failed = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (failed && String(url).includes("after"))
          return Response.json({}, { status: 503 });
        return Response.json({
          ownerKey:
            String(url).includes("after") && wrongOwner ? "another-owner" : ownerKey,
          conversation: summary,
          turns: [
            {
              operationId: String(url).includes("after") ? "op-2" : "op-1",
              seq: String(url).includes("after") ? 2 : 1,
            },
          ],
          nextTurnCursor: String(url).includes("after") ? null : 1,
        });
      }),
    );
    const whole = await fetchConversation(id);
    expect(whole?.turns.map((t) => t.operationId)).toEqual(["op-1", "op-2"]);
    expect(calls).toEqual([
      `/api/assistant/history/${id}`,
      `/api/assistant/history/${id}?after=1`,
    ]);
    wrongOwner = true;
    expect(await fetchConversation(id)).toBeNull();
    wrongOwner = false;
    failed = true;
    expect(await fetchConversation(id)).toBeNull();
  });
});
