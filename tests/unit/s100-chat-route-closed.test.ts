import { beforeEach, describe, expect, it, vi } from "vitest";

// This file uses the REAL committed seed: both S100 keys (and the S99 read key that
// rerun_mapping repeats) are closed, so every provider-touching operation refuses at the exact
// committed-seed gate before any transport or Gmail client construction.

const mocks = vi.hoisted(() => ({
  user: { uid: "editor-1", email: "editor@pmikcmetro.com", role: "Editor" as string },
  transportCalls: 0,
  gmailConstructions: 0,
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

vi.mock("@/lib/gmail-hub/dependencies", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/gmail-hub/dependencies")>()),
  createDescriptorBoundGmailRuntimeClient: () => {
    mocks.gmailConstructions += 1;
    throw new Error("The closed-key gate must refuse before any Gmail construction.");
  },
}));

import { POST as chatPost } from "@/app/api/maintenance/work-order-chat/route";
import { POST as replyPost } from "@/app/api/maintenance/resident-reply-draft/route";

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/maintenance/work-order-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("S100 chat routes against the committed seed (all keys closed)", () => {
  beforeEach(() => {
    mocks.transportCalls = 0;
    mocks.gmailConstructions = 0;
    process.env.RENTVINE_API_BASE_URL = "https://pmikcmetro.rentvine.com/api/manager";
    process.env.RENTVINE_API_KEY = "unit-key";
    process.env.RENTVINE_API_SECRET = "unit-secret";
  });

  it("refuses sync preview and mapping rerun with the production gate and zero provider work", async () => {
    const { ACTION_REGISTRY_SEED } =
      await import("@/lib/integrations/action-registry-seed");
    // With a key closed the committed seed refuses; an executable key (bounded window or durable
    // activation) passes the seed term and the fail-closed suspension read refuses instead.
    const expected = (key: string) =>
      ACTION_REGISTRY_SEED.some(
        (entry) => entry.key === key && entry.production_allowed === true,
      )
        ? "action_runtime_suspended"
        : "action_not_production_allowed";
    for (const [body, key] of [
      [
        { operation: "preview_sync", ticketId: "ticket-9" },
        "rentvine.work_order.chat.sync",
      ],
      [{ operation: "rerun_mapping", messageId: 501 }, "rentvine.work_order.read"],
    ] as const) {
      const response = await chatPost(request(body as Record<string, unknown>));
      expect(response.status, JSON.stringify(body)).toBe(409);
      const payload = (await response.json()) as { error_type: string };
      expect(payload.error_type, JSON.stringify(body)).toBe(expected(key));
    }
    expect(mocks.transportCalls).toBe(0);
  });

  it("refuses the resident reply draft before any recipient resolution or Gmail construction", async () => {
    const response = await replyPost(
      request({ messageId: 501, subject: "Re: request", body: "Reply body." }),
    );
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error_type: string };
    expect(payload.error_type).toBe("action_not_production_allowed");
    expect(mocks.transportCalls).toBe(0);
    expect(mocks.gmailConstructions).toBe(0);
  });
});
