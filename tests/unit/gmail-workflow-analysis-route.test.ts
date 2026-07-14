import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authorizeMock,
  createServiceMock,
  getThreadMock,
  providerMock,
  generateTextMock,
} = vi.hoisted(() => {
  const generateTextMock = vi.fn(async () => ({
    text: JSON.stringify({
      summary: "Synthetic summary",
      waiting_on: "Human review",
      suggested_next_action: "Review the linked message",
    }),
  }));
  return {
    authorizeMock: vi.fn(async () => ({
      uid: "approver-1",
      email: "approver@pmikcmetro.com",
      hd: "pmikcmetro.com",
      role: "Approver",
    })),
    getThreadMock: vi.fn(async () => ({
      id: "thread-1",
      truncated: false,
      messages: [
        {
          id: "message-1",
          threadId: "thread-1",
          labelIds: ["INBOX"],
          from: "synthetic@example.com",
          to: ["approver@pmikcmetro.com"],
          cc: [],
          bcc: [],
          subject: "Scheduling question",
          date: "2026-07-14T00:00:00Z",
          references: [],
          bodyText: "Can we schedule a visit?",
          bodyTruncated: false,
          attachments: [],
        },
      ],
    })),
    createServiceMock: vi.fn(),
    generateTextMock,
    providerMock: vi.fn(() => ({ generateText: generateTextMock })),
  };
});

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

import { POST } from "@/app/api/gmail-hub/workflow-analysis/route";

const context = {
  lane: "maintenance",
  entityType: "maintenance_ticket",
  entityId: "ticket-1",
  purpose: "maintenance_owner",
  actionKey: "gmail.mailbox.read",
  sourceRefs: ["maintenance_ticket:ticket-1"],
};

function request(category: string) {
  return new Request("https://example.test/api/gmail-hub/workflow-analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ context, threadId: "thread-1", category }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  createServiceMock.mockReturnValue({ getThread: getThreadMock });
  getThreadMock.mockResolvedValue({
    id: "thread-1",
    truncated: false,
    messages: [
      {
        id: "message-1",
        threadId: "thread-1",
        labelIds: ["INBOX"],
        from: "synthetic@example.com",
        to: ["approver@pmikcmetro.com"],
        cc: [],
        bcc: [],
        subject: "Scheduling question",
        date: "2026-07-14T00:00:00Z",
        references: [],
        bodyText: "Can we schedule a visit?",
        bodyTruncated: false,
        attachments: [],
      },
    ],
  });
});

describe("workflow-linked Gmail analysis (AC-GW-7, AC-GW-11)", () => {
  it("refuses unknown and excluded aliases before Gmail and model construction", async () => {
    for (const category of ["owner monies", "legal-notices", "unknown thing"]) {
      const response = await POST(request(category));
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        review_state: "Needs Review",
        usedModel: false,
        refusedBeforeModel: true,
      });
    }
    expect(createServiceMock).not.toHaveBeenCalled();
    expect(providerMock).not.toHaveBeenCalled();
  });

  it("checks live linked content for exclusions before constructing the model", async () => {
    getThreadMock.mockResolvedValueOnce({
      ...(await getThreadMock()),
      messages: [
        {
          ...(await getThreadMock()).messages[0],
          subject: "Owner payout question",
          bodyText: "Please approve the owner funds payout.",
        },
      ],
    });
    const response = await POST(request("general_question"));
    await expect(response.json()).resolves.toMatchObject({
      refusedBeforeModel: true,
      usedModel: false,
    });
    expect(createServiceMock).toHaveBeenCalledTimes(1);
    expect(providerMock).not.toHaveBeenCalled();
  });

  it("returns only an unpersisted Needs Review proposal with Gmail provenance", async () => {
    const response = await POST(request("scheduling"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      review_state: "Needs Review",
      applied: false,
      persisted: false,
      usedModel: true,
      proposal: { summary: "Synthetic summary" },
      provenance: {
        source: "Gmail",
        threadId: "thread-1",
        messageIds: ["message-1"],
        workflowEntityId: "ticket-1",
      },
    });
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });
});
