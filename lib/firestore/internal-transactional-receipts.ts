// S39.2 — the internal transactional receipt + health store. Persists ONE receipt per dedup key
// (`support_report:{id}:filed`) so the executor is idempotent (a delivered receipt short-circuits) and
// failures are honest (delivered:false is durable and retryable). Server-written only; the health
// projection is Admin-gated and mirrors ApprovalQueueNotificationHealth (failed count + last failure).
//
// The receipt records only the INTERNAL destination + metadata about the send — never the free-text
// feedback description (which lives only in the Admin-gated support queue, F-SUPP-1 / TIX-8).

import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import type { InternalTransactionalReceipt } from "@/lib/notifications/internal-transactional";

const COLLECTION = "internal_transactional_receipts";
const HEALTH_SCAN_LIMIT = 500;

/** Firestore-safe deterministic doc id for a dedup key (so a repeat set is idempotent, not a duplicate). */
function receiptDocId(dedupKey: string): string {
  return dedupKey.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Read the receipt for a dedup key, or null. Used by the executor's idempotency short-circuit. */
export async function getInternalTransactionalReceipt(
  dedupKey: string,
  db: Firestore = getAdminFirestore(),
): Promise<InternalTransactionalReceipt | null> {
  const snapshot = await db.collection(COLLECTION).doc(receiptDocId(dedupKey)).get();
  if (!snapshot.exists) return null;
  return readReceipt(snapshot.data()!);
}

/** Persist a receipt at its deterministic dedup-key doc id (idempotent set; a retry overwrites in place). */
export async function recordInternalTransactionalReceipt(
  receipt: InternalTransactionalReceipt,
  db: Firestore = getAdminFirestore(),
): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(receiptDocId(receipt.dedup_key))
    .set(stripUndefined({ ...receipt, updated_at: FieldValue.serverTimestamp() }));
}

export type InternalTransactionalHealthStatus = "healthy" | "attention";

export interface InternalTransactionalHealth {
  status: InternalTransactionalHealthStatus;
  failed_delivery_count: number;
  delivered_count: number;
  last_failure?: {
    report_id: string;
    attempted_at: string;
    error?: string;
  };
}

/** Pure health projection over the receipts: any undelivered receipt raises attention + names the latest. */
export function buildInternalTransactionalHealth(
  receipts: readonly InternalTransactionalReceipt[],
): InternalTransactionalHealth {
  const failures = receipts
    .filter((receipt) => !receipt.delivered)
    .sort((left, right) => right.attempted_at.localeCompare(left.attempted_at));
  const deliveredCount = receipts.filter((receipt) => receipt.delivered).length;
  const latest = failures[0];
  return {
    status: failures.length > 0 ? "attention" : "healthy",
    failed_delivery_count: failures.length,
    delivered_count: deliveredCount,
    ...(latest
      ? {
          last_failure: {
            report_id: latest.report_id,
            attempted_at: latest.attempted_at,
            ...(latest.error ? { error: latest.error } : {}),
          },
        }
      : {}),
  };
}

/** Admin-gated health read over the receipt store. Non-Admins are 403'd (operational data). */
export async function readInternalTransactionalHealth(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<InternalTransactionalHealth> {
  if (!can(actor.role, "manageAdmin")) {
    throw new EditableLayerError(
      "Only Admins can view internal transactional delivery health.",
      403,
    );
  }
  const snapshot = await db.collection(COLLECTION).limit(HEALTH_SCAN_LIMIT).get();
  return buildInternalTransactionalHealth(
    snapshot.docs.map((doc) => readReceipt(doc.data())),
  );
}

function readReceipt(data: Record<string, unknown>): InternalTransactionalReceipt {
  return {
    dedup_key: String(data.dedup_key ?? ""),
    action_key: "internal.transactional_notice.send",
    report_id: String(data.report_id ?? ""),
    recipient: String(data.recipient ?? ""),
    delivered: data.delivered === true,
    attempted_at: String(data.attempted_at ?? ""),
    ...(typeof data.error === "string" ? { error: data.error } : {}),
  };
}

function stripUndefined<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
