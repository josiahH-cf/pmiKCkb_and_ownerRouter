// S103: the app-owned lease term review — one current record per lease plus append-only activity.
//
// It records a HUMAN answer to "what is this lease's term?" for the leases where provider evidence
// is absent or contradictory. It reaches no provider: there is no RentVine or Sheet write here, and
// no follow-up timer, draft, or send derives from the review date. Every record is bound to the
// exact source fingerprint of the lease view the person saw (`lib/lease-renewal/lease-term.ts`); a
// drifted fingerprint makes the record stale and the projection returns to `needs_review`.

import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { canonicalJson } from "@/lib/execution/preview-hash";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import {
  RECORDABLE_LEASE_TERMS,
  type LeaseTermReviewFact,
  type RecordableLeaseTerm,
} from "@/lib/lease-renewal/lease-term";

export const LEASE_TERM_REVIEW_COLLECTIONS = {
  reviews: "lease_renewal_term_reviews",
  activity: "lease_renewal_term_review_activity",
} as const;

export const LEASE_TERM_SOURCE_FINGERPRINT_PATTERN = /^ltf1_[a-f0-9]{64}$/;

export const RecordLeaseTermReviewInputSchema = z
  .object({
    lease_id: z.string().trim().min(1).max(120),
    term: z.enum(RECORDABLE_LEASE_TERMS),
    /** Month-to-month review anchor. Required for month-to-month; forbidden for fixed-term. */
    anchor_date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "An anchor date must be an exact ISO calendar date.")
      .optional(),
    reason: z.string().trim().min(3).max(2_000),
    source_fingerprint: z.string().trim().regex(LEASE_TERM_SOURCE_FINGERPRINT_PATTERN),
  })
  .strict();

export type RecordLeaseTermReviewInput = z.input<typeof RecordLeaseTermReviewInputSchema>;

export interface LeaseTermReviewRecord extends LeaseTermReviewFact {
  readonly id: string;
  readonly version: number;
  readonly reason: string;
  readonly recordHash: string;
  readonly recordedAtIso: string;
  readonly recordedByUid: string;
}

function assertEditor(actor: AuthenticatedUser): void {
  if (!can(actor.role, "edit")) {
    throw new EditableLayerError(
      "Editor access is required to record a lease term review. Continue read-only or ask an Admin to review your role.",
      403,
    );
  }
}

function assertReader(actor: AuthenticatedUser): void {
  if (!can(actor.role, "read")) {
    throw new EditableLayerError(
      "Renewal workspace read access is required to read lease term reviews.",
      403,
    );
  }
}

/** Firestore-safe doc id for one lease's current term review. */
export function leaseTermReviewDocId(leaseId: string): string {
  return leaseId.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function isCalendarDate(value: string): boolean {
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

/**
 * Pure payload validation. A month-to-month review needs its exact review anchor; a fixed-term
 * review must not carry one, so a stale anchor can never survive a term correction.
 */
export function assertLeaseTermReviewPayload(
  parsed: z.output<typeof RecordLeaseTermReviewInputSchema>,
): void {
  if (parsed.anchor_date !== undefined && !isCalendarDate(parsed.anchor_date)) {
    throw new EditableLayerError(
      "An anchor date must be an exact ISO calendar date.",
      400,
    );
  }
  if (parsed.term === "month_to_month" && parsed.anchor_date === undefined) {
    throw new EditableLayerError(
      "A month-to-month term review requires the exact date the lease became month-to-month.",
      400,
    );
  }
  if (parsed.term === "fixed_term" && parsed.anchor_date !== undefined) {
    throw new EditableLayerError(
      "A fixed-term review carries no month-to-month anchor.",
      400,
    );
  }
}

/**
 * Record or correct one lease's term review. Editor-gated, versioned, and append-only audited.
 * Writing is idempotent by lease: the head document always holds the current answer, and every
 * attempt appends one activity entry carrying the previous and new term.
 */
export async function recordLeaseTermReview(
  actor: AuthenticatedUser,
  input: RecordLeaseTermReviewInput,
  db: Firestore = getAdminFirestore(),
  now: string = new Date().toISOString(),
): Promise<LeaseTermReviewRecord> {
  assertEditor(actor);
  const parsed = RecordLeaseTermReviewInputSchema.parse(input);
  assertLeaseTermReviewPayload(parsed);
  const leaseId = parsed.lease_id.trim();
  const id = leaseTermReviewDocId(leaseId);
  const headRef = db.collection(LEASE_TERM_REVIEW_COLLECTIONS.reviews).doc(id);

  return db.runTransaction(async (transaction) => {
    const head = await transaction.get(headRef);
    const previousTerm = head.exists
      ? ((head.data()?.term as RecordableLeaseTerm | undefined) ?? null)
      : null;
    const version = Number(head.data()?.version ?? 0) + 1;
    const body = {
      id,
      version,
      lease_id: leaseId,
      term: parsed.term,
      anchor_date: parsed.anchor_date ?? null,
      reason: parsed.reason,
      source_fingerprint: parsed.source_fingerprint,
      recorded_at: now,
      recorded_by_uid: actor.uid,
    };
    const recordHash = createHash("sha256").update(canonicalJson(body)).digest("hex");
    transaction.set(headRef, { ...body, record_hash: recordHash });

    const activityId = uuidv7();
    transaction.set(
      db.collection(LEASE_TERM_REVIEW_COLLECTIONS.activity).doc(activityId),
      {
        id: activityId,
        lease_id: leaseId,
        version,
        previous_term: previousTerm,
        new_term: parsed.term,
        anchor_date: parsed.anchor_date ?? null,
        reason: parsed.reason,
        source_fingerprint: parsed.source_fingerprint,
        record_hash: recordHash,
        actor_uid: actor.uid,
        recorded_at: now,
        created_at: FieldValue.serverTimestamp(),
      },
    );
    return fromStored({ ...body, record_hash: recordHash });
  });
}

export async function getLeaseTermReview(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseTermReviewRecord | null> {
  assertReader(actor);
  const trimmed = leaseId.trim();
  if (!trimmed) return null;
  const snapshot = await db
    .collection(LEASE_TERM_REVIEW_COLLECTIONS.reviews)
    .doc(leaseTermReviewDocId(trimmed))
    .get();
  if (!snapshot.exists) return null;
  return fromStored(snapshot.data()!);
}

/** Every current term review, keyed by lease id, for the one bulk desk read. */
export async function listLeaseTermReviews(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, LeaseTermReviewRecord>> {
  assertReader(actor);
  const snapshot = await db.collection(LEASE_TERM_REVIEW_COLLECTIONS.reviews).get();
  const byLease = new Map<string, LeaseTermReviewRecord>();
  for (const doc of snapshot.docs) {
    const record = fromStored(doc.data());
    byLease.set(record.leaseId, record);
  }
  return byLease;
}

export async function listLeaseTermReviewActivity(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<
  Array<{
    id: string;
    leaseId: string;
    version: number;
    previousTerm: RecordableLeaseTerm | null;
    newTerm: RecordableLeaseTerm;
    reason: string;
    actorUid: string;
    recordedAtIso: string;
  }>
> {
  assertReader(actor);
  const trimmed = leaseId.trim();
  if (!trimmed) return [];
  const snapshot = await db
    .collection(LEASE_TERM_REVIEW_COLLECTIONS.activity)
    .where("lease_id", "==", trimmed)
    .get();
  return snapshot.docs
    .map((doc) => {
      const raw = doc.data();
      return {
        id: String(raw.id),
        leaseId: String(raw.lease_id),
        version: Number(raw.version),
        previousTerm:
          typeof raw.previous_term === "string"
            ? z.enum(RECORDABLE_LEASE_TERMS).parse(raw.previous_term)
            : null,
        newTerm: z.enum(RECORDABLE_LEASE_TERMS).parse(raw.new_term),
        reason: String(raw.reason),
        actorUid: String(raw.actor_uid),
        recordedAtIso: String(raw.recorded_at),
      };
    })
    .sort(
      (left, right) =>
        left.recordedAtIso.localeCompare(right.recordedAtIso) ||
        left.version - right.version,
    );
}

function fromStored(raw: Record<string, unknown>): LeaseTermReviewRecord {
  return {
    id: String(raw.id),
    version: Number(raw.version),
    leaseId: String(raw.lease_id),
    term: z.enum(RECORDABLE_LEASE_TERMS).parse(raw.term),
    anchorDateIso: typeof raw.anchor_date === "string" ? raw.anchor_date : null,
    reason: String(raw.reason),
    sourceFingerprint: String(raw.source_fingerprint),
    recordHash: String(raw.record_hash),
    recordedAtIso: String(raw.recorded_at),
    recordedByUid: String(raw.recorded_by_uid),
  };
}
