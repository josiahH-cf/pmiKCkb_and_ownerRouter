import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, it } from "vitest";

import {
  amendCaseDefinition,
  amendCaseEvidenceReferences,
  amendCaseResult,
  amendCaseRetryMetadata,
  amendEnvironmentMetadata,
  amendManifestDeclarations,
  assertValueSafe,
  checkpointMutationIntent,
  declareTraceabilityInventory,
  extendAuditCaseInventory,
  finalizeAuditRun,
  initializeAuditRun as initializeAuditRunBase,
  loadPermanentEvidenceReferencesByCase,
  manifestMatchesAuditContract,
  migrateManifestEnums,
  recordCaseResult,
  recordDomEvidence,
  recordFinding,
  recordHarnessFailureEvidence,
  recordReversibleEffectCheckpoint,
  recordStructuredEvidence,
  recordTestEffect,
  reopenAuditRun,
  reopenBlockedMutationCase,
  replaceFinding,
  requireExplicitReconciliationOutcome,
  resolveAmbiguousMutationIntent,
  retractFinding,
  validateAuditRun,
  withBoundedTransientRetries,
} from "../../scripts/process-audit-runner.mjs";

function caseDefinition({
  id,
  dataMode = "test",
  mutationKind = "read",
  dependsOn = [],
}) {
  const expectation = {
    user_action: "Perform a deterministic Test-safe interaction.",
    preconditions_and_role: "Auditor using an isolated Test record.",
    data_mode: dataMode,
    app_validation: "The explicit Test boundary is required.",
    visible_result: "A Test-safe result is visible.",
    persisted_change: mutationKind === "read" ? "No change." : "One Test-only change.",
    downstream_handoff: "The Test record remains identifiable.",
    receipt_audit_or_idempotency_evidence: "Bodyless evidence is recorded.",
  };
  return {
    id,
    title: `Case ${id}`,
    surface: "Runner test",
    route: "/test",
    process: "Runner validation",
    workflow_stage: "unit test",
    role: "Auditor",
    data_mode: dataMode,
    mutation_kind: mutationKind,
    safe_alias: mutationKind === "read" ? null : "audit:test-alias",
    depends_on: dependsOn,
    screenshot_safe: dataMode === "test",
    guide_refs: ["guide#runner", "goal#runner"],
    reviewer_refs: ["reviewer-pass#Runner-1"],
    expected: expectation,
  };
}

function resultFor({
  dataMode = "test",
  current = "pass",
  alignment = "advances",
  evidence = [],
} = {}) {
  return {
    current_behavior_result: current,
    process_alignment_result: alignment,
    actual: {
      user_action: "Performed a deterministic Test-safe interaction.",
      preconditions_and_role: "Auditor using an isolated Test record.",
      data_mode: dataMode,
      app_validation: "The explicit Test boundary was enforced.",
      visible_result: "A Test-safe result was visible.",
      persisted_change: "Only the expected Test-safe state was observed.",
      downstream_handoff: "The Test record remained identifiable.",
      receipt_audit_or_idempotency_evidence: "Bodyless evidence was recorded.",
    },
    evidence_references: evidence,
    console_errors: [],
    clean_retry: "not_retried",
  };
}

function findingFor({
  findingId,
  caseId,
  current = "blocked",
  alignment = "blocked",
  evidence = [],
  blocker = null,
  actualBehavior = "The safe Test observation did not match the expected process.",
} = {}) {
  return {
    finding_id: findingId,
    case_id: caseId,
    expected_behavior: "The deterministic Test-safe behavior is observable.",
    actual_behavior: actualBehavior,
    reproduction_steps: ["Open the Test route.", "Inspect the safe state."],
    current_behavior_result: current,
    process_alignment_result: alignment,
    severity: current === "blocked" ? "medium" : "low",
    finding_class: current === "blocked" ? "infrastructure" : "improvement",
    finding_origin: current === "blocked" ? "unavailable_dependency" : "improvement",
    observable_impact: "The bodyless audit record preserves the observed outcome.",
    evidence_references: evidence,
    reproduced_after_clean_retry: false,
    recommended_correction_or_investigation:
      "Use the structured evidence to continue the verification.",
    blocker,
  };
}

const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

const temporaryBases = [];

afterEach(async () => {
  while (temporaryBases.length > 0) {
    const base = temporaryBases.pop();
    assert.equal(path.basename(base).startsWith("pmi-process-audit-test-"), true);
    await rm(base, { recursive: true, force: true });
  }
});

async function temporaryBase() {
  const base = await mkdtemp(path.join(os.tmpdir(), "pmi-process-audit-test-"));
  temporaryBases.push(base);
  return base;
}

async function initializeAuditRun(options) {
  return initializeAuditRunBase({
    guideSectionIds: ["runner"],
    reviewerChecklistIds: ["reviewer-pass#Runner-1"],
    ...options,
  });
}

async function recordDom(runDir, caseId, suffix = "DOM-001") {
  return recordDomEvidence(runDir, {
    evidence_id: `${caseId}-${suffix}`,
    case_id: caseId,
    route: "/test",
    headings: ["Safe Test state"],
    control_summaries: [{ label: "Run Test action", kind: "button", state: "enabled" }],
    console_error_hashes: [],
  });
}

async function matchingEventReference(runDir, predicate) {
  const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map(JSON.parse);
  const event = [...events].reverse().find(predicate);
  assert.ok(event);
  return `events.jsonl#${event.event_id}`;
}

async function initializeCompletedBlockedMutationRun({
  runId,
  caseId,
  mutationKind = "test_write",
}) {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId,
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: caseId, mutationKind })],
  });
  const blocker = {
    description: "The isolated Test fixture was unavailable before any mutation.",
    unblock_action: "Restore the isolated fixture and explicitly authorize the case.",
  };
  await recordCaseResult(runDir, {
    case_id: caseId,
    ...resultFor({ current: "blocked", alignment: "blocked" }),
    blocker,
  });
  await recordFinding(
    runDir,
    findingFor({
      findingId: `FND-${caseId}-01`,
      caseId,
      blocker,
    }),
  );
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
  return { runDir, blocker };
}

it("adopts permanent DOM and structured evidence after disposable staging cleanup", async () => {
  const baseDir = await temporaryBase();
  const cases = [caseDefinition({ id: "TEST-PERMANENT-001" })];
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "20260718T010101Z-permanent-evidence",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases,
  });
  const dom = await recordDom(runDir, "TEST-PERMANENT-001");
  const structured = await recordStructuredEvidence(runDir, {
    evidence_id: "TEST-PERMANENT-001-STRUCT-001",
    case_id: "TEST-PERMANENT-001",
    stage: "unit_test",
    observation_class: "permanent_evidence_adoption",
    outcome: "permanent_records_available",
    metric_counts: { permanent_records: 2 },
    state_hashes: { fixture: HASH_A },
    notes: ["The disposable staging input is not required."],
  });

  const references = await loadPermanentEvidenceReferencesByCase(runDir);
  assert.deepEqual(references.get("TEST-PERMANENT-001").sort(), [
    dom.reference,
    structured.reference,
  ]);
});

it("refuses inferred pass outcomes and duplicate evidence references", async () => {
  assert.throws(
    () => requireExplicitReconciliationOutcome("NEW-UNCLASSIFIED-001", null, null),
    /refusing an inferred pass/,
  );
  assert.equal(
    requireExplicitReconciliationOutcome("NEW-EXPLICIT-001", null, {
      current: "blocked",
      alignment: "blocked",
    }).current,
    "blocked",
  );

  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "duplicate-evidence-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "DUPLICATE-EVIDENCE-001" })],
  });
  const dom = await recordDom(runDir, "DUPLICATE-EVIDENCE-001");
  await assert.rejects(
    recordCaseResult(runDir, {
      case_id: "DUPLICATE-EVIDENCE-001",
      ...resultFor({ evidence: [dom.reference, dom.reference] }),
    }),
    /contains duplicate evidence/,
  );
});

it("rejects same-count audit contract drift", () => {
  const sourceCase = caseDefinition({ id: "CONTRACT-001" });
  const manifest = {
    environment: { audit_contract_fingerprint: HASH_A },
    case_inventory: [{ ...sourceCase, execution: { status: "pending" } }],
  };
  assert.equal(manifestMatchesAuditContract(manifest, [sourceCase], HASH_A), true);
  assert.equal(
    manifestMatchesAuditContract(
      manifest,
      [{ ...sourceCase, title: "Same ID, changed contract" }],
      HASH_A,
    ),
    false,
  );
  assert.equal(manifestMatchesAuditContract(manifest, [sourceCase], HASH_B), false);
});

it("checkpoints mutation intent, resumes idempotently, and reconciles a complete run", async () => {
  const baseDir = await temporaryBase();
  const cases = [
    caseDefinition({ id: "TEST-READ-001" }),
    caseDefinition({ id: "TEST-MUTATE-001", mutationKind: "test_write" }),
  ];
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "unit-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases,
    now: new Date("2026-07-18T00:00:00.000Z"),
  });

  const mutationIntent = {
    case_id: "TEST-MUTATE-001",
    mutation_key: "unit-run:test-mutation",
    safe_alias: "audit:test-alias",
    planned_effect: "Create one isolated Test-only state change.",
  };
  assert.equal(
    (await checkpointMutationIntent(runDir, mutationIntent)).idempotent,
    false,
  );
  assert.equal((await checkpointMutationIntent(runDir, mutationIntent)).idempotent, true);
  await assert.rejects(
    checkpointMutationIntent(runDir, {
      ...mutationIntent,
      mutation_key: "unit-run:conflict",
    }),
    /different mutation intent/,
  );
  const effectCheckpoint = {
    case_id: "TEST-MUTATE-001",
    mutation_key: "unit-run:test-mutation",
    record_type: "runner_test",
    record_id: "runner-test-record-001",
    safe_alias: "audit:test-alias",
    outcome: "test_effect_observed",
  };
  assert.equal((await recordTestEffect(runDir, effectCheckpoint)).idempotent, false);
  assert.equal((await recordTestEffect(runDir, effectCheckpoint)).idempotent, true);

  const readDom = await recordDom(runDir, "TEST-READ-001");
  const effectReference = await matchingEventReference(
    runDir,
    (event) =>
      event.type === "test_effect_observed" && event.case_id === "TEST-MUTATE-001",
  );

  await recordCaseResult(runDir, {
    case_id: "TEST-READ-001",
    ...resultFor({ alignment: "partial", evidence: [readDom.reference] }),
  });
  await recordCaseResult(runDir, {
    case_id: "TEST-MUTATE-001",
    ...resultFor({ evidence: [effectReference] }),
  });
  await recordFinding(runDir, {
    finding_id: "FND-TEST-READ-001-01",
    case_id: "TEST-READ-001",
    expected_behavior: "The Test-safe read is visible.",
    actual_behavior: "The read was visible but the process remains partial.",
    reproduction_steps: ["Open the Test route.", "Inspect the safe state."],
    current_behavior_result: "pass",
    process_alignment_result: "partial",
    severity: "low",
    finding_class: "improvement",
    finding_origin: "improvement",
    observable_impact: "The runner proves normalized findings without sensitive values.",
    evidence_references: [readDom.reference],
    reproduced_after_clean_retry: false,
    recommended_correction_or_investigation:
      "Retain the current normalized finding schema.",
  });

  const { summary } = await finalizeAuditRun(
    runDir,
    new Date("2026-07-18T00:10:00.000Z"),
  );
  assert.deepEqual(summary.totals, {
    cases: 2,
    pending: 0,
    in_progress: 0,
    completed: 2,
    blocked: 0,
    findings: 1,
  });
  const replayed = await finalizeAuditRun(runDir, new Date("2026-07-18T00:20:00.000Z"));
  assert.deepEqual(replayed.summary, summary);
  await validateAuditRun(runDir);
  const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "run_initialized",
      "mutation_intent_checkpointed",
      "test_effect_observed",
      "dom_evidence_recorded",
      "case_completed",
      "case_completed",
      "finding_recorded",
      "run_completed",
    ],
  );
});

it("rejects unsafe values and screenshots attributed to non-Test modes", async () => {
  assert.throws(
    () => assertValueSafe("owner@unsafe.example.com"),
    /non-Test email address/,
  );
  assert.throws(() => assertValueSafe("password=do-not-log-this"), /secret value/);

  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "live-screenshot-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["live_read"],
    cases: [caseDefinition({ id: "LIVE-READ-001", dataMode: "live_read" })],
  });
  await assert.rejects(
    recordCaseResult(runDir, {
      case_id: "LIVE-READ-001",
      ...resultFor({
        dataMode: "live_read",
        evidence: ["screenshots/LIVE-READ-001.png"],
      }),
    }),
    /cannot attach a screenshot/,
  );
});

it("resumes from current source while preserving immutable definition drift", async () => {
  const baseDir = await temporaryBase();
  const environment = {
    deployment_url: "https://audit.example.invalid",
    repository_commit: "0123456789abcdef",
  };
  const cases = [caseDefinition({ id: "RESUME-001" })];
  await initializeAuditRun({
    baseDir,
    runId: "resume-run",
    environment,
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases,
  });
  const resumed = await initializeAuditRun({
    baseDir,
    runId: "resume-run",
    environment,
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [{ ...cases[0], title: "A drifted case definition" }],
  });
  assert.equal(resumed.resumed, true);
  assert.deepEqual(resumed.preserved_definition_drift, ["RESUME-001"]);
  assert.equal(resumed.manifest.case_inventory[0].title, cases[0].title);
});

it("repairs a missing intent event and enforces intent/effect alias identity", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "resume-event-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "RESUME-EVENT-001", mutationKind: "test_write" })],
  });
  const intent = {
    case_id: "RESUME-EVENT-001",
    mutation_key: "resume-event-run:mutation",
    safe_alias: "audit:test-alias",
    planned_effect: "Create one isolated Test-only state change.",
  };
  await checkpointMutationIntent(runDir, intent);
  const eventsFile = path.join(runDir, "events.jsonl");
  const [initializedEvent] = (await readFile(eventsFile, "utf8")).trim().split(/\r?\n/);
  await writeFile(eventsFile, `${initializedEvent}\n`, "utf8");
  assert.equal((await checkpointMutationIntent(runDir, intent)).idempotent, true);
  const repairedEvents = (await readFile(eventsFile, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.equal(repairedEvents[1].type, "mutation_intent_checkpointed");
  assert.equal(repairedEvents[1].recovered_during_resume, true);

  const effect = {
    case_id: "RESUME-EVENT-001",
    mutation_key: "resume-event-run:mutation",
    record_type: "runner_test",
    record_id: "runner-test-record-001",
    safe_alias: "audit:test-alias",
    outcome: "test_effect_observed",
  };
  await assert.rejects(
    recordTestEffect(runDir, { ...effect, safe_alias: "audit:different-alias" }),
    /does not match its mutation intent/,
  );
  await recordTestEffect(runDir, effect);
});

it("does not treat a blocked dependency as satisfied", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "blocked-dependency-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [
      caseDefinition({ id: "DEPENDENCY-001" }),
      caseDefinition({ id: "DEPENDENT-001", dependsOn: ["DEPENDENCY-001"] }),
    ],
  });
  await recordCaseResult(runDir, {
    case_id: "DEPENDENCY-001",
    ...resultFor({ current: "blocked", alignment: "blocked" }),
    blocker: {
      description: "A Test-only dependency is unavailable.",
      unblock_action: "Provide the isolated Test dependency.",
    },
  });
  await assert.rejects(
    recordCaseResult(runDir, {
      case_id: "DEPENDENT-001",
      ...resultFor(),
    }),
    /has incomplete dependencies: DEPENDENCY-001/,
  );
});

it("extends a running inventory append-only without rewriting existing definitions", async () => {
  const baseDir = await temporaryBase();
  const original = caseDefinition({ id: "EXTEND-001" });
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "extend-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [original],
  });
  const candidates = [
    { ...original, title: "A later title that must not rewrite the manifest" },
    caseDefinition({ id: "EXTEND-002" }),
  ];
  const extended = await extendAuditCaseInventory(runDir, candidates);
  assert.equal(extended.idempotent, false);
  assert.deepEqual(extended.added_case_ids, ["EXTEND-002"]);
  assert.deepEqual(extended.preserved_definition_drift, ["EXTEND-001"]);
  const replayed = await extendAuditCaseInventory(runDir, candidates);
  assert.equal(replayed.idempotent, true);

  const firstDom = await recordDom(runDir, "EXTEND-001");
  const secondDom = await recordDom(runDir, "EXTEND-002");
  await recordCaseResult(runDir, {
    case_id: "EXTEND-001",
    ...resultFor({ evidence: [firstDom.reference] }),
  });
  await recordCaseResult(runDir, {
    case_id: "EXTEND-002",
    ...resultFor({ evidence: [secondDom.reference] }),
  });
  await finalizeAuditRun(runDir);
  const validation = await validateAuditRun(runDir);
  assert.equal(validation.case_count, 2);
  const manifest = JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8"));
  assert.equal(manifest.case_inventory[0].title, original.title);
  assert.equal(manifest.inventory_extensions.length, 1);
});

it("amends terminal screenshot evidence append-only after an interrupted capture", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "evidence-amend-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "EVIDENCE-001" })],
  });
  const dom = await recordDom(runDir, "EVIDENCE-001");
  await recordCaseResult(runDir, {
    case_id: "EVIDENCE-001",
    ...resultFor({ evidence: [dom.reference] }),
  });
  const amendment = {
    case_id: "EVIDENCE-001",
    evidence_references: [dom.reference, "screenshots/EVIDENCE-001-readback.png"],
  };
  assert.equal((await amendCaseEvidenceReferences(runDir, amendment)).idempotent, false);
  assert.equal((await amendCaseEvidenceReferences(runDir, amendment)).idempotent, true);
  await recordFinding(runDir, {
    finding_id: "FND-EVIDENCE-001-01",
    case_id: "EVIDENCE-001",
    expected_behavior: "The Test-safe read is visible.",
    actual_behavior: "The read was visible with corrected retry metadata.",
    reproduction_steps: ["Open the Test route.", "Inspect the safe state."],
    current_behavior_result: "pass",
    process_alignment_result: "advances",
    severity: "info",
    finding_class: "improvement",
    finding_origin: "improvement",
    observable_impact: "Retry evidence remains internally consistent.",
    evidence_references: amendment.evidence_references,
    reproduced_after_clean_retry: false,
    recommended_correction_or_investigation:
      "Retain append-only retry metadata corrections.",
  });
  const retryAmendment = {
    case_id: "EVIDENCE-001",
    clean_retry: "failed",
    reproduced_after_clean_retry: true,
  };
  assert.equal((await amendCaseRetryMetadata(runDir, retryAmendment)).idempotent, false);
  assert.equal((await amendCaseRetryMetadata(runDir, retryAmendment)).idempotent, true);
  await writeFile(
    path.join(runDir, "screenshots", "EVIDENCE-001-readback.png"),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
  const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.equal(
    events.filter((event) => event.type === "case_evidence_amended").length,
    1,
  );
});

it("reopens a completed run and amends a blocked terminal result append-only", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "reopen-amend-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "REOPEN-001" })],
  });
  const blocker = {
    description: "The isolated Test fixture was temporarily unavailable.",
    unblock_action: "Restore the isolated Test fixture and collect DOM evidence.",
  };
  await recordCaseResult(runDir, {
    case_id: "REOPEN-001",
    ...resultFor({ current: "blocked", alignment: "blocked" }),
    blocker,
  });
  await recordFinding(
    runDir,
    findingFor({
      findingId: "FND-REOPEN-001-01",
      caseId: "REOPEN-001",
      blocker,
    }),
  );
  await finalizeAuditRun(runDir, new Date("2026-07-18T01:00:00.000Z"));
  await validateAuditRun(runDir);

  const reopenPayload = { reason: "New bodyless DOM evidence became available." };
  assert.equal((await reopenAuditRun(runDir, reopenPayload)).idempotent, false);
  assert.equal((await reopenAuditRun(runDir, reopenPayload)).idempotent, true);
  const dom = await recordDom(runDir, "REOPEN-001");
  assert.equal(
    (
      await amendCaseResult(runDir, {
        case_id: "REOPEN-001",
        reason: "The recovered fixture proves the current behavior passes.",
        ...resultFor({ evidence: [dom.reference] }),
      })
    ).idempotent,
    false,
  );
  assert.equal(
    (
      await amendCaseResult(runDir, {
        case_id: "REOPEN-001",
        reason: "The recovered fixture proves the current behavior passes.",
        ...resultFor({ evidence: [dom.reference] }),
      })
    ).idempotent,
    true,
  );
  await retractFinding(runDir, {
    finding_id: "FND-REOPEN-001-01",
    reason: "The prior blocker was superseded by substantive evidence.",
  });
  await finalizeAuditRun(runDir, new Date("2026-07-18T01:10:00.000Z"));
  const validation = await validateAuditRun(runDir);
  assert.equal(validation.completion_cycles, 2);
  const manifest = JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8"));
  assert.equal(manifest.case_inventory[0].execution.status, "completed");
  assert.equal(
    manifest.case_inventory[0].execution.result.current_behavior_result,
    "pass",
  );
  assert.equal(await readFile(path.join(runDir, "findings.jsonl"), "utf8"), "");
  const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.equal(events.filter((event) => event.type === "run_completed").length, 2);
  assert.equal(events.filter((event) => event.type === "run_reopened").length, 1);
  assert.equal(events.filter((event) => event.type === "case_result_amended").length, 1);
  assert.equal(events.at(-1).type, "run_completed");
});

it("authorizes a blocked reversible mutation case while preserving its terminal result", async () => {
  const caseId = "REOPEN-MUTATION-001";
  const runId = "reopen-mutation-success-run";
  const { runDir } = await initializeCompletedBlockedMutationRun({
    runId,
    caseId,
    mutationKind: "reversible_app_write",
  });
  const before = JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8"))
    .case_inventory[0].execution;
  await reopenAuditRun(runDir, {
    reason: "The isolated Test fixture and restoration authority are now available.",
  });
  const authorization = await reopenBlockedMutationCase(runDir, {
    case_id: caseId,
    reason: "Execute the previously blocked isolated reversible Test mutation.",
    authority_basis:
      "The restored Test fixture has a recorded baseline and no Live effect authority.",
  });
  assert.equal(authorization.idempotent, false);
  const intent = {
    case_id: caseId,
    mutation_key: `${runId}:reopened-reversible-effect`,
    safe_alias: "audit:test-alias",
    planned_effect: "Change and restore one isolated Test setting.",
  };
  await checkpointMutationIntent(runDir, intent);
  await recordTestEffect(runDir, {
    case_id: caseId,
    mutation_key: intent.mutation_key,
    record_type: "runner_test",
    record_id: "reopened-reversible-record-001",
    safe_alias: "audit:test-alias",
    outcome: "isolated_test_change_observed",
  });
  await recordReversibleEffectCheckpoint(runDir, {
    case_id: caseId,
    mutation_key: intent.mutation_key,
    before_hash: HASH_A,
    change_hash: HASH_B,
    restore_hash: HASH_A,
    restore_outcome: "restored",
  });
  const during = JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8"))
    .case_inventory[0].execution;
  assert.equal(during.status, "blocked");
  assert.deepEqual(during.result, before.result);
  assert.equal(
    during.active_mutation_reopen_authorization_id,
    authorization.authorization.authorization_id,
  );
  const effectReference = await matchingEventReference(
    runDir,
    (event) => event.type === "test_effect_observed" && event.case_id === caseId,
  );
  await amendCaseResult(runDir, {
    case_id: caseId,
    reason: "The authorized isolated mutation and restoration now prove success.",
    ...resultFor({ evidence: [effectReference] }),
  });
  await retractFinding(runDir, {
    finding_id: `FND-${caseId}-01`,
    reason: "The prior fixture blocker was superseded by the authorized Test result.",
  });
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);

  const manifest = JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8"));
  const execution = manifest.case_inventory[0].execution;
  assert.equal(execution.status, "completed");
  assert.equal(execution.active_mutation_reopen_authorization_id, null);
  assert.equal(execution.mutation_reopen_authorizations.length, 1);
  assert.equal(
    execution.last_result_amendment.mutation_reopen_authorization_id,
    authorization.authorization.authorization_id,
  );
  const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.equal(events.filter((event) => event.type === "case_blocked").length, 1);
  assert.equal(
    events.filter((event) => event.type === "case_mutation_reopen_authorized").length,
    1,
  );
});

it("keeps reopen-case authorization idempotent within one reopened run cycle", async () => {
  const caseId = "REOPEN-MUTATION-IDEMPOTENT-001";
  const { runDir } = await initializeCompletedBlockedMutationRun({
    runId: "reopen-mutation-idempotent-run",
    caseId,
  });
  await reopenAuditRun(runDir, {
    reason: "The isolated fixture is ready for a bounded retry.",
  });
  const payload = {
    case_id: caseId,
    reason: "Authorize one bounded isolated Test attempt.",
    authority_basis: "The Test alias and restoration boundary are independently known.",
  };
  const first = await reopenBlockedMutationCase(runDir, payload);
  const second = await reopenBlockedMutationCase(runDir, payload);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
  assert.equal(
    first.authorization.authorization_id,
    second.authorization.authorization_id,
  );
  await amendCaseResult(runDir, {
    case_id: caseId,
    reason: "Close the authorization because the same blocker remained before mutation.",
    ...resultFor({ current: "blocked", alignment: "blocked" }),
    blocker: {
      description: "The isolated fixture remained unavailable at the final gate.",
      unblock_action: "Restore the fixture before authorizing another run cycle.",
    },
  });
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
  const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.equal(
    events.filter((event) => event.type === "case_mutation_reopen_authorized").length,
    1,
  );
});

it("closes a reopen-case authorization when the authorized mutation is blocked again", async () => {
  const caseId = "REOPEN-MUTATION-BLOCKED-001";
  const runId = "reopen-mutation-blocked-run";
  const { runDir } = await initializeCompletedBlockedMutationRun({ runId, caseId });
  await reopenAuditRun(runDir, {
    reason: "A Test-only dependency became available for another observation.",
  });
  const authorization = await reopenBlockedMutationCase(runDir, {
    case_id: caseId,
    reason: "Authorize the isolated Test mutation through its next guarded boundary.",
    authority_basis: "The Test record is audit-owned and cannot call a Live provider.",
  });
  const intent = {
    case_id: caseId,
    mutation_key: `${runId}:blocked-again-effect`,
    safe_alias: "audit:test-alias",
    planned_effect: "Record one isolated Test transition before the next guard.",
  };
  await checkpointMutationIntent(runDir, intent);
  await recordTestEffect(runDir, {
    case_id: caseId,
    mutation_key: intent.mutation_key,
    record_type: "runner_test",
    record_id: "blocked-again-record-001",
    safe_alias: "audit:test-alias",
    outcome: "test_transition_observed_before_guard",
  });
  const effectReference = await matchingEventReference(
    runDir,
    (event) => event.type === "test_effect_observed" && event.case_id === caseId,
  );
  const blocker = {
    description:
      "The next protected dependency remained unavailable after the Test step.",
    unblock_action: "Restore that dependency and begin a separately reopened run cycle.",
  };
  await amendCaseResult(runDir, {
    case_id: caseId,
    reason: "Record the new guarded boundary and close this mutation authorization.",
    ...resultFor({
      current: "blocked",
      alignment: "blocked",
      evidence: [effectReference],
    }),
    blocker,
  });
  await replaceFinding(runDir, {
    finding_id: `FND-${caseId}-01`,
    reason: "Replace the original fixture blocker with the newly observed boundary.",
    replacement: findingFor({
      findingId: `FND-${caseId}-01`,
      caseId,
      evidence: [effectReference],
      blocker,
      actualBehavior:
        "The isolated Test transition succeeded, then the next protected dependency blocked progress.",
    }),
  });
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
  const execution = JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8"))
    .case_inventory[0].execution;
  assert.equal(execution.status, "blocked");
  assert.equal(execution.active_mutation_reopen_authorization_id, null);
  assert.equal(
    execution.last_result_amendment.mutation_reopen_authorization_id,
    authorization.authorization.authorization_id,
  );
});

it("rejects terminal mutation checkpoints without reopen-case authorization", async () => {
  const caseId = "REOPEN-MUTATION-UNAUTHORIZED-001";
  const runId = "reopen-mutation-unauthorized-run";
  const { runDir } = await initializeCompletedBlockedMutationRun({ runId, caseId });
  await reopenAuditRun(runDir, {
    reason: "Reopen the run for safe read-only evidence collection.",
  });
  await assert.rejects(
    checkpointMutationIntent(runDir, {
      case_id: caseId,
      mutation_key: `${runId}:unauthorized-effect`,
      safe_alias: "audit:test-alias",
      planned_effect: "This terminal mutation must remain unauthorized.",
    }),
    /requires an active reopen-case authorization/,
  );
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
});

it("denies reopen-case for a completed mutation case", async () => {
  const baseDir = await temporaryBase();
  const caseId = "REOPEN-MUTATION-COMPLETED-001";
  const runId = "reopen-mutation-completed-run";
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId,
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: caseId, mutationKind: "test_write" })],
  });
  const intent = {
    case_id: caseId,
    mutation_key: `${runId}:completed-effect`,
    safe_alias: "audit:test-alias",
    planned_effect: "Complete one isolated Test mutation.",
  };
  await checkpointMutationIntent(runDir, intent);
  await recordTestEffect(runDir, {
    case_id: caseId,
    mutation_key: intent.mutation_key,
    record_type: "runner_test",
    record_id: "completed-record-001",
    safe_alias: "audit:test-alias",
    outcome: "isolated_test_effect_observed",
  });
  const effectReference = await matchingEventReference(
    runDir,
    (event) => event.type === "test_effect_observed" && event.case_id === caseId,
  );
  await recordCaseResult(runDir, {
    case_id: caseId,
    ...resultFor({ evidence: [effectReference] }),
  });
  await finalizeAuditRun(runDir);
  await reopenAuditRun(runDir, {
    reason: "Reopen the run without changing the completed mutation case.",
  });
  await assert.rejects(
    reopenBlockedMutationCase(runDir, {
      case_id: caseId,
      reason: "A completed case must not be replayed.",
      authority_basis: "No authority can convert this completed case into a replay.",
    }),
    /must have a terminal blocked result/,
  );
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
});

it("validation rejects mutation checkpoints inserted after terminal blocking without authorization", async () => {
  const caseId = "REOPEN-MUTATION-VALIDATION-001";
  const runId = "reopen-mutation-validation-run";
  const { runDir } = await initializeCompletedBlockedMutationRun({ runId, caseId });
  const manifestPath = path.join(runDir, "manifest.json");
  const eventsPath = path.join(runDir, "events.jsonl");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const events = (await readFile(eventsPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  const completion = events.pop();
  const auditCase = manifest.case_inventory[0];
  const mutationKey = `${runId}:forged-terminal-effect`;
  const timestamp = completion.timestamp;
  auditCase.execution.attempt_count += 1;
  auditCase.execution.mutation_intent = {
    case_id: caseId,
    mutation_key: mutationKey,
    safe_alias: "audit:test-alias",
    planned_effect: "This terminal checkpoint has no reopen-case authorization.",
    checkpointed_at: timestamp,
  };
  auditCase.execution.effect_checkpoint = {
    case_id: caseId,
    mutation_key: mutationKey,
    record_type: "runner_test",
    record_id: "forged-terminal-record-001",
    safe_alias: "audit:test-alias",
    outcome: "forged_terminal_effect",
    observed_at: timestamp,
  };
  manifest.effect_registry[mutationKey] = caseId;
  manifest.test_record_registry.push({
    audit_run_id: runId,
    case_id: caseId,
    mutation_key: mutationKey,
    record_type: "runner_test",
    record_id: "forged-terminal-record-001",
    safe_alias: "audit:test-alias",
    outcome: "forged_terminal_effect",
    observed_at: timestamp,
  });
  events.push(
    {
      schema_version: "process-audit-event.v1",
      timestamp,
      type: "mutation_intent_checkpointed",
      run_id: runId,
      case_id: caseId,
      mutation_key: mutationKey,
      safe_alias: "audit:test-alias",
      planned_effect: "This terminal checkpoint has no reopen-case authorization.",
    },
    {
      schema_version: "process-audit-event.v1",
      timestamp,
      type: "test_effect_observed",
      run_id: runId,
      case_id: caseId,
      mutation_key: mutationKey,
      record_type: "runner_test",
      record_id: "forged-terminal-record-001",
      safe_alias: "audit:test-alias",
      outcome: "forged_terminal_effect",
    },
    completion,
  );
  for (const [index, event] of events.entries()) {
    event.event_id = `${runId}:${String(index + 1).padStart(6, "0")}`;
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(
    eventsPath,
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    "utf8",
  );
  await assert.rejects(
    validateAuditRun(runDir),
    /unauthorized terminal mutation checkpoint/,
  );
});

it("rejects a result amendment that would invalidate completed dependents", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "amend-dependency-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [
      caseDefinition({ id: "AMEND-DEP-001" }),
      caseDefinition({ id: "AMEND-DEP-002", dependsOn: ["AMEND-DEP-001"] }),
    ],
  });
  const firstDom = await recordDom(runDir, "AMEND-DEP-001");
  const secondDom = await recordDom(runDir, "AMEND-DEP-002");
  await recordCaseResult(runDir, {
    case_id: "AMEND-DEP-001",
    ...resultFor({ evidence: [firstDom.reference] }),
  });
  await recordCaseResult(runDir, {
    case_id: "AMEND-DEP-002",
    ...resultFor({ evidence: [secondDom.reference] }),
  });
  await assert.rejects(
    amendCaseResult(runDir, {
      case_id: "AMEND-DEP-001",
      reason: "A clean retry found the prerequisite unavailable.",
      ...resultFor({ current: "blocked", alignment: "blocked" }),
      blocker: {
        description: "The prerequisite is unavailable.",
        unblock_action: "Restore the prerequisite.",
      },
    }),
    /AMEND-DEP-002 has incomplete dependencies/,
  );
});

it("replaces findings while preserving an auditable current normalized view", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "finding-lifecycle-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "FINDING-001" })],
  });
  const dom = await recordDom(runDir, "FINDING-001");
  await recordCaseResult(runDir, {
    case_id: "FINDING-001",
    ...resultFor({ alignment: "partial", evidence: [dom.reference] }),
  });
  await recordFinding(
    runDir,
    findingFor({
      findingId: "FND-FINDING-001-01",
      caseId: "FINDING-001",
      current: "pass",
      alignment: "partial",
      evidence: [dom.reference],
    }),
  );
  const replacementPayload = {
    finding_id: "FND-FINDING-001-01",
    reason: "A more precise normalized description supersedes the first wording.",
    replacement: findingFor({
      findingId: "FND-FINDING-001-02",
      caseId: "FINDING-001",
      current: "pass",
      alignment: "partial",
      evidence: [dom.reference],
      actualBehavior: "The behavior passes while the process remains partial.",
    }),
  };
  assert.equal((await replaceFinding(runDir, replacementPayload)).idempotent, false);
  assert.equal((await replaceFinding(runDir, replacementPayload)).idempotent, true);
  const stableIdReplacement = {
    finding_id: "FND-FINDING-001-02",
    reason: "Keep the stable finding ID while clarifying the observed impact.",
    replacement: findingFor({
      findingId: "FND-FINDING-001-02",
      caseId: "FINDING-001",
      current: "pass",
      alignment: "partial",
      evidence: [dom.reference],
      actualBehavior:
        "The behavior passes while the bodyless process evidence remains partial.",
    }),
  };
  assert.equal((await replaceFinding(runDir, stableIdReplacement)).idempotent, false);
  assert.equal((await replaceFinding(runDir, stableIdReplacement)).idempotent, true);
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
  const currentFindings = (await readFile(path.join(runDir, "findings.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.deepEqual(
    currentFindings.map((finding) => finding.finding_id),
    ["FND-FINDING-001-02"],
  );
  const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.equal(events.filter((event) => event.type === "finding_recorded").length, 1);
  assert.equal(events.filter((event) => event.type === "finding_replaced").length, 2);
});

it("records strict bodyless DOM evidence and validates case membership", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "dom-evidence-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "DOM-001" }), caseDefinition({ id: "DOM-002" })],
  });
  await assert.rejects(
    recordDomEvidence(runDir, {
      evidence_id: "DOM-001-DOM-BAD",
      case_id: "DOM-001",
      route: "https://audit.example.invalid/test",
      headings: ["Safe heading"],
      control_summaries: [],
      console_error_hashes: [],
    }),
    /route-only path/,
  );
  await assert.rejects(
    recordDomEvidence(runDir, {
      evidence_id: "DOM-001-DOM-BODY",
      case_id: "DOM-001",
      route: "/test",
      headings: ["Safe heading"],
      control_summaries: [
        {
          label: "Safe control",
          kind: "button",
          state: "enabled",
          body: "raw body is forbidden",
        },
      ],
      console_error_hashes: [],
    }),
    /body is not allowed/,
  );
  const first = await recordDom(runDir, "DOM-001");
  const second = await recordDom(runDir, "DOM-002");
  await assert.rejects(
    recordCaseResult(runDir, {
      case_id: "DOM-002",
      ...resultFor({ evidence: [first.reference] }),
    }),
    /must start with the case ID/,
  );
  await recordCaseResult(runDir, {
    case_id: "DOM-001",
    ...resultFor({ evidence: [first.reference] }),
  });
  await recordCaseResult(runDir, {
    case_id: "DOM-002",
    ...resultFor({ evidence: [second.reference] }),
  });
  await finalizeAuditRun(runDir);
  const validation = await validateAuditRun(runDir);
  assert.equal(validation.dom_evidence_count, 2);
});

it("requires substantive evidence and accepts an anchored harness-failure event", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "substantive-evidence-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [
      caseDefinition({ id: "SUBSTANTIVE-001" }),
      caseDefinition({ id: "HARNESS-001" }),
    ],
  });
  await recordCaseResult(runDir, {
    case_id: "SUBSTANTIVE-001",
    ...resultFor(),
  });
  const harnessEvidence = await recordHarnessFailureEvidence(runDir, {
    case_id: "HARNESS-001",
    evidence_id: "HARNESS-001-FAILURE-001",
    stage: "browser-navigation",
    failure_class: "browser-session-ended",
    failure_hash: HASH_A,
  });
  await recordCaseResult(runDir, {
    case_id: "HARNESS-001",
    ...resultFor({
      current: "audit_harness_failure",
      alignment: "blocked",
      evidence: [harnessEvidence.reference],
    }),
    blocker: {
      description: "The browser session ended before safe evidence capture.",
      unblock_action: "Resume with a new authenticated browser session.",
    },
  });
  await recordFinding(
    runDir,
    findingFor({
      findingId: "FND-HARNESS-001-01",
      caseId: "HARNESS-001",
      current: "audit_harness_failure",
      alignment: "blocked",
      evidence: [harnessEvidence.reference],
      blocker: {
        description: "The browser session ended before safe evidence capture.",
        unblock_action: "Resume with a new authenticated browser session.",
      },
    }),
  );
  await assert.rejects(
    finalizeAuditRun(runDir),
    /SUBSTANTIVE-001 has no substantive evidence/,
  );
  const dom = await recordDom(runDir, "SUBSTANTIVE-001");
  await amendCaseEvidenceReferences(runDir, {
    case_id: "SUBSTANTIVE-001",
    evidence_references: [dom.reference],
  });
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
});

it("validates screenshot magic bytes and rejects Sample screenshot evidence", async () => {
  const baseDir = await temporaryBase();
  const testCase = caseDefinition({ id: "SCREENSHOT-001" });
  const sampleCase = {
    ...caseDefinition({ id: "SCREENSHOT-SAMPLE-001", dataMode: "sample" }),
    screenshot_safe: true,
  };
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "screenshot-magic-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test", "sample"],
    cases: [testCase, sampleCase],
  });
  await recordCaseResult(runDir, {
    case_id: "SCREENSHOT-001",
    ...resultFor({ evidence: ["screenshots/SCREENSHOT-001-view.png"] }),
  });
  await assert.rejects(
    recordCaseResult(runDir, {
      case_id: "SCREENSHOT-SAMPLE-001",
      ...resultFor({
        dataMode: "sample",
        evidence: ["screenshots/SCREENSHOT-SAMPLE-001-view.png"],
      }),
    }),
    /cannot attach a screenshot/,
  );
  const sampleDom = await recordDom(runDir, "SCREENSHOT-SAMPLE-001");
  await recordCaseResult(runDir, {
    case_id: "SCREENSHOT-SAMPLE-001",
    ...resultFor({ dataMode: "sample", evidence: [sampleDom.reference] }),
  });
  await writeFile(
    path.join(runDir, "screenshots", "SCREENSHOT-001-view.png"),
    "not-a-png",
  );
  await assert.rejects(finalizeAuditRun(runDir), /does not contain PNG magic bytes/);
  await writeFile(
    path.join(runDir, "screenshots", "SCREENSHOT-001-view.png"),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
});

it("requires declared roles and modes to cover every case", async () => {
  const baseDir = await temporaryBase();
  await assert.rejects(
    initializeAuditRun({
      baseDir,
      runId: "missing-role-run",
      environment: {
        deployment_url: "https://audit.example.invalid",
        repository_commit: "0123456789abcdef",
      },
      guideSource: "docs/test-guide.html",
      roles: ["Editor"],
      modes: ["test"],
      cases: [caseDefinition({ id: "ROLE-001" })],
    }),
    /Declared roles do not cover cases: Auditor/,
  );
  await assert.rejects(
    initializeAuditRun({
      baseDir,
      runId: "missing-mode-run",
      environment: {
        deployment_url: "https://audit.example.invalid",
        repository_commit: "0123456789abcdef",
      },
      guideSource: "docs/test-guide.html",
      roles: ["Auditor"],
      modes: ["live_read"],
      cases: [caseDefinition({ id: "MODE-001" })],
    }),
    /Declared modes do not cover cases: test/,
  );
});

it("requires complete guide and reviewer traceability at initialization", async () => {
  const baseDir = await temporaryBase();
  const firstCase = caseDefinition({ id: "TRACE-INIT-001" });
  const declaredGuideSections = ["runner", "unmapped", "reviewer-pass"];
  const declaredReviewerIds = ["reviewer-pass#Runner-1", "reviewer-pass#Runner-2"];
  await assert.rejects(
    initializeAuditRun({
      baseDir,
      runId: "traceability-incomplete-init-run",
      environment: {
        deployment_url: "https://audit.example.invalid",
        repository_commit: "0123456789abcdef",
      },
      guideSource: "docs/test-guide.html",
      roles: ["Auditor"],
      modes: ["test"],
      guideSectionIds: declaredGuideSections,
      reviewerChecklistIds: declaredReviewerIds,
      cases: [firstCase],
    }),
    /guide sections without cases: unmapped, reviewer-pass; reviewer checklist IDs without cases: reviewer-pass#Runner-2/,
  );
  const secondCase = {
    ...caseDefinition({ id: "TRACE-INIT-002" }),
    guide_refs: ["guide#unmapped"],
    reviewer_refs: ["reviewer-pass#Runner-2"],
  };
  const initialized = await initializeAuditRun({
    baseDir,
    runId: "traceability-complete-init-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    guideSectionIds: declaredGuideSections,
    reviewerChecklistIds: declaredReviewerIds,
    cases: [firstCase, secondCase],
  });
  assert.equal(initialized.manifest.status, "running");
});

it("enforces complete traceability when extending and finalizing a run", async () => {
  const baseDir = await temporaryBase();
  const original = caseDefinition({ id: "TRACE-EXTEND-001" });
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "traceability-extend-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [original],
  });
  await declareTraceabilityInventory(runDir, {
    guide_section_ids: ["runner", "extension", "reviewer-pass"],
    reviewer_checklist_ids: ["reviewer-pass#Runner-1", "reviewer-pass#Runner-2"],
    reason: "Declare the complete catalog before appending its remaining case.",
  });
  await assert.rejects(
    extendAuditCaseInventory(runDir, [original]),
    /guide sections without cases: extension, reviewer-pass; reviewer checklist IDs without cases: reviewer-pass#Runner-2/,
  );
  const addition = {
    ...caseDefinition({ id: "TRACE-EXTEND-002" }),
    guide_refs: ["guide#extension"],
    reviewer_refs: ["reviewer-pass#Runner-2"],
  };
  const extended = await extendAuditCaseInventory(runDir, [original, addition]);
  assert.deepEqual(extended.added_case_ids, ["TRACE-EXTEND-002"]);

  const { runDir: incompleteRunDir } = await initializeAuditRun({
    baseDir,
    runId: "traceability-finalize-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "TRACE-FINALIZE-001" })],
  });
  await declareTraceabilityInventory(incompleteRunDir, {
    guide_section_ids: ["runner", "orphan"],
    reviewer_checklist_ids: ["reviewer-pass#Runner-1"],
    reason: "Exercise the finalize-time completeness guard.",
  });
  const dom = await recordDom(incompleteRunDir, "TRACE-FINALIZE-001");
  await recordCaseResult(incompleteRunDir, {
    case_id: "TRACE-FINALIZE-001",
    ...resultFor({ evidence: [dom.reference] }),
  });
  await assert.rejects(
    finalizeAuditRun(incompleteRunDir),
    /guide sections without cases: orphan/,
  );
});

it("rejects a completed artifact whose traceability catalog becomes incomplete", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "traceability-validate-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "TRACE-VALIDATE-001" })],
  });
  const dom = await recordDom(runDir, "TRACE-VALIDATE-001");
  await recordCaseResult(runDir, {
    case_id: "TRACE-VALIDATE-001",
    ...resultFor({ evidence: [dom.reference] }),
  });
  await finalizeAuditRun(runDir);
  const manifestPath = path.join(runDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.guide_section_ids.push("orphan");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await assert.rejects(validateAuditRun(runDir), /guide sections without cases: orphan/);
});

it("amends manifest declarations append-only to exactly match the inventory", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "declaration-amend-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor", "Admin"],
    modes: ["test", "live_read"],
    cases: [caseDefinition({ id: "DECLARATION-001" })],
  });
  await assert.rejects(
    amendManifestDeclarations(runDir, {
      roles: ["Auditor", "Unknown Role"],
      modes: ["test"],
      reason: "Reject unknown roles.",
      authority_basis: "No unknown authority is permitted.",
    }),
    /Unknown declared role/,
  );
  await assert.rejects(
    amendManifestDeclarations(runDir, {
      roles: ["Auditor"],
      modes: ["live_effect_guard"],
      reason: "Reject invalid modes.",
      authority_basis: "Only canonical modes are permitted.",
    }),
    /declared mode must be one of/,
  );
  const declarationPayload = {
    roles: ["Auditor"],
    modes: ["test"],
    reason: "Remove declarations not represented in the case inventory.",
    authority_basis: "This changes manifest coverage metadata, not case authority.",
  };
  assert.equal(
    (await amendManifestDeclarations(runDir, declarationPayload)).idempotent,
    false,
  );
  assert.equal(
    (await amendManifestDeclarations(runDir, declarationPayload)).idempotent,
    true,
  );
  const dom = await recordDom(runDir, "DECLARATION-001");
  await recordCaseResult(runDir, {
    case_id: "DECLARATION-001",
    ...resultFor({ evidence: [dom.reference] }),
  });
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
  const manifest = JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.roles, ["Auditor"]);
  assert.deepEqual(manifest.modes, ["test"]);
  const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.equal(
    events.filter((event) => event.type === "manifest_declarations_amended").length,
    1,
  );
});

it("migrates missing manifest enums append-safely without accepting enum drift", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "enum-migration-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "ENUM-MIGRATION-001" })],
  });
  const manifestPath = path.join(runDir, "manifest.json");
  const eventsPath = path.join(runDir, "events.jsonl");
  const legacyManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  delete legacyManifest.enums.data_modes;
  delete legacyManifest.enums.mutation_kinds;
  legacyManifest.enums.data_modes = ["test", "unsafe_mode"];
  await writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`, "utf8");
  const payload = {
    reason: "Restore enum declarations omitted by the initial legacy manifest writer.",
    authority_basis:
      "Harness schema metadata only; no case or product authority changes.",
  };
  await assert.rejects(
    migrateManifestEnums(runDir, payload),
    /refusing enum narrowing, broadening, or reordering/,
  );
  delete legacyManifest.enums.data_modes;
  await writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`, "utf8");

  const migrated = await migrateManifestEnums(
    runDir,
    payload,
    new Date("2026-07-18T01:00:00.000Z"),
  );
  assert.equal(migrated.idempotent, false);
  assert.deepEqual(migrated.migrated_fields, ["data_modes", "mutation_kinds"]);
  const interruptedEvents = (await readFile(eventsPath, "utf8")).trim().split(/\r?\n/);
  interruptedEvents.pop();
  await writeFile(eventsPath, `${interruptedEvents.join("\n")}\n`, "utf8");
  const resumed = await migrateManifestEnums(runDir, payload);
  assert.equal(resumed.idempotent, true);
  assert.equal(resumed.repaired, true);

  const dom = await recordDom(runDir, "ENUM-MIGRATION-001");
  await recordCaseResult(runDir, {
    case_id: "ENUM-MIGRATION-001",
    ...resultFor({ evidence: [dom.reference] }),
  });
  await finalizeAuditRun(runDir);
  const validation = await validateAuditRun(runDir);
  assert.equal(validation.enum_migration_count, 1);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(manifest.enums.data_modes, [
    "app_only",
    "live_effect",
    "live_read",
    "mixed",
    "sample",
    "test",
  ]);
  assert.deepEqual(manifest.enums.mutation_kinds, [
    "app_write",
    "live_effect",
    "read",
    "reversible_app_write",
    "test_action",
    "test_create",
    "test_write",
  ]);
  assert.equal(manifest.enum_migrations.length, 1);
  const events = (await readFile(eventsPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  const migrationEvents = events.filter(
    (event) => event.type === "manifest_enums_migrated",
  );
  assert.equal(migrationEvents.length, 1);
  assert.equal(migrationEvents[0].recovered_during_resume, true);
  const report = await readFile(path.join(runDir, "run-report.md"), "utf8");
  assert.match(report, /`dom-evidence\/`/);
  assert.match(report, /`fixtures\/`/);
});

it("records append-only deployed environment provenance", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "environment-amend-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "ENVIRONMENT-001" })],
  });
  await assert.rejects(
    amendEnvironmentMetadata(runDir, {
      reason: "Reject fields outside the deployed provenance allowlist.",
      changes: { runtime_secret: "redacted" },
    }),
    /runtime_secret is not allowed/,
  );
  await assert.rejects(
    amendEnvironmentMetadata(runDir, {
      reason: "Reject a malformed deployed image digest.",
      changes: { image_digest: "not-a-digest" },
    }),
    /must be a SHA-256 hash/,
  );
  const provenancePayload = {
    reason: "Record the bodyless provenance reported by the deployed revision.",
    changes: {
      deployed_source_commit: "abcdef1234567890",
      deployment_revision: "audit-revision-001",
      image_digest: HASH_A,
      audit_contract_fingerprint: HASH_B,
      local_adc: "fresh managed-domain credentials; read-only cloud checks enabled",
    },
  };
  assert.equal(
    (await amendEnvironmentMetadata(runDir, provenancePayload)).idempotent,
    false,
  );
  assert.equal(
    (await amendEnvironmentMetadata(runDir, provenancePayload)).idempotent,
    true,
  );
  const dom = await recordDom(runDir, "ENVIRONMENT-001");
  await recordCaseResult(runDir, {
    case_id: "ENVIRONMENT-001",
    ...resultFor({ evidence: [dom.reference] }),
  });
  await finalizeAuditRun(runDir);
  const validation = await validateAuditRun(runDir);
  assert.equal(validation.environment_amendment_count, 1);
  const manifest = JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8"));
  assert.equal(manifest.environment.deployed_source_commit, "abcdef1234567890");
  assert.equal(manifest.environment.deployment_revision, "audit-revision-001");
  assert.equal(manifest.environment.image_digest, HASH_A);
  assert.equal(manifest.environment.audit_contract_fingerprint, HASH_B);
  assert.equal(
    manifest.environment.local_adc,
    "fresh managed-domain credentials; read-only cloud checks enabled",
  );
  const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.equal(
    events.filter((event) => event.type === "environment_metadata_amended").length,
    1,
  );
});

it("records strict bodyless structured evidence as substantive case evidence", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "structured-evidence-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "STRUCTURED-001" })],
  });
  const evidencePayload = {
    evidence_id: "STRUCTURED-001-SOURCE-001",
    case_id: "STRUCTURED-001",
    stage: "deployment_preflight",
    observation_class: "source_integrity",
    outcome: "matched",
    metric_counts: { declared_roles: 6, declared_modes: 6 },
    state_hashes: { case_inventory: HASH_A },
    notes: ["Only bodyless deployment metadata was captured."],
  };
  await assert.rejects(
    recordStructuredEvidence(runDir, {
      ...evidencePayload,
      metric_counts: { declared_roles: -1 },
    }),
    /must be a nonnegative integer/,
  );
  await assert.rejects(
    recordStructuredEvidence(runDir, {
      ...evidencePayload,
      raw_content: "unsafe",
    }),
    /raw_content is not allowed/,
  );
  const evidence = await recordStructuredEvidence(runDir, evidencePayload);
  assert.equal(evidence.idempotent, false);
  assert.equal(
    (await recordStructuredEvidence(runDir, evidencePayload)).idempotent,
    true,
  );
  await recordCaseResult(runDir, {
    case_id: "STRUCTURED-001",
    ...resultFor({ evidence: [evidence.reference] }),
  });
  await finalizeAuditRun(runDir);
  const validation = await validateAuditRun(runDir);
  assert.equal(validation.structured_evidence_count, 1);
  const events = (await readFile(path.join(runDir, "events.jsonl"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  assert.equal(
    events.filter((event) => event.type === "structured_evidence_recorded").length,
    1,
  );
});

it("amends mutation kind only with authority and existing terminal checkpoints", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "mutation-kind-amend-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [
      caseDefinition({ id: "MUTATION-BLOCKED-001" }),
      caseDefinition({ id: "MUTATION-PASS-001" }),
      caseDefinition({
        id: "MUTATION-REVERSIBLE-001",
        mutationKind: "app_write",
      }),
    ],
  });
  const blocker = {
    description: "The isolated mutation dependency is unavailable.",
    unblock_action: "Provide the isolated dependency before execution.",
  };
  await recordCaseResult(runDir, {
    case_id: "MUTATION-BLOCKED-001",
    ...resultFor({ current: "blocked", alignment: "blocked" }),
    blocker,
  });
  await recordFinding(
    runDir,
    findingFor({
      findingId: "FND-MUTATION-BLOCKED-001-01",
      caseId: "MUTATION-BLOCKED-001",
      blocker,
    }),
  );
  await assert.rejects(
    amendCaseDefinition(runDir, {
      case_id: "MUTATION-BLOCKED-001",
      reason: "Mutation classification correction without authority basis.",
      changes: {
        mutation_kind: "test_action",
        safe_alias: "audit:test-alias",
      },
    }),
    /authority_basis must be a non-empty string/,
  );
  const blockedMutationAmendment = {
    case_id: "MUTATION-BLOCKED-001",
    reason: "The documented control is a Test action, not a read.",
    authority_basis: "The case remains blocked and no Test effect is replayed.",
    changes: {
      mutation_kind: "test_action",
      safe_alias: "audit:test-alias",
    },
  };
  assert.equal(
    (await amendCaseDefinition(runDir, blockedMutationAmendment)).idempotent,
    false,
  );
  assert.equal(
    (await amendCaseDefinition(runDir, blockedMutationAmendment)).idempotent,
    true,
  );

  const passDom = await recordDom(runDir, "MUTATION-PASS-001");
  await recordCaseResult(runDir, {
    case_id: "MUTATION-PASS-001",
    ...resultFor({ evidence: [passDom.reference] }),
  });
  await assert.rejects(
    amendCaseDefinition(runDir, {
      case_id: "MUTATION-PASS-001",
      reason: "Unsafe post-terminal mutation reclassification.",
      authority_basis: "No checkpoint evidence exists.",
      changes: {
        mutation_kind: "test_write",
        safe_alias: "audit:test-alias",
      },
    }),
    /without existing intent and effect checkpoints/,
  );

  const reversibleIntent = {
    case_id: "MUTATION-REVERSIBLE-001",
    mutation_key: "mutation-kind-amend-run:reversible",
    safe_alias: "audit:test-alias",
    planned_effect: "Change and restore one isolated Test setting.",
  };
  await checkpointMutationIntent(runDir, reversibleIntent);
  await recordTestEffect(runDir, {
    case_id: "MUTATION-REVERSIBLE-001",
    mutation_key: reversibleIntent.mutation_key,
    record_type: "runner_test",
    record_id: "mutation-amend-record-001",
    safe_alias: "audit:test-alias",
    outcome: "test_effect_observed",
  });
  const effectReference = await matchingEventReference(
    runDir,
    (event) =>
      event.type === "test_effect_observed" &&
      event.case_id === "MUTATION-REVERSIBLE-001",
  );
  await recordCaseResult(runDir, {
    case_id: "MUTATION-REVERSIBLE-001",
    ...resultFor({ evidence: [effectReference] }),
  });
  await amendCaseDefinition(runDir, {
    case_id: "MUTATION-REVERSIBLE-001",
    reason: "The Test setting is restored after observation.",
    authority_basis: "Existing intent and effect checkpoints bind the same Test alias.",
    changes: { mutation_kind: "reversible_app_write" },
  });
  await assert.rejects(
    finalizeAuditRun(runDir),
    /requires structured reversible-effect verification/,
  );
  await recordReversibleEffectCheckpoint(runDir, {
    case_id: "MUTATION-REVERSIBLE-001",
    mutation_key: reversibleIntent.mutation_key,
    before_hash: HASH_A,
    change_hash: HASH_B,
    restore_hash: HASH_A,
    restore_outcome: "restored",
  });
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
});

it("amends only non-broadening case metadata and enforces traceability inventories", async () => {
  const baseDir = await temporaryBase();
  const liveCase = {
    ...caseDefinition({ id: "DEFINITION-001", dataMode: "live_read" }),
    role: "Admin",
    guide_refs: ["guide#tabs.Admin"],
    reviewer_refs: ["reviewer-pass#Console-1"],
  };
  await assert.rejects(
    initializeAuditRun({
      baseDir,
      runId: "invalid-guide-run",
      environment: {
        deployment_url: "https://audit.example.invalid",
        repository_commit: "0123456789abcdef",
      },
      guideSource: "docs/test-guide.html",
      roles: ["Admin"],
      modes: ["live_read"],
      guideSectionIds: ["tabs"],
      reviewerChecklistIds: ["reviewer-pass#Console-1"],
      cases: [{ ...liveCase, guide_refs: ["guide#unknown.Admin"] }],
    }),
    /undeclared root unknown/,
  );
  await assert.rejects(
    initializeAuditRun({
      baseDir,
      runId: "invalid-reviewer-run",
      environment: {
        deployment_url: "https://audit.example.invalid",
        repository_commit: "0123456789abcdef",
      },
      guideSource: "docs/test-guide.html",
      roles: ["Admin"],
      modes: ["live_read"],
      guideSectionIds: ["tabs"],
      reviewerChecklistIds: ["reviewer-pass#Console-1"],
      cases: [{ ...liveCase, reviewer_refs: ["reviewer-pass#Console-99"] }],
    }),
    /is not declared exactly/,
  );
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "definition-amend-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Admin", "Auditor"],
    modes: ["live_read", "test", "live_effect"],
    guideSectionIds: ["tabs"],
    reviewerChecklistIds: ["reviewer-pass#Console-1"],
    cases: [liveCase],
  });
  await declareTraceabilityInventory(runDir, {
    guide_section_ids: ["tabs"],
    reviewer_checklist_ids: ["reviewer-pass#Console-1"],
    reason: "Bind the run to the verified guide and reviewer catalogs.",
  });
  await assert.rejects(
    amendCaseDefinition(runDir, {
      case_id: "DEFINITION-001",
      reason: "This unsafe correction must be rejected.",
      authority_basis: "The source does not authorize broader effects.",
      changes: {
        data_mode: "live_effect",
        expected: { ...liveCase.expected, data_mode: "live_effect" },
      },
    }),
    /would broaden authority/,
  );
  const amended = await amendCaseDefinition(runDir, {
    case_id: "DEFINITION-001",
    reason: "The case is an isolated Test read under the Auditor role.",
    authority_basis: "The correction narrows both role and data-mode authority.",
    changes: {
      title: "Narrowed Test case",
      route: "/test",
      role: "Auditor",
      data_mode: "test",
      screenshot_safe: true,
      guide_refs: ["guide#tabs.Console"],
      reviewer_refs: ["reviewer-pass#Console-1"],
      expected: { ...liveCase.expected, data_mode: "test" },
    },
  });
  assert.equal(amended.idempotent, false);
  assert.equal(amended.auditCase.title, "Narrowed Test case");
  const dom = await recordDom(runDir, "DEFINITION-001");
  await recordCaseResult(runDir, {
    case_id: "DEFINITION-001",
    ...resultFor({ evidence: [dom.reference] }),
  });
  await amendManifestDeclarations(runDir, {
    roles: ["Auditor"],
    modes: ["test"],
    reason: "Reconcile declarations after narrowing the case metadata.",
    authority_basis: "The declaration now exactly mirrors the inventory.",
  });
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
});

it("bounds transient retries and records bodyless attempt evidence", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "bounded-retry-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "RETRY-001" })],
  });
  let attempts = 0;
  const value = await withBoundedTransientRetries({
    runDir,
    caseId: "RETRY-001",
    operationId: "safe-browser-navigation",
    maxAttempts: 3,
    classifyTransient: (error) => error instanceof Error && error.name === "TimeoutError",
    operation: async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("transient navigation timeout");
        error.name = "TimeoutError";
        throw error;
      }
      return "observed";
    },
  });
  assert.equal(value, "observed");
  assert.equal(attempts, 3);
  const dom = await recordDom(runDir, "RETRY-001");
  await recordCaseResult(runDir, {
    case_id: "RETRY-001",
    ...resultFor({ evidence: [dom.reference] }),
  });
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
  const rawEvents = await readFile(path.join(runDir, "events.jsonl"), "utf8");
  assert.equal(rawEvents.includes("transient navigation timeout"), false);
  const events = rawEvents.trim().split(/\r?\n/).map(JSON.parse);
  assert.equal(
    events.filter((event) => event.type === "transient_attempt_started").length,
    3,
  );
  assert.equal(
    events.filter((event) => event.type === "transient_attempt_failed").length,
    2,
  );
});

it("adopts ambiguous intent effects by readback and verifies reversible restoration", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "readback-reversible-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [
      caseDefinition({ id: "READBACK-001", mutationKind: "test_write" }),
      caseDefinition({
        id: "REVERSIBLE-001",
        mutationKind: "reversible_app_write",
      }),
    ],
  });
  const readbackIntent = {
    case_id: "READBACK-001",
    mutation_key: "readback-reversible-run:readback",
    safe_alias: "audit:test-alias",
    planned_effect: "Adopt one isolated Test effect only after readback.",
  };
  await checkpointMutationIntent(runDir, readbackIntent);
  const recovered = await resolveAmbiguousMutationIntent(runDir, {
    case_id: "READBACK-001",
    mutation_key: readbackIntent.mutation_key,
    readback: { outcome: "effect_found", state_hash: HASH_A },
    adopted_effect: {
      record_type: "runner_test",
      record_id: "readback-record-001",
      safe_alias: "audit:test-alias",
      outcome: "test_effect_adopted",
    },
  });
  assert.equal(recovered.outcome, "effect_found");
  const adoptedEffectReference = await matchingEventReference(
    runDir,
    (event) => event.type === "test_effect_observed" && event.case_id === "READBACK-001",
  );
  await recordCaseResult(runDir, {
    case_id: "READBACK-001",
    ...resultFor({ evidence: [adoptedEffectReference] }),
  });

  const reversibleIntent = {
    case_id: "REVERSIBLE-001",
    mutation_key: "readback-reversible-run:reversible",
    safe_alias: "audit:test-alias",
    planned_effect: "Change and restore one isolated Test setting.",
  };
  await checkpointMutationIntent(runDir, reversibleIntent);
  await recordTestEffect(runDir, {
    case_id: "REVERSIBLE-001",
    mutation_key: reversibleIntent.mutation_key,
    record_type: "runner_test",
    record_id: "reversible-record-001",
    safe_alias: "audit:test-alias",
    outcome: "test_effect_observed",
  });
  await recordReversibleEffectCheckpoint(runDir, {
    case_id: "REVERSIBLE-001",
    mutation_key: reversibleIntent.mutation_key,
    before_hash: HASH_A,
    change_hash: HASH_B,
    restore_hash: HASH_A,
    restore_outcome: "restored",
  });
  const reversibleEffectReference = await matchingEventReference(
    runDir,
    (event) =>
      event.type === "test_effect_observed" && event.case_id === "REVERSIBLE-001",
  );
  await recordCaseResult(runDir, {
    case_id: "REVERSIBLE-001",
    ...resultFor({ evidence: [reversibleEffectReference] }),
  });
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
});

it("rejects raw console content in favor of allowlisted hashes", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "console-schema-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [caseDefinition({ id: "CONSOLE-SCHEMA-001" })],
  });
  const dom = await recordDom(runDir, "CONSOLE-SCHEMA-001");
  await assert.rejects(
    recordCaseResult(runDir, {
      case_id: "CONSOLE-SCHEMA-001",
      ...resultFor({ evidence: [dom.reference] }),
      console_errors: [{ message: "raw browser content", error_hash: HASH_A }],
    }),
    /message is not allowed/,
  );
  const resultWithBody = resultFor({ evidence: [dom.reference] });
  resultWithBody.actual.message_body = "raw provider content";
  await assert.rejects(
    recordCaseResult(runDir, {
      case_id: "CONSOLE-SCHEMA-001",
      ...resultWithBody,
    }),
    /actual.message_body is not allowed/,
  );
});

it("authorizes replay only after a no-effect readback and requires evidence for not-reachable cases", async () => {
  const baseDir = await temporaryBase();
  const { runDir } = await initializeAuditRun({
    baseDir,
    runId: "readback-no-effect-run",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource: "docs/test-guide.html",
    roles: ["Auditor"],
    modes: ["test"],
    cases: [
      caseDefinition({ id: "READBACK-NONE-001", mutationKind: "test_write" }),
      caseDefinition({ id: "NOT-REACHABLE-001" }),
    ],
  });
  const intent = {
    case_id: "READBACK-NONE-001",
    mutation_key: "readback-no-effect-run:none",
    safe_alias: "audit:test-alias",
    planned_effect: "Replay only after readback proves no Test effect exists.",
  };
  await checkpointMutationIntent(runDir, intent);
  const recovery = await resolveAmbiguousMutationIntent(runDir, {
    case_id: "READBACK-NONE-001",
    mutation_key: intent.mutation_key,
    readback: { outcome: "no_effect", state_hash: HASH_A },
  });
  assert.equal(recovery.outcome, "no_effect");
  await recordTestEffect(runDir, {
    case_id: "READBACK-NONE-001",
    mutation_key: intent.mutation_key,
    record_type: "runner_test",
    record_id: "replayed-record-001",
    safe_alias: "audit:test-alias",
    outcome: "test_effect_observed_after_authorized_replay",
  });
  const effectReference = await matchingEventReference(
    runDir,
    (event) =>
      event.type === "test_effect_observed" && event.case_id === "READBACK-NONE-001",
  );
  await recordCaseResult(runDir, {
    case_id: "READBACK-NONE-001",
    ...resultFor({ evidence: [effectReference] }),
  });
  await recordCaseResult(runDir, {
    case_id: "NOT-REACHABLE-001",
    ...resultFor({ current: "not_reachable", alignment: "gap" }),
  });
  await recordFinding(
    runDir,
    findingFor({
      findingId: "FND-NOT-REACHABLE-001-01",
      caseId: "NOT-REACHABLE-001",
      current: "not_reachable",
      alignment: "gap",
    }),
  );
  await assert.rejects(
    finalizeAuditRun(runDir),
    /NOT-REACHABLE-001 has no substantive evidence/,
  );
  const dom = await recordDom(runDir, "NOT-REACHABLE-001");
  await amendCaseEvidenceReferences(runDir, {
    case_id: "NOT-REACHABLE-001",
    evidence_references: [dom.reference],
  });
  await replaceFinding(runDir, {
    finding_id: "FND-NOT-REACHABLE-001-01",
    reason: "Attach the newly collected bodyless DOM evidence.",
    replacement: findingFor({
      findingId: "FND-NOT-REACHABLE-001-01",
      caseId: "NOT-REACHABLE-001",
      current: "not_reachable",
      alignment: "gap",
      evidence: [dom.reference],
    }),
  });
  await finalizeAuditRun(runDir);
  await validateAuditRun(runDir);
});
