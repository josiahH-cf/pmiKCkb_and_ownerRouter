// Server-only short-TTL memo of the live RentVine lease export, shared by the renewal-notice route and
// the live-notices desk. Without it, drafting one notice costs three full-portfolio reads (desk render
// + Preview + Create); with it, reads inside the TTL window are coalesced to one. The authoritative
// RentVine data is held in memory only for its bounded lifetime and is never logged or persisted.
//
// S57: the read is the COMPLETE paged export (`listAllLeasesExport`), never the provider's 25-row
// default page, and the read's completeness travels with the views so a partial read is never
// presented as the portfolio.
//
// S58: staleness is a bounded, visible property instead of an invisible implementation detail. Three
// ages, not one: `fresh` (age < soft TTL) serves from cache; `stale` (TTL <= age < hard max) serves
// the cached rows immediately and revalidates in the background; `expired` (age >= hard max) attempts
// a blocking refresh and, when that fails, KEEPS serving the last good rows marked expired so a
// provider failure never renders as an empty portfolio — actions are refused instead
// (`requireCurrentLeaseViews`). Failed refreshes retry with bounded exponential backoff rather than
// one provider read per request. Refresh is demand-driven by design: no timer, cron, or scheduler —
// production scales to zero and a background interval would hold an instance warm for nothing.
//
// The provider cache imports no Firestore, Sheets, Drive, or Gmail module and persists no provider
// evidence. Authenticated callers inject the owner-approved hash/version/time admission callback
// before a new provider generation; it cannot change workflow progress or provider records.
// The S63 frozen test-set baseline is a different store with a different
// lifetime; no refresh path here can touch it (guarded by
// tests/unit/testset-baseline-immutability-boundary.test.ts).
//
// `nowMs` is passed IN (never Date.now() here) so callers stay deterministic and tests are hermetic;
// clearLiveLeaseCache() resets the module state between tests.

import type { LeaseExportReadResult, RawLease } from "@/lib/integrations/rentvine/client";
import {
  noticeAdmissionContext,
  type NoticeSourceAdmission,
} from "./notice-source-admission";
import {
  enrichLeaseViewsWithDetail,
  LEASE_DETAIL_READ_CONCURRENCY,
  type LeaseDetailReader,
} from "@/lib/integrations/rentvine/lease-detail-enrichment";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";

export { LEASE_DETAIL_READ_CONCURRENCY };

/**
 * The export reader plus, when the client exposes it, the documented per-lease detail read that
 * S102 uses to enrich each view with the tenant's contractual base rent and S103's term evidence.
 * A reader without `getLease` yields views whose rent is unavailable, never a unit-rent fallback.
 */
export interface LeaseExportReader extends Partial<LeaseDetailReader> {
  listAllLeasesExport(): Promise<LeaseExportReadResult>;
  /** Authenticated orchestration admits new generations before any provider evidence is read. */
  beforeLeaseSourceRead?: (readAtMs: number) => Promise<NoticeSourceAdmission | void>;
}

/** Soft TTL: inside it a read is served from cache with no provider call. Shipped value, kept. */
export const LEASE_EXPORT_TTL_MS = 60_000;
/**
 * Hard max age: at or beyond it the data is too old to compose a draft or record a decision
 * against. 15 minutes per the owner-adopted value recorded as `Q-LEASE-DATA-MAX-AGE`; rendered to
 * the operator wherever it refuses work.
 */
export const LEASE_EXPORT_MAX_AGE_MS = 15 * 60_000;
/** Failed-refresh backoff: base doubles per consecutive failure, bounded by the cap. */
export const LEASE_REFRESH_BACKOFF_BASE_MS = 5_000;
export const LEASE_REFRESH_BACKOFF_CAP_MS = 5 * 60_000;

export type LeaseDataAgeState = "fresh" | "stale" | "expired";

/** The cached live read: mapped lease views, export completeness, and when it was read. */
export interface LiveLeaseSnapshot {
  views: RawLease[];
  /** False when the paged export hit its page cap — the views may be a partial portfolio. */
  complete: boolean;
  /** When this snapshot was read (the caller-supplied nowMs of the successful read). */
  readAtMs: number;
  noticeAdmitted?: boolean;
  noticeAdmission?: NoticeSourceAdmission;
  /**
   * S102: true only when every lease received its documented detail (base rent and term evidence).
   * False leaves portfolio completeness untouched; only the affected leases read `unavailable`.
   */
  detailComplete: boolean;
  /** S102: leases whose detail read failed or was impossible in this generation. */
  detailUnavailableCount: number;
}

/** The age/refresh facts a surface renders. Exactly one UI state derives from these. */
export interface LiveLeaseCurrency {
  state: LeaseDataAgeState;
  /** Age of the served snapshot relative to the caller's nowMs. */
  ageMs: number;
  readAtMs: number;
  /** A background revalidation is in flight right now. */
  refreshing: boolean;
  /** The most recent refresh attempt failed and its backoff window may be active. */
  lastError: boolean;
}

export interface LiveLeaseSnapshotResult {
  snapshot: LiveLeaseSnapshot;
  currency: LiveLeaseCurrency;
}

/**
 * Result of a route-level source-read attempt. Passing `unavailable` into a downstream loader is a
 * durable instruction not to retry inside the same render; omission means no upstream attempt was
 * made and preserves the loader's direct-call behavior.
 */
export type AttemptedLiveLeaseSnapshotResult =
  | { status: "available"; value: LiveLeaseSnapshotResult }
  | { status: "unavailable" };

/** Thrown by requireCurrentLeaseViews when the served data is at or beyond the hard max age. */
export class LeaseDataExpiredError extends Error {
  readonly ageMs: number;
  constructor(ageMs: number) {
    super(
      `The live lease data is ${Math.round(ageMs / 60_000)} minutes old, past the ${Math.round(
        LEASE_EXPORT_MAX_AGE_MS / 60_000,
      )}-minute maximum. Refresh the desk before composing or recording.`,
    );
    this.name = "LeaseDataExpiredError";
    this.ageMs = ageMs;
  }
}

/** Classify a snapshot age. Pure; thresholds are injectable for tests. */
export function classifyLeaseDataAge(
  readAtMs: number,
  nowMs: number,
  ttlMs: number = LEASE_EXPORT_TTL_MS,
  maxAgeMs: number = LEASE_EXPORT_MAX_AGE_MS,
): LeaseDataAgeState {
  const age = nowMs - readAtMs;
  if (age < ttlMs) return "fresh";
  if (age < maxAgeMs) return "stale";
  return "expired";
}

interface CacheEntry {
  snapshot: LiveLeaseSnapshot;
  /** Set by invalidateLiveLeaseCache(): the next read must go to the provider. */
  invalidated: boolean;
}

interface FailureState {
  count: number;
  nextRetryAtMs: number;
}

let entry: CacheEntry | null = null;
let inflight: Promise<LiveLeaseSnapshot> | null = null;
let failure: FailureState | null = null;
let admissionEpoch = 0;
const admissionContexts = new WeakMap<
  LiveLeaseSnapshot,
  { context?: object; epoch: number }
>();

function recordFailure(nowMs: number): void {
  const count = (failure?.count ?? 0) + 1;
  const delay = Math.min(
    LEASE_REFRESH_BACKOFF_BASE_MS * 2 ** (count - 1),
    LEASE_REFRESH_BACKOFF_CAP_MS,
  );
  failure = { count, nextRetryAtMs: nowMs + delay };
}

/** One coalesced provider read. Success replaces the entry and clears the failure state. */
function readOnce(reader: LeaseExportReader, nowMs: number): Promise<LiveLeaseSnapshot> {
  if (inflight) return inflight;
  const epoch = admissionEpoch;
  inflight = (async () => {
    try {
      const admittedAt = await reader.beforeLeaseSourceRead?.(nowMs);
      const exportRead = await reader.listAllLeasesExport();
      const views = leaseViewsFromExport(exportRead.rows);
      // S102: the same generation carries each lease's documented detail so every consumer of the
      // snapshot reads the tenant's base rent, never the export unit's listed rent.
      const detail = await enrichLeaseViewsWithDetail(
        views,
        typeof reader.getLease === "function"
          ? { getLease: (id) => reader.getLease!(id) }
          : undefined,
      );
      const snapshot: LiveLeaseSnapshot = {
        views,
        complete: exportRead.complete,
        readAtMs: admittedAt?.readAtMs ?? nowMs,
        ...(admittedAt ? { noticeAdmitted: true, noticeAdmission: admittedAt } : {}),
        detailComplete: detail.detailComplete,
        detailUnavailableCount: detail.detailUnavailableCount,
      };
      admissionContexts.set(snapshot, {
        context: admittedAt ? noticeAdmissionContext(admittedAt) : undefined,
        epoch,
      });
      entry = { snapshot, invalidated: false };
      failure = null;
      return snapshot;
    } catch (error) {
      recordFailure(nowMs);
      throw error;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function currencyFor(
  snapshot: LiveLeaseSnapshot,
  nowMs: number,
  state: LeaseDataAgeState,
): LiveLeaseCurrency {
  return {
    state,
    ageMs: Math.max(0, nowMs - snapshot.readAtMs),
    readAtMs: snapshot.readAtMs,
    refreshing: inflight !== null,
    lastError: failure !== null,
  };
}

/**
 * Return the live lease snapshot plus its currency, applying the three-age contract described in the
 * module header. A cold miss still reads blocking and still propagates its error (there is no last
 * good data to serve); only REFRESH failures degrade to served-stale/expired rather than throwing.
 *
 * The cache is a single global entry, correct only because RentVine is one enforced account
 * (assertRentVineAccount): every caller reads the same portfolio. Callers MUST treat the returned
 * array and its view objects as READ-ONLY — it is the shared cache entry, not a copy.
 */
export async function getLiveLeaseSnapshot(
  reader: LeaseExportReader,
  nowMs: number,
  ttlMs: number = LEASE_EXPORT_TTL_MS,
  maxAgeMs: number = LEASE_EXPORT_MAX_AGE_MS,
): Promise<LiveLeaseSnapshotResult> {
  // Cold start: no data at all — the blocking read's failure is the caller's failure.
  if (!entry) {
    const snapshot = await readOnce(reader, nowMs);
    return { snapshot, currency: currencyFor(snapshot, nowMs, "fresh") };
  }

  const current = entry;
  const state = classifyLeaseDataAge(current.snapshot.readAtMs, nowMs, ttlMs, maxAgeMs);
  const mustRead = current.invalidated || state === "expired";
  const backoffActive = failure !== null && nowMs < failure.nextRetryAtMs;

  if (!mustRead) {
    if (state === "stale" && !inflight && !backoffActive) {
      // Stale-while-revalidate: serve immediately, refresh in the background. The failure is
      // recorded in the backoff state, never thrown at a caller who already has data.
      readOnce(reader, nowMs).catch(() => {});
    }
    return {
      snapshot: current.snapshot,
      currency: currencyFor(current.snapshot, nowMs, state),
    };
  }

  // Expired or invalidated: this request must try the provider — unless a failing provider has an
  // active backoff window, in which case serving the last good rows marked expired is the honest
  // answer (and cheaper than a read that just failed).
  if (backoffActive && !inflight) {
    return {
      snapshot: current.snapshot,
      currency: currencyFor(current.snapshot, nowMs, "expired"),
    };
  }
  try {
    const snapshot = await readOnce(reader, nowMs);
    return { snapshot, currency: currencyFor(snapshot, nowMs, "fresh") };
  } catch {
    // The refresh failed. Keep serving the last good rows, marked expired — never an empty
    // portfolio, never a fresh claim.
    return {
      snapshot: current.snapshot,
      currency: currencyFor(current.snapshot, nowMs, "expired"),
    };
  }
}

/**
 * Start the background revalidation of a STALE generation through a plain reader, and report
 * whether a read started. An admitted refresh raises every notice marker's read floor before it
 * reads, so a desk or workspace read that arrives while it runs refuses the current admitted
 * generation and waits the full provider read. A display-only caller (the Dashboard attention
 * queue) therefore starts the revalidation itself without admission: later admitted callers see
 * the refresh in flight, keep the current admitted generation and open no admission of their own.
 * The plain generation it lands is never accepted as admitted, so admitted callers still read for
 * themselves afterwards. A cold, fresh, expired, invalidated, refreshing or backed-off cache, and
 * any admitted reader, are left to the normal read path.
 */
export function revalidateStaleLiveLeaseSnapshot(
  reader: LeaseExportReader,
  nowMs: number,
  ttlMs: number = LEASE_EXPORT_TTL_MS,
  maxAgeMs: number = LEASE_EXPORT_MAX_AGE_MS,
): boolean {
  if (typeof reader.beforeLeaseSourceRead === "function") return false;
  if (!entry || entry.invalidated || inflight) return false;
  if (failure !== null && nowMs < failure.nextRetryAtMs) return false;
  if (classifyLeaseDataAge(entry.snapshot.readAtMs, nowMs, ttlMs, maxAgeMs) !== "stale")
    return false;
  readOnce(reader, nowMs).catch(() => {});
  return true;
}

/** The cached live read (views + completeness). Kept for callers that need no currency detail. */
export interface LiveLeaseRead {
  views: RawLease[];
  complete: boolean;
}

export async function getLiveLeaseRead(
  reader: LeaseExportReader,
  nowMs: number,
  ttlMs: number = LEASE_EXPORT_TTL_MS,
): Promise<LiveLeaseRead> {
  const { snapshot } = await getLiveLeaseSnapshot(reader, nowMs, ttlMs);
  return { views: snapshot.views, complete: snapshot.complete };
}

/** Views-only convenience over getLiveLeaseSnapshot, for callers that key on a specific lease. */
export async function getLiveLeaseViews(
  reader: LeaseExportReader,
  nowMs: number,
  ttlMs: number = LEASE_EXPORT_TTL_MS,
): Promise<RawLease[]> {
  return (await getLiveLeaseRead(reader, nowMs, ttlMs)).views;
}

/**
 * Views for an ACTION path (composing a draft, recording a decision). Refuses with
 * LeaseDataExpiredError when the served snapshot is at or beyond the hard max age — an expired
 * snapshot may still be LOOKED at, but nothing may be composed from it.
 */
export async function requireCurrentLeaseViews(
  reader: LeaseExportReader,
  nowMs: number,
): Promise<RawLease[]> {
  const { snapshot, currency } = await getLiveLeaseSnapshot(reader, nowMs);
  if (currency.state === "expired") {
    throw new LeaseDataExpiredError(currency.ageMs);
  }
  return snapshot.views;
}

/**
 * Repair missing lease admission without applying the stronger post-write barrier. An existing
 * generation may satisfy this read only when its own proof covers the requested context and key.
 * After waiting for an older generation, perform at most one coalesced new read, then fail closed.
 */
export async function readLiveLeaseSnapshotForAdmission(
  reader: LeaseExportReader,
  nowMs: number,
  context: object,
  leaseKey: string | readonly string[],
  minimumReadAtMs = 0,
): Promise<LiveLeaseSnapshotResult> {
  if (!Number.isFinite(nowMs) || !Number.isFinite(minimumReadAtMs) || minimumReadAtMs < 0)
    throw new Error("A finite admission timestamp is required.");
  const accepted = (snapshot: LiveLeaseSnapshot) =>
    liveLeaseSnapshotHasAdmission(snapshot, nowMs, context, leaseKey) &&
    snapshot.readAtMs >= minimumReadAtMs;
  const current = () =>
    entry && !entry.invalidated && accepted(entry.snapshot) ? entry.snapshot : null;
  let snapshot = current();
  if (snapshot) {
    // Preserve soft-TTL revalidation for a valid ordinary generation. A missing admission does
    // not need a normal failed-refresh fallback followed by another redundant forced attempt.
    await getLiveLeaseSnapshot(reader, nowMs);
    snapshot = current();
  }
  if (!snapshot) {
    const pending = inflight;
    if (pending) await pending.catch(() => undefined);
    snapshot = current();
  }
  if (!snapshot) snapshot = await readOnce(reader, nowMs);
  if (!accepted(snapshot)) {
    throw new Error("The lease source did not admit the requested notice context.");
  }
  return {
    snapshot,
    currency: currencyFor(
      snapshot,
      nowMs,
      classifyLeaseDataAge(snapshot.readAtMs, nowMs),
    ),
  };
}

/** Validate a held result using private cache metadata; no context identifier leaves this module. */
export function liveLeaseSnapshotHasAdmission(
  snapshot: LiveLeaseSnapshot,
  nowMs: number,
  context: object,
  leaseKey: string | readonly string[],
): boolean {
  const admission = admissionContexts.get(snapshot);
  return (
    entry?.snapshot === snapshot &&
    !entry.invalidated &&
    admission?.epoch === admissionEpoch &&
    admission.context === context &&
    snapshot.noticeAdmitted === true &&
    (typeof leaseKey === "string" ? [leaseKey] : leaseKey).every(
      (key) => snapshot.noticeAdmission?.leaseKeys.includes(key) === true,
    ) &&
    Number.isFinite(nowMs) &&
    Number.isFinite(snapshot.readAtMs) &&
    classifyLeaseDataAge(snapshot.readAtMs, nowMs) !== "expired"
  );
}

/**
 * Invalidate after OUR OWN successful write to a system the export reflects: the next read goes to
 * the provider instead of waiting out the TTL, while the last good rows remain the failure
 * fallback. Sheet reconciliation invalidation and the protected RentVine write paths share this
 * boundary; a RentVine write also performs the stronger explicit post-write refresh below.
 */
export function invalidateLiveLeaseCache(): void {
  admissionEpoch++;
  if (entry) entry.invalidated = true;
  // A deliberate write wants its refresh now; a prior provider failure must not defer it.
  failure = null;
}

/**
 * After an exact provider write/readback, perform one additional complete export that cannot be
 * satisfied by a pre-write cache entry or pre-write in-flight read. The returned timestamp is safe
 * to expose as the freshness receipt; source rows remain only in memory.
 */
export async function refreshLiveLeaseSnapshotFromProvider(
  reader: LeaseExportReader,
  writeCompletedAtMs: number,
  nowMs: number,
): Promise<LiveLeaseSnapshotResult> {
  if (!Number.isFinite(writeCompletedAtMs) || !Number.isFinite(nowMs)) {
    throw new Error("A finite write and refresh timestamp are required.");
  }
  // A read already in flight may have started before the write. Let it settle, then force a new
  // read; never reuse it as post-write proof.
  const preWriteInflight = inflight;
  if (preWriteInflight) await preWriteInflight.catch(() => undefined);
  invalidateLiveLeaseCache();
  const readAtMs = Math.max(nowMs, writeCompletedAtMs);
  const snapshot = await readOnce(reader, readAtMs);
  if (snapshot.readAtMs < writeCompletedAtMs) {
    throw new Error("The post-write lease refresh predates the source write.");
  }
  return {
    snapshot,
    currency: currencyFor(snapshot, readAtMs, "fresh"),
  };
}

/**
 * Resolve a workspace read at or after a confirmed source-write barrier. The barrier is carried by a
 * short-lived, value-free browser cookie so a server-component refresh that lands on another Cloud
 * Run instance cannot reuse that instance's pre-write module cache. An already-current generation is
 * reused; otherwise this performs the same complete, post-inflight provider read as the write route.
 */
export async function getLiveLeaseSnapshotAtOrAfter(
  reader: LeaseExportReader,
  nowMs: number,
  minimumReadAtMs: number,
): Promise<LiveLeaseSnapshotResult> {
  if (!Number.isFinite(minimumReadAtMs)) {
    throw new Error("A finite minimum lease-read timestamp is required.");
  }
  if (entry && !entry.invalidated && entry.snapshot.readAtMs >= minimumReadAtMs) {
    return getLiveLeaseSnapshot(reader, nowMs);
  }
  return refreshLiveLeaseSnapshotFromProvider(
    reader,
    minimumReadAtMs,
    Math.max(nowMs, minimumReadAtMs),
  );
}

/** Reset the module cache. Test-only; production relies on the age contract. */
export function clearLiveLeaseCache(): void {
  admissionEpoch++;
  entry = null;
  inflight = null;
  failure = null;
}
