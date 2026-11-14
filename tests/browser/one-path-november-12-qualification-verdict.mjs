// S284 ARCH-S284-1 and ARCH-S284-3 (R-S284-1 to R-S284-5): the versioned November 12 staff
// workflow audit matrix, its scorer and its report.
//
// scoreW12Matrix binds one run of W12-01 to W12-14 to the served source and the compiled build,
// and returns Yes, No or UNVERIFIED for each journey with its acceptance check ids, plus a batch
// verdict. A journey reads Yes only when every one of its acceptance checks passed and no refused
// connection outside the harness's known ones and no unresolved effect is recorded (BEH-S284-2).
// A journey that did not run reads UNVERIFIED, never Yes. A run limited with --only is
// incomplete, and a run whose build was made from another source than the one served is refused
// (AC-S284-3), as is a run that did not use the compiled synthetic mail build (R-S284-3). Only a
// complete run is admissible as qualification evidence; a development run is never admissible.
//
// scoreQualification adds the fail-first baseline (R-S284-1), the static staff-path check
// (ARCH-S284-2), the preservation replays on the same build with each changed pin and the suite
// that changed it (R-S284-4, AC-S284-4), the two production reads and the human verdict
// (R-S284-5). renderQualificationReport writes markdown from that output alone. The output holds
// no free text: identities in their exact form, ids from the matrix, counts, verdicts and fixed
// reason codes. Nothing a journey observed (a lease value, an address, a recipient or message
// text) can reach the report (AC-S284-5), and the production and human fields read NOT RUN
// unless an authorizing reference is supplied.
import { ENGINEERING_CASES } from "./one-path-november-10-qualification-verdict.mjs";

export const MATRIX_VERSION = "S284-2026-11-12.1";
export const YES = "Yes";
export const NO = "No";
export const UNVERIFIED = "UNVERIFIED";
export const NOT_RUN = "NOT RUN";
export const HUMAN_NOT_RUN = "Human verdict: NOT RUN — no human observer";
const VERDICTS = [YES, NO, UNVERIFIED];

function journeyRow(id, title, suite, intake, total) {
  const checks = Array.from({ length: total }, (_, index) => `AC-${suite}-${index + 1}`);
  return Object.freeze({ id, title, suite, intake, checks: Object.freeze(checks) });
}

/** S284's verification journey matrix: each journey, its owning suite and intake, and its checks. */
export const W12_MATRIX = Object.freeze([
  journeyRow("W12-01", "Only the current offer goes out", "S272", 150, 6),
  journeyRow("W12-02", "See the held message", "S273", 151, 6),
  journeyRow("W12-03", "Send through a lease re-read", "S274", 152, 6),
  journeyRow("W12-04", "The reply reaches the decision", "S275", 153, 6),
  journeyRow("W12-05", "Record the tenant's answer", "S276", 154, 7),
  journeyRow("W12-06", "Know which rent this is", "S277", 155, 6),
  journeyRow("W12-07", "Finish the source updates", "S278", 156, 6),
  journeyRow("W12-08", "One status for everyone", "S279", 157, 6),
  journeyRow("W12-09", "What needs me", "S280", 158, 7),
  journeyRow("W12-10", "See what I need, where I landed", "S281", 159, 10),
  journeyRow("W12-11", "Clear an off-cycle hold", "S282", 160, 5),
  journeyRow("W12-12", "Plain, accurate screens", "S283", 161, 8),
  journeyRow("W12-13", "Ask once, record once", "S285", 163, 5),
  journeyRow("W12-14", "One place to work a renewal", "S286", 164, 6),
]);
export const W12_JOURNEYS = Object.freeze(W12_MATRIX.map(({ id }) => id));
const MATRIX = new Map(W12_MATRIX.map((entry) => [entry.id, entry]));
const TOTAL_CHECKS = W12_MATRIX.reduce((sum, { checks }) => sum + checks.length, 0);

// The S260 replay: its ten journeys, with the Help journey N09-09 once for each role, as
// tests/browser/one-path-november-9-qualification-verdict.mjs scores them.
export const S260_REPLAY_ROWS = Object.freeze([
  "N09-01",
  "N09-02",
  "N09-03",
  "N09-04",
  "N09-05",
  "N09-06",
  "N09-07",
  "N09-08",
  "N09-09-Admin",
  "N09-09-Approver",
  "N09-09-Editor",
  "N09-10",
]);
// The S271 replay: N10-01 to N10-05 and N10-07 to N10-10. N10-06 is the human read-through.
export const S271_REPLAY_ROWS = Object.freeze([...ENGINEERING_CASES]);
// N10-02 replays on the staff path only when the static check covered the files that send its
// owner message and bring its reply (S275 R-S275-8) and found no direct call in them.
export const N1002_STAFF_PATH_FILES = Object.freeze([
  "scripts/lib/one-path-rehearsal/seeds.mjs",
  "tests/browser/one-path-november-10-core-journeys.mjs",
]);
// The static check's actions (scripts/lib/one-path-rehearsal/staff-path-check.mjs), plus a body
// it could not read.
export const STAFF_PATH_ACTIONS = Object.freeze([
  "refresh",
  "resume",
  "send",
  "schedule",
]);
const STAFF_PATH_COUNTED = [...STAFF_PATH_ACTIONS, "unresolved"];

// The rehearsal harness's known refusals: a development server asks the public npm registry for
// Next.js dist-tags and advisories, and the network guard refuses it (the S252 evidence, L58, and
// tests/browser/one-path-journey-driver.mjs). Every other refused connection counts.
export const KNOWN_HARNESS_REFUSAL_HOSTS = Object.freeze(["registry.npmjs.org"]);

// R-S284-3: the compiled synthetic mail's identity, as scripts/lib/one-path-rehearsal/compiled-mail.mjs
// records it in rehearsal.json and in the compiled log entry: one SHA-256 digest per isolated input.
export const COMPILED_MAIL_IDENTITY = Object.freeze([
  "adapter",
  "worker",
  "sourcePreview",
  "draftStandIn",
  "nextConfig",
  "isolatedNextConfig",
]);

// R-S284-5: sizing reads, never gates, and run only under a launch that names them.
export const PRODUCTION_READS = Object.freeze([
  Object.freeze({
    key: "ownerSequenceReplies",
    finding: "A-03",
    label: "Completed owner sequences with and without a recorded inbound reply",
  }),
  Object.freeze({
    key: "sequenceConflicts",
    finding: "A-04",
    label: "Responses with status 409 on the sequences route in the last 30 days",
  }),
]);

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const BUILD_ID = /^[A-Za-z0-9_-]{6,64}$/;
const RUN_ID = /^\d{8}T\d{6}Z-[a-f0-9]{8}(?:-[a-z]+)?$/;
// An authorizing reference names a record (an owner launch, a staff session, a document or its
// anchor). It is never prose, an address or an amount: no spaces, no "@" and no "$".
const REFERENCE = /^[A-Za-z][A-Za-z0-9._:#/-]{2,119}$/;
const PIN = /^[A-Za-z][A-Za-z0-9._:#/-]{0,79}$/;
const SUITE = /^S\d{2,3}$/;
const FILE = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;

const exact = (pattern, value) =>
  typeof value === "string" && pattern.test(value) ? value : null;
const count = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
const list = (value) => (Array.isArray(value) ? value : []);
const inOrder = (allowed, values) => {
  const present = list(values);
  return allowed.filter((id) => present.includes(id));
};
const flagged = (value) => value != null && value !== false;

/** A journey's recorded checks: id -> true (passed), false (failed) or null (anything else). */
function recordedChecks(checks) {
  const recorded = new Map();
  const note = (id, value) => {
    if (typeof id !== "string") return;
    const next = value === true ? true : value === false ? false : null;
    const previous = recorded.has(id) ? recorded.get(id) : next;
    // A failure recorded twice stays a failure; a pass needs every record of that id to pass.
    recorded.set(
      id,
      previous === false || next === false
        ? false
        : previous === null || next === null
          ? null
          : true,
    );
  };
  if (Array.isArray(checks))
    for (const entry of checks) note(entry?.id ?? entry?.check, entry?.passed);
  else if (checks && typeof checks === "object")
    for (const [id, value] of Object.entries(checks)) note(id, value);
  return recorded;
}

/**
 * R-S284-3: whether the run used the compiled synthetic mail build, bound the way the S260 verdict
 * module binds it (tests/browser/one-path-november-9-qualification-verdict.mjs): the build is a
 * compiled one, the rehearsal's compiled-mail identity holds an exact digest for every isolated
 * input, and it is the identity compiled into the build. Null when it did; otherwise the refusal
 * code: "compiled" (no compiled build), "synthetic-mail" (no exact compiled-mail identity) or
 * "synthetic-mail-build" (the rehearsal's identity is not the build's).
 */
export function compiledMailProblem({
  compiled = false,
  compiledMail = null,
  buildCompiledMail = null,
} = {}) {
  if (compiled !== true) return "compiled";
  if (
    compiledMail === null ||
    typeof compiledMail !== "object" ||
    !COMPILED_MAIL_IDENTITY.every((key) => DIGEST.test(String(compiledMail[key] ?? "")))
  )
    return "synthetic-mail";
  if (JSON.stringify(compiledMail) !== JSON.stringify(buildCompiledMail ?? null))
    return "synthetic-mail-build";
  return null;
}

/**
 * ARCH-S284-1 and AC-S284-3: the W12 matrix verdict for one run on one exact build.
 *
 * From the rehearsal's own records: servedSource is rehearsal.servedVersion; buildId and
 * buildSource are the compiled log entry's buildId and source; harnessSource, overlay and
 * harnessUncommitted are run.harness_sha, rehearsal.overlay and run.harness_uncommitted; compiled,
 * compiledMail and buildCompiledMail are rehearsal.compiled, rehearsal.compiledMail and the
 * compiled log entry's compiledMail (R-S284-3, compiledMailProblem); runId is the private run
 * directory's name; only is the --only list, or null.
 *
 * A run is admissible as qualification evidence only when it is complete: bound to one exact
 * compiled synthetic-mail build and not limited with --only. A development run (an overlay, the
 * development mail adapter, no build id) still scores its journeys' recorded checks for diagnosis
 * in the driver, but it is refused here and never admissible.
 *
 * results holds one row per journey that ran: { id, checks, error?, verdict?, source?, buildId? }
 * with checks as { "AC-S272-1": true, ... } or [{ id, passed }]. Only true is a pass and false a
 * failure. A row's error means the journey stopped; a row's own verdict of No or UNVERIFIED is
 * never raised. refusedConnections and unresolvedEffects are lists whose entries may name the
 * journey that made them ({ journey: "W12-04" }). Nothing else a row carries is read.
 */
export function scoreW12Matrix(run) {
  const {
    servedSource = null,
    buildId = null,
    buildSource = null,
    harnessSource = null,
    overlay = false,
    harnessUncommitted = false,
    compiled = false,
    compiledMail = null,
    buildCompiledMail = null,
    runId = null,
    only = null,
    results = [],
    refusedConnections = [],
    unresolvedEffects = [],
  } = run ?? {};
  const refusals = [];
  if (!SHA.test(String(servedSource))) refusals.push({ code: "served-source" });
  if (!BUILD_ID.test(String(buildId))) refusals.push({ code: "build-id" });
  if (buildSource !== servedSource) refusals.push({ code: "build-source" });
  if (harnessSource != null && harnessSource !== servedSource)
    refusals.push({ code: "harness-source" });
  if (flagged(overlay)) refusals.push({ code: "overlay" });
  if (flagged(harnessUncommitted)) refusals.push({ code: "harness-uncommitted" });
  const mailProblem = compiledMailProblem({ compiled, compiledMail, buildCompiledMail });
  if (mailProblem) refusals.push({ code: mailProblem });
  const bound = refusals.length === 0;

  if (!Array.isArray(results)) refusals.push({ code: "results-shape" });
  const rows = new Map();
  const duplicates = new Set();
  const mixed = new Set();
  let outside = 0;
  for (const entry of list(results)) {
    const id = entry?.id;
    if (!MATRIX.has(id)) {
      outside += 1;
      continue;
    }
    if (rows.has(id)) duplicates.add(id);
    else rows.set(id, entry);
    if (
      (entry.source != null && entry.source !== servedSource) ||
      (entry.buildId != null && entry.buildId !== buildId)
    )
      mixed.add(id);
  }
  if (outside) refusals.push({ code: "outside-matrix", count: outside });
  if (duplicates.size)
    refusals.push({
      code: "duplicate",
      journeys: inOrder(W12_JOURNEYS, [...duplicates]),
    });
  if (mixed.size)
    refusals.push({ code: "mixed-build", journeys: inOrder(W12_JOURNEYS, [...mixed]) });
  if (
    (refusedConnections != null && !Array.isArray(refusedConnections)) ||
    (unresolvedEffects != null && !Array.isArray(unresolvedEffects))
  )
    refusals.push({ code: "records-shape" });

  const subset =
    only == null
      ? null
      : (Array.isArray(only) ? only : String(only).split(","))
          .map((id) => String(id).trim())
          .filter(Boolean);
  const gaps = [];
  if (subset !== null)
    gaps.push({
      code: "only",
      journeys: inOrder(W12_JOURNEYS, subset),
      count: subset.filter((id) => !MATRIX.has(id)).length,
    });
  const notRun = W12_JOURNEYS.filter((id) => !rows.has(id));
  if (notRun.length) gaps.push({ code: "not-run", journeys: notRun });

  const refused = list(refusedConnections);
  const unexpected = refused.filter(
    (entry) => !KNOWN_HARNESS_REFUSAL_HOSTS.includes(entry?.host),
  );
  const effects = list(unresolvedEffects);
  const ownedBy = (entries, id) =>
    entries.filter((entry) => entry?.journey === id).length;
  const unowned = [...unexpected, ...effects].filter(
    (entry) => !MATRIX.has(entry?.journey),
  ).length;

  const isRefused = refusals.length > 0;
  const journeys = W12_MATRIX.map((spec) => {
    const entry = rows.get(spec.id);
    const scored = {
      id: spec.id,
      suite: spec.suite,
      intake: spec.intake,
      checks: [...spec.checks],
      ran: Boolean(entry),
      refused: isRefused,
      outsideOnly: subset !== null && !subset.includes(spec.id),
      passed: [],
      failed: [],
      notRecorded: [...spec.checks],
      extraChecks: 0,
      stopped: false,
      declared: null,
      refusedConnections: 0,
      unresolvedEffects: 0,
      runIssue: false,
      verdict: UNVERIFIED,
    };
    // A refused run proves nothing for this build, and a journey that did not run is unproven.
    if (isRefused || !entry) return scored;
    const recorded = recordedChecks(entry.checks);
    scored.passed = spec.checks.filter((check) => recorded.get(check) === true);
    scored.failed = spec.checks.filter((check) => recorded.get(check) === false);
    scored.notRecorded = spec.checks.filter(
      (check) => typeof recorded.get(check) !== "boolean",
    );
    scored.extraChecks = [...recorded.keys()].filter(
      (check) => !spec.checks.includes(check),
    ).length;
    scored.stopped = flagged(entry.error);
    scored.declared =
      entry.verdict === NO || entry.verdict === UNVERIFIED ? entry.verdict : null;
    scored.refusedConnections = ownedBy(unexpected, spec.id);
    scored.unresolvedEffects = ownedBy(effects, spec.id);
    scored.runIssue = unowned > 0;
    const failing =
      scored.failed.length > 0 ||
      scored.extraChecks > 0 ||
      scored.stopped ||
      scored.declared === NO ||
      scored.refusedConnections > 0 ||
      scored.unresolvedEffects > 0;
    const unproven =
      scored.notRecorded.length > 0 || scored.declared === UNVERIFIED || scored.runIssue;
    scored.verdict = failing ? NO : unproven ? UNVERIFIED : YES;
    return scored;
  });

  const status = isRefused ? "refused" : gaps.length ? "incomplete" : "complete";
  const tally = (verdict) =>
    journeys.filter((journey) => journey.verdict === verdict).length;
  const verdict =
    isRefused || tally(NO) > 0 || unexpected.length > 0 || effects.length > 0
      ? NO
      : status === "incomplete" || tally(UNVERIFIED) > 0
        ? UNVERIFIED
        : YES;
  return {
    version: MATRIX_VERSION,
    status,
    verdict,
    bound,
    // Qualification evidence only from a complete run on one exact compiled synthetic-mail build.
    admissible: status === "complete",
    refusals,
    gaps,
    identities: {
      servedSource: exact(SHA, servedSource),
      buildId: exact(BUILD_ID, buildId),
      buildSource: exact(SHA, buildSource),
      compiledMail: mailProblem === null ? exact(DIGEST, compiledMail.adapter) : null,
      runId: exact(RUN_ID, runId),
    },
    only: subset === null ? null : inOrder(W12_JOURNEYS, subset),
    counts: {
      journeys: W12_MATRIX.length,
      ran: rows.size,
      yes: tally(YES),
      no: tally(NO),
      unverified: tally(UNVERIFIED),
      checks: TOTAL_CHECKS,
      checksPassed: journeys.reduce((sum, journey) => sum + journey.passed.length, 0),
      unexpectedRefusals: unexpected.length,
      knownRefusals: refused.length - unexpected.length,
      unresolvedEffects: effects.length,
    },
    journeys,
  };
}

const NOT_RECORDED = "not recorded";

/**
 * R-S284-1 and AC-S284-1: the fail-first record on the serving baseline, as
 * { source, rows: [{ id: "W12-01", reproduced: true | false }] }. A sequence that did not fail
 * there is flagged, not dropped. The baseline must be another source than the build.
 */
export function scoreFailFirstBaseline(baseline, { servedSource = null } = {}) {
  const none = Object.fromEntries(W12_JOURNEYS.map((id) => [id, NOT_RECORDED]));
  if (baseline == null)
    return { status: NOT_RUN, source: null, journeys: none, reproduced: 0, flagged: 0 };
  const source = exact(SHA, baseline.source);
  if (!source || source === servedSource)
    return {
      status: "refused",
      source,
      reason: source ? "same-source" : "baseline-source",
      journeys: none,
      reproduced: 0,
      flagged: 0,
    };
  const journeys = {};
  for (const id of W12_JOURNEYS) {
    const rows = list(baseline.rows).filter((row) => row?.id === id);
    journeys[id] = rows.some((row) => row.reproduced === false)
      ? "did not reproduce"
      : rows.length > 0 && rows.every((row) => row.reproduced === true)
        ? "reproduced"
        : NOT_RECORDED;
  }
  const states = Object.values(journeys);
  return {
    status: "recorded",
    source,
    journeys,
    reproduced: states.filter((state) => state === "reproduced").length,
    flagged: states.filter((state) => state === "did not reproduce").length,
  };
}

/**
 * ARCH-S284-2 and AC-S284-2: the static staff-path check's result
 * ({ source, files, violations, unparsed } from scripts/check-staff-path-calls.mjs --json, with
 * the source of the tree it scanned), bound to the served source.
 */
export function scoreStaffPathGate(result, { servedSource = null } = {}) {
  const byAction = (violations) =>
    Object.fromEntries(
      STAFF_PATH_COUNTED.map((action) => [
        action,
        violations.filter((violation) => violation.action === action).length,
      ]),
    );
  if (result == null)
    return {
      status: NOT_RUN,
      source: null,
      files: 0,
      violations: [],
      unparsed: 0,
      byAction: byAction([]),
      n1002: "not shown",
    };
  const source = exact(SHA, result.source);
  const files = list(result.files).filter((file) => exact(FILE, file) !== null);
  const violations = list(result.violations).map((violation) => ({
    file: exact(FILE, violation?.file),
    line: count(violation?.line),
    action: STAFF_PATH_COUNTED.includes(violation?.action)
      ? violation.action
      : "unresolved",
  }));
  // A file the check could not parse cannot be shown clean.
  const unparsed = list(result.unparsed).length;
  const bound = source !== null && source === servedSource;
  const covers = N1002_STAFF_PATH_FILES.every((file) => files.includes(file));
  const n1002Calls = violations.filter((violation) =>
    N1002_STAFF_PATH_FILES.includes(violation.file),
  ).length;
  const status = !bound
    ? "refused"
    : violations.length > 0 || unparsed > 0
      ? "fail"
      : covers
        ? "pass"
        : "incomplete";
  return {
    status,
    source,
    files: files.length,
    violations,
    unparsed,
    byAction: byAction(violations),
    n1002:
      !bound || !covers || unparsed > 0
        ? "not shown"
        : n1002Calls
          ? "direct calls"
          : "staff path",
  };
}

function bindingProblem(replay, { servedSource, buildId, bound }) {
  if (!bound) return "unbound-matrix";
  if (replay.buildId !== buildId) return "build";
  if (replay.source !== servedSource) return "source";
  return null;
}

function rowReplay(replay, expected, binding, adjust = (rows) => rows) {
  if (replay == null)
    return {
      status: NOT_RUN,
      verdict: UNVERIFIED,
      buildId: null,
      rows: expected.map((id) => ({ id, ran: false, verdict: UNVERIFIED })),
      reasons: ["not-run"],
    };
  const problem = bindingProblem(replay, binding);
  const seen = new Map();
  let duplicate = false;
  let mixed = false;
  for (const row of list(replay.journeys)) {
    if (!expected.includes(row?.id)) continue;
    if (seen.has(row.id)) duplicate = true;
    else seen.set(row.id, row);
    if (
      (row.buildId != null && row.buildId !== replay.buildId) ||
      (row.source != null && row.source !== replay.source)
    )
      mixed = true;
  }
  const refusal = problem ?? (mixed ? "build" : duplicate ? "duplicate" : null);
  if (refusal)
    return {
      status: "refused",
      verdict: NO,
      buildId: exact(BUILD_ID, replay.buildId),
      rows: [],
      reasons: [refusal],
    };
  const rows = adjust(
    expected.map((id) => {
      const row = seen.get(id);
      return row
        ? {
            id,
            ran: true,
            verdict: VERDICTS.includes(row.verdict) ? row.verdict : UNVERIFIED,
          }
        : { id, ran: false, verdict: UNVERIFIED };
    }),
  );
  const missing = rows.filter((row) => !row.ran).map((row) => row.id);
  const fromRows = rows.some((row) => row.verdict === NO)
    ? NO
    : rows.some((row) => row.verdict === UNVERIFIED)
      ? UNVERIFIED
      : YES;
  // The replay's own verdict module (its matrix verdict, when the replay carries one) is never
  // raised: rows that read Yes cannot lift a replay its module read No or UNVERIFIED.
  const declared =
    replay.verdict === NO || replay.verdict === UNVERIFIED ? replay.verdict : null;
  const verdict =
    declared === NO
      ? NO
      : declared === UNVERIFIED && fromRows === YES
        ? UNVERIFIED
        : fromRows;
  return {
    status: "scored",
    verdict,
    buildId: exact(BUILD_ID, replay.buildId),
    rows,
    reasons: [
      ...(missing.length ? ["missing"] : []),
      ...(declared === NO
        ? ["module-no"]
        : declared === UNVERIFIED
          ? ["module-unverified"]
          : []),
    ],
  };
}

function budgetReplay(replay, binding, pins) {
  if (replay == null)
    return {
      status: NOT_RUN,
      verdict: UNVERIFIED,
      buildId: null,
      checks: { passed: 0, total: 0 },
      budgets: { within: 0, total: 0 },
      scoped: [],
      unscoped: [],
      hidden: 0,
      reasons: ["not-run"],
    };
  const problem = bindingProblem(replay, binding);
  const entries = (values) =>
    list(values).map((entry) => ({ id: entry?.id, passed: entry?.passed === true }));
  const checks = entries(replay.checks);
  const budgets = entries(replay.budgets);
  const base = {
    buildId: exact(BUILD_ID, replay.buildId),
    checks: {
      passed: checks.filter((entry) => entry.passed).length,
      total: checks.length,
    },
    budgets: {
      within: budgets.filter((entry) => entry.passed).length,
      total: budgets.length,
    },
  };
  if (problem)
    return {
      status: "refused",
      verdict: NO,
      ...base,
      scoped: [],
      unscoped: [],
      hidden: 0,
      reasons: [problem],
    };
  // A result outside its bound passes only as a changed pin named with the suite that changed it.
  const suiteOf = new Map(pins.map(({ pin, suite }) => [pin, suite]));
  const failing = [...checks, ...budgets].filter((entry) => !entry.passed);
  const scoped = failing
    .filter((entry) => suiteOf.has(entry.id))
    .map((entry) => ({ id: entry.id, suite: suiteOf.get(entry.id) }));
  const unscopedIds = failing.filter((entry) => !suiteOf.has(entry.id));
  const unscoped = unscopedIds.map((entry) => exact(PIN, entry.id)).filter(Boolean);
  const empty = checks.length + budgets.length === 0;
  return {
    status: "scored",
    verdict: empty ? UNVERIFIED : unscopedIds.length ? NO : YES,
    ...base,
    scoped,
    unscoped,
    hidden: unscopedIds.length - unscoped.length,
    reasons: empty ? ["empty"] : unscopedIds.length ? ["unscoped"] : [],
  };
}

/**
 * R-S284-4 and AC-S284-4: the S260 and S271 replays and the scoped S252 budgets, each bound to the
 * W12 matrix's build id and served source, and the changed pins, each with the suite that changed
 * it ({ pin, suite }). s260 and s271 are { source, buildId, verdict?, journeys: [{ id, verdict }] }
 * (the verdict modules' own outputs fit: novemberNineMatrixVerdict and novemberTenMatrixVerdict);
 * their own matrix verdict, when present, caps the replay (a module No is No, a module UNVERIFIED
 * is at most UNVERIFIED). s252 is { source, buildId, checks, budgets } with [{ id, passed }]
 * entries. N10-02 reads Yes only on the staff path (staffPath, the scored gate).
 */
export function scorePreservationReplays(input) {
  const {
    servedSource = null,
    buildId = null,
    bound = false,
    s260 = null,
    s271 = null,
    s252 = null,
    changedPins = [],
    staffPath = null,
  } = input ?? {};
  const pins = list(changedPins)
    .filter((entry) => exact(PIN, entry?.pin) && exact(SUITE, entry?.suite))
    .map(({ pin, suite }) => ({ pin, suite }));
  const binding = { servedSource, buildId, bound: bound === true && buildId !== null };
  const n1002 = staffPath?.n1002 ?? "not shown";
  const staffPathRows = (rows) =>
    rows.map((row) => {
      if (row.id !== "N10-02") return row;
      const onPath = { ...row, staffPath: n1002 };
      if (row.verdict !== YES || n1002 === "staff path") return onPath;
      return { ...onPath, verdict: n1002 === "direct calls" ? NO : UNVERIFIED };
    });
  return {
    s260: rowReplay(s260, S260_REPLAY_ROWS, binding),
    s271: rowReplay(s271, S271_REPLAY_ROWS, binding, staffPathRows),
    s252: budgetReplay(s252, binding, pins),
    changedPins: pins,
    unrecordedPins: list(changedPins).length - pins.length,
  };
}

/**
 * R-S284-5: each production read reads NOT RUN unless an authorizing reference is supplied; then
 * it reads run, with that reference and its counts.
 */
export function productionReadFields(reads = {}) {
  return Object.fromEntries(
    PRODUCTION_READS.map(({ key, finding }) => {
      const read = reads?.[key];
      const reference = exact(REFERENCE, read?.reference);
      if (!reference)
        return [key, { finding, status: NOT_RUN, reference: null, counts: null }];
      const counts =
        key === "ownerSequenceReplies"
          ? { withReply: count(read.withReply), withoutReply: count(read.withoutReply) }
          : { responses: count(read.count) };
      return [key, { finding, status: "run", reference, counts }];
    }),
  );
}

/**
 * R-S284-5: the human verdict reads exactly "Human verdict: NOT RUN — no human observer" unless a
 * staff session's authorizing reference is supplied with an observed verdict on the same build.
 */
export function humanVerdictField(record, { buildId = null } = {}) {
  const reference = exact(REFERENCE, record?.reference);
  if (!reference)
    return { status: NOT_RUN, reference: null, verdict: null, problems: [] };
  const problems = [];
  if (![YES, NO, "Partial"].includes(record.verdict)) problems.push("verdict");
  if (buildId === null || record.buildId !== buildId) problems.push("build");
  if (problems.length) return { status: NOT_RUN, reference, verdict: null, problems };
  return { status: "run", reference, verdict: record.verdict, buildId, problems };
}

/**
 * The whole S284 output: { run, baseline, staffPath, replays: { s260, s271, s252 }, changedPins,
 * production, human } in, identities, counts and verdicts out.
 */
export function scoreQualification(input) {
  const {
    run = null,
    baseline = null,
    staffPath = null,
    replays = {},
    changedPins = [],
    production = {},
    human = null,
  } = input ?? {};
  const matrix = scoreW12Matrix(run);
  const { servedSource, buildId } = matrix.identities;
  const failFirst = scoreFailFirstBaseline(baseline, { servedSource });
  const gate = scoreStaffPathGate(staffPath, { servedSource });
  const preservation = scorePreservationReplays({
    servedSource,
    buildId,
    bound: matrix.bound,
    s260: replays?.s260 ?? null,
    s271: replays?.s271 ?? null,
    s252: replays?.s252 ?? null,
    changedPins,
    staffPath: gate,
  });
  return {
    version: MATRIX_VERSION,
    qualified:
      matrix.admissible &&
      matrix.verdict === YES &&
      failFirst.status === "recorded" &&
      failFirst.reproduced + failFirst.flagged === W12_MATRIX.length &&
      gate.status === "pass" &&
      preservation.s260.verdict === YES &&
      preservation.s271.verdict === YES &&
      preservation.s252.verdict === YES,
    matrix: {
      ...matrix,
      journeys: matrix.journeys.map((journey) => ({
        ...journey,
        failFirst: failFirst.journeys[journey.id],
      })),
    },
    baseline: {
      status: failFirst.status,
      source: failFirst.source,
      ...(failFirst.reason ? { reason: failFirst.reason } : {}),
      reproduced: failFirst.reproduced,
      flagged: failFirst.flagged,
    },
    staffPath: gate,
    preservation,
    production: productionReadFields(production),
    human: humanVerdictField(human, { buildId: matrix.bound ? buildId : null }),
  };
}

// ---- The report (ARCH-S284-3). Every value is checked again here, so even a hand-built output
// renders nothing but identities in their exact form, matrix ids, counts and fixed wording. ----

const RUN_STATUSES = ["complete", "incomplete", "refused"];
const RUN_REASONS = {
  "served-source": () => "the served source is not an exact commit",
  "build-id": () => "no compiled build id is recorded",
  "build-source": () =>
    "the build was made from a different source than the served source",
  "harness-source": () =>
    "the rehearsal harness is a different commit than the served source",
  overlay: () => "the served tree is an uncommitted overlay",
  "harness-uncommitted": () => "the rehearsal harness has uncommitted changes",
  compiled: () => "the served application is not a compiled build",
  "synthetic-mail": () => "the run did not use the compiled synthetic mail",
  "synthetic-mail-build": () =>
    "the compiled synthetic mail is not the one compiled into the build",
  "results-shape": () => "the journey results are not a list",
  "records-shape": () => "the refused connections or unresolved effects are not a list",
  "outside-matrix": ({ total }) => `${total} result row(s) name no W12 journey`,
  duplicate: ({ journeys }) => `recorded more than once: ${journeys}`,
  "mixed-build": ({ journeys }) => `bound to another source or build: ${journeys}`,
  only: ({ journeys, total }) =>
    `the run was limited with --only to ${journeys || "no W12 journey"}` +
    (total ? ` and ${total} id(s) outside the matrix` : ""),
  "not-run": ({ journeys }) => `${journeys} did not run`,
};
const REPLAY_REASONS = {
  "not-run": "not run",
  "unbound-matrix": "refused: the W12 matrix is not bound to an exact build",
  build: "refused: bound to another build than the W12 matrix",
  source: "refused: bound to another source than the W12 matrix",
  duplicate: "refused: a row is recorded more than once",
  missing: "some rows did not run",
  "module-no": "its own verdict module read No",
  "module-unverified": "its own verdict module read UNVERIFIED",
  empty: "no results recorded",
  unscoped: "a result outside its bound has no changed pin",
};
const STAFF_PATH_STATUSES = ["pass", "fail", "incomplete", "refused", NOT_RUN];
const N1002_STATES = ["staff path", "direct calls", "not shown"];
const FAIL_FIRST_STATES = ["reproduced", "did not reproduce", NOT_RECORDED];

const oneOf = (allowed, value, fallback) => (allowed.includes(value) ? value : fallback);
const code = (value) => (value === null ? NOT_RECORDED : `\`${value}\``);
const number = (value) => count(value) ?? NOT_RECORDED;

/** A table padded the way prettier pads one, so the generated report needs no reformatting. */
function markdownTable(header, rows) {
  const widths = header.map((cell, index) =>
    Math.max(3, cell.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells) =>
    `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
  return [
    line(header),
    `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
    ...rows.map(line),
  ];
}

function reasonText(reason) {
  const word = RUN_REASONS[reason?.code];
  if (!word) return null;
  return word({
    journeys: inOrder(W12_JOURNEYS, reason.journeys).join(", "),
    total: count(reason.count) ?? 0,
  });
}

function journeyResult(journey, spec) {
  const verdict = oneOf(VERDICTS, journey?.verdict, UNVERIFIED);
  const notes = [];
  if (!journey) notes.push("not in the scored output");
  else if (journey.refused === true) notes.push("the run is refused");
  else if (journey.ran !== true)
    notes.push(
      journey.outsideOnly === true ? "outside the --only subset" : "did not run",
    );
  else {
    const failed = inOrder(spec.checks, journey.failed);
    if (failed.length) notes.push(`${failed.join(", ")} failed`);
    if (journey.stopped === true) notes.push("stopped before its checks finished");
    if (journey.declared === NO || journey.declared === UNVERIFIED)
      notes.push(`the driver recorded ${journey.declared}`);
    if (count(journey.extraChecks))
      notes.push(`${journey.extraChecks} check id(s) outside its acceptance checks`);
    if (count(journey.refusedConnections))
      notes.push(
        `${journey.refusedConnections} refused connection(s) outside the harness's known ones`,
      );
    if (count(journey.unresolvedEffects))
      notes.push(`${journey.unresolvedEffects} unresolved effect(s)`);
    const notRecorded = inOrder(spec.checks, journey.notRecorded);
    if (notRecorded.length) notes.push(`${notRecorded.join(", ")} not recorded`);
    if (journey.runIssue === true)
      notes.push("the run has refused connections or unresolved effects no journey owns");
  }
  return notes.length ? `${verdict}: ${notes.join("; ")}` : verdict;
}

function engineeringSection(matrix) {
  const status = oneOf(RUN_STATUSES, matrix.status, "refused");
  const counts = matrix.counts ?? {};
  const journeys = list(matrix.journeys);
  const lines = [
    "## Engineering verdict",
    "",
    `Engineering verdict: **${oneOf(VERDICTS, matrix.verdict, UNVERIFIED)}** on the W12 matrix.`,
    "",
  ];
  const reasons = (entries) => list(entries).map(reasonText).filter(Boolean).join("; ");
  if (status === "refused")
    lines.push(
      `The run is refused: ${reasons(matrix.refusals) || "its binding is not exact"}. Nothing it recorded counts for this build.`,
      "",
    );
  else if (status === "incomplete")
    lines.push(`The run is incomplete: ${reasons(matrix.gaps)}.`, "");
  lines.push(
    `Journeys: ${number(counts.yes)} Yes, ${number(counts.no)} No and ${number(counts.unverified)} UNVERIFIED of ${W12_MATRIX.length}. ` +
      `Acceptance checks passed: ${number(counts.checksPassed)} of ${TOTAL_CHECKS}. ` +
      `Refused connections outside the harness's known ones: ${number(counts.unexpectedRefusals)} ` +
      `(known harness refusals: ${number(counts.knownRefusals)}). ` +
      `Unresolved effects: ${number(counts.unresolvedEffects)}.`,
    "",
  );
  const rows = W12_MATRIX.map((spec) => {
    const journey = journeys.find((entry) => entry?.id === spec.id);
    return [
      spec.id,
      spec.title,
      `${spec.suite}, intake ${spec.intake}`,
      `${spec.checks[0]} to ${spec.checks.at(-1)}`,
      `${inOrder(spec.checks, journey?.passed).length} of ${spec.checks.length}`,
      oneOf(FAIL_FIRST_STATES, journey?.failFirst, NOT_RECORDED),
      journeyResult(journey, spec),
    ];
  });
  const header = [
    "Journey",
    "Staff scenario",
    "Suite",
    "Acceptance checks",
    "Passed",
    "Fail-first on the baseline",
    "Verdict",
  ];
  return [...lines, ...markdownTable(header, rows)];
}

function baselineSection(baseline) {
  const status = oneOf(["recorded", "refused", NOT_RUN], baseline?.status, NOT_RUN);
  const lines = ["## Fail-first baseline", ""];
  if (status === NOT_RUN)
    lines.push(
      "Fail-first baseline: NOT RUN. No baseline record is attached to this output.",
    );
  else if (status === "refused")
    lines.push(
      baseline.reason === "same-source"
        ? "Fail-first baseline: refused. It was recorded on the build itself, not the serving baseline."
        : "Fail-first baseline: refused. Its source is not an exact commit.",
    );
  else
    lines.push(
      `Fail-first baseline on ${code(exact(SHA, baseline.source))}: ${number(baseline.reproduced)} of ${W12_MATRIX.length} sequences failed as the audit recorded them; ` +
        `${number(baseline.flagged)} did not reproduce (flagged).`,
    );
  return [...lines, ""];
}

function staffPathSection(gate) {
  const status = oneOf(STAFF_PATH_STATUSES, gate?.status, NOT_RUN);
  const lines = ["## Staff path", ""];
  if (status === NOT_RUN) return [...lines, "Static staff-path check: **NOT RUN**.", ""];
  const source = code(exact(SHA, gate.source));
  if (status === "refused")
    return [
      ...lines,
      `Static staff-path check: **refused**. Its scan of ${source} is not bound to the served source.`,
      "",
    ];
  const byAction = gate.byAction ?? {};
  const violations = list(gate.violations);
  const actions = STAFF_PATH_COUNTED.filter((action) => count(byAction[action]))
    .map((action) => `${action} ${byAction[action]}`)
    .join(", ");
  const unparsed = count(gate.unparsed) ?? 0;
  const finding = violations.length
    ? `${violations.length} direct call(s) of the sequences route (${actions}).`
    : unparsed
      ? `but ${unparsed} file(s) could not be parsed, so they cannot be shown clean.`
      : status === "incomplete"
        ? "but the seed or the November 10 core journeys were not among them."
        : "no direct refresh, resume, send or schedule call of the sequences route.";
  lines.push(
    `Static staff-path check: **${status}** on ${source}: ${number(gate.files)} file(s) scanned, ${finding}`,
  );
  if (violations.length && unparsed)
    lines.push(
      "",
      `${unparsed} file(s) could not be parsed, so they cannot be shown clean.`,
    );
  if (violations.length) lines.push("");
  for (const violation of violations.slice(0, 20))
    lines.push(
      `- ${code(exact(FILE, violation?.file))} line ${number(violation?.line)}: ${oneOf(STAFF_PATH_COUNTED, violation?.action, "unresolved")}`,
    );
  if (violations.length > 20) lines.push(`- and ${violations.length - 20} more`);
  return [...lines, ""];
}

function rowsResult(replay, expected) {
  const status = oneOf(["scored", "refused", NOT_RUN], replay?.status, NOT_RUN);
  const reasons = list(replay?.reasons)
    .map((reason) => REPLAY_REASONS[reason])
    .filter(Boolean);
  if (status !== "scored") return reasons.join("; ") || "not run";
  const rows = list(replay.rows).filter((row) => expected.includes(row?.id));
  const yes = rows.filter((row) => row.verdict === YES).length;
  const notes = [`${yes} of ${expected.length} rows Yes`];
  const others = expected
    .map((id) => rows.find((row) => row.id === id))
    .filter((row) => row && row.verdict !== YES)
    .map((row) => `${row.id} ${oneOf(VERDICTS, row.verdict, UNVERIFIED)}`);
  if (others.length) notes.push(others.join(", "));
  const n1002 = rows.find((row) => row.id === "N10-02");
  if (n1002?.staffPath !== undefined)
    notes.push(
      `N10-02 ${
        {
          "staff path": "on the staff path",
          "direct calls": "not on the staff path",
          "not shown": "not shown on the staff path",
        }[oneOf(N1002_STATES, n1002.staffPath, "not shown")]
      }`,
    );
  return [...notes, ...reasons].join("; ");
}

function budgetResult(replay) {
  const status = oneOf(["scored", "refused", NOT_RUN], replay?.status, NOT_RUN);
  const reasons = list(replay?.reasons)
    .map((reason) => REPLAY_REASONS[reason])
    .filter(Boolean);
  if (status === NOT_RUN) return reasons.join("; ") || "not run";
  if (status === "refused") return reasons.join("; ");
  const notes = [
    `${number(replay.checks?.passed)} of ${number(replay.checks?.total)} checks passed`,
    `${number(replay.budgets?.within)} of ${number(replay.budgets?.total)} budgets within bounds`,
    `${list(replay.scoped).length} scoped by changed pins`,
  ];
  const unscoped = list(replay.unscoped)
    .map((id) => exact(PIN, id))
    .filter(Boolean);
  if (unscoped.length) notes.push(`outside bounds: ${unscoped.map(code).join(", ")}`);
  if (count(replay.hidden)) notes.push(`${replay.hidden} more outside bounds`);
  return [...notes, ...reasons].join("; ");
}

function preservationSection(preservation) {
  const replays = [
    ["S260 ten journeys and three Help roles", preservation?.s260, S260_REPLAY_ROWS],
    [
      "S271 N10-01 to N10-05 and N10-07 to N10-10, N10-02 on the staff path",
      preservation?.s271,
      S271_REPLAY_ROWS,
    ],
    ["Scoped S252 budgets", preservation?.s252, null],
  ];
  const lines = [
    "## Preservation replays",
    "",
    ...markdownTable(
      ["Replay", "Build", "Result", "Verdict"],
      replays.map(([label, replay, expected]) => [
        label,
        code(exact(BUILD_ID, replay?.buildId)),
        expected ? rowsResult(replay, expected) : budgetResult(replay),
        oneOf(VERDICTS, replay?.verdict, UNVERIFIED),
      ]),
    ),
  ];
  const pins = list(preservation?.changedPins).filter(
    (entry) => exact(PIN, entry?.pin) && exact(SUITE, entry?.suite),
  );
  lines.push("", "### Changed pins", "");
  if (pins.length)
    lines.push(
      ...markdownTable(
        ["Pin", "Changed by"],
        pins.map(({ pin, suite }) => [code(pin), suite]),
      ),
    );
  else lines.push("No changed pin is recorded.");
  if (count(preservation?.unrecordedPins))
    lines.push(
      "",
      `${preservation.unrecordedPins} changed pin(s) are not listed because they do not name a pin id and a suite.`,
    );
  return [...lines, ""];
}

function productionSection(production) {
  const lines = ["## Production reads", ""];
  for (const { key, finding, label } of PRODUCTION_READS) {
    const read = production?.[key];
    const reference = exact(REFERENCE, read?.reference);
    let value = NOT_RUN;
    if (read?.status === "run" && reference) {
      const counts = read.counts ?? {};
      value =
        `run under ${code(reference)}: ` +
        (key === "ownerSequenceReplies"
          ? `${number(counts.withReply)} with a recorded inbound reply, ${number(counts.withoutReply)} without`
          : `${number(counts.responses)} responses`);
    }
    lines.push(`- ${label} (finding ${finding}): ${value}`);
  }
  return [
    ...lines,
    "",
    "Each read is read-only and counts only. It sizes a finding and is never a gate.",
    "",
  ];
}

function humanLine(human) {
  const reference = exact(REFERENCE, human?.reference);
  if (!reference) return HUMAN_NOT_RUN;
  if (human.status === "run" && [YES, NO, "Partial"].includes(human.verdict)) {
    const build = exact(BUILD_ID, human.buildId);
    if (build)
      return `Human verdict: ${human.verdict} — run under ${code(reference)} on build ${code(build)}`;
  }
  const problems = list(human.problems)
    .map((problem) =>
      problem === "build"
        ? "it is not bound to this build"
        : problem === "verdict"
          ? "it records no observed verdict"
          : null,
    )
    .filter(Boolean);
  return `Human verdict: NOT RUN — the record under ${code(reference)} is not counted${
    problems.length ? `: ${problems.join(" and ")}` : ""
  }`;
}

/**
 * ARCH-S284-3 and AC-S284-5: the qualification report in markdown, from scoreQualification's
 * output only. It holds identities, counts and verdicts with acceptance check ids.
 */
export function renderQualificationReport(scored) {
  const matrix = scored?.matrix ?? {};
  const identities = matrix.identities ?? {};
  const lines = [
    "# Staff workflow audit qualification",
    "",
    `Matrix \`${MATRIX_VERSION}\` (S284). This report is generated from the S284 verdict module's output: identities, counts and verdicts only. The evidence stays in the private run directory.`,
    "",
    "## Identities",
    "",
    `- Served source: ${code(exact(SHA, identities.servedSource))}`,
    `- Compiled build: ${code(exact(BUILD_ID, identities.buildId))}, made from ${code(exact(SHA, identities.buildSource))}`,
    `- Compiled synthetic mail adapter: ${code(exact(DIGEST, identities.compiledMail))}`,
    `- Private run: ${code(exact(RUN_ID, identities.runId))}`,
    `- Run: ${oneOf(RUN_STATUSES, matrix.status, "refused")}`,
    "",
    ...engineeringSection(matrix),
    "",
    ...baselineSection(scored?.baseline),
    ...staffPathSection(scored?.staffPath),
    ...preservationSection(scored?.preservation),
    ...productionSection(scored?.production),
    "## Human verdict",
    "",
    humanLine(scored?.human),
    "",
    "Engineering, production and human verdicts are separate. None is inferred from another.",
  ];
  return lines.join("\n") + "\n";
}
