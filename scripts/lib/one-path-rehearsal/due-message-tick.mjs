// S248 L39, harness only: one in-process tick of the app's own due-message worker against the
// rehearsal's Firestore emulator and mail stand-in. The worker route accepts only a Google-signed
// token, which a rehearsal cannot mint; this never calls that route and never changes its check.
// It runs the same worker function the route runs (lib/gmail-hub/sequence-worker.ts), in a
// separate process with the rehearsal server's Demo environment, under the same provider
// boundary, so a send reaches only the mail stand-in.
//
// To make a scheduled message due now without waiting for its date, the tick first moves that one
// message's due time to the present in the emulator (a harness change to emulator state, never a
// product write path). Every address it calls is checked to be 127.0.0.1.
import { spawn } from "node:child_process";
import { join } from "node:path";

const LOOPBACK_HOST = /^127\.0\.0\.1:\d{1,5}$/;
const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1:\d{1,5}$/;
const PRELOAD = "tests/browser/renewal-novdec-journey-network.mjs";
const TICK = "scripts/lib/one-path-rehearsal/due-message-tick-run.ts";

async function makeDue(rehearsal, sequenceId) {
  if (!LOOPBACK_HOST.test(rehearsal.firestoreEmulatorHost))
    throw new Error("The rehearsal's Firestore emulator is not on 127.0.0.1.");
  if (!/^[0-9a-f-]{36}$/.test(String(sequenceId)))
    throw new Error("Name the scheduled message by its id.");
  const url =
    `http://${rehearsal.firestoreEmulatorHost}/v1/projects/${rehearsal.projectId}` +
    `/databases/(default)/documents/gmail_communication_sequences/${sequenceId}` +
    "?updateMask.fieldPaths=nextDueAtMs";
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json", authorization: "Bearer owner" },
    body: JSON.stringify({
      fields: { nextDueAtMs: { integerValue: String(Date.now() - 1000) } },
    }),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`The emulator refused the due time (HTTP ${response.status}).`);
}

/** Run one worker tick; resolves with the worker's own counts. */
export async function runDueMessageTick(rehearsal, { sequenceId } = {}) {
  if (!LOOPBACK_ORIGIN.test(String(rehearsal.standInOrigin)))
    throw new Error("The rehearsal's mail stand-in is not on 127.0.0.1.");
  if (sequenceId) await makeDue(rehearsal, sequenceId);
  const output = await new Promise((done, fail) => {
    const child = spawn(
      process.execPath,
      ["--import", `./${PRELOAD}`, "node_modules/tsx/dist/cli.mjs", TICK],
      {
        stdio: ["ignore", "pipe", "pipe"],
        // The rehearsal server's Demo environment, by name, and nothing inherited.
        env: {
          PATH: process.env.PATH,
          HOME: join(rehearsal.runDir, "server-home"),
          TMPDIR: process.env.TMPDIR ?? "/tmp",
          TZ: "America/Chicago",
          NODE_ENV: "development",
          NOVDEC_JOURNEY_NETWORK_LOG: rehearsal.files.harnessNetworkLog,
          NOVDEC_JOURNEY_OUTAGE_FLAG: rehearsal.files.rentvineOutage,
          ONE_PATH_REHEARSAL_RENTVINE_CONTROL: rehearsal.files.rentvineControl,
          ONE_PATH_REHEARSAL_MIX: join(
            process.cwd(),
            "tests/fixtures/lease-renewal/november-5-mix.json",
          ),
          ONE_PATH_REHEARSAL_STAND_IN_ORIGIN: rehearsal.standInOrigin,
          ENVIRONMENT_KIND: "demo",
          DATA_CONTEXT: "demo",
          LOCAL_DEMO_AUTH: "true",
          REHEARSAL_STAND_IN_ORIGIN: rehearsal.standInOrigin,
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
          RENTVINE_API_BASE_URL: "https://pmikcmetro.rentvine.com/api/manager",
          RENTVINE_API_KEY: "synthetic-rehearsal-key",
          RENTVINE_API_SECRET: "synthetic-rehearsal-secret",
          RENEWAL_SHEET_ID: "synthetic-rehearsal-sheet",
        },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0
        ? done(stdout)
        : fail(new Error(`The tick exited ${code}: ${stderr.slice(-800)}`)),
    );
  });
  const line = output.trim().split("\n").at(-1) ?? "{}";
  return JSON.parse(line);
}
