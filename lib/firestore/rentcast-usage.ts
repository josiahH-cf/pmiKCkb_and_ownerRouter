// Persisted monthly RentCast usage counter (S59). One document per UTC month keyed `YYYY-MM` in
// `rentcast_usage`, holding the count of BILLED live calls (a billable RentCast request is one 2xx
// response with a body; errors are not billed, so they are not counted). The counter is the
// operator-visible answer to "how many do we have left" and the input to the hard quota stop —
// RentCast charges overage AUTOMATICALLY, so this app-side count is the only guard between a loop
// bug and a surprise bill.
//
// Server-only via the Admin SDK. Increment is transactional so concurrent lookups cannot lose a
// count. This layer never calls RentCast and never refuses anything itself; the quota policy lives
// in lib/lease-renewal/rentcast-quota.ts.

import { type Firestore } from "firebase-admin/firestore";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";

export const RENTCAST_USAGE_COLLECTION = "rentcast_usage";

export interface RentcastMonthUsage {
  monthKey: string;
  billedCalls: number;
}

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
}

function assertActor(actor: AuthenticatedUser, capability: "read" | "edit"): void {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "You do not have permission for the RentCast usage counter.",
      403,
    );
  }
}

/** Firestore-backed store. Reads return a zero row for an untouched month rather than failing. */
export function createRentcastUsageStore(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): RentcastUsageStore {
  return {
    async readMonth(monthKey) {
      assertActor(actor, "read");
      const snapshot = await db.collection(RENTCAST_USAGE_COLLECTION).doc(monthKey).get();
      const raw = snapshot.exists ? snapshot.data() : undefined;
      const billed = raw && typeof raw.billed_calls === "number" ? raw.billed_calls : 0;
      return { monthKey, billedCalls: Math.max(0, billed) };
    },
    async incrementMonth(monthKey, by) {
      assertActor(actor, "edit");
      if (!Number.isInteger(by) || by < 1) {
        throw new EditableLayerError(
          "A usage increment must be a positive integer.",
          400,
        );
      }
      const ref = db.collection(RENTCAST_USAGE_COLLECTION).doc(monthKey);
      const billedCalls = await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        const raw = snapshot.exists ? snapshot.data() : undefined;
        const current =
          raw && typeof raw.billed_calls === "number" ? Math.max(0, raw.billed_calls) : 0;
        const next = current + by;
        tx.set(ref, { billed_calls: next, updated_at: new Date().toISOString() });
        return next;
      });
      return { monthKey, billedCalls };
    },
  };
}
