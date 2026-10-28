import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  health: vi.fn(),
}));
vi.mock("@/lib/auth/session", async (original) => ({
  ...(await original<typeof import("@/lib/auth/session")>()),
  requireCapability: mocks.requireCapability,
}));
vi.mock("@/lib/gmail-hub/worker-health", () => ({
  readCommunicationWorkerHealth: mocks.health,
}));
import { GET } from "@/app/api/gmail-hub/communications/health/route";
import { AuthError } from "@/lib/auth/session";
import type { WorkflowCommunicationContext } from "@/lib/gmail-hub/workflow-context";

// S233 R-S233-5: the hub's worker-health read. Times and counts only.
const staff = {
  uid: "staff",
  email: "staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};
const HEALTH = {
  asOfMs: 1_793_000_000_000,
  lastRun: null,
  openRead: 0,
  complete: true,
  oldestPastDue: null,
  oldestObservation: null,
  neverChecked: 0,
};
const request = (query = "") =>
  new Request("https://app.test/api/gmail-hub/communications/health" + query);
const context = (lane: string) => ({ lane }) as unknown as WorkflowCommunicationContext;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireCapability.mockResolvedValue(staff);
  mocks.health.mockResolvedValue(HEALTH);
});

it("returns the health uncached, counting only communications in the reader's Spaces", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await response.json()).toEqual(HEALTH);
  expect(mocks.requireCapability).toHaveBeenCalledWith("read");
  const include = mocks.health.mock.calls[0]?.[0]?.include as (
    c: WorkflowCommunicationContext,
  ) => boolean;
  expect(include(context("renewals"))).toBe(true);
  expect(include(context("not-a-space"))).toBe(false);
});

it.each([
  {
    name: "signed out",
    setup: () => mocks.requireCapability.mockRejectedValue(new AuthError("Sign in", 401)),
    status: 401,
  },
  {
    name: "outside managed staff",
    setup: () =>
      mocks.requireCapability.mockResolvedValue({
        ...staff,
        email: "someone@example.com",
        hd: "example.com",
      }),
    status: 403,
  },
  {
    name: "an unexpected query",
    setup: () => undefined,
    query: "?cursor=next",
    status: 409,
  },
])("refuses $name before reading any record", async ({ setup, query, status }) => {
  setup();
  expect((await GET(request(query))).status).toBe(status);
  expect(mocks.health).not.toHaveBeenCalled();
});
