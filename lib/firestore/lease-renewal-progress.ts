// KB-owned persistence for the Phase-A LIVE renewal PROGRESS state (the clickable front-to-back flow).
//
// One record per lease (docId = sanitized RentVine lease id) plus an append-only Activity trail. It holds
// ONLY the operator's own forward progress — the recorded owner decision, the tenant-offer draft id once
// created, and a complete flag. Every field is derived from operator action inside the auth boundary.
//
// GOVERNANCE: this layer changes NO system of record. RentVine stays GET-only and the Sheet stays
// read-only; recording a decision here never composes, sends, or writes back. The transition rules live
// in the pure lib/lease-renewal/renewal-progress.ts planners; this layer only reads/writes Firestore.

import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { COMP_SCREENSHOT_EXECUTION_COLLECTIONS } from "@/lib/firestore/lease-renewal-comp-screenshot-executions";
import {
  LEASE_RENEWAL_PROGRESS_COLLECTIONS,
  progressDocId,
} from "@/lib/firestore/lease-renewal-progress-schema";
import type {
  LeaseRenewalProgressActivityRecord,
  LeaseRenewalProgressRecord,
} from "@/lib/firestore/types";
import {
  attachableCompScreenshot,
  compScreenshotHeadDocId,
  type CompScreenshotAttachment,
} from "@/lib/lease-renewal/comp-screenshot-attachment";
import {
  compScreenshotRecordIdentity,
  type CompScreenshotExecutionRecord,
} from "@/lib/lease-renewal/comp-screenshot-contract";
import { decodeLegacyManualMarketBasis } from "@/lib/lease-renewal/legacy-market-basis";
import {
  planMarkComplete,
  planRecordOwnerDecision,
  planRecordTenantOfferDraft,
  type RenewalMarketProviderBasis,
  type RenewalOwnerDecision,
  type RenewalOwnerDecisionWriteInput,
  type RenewalProgress,
  type RenewalProgressPlan,
} from "@/lib/lease-renewal/renewal-progress";
import { stampProductRecordRetention } from "@/lib/operations/product-record-retention";

export {
  LEASE_RENEWAL_PROGRESS_COLLECTIONS,
  progressDocId,
} from "@/lib/firestore/lease-renewal-progress-schema";

type ProgressActivityAction = LeaseRenewalProgressActivityRecord["action"];

interface TransitionResolution {
  plan: RenewalProgressPlan;
  attachment?: CompScreenshotAttachment;
}

/** Record (or replace) the owner's rent decision for a lease, advancing it to the Tenant-offer step. */
export async function recordOwnerDecision(
  actor: AuthenticatedUser,
  leaseId: string,
  decision: RenewalOwnerDecisionWriteInput,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalProgress> {
  return applyTransition(
    actor,
    leaseId,
    async (current, transaction) => {
      const attachment = await resolveCurrentCompScreenshotAttachment(
        transaction,
        db,
        leaseId,
      );
      const safeDecision = withoutCallerScreenshotRef(decision);
      const market =
        safeDecision.market || attachment
          ? {
              ...(safeDecision.market ?? {}),
              ...(attachment ? { compScreenshotRef: attachment.ref } : {}),
            }
          : undefined;
      return {
        plan: planRecordOwnerDecision(current, {
          ...safeDecision,
          ...(market ? { market } : {}),
        }),
        ...(attachment ? { attachment } : {}),
      };
    },
    "owner_decision",
    db,
  );
}

/** Stamp the created tenant-offer Gmail draft id and advance the lease to Build docs. */
export async function recordTenantOfferDraft(
  actor: AuthenticatedUser,
  leaseId: string,
  draftId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalProgress> {
  return applyTransition(
    actor,
    leaseId,
    (current, _transaction, currentAttachment) => ({
      plan: planRecordTenantOfferDraft(current, draftId),
      ...(currentAttachment ? { attachment: currentAttachment } : {}),
    }),
    "tenant_offer_drafted",
    db,
  );
}

/** Mark the renewal complete for a lease (operator confirms the process is done). */
export async function markRenewalComplete(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalProgress> {
  return applyTransition(
    actor,
    leaseId,
    (current, _transaction, currentAttachment) => ({
      plan: planMarkComplete(current),
      ...(currentAttachment ? { attachment: currentAttachment } : {}),
    }),
    "mark_complete",
    db,
  );
}

/** Read one lease's progress, or null when the operator has not touched it yet. Read-gated. */
export async function getRenewalProgress(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<RenewalProgress | null> {
  assertCan(actor, "read");
  const snapshot = await progressRef(db, progressDocId(leaseId)).get();
  if (!snapshot.exists) return null;
  return toRenewalProgress(readRecord(snapshot.id, snapshot.data()!));
}

/**
 * Read every progress record as a Map keyed by lease id, for the live desk's stage projection. Read-gated
 * and bounded — only leases an operator has actually touched carry a record, so this is a small read.
 */
export async function listAllRenewalProgress(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<Map<string, RenewalProgress>> {
  assertCan(actor, "read");
  const snapshot = await db.collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress).get();
  const byLease = new Map<string, RenewalProgress>();
  for (const doc of snapshot.docs) {
    const progress = toRenewalProgress(readRecord(doc.id, doc.data()));
    byLease.set(progress.leaseId, progress);
  }
  return byLease;
}

/**
 * S63 (AC-S63-6): the first reader the activity trail has ever had. The collection is written on
 * every transition and until this suite nothing anywhere read it — no query, no page, no export.
 * Returns one lease's transitions in time order (created_at, uuidv7 id tie-break), which is most
 * of the per-lease test-set timeline for free. Read-gated like the sibling progress readers.
 */
export async function listRenewalProgressActivity(
  actor: AuthenticatedUser,
  leaseId: string,
  db: Firestore = getAdminFirestore(),
): Promise<LeaseRenewalProgressActivityRecord[]> {
  assertCan(actor, "read");
  const trimmedLeaseId = leaseId.trim();
  if (trimmedLeaseId === "") return [];
  const snapshot = await db
    .collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progressActivity)
    .where("lease_id", "==", trimmedLeaseId)
    .get();
  const entries: LeaseRenewalProgressActivityRecord[] = [];
  for (const doc of snapshot.docs) {
    const raw = normalizeFirestoreValue({ ...doc.data(), id: doc.id }) as Record<
      string,
      unknown
    >;
    if (
      typeof raw.lease_id === "string" &&
      typeof raw.actor_uid === "string" &&
      typeof raw.action === "string" &&
      typeof raw.stage_index === "number"
    ) {
      entries.push(raw as unknown as LeaseRenewalProgressActivityRecord);
    }
  }
  return entries.sort(
    (left, right) =>
      String(left.created_at).localeCompare(String(right.created_at)) ||
      left.id.localeCompare(right.id),
  );
}

/**
 * Shared transition core: edit-gate, read the current record inside a transaction, run the pure planner
 * (which validates and throws EditableLayerError on a bad/out-of-order move), then persist the new state
 * plus an append-only Activity row. Reads the record back so the caller returns the canonical shape.
 */
async function applyTransition(
  actor: AuthenticatedUser,
  leaseId: string,
  resolve: (
    current: RenewalProgress | null,
    transaction: Transaction,
    currentAttachment: CompScreenshotAttachment | null,
  ) => TransitionResolution | Promise<TransitionResolution>,
  action: ProgressActivityAction,
  db: Firestore,
): Promise<RenewalProgress> {
  assertCan(actor, "edit");
  const trimmedLeaseId = leaseId.trim();
  if (trimmedLeaseId === "") {
    throw new EditableLayerError("A lease id is required.", 400);
  }
  const docId = progressDocId(trimmedLeaseId);

  await db.runTransaction(async (transaction) => {
    const ref = progressRef(db, docId);
    const snapshot = await transaction.get(ref);
    const currentRecord = snapshot.exists
      ? readRecord(snapshot.id, snapshot.data()!)
      : null;
    const current = currentRecord ? toRenewalProgress(currentRecord) : null;
    const currentAttachment = currentRecord
      ? progressScreenshotAttachment(currentRecord)
      : null;
    const createdAt = snapshot.exists
      ? (snapshot.get("created_at") ?? FieldValue.serverTimestamp())
      : FieldValue.serverTimestamp();

    const resolved = await resolve(current, transaction, currentAttachment);
    const next = resolved.plan;
    const attachment = resolved.attachment;

    // Full set (no merge) so a re-recorded decision never leaves a stale draft id or charges behind.
    transaction.set(
      ref,
      stampProductRecordRetention(
        "lease_renewal_progress",
        stripUndefined({
          id: docId,
          lease_id: trimmedLeaseId,
          stage_index: next.stageIndex,
          owner_decision: next.ownerDecision
            ? stripUndefined({
                decision: next.ownerDecision.decision,
                offered_rent: next.ownerDecision.offeredRent,
                charges: next.ownerDecision.charges,
                info_form_url: next.ownerDecision.infoFormUrl,
                market: next.ownerDecision.market
                  ? stripUndefined({
                      range_low: next.ownerDecision.market.rangeLow,
                      range_high: next.ownerDecision.market.rangeHigh,
                      pmi_number: next.ownerDecision.market.pmiNumber,
                      comp_screenshot_ref: attachment?.ref,
                      comp_screenshot_execution_id: attachment?.executionId,
                      comp_screenshot_receipt_id: attachment?.receiptId,
                      comp_screenshot_result_hash: attachment?.resultHash,
                      comp_source: next.ownerDecision.market.compSource,
                      comp_retrieved_at: next.ownerDecision.market.compRetrievedAt,
                      provider: providerBasisToRecord(next.ownerDecision.market.provider),
                    })
                  : undefined,
              })
            : undefined,
          tenant_offer_draft_id: next.tenantOfferDraftId ?? undefined,
          complete: next.complete,
          updated_by_uid: actor.uid,
          created_at: createdAt,
          updated_at: FieldValue.serverTimestamp(),
        }),
        snapshot.data(),
      ),
    );

    const activityId = uuidv7();
    transaction.set(
      activityRef(db, activityId),
      stripUndefined({
        id: activityId,
        lease_id: trimmedLeaseId,
        actor_uid: actor.uid,
        action,
        stage_index: next.stageIndex,
        created_at: FieldValue.serverTimestamp(),
      }),
    );
  });

  const saved = await getRenewalProgress(actor, trimmedLeaseId, db);
  if (!saved) {
    throw new EditableLayerError("Progress could not be read back after write.", 404);
  }
  return saved;
}

function progressRef(db: Firestore, docId: string) {
  return db.collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progress).doc(docId);
}

function activityRef(db: Firestore, docId: string) {
  return db.collection(LEASE_RENEWAL_PROGRESS_COLLECTIONS.progressActivity).doc(docId);
}

async function resolveCurrentCompScreenshotAttachment(
  transaction: Transaction,
  db: Firestore,
  leaseId: string,
): Promise<CompScreenshotAttachment | null> {
  const { compRecordHash } = compScreenshotRecordIdentity(leaseId);
  const headRef = db
    .collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.heads)
    .doc(compScreenshotHeadDocId(compRecordHash));
  const headSnapshot = await transaction.get(headRef);
  if (!headSnapshot.exists) return null;
  const head = headSnapshot.data();
  if (head?.compRecordHash !== compRecordHash || typeof head.executionId !== "string") {
    return null;
  }
  const executionSnapshot = await transaction.get(
    db.collection(COMP_SCREENSHOT_EXECUTION_COLLECTIONS.executions).doc(head.executionId),
  );
  if (!executionSnapshot.exists) return null;
  return attachableCompScreenshot(
    executionSnapshot.data() as CompScreenshotExecutionRecord,
    compRecordHash,
  );
}

function withoutCallerScreenshotRef(
  decision: RenewalOwnerDecisionWriteInput | RenewalOwnerDecision,
): RenewalOwnerDecision {
  if (!decision.market) return decision;
  const market = {
    ...(decision.market as NonNullable<RenewalOwnerDecision["market"]>),
  };
  delete market.compScreenshotRef;
  return {
    ...decision,
    market,
  };
}

function progressScreenshotAttachment(
  record: LeaseRenewalProgressRecord,
): CompScreenshotAttachment | null {
  const market = record.owner_decision?.market;
  if (
    !market?.comp_screenshot_ref ||
    !market.comp_screenshot_execution_id ||
    !market.comp_screenshot_receipt_id ||
    !market.comp_screenshot_result_hash
  ) {
    return null;
  }
  const { compRecordHash } = compScreenshotRecordIdentity(record.lease_id);
  if (
    !/^drive:[A-Za-z0-9_-]{10,200}$/.test(market.comp_screenshot_ref) ||
    !/^comp_store_[a-f0-9]{48}$/.test(market.comp_screenshot_execution_id) ||
    market.comp_screenshot_receipt_id !== market.comp_screenshot_execution_id ||
    !/^[a-f0-9]{64}$/.test(market.comp_screenshot_result_hash)
  ) {
    return null;
  }
  return {
    compRecordHash,
    executionId: market.comp_screenshot_execution_id,
    receiptId: market.comp_screenshot_receipt_id,
    resultHash: market.comp_screenshot_result_hash,
    ref: market.comp_screenshot_ref,
  };
}

type ProviderBasisRecord = NonNullable<
  NonNullable<
    NonNullable<LeaseRenewalProgressRecord["owner_decision"]>["market"]
  >["provider"]
>;

/** S60: persist the provider basis snake_case, verbatim — never a synthesized value. */
function providerBasisToRecord(
  provider: RenewalMarketProviderBasis | undefined,
): ProviderBasisRecord | undefined {
  if (!provider) return undefined;
  return stripUndefined({
    source: provider.source,
    range_low: provider.rangeLow,
    range_high: provider.rangeHigh,
    point_estimate: provider.pointEstimate,
    comp_count: provider.compCount,
    retrieved_at: provider.retrievedAt,
    radius_miles: provider.radiusMiles,
    requested_comp_count: provider.requestedCompCount,
    lookup_subject_attributes: provider.lookupSubjectAttributes,
    provider_version: provider.providerVersion,
    cache_state: provider.cacheState,
    omitted_attributes: provider.omittedAttributes,
    unit_filters: provider.unitFilters
      ? stripUndefined({
          bedrooms: provider.unitFilters.bedrooms,
          bathrooms: provider.unitFilters.bathrooms,
          square_footage: provider.unitFilters.squareFootage,
          property_type: provider.unitFilters.propertyType,
        })
      : undefined,
    subject_property: provider.subjectProperty
      ? stripUndefined({
          property_type: provider.subjectProperty.propertyType,
          bedrooms: provider.subjectProperty.bedrooms,
          bathrooms: provider.subjectProperty.bathrooms,
          square_footage: provider.subjectProperty.squareFootage,
        })
      : undefined,
    comps: provider.comps
      ? provider.comps.map((comp) =>
          stripUndefined({
            rent: comp.rent,
            correlation: comp.correlation,
            distance_miles: comp.distanceMiles,
            property_type: comp.propertyType,
            bedrooms: comp.bedrooms,
            bathrooms: comp.bathrooms,
            square_footage: comp.squareFootage,
            listed_date: comp.listedDate,
            last_seen_date: comp.lastSeenDate,
            days_old: comp.daysOld,
            days_on_market: comp.daysOnMarket,
          }),
        )
      : undefined,
    trend: provider.trend
      ? {
          zip_code: provider.trend.zipCode,
          retrieved_at: provider.trend.retrievedAt,
          months: Object.fromEntries(
            Object.entries(provider.trend.months).map(([month, values]) => [
              month,
              stripUndefined({
                average_rent: values.averageRent,
                median_rent: values.medianRent,
              }),
            ]),
          ),
        }
      : undefined,
  }) as ProviderBasisRecord;
}

/** S60: project the persisted provider basis back onto the app shape. */
function providerBasisFromRecord(
  record: ProviderBasisRecord | undefined,
): RenewalMarketProviderBasis | undefined {
  if (!record) return undefined;
  return {
    source: record.source,
    rangeLow: record.range_low,
    rangeHigh: record.range_high,
    pointEstimate: record.point_estimate,
    compCount: record.comp_count,
    retrievedAt: record.retrieved_at,
    ...(record.radius_miles !== undefined ? { radiusMiles: record.radius_miles } : {}),
    ...(record.requested_comp_count !== undefined
      ? { requestedCompCount: record.requested_comp_count }
      : {}),
    ...(record.lookup_subject_attributes !== undefined
      ? { lookupSubjectAttributes: record.lookup_subject_attributes }
      : {}),
    ...(record.provider_version !== undefined
      ? { providerVersion: record.provider_version }
      : {}),
    ...(record.cache_state !== undefined ? { cacheState: record.cache_state } : {}),
    ...(record.omitted_attributes
      ? { omittedAttributes: record.omitted_attributes }
      : {}),
    ...(record.unit_filters
      ? {
          unitFilters: {
            ...(record.unit_filters.bedrooms !== undefined
              ? { bedrooms: record.unit_filters.bedrooms }
              : {}),
            ...(record.unit_filters.bathrooms !== undefined
              ? { bathrooms: record.unit_filters.bathrooms }
              : {}),
            ...(record.unit_filters.square_footage !== undefined
              ? { squareFootage: record.unit_filters.square_footage }
              : {}),
            ...(record.unit_filters.property_type !== undefined
              ? { propertyType: record.unit_filters.property_type }
              : {}),
          },
        }
      : {}),
    ...(record.subject_property
      ? {
          subjectProperty: {
            ...(record.subject_property.property_type !== undefined
              ? { propertyType: record.subject_property.property_type }
              : {}),
            ...(record.subject_property.bedrooms !== undefined
              ? { bedrooms: record.subject_property.bedrooms }
              : {}),
            ...(record.subject_property.bathrooms !== undefined
              ? { bathrooms: record.subject_property.bathrooms }
              : {}),
            ...(record.subject_property.square_footage !== undefined
              ? { squareFootage: record.subject_property.square_footage }
              : {}),
          },
        }
      : {}),
    ...(record.comps
      ? {
          comps: record.comps.map((comp) => ({
            rent: comp.rent,
            ...(comp.correlation !== undefined ? { correlation: comp.correlation } : {}),
            ...(comp.distance_miles !== undefined
              ? { distanceMiles: comp.distance_miles }
              : {}),
            ...(comp.property_type !== undefined
              ? { propertyType: comp.property_type }
              : {}),
            ...(comp.bedrooms !== undefined ? { bedrooms: comp.bedrooms } : {}),
            ...(comp.bathrooms !== undefined ? { bathrooms: comp.bathrooms } : {}),
            ...(comp.square_footage !== undefined
              ? { squareFootage: comp.square_footage }
              : {}),
            ...(comp.listed_date !== undefined ? { listedDate: comp.listed_date } : {}),
            ...(comp.last_seen_date !== undefined
              ? { lastSeenDate: comp.last_seen_date }
              : {}),
            ...(comp.days_old !== undefined ? { daysOld: comp.days_old } : {}),
            ...(comp.days_on_market !== undefined
              ? { daysOnMarket: comp.days_on_market }
              : {}),
          })),
        }
      : {}),
    ...(record.trend
      ? {
          trend: {
            zipCode: record.trend.zip_code,
            retrievedAt: record.trend.retrieved_at,
            months: Object.fromEntries(
              Object.entries(record.trend.months ?? {}).map(([month, values]) => [
                month,
                {
                  ...(values.average_rent !== undefined
                    ? { averageRent: values.average_rent }
                    : {}),
                  ...(values.median_rent !== undefined
                    ? { medianRent: values.median_rent }
                    : {}),
                },
              ]),
            ),
          },
        }
      : {}),
  };
}

/** Project the persisted (snake_case) record onto the app-shaped RenewalProgress. */
function toRenewalProgress(record: LeaseRenewalProgressRecord): RenewalProgress {
  const decision = record.owner_decision;
  const screenshotAttachment = progressScreenshotAttachment(record);
  const legacyManual = decodeLegacyManualMarketBasis(decision?.market);
  const rangeLow =
    decision?.market?.range_low ??
    (!legacyManual.invalid ? legacyManual.rangeLow : undefined);
  const rangeHigh =
    decision?.market?.range_high ??
    (!legacyManual.invalid ? legacyManual.rangeHigh : undefined);
  return {
    leaseId: record.lease_id,
    stageIndex: record.stage_index,
    ownerDecision: decision
      ? {
          decision: decision.decision,
          offeredRent: decision.offered_rent,
          ...(decision.charges ? { charges: decision.charges } : {}),
          ...(decision.info_form_url ? { infoFormUrl: decision.info_form_url } : {}),
          ...(decision.market
            ? {
                market: {
                  ...(rangeLow !== undefined ? { rangeLow } : {}),
                  ...(rangeHigh !== undefined ? { rangeHigh } : {}),
                  ...(decision.market.pmi_number !== undefined
                    ? { pmiNumber: decision.market.pmi_number }
                    : {}),
                  ...(screenshotAttachment
                    ? { compScreenshotRef: screenshotAttachment.ref }
                    : {}),
                  ...(decision.market.comp_source !== undefined
                    ? { compSource: decision.market.comp_source }
                    : {}),
                  ...(decision.market.comp_retrieved_at !== undefined
                    ? { compRetrievedAt: decision.market.comp_retrieved_at }
                    : {}),
                  ...(decision.market.provider
                    ? { provider: providerBasisFromRecord(decision.market.provider) }
                    : {}),
                },
              }
            : {}),
        }
      : null,
    tenantOfferDraftId: record.tenant_offer_draft_id ?? null,
    complete: record.complete === true,
  };
}

function assertCan(actor: AuthenticatedUser, capability: Parameters<typeof can>[1]) {
  if (!can(actor.role, capability)) {
    throw new EditableLayerError(
      "This user is not authorized for the requested lease-renewal action.",
      403,
    );
  }
}

function readRecord(
  id: string,
  data: Record<string, unknown>,
): LeaseRenewalProgressRecord {
  return normalizeFirestoreValue({ ...data, id }) as LeaseRenewalProgressRecord;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      return (toDate.call(value) as Date).toISOString();
    }
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}

function stripUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}
