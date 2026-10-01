// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AskForm } from "@/components/ask/AskForm";

// S146: the Dashboard's AI workspace. The question box comes first; every question and answer
// appears below it in order with its own pending, failure and retry state; nothing submits on
// mount or when an earlier conversation is reopened; the request carries no process, Space or
// workflow selection. Every expectation is checked against the captured requests and the DOM.

const CONTEXT = { version: 1, actorKey: "b".repeat(32), turns: [] as unknown[] };

function operational(summary: string) {
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
  };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse({}, false));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function calledUrls(): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

describe("S146 AI-first Dashboard workspace", () => {
  it("AC-S146-4: mounting the workspace sends no request at all", async () => {
    render(<AskForm />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AC-S146-1: the question box comes first and each answer renders below it in order", async () => {
    const user = userEvent.setup();
    const replies = [operational("First answer."), operational("Second answer.")];
    fetchMock.mockImplementation(async () => jsonResponse(replies.shift()));
    render(<AskForm />);

    await user.type(screen.getByLabelText(/Question/), "What leases are due this week?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await screen.findByText("First answer.", { selector: "p" });
    await user.type(screen.getByLabelText(/Question/), "Only mine");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await screen.findByText("Second answer.", { selector: "p" });

    const form = screen.getByRole("form", { name: "Ask a question" });
    const turns = screen.getAllByRole("article");
    expect(turns).toHaveLength(2);
    expect(
      form.compareDocumentPosition(turns[0]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      turns[0].compareDocumentPosition(turns[1]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(turns[0]).toHaveTextContent("What leases are due this week?");
    expect(turns[0]).toHaveTextContent("First answer.");
    expect(turns[1]).toHaveTextContent("Only mine");
    expect(turns[1]).toHaveTextContent("Second answer.");
    // The answers are not in a side panel beside the question box.
    expect(document.querySelector(".result-panel")).toBeNull();
    expect(form.closest(".dashboard-main")).toContainElement(turns[1]);
  });

  it("AC-S146-2: an ordinary question carries no process, Space or workflow field", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => jsonResponse(operational("One lease.")));
    render(<AskForm />);
    await user.type(screen.getByLabelText(/Question/), "What leases are due this week?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await screen.findByText("One lease.", { selector: "p" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/assistant/query");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["conversation", "question"]);
    expect(JSON.stringify(body)).not.toMatch(/process|space|workflow/i);
  });

  it("AC-S146-3: a network rejection fails only that turn, keeps the question, and Retry answers it", async () => {
    const user = userEvent.setup();
    let online = false;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (!online) throw new TypeError("Failed to fetch");
      return String(input).includes("/api/assistant/query")
        ? jsonResponse(operational("Recovered answer."))
        : jsonResponse({}, false);
    });
    render(<AskForm />);

    const question = screen.getByLabelText(/Question/);
    await user.type(question, "What leases are due this week?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));

    const turn = await screen.findByRole("article");
    expect(
      await within(turn).findByText(/could not be reached|could not be loaded/),
    ).toBeInTheDocument();
    // No stuck pending state: the turn is failed, not busy, and the box accepts input again.
    expect(turn).toHaveAttribute("data-state", "failed");
    expect(turn).not.toHaveAttribute("aria-busy");
    expect(screen.getByRole("button", { name: "Get answer" })).toBeEnabled();
    expect(question).toHaveValue("What leases are due this week?");

    online = true;
    await user.click(within(turn).getByRole("button", { name: "Retry" }));
    expect(
      await within(turn).findByText("Recovered answer.", { selector: "p" }),
    ).toBeVisible();
    expect(turn).toHaveAttribute("data-state", "answered");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(question).toHaveValue("");
  });

  it("BEH-S146-2: a new conversation keeps the earlier one reopenable without asking again", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () => jsonResponse(operational("Kept answer.")));
    render(<AskForm />);
    await user.type(screen.getByLabelText(/Question/), "What leases are due this week?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await screen.findByText("Kept answer.", { selector: "p" });

    await user.click(screen.getByRole("button", { name: "Start a new conversation" }));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    const requestsBefore = fetchMock.mock.calls.length;

    const nav = screen.getByRole("navigation", { name: "Conversations" });
    await user.click(
      within(nav).getByRole("button", { name: "What leases are due this week?" }),
    );
    expect(await screen.findByText("Kept answer.", { selector: "p" })).toBeVisible();
    expect(fetchMock.mock.calls.length).toBe(requestsBefore);
  });

  it("a late answer never discards newer typing", async () => {
    const user = userEvent.setup();
    let release: (value: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    render(<AskForm />);
    const question = screen.getByLabelText(/Question/);
    await user.type(question, "What leases are due this week?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await user.clear(question);
    await user.type(question, "A newer question I am still typing");

    await act(async () => {
      release(jsonResponse(operational("Late answer.")));
    });
    expect(await screen.findByText("Late answer.", { selector: "p" })).toBeVisible();
    expect(question).toHaveValue("A newer question I am still typing");
    // Focus stays where the person is typing instead of jumping to the answer.
    expect(question).toHaveFocus();
  });

  it("AF-69: announces the outcome politely and moves focus to the answered turn", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async () =>
      jsonResponse(operational("Focused answer.")),
    );
    render(<AskForm />);
    await user.type(screen.getByLabelText(/Question/), "What leases are due this week?");
    await user.click(screen.getByRole("button", { name: "Get answer" }));
    await screen.findByText("Focused answer.", { selector: "p" });

    const announcer = screen.getByTestId("dashboard-announcer");
    expect(announcer).toHaveAttribute("aria-live", "polite");
    expect(announcer).toHaveTextContent("Answer ready.");
    await waitFor(() => expect(screen.getByRole("article")).toHaveFocus());
  });

  it("S146 source scan: the workspace has no Dashboard process launch path", async () => {
    const { readFileSync } = await import("node:fs");
    const code = readFileSync("components/ask/AskForm.tsx", "utf8");
    for (const forbidden of [
      "/api/processes/classify",
      "/process-definitions/",
      "/api/ask/live-target",
      "detectProcess",
      "process_id",
      "RenewalNoticeDraftComposer",
    ]) {
      expect(code, forbidden).not.toContain(forbidden);
    }
    expect(calledUrls()).toEqual([]);
  });
});
