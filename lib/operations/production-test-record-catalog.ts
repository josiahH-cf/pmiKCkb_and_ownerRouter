/**
 * S56's exhaustive catalog of persisted Production lane markers.
 *
 * This catalog is intentionally explicit. Collection names and marker paths must come from a
 * reviewed writer/reader contract; discovering them from Production data would turn an unknown
 * marker into deletion authority. The `data_mode` fields themselves remain part of the record
 * contracts after the Test lane is retired.
 */

export const PRODUCTION_TEST_RECORD_CATALOG_VERSION =
  "production-test-record-catalog:v1" as const;

export type ProductionTestRootMarkerPath = "data_mode" | "dataMode" | "is_test_run";
export type ProductionTestRootMarkerKind = "lane-string" | "test-boolean";
export type ProductionTestMissingRootPolicy = "refuse" | "known-mixed-nonlane";
export type ProductionTestRetentionKind = "product-record" | "none";
export type ProductionTestSecondaryMarkerPath =
  | "source_publication_pin.data_mode"
  | "move_out_handoff.data_mode"
  | "receipt.dataMode";

export interface ProductionTestRecordDescriptor {
  readonly collection: string;
  readonly root: Readonly<{
    readonly path: ProductionTestRootMarkerPath;
    readonly kind: ProductionTestRootMarkerKind;
  }>;
  readonly missingRoot: ProductionTestMissingRootPolicy;
  readonly secondaryPaths: readonly ProductionTestSecondaryMarkerPath[];
  readonly retention: ProductionTestRetentionKind;
}

function descriptor(
  input: ProductionTestRecordDescriptor,
): ProductionTestRecordDescriptor {
  return Object.freeze({
    ...input,
    root: Object.freeze({ ...input.root }),
    secondaryPaths: Object.freeze([...input.secondaryPaths]),
  });
}

const snakeRoot = (
  collection: string,
  options: Readonly<{
    missingRoot?: ProductionTestMissingRootPolicy;
    secondaryPaths?: readonly ProductionTestSecondaryMarkerPath[];
    retention?: ProductionTestRetentionKind;
  }> = {},
): ProductionTestRecordDescriptor =>
  descriptor({
    collection,
    root: { path: "data_mode", kind: "lane-string" },
    missingRoot: options.missingRoot ?? "refuse",
    secondaryPaths: options.secondaryPaths ?? [],
    retention: options.retention ?? "none",
  });

const camelRoot = (
  collection: string,
  secondaryPaths: readonly ProductionTestSecondaryMarkerPath[] = [],
): ProductionTestRecordDescriptor =>
  descriptor({
    collection,
    root: { path: "dataMode", kind: "lane-string" },
    missingRoot: "refuse",
    secondaryPaths,
    retention: "none",
  });

/**
 * The 28 reviewed persisted roots in Production. Do not add a collection from a data scan alone:
 * first trace its writer and reader, then add the descriptor and its pinned tests.
 */
export const PRODUCTION_TEST_RECORD_CATALOG: readonly ProductionTestRecordDescriptor[] =
  Object.freeze([
    snakeRoot("approval_queue_items", { retention: "product-record" }),
    snakeRoot("maintenance_tickets", { retention: "product-record" }),
    snakeRoot("maintenance_test_action_receipts"),
    snakeRoot("vendor_ticket_assignments"),
    snakeRoot("maintenance_unverified_intake"),
    snakeRoot("maintenance_unverified_intake_activity", {
      missingRoot: "known-mixed-nonlane",
    }),
    snakeRoot("maintenance_intake_nonce"),
    snakeRoot("maintenance_intake_rate_counter"),
    snakeRoot("lease_renewal_test_runs", {
      secondaryPaths: ["move_out_handoff.data_mode"],
    }),
    snakeRoot("lease_renewal_test_action_attempts"),
    snakeRoot("lease_renewal_test_action_receipts"),
    snakeRoot("lease_renewal_test_business_events"),
    snakeRoot("publication_policies"),
    snakeRoot("publication_policy_audit", { missingRoot: "known-mixed-nonlane" }),
    snakeRoot("publication_resources"),
    snakeRoot("publication_versions"),
    snakeRoot("publication_audit"),
    snakeRoot("audit_test_publication_capture_tasks"),
    snakeRoot("audit_test_publication_continuations"),
    snakeRoot("vendors"),
    snakeRoot("vendor_ticket_thread_links"),
    snakeRoot("vendor_test_mailboxes"),
    snakeRoot("vendor_test_mailbox_confirmations"),
    snakeRoot("external_action_execution_audit"),
    camelRoot("vendor_mailbox_connections"),
    camelRoot("external_action_executions", ["receipt.dataMode"]),
    camelRoot("gmail_label_effects"),
    descriptor({
      collection: "workflow_runs",
      root: { path: "is_test_run", kind: "test-boolean" },
      missingRoot: "refuse",
      secondaryPaths: ["source_publication_pin.data_mode"],
      retention: "product-record",
    }),
  ]);

export function findProductionTestRecordDescriptor(
  collection: string,
): ProductionTestRecordDescriptor | undefined {
  return PRODUCTION_TEST_RECORD_CATALOG.find(
    (candidate) => candidate.collection === collection,
  );
}

/** A deliberately small structural type for Firestore REST's wire-format `fields` map. */
export interface FirestoreRestValue {
  readonly [key: string]: unknown;
}

export type FirestoreRestFields = Readonly<Record<string, FirestoreRestValue>>;

export type ProductionTestRecordClassification =
  | "live"
  | "test"
  | "known_mixed_unmarked"
  | "refused";

export type ProductionTestRecordMarkerRefusalCode =
  | "missing_authoritative_marker"
  | "malformed_authoritative_marker"
  | "unexpected_alias_without_authoritative_marker"
  | "malformed_alias_marker"
  | "conflicting_alias_marker"
  | "malformed_secondary_marker"
  | "conflicting_secondary_marker";

export interface ProductionTestRecordMarkerResult {
  readonly classification: ProductionTestRecordClassification;
  readonly markerPath: ProductionTestRootMarkerPath;
  readonly markerValue: "live" | "test" | boolean | null;
  readonly refusalCode: ProductionTestRecordMarkerRefusalCode | null;
  readonly refusalPath: string | null;
}

type ParsedClassification = "live" | "test";

type PathRead =
  | Readonly<{ state: "missing" }>
  | Readonly<{ state: "malformed" }>
  | Readonly<{ state: "present"; value: unknown }>;

type MarkerRead =
  | Readonly<{
      state: "valid";
      classification: ParsedClassification;
      markerValue: "live" | "test" | boolean;
    }>
  | Readonly<{ state: "malformed" }>;

const ROOT_ALIASES = Object.freeze([
  { path: "data_mode", kind: "lane-string" },
  { path: "dataMode", kind: "lane-string" },
  { path: "is_test_run", kind: "test-boolean" },
] as const satisfies readonly Readonly<{
  path: ProductionTestRootMarkerPath;
  kind: ProductionTestRootMarkerKind;
}>[]);

/**
 * Classifies one projected Firestore REST document and validates every redundant lane marker.
 *
 * Missing and malformed values never fall back to Live. The only omission exception is the two
 * cataloged mixed collections, whose unmarked rows are reported separately and grant no lane.
 */
export function classifyProductionTestRecord(
  recordDescriptor: ProductionTestRecordDescriptor,
  fields: FirestoreRestFields,
): ProductionTestRecordMarkerResult {
  const markerPath = recordDescriptor.root.path;
  const authoritativePath = readFirestorePath(fields, markerPath);

  if (authoritativePath.state === "missing") {
    const unexpectedAlias = ROOT_ALIASES.find(
      (alias) =>
        alias.path !== markerPath &&
        readFirestorePath(fields, alias.path).state !== "missing",
    );
    if (unexpectedAlias) {
      return refused(
        markerPath,
        "unexpected_alias_without_authoritative_marker",
        unexpectedAlias.path,
      );
    }

    if (recordDescriptor.missingRoot === "known-mixed-nonlane") {
      return {
        classification: "known_mixed_unmarked",
        markerPath,
        markerValue: null,
        refusalCode: null,
        refusalPath: null,
      };
    }
    return refused(markerPath, "missing_authoritative_marker", markerPath);
  }

  if (authoritativePath.state === "malformed") {
    return refused(markerPath, "malformed_authoritative_marker", markerPath);
  }

  const authoritative = parseMarker(authoritativePath.value, recordDescriptor.root.kind);
  if (authoritative.state === "malformed") {
    return refused(markerPath, "malformed_authoritative_marker", markerPath);
  }

  for (const alias of ROOT_ALIASES) {
    if (alias.path === markerPath) continue;
    const aliasPath = readFirestorePath(fields, alias.path);
    if (aliasPath.state === "missing") continue;
    if (aliasPath.state === "malformed") {
      return refused(markerPath, "malformed_alias_marker", alias.path);
    }
    const parsedAlias = parseMarker(aliasPath.value, alias.kind);
    if (parsedAlias.state === "malformed") {
      return refused(markerPath, "malformed_alias_marker", alias.path);
    }
    if (parsedAlias.classification !== authoritative.classification) {
      return refused(markerPath, "conflicting_alias_marker", alias.path);
    }
  }

  for (const secondaryPath of recordDescriptor.secondaryPaths) {
    const secondary = readFirestorePath(fields, secondaryPath);
    if (secondary.state === "missing") continue;
    if (secondary.state === "malformed") {
      return refused(markerPath, "malformed_secondary_marker", secondaryPath);
    }
    const parsedSecondary = parseMarker(secondary.value, "lane-string");
    if (parsedSecondary.state === "malformed") {
      return refused(markerPath, "malformed_secondary_marker", secondaryPath);
    }
    if (parsedSecondary.classification !== authoritative.classification) {
      return refused(markerPath, "conflicting_secondary_marker", secondaryPath);
    }
  }

  return {
    classification: authoritative.classification,
    markerPath,
    markerValue: authoritative.markerValue,
    refusalCode: null,
    refusalPath: null,
  };
}

function refused(
  markerPath: ProductionTestRootMarkerPath,
  refusalCode: ProductionTestRecordMarkerRefusalCode,
  refusalPath: string,
): ProductionTestRecordMarkerResult {
  return {
    classification: "refused",
    markerPath,
    markerValue: null,
    refusalCode,
    refusalPath,
  };
}

function readFirestorePath(fields: FirestoreRestFields, path: string): PathRead {
  const segments = path.split(".");
  let currentFields: Readonly<Record<string, unknown>> = fields;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!Object.hasOwn(currentFields, segment)) return { state: "missing" };
    const value = currentFields[segment];
    if (index === segments.length - 1) return { state: "present", value };

    if (!isPlainObject(value) || !hasOnlyKey(value, "mapValue")) {
      return { state: "malformed" };
    }
    const mapValue = value.mapValue;
    if (!isPlainObject(mapValue)) {
      return { state: "malformed" };
    }
    const mapKeys = Object.keys(mapValue);
    if (mapKeys.length === 0) {
      currentFields = {};
      continue;
    }
    if (!hasOnlyKey(mapValue, "fields") || !isPlainObject(mapValue.fields)) {
      return { state: "malformed" };
    }
    currentFields = mapValue.fields;
  }

  return { state: "missing" };
}

function parseMarker(value: unknown, kind: ProductionTestRootMarkerKind): MarkerRead {
  if (!isPlainObject(value)) return { state: "malformed" };

  if (kind === "lane-string") {
    if (!hasOnlyKey(value, "stringValue")) return { state: "malformed" };
    if (value.stringValue !== "live" && value.stringValue !== "test") {
      return { state: "malformed" };
    }
    return {
      state: "valid",
      classification: value.stringValue,
      markerValue: value.stringValue,
    };
  }

  if (!hasOnlyKey(value, "booleanValue") || typeof value.booleanValue !== "boolean") {
    return { state: "malformed" };
  }
  return {
    state: "valid",
    classification: value.booleanValue ? "test" : "live",
    markerValue: value.booleanValue,
  };
}

function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKey(value: Readonly<Record<string, unknown>>, key: string): boolean {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === key;
}
