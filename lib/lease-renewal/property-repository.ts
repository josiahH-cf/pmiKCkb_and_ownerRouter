// Per-property lease-renewal decision repository (deferred-cycle slice 1c).
//
// Joins each simulation run's ADDRESS-joined reconciliation flags to a canonical property key
// (ReconciledFieldOutcome.propertyKey, i.e. deriveAddressKey of the record's join value) and buckets
// the EXISTING append-only resolution + write-back-approval Activity by property. Every surfaced
// entry is strictly VALUE-FREE: exactly {actorUid, action, timestamp, reason}, never an address, a
// field value, a field_key, a proposed value, a severity, or a reason_code.
//
// A flag's source_trigger_key is run+field only (`lease_renewal:reconcile:{runId}:{field}`), so a
// single key can be raised by two different properties in the same run. When that happens the key is
// AMBIGUOUS and its Activity is attributed to NEITHER property (no cross-property bleed). NAME-joined
// lifecycle fields carry no address, so they have no property and are excluded by design.
//
// PURE and DETERMINISTIC: no I/O, no firebase-admin value import (types only), and no Date.now(). It
// accepts already-fetched runs + Activity as input; the page inside the auth boundary does the reads.

import type {
  LeaseRenewalResolutionActivityRecord,
  LeaseRenewalWritebackApprovalActivityRecord,
} from "@/lib/firestore/types";
import type { RenewalRunResult } from "@/lib/lease-renewal/pipeline";

/** One decision, reduced to a value-free payload. EXACTLY these four keys — never a value. */
export interface PropertyActivityEntry {
  actorUid: string;
  action: string;
  timestamp: string;
  reason: string;
}

/** Every value-free decision attributed to one property, plus per-kind counts. */
export interface PropertyActivityBucket {
  propertyKey: string;
  entries: PropertyActivityEntry[];
  resolutionCount: number;
  approvalCount: number;
}

/** One run's flags plus the append-only Activity already read for it. */
export interface PropertyRunActivity {
  run: RenewalRunResult;
  resolutionActivity: readonly LeaseRenewalResolutionActivityRecord[];
  approvalActivity: readonly LeaseRenewalWritebackApprovalActivityRecord[];
}

/**
 * Map each of a run's flag source_trigger_keys to its property key, or to `null` when the key is
 * raised by two or more distinct properties (ambiguous — attributed to neither). Keys with no
 * property (name-joined fields) are omitted entirely, so a lookup miss and an ambiguous key both
 * cause the caller to drop the Activity rather than bucket it.
 */
export function buildRunPropertyKeyIndex(
  run: RenewalRunResult,
): Map<string, string | null> {
  const seen = new Map<string, Set<string>>();
  for (const outcome of run.flags) {
    const key = outcome.queueMapping?.queueItem.source_trigger_key;
    const propertyKey = outcome.propertyKey;
    // Skip flags with no queue key or no property (name-joined fields have no address).
    if (!key || propertyKey === undefined || propertyKey === "") continue;
    const properties = seen.get(key) ?? new Set<string>();
    properties.add(propertyKey);
    seen.set(key, properties);
  }

  const index = new Map<string, string | null>();
  for (const [key, properties] of seen) {
    index.set(key, properties.size === 1 ? [...properties][0] : null);
  }
  return index;
}

/** The distinct property keys a run can UNAMBIGUOUSLY attribute, sorted. Ambiguous keys excluded. */
export function listRunPropertyKeys(run: RenewalRunResult): string[] {
  const keys = new Set<string>();
  for (const propertyKey of buildRunPropertyKeyIndex(run).values()) {
    if (propertyKey !== null) keys.add(propertyKey);
  }
  return [...keys].sort();
}

interface MutableBucket {
  entries: PropertyActivityEntry[];
  resolutionCount: number;
  approvalCount: number;
}

/**
 * Bucket every run's append-only Activity by property, producing one value-free bucket per property
 * key that has at least one attributable decision. An Activity record whose key is unknown (no
 * property) or ambiguous (raised by 2+ properties) is dropped, never bucketed. Entries inside a
 * bucket are ordered oldest→newest; buckets are ordered by property key.
 */
export function buildPropertyActivity(
  runs: readonly PropertyRunActivity[],
): PropertyActivityBucket[] {
  const buckets = new Map<string, MutableBucket>();

  const bucketFor = (propertyKey: string): MutableBucket => {
    let bucket = buckets.get(propertyKey);
    if (!bucket) {
      bucket = { entries: [], resolutionCount: 0, approvalCount: 0 };
      buckets.set(propertyKey, bucket);
    }
    return bucket;
  };

  for (const { run, resolutionActivity, approvalActivity } of runs) {
    const index = buildRunPropertyKeyIndex(run);

    for (const record of resolutionActivity) {
      const propertyKey = index.get(record.source_trigger_key);
      if (!propertyKey) continue; // undefined (no property) or null (ambiguous) — dropped
      const bucket = bucketFor(propertyKey);
      bucket.entries.push(
        toEntry(record.actor_uid, record.action, record.created_at, record.reason),
      );
      bucket.resolutionCount += 1;
    }

    for (const record of approvalActivity) {
      const propertyKey = index.get(record.source_trigger_key);
      if (!propertyKey) continue;
      const bucket = bucketFor(propertyKey);
      bucket.entries.push(
        toEntry(record.actor_uid, record.action, record.created_at, record.reason),
      );
      bucket.approvalCount += 1;
    }
  }

  return [...buckets.entries()]
    .map(([propertyKey, bucket]) => ({
      propertyKey,
      entries: [...bucket.entries].sort((left, right) =>
        left.timestamp.localeCompare(right.timestamp),
      ),
      resolutionCount: bucket.resolutionCount,
      approvalCount: bucket.approvalCount,
    }))
    .sort((left, right) => left.propertyKey.localeCompare(right.propertyKey));
}

/** The bucket for one property key across all runs, or null when it has no attributable decision. */
export function getPropertyActivity(
  runs: readonly PropertyRunActivity[],
  propertyKey: string,
): PropertyActivityBucket | null {
  return (
    buildPropertyActivity(runs).find((bucket) => bucket.propertyKey === propertyKey) ??
    null
  );
}

/** Build the value-free entry, copying ONLY the four allowed fields — never a value or a key. */
function toEntry(
  actorUid: string,
  action: string,
  timestamp: string,
  reason: string,
): PropertyActivityEntry {
  return { actorUid, action, timestamp, reason };
}
