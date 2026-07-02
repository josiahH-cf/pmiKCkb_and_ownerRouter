import { afterEach, describe, expect, it, vi } from "vitest";

// Mock only the I/O-backed deps; the pure classifiers (buildConnectionView, computeSpaceCardState)
// run for real so the provider's real wiring is exercised. The needs-decision gather is I/O-backed
// and has its own wiring test (needs-decision-gather.test.ts), so it is mocked here. vi.hoisted lets
// the hoisted vi.mock factories reference these without a TDZ error.
const { gatherNeedsDecisionInbox, listProcessDefinitions, readConnectorPresence } =
  vi.hoisted(() => ({
    gatherNeedsDecisionInbox: vi.fn(),
    listProcessDefinitions: vi.fn(),
    readConnectorPresence: vi.fn(),
  }));

vi.mock("@/lib/approval/needs-decision-gather", () => ({ gatherNeedsDecisionInbox }));
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
  it("answers with the merged 'Needs your decision' inbox, value-free with deep links (B5)", async () => {
    gatherNeedsDecisionInbox.mockResolvedValue({
      rows: [
        {
          kind: "writeback",
          key: "writeback:run-1:current_rent",
          label: "Current rent",
          detail: "Run 1 · awaiting write-back approval",
          severity: "High",
          href: "/lease-renewal/runs/run-1",
        },
        {
          kind: "queue_item",
          key: "queue_item:q1",
          label: "Approve renewal package",
          detail: "Run 1",
          severity: "Medium",
          href: "/approval-queue#a",
        },
      ],
      counts: { total: 2, renewalFlags: 0, writebacksAwaiting: 1, queueItems: 1 },
    });

    const result = await resolveApprovalsState(editor as never);

    expect(result.query).toBe("approvals");
    expect(result.title).toBe("Needs your decision");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      label: "Current rent",
      detail: "Run 1 · awaiting write-back approval",
      href: "/lease-renewal/runs/run-1",
    });
    expect(result.summary).toBe("2 things waiting on you.");
  });

  it("says nothing waits only when the merged inbox is empty", async () => {
    gatherNeedsDecisionInbox.mockResolvedValue({
      rows: [],
      counts: { total: 0, renewalFlags: 0, writebacksAwaiting: 0, queueItems: 0 },
    });

    const result = await resolveApprovalsState(editor as never);

    expect(result.items).toEqual([]);
    expect(result.summary).toBe("Nothing needs your decision right now.");
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
