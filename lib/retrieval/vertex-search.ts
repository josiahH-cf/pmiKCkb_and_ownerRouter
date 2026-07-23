import { v1beta } from "@google-cloud/discoveryengine";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firestore/admin";
import type {
  Sensitivity,
  SourceApprovalStatus,
  SourceMetaRecord,
} from "@/lib/firestore/types";
import type { Citation } from "@/lib/schemas";
import { computeSourceFreshness } from "@/lib/retrieval/source-freshness";
import type { ServerConfig } from "@/lib/config/server";
import { launchSpaces } from "@/lib/spaces";

const COLLECTIONS = {
  sourcesMeta: "sources_meta",
} as const;

const DEFAULT_COLLECTION_ID = "default_collection";
const DEFAULT_SERVING_CONFIG_ID = "default_config";
const DEFAULT_PAGE_SIZE = 10;

type SearchClientOptions = ConstructorParameters<typeof v1beta.SearchServiceClient>[0];

type SearchCallOptions = {
  autoPaginate: false;
};

type SearchRequest = {
  contentSearchSpec: {
    snippetSpec: {
      returnSnippet: boolean;
    };
  };
  pageSize: number;
  query: string;
  servingConfig: string;
};

type SearchResponse = {
  results?: SearchResult[];
};

type SearchResult = {
  document?: SearchDocument | null;
  id?: string | null;
  modelScores?: Record<string, { values?: number[] | null } | null>;
  rankSignals?: {
    keywordSimilarityScore?: number | null;
    relevanceScore?: number | null;
    semanticSimilarityScore?: number | null;
  } | null;
};

type SearchDocument = {
  derivedStructData?: unknown;
  id?: string | null;
  name?: string | null;
  structData?: unknown;
};

export interface GroundedSearchSource {
  approvalStatus?: SourceApprovalStatus;
  citation: Citation;
  confidence?: number;
  driveFileId: string;
  sensitivity?: Sensitivity;
  sourceId: string;
  spaceId: string;
}

export interface GroundedSearchResult {
  sources: GroundedSearchSource[];
  sourceIds: string[];
  citations: Citation[];
  confidence?: number;
  hasConflict?: boolean;
  hasOpenPlaceholder?: boolean;
}

export interface RetrievalSearchRequest {
  question: string;
  spaceId?: string;
}

export interface RetrievalClient {
  search(request: RetrievalSearchRequest): Promise<GroundedSearchResult>;
}

export interface VertexSearchApiClient {
  projectLocationCollectionDataStoreServingConfigPath(
    project: string,
    location: string,
    collection: string,
    dataStore: string,
    servingConfig: string,
  ): string;
  search(
    request: SearchRequest,
    options: SearchCallOptions,
  ): Promise<[unknown, unknown, SearchResponse]>;
}

export interface SourceMetaReader {
  readByDriveFileIds(
    driveFileIds: readonly string[],
  ): Promise<Map<string, SourceMetaRecord>>;
}

export class RetrievalSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetrievalSetupError";
  }
}

export class NotConfiguredRetrievalClient implements RetrievalClient {
  async search(): Promise<GroundedSearchResult> {
    return {
      sources: [],
      sourceIds: [],
      citations: [],
      confidence: 0,
    };
  }
}

export class FirestoreSourceMetaReader implements SourceMetaReader {
  constructor(private readonly db: Firestore = getAdminFirestore()) {}

  async readByDriveFileIds(driveFileIds: readonly string[]) {
    const uniqueIds = Array.from(new Set(driveFileIds.filter(Boolean)));
    const entries = await Promise.all(
      uniqueIds.map(async (driveFileId) => {
        const snapshot = await this.db
          .collection(COLLECTIONS.sourcesMeta)
          .doc(driveFileId)
          .get();

        if (!snapshot.exists) {
          return null;
        }

        const data = snapshot.data() ?? {};
        const reviewInterval = data.review_interval_days;
        const record: SourceMetaRecord = {
          drive_file_id: driveFileId,
          space_id: readString(data.space_id) ?? "",
          approval_status: readSourceApprovalStatus(data.approval_status) ?? "Unreviewed",
          sensitivity: readSensitivity(data.sensitivity) ?? "Low",
          last_reviewed_at: readString(data.last_reviewed_at),
          reviewer_uid: readString(data.reviewer_uid),
          ...(typeof reviewInterval === "number" && Number.isFinite(reviewInterval)
            ? { review_interval_days: reviewInterval }
            : {}),
        };

        return [driveFileId, record] as const;
      }),
    );

    return new Map(entries.filter((entry) => entry !== null));
  }
}

export class VertexSearchRetrievalClient implements RetrievalClient {
  private readonly client: VertexSearchApiClient;
  private readonly sourceMetaReader: SourceMetaReader;

  constructor(
    private readonly config: ServerConfig,
    options: {
      client?: VertexSearchApiClient;
      sourceMetaReader?: SourceMetaReader;
    } = {},
  ) {
    this.client =
      options.client ??
      (new v1beta.SearchServiceClient({
        apiEndpoint: discoveryEngineEndpoint(config.vertexSearchLocation),
      } satisfies SearchClientOptions) as VertexSearchApiClient);
    this.sourceMetaReader = options.sourceMetaReader ?? new FirestoreSourceMetaReader();
  }

  async search(request: RetrievalSearchRequest): Promise<GroundedSearchResult> {
    const targets = resolveSearchTargets(this.config, request.spaceId);
    const responses = await Promise.all(
      targets.map(async (target) => {
        const searchResponse = await this.searchTarget(request.question, target);
        return normalizeSearchSources(target.spaceId, searchResponse.results ?? []);
      }),
    );
    const sources = responses.flat();
    const metaByDriveFileId = await this.sourceMetaReader.readByDriveFileIds(
      sources.map((source) => source.driveFileId),
    );

    const referenceDateIso = new Date().toISOString();
    return toGroundedSearchResult(
      sources
        .map((source) => withSourceMeta(source, metaByDriveFileId, referenceDateIso))
        .filter(isUsableSource)
        .filter((source) =>
          isAboveThreshold(source, this.config.groundingConfidenceThreshold),
        ),
    );
  }

  private async searchTarget(question: string, target: SearchTarget) {
    const servingConfig = this.client.projectLocationCollectionDataStoreServingConfigPath(
      requiredProjectId(this.config),
      this.config.vertexSearchLocation,
      DEFAULT_COLLECTION_ID,
      target.dataStoreId,
      DEFAULT_SERVING_CONFIG_ID,
    );
    const [, , response] = await this.client.search(
      {
        contentSearchSpec: {
          snippetSpec: {
            returnSnippet: true,
          },
        },
        pageSize: DEFAULT_PAGE_SIZE,
        query: question,
        servingConfig,
      },
      { autoPaginate: false },
    );

    return response;
  }
}

interface SearchTarget {
  dataStoreId: string;
  driveFolderId: string;
  spaceId: string;
}

export function resolveSearchTargets(
  config: Pick<
    ServerConfig,
    | "gcpProjectId"
    | "spaceDriveFolderIds"
    | "spaceVertexDataStoreIds"
    | "vertexSearchLocation"
  >,
  spaceId?: string,
): SearchTarget[] {
  requiredProjectId(config);

  if (!config.vertexSearchLocation) {
    throw new RetrievalSetupError("Missing Vertex AI Search location.");
  }

  if (spaceId) {
    assertKnownSpace(spaceId);
    const target = resolveSearchTarget(config, spaceId);

    if (!target) {
      throw new RetrievalSetupError(`Missing retrieval setup for Space "${spaceId}".`);
    }

    return [target];
  }

  const targets = launchSpaces
    .map((space) => resolveSearchTarget(config, space.id, { allowMissing: true }))
    .filter((target): target is SearchTarget => target !== null);

  if (targets.length === 0) {
    throw new RetrievalSetupError("No Vertex AI Search data stores are configured.");
  }

  return targets;
}

export function normalizeSearchSources(
  spaceId: string,
  results: readonly SearchResult[],
): GroundedSearchSource[] {
  return results.flatMap((result) => {
    const source = normalizeSearchSource(spaceId, result);
    return source ? [source] : [];
  });
}

function resolveSearchTarget(
  config: Pick<ServerConfig, "spaceDriveFolderIds" | "spaceVertexDataStoreIds">,
  spaceId: string,
  options: { allowMissing?: boolean } = {},
): SearchTarget | null {
  const dataStoreId = config.spaceVertexDataStoreIds[spaceId]?.trim();
  const driveFolderId = config.spaceDriveFolderIds[spaceId]?.trim();

  if (!dataStoreId || !driveFolderId) {
    if (options.allowMissing) {
      return null;
    }

    const missing = [
      !driveFolderId ? "source target" : null,
      !dataStoreId ? "Agent Search data store ID" : null,
    ].filter(Boolean);

    throw new RetrievalSetupError(
      `Missing ${missing.join(" and ")} for Space "${spaceId}".`,
    );
  }

  return {
    dataStoreId,
    driveFolderId,
    spaceId,
  };
}

function normalizeSearchSource(
  spaceId: string,
  result: SearchResult,
): GroundedSearchSource | null {
  const document = result.document;

  if (!document) {
    return null;
  }

  const structData = structToRecord(document.structData);
  const derivedStructData = structToRecord(document.derivedStructData);
  const rawUrl =
    readString(derivedStructData.link) ??
    readString(derivedStructData.uri) ??
    readString(structData.link) ??
    readString(structData.uri);
  const driveUrlFileId = extractDriveFileId(rawUrl);
  const sourceId =
    driveUrlFileId ??
    readString(document.id) ??
    extractDocumentId(document.name) ??
    readString(result.id) ??
    normalizeCloudStorageUri(rawUrl);
  const url =
    cloudStorageBrowserUrl(rawUrl) ??
    validUrl(rawUrl) ??
    (driveUrlFileId ? `https://drive.google.com/file/d/${driveUrlFileId}/view` : null);

  if (!sourceId || !url) {
    return null;
  }

  const title =
    readString(structData.title) ??
    readString(derivedStructData.title) ??
    readString(structData.name) ??
    readString(derivedStructData.name) ??
    document.name ??
    sourceId;

  return {
    citation: {
      source_id: sourceId,
      title,
      url,
      excerpt:
        readExtractiveAnswer(derivedStructData.extractive_answers) ??
        readSnippet(derivedStructData.snippets),
    },
    confidence: readConfidence(result),
    driveFileId: sourceId,
    sourceId,
    spaceId,
  };
}

function toGroundedSearchResult(
  sources: readonly GroundedSearchSource[],
): GroundedSearchResult {
  const deduped = dedupeBySourceId(sources);

  return {
    sources: deduped,
    sourceIds: deduped.map((source) => source.sourceId),
    citations: deduped.map((source) => source.citation),
    confidence: maxConfidence(deduped),
  };
}

function withSourceMeta(
  source: GroundedSearchSource,
  metaByDriveFileId: ReadonlyMap<string, SourceMetaRecord>,
  referenceDateIso: string,
): GroundedSearchSource {
  const meta = metaByDriveFileId.get(source.driveFileId);

  if (!meta) {
    return source;
  }

  // Surface the existing review date on the citation so the Ask result can show "reviewed <date>"
  // (Slice 5, D13). Only when present; never fabricated. toGroundedSearchResult maps source.citation
  // into grounding.citations, and canonicalizeValidCitations returns those trusted citations verbatim.
  let citation = meta.last_reviewed_at
    ? { ...source.citation, last_reviewed_at: meta.last_reviewed_at }
    : source.citation;

  // S32: stamp the computed freshness signal ONLY when it is determinable (a review interval is set).
  // Absent interval -> "unknown" -> no freshness field -> no chip (honest absence, never fabricated).
  const freshness = computeSourceFreshness({
    lastReviewedAt: meta.last_reviewed_at,
    reviewIntervalDays: meta.review_interval_days,
    referenceDateIso,
  });
  if (freshness.status !== "unknown") {
    citation = { ...citation, freshness };
  }

  return {
    ...source,
    approvalStatus: meta.approval_status,
    sensitivity: meta.sensitivity,
    citation,
  };
}

function isUsableSource(source: GroundedSearchSource) {
  return source.approvalStatus !== "Deprecated" && source.sensitivity !== "High";
}

function isAboveThreshold(source: GroundedSearchSource, threshold: number) {
  return source.confidence === undefined || source.confidence >= threshold;
}

function requiredProjectId(config: Pick<ServerConfig, "gcpProjectId">) {
  if (!config.gcpProjectId) {
    throw new RetrievalSetupError("Missing GCP_PROJECT_ID for Vertex AI Search.");
  }

  return config.gcpProjectId;
}

function assertKnownSpace(spaceId: string) {
  if (!launchSpaces.some((space) => space.id === spaceId)) {
    throw new RetrievalSetupError(`Unknown Space "${spaceId}".`);
  }
}

function discoveryEngineEndpoint(location: string) {
  return location === "global"
    ? "discoveryengine.googleapis.com"
    : `${location}-discoveryengine.googleapis.com`;
}

function structToRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  if ("fields" in value && typeof value.fields === "object" && value.fields !== null) {
    return Object.fromEntries(
      Object.entries(value.fields).map(([key, fieldValue]) => [
        key,
        protoValueToNative(fieldValue),
      ]),
    );
  }

  return value as Record<string, unknown>;
}

function protoValueToNative(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if ("stringValue" in value) {
    return value.stringValue;
  }

  if ("numberValue" in value) {
    return value.numberValue;
  }

  if ("boolValue" in value) {
    return value.boolValue;
  }

  if ("structValue" in value) {
    return structToRecord(value.structValue);
  }

  if (
    "listValue" in value &&
    value.listValue &&
    typeof value.listValue === "object" &&
    "values" in value.listValue &&
    Array.isArray(value.listValue.values)
  ) {
    return value.listValue.values.map(protoValueToNative);
  }

  if ("nullValue" in value) {
    return null;
  }

  return value;
}

function readExtractiveAnswer(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => readString((entry as Record<string, unknown>).content))
    .find(Boolean);
}

function readSnippet(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((entry) => readString((entry as Record<string, unknown>).snippet))
    .find(Boolean);
}

function readConfidence(result: SearchResult) {
  return (
    result.rankSignals?.relevanceScore ??
    result.rankSignals?.semanticSimilarityScore ??
    result.rankSignals?.keywordSimilarityScore ??
    result.modelScores?.semantic_similarity_score?.values?.[0] ??
    result.modelScores?.relevance_score?.values?.[0] ??
    undefined
  );
}

function dedupeBySourceId(sources: readonly GroundedSearchSource[]) {
  const bySourceId = new Map<string, GroundedSearchSource>();

  for (const source of sources) {
    const current = bySourceId.get(source.sourceId);

    if (!current || (source.confidence ?? 0) > (current.confidence ?? 0)) {
      bySourceId.set(source.sourceId, source);
    }
  }

  return Array.from(bySourceId.values());
}

function maxConfidence(sources: readonly GroundedSearchSource[]) {
  const confidenceValues = sources
    .map((source) => source.confidence)
    .filter((value): value is number => typeof value === "number");

  if (confidenceValues.length === 0) {
    return undefined;
  }

  return Math.max(...confidenceValues);
}

function extractDriveFileId(url: string | undefined) {
  if (!url) {
    return undefined;
  }

  const directMatch = url.match(
    /\/(?:file|document|spreadsheets|presentation)\/d\/([^/?#]+)/,
  );

  if (directMatch) {
    return decodeURIComponent(directMatch[1]);
  }

  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get("id") ?? undefined;
  } catch {
    return undefined;
  }
}

function extractDocumentId(name: string | null | undefined) {
  if (!name) {
    return undefined;
  }

  return name.split("/documents/")[1];
}

function cloudStorageBrowserUrl(url: string | undefined) {
  const gcsUri = normalizeCloudStorageUri(url);

  if (!gcsUri) {
    return null;
  }

  try {
    const parsedUrl = new URL(gcsUri);
    const objectPath = parsedUrl.pathname
      .replace(/^\/+/, "")
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    return `https://storage.cloud.google.com/${parsedUrl.hostname}/${objectPath}`;
  } catch {
    return null;
  }
}

function normalizeCloudStorageUri(url: string | undefined) {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "gs:" || !parsedUrl.hostname) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function validUrl(url: string | undefined) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readSourceApprovalStatus(value: unknown): SourceApprovalStatus | undefined {
  return value === "Unreviewed" ||
    value === "Transcript-derived" ||
    value === "Approved" ||
    value === "Deprecated"
    ? value
    : undefined;
}

function readSensitivity(value: unknown): Sensitivity | undefined {
  return value === "Low" || value === "Medium" || value === "High" ? value : undefined;
}
