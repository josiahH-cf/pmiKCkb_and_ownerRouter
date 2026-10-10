export const PRODUCT_RECORD_RETENTION_POLICY = "product-record-retention:v1.0" as const;
export const PRODUCT_RECORD_RETENTION_CLASS = "indefinite" as const;

/**
 * Primary app-owned product records governed by D15. Communications collections are deliberately
 * absent and remain governed by communications-retention:v1.0.
 */
export const PRODUCT_RECORD_COLLECTIONS = Object.freeze({
  approval_queue_items: "approval_queue",
  lease_renewal_progress: "renewal",
  lease_renewal_resolutions: "renewal",
  maintenance_tickets: "maintenance",
  maintenance_ticket_creation_intents: "maintenance",
  maintenance_ticket_operations: "maintenance",
  maintenance_ticket_activity: "maintenance",
  maintenance_case_events: "maintenance",
  maintenance_financial_entries: "maintenance",
  maintenance_financial_sources: "maintenance",
  maintenance_retained_artifacts: "maintenance",
  maintenance_property_preapprovals: "maintenance",
  maintenance_property_preapproval_activity: "maintenance",
  maintenance_vendor_roster: "maintenance",
  maintenance_vendor_roster_operations: "maintenance",
  maintenance_vendor_roster_history: "maintenance",
  maintenance_vendor_selections: "maintenance",
  maintenance_vendor_packets: "maintenance",
  maintenance_vendor_contributions: "maintenance",
  maintenance_vendor_operations: "maintenance",
  maintenance_vendor_artifacts: "maintenance",
  maintenance_report_snapshots: "maintenance",
  maintenance_operating_policies: "maintenance",
  maintenance_operating_policy_versions: "maintenance",
  maintenance_operating_policy_operations: "maintenance",
  support_reports: "support",
  workflow_runs: "workflow",
  staff_business_profiles: "workflow",
  staff_business_profile_versions: "workflow",
  application_presentation: "workflow",
  application_presentation_versions: "workflow",
  presentation_settings_operations: "workflow",
}) satisfies Readonly<
  Record<string, "approval_queue" | "maintenance" | "renewal" | "support" | "workflow">
>;

export type ProductRecordCollection = keyof typeof PRODUCT_RECORD_COLLECTIONS;

/**
 * Product-prefixed names keep this policy structurally separate from communications TTL fields.
 * Optional use on read models supports legacy records; every new writer stamps the complete set.
 */
export interface ProductRecordRetentionFields {
  product_retention_policy: typeof PRODUCT_RECORD_RETENTION_POLICY;
  product_retention_class: typeof PRODUCT_RECORD_RETENTION_CLASS;
  legal_hold: boolean;
}

export type ProductRecordDeletionDisposition =
  | "blocked_legal_hold"
  | "blocked_unknown_retention"
  | "manual_review_required";

export function productRecordRetentionFields(
  collection: ProductRecordCollection,
  current?: Readonly<Record<string, unknown>>,
): ProductRecordRetentionFields {
  assertProductRecordCollection(collection);
  return {
    product_retention_policy: PRODUCT_RECORD_RETENTION_POLICY,
    product_retention_class: PRODUCT_RECORD_RETENTION_CLASS,
    legal_hold: resolveCurrentLegalHold(current),
  };
}

/**
 * Adds immutable policy fields after the record payload so a caller cannot forge the policy or
 * clear a current legal hold during a full-record rewrite.
 */
export function stampProductRecordRetention<T extends Readonly<Record<string, unknown>>>(
  collection: ProductRecordCollection,
  record: T,
  current?: Readonly<Record<string, unknown>>,
): T & ProductRecordRetentionFields {
  return {
    ...record,
    ...productRecordRetentionFields(collection, current),
  };
}

/**
 * Product records never become automatically cleanup-eligible. A legal hold is an absolute block;
 * every known unheld record still requires the manual Josiah-and-Dan review settled in D15. Legacy
 * or malformed retention state fails closed.
 */
export function resolveProductRecordDeletionDisposition(
  value: unknown,
): ProductRecordDeletionDisposition {
  const fields = readProductRecordRetentionFields(value);
  if (!fields) return "blocked_unknown_retention";
  return fields.legal_hold ? "blocked_legal_hold" : "manual_review_required";
}

export function isProductRecordCollection(
  value: string,
): value is ProductRecordCollection {
  return Object.hasOwn(PRODUCT_RECORD_COLLECTIONS, value);
}

function assertProductRecordCollection(
  value: string,
): asserts value is ProductRecordCollection {
  if (!isProductRecordCollection(value)) {
    throw new Error("Collection is not governed by product-record-retention:v1.0.");
  }
}

function resolveCurrentLegalHold(current?: Readonly<Record<string, unknown>>): boolean {
  if (!current) return false;
  const hasPolicy = Object.hasOwn(current, "product_retention_policy");
  const hasClass = Object.hasOwn(current, "product_retention_class");
  const hasLegalHold = Object.hasOwn(current, "legal_hold");
  if (!hasPolicy && !hasClass && !hasLegalHold) {
    return false;
  }

  const fields = readProductRecordRetentionFields(current);
  if (!fields) {
    throw new Error(
      "Current product retention state is malformed; refusing a full-record rewrite.",
    );
  }
  return fields.legal_hold;
}

function readProductRecordRetentionFields(
  value: unknown,
): ProductRecordRetentionFields | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    record.product_retention_policy !== PRODUCT_RECORD_RETENTION_POLICY ||
    record.product_retention_class !== PRODUCT_RECORD_RETENTION_CLASS ||
    typeof record.legal_hold !== "boolean"
  ) {
    return null;
  }
  return {
    product_retention_policy: PRODUCT_RECORD_RETENTION_POLICY,
    product_retention_class: PRODUCT_RECORD_RETENTION_CLASS,
    legal_hold: record.legal_hold,
  };
}
