// Persisted monthly RentCast usage counter (S59). One document per UTC month keyed `YYYY-MM` in
// `rentcast_usage`, holding the count of BILLED live calls (a billable RentCast request is one 2xx
// response with a body; errors are not billed, so they are not counted). The counter is the
// operator-visible answer to "how many do we have left" and the input to the hard quota stop —
// RentCast charges overage AUTOMATICALLY, so this app-side count is the only guard between a loop
// bug and a surprise bill.
//
// S249 (cost safety): a live call first RESERVES one place under the allowance, in the same
// transaction that checks it, so two sessions at 49 of 50 cannot both dispatch. A reservation is
// settled once the call's outcome is known: a billed call moves it into the billed count; a call
// the provider provably never received or provably did not bill releases it; an outcome that
// cannot be known (a timeout, a lost connection, a crash mid-call) keeps holding its place for the
// month. Held places count against the allowance exactly like billed calls, so the stop can only
// err toward fewer calls. The allowance value itself is unchanged.
//
// Server-only via the Admin SDK. Every change is transactional so concurrent lookups cannot lose a
// count. This layer never calls RentCast; the quota policy lives in lib/lease-renewal/rentcast-quota.ts.

import { type Firestore } from "firebase-admin/firestore";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const RENTCAST_USAGE_COLLECTION = "rentcast_usage";

export interface RentcastMonthUsage {
  monthKey: string;
  billedCalls: number;
  /** S249: places reserved by a call in flight or held by a call whose outcome is unknown. */
  heldCalls?: number;
}

/** What counts against the allowance: billed calls and every held place. */
export function rentcastUsedCalls(usage: RentcastMonthUsage): number {
  return Math.max(0, usage.billedCalls) + Math.max(0, usage.heldCalls ?? 0);
}

/** How one reserved call ended. */
export type RentcastReservationOutcome =
  /** The provider billed the call: the place joins the billed count. */
  | "billed"
  /** The provider provably never received the call, or provably did not bill it. */
  | "released"
  /** The outcome cannot be known: the place stays held for the month. */
  | "uncertain";

export type RentcastReservation =
  | { readonly reserved: true; readonly usage: RentcastMonthUsage }
  | { readonly reserved: false; readonly usage: RentcastMonthUsage };

/** UTC month key for a timestamp, e.g. "2026-08". The quota resets per billing period. */
export function rentcastMonthKey(nowMs: number): string {
  const date = new Date(nowMs);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

/** The minimal store seam the route and quota policy consume; a fake satisfies it in tests. */
export interface RentcastUsageStore {
  readMonth(monthKey: string): Promise<RentcastMonthUsage>;
  incrementMonth(monthKey: string, by: number): Promise<RentcastMonthUsage>;
  /**
   * Check the allowance and reserve one place in one transaction. Refused (nothing reserved) when
   * billed calls and held places already reach the allowance.
   */
  reserveMonth(
    monthKey: string,
    input: { readonly allowance: number; readonly reservationId: string },
  ): Promise<RentcastReservation>;
  /** Settle one reservation; settling an unknown or already settled one changes nothing. */
  settleReservation(
    monthKey: string,
    reservationId: string,
    outcome: RentcastReservationOutcome,
  ): Promise<RentcastMonthUsage>;
}

function assertActor(actor: AuthenticatedUser, capability: "read" | "edit"): void {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "You do not have permission for the RentCast usage counter.",
      403,
    );
  }
}

const RESERVATION_ID = /^[A-Za-z0-9-]{8,64}$/;

interface HeldPlace {
  state: "in_flight" | "uncertain";
  at: string;
}

function monthOf(raw: Record<string, unknown> | undefined): {
  billed: number;
  held: Record<string, HeldPlace>;
} {
  const billed =
    raw && typeof raw.billed_calls === "number" ? Math.max(0, raw.billed_calls) : 0;
  const stored =
    raw && raw.reservations && typeof raw.reservations === "object"
      ? (raw.reservations as Record<string, unknown>)
      : {};
  const held: Record<string, HeldPlace> = {};
  for (const [id, value] of Object.entries(stored)) {
    const entry = value as Partial<HeldPlace> | null;
    held[id] = {
      state: entry?.state === "uncertain" ? "uncertain" : "in_flight",
      at: typeof entry?.at === "string" ? entry.at : "",
    };
  }
  return { billed, held };
}

function usageOf(
  monthKey: string,
  month: { billed: number; held: Record<string, HeldPlace> },
): RentcastMonthUsage {
  return {
    monthKey,
    billedCalls: month.billed,
    heldCalls: Object.keys(month.held).length,
  };
}

/** Firestore-backed store. Reads return a zero row for an untouched month rather than failing. */
export function createRentcastUsageStore(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): RentcastUsageStore {
  const refFor = (monthKey: string) =>
    db.collection(RENTCAST_USAGE_COLLECTION).doc(monthKey);
  return {
    async readMonth(monthKey) {
      assertActor(actor, "read");
      const snapshot = await refFor(monthKey).get();
      return usageOf(monthKey, monthOf(snapshot.exists ? snapshot.data() : undefined));
    },
    async incrementMonth(monthKey, by) {
      assertActor(actor, "edit");
      if (!Number.isInteger(by) || by < 1) {
        throw new EditableLayerError(
          "A usage increment must be a positive integer.",
          400,
        );
      }
      const ref = refFor(monthKey);
      return db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const month = monthOf(snapshot.exists ? snapshot.data() : undefined);
        const next = { ...month, billed: month.billed + by };
        // Merge, so the places held by calls in flight are kept.
        tx.set(
          ref,
          { billed_calls: next.billed, updated_at: new Date().toISOString() },
          { merge: true },
        );
        return usageOf(monthKey, next);
      });
    },
    async reserveMonth(monthKey, input) {
      assertActor(actor, "edit");
      if (!RESERVATION_ID.test(input.reservationId))
        throw new EditableLayerError("A usage reservation needs an operation id.", 400);
      if (!Number.isInteger(input.allowance) || input.allowance < 1)
        throw new EditableLayerError("The allowance must be a positive integer.", 400);
      const ref = refFor(monthKey);
      return db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const month = monthOf(snapshot.exists ? snapshot.data() : undefined);
        if (month.held[input.reservationId])
          return { reserved: true as const, usage: usageOf(monthKey, month) };
        if (month.billed + Object.keys(month.held).length >= input.allowance)
          return { reserved: false as const, usage: usageOf(monthKey, month) };
        const at = new Date().toISOString();
        const held = {
          ...month.held,
          [input.reservationId]: { state: "in_flight" as const, at },
        };
        tx.set(ref, { billed_calls: month.billed, reservations: held, updated_at: at });
        return {
          reserved: true as const,
          usage: usageOf(monthKey, { billed: month.billed, held }),
        };
      });
    },
    async settleReservation(monthKey, reservationId, outcome) {
      assertActor(actor, "edit");
      const ref = refFor(monthKey);
      return db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const month = monthOf(snapshot.exists ? snapshot.data() : undefined);
        const place = month.held[reservationId];
        // Unknown, or already settled as uncertain (an uncertain place is never released later).
        if (!place || place.state === "uncertain") return usageOf(monthKey, month);
        const at = new Date().toISOString();
        const held = { ...month.held };
        let billed = month.billed;
        if (outcome === "uncertain") held[reservationId] = { state: "uncertain", at };
        else {
          delete held[reservationId];
          if (outcome === "billed") billed += 1;
        }
        tx.set(ref, { billed_calls: billed, reservations: held, updated_at: at });
        return usageOf(monthKey, { billed, held });
      });
    },
  };
}
