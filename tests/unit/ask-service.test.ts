import { describe, expect, it } from "vitest";
import { DRAFT_BANNER } from "@/lib/constants";
import { answerQuestion } from "@/lib/ask/service";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { AskLogWriter } from "@/lib/firestore/ask-logs";
import {
  GeminiAnswerGenerationError,
  type AnswerGenerator,
  type GeneratedAnswer,
} from "@/lib/llm/answer";
import type {
  GroundedSearchResult,
  RetrievalClient,
} from "@/lib/retrieval/vertex-search";
import { RetrievalSetupError } from "@/lib/retrieval/vertex-search";
import type { AskRequest } from "@/lib/schemas";
import type { ServerConfig } from "@/lib/config/server";

const user: AuthenticatedUser = {
  email: "admin@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "admin",
};

const request: AskRequest = {
  audience: "Owner",
  channel: "Gmail",
  draft_enabled: true,
  question: "What is the renewal process?",
  urgency: "Normal",
};

const liveConfig: ServerConfig = {
  allowedHostedDomain: "pmikcmetro.com",
  askDemoMode: false,
  authSessionCookie: "__session",
  firebaseBrowserConfig: {
    apiKey: undefined,
    appId: undefined,
    authDomain: undefined,
    projectId: undefined,
  },
  firebaseProjectId: "pmikckb-test",
  firestoreDatabaseId: "(default)",
  gcpProjectId: "pmikckb-test",
  geminiAnswerModel: "gemini-2.5-pro",
  geminiClassifyModel: "gemini-2.5-flash",
  groundingConfidenceThreshold: 0.65,
  kbApprovalLabel: "KB Approval",
  kbApprovalSender: undefined,
  localDemoAuth: false,
  spaceDriveFolderIds: {
    "lease-renewals": "folder-1",
  },
  spaceVertexDataStoreIds: {
    "lease-renewals": "data-store-1",
  },
  vertexAiLocation: "us-central1",
  vertexSearchLocation: "us",
};

describe("Ask service", () => {
  it("returns a cited demo answer for Lease Renewals", async () => {
    await expect(
      answerQuestion(user, {
        audience: "Owner",
        channel: "Gmail",
        draft_enabled: true,
        question: "What is the lease renewal workflow?",
        urgency: "Normal",
      }),
    ).resolves.toMatchObject({
      source_state: "Verified Source",
      citations: [expect.objectContaining({ source_id: "demo-lease-renewals-sop" })],
    });
  });

  it("keeps unsupported demo questions in no-source state", async () => {
    await expect(
      answerQuestion(user, {
        audience: "Owner",
        channel: "Gmail",
        draft_enabled: true,
        question: "What exact fee do we charge for an unusual lease break?",
        urgency: "Normal",
      }),
    ).resolves.toMatchObject({
      source_state: "No Reliable Source Found",
      citations: [],
    });
  });

  it("does not call live retrieval while demo mode is active", async () => {
    const retrievalClient: RetrievalClient = {
      async search() {
        throw new Error("retrieval should not be called");
      },
    };

    await expect(
      answerQuestion(
        user,
        {
          audience: "Owner",
          channel: "Gmail",
          draft_enabled: true,
          question: "What is the lease renewal workflow?",
          urgency: "Normal",
        },
        {
          config: { ...liveConfig, askDemoMode: true },
          retrievalClient,
        },
      ),
    ).resolves.toMatchObject({
      source_state: "Verified Source",
    });
  });

  it("returns no-source when live retrieval finds no usable sources", async () => {
    await expect(
      answerQuestion(user, request, {
        askLogWriter: noopAskLogWriter,
        config: liveConfig,
        retrievalClient: retrievalClient(emptyGrounding()),
      }),
    ).resolves.toMatchObject({
      source_state: "No Reliable Source Found",
      citations: [],
    });
  });

  it("uses Gemini output for usable live sources and logs the final response", async () => {
    const askLogWriter = new MemoryAskLogWriter();

    const response = await answerQuestion(user, request, {
      answerGenerator: answerGenerator({
        citations: [
          {
            source_id: "drive-file-1",
            title: "Model title is ignored",
            url: "https://example.com/rewritten",
          },
        ],
        draft: "Use the approved renewal language.",
        source_state: "Verified Source",
      }),
      askLogWriter,
      config: liveConfig,
      retrievalClient: retrievalClient(grounding(["drive-file-1", "drive-file-2"])),
    });

    expect(response).toMatchObject({
      answer: "Generated grounded answer.",
      citations: [
        {
          source_id: "drive-file-1",
          title: "Source drive-file-1",
          url: "https://drive.google.com/file/d/drive-file-1/view",
        },
      ],
      source_state: "Verified Source",
    });
    expect(response.draft.startsWith(DRAFT_BANNER)).toBe(true);
    expect(askLogWriter.records).toHaveLength(1);
    expect(askLogWriter.records[0]).toMatchObject({
      groundingSourceIds: ["drive-file-1", "drive-file-2"],
      response: {
        source_state: "Verified Source",
      },
    });
  });

  it("keeps retrieval-stage partial state even when Gemini tries to upgrade it", async () => {
    const response = await answerQuestion(user, request, {
      answerGenerator: answerGenerator({
        citations: [
          {
            source_id: "drive-file-1",
            title: "Lease Renewals Notes",
            url: "https://drive.google.com/file/d/drive-file-1/view",
          },
        ],
        source_state: "Verified Source",
      }),
      askLogWriter: noopAskLogWriter,
      config: liveConfig,
      retrievalClient: retrievalClient(
        grounding(["drive-file-1"], {
          approvalStatus: "Unreviewed",
        }),
      ),
    });

    expect(response).toMatchObject({
      citations: [expect.objectContaining({ source_id: "drive-file-1" })],
      source_state: "Partial Source",
    });
  });

  it("keeps draft banner text out of answer and normalizes verbose escalation owners", async () => {
    const response = await answerQuestion(user, request, {
      answerGenerator: answerGenerator({
        answer: `${DRAFT_BANNER}\n\nContact the owner before tenant-facing renewal commitments.`,
        citations: [
          {
            source_id: "drive-file-1",
            title: "Lease Renewals Notes",
            url: "https://drive.google.com/file/d/drive-file-1/view",
          },
        ],
        escalation_owner:
          "Needs Verification: exact timing should be reviewed by the process owner.",
        source_state: "Verified Source",
      }),
      askLogWriter: noopAskLogWriter,
      config: liveConfig,
      retrievalClient: retrievalClient(
        grounding(["drive-file-1"], {
          approvalStatus: "Unreviewed",
        }),
      ),
    });

    expect(response).toMatchObject({
      answer: "Contact the owner before tenant-facing renewal commitments.",
      escalation_owner: "Process owner",
      source_state: "Partial Source",
    });
    expect(response.draft.startsWith(DRAFT_BANNER)).toBe(true);
  });

  it("does not surface invented escalation-owner labels from Gemini", async () => {
    const response = await answerQuestion(user, request, {
      answerGenerator: answerGenerator({
        citations: [
          {
            source_id: "drive-file-1",
            title: "Lease Renewals Notes",
            url: "https://drive.google.com/file/d/drive-file-1/view",
          },
        ],
        escalation_owner: "Renewal Process Expert",
        source_state: "Verified Source",
      }),
      askLogWriter: noopAskLogWriter,
      config: liveConfig,
      retrievalClient: retrievalClient(
        grounding(["drive-file-1"], {
          approvalStatus: "Unreviewed",
        }),
      ),
    });

    expect(response).toMatchObject({
      escalation_owner: "Process owner",
      source_state: "Partial Source",
    });
  });

  it("downgrades to no-source when Gemini cites no grounded source", async () => {
    await expect(
      answerQuestion(user, request, {
        answerGenerator: answerGenerator({
          citations: [
            {
              source_id: "not-grounded",
              title: "Not Grounded",
              url: "https://example.com/not-grounded",
            },
          ],
          source_state: "Verified Source",
        }),
        askLogWriter: noopAskLogWriter,
        config: liveConfig,
        retrievalClient: retrievalClient(grounding(["drive-file-1", "drive-file-2"])),
      }),
    ).resolves.toMatchObject({
      citations: [],
      source_state: "No Reliable Source Found",
    });
  });

  it("falls back to no-source when Gemini cannot return valid JSON", async () => {
    const failingAnswerGenerator: AnswerGenerator = {
      async generateAnswer() {
        throw new GeminiAnswerGenerationError("Gemini returned invalid answer JSON.");
      },
    };

    await expect(
      answerQuestion(user, request, {
        answerGenerator: failingAnswerGenerator,
        askLogWriter: noopAskLogWriter,
        config: liveConfig,
        retrievalClient: retrievalClient(grounding(["drive-file-1", "drive-file-2"])),
      }),
    ).resolves.toMatchObject({
      citations: [],
      source_state: "No Reliable Source Found",
    });
  });

  it("returns review-only responses for placeholders and conflicts without Gemini", async () => {
    const throwingAnswerGenerator: AnswerGenerator = {
      async generateAnswer() {
        throw new Error("Gemini should not be called");
      },
    };

    await expect(
      answerQuestion(user, request, {
        answerGenerator: throwingAnswerGenerator,
        askLogWriter: noopAskLogWriter,
        config: liveConfig,
        retrievalClient: retrievalClient(
          grounding(["drive-file-1"], { hasOpenPlaceholder: true }),
        ),
      }),
    ).resolves.toMatchObject({
      draft: "",
      source_state: "Bailey Placeholder",
    });

    await expect(
      answerQuestion(user, request, {
        answerGenerator: throwingAnswerGenerator,
        askLogWriter: noopAskLogWriter,
        config: liveConfig,
        retrievalClient: retrievalClient(
          grounding(["drive-file-1", "drive-file-2"], { hasConflict: true }),
        ),
      }),
    ).resolves.toMatchObject({
      draft: "",
      source_state: "Conflict Found",
    });
  });

  it("surfaces retrieval setup errors from live mode", async () => {
    const retrievalClient: RetrievalClient = {
      async search() {
        throw new RetrievalSetupError("Missing Agent Search data store ID.");
      },
    };

    await expect(
      answerQuestion(user, request, {
        askLogWriter: noopAskLogWriter,
        config: liveConfig,
        retrievalClient,
      }),
    ).rejects.toBeInstanceOf(RetrievalSetupError);
  });
});

const noopAskLogWriter: AskLogWriter = {
  async write() {},
};

class MemoryAskLogWriter implements AskLogWriter {
  readonly records: Parameters<AskLogWriter["write"]>[0][] = [];

  async write(input: Parameters<AskLogWriter["write"]>[0]) {
    this.records.push(input);
  }
}

function answerGenerator(overrides: Partial<GeneratedAnswer> = {}): AnswerGenerator {
  return {
    async generateAnswer() {
      return {
        answer: "Generated grounded answer.",
        citations: [
          {
            source_id: "drive-file-1",
            title: "Lease Renewals SOP",
            url: "https://drive.google.com/file/d/drive-file-1/view",
          },
        ],
        draft: `${DRAFT_BANNER}\n\nUse the approved renewal language.`,
        escalation_owner: undefined,
        handling_steps: ["Use only cited renewal sources."],
        source_state: "Verified Source",
        ...overrides,
      };
    },
  };
}

function retrievalClient(result: GroundedSearchResult): RetrievalClient {
  return {
    async search() {
      return result;
    },
  };
}

function emptyGrounding(): GroundedSearchResult {
  return {
    citations: [],
    confidence: 0,
    sourceIds: [],
    sources: [],
  };
}

function grounding(
  sourceIds: string[],
  options: {
    approvalStatus?: "Approved" | "Unreviewed";
    hasConflict?: boolean;
    hasOpenPlaceholder?: boolean;
  } = {},
): GroundedSearchResult {
  return {
    citations: sourceIds.map((sourceId) => citation(sourceId)),
    confidence: 0.9,
    hasConflict: options.hasConflict,
    hasOpenPlaceholder: options.hasOpenPlaceholder,
    sourceIds,
    sources: sourceIds.map((sourceId) => ({
      approvalStatus: options.approvalStatus ?? "Approved",
      citation: citation(sourceId),
      confidence: 0.9,
      driveFileId: sourceId,
      sourceId,
      spaceId: "lease-renewals",
    })),
  };
}

function citation(sourceId: string) {
  return {
    source_id: sourceId,
    title: `Source ${sourceId}`,
    url: `https://drive.google.com/file/d/${sourceId}/view`,
  };
}
