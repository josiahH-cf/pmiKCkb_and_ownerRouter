// Pure provisioning-command generator for the add-a-Space request (Slice 7, D12).
//
// Given a requested Space plus the CURRENT config, it emits the exact gcloud/Vertex + Drive steps the
// OWNER runs by hand (this app NEVER provisions Vertex — that would bill) and the .env.local lines to
// add. It deliberately reinforces that the SPACE maps must live in .env.local, because `npm run deploy`
// reads them from there: a value set only via a one-off env update is reverted on the next deploy.
//
// Pure + deterministic: no I/O, no Date.now().

const DRIVE_FOLDER_PLACEHOLDER = "<DRIVE_FOLDER_ID>";
const PROJECT_PLACEHOLDER = "<GCP_PROJECT_ID>";

/** Kebab-case a Space name into a stable slug used as the Space key AND the Vertex data-store id. */
export function slugifySpaceId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "new-space";
}

export interface SpaceProvisioningInput {
  name: string;
  scope: string;
  intendedSources: string[];
  gcpProjectId?: string;
  /** VERTEX_SEARCH_LOCATION: "global" | "us" | "eu". */
  vertexSearchLocation: string;
  existingVertexDataStoreIds: Record<string, string>;
  existingDriveFolderIds: Record<string, string>;
}

export interface SpaceProvisioningPlan {
  spaceId: string;
  dataStoreId: string;
  /** True when a Space with this slug already exists in either config map (a duplicate). */
  alreadyExists: boolean;
  /** The owner console steps (comments + commands), in order. */
  commands: string[];
  /** The exact .env.local lines to set (existing spaces preserved; the new space merged in). */
  envLocalLines: string[];
  /** Plain-English guidance and guardrails. */
  notes: string[];
}

function discoveryEngineEndpoint(location: string): string {
  return location === "global"
    ? "discoveryengine.googleapis.com"
    : `${location}-discoveryengine.googleapis.com`;
}

/**
 * Build the provisioning plan for a requested Space. Never mutates the input maps; the emitted env lines
 * are the CURRENT maps with the new Space merged in (existing Spaces preserved verbatim, so the 11-space
 * config is never dropped). The Vertex data store is created by the owner, not here.
 */
export function buildSpaceProvisioningPlan(
  input: SpaceProvisioningInput,
): SpaceProvisioningPlan {
  const spaceId = slugifySpaceId(input.name);
  const dataStoreId = spaceId;
  const alreadyExists =
    spaceId in input.existingVertexDataStoreIds ||
    spaceId in input.existingDriveFolderIds;
  const project = input.gcpProjectId?.trim() || PROJECT_PLACEHOLDER;
  const location = input.vertexSearchLocation;
  const endpoint = discoveryEngineEndpoint(location);

  const mergedVertex = { ...input.existingVertexDataStoreIds, [spaceId]: dataStoreId };
  const mergedDrive = {
    ...input.existingDriveFolderIds,
    [spaceId]: DRIVE_FOLDER_PLACEHOLDER,
  };

  const commands = [
    `# 1. Create the Vertex AI Search (Discovery Engine) data store for "${input.name}".`,
    "curl -X POST \\",
    `  "https://${endpoint}/v1/projects/${project}/locations/${location}/collections/default_collection/dataStores?dataStoreId=${dataStoreId}" \\`,
    '  -H "Authorization: Bearer $(gcloud auth print-access-token)" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"displayName":"${input.name}","industryVertical":"GENERIC","solutionTypes":["SOLUTION_TYPE_SEARCH"],"contentConfig":"CONTENT_REQUIRED"}'`,
    "# 2. Create a Google Drive folder for this Space's KB sources inside the pmikcmetro.com boundary and copy its folder id.",
    "# 3. Add both mappings to .env.local (the lines below), then import the sources:",
    "npm run import:agent-search",
  ];

  const envLocalLines = [
    `SPACE_VERTEX_DATA_STORE_IDS=${JSON.stringify(mergedVertex)}`,
    `SPACE_DRIVE_FOLDER_IDS=${JSON.stringify(mergedDrive)}`,
  ];

  const notes: string[] = [
    "These are owner console steps. The app records the request and prints the commands; it never provisions Vertex (that would bill).",
    "The SPACE maps must live in .env.local: npm run deploy reads them from there, so a value set only with a one-off env update is reverted on the next deploy.",
    `Replace ${DRIVE_FOLDER_PLACEHOLDER} with the real Drive folder id from step 2 before deploying.`,
    "After updating .env.local, deploy with: npm run deploy -- --budget-confirmed --allow-multiple-spaces",
  ];
  if (alreadyExists) {
    notes.unshift(
      `A Space keyed "${spaceId}" already exists in the config maps. Choose a different name or update the existing Space instead of creating a duplicate.`,
    );
  }
  if (!input.gcpProjectId?.trim()) {
    notes.push(
      `Set GCP_PROJECT_ID; the create command shows a ${PROJECT_PLACEHOLDER} placeholder until it is set.`,
    );
  }
  if (input.intendedSources.length > 0) {
    notes.push(
      `Intended sources to load into the data store: ${input.intendedSources.join("; ")}.`,
    );
  }

  return { spaceId, dataStoreId, alreadyExists, commands, envLocalLines, notes };
}
