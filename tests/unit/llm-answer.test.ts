import { describe, expect, it, vi } from "vitest";
import {
  ANSWER_RESPONSE_JSON_SCHEMA,
  GoogleGenAiAnswerGenerator,
  ensureDraftBanner,
  parseGeneratedAnswerText,
} from "@/lib/llm/answer";
import { DRAFT_BANNER } from "@/lib/constants";
import type { ServerConfig } from "@/lib/config/server";
import { buildGroundedAnswerSystemPrompt } from "@/lib/llm/prompt";

describe("Gemini answer contract", () => {
  it("parses strict generated answer JSON", () => {
    expect(
      parseGeneratedAnswerText(
        JSON.stringify({
          answer: "Use the approved SOP.",
          citations: [
            {
              source_id: "source-1",
              title: "SOP",
              url: "https://example.com/source-1",
            },
          ],
          draft: "",
          handling_steps: ["Open the SOP."],
          source_state: "Verified Source",
        }),
      ),
    ).toMatchObject({
      answer: "Use the approved SOP.",
      source_state: "Verified Source",
    });
  });

  it("rejects malformed or incomplete generated answer JSON", () => {
    expect(() => parseGeneratedAnswerText("not json")).toThrow();
    expect(() =>
      parseGeneratedAnswerText(JSON.stringify({ answer: "Missing fields." })),
    ).toThrow();
  });

  it("instructs Gemini to keep draft labeling out of the answer field", () => {
    const prompt = buildGroundedAnswerSystemPrompt();

    expect(prompt).toContain("Never put the draft banner in answer");
    expect(prompt).toContain("Partial Source is a usable answer state");
    expect(prompt).toContain("do not invent role titles");
  });

  it("normalizes draft banner spacing", () => {
    expect(ensureDraftBanner(`${DRAFT_BANNER}\nHi owner.`, true)).toBe(
      `${DRAFT_BANNER}\n\nHi owner.`,
    );
    expect(ensureDraftBanner("Hi owner.", true)).toBe(`${DRAFT_BANNER}\n\nHi owner.`);
    expect(ensureDraftBanner("Hi owner.", false)).toBe("");
  });

  it("retries once with stricter instructions after invalid JSON", async () => {
    const models = {
      generateContent: vi
        .fn()
        .mockResolvedValueOnce({ text: "not json" })
        .mockResolvedValueOnce({
          text: JSON.stringify({
            answer: "Use the approved SOP.",
            citations: [
              {
                source_id: "source-1",
                title: "SOP",
                url: "https://example.com/source-1",
              },
            ],
            draft: "",
            handling_steps: ["Open the SOP."],
            source_state: "Verified Source",
          }),
        }),
    };
    const generator = new GoogleGenAiAnswerGenerator(config(), {
      models: models as never,
    });

    await expect(
      generator.generateAnswer({
        ask: {
          draft_enabled: true,
          question: "What is the renewal workflow?",
        },
        grounding: {
          citations: [
            {
              source_id: "source-1",
              title: "SOP",
              url: "https://example.com/source-1",
            },
          ],
          confidence: 0.9,
          sourceIds: ["source-1"],
          sources: [
            {
              approvalStatus: "Approved",
              citation: {
                source_id: "source-1",
                title: "SOP",
                url: "https://example.com/source-1",
              },
              confidence: 0.9,
              driveFileId: "source-1",
              sourceId: "source-1",
              spaceId: "lease-renewals",
            },
          ],
        },
        sourceState: "Verified Source",
      }),
    ).resolves.toMatchObject({
      source_state: "Verified Source",
    });

    expect(models.generateContent).toHaveBeenCalledTimes(2);
    expect(models.generateContent.mock.calls[0][0]).toMatchObject({
      config: {
        responseJsonSchema: ANSWER_RESPONSE_JSON_SCHEMA,
        responseMimeType: "application/json",
      },
      model: "gemini-2.5-pro",
    });
    expect(models.generateContent.mock.calls[1][0].contents).toContain(
      "previous response failed JSON validation",
    );
  });
});

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const base: ServerConfig = {
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

  return { ...base, ...overrides };
}
