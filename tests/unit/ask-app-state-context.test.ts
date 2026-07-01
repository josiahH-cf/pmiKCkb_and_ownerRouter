import { afterEach, describe, expect, it, vi } from "vitest";

// Mock only the I/O-backed deps; the pure classifiers (canViewApprovalQueueItem, buildConnectionView,
// computeSpaceCardState) run for real so the provider's real wiring is exercised. vi.hoisted lets the
// hoisted vi.mock factories reference these without a TDZ error.
const { listApprovalQueue, listProcessDefinitions, readConnectorPresence } = vi.hoisted(
  () => ({
    listApprovalQueue: vi.fn(),
    listProcessDefinitions: vi.fn(),
    readConnectorPresence: vi.fn(),
  }),
);

vi.mock("@/lib/firestore/approval-queue", () => ({ listApprovalQueue }));
vi.mock("@/lib/firestore/workflows", () => ({ listProcessDefinitions }));
vi.mock("@/lib/connections/connector-presence", () => ({ readConnectorPresence }));

import {
  resolveApprovalsState,
  resolveConnectionsState,
  resolveCoverageState,
} from "@/lib/ask/app-state-context";

const editor = {
  uid: "u1",
  email: "u1@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
} as const;

afterEach(() => {
  vi.clearAllMocks();
});

describe("resolveApprovalsState", () => {
  it("returns only queue items the user may see, with deep links", async () => {
    listApprovalQueue.mockResolvedValue([
      {
        action_needed: "Approve renewal package",
        risk: "Medium",
        direct_link: "/approval-queue#a",
        assignee_uid: "u1",
        required_approver_uid: "someone-else",
      },
      {
        action_needed: "Not yours",
        risk: "Low",
        direct_link: "/approval-queue#b",
        assignee_uid: "u2",
        required_approver_uid: "u3",
      },
    ]);

    const result = await resolveApprovalsState(editor as never);

    expect(result.query).toBe("approvals");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      label: "Approve renewal package",
      href: "/approval-queue#a",
    });
    expect(result.summary).toContain("1 item");
  });

  it("is non-fatal when the queue read throws", async () => {
    listApprovalQueue.mockRejectedValue(new Error("firestore down"));

    const result = await resolveApprovalsState(editor as never);

    expect(result.items).toEqual([]);
    expect(result.summary).toMatch(/Nothing is waiting/);
  });
});

describe("resolveConnectionsState", () => {
  it("flags unconfigured + partial connectors, never a fully-configured one", () => {
    // RentVine fully configured (excluded); the renewal sheet + Drive missing (included); the no-config
    // OAuth connectors report as not-connected (included).
    readConnectorPresence.mockReturnValue({
      RENTVINE_API_BASE_URL: true,
      RENTVINE_API_KEY: true,
      RENTVINE_API_SECRET: true,
      RENEWAL_SHEET_ID: false,
      SPACE_DRIVE_FOLDER_IDS: false,
    });

    const result = resolveConnectionsState();
    const labels = result.items.map((item) => item.label);

    expect(labels).not.toContain("RentVine");
    expect(labels).toContain("Google Sheets");
    expect(result.items.every((item) => item.href === "/connections")).toBe(true);
  });
});

describe("resolveCoverageState", () => {
  it("lists non-reference Spaces missing a process/connections and never the read-only Space", async () => {
    listProcessDefinitions.mockResolvedValue([]); // nothing seeded → mapped Spaces need a process
    readConnectorPresence.mockReturnValue({}); // no connectors present

    const result = await resolveCoverageState(editor as never);
    const labels = result.items.map((item) => item.label);

    expect(labels).not.toContain("Owner Email"); // read-only reference Space is never a gap
    expect(labels).toContain("Move-In"); // unmapped scaffold → needs a process
    expect(result.items.every((item) => typeof item.href === "string")).toBe(true);
  });
});
