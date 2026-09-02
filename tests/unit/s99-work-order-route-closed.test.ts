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

// The production-bound suspension reader would hang without Firestore in the unit env; an
// immediate throw exercises the same fail-closed unreadable path deterministically.
vi.mock("@/lib/firestore/runtime-action-suspensions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/firestore/runtime-action-suspensions")>()),
  readRuntimeActionSuspension: vi.fn(async () => {
    throw new Error("suspension store unreadable in unit env");
  }),
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
    const { ACTION_REGISTRY_SEED } =
      await import("@/lib/integrations/action-registry-seed");
    // With a key closed the committed seed refuses; inside its bounded proof window the seed
    // term passes and the fail-closed runtime-suspension read (unreadable in unit env) refuses
    // instead. Every path stays a pre-transport refusal either way.
    const expected = (key: string) =>
      ACTION_REGISTRY_SEED.some(
        (entry) => entry.key === key && entry.production_allowed === true,
      )
        ? "action_runtime_suspended"
        : "action_not_production_allowed";
    for (const [body, key] of [
      [{ operation: "read", ticketId: "ticket-9" }, "rentvine.work_order.read"],
      [{ operation: "read", workOrderId: "9005" }, "rentvine.work_order.read"],
      // Both proposals repeat the read gate first for their fresh catalog/detail reads.
      [
        {
          operation: "propose_create",
          ticketId: "ticket-9",
          priorityId: "2",
          workOrderStatusId: "9101",
          isVacant: false,
        },
        "rentvine.work_order.read",
      ],
      [
        { operation: "propose_status", workOrderId: "9005", targetStatusId: "9102" },
        "rentvine.work_order.read",
      ],
    ] as const) {
      const response = await post(body as Record<string, unknown>);
      expect(response.status, JSON.stringify(body)).toBe(409);
      const payload = (await response.json()) as { error_type: string };
      expect(payload.error_type, JSON.stringify(body)).toBe(expected(key));
    }
    expect(mocks.transportCalls).toBe(0);
  });
});
