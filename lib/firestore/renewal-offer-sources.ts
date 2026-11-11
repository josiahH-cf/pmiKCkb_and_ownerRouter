// S264 R-S264-6: the RentVine charge lines the tenant offer was last composed from, kept per lease.
//
// The tenant message's save and Gmail draft paths, and the future rent preview, read RentVine as
// they always have; they keep the lines they read here. A source update that applies the accepted
// renewal (a RentVine lease date or charge, or the operating Sheet renewal date) reads no RentVine
// charges before its claim, so it composes the current offer from these lines with the current
// mappings, charge review and working terms, all from the app's records. No provider call is
// added: a line changed in RentVine after the last of those reads is seen by the next read (the
// lease page reads RentVine on every render), not by such a claim. Lines read before the accepted
// offer was frozen are never used to judge it (see `readTenantAcceptanceCheck`).
//
// Its own collection: the strict records are unchanged, and an older version of the app never
// reads it. Keeping lines never changes an effect, a preview or a receipt.

import type { Firestore } from "firebase-admin/firestore";

import { getAdminFirestore } from "@/lib/firestore/admin";
import type {
  OfferChargeSource,
  OfferSourceLine,
} from "@/lib/lease-renewal/offer-charges";

export const OFFER_SOURCE_COLLECTION = "renewal_offer_sources";
const SCHEMA_VERSION = "renewal-offer-source/v1";

type ReadSource = Extract<OfferChargeSource, { state: "read" }>;

const text = (value: unknown): value is string => typeof value === "string";
const textOrNull = (value: unknown) => value === null || text(value);

function lineIntact(raw: unknown): raw is OfferSourceLine {
  if (!raw || typeof raw !== "object") return false;
  const line = raw as Record<string, unknown>;
  return (
    text(line.chargeId) &&
    text(line.accountId) &&
    textOrNull(line.accountName) &&
    text(line.description) &&
    (line.classification === "rent" ||
      line.classification === "non_rent" ||
      line.classification === "unknown") &&
    text(line.amount) &&
    text(line.frequency) &&
    textOrNull(line.startDate) &&
    textOrNull(line.endDate) &&
    textOrNull(line.endDateRaw) &&
    typeof line.statusId === "number" &&
    text(line.version)
  );
}

/** Keep the lines a tenant offer composition read; any other source state keeps the last read. */
export async function recordOfferSource(
  db: Firestore,
  leaseId: string,
  source: OfferChargeSource,
  readAt: string = new Date().toISOString(),
): Promise<void> {
  if (source.state !== "read") return;
  await db.collection(OFFER_SOURCE_COLLECTION).doc(leaseId).set({
    schemaVersion: SCHEMA_VERSION,
    leaseId,
    source,
    readAt,
  });
}

/**
 * Keep the lines a read path composed the tenant offer from. Never throws: a failed keep leaves
 * the last kept lines, which a claim trusts only when they were read after the accepted offer.
 */
export async function keepOfferSource(
  leaseId: string,
  source: OfferChargeSource,
  db?: Firestore,
): Promise<void> {
  if (source.state !== "read") return;
  try {
    await recordOfferSource(db ?? getAdminFirestore(), leaseId, source);
  } catch {
    // The last kept lines stay; nothing else depends on this keep.
  }
}

/** The lines last kept for a lease, or null when none were kept or they do not read back. */
export async function readOfferSource(
  db: Firestore,
  leaseId: string,
): Promise<{ readonly source: ReadSource; readonly readAt: string } | null> {
  const snapshot = await db.collection(OFFER_SOURCE_COLLECTION).doc(leaseId).get();
  if (!snapshot.exists) return null;
  const source = snapshot.get("source") as Partial<ReadSource> | undefined;
  const readAt = snapshot.get("readAt");
  if (
    snapshot.get("schemaVersion") !== SCHEMA_VERSION ||
    snapshot.get("leaseId") !== leaseId ||
    !text(readAt) ||
    source?.state !== "read" ||
    !Array.isArray(source.lines) ||
    !source.lines.every(lineIntact) ||
    !text(source.version) ||
    !text(source.asOf)
  )
    return null;
  return { source: source as ReadSource, readAt };
}
