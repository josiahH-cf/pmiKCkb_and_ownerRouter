// S254 R-S254-2 to R-S254-4 and S252 R-S252-2: the one-path rehearsal, inside its disposable
// worktree. Run it through scripts/run-renewal-one-path-rehearsal.sh, which checks out the commit
// to serve, starts the Firestore and Auth emulators on free loopback ports and starts this script
// under the provider boundary (tests/browser/renewal-novdec-journey-network.mjs).
//
// This script starts the rehearsal's stand-ins (comparison, mail, model) on 127.0.0.1, starts the
// real Next dev server in the Demo descriptor with local demo sign-in and a from-scratch
// environment, loads the "November 5 mix" through the synthetic RentVine transport, seeds the app
// state the mix needs through the app's own routes, and then either runs a driver file, or
// (--serve) stays up and prints where to sign in, the control hooks and the logs. Nothing here
// can reach production, a provider, a mailbox or a billed lookup: every non-loopback connection
// from the server, from this script and from the driver is refused and logged.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, Socket } from "node:net";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

import { resolveBrowserExecutable } from "./lib/browser-executable.mjs";
import { requireLoopbackRehearsalOrigin } from "./lib/help-rehearsal-origin.mjs";
import {
  REHEARSAL_COMPARISON_ALLOWANCE,
  REHEARSAL_FILE,
  readRehearsal,
  refusedConnections,
  setRecordingCycles,
} from "./lib/one-path-rehearsal/control.mjs";
import {
  NOVEMBER_5_MIX_PATH,
  centralBusinessDate,
  checkNovember5MixShape,
  loadNovember5Mix,
  readNovember5Mix,
  summarizeNovember5Mix,
} from "./lib/one-path-rehearsal/november-5-mix.mjs";
import { runSeeds, SEED_STEPS } from "./lib/one-path-rehearsal/seeds.mjs";
import { setupCompiledMail } from "./lib/one-path-rehearsal/compiled-mail.mjs";
import { startStandIns } from "./lib/one-path-rehearsal/stand-ins.mjs";

const PROJECT_ID = "pmi-kc-kb-one-path-rehearsal-test";
const PRELOAD = "tests/browser/renewal-novdec-journey-network.mjs";
const SMOKE_DRIVER = "tests/browser/one-path-smoke-driver.mjs";
const ROLES = ["Editor", "Approver", "Admin"];

const argv = process.argv.slice(2);
const split = argv.indexOf("--");
const own = split < 0 ? argv : argv.slice(0, split);
const driverArgs = split < 0 ? [] : argv.slice(split + 1);
const flag = (name) => own.includes(name);
const option = (name) => {
  const index = own.indexOf(name);
  return index >= 0 ? own[index + 1] : undefined;
};

assert.ok(flag("--managed"), "Run through scripts/run-renewal-one-path-rehearsal.sh.");
assert.ok(
  globalThis.fetch?.name === "guardedFetch" &&
    Socket.prototype.connect.name === "guardedConnect",
  "The rehearsal requires its network guard preload.",
);
assert.match(process.cwd(), /^\/tmp\/pmi-kc-one-path-rehearsal-[^/]+\/worktree$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "", /^127\.0\.0\.1:\d+$/);
const output = process.env.ONE_PATH_REHEARSAL_OUTPUT;
assert.ok(
  output?.startsWith(`${process.env.HOME}/.local/state/pmi-kc-one-path-rehearsal/`),
  "The run directory must be private local state.",
);
const servedSha = process.env.ONE_PATH_REHEARSAL_SERVED_SHA ?? "";
const harnessSha = process.env.ONE_PATH_REHEARSAL_HARNESS_SHA ?? "";
assert.match(servedSha, /^[a-f0-9]{40}$/);
assert.match(harnessSha, /^[a-f0-9]{40}$/);
const overlay = process.env.ONE_PATH_REHEARSAL_OVERLAY === "true";
const namedCommit = process.env.ONE_PATH_REHEARSAL_NAMED_COMMIT === "true";

const serve = flag("--serve");
const serveSeconds = Number(option("--serve-for") ?? 0);
const driver = serve ? null : resolve(option("--driver") ?? SMOKE_DRIVER);
const seeding = !flag("--no-seeds");
// S249: without the mail adapter the server is outside the rehearsal exemption, as a verification
// session's server is: resolveRehearsalStandIn() answers null there, so the automatic start never
// fires in an automated browser, and sends and Gmail drafts are refused as in the Demo environment.
// The comparison stand-in still answers through the provider boundary.
const mailAdapter = !flag("--no-mail-adapter");
if (driver) assert.ok(existsSync(driver), `No driver file at ${driver}.`);

mkdirSync(output, { recursive: true });
const log = createWriteStream(join(output, "rehearsal-log.jsonl"), { flags: "a" });
const record = (entry) =>
  log.write(`${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
const say = (line) => process.stdout.write(`${line}\n`);

// The fixture, as it loads today. A fixture that fails its shape check never starts a rehearsal.
const fixture = readNovember5Mix(join(process.cwd(), NOVEMBER_5_MIX_PATH));
const businessDate = centralBusinessDate();
const shape = checkNovember5MixShape(fixture, businessDate);
assert.deepEqual(
  shape,
  [],
  `The November 5 mix fails its shape check: ${shape.join(" ")}`,
);
const mix = loadNovember5Mix(fixture, businessDate);
const summary = summarizeNovember5Mix(mix);

const files = {
  rentvineControl: join(output, "rentvine-control.json"),
  rentvineOutage: join(output, "synthetic-rentvine-outage"),
  networkLog: join(output, "network.jsonl"),
  // The launcher points this process's own refusal log here.
  harnessNetworkLog: join(output, "harness-network.jsonl"),
  standInLog: join(output, "stand-ins.jsonl"),
  serverLog: join(output, "server.log"),
  driverNetworkLog: join(output, "driver-network.jsonl"),
  mailClock: join(output, "s260-mail-clock.json"),
  // S284 R-S284-4: a driver asks for the server to be started again (answerServerRestarts).
  serverRestartRequest: join(output, "server-restart-request.json"),
  serverRestartAnswer: join(output, "server-restart.json"),
};

const compiledMail = flag("--compiled-synthetic-mail")
  ? setupCompiledMail({
      clockFile: files.mailClock,
      driver,
      compiled: flag("--compiled"),
      mailAdapter,
      overlay,
      namedCommit,
      servedSha,
      harnessSha,
    })
  : null;

let server = null;
// Starts the server again from what startServer built or prepared, never building again.
let relaunchServer = null;
let browser = null;
let standIns = null;
let exitCode = 1;
try {
  standIns = await startStandIns({ mix, logDir: output, mailNow: compiledMail?.now });
  const port = await freePort();
  const origin = requireLoopbackRehearsalOrigin(`http://localhost:${port}`);
  const rehearsalBase = {
    origin,
    servedCommit: servedSha,
    harnessCommit: harnessSha,
    overlay,
    namedCommit,
    businessDate,
    workingMonth: mix.workingMonth,
    monthsShifted: mix.monthsShifted,
    standInOrigin: standIns.origin,
    mailAdapter,
    compiledMail: compiledMail?.identity ?? null,
    automaticComparisonHeld: flag("--hold-automatic-comparison"),
    compiled: flag("--compiled"),
    firestoreEmulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
    authEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    projectId: PROJECT_ID,
    files,
    roles: Object.fromEntries(
      Object.entries(mix.roles).map(([role, seed]) => [role, seed.leaseId]),
    ),
    groups: summary.groups,
  };
  writeFileSync(
    join(output, REHEARSAL_FILE),
    `${JSON.stringify({ ...rehearsalBase, seeds: [] }, null, 2)}\n`,
  );
  let rehearsal = readRehearsal(output);
  // The recorded cycle dates are served from the server's first RentVine read until they are seeded.
  setRecordingCycles(rehearsal, seeding);

  await seedDemoAccounts();
  server = await startServer(port);
  await waitForServer(origin);
  const served = await fetch(`${origin}/api/version`)
    .then((response) => response.json())
    .catch(() => ({ commit: "unknown" }));
  record({ event: "serving", origin, servedCommit: served.commit, servedSha, overlay });

  browser = await chromium.launch({
    executablePath: resolveBrowserExecutable(),
    headless: true,
  });
  let seeds = [];
  if (seeding) {
    const context = await browser.newContext({
      timezoneId: "America/Chicago",
      serviceWorkers: "block",
    });
    await context.route("**/*", (request) =>
      new URL(request.request().url()).origin === origin
        ? request.continue()
        : request.abort("blockedbyclient"),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(120_000);
    page.setDefaultNavigationTimeout(180_000);
    await signIn(page, origin, "Editor");
    const contextForSeeds = { page, mix, rehearsal, origin };
    seeds = compiledMail
      ? await runSeeds(
          contextForSeeds,
          SEED_STEPS.filter(({ name }) => name !== "replied-owner-message"),
        )
      : await runSeeds(contextForSeeds);
    await context.close();
    // Whatever the seeds did, the desk is left reading the current RentVine dates.
    setRecordingCycles(rehearsal, false);
  }
  writeFileSync(
    join(output, REHEARSAL_FILE),
    `${JSON.stringify({ ...rehearsalBase, servedVersion: served.commit, seeds }, null, 2)}\n`,
  );
  rehearsal = readRehearsal(output);
  record({ event: "seeded", seeds });
  for (const seed of seeds) say(`seed ${seed.name}: ${seed.state}. ${seed.detail}`);

  if (serve) {
    const lines = serving(rehearsal, served.commit);
    writeFileSync(join(output, "serving.txt"), `${lines.join("\n")}\n`);
    for (const line of lines) say(line);
    await new Promise((done) => {
      process.once("SIGINT", done);
      process.once("SIGTERM", done);
      if (serveSeconds > 0) setTimeout(done, serveSeconds * 1000);
    });
    exitCode = 0;
  } else {
    await browser.close();
    browser = null;
    const stopAnswering = answerServerRestarts(rehearsal.origin);
    try {
      exitCode = await runDriver(rehearsal);
    } finally {
      stopAnswering();
    }
  }

  const refused = refusedConnections(rehearsal);
  const result = {
    event: "finished",
    servedCommit: served.commit,
    overlay,
    namedCommit,
    mode: serve ? "serve" : "driver",
    driver: driver ? driver.replace(`${process.cwd()}/`, "") : null,
    exitCode,
    seeds,
    refusedConnections: refused.length,
    refusedHosts: [...new Set(refused.map((entry) => entry.host ?? entry.refused))],
    standIns: {
      comparisonsByLease: standIns.describe().comparison.comparisonsByLease,
      modelRequests: standIns.describe().model.requests.length,
      messagesKept: standIns
        .describe()
        .mail.mailboxes.reduce((sum, box) => sum + box.messages.length, 0),
    },
  };
  record(result);
  writeFileSync(join(output, "summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  say(
    `One-path rehearsal finished with exit ${exitCode}; ${refused.length} refused connection(s). Evidence: ${output}`,
  );
} catch (error) {
  record({ event: "failed", message: String(error?.stack ?? error).slice(0, 2000) });
  process.stderr.write(`${String(error?.stack ?? error)}\n`);
  exitCode = 1;
} finally {
  await browser?.close().catch(() => undefined);
  await stopServer();
  await standIns?.close().catch(() => undefined);
  log.end();
}
process.exit(exitCode);

function serving(rehearsal, servedCommit) {
  const roleLine = Object.entries(rehearsal.roles)
    .map(([role, leaseId]) => `${role} ${leaseId}`)
    .join(", ");
  const control = `node scripts/one-path-rehearsal-control.mjs --run ${output}`;
  return [
    "One-path rehearsal is serving.",
    `  Origin:        ${rehearsal.origin}`,
    `  Commit:        ${servedCommit}${overlay ? " with uncommitted changes" : ""}${namedCommit ? `, harness files from ${harnessSha}` : ""}`,
    `  Business date: ${rehearsal.businessDate} (America/Chicago), working month ${rehearsal.workingMonth}`,
    `  Sign in:       Admin: open ${rehearsal.origin}/sign-in and choose "Continue in local demo mode".`,
    `                 Editor or Approver (the local demo roles are ${ROLES.join(", ")}): on any page of that origin, from the browser console or a script, run`,
    `                 fetch("/api/auth/demo", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({role: "Editor"})})`,
    `                 then reload. Signing in as another role the same way replaces the session.`,
    `  Role leases:   ${roleLine}`,
    `  Lease page:    ${rehearsal.origin}/lease-renewal/live/desk/lease/<lease id>`,
    `  Controls:      ${control} status`,
    `                 ${control} reply | next-send <mode> | bounce | send-draft | rewording <mode> | comparisons | allowance reached|open | status-unreadable <lease id> <mode> | rentvine-outage <path>|clear | mail | refused`,
    `  Logs:          server ${files.serverLog}`,
    `                 refused connections: "${control} refused" lists them from the server (${files.networkLog}), this process (${files.harnessNetworkLog}) and a driver (${files.driverNetworkLog})`,
    `                 stand-ins ${files.standInLog}`,
    `  Description:   ${join(output, REHEARSAL_FILE)}`,
    serveSeconds > 0
      ? `  Stops by itself after ${serveSeconds} seconds, or with Ctrl+C.`
      : "  Stop with Ctrl+C.",
  ];
}

/** The local demo accounts as Auth emulator users, so a send can read back its sender. */
async function seedDemoAccounts() {
  // The hosted domain the served commit signs its local demo accounts in under.
  const domain =
    /ALLOWED_HD_DEFAULT\s*=\s*"([^"]+)"/.exec(
      readFileSync("lib/constants.ts", "utf8"),
    )?.[1] ?? "pmikcmetro.com";
  const accounts = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`;
  const emulator = async (path, body) => {
    const response = await fetch(`${accounts}${path}`, {
      method: "POST",
      // The emulator's owner token is a fixed word, not a credential.
      headers: { "content-type": "application/json", authorization: "Bearer owner" },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  for (const role of ROLES) {
    const uid = `local-demo-${role.toLowerCase()}`;
    const email = role === "Admin" ? `local-demo@${domain}` : `${uid}@${domain}`;
    const created = await emulator("", { localId: uid, email, emailVerified: true });
    // The emulator sets a role claim on an account update, as the Admin SDK does.
    const claimed = await emulator(":update", {
      localId: uid,
      customAttributes: JSON.stringify({ role }),
    });
    const read = await emulator(":lookup", { localId: [uid] });
    const account = read.body?.users?.[0];
    record({
      event: "demo-account",
      role,
      created: created.status,
      claimed: claimed.status,
      read: read.status,
    });
    assert.ok(
      account?.email === email &&
        account.emailVerified === true &&
        JSON.parse(account.customAttributes ?? "{}").role === role,
      `The Auth emulator does not hold the local demo ${role} account with its role.`,
    );
  }
}

async function startServer(port) {
  const serverHome = join(output, "server-home");
  mkdirSync(serverHome, { recursive: true });
  writeFileSync(
    join(serverHome, "synthetic-adc.json"),
    JSON.stringify({
      type: "authorized_user",
      client_id: "synthetic-rehearsal",
      client_secret: "synthetic-rehearsal",
      refresh_token: "synthetic-rehearsal",
    }),
  );
  const serverLog = createWriteStream(files.serverLog);
  const compiled = flag("--compiled");
  const next = "node_modules/next/dist/bin/next";
  const options = {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    // A from-scratch environment: no inherited account or provider variable reaches the app.
    env: {
      PATH: process.env.PATH,
      HOME: serverHome,
      GOOGLE_APPLICATION_CREDENTIALS: join(serverHome, "synthetic-adc.json"),
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      LANG: "en_US.UTF-8",
      TZ: "America/Chicago",
      NODE_OPTIONS: `--max-old-space-size=6144 --import ${join(process.cwd(), PRELOAD)}`,
      NOVDEC_JOURNEY_NETWORK_LOG: files.networkLog,
      NOVDEC_JOURNEY_OUTAGE_FLAG: files.rentvineOutage,
      ONE_PATH_REHEARSAL_MIX: join(process.cwd(), NOVEMBER_5_MIX_PATH),
      ONE_PATH_REHEARSAL_RENTVINE_CONTROL: files.rentvineControl,
      ONE_PATH_REHEARSAL_STAND_IN_ORIGIN: standIns.origin,
      NEXT_E2E_ISOLATED_BUILD: "true",
      NEXT_TELEMETRY_DISABLED: "1",
      ENVIRONMENT_KIND: "demo",
      DATA_CONTEXT: "demo",
      LOCAL_DEMO_AUTH: "true",
      // The model is the rehearsal's loopback stand-in; no hosted model is configured.
      ASK_DEMO_MODE: "false",
      MODEL_PROVIDER: "local",
      LOCAL_MODEL_BASE_URL: standIns.origin,
      LOCAL_MODEL_NAME: "rehearsal-stand-in-model",
      // Comparisons are answered by the stand-in through the provider boundary.
      MARKET_COMP_PROVIDER: "rentcast",
      RENTCAST_API_KEY: "synthetic-rehearsal-key",
      RENTCAST_MONTHLY_ALLOWANCE: String(REHEARSAL_COMPARISON_ALLOWANCE),
      // Mail is answered by the stand-in through the Demo-owned adapter, where the served
      // commit has one (lib/environment/rehearsal-stand-in.ts); --no-mail-adapter leaves it out.
      ...(mailAdapter ? { REHEARSAL_STAND_IN_ORIGIN: standIns.origin } : {}),
      APP_COMMIT_SHA: servedSha,
      FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
      FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
      FIREBASE_PROJECT_ID: PROJECT_ID,
      GOOGLE_CLOUD_PROJECT: PROJECT_ID,
      CLOUDSDK_CONFIG: join(output, "no-gcloud-config"),
      RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
      RENTVINE_API_KEY: "synthetic-rehearsal-key",
      RENTVINE_API_SECRET: "synthetic-rehearsal-secret",
      RENEWAL_SHEET_ID: "synthetic-rehearsal-sheet",
      SHEETS_IMPERSONATE_SA: "synthetic-rehearsal@example.invalid",
      SHEETS_DWD_SUBJECT: "synthetic-rehearsal@pmikcmetro.com",
      // S252: the desk's owner and tenant header filters submit opaque tokens under a key, as
      // in production; a fresh random key per run keys this disposable rehearsal only.
      RENEWAL_DESK_PARTY_FILTER_KEY: randomBytes(32).toString("base64url"),
    },
  };
  const launch = (args, runtimeEnvironment = {}) => {
    const child = spawn(process.execPath, [next, ...args], {
      ...options,
      env: { ...options.env, ...runtimeEnvironment },
    });
    child.stdout.pipe(serverLog, { end: false });
    child.stderr.pipe(serverLog, { end: false });
    return child;
  };
  if (compiled) {
    const build = () =>
      new Promise((resolve, reject) => {
        const child = launch(["build"]);
        child.once("error", reject);
        child.once("exit", (code) =>
          code === 0
            ? resolve()
            : reject(new Error(`Guarded production build failed: ${files.serverLog}`)),
        );
      });
    if (compiledMail) await compiledMail.build(build);
    else await build();
    record({
      event: "compiled",
      source: servedSha,
      compiledMail: compiledMail?.identity ?? null,
      buildId: readFileSync("temp/e2e/.next/BUILD_ID", "utf8").trim(),
    });
  }
  const serve = [compiled ? "start" : "dev", "-p", String(port), "-H", "127.0.0.1"];
  relaunchServer = () => launch(serve, compiledMail?.environment);
  const child = launch(serve, compiledMail?.environment);
  record({ event: "server-started", pid: child.pid, port });
  return child;
}

/**
 * S284 R-S284-4: while a driver runs, it may ask for the server to be started again, so a replay
 * or a journey starts on a server that remembers nothing of an earlier one (its comparison cache,
 * its last RentVine read). The build is never made again: a compiled run serves the same output,
 * whose build id the "compiled" event records, with the same environment; a development run starts
 * the development server again. The driver writes files.serverRestartRequest with a nonce; the
 * answer in files.serverRestartAnswer carries that nonce, the new server's pid and whether it is
 * ready. The emulators, the stand-ins and the run directory are untouched.
 */
function answerServerRestarts(origin) {
  let busy = false;
  const answer = async () => {
    let nonce = null;
    try {
      nonce = JSON.parse(readFileSync(files.serverRestartRequest, "utf8")).nonce ?? null;
    } catch {
      nonce = null;
    }
    rmSync(files.serverRestartRequest, { force: true });
    const reply = { nonce, at: new Date().toISOString() };
    try {
      assert.ok(
        relaunchServer,
        "The server was never started, so it cannot start again.",
      );
      await stopServer();
      server = relaunchServer();
      await waitForServer(origin);
      Object.assign(reply, { ready: true, pid: server.pid });
    } catch (error) {
      Object.assign(reply, {
        ready: false,
        error: String(error?.message ?? error).slice(0, 400),
      });
    }
    record({ event: "server-restarted", ...reply });
    writeFileSync(`${files.serverRestartAnswer}.new`, `${JSON.stringify(reply)}\n`, {
      mode: 0o600,
    });
    renameSync(`${files.serverRestartAnswer}.new`, files.serverRestartAnswer);
  };
  const timer = setInterval(() => {
    if (busy || !existsSync(files.serverRestartRequest)) return;
    busy = true;
    answer().finally(() => {
      busy = false;
    });
  }, 500);
  return () => clearInterval(timer);
}

async function waitForServer(base) {
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    assert.ok(
      server && server.exitCode === null && !server.signalCode,
      `The local dev server exited before readiness; see ${files.serverLog}.`,
    );
    try {
      const response = await fetch(`${base}/sign-in`, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // not listening yet
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`The local dev server did not become ready; see ${files.serverLog}.`);
}

async function stopServer() {
  if (!server) return;
  const child = server;
  server = null;
  const signal = (name) => {
    try {
      process.kill(-child.pid, name);
    } catch {
      child.kill(name);
    }
  };
  signal("SIGTERM");
  await new Promise((done) => setTimeout(done, 2000));
  signal("SIGKILL");
}

async function signIn(page, base, role) {
  await page.goto(`${base}/sign-in`, { waitUntil: "domcontentloaded" });
  const ok = await page.evaluate(
    (name) =>
      fetch("/api/auth/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: name }),
      }).then((response) => response.ok),
    role,
  );
  assert.ok(ok, `Local demo ${role} sign-in failed.`);
}

/** Run the driver file under the same provider boundary, with the rehearsal named in its environment. */
function runDriver(rehearsal) {
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      ["--import", `./${PRELOAD}`, driver, ...driverArgs],
      {
        stdio: "inherit",
        // Named variables only: the driver gets the browser location, the rehearsal's origin, its
        // run directory and the emulators, and no credential or provider variable.
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TMPDIR: process.env.TMPDIR ?? "/tmp",
          LANG: "en_US.UTF-8",
          TZ: "America/Chicago",
          ...Object.fromEntries(
            [
              "PLAYWRIGHT_CHROME_PATH",
              "DESK_BROWSER_EXECUTABLE",
              "PLAYWRIGHT_BROWSERS_PATH",
            ]
              .filter((name) => process.env[name])
              .map((name) => [name, process.env[name]]),
          ),
          NOVDEC_JOURNEY_NETWORK_LOG: files.driverNetworkLog,
          ONE_PATH_REHEARSAL_ORIGIN: rehearsal.origin,
          ONE_PATH_REHEARSAL_RUN_DIR: output,
          ...(compiledMail ? { S260_SYNTHETIC_WORKER_TOKEN: compiledMail.token } : {}),
          FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
          FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
          FIREBASE_PROJECT_ID: PROJECT_ID,
          GOOGLE_CLOUD_PROJECT: PROJECT_ID,
        },
      },
    );
    child.on("exit", (code, signalName) => done(code ?? (signalName ? 1 : 0)));
    child.on("error", () => done(1));
  });
}

function freePort() {
  return new Promise((done) => {
    const socket = createServer();
    socket.listen(0, "127.0.0.1", () => {
      const { port } = socket.address();
      socket.close(() => done(port));
    });
  });
}
