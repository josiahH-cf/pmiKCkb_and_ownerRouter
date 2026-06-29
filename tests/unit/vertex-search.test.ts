import { describe, expect, it } from "vitest";
import type { ServerConfig } from "@/lib/config/server";
import type { SourceMetaRecord } from "@/lib/firestore/types";
import {
  normalizeSearchSources,
  resolveSearchTargets,
  RetrievalSetupError,
  VertexSearchRetrievalClient,
  type SourceMetaReader,
  type VertexSearchApiClient,
} from "@/lib/retrieval/vertex-search";

describe("Vertex AI Search retrieval", () => {
  it("requires live Google and Space search configuration", () => {
    expect(() =>
      resolveSearchTargets(
        {
          ...config(),
          gcpProjectId: undefined,
        },
        "lease-renewals",
      ),
    ).toThrow(RetrievalSetupError);

    expect(() =>
      resolveSearchTargets(
        {
          ...config(),
          spaceVertexDataStoreIds: {},
        },
        "lease-renewals",
      ),
    ).toThrow('Missing Agent Search data store ID for Space "lease-renewals".');

    expect(() =>
      resolveSearchTargets(
        {
          ...config(),
          spaceDriveFolderIds: {},
        },
        "lease-renewals",
      ),
    ).toThrow('Missing source target for Space "lease-renewals".');
  });

  it("resolves all configured Space targets when no Space is requested", () => {
    expect(
      resolveSearchTargets({
        ...config(),
        spaceDriveFolderIds: {
          "lease-renewals": "folder-1",
          "move-in": "folder-2",
        },
        spaceVertexDataStoreIds: {
          "lease-renewals": "data-store-1",
          "move-in": "data-store-2",
        },
      }),
    ).toEqual([
      {
        dataStoreId: "data-store-1",
        driveFolderId: "folder-1",
        spaceId: "lease-renewals",
      },
      {
        dataStoreId: "data-store-2",
        driveFolderId: "folder-2",
        spaceId: "move-in",
      },
    ]);
  });

  it("normalizes search documents into Drive citations", () => {
    expect(
      normalizeSearchSources("lease-renewals", [
        {
          document: {
            derivedStructData: {
              extractive_answers: [{ content: "Renewal excerpt." }],
              link: "https://drive.google.com/file/d/drive-file-1/view",
            },
            id: "document-id",
            structData: {
              title: "Lease Renewals SOP",
            },
          },
          rankSignals: {
            relevanceScore: 0.91,
          },
        },
      ]),
    ).toEqual([
      {
        citation: {
          excerpt: "Renewal excerpt.",
          source_id: "drive-file-1",
          title: "Lease Renewals SOP",
          url: "https://drive.google.com/file/d/drive-file-1/view",
        },
        confidence: 0.91,
        driveFileId: "drive-file-1",
        sourceId: "drive-file-1",
        spaceId: "lease-renewals",
      },
    ]);
  });

  it("normalizes Cloud Storage documents into browser citations", () => {
    expect(
      normalizeSearchSources("lease-renewals", [
        {
          document: {
            derivedStructData: {
              snippets: [{ snippet: "Cloud Storage excerpt." }],
              uri: "gs://pmikckb-test-lease-renewals-123/lease-renewals/01-source.txt",
            },
            id: "69d4f1588f7a3d8db1d45a3dc7cfe5e5",
            structData: {
              title: "Lease Renewals Cloud Storage Source",
            },
          },
        },
      ]),
    ).toEqual([
      {
        citation: {
          excerpt: "Cloud Storage excerpt.",
          source_id: "69d4f1588f7a3d8db1d45a3dc7cfe5e5",
          title: "Lease Renewals Cloud Storage Source",
          url: "https://storage.cloud.google.com/pmikckb-test-lease-renewals-123/lease-renewals/01-source.txt",
        },
        confidence: undefined,
        driveFileId: "69d4f1588f7a3d8db1d45a3dc7cfe5e5",
        sourceId: "69d4f1588f7a3d8db1d45a3dc7cfe5e5",
        spaceId: "lease-renewals",
      },
    ]);
  });

  it("builds Vertex requests and filters results through source metadata", async () => {
    const client = new FakeSearchClient([
      {
        document: resultDocument("drive-file-1", "Approved SOP"),
        rankSignals: { relevanceScore: 0.9 },
      },
      {
        document: resultDocument("drive-file-2", "Deprecated SOP"),
        rankSignals: { relevanceScore: 0.9 },
      },
      {
        document: resultDocument("drive-file-3", "Sensitive SOP"),
        rankSignals: { relevanceScore: 0.9 },
      },
      {
        document: resultDocument("drive-file-4", "Unreviewed Notes"),
        rankSignals: { relevanceScore: 0.9 },
      },
      {
        document: resultDocument("drive-file-5", "Weak SOP"),
        rankSignals: { relevanceScore: 0.2 },
      },
    ]);
    const sourceMetaReader = new FakeSourceMetaReader([
      meta("drive-file-1", "Approved", "Low"),
      meta("drive-file-2", "Deprecated", "Low"),
      meta("drive-file-3", "Approved", "High"),
      meta("drive-file-5", "Approved", "Low"),
    ]);
    const retrieval = new VertexSearchRetrievalClient(config(), {
      client,
      sourceMetaReader,
    });

    const result = await retrieval.search({
      question: "What is the renewal workflow?",
      spaceId: "lease-renewals",
    });

    expect(client.calls).toEqual([
      {
        options: { autoPaginate: false },
        request: expect.objectContaining({
          contentSearchSpec: {
            snippetSpec: {
              returnSnippet: true,
            },
          },
          pageSize: 10,
          query: "What is the renewal workflow?",
          servingConfig:
            "projects/pmikckb-test/locations/us/collections/default_collection/dataStores/data-store-1/servingConfigs/default_config",
        }),
      },
    ]);
    expect(result.sourceIds).toEqual(["drive-file-1", "drive-file-4"]);
    expect(result.confidence).toBe(0.9);
  });
});

class FakeSearchClient implements VertexSearchApiClient {
  readonly calls: Array<{
    options: { autoPaginate: false };
    request: unknown;
  }> = [];

  constructor(private readonly results: unknown[]) {}

  projectLocationCollectionDataStoreServingConfigPath(
    project: string,
    location: string,
    collection: string,
    dataStore: string,
    servingConfig: string,
  ) {
    return `projects/${project}/locations/${location}/collections/${collection}/dataStores/${dataStore}/servingConfigs/${servingConfig}`;
  }

  async search(request: never, options: { autoPaginate: false }) {
    this.calls.push({ request, options });
    return [[], undefined, { results: this.results }] as never;
  }
}

class FakeSourceMetaReader implements SourceMetaReader {
  private readonly metaByDriveFileId: Map<string, SourceMetaRecord>;

  constructor(records: SourceMetaRecord[]) {
    this.metaByDriveFileId = new Map(
      records.map((record) => [record.drive_file_id, record]),
    );
  }

  async readByDriveFileIds(driveFileIds: readonly string[]) {
    return new Map(
      driveFileIds.flatMap((driveFileId) => {
        const record = this.metaByDriveFileId.get(driveFileId);
        return record ? [[driveFileId, record] as const] : [];
      }),
    );
  }
}

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

function resultDocument(driveFileId: string, title: string) {
  return {
    derivedStructData: {
      link: `https://drive.google.com/file/d/${driveFileId}/view`,
    },
    id: driveFileId,
    structData: {
      title,
    },
  };
}

function meta(
  driveFileId: string,
  approvalStatus: SourceMetaRecord["approval_status"],
  sensitivity: SourceMetaRecord["sensitivity"],
): SourceMetaRecord {
  return {
    approval_status: approvalStatus,
    drive_file_id: driveFileId,
    sensitivity,
    space_id: "lease-renewals",
  };
}
