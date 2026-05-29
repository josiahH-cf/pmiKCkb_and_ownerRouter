import { describe, expect, it } from "vitest";
import { readRequiredGoogleConfig, readServerConfig } from "@/lib/config/server";

describe("server config", () => {
  it("reads defaults for local demo mode", () => {
    expect(readServerConfig({}).allowedHostedDomain).toBe("pmikcmetro.com");
    expect(readServerConfig({}).askDemoMode).toBe(true);
    expect(readServerConfig({}).groundingConfidenceThreshold).toBe(0.65);
    expect(readServerConfig({ LOCAL_DEMO_AUTH: "true" }).localDemoAuth).toBe(true);
    expect(readServerConfig({}).vertexAiLocation).toBe("us-central1");
    expect(readServerConfig({}).vertexSearchLocation).toBe("us");
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

  it("reports missing live Google setup values", () => {
    expect(() => readRequiredGoogleConfig({})).toThrow(
      /Missing required Google setup values/,
    );
  });
});
