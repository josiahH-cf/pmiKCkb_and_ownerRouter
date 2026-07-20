import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answerQuestion } from "@/lib/ask/service";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { AskLogWriter } from "@/lib/firestore/ask-logs";
import type { AnswerGenerator } from "@/lib/llm/answer";
import type {
  GroundedSearchResult,
  RetrievalClient,
} from "@/lib/retrieval/vertex-search";
import type { ServerConfig } from "@/lib/config/server";
import { SOURCE_STATES } from "@/lib/constants";

interface EvalCase {
  id: string;
  question: string;
  expected_source_state: string;
  category: string;
}

const evalCases = JSON.parse(
  readFileSync(new URL("./kb-eval-seed.json", import.meta.url), "utf8"),
) as EvalCase[];

describe("KB eval seed set", () => {
  it("contains the required minimum number of scaffolded eval cases", () => {
    expect(evalCases).toHaveLength(50);
  });

  it("uses only supported source states", () => {
    const states = new Set(SOURCE_STATES);
    for (const evalCase of evalCases) {
      expect(
        states.has(evalCase.expected_source_state as (typeof SOURCE_STATES)[number]),
      ).toBe(true);
    }
  });

  it("executes every seed case through the Ask service contract", async () => {
    for (const evalCase of evalCases) {
      const response = await answerQuestion(
        evalUser,
        {
          draft_enabled: true,
          question: evalCase.question,
        },
        {
          answerGenerator: evalAnswerGenerator,
          askLogWriter: noopAskLogWriter,
          config: liveConfig,
          retrievalClient: retrievalFor(evalCase.expected_source_state),
        },
      );

      expect(response.source_state, evalCase.id).toBe(evalCase.expected_source_state);
    }
  });
});

const evalUser: AuthenticatedUser = {
  email: "eval@pmikcmetro.com",
  hd: "pmikcmetro.com",
  role: "Admin",
  uid: "eval",
};

const liveConfig: ServerConfig = {
  allowedHostedDomain: "pmikcmetro.com",
  appBaseUrl: undefined,
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
  kbApprovalNotificationsEnabled: false,
  kbApprovalRecipients: [],
  kbApprovalSender: undefined,
  localDemoAuth: false,
  localModelBaseUrl: undefined,
  localModelName: "local-model",
  modelProvider: "gemini",
  speechLanguageCode: "en-US",
  speechProvider: "stub",
  maintenanceImageFolderId: "",
  maintenanceIntakeTokenSecret: undefined,
  maintenanceIntakeIpHashSalt: undefined,
  maintenanceIntakeDailyCap: 500,
  maintenanceIntakeSignageDailyCap: 15,
  imageStore: "stub",
  spaceDriveFolderIds: {
    "lease-renewals": "folder-1",
  },
  spaceVertexDataStoreIds: {
    "lease-renewals": "data-store-1",
  },
  vertexAiLocation: "us-central1",
  vertexSearchLocation: "us",
};

const noopAskLogWriter: AskLogWriter = {
  async write() {},
};

const evalAnswerGenerator: AnswerGenerator = {
  async generateAnswer(request) {
    return {
      answer: "Eval grounded answer.",
      citations: [request.grounding.citations[0]],
      draft: "",
      escalation_owner:
        request.sourceState === "Verified Source" ? undefined : "Process owner",
      handling_steps: ["Use only cited sources."],
      source_state: request.sourceState,
    };
  },
};

function retrievalFor(expectedSourceState: string): RetrievalClient {
  return {
    async search() {
      if (expectedSourceState === "No Reliable Source Found") {
        return {
          citations: [],
          confidence: 0,
          sourceIds: [],
          sources: [],
        };
      }

      if (expectedSourceState === "Conflict Found") {
        return grounding(["source-a", "source-b"], { hasConflict: true });
      }

      if (expectedSourceState === "Open Placeholder") {
        return grounding(["source-a"], { hasOpenPlaceholder: true });
      }

      if (expectedSourceState === "Partial Source") {
        return grounding(["source-a"], { approvalStatus: "Unreviewed" });
      }

      return grounding(["source-a", "source-b"]);
    },
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
    url: `https://example.com/${sourceId}`,
  };
}
