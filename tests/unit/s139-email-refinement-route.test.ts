import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// S139: the refinement route checks the same permission as the draft screen it serves, reads the
// record facts itself, returns only a proposal, and says so when the model is unavailable.

const mocks = vi.hoisted(() => ({
  requireCapabilityInSpace: vi.fn(),
  renewal: vi.fn(),
  ownerNotice: vi.fn(),
  resident: vi.fn(),
  refine: vi.fn(),
  config: {
    askDemoMode: false,
    modelProvider: "gemini",
    geminiAnswerModel: "gemini-3.1-flash-lite",
  },
  allowed: true,
}));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapabilityInSpace: mocks.requireCapabilityInSpace,
}));
vi.mock("@/lib/email-refinement/context", () => ({
  renewalRefinementContext: mocks.renewal,
  ownerNoticeRefinementContext: mocks.ownerNotice,
  residentReplyRefinementContext: mocks.resident,
}));
vi.mock("@/lib/email-refinement/refine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email-refinement/refine")>()),
  refineEmailDraft: mocks.refine,
}));
vi.mock("@/lib/config/server", () => ({ readServerConfig: () => mocks.config }));
vi.mock("@/lib/llm/model-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/model-provider")>()),
  createModelProvider: () => ({ generateText: vi.fn() }),
}));
vi.mock("@/lib/api/model-call-throttle", () => ({
  refinementModelRateLimiter: { check: () => ({ allowed: mocks.allowed }) },
}));

import { POST } from "@/app/api/email-refinement/route";
import { renewalRoleCapability } from "@/lib/lease-renewal/role-action-governance";

const actor = {
  uid: "uid-1",
  email: "staff@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Editor",
};

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/email-refinement", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mocks.requireCapabilityInSpace.mockResolvedValue(actor);
  mocks.renewal.mockResolvedValue({
    purpose: "renewal",
    facts: [{ label: "Current base rent", value: "$1,450.00" }],
    protectedPhrases: ["Pat Jones"],
    baseHash: "c".repeat(64),
  });
  mocks.ownerNotice.mockResolvedValue({
    purpose: "notice",
    facts: [],
    protectedPhrases: [],
  });
  mocks.refine.mockResolvedValue({
    status: "revised",
    body: "New wording.",
    requestedValues: [],
    removedValues: [],
  });
  mocks.config.askDemoMode = false;
  mocks.allowed = true;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("S139 email refinement route", () => {
  it("uses the renewal draft permission, reads the facts itself and binds the proposal", async () => {
    const response = await post({
      surface: "renewal_message",
      leaseId: "701",
      channel: "owner",
      currentBody: "Hello Pat Jones,",
      instruction: "Make it warmer",
    });
    expect(response.status).toBe(200);
    // The same capability the renewal draft screen itself requires to save or draft.
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith(
      renewalRoleCapability("draft_create"),
      "renewals",
    );
    expect(mocks.renewal).toHaveBeenCalledWith(actor, "701", "owner");
    expect(mocks.refine.mock.calls[0][0]).toMatchObject({
      surface: "renewal_message",
      currentBody: "Hello Pat Jones,",
      instruction: "Make it warmer",
      facts: [{ label: "Current base rent", value: "$1,450.00" }],
      protectedPhrases: ["Pat Jones"],
    });
    expect(await response.json()).toMatchObject({
      version: "email-refinement/v1",
      status: "revised",
      body: "New wording.",
      baseHash: "c".repeat(64),
    });
  });

  it("uses the maintenance edit permission for maintenance drafts", async () => {
    await post({
      surface: "maintenance_owner_notice",
      ticketRef: "t1",
      currentBody: "Hello,",
      instruction: "Shorter",
    });
    expect(mocks.requireCapabilityInSpace).toHaveBeenCalledWith("edit", "maintenance");
    expect(mocks.ownerNotice).toHaveBeenCalledWith(actor, "t1");
  });

  it("refuses a body that carries an identity, a role or unknown fields", async () => {
    const response = await post({
      surface: "renewal_message",
      leaseId: "701",
      channel: "owner",
      currentBody: "x",
      instruction: "y",
      actorUid: "someone-else",
    });
    expect(response.status).toBe(400);
    expect(mocks.refine).not.toHaveBeenCalled();
  });

  it("says the assistant is unavailable in local rehearsal and when throttled", async () => {
    mocks.config.askDemoMode = true;
    const demo = await post({
      surface: "maintenance_owner_notice",
      ticketRef: "t1",
      currentBody: "Hello,",
      instruction: "Shorter",
    });
    expect(await demo.json()).toMatchObject({ status: "unavailable" });
    expect(mocks.refine).not.toHaveBeenCalled();

    mocks.config.askDemoMode = false;
    mocks.allowed = false;
    const throttled = await post({
      surface: "maintenance_owner_notice",
      ticketRef: "t1",
      currentBody: "Hello,",
      instruction: "Shorter",
    });
    expect(throttled.status).toBe(429);
    expect((await throttled.json()).error).toMatch(/draft is unchanged/);
  });
});
