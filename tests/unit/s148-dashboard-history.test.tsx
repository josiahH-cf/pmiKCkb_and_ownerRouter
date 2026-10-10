// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AskForm } from "@/components/ask/AskForm";
import { resolveHistoryMode } from "@/components/console/ConsoleView";
import type {
  HistoryConversationSummary,
  HistoryPageOutcome,
} from "@/lib/assistant-history/client";

// S148: the Dashboard keeps the signed-in user's own conversations. Every expectation below is
// checked against the captured requests (method, path, body) and the DOM: the first history page
// arrives with the page (no request on mount), each answered question is saved under its own
// operation id, a failed save retries the save alone and never asks again, reopening reads stored
// turns only, a response for another sign-in is discarded, and verification accounts never write.

const OWNER = "a".repeat(40);
const CONTEXT = {
  version: 1,
  actorKey: "b".repeat(32),
  turns: [
    {
      question: "What leases are due this week?",
      plan: null as unknown,
      awaiting: null,
      refs: [{ source: "renewals", id: "L1" }],
    },
  ],
};

function operational(summary: string, extra: Record<string, unknown> = {}) {
  return {
    version: "assistant-conversation/v1",
    kind: "answer",
    summary,
    interpretation: [],
    groups: [
      {
        source: "renewals",
        title: "Leases",
        summary,
        status: "ok",
        total: 1,
        items: [
          {
            ref: { source: "renewals", id: "L1" },
            title: "1 Main St",
            detail: "In the renewal window",
            blockers: [],
            href: "/lease-renewal/live/desk/lease/L1",
          },
        ],
        notes: [],
        link: null,
      },
    ],
    clarification: null,
    knowledgeQuestion: null,
    interpretedBy: "deterministic",
    conversation: CONTEXT,
    contextReset: false,
    answeredAtIso: "2026-10-01T15:00:00.000Z",
    execution: null,
    ...extra,
  };
}

function summary(index: number, extra: Partial<HistoryConversationSummary> = {}) {
  return {
    conversationId: String(index).padStart(32, "c"),
    conversationKey: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Saved question ${index}`,
    createdAtIso: "2026-09-30T15:00:00.000Z",
    updatedAtIso: "2026-09-30T15:05:00.000Z",
    turnCount: 1,
    lastState: "completed" as const,
    ...extra,
  };
}

function firstPage(
  conversations: HistoryConversationSummary[],
  nextCursor: string | null = null,
  ownerKey = OWNER,
): Promise<HistoryPageOutcome> {
  return Promise.resolve({
    status: "ok",
    page: { ownerKey, persisted: true, conversations, nextCursor },
  });
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

type Call = { url: string; method: string; body: Record<string, unknown> | null };
type Handler = (call: Call) => Response | Promise<Response>;

let fetchMock: ReturnType<typeof vi.fn>;
let handler: Handler;

function calls(): Call[] {
  return fetchMock.mock.calls.map((entry) => {
    const init = (entry[1] ?? {}) as RequestInit;
    return {
      url: String(entry[0]),
      method: (init.method ?? "GET").toUpperCase(),
      body: init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    };
  });
}

function callsTo(method: string, prefix: string): Call[] {
  return calls().filter((call) => call.method === method && call.url.startsWith(prefix));
}

beforeEach(() => {
  handler = () => jsonResponse({}, false);
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    return handler({
      url: String(url),
      method: (init?.method ?? "GET").toUpperCase(),
      body: init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null,
    });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderSaved(initial: Promise<HistoryPageOutcome> | null = firstPage([])) {
  await act(async () => {
    render(<AskForm historyMode="saved" initialHistory={initial} ownerKey={OWNER} />);
  });
}

/** A server that answers every Dashboard request the way the real routes would succeed. */
function workingServer(overrides: Partial<Record<string, Handler>> = {}): Handler {
  return (call) => {
    const exact = overrides[`${call.method} ${call.url}`];
    if (exact) return exact(call);
    const key = `${call.method} ${call.url.replace(/\/[A-Za-z0-9-]{8,64}$/, "/:op")}`;
    const override = overrides[key];
    if (override) return override(call);
    if (key === "POST /api/assistant/history/turns")
      return jsonResponse({ created: true, state: "submitted" });
    if (key === "POST /api/assistant/query")
      return jsonResponse(operational("One lease."));
    if (key === "PUT /api/assistant/history/turns/:op")
      return jsonResponse({
        conversationId: "e".repeat(32),
        created: true,
        state: "completed",
      });
    return jsonResponse({}, false);
  };
}

async function ask(question: string) {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText(/Question/));
  await user.type(screen.getByLabelText(/Question/), question);
  await user.click(screen.getByRole("button", { name: "Get answer" }));
  return user;
}

describe("S148 Dashboard history in the workspace", () => {
  it("AC-S148: the first history page arrives with the page; mounting sends no request", async () => {
    await renderSaved(firstPage([summary(1), summary(2)]));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const nav = screen.getByRole("navigation", { name: "History" });
    expect(
      within(nav).getByRole("button", { name: "Saved question 1" }),
    ).toBeInTheDocument();
    expect(
      within(nav).getByRole("button", { name: "Saved question 2" }),
    ).toBeInTheDocument();
  });

  it("AC-S148: an answered question is recorded, answered and saved under one operation id", async () => {
    handler = workingServer();
    await renderSaved();
    await ask("What leases are due this week?");
    await screen.findByText("Saved to your history.");

    const begin = callsTo("POST", "/api/assistant/history/turns");
    const query = callsTo("POST", "/api/assistant/query");
    const save = callsTo("PUT", "/api/assistant/history/turns/");
    expect([begin.length, query.length, save.length]).toEqual([1, 1, 1]);
    const operationId = String(query[0].body?.operationId);
    expect(begin[0].body).toEqual({
      operationId,
      conversationKey: operationId,
      question: "What leases are due this week?",
    });
    expect(save[0].url).toBe(`/api/assistant/history/turns/${operationId}`);
    expect(save[0].body).toMatchObject({
      conversationKey: operationId,
      question: "What leases are due this week?",
      state: "completed",
      knowledge: null,
    });
    expect((save[0].body?.assistant as { summary: string }).summary).toBe("One lease.");
    // The new conversation appears in the history list without another read.
    const nav = screen.getByRole("navigation", { name: "History" });
    expect(
      within(nav).getByRole("button", { name: "What leases are due this week?" }),
    ).toHaveAttribute("aria-current", "true");
    expect(callsTo("GET", "/api/assistant/history")).toHaveLength(0);
  });

  it("AC-S148: a replayed duplicate is saved without its replay marker", async () => {
    handler = workingServer({
      "POST /api/assistant/query": () =>
        jsonResponse({ ...operational("One lease."), replayed: true }),
    });
    await renderSaved();
    await ask("What leases are due this week?");
    await screen.findByText("Saved to your history.");
    const [save] = callsTo("PUT", "/api/assistant/history/turns/");
    expect(save.body?.assistant).not.toHaveProperty("replayed");
  });

  it("AC-S148: a failed save shows Retry saving, which saves the same answer and never asks again", async () => {
    let saves = 0;
    handler = workingServer({
      "PUT /api/assistant/history/turns/:op": () => {
        saves += 1;
        return saves === 1
          ? jsonResponse({ error: "unavailable" }, false)
          : jsonResponse({
              conversationId: "e".repeat(32),
              created: true,
              state: "completed",
            });
      },
    });
    await renderSaved();
    const user = await ask("What leases are due this week?");
    await screen.findByText(/This answer is not saved to your history yet/);
    expect(screen.getByText("One lease.", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-announcer")).toHaveTextContent(
      "Answer ready, but it is not saved to your history yet. Use Retry saving.",
    );

    await user.click(screen.getByRole("button", { name: "Retry saving" }));
    await screen.findByText("Saved to your history.");
    const puts = callsTo("PUT", "/api/assistant/history/turns/");
    expect(puts).toHaveLength(2);
    expect(puts[1].body).toEqual(puts[0].body);
    expect(callsTo("POST", "/api/assistant/query")).toHaveLength(1);
    expect(callsTo("POST", "/api/ask")).toHaveLength(0);
  });

  it("AC-S148: a question with no answer is saved as failed, never as an answer", async () => {
    handler = workingServer({
      "POST /api/assistant/query": () => jsonResponse({ error: "down" }, false),
      "POST /api/ask": () => jsonResponse({ error: "down" }, false),
    });
    await renderSaved();
    await ask("What leases are due this week?");
    await screen.findByRole("button", { name: "Retry" });
    await waitFor(() =>
      expect(callsTo("PUT", "/api/assistant/history/turns/")).toHaveLength(1),
    );
    const [save] = callsTo("PUT", "/api/assistant/history/turns/");
    expect(save.body).toMatchObject({
      state: "failed",
      assistant: null,
      knowledge: null,
    });
    expect(screen.queryByText("Saved to your history.")).not.toBeInTheDocument();
  });

  it("AC-S148: a failed history read is not an empty history, and Try again reads once more", async () => {
    handler = (call) =>
      call.method === "GET" && call.url === "/api/assistant/history"
        ? jsonResponse({
            ownerKey: OWNER,
            persisted: true,
            conversations: [summary(3)],
            nextCursor: null,
          })
        : jsonResponse({}, false);
    await renderSaved(Promise.resolve({ status: "failed" }));
    const nav = screen.getByRole("navigation", { name: "History" });
    expect(nav).toHaveTextContent(
      "Your history could not be loaded just now. Nothing was removed.",
    );
    expect(nav).not.toHaveTextContent("No saved conversations yet");

    await userEvent.setup().click(within(nav).getByRole("button", { name: "Try again" }));
    await within(nav).findByRole("button", { name: "Saved question 3" });
    expect(callsTo("GET", "/api/assistant/history")).toHaveLength(1);
  });

  it("AC-S148: an empty history says so plainly", async () => {
    await renderSaved(firstPage([]));
    expect(screen.getByRole("navigation", { name: "History" })).toHaveTextContent(
      "No saved conversations here. Questions you ask here are saved to your history.",
    );
  });

  it("AC-S148/S200: reopening rechecks the stored conversation, labels it, and asks nothing", async () => {
    const restored = {
      ownerKey: OWNER,
      conversation: summary(4, { turnCount: 3 }),
      turns: [
        {
          turnId: "t".repeat(32),
          operationId: "00000000-0000-4000-8000-000000000041",
          seq: 1,
          question: "What leases are due this week?",
          displayState: "completed",
          assistant: operational("Stored answer."),
          knowledge: null,
          answeredAtIso: "2026-09-30T15:01:00.000Z",
          createdAtIso: "2026-09-30T15:00:00.000Z",
          accessChanged: false,
          rerunOf: null,
        },
        {
          turnId: "u".repeat(32),
          operationId: "00000000-0000-4000-8000-000000000042",
          seq: 2,
          question: "Only mine",
          displayState: "interrupted",
          assistant: null,
          knowledge: null,
          answeredAtIso: null,
          createdAtIso: "2026-09-30T15:02:00.000Z",
          accessChanged: false,
          rerunOf: null,
        },
        {
          turnId: "v".repeat(32),
          operationId: "00000000-0000-4000-8000-000000000043",
          seq: 3,
          question: "And approvals?",
          displayState: "failed",
          assistant: null,
          knowledge: null,
          answeredAtIso: null,
          createdAtIso: "2026-09-30T15:03:00.000Z",
          accessChanged: false,
          rerunOf: null,
        },
      ],
    };
    handler = (call) =>
      call.method === "GET" &&
      call.url === `/api/assistant/history/${summary(4).conversationId}`
        ? jsonResponse(restored)
        : jsonResponse({}, false);
    await renderSaved(firstPage([summary(4)]));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Saved question 4" }));

    await screen.findByText("Stored answer.", { selector: "p" });
    const turns = screen.getAllByRole("article");
    expect(turns).toHaveLength(3);
    expect(within(turns[0]).getByTestId("turn-history-label")).toHaveTextContent(
      /^Saved answer from .+\. It shows what was true then, not current results\.$/,
    );
    expect(turns[1]).toHaveTextContent(
      "This question was interrupted before an answer was saved. No answer is shown.",
    );
    expect(turns[2]).toHaveTextContent("No answer was saved for this question.");
    expect(
      within(turns[2]).queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Saved to your history.")).not.toBeInTheDocument();
    expect(screen.getByTestId("dashboard-announcer")).toHaveTextContent(
      "Nothing was asked again.",
    );
    expect(calls().map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET /api/assistant/history/${summary(4).conversationId}`,
    ]);

    // S199/S200 rechecks current access and later turns on every open; it still never infers.
    await user.click(screen.getByRole("button", { name: "Saved question 4" }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(calls().every((call) => call.method === "GET")).toBe(true);
  });

  it("AC-S148: a follow-up in a reopened conversation continues its stored context and saves there", async () => {
    const stored = summary(5);
    const restored = {
      ownerKey: OWNER,
      conversation: stored,
      turns: [
        {
          turnId: "t".repeat(32),
          operationId: stored.conversationKey,
          seq: 1,
          question: "What leases are due this week?",
          displayState: "completed",
          assistant: operational("Stored answer."),
          knowledge: null,
          answeredAtIso: "2026-09-30T15:01:00.000Z",
          createdAtIso: "2026-09-30T15:00:00.000Z",
          accessChanged: false,
          rerunOf: null,
        },
      ],
    };
    handler = workingServer({
      [`GET /api/assistant/history/${stored.conversationId}`]: () =>
        jsonResponse(restored),
      "PUT /api/assistant/history/turns/:op": () =>
        jsonResponse({
          conversationId: stored.conversationId,
          created: true,
          state: "completed",
        }),
    });
    await renderSaved(firstPage([stored]));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Saved question 5" }));
    await screen.findByText("Stored answer.", { selector: "p" });
    // Reopening moves focus to the opened turn on the next frame. Type the follow-up after that,
    // as a person would, so no keystroke lands on the turn instead of the question box.
    await waitFor(() =>
      expect(document.activeElement?.closest("article.dashboard-turn")).not.toBeNull(),
    );

    await ask("Only the second one");
    await screen.findByText("Saved to your history.");
    const [query] = callsTo("POST", "/api/assistant/query");
    expect(query.body?.conversation).toEqual(CONTEXT);
    const [begin] = callsTo("POST", "/api/assistant/history/turns");
    expect(begin.body?.conversationKey).toBe(stored.conversationKey);
    expect(begin.body?.operationId).toBe(query.body?.operationId);
    expect(begin.body?.operationId).not.toBe(stored.conversationKey);
  });

  it("AC-S148: a reopened conversation takes focus when the frame runs before its turn renders", async () => {
    const stored = summary(15);
    handler = workingServer({
      [`GET /api/assistant/history/${stored.conversationId}`]: () =>
        jsonResponse({
          ownerKey: OWNER,
          conversation: stored,
          turns: [
            {
              turnId: "t".repeat(32),
              operationId: stored.conversationKey,
              seq: 1,
              question: "What leases are due this week?",
              displayState: "completed",
              assistant: operational("Stored answer."),
              knowledge: null,
              answeredAtIso: "2026-09-30T15:01:00.000Z",
              createdAtIso: "2026-09-30T15:00:00.000Z",
              accessChanged: false,
              rerunOf: null,
            },
          ],
        }),
    });
    // A busy machine can run the frame callback before React has rendered the reopened turn.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    await renderSaved(firstPage([stored]));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Saved question 15" }));
    await screen.findByText("Stored answer.", { selector: "p" });
    await waitFor(() =>
      expect(document.activeElement?.closest("article.dashboard-turn")).not.toBeNull(),
    );

    // Opening it again while it is already on screen focuses its turn again.
    screen.getByRole("button", { name: "Saved question 15" }).focus();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Saved question 15" }));
    await waitFor(() =>
      expect(document.activeElement?.closest("article.dashboard-turn")).not.toBeNull(),
    );
  });

  it("AC-S148: a reopened answer whose access narrowed says its records are hidden", async () => {
    const restored = {
      ownerKey: OWNER,
      conversation: summary(6),
      turns: [
        {
          turnId: "t".repeat(32),
          operationId: "00000000-0000-4000-8000-000000000061",
          seq: 1,
          question: "What leases are due this week?",
          displayState: "completed",
          assistant: { ...operational("Hidden."), groups: [] },
          knowledge: null,
          answeredAtIso: "2026-09-30T15:01:00.000Z",
          createdAtIso: "2026-09-30T15:00:00.000Z",
          accessChanged: true,
          rerunOf: null,
        },
      ],
    };
    handler = () => jsonResponse(restored);
    await renderSaved(firstPage([summary(6)]));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Saved question 6" }));
    await screen.findByText(
      "Your access has changed since this answer, so its records are hidden.",
    );
  });

  it("AC-S148: a page or conversation for another sign-in is discarded, never shown", async () => {
    handler = () =>
      jsonResponse({ ownerKey: "f".repeat(40), conversation: summary(7), turns: [] });
    await renderSaved(firstPage([summary(7)], null, "f".repeat(40)));
    const nav = screen.getByRole("navigation", { name: "History" });
    expect(
      within(nav).queryByRole("button", { name: "Saved question 7" }),
    ).not.toBeInTheDocument();
    expect(nav).toHaveTextContent("Your history could not be loaded just now.");

    cleanup();
    await renderSaved(firstPage([summary(7)]));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Saved question 7" }));
    await waitFor(() =>
      expect(screen.getByTestId("dashboard-announcer")).toHaveTextContent(
        "That conversation could not be opened just now. Nothing was changed.",
      ),
    );
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("AC-S148: older history appends the next page without duplicates and survives a failed read", async () => {
    const cursor = `2026-09-30T15:05:00.000Z|${"9".repeat(32)}`;
    let attempts = 0;
    handler = (call) => {
      if (
        call.method !== "GET" ||
        !call.url.startsWith("/api/assistant/history?cursor=")
      ) {
        return jsonResponse({}, false);
      }
      attempts += 1;
      return attempts === 1
        ? jsonResponse({}, false)
        : jsonResponse({
            ownerKey: OWNER,
            persisted: true,
            conversations: [summary(2), summary(3)],
            nextCursor: null,
          });
    };
    await renderSaved(firstPage([summary(1), summary(2)], cursor));
    const user = userEvent.setup();
    const nav = screen.getByRole("navigation", { name: "History" });

    await user.click(within(nav).getByRole("button", { name: "Show older history" }));
    await within(nav).findByText("Older history could not be loaded just now.");
    expect(within(nav).getAllByRole("listitem")).toHaveLength(2);

    await user.click(
      within(nav).getByRole("button", { name: "Try older history again" }),
    );
    await within(nav).findByRole("button", { name: "Saved question 3" });
    expect(within(nav).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(nav).queryByRole("button", { name: /older history/ }),
    ).not.toBeInTheDocument();
    expect(callsTo("GET", "/api/assistant/history?cursor=")[0].url).toBe(
      `/api/assistant/history?cursor=${encodeURIComponent(cursor)}`,
    );
  });

  it("AC-S148: a verification account is answered but never writes history", async () => {
    handler = workingServer();
    await act(async () => {
      render(<AskForm historyMode="verification" ownerKey={OWNER} />);
    });
    await ask("What leases are due this week?");
    await screen.findByText("One lease.", { selector: "p" });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(calls().map((call) => `${call.method} ${call.url}`)).toEqual([
      "POST /api/assistant/query",
    ]);
    expect(screen.getByRole("navigation", { name: "Conversations" })).toHaveTextContent(
      "History is not saved for verification accounts.",
    );
    expect(screen.queryByRole("navigation", { name: "History" })).not.toBeInTheDocument();
  });

  it("AC-S148: an environment that refuses history writes says so and sends none", async () => {
    handler = workingServer();
    await act(async () => {
      render(<AskForm historyMode="unavailable" ownerKey={OWNER} />);
    });
    await ask("What leases are due this week?");
    await screen.findByText("One lease.", { selector: "p" });
    expect(calls().every((call) => !call.url.startsWith("/api/assistant/history"))).toBe(
      true,
    );
    expect(screen.getByRole("navigation", { name: "Conversations" })).toHaveTextContent(
      "History is not saved in this environment.",
    );
  });
});

describe("S148 history mode on the server", () => {
  const base = { uid: "u1", hd: "pmikcmetro.com", role: "Admin" as const };

  it("verification accounts are never saved", () => {
    expect(
      resolveHistoryMode(
        { ...base, email: "canary-admin@pmikcmetro.com" },
        {
          ENVIRONMENT_KIND: "production",
          DATA_CONTEXT: "live",
        },
      ),
    ).toBe("verification");
  });

  it("Production saves; the Live-read-only rehearsal does not unless Firestore is an emulator", () => {
    const owner = { ...base, email: "owner@pmikcmetro.com" };
    expect(
      resolveHistoryMode(owner, { ENVIRONMENT_KIND: "production", DATA_CONTEXT: "live" }),
    ).toBe("saved");
    expect(
      resolveHistoryMode(owner, {
        ENVIRONMENT_KIND: "demo",
        DATA_CONTEXT: "live_readonly",
      }),
    ).toBe("unavailable");
    expect(
      resolveHistoryMode(owner, {
        ENVIRONMENT_KIND: "demo",
        DATA_CONTEXT: "live_readonly",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      }),
    ).toBe("saved");
    expect(
      resolveHistoryMode(owner, { ENVIRONMENT_KIND: "nonsense", DATA_CONTEXT: "live" }),
    ).toBe("unavailable");
  });
});
