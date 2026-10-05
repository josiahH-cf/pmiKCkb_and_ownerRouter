import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const BATCH005_HANDOFF = "application-usability-reliability-2026-10";
export const BATCH005_SUITES = [
  168, 169, 170, 171, 172, 173, 174, 175, 87, 176, 177, 178, 179, 180, 181,
];
export const BATCH005_COHORTS = [
  "public_vendor",
  "dashboard_work",
  "knowledge_processes",
  "operations_communications",
  "admin_connections",
  "renewals",
];
const validChecks = (checks) =>
  Array.isArray(checks) &&
  checks.length > 0 &&
  checks.every(
    (check) =>
      check.outcome === "passed" &&
      typeof check.environment === "string" &&
      check.environment.trim() &&
      typeof check.test === "string" &&
      check.test.trim(),
  );

/** Read the native contracts without changing them or inventing verification results. */
export function readBatch005Requirements(root) {
  const directory = join(root, "docs/feature-suites");
  const contracts = readdirSync(directory)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({
      path: `docs/feature-suites/${name}`,
      text: readFileSync(join(directory, name), "utf8"),
    }))
    .filter(({ text }) => text.includes(`<!-- feature-handoff: ${BATCH005_HANDOFF} -->`));
  const rows = [];
  for (const suite of BATCH005_SUITES) {
    const contract = contracts.find(({ text }) =>
      new RegExp(`^# S${suite} `, "m").test(text),
    );
    if (!contract) throw new Error(`Missing native contract S${suite}`);
    const owners = [...contract.text.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1]);
    for (const line of contract.text.split(/\r?\n/)) {
      if (!line.startsWith(`| R-S${suite}-`)) continue;
      const [requirement, architecture, behavior, humanLitmus, adversarial] = line
        .split("|")
        .slice(1, 6)
        .map((value) => value.trim());
      const id = requirement.match(/^R-S\d+-\d+/)?.[0];
      const ac = adversarial.match(/^AC-S\d+-\d+/)?.[0];
      if (!id || !ac || !architecture || !behavior || !humanLitmus)
        throw new Error(`Incomplete trace row S${suite}`);
      rows.push({
        id,
        requirement,
        suite: `S${suite}`,
        contract: contract.path,
        architecture,
        behavior,
        adversarial: ac,
        humanLitmus,
        owners,
      });
    }
  }
  if (rows.length !== 116 || new Set(rows.map(({ id }) => id)).size !== 116)
    throw new Error("Batch 005 must contain exactly 116 unique requirements");
  return rows;
}

/** Completion requires evidence, rather than a status copied from an authored specification. */
export function validateBatch005Evidence(
  rows,
  evidence,
  { requireComplete = false, expectedInventory } = {},
) {
  const expected = new Map(rows.map((row) => [row.id, row]));
  if (
    evidence.handoff !== BATCH005_HANDOFF ||
    evidence.requirements.length !== expected.size
  )
    throw new Error("Evidence requirement coverage differs from the selected program");
  const seen = new Set();
  for (const result of evidence.requirements) {
    const row = expected.get(result.id);
    if (!row || seen.has(result.id))
      throw new Error("Unknown or duplicate evidence requirement");
    seen.add(result.id);
    for (const key of [
      "architecture",
      "behavior",
      "adversarial",
      "humanLitmus",
      "contract",
    ]) {
      if (result[key] !== row[key])
        throw new Error(`Trace mapping differs for ${result.id}`);
    }
    if (
      !["not_run", "gap_confirmed", "preserved", "passed", "failed", "blocked"].includes(
        result.status,
      )
    )
      throw new Error("Unknown evidence status");
    if (result.status === "passed" || result.status === "preserved") {
      if (!validChecks(result.checks))
        throw new Error(`Passing requirement lacks actual owner evidence: ${result.id}`);
      if (
        !["expected_failure", "already_satisfied"].includes(result.baseline?.outcome) ||
        !result.baseline?.test
      )
        throw new Error(`Passing requirement lacks baseline evidence: ${result.id}`);
    }
    if (requireComplete && !["passed", "preserved"].includes(result.status))
      throw new Error(`Unverified requirement: ${result.id}`);
  }
  if (requireComplete) {
    for (const kind of ["routes", "consumers"]) {
      const inventory = evidence.inventory?.[kind];
      if (
        !Array.isArray(inventory) ||
        !inventory.length ||
        inventory.some(
          (owner) =>
            !owner.owner || owner.inspected !== true || !validChecks(owner.checks),
        )
      )
        throw new Error(`Incomplete ${kind} inventory`);
      const owners = inventory.map((owner) => owner.owner);
      if (new Set(owners).size !== owners.length)
        throw new Error(`Duplicate ${kind} inventory owner`);
      if (
        expectedInventory &&
        (owners.length !== expectedInventory[kind].length ||
          expectedInventory[kind].some((owner) => !owners.includes(owner)))
      )
        throw new Error(`Actual source ${kind} inventory coverage differs`);
    }
    const cohorts = evidence.inventory?.cohorts;
    if (
      !Array.isArray(cohorts) ||
      cohorts.length !== BATCH005_COHORTS.length ||
      BATCH005_COHORTS.some(
        (name) =>
          cohorts.filter(
            (row) =>
              row.cohort === name && row.inspected === true && validChecks(row.checks),
          ).length !== 1,
      )
    )
      throw new Error("Incomplete six-cohort inventory");
    const content = evidence.inventory?.content;
    if (
      !Array.isArray(content) ||
      !content.length ||
      content.some(
        (row) =>
          !row.owner ||
          !row.state ||
          !row.purpose ||
          ![
            "preserve",
            "slim_remove",
            "hide",
            "merge",
            "rename",
            "reorganize",
            "add",
          ].includes(row.action) ||
          !validChecks(row.checks),
      )
    )
      throw new Error("Incomplete content dispositions");
    for (const gate of ["focused", "native_full", "core_e2e", "compiled_browser"]) {
      if (
        evidence.gates?.[gate]?.status !== "passed" ||
        !validChecks(evidence.gates[gate].checks)
      )
        throw new Error(`Incomplete ${gate} gate`);
    }
    for (const phase of ["start", "end"]) {
      if (
        evidence.feedback?.[phase]?.status !== "passed" ||
        !validChecks(evidence.feedback[phase].checks)
      )
        throw new Error(`Incomplete ${phase} feedback reconciliation`);
    }
    if (
      evidence.preservation?.status !== "passed" ||
      !validChecks(evidence.preservation.checks)
    )
      throw new Error("Incomplete preservation gate");
  }
  if (
    requireComplete &&
    (evidence.release?.status !== "verified" ||
      !evidence.release?.readback ||
      evidence.release?.observationMs < 300_000)
  )
    throw new Error("Cumulative release is unverified");
  return true;
}
