import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeMock,
  createServiceMock,
  getThreadMock,
  providerMock,
  generateTextMock,
} = vi.hoisted(() => ({
  authorizeMock: vi.fn(async () => ({
    uid: "editor-1",
    email: "editor@pmikcmetro.com",
    hd: "pmikcmetro.com",
    role: "Editor",
  })),
  createServiceMock: vi.fn(),
  getThreadMock: vi.fn(),
  providerMock: vi.fn(),
  generateTextMock: vi.fn(),
}));

vi.mock("@/lib/gmail-hub/workflow-authorization", () => ({
  requireWorkflowCommunicationContext: authorizeMock,
}));
vi.mock("@/lib/gmail-hub/dependencies", () => ({
  createGmailHubService: createServiceMock,
}));
vi.mock("@/lib/llm/model-provider", () => ({
  AnswerGenerationSetupError: class AnswerGenerationSetupError extends Error {},
  createModelProvider: providerMock,
}));

import { POST } from "@/app/api/gmail-hub/workflow-reply/route";

const context = {
  lane: "maintenance",
  entityType: "maintenance_ticket",
  entityId: "ticket-1",
  purpose: "maintenance_owner",
  actionKey: "gmail.mailbox.read",
  sourceRefs: ["maintenance-ticket:ticket-1"],
};

function request(category: string) {
  return new Request("https://example.test/api/gmail-hub/workflow-reply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      artifactRef: "maintenance-owner:v1.0",
      category,
      context,
      currentText: "Thank you.",
      threadId: "thread-1",
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  const thread = {
    id: "thread-1",
    messages: [
      {
        id: "message-1",
        from: "synthetic@example.com",
        date: "2026-07-14T00:00:00Z",
        subject: "Visit date",
        bodyText: "The approved visit date is 2026-08-01.",
      },
    ],
  };
  getThreadMock.mockResolvedValue(thread);
  createServiceMock.mockReturnValue({ getThread: getThreadMock });
  generateTextMock.mockResolvedValue({
    text: JSON.stringify({ draft: "Thank you. The approved visit date is 2026-08-01." }),
  });
  providerMock.mockReturnValue({ generateText: generateTextMock });
});

describe("workflow AI reply route", () => {
  it("refuses an excluded category before authorization, Gmail, or model construction", async () => {
    const response = await POST(request("legal_notices"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      persisted: false,
      usedModel: false,
    });
    expect(authorizeMock).not.toHaveBeenCalled();
    expect(createServiceMock).not.toHaveBeenCalled();
    expect(providerMock).not.toHaveBeenCalled();
  });

  it("checks authorized thread content before model construction", async () => {
    getThreadMock.mockResolvedValueOnce({
      id: "thread-1",
      messages: [
        {
          id: "message-1",
          from: "synthetic@example.com",
          date: "2026-07-14T00:00:00Z",
          subject: "Owner money payout",
          bodyText: "Please approve the owner funds payout.",
        },
      ],
    });
    const response = await POST(request("general_question"));
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      persisted: false,
      usedModel: false,
    });
    expect(getThreadMock).toHaveBeenCalledTimes(1);
    expect(providerMock).not.toHaveBeenCalled();
  });

  it("returns a transient proposal with sources and no store/mutation call", async () => {
    const response = await POST(request("scheduling"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      reviewState: "Needs Review",
      applied: false,
      persisted: false,
      policyRef: "workflow-reply:v1.0",
      sources: [{ ref: "gmail-message:message-1" }],
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(createServiceMock).toHaveBeenCalledTimes(1);
  });
});
