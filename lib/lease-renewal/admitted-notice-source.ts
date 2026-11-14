import type { AuthenticatedUser } from "@/lib/auth/session";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firestore/admin";
import {
  reserveRenewalNoticeLease,
  readRenewalNoticeSourceMinimum,
  readRenewalNoticePortfolioMinimum,
  withRenewalNoticeAdmission,
} from "@/lib/firestore/renewal-notice-safety";
import { renewalWorkspaceDocId } from "@/lib/firestore/renewal-workspace";
import {
  classifyLeaseDataAge,
  fetchLiveLeaseSnapshot,
  getLiveLeaseSnapshot,
  getLiveLeaseSnapshotAtOrAfter,
  LEASE_EXPORT_TTL_MS,
  LEASE_REFRESH_BACKOFF_BASE_MS,
  liveLeaseSnapshotHasAdmission,
  peekAdmittedLiveLeaseSnapshot,
  readLiveLeaseSnapshotForAdmission,
  type LeaseExportReader,
  type LiveLeaseSnapshot,
} from "./live-lease-cache";
import {
  LEASE_STATUS_TABLE_TTL_MS,
  leaseStatusTableHasAdmission,
  peekAdmittedLeaseStatusTable,
  readLeaseStatusTable,
  readLeaseStatusTableForAdmission,
  type LeaseStatusTableReader,
} from "./lease-status-table";
import { noticeAdmissionContextFor } from "./notice-source-admission";
import { RenewalNoticeSourceError } from "./notice-source-error";

type Reader = LeaseExportReader & LeaseStatusTableReader;
type AdmittedRead = Awaited<ReturnType<typeof readLiveLeaseSnapshotForAdmission>> & {
  statusTable: Awaited<ReturnType<typeof readLeaseStatusTableForAdmission>>;
};
type Minimum = { leaseKeys: readonly string[]; lease: number; status: number };

/** Display-only provider/cache reads with no notice admission hooks. */
export async function readOnlyRenewalDisplaySource(reader: Reader, nowMs: number) {
  const [lease, statusTable] = await Promise.all([
    getLiveLeaseSnapshot(reader, nowMs),
    readLeaseStatusTable(reader, nowMs),
  ]);
  return { ...lease, statusTable };
}

type DisplayStatusRead = NonNullable<ReturnType<typeof peekAdmittedLeaseStatusTable>>;
type PortfolioDisplayRead = Omit<AdmittedRead, "statusTable"> & {
  statusTable: DisplayStatusRead;
};
interface DisplayReadCache<T> {
  value?: T;
  pending?: Promise<T | undefined>;
  retryAt?: number;
}
interface PortfolioDisplayCache {
  lease: DisplayReadCache<LiveLeaseSnapshot>;
  status: DisplayReadCache<DisplayStatusRead>;
}
const portfolioDisplayCaches = new WeakMap<object, PortfolioDisplayCache>();

function readDisplayHalf<T extends { readAtMs: number }>(
  cache: DisplayReadCache<T>,
  admitted: T | null,
  minimum: number,
  now: number,
  ttlMs: number,
  read: () => Promise<T>,
): T | Promise<T | undefined> | undefined {
  const usable = (value: T | null | undefined): value is T =>
    !!value && value.readAtMs >= minimum && now - value.readAtMs < ttlMs;
  if (usable(admitted)) return admitted;
  if (usable(cache.value)) return cache.value;
  if (cache.pending) return cache.pending;
  if (now < Math.max(minimum, cache.retryAt ?? 0)) return undefined;
  cache.pending = Promise.resolve()
    .then(read)
    .then((value) => (cache.value = value))
    .catch(() => {
      cache.retryAt = Date.now() + LEASE_REFRESH_BACKOFF_BASE_MS;
      return undefined;
    })
    .finally(() => {
      cache.pending = undefined;
    });
  return cache.pending;
}

/**
 * Counts-only views need both source generations to meet the current durable notice floors.
 * Reuse verified facts when they are in this runtime. Otherwise, share one display-only read
 * per missing half without installing it as admitted evidence or disturbing an approval read.
 */
export async function readRenewalPortfolioForDisplay(
  actor: AuthenticatedUser,
  reader: Reader,
  db: Firestore = getAdminFirestore(),
): Promise<PortfolioDisplayRead | undefined> {
  const minimum = await readRenewalNoticePortfolioMinimum(actor, db);
  const now = Date.now();
  const listLeaseStatuses = reader.listLeaseStatuses?.bind(reader);
  if (!listLeaseStatuses) return undefined;
  const context = noticeAdmissionContextFor(db, reader);
  const cache = portfolioDisplayCaches.get(context) ?? { lease: {}, status: {} };
  portfolioDisplayCaches.set(context, cache);
  const lease = peekAdmittedLiveLeaseSnapshot(now, context, minimum.leaseKeys);
  const status = peekAdmittedLeaseStatusTable(now, context, minimum.leaseKeys);
  const [snapshot, statusTable] = await Promise.all([
    readDisplayHalf(cache.lease, lease, minimum.lease, now, LEASE_EXPORT_TTL_MS, () =>
      fetchLiveLeaseSnapshot(reader, now),
    ),
    readDisplayHalf(
      cache.status,
      status,
      minimum.status,
      now,
      LEASE_STATUS_TABLE_TTL_MS,
      async () => ({
        status: "available",
        statuses: Object.freeze([...(await listLeaseStatuses())]),
        readAtMs: now,
        noticeAdmitted: false,
        admittedLeaseKeys: [],
      }),
    ),
  ]);
  if (!snapshot?.complete || !statusTable) return undefined;
  const latest = await readRenewalNoticePortfolioMinimum(actor, db);
  const completedAt = Date.now();
  if (
    snapshot.readAtMs < latest.lease ||
    statusTable.readAtMs < latest.status ||
    classifyLeaseDataAge(snapshot.readAtMs, completedAt) !== "fresh" ||
    completedAt - statusTable.readAtMs >= LEASE_STATUS_TABLE_TTL_MS
  )
    return undefined;
  return {
    snapshot,
    statusTable,
    currency: {
      state: "fresh",
      ageMs: Math.max(0, completedAt - snapshot.readAtMs),
      readAtMs: snapshot.readAtMs,
      refreshing: false,
      lastError: false,
    },
  };
}

interface AdmissionScope {
  context: object;
  pending: Map<string, Promise<{ read: AdmittedRead; leaseKeys: readonly string[] }>>;
}
const scopes = new WeakMap<object, AdmissionScope>();
function scopeFor(db: Firestore, rawReader: object): AdmissionScope {
  const context = noticeAdmissionContextFor(db, rawReader);
  let scope = scopes.get(context);
  if (!scope) {
    scope = { context, pending: new Map() };
    scopes.set(context, scope);
  }
  return scope;
}

async function readSharedAdmittedSource(
  reader: Reader,
  nowMs: number,
  scope: AdmissionScope,
  slot: string,
  readMinimum: () => Promise<Minimum>,
  initialLeaseSnapshot?: AdmittedRead["snapshot"],
  joinRevalidation = false,
): Promise<AdmittedRead> {
  let pending = scope.pending.get(slot);
  if (!pending) {
    pending = (async () => {
      let minimum = await readMinimum();
      let previous: AdmittedRead | undefined;
      let replacedInitialLease = false;
      // One initial pass plus one catch-up pass bounds work, including newly registered keys.
      for (let pass = 0; pass < 2; pass += 1) {
        const currentAt = Math.max(nowMs, Date.now());
        const held = previous;
        const heldLease =
          held &&
          held.snapshot.readAtMs >= minimum.lease &&
          minimum.leaseKeys.every((key) =>
            held.snapshot.noticeAdmission?.leaseKeys.includes(key),
          )
            ? held
            : null;
        if (
          heldLease &&
          !liveLeaseSnapshotHasAdmission(
            heldLease.snapshot,
            currentAt,
            scope.context,
            minimum.leaseKeys,
          )
        )
          throw new RenewalNoticeSourceError("lease_not_current");
        // Display callers already acquired their initial generation before reading minima.
        // Refuse before dispatching a second replacement, even when durable authority churns.
        if (!heldLease && replacedInitialLease)
          throw new RenewalNoticeSourceError("replacement_limit");
        const read =
          heldLease ??
          (await readLiveLeaseSnapshotForAdmission(
            reader,
            currentAt,
            scope.context,
            minimum.leaseKeys,
            minimum.lease,
            { joinRevalidation },
          ));
        if (initialLeaseSnapshot && read.snapshot !== initialLeaseSnapshot)
          replacedInitialLease = true;
        const heldStatus =
          held?.statusTable.status === "available" &&
          (held.statusTable.readAtMs ?? -1) >= minimum.status &&
          minimum.leaseKeys.every(
            (key) =>
              held.statusTable.status === "available" &&
              held.statusTable.admittedLeaseKeys?.includes(key),
          )
            ? held.statusTable
            : null;
        if (
          heldStatus &&
          !leaseStatusTableHasAdmission(
            heldStatus,
            Math.max(nowMs, Date.now()),
            scope.context,
            minimum.leaseKeys,
          )
        )
          throw new RenewalNoticeSourceError("status_not_current");
        const statusTable =
          heldStatus ??
          (await readLeaseStatusTableForAdmission(
            reader,
            Math.max(nowMs, Date.now()),
            scope.context,
            minimum.leaseKeys,
            minimum.status,
          ));
        previous = { ...read, statusTable };
        minimum = await readMinimum();
        if (
          read.snapshot.readAtMs >= minimum.lease &&
          statusTable.status === "available" &&
          (statusTable.readAtMs ?? -1) >= minimum.status &&
          minimum.leaseKeys.every(
            (key) =>
              read.snapshot.noticeAdmission?.leaseKeys.includes(key) &&
              statusTable.admittedLeaseKeys?.includes(key),
          )
        )
          return { read: previous, leaseKeys: minimum.leaseKeys };
      }
      // Keep the failing predicate without a lease id, timestamp, hash or provider response.
      throw new RenewalNoticeSourceError(
        previous!.snapshot.readAtMs < minimum.lease
          ? "lease_minimum_advanced"
          : previous!.statusTable.status !== "available"
            ? "status_unavailable"
            : (previous!.statusTable.readAtMs ?? -1) < minimum.status
              ? "status_minimum_advanced"
              : !minimum.leaseKeys.every((key) =>
                    previous!.snapshot.noticeAdmission?.leaseKeys.includes(key),
                  )
                ? "lease_not_admitted"
                : "status_not_admitted",
      );
    })();
    scope.pending.set(slot, pending);
  }
  let result: Awaited<NonNullable<typeof pending>>;
  try {
    result = await pending;
  } finally {
    if (scope.pending.get(slot) === pending) scope.pending.delete(slot);
  }
  const completedAt = Math.max(nowMs, Date.now());
  if (
    !liveLeaseSnapshotHasAdmission(
      result.read.snapshot,
      completedAt,
      scope.context,
      result.leaseKeys,
    )
  )
    throw new RenewalNoticeSourceError("lease_not_current");
  if (
    !leaseStatusTableHasAdmission(
      result.read.statusTable,
      completedAt,
      scope.context,
      result.leaseKeys,
    )
  )
    throw new RenewalNoticeSourceError("status_not_current");
  return {
    ...result.read,
    currency: {
      ...result.read.currency,
      state: classifyLeaseDataAge(result.read.snapshot.readAtMs, completedAt),
      ageMs: Math.max(0, completedAt - result.read.snapshot.readAtMs),
    },
  };
}

/** Each caller reserves its exact lease before joining bounded work in its actual store/context. */
export async function readAdmittedRenewalNoticeLease(
  actor: AuthenticatedUser,
  leaseId: string,
  rawReader: Reader,
  nowMs: number,
  db: Firestore = getAdminFirestore(),
) {
  await reserveRenewalNoticeLease(actor, leaseId, db);
  const reader = withRenewalNoticeAdmission(actor, rawReader, db);
  const key = renewalWorkspaceDocId(leaseId);
  // Approval reads (draft preview, notice review) join a soft-TTL revalidation they trigger, so
  // they never hold the generation that revalidation's admission is about to supersede.
  return readSharedAdmittedSource(
    reader,
    nowMs,
    scopeFor(db, rawReader),
    key,
    async () => ({
      ...(await readRenewalNoticeSourceMinimum(actor, leaseId, db)),
      leaseKeys: [key],
    }),
    undefined,
    true,
  );
}

/** One portfolio pair before display/packet projection. Failure preserves already acquired lease
 * visibility with explicitly unavailable notice evidence; it never fetches without admission.
 */
export async function readCoherentRenewalDisplaySource(
  actor: AuthenticatedUser,
  rawReader: Reader,
  nowMs: number,
  options: { sourceRefreshAfter?: number | null; leaseId?: string } = {},
  db: Firestore = getAdminFirestore(),
): Promise<AdmittedRead> {
  const reader = withRenewalNoticeAdmission(actor, rawReader, db);
  if (options.leaseId && /^[1-9]\d*$/.test(options.leaseId))
    await reserveRenewalNoticeLease(actor, options.leaseId, db);
  // The existing post-write barrier runs first and retains its stronger in-flight semantics.
  const initial =
    options.sourceRefreshAfter == null
      ? await getLiveLeaseSnapshot(reader, nowMs)
      : await getLiveLeaseSnapshotAtOrAfter(reader, nowMs, options.sourceRefreshAfter);
  try {
    const result = await readSharedAdmittedSource(
      reader,
      nowMs,
      scopeFor(db, rawReader),
      "portfolio",
      () => readRenewalNoticePortfolioMinimum(actor, db),
      initial.snapshot,
    );
    if (
      options.sourceRefreshAfter != null &&
      result.snapshot.readAtMs < options.sourceRefreshAfter
    )
      throw new RenewalNoticeSourceError("source_before_write");
    return result;
  } catch {
    const completedAt = Math.max(nowMs, Date.now());
    return {
      ...initial,
      statusTable: { status: "unavailable" },
      currency: {
        ...initial.currency,
        state: classifyLeaseDataAge(initial.snapshot.readAtMs, completedAt),
        ageMs: Math.max(0, completedAt - initial.snapshot.readAtMs),
      },
    };
  }
}
