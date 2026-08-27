import { describe, expect, it, vi } from "vitest";

import {
  DiscoveryEngineSpaceProvisioningProvider,
  fixedBranchName,
  fixedDataStoreName,
  fixedDataStoreParent,
  type FixedDataStoreClient,
  type FixedDocumentClient,
} from "@/lib/admin/space-provisioning-provider";
import { buildSpaceProvisioningPlan } from "@/lib/admin/space-request-commands";
import { buildAuthorizedSpaceProvisioningPreview } from "@/lib/admin/space-provisioning-pilot";

function exactPreview() {
  const spaceIds = Array.from({ length: 11 }, (_, index) => `space-${index + 1}`);
  const plan = buildSpaceProvisioningPlan({
    name: "Owner Statements",
    scope: "Read-only owner statement process",
    intendedSources: [],
    gcpProjectId: "pmi-kc-kb-prod",
    vertexSearchLocation: "us",
    existingVertexDataStoreIds: Object.fromEntries(
      spaceIds.map((id) => [id, `kb-${id}-txt`]),
    ),
    existingDriveFolderIds: Object.fromEntries(
      spaceIds.map((id) => [id, `gs://pmi-kc-kb-prod-sources-558870356522/${id}/`]),
    ),
  });
  return buildAuthorizedSpaceProvisioningPreview(plan, {
    requestId: "018f5ca1-7b7c-7c3d-8b6f-5f83a36a5f51",
    confirmedSpaceId: "owner-statements",
    sourceObjectUri:
      "gs://pmi-kc-kb-prod-sources-558870356522/owner-statements/approved.jsonl",
    approvalEvidenceRef: "owner-approval:2026-08-27",
  });
}

function operation(name: string) {
  return { name, promise: vi.fn().mockResolvedValue(undefined) };
}

describe("official fixed S36 Discovery Engine adapter", () => {
  it("derives every provider identifier and runs create/import/read/list/delete", async () => {
    const preview = exactPreview();
    const create = operation("operations/create-1");
    const remove = operation("operations/delete-1");
    const importOp = operation("operations/import-1");
    const dataStores: FixedDataStoreClient = {
      listDataStores: vi
        .fn()
        .mockResolvedValue([
          [
            { name: fixedDataStoreName("kb-space-1-txt") },
            { name: fixedDataStoreName(preview.plan.dataStoreId) },
          ],
        ]),
      getDataStore: vi.fn().mockResolvedValue([
        {
          name: fixedDataStoreName(preview.plan.dataStoreId),
          displayName: preview.plan.displayName,
        },
      ]),
      createDataStore: vi.fn().mockResolvedValue([create]),
      deleteDataStore: vi.fn().mockResolvedValue([remove]),
    };
    const documents: FixedDocumentClient = {
      importDocuments: vi.fn().mockResolvedValue([importOp]),
    };
    const provider = new DiscoveryEngineSpaceProvisioningProvider(dataStores, documents);

    await expect(provider.provisionDataStoreAndImportSource(preview)).resolves.toEqual({
      providerOperationRef: "operations/create-1 | operations/import-1",
    });
    expect(dataStores.createDataStore).toHaveBeenCalledWith({
      parent: fixedDataStoreParent(),
      dataStoreId: "kb-owner-statements-txt",
      dataStore: {
        contentConfig: "CONTENT_REQUIRED",
        displayName: "Owner Statements",
        industryVertical: "GENERIC",
        solutionTypes: ["SOLUTION_TYPE_SEARCH"],
      },
    });
    expect(documents.importDocuments).toHaveBeenCalledWith({
      parent: fixedBranchName("kb-owner-statements-txt"),
      gcsSource: { dataSchema: "content", inputUris: [preview.sourceObjectUri] },
      reconciliationMode: "INCREMENTAL",
      forceRefreshContent: true,
    });
    await expect(provider.readDataStore(preview)).resolves.toEqual({
      id: preview.plan.dataStoreId,
      displayName: preview.plan.displayName,
    });
    await expect(provider.listDataStoreIds(preview)).resolves.toEqual([
      preview.plan.dataStoreId,
      "kb-space-1-txt",
    ]);
    await expect(provider.retireDataStore(preview)).resolves.toEqual({
      providerOperationRef: "operations/delete-1",
    });
    expect(dataStores.deleteDataStore).toHaveBeenCalledWith({
      name: fixedDataStoreName(preview.plan.dataStoreId),
    });
  });

  it("returns absence only for provider NOT_FOUND and rejects shape drift before calls", async () => {
    const preview = exactPreview();
    const getDataStore = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("absent"), { code: 5 }));
    const dataStores = {
      listDataStores: vi.fn().mockResolvedValue([[]]),
      getDataStore,
      createDataStore: vi.fn(),
      deleteDataStore: vi.fn(),
    } as unknown as FixedDataStoreClient;
    const provider = new DiscoveryEngineSpaceProvisioningProvider(dataStores, {
      importDocuments: vi.fn(),
    } as unknown as FixedDocumentClient);
    await expect(provider.readDataStore(preview)).resolves.toBeNull();

    const drifted = structuredClone(preview);
    drifted.plan.projectId = "attacker-project" as never;
    await expect(provider.listDataStoreIds(drifted)).rejects.toThrow(/fixed S36/i);
    expect(dataStores.listDataStores).not.toHaveBeenCalled();
  });
});
