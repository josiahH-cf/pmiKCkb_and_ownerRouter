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
// This module has NO write capability of any kind: it imports no Firestore, Sheets, Drive, or Gmail
// module and persists nothing. The S63 frozen test-set baseline is a different store with a different
// lifetime; no refresh path here can touch it (guarded by
// tests/unit/testset-baseline-immutability-boundary.test.ts).
//
// `nowMs` is passed IN (never Date.now() here) so callers stay deterministic and tests are hermetic;
// clearLiveLeaseCache() resets the module state between tests.

import type { LeaseExportReadResult, RawLease } from "@/lib/integrations/rentvine/client";
import { leaseViewsFromExport } from "@/lib/integrations/rentvine/lease-mapper";

export interface LeaseExportReader {
  listAllLeasesExport(): Promise<LeaseExportReadResult>;
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
  inflight = (async () => {
    try {
      const exportRead = await reader.listAllLeasesExport();
      const snapshot: LiveLeaseSnapshot = {
        views: leaseViewsFromExport(exportRead.rows),
        complete: exportRead.complete,
        readAtMs: nowMs,
      };
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
 * Invalidate after OUR OWN successful write to a system the export reflects: the next read goes to
 * the provider instead of waiting out the TTL, while the last good rows remain the failure
 * fallback. Sheet reconciliation invalidation and the protected RentVine write paths share this
 * boundary; a RentVine write also performs the stronger explicit post-write refresh below.
 */
export function invalidateLiveLeaseCache(): void {
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
  entry = null;
  inflight = null;
  failure = null;
}
