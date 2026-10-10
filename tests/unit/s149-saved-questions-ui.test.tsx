// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AskForm } from "@/components/ask/AskForm";
import type {
  HistoryPageOutcome,
  SavedListOutcome,
  SavedQuestionView,
} from "@/lib/assistant-history/client";

// S149/S150 in the Dashboard workspace. Expectations are checked against the captured requests and
// the DOM: saved questions arrive with the page, Save question saves once and never shows a failed
// save as saved, Open last answer only reads, navigation alone never runs anything, Run for current
// results posts only the saved item's id and an operation id and adds a new answer under the old
// one, Ask again is labelled as a new answer, and pin and label changes carry the version they saw.

const OWNER = "a".repeat(40);
const CONTEXT = { version: 1, actorKey: "b".repeat(32), turns: [] as unknown[] };
const CONVERSATION_ID = "c".repeat(32);
const SAVED_ID = "d".repeat(32);
const FIRST_OP = "00000000-0000-4000-8000-000000000001";

function operational(summary: string, ids: string[] = ["L1"]) {
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
        total: ids.length,
        items: ids.map((id) => ({
          ref: { source: "renewals", id },
          title: `${id} Main St`,
          detail: "In the renewal window",
          blockers: [],
          href: `/lease-renewal/live/desk/lease/${id}`,
        })),
        notes: [],
        link: null,
      },
    ],
    clarification: null,
    knowledgeQuestion: null,
    interpretedBy: "deterministic",
    conversation: CONTEXT,
    contextReset: false,
    answeredAtIso: "2026-09-30T17:00:00.000Z",
    execution: null,
  };
}

function savedItem(overrides: Partial<SavedQuestionView> = {}): SavedQuestionView {
  return {
    savedId: SAVED_ID,
    label: "Leases due this month",
    question: "What leases are due this month?",
    conversationId: CONVERSATION_ID,
    conversationKey: FIRST_OP,
    operationId: FIRST_OP,
    lastOperationId: FIRST_OP,
    lastAnsweredAtIso: "2026-09-30T17:00:00.000Z",
    createdAtIso: "2026-09-30T17:01:00.000Z",
    pinned: false,
    recordVersion: 1,
    structured: true,
    originalRange: {
      intent: "relative",
      preset: "this_month",
      month: null,
      dateField: "lease_end",
      startIso: "2026-09-01",
      endIso: "2026-09-30",
      label: "this month, September 2026 (Sep 1 – Sep 30)",
    },
    contextBefore: null,
    ...overrides,
  };
}

const STORED = {
  ownerKey: OWNER,
  conversation: {
    conversationId: CONVERSATION_ID,
    conversationKey: FIRST_OP,
    title: "What leases are due this month?",
    createdAtIso: "2026-09-30T17:00:00.000Z",
    updatedAtIso: "2026-09-30T17:00:00.000Z",
    turnCount: 1,
    lastState: "completed",
  },
  turns: [
    {
      turnId: "t".repeat(32),
      operationId: FIRST_OP,
      seq: 1,
      question: "What leases are due this month?",
      displayState: "completed",
      assistant: operational("September answer.", ["L-SEP"]),
      knowledge: null,
      answeredAtIso: "2026-09-30T17:00:00.000Z",
      createdAtIso: "2026-09-30T17:00:00.000Z",
      accessChanged: false,
      rerunOf: null,
    },
  ],
};

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body } as unknown as Response;
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

const callsTo = (method: string, prefix: string) =>
  calls().filter((call) => call.method === method && call.url.startsWith(prefix));

beforeEach(() => {
  handler = () => jsonResponse({}, false);
  fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    handler({
      url: String(url),
      method: (init?.method ?? "GET").toUpperCase(),
      body: init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : null,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function savedList(items: SavedQuestionView[]): Promise<SavedListOutcome> {
  return Promise.resolve({
    status: "ok",
    list: { ownerKey: OWNER, persisted: true, items, truncated: false },
  });
}

const emptyHistory = (): Promise<HistoryPageOutcome> =>
  Promise.resolve({
    status: "ok",
    page: { ownerKey: OWNER, persisted: true, conversations: [], nextCursor: null },
  });

async function renderSaved(items: SavedQuestionView[] = [savedItem()]) {
  await act(async () => {
    render(
      <AskForm
        historyMode="saved"
        initialHistory={emptyHistory()}
        initialSaved={savedList(items)}
        ownerKey={OWNER}
      />,
    );
  });
}

const savedNav = () => screen.getByRole("navigation", { name: "Saved questions" });

/** The real routes' successful responses, with per-route overrides. */
function server(overrides: Record<string, Handler> = {}): Handler {
  return (call) => {
    const route = `${call.method} ${call.url}`;
    for (const [prefix, override] of Object.entries(overrides)) {
      if (route.startsWith(prefix)) return override(call);
    }
    if (route === `GET /api/assistant/history/${CONVERSATION_ID}`)
      return jsonResponse(STORED);
    if (route === "POST /api/assistant/history/turns")
      return jsonResponse({ created: true });
    if (route.startsWith("PUT /api/assistant/history/turns/"))
      return jsonResponse({ conversationId: "e".repeat(32), created: true });
    if (route === "POST /api/assistant/query")
      return jsonResponse(operational("One lease."));
    return jsonResponse({}, false);
  };
}

describe("S149 saved questions in the workspace", () => {
  it("AC-S149-1: saved questions arrive with the page; mounting sends no request", async () => {
    await renderSaved([
      savedItem({ pinned: true }),
      savedItem({ savedId: "f".repeat(32), label: "My work" }),
    ]);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    const items = within(savedNav()).getAllByTestId("saved-item");
    expect(items[0]).toHaveTextContent("Pinned");
    expect(items[0]).toHaveTextContent("Leases due this month");
    expect(items[0]).toHaveTextContent(
      "Period: this month, worked out again on each run. The last answer covered this month, September 2026 (Sep 1 – Sep 30).",
    );
    expect(items[1]).toHaveTextContent("My work");
  });

  it("AC-S149-2: Save question saves an answered, recorded turn once and lists it", async () => {
    handler = server({
      "POST /api/assistant/saved": (call) =>
        jsonResponse({
          created: true,
          item: savedItem({
            savedId: "9".repeat(32),
            label: "What leases are due this week?",
            operationId: String(call.body?.operationId),
            lastOperationId: String(call.body?.operationId),
          }),
        }),
    });
    await renderSaved([]);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Question/), "What leases are due this week?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await screen.findByText("Saved to your history.");

    await user.click(screen.getByRole("button", { name: "Save question" }));
    await screen.findByTestId("turn-question-saved");
    const [query] = callsTo("POST", "/api/assistant/query");
    expect(callsTo("POST", "/api/assistant/saved")).toEqual([
      {
        url: "/api/assistant/saved",
        method: "POST",
        body: { operationId: query.body?.operationId },
      },
    ]);
    expect(
      within(savedNav()).getByText("What leases are due this week?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save question" }),
    ).not.toBeInTheDocument();
  });

  it("AC-S149-2: a failed save is never shown as saved", async () => {
    handler = server({
      "POST /api/assistant/saved": () => jsonResponse({ error: "down" }, false),
    });
    await renderSaved([]);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Question/), "What leases are due this week?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await screen.findByText("Saved to your history.");
    await user.click(screen.getByRole("button", { name: "Save question" }));
    await within(screen.getByRole("article")).findByText(
      "This question could not be saved just now. Nothing was saved.",
    );
    expect(screen.queryByTestId("turn-question-saved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save question" })).toBeInTheDocument();
    expect(within(savedNav()).queryAllByTestId("saved-item")).toHaveLength(0);
  });

  it("AC-S149-4: Open last answer only reads; navigation alone never runs or asks", async () => {
    handler = server();
    await renderSaved();
    const user = userEvent.setup();
    await user.click(
      within(savedNav()).getByRole("button", { name: "Open last answer" }),
    );
    await screen.findByText("September answer.", { selector: "p" });
    expect(screen.getByTestId("dashboard-announcer")).toHaveTextContent(
      "Nothing was asked again.",
    );
    await user.click(
      within(savedNav()).getByRole("button", { name: "Open last answer" }),
    );
    expect(calls().map((call) => `${call.method} ${call.url}`)).toEqual([
      `GET /api/assistant/history/${CONVERSATION_ID}`,
      `GET /api/assistant/history/${CONVERSATION_ID}`,
    ]);
  });

  it("AC-S149-4 / AC-S150-2: Run for current results adds a new answer under the old one without asking", async () => {
    handler = server({
      [`POST /api/assistant/saved/${SAVED_ID}/run`]: (call) =>
        jsonResponse({
          conversationId: CONVERSATION_ID,
          replayed: false,
          turn: {
            turnId: "r".repeat(32),
            operationId: String(call.body?.operationId),
            seq: 2,
            question: "What leases are due this month?",
            displayState: "completed",
            assistant: {
              ...operational("October answer.", ["L-OCT-A", "L-OCT-B"]),
              interpretedBy: "stored_plan",
            },
            knowledge: null,
            answeredAtIso: "2026-10-15T17:00:00.000Z",
            createdAtIso: "2026-10-15T17:00:00.000Z",
            accessChanged: false,
            rerunOf: SAVED_ID,
          },
          item: savedItem({
            lastOperationId: String(call.body?.operationId),
            lastAnsweredAtIso: "2026-10-15T17:00:00.000Z",
          }),
        }),
    });
    await renderSaved();
    const user = userEvent.setup();
    await user.click(
      within(savedNav()).getByRole("button", { name: "Run for current results" }),
    );
    await screen.findByText("October answer.", { selector: "p" });

    const turns = screen.getAllByRole("article");
    expect(turns).toHaveLength(2);
    expect(turns[0]).toHaveTextContent("September answer.");
    expect(turns[1]).toHaveTextContent("October answer.");
    expect(within(turns[1]).getByTestId("turn-rerun-label")).toHaveTextContent(
      /from your saved question with no new interpretation\.$/,
    );
    const runs = callsTo("POST", `/api/assistant/saved/${SAVED_ID}/run`);
    expect(runs).toHaveLength(1);
    expect(Object.keys(runs[0].body ?? {})).toEqual(["operationId"]);
    expect(callsTo("POST", "/api/assistant/query")).toHaveLength(0);
    expect(callsTo("POST", "/api/ask")).toHaveLength(0);
    expect(screen.getByTestId("dashboard-announcer")).toHaveTextContent(
      "Current results ready. Your earlier answer is unchanged.",
    );
  });

  it("AC-S150-4: a failed run is shown as failed, keeps the earlier answer, and Retry repeats the same operation", async () => {
    let attempts = 0;
    handler = server({
      [`POST /api/assistant/saved/${SAVED_ID}/run`]: (call) => {
        attempts += 1;
        if (attempts === 1) return jsonResponse({ error: "down" }, false, 503);
        return jsonResponse({
          conversationId: CONVERSATION_ID,
          replayed: false,
          turn: {
            ...STORED.turns[0],
            turnId: "r".repeat(32),
            operationId: String(call.body?.operationId),
            seq: 2,
            assistant: operational("Recovered answer.", ["L-OCT-A"]),
            answeredAtIso: "2026-10-15T17:00:00.000Z",
            rerunOf: SAVED_ID,
          },
          item: savedItem({ lastOperationId: String(call.body?.operationId) }),
        });
      },
    });
    await renderSaved();
    const user = userEvent.setup();
    await user.click(
      within(savedNav()).getByRole("button", { name: "Run for current results" }),
    );
    await screen.findByText(
      "Current results could not be loaded just now. Your earlier answer is unchanged.",
    );
    expect(screen.getByText("September answer.", { selector: "p" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Recovered answer.", { selector: "p" });
    const runs = callsTo("POST", `/api/assistant/saved/${SAVED_ID}/run`);
    expect(runs).toHaveLength(2);
    expect(runs[1].body).toEqual(runs[0].body);
  });

  it("an item that needs a new answer is asked again with its saved context, and says so", async () => {
    const contextBefore = {
      version: 1,
      actorKey: "b".repeat(32),
      turns: [
        { question: "What maintenance is open?", plan: null, awaiting: null, refs: [] },
      ],
    };
    handler = server();
    await renderSaved([
      savedItem({
        structured: false,
        originalRange: null,
        contextBefore: contextBefore as unknown as SavedQuestionView["contextBefore"],
      }),
    ]);
    const user = userEvent.setup();
    await user.click(within(savedNav()).getByRole("button", { name: "Ask again" }));
    await screen.findByText("One lease.", { selector: "p" });
    const [query] = callsTo("POST", "/api/assistant/query");
    expect(query.body).toMatchObject({
      question: "What leases are due this month?",
      conversation: contextBefore,
    });
    expect(query.body?.operationId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(screen.getByTestId("turn-asked-again-label")).toHaveTextContent(
      "Asked again as a new question, so this answer was newly generated.",
    );
    expect(callsTo("POST", "/api/assistant/saved/")).toHaveLength(0);
  });

  it("AC-S149-2: pin sends the version it saw and moves the item to the top", async () => {
    const second = savedItem({
      savedId: "f".repeat(32),
      label: "My work",
      createdAtIso: "2026-09-29T00:00:00.000Z",
    });
    handler = (call) =>
      call.method === "PATCH" && call.url === `/api/assistant/saved/${second.savedId}`
        ? jsonResponse({
            changed: true,
            item: { ...second, pinned: true, recordVersion: 2 },
          })
        : jsonResponse({}, false);
    await renderSaved([savedItem(), second]);
    const user = userEvent.setup();
    const items = within(savedNav()).getAllByTestId("saved-item");
    await user.click(within(items[1]).getByRole("button", { name: "Pin" }));
    await within(savedNav()).findByText(
      "Pinned. It stays at the top of your saved questions.",
    );
    const reordered = within(savedNav()).getAllByTestId("saved-item");
    expect(reordered[0]).toHaveTextContent("My work");
    expect(within(reordered[0]).getByRole("button", { name: "Unpin" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(callsTo("PATCH", "/api/assistant/saved/")[0].body).toEqual({
      pinned: true,
      expectedVersion: 1,
    });
  });

  it("AC-S149-2: a failed pin changes nothing, and a conflict shows the latest state", async () => {
    let patches = 0;
    handler = (call) => {
      if (call.method === "PATCH") {
        patches += 1;
        return patches === 1
          ? jsonResponse({}, false, 503)
          : jsonResponse({}, false, 409);
      }
      if (call.method === "GET" && call.url === "/api/assistant/saved")
        return jsonResponse({
          ownerKey: OWNER,
          persisted: true,
          items: [savedItem({ pinned: true, recordVersion: 3 })],
          truncated: false,
        });
      return jsonResponse({}, false);
    };
    await renderSaved();
    const user = userEvent.setup();
    await user.click(within(savedNav()).getByRole("button", { name: "Pin" }));
    await within(savedNav()).findByText(
      "The pin could not be changed just now. Nothing was changed.",
    );
    expect(within(savedNav()).queryByText("Pinned")).not.toBeInTheDocument();

    await user.click(within(savedNav()).getByRole("button", { name: "Pin" }));
    await within(savedNav()).findByText(
      "This saved question changed in another session. Its latest state is shown.",
    );
    expect(within(savedNav()).getByRole("button", { name: "Unpin" })).toBeInTheDocument();
    expect(callsTo("GET", "/api/assistant/saved")).toHaveLength(1);
  });

  it("renames with the version it saw", async () => {
    handler = (call) =>
      call.method === "PATCH"
        ? jsonResponse({
            changed: true,
            item: savedItem({ label: "Monthly lease check", recordVersion: 2 }),
          })
        : jsonResponse({}, false);
    await renderSaved();
    const user = userEvent.setup();
    await user.click(within(savedNav()).getByRole("button", { name: "Rename" }));
    const input = within(savedNav()).getByLabelText("Label");
    await user.clear(input);
    await user.type(input, "Monthly lease check");
    await user.click(within(savedNav()).getByRole("button", { name: "Save label" }));
    await within(savedNav()).findByText("Monthly lease check");
    expect(callsTo("PATCH", "/api/assistant/saved/")[0].body).toEqual({
      label: "Monthly lease check",
      expectedVersion: 1,
    });
    await waitFor(() =>
      expect(within(savedNav()).getByText("Renamed.")).toBeInTheDocument(),
    );
  });
});
