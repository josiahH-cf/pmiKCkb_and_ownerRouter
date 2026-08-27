import { v1 } from "@google-cloud/discoveryengine";

import {
  FIXED_SPACE_PROVISIONING_LOCATION,
  FIXED_SPACE_PROVISIONING_PROJECT,
  FIXED_SPACE_PROVISIONING_SHAPE,
} from "@/lib/admin/space-request-commands";
import type {
  AuthorizedSpaceProvisioningPreview,
  FixedSpaceProvisioningProvider,
} from "@/lib/admin/space-provisioning-pilot";

const COLLECTION_ID = "default_collection";
const BRANCH_ID = "default_branch";
const NOT_FOUND = 5;

interface ProviderOperation {
  name?: string | null;
  promise(): Promise<unknown>;
}

export interface FixedDataStoreClient {
  listDataStores(input: { parent: string }): Promise<[Array<{ name?: string | null }>]>;
  getDataStore(input: { name: string }): Promise<
    [
      {
        name?: string | null;
        displayName?: string | null;
      },
    ]
  >;
  createDataStore(input: {
    parent: string;
    dataStoreId: string;
    dataStore: {
      contentConfig: "CONTENT_REQUIRED";
      displayName: string;
      industryVertical: "GENERIC";
      solutionTypes: ["SOLUTION_TYPE_SEARCH"];
    };
  }): Promise<[ProviderOperation]>;
  deleteDataStore(input: { name: string }): Promise<[ProviderOperation]>;
}

export interface FixedDocumentClient {
  importDocuments(input: {
    parent: string;
    gcsSource: { dataSchema: "content"; inputUris: [string] };
    reconciliationMode: "INCREMENTAL";
    forceRefreshContent: true;
  }): Promise<[ProviderOperation]>;
}

export function fixedDataStoreParent(): string {
  return `projects/${FIXED_SPACE_PROVISIONING_PROJECT}/locations/${FIXED_SPACE_PROVISIONING_LOCATION}/collections/${COLLECTION_ID}`;
}

export function fixedDataStoreName(dataStoreId: string): string {
  return `${fixedDataStoreParent()}/dataStores/${dataStoreId}`;
}

export function fixedBranchName(dataStoreId: string): string {
  return `${fixedDataStoreName(dataStoreId)}/branches/${BRANCH_ID}`;
}

/**
 * Official Discovery Engine adapter for the one allowlisted S36 resource shape. Every identifier is
 * re-derived from the server-owned preview; no provider request accepts caller-selected cloud ids.
 */
export class DiscoveryEngineSpaceProvisioningProvider implements FixedSpaceProvisioningProvider {
  constructor(
    private readonly dataStores: FixedDataStoreClient,
    private readonly documents: FixedDocumentClient,
  ) {}

  async listDataStoreIds(preview: AuthorizedSpaceProvisioningPreview): Promise<string[]> {
    assertFixedPreview(preview);
    const [stores] = await this.dataStores.listDataStores({
      parent: fixedDataStoreParent(),
    });
    return stores
      .map((store) => finalPathSegment(store.name))
      .filter((id): id is string => Boolean(id))
      .sort();
  }

  async readDataStore(
    preview: AuthorizedSpaceProvisioningPreview,
  ): Promise<{ id: string; displayName: string } | null> {
    assertFixedPreview(preview);
    try {
      const [store] = await this.dataStores.getDataStore({
        name: fixedDataStoreName(preview.plan.dataStoreId),
      });
      return {
        id: finalPathSegment(store.name) ?? "",
        displayName: store.displayName ?? "",
      };
    } catch (error) {
      if (providerErrorCode(error) === NOT_FOUND) return null;
      throw error;
    }
  }

  async provisionDataStoreAndImportSource(
    preview: AuthorizedSpaceProvisioningPreview,
  ): Promise<{ providerOperationRef: string }> {
    assertFixedPreview(preview);
    const [createOperation] = await this.dataStores.createDataStore({
      parent: fixedDataStoreParent(),
      dataStoreId: preview.plan.dataStoreId,
      dataStore: {
        contentConfig: "CONTENT_REQUIRED",
        displayName: preview.plan.displayName,
        industryVertical: "GENERIC",
        solutionTypes: ["SOLUTION_TYPE_SEARCH"],
      },
    });
    await createOperation.promise();
    const [importOperation] = await this.documents.importDocuments({
      parent: fixedBranchName(preview.plan.dataStoreId),
      gcsSource: {
        dataSchema: "content",
        inputUris: [preview.sourceObjectUri],
      },
      reconciliationMode: "INCREMENTAL",
      forceRefreshContent: true,
    });
    await importOperation.promise();
    return {
      providerOperationRef: operationRefs(createOperation, importOperation),
    };
  }

  async retireDataStore(
    preview: AuthorizedSpaceProvisioningPreview,
  ): Promise<{ providerOperationRef: string }> {
    assertFixedPreview(preview);
    const [operation] = await this.dataStores.deleteDataStore({
      name: fixedDataStoreName(preview.plan.dataStoreId),
    });
    await operation.promise();
    return { providerOperationRef: operationRefs(operation) };
  }
}

export function createDiscoveryEngineSpaceProvisioningProvider(): DiscoveryEngineSpaceProvisioningProvider {
  const endpoint = `${FIXED_SPACE_PROVISIONING_LOCATION}-discoveryengine.googleapis.com`;
  return new DiscoveryEngineSpaceProvisioningProvider(
    new v1.DataStoreServiceClient({
      apiEndpoint: endpoint,
    }) as unknown as FixedDataStoreClient,
    new v1.DocumentServiceClient({
      apiEndpoint: endpoint,
    }) as unknown as FixedDocumentClient,
  );
}

function assertFixedPreview(preview: AuthorizedSpaceProvisioningPreview): void {
  const { plan } = preview;
  if (
    plan.shape !== FIXED_SPACE_PROVISIONING_SHAPE ||
    plan.projectId !== FIXED_SPACE_PROVISIONING_PROJECT ||
    plan.location !== FIXED_SPACE_PROVISIONING_LOCATION ||
    plan.dataStoreId !== `kb-${plan.spaceId}-txt` ||
    !plan.sourcePrefix ||
    !preview.sourceObjectUri.startsWith(plan.sourcePrefix)
  ) {
    throw new Error(
      "The provider refused a preview outside the fixed S36 resource shape.",
    );
  }
}

function finalPathSegment(value: string | null | undefined): string | null {
  const parts = value?.split("/").filter(Boolean) ?? [];
  return parts.at(-1) ?? null;
}

function providerErrorCode(error: unknown): number | null {
  return error && typeof error === "object" && "code" in error
    ? Number((error as { code: unknown }).code)
    : null;
}

function operationRefs(...operations: ProviderOperation[]): string {
  return operations
    .map((operation, index) => operation.name?.trim() || `operation-${index + 1}`)
    .join(" | ");
}
