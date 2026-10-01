// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Dashboard front door (rendered at both `/` and `/ask`). S146/S147: the AI workspace leads,
// the five operational panels are gone, and the compact attention queue streams into its own
// boundary. The Firestore-backed reads are mocked so the server component renders without
// firebase-admin; the approval list read is the one the queue gathers.
const listApprovalQueue = vi.fn();
const loadRenewalRunViews = vi.fn();
const listProcessDefinitions = vi.fn();

vi.mock("@/lib/firestore/approval-queue", () => ({
  listApprovalQueue: (...args: unknown[]) => listApprovalQueue(...args),
}));
vi.mock("@/lib/lease-renewal/renewal-review-board", () => ({
  loadRenewalRunViews: (...args: unknown[]) => loadRenewalRunViews(...args),
}));
vi.mock("@/lib/firestore/workflows", () => ({
  listProcessDefinitions: (...args: unknown[]) => listProcessDefinitions(...args),
}));
vi.mock("@/lib/firestore/assistant-saved-questions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firestore/assistant-saved-questions")>()),
  listSavedQuestions: vi.fn(async () => ({ items: [], truncated: false })),
}));
vi.mock("@/lib/firestore/assistant-history-read", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/firestore/assistant-history-read")>()),
  listAssistantConversations: vi.fn(async () => ({
    conversations: [],
    nextCursor: null,
  })),
}));
vi.mock("@/lib/lease-renewal/live-desk", () => ({
  loadLiveRenewalDesk: vi.fn(async () => {
    throw new Error("The Dashboard must not read the live renewal desk.");
  }),
}));

import { ConsoleView } from "@/components/console/ConsoleView";

const readyItem = {
  id: "q1",
  status: "Ready for Approval",
  risk: "Low",
  assignee_uid: "someone-else",
  required_approver_uid: "u-admin",
  action_needed: "Approve renewal package",
  process_run_ref: { label: "Run 1" },
  direct_link: "/approval-queue?item_id=q1",
};

beforeEach(() => {
  listApprovalQueue.mockResolvedValue([readyItem]);
  loadRenewalRunViews.mockResolvedValue([]);
  listProcessDefinitions.mockResolvedValue([
    { id: "lease-renewal", name: "Lease Renewal", status: "Draft" },
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const adminUser = { uid: "u-admin", role: "Admin", email: "admin@pmikcmetro.com" };
const maintenanceUser = {
  uid: "u-maintenance",
  role: "Editor",
  email: "maintenance@pmikcmetro.com",
  scopes: ["maintenance"],
} as const;

// React 19 needs an awaited act scope to retry a boundary that suspended on the queue read.
async function renderView(user: object) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(await ConsoleView({ user: user as never }));
  });
  return result!;
}

describe("ConsoleView (S146/S147 AI-first Dashboard)", () => {
  it("leads with the Dashboard heading and the question box as the first primary element", async () => {
    await renderView(adminUser);

    expect(
      screen.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeInTheDocument();
    const question = screen.getByLabelText(/Question/);
    const queue = await screen.findByRole("region", { name: "Waiting on you" });
    expect(
      question.compareDocumentPosition(queue) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    // SEU-2 (§A.1): the explanatory intro paragraph is gone; the surface is self-descriptive.
    expect(screen.queryByText(/never touches a system of record/)).toBeNull();
  });

  it("ARCH-S146-1: renders the question box while the attention read is still pending", async () => {
    listApprovalQueue.mockImplementation(() => new Promise(() => undefined));
    loadRenewalRunViews.mockImplementation(() => new Promise(() => undefined));

    await renderView(adminUser);

    expect(screen.getByLabelText(/Question/)).toBeEnabled();
    expect(screen.getByRole("button", { name: "Get answer" })).toBeEnabled();
    const loading = screen.getByRole("region", { name: "Waiting on you" });
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(within(loading).getByText(/Checking what is waiting on you/)).toBeVisible();
  });

  it("AC-S147-4: a failed attention read shows no count and never blocks asking", async () => {
    listApprovalQueue.mockRejectedValue(new Error("firestore down"));
    loadRenewalRunViews.mockRejectedValue(new Error("firestore down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await renderView(adminUser);

    const queue = await screen.findByText(/could not be loaded just now/);
    expect(queue).toBeVisible();
    expect(screen.queryByTestId("attention-count")).toBeNull();
    expect(screen.queryByText(/Nothing is waiting on you/)).toBeNull();
    expect(screen.getByLabelText(/Question/)).toBeEnabled();
  });

  it("AC-S147-1: the five operational panels are absent, not collapsed", async () => {
    const { container } = await renderView(adminUser);
    await screen.findByRole("region", { name: "Waiting on you" });

    for (const name of [
      "Needs your decision",
      "Connections to set up",
      "Process setup",
      "Anticipated work",
      "Processes",
      "Live operations",
    ]) {
      expect(screen.queryByRole("heading", { name })).toBeNull();
    }
    expect(screen.queryByTestId("console-live-data-badge")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByRole("group", { name: "What needs your attention" })).toBeNull();
  });

  it("AC-S146-2: no process picker, and the Dashboard reads no process definitions", async () => {
    await renderView(adminUser);
    await screen.findByRole("region", { name: "Waiting on you" });

    expect(screen.queryByLabelText("Process")).toBeNull();
    expect(listProcessDefinitions).not.toHaveBeenCalled();
  });

  it("AC-S147-3: the queue lists the eligible item once with its link and inline Approve", async () => {
    await renderView(adminUser);

    expect(
      await screen.findByRole("link", { name: "Approve renewal package" }),
    ).toHaveAttribute("href", "/approval-queue?item_id=q1");
    expect(screen.getAllByRole("link", { name: "Approve renewal package" })).toHaveLength(
      1,
    );
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByTestId("attention-count")).toHaveTextContent("1");
    // HARD STOP: no control ever executes an external action from the Dashboard.
    expect(screen.queryByRole("button", { name: /send|execute|write/i })).toBeNull();
  });

  it("covers a maintenance-only user's own approval items instead of a fabricated zero", async () => {
    listApprovalQueue.mockResolvedValue([
      { ...readyItem, required_approver_uid: "someone", assignee_uid: "u-maintenance" },
    ]);
    await renderView(maintenanceUser);

    expect(
      await screen.findByRole("link", { name: "Approve renewal package" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Waiting on an approver/)).toBeInTheDocument();
    expect(loadRenewalRunViews).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open the full list" })).toHaveAttribute(
      "href",
      "/notifications",
    );
  });
});
