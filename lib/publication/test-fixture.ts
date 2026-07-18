import { createHash } from "node:crypto";
import { type Firestore } from "firebase-admin/firestore";
import { v7 as uuidv7 } from "uuid";

import { can } from "@/lib/auth/roles";
import type { AuthenticatedUser } from "@/lib/auth/session";
import { resolveDataMode } from "@/lib/data-mode";
import { getAdminFirestore } from "@/lib/firestore/admin";
import { EditableLayerError } from "@/lib/firestore/errors";
import { startWorkflowTestRun } from "@/lib/firestore/workflows";
import {
  PUBLICATION_POLICY_AUDIT_COLLECTION,
  PUBLICATION_POLICY_COLLECTION,
} from "@/lib/publication/policy";
import {
  PUBLICATION_COLLECTIONS,
  publishTrustedContent,
  rollbackTrustedPublication,
} from "@/lib/publication/service";
import {
  TEST_PUBLICATION_CONFIRMATIONS,
  TEST_PUBLICATION_FIXTURE_KEY,
  TEST_PUBLICATION_SPACE_ID,
} from "@/lib/publication/test-fixture-contract";
import type {
  PublicationMetadata,
  PublicationPolicyRecord,
  PublicationResourceRecord,
  PublicationScanner,
  PublicationVersionRecord,
} from "@/lib/publication/types";
import { canAccessSpaceId } from "@/lib/space-scope-resources";

export { TEST_PUBLICATION_CONFIRMATIONS };

export const TEST_PUBLICATION_POLICY_ID = "audit-test-publication-policy-v1";
export const TEST_PUBLICATION_RESOURCE_ID = "source:audit-test-publication-v1";
export const TEST_PUBLICATION_EXACT_SCANNER_KEY = "audit-test-exact-publication-v1";

const TEST_PUBLICATION_CAPTURE_TASK_COLLECTION = "audit_test_publication_capture_tasks";
const TEST_PUBLICATION_CONTINUATION_COLLECTION = "audit_test_publication_continuations";
const TEST_PUBLICATION_PROCESS_DEFINITION_ID = "lease-renewal";

const TEST_PUBLICATION_CONNECTOR_ID = "audit-test-publication-connector";
const TEST_PUBLICATION_ROOT_ID = "audit-test-publication-root";
const TEST_PUBLICATION_FILE_NAME = "repository-authorized-test-fixture.md";
const TEST_PUBLICATION_PATH = "audit-test-sources/repository-authorized-test-fixture.md";
const TEST_PUBLICATION_CITATION =
  "Repository-owned Test fixture contract · S21 trusted publication";

type FixtureRevision = "baseline" | "revision";

const EXACT_CONTENT: Readonly<Record<FixtureRevision, string>> = Object.freeze({
  baseline: exactContent("baseline", "The reversible baseline is active."),
  revision: exactContent("revision", "The exact Test revision is active."),
});

export interface TestPublicationFixtureStatus {
  active_revision: FixtureRevision | "unknown" | null;
  active_version_id: string | null;
  active_version_number: number | null;
  authority: "repository-owned exact Test fixture contract";
  baseline_version_id: string | null;
  capture_task_id: string | null;
  capture_task_status: "resolved" | null;
  continuation_ready: boolean;
  data_mode: "test";
  fixture_key: typeof TEST_PUBLICATION_FIXTURE_KEY;
  live_evidence_eligible: false;
  policy_ready: boolean;
  rollback_available: boolean;
  scanner_boundary: "exact-hash-only; no Live scanner claim";
  state: "missing" | "drifted" | "ready" | "revision_active";
  pinned_process_definition_version_id: string | null;
  pinned_publication_version_id: string | null;
  pinned_test_run_id: string | null;
  version_count: number;
}

export interface TestPublicationFixtureResult {
  changed: boolean;
  effect: "capture_linked" | "continued" | "published" | "rolled_back" | "unchanged";
  status: TestPublicationFixtureStatus;
}

interface TestPublicationCaptureTaskRecord {
  id: string;
  data_mode: "test";
  test_fixture_key: typeof TEST_PUBLICATION_FIXTURE_KEY;
  space_id: typeof TEST_PUBLICATION_SPACE_ID;
  status: "resolved";
  owner: "Test publication fixture Admin";
  due_state: "resolved before pinned Test continuation";
  exact_next_action: "start the version-pinned Test workflow run";
  publication_resource_id: typeof TEST_PUBLICATION_RESOURCE_ID;
  publication_version_id: string;
  live_evidence_eligible: false;
  created_at: string;
  updated_at: string;
}

interface TestPublicationContinuationRecord {
  id: string;
  data_mode: "test";
  test_fixture_key: typeof TEST_PUBLICATION_FIXTURE_KEY;
  capture_task_id: string;
  publication_resource_id: typeof TEST_PUBLICATION_RESOURCE_ID;
  publication_version_id: string;
  process_definition_id: typeof TEST_PUBLICATION_PROCESS_DEFINITION_ID;
  process_definition_version_id: string;
  workflow_run_id: string;
  live_evidence_eligible: false;
  receipt_identity: string;
  created_at: string;
  updated_at: string;
}

export async function inspectTestPublicationFixture(
  actor: AuthenticatedUser,
  db: Firestore = getAdminFirestore(),
): Promise<TestPublicationFixtureStatus> {
  assertFixtureAdmin(actor);
  return readFixtureStatus(db);
}

export async function restoreTestPublicationBaseline(
  actor: AuthenticatedUser,
  confirmation: string,
  db: Firestore = getAdminFirestore(),
  now = Date.now(),
): Promise<TestPublicationFixtureResult> {
  assertFixtureAdmin(actor);
  assertConfirmation(confirmation, TEST_PUBLICATION_CONFIRMATIONS.restoreBaseline);
  const policy = await ensureTestPublicationPolicy(actor, db, now);
  const current = await readFixtureStatus(db);
  if (current.state === "ready") {
    if (!current.active_version_id) {
      throw new EditableLayerError(
        "The Test publication baseline has no active immutable version.",
        409,
      );
    }
    const captureAlreadyLinked =
      current.capture_task_status === "resolved" &&
      current.pinned_publication_version_id === current.active_version_id;
    await ensureTestPublicationCaptureTask(actor, current.active_version_id, db, now);
    return {
      changed: !captureAlreadyLinked,
      effect: captureAlreadyLinked ? "unchanged" : "capture_linked",
      status: await readFixtureStatus(db),
    };
  }

  if (current.baseline_version_id) {
    await rollbackTrustedPublication(
      actor,
      TEST_PUBLICATION_RESOURCE_ID,
      current.baseline_version_id,
      "Restore the repository-authorized Test publication baseline.",
      db,
    );
    const restored = await readFixtureStatus(db);
    if (!restored.active_version_id) {
      throw new EditableLayerError(
        "Test baseline rollback has no readback version.",
        409,
      );
    }
    await ensureTestPublicationCaptureTask(actor, restored.active_version_id, db, now);
    return {
      changed: true,
      effect: "rolled_back",
      status: await readFixtureStatus(db),
    };
  }

  await publishFixtureRevision(actor, policy, "baseline", db);
  const published = await readFixtureStatus(db);
  if (!published.active_version_id) {
    throw new EditableLayerError(
      "Test baseline publication has no readback version.",
      409,
    );
  }
  await ensureTestPublicationCaptureTask(actor, published.active_version_id, db, now);
  return {
    changed: true,
    effect: "published",
    status: await readFixtureStatus(db),
  };
}

export async function publishTestPublicationRevision(
  actor: AuthenticatedUser,
  confirmation: string,
  db: Firestore = getAdminFirestore(),
  now = Date.now(),
): Promise<TestPublicationFixtureResult> {
  assertFixtureAdmin(actor);
  assertConfirmation(confirmation, TEST_PUBLICATION_CONFIRMATIONS.publishRevision);
  const policy = await ensureTestPublicationPolicy(actor, db, now);
  const current = await readFixtureStatus(db);
  if (!current.baseline_version_id) {
    throw new EditableLayerError(
      "Restore the Test publication baseline before publishing its revision.",
      409,
    );
  }
  if (current.state === "revision_active") {
    if (!current.active_version_id) {
      throw new EditableLayerError("Test revision has no active readback version.", 409);
    }
    const captureAlreadyLinked = current.capture_task_status === "resolved";
    await ensureTestPublicationCaptureTask(actor, current.active_version_id, db, now);
    return {
      changed: !captureAlreadyLinked,
      effect: captureAlreadyLinked ? "unchanged" : "capture_linked",
      status: await readFixtureStatus(db),
    };
  }
  if (current.state !== "ready") {
    throw new EditableLayerError(
      "Restore the Test publication baseline before publishing its revision.",
      409,
    );
  }

  await publishFixtureRevision(actor, policy, "revision", db);
  const published = await readFixtureStatus(db);
  if (!published.active_version_id) {
    throw new EditableLayerError(
      "Test revision publication has no readback version.",
      409,
    );
  }
  await ensureTestPublicationCaptureTask(actor, published.active_version_id, db, now);
  return {
    changed: true,
    effect: "published",
    status: await readFixtureStatus(db),
  };
}

export async function rollbackTestPublicationToBaseline(
  actor: AuthenticatedUser,
  confirmation: string,
  db: Firestore = getAdminFirestore(),
  now = Date.now(),
): Promise<TestPublicationFixtureResult> {
  assertFixtureAdmin(actor);
  assertConfirmation(confirmation, TEST_PUBLICATION_CONFIRMATIONS.rollbackBaseline);
  await ensureTestPublicationPolicy(actor, db, now);
  const current = await readFixtureStatus(db);
  if (current.state === "ready") {
    if (!current.active_version_id) {
      throw new EditableLayerError("Test baseline has no active readback version.", 409);
    }
    const captureAlreadyLinked = current.capture_task_status === "resolved";
    await ensureTestPublicationCaptureTask(actor, current.active_version_id, db, now);
    return {
      changed: !captureAlreadyLinked,
      effect: captureAlreadyLinked ? "unchanged" : "capture_linked",
      status: await readFixtureStatus(db),
    };
  }
  if (!current.baseline_version_id || current.state !== "revision_active") {
    throw new EditableLayerError(
      "A validated Test revision and baseline are required before rollback.",
      409,
    );
  }

  await rollbackTrustedPublication(
    actor,
    TEST_PUBLICATION_RESOURCE_ID,
    current.baseline_version_id,
    "Roll back the exact Test publication revision to its baseline.",
    db,
  );
  const rolledBack = await readFixtureStatus(db);
  if (!rolledBack.active_version_id) {
    throw new EditableLayerError("Test rollback has no readback version.", 409);
  }
  await ensureTestPublicationCaptureTask(actor, rolledBack.active_version_id, db, now);
  return {
    changed: true,
    effect: "rolled_back",
    status: await readFixtureStatus(db),
  };
}

export async function continueTestPublicationToPinnedRun(
  actor: AuthenticatedUser,
  confirmation: string,
  db: Firestore = getAdminFirestore(),
  now = Date.now(),
): Promise<TestPublicationFixtureResult> {
  assertFixtureAdmin(actor);
  assertConfirmation(confirmation, TEST_PUBLICATION_CONFIRMATIONS.continuePinnedRun);
  await ensureTestPublicationPolicy(actor, db, now);
  const current = await readFixtureStatus(db);
  if (
    (current.state !== "ready" && current.state !== "revision_active") ||
    !current.active_version_id
  ) {
    throw new EditableLayerError(
      "Publish or restore the exact Test source before starting its pinned Test run.",
      409,
    );
  }

  const publicationVersionId = current.active_version_id;
  const capture = await ensureTestPublicationCaptureTask(
    actor,
    publicationVersionId,
    db,
    now,
  );
  const runId = pinnedTestRunId(publicationVersionId);
  const run = await startWorkflowTestRun(
    actor,
    TEST_PUBLICATION_PROCESS_DEFINITION_ID,
    {
      note: `Started from resolved Test capture task ${capture.id}.`,
    },
    db,
    {
      requireActiveDefinitionVersion: true,
      runId,
      sourcePublicationPin: {
        data_mode: "test",
        resource_id: TEST_PUBLICATION_RESOURCE_ID,
        version_id: publicationVersionId,
        test_fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
      },
    },
  );
  if (!run.definition_version_id) {
    throw new EditableLayerError(
      "The pinned Test run did not read back an immutable process-definition version.",
      409,
    );
  }
  const processDefinitionVersionId = run.definition_version_id;

  const timestamp = new Date(now).toISOString();
  const continuationId = testContinuationId(publicationVersionId);
  const continuationRef = db
    .collection(TEST_PUBLICATION_CONTINUATION_COLLECTION)
    .doc(continuationId);
  let changed = true;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(continuationRef);
    const raw = snapshot.data();
    if (raw) {
      assertExactTestFixtureRecord(raw, "publication continuation");
      const existing = normalizeFirestoreValue({
        id: continuationId,
        ...raw,
      }) as TestPublicationContinuationRecord;
      if (
        existing.capture_task_id !== capture.id ||
        existing.publication_version_id !== publicationVersionId ||
        existing.workflow_run_id !== run.id ||
        existing.process_definition_version_id !== processDefinitionVersionId
      ) {
        throw new EditableLayerError(
          "The Test publication continuation conflicts with existing pinned evidence.",
          409,
        );
      }
      changed = false;
      return;
    }
    const record: TestPublicationContinuationRecord = {
      id: continuationId,
      data_mode: "test",
      test_fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
      capture_task_id: capture.id,
      publication_resource_id: TEST_PUBLICATION_RESOURCE_ID,
      publication_version_id: publicationVersionId,
      process_definition_id: TEST_PUBLICATION_PROCESS_DEFINITION_ID,
      process_definition_version_id: processDefinitionVersionId,
      workflow_run_id: run.id,
      live_evidence_eligible: false,
      receipt_identity: continuationId,
      created_at: timestamp,
      updated_at: timestamp,
    };
    transaction.set(continuationRef, record);
  });

  return {
    changed,
    effect: changed ? "continued" : "unchanged",
    status: await readFixtureStatus(db),
  };
}

async function ensureTestPublicationCaptureTask(
  actor: AuthenticatedUser,
  publicationVersionId: string,
  db: Firestore,
  now: number,
): Promise<TestPublicationCaptureTaskRecord> {
  const id = testCaptureTaskId(publicationVersionId);
  const ref = db.collection(TEST_PUBLICATION_CAPTURE_TASK_COLLECTION).doc(id);
  const timestamp = new Date(now).toISOString();
  let result: TestPublicationCaptureTaskRecord | null = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const raw = snapshot.data();
    if (raw) assertExactTestFixtureRecord(raw, "publication capture task");
    const existing = raw
      ? (normalizeFirestoreValue({ id, ...raw }) as TestPublicationCaptureTaskRecord)
      : null;
    if (
      existing &&
      (existing.publication_resource_id !== TEST_PUBLICATION_RESOURCE_ID ||
        existing.publication_version_id !== publicationVersionId)
    ) {
      throw new EditableLayerError(
        "The Test publication capture task conflicts with existing pinned evidence.",
        409,
      );
    }
    const record: TestPublicationCaptureTaskRecord = {
      id,
      data_mode: "test",
      test_fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
      space_id: TEST_PUBLICATION_SPACE_ID,
      status: "resolved",
      owner: "Test publication fixture Admin",
      due_state: "resolved before pinned Test continuation",
      exact_next_action: "start the version-pinned Test workflow run",
      publication_resource_id: TEST_PUBLICATION_RESOURCE_ID,
      publication_version_id: publicationVersionId,
      live_evidence_eligible: false,
      created_at: existing?.created_at ?? timestamp,
      updated_at: timestamp,
    };
    transaction.set(ref, record);
    result = record;
  });

  if (!result) {
    throw new EditableLayerError("Test publication capture task is unavailable.", 409);
  }
  return result;
}

async function publishFixtureRevision(
  actor: AuthenticatedUser,
  policy: PublicationPolicyRecord,
  revision: FixtureRevision,
  db: Firestore,
) {
  const content = new TextEncoder().encode(EXACT_CONTENT[revision]);
  return publishTrustedContent(
    actor,
    policy,
    {
      loadContent: async () => content,
      metadata: fixtureMetadata(content.byteLength),
    },
    new ExactTestFixtureScanner(),
    { db },
  );
}

async function ensureTestPublicationPolicy(
  actor: AuthenticatedUser,
  db: Firestore,
  now: number,
) {
  const timestamp = new Date(now).toISOString();
  const policyRef = db
    .collection(PUBLICATION_POLICY_COLLECTION)
    .doc(TEST_PUBLICATION_POLICY_ID);
  let result: PublicationPolicyRecord | null = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(policyRef);
    const raw = snapshot.data();
    if (
      raw &&
      (resolveDataMode(raw) !== "test" ||
        raw.test_fixture_key !== TEST_PUBLICATION_FIXTURE_KEY)
    ) {
      throw new EditableLayerError(
        "The reserved Test publication policy identity conflicts with non-Test state.",
        409,
      );
    }

    const current = raw
      ? (normalizeFirestoreValue({
          id: TEST_PUBLICATION_POLICY_ID,
          ...raw,
        }) as PublicationPolicyRecord)
      : null;
    if (current && policyMatchesBaseline(current)) {
      result = current;
      return;
    }

    const next = canonicalPolicy(
      actor,
      timestamp,
      current?.createdAt ?? timestamp,
      current?.createdByUid ?? actor.uid,
    );
    transaction.set(policyRef, next);
    transaction.set(db.collection(PUBLICATION_POLICY_AUDIT_COLLECTION).doc(uuidv7()), {
      actorUid: actor.uid,
      createdAt: timestamp,
      data_mode: "test",
      eventType: current ? "fixture_restored" : "fixture_created",
      policyId: TEST_PUBLICATION_POLICY_ID,
      reasonHash: sha256(
        current
          ? "Restore exact Test publication policy"
          : "Create exact Test publication policy",
      ),
      test_fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
    });
    result = next;
  });

  if (!result) {
    throw new EditableLayerError("Test publication policy is unavailable.", 409);
  }
  return result;
}

async function readFixtureStatus(db: Firestore): Promise<TestPublicationFixtureStatus> {
  const [policySnapshot, resourceSnapshot, versionsSnapshot] = await Promise.all([
    db.collection(PUBLICATION_POLICY_COLLECTION).doc(TEST_PUBLICATION_POLICY_ID).get(),
    db
      .collection(PUBLICATION_COLLECTIONS.resources)
      .doc(TEST_PUBLICATION_RESOURCE_ID)
      .get(),
    db
      .collection(PUBLICATION_COLLECTIONS.versions)
      .where("resourceId", "==", TEST_PUBLICATION_RESOURCE_ID)
      .get(),
  ]);
  const policy = policySnapshot.data()
    ? (normalizeFirestoreValue({
        id: TEST_PUBLICATION_POLICY_ID,
        ...policySnapshot.data(),
      }) as PublicationPolicyRecord)
    : null;
  const resource = resourceSnapshot.data()
    ? (normalizeFirestoreValue({
        id: TEST_PUBLICATION_RESOURCE_ID,
        ...resourceSnapshot.data(),
      }) as PublicationResourceRecord)
    : null;
  const versions = versionsSnapshot.docs
    .map(
      (snapshot) =>
        normalizeFirestoreValue({
          id: snapshot.id,
          ...snapshot.data(),
        }) as PublicationVersionRecord,
    )
    .filter(
      (version) =>
        resolveDataMode(version) === "test" &&
        version.test_fixture_key === TEST_PUBLICATION_FIXTURE_KEY,
    )
    .sort((left, right) => right.versionNumber - left.versionNumber);
  const active =
    resource &&
    resolveDataMode(resource) === "test" &&
    resource.test_fixture_key === TEST_PUBLICATION_FIXTURE_KEY
      ? (versions.find((version) => version.id === resource.activeVersionId) ?? null)
      : null;
  const baselineHash = fixtureHash("baseline");
  const revisionHash = fixtureHash("revision");
  const baseline =
    versions.find((version) => version.contentHash === baselineHash) ?? null;
  const activeRevision = active
    ? active.contentHash === baselineHash
      ? "baseline"
      : active.contentHash === revisionHash
        ? "revision"
        : "unknown"
    : null;
  const captureTaskId = active ? testCaptureTaskId(active.id) : null;
  const continuationId = active ? testContinuationId(active.id) : null;
  const [captureSnapshot, continuationSnapshot] = await Promise.all([
    captureTaskId
      ? db.collection(TEST_PUBLICATION_CAPTURE_TASK_COLLECTION).doc(captureTaskId).get()
      : Promise.resolve(null),
    continuationId
      ? db.collection(TEST_PUBLICATION_CONTINUATION_COLLECTION).doc(continuationId).get()
      : Promise.resolve(null),
  ]);
  const captureRaw = captureSnapshot?.data();
  const continuationRaw = continuationSnapshot?.data();
  const capture =
    captureRaw &&
    resolveDataMode(captureRaw) === "test" &&
    captureRaw.test_fixture_key === TEST_PUBLICATION_FIXTURE_KEY
      ? (normalizeFirestoreValue({
          id: captureTaskId,
          ...captureRaw,
        }) as TestPublicationCaptureTaskRecord)
      : null;
  const continuation =
    continuationRaw &&
    resolveDataMode(continuationRaw) === "test" &&
    continuationRaw.test_fixture_key === TEST_PUBLICATION_FIXTURE_KEY
      ? (normalizeFirestoreValue({
          id: continuationId,
          ...continuationRaw,
        }) as TestPublicationContinuationRecord)
      : null;
  const policyReady = Boolean(policy && policyMatchesBaseline(policy));
  const state =
    policyReady && activeRevision === "baseline"
      ? "ready"
      : policyReady && activeRevision === "revision"
        ? "revision_active"
        : !resource || !policy
          ? "missing"
          : "drifted";

  return {
    active_revision: activeRevision,
    active_version_id: active?.id ?? null,
    active_version_number: active?.versionNumber ?? null,
    authority: "repository-owned exact Test fixture contract",
    baseline_version_id: baseline?.id ?? null,
    capture_task_id: capture?.id ?? null,
    capture_task_status: capture?.status ?? null,
    continuation_ready: Boolean(
      continuation &&
      active &&
      continuation.publication_version_id === active.id &&
      continuation.capture_task_id === capture?.id,
    ),
    data_mode: "test",
    fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
    live_evidence_eligible: false,
    policy_ready: policyReady,
    rollback_available: Boolean(baseline),
    scanner_boundary: "exact-hash-only; no Live scanner claim",
    state,
    pinned_process_definition_version_id:
      continuation?.process_definition_version_id ?? null,
    pinned_publication_version_id:
      continuation?.publication_version_id ?? capture?.publication_version_id ?? null,
    pinned_test_run_id: continuation?.workflow_run_id ?? null,
    version_count: versions.length,
  };
}

function canonicalPolicy(
  actor: AuthenticatedUser,
  updatedAt: string,
  createdAt: string,
  createdByUid: string,
): PublicationPolicyRecord {
  return {
    id: TEST_PUBLICATION_POLICY_ID,
    data_mode: "test",
    test_fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
    allowedSpaces: [TEST_PUBLICATION_SPACE_ID],
    allowedTypes: [
      { extension: ".md", maxBytes: 16 * 1024, mimeTypes: ["text/markdown"] },
    ],
    connectorId: TEST_PUBLICATION_CONNECTOR_ID,
    createdAt,
    createdByUid,
    enabled: true,
    rootId: TEST_PUBLICATION_ROOT_ID,
    scannerKey: TEST_PUBLICATION_EXACT_SCANNER_KEY,
    sensitivityCeiling: "Low",
    updatedAt,
    updatedByUid: actor.uid,
  };
}

function policyMatchesBaseline(policy: PublicationPolicyRecord) {
  const expected = canonicalPolicy(
    { uid: policy.updatedByUid } as AuthenticatedUser,
    policy.updatedAt,
    policy.createdAt,
    policy.createdByUid,
  );
  const fields = [
    "id",
    "data_mode",
    "test_fixture_key",
    "allowedSpaces",
    "allowedTypes",
    "connectorId",
    "enabled",
    "rootId",
    "scannerKey",
    "sensitivityCeiling",
  ] as const;
  return fields.every(
    (field) => stableJson(policy[field]) === stableJson(expected[field]),
  );
}

function fixtureMetadata(byteSize: number): PublicationMetadata {
  return {
    citationLabel: TEST_PUBLICATION_CITATION,
    connectorId: TEST_PUBLICATION_CONNECTOR_ID,
    data_mode: "test",
    declaredByteSize: byteSize,
    declaredMimeType: "text/markdown",
    detectedMimeType: "text/markdown",
    fileName: TEST_PUBLICATION_FILE_NAME,
    path: TEST_PUBLICATION_PATH,
    resourceId: TEST_PUBLICATION_RESOURCE_ID,
    resourceType: "file",
    rootId: TEST_PUBLICATION_ROOT_ID,
    sourceState: "Verified Source",
    spaceId: TEST_PUBLICATION_SPACE_ID,
    test_fixture_key: TEST_PUBLICATION_FIXTURE_KEY,
  };
}

class ExactTestFixtureScanner implements PublicationScanner {
  readonly key = TEST_PUBLICATION_EXACT_SCANNER_KEY;

  async scanMalware(content: Uint8Array, metadata: Readonly<PublicationMetadata>) {
    return exactFixtureCandidate(content, metadata)
      ? ({ code: "clean" } as const)
      : ({ code: "malware_detected" } as const);
  }

  async scanSensitivity(content: Uint8Array, metadata: Readonly<PublicationMetadata>) {
    return exactFixtureCandidate(content, metadata)
      ? ({ code: "clean", sensitivity: "Low" } as const)
      : ({ code: "sensitivity_violation" } as const);
  }
}

function exactFixtureCandidate(
  content: Uint8Array,
  metadata: Readonly<PublicationMetadata>,
) {
  const hash = sha256(content);
  return (
    (hash === fixtureHash("baseline") || hash === fixtureHash("revision")) &&
    stableJson(metadata) === stableJson(fixtureMetadata(content.byteLength))
  );
}

function fixtureHash(revision: FixtureRevision) {
  return sha256(new TextEncoder().encode(EXACT_CONTENT[revision]));
}

function testCaptureTaskId(publicationVersionId: string) {
  return `audit-test-capture-${sha256(publicationVersionId).slice(0, 40)}`;
}

function testContinuationId(publicationVersionId: string) {
  return `audit-test-continuation-${sha256(publicationVersionId).slice(0, 40)}`;
}

function pinnedTestRunId(publicationVersionId: string) {
  return `publication_test_${sha256(publicationVersionId).slice(0, 40)}`;
}

function exactContent(revision: FixtureRevision, state: string) {
  return [
    "# Repository-authorized Test publication fixture",
    "",
    `Fixture revision: ${revision}`,
    "Authority: the repository-owned S21 Test-fixture contract.",
    "Citation: docs/feature-suites/trusted-publication.md.",
    "Scope: isolated Test data; this fixture asserts no PMI KC operational fact.",
    "Validation meaning: exact app publication mechanics only; no Live scanner or provider activation is claimed.",
    state,
    "",
  ].join("\n");
}

function assertFixtureAdmin(actor: AuthenticatedUser) {
  if (
    !can(actor.role, "manageAdmin") ||
    !canAccessSpaceId(actor, TEST_PUBLICATION_SPACE_ID)
  ) {
    throw new EditableLayerError(
      "Admin authority in the Renewals Space is required for Test publication fixtures.",
      403,
    );
  }
}

function assertConfirmation(actual: string, expected: string) {
  if (actual !== expected) {
    throw new EditableLayerError(
      "The exact Test publication confirmation changed. Review it again.",
      409,
    );
  }
}

function assertExactTestFixtureRecord(raw: Record<string, unknown>, label: string) {
  if (
    resolveDataMode(raw) !== "test" ||
    raw.test_fixture_key !== TEST_PUBLICATION_FIXTURE_KEY
  ) {
    throw new EditableLayerError(
      `The reserved Test ${label} identity conflicts with non-Test state.`,
      409,
    );
  }
}

function sha256(value: Uint8Array | string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function normalizeFirestoreValue(value: unknown): unknown {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") return toDate.call(value).toISOString();
  }
  if (Array.isArray(value)) return value.map(normalizeFirestoreValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, normalizeFirestoreValue(child)]),
    );
  }
  return value;
}
