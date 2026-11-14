// S284 ARCH-S284-1, R-S284-3 and R-S284-4: the November 12 qualification driver. One compiled
// synthetic-mail rehearsal builds once; this driver runs on it the W12 matrix (W12-01 to W12-14)
// and the preservation replays (the ten S260 journeys, S271's N10-01 to N10-05 and N10-07 to
// N10-10 with N10-02 on the staff path, and the scoped S252 budgets), binds every result to the
// served source and that one build id, and scores them with the S284 verdict module
// (one-path-november-12-qualification-verdict.mjs). Evidence and the generated report stay in the
// private run directory.
//
//   qualification (the only run that can be admissible), from a clean committed head:
//     bash scripts/run-renewal-one-path-rehearsal.sh --compiled --compiled-synthetic-mail \
//       --driver tests/browser/one-path-november-12-qualification-driver.mjs -- \
//       --baseline ~/.local/state/pmi-kc-one-path-rehearsal/<baseline run>/november-12-baseline.json \
//       --s271-baseline ~/.local/state/pmi-kc-one-path-rehearsal/<run>/november-10-baseline.json \
//       --rendered-help <canonical Help run dir> --rendered-help-drift <drift Help run dir>
//   development check of single journeys (never admissible; the development mail adapter and the
//   in-process worker tick; no replays unless --replays names them):
//     bash scripts/run-renewal-one-path-rehearsal.sh --overlay \
//       --driver tests/browser/one-path-november-12-qualification-driver.mjs -- --only W12-03
//
// Launch without --hold-automatic-comparison: the replays run as they were recorded, and each W12
// row holds the automatic comparison itself through its own reset, as the baseline did.
//
// Options after --:
//   --only W12-03,W12-05     run these W12 rows only. The run is then always scored incomplete,
//                            and no replay runs unless --replays names it.
//   --replays s260,s271,s252 the replays to run (default: all three on a compiled synthetic-mail
//                            run without --only; none otherwise). "none" runs none.
//                            An omitted preservation replay leaves the batch unqualified.
//   --baseline <file>        the R-S284-1 record, november-12-baseline.json of a private run.
//   --s271-baseline <file>   passed to the S271 driver as its --baseline (november-10-baseline.json).
//   --rendered-help <dir>, --rendered-help-drift <dir>   passed to the S260 driver unchanged.
//   --s252-phases <list|all> passed to the S252 journey driver as --phases (default: journey, the
//                            journey with its budgets).
//   --no-restart             do not start the server again between units (compiled runs restart
//                            by default; --restart asks for it on a development run).
//   --w1203-attempts, --w1203-wait, --w1212-filter   the starting sequences' options, as in the
//                            baseline driver.
//
// HOW ONE BUILD CARRIES EVERY RESULT (R-S284-4). The rehearsal builds once ("compiled" event in
// rehearsal-log.jsonl) and serves that output for the whole run. Each unit of work, every replay
// and every W12 row, runs in turn on that origin:
//   1. Fresh start. The first unit runs on the rehearsal's own seeded state. Every later unit first
//      asks the rehearsal to start the server again from the same build (files.serverRestartRequest,
//      answered by scripts/one-path-rehearsal.mjs; nothing is built again), so no unit inherits an
//      earlier one's server memory (its comparison cache, its last RentVine read), and then resets
//      the emulator and the stand-ins and seeds again with the run's own starting steps
//      (startingSeedSteps: a compiled synthetic-mail run leaves the replied owner message out, as
//      the harness does). W12 rows hold the automatic comparison; replays keep the run's setting.
//   2. A replay is its own unchanged driver (S260, S271, S252), started as a child process against
//      the same origin, run directory and environment, under the same network boundary. It writes
//      its own results and its own verdict module's output (s260-verdict.json, s271-verdict.json,
//      journey.json), which this driver reads back. Nothing of theirs is edited or rescored here:
//      the S284 module reads their rows and caps each replay at its own module's verdict.
//   3. Binding. Before and after each unit the driver reads the served commit (/api/version), the
//      build id on disk (temp/e2e/.next/BUILD_ID) and whether the server it last started is still
//      the one serving. A unit keeps the run's build id only when all three hold on both sides and
//      the run has exactly one "compiled" event; otherwise it is recorded as another build and the
//      verdict module refuses it.
//
// W12 CHECK CONTRACT. Each row W12-NN has its own file, tests/browser/one-path-november-12-w12-NN.mjs,
// exporting one function:
//
//   export async function checkW12NN(ctx, page, start) -> Promise<{ [acceptanceCheckId]: boolean }>
//
// The driver calls it once per run, right after the row's starting sequence (W12_JOURNEYS[id] in
// one-path-november-12-journeys.mjs) ran on `page`, on the same build:
//   page   the signed-in Editor page (a fresh guarded context, 1280 by 800, light, America/Chicago)
//          the starting sequence used, still open where it left off.
//   start  { observed, steps, error }: the starting sequence's own observation and step log, or,
//          when it stopped (a candidate may change what it expected), error is its message and
//          observed is null. The function decides what that means for its checks.
//   ctx    journeyId ("W12-NN"); kit (createStaffKit: openLease, primaryName, appResponse,
//          sequences, sentTo, tick, notifications, deskRow, reveal, read, readDocument, ...);
//          rehearsal; origin; leases (role -> { leaseId, rent, endDate }, byId(leaseId)); options;
//          mode ("compiled" | "development"); binding ({ source, buildId }); writes (every non-GET
//          request this row's pages made, { role, path, kind?, field? }, read only);
//          newPage(role) (another signed-in page, "Editor" | "Approver" | "Admin", closed by the
//          driver); resetState() (the harness reset to the starting state, automatic comparison
//          held, every open page signed in again); record(entry) (a note in the private run
//          directory, never scored, never in the report); unresolved(kind) (declare an effect this
//          row made whose outcome is unknown, for example a send neither confirmed nor refused:
//          the row reads No).
// It returns an object keyed by this row's acceptance check ids only (W12_MATRIX, for example
// W12-03 -> AC-S274-1 to AC-S274-6), each true (passed) or false (failed). An id left out reads
// not recorded and the row UNVERIFIED, never Yes; any other key reads as a mislabeled check and
// the row No; a throw stops the row and reads No. Rows share no state: each starts from the
// seeded starting state on a freshly started server (compiled runs), so a row that needs
// published wording or another precondition makes it itself through the controls staff use.
// Every row acts only through visible controls, the stand-in hooks of
// scripts/lib/one-path-rehearsal/control.mjs and kit.tick (R-S284-2): the static check
// (scripts/check-staff-path-calls.mjs) scans every tests/browser/one-path-november-12-*.mjs for a
// direct refresh, resume, send or schedule call of the sequences route. Raw observations go to
// ctx.record; the report holds identities, counts and verdicts only (AC-S284-5).
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  createWriteStream,
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { Socket } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright-core";
import { resolveBrowserExecutable } from "../../scripts/lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "../../scripts/lib/help-rehearsal-origin.mjs";
import {
  S260_DRIVER,
  S271_DRIVER,
  S284_DRIVER,
} from "../../scripts/lib/one-path-rehearsal/compiled-mail.mjs";
import {
  REHEARSAL_STATE_DIR,
  readRehearsal,
} from "../../scripts/lib/one-path-rehearsal/control.mjs";
import {
  resetRehearsalState,
  startingSeedSteps,
} from "../../scripts/lib/one-path-rehearsal/reset.mjs";
import { WIDE } from "./one-path-november-10-kit.mjs";
import { CHANGED_PINS } from "./one-path-november-12-changed-pins.mjs";
import { W12_JOURNEYS } from "./one-path-november-12-journeys.mjs";
import { createStaffKit, rehearsalFixture } from "./one-path-november-12-kit.mjs";
import {
  W12_MATRIX,
  renderQualificationReport,
  scoreQualification,
} from "./one-path-november-12-qualification-verdict.mjs";
import { checkW1201 } from "./one-path-november-12-w12-01.mjs";
import { checkW1202 } from "./one-path-november-12-w12-02.mjs";
import { checkW1203 } from "./one-path-november-12-w12-03.mjs";
import { checkW1204 } from "./one-path-november-12-w12-04.mjs";
import { checkW1205 } from "./one-path-november-12-w12-05.mjs";
import { checkW1206 } from "./one-path-november-12-w12-06.mjs";
import { checkW1207 } from "./one-path-november-12-w12-07.mjs";
import { checkW1208 } from "./one-path-november-12-w12-08.mjs";
import { checkW1209 } from "./one-path-november-12-w12-09.mjs";
import { checkW1210 } from "./one-path-november-12-w12-10.mjs";
import { checkW1211 } from "./one-path-november-12-w12-11.mjs";
import { checkW1212 } from "./one-path-november-12-w12-12.mjs";
import { checkW1213 } from "./one-path-november-12-w12-13.mjs";
import { checkW1214 } from "./one-path-november-12-w12-14.mjs";

assert.equal(globalThis.fetch.name, "guardedFetch");
assert.equal(Socket.prototype.connect.name, "guardedConnect");
const origin = requireLoopbackRehearsalOrigin(process.env.ONE_PATH_REHEARSAL_ORIGIN);
const runDir = process.env.ONE_PATH_REHEARSAL_RUN_DIR;
const rehearsal = readRehearsal(runDir);
const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
assert.equal(rehearsal.servedVersion, rehearsal.servedCommit, "Serve the named source");
assert.equal(
  rehearsal.mailAdapter,
  true,
  "The journeys need the rehearsal mail adapter.",
);
const compiledBuild = rehearsal.compiled === true;
assert.ok(
  !compiledBuild || rehearsal.compiledMail != null,
  "A compiled build serves mail only with --compiled-synthetic-mail; without it every send is refused.",
);
const mode = compiledBuild ? "compiled" : "development";

/** Each row's candidate-side checks, one file per row (the W12 CHECK CONTRACT above). */
const W12_CHECKS = Object.freeze({
  "W12-01": checkW1201,
  "W12-02": checkW1202,
  "W12-03": checkW1203,
  "W12-04": checkW1204,
  "W12-05": checkW1205,
  "W12-06": checkW1206,
  "W12-07": checkW1207,
  "W12-08": checkW1208,
  "W12-09": checkW1209,
  "W12-10": checkW1210,
  "W12-11": checkW1211,
  "W12-12": checkW1212,
  "W12-13": checkW1213,
  "W12-14": checkW1214,
});
for (const { id } of W12_MATRIX) {
  assert.equal(typeof W12_JOURNEYS[id], "function", `${id} has a starting sequence`);
  assert.equal(typeof W12_CHECKS[id], "function", `${id} has its candidate checks`);
}
/**
 * The order rows run in: the baseline driver's (one-path-november-12-baseline-driver.mjs), so the
 * candidate meets the starting sequences in the order the fail-first table was recorded.
 */
const RUN_ORDER = [
  "W12-06",
  "W12-11",
  "W12-14",
  "W12-09",
  "W12-01",
  "W12-02",
  "W12-03",
  "W12-04",
  "W12-05",
  "W12-07",
  "W12-08",
  "W12-10",
  "W12-13",
  "W12-12",
];

// ---- Arguments -------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const argument = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const flag = (name) => argv.includes(name);
const listed = (value) =>
  value === undefined
    ? null
    : String(value)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
const only = listed(argument("--only"));

const PRELOAD = "tests/browser/renewal-novdec-journey-network.mjs";
const S252_DRIVER = "tests/browser/one-path-journey-driver.mjs";
const STAFF_PATH_CHECK = "scripts/check-staff-path-calls.mjs";
const BUILD_ID_FILE = "temp/e2e/.next/BUILD_ID";
const REPLAY_TIMEOUT_MS = 3 * 60 * 60 * 1000;
const s252Phases = argument("--s252-phases") ?? "journey";
const REPLAYS = Object.freeze({
  s260: {
    driver: S260_DRIVER,
    output: "s260-verdict.json",
    args: () => [
      "--require-s283-preparation",
      ...(argument("--rendered-help")
        ? ["--rendered-help", argument("--rendered-help")]
        : []),
      ...(argument("--rendered-help-drift")
        ? ["--rendered-help-drift", argument("--rendered-help-drift")]
        : []),
    ],
  },
  s271: {
    driver: S271_DRIVER,
    output: "s271-verdict.json",
    args: () =>
      argument("--s271-baseline") ? ["--baseline", argument("--s271-baseline")] : [],
  },
  s252: {
    driver: S252_DRIVER,
    output: "journey.json",
    args: () => (s252Phases === "all" ? [] : ["--phases", s252Phases]),
  },
});
const replayArgument = argument("--replays");
const replays =
  replayArgument === undefined
    ? only || !compiledBuild
      ? []
      : ["s260", "s271", "s252"]
    : replayArgument === "none"
      ? []
      : listed(replayArgument);
for (const name of replays)
  assert.ok(name in REPLAYS, `Unknown replay ${name}; use s260, s271 or s252.`);
const options = {
  w1203Attempts: Number(argument("--w1203-attempts") ?? 3),
  w1203WaitSeconds: Number(argument("--w1203-wait") ?? 75),
  w1212Filter: argument("--w1212-filter") ?? "Example",
  offCycleLeaseId: 9106,
};

/** The R-S284-1 record, from a private rehearsal run directory only. */
function readFailFirstBaseline(path) {
  if (!path) return null;
  const file = realpathSync(path);
  assert.ok(
    file.startsWith(realpathSync(REHEARSAL_STATE_DIR) + "/") &&
      file.endsWith("/november-12-baseline.json"),
    "Use the recorded november-12-baseline.json from a private rehearsal run.",
  );
  const record = JSON.parse(readFileSync(file, "utf8"));
  return {
    file,
    source: record.servedSource ?? null,
    complete: record.complete === true,
    rows: (record.rows ?? []).map(({ id, reproduced }) => ({ id, reproduced })),
  };
}
const failFirst = readFailFirstBaseline(argument("--baseline"));

// ---- The run directory, the fixture and the kit ----------------------------------------------

const output = (name) => join(runDir, name);
const notesFile = output("november-12-qualification-notes.log");
const rowsFile = output("november-12-journeys.jsonl");
const note = (line) =>
  appendFileSync(
    notesFile,
    `${new Date().toISOString()} ${String(typeof line === "string" ? line : JSON.stringify(line)).slice(0, 2000)}\n`,
  );
process.on("unhandledRejection", (error) => note(`late rejection: ${String(error)}`));

const { mix, identity: fixture } = rehearsalFixture(rehearsal);
const leaseFacts = (leaseId) => {
  const row = mix.leases.find((entry) => String(entry.lease.leaseID) === String(leaseId));
  return row
    ? {
        leaseId: Number(leaseId),
        rent: Number(row.unit.rent),
        endDate: row.lease.endDate,
      }
    : null;
};
const leases = {
  ...Object.fromEntries(
    Object.entries(rehearsal.roles).map(([role, leaseId]) => [role, leaseFacts(leaseId)]),
  ),
  byId: leaseFacts,
};
const kit = createStaffKit({ rehearsal, origin, mix });
// W12 rows hold the automatic comparison through their own resets, as the baseline did.
const heldRehearsal = { ...rehearsal, automaticComparisonHeld: true };

// ---- The build: one compiled event, its build id on disk, the server serving it ----------------

function logEvents() {
  return readFileSync(output("rehearsal-log.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}
const compiledEvents = logEvents().filter((entry) => entry.event === "compiled");
// A run that built more than once has no one build to bind to.
const compiled = compiledEvents.length === 1 ? compiledEvents[0] : null;
let serverPid =
  logEvents()
    .filter((entry) => entry.event === "server-started")
    .at(-1)?.pid ?? null;

async function servedBuild() {
  let version = null;
  try {
    const response = await fetch(`${origin}/api/version`, { redirect: "error" });
    version = (await response.json())?.commit ?? null;
  } catch {
    version = null;
  }
  let onDisk = null;
  try {
    onDisk = readFileSync(BUILD_ID_FILE, "utf8").trim();
  } catch {
    onDisk = null;
  }
  let alive = false;
  try {
    if (serverPid) {
      process.kill(serverPid, 0);
      alive = true;
    }
  } catch {
    alive = false;
  }
  return { version, onDisk, pid: serverPid, alive };
}
/** The build id a unit is bound to: the run's, only when the same build served it throughout. */
function unitBuildId(before, after) {
  if (!compiled) return null;
  const serving = (probe) =>
    probe.version === rehearsal.servedVersion &&
    probe.onDisk === compiled.buildId &&
    probe.alive === true;
  return serving(before) && serving(after) && before.pid === after.pid
    ? compiled.buildId
    : "unbound-build";
}

// ---- Fresh starts: the server again from the same build, then the starting state ---------------

const restarting = compiledBuild ? !flag("--no-restart") : flag("--restart");
const restartsAvailable = Boolean(
  rehearsal.files?.serverRestartRequest && rehearsal.files?.serverRestartAnswer,
);
if (restarting && !restartsAvailable)
  note("This rehearsal has no server restart hook; units start again without a restart.");
let restarts = 0;
let firstUnit = true;

async function restartServer(reason) {
  const request = rehearsal.files.serverRestartRequest;
  const answer = rehearsal.files.serverRestartAnswer;
  const nonce = randomUUID();
  writeFileSync(`${request}.new`, `${JSON.stringify({ nonce, reason })}\n`, {
    mode: 0o600,
  });
  renameSync(`${request}.new`, request);
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await delay(1000);
    let reply = null;
    try {
      reply = JSON.parse(readFileSync(answer, "utf8"));
    } catch {
      reply = null;
    }
    if (reply?.nonce !== nonce) continue;
    if (reply.ready !== true)
      throw new Error(`The server did not start again: ${reply.error ?? "no reason"}`);
    serverPid = reply.pid;
    restarts += 1;
    note({ event: "server started again", reason, pid: reply.pid });
    return reply;
  }
  throw new Error("The rehearsal did not start its server again within five minutes.");
}

/** Put the rehearsal where a unit starts: the run's own state for the first, else fresh. */
async function freshStart(unit, { held, browser = null }) {
  const pristine = firstUnit && (!held || rehearsal.automaticComparisonHeld === true);
  firstUnit = false;
  if (pristine) return { restarted: false, reset: false };
  let restarted = false;
  if (restarting && restartsAvailable) {
    await restartServer(unit);
    restarted = true;
  }
  // Each replay child starts its own browser. Release the separate seed browser before it runs.
  const seedBrowser = browser ?? (await launchBrowser());
  let seeds;
  try {
    seeds = await resetRehearsalState({
      rehearsal: held ? heldRehearsal : rehearsal,
      browser: seedBrowser,
      steps: startingSeedSteps(rehearsal),
    });
  } finally {
    if (!browser) await seedBrowser.close();
  }
  note(
    `${unit} started again (restart ${restarted}): ${seeds.map((seed) => `${seed.name}=${seed.state}`).join(" ")}`,
  );
  return {
    restarted,
    reset: true,
    seeds: seeds.map(({ name, state }) => ({ name, state })),
  };
}

// ---- Refused connections, per log, so a W12 row owns the ones made while it ran ---------------

const REFUSAL_LOGS = [
  ["server", rehearsal.files.networkLog],
  ["rehearsal", rehearsal.files.harnessNetworkLog],
  ["driver", rehearsal.files.driverNetworkLog],
];
function refusalsByLog() {
  return Object.fromEntries(
    REFUSAL_LOGS.map(([from, file]) => [
      from,
      !file || !existsSync(file)
        ? []
        : readFileSync(file, "utf8")
            .split("\n")
            .filter(Boolean)
            .flatMap((line) => {
              try {
                const entry = JSON.parse(line);
                return entry.refused ? [{ ...entry, from }] : [];
              } catch {
                return [];
              }
            }),
    ]),
  );
}
const refusalMark = () =>
  Object.fromEntries(
    Object.entries(refusalsByLog()).map(([from, entries]) => [from, entries.length]),
  );
const rowWindows = [];
/** Every refused connection of the whole run (AC-S284-6), a W12 row's tagged with its journey. */
function runRefusals() {
  return Object.entries(refusalsByLog()).flatMap(([from, entries]) =>
    entries.map((entry, index) => {
      const window = rowWindows.find(
        ({ start, end }) => index >= (start[from] ?? 0) && index < (end[from] ?? 0),
      );
      return {
        from,
        host: entry.host ?? null,
        refused: entry.refused ?? null,
        ...(window ? { journey: window.journey } : {}),
      };
    }),
  );
}

// ---- Child processes: the staff-path check and the replays, named variables only -------------

const CHILD_ENVIRONMENT = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "TZ",
  "PLAYWRIGHT_CHROME_PATH",
  "DESK_BROWSER_EXECUTABLE",
  "PLAYWRIGHT_BROWSERS_PATH",
  "NOVDEC_JOURNEY_NETWORK_LOG",
  "ONE_PATH_REHEARSAL_ORIGIN",
  "ONE_PATH_REHEARSAL_RUN_DIR",
  "S260_SYNTHETIC_WORKER_TOKEN",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_PROJECT_ID",
  "GOOGLE_CLOUD_PROJECT",
];
const childEnvironment = () =>
  Object.fromEntries(
    CHILD_ENVIRONMENT.filter((name) => process.env[name] !== undefined).map((name) => [
      name,
      process.env[name],
    ]),
  );

/**
 * ARCH-S284-2 on the served tree: the static check's JSON (node scripts/check-staff-path-calls.mjs
 * --json) with the commit of the tree it scanned. That commit is named only when every scanned
 * file is the commit's own (no overlay or harness file laid over it); otherwise the gate is
 * refused as unbound.
 */
function staffPathInput() {
  const scan = spawnSync(
    process.execPath,
    ["--import", `./${PRELOAD}`, STAFF_PATH_CHECK, "--json"],
    { encoding: "utf8", env: childEnvironment(), maxBuffer: 32 * 1024 * 1024 },
  );
  let result = null;
  try {
    result = JSON.parse(scan.stdout);
  } catch {
    result = null;
  }
  if (!result || !Array.isArray(result.files))
    return {
      input: null,
      exit: scan.status,
      error: String(scan.stderr ?? "").slice(-600),
    };
  const head = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const commit = /^[a-f0-9]{40}$/.test(String(head.stdout).trim())
    ? String(head.stdout).trim()
    : null;
  const status = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", ...result.files],
    { encoding: "utf8" },
  );
  const clean = status.status === 0 && String(status.stdout).trim() === "";
  return {
    input: {
      source: commit && clean ? commit : null,
      files: result.files,
      violations: result.violations ?? [],
      unparsed: result.unparsed ?? [],
    },
    exit: scan.status,
    commit,
    clean,
  };
}

function runChild(name, file, args) {
  return new Promise((done) => {
    const log = createWriteStream(output(`november-12-replay-${name}.log`), {
      flags: "a",
    });
    const started = Date.now();
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      log.end();
      done({ ...result, seconds: Math.round((Date.now() - started) / 1000) });
    };
    const child = spawn(process.execPath, ["--import", `./${PRELOAD}`, file, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: childEnvironment(),
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    timer = setTimeout(() => child.kill("SIGTERM"), REPLAY_TIMEOUT_MS);
    child.on("error", (error) =>
      finish({ code: 1, error: String(error?.message ?? error).slice(0, 400) }),
    );
    child.on("close", (code, signal) => finish({ code: code ?? 1, signal }));
  });
}

/** A replay's input to scorePreservationReplays, from its own driver's output file. */
function replayInput(name, recorded, { source, buildId }) {
  if (name === "s252") {
    if (!recorded || recorded.mode !== "candidate")
      return {
        source,
        buildId,
        checks: [{ id: "run.ran", passed: false }],
        budgets: [],
      };
    const entries = (values) =>
      (values ?? []).map(({ id, passed }) => ({ id, passed: passed === true }));
    return {
      source: recorded.servedCommit ?? source,
      buildId,
      checks: entries(recorded.checks),
      budgets: entries(recorded.budgets),
    };
  }
  if (!recorded) return { source, buildId, verdict: "No", journeys: [] };
  return {
    source: recorded.source ?? source,
    buildId,
    verdict: recorded.verdict ?? null,
    journeys: (recorded.journeys ?? []).map((row) => ({
      id: row.id,
      verdict: row.verdict,
      ...(row.source !== undefined ? { source: row.source } : {}),
      ...(row.buildId !== undefined ? { buildId: row.buildId } : {}),
    })),
  };
}

async function runReplay(name) {
  const spec = REPLAYS[name];
  const started = Date.now();
  if (name === "s260" && !compiledBuild) {
    note(
      "s260 not run: the S260 driver qualifies only on the compiled synthetic-mail build.",
    );
    return { name, input: null, ran: false };
  }
  let fresh = null;
  try {
    fresh = await freshStart(`replay ${name}`, { held: false });
  } catch (error) {
    const reason = String(error?.message ?? error).slice(0, 600);
    note(`replay ${name} could not start: ${reason}`);
    return {
      name,
      ran: false,
      error: reason,
      input: replayInput(name, null, {
        source: rehearsal.servedVersion,
        buildId: compiled ? "unbound-build" : null,
      }),
    };
  }
  const before = await servedBuild();
  const exit = await runChild(name, spec.driver, spec.args());
  const after = await servedBuild();
  const file = output(spec.output);
  const written = existsSync(file) && statSync(file).mtimeMs >= started;
  let recorded = null;
  try {
    recorded = written ? JSON.parse(readFileSync(file, "utf8")) : null;
  } catch {
    recorded = null;
  }
  const input = replayInput(name, recorded, {
    source: after.version ?? before.version ?? null,
    buildId: unitBuildId(before, after),
  });
  const summary = {
    name,
    ran: true,
    driver: spec.driver,
    exit,
    fresh,
    binding: { before, after, buildId: input.buildId },
    wroteOutput: Boolean(recorded),
    moduleVerdict: recorded?.verdict ?? null,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  note({ replay: name, ...summary });
  process.stdout.write(
    `replay ${name}: exit ${exit.code}, ${recorded ? `module verdict ${recorded.verdict ?? (recorded.failed === 0 ? "passed" : "failed")}` : "no output"}, build ${input.buildId ?? "none"}\n`,
  );
  return { ...summary, input };
}

// ---- W12 rows ----------------------------------------------------------------------------------

function launchBrowser() {
  return chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
}

/** A signed-in page in a fresh context that refuses every request off the rehearsal's origin. */
async function signedInPage(browser, role, writes, contexts) {
  const context = await browser.newContext({
    viewport: WIDE,
    colorScheme: "light",
    timezoneId: "America/Chicago",
    serviceWorkers: "block",
  });
  contexts.push(context);
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort("blockedbyclient");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      let body = null;
      try {
        body = request.postDataJSON();
      } catch {
        body = null;
      }
      writes.push({
        role,
        path: url.pathname,
        ...(body && typeof body === "object"
          ? {
              kind:
                body.action?.kind ?? body.action ?? body.kind ?? body.operation ?? null,
              ...(body.field ? { field: body.field } : {}),
            }
          : {}),
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
  await kit.signIn(page, role);
  page.__role = role;
  return page;
}

function summarizeWrites(writes) {
  const counts = {};
  for (const write of writes) {
    const key = `${write.role} ${write.path}${write.kind ? ` ${write.kind}` : ""}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

const message = (error) => String(error?.message ?? error).slice(0, 900);

async function screenshots(id, phase, pages) {
  for (const [index, page] of pages.entries())
    if (!page.isClosed())
      await page
        .screenshot({ path: output(`${id}-${phase}-${index}.png`), fullPage: false })
        .catch(() => undefined);
}

/** Only true passes and only false fails; anything else a check returns is not recorded. */
function recordedChecks(answer) {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return {};
  return Object.fromEntries(
    Object.entries(answer).map(([id, value]) => [
      id,
      value === true ? true : value === false ? false : null,
    ]),
  );
}

const unresolvedEffects = [];

async function runW12Row(id) {
  const writes = [];
  const contexts = [];
  const pages = [];
  const effects = [];
  const started = Date.now();
  let fresh = null;
  let start = { observed: null, steps: [], error: null };
  let checks = {};
  let error = null;
  let before = null;
  let browser = null;
  // A refusal made while the row starts again (its reset and seeds) belongs to the row too.
  const mark = refusalMark();
  try {
    browser = await launchBrowser();
    fresh = await freshStart(id, { held: true, browser });
    // Read after the fresh start, so a restart before the row is not read as another build.
    before = await servedBuild();
    const page = await signedInPage(browser, "Editor", writes, contexts);
    pages.push(page);
    const ctx = {
      journeyId: id,
      kit,
      rehearsal,
      origin,
      leases,
      options,
      mode,
      binding: Object.freeze({
        source: rehearsal.servedVersion,
        buildId: compiled?.buildId ?? null,
      }),
      writes,
      record: (entry) => {
        const detail = JSON.stringify(entry);
        const recorded =
          detail.length <= 64_000
            ? detail
            : JSON.stringify({ length: detail.length, excerpt: detail.slice(0, 2_000) });
        appendFileSync(notesFile, `${new Date().toISOString()} ${id} ${recorded}\n`);
      },
      unresolved: (kind) => effects.push(String(kind ?? "effect").slice(0, 80)),
      newPage: async (role) => {
        const extra = await signedInPage(browser, role, writes, contexts);
        pages.push(extra);
        return extra;
      },
      resetState: async () => {
        const at = Date.now();
        const seeds = await resetRehearsalState({
          rehearsal: heldRehearsal,
          browser,
          steps: startingSeedSteps(rehearsal),
        });
        for (const open of pages) {
          if (open.isClosed()) continue;
          await open.goto(`${origin}/sign-in`, { waitUntil: "domcontentloaded" });
          await kit.signIn(open, open.__role ?? "Editor");
        }
        note(
          `${id} reset in ${Math.round((Date.now() - at) / 1000)} s: ${seeds.map((seed) => `${seed.name}=${seed.state}`).join(" ")}`,
        );
        return seeds;
      },
    };
    try {
      const result = await W12_JOURNEYS[id](ctx, page);
      start = {
        observed: result?.observed ?? null,
        steps: result?.steps ?? [],
        error: null,
      };
    } catch (failure) {
      start = { observed: null, steps: [], error: message(failure) };
      await screenshots(id, "starting", pages);
    }
    checks = recordedChecks(await W12_CHECKS[id](ctx, page, start));
  } catch (failure) {
    error = message(failure);
    await screenshots(id, "stopped", pages);
  } finally {
    for (const context of contexts) await context.close().catch(() => undefined);
    await browser?.close().catch((failure) => {
      error ??= message(failure);
    });
  }
  const after = await servedBuild();
  before ??= after;
  const end = refusalMark();
  rowWindows.push({ journey: id, start: mark, end });
  unresolvedEffects.push(...effects.map((kind) => ({ journey: id, kind })));
  const buildId = unitBuildId(before, after);
  const result = {
    id,
    source: after.version ?? before.version ?? null,
    ...(buildId ? { buildId } : {}),
    checks,
    ...(error ? { error } : {}),
  };
  appendFileSync(
    rowsFile,
    `${JSON.stringify({
      ...result,
      startingSequence: { completed: !start.error, error: start.error },
      observed: start.observed,
      steps: start.steps,
      writes: summarizeWrites(writes),
      unresolvedEffects: effects,
      refusedConnections: Object.keys(end).reduce(
        (sum, from) => sum + (end[from] - (mark[from] ?? 0)),
        0,
      ),
      fresh,
      binding: { before, after },
      seconds: Math.round((Date.now() - started) / 1000),
    })}\n`,
  );
  return result;
}

/** A row's own reading of its checks, for diagnosis on any run (admissible or not). */
function diagnose(result) {
  const spec = W12_MATRIX.find((entry) => entry.id === result.id);
  const failed = spec.checks.filter((check) => result.checks[check] === false);
  const passed = spec.checks.filter((check) => result.checks[check] === true);
  return {
    id: result.id,
    passed: passed.length,
    of: spec.checks.length,
    failed,
    notRecorded: spec.checks.length - passed.length - failed.length,
    mislabeled: Object.keys(result.checks).filter((check) => !spec.checks.includes(check))
      .length,
    stopped: Boolean(result.error),
  };
}

// ---- The run ------------------------------------------------------------------------------------

const startedAt = new Date().toISOString();
const staffPath = staffPathInput();
writeFileSync(
  output("november-12-staff-path.json"),
  `${JSON.stringify(staffPath, null, 2)}\n`,
);
note({
  event: "started",
  mode,
  only,
  replays,
  restarting,
  restartsAvailable,
  build: compiled ? compiled.buildId : null,
  fixture,
});

const replayResults = {};
const results = [];
try {
  for (const name of replays) replayResults[name] = await runReplay(name);
  for (const id of RUN_ORDER) {
    if (only && !only.includes(id)) continue;
    const result = await runW12Row(id);
    results.push(result);
    const reading = diagnose(result);
    process.stdout.write(
      `${id}: ${reading.passed} of ${reading.of} checks passed${reading.failed.length ? `, failed ${reading.failed.join(", ")}` : ""}, ${reading.notRecorded} not recorded${reading.mislabeled ? `, ${reading.mislabeled} mislabeled` : ""}${reading.stopped ? ", stopped" : ""}\n`,
    );
  }
} finally {
  const input = {
    run: {
      servedSource: rehearsal.servedVersion,
      buildId: compiled?.buildId ?? null,
      buildSource: compiled?.source ?? null,
      harnessSource: run.harness_sha ?? null,
      overlay: rehearsal.overlay === true,
      harnessUncommitted: run.harness_uncommitted === true,
      compiled: rehearsal.compiled === true,
      compiledMail: rehearsal.compiledMail ?? null,
      buildCompiledMail: compiled?.compiledMail ?? null,
      runId: run.run_id ?? null,
      only,
      results,
      refusedConnections: runRefusals(),
      unresolvedEffects,
    },
    baseline: failFirst ? { source: failFirst.source, rows: failFirst.rows } : null,
    staffPath: staffPath.input,
    replays: Object.fromEntries(
      Object.entries(replayResults).map(([name, replay]) => [name, replay.input]),
    ),
    changedPins: [...CHANGED_PINS],
  };
  const scored = scoreQualification(input);
  const diagnostics = results.map(diagnose);
  const { qualified } = scored;
  const diagnosticPass =
    results.length > 0 &&
    diagnostics.every(
      (reading) => !reading.stopped && reading.failed.length === 0 && !reading.mislabeled,
    );
  writeFileSync(
    output("november-12-qualification-input.json"),
    `${JSON.stringify({ ...input, baselineFile: failFirst?.file ?? null }, null, 2)}\n`,
  );
  writeFileSync(
    output("november-12-qualification.json"),
    `${JSON.stringify(
      {
        driver: S284_DRIVER,
        mode,
        startedAt,
        finishedAt: new Date().toISOString(),
        admissible: scored.matrix.admissible === true,
        only,
        replays,
        restarts: {
          requested: restarting,
          available: restartsAvailable,
          count: restarts,
        },
        diagnostics,
        ...scored,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    output("november-12-qualification-report.md"),
    renderQualificationReport(scored),
  );
  process.stdout.write(
    `${JSON.stringify({
      runId: run.run_id,
      mode,
      admissible: scored.matrix.admissible === true,
      matrix: `${scored.matrix.status} ${scored.matrix.verdict}`,
      staffPath: scored.staffPath.status,
      replays: Object.fromEntries(
        replays.map((name) => [name, scored.preservation[name]?.verdict ?? "NOT RUN"]),
      ),
      rows: results.map(({ id }) => {
        const journey = scored.matrix.journeys.find((entry) => entry.id === id);
        return `${id}:${journey?.verdict ?? "UNVERIFIED"}`;
      }),
      human: "NOT RUN — no human observer",
    })}\n`,
  );
  if (scored.matrix.admissible !== true)
    process.stdout.write(
      `NOT ADMISSIBLE: a ${mode} run${only ? " limited with --only" : ""} is diagnosis, never qualification evidence.\n`,
    );
  process.exitCode =
    scored.matrix.admissible === true ? (qualified ? 0 : 1) : diagnosticPass ? 0 : 1;
}
