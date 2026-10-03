// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationAnswerView } from "@/components/ask/DashboardTurnView";
import {
  conversationActorKey,
  runAssistantConversation,
} from "@/lib/assistant/conversation";
import {
  fakeOperationalContext,
  renewalsRead,
} from "@/tests/helpers/operational-context-fake";

// S166 (F15): what the person sees. Synthetic values only.

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function answerFor(question: string) {
  const ctx = fakeOperationalContext({
    reads: {
      renewals: renewalsRead([
        { id: "6101", address: "21 Sample Ave", tenants: ["Jordan Smith"] },
        { id: "6102", address: "23 Sample Ave", tenants: ["Jamie Smith"] },
        { id: "6103", address: "25 Sample Ave", tenants: ["Lee Park"] },
      ]),
    },
  });
  return runAssistantConversation(
    { question, conversation: null },
    {
      nowIso: ctx.nowIso,
      actorKey: conversationActorKey(ctx.actorUid),
      context: ctx,
      interpret: null,
    },
  );
}

describe("S166 lease results on the Dashboard (ARCH-S166-1)", () => {
  it("BEH-S166-1: a matching lease is a link to its workspace beside its tenant", async () => {
    render(
      <ConversationAnswerView
        answer={await answerFor("Which leases are related to Lee Park?")}
      />,
    );
    const link = screen.getByRole("link", { name: "25 Sample Ave" });
    expect(link).toHaveAttribute("href", "/lease-renewal/live/desk/lease/6103");
    expect(link.closest("li")).toHaveTextContent("Tenant: Lee Park");
  });

  it("BEH-S166-3 / AC-S166-1: a question with several matches shows the question and every match as its own link", async () => {
    render(
      <ConversationAnswerView
        answer={await answerFor("Which leases are related to Smith?")}
      />,
    );
    expect(screen.getByRole("heading", { name: "One more detail" })).toBeInTheDocument();
    expect(screen.getByText(/Which one do you mean\?/)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Matching leases you can open now" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/lease-renewal/live/desk/lease/6101",
      "/lease-renewal/live/desk/lease/6102",
    ]);
    expect(links.map((link) => link.textContent)).toEqual([
      "21 Sample Ave",
      "23 Sample Ave",
    ]);
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Tenant: Jordan Smith");
    expect(rows[1]).toHaveTextContent("Tenant: Jamie Smith");
  });

  it("keeps a clarification with nothing to list as the plain question", () => {
    render(
      <ConversationAnswerView
        answer={{
          version: "assistant-conversation/v1",
          kind: "clarification",
          summary: "Which period do you mean?",
          interpretation: [],
          groups: [],
          clarification: "Which period do you mean?",
          knowledgeQuestion: null,
          interpretedBy: "deterministic",
          conversation: { version: 1, actorKey: "a".repeat(64), turns: [] },
          contextReset: false,
          answeredAtIso: "2026-09-30T17:00:00.000Z",
          execution: null,
        }}
      />,
    );
    expect(screen.getByText("Which period do you mean?")).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
