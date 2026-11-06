// S252 ARCH-S252-2, AC-S252-2, AC-S252-5, R-S252-3 to R-S252-5 and R-S252-9 to R-S252-11: the
// check for the one-path defect ledger and staff walkthrough matrix
// (scripts/lib/one-path-walkthrough/defect-ledger.json). Plain Node, no app import; the unit test
// tests/unit/s252-defect-ledger.test.ts and the command scripts/check-one-path-defect-ledger.mjs
// both call checkDefectLedger.
//
// It fails on: a November 4 problem, outside item or reported item of the specification missing
// from the ledger; an owning requirement id that does not resolve to its definition in
// docs/feature-suites/*.md; a row with an empty result, or a result that is neither verified with
// its evidence nor open with a reason; a reported row with no check result; a verified row whose
// evidence names a journey step the journey driver does not have, a builder check its driver does
// not have, or a test file that does not exist; a walkthrough matrix without a row for each budget
// and each ledger row, or with a human column that is anything but the NOT RUN vocabulary while no
// staff session is recorded; the first full case or the approval handoff recorded as done; and,
// given a journey result (journey.json from the rehearsal's private run directory), a verified row
// whose evidence that run observed failing (L60).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const LEDGER_PATH = "scripts/lib/one-path-walkthrough/defect-ledger.json";
export const SPEC_PATH =
  "docs/feature-suites/renewal-one-path-staff-walkthrough-and-help.md";
export const JOURNEY_DRIVER = "tests/browser/one-path-journey-driver.mjs";
/** The S238 vocabulary (docs/evidence/s238-isolated-journey-2026-10-28.md), exactly. */
export const HUMAN_NOT_RUN = "Human verdict: NOT RUN — no human observer";
/** R-S252-4: the two assistant observations recorded with their owners and not fixed here. */
export const OUTSIDE_ITEMS = [
  { observed: "No sign of progress after a question", owners: ["S171"] },
  { observed: "An answer that reused an earlier conversation's month", owners: ["S199"] },
];
/** The journey driver's builder phases and the driver file each one imports. */
export const PHASE_DRIVERS = {
  "s254-smoke": "tests/browser/one-path-smoke-driver.mjs",
  "s249-kickoff": "tests/browser/one-path-kickoff-driver.mjs",
  "s247-s248-guided-path": "tests/browser/one-path-guided-path-driver.mjs",
  "s250-s251-variants": "tests/browser/one-path-variants-driver.mjs",
  "s254-stand-in-proof": "tests/browser/one-path-stand-in-proof-driver.mjs",
  "s249-verification": "tests/browser/one-path-kickoff-verification-driver.mjs",
};

const read = (root, path) => readFileSync(join(root, path), "utf8");

/** The rows of the markdown table that follows `marker` in the specification. */
function specTable(spec, marker) {
  const start = spec.indexOf(marker);
  if (start < 0) return [];
  const lines = spec.slice(start).split("\n");
  const rows = [];
  let inTable = false;
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|")) {
      inTable = true;
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim());
      if (cells.every((cell) => /^-+$/.test(cell))) continue;
      rows.push(cells);
    } else if (inTable) break;
  }
  return rows.slice(1);
}

/** R-S252-3 and R-S252-11 as the specification on this tree states them. */
export function specRows(root = process.cwd()) {
  const spec = read(root, SPEC_PATH);
  const ids = (cell) =>
    cell
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  return {
    november4: specTable(spec, "**R-S252-3").map(([observed, owners]) => ({
      observed,
      owners: ids(owners),
    })),
    reported: specTable(spec, "**R-S252-11").map(([reported, check, owners]) => ({
      reported,
      check,
      owners: ids(owners),
    })),
  };
}

/** Every requirement and suite id defined in docs/feature-suites/*.md. */
export function definedIds(root = process.cwd()) {
  const dir = join(root, "docs/feature-suites");
  const requirements = new Set();
  const suites = new Set();
  for (const file of readdirSync(dir).filter((name) => name.endsWith(".md"))) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const match of text.matchAll(/\*\*(R-S\d+-\d+)(?![\d])/g))
      requirements.add(match[1]);
    const heading = /^# (S\d+)\b/m.exec(text);
    if (heading) suites.add(heading[1]);
  }
  return { requirements, suites };
}

/** The journey step ids the journey driver declares. */
export function journeyStepIds(root = process.cwd()) {
  const source = read(root, JOURNEY_DRIVER);
  return new Set(
    [...source.matchAll(/["'`]((?:journey|named|run)\.[a-z0-9-]+)["'`]/g)].map(
      (match) => match[1],
    ),
  );
}

function evidenceProblems(row, evidence, context) {
  const problems = [];
  if (!Array.isArray(evidence) || evidence.length === 0)
    return [`${row.id}: a verified result names no journey step or test.`];
  for (const entry of evidence) {
    if (entry.journey) {
      if (!context.steps.has(entry.journey))
        problems.push(`${row.id}: the journey driver has no step ${entry.journey}.`);
    } else if (entry.phase) {
      const file = PHASE_DRIVERS[entry.phase];
      if (!file) problems.push(`${row.id}: the journey has no phase ${entry.phase}.`);
      else if (!entry.check || !read(context.root, file).includes(entry.check))
        problems.push(`${row.id}: ${file} has no check named "${entry.check}".`);
    } else if (entry.test) {
      if (!existsSync(join(context.root, entry.test)))
        problems.push(`${row.id}: the test ${entry.test} does not exist.`);
    } else
      problems.push(`${row.id}: an evidence entry names no journey step, phase or test.`);
  }
  return problems;
}

/** L60: a verified row whose evidence the given journey run observed failing. */
function contradictions(row, evidence, journey) {
  if (!journey) return [];
  const problems = [];
  for (const entry of evidence ?? []) {
    if (entry.journey) {
      const seen = [
        ...(journey.checks ?? []).filter((check) => check.id === entry.journey),
        ...(journey.budgets ?? []).filter((budget) => budget.id === entry.journey),
      ];
      if (!seen.length)
        problems.push(
          `${row.id}: run ${journey.runId} did not observe ${entry.journey}.`,
        );
      else if (seen.some((check) => !check.passed))
        problems.push(
          `${row.id}: run ${journey.runId} observed ${entry.journey} failing.`,
        );
    } else if (entry.phase) {
      const seen = (journey.checks ?? []).filter(
        (check) =>
          check.id.startsWith(`${entry.phase}.`) && check.name.includes(entry.check),
      );
      if (!seen.length)
        problems.push(
          `${row.id}: run ${journey.runId} did not observe "${entry.check}" in ${entry.phase}.`,
        );
      else if (seen.some((check) => !check.passed))
        problems.push(
          `${row.id}: run ${journey.runId} observed "${entry.check}" in ${entry.phase} failing.`,
        );
    }
  }
  return problems;
}

function resultProblems(row, context) {
  const result = row.result;
  if (!result || typeof result !== "object") return [`${row.id}: the result is empty.`];
  if (result.state === "verified")
    return [
      ...evidenceProblems(row, result.evidence, context),
      ...contradictions(row, result.evidence, context.journey),
    ];
  if (result.state === "open")
    return typeof result.reason === "string" && result.reason.trim().length >= 20
      ? []
      : [`${row.id}: an open result has no reason.`];
  return [`${row.id}: the result is neither verified nor open.`];
}

/**
 * Every problem with the ledger; an empty list means ARCH-S252-2 holds. `journey` is a parsed
 * journey.json, or null for the check on the tree alone.
 */
export function checkDefectLedger(ledger, { root = process.cwd(), journey = null } = {}) {
  const problems = [];
  const spec = specRows(root);
  const ids = definedIds(root);
  const context = { root, steps: journeyStepIds(root), journey };
  const rows = Array.isArray(ledger?.rows) ? ledger.rows : [];
  const seenIds = new Set();
  for (const row of rows) {
    if (!row.id || seenIds.has(row.id))
      problems.push(`A row has no id or repeats ${row.id}.`);
    seenIds.add(row.id);
    for (const owner of row.owners ?? []) {
      const known = /^R-S\d+-\d+$/.test(owner)
        ? ids.requirements.has(owner)
        : /^S\d+$/.test(owner)
          ? ids.suites.has(owner)
          : false;
      if (!known)
        problems.push(
          `${row.id}: ${owner} is not a requirement or suite defined in docs/feature-suites.`,
        );
    }
    if (!(row.owners ?? []).length) problems.push(`${row.id}: the row names no owner.`);
    if (row.kind === "reported" && !(row.checkResult ?? "").trim())
      problems.push(`${row.id}: a reported item has no check result.`);
    problems.push(...resultProblems(row, context));
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const expectRows = (kind, expected, key) => {
    const have = rows.filter((row) => row.kind === kind);
    for (const item of expected) {
      const match = have.find((row) => row[key] === item[key]);
      if (!match) problems.push(`The ledger is missing the ${kind} row "${item[key]}".`);
      else if (!same(match.owners, item.owners))
        problems.push(
          `${match.id}: its owners ${JSON.stringify(match.owners)} differ from the specification's ${JSON.stringify(item.owners)}.`,
        );
      else if (kind === "reported" && match.check !== item.check)
        problems.push(`${match.id}: its check differs from the specification's.`);
    }
    if (have.length !== expected.length)
      problems.push(
        `The ledger has ${have.length} ${kind} rows; the specification lists ${expected.length}.`,
      );
  };
  expectRows("november-4", spec.november4, "observed");
  expectRows("outside", OUTSIDE_ITEMS, "observed");
  expectRows("reported", spec.reported, "reported");
  if (spec.november4.length !== 20)
    problems.push(
      `The specification's R-S252-3 table has ${spec.november4.length} rows; twenty were expected.`,
    );

  // R-S252-5 / L62: the walkthrough matrix.
  const matrix = Array.isArray(ledger?.matrix) ? ledger.matrix : [];
  const session = ledger?.staffSession ?? null;
  const budgetIds = Array.isArray(ledger?.budgets)
    ? ledger.budgets.map((budget) => budget.id)
    : [];
  if (budgetIds.length === 0) problems.push("The ledger lists no action budget.");
  for (const id of budgetIds)
    if (!context.steps.has(id)) problems.push(`The journey driver has no budget ${id}.`);
  for (const id of [...budgetIds, ...rows.map((row) => row.id)]) {
    const entry = matrix.find((item) => item.row === id);
    if (!entry) {
      problems.push(`The walkthrough matrix has no row for ${id}.`);
      continue;
    }
    if (!(entry.model ?? "").trim())
      problems.push(`The walkthrough matrix row ${id} has no model result.`);
    if (session === null && entry.human !== HUMAN_NOT_RUN)
      problems.push(
        `The walkthrough matrix row ${id} has a human result while no staff session is recorded.`,
      );
    if (session !== null && !/^(pass|fail): .{10,}/.test(entry.human ?? ""))
      problems.push(
        `The walkthrough matrix row ${id} needs a human pass or fail with a one-line reason.`,
      );
  }
  if (session === null && ledger?.humanVerdict !== HUMAN_NOT_RUN)
    problems.push("The human verdict is not NOT RUN while no staff session is recorded.");
  if (
    session !== null &&
    !(/^\d{4}-\d{2}-\d{2}$/.test(session.date ?? "") && (session.observer ?? "").trim())
  )
    problems.push("A recorded staff session needs its date and observer.");

  // R-S252-9 / R-S252-10: never recorded as done without the case sheet and the U4 answer.
  if (
    ledger?.firstFullCase?.state !== "NOT RUN" &&
    !ledger?.firstFullCase?.caseSheetOutsideGit
  )
    problems.push(
      "The first full case is recorded as run without its private case sheet.",
    );
  if (
    ledger?.approvalHandoff?.state !== "waiting on U4" &&
    !ledger?.approvalHandoff?.answeredBy
  )
    problems.push("The approval handoff is recorded without the answer that names it.");
  return problems;
}

/** The committed ledger. */
export function readDefectLedger(root = process.cwd()) {
  return JSON.parse(read(root, LEDGER_PATH));
}
