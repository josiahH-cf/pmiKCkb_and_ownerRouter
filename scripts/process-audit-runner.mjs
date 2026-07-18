import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  GUIDE_SECTION_IDS,
  PROCESS_AUDIT_CASES,
  REVIEWER_CHECKLIST_IDS,
} from "./process-audit-cases.mjs";

export const CURRENT_BEHAVIOR_RESULTS = Object.freeze([
  "pass",
  "fail",
  "blocked",
  "not_reachable",
  "expected_denial",
  "audit_harness_failure",
]);

export const PROCESS_ALIGNMENT_RESULTS = Object.freeze([
  "advances",
  "partial",
  "gap",
  "blocked",
  "not_applicable",
]);

export const FINDING_CLASSES = Object.freeze([
  "routing",
  "rendering",
  "control_behavior",
  "validation",
  "state_transition",
  "persistence",
  "cross_surface_synchronization",
  "role_scope",
  "mode_isolation",
  "external_boundary",
  "receipt_evidence",
  "documentation_mismatch",
  "usability",
  "infrastructure",
  "audit_harness_failure",
  "improvement",
]);

export const FINDING_SEVERITIES = Object.freeze([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

export const FINDING_ORIGINS = Object.freeze([
  "application_defect",
  "process_gap",
  "audit_harness",
  "authentication",
  "unavailable_dependency",
  "documentation",
  "expected_denial",
  "improvement",
]);

export const CLEAN_RETRY_RESULTS = Object.freeze([
  "not_retried",
  "passed",
  "failed",
  "not_applicable",
]);

export const CASE_STATUSES = Object.freeze([
  "pending",
  "in_progress",
  "completed",
  "blocked",
]);

export const AUDIT_DATA_MODES = Object.freeze([
  "app_only",
  "live_effect",
  "live_read",
  "mixed",
  "sample",
  "test",
]);

export const MUTATION_KINDS = Object.freeze([
  "app_write",
  "live_effect",
  "read",
  "reversible_app_write",
  "test_action",
  "test_create",
  "test_write",
]);

const MANIFEST_ENUM_DECLARATIONS = Object.freeze({
  current_behavior_results: CURRENT_BEHAVIOR_RESULTS,
  process_alignment_results: PROCESS_ALIGNMENT_RESULTS,
  finding_classes: FINDING_CLASSES,
  finding_severities: FINDING_SEVERITIES,
  finding_origins: FINDING_ORIGINS,
  clean_retry_results: CLEAN_RETRY_RESULTS,
  data_modes: AUDIT_DATA_MODES,
  mutation_kinds: MUTATION_KINDS,
});
const MIGRATABLE_MANIFEST_ENUM_FIELDS = Object.freeze(["data_modes", "mutation_kinds"]);

const SCREENSHOT_SAFE_MODES = new Set(["test"]);
const SCREENSHOT_DECLARATION_MODES = new Set(["test", "sample"]);
const SAFE_EMAIL_SUFFIXES = [".example.invalid", ".example.test", "@example.invalid"];
const REQUIRED_ACTUAL_FIELDS = [
  "user_action",
  "preconditions_and_role",
  "data_mode",
  "app_validation",
  "visible_result",
  "persisted_change",
  "downstream_handoff",
  "receipt_audit_or_idempotency_evidence",
];
const REQUIRED_FINDING_FIELDS = [
  "finding_id",
  "case_id",
  "expected_behavior",
  "actual_behavior",
  "reproduction_steps",
  "current_behavior_result",
  "process_alignment_result",
  "severity",
  "finding_class",
  "finding_origin",
  "observable_impact",
  "evidence_references",
  "reproduced_after_clean_retry",
  "recommended_correction_or_investigation",
];
const SUBSTANTIVE_CURRENT_RESULTS = new Set(["pass", "fail", "expected_denial"]);
const DOM_EVIDENCE_SCHEMA_VERSION = "process-audit-dom-evidence.v1";
const STRUCTURED_EVIDENCE_SCHEMA_VERSION = "process-audit-structured-evidence.v1";
const DOM_EVIDENCE_ALLOWED_INPUT_KEYS = new Set([
  "evidence_id",
  "case_id",
  "route",
  "headings",
  "control_summaries",
  "console_error_hashes",
]);
const DOM_CONTROL_SUMMARY_KEYS = new Set(["label", "kind", "state"]);
const STRUCTURED_EVIDENCE_ALLOWED_INPUT_KEYS = new Set([
  "evidence_id",
  "case_id",
  "stage",
  "observation_class",
  "outcome",
  "metric_counts",
  "state_hashes",
  "notes",
]);
export const AUTH_PREFLIGHT_SCHEMA_VERSION = "process-audit-auth-preflight.v1";
export const REMEDIATION_LEDGER_SCHEMA_VERSION = "process-audit-remediation-ledger.v1";
export const CAPABILITY_MATRIX_SCHEMA_VERSION = "process-audit-capability-matrix.v1";
export const AUDIT_IDENTITY_CLASSES = Object.freeze([
  "internal_admin",
  "disposable_restricted_staff",
  "secondary_admin",
  "canonical_test_vendor",
  "unauthenticated_public",
]);
export const AUTH_READINESS_RESULTS = Object.freeze(["ready", "blocked", "not_required"]);
export const REMEDIATION_RESOLUTION_CLASSIFICATIONS = Object.freeze([
  "applicable_fix",
  "already_resolved",
  "duplicate",
  "obsolete",
  "documentation_correction",
  "fixture_or_identity_setup",
  "audit_harness_fix",
  "provider_activation_separate",
  "unsupported_by_evidence",
]);
export const REMEDIATION_APPLICABILITY_RESULTS = Object.freeze([
  "applicable",
  "not_applicable",
]);
export const REMEDIATION_STATUSES = Object.freeze([
  "pending",
  "in_progress",
  "resolved",
  "evidence_excluded",
  "blocked",
]);
export const AUDIT_OUTCOME_RESULTS = Object.freeze([
  "pending",
  "pass",
  "fail",
  "blocked",
  "expected_denial",
  "not_reachable",
  "not_applicable",
]);
export const CAPABILITY_TEST_LAYERS = Object.freeze([
  "unit",
  "integration",
  "browser",
  "deployed_browser",
  "deployed_live_read",
  "deployed_provider_guard",
]);
const AUTH_PREFLIGHT_ALLOWED_KEYS = new Set([
  "schema_version",
  "checked_at",
  "separation_verified",
  "identities",
]);
const AUTH_IDENTITY_ALLOWED_KEYS = new Set([
  "identity_class",
  "role",
  "mode",
  "readiness",
  "checked_at",
  "expires_at",
  "session_context",
  "readiness_note",
]);
const REMEDIATION_LEDGER_ALLOWED_KEYS = new Set([
  "schema_version",
  "source_run_id",
  "source_finding_count",
  "generated_at",
  "entries",
]);
const REMEDIATION_LEDGER_ENTRY_ALLOWED_KEYS = new Set([
  "finding_id",
  "case_id",
  "severity",
  "finding_class",
  "source_artifacts",
  "reported_behavior",
  "current_applicability",
  "root_cause",
  "affected_boundary",
  "resolution_classification",
  "required_setup_or_fixture",
  "code_change",
  "acceptance_criteria",
  "regression_test_mapping",
  "dependencies",
  "status",
  "commit_evidence",
  "deployment_evidence",
  "post_deployment_result",
  "exclusion_reason",
]);
const CAPABILITY_MATRIX_ALLOWED_KEYS = new Set([
  "schema_version",
  "generated_at",
  "entries",
]);
const CAPABILITY_MATRIX_ENTRY_ALLOWED_KEYS = new Set([
  "capability_id",
  "human_question",
  "guide_or_reviewer_items",
  "case_ids",
  "role",
  "mode",
  "fixture",
  "test_layer",
  "expected_behavior",
  "current_result",
  "post_remediation_result",
  "evidence",
]);
const SIDECAR_CONFIG = Object.freeze({
  auth_preflight: {
    artifact: "auth-preflight.json",
    eventType: "auth_preflight_checkpointed",
    manifestCapability: "auth_preflight",
  },
  remediation_ledger: {
    artifact: "remediation-ledger.json",
    eventType: "remediation_ledger_checkpointed",
    manifestCapability: "remediation_ledger",
  },
  capability_matrix: {
    artifact: "capability-matrix.json",
    eventType: "capability_matrix_checkpointed",
    manifestCapability: "capability_matrix",
  },
});
const EVENT_TYPES = new Set([
  "run_initialized",
  "run_completed",
  "run_reopened",
  "case_mutation_reopen_authorized",
  "case_inventory_extended",
  "mutation_intent_checkpointed",
  "test_effect_observed",
  "case_completed",
  "case_blocked",
  "case_result_amended",
  "case_definition_amended",
  "case_evidence_amended",
  "case_retry_metadata_amended",
  "dom_evidence_recorded",
  "structured_evidence_recorded",
  "finding_recorded",
  "finding_retracted",
  "finding_replaced",
  "manifest_declarations_amended",
  "manifest_enums_migrated",
  "environment_metadata_amended",
  "traceability_inventory_declared",
  "transient_attempt_started",
  "transient_attempt_failed",
  "transient_attempt_succeeded",
  "mutation_readback_observed",
  "mutation_intent_adopted",
  "mutation_replay_authorized",
  "reversible_effect_verified",
  "audit_harness_failure_observed",
  "auth_preflight_checkpointed",
  "remediation_ledger_checkpointed",
  "capability_matrix_checkpointed",
]);
const CONSOLE_ERROR_ALLOWED_KEYS = new Set(["source", "level", "error_hash", "count"]);
const ROLE_AUTHORITY_RANK = new Map([
  ["Unauthenticated", 0],
  ["Test Vendor", 1],
  ["Auditor", 2],
  ["Editor", 3],
  ["Admin staff", 4],
  ["Admin", 5],
]);
const MODE_AUTHORITY_RANK = new Map([
  ["sample", 0],
  ["test", 1],
  ["app_only", 2],
  ["live_read", 3],
  ["mixed", 4],
  ["live_effect", 5],
]);
const ENVIRONMENT_AMENDABLE_FIELDS = new Set([
  "deployment_url",
  "repository_commit",
  "deployed_source_commit",
  "deployment_revision",
  "image_digest",
  "audit_contract_fingerprint",
  "local_adc",
]);

function validateEnvironmentMetadataChanges(changes, label) {
  assertPlainObject(label, changes);
  assertOnlyKeys(label, changes, ENVIRONMENT_AMENDABLE_FIELDS);
  if (Object.keys(changes).length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }
  for (const [field, value] of Object.entries(changes)) {
    assertNonemptyString(`${label}.${field}`, value, 1_000);
    if (
      ["repository_commit", "deployed_source_commit"].includes(field) &&
      !/^[a-f0-9]{7,64}$/i.test(value)
    ) {
      throw new Error(`${field} must be a hexadecimal source commit.`);
    }
    if (["image_digest", "audit_contract_fingerprint"].includes(field)) {
      assertSha256(field, value);
    }
    if (field === "deployment_url") {
      let parsed;
      try {
        parsed = new URL(value);
      } catch {
        throw new Error("deployment_url must be an absolute HTTPS URL.");
      }
      if (parsed.protocol !== "https:") {
        throw new Error("deployment_url must be an absolute HTTPS URL.");
      }
    }
  }
}

function validateManifestEnums(enums, { allowMissingMigratable = false } = {}) {
  assertPlainObject("manifest.enums", enums);
  assertOnlyKeys(
    "manifest.enums",
    enums,
    new Set(Object.keys(MANIFEST_ENUM_DECLARATIONS)),
  );
  const missing = [];
  for (const [field, expected] of Object.entries(MANIFEST_ENUM_DECLARATIONS)) {
    if (!Object.hasOwn(enums, field)) {
      if (allowMissingMigratable && MIGRATABLE_MANIFEST_ENUM_FIELDS.includes(field)) {
        missing.push(field);
        continue;
      }
      throw new Error(`manifest.enums.${field} is required.`);
    }
    if (!Array.isArray(enums[field]) || !sameJson(enums[field], expected)) {
      throw new Error(
        `manifest.enums.${field} must exactly match current runner constants; refusing enum narrowing, broadening, or reordering.`,
      );
    }
  }
  return missing;
}

function isoNow(now = new Date()) {
  return now.toISOString();
}

function assertEnum(name, value, values) {
  if (!values.includes(value)) {
    throw new Error(`${name} must be one of: ${values.join(", ")}.`);
  }
}

function assertPlainObject(name, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
}

function assertNonemptyString(name, value, max = 2_000) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  if (value.length > max) throw new Error(`${name} exceeds ${max} characters.`);
}

function assertOnlyKeys(name, value, allowedKeys) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new Error(`${name}.${key} is not allowed.`);
  }
}

function assertIsoTimestamp(name, value) {
  assertNonemptyString(name, value, 100);
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${name} must be an ISO timestamp.`);
  }
}

function assertNullableString(name, value, max = 2_000) {
  if (value == null) return;
  assertNonemptyString(name, value, max);
}

function validateStringArray(
  name,
  values,
  { allowEmpty = true, maxItems = 1_000, maxLength = 2_000 } = {},
) {
  if (!Array.isArray(values)) throw new Error(`${name} must be an array.`);
  if (!allowEmpty && values.length === 0) {
    throw new Error(`${name} must not be empty.`);
  }
  if (values.length > maxItems) {
    throw new Error(`${name} exceeds ${maxItems} items.`);
  }
  const seen = new Set();
  for (const value of values) {
    assertNonemptyString(`${name} item`, value, maxLength);
    if (seen.has(value)) throw new Error(`${name} contains duplicate ${value}.`);
    seen.add(value);
  }
  return seen;
}

function validateAuthPreflightArtifact(
  artifact,
  manifest,
  { requireTerminal = false } = {},
) {
  assertPlainObject("auth preflight", artifact);
  assertOnlyKeys("auth preflight", artifact, AUTH_PREFLIGHT_ALLOWED_KEYS);
  if (artifact.schema_version !== AUTH_PREFLIGHT_SCHEMA_VERSION) {
    throw new Error("auth-preflight.json has an unsupported schema version.");
  }
  assertIsoTimestamp("auth preflight.checked_at", artifact.checked_at);
  if (typeof artifact.separation_verified !== "boolean") {
    throw new Error("auth preflight.separation_verified must be a boolean.");
  }
  if (!Array.isArray(artifact.identities)) {
    throw new Error("auth preflight.identities must be an array.");
  }
  const identityClasses = new Set();
  const sessionContexts = new Set();
  const expectedRoles = new Map([
    ["internal_admin", new Set(["Admin"])],
    ["disposable_restricted_staff", new Set(["Editor", "Admin staff"])],
    ["secondary_admin", new Set(["Admin"])],
    ["canonical_test_vendor", new Set(["Test Vendor"])],
    ["unauthenticated_public", new Set(["Unauthenticated"])],
  ]);
  for (const [index, identity] of artifact.identities.entries()) {
    const label = `auth preflight.identities[${index}]`;
    assertPlainObject(label, identity);
    assertOnlyKeys(label, identity, AUTH_IDENTITY_ALLOWED_KEYS);
    assertEnum(
      `${label}.identity_class`,
      identity.identity_class,
      AUDIT_IDENTITY_CLASSES,
    );
    if (identityClasses.has(identity.identity_class)) {
      throw new Error(`Duplicate auth identity class ${identity.identity_class}.`);
    }
    identityClasses.add(identity.identity_class);
    assertNonemptyString(`${label}.role`, identity.role, 200);
    if (!expectedRoles.get(identity.identity_class).has(identity.role)) {
      throw new Error(`${identity.identity_class} cannot use role ${identity.role}.`);
    }
    if (manifest && !manifest.roles.includes(identity.role)) {
      throw new Error(
        `${identity.identity_class} uses undeclared role ${identity.role}.`,
      );
    }
    assertEnum(`${label}.mode`, identity.mode, AUDIT_DATA_MODES);
    if (manifest && !manifest.modes.includes(identity.mode)) {
      throw new Error(
        `${identity.identity_class} uses undeclared mode ${identity.mode}.`,
      );
    }
    assertEnum(`${label}.readiness`, identity.readiness, AUTH_READINESS_RESULTS);
    assertIsoTimestamp(`${label}.checked_at`, identity.checked_at);
    if (identity.expires_at != null) {
      assertIsoTimestamp(`${label}.expires_at`, identity.expires_at);
    }
    assertNonemptyString(`${label}.session_context`, identity.session_context, 200);
    if (sessionContexts.has(identity.session_context)) {
      throw new Error(
        `Auth identities must use separate session contexts; duplicate ${identity.session_context}.`,
      );
    }
    sessionContexts.add(identity.session_context);
    assertNonemptyString(`${label}.readiness_note`, identity.readiness_note, 1_000);
  }
  const missingIdentityClasses = AUDIT_IDENTITY_CLASSES.filter(
    (identityClass) => !identityClasses.has(identityClass),
  );
  if (missingIdentityClasses.length > 0) {
    throw new Error(
      `auth preflight is missing identity classes: ${missingIdentityClasses.join(", ")}.`,
    );
  }
  if (artifact.identities.length !== AUDIT_IDENTITY_CLASSES.length) {
    throw new Error("auth preflight contains unsupported identity classes.");
  }
  if (
    requireTerminal &&
    (!artifact.separation_verified ||
      artifact.identities.some((identity) => identity.readiness !== "ready"))
  ) {
    throw new Error(
      "Auth preflight must have separated, ready sessions before finalization.",
    );
  }
  assertValueSafe(artifact, "auth-preflight.json");
  return { entryCount: artifact.identities.length };
}

const EVIDENCE_EXCLUSION_CLASSIFICATIONS = new Set([
  "already_resolved",
  "duplicate",
  "obsolete",
  "provider_activation_separate",
  "unsupported_by_evidence",
]);

function validateRemediationLedgerArtifact(artifact, { requireTerminal = false } = {}) {
  assertPlainObject("remediation ledger", artifact);
  assertOnlyKeys("remediation ledger", artifact, REMEDIATION_LEDGER_ALLOWED_KEYS);
  if (artifact.schema_version !== REMEDIATION_LEDGER_SCHEMA_VERSION) {
    throw new Error("remediation-ledger.json has an unsupported schema version.");
  }
  assertNonemptyString("remediation ledger.source_run_id", artifact.source_run_id, 200);
  if (
    !Number.isInteger(artifact.source_finding_count) ||
    artifact.source_finding_count < 1
  ) {
    throw new Error(
      "remediation ledger.source_finding_count must be a positive integer.",
    );
  }
  assertIsoTimestamp("remediation ledger.generated_at", artifact.generated_at);
  if (!Array.isArray(artifact.entries)) {
    throw new Error("remediation ledger.entries must be an array.");
  }
  if (artifact.entries.length !== artifact.source_finding_count) {
    throw new Error(
      "remediation ledger entry count does not match source_finding_count.",
    );
  }
  const findingIds = new Set();
  for (const [index, entry] of artifact.entries.entries()) {
    const label = `remediation ledger.entries[${index}]`;
    assertPlainObject(label, entry);
    assertOnlyKeys(label, entry, REMEDIATION_LEDGER_ENTRY_ALLOWED_KEYS);
    for (const field of ["finding_id", "case_id"]) {
      assertNonemptyString(`${label}.${field}`, entry[field], 200);
    }
    if (findingIds.has(entry.finding_id)) {
      throw new Error(`Duplicate remediation finding ${entry.finding_id}.`);
    }
    findingIds.add(entry.finding_id);
    assertEnum(`${label}.severity`, entry.severity, FINDING_SEVERITIES);
    assertEnum(`${label}.finding_class`, entry.finding_class, FINDING_CLASSES);
    validateStringArray(`${label}.source_artifacts`, entry.source_artifacts, {
      allowEmpty: false,
      maxItems: 100,
      maxLength: 1_000,
    });
    for (const field of [
      "reported_behavior",
      "root_cause",
      "affected_boundary",
      "required_setup_or_fixture",
      "code_change",
      "acceptance_criteria",
    ]) {
      assertNonemptyString(`${label}.${field}`, entry[field], 5_000);
    }
    assertEnum(
      `${label}.current_applicability`,
      entry.current_applicability,
      REMEDIATION_APPLICABILITY_RESULTS,
    );
    assertEnum(
      `${label}.resolution_classification`,
      entry.resolution_classification,
      REMEDIATION_RESOLUTION_CLASSIFICATIONS,
    );
    validateStringArray(
      `${label}.regression_test_mapping`,
      entry.regression_test_mapping,
      { allowEmpty: false, maxItems: 100, maxLength: 1_000 },
    );
    validateStringArray(`${label}.dependencies`, entry.dependencies, {
      maxItems: 100,
      maxLength: 1_000,
    });
    assertEnum(`${label}.status`, entry.status, REMEDIATION_STATUSES);
    assertNullableString(`${label}.commit_evidence`, entry.commit_evidence, 2_000);
    assertNullableString(
      `${label}.deployment_evidence`,
      entry.deployment_evidence,
      2_000,
    );
    assertEnum(
      `${label}.post_deployment_result`,
      entry.post_deployment_result,
      AUDIT_OUTCOME_RESULTS,
    );
    assertNullableString(`${label}.exclusion_reason`, entry.exclusion_reason, 5_000);
    const isEvidenceExclusion = entry.status === "evidence_excluded";
    if (
      isEvidenceExclusion &&
      (entry.current_applicability !== "not_applicable" ||
        !EVIDENCE_EXCLUSION_CLASSIFICATIONS.has(entry.resolution_classification) ||
        entry.exclusion_reason == null)
    ) {
      throw new Error(
        `${entry.finding_id} evidence exclusion lacks a supported classification and rationale.`,
      );
    }
    if (entry.status === "resolved" && entry.current_applicability !== "applicable") {
      throw new Error(`${entry.finding_id} resolved status must remain applicable.`);
    }
    if (requireTerminal) {
      if (["pending", "in_progress", "blocked"].includes(entry.status)) {
        throw new Error(`${entry.finding_id} remediation is not terminal.`);
      }
      if (
        entry.status === "resolved" &&
        (!entry.commit_evidence ||
          !entry.deployment_evidence ||
          !["pass", "expected_denial"].includes(entry.post_deployment_result))
      ) {
        throw new Error(
          `${entry.finding_id} resolved remediation lacks commit, deployment, or passing post-deployment evidence.`,
        );
      }
      if (
        entry.status === "evidence_excluded" &&
        entry.post_deployment_result !== "not_applicable"
      ) {
        throw new Error(
          `${entry.finding_id} evidence exclusion must have a not_applicable post-deployment result.`,
        );
      }
    }
  }
  assertValueSafe(artifact, "remediation-ledger.json");
  return { entryCount: artifact.entries.length };
}

function validateCapabilityMatrixArtifact(
  artifact,
  manifest,
  { requireTerminal = false } = {},
) {
  assertPlainObject("capability matrix", artifact);
  assertOnlyKeys("capability matrix", artifact, CAPABILITY_MATRIX_ALLOWED_KEYS);
  if (artifact.schema_version !== CAPABILITY_MATRIX_SCHEMA_VERSION) {
    throw new Error("capability-matrix.json has an unsupported schema version.");
  }
  assertIsoTimestamp("capability matrix.generated_at", artifact.generated_at);
  if (!Array.isArray(artifact.entries) || artifact.entries.length === 0) {
    throw new Error("capability matrix.entries must be a non-empty array.");
  }
  const capabilityIds = new Set();
  const mappedCaseIds = new Set();
  const mappedGuideRoots = new Set();
  const mappedReviewerIds = new Set();
  const casesById = new Map(
    (manifest?.case_inventory ?? []).map((auditCase) => [auditCase.id, auditCase]),
  );
  for (const [index, entry] of artifact.entries.entries()) {
    const label = `capability matrix.entries[${index}]`;
    assertPlainObject(label, entry);
    assertOnlyKeys(label, entry, CAPABILITY_MATRIX_ENTRY_ALLOWED_KEYS);
    assertNonemptyString(`${label}.capability_id`, entry.capability_id, 200);
    if (!/^[A-Za-z0-9:_-]+$/.test(entry.capability_id)) {
      throw new Error(`${entry.capability_id} is not a stable capability ID.`);
    }
    if (capabilityIds.has(entry.capability_id)) {
      throw new Error(`Duplicate capability ID ${entry.capability_id}.`);
    }
    capabilityIds.add(entry.capability_id);
    for (const field of [
      "human_question",
      "role",
      "mode",
      "fixture",
      "expected_behavior",
    ]) {
      assertNonemptyString(`${label}.${field}`, entry[field], 5_000);
    }
    assertEnum(`${label}.mode`, entry.mode, AUDIT_DATA_MODES);
    if (manifest && !manifest.roles.includes(entry.role)) {
      throw new Error(`${entry.capability_id} uses undeclared role ${entry.role}.`);
    }
    if (manifest && !manifest.modes.includes(entry.mode)) {
      throw new Error(`${entry.capability_id} uses undeclared mode ${entry.mode}.`);
    }
    const references = validateStringArray(
      `${label}.guide_or_reviewer_items`,
      entry.guide_or_reviewer_items,
      { allowEmpty: false, maxItems: 100, maxLength: 1_000 },
    );
    const caseIds = validateStringArray(`${label}.case_ids`, entry.case_ids, {
      allowEmpty: false,
      maxItems: 100,
      maxLength: 200,
    });
    const expectedReferences = new Set();
    for (const caseId of caseIds) {
      if (mappedCaseIds.has(caseId)) {
        throw new Error(`Capability matrix maps case ${caseId} more than once.`);
      }
      mappedCaseIds.add(caseId);
      if (manifest) {
        const auditCase = casesById.get(caseId);
        if (!auditCase) {
          throw new Error(`${entry.capability_id} maps unknown case ${caseId}.`);
        }
        if (auditCase.role !== entry.role || auditCase.data_mode !== entry.mode) {
          throw new Error(
            `${entry.capability_id} role or mode does not match ${caseId}.`,
          );
        }
        for (const reference of [
          ...auditCase.guide_refs,
          ...(auditCase.reviewer_refs ?? []),
        ]) {
          expectedReferences.add(reference);
        }
      }
    }
    if (
      manifest &&
      (references.size !== expectedReferences.size ||
        [...expectedReferences].some((reference) => !references.has(reference)))
    ) {
      throw new Error(
        `${entry.capability_id} guide/reviewer mapping does not match its cases.`,
      );
    }
    for (const reference of references) {
      const root = guideRoot(reference);
      if (root) mappedGuideRoots.add(root);
      if (manifest?.reviewer_checklist_ids.includes(reference)) {
        mappedReviewerIds.add(reference);
      }
    }
    assertEnum(`${label}.test_layer`, entry.test_layer, CAPABILITY_TEST_LAYERS);
    assertEnum(`${label}.current_result`, entry.current_result, AUDIT_OUTCOME_RESULTS);
    assertEnum(
      `${label}.post_remediation_result`,
      entry.post_remediation_result,
      AUDIT_OUTCOME_RESULTS,
    );
    validateStringArray(`${label}.evidence`, entry.evidence, {
      maxItems: 200,
      maxLength: 1_000,
    });
    if (
      requireTerminal &&
      (!["pass", "expected_denial"].includes(entry.post_remediation_result) ||
        entry.evidence.length === 0)
    ) {
      throw new Error(
        `${entry.capability_id} lacks a passing post-remediation result or evidence.`,
      );
    }
  }
  if (manifest) {
    const missingCaseIds = [...casesById.keys()].filter(
      (caseId) => !mappedCaseIds.has(caseId),
    );
    const missingGuideSections = manifest.guide_section_ids.filter((guideSectionId) =>
      guideSectionId === "reviewer-pass"
        ? manifest.reviewer_checklist_ids.some(
            (reviewerId) => !mappedReviewerIds.has(reviewerId),
          )
        : !mappedGuideRoots.has(guideSectionId),
    );
    const missingReviewerIds = manifest.reviewer_checklist_ids.filter(
      (reviewerId) => !mappedReviewerIds.has(reviewerId),
    );
    if (
      mappedCaseIds.size !== casesById.size ||
      missingCaseIds.length > 0 ||
      missingGuideSections.length > 0 ||
      missingReviewerIds.length > 0
    ) {
      throw new Error(
        `Capability matrix coverage is incomplete: cases=${missingCaseIds.join(",") || "none"}; guides=${missingGuideSections.join(",") || "none"}; reviewer=${missingReviewerIds.join(",") || "none"}.`,
      );
    }
  }
  assertValueSafe(artifact, "capability-matrix.json");
  return { entryCount: artifact.entries.length };
}

function emailAddresses(text) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
}

export function assertValueSafe(value, label = "artifact payload") {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = [
    [/otpauth:\/\//i, "TOTP setup URI"],
    [
      /(?:oobCode|idToken|refreshToken|access_token|authorization)\s*[=:]\s*[^\s&]+/i,
      "credential-bearing parameter",
    ],
    [/Bearer\s+[A-Za-z0-9._~-]+/i, "Bearer credential"],
    [/(?:password|totp|otp|secret|credential)\s*[=:]\s*[^\s,;]+/i, "secret value"],
    [
      /https?:\/\/[^\s]+(?:mode=resetPassword|oobCode=|continueUrl=)/i,
      "password setup link",
    ],
    [
      /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,5}\s+(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Terrace|Ter|Court|Ct|Lane|Ln|Drive|Dr|Parkway|Pkwy|Trail|Trl)\b/i,
      "street address",
    ],
    [/\$\s*\d[\d,]*(?:\.\d{2})?/i, "currency value"],
    [
      /\b(?:SSN|social security|bank account|routing number)\b/i,
      "high-risk customer data",
    ],
    [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/, "phone number"],
  ];
  for (const [pattern, description] of forbidden) {
    if (pattern.test(text))
      throw new Error(`${label} contains a forbidden ${description}.`);
  }
  for (const email of emailAddresses(text)) {
    const lower = email.toLowerCase();
    if (!SAFE_EMAIL_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
      throw new Error(`${label} contains a non-Test email address.`);
    }
  }
  return value;
}

function validateConsoleErrors(errors, label = "console_errors") {
  if (!Array.isArray(errors)) throw new Error(`${label} must be an array.`);
  for (const [index, consoleError] of errors.entries()) {
    assertPlainObject(`${label}[${index}]`, consoleError);
    assertOnlyKeys(`${label}[${index}]`, consoleError, CONSOLE_ERROR_ALLOWED_KEYS);
    if ("source" in consoleError) {
      assertNonemptyString(`${label}[${index}].source`, consoleError.source, 200);
    }
    if ("level" in consoleError) {
      assertEnum(`${label}[${index}].level`, consoleError.level, ["error", "warning"]);
    }
    if (!/^sha256:[a-f0-9]{64}$/i.test(consoleError.error_hash ?? "")) {
      throw new Error(`${label}[${index}].error_hash must be a SHA-256 hash.`);
    }
    if (
      "count" in consoleError &&
      (!Number.isInteger(consoleError.count) || consoleError.count < 1)
    ) {
      throw new Error(`${label}[${index}].count must be a positive integer.`);
    }
    assertValueSafe(consoleError, `${label}[${index}]`);
  }
}

function validateEvidenceReferences(caseDefinition, references) {
  if (!Array.isArray(references))
    throw new Error("evidence_references must be an array.");
  const seen = new Set();
  for (const reference of references) {
    assertNonemptyString("evidence reference", reference, 500);
    assertValueSafe(reference, "evidence reference");
    const normalized = reference.replaceAll("\\", "/");
    if (seen.has(normalized)) {
      throw new Error(
        `Case ${caseDefinition.id} contains duplicate evidence ${normalized}.`,
      );
    }
    seen.add(normalized);
    if (normalized === "events.jsonl") {
      throw new Error(
        `Case ${caseDefinition.id} must reference an anchored event, not bare events.jsonl.`,
      );
    }
    if (normalized.includes("/screenshots/") || normalized.startsWith("screenshots/")) {
      if (
        !SCREENSHOT_SAFE_MODES.has(caseDefinition.data_mode) ||
        caseDefinition.screenshot_safe !== true
      ) {
        throw new Error(
          `Case ${caseDefinition.id} cannot attach a screenshot on this surface or in ${caseDefinition.data_mode} mode.`,
        );
      }
      if (!path.basename(normalized).startsWith(caseDefinition.id)) {
        throw new Error(
          `Screenshot evidence for ${caseDefinition.id} must start with the case ID.`,
        );
      }
    }
    if (normalized.startsWith("dom-evidence/")) {
      if (
        normalized !== `dom-evidence/${path.basename(normalized)}` ||
        !normalized.endsWith(".json")
      ) {
        throw new Error(`DOM evidence reference for ${caseDefinition.id} is invalid.`);
      }
      if (!path.basename(normalized).startsWith(`${caseDefinition.id}-`)) {
        throw new Error(
          `DOM evidence for ${caseDefinition.id} must start with the case ID.`,
        );
      }
    }
    if (normalized.startsWith("structured-evidence/")) {
      if (
        normalized !== `structured-evidence/${path.basename(normalized)}` ||
        !normalized.endsWith(".json")
      ) {
        throw new Error(
          `Structured evidence reference for ${caseDefinition.id} is invalid.`,
        );
      }
      if (!path.basename(normalized).startsWith(`${caseDefinition.id}-`)) {
        throw new Error(
          `Structured evidence for ${caseDefinition.id} must start with the case ID.`,
        );
      }
    }
  }
}

function validateDeclaredRoleModeCoverage(roles, modes, cases) {
  if (!Array.isArray(roles) || roles.length === 0) throw new Error("roles are required.");
  if (!Array.isArray(modes) || modes.length === 0) throw new Error("modes are required.");
  const roleSet = new Set();
  for (const role of roles) {
    assertNonemptyString("declared role", role, 500);
    if (roleSet.has(role)) throw new Error(`Duplicate declared role: ${role}.`);
    roleSet.add(role);
  }
  const modeSet = new Set();
  for (const mode of modes) {
    assertEnum("declared mode", mode, AUDIT_DATA_MODES);
    if (modeSet.has(mode)) throw new Error(`Duplicate declared mode: ${mode}.`);
    modeSet.add(mode);
  }
  const missingRoles = [...new Set(cases.map((auditCase) => auditCase.role))].filter(
    (role) => !roleSet.has(role),
  );
  const missingModes = [...new Set(cases.map((auditCase) => auditCase.data_mode))].filter(
    (mode) => !modeSet.has(mode),
  );
  if (missingRoles.length > 0) {
    throw new Error(`Declared roles do not cover cases: ${missingRoles.join(", ")}.`);
  }
  if (missingModes.length > 0) {
    throw new Error(`Declared modes do not cover cases: ${missingModes.join(", ")}.`);
  }
}

function validateExactDeclaredRoleModeCoverage(roles, modes, cases) {
  validateDeclaredRoleModeCoverage(roles, modes, cases);
  for (const role of roles) {
    if (!ROLE_AUTHORITY_RANK.has(role)) {
      throw new Error(`Unknown declared role: ${role}.`);
    }
  }
  const inventoryRoles = new Set(cases.map((auditCase) => auditCase.role));
  const inventoryModes = new Set(cases.map((auditCase) => auditCase.data_mode));
  const extraRoles = roles.filter((role) => !inventoryRoles.has(role));
  const extraModes = modes.filter((mode) => !inventoryModes.has(mode));
  if (extraRoles.length > 0) {
    throw new Error(`Declared roles exceed the inventory: ${extraRoles.join(", ")}.`);
  }
  if (extraModes.length > 0) {
    throw new Error(`Declared modes exceed the inventory: ${extraModes.join(", ")}.`);
  }
}

function validateIdentifierInventory(name, values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${name} must be a non-empty array.`);
  }
  const seen = new Set();
  for (const value of values) {
    assertNonemptyString(`${name} item`, value, 500);
    if (seen.has(value)) throw new Error(`${name} contains duplicate ${value}.`);
    seen.add(value);
  }
  return seen;
}

function guideRoot(reference) {
  if (!reference.startsWith("guide#")) return null;
  return reference.slice("guide#".length).split(".", 1)[0];
}

function validateTraceabilityInventories(guideSectionIds, reviewerChecklistIds, cases) {
  const guideIds = validateIdentifierInventory("guide_section_ids", guideSectionIds);
  const reviewerIds = validateIdentifierInventory(
    "reviewer_checklist_ids",
    reviewerChecklistIds,
  );
  for (const auditCase of cases) {
    for (const reference of auditCase.guide_refs) {
      const root = guideRoot(reference);
      if (root && !guideIds.has(root)) {
        throw new Error(
          `${auditCase.id} guide reference ${reference} has undeclared root ${root}.`,
        );
      }
    }
    for (const reference of auditCase.reviewer_refs ?? []) {
      if (!reviewerIds.has(reference)) {
        throw new Error(
          `${auditCase.id} reviewer reference ${reference} is not declared exactly.`,
        );
      }
    }
  }
}

function validateTraceabilityCompleteness(guideSectionIds, reviewerChecklistIds, cases) {
  validateTraceabilityInventories(guideSectionIds, reviewerChecklistIds, cases);
  const mappedGuideRoots = new Set(
    cases.flatMap((auditCase) =>
      auditCase.guide_refs.map(guideRoot).filter((root) => root != null),
    ),
  );
  const mappedReviewerIds = new Set(
    cases.flatMap((auditCase) => auditCase.reviewer_refs ?? []),
  );
  const missingReviewerIds = reviewerChecklistIds.filter(
    (reviewerId) => !mappedReviewerIds.has(reviewerId),
  );
  const missingGuideSections = guideSectionIds.filter((guideSectionId) =>
    guideSectionId === "reviewer-pass"
      ? missingReviewerIds.length > 0
      : !mappedGuideRoots.has(guideSectionId),
  );
  const gaps = [];
  if (missingGuideSections.length > 0) {
    gaps.push(`guide sections without cases: ${missingGuideSections.join(", ")}`);
  }
  if (missingReviewerIds.length > 0) {
    gaps.push(`reviewer checklist IDs without cases: ${missingReviewerIds.join(", ")}`);
  }
  if (gaps.length > 0) {
    throw new Error(`Traceability inventory is incomplete: ${gaps.join("; ")}.`);
  }
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function assertSha256(name, value) {
  if (!/^sha256:[a-f0-9]{64}$/i.test(value ?? "")) {
    throw new Error(`${name} must be a SHA-256 hash.`);
  }
}

function validateRouteOnly(route) {
  assertNonemptyString("DOM evidence route", route, 1_000);
  if (
    !route.startsWith("/") ||
    route.startsWith("//") ||
    route.includes("://") ||
    route.includes("?") ||
    route.includes("#")
  ) {
    throw new Error(
      "DOM evidence route must be a route-only path without query or hash.",
    );
  }
}

function validateDomEvidenceRecord(record, expectedCaseId) {
  assertPlainObject("DOM evidence", record);
  const persistedKeys = new Set([
    ...DOM_EVIDENCE_ALLOWED_INPUT_KEYS,
    "schema_version",
    "captured_at",
  ]);
  assertOnlyKeys("DOM evidence", record, persistedKeys);
  if (record.schema_version !== DOM_EVIDENCE_SCHEMA_VERSION) {
    throw new Error(`${record.evidence_id ?? "DOM evidence"} has an invalid schema.`);
  }
  assertNonemptyString("DOM evidence.evidence_id", record.evidence_id, 200);
  assertNonemptyString("DOM evidence.case_id", record.case_id, 120);
  if (!/^[A-Z0-9-]+$/.test(record.evidence_id)) {
    throw new Error(`Invalid DOM evidence ID: ${record.evidence_id}.`);
  }
  if (!record.evidence_id.startsWith(`${record.case_id}-`)) {
    throw new Error("DOM evidence ID must start with its case ID.");
  }
  if (expectedCaseId && record.case_id !== expectedCaseId) {
    throw new Error(`${record.evidence_id} does not belong to ${expectedCaseId}.`);
  }
  validateRouteOnly(record.route);
  assertNonemptyString("DOM evidence.captured_at", record.captured_at, 100);
  for (const [field, maxItems] of [
    ["headings", 100],
    ["control_summaries", 200],
    ["console_error_hashes", 100],
  ]) {
    if (!Array.isArray(record[field]))
      throw new Error(`DOM evidence.${field} must be an array.`);
    if (record[field].length > maxItems) {
      throw new Error(`DOM evidence.${field} exceeds ${maxItems} items.`);
    }
  }
  for (const heading of record.headings) {
    assertNonemptyString("DOM evidence heading", heading, 500);
  }
  for (const [index, summary] of record.control_summaries.entries()) {
    assertPlainObject(`DOM evidence.control_summaries[${index}]`, summary);
    assertOnlyKeys(
      `DOM evidence.control_summaries[${index}]`,
      summary,
      DOM_CONTROL_SUMMARY_KEYS,
    );
    for (const field of DOM_CONTROL_SUMMARY_KEYS) {
      assertNonemptyString(
        `DOM evidence.control_summaries[${index}].${field}`,
        summary[field],
        500,
      );
    }
  }
  for (const hash of record.console_error_hashes) {
    if (!/^sha256:[a-f0-9]{64}$/i.test(hash)) {
      throw new Error("DOM evidence console errors must be SHA-256 hashes.");
    }
  }
  assertValueSafe(record, `DOM evidence ${record.evidence_id}`);
}

function validateStructuredEvidenceRecord(record, expectedCaseId) {
  assertPlainObject("structured evidence", record);
  assertOnlyKeys(
    "structured evidence",
    record,
    new Set([...STRUCTURED_EVIDENCE_ALLOWED_INPUT_KEYS, "schema_version", "captured_at"]),
  );
  if (record.schema_version !== STRUCTURED_EVIDENCE_SCHEMA_VERSION) {
    throw new Error(
      `${record.evidence_id ?? "Structured evidence"} has an invalid schema.`,
    );
  }
  for (const field of [
    "evidence_id",
    "case_id",
    "stage",
    "observation_class",
    "outcome",
    "captured_at",
  ]) {
    assertNonemptyString(`structured evidence.${field}`, record[field], 500);
  }
  if (!/^[A-Z0-9-]+$/.test(record.evidence_id)) {
    throw new Error(`Invalid structured evidence ID: ${record.evidence_id}.`);
  }
  if (!record.evidence_id.startsWith(`${record.case_id}-`)) {
    throw new Error("Structured evidence ID must start with its case ID.");
  }
  if (expectedCaseId && record.case_id !== expectedCaseId) {
    throw new Error(`${record.evidence_id} does not belong to ${expectedCaseId}.`);
  }
  for (const field of ["stage", "observation_class", "outcome"]) {
    if (!/^[a-z][a-z0-9_:-]{0,79}$/.test(record[field])) {
      throw new Error(`structured evidence.${field} must be a stable lowercase token.`);
    }
  }
  if (
    !Number.isFinite(Date.parse(record.captured_at)) ||
    new Date(record.captured_at).toISOString() !== record.captured_at
  ) {
    throw new Error("structured evidence.captured_at must be an ISO timestamp.");
  }
  for (const field of ["metric_counts", "state_hashes"]) {
    assertPlainObject(`structured evidence.${field}`, record[field]);
    if (Object.keys(record[field]).length > 100) {
      throw new Error(`structured evidence.${field} exceeds 100 entries.`);
    }
    for (const key of Object.keys(record[field])) {
      if (!/^[a-z][a-z0-9_]{0,79}$/.test(key)) {
        throw new Error(`structured evidence.${field} has invalid key ${key}.`);
      }
    }
  }
  for (const [key, count] of Object.entries(record.metric_counts)) {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(
        `structured evidence.metric_counts.${key} must be a nonnegative integer.`,
      );
    }
  }
  for (const [key, hash] of Object.entries(record.state_hashes)) {
    assertSha256(`structured evidence.state_hashes.${key}`, hash);
  }
  if (!Array.isArray(record.notes) || record.notes.length > 50) {
    throw new Error("structured evidence.notes must be an array of at most 50 items.");
  }
  for (const note of record.notes) {
    assertNonemptyString("structured evidence note", note, 300);
    if (/\r|\n/.test(note)) {
      throw new Error("structured evidence notes must be fixed single-line strings.");
    }
  }
  if (
    Object.keys(record.metric_counts).length === 0 &&
    Object.keys(record.state_hashes).length === 0 &&
    record.notes.length === 0
  ) {
    throw new Error(
      "structured evidence must contain at least one bodyless observation.",
    );
  }
  assertValueSafe(record, `structured evidence ${record.evidence_id}`);
}

function validateCaseDefinitions(cases) {
  if (!Array.isArray(cases) || cases.length === 0)
    throw new Error("At least one audit case is required.");
  const ids = new Set();
  for (const auditCase of cases) {
    assertPlainObject("audit case", auditCase);
    assertNonemptyString("case id", auditCase.id, 120);
    if (!/^[A-Z0-9-]+$/.test(auditCase.id))
      throw new Error(`Invalid case id: ${auditCase.id}.`);
    if (ids.has(auditCase.id)) throw new Error(`Duplicate case id: ${auditCase.id}.`);
    ids.add(auditCase.id);
    for (const field of [
      "title",
      "surface",
      "route",
      "process",
      "workflow_stage",
      "role",
      "data_mode",
      "mutation_kind",
    ]) {
      assertNonemptyString(`${auditCase.id}.${field}`, auditCase[field], 1_000);
    }
    assertEnum(`${auditCase.id}.data_mode`, auditCase.data_mode, AUDIT_DATA_MODES);
    assertEnum(`${auditCase.id}.mutation_kind`, auditCase.mutation_kind, MUTATION_KINDS);
    if (!Array.isArray(auditCase.depends_on)) {
      throw new Error(`${auditCase.id}.depends_on must be an array.`);
    }
    for (const dependency of auditCase.depends_on) {
      assertNonemptyString(`${auditCase.id}.depends_on`, dependency, 120);
    }
    if (typeof auditCase.screenshot_safe !== "boolean") {
      throw new Error(`${auditCase.id}.screenshot_safe must be a boolean.`);
    }
    if (
      auditCase.screenshot_safe &&
      !SCREENSHOT_DECLARATION_MODES.has(auditCase.data_mode)
    ) {
      throw new Error(
        `${auditCase.id}.screenshot_safe is not allowed in ${auditCase.data_mode} mode.`,
      );
    }
    assertPlainObject(`${auditCase.id}.expected`, auditCase.expected);
    for (const field of REQUIRED_ACTUAL_FIELDS) {
      assertNonemptyString(
        `${auditCase.id}.expected.${field}`,
        auditCase.expected[field],
        2_000,
      );
    }
    if (auditCase.expected.data_mode !== auditCase.data_mode) {
      throw new Error(
        `${auditCase.id}.expected.data_mode must match the case data_mode.`,
      );
    }
    if (!Array.isArray(auditCase.guide_refs) || auditCase.guide_refs.length === 0) {
      throw new Error(`${auditCase.id} needs at least one guide reference.`);
    }
    if (!Array.isArray(auditCase.reviewer_refs ?? [])) {
      throw new Error(`${auditCase.id}.reviewer_refs must be an array.`);
    }
    for (const reference of [
      ...auditCase.guide_refs,
      ...(auditCase.reviewer_refs ?? []),
    ]) {
      assertNonemptyString(`${auditCase.id} guide/reviewer reference`, reference, 500);
    }
    if (auditCase.mutation_kind !== "read") {
      assertNonemptyString(`${auditCase.id}.safe_alias`, auditCase.safe_alias, 1_000);
    }
    assertValueSafe(auditCase, `case definition ${auditCase.id}`);
  }
  for (const auditCase of cases) {
    for (const dependency of auditCase.depends_on) {
      if (!ids.has(dependency)) {
        throw new Error(`${auditCase.id} depends on unknown case ${dependency}.`);
      }
      if (dependency === auditCase.id) {
        throw new Error(`${auditCase.id} cannot depend on itself.`);
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const dependenciesById = new Map(
    cases.map((auditCase) => [auditCase.id, auditCase.depends_on]),
  );
  function visit(caseId, trail = []) {
    if (visiting.has(caseId)) {
      throw new Error(`Audit case dependency cycle: ${[...trail, caseId].join(" -> ")}.`);
    }
    if (visited.has(caseId)) return;
    visiting.add(caseId);
    for (const dependency of dependenciesById.get(caseId) ?? []) {
      visit(dependency, [...trail, caseId]);
    }
    visiting.delete(caseId);
    visited.add(caseId);
  }
  for (const auditCase of cases) visit(auditCase.id);
}

function caseDefinitionsFromManifest(manifest) {
  return manifest.case_inventory.map((auditCaseWithExecution) => {
    const auditCase = { ...auditCaseWithExecution };
    delete auditCase.execution;
    return auditCase;
  });
}

function caseWithExecution(auditCase) {
  return {
    ...auditCase,
    execution: {
      status: "pending",
      attempt_count: 0,
      mutation_intent: null,
      intent_recovery: null,
      effect_checkpoint: null,
      reversible_effect_checkpoint: null,
      result: null,
      result_amendment_count: 0,
      last_result_amendment: null,
      mutation_reopen_authorizations: [],
      active_mutation_reopen_authorization_id: null,
    },
  };
}

function buildGuideTraceability(cases) {
  const traceability = new Map();
  for (const auditCase of cases) {
    for (const reference of [
      ...auditCase.guide_refs,
      ...(auditCase.reviewer_refs ?? []),
    ]) {
      const caseIds = traceability.get(reference) ?? [];
      caseIds.push(auditCase.id);
      traceability.set(reference, caseIds);
    }
  }
  return Object.fromEntries(
    [...traceability.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function runIdFor(now = new Date(), entropy = randomBytes(3).toString("hex")) {
  return `${now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")}-${entropy}`;
}

function runFiles(runDir) {
  return {
    manifest: path.join(runDir, "manifest.json"),
    events: path.join(runDir, "events.jsonl"),
    findings: path.join(runDir, "findings.jsonl"),
    summary: path.join(runDir, "summary.json"),
    report: path.join(runDir, "run-report.md"),
    authPreflight: path.join(runDir, "auth-preflight.json"),
    remediationLedger: path.join(runDir, "remediation-ledger.json"),
    capabilityMatrix: path.join(runDir, "capability-matrix.json"),
    screenshots: path.join(runDir, "screenshots"),
    domEvidence: path.join(runDir, "dom-evidence"),
    structuredEvidence: path.join(runDir, "structured-evidence"),
  };
}

async function writeJson(file, value) {
  assertValueSafe(value, path.basename(file));
  const temporaryFile = `${file}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryFile, file);
}

async function appendJsonLine(file, value) {
  assertValueSafe(value, path.basename(file));
  await appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
}

async function writeJsonLines(file, values) {
  assertValueSafe(values, path.basename(file));
  const temporaryFile = `${file}.tmp-${randomBytes(6).toString("hex")}`;
  const serialized = values.map((value) => JSON.stringify(value)).join("\n");
  await writeFile(temporaryFile, serialized ? `${serialized}\n` : "", "utf8");
  await rename(temporaryFile, file);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readJsonLines(file) {
  const raw = await readFile(file, "utf8");
  if (raw.trim().length === 0) return [];
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(
          `${path.basename(file)} line ${index + 1} is invalid JSON: ${error.message}`,
        );
      }
    });
}

async function readdirIfPresent(directory) {
  try {
    return await readdir(directory);
  } catch (error) {
    if (error instanceof Error && error.code === "ENOENT") return [];
    throw error;
  }
}

function eventAnchor(reference) {
  const match = /^events\.jsonl#([A-Za-z0-9_-]+:\d{6})$/.exec(
    reference.replaceAll("\\", "/"),
  );
  return match?.[1] ?? null;
}

async function assertScreenshotMagic(file, name) {
  const bytes = await readFile(file);
  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg =
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (/\.png$/i.test(name) && !isPng) {
    throw new Error(`Screenshot ${name} does not contain PNG magic bytes.`);
  }
  if (/\.jpe?g$/i.test(name) && !isJpeg) {
    throw new Error(`Screenshot ${name} does not contain JPEG magic bytes.`);
  }
  if (/\.webp$/i.test(name) && !isWebp) {
    throw new Error(`Screenshot ${name} does not contain WebP magic bytes.`);
  }
}

async function loadDomEvidence(files, manifest) {
  const names = await readdirIfPresent(files.domEvidence);
  const records = new Map();
  for (const name of names) {
    if (!name.endsWith(".json")) {
      throw new Error(`dom-evidence/${name} is not a JSON evidence file.`);
    }
    const fullPath = path.join(files.domEvidence, name);
    if (!(await stat(fullPath)).isFile()) {
      throw new Error(`dom-evidence/${name} is not an evidence file.`);
    }
    const record = await readJson(fullPath);
    const auditCase = findCase(manifest, record.case_id);
    validateDomEvidenceRecord(record, auditCase.id);
    if (name !== `${record.evidence_id}.json`) {
      throw new Error(`${record.evidence_id} filename does not match its stable ID.`);
    }
    const reference = `dom-evidence/${name}`;
    if (records.has(reference)) throw new Error(`Duplicate DOM evidence ${reference}.`);
    records.set(reference, record);
  }
  return records;
}

async function loadStructuredEvidence(files, manifest) {
  const names = await readdirIfPresent(files.structuredEvidence);
  const records = new Map();
  for (const name of names) {
    if (!name.endsWith(".json")) {
      throw new Error(`structured-evidence/${name} is not a JSON evidence file.`);
    }
    const fullPath = path.join(files.structuredEvidence, name);
    if (!(await stat(fullPath)).isFile()) {
      throw new Error(`structured-evidence/${name} is not an evidence file.`);
    }
    const record = await readJson(fullPath);
    const auditCase = findCase(manifest, record.case_id);
    validateStructuredEvidenceRecord(record, auditCase.id);
    if (name !== `${record.evidence_id}.json`) {
      throw new Error(`${record.evidence_id} filename does not match its stable ID.`);
    }
    const reference = `structured-evidence/${name}`;
    if (records.has(reference)) {
      throw new Error(`Duplicate structured evidence ${reference}.`);
    }
    records.set(reference, record);
  }
  return records;
}

export async function loadPermanentEvidenceReferencesByCase(runDir) {
  const files = runFiles(runDir);
  const manifest = await readJson(files.manifest);
  const references = new Map(
    manifest.case_inventory.map((auditCase) => [auditCase.id, []]),
  );
  const permanentEvidence = [
    ...(await loadDomEvidence(files, manifest)).entries(),
    ...(await loadStructuredEvidence(files, manifest)).entries(),
  ];
  for (const [reference, record] of permanentEvidence) {
    references.get(record.case_id).push(reference);
  }
  return references;
}

export function requireExplicitReconciliationOutcome(caseId, prior, spec) {
  const current = spec?.current ?? prior?.current_behavior_result;
  const alignment = spec?.alignment ?? prior?.process_alignment_result;
  if (!current || !alignment) {
    throw new Error(
      `${caseId} has no prior terminal result or explicit reconciliation outcome; refusing an inferred pass.`,
    );
  }
  return {
    prior,
    spec,
    current,
    alignment,
    blocker: spec?.blocker ?? prior?.blocker ?? null,
  };
}

export function manifestMatchesAuditContract(manifest, canonicalCases, fingerprint) {
  if (manifest?.environment?.audit_contract_fingerprint !== fingerprint) return false;
  const existingCases = caseDefinitionsFromManifest(manifest);
  if (existingCases.length !== canonicalCases.length) return false;
  const existingById = new Map(
    existingCases.map((auditCase) => [auditCase.id, auditCase]),
  );
  return canonicalCases.every(
    (auditCase) =>
      existingById.has(auditCase.id) &&
      JSON.stringify(existingById.get(auditCase.id)) === JSON.stringify(auditCase),
  );
}

export async function initializeAuditRun({
  baseDir = path.resolve("artifacts", "process-audit"),
  runId,
  environment,
  guideSource,
  roles,
  modes,
  guideSectionIds = GUIDE_SECTION_IDS,
  reviewerChecklistIds = REVIEWER_CHECKLIST_IDS,
  cases = PROCESS_AUDIT_CASES,
  now = new Date(),
}) {
  validateCaseDefinitions(cases);
  assertPlainObject("environment", environment);
  assertNonemptyString("environment.deployment_url", environment.deployment_url, 1_000);
  assertNonemptyString(
    "environment.repository_commit",
    environment.repository_commit,
    160,
  );
  assertNonemptyString("guideSource", guideSource, 1_000);
  validateDeclaredRoleModeCoverage(roles, modes, cases);
  validateTraceabilityCompleteness(guideSectionIds, reviewerChecklistIds, cases);
  const id = runId ?? runIdFor(now);
  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new Error("runId contains unsupported characters.");
  const runDir = path.join(baseDir, id);
  const files = runFiles(runDir);
  try {
    const existingManifest = await readJson(files.manifest);
    if (
      existingManifest.run_id !== id ||
      existingManifest.guide_source !== guideSource ||
      JSON.stringify(existingManifest.environment) !== JSON.stringify(environment) ||
      JSON.stringify(existingManifest.roles) !== JSON.stringify(roles) ||
      JSON.stringify(existingManifest.modes) !== JSON.stringify(modes)
    ) {
      throw new Error(
        `Run ${id} already exists with different environment, guide, roles, or modes.`,
      );
    }
    const existingById = new Map(
      caseDefinitionsFromManifest(existingManifest).map((auditCase) => [
        auditCase.id,
        auditCase,
      ]),
    );
    validateTraceabilityCompleteness(
      existingManifest.guide_section_ids,
      existingManifest.reviewer_checklist_ids,
      [...existingById.values()],
    );
    const sourceById = new Map(cases.map((auditCase) => [auditCase.id, auditCase]));
    const preservedDefinitionDrift = [...existingById]
      .filter(
        ([caseId, definition]) =>
          sourceById.has(caseId) &&
          JSON.stringify(sourceById.get(caseId)) !== JSON.stringify(definition),
      )
      .map(([caseId]) => caseId);
    return {
      runDir,
      manifest: existingManifest,
      resumed: true,
      preserved_definition_drift: preservedDefinitionDrift,
      untracked_source_case_ids: [...sourceById.keys()].filter(
        (caseId) => !existingById.has(caseId),
      ),
      missing_source_case_ids: [...existingById.keys()].filter(
        (caseId) => !sourceById.has(caseId),
      ),
    };
  } catch (error) {
    if (!(error instanceof Error) || error.code !== "ENOENT") throw error;
  }
  await Promise.all([
    mkdir(files.screenshots, { recursive: true }),
    mkdir(files.domEvidence, { recursive: true }),
    mkdir(files.structuredEvidence, { recursive: true }),
  ]);
  const manifest = {
    schema_version: "process-audit.v1",
    run_id: id,
    status: "running",
    started_at: isoNow(now),
    updated_at: isoNow(now),
    environment,
    guide_source: guideSource,
    guide_section_ids: guideSectionIds,
    reviewer_checklist_ids: reviewerChecklistIds,
    roles,
    modes,
    enums: {
      current_behavior_results: CURRENT_BEHAVIOR_RESULTS,
      process_alignment_results: PROCESS_ALIGNMENT_RESULTS,
      finding_classes: FINDING_CLASSES,
      finding_severities: FINDING_SEVERITIES,
      finding_origins: FINDING_ORIGINS,
      clean_retry_results: CLEAN_RETRY_RESULTS,
      data_modes: AUDIT_DATA_MODES,
      mutation_kinds: MUTATION_KINDS,
    },
    guide_traceability: buildGuideTraceability(cases),
    inventory_extensions: [],
    declaration_amendments: [],
    enum_migrations: [],
    environment_amendments: [],
    case_definition_amendments: [],
    capabilities: {
      append_only_reopen: true,
      blocked_mutation_case_reopen: true,
      case_result_amendments: true,
      finding_lifecycle_events: true,
      dom_evidence: true,
      structured_evidence: true,
    },
    reopen_count: 0,
    active_reopen: null,
    effect_registry: {},
    test_record_registry: [],
    case_inventory: cases.map(caseWithExecution),
  };
  await writeFile(files.events, "", "utf8");
  await writeFile(files.findings, "", "utf8");
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: `${id}:000001`,
    timestamp: isoNow(now),
    type: "run_initialized",
    run_id: id,
    case_count: cases.length,
  });
  // The manifest is the initialization marker and is written last so a
  // partially created directory can be safely initialized again.
  await writeJson(files.manifest, manifest);
  return { runDir, manifest, resumed: false };
}

export async function extendAuditCaseInventory(
  runDir,
  cases = PROCESS_AUDIT_CASES,
  now = new Date(),
) {
  validateCaseDefinitions(cases);
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  if (manifest.status !== "running") {
    throw new Error(`Run ${manifest.run_id} is not running.`);
  }
  manifest.inventory_extensions ??= [];
  const existingDefinitions = caseDefinitionsFromManifest(manifest);
  const candidateById = new Map(cases.map((auditCase) => [auditCase.id, auditCase]));
  const preservedDefinitionDrift = existingDefinitions
    .filter((auditCase) => {
      const candidate = candidateById.get(auditCase.id);
      return candidate && JSON.stringify(candidate) !== JSON.stringify(auditCase);
    })
    .map((auditCase) => auditCase.id);
  const existingIds = new Set(existingDefinitions.map((auditCase) => auditCase.id));
  const additions = cases.filter((auditCase) => !existingIds.has(auditCase.id));
  if (additions.length === 0) {
    validateTraceabilityCompleteness(
      manifest.guide_section_ids,
      manifest.reviewer_checklist_ids,
      existingDefinitions,
    );
    for (const extension of manifest.inventory_extensions) {
      await repairMissingEvent(
        files,
        manifest,
        events,
        (event) =>
          event.type === "case_inventory_extended" &&
          event.extension_id === extension.extension_id,
        {
          schema_version: "process-audit-event.v1",
          timestamp: extension.extended_at,
          type: "case_inventory_extended",
          run_id: manifest.run_id,
          extension_id: extension.extension_id,
          case_ids: extension.case_ids,
          preserved_definition_drift: extension.preserved_definition_drift ?? [],
        },
      );
    }
    return {
      idempotent: true,
      added_case_ids: [],
      preserved_definition_drift: preservedDefinitionDrift,
      manifest,
    };
  }
  manifest.case_inventory.push(...additions.map(caseWithExecution));
  const extendedDefinitions = caseDefinitionsFromManifest(manifest);
  validateCaseDefinitions(extendedDefinitions);
  validateDeclaredRoleModeCoverage(manifest.roles, manifest.modes, extendedDefinitions);
  validateTraceabilityCompleteness(
    manifest.guide_section_ids,
    manifest.reviewer_checklist_ids,
    extendedDefinitions,
  );
  const extension = {
    extension_id: `${manifest.run_id}:inventory:${String(
      manifest.inventory_extensions.length + 1,
    ).padStart(4, "0")}`,
    extended_at: isoNow(now),
    case_ids: additions.map((auditCase) => auditCase.id),
    preserved_definition_drift: preservedDefinitionDrift,
  };
  manifest.inventory_extensions.push(extension);
  manifest.guide_traceability = buildGuideTraceability(extendedDefinitions);
  manifest.updated_at = isoNow(now);
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: isoNow(now),
    type: "case_inventory_extended",
    run_id: manifest.run_id,
    extension_id: extension.extension_id,
    case_ids: extension.case_ids,
    preserved_definition_drift: extension.preserved_definition_drift,
  });
  return {
    idempotent: false,
    added_case_ids: extension.case_ids,
    preserved_definition_drift: preservedDefinitionDrift,
    manifest,
  };
}

function findCase(manifest, caseId) {
  const auditCase = manifest.case_inventory.find((candidate) => candidate.id === caseId);
  if (!auditCase) throw new Error(`Unknown audit case: ${caseId}.`);
  return auditCase;
}

function nextEventId(manifest, events) {
  return `${manifest.run_id}:${String(events.length + 1).padStart(6, "0")}`;
}

async function repairMissingEvent(files, manifest, events, predicate, event) {
  const matches = events.filter(predicate);
  if (matches.length > 1) {
    throw new Error(`Duplicate ${event.type} events exist for ${event.case_id}.`);
  }
  if (matches.length === 1) return false;
  const recoveredEvent = {
    ...event,
    event_id: nextEventId(manifest, events),
    recovered_during_resume: true,
  };
  await appendJsonLine(files.events, recoveredEvent);
  events.push(recoveredEvent);
  return true;
}

function assertRunRunning(manifest, action) {
  if (manifest.status !== "running") {
    throw new Error(`Run ${manifest.run_id} must be reopened before ${action}.`);
  }
}

function validateSidecarArtifact(kind, artifact, manifest, options = {}) {
  if (kind === "auth_preflight") {
    return validateAuthPreflightArtifact(artifact, manifest, options);
  }
  if (kind === "remediation_ledger") {
    return validateRemediationLedgerArtifact(artifact, options);
  }
  if (kind === "capability_matrix") {
    return validateCapabilityMatrixArtifact(artifact, manifest, options);
  }
  throw new Error(`Unknown audit sidecar ${kind}.`);
}

async function checkpointAuditSidecar(runDir, kind, artifact, now = new Date()) {
  const config = SIDECAR_CONFIG[kind];
  if (!config) throw new Error(`Unknown audit sidecar ${kind}.`);
  const files = runFiles(runDir);
  const artifactFile = path.join(runDir, config.artifact);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, `checkpointing ${config.artifact}`);
  const { entryCount } = validateSidecarArtifact(kind, artifact, manifest);
  const artifactHash = sha256(JSON.stringify(artifact));
  const previous = manifest.sidecar_checkpoints?.[kind] ?? null;
  if (previous) {
    await repairMissingEvent(
      files,
      manifest,
      events,
      (event) =>
        event.type === config.eventType &&
        event.revision === previous.revision &&
        event.artifact_hash === previous.artifact_hash,
      {
        schema_version: "process-audit-event.v1",
        timestamp: previous.updated_at,
        type: config.eventType,
        run_id: manifest.run_id,
        artifact: config.artifact,
        artifact_hash: previous.artifact_hash,
        artifact_schema_version: previous.schema_version,
        entry_count: previous.entry_count,
        revision: previous.revision,
      },
    );
  }
  await writeJson(artifactFile, artifact);
  if (
    previous?.artifact_hash === artifactHash &&
    previous.entry_count === entryCount &&
    previous.schema_version === artifact.schema_version
  ) {
    return {
      idempotent: true,
      repaired: events.at(-1)?.recovered_during_resume === true,
      artifact,
      checkpoint: previous,
      manifest,
    };
  }
  const updatedAt = isoNow(now);
  const checkpoint = {
    schema_version: artifact.schema_version,
    updated_at: updatedAt,
    revision: (previous?.revision ?? 0) + 1,
    entry_count: entryCount,
    artifact_hash: artifactHash,
  };
  manifest.capabilities ??= {};
  manifest.capabilities[config.manifestCapability] = true;
  manifest.sidecar_checkpoints ??= {};
  manifest.sidecar_checkpoints[kind] = checkpoint;
  manifest.updated_at = updatedAt;
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: updatedAt,
    type: config.eventType,
    run_id: manifest.run_id,
    artifact: config.artifact,
    artifact_hash: artifactHash,
    artifact_schema_version: artifact.schema_version,
    entry_count: entryCount,
    revision: checkpoint.revision,
  });
  return { idempotent: false, repaired: false, artifact, checkpoint, manifest };
}

export async function checkpointAuthPreflight(runDir, artifact, now = new Date()) {
  return checkpointAuditSidecar(runDir, "auth_preflight", artifact, now);
}

export async function checkpointRemediationLedger(runDir, artifact, now = new Date()) {
  return checkpointAuditSidecar(runDir, "remediation_ledger", artifact, now);
}

export async function checkpointCapabilityMatrix(runDir, artifact, now = new Date()) {
  return checkpointAuditSidecar(runDir, "capability_matrix", artifact, now);
}

const REMEDIATION_LEDGER_MUTABLE_KEYS = new Set([
  "current_applicability",
  "root_cause",
  "affected_boundary",
  "resolution_classification",
  "required_setup_or_fixture",
  "code_change",
  "acceptance_criteria",
  "regression_test_mapping",
  "dependencies",
  "status",
  "commit_evidence",
  "deployment_evidence",
  "post_deployment_result",
  "exclusion_reason",
]);
const CAPABILITY_MATRIX_MUTABLE_KEYS = new Set([
  "fixture",
  "test_layer",
  "current_result",
  "post_remediation_result",
  "evidence",
]);

async function amendSidecarEntries(
  runDir,
  { kind, payload, idKey, mutableKeys, checkpoint, now = new Date() },
) {
  assertPlainObject("sidecar amendment", payload);
  assertOnlyKeys("sidecar amendment", payload, new Set(["expected_revision", "updates"]));
  if (!Number.isInteger(payload.expected_revision) || payload.expected_revision < 1) {
    throw new Error("sidecar amendment.expected_revision must be a positive integer.");
  }
  if (!Array.isArray(payload.updates) || payload.updates.length === 0) {
    throw new Error("sidecar amendment.updates must be a non-empty array.");
  }

  const config = SIDECAR_CONFIG[kind];
  const files = runFiles(runDir);
  const [manifest, artifact] = await Promise.all([
    readJson(files.manifest),
    readJson(path.join(runDir, config.artifact)),
  ]);
  assertRunRunning(manifest, `amending ${config.artifact}`);
  const sidecarCheckpoint = manifest.sidecar_checkpoints?.[kind];
  if (!sidecarCheckpoint) {
    throw new Error(`${config.artifact} must be checkpointed before it can be amended.`);
  }

  const updatesById = new Map();
  for (const [index, update] of payload.updates.entries()) {
    const label = `sidecar amendment.updates[${index}]`;
    assertPlainObject(label, update);
    assertOnlyKeys(label, update, new Set([idKey, "changes"]));
    assertNonemptyString(`${label}.${idKey}`, update[idKey], 200);
    if (updatesById.has(update[idKey])) {
      throw new Error(`Duplicate sidecar amendment ${idKey} ${update[idKey]}.`);
    }
    assertPlainObject(`${label}.changes`, update.changes);
    assertOnlyKeys(`${label}.changes`, update.changes, mutableKeys);
    if (Object.keys(update.changes).length === 0) {
      throw new Error(`${label}.changes cannot be empty.`);
    }
    updatesById.set(update[idKey], update.changes);
  }

  const entriesById = new Map(artifact.entries.map((entry) => [entry[idKey], entry]));
  const missing = [...updatesById.keys()].filter((id) => !entriesById.has(id));
  if (missing.length > 0) {
    throw new Error(
      `${config.artifact} amendment references unknown ${idKey}: ${missing.join(", ")}.`,
    );
  }

  const alreadyApplied = [...updatesById].every(([id, changes]) => {
    const entry = entriesById.get(id);
    return Object.entries(changes).every(([key, value]) => sameJson(entry[key], value));
  });
  if (sidecarCheckpoint.revision !== payload.expected_revision) {
    if (sidecarCheckpoint.revision === payload.expected_revision + 1 && alreadyApplied) {
      return {
        idempotent: true,
        artifact,
        checkpoint: sidecarCheckpoint,
        manifest,
      };
    }
    throw new Error(
      `${config.artifact} revision is ${sidecarCheckpoint.revision}; expected ${payload.expected_revision}. Reload before amending.`,
    );
  }
  if (alreadyApplied) {
    return {
      idempotent: true,
      artifact,
      checkpoint: sidecarCheckpoint,
      manifest,
    };
  }

  const amended = structuredClone(artifact);
  for (const entry of amended.entries) {
    const changes = updatesById.get(entry[idKey]);
    if (changes) Object.assign(entry, structuredClone(changes));
  }
  amended.generated_at = isoNow(now);
  return checkpoint(runDir, amended, now);
}

/** Revision-checked, resumable amendment of selected remediation-ledger rows. */
export async function amendRemediationLedgerEntries(runDir, payload, now = new Date()) {
  return amendSidecarEntries(runDir, {
    kind: "remediation_ledger",
    payload,
    idKey: "finding_id",
    mutableKeys: REMEDIATION_LEDGER_MUTABLE_KEYS,
    checkpoint: checkpointRemediationLedger,
    now,
  });
}

/** Revision-checked, resumable amendment of selected capability-matrix rows. */
export async function amendCapabilityMatrixEntries(runDir, payload, now = new Date()) {
  return amendSidecarEntries(runDir, {
    kind: "capability_matrix",
    payload,
    idKey: "capability_id",
    mutableKeys: CAPABILITY_MATRIX_MUTABLE_KEYS,
    checkpoint: checkpointCapabilityMatrix,
    now,
  });
}

function classifyFindingForRemediation(finding, auditCase) {
  if (finding.finding_origin === "audit_harness") {
    return {
      resolutionClassification: "audit_harness_fix",
      applicability: "applicable",
      exclusionReason: null,
    };
  }
  if (finding.finding_origin === "authentication") {
    return {
      resolutionClassification: "fixture_or_identity_setup",
      applicability: "applicable",
      exclusionReason: null,
    };
  }
  if (finding.finding_origin === "documentation") {
    return {
      resolutionClassification: "documentation_correction",
      applicability: "applicable",
      exclusionReason: null,
    };
  }
  if (finding.finding_origin === "expected_denial") {
    return {
      resolutionClassification: "already_resolved",
      applicability: "not_applicable",
      exclusionReason:
        "Pass one classified the observed denial as the expected governed outcome.",
    };
  }
  const looksLikeSeparateProviderActivation =
    finding.finding_origin === "unavailable_dependency" &&
    (auditCase.data_mode === "live_effect" ||
      finding.finding_class === "external_boundary" ||
      /provider activation|provider credential|external provider/i.test(
        finding.recommended_correction_or_investigation,
      ));
  if (looksLikeSeparateProviderActivation) {
    return {
      resolutionClassification: "provider_activation_separate",
      applicability: "not_applicable",
      exclusionReason:
        "The unavailable Live provider activation is tracked separately from app remediation and must not be represented as Live proof.",
    };
  }
  if (finding.finding_origin === "unavailable_dependency") {
    return {
      resolutionClassification: "fixture_or_identity_setup",
      applicability: "applicable",
      exclusionReason: null,
    };
  }
  return {
    resolutionClassification: "applicable_fix",
    applicability: "applicable",
    exclusionReason: null,
  };
}

export async function bootstrapRemediationLedger(runDir, sourceRunDir, now = new Date()) {
  await validateAuditRun(sourceRunDir);
  const sourceFiles = runFiles(sourceRunDir);
  const [sourceManifest, sourceFindings] = await Promise.all([
    readJson(sourceFiles.manifest),
    readJsonLines(sourceFiles.findings),
  ]);
  const sourceCases = new Map(
    sourceManifest.case_inventory.map((auditCase) => [auditCase.id, auditCase]),
  );
  const entries = sourceFindings.map((finding) => {
    const auditCase = sourceCases.get(finding.case_id);
    if (!auditCase) {
      throw new Error(`${finding.finding_id} has no source case definition.`);
    }
    const classification = classifyFindingForRemediation(finding, auditCase);
    return {
      finding_id: finding.finding_id,
      case_id: finding.case_id,
      severity: finding.severity,
      finding_class: finding.finding_class,
      source_artifacts: [
        `${sourceManifest.run_id}/findings.jsonl#${finding.finding_id}`,
        ...finding.evidence_references.map(
          (reference) => `${sourceManifest.run_id}/${reference}`,
        ),
      ],
      reported_behavior: finding.actual_behavior,
      current_applicability: classification.applicability,
      root_cause: `Pass-one origin classification: ${finding.finding_origin}. Root-cause confirmation remains part of this pending remediation row.`,
      affected_boundary: `${finding.route} — ${finding.surface}; ${finding.workflow_stage}.`,
      resolution_classification: classification.resolutionClassification,
      required_setup_or_fixture:
        finding.blocker?.unblock_action ??
        auditCase.safe_alias ??
        "No additional Test fixture was identified in pass one.",
      code_change: finding.recommended_correction_or_investigation,
      acceptance_criteria: finding.expected_behavior,
      regression_test_mapping: [`audit-case:${finding.case_id}`],
      dependencies: auditCase.depends_on.map((caseId) => `audit-case:${caseId}`),
      status: "pending",
      commit_evidence: null,
      deployment_evidence: null,
      post_deployment_result: "pending",
      exclusion_reason: classification.exclusionReason,
    };
  });
  return checkpointRemediationLedger(
    runDir,
    {
      schema_version: REMEDIATION_LEDGER_SCHEMA_VERSION,
      source_run_id: sourceManifest.run_id,
      source_finding_count: sourceFindings.length,
      generated_at: isoNow(now),
      entries,
    },
    now,
  );
}

function capabilityTestLayer(auditCase) {
  if (auditCase.data_mode === "live_effect") return "deployed_provider_guard";
  if (auditCase.data_mode === "live_read") return "deployed_live_read";
  return "deployed_browser";
}

export async function bootstrapCapabilityMatrix(runDir, now = new Date()) {
  const manifest = await readJson(runFiles(runDir).manifest);
  assertRunRunning(manifest, "bootstrapping capability-matrix.json");
  const entries = manifest.case_inventory.map((auditCase) => ({
    capability_id: `CAP-${auditCase.id}`,
    human_question: `Does the deployed app satisfy “${auditCase.title}” for ${auditCase.role}?`,
    guide_or_reviewer_items: [
      ...new Set([...auditCase.guide_refs, ...(auditCase.reviewer_refs ?? [])]),
    ],
    case_ids: [auditCase.id],
    role: auditCase.role,
    mode: auditCase.data_mode,
    fixture: auditCase.safe_alias ?? "Read-only observation; no mutable Test fixture.",
    test_layer: capabilityTestLayer(auditCase),
    expected_behavior: auditCase.expected.visible_result,
    current_result: "pending",
    post_remediation_result: "pending",
    evidence: [],
  }));
  return checkpointCapabilityMatrix(
    runDir,
    {
      schema_version: CAPABILITY_MATRIX_SCHEMA_VERSION,
      generated_at: isoNow(now),
      entries,
    },
    now,
  );
}

async function validateDeclaredAuditSidecars(
  files,
  manifest,
  events,
  { requireTerminal = false } = {},
) {
  const counts = {};
  for (const [kind, config] of Object.entries(SIDECAR_CONFIG)) {
    const enabled = manifest.capabilities?.[config.manifestCapability] === true;
    const checkpoint = manifest.sidecar_checkpoints?.[kind] ?? null;
    const checkpointEvents = events.filter((event) => event.type === config.eventType);
    if (!enabled && !checkpoint && checkpointEvents.length === 0) continue;
    if (!enabled || !checkpoint) {
      throw new Error(`${config.artifact} capability and checkpoint must agree.`);
    }
    assertPlainObject(`${kind} checkpoint`, checkpoint);
    assertOnlyKeys(
      `${kind} checkpoint`,
      checkpoint,
      new Set([
        "schema_version",
        "updated_at",
        "revision",
        "entry_count",
        "artifact_hash",
      ]),
    );
    assertNonemptyString(`${kind} checkpoint.schema_version`, checkpoint.schema_version);
    assertIsoTimestamp(`${kind} checkpoint.updated_at`, checkpoint.updated_at);
    if (!Number.isInteger(checkpoint.revision) || checkpoint.revision < 1) {
      throw new Error(`${kind} checkpoint revision must be positive.`);
    }
    if (!Number.isInteger(checkpoint.entry_count) || checkpoint.entry_count < 1) {
      throw new Error(`${kind} checkpoint entry count must be positive.`);
    }
    assertSha256(`${kind} checkpoint artifact hash`, checkpoint.artifact_hash);
    if (checkpointEvents.length !== checkpoint.revision) {
      throw new Error(`${config.artifact} checkpoint event count does not reconcile.`);
    }
    for (const [index, event] of checkpointEvents.entries()) {
      assertOnlyKeys(
        config.eventType,
        event,
        new Set([
          "schema_version",
          "event_id",
          "timestamp",
          "type",
          "run_id",
          "artifact",
          "artifact_hash",
          "artifact_schema_version",
          "entry_count",
          "revision",
          "recovered_during_resume",
        ]),
      );
      if (
        event.revision !== index + 1 ||
        event.artifact !== config.artifact ||
        event.artifact_schema_version !== checkpoint.schema_version
      ) {
        throw new Error(`${config.artifact} checkpoint event chain is invalid.`);
      }
      assertSha256(`${config.eventType}.artifact_hash`, event.artifact_hash);
    }
    const latestEvent = checkpointEvents.at(-1);
    if (
      latestEvent.artifact_hash !== checkpoint.artifact_hash ||
      latestEvent.entry_count !== checkpoint.entry_count ||
      latestEvent.timestamp !== checkpoint.updated_at
    ) {
      throw new Error(`${config.artifact} latest checkpoint event does not reconcile.`);
    }
    const artifact = await readJson(
      path.join(path.dirname(files.manifest), config.artifact),
    );
    const result = validateSidecarArtifact(kind, artifact, manifest, {
      requireTerminal,
    });
    const artifactHash = sha256(JSON.stringify(artifact));
    if (
      checkpoint.schema_version !== artifact.schema_version ||
      checkpoint.entry_count !== result.entryCount ||
      checkpoint.artifact_hash !== artifactHash
    ) {
      throw new Error(`${config.artifact} does not match its manifest checkpoint.`);
    }
    counts[kind] = result.entryCount;
  }
  return counts;
}

export async function reopenAuditRun(runDir, payload, now = new Date()) {
  assertPlainObject("run reopen", payload);
  assertOnlyKeys("run reopen", payload, new Set(["reason"]));
  assertNonemptyString("run reopen.reason", payload.reason, 2_000);
  assertValueSafe(payload, "run reopen");
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  if (manifest.status === "running") {
    if (manifest.active_reopen?.reason === payload.reason) {
      const repaired = await repairMissingEvent(
        files,
        manifest,
        events,
        (event) =>
          event.type === "run_reopened" &&
          event.reopen_id === manifest.active_reopen.reopen_id,
        {
          schema_version: "process-audit-event.v1",
          timestamp: manifest.active_reopen.reopened_at,
          type: "run_reopened",
          run_id: manifest.run_id,
          reopen_id: manifest.active_reopen.reopen_id,
          reason: manifest.active_reopen.reason,
          prior_completion_event_id: manifest.active_reopen.prior_completion_event_id,
        },
      );
      return { idempotent: true, repaired, manifest };
    }
    throw new Error(`Run ${manifest.run_id} is already running.`);
  }
  if (manifest.status !== "completed") {
    throw new Error(`Run ${manifest.run_id} cannot be reopened from ${manifest.status}.`);
  }
  const priorCompletion = events.at(-1);
  if (priorCompletion?.type !== "run_completed") {
    throw new Error("A completed run must end with run_completed before reopening.");
  }
  const reopenNumber = (manifest.reopen_count ?? 0) + 1;
  const reopenedAt = isoNow(now);
  const activeReopen = {
    reopen_id: `${manifest.run_id}:reopen:${String(reopenNumber).padStart(4, "0")}`,
    reopened_at: reopenedAt,
    reason: payload.reason,
    prior_completion_event_id: priorCompletion.event_id,
  };
  manifest.status = "running";
  manifest.completed_at = null;
  manifest.updated_at = reopenedAt;
  manifest.reopen_count = reopenNumber;
  manifest.active_reopen = activeReopen;
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: reopenedAt,
    type: "run_reopened",
    run_id: manifest.run_id,
    ...activeReopen,
  });
  return { idempotent: false, repaired: false, manifest };
}

function mutationReopenAuthorizations(auditCase) {
  const authorizations = auditCase.execution.mutation_reopen_authorizations ?? [];
  if (!Array.isArray(authorizations)) {
    throw new Error(`${auditCase.id} mutation reopen authorizations are invalid.`);
  }
  return authorizations;
}

function activeMutationReopenAuthorization(auditCase) {
  const authorizationId =
    auditCase.execution.active_mutation_reopen_authorization_id ?? null;
  if (authorizationId == null) return null;
  const matches = mutationReopenAuthorizations(auditCase).filter(
    (authorization) => authorization.authorization_id === authorizationId,
  );
  if (matches.length !== 1) {
    throw new Error(
      `${auditCase.id} active mutation reopen authorization does not reconcile.`,
    );
  }
  return matches[0];
}

function requireActiveMutationReopenForTerminalCheckpoint(auditCase) {
  if (!["completed", "blocked"].includes(auditCase.execution.status)) return null;
  if (
    auditCase.execution.status !== "blocked" ||
    auditCase.execution.result?.current_behavior_result !== "blocked"
  ) {
    throw new Error(`${auditCase.id} is already terminal.`);
  }
  const authorization = activeMutationReopenAuthorization(auditCase);
  if (!authorization) {
    throw new Error(
      `${auditCase.id} is terminal and requires an active reopen-case authorization before mutation checkpoints.`,
    );
  }
  return authorization;
}

export async function reopenBlockedMutationCase(runDir, payload, now = new Date()) {
  assertPlainObject("case mutation reopen", payload);
  assertOnlyKeys(
    "case mutation reopen",
    payload,
    new Set(["case_id", "reason", "authority_basis"]),
  );
  assertNonemptyString("case mutation reopen.case_id", payload.case_id, 120);
  assertNonemptyString("case mutation reopen.reason", payload.reason, 2_000);
  assertNonemptyString(
    "case mutation reopen.authority_basis",
    payload.authority_basis,
    2_000,
  );
  assertValueSafe(payload, "case mutation reopen");
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "authorizing a blocked mutation case reopen");
  if (!manifest.active_reopen?.reopen_id) {
    throw new Error(
      `Run ${manifest.run_id} must be a completed run that was explicitly reopened before reopen-case.`,
    );
  }
  const auditCase = findCase(manifest, payload.case_id);
  if (auditCase.mutation_kind === "read") {
    throw new Error(`${auditCase.id} is read-only and does not need reopen-case.`);
  }
  if (
    auditCase.execution.status !== "blocked" ||
    auditCase.execution.result?.current_behavior_result !== "blocked"
  ) {
    throw new Error(
      `${auditCase.id} must have a terminal blocked result before reopen-case.`,
    );
  }
  auditCase.execution.mutation_reopen_authorizations ??= [];
  const authorizations = mutationReopenAuthorizations(auditCase);
  const matching = authorizations.find(
    (authorization) =>
      authorization.run_reopen_id === manifest.active_reopen.reopen_id &&
      authorization.reason === payload.reason &&
      authorization.authority_basis === payload.authority_basis,
  );
  if (matching) {
    const repaired = await repairMissingEvent(
      files,
      manifest,
      events,
      (event) =>
        event.type === "case_mutation_reopen_authorized" &&
        event.authorization_id === matching.authorization_id,
      {
        schema_version: "process-audit-event.v1",
        timestamp: matching.authorized_at,
        type: "case_mutation_reopen_authorized",
        run_id: manifest.run_id,
        ...matching,
      },
    );
    return {
      idempotent: true,
      repaired,
      active:
        auditCase.execution.active_mutation_reopen_authorization_id ===
        matching.authorization_id,
      authorization: matching,
      auditCase,
    };
  }
  if (activeMutationReopenAuthorization(auditCase)) {
    throw new Error(`${auditCase.id} already has an active reopen-case authorization.`);
  }
  if (
    auditCase.execution.mutation_intent ||
    auditCase.execution.effect_checkpoint ||
    auditCase.execution.reversible_effect_checkpoint
  ) {
    throw new Error(
      `${auditCase.id} already has mutation checkpoints; use readback recovery instead of authorizing a replay.`,
    );
  }
  const priorTerminalEvent = [...events]
    .reverse()
    .find(
      (event) =>
        event.case_id === auditCase.id &&
        ["case_completed", "case_blocked", "case_result_amended"].includes(event.type),
    );
  if (!priorTerminalEvent) {
    throw new Error(`${auditCase.id} has no terminal event to preserve.`);
  }
  const authorizationNumber = authorizations.length + 1;
  const authorization = {
    authorization_id: `${manifest.run_id}:${auditCase.id}:mutation-reopen:${String(
      authorizationNumber,
    ).padStart(4, "0")}`,
    case_id: auditCase.id,
    authorized_at: isoNow(now),
    reason: payload.reason,
    authority_basis: payload.authority_basis,
    run_reopen_id: manifest.active_reopen.reopen_id,
    prior_terminal_event_id: priorTerminalEvent.event_id,
    prior_status: auditCase.execution.status,
    prior_result: structuredClone(auditCase.execution.result),
  };
  authorizations.push(authorization);
  auditCase.execution.active_mutation_reopen_authorization_id =
    authorization.authorization_id;
  manifest.capabilities ??= {};
  manifest.capabilities.blocked_mutation_case_reopen = true;
  manifest.updated_at = authorization.authorized_at;
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: authorization.authorized_at,
    type: "case_mutation_reopen_authorized",
    run_id: manifest.run_id,
    ...authorization,
  });
  return {
    idempotent: false,
    repaired: false,
    active: true,
    authorization,
    auditCase,
  };
}

export async function amendManifestDeclarations(runDir, payload, now = new Date()) {
  assertPlainObject("manifest declaration amendment", payload);
  assertOnlyKeys(
    "manifest declaration amendment",
    payload,
    new Set(["roles", "modes", "reason", "authority_basis"]),
  );
  assertNonemptyString("manifest declaration amendment.reason", payload.reason, 2_000);
  assertNonemptyString(
    "manifest declaration amendment.authority_basis",
    payload.authority_basis,
    2_000,
  );
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "amending declared roles and modes");
  const definitions = caseDefinitionsFromManifest(manifest);
  validateExactDeclaredRoleModeCoverage(payload.roles, payload.modes, definitions);
  assertValueSafe(payload, "manifest declaration amendment");
  const currentMatches =
    sameJson(manifest.roles, payload.roles) && sameJson(manifest.modes, payload.modes);
  if (currentMatches) {
    const last = (manifest.declaration_amendments ?? []).at(-1);
    if (last) {
      await repairMissingEvent(
        files,
        manifest,
        events,
        (event) =>
          event.type === "manifest_declarations_amended" &&
          event.amendment_id === last.amendment_id,
        {
          schema_version: "process-audit-event.v1",
          timestamp: last.amended_at,
          type: "manifest_declarations_amended",
          run_id: manifest.run_id,
          ...last,
        },
      );
    }
    return { idempotent: true, manifest };
  }
  manifest.declaration_amendments ??= [];
  const amendmentNumber = manifest.declaration_amendments.length + 1;
  const amendment = {
    amendment_id: `${manifest.run_id}:declarations:${String(amendmentNumber).padStart(4, "0")}`,
    amended_at: isoNow(now),
    reason: payload.reason,
    authority_basis: payload.authority_basis,
    previous_roles: manifest.roles,
    previous_modes: manifest.modes,
    roles: payload.roles,
    modes: payload.modes,
  };
  manifest.roles = payload.roles;
  manifest.modes = payload.modes;
  manifest.declaration_amendments.push(amendment);
  manifest.updated_at = amendment.amended_at;
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: amendment.amended_at,
    type: "manifest_declarations_amended",
    run_id: manifest.run_id,
    ...amendment,
  });
  return { idempotent: false, manifest };
}

export async function migrateManifestEnums(runDir, payload, now = new Date()) {
  assertPlainObject("manifest enum migration", payload);
  assertOnlyKeys(
    "manifest enum migration",
    payload,
    new Set(["reason", "authority_basis"]),
  );
  assertNonemptyString("manifest enum migration.reason", payload.reason, 2_000);
  assertNonemptyString(
    "manifest enum migration.authority_basis",
    payload.authority_basis,
    2_000,
  );
  assertValueSafe(payload, "manifest enum migration");
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "migrating manifest enum declarations");
  const missingFields = validateManifestEnums(manifest.enums, {
    allowMissingMigratable: true,
  });
  if (missingFields.length === 0) {
    const last = (manifest.enum_migrations ?? []).at(-1);
    let repaired = false;
    if (last) {
      repaired = await repairMissingEvent(
        files,
        manifest,
        events,
        (event) =>
          event.type === "manifest_enums_migrated" &&
          event.migration_id === last.migration_id,
        {
          schema_version: "process-audit-event.v1",
          timestamp: last.migrated_at,
          type: "manifest_enums_migrated",
          run_id: manifest.run_id,
          ...last,
        },
      );
    }
    return { idempotent: true, repaired, migrated_fields: [], manifest };
  }
  manifest.enum_migrations ??= [];
  const migrationNumber = manifest.enum_migrations.length + 1;
  const previousValues = Object.fromEntries(missingFields.map((field) => [field, null]));
  const changes = Object.fromEntries(
    missingFields.map((field) => [field, [...MANIFEST_ENUM_DECLARATIONS[field]]]),
  );
  const migration = {
    migration_id: `${manifest.run_id}:enums:${String(migrationNumber).padStart(4, "0")}`,
    migrated_at: isoNow(now),
    reason: payload.reason,
    authority_basis: payload.authority_basis,
    previous_values: previousValues,
    changes,
  };
  Object.assign(manifest.enums, changes);
  validateManifestEnums(manifest.enums);
  manifest.enum_migrations.push(migration);
  manifest.updated_at = migration.migrated_at;
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: migration.migrated_at,
    type: "manifest_enums_migrated",
    run_id: manifest.run_id,
    ...migration,
  });
  return {
    idempotent: false,
    repaired: false,
    migrated_fields: missingFields,
    manifest,
  };
}

function validateManifestEnumMigrationHistory(manifest, events) {
  validateManifestEnums(manifest.enums);
  const migrations = manifest.enum_migrations ?? [];
  if (!Array.isArray(migrations)) {
    throw new Error("manifest.enum_migrations must be an array.");
  }
  const migratedFields = new Set();
  for (const [index, migration] of migrations.entries()) {
    const label = `manifest.enum_migrations[${index}]`;
    assertPlainObject(label, migration);
    assertOnlyKeys(
      label,
      migration,
      new Set([
        "migration_id",
        "migrated_at",
        "reason",
        "authority_basis",
        "previous_values",
        "changes",
      ]),
    );
    if (
      migration.migration_id !==
      `${manifest.run_id}:enums:${String(index + 1).padStart(4, "0")}`
    ) {
      throw new Error("Manifest enum migration IDs are out of order.");
    }
    assertNonemptyString(`${label}.migrated_at`, migration.migrated_at, 160);
    assertNonemptyString(`${label}.reason`, migration.reason, 2_000);
    assertNonemptyString(`${label}.authority_basis`, migration.authority_basis, 2_000);
    assertPlainObject(`${label}.previous_values`, migration.previous_values);
    assertPlainObject(`${label}.changes`, migration.changes);
    const fields = Object.keys(migration.changes);
    if (
      fields.length === 0 ||
      !sameJson(Object.keys(migration.previous_values), fields)
    ) {
      throw new Error(`${migration.migration_id} field history does not reconcile.`);
    }
    for (const field of fields) {
      if (!MIGRATABLE_MANIFEST_ENUM_FIELDS.includes(field)) {
        throw new Error(`${migration.migration_id}.${field} is not migratable.`);
      }
      if (migratedFields.has(field)) {
        throw new Error(
          `${migration.migration_id}.${field} was migrated more than once.`,
        );
      }
      if (migration.previous_values[field] !== null) {
        throw new Error(`${migration.migration_id}.${field} was not previously missing.`);
      }
      if (!sameJson(migration.changes[field], MANIFEST_ENUM_DECLARATIONS[field])) {
        throw new Error(
          `${migration.migration_id}.${field} does not exactly match current runner constants.`,
        );
      }
      migratedFields.add(field);
    }
    const matching = events.filter(
      (event) =>
        event.type === "manifest_enums_migrated" &&
        event.migration_id === migration.migration_id,
    );
    if (matching.length !== 1) {
      throw new Error(`${migration.migration_id} event does not reconcile.`);
    }
    const eventComparable = { ...matching[0] };
    for (const key of [
      "schema_version",
      "event_id",
      "timestamp",
      "type",
      "run_id",
      "recovered_during_resume",
    ]) {
      delete eventComparable[key];
    }
    if (!sameJson(eventComparable, migration)) {
      throw new Error(`${migration.migration_id} values do not reconcile.`);
    }
    assertValueSafe(migration, migration.migration_id);
  }
  return migrations;
}

export async function amendEnvironmentMetadata(runDir, payload, now = new Date()) {
  assertPlainObject("environment metadata amendment", payload);
  assertOnlyKeys(
    "environment metadata amendment",
    payload,
    new Set(["reason", "changes"]),
  );
  assertNonemptyString("environment metadata amendment.reason", payload.reason, 2_000);
  validateEnvironmentMetadataChanges(
    payload.changes,
    "environment metadata amendment.changes",
  );
  assertValueSafe(payload, "environment metadata amendment");
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "amending environment metadata");
  const currentMatches = Object.entries(payload.changes).every(
    ([field, value]) => manifest.environment[field] === value,
  );
  if (currentMatches) {
    const last = (manifest.environment_amendments ?? []).at(-1);
    if (last) {
      await repairMissingEvent(
        files,
        manifest,
        events,
        (event) =>
          event.type === "environment_metadata_amended" &&
          event.amendment_id === last.amendment_id,
        {
          schema_version: "process-audit-event.v1",
          timestamp: last.amended_at,
          type: "environment_metadata_amended",
          run_id: manifest.run_id,
          ...last,
        },
      );
    }
    return { idempotent: true, manifest };
  }
  manifest.environment_amendments ??= [];
  const amendmentNumber = manifest.environment_amendments.length + 1;
  const previousValues = Object.fromEntries(
    Object.keys(payload.changes).map((field) => [
      field,
      manifest.environment[field] ?? null,
    ]),
  );
  const amendment = {
    amendment_id: `${manifest.run_id}:environment:${String(amendmentNumber).padStart(4, "0")}`,
    amended_at: isoNow(now),
    reason: payload.reason,
    previous_values: previousValues,
    changes: payload.changes,
  };
  Object.assign(manifest.environment, payload.changes);
  manifest.environment_amendments.push(amendment);
  manifest.updated_at = amendment.amended_at;
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: amendment.amended_at,
    type: "environment_metadata_amended",
    run_id: manifest.run_id,
    ...amendment,
  });
  return { idempotent: false, manifest };
}

export async function declareTraceabilityInventory(runDir, payload, now = new Date()) {
  assertPlainObject("traceability inventory", payload);
  assertOnlyKeys(
    "traceability inventory",
    payload,
    new Set(["guide_section_ids", "reviewer_checklist_ids", "reason"]),
  );
  assertNonemptyString("traceability inventory.reason", payload.reason, 2_000);
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "declaring traceability inventories");
  validateIdentifierInventory("guide_section_ids", payload.guide_section_ids);
  validateIdentifierInventory("reviewer_checklist_ids", payload.reviewer_checklist_ids);
  const currentMatches =
    JSON.stringify(manifest.guide_section_ids) ===
      JSON.stringify(payload.guide_section_ids) &&
    JSON.stringify(manifest.reviewer_checklist_ids) ===
      JSON.stringify(payload.reviewer_checklist_ids);
  const latestEvent = [...events]
    .reverse()
    .find((event) => event.type === "traceability_inventory_declared");
  if (
    currentMatches &&
    latestEvent?.reason === payload.reason &&
    JSON.stringify(latestEvent.guide_section_ids) ===
      JSON.stringify(payload.guide_section_ids) &&
    JSON.stringify(latestEvent.reviewer_checklist_ids) ===
      JSON.stringify(payload.reviewer_checklist_ids)
  ) {
    return { idempotent: true, manifest };
  }
  const prior = {
    guide_section_ids: manifest.guide_section_ids ?? null,
    reviewer_checklist_ids: manifest.reviewer_checklist_ids ?? null,
  };
  manifest.guide_section_ids = payload.guide_section_ids;
  manifest.reviewer_checklist_ids = payload.reviewer_checklist_ids;
  manifest.updated_at = isoNow(now);
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: isoNow(now),
    type: "traceability_inventory_declared",
    run_id: manifest.run_id,
    reason: payload.reason,
    prior,
    guide_section_ids: payload.guide_section_ids,
    reviewer_checklist_ids: payload.reviewer_checklist_ids,
  });
  return { idempotent: false, manifest };
}

export async function recordDomEvidence(runDir, payload, now = new Date()) {
  assertPlainObject("DOM evidence input", payload);
  assertOnlyKeys("DOM evidence input", payload, DOM_EVIDENCE_ALLOWED_INPUT_KEYS);
  assertNonemptyString("DOM evidence input.case_id", payload.case_id, 120);
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "recording DOM evidence");
  const auditCase = findCase(manifest, payload.case_id);
  const record = {
    schema_version: DOM_EVIDENCE_SCHEMA_VERSION,
    evidence_id: payload.evidence_id,
    case_id: auditCase.id,
    captured_at: isoNow(now),
    route: payload.route,
    headings: payload.headings,
    control_summaries: payload.control_summaries,
    console_error_hashes: payload.console_error_hashes,
  };
  validateDomEvidenceRecord(record, auditCase.id);
  await mkdir(files.domEvidence, { recursive: true });
  const evidenceFile = path.join(files.domEvidence, `${record.evidence_id}.json`);
  const reference = `dom-evidence/${record.evidence_id}.json`;
  try {
    const existing = await readJson(evidenceFile);
    const comparableExisting = JSON.stringify({ ...existing, captured_at: undefined });
    const comparableIncoming = JSON.stringify({ ...record, captured_at: undefined });
    if (comparableExisting !== comparableIncoming) {
      throw new Error(`${record.evidence_id} already exists with different content.`);
    }
    await repairMissingEvent(
      files,
      manifest,
      events,
      (event) =>
        event.type === "dom_evidence_recorded" &&
        event.evidence_id === record.evidence_id,
      {
        schema_version: "process-audit-event.v1",
        timestamp: existing.captured_at,
        type: "dom_evidence_recorded",
        run_id: manifest.run_id,
        case_id: auditCase.id,
        evidence_id: record.evidence_id,
        reference,
        route: record.route,
      },
    );
    return { idempotent: true, evidence: existing, reference };
  } catch (error) {
    if (!(error instanceof Error) || error.code !== "ENOENT") throw error;
  }
  await writeJson(evidenceFile, record);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: record.captured_at,
    type: "dom_evidence_recorded",
    run_id: manifest.run_id,
    case_id: auditCase.id,
    evidence_id: record.evidence_id,
    reference,
    route: record.route,
  });
  return { idempotent: false, evidence: record, reference };
}

export async function recordStructuredEvidence(runDir, payload, now = new Date()) {
  assertPlainObject("structured evidence input", payload);
  assertOnlyKeys(
    "structured evidence input",
    payload,
    STRUCTURED_EVIDENCE_ALLOWED_INPUT_KEYS,
  );
  assertNonemptyString("structured evidence input.case_id", payload.case_id, 120);
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "recording structured evidence");
  const auditCase = findCase(manifest, payload.case_id);
  const record = {
    schema_version: STRUCTURED_EVIDENCE_SCHEMA_VERSION,
    evidence_id: payload.evidence_id,
    case_id: auditCase.id,
    captured_at: isoNow(now),
    stage: payload.stage,
    observation_class: payload.observation_class,
    outcome: payload.outcome,
    metric_counts: payload.metric_counts,
    state_hashes: payload.state_hashes,
    notes: payload.notes,
  };
  validateStructuredEvidenceRecord(record, auditCase.id);
  await mkdir(files.structuredEvidence, { recursive: true });
  const evidenceFile = path.join(files.structuredEvidence, `${record.evidence_id}.json`);
  const reference = `structured-evidence/${record.evidence_id}.json`;
  try {
    const existing = await readJson(evidenceFile);
    const comparableExisting = JSON.stringify({ ...existing, captured_at: undefined });
    const comparableIncoming = JSON.stringify({ ...record, captured_at: undefined });
    if (comparableExisting !== comparableIncoming) {
      throw new Error(`${record.evidence_id} already exists with different content.`);
    }
    await repairMissingEvent(
      files,
      manifest,
      events,
      (event) =>
        event.type === "structured_evidence_recorded" &&
        event.evidence_id === record.evidence_id,
      {
        schema_version: "process-audit-event.v1",
        timestamp: existing.captured_at,
        type: "structured_evidence_recorded",
        run_id: manifest.run_id,
        case_id: auditCase.id,
        evidence_id: record.evidence_id,
        reference,
        stage: record.stage,
        observation_class: record.observation_class,
        outcome: record.outcome,
      },
    );
    return { idempotent: true, evidence: existing, reference };
  } catch (error) {
    if (!(error instanceof Error) || error.code !== "ENOENT") throw error;
  }
  await writeJson(evidenceFile, record);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: record.captured_at,
    type: "structured_evidence_recorded",
    run_id: manifest.run_id,
    case_id: auditCase.id,
    evidence_id: record.evidence_id,
    reference,
    stage: record.stage,
    observation_class: record.observation_class,
    outcome: record.outcome,
  });
  return { idempotent: false, evidence: record, reference };
}

export async function recordHarnessFailureEvidence(runDir, payload, now = new Date()) {
  assertPlainObject("harness failure evidence", payload);
  assertOnlyKeys(
    "harness failure evidence",
    payload,
    new Set(["case_id", "evidence_id", "stage", "failure_class", "failure_hash"]),
  );
  for (const field of ["case_id", "evidence_id", "stage", "failure_class"]) {
    assertNonemptyString(`harness failure evidence.${field}`, payload[field], 500);
  }
  assertSha256("harness failure evidence.failure_hash", payload.failure_hash);
  if (!payload.evidence_id.startsWith(`${payload.case_id}-`)) {
    throw new Error("Harness failure evidence ID must start with its case ID.");
  }
  assertValueSafe(payload, "harness failure evidence");
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "recording audit-harness failure evidence");
  findCase(manifest, payload.case_id);
  const existing = events.find(
    (event) =>
      event.type === "audit_harness_failure_observed" &&
      event.evidence_id === payload.evidence_id,
  );
  if (existing) {
    const comparable = JSON.stringify({
      case_id: existing.case_id,
      evidence_id: existing.evidence_id,
      stage: existing.stage,
      failure_class: existing.failure_class,
      failure_hash: existing.failure_hash,
    });
    if (comparable !== JSON.stringify(payload)) {
      throw new Error(`${payload.evidence_id} already exists with different content.`);
    }
    return {
      idempotent: true,
      event: existing,
      reference: `events.jsonl#${existing.event_id}`,
    };
  }
  const event = {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: isoNow(now),
    type: "audit_harness_failure_observed",
    run_id: manifest.run_id,
    ...payload,
  };
  await appendJsonLine(files.events, event);
  return {
    idempotent: false,
    event,
    reference: `events.jsonl#${event.event_id}`,
  };
}

export async function resolveAmbiguousMutationIntent(runDir, payload, now = new Date()) {
  assertPlainObject("mutation readback", payload);
  assertOnlyKeys(
    "mutation readback",
    payload,
    new Set(["case_id", "mutation_key", "readback", "adopted_effect"]),
  );
  assertPlainObject("mutation readback.readback", payload.readback);
  assertOnlyKeys(
    "mutation readback.readback",
    payload.readback,
    new Set(["outcome", "state_hash"]),
  );
  assertEnum("mutation readback outcome", payload.readback.outcome, [
    "effect_found",
    "no_effect",
  ]);
  assertSha256("mutation readback state_hash", payload.readback.state_hash);
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "resolving an ambiguous mutation intent");
  const auditCase = findCase(manifest, payload.case_id);
  const intent = auditCase.execution.mutation_intent;
  if (!intent || intent.mutation_key !== payload.mutation_key) {
    throw new Error(`${auditCase.id} has no matching mutation intent.`);
  }
  const existingRecovery = auditCase.execution.intent_recovery ?? null;
  if (existingRecovery) {
    const comparable = JSON.stringify({
      outcome: existingRecovery.outcome,
      state_hash: existingRecovery.state_hash,
    });
    if (comparable !== JSON.stringify(payload.readback)) {
      throw new Error(`${auditCase.id} already has a different readback recovery.`);
    }
    if (existingRecovery.outcome === "effect_found") {
      const effect = auditCase.execution.effect_checkpoint;
      const existingEffect = effect
        ? {
            record_type: effect.record_type,
            record_id: effect.record_id,
            safe_alias: effect.safe_alias,
            outcome: effect.outcome,
          }
        : null;
      if (!sameJson(existingEffect, payload.adopted_effect)) {
        throw new Error(`${auditCase.id} already adopted a different readback effect.`);
      }
    }
    await repairMissingEvent(
      files,
      manifest,
      events,
      (event) =>
        event.type === "mutation_readback_observed" &&
        event.case_id === auditCase.id &&
        event.mutation_key === intent.mutation_key,
      {
        schema_version: "process-audit-event.v1",
        timestamp: existingRecovery.readback_at,
        type: "mutation_readback_observed",
        run_id: manifest.run_id,
        case_id: auditCase.id,
        mutation_key: intent.mutation_key,
        outcome: existingRecovery.outcome,
        state_hash: existingRecovery.state_hash,
      },
    );
    const recoveryType =
      existingRecovery.outcome === "effect_found"
        ? "mutation_intent_adopted"
        : "mutation_replay_authorized";
    const effect = auditCase.execution.effect_checkpoint;
    await repairMissingEvent(
      files,
      manifest,
      events,
      (event) =>
        event.type === recoveryType &&
        event.case_id === auditCase.id &&
        event.mutation_key === intent.mutation_key,
      {
        schema_version: "process-audit-event.v1",
        timestamp: existingRecovery.readback_at,
        type: recoveryType,
        run_id: manifest.run_id,
        case_id: auditCase.id,
        mutation_key: intent.mutation_key,
        state_hash: existingRecovery.state_hash,
        ...(effect
          ? {
              record_type: effect.record_type,
              record_id: effect.record_id,
              safe_alias: effect.safe_alias,
              outcome: effect.outcome,
            }
          : {}),
      },
    );
    if (existingRecovery.outcome === "effect_found") {
      if (!effect) throw new Error(`${auditCase.id} lost its adopted effect checkpoint.`);
      await repairMissingEvent(
        files,
        manifest,
        events,
        (event) =>
          event.type === "test_effect_observed" &&
          event.case_id === auditCase.id &&
          event.mutation_key === intent.mutation_key,
        {
          schema_version: "process-audit-event.v1",
          timestamp: existingRecovery.readback_at,
          type: "test_effect_observed",
          run_id: manifest.run_id,
          case_id: auditCase.id,
          mutation_key: intent.mutation_key,
          record_type: effect.record_type,
          record_id: effect.record_id,
          safe_alias: effect.safe_alias,
          outcome: effect.outcome,
          adopted_after_readback: true,
        },
      );
    }
    return {
      idempotent: true,
      outcome: existingRecovery.outcome,
      auditCase,
    };
  }
  if (auditCase.execution.effect_checkpoint) {
    return {
      idempotent: true,
      outcome: "effect_already_checkpointed",
      auditCase,
    };
  }
  requireActiveMutationReopenForTerminalCheckpoint(auditCase);
  if (payload.readback.outcome === "effect_found") {
    assertPlainObject("mutation readback.adopted_effect", payload.adopted_effect);
    for (const field of ["record_type", "record_id", "safe_alias", "outcome"]) {
      assertNonemptyString(
        `mutation readback.adopted_effect.${field}`,
        payload.adopted_effect[field],
        1_000,
      );
    }
    if (payload.adopted_effect.safe_alias !== intent.safe_alias) {
      throw new Error("Adopted effect alias does not match the mutation intent.");
    }
  } else if (payload.adopted_effect != null) {
    throw new Error("adopted_effect is only valid when readback found an effect.");
  }
  const readbackAt = isoNow(now);
  const readbackEvent = {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: readbackAt,
    type: "mutation_readback_observed",
    run_id: manifest.run_id,
    case_id: auditCase.id,
    mutation_key: intent.mutation_key,
    outcome: payload.readback.outcome,
    state_hash: payload.readback.state_hash,
  };
  const recoveryType =
    payload.readback.outcome === "effect_found"
      ? "mutation_intent_adopted"
      : "mutation_replay_authorized";
  const recoveryEventId = `${manifest.run_id}:${String(events.length + 2).padStart(6, "0")}`;
  auditCase.execution.intent_recovery = {
    outcome: payload.readback.outcome,
    state_hash: payload.readback.state_hash,
    readback_at: readbackAt,
    readback_event_id: readbackEvent.event_id,
    recovery_event_id: recoveryEventId,
  };
  if (payload.readback.outcome === "effect_found") {
    auditCase.execution.effect_checkpoint = {
      case_id: auditCase.id,
      mutation_key: intent.mutation_key,
      ...payload.adopted_effect,
      observed_at: readbackAt,
      adopted_after_readback: true,
    };
    manifest.test_record_registry.push({
      audit_run_id: manifest.run_id,
      case_id: auditCase.id,
      mutation_key: intent.mutation_key,
      ...payload.adopted_effect,
      observed_at: readbackAt,
      adopted_after_readback: true,
    });
  }
  manifest.updated_at = readbackAt;
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, readbackEvent);
  const recoveryEvent = {
    schema_version: "process-audit-event.v1",
    event_id: recoveryEventId,
    timestamp: readbackAt,
    type: recoveryType,
    run_id: manifest.run_id,
    case_id: auditCase.id,
    mutation_key: intent.mutation_key,
    state_hash: payload.readback.state_hash,
    ...(payload.adopted_effect ?? {}),
  };
  await appendJsonLine(files.events, recoveryEvent);
  if (payload.readback.outcome === "effect_found") {
    await appendJsonLine(files.events, {
      schema_version: "process-audit-event.v1",
      event_id: `${manifest.run_id}:${String(events.length + 3).padStart(6, "0")}`,
      timestamp: readbackAt,
      type: "test_effect_observed",
      run_id: manifest.run_id,
      case_id: auditCase.id,
      mutation_key: intent.mutation_key,
      ...payload.adopted_effect,
      adopted_after_readback: true,
    });
  }
  return {
    idempotent: false,
    outcome: payload.readback.outcome,
    auditCase,
  };
}

export async function recordReversibleEffectCheckpoint(
  runDir,
  payload,
  now = new Date(),
) {
  assertPlainObject("reversible effect", payload);
  assertOnlyKeys(
    "reversible effect",
    payload,
    new Set([
      "case_id",
      "mutation_key",
      "before_hash",
      "change_hash",
      "restore_hash",
      "restore_outcome",
    ]),
  );
  for (const field of ["before_hash", "change_hash", "restore_hash"]) {
    assertSha256(`reversible effect.${field}`, payload[field]);
  }
  assertEnum("reversible effect.restore_outcome", payload.restore_outcome, [
    "restored",
    "restore_failed",
  ]);
  if (payload.before_hash === payload.change_hash) {
    throw new Error("Reversible effect change_hash must differ from before_hash.");
  }
  if (
    payload.restore_outcome === "restored" &&
    payload.restore_hash !== payload.before_hash
  ) {
    throw new Error("A restored reversible effect must match the before_hash.");
  }
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "recording reversible-effect verification");
  const auditCase = findCase(manifest, payload.case_id);
  if (auditCase.mutation_kind !== "reversible_app_write") {
    throw new Error(`${auditCase.id} is not a reversible_app_write case.`);
  }
  if (auditCase.execution.effect_checkpoint?.mutation_key !== payload.mutation_key) {
    throw new Error(`${auditCase.id} has no matching effect checkpoint.`);
  }
  const existing = auditCase.execution.reversible_effect_checkpoint;
  if (existing) {
    const comparableExisting = JSON.stringify({ ...existing, verified_at: undefined });
    const comparableIncoming = JSON.stringify({ ...payload, verified_at: undefined });
    if (comparableExisting !== comparableIncoming) {
      throw new Error(`${auditCase.id} already has different reversible evidence.`);
    }
    await repairMissingEvent(
      files,
      manifest,
      events,
      (event) =>
        event.type === "reversible_effect_verified" &&
        event.case_id === auditCase.id &&
        event.mutation_key === existing.mutation_key,
      {
        schema_version: "process-audit-event.v1",
        timestamp: existing.verified_at,
        type: "reversible_effect_verified",
        run_id: manifest.run_id,
        case_id: auditCase.id,
        mutation_key: existing.mutation_key,
        before_hash: existing.before_hash,
        change_hash: existing.change_hash,
        restore_hash: existing.restore_hash,
        restore_outcome: existing.restore_outcome,
      },
    );
    return { idempotent: true, auditCase };
  }
  if (auditCase.execution.status === "blocked") {
    requireActiveMutationReopenForTerminalCheckpoint(auditCase);
  }
  auditCase.execution.reversible_effect_checkpoint = {
    ...payload,
    verified_at: isoNow(now),
  };
  manifest.updated_at = isoNow(now);
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: isoNow(now),
    type: "reversible_effect_verified",
    run_id: manifest.run_id,
    ...payload,
  });
  return { idempotent: false, auditCase };
}

export async function withBoundedTransientRetries({
  runDir,
  caseId,
  operationId,
  maxAttempts = 3,
  operation,
  classifyTransient,
  now = () => new Date(),
}) {
  assertNonemptyString("retry caseId", caseId, 120);
  assertNonemptyString("retry operationId", operationId, 240);
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new Error("maxAttempts must be an integer from 1 through 5.");
  }
  if (typeof operation !== "function" || typeof classifyTransient !== "function") {
    throw new Error("operation and classifyTransient must be functions.");
  }
  const files = runFiles(runDir);
  const initialManifest = await readJson(files.manifest);
  assertRunRunning(initialManifest, "running a transient retry operation");
  findCase(initialManifest, caseId);
  let existingEvents = await readJsonLines(files.events);
  const priorAttemptEvents = existingEvents.filter(
    (event) => event.case_id === caseId && event.operation_id === operationId,
  );
  if (
    priorAttemptEvents.some(
      (event) =>
        event.max_attempts !== maxAttempts ||
        !event.type.startsWith("transient_attempt_"),
    )
  ) {
    throw new Error(`${operationId} already exists with a different retry contract.`);
  }
  if (priorAttemptEvents.some((event) => event.type === "transient_attempt_succeeded")) {
    throw new Error(
      `${operationId} already succeeded; recover its persisted outcome instead of replaying.`,
    );
  }
  const priorFailure = [...priorAttemptEvents]
    .reverse()
    .find((event) => event.type === "transient_attempt_failed");
  if (priorFailure?.transient === false) {
    throw new Error(`${operationId} already ended with a non-transient failure.`);
  }
  const starts = priorAttemptEvents.filter(
    (event) => event.type === "transient_attempt_started",
  );
  const outcomes = priorAttemptEvents.filter((event) =>
    ["transient_attempt_failed", "transient_attempt_succeeded"].includes(event.type),
  );
  const interrupted = starts.find(
    (start) => !outcomes.some((outcome) => outcome.attempt === start.attempt),
  );
  if (interrupted) {
    await appendJsonLine(files.events, {
      schema_version: "process-audit-event.v1",
      event_id: nextEventId(initialManifest, existingEvents),
      timestamp: isoNow(now()),
      type: "transient_attempt_failed",
      run_id: initialManifest.run_id,
      case_id: caseId,
      operation_id: operationId,
      attempt: interrupted.attempt,
      max_attempts: maxAttempts,
      transient: true,
      interrupted_during_resume: true,
      error_hash: sha256("interrupted transient attempt recovered during resume"),
    });
    existingEvents = await readJsonLines(files.events);
  }
  const completedAttempts = existingEvents.filter(
    (event) =>
      event.case_id === caseId &&
      event.operation_id === operationId &&
      event.type === "transient_attempt_failed",
  ).length;
  for (let attempt = completedAttempts + 1; attempt <= maxAttempts; attempt += 1) {
    const [manifest, events] = await Promise.all([
      readJson(files.manifest),
      readJsonLines(files.events),
    ]);
    assertRunRunning(manifest, "running a transient retry operation");
    findCase(manifest, caseId);
    await appendJsonLine(files.events, {
      schema_version: "process-audit-event.v1",
      event_id: nextEventId(manifest, events),
      timestamp: isoNow(now()),
      type: "transient_attempt_started",
      run_id: manifest.run_id,
      case_id: caseId,
      operation_id: operationId,
      attempt,
      max_attempts: maxAttempts,
    });
    try {
      const value = await operation({ attempt, maxAttempts });
      const refreshedEvents = await readJsonLines(files.events);
      await appendJsonLine(files.events, {
        schema_version: "process-audit-event.v1",
        event_id: nextEventId(manifest, refreshedEvents),
        timestamp: isoNow(now()),
        type: "transient_attempt_succeeded",
        run_id: manifest.run_id,
        case_id: caseId,
        operation_id: operationId,
        attempt,
        max_attempts: maxAttempts,
      });
      return value;
    } catch (error) {
      const transient = classifyTransient(error) === true;
      const refreshedEvents = await readJsonLines(files.events);
      await appendJsonLine(files.events, {
        schema_version: "process-audit-event.v1",
        event_id: nextEventId(manifest, refreshedEvents),
        timestamp: isoNow(now()),
        type: "transient_attempt_failed",
        run_id: manifest.run_id,
        case_id: caseId,
        operation_id: operationId,
        attempt,
        max_attempts: maxAttempts,
        transient,
        error_hash: sha256(error instanceof Error ? error.message : String(error)),
      });
      if (!transient || attempt === maxAttempts) throw error;
    }
  }
  throw new Error("Bounded retry loop exhausted unexpectedly.");
}

export async function checkpointMutationIntent(runDir, payload, now = new Date()) {
  assertPlainObject("mutation intent", payload);
  assertOnlyKeys(
    "mutation intent",
    payload,
    new Set(["case_id", "mutation_key", "safe_alias", "planned_effect"]),
  );
  for (const field of ["case_id", "mutation_key", "safe_alias", "planned_effect"]) {
    assertNonemptyString(`mutation intent.${field}`, payload[field], 1_000);
  }
  assertValueSafe(payload, "mutation intent");
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "checkpointing a mutation intent");
  const auditCase = findCase(manifest, payload.case_id);
  if (auditCase.mutation_kind === "read")
    throw new Error(`${auditCase.id} is read-only and needs no mutation intent.`);
  if (!payload.mutation_key.includes(manifest.run_id)) {
    throw new Error(`${auditCase.id} mutation_key must include the audit run ID.`);
  }
  const existing = auditCase.execution.mutation_intent;
  if (existing) {
    const comparableExisting = JSON.stringify({
      case_id: auditCase.id,
      mutation_key: existing.mutation_key,
      safe_alias: existing.safe_alias,
      planned_effect: existing.planned_effect,
    });
    if (comparableExisting !== JSON.stringify(payload)) {
      throw new Error(`${auditCase.id} already has a different mutation intent.`);
    }
    await repairMissingEvent(
      files,
      manifest,
      events,
      (event) =>
        event.type === "mutation_intent_checkpointed" &&
        event.case_id === auditCase.id &&
        event.mutation_key === existing.mutation_key,
      {
        schema_version: "process-audit-event.v1",
        timestamp: existing.checkpointed_at,
        type: "mutation_intent_checkpointed",
        run_id: manifest.run_id,
        case_id: auditCase.id,
        mutation_key: existing.mutation_key,
        safe_alias: existing.safe_alias,
        planned_effect: existing.planned_effect,
      },
    );
    return { idempotent: true, auditCase };
  }
  const registeredCaseId = manifest.effect_registry[payload.mutation_key];
  if (registeredCaseId && registeredCaseId !== auditCase.id) {
    throw new Error(
      `Mutation key ${payload.mutation_key} is already registered to ${registeredCaseId}.`,
    );
  }
  const terminalAuthorization =
    requireActiveMutationReopenForTerminalCheckpoint(auditCase);
  if (!terminalAuthorization) {
    auditCase.execution.status = "in_progress";
  }
  auditCase.execution.attempt_count += 1;
  auditCase.execution.mutation_intent = {
    ...payload,
    checkpointed_at: isoNow(now),
  };
  manifest.effect_registry[payload.mutation_key] = auditCase.id;
  manifest.updated_at = isoNow(now);
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: isoNow(now),
    type: "mutation_intent_checkpointed",
    run_id: manifest.run_id,
    case_id: auditCase.id,
    mutation_key: payload.mutation_key,
    safe_alias: payload.safe_alias,
    planned_effect: payload.planned_effect,
  });
  return { idempotent: false, auditCase };
}

export async function recordTestEffect(runDir, payload, now = new Date()) {
  assertPlainObject("effect checkpoint", payload);
  assertOnlyKeys(
    "effect checkpoint",
    payload,
    new Set([
      "case_id",
      "mutation_key",
      "record_type",
      "record_id",
      "safe_alias",
      "outcome",
    ]),
  );
  for (const field of [
    "case_id",
    "mutation_key",
    "record_type",
    "record_id",
    "safe_alias",
    "outcome",
  ]) {
    assertNonemptyString(`effect checkpoint.${field}`, payload[field], 1_000);
  }
  assertValueSafe(payload, "effect checkpoint");
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "recording a Test effect");
  const auditCase = findCase(manifest, payload.case_id);
  const intent = auditCase.execution.mutation_intent;
  if (!intent || intent.mutation_key !== payload.mutation_key) {
    throw new Error(`${auditCase.id} has no matching mutation intent checkpoint.`);
  }
  if (intent.safe_alias !== payload.safe_alias) {
    throw new Error(
      `${auditCase.id} effect safe_alias does not match its mutation intent.`,
    );
  }
  const existing = auditCase.execution.effect_checkpoint;
  if (existing) {
    const comparableExisting = JSON.stringify({ ...existing, observed_at: undefined });
    const comparableIncoming = JSON.stringify({ ...payload, observed_at: undefined });
    if (comparableExisting === comparableIncoming) {
      await repairMissingEvent(
        files,
        manifest,
        events,
        (event) =>
          event.type === "test_effect_observed" &&
          event.case_id === auditCase.id &&
          event.mutation_key === existing.mutation_key,
        {
          schema_version: "process-audit-event.v1",
          timestamp: existing.observed_at,
          type: "test_effect_observed",
          run_id: manifest.run_id,
          case_id: auditCase.id,
          mutation_key: existing.mutation_key,
          record_type: existing.record_type,
          record_id: existing.record_id,
          safe_alias: existing.safe_alias,
          outcome: existing.outcome,
        },
      );
      return { idempotent: true, auditCase };
    }
    throw new Error(`${auditCase.id} already has a different effect checkpoint.`);
  }
  requireActiveMutationReopenForTerminalCheckpoint(auditCase);
  auditCase.execution.effect_checkpoint = {
    ...payload,
    observed_at: isoNow(now),
  };
  if (
    !manifest.test_record_registry.some(
      (entry) => entry.mutation_key === payload.mutation_key,
    )
  ) {
    manifest.test_record_registry.push({
      audit_run_id: manifest.run_id,
      case_id: auditCase.id,
      mutation_key: payload.mutation_key,
      record_type: payload.record_type,
      record_id: payload.record_id,
      safe_alias: payload.safe_alias,
      outcome: payload.outcome,
      observed_at: isoNow(now),
    });
  }
  manifest.updated_at = isoNow(now);
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: isoNow(now),
    type: "test_effect_observed",
    run_id: manifest.run_id,
    case_id: auditCase.id,
    mutation_key: payload.mutation_key,
    record_type: payload.record_type,
    record_id: payload.record_id,
    safe_alias: payload.safe_alias,
    outcome: payload.outcome,
  });
  return { idempotent: false, auditCase };
}

function normalizeCaseResult(auditCase, payload, now) {
  assertPlainObject("case result", payload);
  assertEnum(
    "current_behavior_result",
    payload.current_behavior_result,
    CURRENT_BEHAVIOR_RESULTS,
  );
  assertEnum(
    "process_alignment_result",
    payload.process_alignment_result,
    PROCESS_ALIGNMENT_RESULTS,
  );
  assertPlainObject("actual", payload.actual);
  assertOnlyKeys("actual", payload.actual, new Set(REQUIRED_ACTUAL_FIELDS));
  assertEnum("clean_retry", payload.clean_retry ?? "not_retried", CLEAN_RETRY_RESULTS);
  for (const field of REQUIRED_ACTUAL_FIELDS) {
    assertNonemptyString(`actual.${field}`, payload.actual[field], 2_000);
  }
  if (payload.actual.data_mode !== auditCase.data_mode) {
    throw new Error(
      `actual.data_mode must match ${auditCase.id} data_mode ${auditCase.data_mode}.`,
    );
  }
  validateConsoleErrors(payload.console_errors ?? []);
  validateEvidenceReferences(auditCase, payload.evidence_references ?? []);
  if (payload.blocker != null) {
    assertPlainObject("case result blocker", payload.blocker);
    assertOnlyKeys(
      "case result blocker",
      payload.blocker,
      new Set(["description", "unblock_action"]),
    );
    assertNonemptyString("case result blocker.description", payload.blocker.description);
    assertNonemptyString(
      "case result blocker.unblock_action",
      payload.blocker.unblock_action,
    );
  }
  if (
    auditCase.mutation_kind !== "read" &&
    !auditCase.execution.mutation_intent &&
    !["blocked", "not_reachable"].includes(payload.current_behavior_result)
  ) {
    throw new Error(
      `${auditCase.id} cannot complete a mutation case without a prior intent checkpoint.`,
    );
  }
  if (
    auditCase.mutation_kind !== "read" &&
    !auditCase.execution.effect_checkpoint &&
    !["blocked", "not_reachable"].includes(payload.current_behavior_result)
  ) {
    throw new Error(
      `${auditCase.id} cannot complete a mutation case without an effect checkpoint.`,
    );
  }
  const terminalStatus =
    payload.current_behavior_result === "blocked" ? "blocked" : "completed";
  const result = {
    completed_at: isoNow(now),
    actual: payload.actual,
    current_behavior_result: payload.current_behavior_result,
    process_alignment_result: payload.process_alignment_result,
    evidence_references: payload.evidence_references ?? [],
    console_errors: payload.console_errors ?? [],
    clean_retry: payload.clean_retry ?? "not_retried",
    blocker: payload.blocker ?? null,
  };
  assertValueSafe(result, `case result ${auditCase.id}`);
  return { terminalStatus, result };
}

function assertDependenciesPermitResult(manifest, auditCase, currentResult) {
  if (["blocked", "not_reachable"].includes(currentResult)) return;
  const incompleteDependencies = auditCase.depends_on.filter((dependencyId) => {
    const dependency = findCase(manifest, dependencyId);
    return dependency.execution.status !== "completed";
  });
  if (incompleteDependencies.length > 0) {
    throw new Error(
      `${auditCase.id} has incomplete dependencies: ${incompleteDependencies.join(", ")}.`,
    );
  }
}

function assertAllCurrentDependencyInvariants(manifest) {
  for (const auditCase of manifest.case_inventory) {
    if (!auditCase.execution.result) continue;
    assertDependenciesPermitResult(
      manifest,
      auditCase,
      auditCase.execution.result.current_behavior_result,
    );
  }
}

export async function recordCaseResult(runDir, payload, now = new Date()) {
  assertNonemptyString("case_id", payload?.case_id, 120);
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "recording a case result");
  const auditCase = findCase(manifest, payload.case_id);
  assertDependenciesPermitResult(manifest, auditCase, payload.current_behavior_result);
  const { terminalStatus, result } = normalizeCaseResult(auditCase, payload, now);
  if (["completed", "blocked"].includes(auditCase.execution.status)) {
    const comparableExisting = JSON.stringify({
      ...auditCase.execution.result,
      completed_at: undefined,
    });
    const comparableIncoming = JSON.stringify({ ...result, completed_at: undefined });
    if (comparableExisting === comparableIncoming) {
      const lastAmendment = auditCase.execution.last_result_amendment;
      if (lastAmendment) {
        await repairMissingEvent(
          files,
          manifest,
          events,
          (event) =>
            event.type === "case_result_amended" &&
            event.amendment_id === lastAmendment.amendment_id,
          {
            schema_version: "process-audit-event.v1",
            timestamp: lastAmendment.amended_at,
            type: "case_result_amended",
            run_id: manifest.run_id,
            ...lastAmendment,
          },
        );
        return { idempotent: true, auditCase };
      }
      const eventType =
        auditCase.execution.status === "blocked" ? "case_blocked" : "case_completed";
      await repairMissingEvent(
        files,
        manifest,
        events,
        (event) => event.type === eventType && event.case_id === auditCase.id,
        {
          schema_version: "process-audit-event.v1",
          timestamp: auditCase.execution.result.completed_at,
          type: eventType,
          run_id: manifest.run_id,
          case_id: auditCase.id,
          current_behavior_result: auditCase.execution.result.current_behavior_result,
          process_alignment_result: auditCase.execution.result.process_alignment_result,
          evidence_references: auditCase.execution.result.evidence_references,
        },
      );
      return { idempotent: true, auditCase };
    }
    throw new Error(`${auditCase.id} already has a different terminal result.`);
  }
  auditCase.execution.status = terminalStatus;
  if (auditCase.execution.attempt_count === 0) auditCase.execution.attempt_count = 1;
  auditCase.execution.result = result;
  manifest.updated_at = isoNow(now);
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: isoNow(now),
    type: terminalStatus === "blocked" ? "case_blocked" : "case_completed",
    run_id: manifest.run_id,
    case_id: auditCase.id,
    status: terminalStatus,
    result,
    current_behavior_result: result.current_behavior_result,
    process_alignment_result: result.process_alignment_result,
    evidence_references: result.evidence_references,
  });
  return { idempotent: false, auditCase };
}

export async function amendCaseResult(runDir, payload, now = new Date()) {
  assertPlainObject("case result amendment", payload);
  assertNonemptyString("case result amendment.case_id", payload.case_id, 120);
  assertNonemptyString("case result amendment.reason", payload.reason, 2_000);
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "amending a terminal case result");
  const auditCase = findCase(manifest, payload.case_id);
  if (!auditCase.execution.result) {
    throw new Error(`${auditCase.id} has no terminal result to amend.`);
  }
  const activeMutationReopen = activeMutationReopenAuthorization(auditCase);
  if (
    activeMutationReopen &&
    (auditCase.execution.status !== "blocked" ||
      auditCase.execution.result.current_behavior_result !== "blocked")
  ) {
    throw new Error(
      `${auditCase.id} active reopen-case authorization has no blocked result to supersede.`,
    );
  }
  assertDependenciesPermitResult(manifest, auditCase, payload.current_behavior_result);
  const { terminalStatus, result } = normalizeCaseResult(auditCase, payload, now);
  const comparableExisting = JSON.stringify({
    status: auditCase.execution.status,
    result: { ...auditCase.execution.result, completed_at: undefined },
  });
  const comparableIncoming = JSON.stringify({
    status: terminalStatus,
    result: { ...result, completed_at: undefined },
  });
  if (comparableExisting === comparableIncoming && !activeMutationReopen) {
    const last = auditCase.execution.last_result_amendment;
    if (last) {
      await repairMissingEvent(
        files,
        manifest,
        events,
        (event) =>
          event.type === "case_result_amended" &&
          event.amendment_id === last.amendment_id,
        {
          schema_version: "process-audit-event.v1",
          timestamp: last.amended_at,
          type: "case_result_amended",
          run_id: manifest.run_id,
          ...last,
        },
      );
    }
    return { idempotent: true, auditCase };
  }
  const previousStatus = auditCase.execution.status;
  const previousResult = auditCase.execution.result;
  const amendmentNumber = (auditCase.execution.result_amendment_count ?? 0) + 1;
  const amendment = {
    amendment_id: `${manifest.run_id}:${auditCase.id}:result:${String(amendmentNumber).padStart(4, "0")}`,
    case_id: auditCase.id,
    amended_at: isoNow(now),
    reason: payload.reason,
    previous_status: previousStatus,
    previous_result: previousResult,
    status: terminalStatus,
    result,
    ...(activeMutationReopen
      ? {
          mutation_reopen_authorization_id: activeMutationReopen.authorization_id,
        }
      : {}),
  };
  auditCase.execution.status = terminalStatus;
  auditCase.execution.result = result;
  auditCase.execution.result_amendment_count = amendmentNumber;
  auditCase.execution.last_result_amendment = amendment;
  if (activeMutationReopen) {
    auditCase.execution.active_mutation_reopen_authorization_id = null;
  }
  assertAllCurrentDependencyInvariants(manifest);
  manifest.updated_at = amendment.amended_at;
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: amendment.amended_at,
    type: "case_result_amended",
    run_id: manifest.run_id,
    ...amendment,
  });
  return { idempotent: false, auditCase };
}

const CASE_DEFINITION_AMENDABLE_FIELDS = new Set([
  "title",
  "route",
  "guide_refs",
  "reviewer_refs",
  "expected",
  "screenshot_safe",
  "role",
  "data_mode",
  "mutation_kind",
  "safe_alias",
]);

function authorityRankOrThrow(kind, value, ranks) {
  if (!ranks.has(value)) {
    throw new Error(`Cannot prove ${kind} authority is not broadened for ${value}.`);
  }
  return ranks.get(value);
}

export async function amendCaseDefinition(runDir, payload, now = new Date()) {
  assertPlainObject("case definition amendment", payload);
  assertOnlyKeys(
    "case definition amendment",
    payload,
    new Set(["case_id", "reason", "changes", "authority_basis"]),
  );
  assertNonemptyString("case definition amendment.case_id", payload.case_id, 120);
  assertNonemptyString("case definition amendment.reason", payload.reason, 2_000);
  assertPlainObject("case definition amendment.changes", payload.changes);
  assertOnlyKeys(
    "case definition amendment.changes",
    payload.changes,
    CASE_DEFINITION_AMENDABLE_FIELDS,
  );
  if (Object.keys(payload.changes).length === 0) {
    throw new Error("case definition amendment.changes cannot be empty.");
  }
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "amending case-definition metadata");
  const auditCase = findCase(manifest, payload.case_id);
  if (payload.changes.role && payload.changes.role !== auditCase.role) {
    assertNonemptyString(
      "case definition amendment.authority_basis",
      payload.authority_basis,
      2_000,
    );
    const before = authorityRankOrThrow("role", auditCase.role, ROLE_AUTHORITY_RANK);
    const after = authorityRankOrThrow("role", payload.changes.role, ROLE_AUTHORITY_RANK);
    if (after > before) throw new Error("Case role amendment would broaden authority.");
  }
  if (payload.changes.data_mode && payload.changes.data_mode !== auditCase.data_mode) {
    assertNonemptyString(
      "case definition amendment.authority_basis",
      payload.authority_basis,
      2_000,
    );
    const before = authorityRankOrThrow("mode", auditCase.data_mode, MODE_AUTHORITY_RANK);
    const after = authorityRankOrThrow(
      "mode",
      payload.changes.data_mode,
      MODE_AUTHORITY_RANK,
    );
    if (after > before)
      throw new Error("Case data-mode amendment would broaden authority.");
  }
  const mutationKindChanges =
    payload.changes.mutation_kind != null &&
    payload.changes.mutation_kind !== auditCase.mutation_kind;
  if (
    Object.hasOwn(payload.changes, "safe_alias") &&
    payload.changes.safe_alias !== auditCase.safe_alias &&
    !mutationKindChanges
  ) {
    throw new Error("safe_alias may only change with mutation_kind.");
  }
  if (mutationKindChanges) {
    assertNonemptyString(
      "case definition amendment.authority_basis",
      payload.authority_basis,
      2_000,
    );
    assertEnum(
      "case definition amendment.changes.mutation_kind",
      payload.changes.mutation_kind,
      MUTATION_KINDS,
    );
    const targetMutationKind = payload.changes.mutation_kind;
    const targetSafeAlias = Object.hasOwn(payload.changes, "safe_alias")
      ? payload.changes.safe_alias
      : auditCase.safe_alias;
    if (targetMutationKind !== "read") {
      assertNonemptyString(
        "case definition amendment target safe_alias",
        targetSafeAlias,
        1_000,
      );
    }
    const terminalResult = auditCase.execution.result;
    if (
      auditCase.mutation_kind === "read" &&
      targetMutationKind !== "read" &&
      terminalResult &&
      !["blocked", "not_reachable"].includes(terminalResult.current_behavior_result) &&
      (!auditCase.execution.mutation_intent || !auditCase.execution.effect_checkpoint)
    ) {
      throw new Error(
        `${auditCase.id} cannot change from read to ${targetMutationKind} after a nonblocked terminal result without existing intent and effect checkpoints.`,
      );
    }
  }
  const currentMatches = Object.entries(payload.changes).every(
    ([field, value]) => JSON.stringify(auditCase[field]) === JSON.stringify(value),
  );
  if (currentMatches) {
    const last = (manifest.case_definition_amendments ?? [])
      .filter((amendment) => amendment.case_id === auditCase.id)
      .at(-1);
    if (last) {
      await repairMissingEvent(
        files,
        manifest,
        events,
        (event) =>
          event.type === "case_definition_amended" &&
          event.amendment_id === last.amendment_id,
        {
          schema_version: "process-audit-event.v1",
          timestamp: last.amended_at,
          type: "case_definition_amended",
          run_id: manifest.run_id,
          ...last,
        },
      );
    }
    return { idempotent: true, auditCase };
  }
  const changedFields = Object.entries(payload.changes)
    .filter(
      ([field, value]) => JSON.stringify(auditCase[field]) !== JSON.stringify(value),
    )
    .map(([field]) => field);
  const previousDefinition = caseDefinitionsFromManifest({
    case_inventory: [auditCase],
  })[0];
  for (const [field, value] of Object.entries(payload.changes)) {
    auditCase[field] = value;
  }
  const definitions = caseDefinitionsFromManifest(manifest);
  validateCaseDefinitions(definitions);
  validateDeclaredRoleModeCoverage(manifest.roles, manifest.modes, definitions);
  validateTraceabilityInventories(
    manifest.guide_section_ids,
    manifest.reviewer_checklist_ids,
    [caseDefinitionsFromManifest({ case_inventory: [auditCase] })[0]],
  );
  manifest.guide_traceability = buildGuideTraceability(definitions);
  manifest.case_definition_amendments ??= [];
  const amendmentNumber = manifest.case_definition_amendments.length + 1;
  const amendment = {
    amendment_id: `${manifest.run_id}:definition:${String(amendmentNumber).padStart(4, "0")}`,
    case_id: auditCase.id,
    amended_at: isoNow(now),
    reason: payload.reason,
    authority_basis: payload.authority_basis ?? null,
    changed_fields: changedFields,
    previous_definition: previousDefinition,
    definition: caseDefinitionsFromManifest({ case_inventory: [auditCase] })[0],
  };
  manifest.case_definition_amendments.push(amendment);
  manifest.updated_at = amendment.amended_at;
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: amendment.amended_at,
    type: "case_definition_amended",
    run_id: manifest.run_id,
    ...amendment,
  });
  return { idempotent: false, auditCase };
}

export async function amendCaseEvidenceReferences(runDir, payload, now = new Date()) {
  assertPlainObject("case evidence amendment", payload);
  assertNonemptyString("case evidence amendment.case_id", payload.case_id, 120);
  const files = runFiles(runDir);
  const [manifest, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "amending case evidence");
  const auditCase = findCase(manifest, payload.case_id);
  if (!auditCase.execution.result) {
    throw new Error(`${auditCase.id} has no terminal result to amend.`);
  }
  validateEvidenceReferences(auditCase, payload.evidence_references);
  const resultEvents = events.filter(
    (event) =>
      ["case_blocked", "case_completed"].includes(event.type) &&
      event.case_id === auditCase.id,
  );
  if (resultEvents.length !== 1) {
    throw new Error(`${auditCase.id} has no terminal result event to amend.`);
  }
  const evidenceStateEvents = events.filter(
    (event) =>
      event.case_id === auditCase.id &&
      [
        "case_blocked",
        "case_completed",
        "case_result_amended",
        "case_evidence_amended",
      ].includes(event.type),
  );
  const latestStateEvent = evidenceStateEvents.at(-1);
  const latestReferences =
    latestStateEvent.type === "case_result_amended"
      ? latestStateEvent.result.evidence_references
      : latestStateEvent.evidence_references;
  const incomingReferences = payload.evidence_references;
  const manifestMatches =
    JSON.stringify(auditCase.execution.result.evidence_references) ===
    JSON.stringify(incomingReferences);
  const eventMatches =
    JSON.stringify(latestReferences) === JSON.stringify(incomingReferences);
  if (manifestMatches && eventMatches) {
    return { idempotent: true, auditCase };
  }
  auditCase.execution.result.evidence_references = incomingReferences;
  manifest.updated_at = isoNow(now);
  await writeJson(files.manifest, manifest);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: isoNow(now),
    type: "case_evidence_amended",
    run_id: manifest.run_id,
    case_id: auditCase.id,
    evidence_references: incomingReferences,
  });
  return { idempotent: false, auditCase };
}

export async function amendCaseRetryMetadata(runDir, payload, now = new Date()) {
  assertPlainObject("case retry amendment", payload);
  assertNonemptyString("case retry amendment.case_id", payload.case_id, 120);
  assertEnum(
    "case retry amendment.clean_retry",
    payload.clean_retry,
    CLEAN_RETRY_RESULTS,
  );
  if (typeof payload.reproduced_after_clean_retry !== "boolean") {
    throw new Error(
      "case retry amendment.reproduced_after_clean_retry must be a boolean.",
    );
  }
  const files = runFiles(runDir);
  const [manifest, events, findings] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
    readJsonLines(files.findings),
  ]);
  assertRunRunning(manifest, "amending retry metadata");
  const auditCase = findCase(manifest, payload.case_id);
  if (!auditCase.execution.result) {
    throw new Error(`${auditCase.id} has no terminal result to amend.`);
  }
  const caseFindings = findings.filter((finding) => finding.case_id === auditCase.id);
  if (caseFindings.length === 0) {
    throw new Error(`${auditCase.id} has no finding retry metadata to amend.`);
  }
  const manifestMatches = auditCase.execution.result.clean_retry === payload.clean_retry;
  const findingsMatch = caseFindings.every(
    (finding) =>
      finding.reproduced_after_clean_retry === payload.reproduced_after_clean_retry,
  );
  if (manifestMatches && findingsMatch) {
    const matchingEvent = events.find(
      (event) =>
        event.type === "case_retry_metadata_amended" &&
        event.case_id === auditCase.id &&
        event.clean_retry === payload.clean_retry &&
        event.reproduced_after_clean_retry === payload.reproduced_after_clean_retry,
    );
    if (!matchingEvent) {
      await appendJsonLine(files.events, {
        schema_version: "process-audit-event.v1",
        event_id: nextEventId(manifest, events),
        timestamp: isoNow(now),
        type: "case_retry_metadata_amended",
        run_id: manifest.run_id,
        case_id: auditCase.id,
        clean_retry: payload.clean_retry,
        reproduced_after_clean_retry: payload.reproduced_after_clean_retry,
        recovered_during_resume: true,
      });
    }
    return { idempotent: true, auditCase };
  }
  auditCase.execution.result.clean_retry = payload.clean_retry;
  manifest.updated_at = isoNow(now);
  for (const finding of caseFindings) {
    finding.reproduced_after_clean_retry = payload.reproduced_after_clean_retry;
  }
  await writeJson(files.manifest, manifest);
  await writeJsonLines(files.findings, findings);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: isoNow(now),
    type: "case_retry_metadata_amended",
    run_id: manifest.run_id,
    case_id: auditCase.id,
    clean_retry: payload.clean_retry,
    reproduced_after_clean_retry: payload.reproduced_after_clean_retry,
  });
  return { idempotent: false, auditCase };
}

function normalizeFinding(auditCase, payload, now) {
  assertPlainObject("finding", payload);
  for (const field of REQUIRED_FINDING_FIELDS) {
    if (!(field in payload)) throw new Error(`finding.${field} is required.`);
  }
  assertEnum(
    "finding.current_behavior_result",
    payload.current_behavior_result,
    CURRENT_BEHAVIOR_RESULTS,
  );
  assertEnum(
    "finding.process_alignment_result",
    payload.process_alignment_result,
    PROCESS_ALIGNMENT_RESULTS,
  );
  assertEnum("finding.severity", payload.severity, FINDING_SEVERITIES);
  assertEnum("finding.finding_class", payload.finding_class, FINDING_CLASSES);
  assertEnum("finding.finding_origin", payload.finding_origin, FINDING_ORIGINS);
  assertNonemptyString("finding.finding_id", payload.finding_id, 160);
  if (
    !Array.isArray(payload.reproduction_steps) ||
    payload.reproduction_steps.length === 0
  ) {
    throw new Error("finding.reproduction_steps must be a non-empty array.");
  }
  for (const field of [
    "expected_behavior",
    "actual_behavior",
    "observable_impact",
    "recommended_correction_or_investigation",
  ]) {
    assertNonemptyString(`finding.${field}`, payload[field], 4_000);
  }
  for (const step of payload.reproduction_steps) {
    assertNonemptyString("finding.reproduction_steps item", step, 2_000);
  }
  if (typeof payload.reproduced_after_clean_retry !== "boolean") {
    throw new Error("finding.reproduced_after_clean_retry must be a boolean.");
  }
  validateEvidenceReferences(auditCase, payload.evidence_references);
  if (payload.blocker != null) {
    assertPlainObject("finding.blocker", payload.blocker);
    assertOnlyKeys(
      "finding.blocker",
      payload.blocker,
      new Set(["description", "unblock_action"]),
    );
    assertNonemptyString("finding.blocker.description", payload.blocker.description);
    assertNonemptyString(
      "finding.blocker.unblock_action",
      payload.blocker.unblock_action,
    );
  }
  const finding = {
    schema_version: "process-audit-finding.v1",
    finding_id: payload.finding_id,
    case_id: auditCase.id,
    timestamp: isoNow(now),
    surface: auditCase.surface,
    route: auditCase.route,
    process: auditCase.process,
    workflow_stage: auditCase.workflow_stage,
    role: auditCase.role,
    data_mode: auditCase.data_mode,
    expected_behavior: payload.expected_behavior,
    actual_behavior: payload.actual_behavior,
    reproduction_steps: payload.reproduction_steps,
    current_behavior_result: payload.current_behavior_result,
    process_alignment_result: payload.process_alignment_result,
    severity: payload.severity,
    finding_class: payload.finding_class,
    finding_origin: payload.finding_origin,
    observable_impact: payload.observable_impact,
    evidence_references: payload.evidence_references,
    reproduced_after_clean_retry: payload.reproduced_after_clean_retry,
    suspected_owner: payload.suspected_owner ?? null,
    recommended_correction_or_investigation:
      payload.recommended_correction_or_investigation,
    blocker: payload.blocker ?? null,
  };
  assertNonemptyString("finding.finding_id", finding.finding_id, 160);
  assertValueSafe(finding, finding.finding_id);
  return finding;
}

export async function recordFinding(runDir, payload, now = new Date()) {
  assertNonemptyString("finding.case_id", payload?.case_id, 120);
  const files = runFiles(runDir);
  const [manifest, findings, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.findings),
    readJsonLines(files.events),
  ]);
  const auditCase = findCase(manifest, payload.case_id);
  const finding = normalizeFinding(auditCase, payload, now);
  const existing = findings.find(
    (candidate) => candidate.finding_id === finding.finding_id,
  );
  if (existing) {
    const comparableExisting = JSON.stringify({ ...existing, timestamp: undefined });
    const comparableIncoming = JSON.stringify({ ...finding, timestamp: undefined });
    if (comparableExisting === comparableIncoming) {
      const recordedEvent = events.find(
        (event) =>
          event.type === "finding_recorded" &&
          event.finding?.finding_id === existing.finding_id,
      );
      if (!recordedEvent) {
        assertRunRunning(manifest, "repairing a finding audit event");
        await appendJsonLine(files.events, {
          schema_version: "process-audit-event.v1",
          event_id: nextEventId(manifest, events),
          timestamp: existing.timestamp,
          type: "finding_recorded",
          run_id: manifest.run_id,
          finding: existing,
          recovered_during_resume: true,
        });
      }
      return { idempotent: true, finding: existing };
    }
    throw new Error(`${finding.finding_id} already exists with different content.`);
  }
  assertRunRunning(manifest, "recording a finding");
  const terminalResult = auditCase.execution.result;
  if (
    terminalResult &&
    (terminalResult.current_behavior_result !== finding.current_behavior_result ||
      terminalResult.process_alignment_result !== finding.process_alignment_result)
  ) {
    throw new Error(
      `${finding.finding_id} does not match the terminal result for ${auditCase.id}.`,
    );
  }
  await appendJsonLine(files.findings, finding);
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: finding.timestamp,
    type: "finding_recorded",
    run_id: manifest.run_id,
    finding,
  });
  return { idempotent: false, finding };
}

export async function retractFinding(runDir, payload, now = new Date()) {
  assertPlainObject("finding retraction", payload);
  assertOnlyKeys("finding retraction", payload, new Set(["finding_id", "reason"]));
  assertNonemptyString("finding retraction.finding_id", payload.finding_id, 160);
  assertNonemptyString("finding retraction.reason", payload.reason, 2_000);
  assertValueSafe(payload, "finding retraction");
  const files = runFiles(runDir);
  const [manifest, findings, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.findings),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "retracting a finding");
  const index = findings.findIndex(
    (finding) => finding.finding_id === payload.finding_id,
  );
  const priorRetraction = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === "finding_retracted" &&
        event.finding.finding_id === payload.finding_id &&
        event.reason === payload.reason,
    );
  if (index < 0) {
    if (priorRetraction) {
      return { idempotent: true, finding: priorRetraction.finding };
    }
    throw new Error(`Unknown current finding: ${payload.finding_id}.`);
  }
  const [finding] = findings.splice(index, 1);
  if (priorRetraction) {
    if (!sameJson(priorRetraction.finding, finding)) {
      throw new Error(`${payload.finding_id} retraction history conflicts.`);
    }
  } else {
    await appendJsonLine(files.events, {
      schema_version: "process-audit-event.v1",
      event_id: nextEventId(manifest, events),
      timestamp: isoNow(now),
      type: "finding_retracted",
      run_id: manifest.run_id,
      reason: payload.reason,
      finding,
    });
  }
  await writeJsonLines(files.findings, findings);
  return { idempotent: Boolean(priorRetraction), finding };
}

export async function replaceFinding(runDir, payload, now = new Date()) {
  assertPlainObject("finding replacement", payload);
  assertOnlyKeys(
    "finding replacement",
    payload,
    new Set(["finding_id", "reason", "replacement"]),
  );
  assertNonemptyString("finding replacement.finding_id", payload.finding_id, 160);
  assertNonemptyString("finding replacement.reason", payload.reason, 2_000);
  assertPlainObject("finding replacement.replacement", payload.replacement);
  const files = runFiles(runDir);
  const [manifest, findings, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.findings),
    readJsonLines(files.events),
  ]);
  assertRunRunning(manifest, "replacing a finding");
  const auditCase = findCase(manifest, payload.replacement.case_id);
  const replacement = normalizeFinding(auditCase, payload.replacement, now);
  const priorIndex = findings.findIndex(
    (finding) => finding.finding_id === payload.finding_id,
  );
  const comparableReplacement = JSON.stringify({
    ...replacement,
    timestamp: undefined,
  });
  if (priorIndex < 0) {
    const existing = [...events]
      .reverse()
      .find(
        (event) =>
          event.type === "finding_replaced" &&
          event.previous_finding.finding_id === payload.finding_id,
      );
    if (
      existing?.reason === payload.reason &&
      JSON.stringify({ ...existing.finding, timestamp: undefined }) ===
        comparableReplacement
    ) {
      return { idempotent: true, finding: existing.finding };
    }
    throw new Error(`Unknown current finding: ${payload.finding_id}.`);
  }
  const priorReplacementEvent = [...events]
    .reverse()
    .find(
      (event) =>
        event.type === "finding_replaced" &&
        event.previous_finding.finding_id === payload.finding_id &&
        event.reason === payload.reason &&
        JSON.stringify({ ...event.finding, timestamp: undefined }) ===
          comparableReplacement,
    );
  if (priorReplacementEvent) {
    if (sameJson(findings[priorIndex], priorReplacementEvent.finding)) {
      return { idempotent: true, finding: findings[priorIndex] };
    }
    if (sameJson(findings[priorIndex], priorReplacementEvent.previous_finding)) {
      findings[priorIndex] = priorReplacementEvent.finding;
      await writeJsonLines(files.findings, findings);
      return { idempotent: true, finding: priorReplacementEvent.finding };
    }
    throw new Error(`${payload.finding_id} replacement history conflicts.`);
  }
  if (
    findings[priorIndex].finding_id === replacement.finding_id &&
    JSON.stringify({ ...findings[priorIndex], timestamp: undefined }) ===
      comparableReplacement
  ) {
    const matchingEvent = [...events]
      .reverse()
      .find(
        (event) =>
          event.type === "finding_replaced" &&
          event.previous_finding.finding_id === payload.finding_id &&
          event.reason === payload.reason &&
          JSON.stringify({ ...event.finding, timestamp: undefined }) ===
            comparableReplacement,
      );
    if (matchingEvent) return { idempotent: true, finding: findings[priorIndex] };
  }
  const collision = findings.find(
    (finding, index) =>
      index !== priorIndex && finding.finding_id === replacement.finding_id,
  );
  if (collision) {
    throw new Error(`Replacement finding ID ${replacement.finding_id} already exists.`);
  }
  const terminalResult = auditCase.execution.result;
  if (
    terminalResult &&
    (terminalResult.current_behavior_result !== replacement.current_behavior_result ||
      terminalResult.process_alignment_result !== replacement.process_alignment_result)
  ) {
    throw new Error(
      `${replacement.finding_id} does not match the terminal result for ${auditCase.id}.`,
    );
  }
  const previousFinding = findings[priorIndex];
  findings[priorIndex] = replacement;
  await appendJsonLine(files.events, {
    schema_version: "process-audit-event.v1",
    event_id: nextEventId(manifest, events),
    timestamp: isoNow(now),
    type: "finding_replaced",
    run_id: manifest.run_id,
    reason: payload.reason,
    previous_finding: previousFinding,
    finding: replacement,
  });
  await writeJsonLines(files.findings, findings);
  return { idempotent: false, finding: replacement };
}

function increment(bucket, key) {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

function buildSummary(manifest, findings, now) {
  const summary = {
    schema_version: "process-audit-summary.v1",
    run_id: manifest.run_id,
    generated_at: isoNow(now),
    status: manifest.status,
    totals: {
      cases: manifest.case_inventory.length,
      pending: 0,
      in_progress: 0,
      completed: 0,
      blocked: 0,
      findings: findings.length,
    },
    coverage: {
      by_surface: {},
      by_process: {},
      by_mode: {},
      by_role: {},
      by_current_behavior_result: {},
      by_process_alignment_result: {},
      by_guide_reference: {},
    },
    findings: {
      by_severity: {},
      by_class: {},
      by_origin: {},
    },
  };
  for (const auditCase of manifest.case_inventory) {
    increment(summary.totals, auditCase.execution.status);
    increment(summary.coverage.by_surface, auditCase.surface);
    increment(summary.coverage.by_process, auditCase.process);
    increment(summary.coverage.by_mode, auditCase.data_mode);
    increment(summary.coverage.by_role, auditCase.role);
    const result = auditCase.execution.result;
    if (result) {
      increment(
        summary.coverage.by_current_behavior_result,
        result.current_behavior_result,
      );
      increment(
        summary.coverage.by_process_alignment_result,
        result.process_alignment_result,
      );
    }
  }
  for (const [reference, caseIds] of Object.entries(manifest.guide_traceability)) {
    summary.coverage.by_guide_reference[reference] = caseIds.length;
  }
  for (const finding of findings) {
    increment(summary.findings.by_severity, finding.severity);
    increment(summary.findings.by_class, finding.finding_class);
    increment(summary.findings.by_origin, finding.finding_origin);
  }
  return summary;
}

function markdownEscape(text) {
  return String(text).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function reportMarkdown(manifest, summary, findings) {
  const severityRank = new Map(
    FINDING_SEVERITIES.map((severity, index) => [severity, index]),
  );
  const highest = [...findings]
    .sort(
      (a, b) =>
        severityRank.get(a.severity) - severityRank.get(b.severity) ||
        a.finding_id.localeCompare(b.finding_id),
    )
    .slice(0, 12);
  const blockers = findings.filter((finding) => finding.blocker);
  const lines = [
    "# PMI KC process audit — pass one",
    "",
    `Run: \`${manifest.run_id}\`  `,
    `Status: **${manifest.status}**  `,
    `Deployment: ${manifest.environment.deployment_url}  `,
    `Repository commit: \`${manifest.environment.repository_commit}\`  `,
    `Guide: \`${manifest.guide_source}\``,
    "",
    "## Coverage",
    "",
    `- Cases: ${summary.totals.cases}`,
    `- Completed: ${summary.totals.completed}`,
    `- Blocked: ${summary.totals.blocked}`,
    `- Findings: ${summary.totals.findings}`,
    `- Current behavior: ${Object.entries(summary.coverage.by_current_behavior_result)
      .map(([key, count]) => `${key}=${count}`)
      .join(", ")}`,
    `- Process alignment: ${Object.entries(summary.coverage.by_process_alignment_result)
      .map(([key, count]) => `${key}=${count}`)
      .join(", ")}`,
    "",
    "## Structured evidence",
    "",
    "- `manifest.json` — complete case inventory and terminal results",
    "- `events.jsonl` — ordered checkpoints",
    "- `findings.jsonl` — normalized findings",
    "- `summary.json` — reconciled totals",
    "- `dom-evidence/` — value-safe headings and control-state observations",
    "- `structured-evidence/` — bodyless environment/source observations",
    "- `screenshots/` — Test-only visual evidence",
    "- `fixtures/` — safe Test inputs used by guarded cases, when present",
    "",
    "## Highest-impact findings",
    "",
  ];
  if (highest.length === 0) lines.push("No findings were recorded.");
  else {
    lines.push(
      "| Finding | Severity | Class | Case | Impact |",
      "| --- | --- | --- | --- | --- |",
    );
    for (const finding of highest) {
      lines.push(
        `| ${markdownEscape(finding.finding_id)} | ${finding.severity} | ${finding.finding_class} | ${finding.case_id} | ${markdownEscape(finding.observable_impact)} |`,
      );
    }
  }
  lines.push("", "## Genuine blockers", "");
  if (blockers.length === 0) lines.push("No blockers were recorded.");
  else {
    for (const finding of blockers) {
      lines.push(
        `- **${finding.finding_id} / ${finding.case_id}:** ${markdownEscape(finding.blocker.description)} Unblock: ${markdownEscape(finding.blocker.unblock_action)}`,
      );
    }
  }
  lines.push("", "Pass one only. No product defect was repaired during this audit.", "");
  return lines.join("\n");
}

const NON_CIRCULAR_EVIDENCE_EVENT_TYPES = new Set([
  "test_effect_observed",
  "audit_harness_failure_observed",
  "mutation_readback_observed",
  "reversible_effect_verified",
  "transient_attempt_failed",
]);

async function validateEvidenceAssets(files, manifest, events, findings) {
  const domEvidence = await loadDomEvidence(files, manifest);
  const structuredEvidence = await loadStructuredEvidence(files, manifest);
  const screenshotNames = await readdirIfPresent(files.screenshots);
  const screenshotCases = new Map();
  for (const name of screenshotNames) {
    const fullPath = path.join(files.screenshots, name);
    if (!(await stat(fullPath)).isFile()) {
      throw new Error(`screenshots/${name} is not a screenshot file.`);
    }
    if (!/\.(?:png|jpe?g|webp)$/i.test(name)) {
      throw new Error(`Screenshot ${name} has an unsupported file extension.`);
    }
    const auditCase = [...manifest.case_inventory]
      .sort((left, right) => right.id.length - left.id.length)
      .find((candidate) => name.startsWith(`${candidate.id}-`));
    if (!auditCase) {
      throw new Error(`Screenshot ${name} does not begin with a known case ID.`);
    }
    if (auditCase.data_mode !== "test" || auditCase.screenshot_safe !== true) {
      throw new Error(`Screenshot ${name} belongs to a non-Test case.`);
    }
    await assertScreenshotMagic(fullPath, name);
    screenshotCases.set(`screenshots/${name}`, auditCase.id);
  }

  const eventById = new Map(events.map((event) => [event.event_id, event]));
  const referencedScreenshots = new Set();
  const referencedDomEvidence = new Set();
  const referencedStructuredEvidence = new Set();
  const referencesByCase = new Map(
    manifest.case_inventory.map((auditCase) => [auditCase.id, []]),
  );
  for (const auditCase of manifest.case_inventory) {
    const resultReferences = auditCase.execution.result?.evidence_references ?? [];
    validateEvidenceReferences(auditCase, resultReferences);
    referencesByCase.get(auditCase.id).push(...resultReferences);
  }
  for (const finding of findings) {
    const auditCase = findCase(manifest, finding.case_id);
    validateEvidenceReferences(auditCase, finding.evidence_references);
    referencesByCase.get(auditCase.id).push(...finding.evidence_references);
  }

  for (const [caseId, references] of referencesByCase) {
    for (const reference of references) {
      const normalized = reference.replaceAll("\\", "/");
      if (normalized.includes("/screenshots/") || normalized.startsWith("screenshots/")) {
        const canonical = `screenshots/${path.basename(normalized)}`;
        if (!screenshotCases.has(canonical)) {
          throw new Error(`Referenced screenshot ${canonical.slice(12)} is missing.`);
        }
        if (screenshotCases.get(canonical) !== caseId) {
          throw new Error(`Screenshot ${canonical} does not belong to ${caseId}.`);
        }
        referencedScreenshots.add(canonical);
      }
      if (normalized.startsWith("dom-evidence/")) {
        const record = domEvidence.get(normalized);
        if (!record) throw new Error(`Referenced DOM evidence ${normalized} is missing.`);
        if (record.case_id !== caseId) {
          throw new Error(`DOM evidence ${normalized} does not belong to ${caseId}.`);
        }
        referencedDomEvidence.add(normalized);
      }
      if (normalized.startsWith("structured-evidence/")) {
        const record = structuredEvidence.get(normalized);
        if (!record) {
          throw new Error(`Referenced structured evidence ${normalized} is missing.`);
        }
        if (record.case_id !== caseId) {
          throw new Error(
            `Structured evidence ${normalized} does not belong to ${caseId}.`,
          );
        }
        referencedStructuredEvidence.add(normalized);
      }
      if (normalized.startsWith("events.jsonl#")) {
        const eventId = eventAnchor(normalized);
        const event = eventId ? eventById.get(eventId) : null;
        if (!event) throw new Error(`Evidence event anchor ${normalized} is missing.`);
        if (!NON_CIRCULAR_EVIDENCE_EVENT_TYPES.has(event.type)) {
          throw new Error(
            `Evidence event anchor ${normalized} is circular or unsupported.`,
          );
        }
        if (event.case_id !== caseId) {
          throw new Error(
            `Evidence event anchor ${normalized} does not belong to ${caseId}.`,
          );
        }
      }
    }
  }
  for (const reference of screenshotCases.keys()) {
    if (!referencedScreenshots.has(reference)) {
      throw new Error(
        `Screenshot ${reference.slice(12)} is not referenced by a case or finding.`,
      );
    }
  }
  for (const reference of domEvidence.keys()) {
    if (!referencedDomEvidence.has(reference)) {
      throw new Error(`${reference} is not referenced by its case or finding.`);
    }
    const record = domEvidence.get(reference);
    const matchingEvents = events.filter(
      (event) =>
        event.type === "dom_evidence_recorded" &&
        event.evidence_id === record.evidence_id,
    );
    for (const event of matchingEvents) {
      assertOnlyKeys(
        "dom_evidence_recorded",
        event,
        new Set([
          "schema_version",
          "event_id",
          "timestamp",
          "type",
          "run_id",
          "case_id",
          "evidence_id",
          "reference",
          "route",
          "recovered_during_resume",
        ]),
      );
    }
    if (
      matchingEvents.length !== 1 ||
      matchingEvents[0].case_id !== record.case_id ||
      matchingEvents[0].reference !== reference ||
      matchingEvents[0].route !== record.route
    ) {
      throw new Error(`${record.evidence_id} event does not reconcile.`);
    }
  }
  for (const reference of structuredEvidence.keys()) {
    if (!referencedStructuredEvidence.has(reference)) {
      throw new Error(`${reference} is not referenced by its case or finding.`);
    }
    const record = structuredEvidence.get(reference);
    const matchingEvents = events.filter(
      (event) =>
        event.type === "structured_evidence_recorded" &&
        event.evidence_id === record.evidence_id,
    );
    for (const event of matchingEvents) {
      assertOnlyKeys(
        "structured_evidence_recorded",
        event,
        new Set([
          "schema_version",
          "event_id",
          "timestamp",
          "type",
          "run_id",
          "case_id",
          "evidence_id",
          "reference",
          "stage",
          "observation_class",
          "outcome",
          "recovered_during_resume",
        ]),
      );
    }
    if (
      matchingEvents.length !== 1 ||
      matchingEvents[0].case_id !== record.case_id ||
      matchingEvents[0].reference !== reference ||
      matchingEvents[0].stage !== record.stage ||
      matchingEvents[0].observation_class !== record.observation_class ||
      matchingEvents[0].outcome !== record.outcome
    ) {
      throw new Error(`${record.evidence_id} event does not reconcile.`);
    }
  }

  for (const auditCase of manifest.case_inventory) {
    const result = auditCase.execution.result;
    if (!result || result.current_behavior_result === "blocked") continue;
    const references = referencesByCase.get(auditCase.id);
    const hasDom = references.some((reference) =>
      reference.replaceAll("\\", "/").startsWith("dom-evidence/"),
    );
    const hasStructuredEvidence = references.some((reference) =>
      reference.replaceAll("\\", "/").startsWith("structured-evidence/"),
    );
    const hasScreenshot = references.some((reference) => {
      const normalized = reference.replaceAll("\\", "/");
      return (
        normalized.includes("/screenshots/") || normalized.startsWith("screenshots/")
      );
    });
    const anchoredEvents = references
      .map(eventAnchor)
      .filter(Boolean)
      .map((eventId) => eventById.get(eventId));
    if (result.current_behavior_result === "audit_harness_failure") {
      if (
        !hasDom &&
        !hasStructuredEvidence &&
        !hasScreenshot &&
        !anchoredEvents.some((event) => event?.type === "audit_harness_failure_observed")
      ) {
        throw new Error(
          `${auditCase.id} requires visual/DOM or anchored harness-failure evidence.`,
        );
      }
      continue;
    }
    if (
      (SUBSTANTIVE_CURRENT_RESULTS.has(result.current_behavior_result) ||
        result.current_behavior_result === "not_reachable") &&
      !hasDom &&
      !hasStructuredEvidence &&
      !hasScreenshot &&
      !anchoredEvents.some((event) => event?.type === "test_effect_observed")
    ) {
      throw new Error(`${auditCase.id} has no substantive evidence.`);
    }
  }
  return {
    domEvidenceCount: domEvidence.size,
    structuredEvidenceCount: structuredEvidence.size,
    screenshotCount: screenshotNames.length,
  };
}

const TERMINAL_MUTATION_CHECKPOINT_EVENT_TYPES = new Set([
  "mutation_intent_checkpointed",
  "mutation_readback_observed",
  "mutation_intent_adopted",
  "mutation_replay_authorized",
  "test_effect_observed",
  "reversible_effect_verified",
]);

function effectiveCaseResultBeforeEvent(events, caseId, exclusiveIndex) {
  let status = null;
  let result = null;
  let terminalEventId = null;
  for (const event of events.slice(0, exclusiveIndex)) {
    if (event.case_id !== caseId) continue;
    if (["case_completed", "case_blocked"].includes(event.type)) {
      if (!event.result) {
        throw new Error(
          `${caseId} cannot authorize reopen-case from a legacy bodyless terminal event.`,
        );
      }
      status = event.status;
      result = structuredClone(event.result);
      terminalEventId = event.event_id;
    } else if (event.type === "case_evidence_amended" && result) {
      result.evidence_references = structuredClone(event.evidence_references);
    } else if (event.type === "case_retry_metadata_amended" && result) {
      result.clean_retry = event.clean_retry;
    } else if (event.type === "case_result_amended") {
      status = event.status;
      result = structuredClone(event.result);
      terminalEventId = event.event_id;
    }
  }
  return { status, result, terminalEventId };
}

function validateMutationReopenAuthorizationChain(
  manifest,
  events,
  { requireClosed = false } = {},
) {
  const authorizationIds = new Set();
  const runReopens = new Map(
    events
      .filter((event) => event.type === "run_reopened")
      .map((event) => [event.reopen_id, event]),
  );
  for (const auditCase of manifest.case_inventory) {
    const authorizations = mutationReopenAuthorizations(auditCase);
    const activeId = auditCase.execution.active_mutation_reopen_authorization_id ?? null;
    if (activeId != null) {
      assertNonemptyString(
        `${auditCase.id}.active_mutation_reopen_authorization_id`,
        activeId,
        300,
      );
    }
    if (auditCase.mutation_kind === "read" && authorizations.length > 0) {
      throw new Error(`${auditCase.id} read-only case has a mutation reopen.`);
    }
    const caseAuthorizationEvents = events.filter(
      (event) =>
        event.type === "case_mutation_reopen_authorized" &&
        event.case_id === auditCase.id,
    );
    const caseClosureEvents = events.filter(
      (event) =>
        event.type === "case_result_amended" &&
        event.case_id === auditCase.id &&
        Object.hasOwn(event, "mutation_reopen_authorization_id"),
    );
    if (caseAuthorizationEvents.length !== authorizations.length) {
      throw new Error(
        `${auditCase.id} mutation reopen authorization events do not reconcile.`,
      );
    }
    const authorizationWindows = [];
    for (const [index, authorization] of authorizations.entries()) {
      assertPlainObject(
        `${auditCase.id}.mutation_reopen_authorizations[${index}]`,
        authorization,
      );
      assertOnlyKeys(
        `${auditCase.id}.mutation_reopen_authorizations[${index}]`,
        authorization,
        new Set([
          "authorization_id",
          "case_id",
          "authorized_at",
          "reason",
          "authority_basis",
          "run_reopen_id",
          "prior_terminal_event_id",
          "prior_status",
          "prior_result",
        ]),
      );
      for (const field of [
        "authorization_id",
        "case_id",
        "authorized_at",
        "reason",
        "authority_basis",
        "run_reopen_id",
        "prior_terminal_event_id",
      ]) {
        assertNonemptyString(
          `${auditCase.id} mutation reopen ${field}`,
          authorization[field],
          2_000,
        );
      }
      const expectedAuthorizationId = `${manifest.run_id}:${auditCase.id}:mutation-reopen:${String(
        index + 1,
      ).padStart(4, "0")}`;
      if (
        authorization.authorization_id !== expectedAuthorizationId ||
        authorization.case_id !== auditCase.id ||
        authorization.prior_status !== "blocked" ||
        authorization.prior_result?.current_behavior_result !== "blocked"
      ) {
        throw new Error(
          `${authorization.authorization_id} is not a valid blocked mutation reopen.`,
        );
      }
      if (authorizationIds.has(authorization.authorization_id)) {
        throw new Error(
          `Duplicate mutation reopen authorization ${authorization.authorization_id}.`,
        );
      }
      authorizationIds.add(authorization.authorization_id);
      validateResultShape(
        auditCase,
        authorization.prior_result,
        `${authorization.authorization_id}.prior_result`,
      );
      const matchingEvents = caseAuthorizationEvents.filter(
        (event) => event.authorization_id === authorization.authorization_id,
      );
      if (matchingEvents.length !== 1) {
        throw new Error(
          `${authorization.authorization_id} authorization event does not reconcile.`,
        );
      }
      const authorizationEvent = matchingEvents[0];
      for (const field of Object.keys(authorization)) {
        if (!sameJson(authorizationEvent[field], authorization[field])) {
          throw new Error(
            `${authorization.authorization_id}.${field} event does not reconcile.`,
          );
        }
      }
      if (authorizationEvent.timestamp !== authorization.authorized_at) {
        throw new Error(
          `${authorization.authorization_id} timestamp does not reconcile.`,
        );
      }
      const authorizationIndex = events.indexOf(authorizationEvent);
      const runReopen = runReopens.get(authorization.run_reopen_id);
      if (!runReopen || events.indexOf(runReopen) >= authorizationIndex) {
        throw new Error(
          `${authorization.authorization_id} is not anchored to a prior run reopen.`,
        );
      }
      const latestLifecycleBeforeAuthorization = events
        .slice(0, authorizationIndex)
        .filter((event) => ["run_completed", "run_reopened"].includes(event.type))
        .at(-1);
      if (
        latestLifecycleBeforeAuthorization?.type !== "run_reopened" ||
        latestLifecycleBeforeAuthorization.reopen_id !== authorization.run_reopen_id
      ) {
        throw new Error(
          `${authorization.authorization_id} was not created inside its reopened run cycle.`,
        );
      }
      const prior = effectiveCaseResultBeforeEvent(
        events,
        auditCase.id,
        authorizationIndex,
      );
      if (
        prior.status !== authorization.prior_status ||
        !sameJson(prior.result, authorization.prior_result) ||
        prior.terminalEventId !== authorization.prior_terminal_event_id
      ) {
        throw new Error(
          `${authorization.authorization_id} does not preserve the effective blocked result.`,
        );
      }
      const closures = events.filter(
        (event) =>
          event.type === "case_result_amended" &&
          event.case_id === auditCase.id &&
          event.mutation_reopen_authorization_id === authorization.authorization_id,
      );
      if (closures.length > 1) {
        throw new Error(`${authorization.authorization_id} was closed more than once.`);
      }
      const closure = closures[0] ?? null;
      const closureIndex = closure ? events.indexOf(closure) : null;
      if (closure && closureIndex <= authorizationIndex) {
        throw new Error(
          `${authorization.authorization_id} closes before it was authorized.`,
        );
      }
      const interveningAmendment = events.find(
        (event, eventIndex) =>
          eventIndex > authorizationIndex &&
          (closureIndex == null || eventIndex < closureIndex) &&
          event.type === "case_result_amended" &&
          event.case_id === auditCase.id,
      );
      if (interveningAmendment) {
        throw new Error(
          `${authorization.authorization_id} did not close on the first amended result.`,
        );
      }
      authorizationWindows.push({
        authorization,
        authorizationIndex,
        closure,
        closureIndex,
      });
    }
    const unclosed = authorizationWindows.filter((window) => !window.closure);
    if (unclosed.length > 1) {
      throw new Error(`${auditCase.id} has multiple open mutation reopens.`);
    }
    const expectedActiveId = unclosed[0]?.authorization.authorization_id ?? null;
    if (activeId !== expectedActiveId) {
      throw new Error(`${auditCase.id} active mutation reopen state is inconsistent.`);
    }
    if (requireClosed && expectedActiveId) {
      throw new Error(
        `${auditCase.id} reopen-case authorization must be closed by amend-result before finalization.`,
      );
    }
    const caseAuthorizationIds = new Set(
      authorizations.map((authorization) => authorization.authorization_id),
    );
    const unknownClosure = caseClosureEvents.find(
      (event) => !caseAuthorizationIds.has(event.mutation_reopen_authorization_id),
    );
    if (unknownClosure) {
      throw new Error(
        `${auditCase.id} result amendment closes an unknown mutation reopen authorization.`,
      );
    }
    const initialTerminalIndex = events.findIndex(
      (event) =>
        event.case_id === auditCase.id &&
        ["case_completed", "case_blocked"].includes(event.type),
    );
    if (initialTerminalIndex < 0) continue;
    for (const [eventIndex, event] of events.entries()) {
      if (
        eventIndex <= initialTerminalIndex ||
        event.case_id !== auditCase.id ||
        !TERMINAL_MUTATION_CHECKPOINT_EVENT_TYPES.has(event.type)
      ) {
        continue;
      }
      if (event.type === "reversible_effect_verified") {
        const effectIndex = events.findIndex(
          (candidate) =>
            candidate.type === "test_effect_observed" &&
            candidate.case_id === auditCase.id &&
            candidate.mutation_key === event.mutation_key,
        );
        if (effectIndex >= 0 && effectIndex < initialTerminalIndex) continue;
      }
      const authorizingWindows = authorizationWindows.filter(
        (window) =>
          window.authorizationIndex < eventIndex &&
          (window.closureIndex == null || eventIndex < window.closureIndex),
      );
      if (authorizingWindows.length !== 1) {
        throw new Error(
          `${auditCase.id} has an unauthorized terminal mutation checkpoint ${event.event_id}.`,
        );
      }
    }
  }
  const orphanAuthorizationEvents = events.filter(
    (event) =>
      event.type === "case_mutation_reopen_authorized" &&
      !authorizationIds.has(event.authorization_id),
  );
  if (orphanAuthorizationEvents.length > 0) {
    throw new Error(
      `${orphanAuthorizationEvents[0].authorization_id} is an orphan mutation reopen authorization event.`,
    );
  }
}

export async function finalizeAuditRun(runDir, now = new Date()) {
  const files = runFiles(runDir);
  const [manifest, findings, events] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.findings),
    readJsonLines(files.events),
  ]);
  if (!["running", "completed"].includes(manifest.status)) {
    throw new Error(`Cannot finalize a run in ${manifest.status} status.`);
  }
  const definitions = caseDefinitionsFromManifest(manifest);
  validateCaseDefinitions(definitions);
  validateManifestEnumMigrationHistory(manifest, events);
  validateExactDeclaredRoleModeCoverage(manifest.roles, manifest.modes, definitions);
  validateTraceabilityCompleteness(
    manifest.guide_section_ids,
    manifest.reviewer_checklist_ids,
    definitions,
  );
  assertAllCurrentDependencyInvariants(manifest);
  validateMutationReopenAuthorizationChain(manifest, events, {
    requireClosed: true,
  });
  const incomplete = manifest.case_inventory.filter(
    (auditCase) => !["completed", "blocked"].includes(auditCase.execution.status),
  );
  if (incomplete.length > 0) {
    throw new Error(
      `Cannot finalize with ${incomplete.length} non-terminal cases: ${incomplete
        .slice(0, 10)
        .map((item) => item.id)
        .join(", ")}.`,
    );
  }
  const findingCaseIds = new Set(findings.map((finding) => finding.case_id));
  const missingFindingCases = manifest.case_inventory.filter((auditCase) => {
    const result = auditCase.execution.result;
    if (!result) return false;
    const needsFinding =
      ["fail", "blocked", "not_reachable", "audit_harness_failure"].includes(
        result.current_behavior_result,
      ) || ["partial", "gap", "blocked"].includes(result.process_alignment_result);
    return needsFinding && !findingCaseIds.has(auditCase.id);
  });
  if (missingFindingCases.length > 0) {
    throw new Error(
      `Cannot finalize without findings for non-passing cases: ${missingFindingCases
        .slice(0, 10)
        .map((auditCase) => auditCase.id)
        .join(", ")}.`,
    );
  }
  const missingBlockerDetails = manifest.case_inventory.filter((auditCase) => {
    const result = auditCase.execution.result;
    if (
      !result ||
      (result.current_behavior_result !== "blocked" &&
        result.process_alignment_result !== "blocked")
    ) {
      return false;
    }
    return !(
      result.blocker ||
      findings.some((finding) => finding.case_id === auditCase.id && finding.blocker)
    );
  });
  if (missingBlockerDetails.length > 0) {
    throw new Error(
      `Cannot finalize without precise blocker details for: ${missingBlockerDetails
        .slice(0, 10)
        .map((auditCase) => auditCase.id)
        .join(", ")}.`,
    );
  }
  for (const finding of findings) {
    const auditCase = findCase(manifest, finding.case_id);
    const result = auditCase.execution.result;
    if (
      !result ||
      result.current_behavior_result !== finding.current_behavior_result ||
      result.process_alignment_result !== finding.process_alignment_result
    ) {
      throw new Error(
        `${finding.finding_id} does not reconcile with the terminal result for ${finding.case_id}.`,
      );
    }
  }
  for (const auditCase of manifest.case_inventory) {
    if (
      auditCase.mutation_kind === "reversible_app_write" &&
      !["blocked", "not_reachable"].includes(
        auditCase.execution.result.current_behavior_result,
      ) &&
      !auditCase.execution.reversible_effect_checkpoint
    ) {
      throw new Error(
        `${auditCase.id} requires structured reversible-effect verification.`,
      );
    }
  }
  await validateEvidenceAssets(files, manifest, events, findings);
  await validateDeclaredAuditSidecars(files, manifest, events, {
    requireTerminal: true,
  });
  const alreadyCompleted = manifest.status === "completed";
  const interruptedCompletion =
    !alreadyCompleted && events.at(-1)?.type === "run_completed";
  if (alreadyCompleted && events.at(-1)?.type !== "run_completed") {
    throw new Error("A completed run must currently end with run_completed.");
  }
  const completionTimestamp =
    alreadyCompleted && manifest.completed_at
      ? manifest.completed_at
      : interruptedCompletion
        ? events.at(-1).timestamp
        : isoNow(now);
  manifest.status = "completed";
  manifest.completed_at = completionTimestamp;
  manifest.updated_at = completionTimestamp;
  manifest.active_reopen = null;
  const summary = buildSummary(manifest, findings, new Date(completionTimestamp));
  await writeJson(files.summary, summary);
  const report = reportMarkdown(manifest, summary, findings);
  assertValueSafe(report, "run-report.md");
  await writeFile(files.report, report, "utf8");
  if (alreadyCompleted || interruptedCompletion) {
    if (JSON.stringify(events.at(-1).totals) !== JSON.stringify(summary.totals)) {
      throw new Error("Current run_completed totals do not reconcile.");
    }
  } else {
    await appendJsonLine(files.events, {
      schema_version: "process-audit-event.v1",
      event_id: nextEventId(manifest, events),
      timestamp: completionTimestamp,
      type: "run_completed",
      run_id: manifest.run_id,
      totals: summary.totals,
    });
  }
  // The manifest is the completion marker and is written last so an interrupted
  // finalization can safely replay the report/event work without duplicating effects.
  await writeJson(files.manifest, manifest);
  return { manifest, summary };
}

export async function validateAuditRunLegacy(runDir) {
  const files = runFiles(runDir);
  const [manifest, events, findings, summary, report] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
    readJsonLines(files.findings),
    readJson(files.summary),
    readFile(files.report, "utf8"),
  ]);
  if (manifest.schema_version !== "process-audit.v1") {
    throw new Error("manifest.json has an unsupported schema version.");
  }
  assertNonemptyString("manifest.run_id", manifest.run_id, 160);
  assertPlainObject("manifest.environment", manifest.environment);
  assertNonemptyString(
    "manifest.environment.deployment_url",
    manifest.environment.deployment_url,
    1_000,
  );
  assertNonemptyString(
    "manifest.environment.repository_commit",
    manifest.environment.repository_commit,
    160,
  );
  assertNonemptyString("manifest.guide_source", manifest.guide_source, 1_000);
  if (!Array.isArray(manifest.roles) || !Array.isArray(manifest.modes)) {
    throw new Error("manifest roles and modes must be arrays.");
  }
  if (
    summary.schema_version !== "process-audit-summary.v1" ||
    summary.run_id !== manifest.run_id
  ) {
    throw new Error("summary.json has invalid run metadata.");
  }
  const caseDefinitions = caseDefinitionsFromManifest(manifest);
  validateCaseDefinitions(caseDefinitions);
  const expectedTraceability = buildGuideTraceability(caseDefinitions);
  if (
    JSON.stringify(manifest.guide_traceability) !== JSON.stringify(expectedTraceability)
  ) {
    throw new Error(
      "manifest guide traceability does not reconcile with the case inventory.",
    );
  }
  const eventIds = new Set();
  events.forEach((event, index) => {
    assertPlainObject(`events.jsonl event ${index + 1}`, event);
    if (
      event.schema_version !== "process-audit-event.v1" ||
      event.run_id !== manifest.run_id
    ) {
      throw new Error(`events.jsonl event ${index + 1} has invalid run metadata.`);
    }
    const expectedEventId = `${manifest.run_id}:${String(index + 1).padStart(6, "0")}`;
    if (event.event_id !== expectedEventId) {
      throw new Error(`events.jsonl event ${index + 1} has an out-of-order ID.`);
    }
    if (eventIds.has(event.event_id)) {
      throw new Error(`events.jsonl contains duplicate event ID ${event.event_id}.`);
    }
    eventIds.add(event.event_id);
  });
  if (events[0]?.type !== "run_initialized") {
    throw new Error(
      "events.jsonl does not begin with the matching run_initialized event.",
    );
  }
  const completionEvents = events.filter((event) => event.type === "run_completed");
  if (
    completionEvents.length !== 1 ||
    events.at(-1)?.event_id !== completionEvents[0].event_id
  ) {
    throw new Error("events.jsonl must end with exactly one run_completed event.");
  }
  if (JSON.stringify(completionEvents[0].totals) !== JSON.stringify(summary.totals)) {
    throw new Error("run_completed totals do not reconcile with summary.json.");
  }
  const registryKeys = new Set();
  const intentKeys = new Set();
  for (const auditCase of manifest.case_inventory) {
    assertPlainObject(`${auditCase.id}.execution`, auditCase.execution);
    assertEnum(
      `${auditCase.id}.execution.status`,
      auditCase.execution.status,
      CASE_STATUSES,
    );
    const intent = auditCase.execution.mutation_intent;
    if (intent) {
      intentKeys.add(intent.mutation_key);
      if (manifest.effect_registry[intent.mutation_key] !== auditCase.id) {
        throw new Error(`Effect registry does not reconcile for ${auditCase.id}.`);
      }
      const intentEvents = events.filter(
        (event) =>
          event.type === "mutation_intent_checkpointed" &&
          event.case_id === auditCase.id &&
          event.mutation_key === intent.mutation_key,
      );
      for (const event of intentEvents) {
        assertOnlyKeys(
          "mutation_intent_checkpointed",
          event,
          new Set([
            "schema_version",
            "event_id",
            "timestamp",
            "type",
            "run_id",
            "case_id",
            "mutation_key",
            "safe_alias",
            "planned_effect",
            "recovered_during_resume",
          ]),
        );
      }
      if (intentEvents.length !== 1) {
        throw new Error(`Intent event does not reconcile for ${auditCase.id}.`);
      }
      if (
        intentEvents[0].safe_alias !== intent.safe_alias ||
        intentEvents[0].planned_effect !== intent.planned_effect
      ) {
        throw new Error(`Intent event values do not reconcile for ${auditCase.id}.`);
      }
    }
    const effect = auditCase.execution.effect_checkpoint;
    if (effect) {
      if (!intent || effect.mutation_key !== intent.mutation_key) {
        throw new Error(`Effect checkpoint has no matching intent for ${auditCase.id}.`);
      }
      if (effect.safe_alias !== intent.safe_alias) {
        throw new Error(`Effect alias does not reconcile for ${auditCase.id}.`);
      }
      const effectEvents = events.filter(
        (event) =>
          event.type === "test_effect_observed" &&
          event.case_id === auditCase.id &&
          event.mutation_key === effect.mutation_key,
      );
      for (const event of effectEvents) {
        assertOnlyKeys(
          "test_effect_observed",
          event,
          new Set([
            "schema_version",
            "event_id",
            "timestamp",
            "type",
            "run_id",
            "case_id",
            "mutation_key",
            "record_type",
            "record_id",
            "safe_alias",
            "outcome",
            "adopted_after_readback",
            "recovered_during_resume",
          ]),
        );
      }
      if (effectEvents.length !== 1) {
        throw new Error(`Effect event does not reconcile for ${auditCase.id}.`);
      }
      for (const field of ["record_type", "record_id", "safe_alias", "outcome"]) {
        if (effectEvents[0][field] !== effect[field]) {
          throw new Error(`Effect event values do not reconcile for ${auditCase.id}.`);
        }
      }
    }
    const result = auditCase.execution.result;
    if (!["completed", "blocked"].includes(auditCase.execution.status) || !result) {
      throw new Error(`${auditCase.id} is not terminal with a result.`);
    }
    if (
      !Number.isInteger(auditCase.execution.attempt_count) ||
      auditCase.execution.attempt_count < 1
    ) {
      throw new Error(`${auditCase.id} has an invalid attempt count.`);
    }
    assertEnum(
      `${auditCase.id}.current_behavior_result`,
      result.current_behavior_result,
      CURRENT_BEHAVIOR_RESULTS,
    );
    assertEnum(
      `${auditCase.id}.process_alignment_result`,
      result.process_alignment_result,
      PROCESS_ALIGNMENT_RESULTS,
    );
    assertEnum(`${auditCase.id}.clean_retry`, result.clean_retry, CLEAN_RETRY_RESULTS);
    assertPlainObject(`${auditCase.id}.actual`, result.actual);
    for (const field of REQUIRED_ACTUAL_FIELDS) {
      assertNonemptyString(`${auditCase.id}.actual.${field}`, result.actual[field]);
    }
    if (result.actual.data_mode !== auditCase.data_mode) {
      throw new Error(`${auditCase.id} result data mode does not reconcile.`);
    }
    validateConsoleErrors(result.console_errors, `${auditCase.id}.console_errors`);
    validateEvidenceReferences(auditCase, result.evidence_references);
    if (
      (auditCase.execution.status === "blocked") !==
      (result.current_behavior_result === "blocked")
    ) {
      throw new Error(`${auditCase.id} terminal status does not match its result.`);
    }
    if (
      auditCase.mutation_kind !== "read" &&
      !["blocked", "not_reachable"].includes(result.current_behavior_result) &&
      (!intent || !effect)
    ) {
      throw new Error(`${auditCase.id} mutation checkpoints are incomplete.`);
    }
    const expectedResultEventType =
      auditCase.execution.status === "blocked" ? "case_blocked" : "case_completed";
    const resultEvents = events.filter(
      (event) => event.type === expectedResultEventType && event.case_id === auditCase.id,
    );
    if (resultEvents.length !== 1) {
      throw new Error(`Terminal result event does not reconcile for ${auditCase.id}.`);
    }
    const evidenceAmendments = events.filter(
      (event) => event.type === "case_evidence_amended" && event.case_id === auditCase.id,
    );
    const effectiveEvidenceReferences =
      evidenceAmendments.at(-1)?.evidence_references ??
      resultEvents[0].evidence_references;
    if (
      resultEvents[0].current_behavior_result !== result.current_behavior_result ||
      resultEvents[0].process_alignment_result !== result.process_alignment_result ||
      JSON.stringify(effectiveEvidenceReferences) !==
        JSON.stringify(result.evidence_references)
    ) {
      throw new Error(
        `Terminal result event values do not reconcile for ${auditCase.id}.`,
      );
    }
  }
  const effectRegistryKeys = Object.keys(manifest.effect_registry);
  if (
    effectRegistryKeys.length !== intentKeys.size ||
    effectRegistryKeys.some((mutationKey) => !intentKeys.has(mutationKey))
  ) {
    throw new Error("Effect registry contains an orphan or missing mutation key.");
  }
  const inventoryExtensions = manifest.inventory_extensions ?? [];
  const extendedCaseIds = new Set();
  for (const extension of inventoryExtensions) {
    assertPlainObject("inventory extension", extension);
    assertNonemptyString("inventory extension ID", extension.extension_id, 240);
    if (!Array.isArray(extension.case_ids) || extension.case_ids.length === 0) {
      throw new Error(`${extension.extension_id} has no appended cases.`);
    }
    for (const caseId of extension.case_ids) {
      findCase(manifest, caseId);
      if (extendedCaseIds.has(caseId)) {
        throw new Error(`Case ${caseId} appears in multiple inventory extensions.`);
      }
      extendedCaseIds.add(caseId);
    }
    const extensionEvents = events.filter(
      (event) =>
        event.type === "case_inventory_extended" &&
        event.extension_id === extension.extension_id,
    );
    if (
      extensionEvents.length !== 1 ||
      JSON.stringify(extensionEvents[0].case_ids) !==
        JSON.stringify(extension.case_ids) ||
      JSON.stringify(extensionEvents[0].preserved_definition_drift ?? []) !==
        JSON.stringify(extension.preserved_definition_drift ?? [])
    ) {
      throw new Error(`${extension.extension_id} event does not reconcile.`);
    }
  }
  if (events[0].case_count !== manifest.case_inventory.length - extendedCaseIds.size) {
    throw new Error("run_initialized case count does not reconcile with extensions.");
  }
  const expectedEventCount =
    2 +
    manifest.case_inventory.length +
    intentKeys.size +
    inventoryExtensions.length +
    events.filter((event) => event.type === "case_evidence_amended").length +
    events.filter((event) => event.type === "case_retry_metadata_amended").length +
    manifest.case_inventory.filter((auditCase) => auditCase.execution.effect_checkpoint)
      .length;
  if (events.length !== expectedEventCount) {
    throw new Error(
      `events.jsonl has ${events.length} events; expected ${expectedEventCount}.`,
    );
  }
  for (const entry of manifest.test_record_registry) {
    if (registryKeys.has(entry.mutation_key)) {
      throw new Error(`Duplicate Test record registry key ${entry.mutation_key}.`);
    }
    registryKeys.add(entry.mutation_key);
    const auditCase = findCase(manifest, entry.case_id);
    if (auditCase.execution.effect_checkpoint?.mutation_key !== entry.mutation_key) {
      throw new Error(`Test record registry does not reconcile for ${entry.case_id}.`);
    }
    if (
      auditCase.execution.effect_checkpoint.safe_alias !== entry.safe_alias ||
      auditCase.execution.effect_checkpoint.record_id !== entry.record_id
    ) {
      throw new Error(
        `Test record registry values do not reconcile for ${entry.case_id}.`,
      );
    }
  }
  const effectKeys = new Set(
    manifest.case_inventory
      .map((auditCase) => auditCase.execution.effect_checkpoint?.mutation_key)
      .filter(Boolean),
  );
  if (
    registryKeys.size !== effectKeys.size ||
    [...effectKeys].some((mutationKey) => !registryKeys.has(mutationKey))
  ) {
    throw new Error("Test record registry is missing an effect checkpoint.");
  }
  const findingIds = new Set();
  for (const finding of findings) {
    assertPlainObject("finding", finding);
    if (finding.schema_version !== "process-audit-finding.v1") {
      throw new Error(`${finding.finding_id ?? "Finding"} has an invalid schema.`);
    }
    for (const field of REQUIRED_FINDING_FIELDS) {
      if (!(field in finding)) throw new Error(`finding.${field} is required.`);
    }
    if (findingIds.has(finding.finding_id)) {
      throw new Error(`Duplicate finding ID ${finding.finding_id}.`);
    }
    findingIds.add(finding.finding_id);
    const auditCase = findCase(manifest, finding.case_id);
    for (const [field, expected] of [
      ["surface", auditCase.surface],
      ["route", auditCase.route],
      ["process", auditCase.process],
      ["workflow_stage", auditCase.workflow_stage],
      ["role", auditCase.role],
      ["data_mode", auditCase.data_mode],
    ]) {
      if (finding[field] !== expected) {
        throw new Error(`${finding.finding_id}.${field} does not match its case.`);
      }
    }
    assertEnum(
      "finding.current_behavior_result",
      finding.current_behavior_result,
      CURRENT_BEHAVIOR_RESULTS,
    );
    assertEnum(
      "finding.process_alignment_result",
      finding.process_alignment_result,
      PROCESS_ALIGNMENT_RESULTS,
    );
    assertEnum("finding.severity", finding.severity, FINDING_SEVERITIES);
    assertEnum("finding.finding_class", finding.finding_class, FINDING_CLASSES);
    assertEnum("finding.finding_origin", finding.finding_origin, FINDING_ORIGINS);
    for (const field of [
      "finding_id",
      "expected_behavior",
      "actual_behavior",
      "observable_impact",
      "recommended_correction_or_investigation",
    ]) {
      assertNonemptyString(`finding.${field}`, finding[field], 4_000);
    }
    if (
      !Array.isArray(finding.reproduction_steps) ||
      finding.reproduction_steps.length === 0
    ) {
      throw new Error(`${finding.finding_id} has no reproduction steps.`);
    }
    for (const step of finding.reproduction_steps) {
      assertNonemptyString("finding.reproduction_steps item", step, 2_000);
    }
    if (typeof finding.reproduced_after_clean_retry !== "boolean") {
      throw new Error(
        `${finding.finding_id}.reproduced_after_clean_retry must be a boolean.`,
      );
    }
    if (finding.blocker != null) {
      assertPlainObject(`${finding.finding_id}.blocker`, finding.blocker);
      assertNonemptyString(
        `${finding.finding_id}.blocker.description`,
        finding.blocker.description,
      );
      assertNonemptyString(
        `${finding.finding_id}.blocker.unblock_action`,
        finding.blocker.unblock_action,
      );
    }
    validateEvidenceReferences(auditCase, finding.evidence_references);
    const result = auditCase.execution.result;
    if (
      result.current_behavior_result !== finding.current_behavior_result ||
      result.process_alignment_result !== finding.process_alignment_result
    ) {
      throw new Error(`${finding.finding_id} does not reconcile with its case result.`);
    }
  }
  for (const auditCase of manifest.case_inventory) {
    const result = auditCase.execution.result;
    const caseFindings = findings.filter((finding) => finding.case_id === auditCase.id);
    const needsFinding =
      ["fail", "blocked", "not_reachable", "audit_harness_failure"].includes(
        result.current_behavior_result,
      ) || ["partial", "gap", "blocked"].includes(result.process_alignment_result);
    if (needsFinding && caseFindings.length === 0) {
      throw new Error(`${auditCase.id} requires a normalized finding.`);
    }
    if (
      (result.current_behavior_result === "blocked" ||
        result.process_alignment_result === "blocked") &&
      !result.blocker &&
      !caseFindings.some((finding) => finding.blocker)
    ) {
      throw new Error(`${auditCase.id} requires precise blocker details.`);
    }
  }
  assertValueSafe(manifest, "manifest.json");
  assertValueSafe(events, "events.jsonl");
  assertValueSafe(findings, "findings.jsonl");
  assertValueSafe(summary, "summary.json");
  assertValueSafe(report, "run-report.md");
  const reconciled = buildSummary(manifest, findings, new Date(summary.generated_at));
  if (JSON.stringify(summary) !== JSON.stringify(reconciled)) {
    throw new Error("summary.json does not fully reconcile with the manifest/findings.");
  }
  if (report !== reportMarkdown(manifest, summary, findings)) {
    throw new Error("run-report.md does not reconcile with structured evidence.");
  }
  const screenshotNames = await readdir(files.screenshots);
  const referencedScreenshots = new Set();
  for (const reference of [
    ...manifest.case_inventory.flatMap(
      (auditCase) => auditCase.execution.result.evidence_references,
    ),
    ...findings.flatMap((finding) => finding.evidence_references),
  ]) {
    const normalized = reference.replaceAll("\\", "/");
    if (normalized.includes("/screenshots/") || normalized.startsWith("screenshots/")) {
      referencedScreenshots.add(path.basename(normalized));
    }
  }
  for (const name of screenshotNames) {
    const fullPath = path.join(files.screenshots, name);
    if (!(await stat(fullPath)).isFile()) {
      throw new Error(`screenshots/${name} is not a screenshot file.`);
    }
    if (!/\.(?:png|jpe?g|webp)$/i.test(name)) {
      throw new Error(`Screenshot ${name} has an unsupported file extension.`);
    }
    const auditCase = manifest.case_inventory.find((candidate) =>
      name.startsWith(candidate.id),
    );
    if (!auditCase)
      throw new Error(`Screenshot ${name} does not begin with a known case ID.`);
    if (
      !SCREENSHOT_SAFE_MODES.has(auditCase.data_mode) ||
      auditCase.screenshot_safe !== true
    ) {
      throw new Error(`Screenshot ${name} belongs to a non-allowlisted case.`);
    }
    if (!referencedScreenshots.has(name)) {
      throw new Error(`Screenshot ${name} is not referenced by a case or finding.`);
    }
  }
  for (const name of referencedScreenshots) {
    if (!screenshotNames.includes(name)) {
      throw new Error(`Referenced screenshot ${name} is missing.`);
    }
  }
  if (manifest.status !== "completed" || summary.status !== "completed") {
    throw new Error("Run is not completed.");
  }
  return {
    ok: true,
    run_id: manifest.run_id,
    case_count: manifest.case_inventory.length,
    event_count: events.length,
    finding_count: findings.length,
    screenshot_count: screenshotNames.length,
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateNormalizedFindingRecord(finding, auditCase, matchCurrentCase = true) {
  assertPlainObject("finding", finding);
  if (finding.schema_version !== "process-audit-finding.v1") {
    throw new Error(`${finding.finding_id ?? "Finding"} has an invalid schema.`);
  }
  for (const field of REQUIRED_FINDING_FIELDS) {
    if (!(field in finding)) throw new Error(`finding.${field} is required.`);
  }
  if (finding.case_id !== auditCase.id) {
    throw new Error(`${finding.finding_id} has an unknown case association.`);
  }
  if (matchCurrentCase) {
    for (const [field, expected] of [
      ["surface", auditCase.surface],
      ["route", auditCase.route],
      ["process", auditCase.process],
      ["workflow_stage", auditCase.workflow_stage],
      ["role", auditCase.role],
      ["data_mode", auditCase.data_mode],
    ]) {
      if (finding[field] !== expected) {
        throw new Error(`${finding.finding_id}.${field} does not match its case.`);
      }
    }
  }
  assertEnum(
    "finding.current_behavior_result",
    finding.current_behavior_result,
    CURRENT_BEHAVIOR_RESULTS,
  );
  assertEnum(
    "finding.process_alignment_result",
    finding.process_alignment_result,
    PROCESS_ALIGNMENT_RESULTS,
  );
  assertEnum("finding.severity", finding.severity, FINDING_SEVERITIES);
  assertEnum("finding.finding_class", finding.finding_class, FINDING_CLASSES);
  assertEnum("finding.finding_origin", finding.finding_origin, FINDING_ORIGINS);
  for (const field of [
    "finding_id",
    "expected_behavior",
    "actual_behavior",
    "observable_impact",
    "recommended_correction_or_investigation",
  ]) {
    assertNonemptyString(`finding.${field}`, finding[field], 4_000);
  }
  if (
    !Array.isArray(finding.reproduction_steps) ||
    finding.reproduction_steps.length === 0
  ) {
    throw new Error(`${finding.finding_id} has no reproduction steps.`);
  }
  for (const step of finding.reproduction_steps) {
    assertNonemptyString("finding.reproduction_steps item", step, 2_000);
  }
  if (typeof finding.reproduced_after_clean_retry !== "boolean") {
    throw new Error(
      `${finding.finding_id}.reproduced_after_clean_retry must be a boolean.`,
    );
  }
  if (finding.blocker != null) {
    assertPlainObject(`${finding.finding_id}.blocker`, finding.blocker);
    assertOnlyKeys(
      `${finding.finding_id}.blocker`,
      finding.blocker,
      new Set(["description", "unblock_action"]),
    );
    assertNonemptyString(
      `${finding.finding_id}.blocker.description`,
      finding.blocker.description,
    );
    assertNonemptyString(
      `${finding.finding_id}.blocker.unblock_action`,
      finding.blocker.unblock_action,
    );
  }
  validateEvidenceReferences(auditCase, finding.evidence_references);
  assertValueSafe(finding, finding.finding_id);
}

function validateResultShape(auditCase, result, label) {
  assertPlainObject(label, result);
  assertEnum(
    `${label}.current_behavior_result`,
    result.current_behavior_result,
    CURRENT_BEHAVIOR_RESULTS,
  );
  assertEnum(
    `${label}.process_alignment_result`,
    result.process_alignment_result,
    PROCESS_ALIGNMENT_RESULTS,
  );
  assertEnum(`${label}.clean_retry`, result.clean_retry, CLEAN_RETRY_RESULTS);
  assertPlainObject(`${label}.actual`, result.actual);
  assertOnlyKeys(`${label}.actual`, result.actual, new Set(REQUIRED_ACTUAL_FIELDS));
  for (const field of REQUIRED_ACTUAL_FIELDS) {
    assertNonemptyString(`${label}.actual.${field}`, result.actual[field]);
  }
  if (result.actual.data_mode !== auditCase.data_mode) {
    throw new Error(`${auditCase.id} result data mode does not reconcile.`);
  }
  validateConsoleErrors(result.console_errors, `${label}.console_errors`);
  validateEvidenceReferences(auditCase, result.evidence_references);
  if (result.blocker != null) {
    assertPlainObject(`${label}.blocker`, result.blocker);
    assertOnlyKeys(
      `${label}.blocker`,
      result.blocker,
      new Set(["description", "unblock_action"]),
    );
    assertNonemptyString(`${label}.blocker.description`, result.blocker.description);
    assertNonemptyString(
      `${label}.blocker.unblock_action`,
      result.blocker.unblock_action,
    );
  }
}

export async function validateAuditRun(runDir) {
  const files = runFiles(runDir);
  const [manifest, events, findings, summary, report] = await Promise.all([
    readJson(files.manifest),
    readJsonLines(files.events),
    readJsonLines(files.findings),
    readJson(files.summary),
    readFile(files.report, "utf8"),
  ]);
  if (manifest.schema_version !== "process-audit.v1") {
    throw new Error("manifest.json has an unsupported schema version.");
  }
  assertNonemptyString("manifest.run_id", manifest.run_id, 160);
  assertPlainObject("manifest.environment", manifest.environment);
  assertNonemptyString(
    "manifest.environment.deployment_url",
    manifest.environment.deployment_url,
    1_000,
  );
  assertNonemptyString(
    "manifest.environment.repository_commit",
    manifest.environment.repository_commit,
    160,
  );
  assertNonemptyString("manifest.guide_source", manifest.guide_source, 1_000);
  const definitions = caseDefinitionsFromManifest(manifest);
  validateCaseDefinitions(definitions);
  const enumMigrations = validateManifestEnumMigrationHistory(manifest, events);
  validateExactDeclaredRoleModeCoverage(manifest.roles, manifest.modes, definitions);
  validateTraceabilityCompleteness(
    manifest.guide_section_ids,
    manifest.reviewer_checklist_ids,
    definitions,
  );
  if (!sameJson(manifest.guide_traceability, buildGuideTraceability(definitions))) {
    throw new Error(
      "manifest guide traceability does not reconcile with the case inventory.",
    );
  }
  if (
    summary.schema_version !== "process-audit-summary.v1" ||
    summary.run_id !== manifest.run_id
  ) {
    throw new Error("summary.json has invalid run metadata.");
  }

  const eventIds = new Set();
  events.forEach((event, index) => {
    assertPlainObject(`events.jsonl event ${index + 1}`, event);
    if (
      event.schema_version !== "process-audit-event.v1" ||
      event.run_id !== manifest.run_id
    ) {
      throw new Error(`events.jsonl event ${index + 1} has invalid run metadata.`);
    }
    if (!EVENT_TYPES.has(event.type)) {
      throw new Error(`events.jsonl event ${index + 1} has unknown type ${event.type}.`);
    }
    const expectedEventId = `${manifest.run_id}:${String(index + 1).padStart(6, "0")}`;
    if (event.event_id !== expectedEventId) {
      throw new Error(`events.jsonl event ${index + 1} has an out-of-order ID.`);
    }
    if (eventIds.has(event.event_id)) {
      throw new Error(`events.jsonl contains duplicate event ID ${event.event_id}.`);
    }
    eventIds.add(event.event_id);
  });
  if (events[0]?.type !== "run_initialized") {
    throw new Error("events.jsonl does not begin with run_initialized.");
  }
  const lifecycleEvents = events.filter((event) =>
    ["run_completed", "run_reopened"].includes(event.type),
  );
  if (lifecycleEvents.length === 0 || lifecycleEvents[0].type !== "run_completed") {
    throw new Error("Run lifecycle has no initial completion.");
  }
  for (const [index, event] of lifecycleEvents.entries()) {
    const expectedType = index % 2 === 0 ? "run_completed" : "run_reopened";
    if (event.type !== expectedType) {
      throw new Error("run_completed and run_reopened events must alternate.");
    }
    if (event.type === "run_reopened") {
      assertNonemptyString("run reopen reason", event.reason, 2_000);
      if (event.prior_completion_event_id !== lifecycleEvents[index - 1].event_id) {
        throw new Error(`${event.reopen_id} does not anchor its prior completion.`);
      }
    }
  }
  const currentCompletion = lifecycleEvents.at(-1);
  if (
    currentCompletion.type !== "run_completed" ||
    events.at(-1)?.event_id !== currentCompletion.event_id
  ) {
    throw new Error("events.jsonl must currently end with run_completed.");
  }
  const reopenCount = lifecycleEvents.filter(
    (event) => event.type === "run_reopened",
  ).length;
  if ((manifest.reopen_count ?? 0) !== reopenCount || manifest.active_reopen != null) {
    throw new Error("Manifest reopen state does not reconcile with lifecycle events.");
  }
  validateMutationReopenAuthorizationChain(manifest, events, {
    requireClosed: true,
  });
  if (!sameJson(currentCompletion.totals, summary.totals)) {
    throw new Error("Current run_completed totals do not reconcile with summary.json.");
  }
  const traceabilityDeclarations = events.filter(
    (event) => event.type === "traceability_inventory_declared",
  );
  for (const [index, declaration] of traceabilityDeclarations.entries()) {
    assertNonemptyString("traceability declaration reason", declaration.reason, 2_000);
    validateIdentifierInventory(
      "declared guide_section_ids",
      declaration.guide_section_ids,
    );
    validateIdentifierInventory(
      "declared reviewer_checklist_ids",
      declaration.reviewer_checklist_ids,
    );
    if (index > 0) {
      const prior = traceabilityDeclarations[index - 1];
      if (
        !sameJson(declaration.prior, {
          guide_section_ids: prior.guide_section_ids,
          reviewer_checklist_ids: prior.reviewer_checklist_ids,
        })
      ) {
        throw new Error("Traceability inventory declaration chain is broken.");
      }
    }
  }
  const currentDeclaration = traceabilityDeclarations.at(-1);
  if (
    currentDeclaration &&
    (!sameJson(currentDeclaration.guide_section_ids, manifest.guide_section_ids) ||
      !sameJson(
        currentDeclaration.reviewer_checklist_ids,
        manifest.reviewer_checklist_ids,
      ))
  ) {
    throw new Error("Current traceability inventories do not match their declaration.");
  }

  const declarationAmendments = manifest.declaration_amendments ?? [];
  for (const [index, amendment] of declarationAmendments.entries()) {
    const matching = events.filter(
      (event) =>
        event.type === "manifest_declarations_amended" &&
        event.amendment_id === amendment.amendment_id,
    );
    if (matching.length !== 1) {
      throw new Error(`${amendment.amendment_id} event does not reconcile.`);
    }
    const eventComparable = { ...matching[0] };
    for (const key of ["schema_version", "event_id", "timestamp", "type", "run_id"]) {
      delete eventComparable[key];
    }
    if (!sameJson(eventComparable, amendment)) {
      throw new Error(`${amendment.amendment_id} values do not reconcile.`);
    }
    if (
      amendment.amendment_id !==
      `${manifest.run_id}:declarations:${String(index + 1).padStart(4, "0")}`
    ) {
      throw new Error("Manifest declaration amendment IDs are out of order.");
    }
    assertNonemptyString(`${amendment.amendment_id}.reason`, amendment.reason, 2_000);
    assertNonemptyString(
      `${amendment.amendment_id}.authority_basis`,
      amendment.authority_basis,
      2_000,
    );
    validateDeclaredRoleModeCoverage(amendment.roles, amendment.modes, []);
    for (const role of amendment.roles) {
      if (!ROLE_AUTHORITY_RANK.has(role)) {
        throw new Error(`${amendment.amendment_id} has unknown role ${role}.`);
      }
    }
    if (index > 0) {
      const prior = declarationAmendments[index - 1];
      if (
        !sameJson(amendment.previous_roles, prior.roles) ||
        !sameJson(amendment.previous_modes, prior.modes)
      ) {
        throw new Error(`${amendment.amendment_id} declaration chain is broken.`);
      }
    }
  }
  const currentDeclarationAmendment = declarationAmendments.at(-1);
  if (
    currentDeclarationAmendment &&
    (!sameJson(currentDeclarationAmendment.roles, manifest.roles) ||
      !sameJson(currentDeclarationAmendment.modes, manifest.modes))
  ) {
    throw new Error(
      "Current manifest declarations do not match their amendment history.",
    );
  }

  const environmentAmendments = manifest.environment_amendments ?? [];
  for (const [index, amendment] of environmentAmendments.entries()) {
    const matching = events.filter(
      (event) =>
        event.type === "environment_metadata_amended" &&
        event.amendment_id === amendment.amendment_id,
    );
    if (matching.length !== 1) {
      throw new Error(`${amendment.amendment_id} event does not reconcile.`);
    }
    const eventComparable = { ...matching[0] };
    for (const key of ["schema_version", "event_id", "timestamp", "type", "run_id"]) {
      delete eventComparable[key];
    }
    if (!sameJson(eventComparable, amendment)) {
      throw new Error(`${amendment.amendment_id} values do not reconcile.`);
    }
    if (
      amendment.amendment_id !==
      `${manifest.run_id}:environment:${String(index + 1).padStart(4, "0")}`
    ) {
      throw new Error("Environment amendment IDs are out of order.");
    }
    assertNonemptyString(`${amendment.amendment_id}.reason`, amendment.reason, 2_000);
    validateEnvironmentMetadataChanges(
      amendment.changes,
      `${amendment.amendment_id}.changes`,
    );
    assertPlainObject(
      `${amendment.amendment_id}.previous_values`,
      amendment.previous_values,
    );
    if (
      !sameJson(Object.keys(amendment.previous_values), Object.keys(amendment.changes))
    ) {
      throw new Error(`${amendment.amendment_id} previous-value keys do not reconcile.`);
    }
    for (const field of Object.keys(amendment.changes)) {
      const priorChange = environmentAmendments
        .slice(0, index)
        .reverse()
        .find((candidate) => Object.hasOwn(candidate.changes, field));
      if (
        priorChange &&
        amendment.previous_values[field] !== priorChange.changes[field]
      ) {
        throw new Error(`${amendment.amendment_id}.${field} history is broken.`);
      }
    }
  }
  for (const field of ENVIRONMENT_AMENDABLE_FIELDS) {
    const latest = [...environmentAmendments]
      .reverse()
      .find((amendment) => Object.hasOwn(amendment.changes, field));
    if (latest && manifest.environment[field] !== latest.changes[field]) {
      throw new Error(`Current environment.${field} does not match amendment history.`);
    }
  }

  const definitionAmendments = manifest.case_definition_amendments ?? [];
  for (const [index, amendment] of definitionAmendments.entries()) {
    const matching = events.filter(
      (event) =>
        event.type === "case_definition_amended" &&
        event.amendment_id === amendment.amendment_id,
    );
    if (matching.length !== 1) {
      throw new Error(`${amendment.amendment_id} event does not reconcile.`);
    }
    for (const field of [
      "case_id",
      "reason",
      "authority_basis",
      "changed_fields",
      "previous_definition",
      "definition",
    ]) {
      if (!sameJson(matching[0][field], amendment[field])) {
        throw new Error(`${amendment.amendment_id}.${field} does not reconcile.`);
      }
    }
    if (
      amendment.amendment_id !==
      `${manifest.run_id}:definition:${String(index + 1).padStart(4, "0")}`
    ) {
      throw new Error("Case-definition amendment IDs are out of order.");
    }
    const changed = Object.keys(amendment.previous_definition).filter(
      (field) =>
        !sameJson(amendment.previous_definition[field], amendment.definition[field]),
    );
    if (
      changed.some((field) => !CASE_DEFINITION_AMENDABLE_FIELDS.has(field)) ||
      !sameJson([...changed].sort(), [...amendment.changed_fields].sort())
    ) {
      throw new Error(`${amendment.amendment_id} changes forbidden case metadata.`);
    }
    if (changed.includes("safe_alias") && !changed.includes("mutation_kind")) {
      throw new Error(`${amendment.amendment_id} changes safe_alias in isolation.`);
    }
    if (changed.includes("mutation_kind")) {
      assertNonemptyString(
        `${amendment.amendment_id}.authority_basis`,
        amendment.authority_basis,
        2_000,
      );
    }
    if (changed.includes("role")) {
      if (
        authorityRankOrThrow("role", amendment.definition.role, ROLE_AUTHORITY_RANK) >
        authorityRankOrThrow(
          "role",
          amendment.previous_definition.role,
          ROLE_AUTHORITY_RANK,
        )
      ) {
        throw new Error(`${amendment.amendment_id} broadens role authority.`);
      }
    }
    if (changed.includes("data_mode")) {
      if (
        authorityRankOrThrow(
          "mode",
          amendment.definition.data_mode,
          MODE_AUTHORITY_RANK,
        ) >
        authorityRankOrThrow(
          "mode",
          amendment.previous_definition.data_mode,
          MODE_AUTHORITY_RANK,
        )
      ) {
        throw new Error(`${amendment.amendment_id} broadens data-mode authority.`);
      }
    }
    const priorForCase = definitionAmendments
      .slice(0, index)
      .filter((candidate) => candidate.case_id === amendment.case_id)
      .at(-1);
    if (
      priorForCase &&
      !sameJson(priorForCase.definition, amendment.previous_definition)
    ) {
      throw new Error(`${amendment.amendment_id} does not continue its case chain.`);
    }
  }
  for (const auditCase of manifest.case_inventory) {
    const latest = definitionAmendments
      .filter((amendment) => amendment.case_id === auditCase.id)
      .at(-1);
    if (
      latest &&
      !sameJson(
        latest.definition,
        caseDefinitionsFromManifest({ case_inventory: [auditCase] })[0],
      )
    ) {
      throw new Error(`${auditCase.id} does not match its latest definition amendment.`);
    }
  }

  const inventoryExtensions = manifest.inventory_extensions ?? [];
  const extendedCaseIds = new Set();
  for (const extension of inventoryExtensions) {
    if (!Array.isArray(extension.case_ids) || extension.case_ids.length === 0) {
      throw new Error(`${extension.extension_id} has no appended cases.`);
    }
    for (const caseId of extension.case_ids) {
      findCase(manifest, caseId);
      if (extendedCaseIds.has(caseId)) {
        throw new Error(`Case ${caseId} appears in multiple inventory extensions.`);
      }
      extendedCaseIds.add(caseId);
    }
    const matches = events.filter(
      (event) =>
        event.type === "case_inventory_extended" &&
        event.extension_id === extension.extension_id,
    );
    if (
      matches.length !== 1 ||
      !sameJson(matches[0].case_ids, extension.case_ids) ||
      !sameJson(
        matches[0].preserved_definition_drift ?? [],
        extension.preserved_definition_drift ?? [],
      )
    ) {
      throw new Error(`${extension.extension_id} event does not reconcile.`);
    }
  }
  if (events[0].case_count !== manifest.case_inventory.length - extendedCaseIds.size) {
    throw new Error("run_initialized case count does not reconcile with extensions.");
  }

  const intentKeys = new Set();
  for (const auditCase of manifest.case_inventory) {
    assertPlainObject(`${auditCase.id}.execution`, auditCase.execution);
    assertEnum(
      `${auditCase.id}.execution.status`,
      auditCase.execution.status,
      CASE_STATUSES,
    );
    if (
      !Number.isInteger(auditCase.execution.attempt_count) ||
      auditCase.execution.attempt_count < 1
    ) {
      throw new Error(`${auditCase.id} has an invalid attempt count.`);
    }
    const intent = auditCase.execution.mutation_intent;
    const effect = auditCase.execution.effect_checkpoint;
    if (intent) {
      if (intentKeys.has(intent.mutation_key)) {
        throw new Error(`Duplicate mutation key ${intent.mutation_key}.`);
      }
      intentKeys.add(intent.mutation_key);
      if (manifest.effect_registry[intent.mutation_key] !== auditCase.id) {
        throw new Error(`Effect registry does not reconcile for ${auditCase.id}.`);
      }
      const intentEvents = events.filter(
        (event) =>
          event.type === "mutation_intent_checkpointed" &&
          event.case_id === auditCase.id &&
          event.mutation_key === intent.mutation_key,
      );
      for (const event of intentEvents) {
        assertOnlyKeys(
          "mutation_intent_checkpointed",
          event,
          new Set([
            "schema_version",
            "event_id",
            "timestamp",
            "type",
            "run_id",
            "case_id",
            "mutation_key",
            "safe_alias",
            "planned_effect",
            "recovered_during_resume",
          ]),
        );
      }
      if (
        intentEvents.length !== 1 ||
        intentEvents[0].safe_alias !== intent.safe_alias ||
        intentEvents[0].planned_effect !== intent.planned_effect
      ) {
        throw new Error(`Intent event does not reconcile for ${auditCase.id}.`);
      }
    }
    if (effect) {
      if (!intent || effect.mutation_key !== intent.mutation_key) {
        throw new Error(`Effect checkpoint has no matching intent for ${auditCase.id}.`);
      }
      if (effect.safe_alias !== intent.safe_alias) {
        throw new Error(`Effect alias does not reconcile for ${auditCase.id}.`);
      }
      const effectEvents = events.filter(
        (event) =>
          event.type === "test_effect_observed" &&
          event.case_id === auditCase.id &&
          event.mutation_key === effect.mutation_key,
      );
      for (const event of effectEvents) {
        assertOnlyKeys(
          "test_effect_observed",
          event,
          new Set([
            "schema_version",
            "event_id",
            "timestamp",
            "type",
            "run_id",
            "case_id",
            "mutation_key",
            "record_type",
            "record_id",
            "safe_alias",
            "outcome",
            "adopted_after_readback",
            "recovered_during_resume",
          ]),
        );
      }
      if (effectEvents.length !== 1) {
        throw new Error(`Effect event does not reconcile for ${auditCase.id}.`);
      }
      for (const field of ["record_type", "record_id", "safe_alias", "outcome"]) {
        if (effectEvents[0][field] !== effect[field]) {
          throw new Error(`Effect event values do not reconcile for ${auditCase.id}.`);
        }
      }
    }
    const recovery = auditCase.execution.intent_recovery;
    if (recovery) {
      const readbacks = events.filter(
        (event) =>
          event.type === "mutation_readback_observed" &&
          event.case_id === auditCase.id &&
          event.mutation_key === intent?.mutation_key,
      );
      const recoveryType =
        recovery.outcome === "effect_found"
          ? "mutation_intent_adopted"
          : "mutation_replay_authorized";
      const resolutions = events.filter(
        (event) =>
          event.type === recoveryType &&
          event.case_id === auditCase.id &&
          event.mutation_key === intent?.mutation_key,
      );
      if (
        readbacks.length !== 1 ||
        resolutions.length !== 1 ||
        readbacks[0].state_hash !== recovery.state_hash ||
        resolutions[0].state_hash !== recovery.state_hash
      ) {
        throw new Error(`${auditCase.id} intent readback does not reconcile.`);
      }
      if (recovery.outcome === "effect_found" && !effect?.adopted_after_readback) {
        throw new Error(`${auditCase.id} readback effect was not adopted.`);
      }
    }
    const reversible = auditCase.execution.reversible_effect_checkpoint;
    if (reversible) {
      for (const field of ["before_hash", "change_hash", "restore_hash"]) {
        assertSha256(`${auditCase.id}.${field}`, reversible[field]);
      }
      if (
        reversible.restore_outcome === "restored" &&
        reversible.before_hash !== reversible.restore_hash
      ) {
        throw new Error(`${auditCase.id} restore hash does not match its baseline.`);
      }
      const reversibleEvents = events.filter(
        (event) =>
          event.type === "reversible_effect_verified" &&
          event.case_id === auditCase.id &&
          event.mutation_key === reversible.mutation_key,
      );
      if (reversibleEvents.length !== 1) {
        throw new Error(`${auditCase.id} reversible-effect event does not reconcile.`);
      }
    }

    const initialEvents = events.filter(
      (event) =>
        ["case_completed", "case_blocked"].includes(event.type) &&
        event.case_id === auditCase.id,
    );
    if (initialEvents.length !== 1) {
      throw new Error(`${auditCase.id} must have exactly one initial terminal event.`);
    }
    const initialEvent = initialEvents[0];
    const amendments = events.filter(
      (event) => event.type === "case_result_amended" && event.case_id === auditCase.id,
    );
    let effectiveStatus;
    let effectiveResult;
    let replayStartIndex;
    if (initialEvent.result) {
      effectiveStatus = initialEvent.status;
      effectiveResult = structuredClone(initialEvent.result);
      replayStartIndex = events.indexOf(initialEvent) + 1;
    } else if (amendments.length > 0) {
      effectiveStatus = amendments[0].previous_status;
      effectiveResult = structuredClone(amendments[0].previous_result);
      replayStartIndex = events.indexOf(amendments[0]);
      if (
        initialEvent.current_behavior_result !==
          effectiveResult.current_behavior_result ||
        initialEvent.process_alignment_result !== effectiveResult.process_alignment_result
      ) {
        throw new Error(`${auditCase.id} legacy terminal event does not reconcile.`);
      }
    } else {
      effectiveStatus = auditCase.execution.status;
      effectiveResult = structuredClone(auditCase.execution.result);
      replayStartIndex = events.length;
      if (
        initialEvent.current_behavior_result !==
          effectiveResult.current_behavior_result ||
        initialEvent.process_alignment_result !== effectiveResult.process_alignment_result
      ) {
        throw new Error(`${auditCase.id} terminal event does not reconcile.`);
      }
      const evidenceAmendments = events.filter(
        (event) =>
          event.type === "case_evidence_amended" && event.case_id === auditCase.id,
      );
      const expectedEvidence =
        evidenceAmendments.at(-1)?.evidence_references ??
        initialEvent.evidence_references;
      if (!sameJson(expectedEvidence, effectiveResult.evidence_references)) {
        throw new Error(`${auditCase.id} evidence amendments do not reconcile.`);
      }
    }
    for (const event of events.slice(replayStartIndex)) {
      if (event.case_id !== auditCase.id) continue;
      if (event.type === "case_evidence_amended") {
        effectiveResult.evidence_references = event.evidence_references;
      } else if (event.type === "case_retry_metadata_amended") {
        effectiveResult.clean_retry = event.clean_retry;
      } else if (event.type === "case_result_amended") {
        if (
          event.previous_status !== effectiveStatus ||
          !sameJson(event.previous_result, effectiveResult)
        ) {
          throw new Error(`${event.amendment_id} does not continue its result chain.`);
        }
        effectiveStatus = event.status;
        effectiveResult = structuredClone(event.result);
      }
    }
    if (
      effectiveStatus !== auditCase.execution.status ||
      !sameJson(effectiveResult, auditCase.execution.result)
    ) {
      throw new Error(`${auditCase.id} current result does not match its event history.`);
    }
    const result = auditCase.execution.result;
    validateResultShape(auditCase, result, `${auditCase.id}.result`);
    if (
      (auditCase.execution.status === "blocked") !==
      (result.current_behavior_result === "blocked")
    ) {
      throw new Error(`${auditCase.id} terminal status does not match its result.`);
    }
    if (
      auditCase.mutation_kind !== "read" &&
      !["blocked", "not_reachable"].includes(result.current_behavior_result) &&
      (!intent || !effect)
    ) {
      throw new Error(`${auditCase.id} mutation checkpoints are incomplete.`);
    }
    if (
      auditCase.mutation_kind === "reversible_app_write" &&
      !["blocked", "not_reachable"].includes(result.current_behavior_result) &&
      !reversible
    ) {
      throw new Error(`${auditCase.id} has no reversible-effect verification.`);
    }
    if ((auditCase.execution.result_amendment_count ?? 0) !== amendments.length) {
      throw new Error(`${auditCase.id} result amendment count does not reconcile.`);
    }
    if (
      amendments.length > 0 &&
      !sameJson(auditCase.execution.last_result_amendment, {
        ...amendments.at(-1),
        schema_version: undefined,
        event_id: undefined,
        timestamp: undefined,
        type: undefined,
        run_id: undefined,
      })
    ) {
      const eventComparable = { ...amendments.at(-1) };
      for (const key of ["schema_version", "event_id", "timestamp", "type", "run_id"]) {
        delete eventComparable[key];
      }
      if (!sameJson(auditCase.execution.last_result_amendment, eventComparable)) {
        throw new Error(`${auditCase.id} latest result amendment does not reconcile.`);
      }
    }
  }
  assertAllCurrentDependencyInvariants(manifest);
  const effectRegistryKeys = Object.keys(manifest.effect_registry);
  if (
    effectRegistryKeys.length !== intentKeys.size ||
    effectRegistryKeys.some((mutationKey) => !intentKeys.has(mutationKey))
  ) {
    throw new Error("Effect registry contains an orphan or missing mutation key.");
  }

  const registryKeys = new Set();
  for (const entry of manifest.test_record_registry) {
    if (registryKeys.has(entry.mutation_key)) {
      throw new Error(`Duplicate Test record registry key ${entry.mutation_key}.`);
    }
    registryKeys.add(entry.mutation_key);
    const auditCase = findCase(manifest, entry.case_id);
    const effect = auditCase.execution.effect_checkpoint;
    if (
      effect?.mutation_key !== entry.mutation_key ||
      effect.safe_alias !== entry.safe_alias ||
      effect.record_id !== entry.record_id
    ) {
      throw new Error(`Test record registry does not reconcile for ${entry.case_id}.`);
    }
  }
  const effectKeys = new Set(
    manifest.case_inventory
      .map((auditCase) => auditCase.execution.effect_checkpoint?.mutation_key)
      .filter(Boolean),
  );
  if (
    registryKeys.size !== effectKeys.size ||
    [...effectKeys].some((mutationKey) => !registryKeys.has(mutationKey))
  ) {
    throw new Error("Test record registry is missing an effect checkpoint.");
  }

  const findingIds = new Set();
  for (const finding of findings) {
    if (findingIds.has(finding.finding_id)) {
      throw new Error(`Duplicate finding ID ${finding.finding_id}.`);
    }
    findingIds.add(finding.finding_id);
    const auditCase = findCase(manifest, finding.case_id);
    validateNormalizedFindingRecord(finding, auditCase);
    if (
      auditCase.execution.result.current_behavior_result !==
        finding.current_behavior_result ||
      auditCase.execution.result.process_alignment_result !==
        finding.process_alignment_result
    ) {
      throw new Error(`${finding.finding_id} does not reconcile with its case result.`);
    }
  }
  if (manifest.capabilities?.finding_lifecycle_events) {
    const current = new Map();
    for (const event of events) {
      if (event.type === "finding_recorded") {
        const auditCase = findCase(manifest, event.finding.case_id);
        validateNormalizedFindingRecord(event.finding, auditCase, false);
        if (current.has(event.finding.finding_id)) {
          throw new Error(`Finding ${event.finding.finding_id} was recorded twice.`);
        }
        current.set(event.finding.finding_id, structuredClone(event.finding));
      } else if (event.type === "finding_retracted") {
        const prior = current.get(event.finding.finding_id);
        if (!prior || !sameJson(prior, event.finding)) {
          throw new Error(
            `Finding retraction ${event.finding.finding_id} has no current source.`,
          );
        }
        current.delete(event.finding.finding_id);
      } else if (event.type === "finding_replaced") {
        const prior = current.get(event.previous_finding.finding_id);
        if (!prior || !sameJson(prior, event.previous_finding)) {
          throw new Error(
            `Finding replacement ${event.previous_finding.finding_id} has no current source.`,
          );
        }
        current.delete(event.previous_finding.finding_id);
        if (current.has(event.finding.finding_id)) {
          throw new Error(
            `Finding replacement collides with ${event.finding.finding_id}.`,
          );
        }
        current.set(event.finding.finding_id, structuredClone(event.finding));
      } else if (event.type === "case_retry_metadata_amended") {
        for (const finding of current.values()) {
          if (finding.case_id === event.case_id) {
            finding.reproduced_after_clean_retry = event.reproduced_after_clean_retry;
          }
        }
      }
    }
    if (!sameJson([...current.values()], findings)) {
      throw new Error("findings.jsonl is not the current normalized findings view.");
    }
  }
  for (const auditCase of manifest.case_inventory) {
    const result = auditCase.execution.result;
    const caseFindings = findings.filter((finding) => finding.case_id === auditCase.id);
    const needsFinding =
      ["fail", "blocked", "not_reachable", "audit_harness_failure"].includes(
        result.current_behavior_result,
      ) || ["partial", "gap", "blocked"].includes(result.process_alignment_result);
    if (needsFinding && caseFindings.length === 0) {
      throw new Error(`${auditCase.id} requires a normalized finding.`);
    }
    if (
      (result.current_behavior_result === "blocked" ||
        result.process_alignment_result === "blocked") &&
      !result.blocker &&
      !caseFindings.some((finding) => finding.blocker)
    ) {
      throw new Error(`${auditCase.id} requires precise blocker details.`);
    }
  }

  const retryGroups = new Map();
  for (const event of events.filter((candidate) =>
    candidate.type.startsWith("transient_attempt_"),
  )) {
    const commonKeys = [
      "schema_version",
      "event_id",
      "timestamp",
      "type",
      "run_id",
      "case_id",
      "operation_id",
      "attempt",
      "max_attempts",
    ];
    assertOnlyKeys(
      event.type,
      event,
      new Set([
        ...commonKeys,
        ...(event.type === "transient_attempt_failed"
          ? [
              "transient",
              "error_hash",
              "interrupted_during_resume",
              "recovered_during_resume",
            ]
          : []),
      ]),
    );
    const key = `${event.case_id}:${event.operation_id}`;
    const group = retryGroups.get(key) ?? [];
    group.push(event);
    retryGroups.set(key, group);
  }
  for (const [key, group] of retryGroups) {
    const starts = group.filter((event) => event.type === "transient_attempt_started");
    if (starts.length === 0 || starts.length > 5) {
      throw new Error(`${key} has an invalid bounded retry count.`);
    }
    for (let attempt = 1; attempt <= starts.length; attempt += 1) {
      const started = starts.find((event) => event.attempt === attempt);
      const outcomes = group.filter(
        (event) =>
          ["transient_attempt_failed", "transient_attempt_succeeded"].includes(
            event.type,
          ) && event.attempt === attempt,
      );
      if (!started || outcomes.length !== 1) {
        throw new Error(`${key} attempt ${attempt} has no unique outcome.`);
      }
      if (outcomes[0].type === "transient_attempt_failed") {
        assertSha256(`${key} attempt error`, outcomes[0].error_hash);
        if (!outcomes[0].transient && attempt < starts.length) {
          throw new Error(`${key} retried a non-transient failure.`);
        }
      } else if (attempt !== starts.length) {
        throw new Error(`${key} continued after a successful attempt.`);
      }
    }
  }
  for (const event of events.filter(
    (candidate) => candidate.type === "audit_harness_failure_observed",
  )) {
    assertOnlyKeys(
      "audit_harness_failure_observed",
      event,
      new Set([
        "schema_version",
        "event_id",
        "timestamp",
        "type",
        "run_id",
        "case_id",
        "evidence_id",
        "stage",
        "failure_class",
        "failure_hash",
      ]),
    );
    const auditCase = findCase(manifest, event.case_id);
    if (!event.evidence_id.startsWith(`${auditCase.id}-`)) {
      throw new Error(`${event.evidence_id} does not belong to ${auditCase.id}.`);
    }
    assertNonemptyString("harness failure stage", event.stage, 500);
    assertNonemptyString("harness failure class", event.failure_class, 500);
    assertSha256("harness failure hash", event.failure_hash);
  }

  assertValueSafe(manifest, "manifest.json");
  assertValueSafe(events, "events.jsonl");
  assertValueSafe(findings, "findings.jsonl");
  assertValueSafe(summary, "summary.json");
  assertValueSafe(report, "run-report.md");
  const reconciled = buildSummary(manifest, findings, new Date(summary.generated_at));
  if (!sameJson(summary, reconciled)) {
    throw new Error("summary.json does not fully reconcile with the manifest/findings.");
  }
  if (report !== reportMarkdown(manifest, summary, findings)) {
    throw new Error("run-report.md does not reconcile with structured evidence.");
  }
  const evidenceCounts = await validateEvidenceAssets(files, manifest, events, findings);
  const sidecarCounts = await validateDeclaredAuditSidecars(files, manifest, events, {
    requireTerminal: true,
  });
  if (manifest.status !== "completed" || summary.status !== "completed") {
    throw new Error("Run is not completed.");
  }
  return {
    ok: true,
    run_id: manifest.run_id,
    case_count: manifest.case_inventory.length,
    event_count: events.length,
    finding_count: findings.length,
    screenshot_count: evidenceCounts.screenshotCount,
    dom_evidence_count: evidenceCounts.domEvidenceCount,
    structured_evidence_count: evidenceCounts.structuredEvidenceCount,
    declaration_amendment_count: declarationAmendments.length,
    enum_migration_count: enumMigrations.length,
    environment_amendment_count: environmentAmendments.length,
    completion_cycles: reopenCount + 1,
    auth_identity_count: sidecarCounts.auth_preflight ?? 0,
    remediation_ledger_count: sidecarCounts.remediation_ledger ?? 0,
    capability_matrix_count: sidecarCounts.capability_matrix ?? 0,
  };
}

function parseArgs(argv) {
  const [command = "help", ...tokens] = argv;
  const options = {};
  for (const token of tokens) {
    if (!token.startsWith("--") || !token.includes("="))
      throw new Error(`Invalid argument: ${token}.`);
    const [name, ...rest] = token.slice(2).split("=");
    if (name in options) throw new Error(`Duplicate argument: --${name}.`);
    options[name] = rest.join("=");
  }
  return { command, options };
}

function decodePayload(encoded) {
  assertNonemptyString("payload", encoded, 2_000_000);
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
}

async function readCommandPayload(options) {
  const sources = [options.payload != null, options.file != null].filter(Boolean);
  if (sources.length !== 1) {
    throw new Error("Provide exactly one of --payload or --file.");
  }
  return options.file
    ? readJson(path.resolve(options.file))
    : decodePayload(options.payload);
}

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === "init") {
    const environment = decodePayload(options.environment);
    const roles = decodePayload(options.roles);
    const modes = decodePayload(options.modes);
    const initialized = await initializeAuditRun({
      baseDir: options["base-dir"] ? path.resolve(options["base-dir"]) : undefined,
      runId: options["run-id"],
      environment,
      guideSource: options.guide,
      roles,
      modes,
    });
    console.log(
      JSON.stringify({
        run_dir: initialized.runDir,
        run_id: initialized.manifest.run_id,
        resumed: initialized.resumed,
        preserved_definition_drift: initialized.preserved_definition_drift ?? [],
        untracked_source_case_ids: initialized.untracked_source_case_ids ?? [],
        missing_source_case_ids: initialized.missing_source_case_ids ?? [],
      }),
    );
    return;
  }
  if (command === "reopen") {
    const result = await reopenAuditRun(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        run_id: result.manifest.run_id,
      }),
    );
    return;
  }
  if (command === "reopen-case") {
    const result = await reopenBlockedMutationCase(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        active: result.active,
        case_id: result.auditCase.id,
        authorization_id: result.authorization.authorization_id,
      }),
    );
    return;
  }
  if (command === "amend-declarations") {
    const result = await amendManifestDeclarations(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        roles: result.manifest.roles,
        modes: result.manifest.modes,
      }),
    );
    return;
  }
  if (command === "migrate-enums") {
    const result = await migrateManifestEnums(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        repaired: result.repaired,
        migrated_fields: result.migrated_fields,
      }),
    );
    return;
  }
  if (command === "amend-environment") {
    const result = await amendEnvironmentMetadata(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        environment: result.manifest.environment,
      }),
    );
    return;
  }
  if (command === "declare-traceability") {
    const result = await declareTraceabilityInventory(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(JSON.stringify({ idempotent: result.idempotent }));
    return;
  }
  if (command === "checkpoint-auth") {
    const result = await checkpointAuthPreflight(
      path.resolve(options["run-dir"]),
      await readCommandPayload(options),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        revision: result.checkpoint.revision,
        entry_count: result.checkpoint.entry_count,
        artifact_hash: result.checkpoint.artifact_hash,
      }),
    );
    return;
  }
  if (command === "bootstrap-ledger") {
    const result = await bootstrapRemediationLedger(
      path.resolve(options["run-dir"]),
      path.resolve(options["source-run-dir"]),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        revision: result.checkpoint.revision,
        entry_count: result.checkpoint.entry_count,
        artifact_hash: result.checkpoint.artifact_hash,
      }),
    );
    return;
  }
  if (command === "checkpoint-ledger") {
    const result = await checkpointRemediationLedger(
      path.resolve(options["run-dir"]),
      await readCommandPayload(options),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        revision: result.checkpoint.revision,
        entry_count: result.checkpoint.entry_count,
        artifact_hash: result.checkpoint.artifact_hash,
      }),
    );
    return;
  }
  if (command === "amend-ledger") {
    const result = await amendRemediationLedgerEntries(
      path.resolve(options["run-dir"]),
      await readCommandPayload(options),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        revision: result.checkpoint.revision,
        entry_count: result.checkpoint.entry_count,
        artifact_hash: result.checkpoint.artifact_hash,
      }),
    );
    return;
  }
  if (command === "bootstrap-matrix") {
    const result = await bootstrapCapabilityMatrix(path.resolve(options["run-dir"]));
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        revision: result.checkpoint.revision,
        entry_count: result.checkpoint.entry_count,
        artifact_hash: result.checkpoint.artifact_hash,
      }),
    );
    return;
  }
  if (command === "checkpoint-matrix") {
    const result = await checkpointCapabilityMatrix(
      path.resolve(options["run-dir"]),
      await readCommandPayload(options),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        revision: result.checkpoint.revision,
        entry_count: result.checkpoint.entry_count,
        artifact_hash: result.checkpoint.artifact_hash,
      }),
    );
    return;
  }
  if (command === "amend-matrix") {
    const result = await amendCapabilityMatrixEntries(
      path.resolve(options["run-dir"]),
      await readCommandPayload(options),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        revision: result.checkpoint.revision,
        entry_count: result.checkpoint.entry_count,
        artifact_hash: result.checkpoint.artifact_hash,
      }),
    );
    return;
  }
  if (command === "intent") {
    const result = await checkpointMutationIntent(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({ idempotent: result.idempotent, case_id: result.auditCase.id }),
    );
    return;
  }
  if (command === "extend") {
    const result = await extendAuditCaseInventory(path.resolve(options["run-dir"]));
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        added_case_ids: result.added_case_ids,
        preserved_definition_drift: result.preserved_definition_drift,
      }),
    );
    return;
  }
  if (command === "effect") {
    const result = await recordTestEffect(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({ idempotent: result.idempotent, case_id: result.auditCase.id }),
    );
    return;
  }
  if (command === "recover-intent") {
    const result = await resolveAmbiguousMutationIntent(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({ idempotent: result.idempotent, outcome: result.outcome }),
    );
    return;
  }
  if (command === "reversible-effect") {
    const result = await recordReversibleEffectCheckpoint(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({ idempotent: result.idempotent, case_id: result.auditCase.id }),
    );
    return;
  }
  if (command === "dom-evidence") {
    const result = await recordDomEvidence(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        evidence_id: result.evidence.evidence_id,
        reference: result.reference,
      }),
    );
    return;
  }
  if (command === "structured-evidence") {
    const result = await recordStructuredEvidence(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        evidence_id: result.evidence.evidence_id,
        reference: result.reference,
      }),
    );
    return;
  }
  if (command === "harness-failure-evidence") {
    const result = await recordHarnessFailureEvidence(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        reference: result.reference,
      }),
    );
    return;
  }
  if (command === "evidence") {
    const result = await amendCaseEvidenceReferences(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({ idempotent: result.idempotent, case_id: result.auditCase.id }),
    );
    return;
  }
  if (command === "retry") {
    const result = await amendCaseRetryMetadata(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({ idempotent: result.idempotent, case_id: result.auditCase.id }),
    );
    return;
  }
  if (command === "record") {
    const result = await recordCaseResult(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({ idempotent: result.idempotent, case_id: result.auditCase.id }),
    );
    return;
  }
  if (command === "amend-result") {
    const result = await amendCaseResult(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({ idempotent: result.idempotent, case_id: result.auditCase.id }),
    );
    return;
  }
  if (command === "amend-case-definition") {
    const result = await amendCaseDefinition(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({ idempotent: result.idempotent, case_id: result.auditCase.id }),
    );
    return;
  }
  if (command === "finding") {
    const result = await recordFinding(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        finding_id: result.finding.finding_id,
      }),
    );
    return;
  }
  if (command === "retract-finding") {
    const result = await retractFinding(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        finding_id: result.finding.finding_id,
      }),
    );
    return;
  }
  if (command === "replace-finding") {
    const result = await replaceFinding(
      path.resolve(options["run-dir"]),
      decodePayload(options.payload),
    );
    console.log(
      JSON.stringify({
        idempotent: result.idempotent,
        finding_id: result.finding.finding_id,
      }),
    );
    return;
  }
  if (command === "finalize") {
    const result = await finalizeAuditRun(path.resolve(options["run-dir"]));
    console.log(
      JSON.stringify({ run_id: result.manifest.run_id, totals: result.summary.totals }),
    );
    return;
  }
  if (command === "validate") {
    console.log(JSON.stringify(await validateAuditRun(path.resolve(options["run-dir"]))));
    return;
  }
  if (command === "status") {
    const manifest = await readJson(runFiles(path.resolve(options["run-dir"])).manifest);
    const status = manifest.case_inventory.reduce((acc, auditCase) => {
      increment(acc, auditCase.execution.status);
      return acc;
    }, {});
    console.log(JSON.stringify({ run_id: manifest.run_id, status }));
    return;
  }
  const usage =
    "Usage: npm run audit:process -- <init|reopen|reopen-case|amend-declarations|migrate-enums|amend-environment|declare-traceability|checkpoint-auth|bootstrap-ledger|checkpoint-ledger|amend-ledger|bootstrap-matrix|checkpoint-matrix|amend-matrix|extend|intent|recover-intent|effect|reversible-effect|dom-evidence|structured-evidence|harness-failure-evidence|evidence|retry|record|amend-result|amend-case-definition|finding|retract-finding|replace-finding|status|finalize|validate> --name=value";
  if (command === "help") {
    console.log(usage);
    return;
  }
  throw new Error(`Unknown command ${command}. ${usage}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
