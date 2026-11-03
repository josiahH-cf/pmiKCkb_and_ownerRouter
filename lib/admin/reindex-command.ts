import { createHash } from "node:crypto";
import {
  buildSourceCorpusReadiness,
  validateSourceManifest,
  type SourceManifestEntry,
} from "@/scripts/source-corpus-readiness.mjs";

export interface ReindexSourceSnapshot extends SourceManifestEntry {
  generation: string;
  dataSchema: "content" | "document";
}
export interface ReindexCommandInput {
  spaceId: string;
  dataStoreId?: string;
  gcpProjectId?: string;
  vertexSearchLocation: string;
  sourcePrefix?: string;
  sources?: readonly ReindexSourceSnapshot[];
  sourceReadError?: string;
}
export interface ReindexCommandPlan {
  runnable: boolean;
  command: string;
  notes: string[];
  sourceCount: number;
  sourceFingerprint: string | null;
}
const safeId = /^[a-z][a-z0-9-]{0,62}$/;
/** Pure manual handoff. Plan construction never uploads, creates a store or imports. */
export function buildReindexCommand(input: ReindexCommandInput): ReindexCommandPlan {
  const notes = [
    "This is a requested re-index handoff, not a completed import. Nothing is ingested automatically.",
    "Re-indexing is cost-bearing; you run the command yourself under its existing authorization.",
  ];
  const refuse = (reason: string): ReindexCommandPlan => ({
    runnable: false,
    command: "",
    notes: [reason, ...notes],
    sourceCount: 0,
    sourceFingerprint: null,
  });
  if (input.sourceReadError) return refuse(input.sourceReadError);
  const project = input.gcpProjectId?.trim(),
    store = input.dataStoreId?.trim(),
    location = input.vertexSearchLocation?.trim();
  if (!project || !safeId.test(project))
    return refuse(
      "A real configured Google Cloud project is required; no placeholder command was prepared.",
    );
  if (!store || !safeId.test(store))
    return refuse("No valid Vertex data store is configured for this Space.");
  if (!location || !safeId.test(location) || !safeId.test(input.spaceId))
    return refuse("The configured Space or search location is invalid.");
  const prefix = input.sourcePrefix?.replace(/\/+$/, "") + "/";
  if (!/^gs:\/\/[a-z0-9][a-z0-9._-]+\/[A-Za-z0-9][A-Za-z0-9._/-]*\/$/.test(prefix))
    return refuse(
      "This Space needs a verified Cloud Storage source prefix; no folder or URI was guessed.",
    );
  if (!input.sources?.length)
    return refuse("No current approved source inventory is available for this Space.");
  if (input.sources.length > 100)
    return refuse(
      "The source inventory exceeds the bounded 100-object handoff; narrow the existing source inventory first.",
    );
  const sources = [...input.sources].sort((a, b) => a.gcs_uri.localeCompare(b.gcs_uri));
  try {
    const entries = validateSourceManifest(sources),
      readiness = buildSourceCorpusReadiness(entries);
    if (!readiness.ok)
      return refuse(`Source inventory is not ready: ${readiness.blockers.join(" ")}`);
    if (
      entries.some(
        (s) =>
          s.space_id !== input.spaceId ||
          s.data_store_id !== store ||
          !s.gcs_uri.startsWith(prefix),
      )
    )
      return refuse(
        "The source inventory does not match the selected Space, store and exact source prefix.",
      );
  } catch {
    return refuse("The source inventory contains an invalid or unsafe source identity.");
  }
  if (
    sources.some(
      (s) =>
        !/^\d+$/.test(s.generation) || !["content", "document"].includes(s.dataSchema),
    )
  )
    return refuse("Source generation or explicit import format is unavailable.");
  const schema = sources[0].dataSchema;
  if (sources.some((s) => s.dataSchema !== schema))
    return refuse(
      "The source inventory mixes incompatible import formats; no partial command was prepared.",
    );
  const sourceFingerprint = createHash("sha256")
    .update(
      JSON.stringify(
        sources.map((s) => [
          s.gcs_uri,
          s.generation,
          s.dataSchema,
          s.approval_status,
          s.sensitivity,
        ]),
      ),
    )
    .digest("hex");
  const argv = [
    `--data-store=${store}`,
    `--project=${project}`,
    `--location=${location}`,
    `--data-schema=${schema}`,
    ...sources.map((s) => `--source-id=${s.gcs_uri}`),
    ...sources.map((s) => `--source-generation=${s.generation}`),
  ];
  return {
    runnable: true,
    command: `npm run import:agent-search -- ${argv.join(" ")}`,
    notes: [
      `${sources.length} approved source object(s), bound to their observed generations. The command checks metadata before dispatch; provider import is not isolated from later collaborator edits.`,
      ...notes,
    ],
    sourceCount: sources.length,
    sourceFingerprint,
  };
}
