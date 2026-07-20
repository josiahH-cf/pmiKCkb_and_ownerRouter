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

  it("forces Ask fixture data off in ordinary production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const config = readServerConfig({ ASK_DEMO_MODE: "true" });
    expect(config.askDemoMode).toBe(false);
  });

  it("defaults the STT + image-store providers to the free dev/test stubs", () => {
    expect(readServerConfig({}).speechProvider).toBe("stub");
    expect(readServerConfig({}).imageStore).toBe("stub");
  });

  it("forces the image stub in local-demo auth even when .env requests Drive", () => {
    expect(
      readServerConfig({ IMAGE_STORE: "drive", LOCAL_DEMO_AUTH: "true" }).imageStore,
    ).toBe("stub");
  });

  it("forces Google Cloud STT + Drive image store in production (stubs are dev/test-only)", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(readServerConfig({ SPEECH_PROVIDER: "stub" }).speechProvider).toBe("google");
    expect(readServerConfig({ IMAGE_STORE: "stub" }).imageStore).toBe("drive");
  });

  it("parses Space ID maps", () => {
    const config = readServerConfig({
      SPACE_DRIVE_FOLDER_IDS: '{"lease-renewals":"folder-1"}',
      SPACE_VERTEX_DATA_STORE_IDS: '{"lease-renewals":"data-store-1"}',
    });

    expect(config.spaceDriveFolderIds["lease-renewals"]).toBe("folder-1");
    expect(config.spaceVertexDataStoreIds["lease-renewals"]).toBe("data-store-1");
  });

  it("resolves the maintenance photo folder, preferring the dedicated var over the legacy map key", () => {
    expect(
      readServerConfig({
        MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: "dedicated-folder",
        SPACE_DRIVE_FOLDER_IDS: '{"maintenance-work-order-intake":"legacy-folder"}',
      }).maintenanceImageFolderId,
    ).toBe("dedicated-folder");

    expect(
      readServerConfig({
        SPACE_DRIVE_FOLDER_IDS: '{"maintenance-work-order-intake":"legacy-folder"}',
      }).maintenanceImageFolderId,
    ).toBe("legacy-folder");

    expect(readServerConfig({}).maintenanceImageFolderId).toBe("");
  });

  it("fails the public intake closed by default (no secret) and defaults the daily + signage caps", () => {
    const config = readServerConfig({});
    expect(config.maintenanceIntakeTokenSecret).toBeUndefined();
    expect(config.maintenanceIntakeIpHashSalt).toBeUndefined();
    // F-MAINT-3: default 50/property/day, with a tighter default for reusable signage links.
    expect(config.maintenanceIntakeDailyCap).toBe(50);
    expect(config.maintenanceIntakeSignageDailyCap).toBe(15);
  });

  it("reads the intake secret, salt, and daily + signage caps when provided", () => {
    const config = readServerConfig({
      MAINTENANCE_INTAKE_TOKEN_SECRET: "s3cret",
      MAINTENANCE_INTAKE_IP_HASH_SALT: "salty",
      MAINTENANCE_INTAKE_DAILY_CAP: "250",
      MAINTENANCE_INTAKE_SIGNAGE_DAILY_CAP: "40",
    });
    expect(config.maintenanceIntakeTokenSecret).toBe("s3cret");
    expect(config.maintenanceIntakeIpHashSalt).toBe("salty");
    expect(config.maintenanceIntakeDailyCap).toBe(250);
    expect(config.maintenanceIntakeSignageDailyCap).toBe(40);
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
