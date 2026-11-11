// S264 (R-S264-6, ARCH-S264-6): the immutable tenant offer snapshot and the coverage of the
// answers that responded to it.
//
// One snapshot binds the lease and cycle, the reviewed working base and renewal dates (read only
// through S262's current-cycle projection, each with its revision), the canonical set of selected
// charge rows (identity, amount, cadence, effective date, comparison, source and conditions), the
// material transition decisions, and the mapping and source versions they were resolved from. Its
// identity is S262's `OfferSnapshotIdentity`: the snapshot is the producer of the `offer_snapshot`
// approval scope. The snapshot is frozen with the exact Gmail draft claim basis and with each
// communication authorization, so the authorized content and any accepted occurrence keep it.
//
// An owner decision covers offer charges only when it approved this exact snapshot. A tenant
// acceptance covers the exact offer it answered: the linked confirmed communication, or an
// external offer reference staff verified. The newest unsent draft never supplies that basis. A
// charge-only change makes an earlier answer earlier evidence while the base and dates stay the
// same; nothing earlier is rewritten.
//
// Server-only (it hashes with node:crypto).

import { hashExecutionPreview } from "@/lib/execution/preview-hash";
import type { RecurringChargeProjection } from "./writeback/proposal-contract";
import {
  chargeDateIso,
  type RenewalChargeInventory,
} from "./writeback/charge-inventory-model";
import type {
  OfferCadence,
  OfferChargeReview,
  OfferChargeSource,
  OfferSourceLine,
} from "./offer-charges";
import { cadenceLabel, formatCents } from "./offer-charges";
import { workingEntry, type RenewalWorkingRecord } from "./working-record";
import type { OfferSnapshotIdentity } from "./owner-approval-scope";

export const OFFER_SNAPSHOT_SCHEMA_VERSION = "renewal-offer-snapshot/v1";

/**
 * The version of one RentVine line's offer-relevant facts. Billing bookkeeping that moves on its
 * own (the next charge date, the due day) is left out, so a reviewed decision asks for review
 * again only when the line's identity, account, amount, cadence, dates or status change.
 */
export function offerLineVersion(projection: RecurringChargeProjection): string {
  return hashExecutionPreview({
    version: "s264-offer-line/v1",
    chargeId: projection.leaseRecurringChargeID,
    leaseId: projection.leaseID,
    accountId: projection.accountID,
    amount: projection.amount,
    description: projection.description,
    frequency: projection.frequency,
    startDate: projection.startDate,
    endDate: projection.endDate,
    status: projection.recurringStatusID,
  });
}

/** The charge source the projection reads, from the one inventory read. */
export function offerChargeSource(
  inventory: RenewalChargeInventory | null | undefined,
): OfferChargeSource {
  if (inventory === undefined) return { state: "not_read" };
  if (inventory === null) return { state: "unavailable" };
  const lines = inventory.charges.map(
    (charge): OfferSourceLine => ({
      chargeId: charge.id,
      accountId: charge.accountId,
      accountName: charge.accountLabel,
      description: charge.projection.description,
      classification: charge.classification,
      amount: charge.projection.amount,
      frequency: charge.projection.frequency,
      startDate: chargeDateIso(charge.projection.startDate),
      endDate: chargeDateIso(charge.projection.endDate),
      endDateRaw: charge.projection.endDate?.trim() ? charge.projection.endDate : null,
      statusId: charge.projection.recurringStatusID,
      version: offerLineVersion(charge.projection),
    }),
  );
  return {
    state: "read",
    asOf: inventory.asOfDate,
    lines,
    version: hashExecutionPreview({
      lines: lines
        .filter((line) => line.classification !== "rent")
        .map((line) => [line.chargeId, line.version])
        .sort(),
    }),
  };
}

export interface OfferSnapshotRow {
  readonly rowKey: string;
  readonly origin: "rentvine" | "case" | "legacy";
  readonly family: string | null;
  readonly label: string;
  readonly amountCents: number | null;
  readonly cadence: OfferCadence | null;
  readonly effectiveFrom: string | null;
  readonly comparison: "unchanged" | "changed" | "new" | null;
  readonly sourceRef: string;
  readonly sourceVersion: string | null;
  readonly trigger: string | null;
  readonly mappingEntryId: string | null;
}

export interface OfferSnapshot {
  readonly schemaVersion: typeof OFFER_SNAPSHOT_SCHEMA_VERSION;
  readonly leaseId: string;
  readonly cycleId: string | null;
  /** The reviewed working renewal base, with its revision. */
  readonly base: { readonly rent: number | null; readonly revision: number | null };
  readonly dates: {
    readonly effectiveDate: string | null;
    readonly effectiveRevision: number | null;
    readonly endDate: string | null;
    readonly endRevision: number | null;
  };
  /** The canonical selected rows, ordered by row identity. */
  readonly rows: readonly OfferSnapshotRow[];
  readonly transitions: {
    readonly insurance: string | null;
    readonly rbp: string | null;
  };
  readonly unchangedStatement: boolean;
  readonly mappingVersion: number | null;
  readonly sourceState: OfferChargeSource["state"];
  readonly sourceVersion: string | null;
  /** How many non-rent RentVine lines the source held. */
  readonly sourceLines: number;
}

/** The frozen snapshot with S262's identity: what claims, authorizations and answers retain. */
export interface FrozenOfferSnapshot extends OfferSnapshotIdentity {
  readonly snapshot: OfferSnapshot;
}

function entryOf(working: RenewalWorkingRecord | null, field: string) {
  const entry = workingEntry(working, field);
  return entry ? { value: entry.value, revision: entry.revision } : null;
}

/**
 * Build the snapshot from the projection and the current-cycle working record (the caller passes
 * S262's projected record, so an unbound or prior-cycle term is absent here, never current).
 */
export function buildOfferSnapshot(input: {
  readonly leaseId: string;
  readonly cycleId: string | null;
  readonly working: RenewalWorkingRecord | null;
  readonly review: OfferChargeReview;
  readonly source: OfferChargeSource;
}): FrozenOfferSnapshot {
  const rent = entryOf(input.working, "terms_rent");
  const start = entryOf(input.working, "terms_effective_date");
  const end = entryOf(input.working, "terms_end_date");
  const rows = input.review.rows
    .filter((row) => row.status === "selected")
    .map(
      (row): OfferSnapshotRow => ({
        rowKey: row.rowKey,
        origin: row.origin,
        family: row.family,
        label: row.label,
        amountCents: row.amountCents,
        cadence: row.cadence,
        effectiveFrom: row.effectiveFrom,
        comparison: row.comparison,
        sourceRef: row.sourceRef,
        sourceVersion: row.sourceVersion,
        trigger: row.trigger,
        mappingEntryId: row.mappingEntryId,
      }),
    )
    .sort((left, right) => left.rowKey.localeCompare(right.rowKey));
  const snapshot: OfferSnapshot = {
    schemaVersion: OFFER_SNAPSHOT_SCHEMA_VERSION,
    leaseId: input.leaseId,
    cycleId: input.cycleId,
    base: {
      rent: typeof rent?.value === "number" ? rent.value : null,
      revision: rent?.revision ?? null,
    },
    dates: {
      effectiveDate: typeof start?.value === "string" ? start.value : null,
      effectiveRevision: start?.revision ?? null,
      endDate: typeof end?.value === "string" ? end.value : null,
      endRevision: end?.revision ?? null,
    },
    rows,
    transitions: {
      insurance: input.review.decisions.insuranceTransition,
      rbp: input.review.decisions.rbpChange,
    },
    unchangedStatement: input.review.composition.unchangedStatement,
    mappingVersion: input.review.mappingVersion,
    sourceState: input.source.state,
    sourceVersion: input.source.state === "read" ? input.source.version : null,
    sourceLines:
      input.source.state === "read"
        ? input.source.lines.filter((line) => line.classification !== "rent").length
        : 0,
  };
  return { ...offerSnapshotIdentity(snapshot), snapshot };
}

/** S262's identity for a snapshot: a content hash and a readable id bound to lease and cycle. */
export function offerSnapshotIdentity(snapshot: OfferSnapshot): OfferSnapshotIdentity {
  const snapshotHash = hashExecutionPreview({ offerSnapshot: snapshot });
  return {
    snapshotId: `offer:${snapshot.leaseId}:${snapshot.cycleId ?? "lease"}:${snapshotHash.slice(0, 16)}`,
    snapshotHash,
  };
}

/** True when the snapshot's identity still matches its content (a frozen copy was not altered). */
export function offerSnapshotIntact(frozen: FrozenOfferSnapshot): boolean {
  const identity = offerSnapshotIdentity(frozen.snapshot);
  return (
    identity.snapshotId === frozen.snapshotId &&
    identity.snapshotHash === frozen.snapshotHash
  );
}

/**
 * Whether an offer's charges are material to its send basis. An offer with no charge rows, no
 * transition and no non-rent RentVine line contributes nothing, so an authorization reviewed
 * before S264 for such an offer keeps its basis.
 */
export function offerSnapshotIsMaterial(snapshot: OfferSnapshot): boolean {
  return (
    snapshot.rows.length > 0 ||
    snapshot.sourceLines > 0 ||
    snapshot.sourceState === "unavailable" ||
    snapshot.transitions.insurance !== null ||
    snapshot.transitions.rbp !== null
  );
}

const usd = (cents: number | null) =>
  cents === null ? "an amount not entered" : formatCents(cents);
const dollars = (value: number | null) =>
  value === null ? "not entered" : formatCents(Math.round(value * 100));

/** What changed between the snapshot an answer covered and the current one, in staff words. */
export function describeOfferSnapshotChanges(
  before: OfferSnapshot,
  after: OfferSnapshot,
): string[] {
  const changes: string[] = [];
  if (before.cycleId !== after.cycleId) changes.push("The renewal cycle changed.");
  if (
    before.base.rent !== after.base.rent ||
    before.base.revision !== after.base.revision
  )
    changes.push(
      `The renewal base changed (${dollars(before.base.rent)} to ${dollars(after.base.rent)}).`,
    );
  if (
    before.dates.effectiveDate !== after.dates.effectiveDate ||
    before.dates.endDate !== after.dates.endDate ||
    before.dates.effectiveRevision !== after.dates.effectiveRevision ||
    before.dates.endRevision !== after.dates.endRevision
  )
    changes.push("The renewal dates changed.");
  const prior = new Map(before.rows.map((row) => [row.rowKey, row]));
  const next = new Map(after.rows.map((row) => [row.rowKey, row]));
  for (const row of after.rows) {
    const earlier = prior.get(row.rowKey);
    if (!earlier)
      changes.push(
        `${row.label} was added (${usd(row.amountCents)}${row.cadence ? ` ${cadenceLabel(row.cadence)}` : ""}).`,
      );
    else if (
      earlier.amountCents !== row.amountCents ||
      JSON.stringify(earlier.cadence) !== JSON.stringify(row.cadence) ||
      earlier.effectiveFrom !== row.effectiveFrom
    )
      changes.push(
        `${row.label} changed (${usd(earlier.amountCents)} to ${usd(row.amountCents)}).`,
      );
    else if (
      earlier.sourceVersion !== row.sourceVersion ||
      earlier.mappingEntryId !== row.mappingEntryId ||
      earlier.trigger !== row.trigger ||
      earlier.label !== row.label
    )
      changes.push(`${row.label}: its source or mapping changed.`);
  }
  for (const row of before.rows)
    if (!next.has(row.rowKey)) changes.push(`${row.label} was removed.`);
  if (
    before.transitions.insurance !== after.transitions.insurance ||
    before.transitions.rbp !== after.transitions.rbp
  )
    changes.push("A transition decision changed.");
  if (!changes.length && before.mappingVersion !== after.mappingVersion)
    changes.push("The offer charge mapping changed.");
  if (!changes.length && before.sourceVersion !== after.sourceVersion)
    changes.push("The RentVine charges changed.");
  if (!changes.length && before.unchangedStatement !== after.unchangedStatement)
    changes.push("Whether the offer can say all other charges stay the same changed.");
  return changes;
}

/** The base and dates alone: an answer may still cover these when only the charges changed. */
export function offerTermsUnchanged(
  before: OfferSnapshot,
  after: OfferSnapshot,
): boolean {
  return (
    before.cycleId === after.cycleId &&
    before.base.rent === after.base.rent &&
    before.base.revision === after.base.revision &&
    before.dates.effectiveDate === after.dates.effectiveDate &&
    before.dates.endDate === after.dates.endDate &&
    before.dates.effectiveRevision === after.dates.effectiveRevision &&
    before.dates.endRevision === after.dates.endRevision
  );
}
