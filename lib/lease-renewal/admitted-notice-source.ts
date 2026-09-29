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
  getLiveLeaseSnapshot,
  getLiveLeaseSnapshotAtOrAfter,
  liveLeaseSnapshotHasAdmission,
  readLiveLeaseSnapshotForAdmission,
  type LeaseExportReader,
} from "./live-lease-cache";
import {
  leaseStatusTableHasAdmission,
  readLeaseStatusTableForAdmission,
  type LeaseStatusTableReader,
} from "./lease-status-table";
import { noticeAdmissionContextFor } from "./notice-source-admission";

type Reader = LeaseExportReader & LeaseStatusTableReader;
type AdmittedRead = Awaited<ReturnType<typeof readLiveLeaseSnapshotForAdmission>> & {
  statusTable: Awaited<ReturnType<typeof readLeaseStatusTableForAdmission>>;
};
type Minimum = { leaseKeys: readonly string[]; lease: number; status: number };
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
          throw new Error("The held admitted lease source is unavailable or expired.");
        // Display callers already acquired their initial generation before reading minima.
        // Refuse before dispatching a second replacement, even when durable authority churns.
        if (!heldLease && replacedInitialLease)
          throw new Error("The display lease source exhausted its bounded replacement.");
        const read =
          heldLease ??
          (await readLiveLeaseSnapshotForAdmission(
            reader,
            currentAt,
            scope.context,
            minimum.leaseKeys,
            minimum.lease,
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
          throw new Error("The held admitted status source is unavailable or expired.");
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
      throw new Error("The admitted notice source changed during its bounded read.");
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
    ) ||
    !leaseStatusTableHasAdmission(
      result.read.statusTable,
      completedAt,
      scope.context,
      result.leaseKeys,
    )
  )
    throw new Error("The admitted notice source is unavailable or expired.");
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
  return readSharedAdmittedSource(
    reader,
    nowMs,
    scopeFor(db, rawReader),
    key,
    async () => ({
      ...(await readRenewalNoticeSourceMinimum(actor, leaseId, db)),
      leaseKeys: [key],
    }),
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
      throw new Error("The notice source predates the confirmed source write.");
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
