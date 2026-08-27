// S36 fixed one-Space resource plan. Despite the historical filename, this module emits no shell
// command and accepts no caller-supplied project, service account, bucket, data-store, or IAM id.

import { createHash } from "node:crypto";

export const FIXED_SPACE_PROVISIONING_PROJECT = "pmi-kc-kb-prod";
export const FIXED_SPACE_PROVISIONING_LOCATION = "us";
export const FIXED_SPACE_PROVISIONING_RUNTIME_IDENTITY =
  "pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com";
export const FIXED_SPACE_PROVISIONING_SHAPE = "one-space-gcs-discovery-v1";

/** Kebab-case a Space name into a stable slug used as the Space key. */
export function slugifySpaceId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return slug || "new-space";
}

export interface SpaceProvisioningInput {
  name: string;
  scope: string;
  intendedSources: string[];
  gcpProjectId?: string;
  vertexSearchLocation: string;
  existingVertexDataStoreIds: Record<string, string>;
  /** Historical key name; live values are verified gs:// per-Space prefixes. */
  existingDriveFolderIds: Record<string, string>;
}

export interface SpaceProvisioningPlan {
  shape: typeof FIXED_SPACE_PROVISIONING_SHAPE;
  spaceId: string;
  displayName: string;
  dataStoreId: string;
  sourcePrefix: string | null;
  projectId: typeof FIXED_SPACE_PROVISIONING_PROJECT;
  location: typeof FIXED_SPACE_PROVISIONING_LOCATION;
  runtimeServiceAccount: typeof FIXED_SPACE_PROVISIONING_RUNTIME_IDENTITY;
  protectedDataStoreIds: string[];
  alreadyExists: boolean;
  readyForAuthorization: boolean;
  blockers: string[];
  previewHash: string;
  resourceDisclosure: string[];
  iamDisclosure: string[];
  costDisclosure: string[];
  retirementDisclosure: string[];
  externalInputRequired: string;
  /** Always empty: S36 no longer emits executable generic cloud commands. */
  commands: string[];
  /** Exact post-provision deployment mappings; current eleven entries are preserved. */
  envLocalLines: string[];
  notes: string[];
}

/**
 * Select the only supported resource shape from server-owned current config. A caller can submit a
 * business name/scope/source description, but cannot choose cloud identifiers or IAM.
 */
export function buildSpaceProvisioningPlan(
  input: SpaceProvisioningInput,
): SpaceProvisioningPlan {
  const spaceId = slugifySpaceId(input.name);
  const dataStoreId = `kb-${spaceId}-txt`;
  const alreadyExists =
    spaceId in input.existingVertexDataStoreIds ||
    spaceId in input.existingDriveFolderIds ||
    Object.values(input.existingVertexDataStoreIds).includes(dataStoreId);
  const blockers: string[] = [];
  if (input.gcpProjectId !== FIXED_SPACE_PROVISIONING_PROJECT) {
    blockers.push("Production project readback does not match the fixed S36 project.");
  }
  if (input.vertexSearchLocation !== FIXED_SPACE_PROVISIONING_LOCATION) {
    blockers.push(
      "Discovery Engine location readback does not match the fixed S36 location.",
    );
  }
  const sourceRoot = commonProductionSourceRoot(input.existingDriveFolderIds);
  if (!sourceRoot) {
    blockers.push(
      "The eleven existing Space source prefixes do not resolve to one verified production bucket.",
    );
  }
  if (alreadyExists) blockers.push("The derived Space or data-store id already exists.");
  const sourcePrefix = sourceRoot ? `${sourceRoot}${spaceId}/` : null;
  const mergedVertex = {
    ...input.existingVertexDataStoreIds,
    [spaceId]: dataStoreId,
  };
  const mergedSources = sourcePrefix
    ? { ...input.existingDriveFolderIds, [spaceId]: sourcePrefix }
    : input.existingDriveFolderIds;

  const safePreview = {
    shape: FIXED_SPACE_PROVISIONING_SHAPE,
    spaceId,
    displayName: input.name.trim(),
    scope: input.scope.trim(),
    dataStoreId,
    sourcePrefix,
    projectId: FIXED_SPACE_PROVISIONING_PROJECT,
    location: FIXED_SPACE_PROVISIONING_LOCATION,
    runtimeServiceAccount: FIXED_SPACE_PROVISIONING_RUNTIME_IDENTITY,
    protectedDataStoreIds: Object.values(input.existingVertexDataStoreIds).sort(),
    existingSpaceIds: Object.keys(input.existingVertexDataStoreIds).sort(),
  };
  const previewHash = createHash("sha256")
    .update(JSON.stringify(safePreview), "utf8")
    .digest("hex");
  const externalInputRequired =
    "One owner-approved pilot packet naming this exact Space request, the first verified JSONL source object inside the displayed gs:// prefix, and the approval evidence reference.";

  return {
    shape: FIXED_SPACE_PROVISIONING_SHAPE,
    spaceId,
    displayName: input.name.trim(),
    dataStoreId,
    sourcePrefix,
    projectId: FIXED_SPACE_PROVISIONING_PROJECT,
    location: FIXED_SPACE_PROVISIONING_LOCATION,
    runtimeServiceAccount: FIXED_SPACE_PROVISIONING_RUNTIME_IDENTITY,
    protectedDataStoreIds: Object.values(input.existingVertexDataStoreIds).sort(),
    alreadyExists,
    readyForAuthorization: blockers.length === 0,
    blockers,
    previewHash,
    resourceDisclosure: [
      `Create exactly one Discovery Engine data store: ${dataStoreId}.`,
      sourcePrefix
        ? `Use only the isolated existing-bucket namespace: ${sourcePrefix}`
        : "Source namespace is unavailable until live configuration readback succeeds.",
      "Preserve all eleven existing Space data-store and source mappings verbatim.",
    ],
    iamDisclosure: [
      `Use only ${FIXED_SPACE_PROVISIONING_RUNTIME_IDENTITY}.`,
      "Create no service account, IAM binding, bucket, topic, secret, or cross-project grant.",
    ],
    costDisclosure: [
      "One Discovery Engine data store and later ingestion/search usage may add metered cost.",
      "Existing $25 alert, $100 project stop, $100 account backstop, and $100 runtime guardrail remain unchanged.",
      "No dollar estimate is invented; provider billing depends on the approved source and usage.",
    ],
    retirementDisclosure: [
      `Delete only data store ${dataStoreId} after exact readback.`,
      sourcePrefix
        ? `Remove only mapping ${spaceId}; do not delete the shared bucket or any object outside ${sourcePrefix}`
        : "No storage retirement is allowed without a resolved isolated prefix.",
      "Read back all eleven predecessor data-store ids before and after retirement.",
    ],
    externalInputRequired,
    commands: [],
    envLocalLines: [
      `SPACE_VERTEX_DATA_STORE_IDS=${JSON.stringify(mergedVertex)}`,
      `SPACE_DRIVE_FOLDER_IDS=${JSON.stringify(mergedSources)}`,
    ],
    notes: [
      "This is an exact preview, not a provisioning receipt.",
      "Provisioning stays closed while SPACE_PROVISIONING_ENABLED is false or the owner-approved pilot packet is absent.",
      "The app accepts no caller-supplied cloud resource or IAM identifier.",
      ...(input.intendedSources.length
        ? [`Request source descriptions: ${input.intendedSources.join("; ")}`]
        : []),
    ],
  };
}

function commonProductionSourceRoot(mappings: Record<string, string>): string | null {
  const entries = Object.entries(mappings);
  if (entries.length !== 11) return null;
  let bucketRoot: string | null = null;
  for (const [spaceId, raw] of entries) {
    const value = raw.trim();
    const match = value.match(/^gs:\/\/([a-z0-9._-]+)\/([a-z0-9-]+)\/$/);
    if (!match || match[2] !== spaceId) return null;
    const candidate = `gs://${match[1]}/`;
    if (bucketRoot && bucketRoot !== candidate) return null;
    bucketRoot = candidate;
  }
  return bucketRoot;
}
