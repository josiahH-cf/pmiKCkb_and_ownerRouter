import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readServerConfig } from "@/lib/config/server";

const config = () =>
  readServerConfig({
    ENVIRONMENT_KIND: "demo",
    DATA_CONTEXT: "demo",
    GCP_PROJECT_ID: "pmi-kc-kb-test",
    SPACE_DRIVE_FOLDER_IDS: JSON.stringify({
      "lease-renewals": "folder-1",
      "move-in": "folder-2",
    }),
    SPACE_VERTEX_DATA_STORE_IDS: JSON.stringify({
      "lease-renewals": "store-1",
      "move-in": "store-2",
    }),
  });

describe("Discovery Engine loads only for the requested provider operation", () => {
  let loads: number;
  let failConstruction: boolean;
  const searchConstructed = vi.fn();
  const storeConstructed = vi.fn();
  const documentConstructed = vi.fn();
  const search = vi.fn().mockResolvedValue([[], undefined, { results: [] }]);
  const sourceMetaReader = { readByDriveFileIds: vi.fn().mockResolvedValue(new Map()) };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    loads = 0;
    failConstruction = false;
    vi.doMock("@google-cloud/discoveryengine", () => {
      loads += 1;
      return {
        v1beta: {
          SearchServiceClient: class {
            constructor(options: unknown) {
              searchConstructed(options);
              if (failConstruction) throw new Error("client construction failed");
            }
            projectLocationCollectionDataStoreServingConfigPath(...parts: string[]) {
              return parts.join("/");
            }
            search = search;
          },
        },
        v1: {
          DataStoreServiceClient: class {
            constructor(options: unknown) {
              storeConstructed(options);
            }
          },
          DocumentServiceClient: class {
            constructor(options: unknown) {
              documentConstructed(options);
            }
          },
        },
      };
    });
  });

  afterEach(() => {
    vi.doUnmock("@google-cloud/discoveryengine");
    vi.resetModules();
  });

  it("does not load the SDK for module imports, reader construction, or invalid targets", async () => {
    const { VertexSearchRetrievalClient } = await import("@/lib/retrieval/vertex-search");
    await import("@/lib/admin/space-provisioning-provider");
    const reader = new VertexSearchRetrievalClient(config(), { sourceMetaReader });
    expect(loads).toBe(0);
    await expect(
      reader.search({ question: "synthetic local test", spaceId: "not-a-space" }),
    ).rejects.toThrow();
    expect(loads).toBe(0);
    expect(search).not.toHaveBeenCalled();
  });

  it("shares one initialization across concurrent targets and later searches", async () => {
    const { VertexSearchRetrievalClient } = await import("@/lib/retrieval/vertex-search");
    const reader = new VertexSearchRetrievalClient(config(), { sourceMetaReader });
    await Promise.all([
      reader.search({ question: "synthetic local first" }),
      reader.search({ question: "synthetic local second" }),
    ]);
    await reader.search({ question: "synthetic local third", spaceId: "lease-renewals" });
    expect(loads).toBe(1);
    expect(searchConstructed).toHaveBeenCalledExactlyOnceWith({
      apiEndpoint: "us-discoveryengine.googleapis.com",
    });
    expect(search).toHaveBeenCalledTimes(5);
    expect(search.mock.calls.every(([, options]) => options.autoPaginate === false)).toBe(
      true,
    );
    expect(storeConstructed).not.toHaveBeenCalled();
    expect(documentConstructed).not.toHaveBeenCalled();
  });

  it("keeps an injected search client independent of the SDK", async () => {
    const { VertexSearchRetrievalClient } = await import("@/lib/retrieval/vertex-search");
    const reader = new VertexSearchRetrievalClient(config(), {
      sourceMetaReader,
      client: {
        projectLocationCollectionDataStoreServingConfigPath: (...parts) =>
          parts.join("/"),
        search,
      },
    });
    await reader.search({ question: "synthetic local test", spaceId: "lease-renewals" });
    expect(search).toHaveBeenCalledOnce();
    expect(loads).toBe(0);
  });

  it("propagates construction failure and permits a later explicit search", async () => {
    const { VertexSearchRetrievalClient } = await import("@/lib/retrieval/vertex-search");
    const reader = new VertexSearchRetrievalClient(config(), { sourceMetaReader });
    failConstruction = true;
    await expect(
      reader.search({ question: "synthetic local test", spaceId: "lease-renewals" }),
    ).rejects.toThrow("client construction failed");
    expect(search).not.toHaveBeenCalled();
    failConstruction = false;
    await reader.search({ question: "synthetic local test", spaceId: "lease-renewals" });
    expect(searchConstructed).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledOnce();
  });

  it("constructs only the same fixed provisioning clients when explicitly requested", async () => {
    const { createDiscoveryEngineSpaceProvisioningProvider } =
      await import("@/lib/admin/space-provisioning-provider");
    expect(loads).toBe(0);
    const provider = await createDiscoveryEngineSpaceProvisioningProvider();
    expect(typeof provider.provisionDataStoreAndImportSource).toBe("function");
    expect(storeConstructed).toHaveBeenCalledExactlyOnceWith({
      apiEndpoint: "us-discoveryengine.googleapis.com",
    });
    expect(documentConstructed).toHaveBeenCalledExactlyOnceWith({
      apiEndpoint: "us-discoveryengine.googleapis.com",
    });
    expect(searchConstructed).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });
});
