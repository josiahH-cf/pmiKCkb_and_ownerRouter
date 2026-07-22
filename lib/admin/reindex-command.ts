// Pure re-index command generator for the Admin "re-index sources" control (Slice 8, D14).
//
// Vertex ingestion (importDocuments) is COST-BEARING and lives in a CLI-only script
// (scripts/import-agent-search-documents.mjs). The app never calls it: this control STAGES a re-index
// request and prints the exact owner command to run. Running it is an explicit owner action; the app
// never auto-runs ingestion. Pure + deterministic: no I/O.

export interface ReindexCommandInput {
  spaceId: string;
  /** The Space's Vertex data store id (from SPACE_VERTEX_DATA_STORE_IDS), if configured. */
  dataStoreId?: string;
  gcpProjectId?: string;
  vertexSearchLocation: string;
}

export interface ReindexCommandPlan {
  /** True only when the Space maps to a configured Vertex data store (a runnable command). */
  runnable: boolean;
  /** The exact owner command to run (or an explanation when the Space has no data store). */
  command: string;
  notes: string[];
}

/** Build the owner re-index command for a Space. Never runs anything; prints the command only. */
export function buildReindexCommand(input: ReindexCommandInput): ReindexCommandPlan {
  const project = input.gcpProjectId?.trim() || "<GCP_PROJECT_ID>";
  const location = input.vertexSearchLocation;
  const dataStore = input.dataStoreId?.trim();

  const notes: string[] = [
    "Re-indexing runs Vertex ingestion, which is cost-bearing. The app never runs it; you run the command yourself.",
    "This control only records the request and prints the command. Nothing is ingested until you run it.",
  ];

  if (!dataStore) {
    return {
      runnable: false,
      command: `# No Vertex data store is configured for the Space "${input.spaceId}". Add it to SPACE_VERTEX_DATA_STORE_IDS in .env.local first (see Request a new Space).`,
      notes,
    };
  }

  if (!input.gcpProjectId?.trim()) {
    notes.push(
      "Set GCP_PROJECT_ID; the command shows a <GCP_PROJECT_ID> placeholder until it is set.",
    );
  }

  return {
    runnable: true,
    command: `npm run import:agent-search -- --data-store=${dataStore} --project=${project} --location=${location}`,
    notes,
  };
}
