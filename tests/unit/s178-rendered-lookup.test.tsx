// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { TurnView, type DashboardTurn } from "@/components/ask/DashboardTurnView";
import {
  runAssistantConversation,
  conversationActorKey,
} from "@/lib/assistant/conversation";
import { projectRenewalRead } from "@/lib/operational-context/projections";
import {
  deskRow,
  fakeOperationalContext,
  TEST_NOW,
} from "@/tests/helpers/operational-context-fake";
afterEach(cleanup);
it("S178 binds a literal identity through current source facts to every real rendered lease link", async () => {
  const current = deskRow({
    id: "7001",
    tenants: ["Casey Sample"],
    address: "7001 Test Street",
  });
  const previous = deskRow({
    id: "7002",
    tenants: ["Casey Sample"],
    address: "7002 Former Street",
    endDateIso: "2024-10-31",
  });
  current.sourceDestinations = {
    rentvine: {
      kind: "external",
      href: "https://fixture.rentvine.com/leases/7001",
      label: "Verified source",
    },
  };
  const context = fakeOperationalContext({
    reads: {
      renewals: projectRenewalRead({
        status: "ok",
        rows: [current, previous],
        readComplete: true,
      }),
    },
  });
  const assistant = await runAssistantConversation(
    { question: "Casey Sample" },
    {
      nowIso: TEST_NOW,
      actorKey: conversationActorKey(context.actorUid),
      context,
      interpret: null,
    },
  );
  const turn: DashboardTurn = {
    id: "fixture-turn",
    question: "Casey Sample",
    contextBefore: null,
    state: "answered",
    assistant,
    assistantUnavailable: false,
    knowledge: null,
    knowledgeError: null,
    error: null,
    answeredAtIso: TEST_NOW,
    restored: false,
    accessChanged: false,
    saveState: "none",
    rerunOf: null,
    askedAgain: false,
    questionSave: "none",
  };
  render(
    <TurnView
      turn={turn}
      index={0}
      onRetry={() => {}}
      onRetrySave={() => {}}
      registerRef={() => {}}
    />,
  );
  for (const record of assistant.groups[0].items)
    expect(screen.getByRole("link", { name: record.title })).toHaveAttribute(
      "href",
      record.href,
    );
  const shortcut = screen.getByRole("link", {
    name: /Open .*7001 Test Street.*in RentVine/,
  });
  expect(shortcut).toHaveAttribute(
    "href",
    "/lease-renewal/live/desk/lease/7001/rentvine",
  );
  expect(shortcut).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getAllByRole("link", { name: /in RentVine/ })).toHaveLength(1);
});
