// S284 W12-03, harness only: another instance of the app reading RentVine, as production's other
// Cloud Run instances do. The rehearsal serves one instance, so a lease read in flight elsewhere
// (S274's "read still in progress") never happens in it by itself. This starts a separate process
// (lease-reads-elsewhere-run.ts) that keeps admitting lease reads through the served commit's own
// notice admission (`withRenewalNoticeAdmission`), the step every provider read takes before it
// starts: each admission raises the notice markers' read floors, so a read the server or the
// worker makes meanwhile is superseded before it settles. It reads no provider and sends nothing;
// it writes only the rehearsal's own Firestore emulator (127.0.0.1, a rehearsal test project),
// with the rehearsal server's environment by name, under the same network boundary.
//
//   const elsewhere = await startLeaseReadsElsewhere(rehearsal);   // admitting until stopped
//   ...                                                           // confirm, or tick the worker
//   const { admissions } = await elsewhere.stop();                 // the reads have settled
import { spawn } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOOPBACK_HOST = /^127\.0\.0\.1:\d{1,5}$/;
const TEST_PROJECT = /^pmi-kc-kb-[a-z0-9-]+-test$/;
const PRELOAD = "tests/browser/renewal-novdec-journey-network.mjs";
const RUN = "scripts/lib/one-path-rehearsal/lease-reads-elsewhere-run.ts";
/** The other instance admits one lease read this often. */
export const ELSEWHERE_INTERVAL_MS = 250;
/** It stops by itself after this long, whatever the caller does. */
export const ELSEWHERE_MAX_SECONDS = 300;

/**
 * Start the other instance; resolves once its first admission landed, with `stop()`, which ends
 * it and resolves with its counts (admissions made, admissions refused).
 */
export async function startLeaseReadsElsewhere(
  rehearsal,
  { intervalMs = ELSEWHERE_INTERVAL_MS, maxSeconds = ELSEWHERE_MAX_SECONDS } = {},
) {
  if (!LOOPBACK_HOST.test(String(rehearsal.firestoreEmulatorHost)))
    throw new Error("The rehearsal's Firestore emulator is not on 127.0.0.1.");
  if (!TEST_PROJECT.test(String(rehearsal.projectId)))
    throw new Error("The rehearsal's emulator project is not a rehearsal test project.");
  const stopFile = join(rehearsal.runDir, `lease-reads-elsewhere-${process.pid}.stop`);
  rmSync(stopFile, { force: true });
  const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", RUN], {
    stdio: ["ignore", "pipe", "pipe"],
    // The rehearsal server's Demo environment, by name, and nothing inherited.
    env: {
      PATH: process.env.PATH,
      HOME: join(rehearsal.runDir, "server-home"),
      TMPDIR: process.env.TMPDIR ?? "/tmp",
      LANG: "en_US.UTF-8",
      TZ: "America/Chicago",
      NODE_ENV: "development",
      NODE_OPTIONS: `--import ${join(process.cwd(), PRELOAD)}`,
      NOVDEC_JOURNEY_NETWORK_LOG: rehearsal.files.harnessNetworkLog,
      ENVIRONMENT_KIND: "demo",
      DATA_CONTEXT: "demo",
      LOCAL_DEMO_AUTH: "true",
      APP_COMMIT_SHA: rehearsal.servedCommit,
      FIRESTORE_EMULATOR_HOST: rehearsal.firestoreEmulatorHost,
      FIREBASE_AUTH_EMULATOR_HOST: rehearsal.authEmulatorHost,
      FIREBASE_PROJECT_ID: rehearsal.projectId,
      GOOGLE_CLOUD_PROJECT: rehearsal.projectId,
      GOOGLE_APPLICATION_CREDENTIALS: join(
        rehearsal.runDir,
        "server-home",
        "synthetic-adc.json",
      ),
      CLOUDSDK_CONFIG: join(rehearsal.runDir, "no-gcloud-config"),
      ONE_PATH_ELSEWHERE_STOP: stopFile,
      ONE_PATH_ELSEWHERE_INTERVAL_MS: String(Math.max(50, Number(intervalMs) || 0)),
      ONE_PATH_ELSEWHERE_MAX_SECONDS: String(Math.max(1, Number(maxSeconds) || 0)),
    },
  });
  let stdout = "";
  let stderr = "";
  const exited = new Promise((done) => {
    child.on("error", (error) =>
      done({ code: 1, error: String(error?.message ?? error) }),
    );
    child.on("exit", (code) => done({ code }));
  });
  const ready = new Promise((done, fail) => {
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (/"ready":true/.test(stdout)) done();
    });
    child.stderr.on("data", (chunk) => (stderr += chunk));
    exited.then(({ code, error }) =>
      fail(
        new Error(
          `The other instance stopped before its first admission (exit ${code}): ${error ?? stderr.slice(-800)}`,
        ),
      ),
    );
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), 180_000);
  try {
    await ready;
  } finally {
    clearTimeout(timer);
  }
  let stopped = null;
  return {
    async stop() {
      stopped ??= (async () => {
        writeFileSync(stopFile, "stop\n");
        const kill = setTimeout(() => child.kill("SIGTERM"), 30_000);
        const { code } = await exited;
        clearTimeout(kill);
        if (existsSync(stopFile)) rmSync(stopFile, { force: true });
        const line =
          stdout
            .trim()
            .split("\n")
            .filter((entry) => entry.includes('"admissions"'))
            .at(-1) ?? "{}";
        let counts = {};
        try {
          counts = JSON.parse(line);
        } catch {
          counts = {};
        }
        return { exit: code, ...counts, ...(code ? { error: stderr.slice(-600) } : {}) };
      })();
      return stopped;
    },
  };
}
