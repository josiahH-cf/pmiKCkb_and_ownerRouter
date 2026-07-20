// No-actor Firestore writer for the public tokenized maintenance intake (A5). This is the ONLY write
// path reachable from the unauthenticated public route, and it is deliberately structured so it CANNOT
// bypass the edit gate or reach a system of record:
//
//   - It takes NO AuthenticatedUser / actor and NEVER imports requireCapability, lib/auth/session,
//     createMaintenanceTicket, RentVine, or the unit-matcher. (A negative-import test pins this.)
//   - It writes ONLY to the maintenance_unverified_intake QUARANTINE collection — never the real
//     maintenance_tickets queue. A human editor reviews and promotes an intake to a real ticket later
//     through the normal edit-gated path; nothing here creates a ticket or a work order.
//
// Abuse controls, all enforced transactionally (reads-before-writes) so they are race-free:
//   - Single-use nonce (jti): a used single-use token cannot be replayed.
//   - Per-property daily cap: a global (IP-independent) 503 kill-ceiling bounds cost/spam per property.
//   - Revocation epoch: a token minted before the property's epoch advanced is rejected.
//
// Timestamps are ISO strings (no serverTimestamp) so the writer is deterministic and unit-testable
// against the simple fake Firestore as well as the real Admin SDK.

import type { Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { getAdminFirestore } from "@/lib/firestore/admin";
import type { UnverifiedIntakeRecord } from "@/lib/maintenance/intake-model";
import {
  normalizeIntakePropertyKey,
  sanitizeIntakeText,
} from "@/lib/maintenance/intake-sanitize";

// Re-export the client-safe record shape so server callers can keep importing it from here; the review
// UI imports it directly from lib/maintenance/intake-model to avoid pulling this Admin-SDK module client-side.
export type {
  UnverifiedIntakeRecord,
  UnverifiedIntakeStatus,
} from "@/lib/maintenance/intake-model";

export const MAINTENANCE_INTAKE_COLLECTIONS = {
  intake: "maintenance_unverified_intake",
  activity: "maintenance_unverified_intake_activity",
  nonce: "maintenance_intake_nonce",
  rateCounter: "maintenance_intake_rate_counter",
  epoch: "maintenance_intake_epoch",
} as const;

// Consumed single-use nonces and rejected intake are retained then reaped by a Firestore TTL policy on
// `expires_at` (owner-configured), so junk cannot accumulate unbounded (owner budget safety).
const NONCE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (>= max token TTL)
const INTAKE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days of un-triaged intake

export interface PublicIntakeSubmission {
  propertyKey: string;
  dataMode: "live" | "test";
  jti: string;
  tokenEpoch: number;
  singleUse: boolean;
  summary: string;
  description?: string;
  contact?: string;
  ipHash: string | null;
  dailyCap: number;
  // F-MAINT-3: the tighter per-property/day ceiling applied to reusable (signage) links, which do not
  // burn a nonce. Clamped to never exceed dailyCap at enforcement.
  signageCap: number;
}

export class IntakeValidationError extends Error {
  readonly code = "intake_invalid";
  readonly status = 400;
  constructor() {
    super("The maintenance intake submission was rejected.");
    this.name = "IntakeValidationError";
  }
}

export class IntakeReplayError extends Error {
  readonly code = "intake_replayed";
  readonly status = 409;
  constructor() {
    super("This intake link has already been used.");
    this.name = "IntakeReplayError";
  }
}

export class IntakeRevokedError extends Error {
  readonly code = "intake_revoked";
  readonly status = 401;
  constructor() {
    super("This intake link is no longer valid.");
    this.name = "IntakeRevokedError";
  }
}

export class IntakeDailyCapError extends Error {
  readonly code = "intake_daily_cap";
  readonly status = 503;
  constructor() {
    super("This property has reached its daily maintenance-intake limit.");
    this.name = "IntakeDailyCapError";
  }
}

function isoDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function readEpoch(snapshot: { exists: boolean; data: () => unknown }): number {
  if (!snapshot.exists) return 0;
  const raw = (snapshot.data() as { epoch?: unknown } | undefined)?.epoch;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? Math.trunc(raw)
    : 0;
}

function readCount(snapshot: { exists: boolean; data: () => unknown }): number {
  if (!snapshot.exists) return 0;
  const raw = (snapshot.data() as { count?: unknown } | undefined)?.count;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? Math.trunc(raw)
    : 0;
}

/**
 * Persist one unverified intake from the public route. Sanitizes every field (defense in depth — the
 * route sanitizes too), enforces the nonce/epoch/daily-cap invariants inside a single transaction, and
 * writes the intake + its append-only Activity twin atomically. Returns the internal doc id; the ROUTE
 * is responsible for returning a fresh random reference to the caller (never this id or the jti).
 */
export async function createUnverifiedIntakeFromPublic(
  submission: PublicIntakeSubmission,
  db: Firestore = getAdminFirestore(),
  now: number = Date.now(),
): Promise<{ id: string }> {
  const propertyKey = normalizeIntakePropertyKey(submission.propertyKey);
  if (!propertyKey) throw new IntakeValidationError();
  if (!(["live", "test"] as const).includes(submission.dataMode)) {
    throw new IntakeValidationError();
  }

  const summary = sanitizeIntakeText(submission.summary, "summary");
  if (!summary) throw new IntakeValidationError();
  const description = sanitizeIntakeText(submission.description, "description");
  const contact = sanitizeIntakeText(submission.contact, "contact");

  const jti = submission.jti?.trim();
  if (!jti) throw new IntakeValidationError();

  const dailyCap =
    Number.isFinite(submission.dailyCap) && submission.dailyCap > 0
      ? Math.trunc(submission.dailyCap)
      : 1;
  // F-MAINT-3: reusable (signage) links get a tighter per-property/day ceiling than single-use links, so
  // one publicly posted signage link cannot flood a property's triage queue. Never looser than dailyCap;
  // an absent/invalid signage cap falls back to dailyCap (no extra restriction).
  const signageCap =
    Number.isFinite(submission.signageCap) && submission.signageCap > 0
      ? Math.min(Math.trunc(submission.signageCap), dailyCap)
      : dailyCap;
  const effectiveCap = submission.singleUse ? dailyCap : signageCap;

  const createdAt = new Date(now).toISOString();
  const id = uuidv7();

  await db.runTransaction(async (transaction) => {
    // All reads first (Firestore requires reads-before-writes).
    const epochRef = db.collection(MAINTENANCE_INTAKE_COLLECTIONS.epoch).doc(propertyKey);
    const nonceRef = db.collection(MAINTENANCE_INTAKE_COLLECTIONS.nonce).doc(jti);
    const counterRef = db
      .collection(MAINTENANCE_INTAKE_COLLECTIONS.rateCounter)
      .doc(
        submission.dataMode === "test"
          ? `test__${propertyKey}__${isoDay(now)}`
          : `${propertyKey}__${isoDay(now)}`,
      );

    const epochSnap = await transaction.get(epochRef);
    if (submission.tokenEpoch < readEpoch(epochSnap)) {
      throw new IntakeRevokedError();
    }

    if (submission.singleUse) {
      const nonceSnap = await transaction.get(nonceRef);
      if (nonceSnap.exists) throw new IntakeReplayError();
    }

    const counterSnap = await transaction.get(counterRef);
    const count = readCount(counterSnap);
    if (count >= effectiveCap) throw new IntakeDailyCapError();

    // Writes.
    const record: UnverifiedIntakeRecord = {
      id,
      data_mode: submission.dataMode,
      status: "unverified",
      source: "public-link",
      property_key: propertyKey,
      summary,
      description,
      contact,
      reporter_kind: "external",
      ip_hash: submission.ipHash,
      created_at: createdAt,
      expires_at: new Date(now + INTAKE_RETENTION_MS).toISOString(),
    };
    transaction.set(db.collection(MAINTENANCE_INTAKE_COLLECTIONS.intake).doc(id), record);
    transaction.set(
      db.collection(MAINTENANCE_INTAKE_COLLECTIONS.activity).doc(uuidv7()),
      {
        id: uuidv7(),
        intake_id: id,
        action: "intake",
        source: "public-link",
        data_mode: submission.dataMode,
        created_at: createdAt,
      },
    );
    if (submission.singleUse) {
      transaction.set(nonceRef, {
        jti,
        property_key: propertyKey,
        data_mode: submission.dataMode,
        created_at: createdAt,
        expires_at: new Date(now + NONCE_RETENTION_MS).toISOString(),
      });
    }
    transaction.set(counterRef, {
      property_key: propertyKey,
      data_mode: submission.dataMode,
      day: isoDay(now),
      count: count + 1,
      updated_at: createdAt,
    });
  });

  return { id };
}

/** Read a property's current revocation epoch (0 when unset). Used by the mint route to stamp tokens. */
export async function readIntakeEpoch(
  propertyKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<number> {
  const key = normalizeIntakePropertyKey(propertyKey);
  if (!key) throw new IntakeValidationError();
  const snapshot = await db
    .collection(MAINTENANCE_INTAKE_COLLECTIONS.epoch)
    .doc(key)
    .get();
  return readEpoch(snapshot);
}

/**
 * Advance a property's revocation epoch, invalidating every outstanding token minted at an older epoch.
 * Returns the new epoch. Admin-SDK write (server-side only).
 */
export async function revokeIntakeTokensForProperty(
  propertyKey: string,
  db: Firestore = getAdminFirestore(),
  now: number = Date.now(),
): Promise<number> {
  const key = normalizeIntakePropertyKey(propertyKey);
  if (!key) throw new IntakeValidationError();
  const ref = db.collection(MAINTENANCE_INTAKE_COLLECTIONS.epoch).doc(key);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const next = readEpoch(snapshot) + 1;
    transaction.set(ref, {
      property_key: key,
      epoch: next,
      updated_at: new Date(now).toISOString(),
    });
    return next;
  });
}
