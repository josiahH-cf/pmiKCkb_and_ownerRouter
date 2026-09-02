import { beforeEach, describe, expect, it, vi } from "vitest";

// This file uses the REAL committed seed: all three S99 keys are closed, so every provider
// operation refuses at the exact committed-seed gate before any transport construction.

const mocks = vi.hoisted(() => ({
  user: { uid: "admin-1", email: "admin@pmikcmetro.com", role: "Admin" as string },
  transportCalls: 0,
}));

vi.mock("@/lib/auth/session", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: vi.fn(async () => mocks.user),
}));

vi.mock("@/lib/environment/descriptor", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/environment/descriptor")>()),
  requireEnvironmentDescriptor: () => ({
    environmentKind: "production",
    dataContext: "live",
    source: "explicit",
  }),
}));

vi.mock("@/lib/integrations/rentvine/client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/integrations/rentvine/client")>()),
  createFetchTransport: () => ({
    async send() {
      mocks.transportCalls += 1;
      throw new Error("The closed-key gate must refuse before any transport call.");
    },
  }),
}));

vi.mock("@/lib/integrations/rentvine/write-client", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/integrations/rentvine/write-client")>()),
  createRentVineWriteFetchTransport: () => ({
    async send() {
      mocks.transportCalls += 1;
      throw new Error("The closed-key gate must refuse before any transport call.");
    },
  }),
}));

import { POST } from "@/app/api/maintenance/rentvine-work-orders/route";

function post(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/maintenance/rentvine-work-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("S99 work-order route against the committed seed (all keys closed)", () => {
  beforeEach(() => {
    mocks.transportCalls = 0;
    process.env.RENTVINE_API_BASE_URL = "https://pmikcmetro.rentvine.com/api/manager";
    process.env.RENTVINE_API_KEY = "unit-key";
    process.env.RENTVINE_API_SECRET = "unit-secret";
  });

  it("refuses reads and proposals with the production gate and zero transport calls", async () => {
    for (const body of [
      { operation: "read", ticketId: "ticket-9" },
      { operation: "read", workOrderId: "9005" },
      {
        operation: "propose_create",
        ticketId: "ticket-9",
        priorityId: "2",
        workOrderStatusId: "9101",
        isVacant: false,
      },
      { operation: "propose_status", workOrderId: "9005", targetStatusId: "9102" },
    ]) {
      const response = await post(body);
      expect(response.status, JSON.stringify(body)).toBe(409);
      const payload = (await response.json()) as { error_type: string };
      expect(payload.error_type).toBe("action_not_production_allowed");
    }
    expect(mocks.transportCalls).toBe(0);
  });
});
