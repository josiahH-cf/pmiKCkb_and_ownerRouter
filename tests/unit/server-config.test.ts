import { afterEach, describe, expect, it, vi } from "vitest";
import { readRequiredGoogleConfig, readServerConfig } from "@/lib/config/server";

describe("server config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads defaults for local demo mode", () => {
    expect(readServerConfig({}).allowedHostedDomain).toBe("pmikcmetro.com");
    expect(readServerConfig({}).askDemoMode).toBe(true);
    expect(readServerConfig({}).groundingConfidenceThreshold).toBe(0.65);
    expect(readServerConfig({ LOCAL_DEMO_AUTH: "true" }).localDemoAuth).toBe(true);
    expect(readServerConfig({}).vertexAiLocation).toBe("us-central1");
    expect(readServerConfig({}).vertexSearchLocation).toBe("us");
    expect(readServerConfig({}).kbApprovalNotificationsEnabled).toBe(false);
    expect(readServerConfig({}).kbApprovalRecipients).toEqual([]);
  });

  it("defaults to the Gemini model provider", () => {
    expect(readServerConfig({}).modelProvider).toBe("gemini");
    expect(readServerConfig({}).localModelName).toBe("local-model");
    expect(readServerConfig({}).localModelBaseUrl).toBeUndefined();
  });

  it("selects the local provider outside production", () => {
    expect(readServerConfig({ MODEL_PROVIDER: "local" }).modelProvider).toBe("local");
  });

  it("forces the Gemini provider in production (local is dev/test-only)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(readServerConfig({ MODEL_PROVIDER: "local" }).modelProvider).toBe("gemini");
  });

  it("parses Space ID maps", () => {
    const config = readServerConfig({
      SPACE_DRIVE_FOLDER_IDS: '{"lease-renewals":"folder-1"}',
      SPACE_VERTEX_DATA_STORE_IDS: '{"lease-renewals":"data-store-1"}',
    });

    expect(config.spaceDriveFolderIds["lease-renewals"]).toBe("folder-1");
    expect(config.spaceVertexDataStoreIds["lease-renewals"]).toBe("data-store-1");
  });

  it("rejects invalid JSON maps", () => {
    expect(() =>
      readServerConfig({
        SPACE_DRIVE_FOLDER_IDS: "not-json",
      }),
    ).toThrow();
  });

  it("parses approval notification setup", () => {
    const config = readServerConfig({
      APP_BASE_URL: "https://kb.example.com",
      KB_APPROVAL_NOTIFICATIONS_ENABLED: "true",
      KB_APPROVAL_RECIPIENTS: "bailey@example.com, dan@example.com",
      KB_APPROVAL_SENDER: "kb@example.com",
    });

    expect(config.appBaseUrl).toBe("https://kb.example.com");
    expect(config.kbApprovalNotificationsEnabled).toBe(true);
    expect(config.kbApprovalRecipients).toEqual([
      "bailey@example.com",
      "dan@example.com",
    ]);
    expect(config.kbApprovalSender).toBe("kb@example.com");
  });

  it("reports missing live Google setup values", () => {
    expect(() => readRequiredGoogleConfig({})).toThrow(
      /Missing required Google setup values/,
    );
  });
});
