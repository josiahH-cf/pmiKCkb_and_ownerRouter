import { Storage } from "@google-cloud/storage";
import type { AuthenticatedUser } from "@/lib/auth/session";
import type { ServerConfig } from "@/lib/config/server";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { launchSpaces } from "@/lib/spaces";
import { cloudStorageContentDocumentId } from "@/scripts/source-doc-id.mjs";
import type { ReindexSourceSnapshot } from "./reindex-command";

export interface ReindexObject {
  name: string;
  generation?: string;
  contentType?: string;
  dataSchema?: string;
}
export interface ReindexSourceDependencies {
  listObjects(bucket: string, prefix: string): Promise<readonly ReindexObject[]>;
  readSourceMeta(id: string): Promise<Record<string, unknown> | null>;
}
class SourceInventoryError extends Error {}
function defaultDependencies(): ReindexSourceDependencies {
  return {
    async listObjects(bucket, prefix) {
      const [files, nextQuery] = await new Storage()
        .bucket(bucket)
        .getFiles({ prefix, maxResults: 101, autoPaginate: false });
      if (nextQuery) throw new Error("source_inventory_truncated");
      return files.map((file) => ({
        name: file.name,
        generation: file.metadata.generation?.toString(),
        contentType: file.metadata.contentType,
        dataSchema: file.metadata.metadata?.data_schema as string | undefined,
      }));
    },
    async readSourceMeta(id) {
      const snapshot = await getAdminFirestore().collection("sources_meta").doc(id).get();
      return snapshot.exists ? (snapshot.data() ?? null) : null;
    },
  };
}
/** Bounded metadata-only inventory under the Space's existing source root; never imports. */
export async function readReindexSources(
  actor: AuthenticatedUser,
  spaceId: string,
  config: Pick<ServerConfig, "spaceDriveFolderIds" | "spaceVertexDataStoreIds">,
  dependencies = defaultDependencies(),
): Promise<{
  sources: ReindexSourceSnapshot[];
  sourcePrefix?: string;
  sourceReadError?: string;
}> {
  if (actor.role !== "Admin")
    throw new EditableLayerError("Only an Admin can prepare a re-index handoff.", 403);
  const root = config.spaceDriveFolderIds[spaceId]?.replace(/\/+$/, "");
  const match =
    root && /^gs:\/\/([a-z0-9][a-z0-9._-]+)\/([A-Za-z0-9][A-Za-z0-9._/-]*)$/.exec(root);
  if (
    !launchSpaces.some((s) => s.id === spaceId) ||
    !match ||
    !config.spaceVertexDataStoreIds[spaceId]
  )
    return {
      sources: [],
      sourceReadError:
        "A configured existing Space, data store and Cloud Storage source prefix are required.",
    };
  const sourcePrefix = `${root}/`,
    objectPrefix = `${match[2]}/`;
  try {
    const objects = await dependencies.listObjects(match[1], objectPrefix);
    if (objects.length > 100)
      return {
        sources: [],
        sourcePrefix,
        sourceReadError:
          "The source inventory exceeds the bounded 100-object handoff; no partial inventory was used.",
      };
    const sources = await Promise.all(
      objects.map(async (object): Promise<ReindexSourceSnapshot> => {
        if (!object.name.startsWith(objectPrefix))
          throw new SourceInventoryError(
            "An object is outside this Space's exact source prefix; no partial command was prepared.",
          );
        const uri = `gs://${match[1]}/${object.name}`;
        const meta = await dependencies
          .readSourceMeta(cloudStorageContentDocumentId(uri))
          .catch(() => {
            throw new SourceInventoryError(
              "Source approval metadata could not be read; no empty or partial success was inferred.",
            );
          });
        if (!meta)
          throw new SourceInventoryError(
            "Approval metadata is absent for a source object. Recover its existing approval before preparing a command.",
          );
        if (meta.space_id !== spaceId)
          throw new SourceInventoryError(
            "Source approval metadata belongs to another Space; no command was prepared.",
          );
        const contentMime = [
          "text/plain",
          "text/markdown",
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ].includes(object.contentType ?? "");
        const schema =
          object.dataSchema ??
          (contentMime && !/\.jsonl$/i.test(object.name) ? "content" : undefined);
        if (schema !== "content" && schema !== "document")
          throw new SourceInventoryError(
            "The source import format is not established by its metadata. Verify its content format before preparing a command.",
          );
        return {
          space_id: String(meta.space_id),
          source_path: object.name,
          gcs_uri: uri,
          data_store_id: config.spaceVertexDataStoreIds[spaceId],
          approval_status: String(meta.approval_status ?? ""),
          sensitivity: String(meta.sensitivity ?? ""),
          generation: object.generation ?? "",
          dataSchema: schema,
        };
      }),
    );
    return { sources, sourcePrefix };
  } catch (error) {
    return {
      sources: [],
      sourcePrefix,
      sourceReadError:
        error instanceof SourceInventoryError
          ? error.message
          : "The source object inventory could not be read completely. No empty or partial success was inferred; retry its existing read owner.",
    };
  }
}
