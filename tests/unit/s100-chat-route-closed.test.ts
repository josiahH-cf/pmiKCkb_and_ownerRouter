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
    for (const body of [
      { operation: "preview_sync", ticketId: "ticket-9" },
      { operation: "rerun_mapping", messageId: 501 },
    ]) {
      const response = await chatPost(request(body));
      expect(response.status, JSON.stringify(body)).toBe(409);
      const payload = (await response.json()) as { error_type: string };
      expect(payload.error_type).toBe("action_not_production_allowed");
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
