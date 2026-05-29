import type { Firestore } from "firebase-admin/firestore";
import { readServerConfig, type ServerConfig } from "@/lib/config/server";
import { getAdminFirestore } from "@/lib/firestore/admin";
import type { SourceState } from "@/lib/source-state";
import { launchSpaces } from "@/lib/spaces";

const COLLECTIONS = {
  askLogs: "ask_logs",
  notificationLogs: "notification_logs",
  placeholders: "placeholders",
  sops: "sops",
  sourcesMeta: "sources_meta",
  templates: "templates",
} as const;

export interface AdminObservability {
  askLast30Days: number;
  askLast7Days: number;
  notificationFailures: number;
  openPlaceholdersByOwner: Record<string, number>;
  queueDepthByType: Record<"Placeholder" | "SOP" | "Template", number>;
  setupHealth: Array<{
    dataStoreConfigured: boolean;
    readOnly: boolean;
    sourceMetaCount: number;
    sourceTargetConfigured: boolean;
    spaceId: string;
    spaceName: string;
  }>;
  sourceStateCounts: Partial<Record<SourceState, number>>;
  topSpaces: Array<{ count: number; spaceId: string; spaceName: string }>;
}

export async function readAdminObservability({
  config = readServerConfig(),
  db = getAdminFirestore(),
  now = new Date(),
}: {
  config?: ServerConfig;
  db?: Firestore;
  now?: Date;
} = {}): Promise<AdminObservability> {
  const [askLogs, sops, templates, placeholders, sourcesMeta, notificationLogs] =
    await Promise.all([
      readCollection(db, COLLECTIONS.askLogs),
      readCollection(db, COLLECTIONS.sops),
      readCollection(db, COLLECTIONS.templates),
      readCollection(db, COLLECTIONS.placeholders),
      readCollection(db, COLLECTIONS.sourcesMeta),
      readCollection(db, COLLECTIONS.notificationLogs),
    ]);
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recentAskLogs = askLogs.filter(
    (record) => readTime(record.created_at) >= thirtyDaysAgo,
  );

  return {
    askLast30Days: recentAskLogs.length,
    askLast7Days: askLogs.filter((record) => readTime(record.created_at) >= sevenDaysAgo)
      .length,
    notificationFailures: notificationLogs.filter((record) => record.status === "Failed")
      .length,
    openPlaceholdersByOwner: countBy(
      placeholders.filter((record) => record.status === "Open"),
      (record) => readString(record.owner_uid) ?? "Unassigned",
    ),
    queueDepthByType: {
      Placeholder: placeholders.filter(
        (record) => record.status === "Open" || record.status === "In Review",
      ).length,
      SOP: sops.filter((record) => record.status === "In Review").length,
      Template: templates.filter((record) => record.status === "In Review").length,
    },
    setupHealth: launchSpaces.map((space) => ({
      dataStoreConfigured: Boolean(config.spaceVertexDataStoreIds[space.id]?.trim()),
      readOnly: space.readOnly === true,
      sourceMetaCount: sourcesMeta.filter((record) => record.space_id === space.id)
        .length,
      sourceTargetConfigured: Boolean(config.spaceDriveFolderIds[space.id]?.trim()),
      spaceId: space.id,
      spaceName: space.name,
    })),
    sourceStateCounts: countBy(
      recentAskLogs,
      (record) => readString(record.source_state) ?? "No Reliable Source Found",
    ) as Partial<Record<SourceState, number>>,
    topSpaces: topSpaceCounts(recentAskLogs),
  };
}

async function readCollection(db: Firestore, collection: string) {
  const snapshot = await db.collection(collection).get();
  return snapshot.docs.map(
    (doc) =>
      normalizeFirestoreValue({ id: doc.id, ...doc.data() }) as Record<string, unknown>,
  );
}

function topSpaceCounts(records: Array<Record<string, unknown>>) {
  return Object.entries(
    countBy(records, (record) => readString(record.space_id) ?? "all-configured"),
  )
    .map(([spaceId, count]) => ({
      count,
      spaceId,
      spaceName: launchSpaces.find((space) => space.id === spaceId)?.name ?? spaceId,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

function countBy<T>(records: T[], keyFor: (record: T) => string) {
  const counts: Record<string, number> = {};

  for (const record of records) {
    const key = keyFor(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function readTime(value: unknown) {
  const text = readString(value);
  const time = text ? Date.parse(text) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;

    if (typeof toDate === "function") {
      return toDate.call(value).toISOString();
    }
  }

  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        key,
        normalizeFirestoreValue(childValue),
      ]),
    );
  }

  return value;
}
