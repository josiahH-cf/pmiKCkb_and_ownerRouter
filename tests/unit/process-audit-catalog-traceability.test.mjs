import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, it } from "vitest";

import {
  GUIDE_SECTION_IDS,
  PROCESS_AUDIT_CASES,
  REVIEWER_CHECKLIST_IDS,
} from "../../scripts/process-audit-cases.mjs";
import { initializeAuditRun } from "../../scripts/process-audit-runner.mjs";

// Regression coverage for the 2026-08-17 defect: the checked-in catalog declared 32
// reviewer-checklist IDs but mapped only 18, so validateTraceabilityCompleteness rejected
// every attempt to initialize a run from the committed sources. The catalog and the runner
// are shipped together, so "the committed catalog can start a run" is the contract under test.

const temporaryBases = [];

afterEach(async () => {
  while (temporaryBases.length > 0) {
    const base = temporaryBases.pop();
    expect(path.basename(base).startsWith("pmi-audit-catalog-")).toBe(true);
    await rm(base, { recursive: true, force: true });
  }
});

function guideRoot(reference) {
  return reference.startsWith("guide#")
    ? reference.slice("guide#".length).split(".", 1)[0]
    : null;
}

it("maps every declared reviewer-checklist ID to at least one committed case", () => {
  const mapped = new Set(
    PROCESS_AUDIT_CASES.flatMap((auditCase) => auditCase.reviewer_refs ?? []),
  );
  const orphaned = REVIEWER_CHECKLIST_IDS.filter((id) => !mapped.has(id));
  expect(orphaned, `Unmapped reviewer checklist IDs: ${orphaned.join(", ")}`).toEqual([]);
});

it("maps every declared guide section to at least one committed case", () => {
  const roots = new Set(
    PROCESS_AUDIT_CASES.flatMap((auditCase) =>
      auditCase.guide_refs.map(guideRoot).filter(Boolean),
    ),
  );
  const orphaned = GUIDE_SECTION_IDS.filter(
    (section) => section !== "reviewer-pass" && !roots.has(section),
  );
  expect(orphaned, `Unmapped guide sections: ${orphaned.join(", ")}`).toEqual([]);
});

it("declares only reviewer references that exist in the checklist inventory", () => {
  const declared = new Set(REVIEWER_CHECKLIST_IDS);
  const unknown = [
    ...new Set(
      PROCESS_AUDIT_CASES.flatMap((auditCase) => auditCase.reviewer_refs ?? []).filter(
        (reference) => !declared.has(reference),
      ),
    ),
  ];
  expect(unknown, `Unknown reviewer references: ${unknown.join(", ")}`).toEqual([]);
});

it("initializes a run from the committed catalog, roles, and modes", async () => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), "pmi-audit-catalog-"));
  temporaryBases.push(baseDir);

  const roles = [...new Set(PROCESS_AUDIT_CASES.map(({ role }) => role))].sort();
  const modes = [
    ...new Set(PROCESS_AUDIT_CASES.map(({ data_mode }) => data_mode)),
  ].sort();

  const { manifest } = await initializeAuditRun({
    baseDir,
    runId: "committed-catalog-traceability",
    environment: {
      deployment_url: "https://audit.example.invalid",
      repository_commit: "0123456789abcdef",
    },
    guideSource:
      "docs/pmi-kc-working-process-guide-what-each-action-does-2026-07-16.html",
    roles,
    modes,
  });

  expect(manifest.case_inventory).toHaveLength(PROCESS_AUDIT_CASES.length);
  expect(manifest.case_inventory.every((entry) => entry?.id)).toBe(true);
});

it("keeps the committed catalog free of array holes", () => {
  const holes = PROCESS_AUDIT_CASES.filter(
    (auditCase) => !auditCase || typeof auditCase !== "object",
  );
  expect(holes).toEqual([]);
  expect(new Set(PROCESS_AUDIT_CASES.map(({ id }) => id)).size).toBe(
    PROCESS_AUDIT_CASES.length,
  );
});
