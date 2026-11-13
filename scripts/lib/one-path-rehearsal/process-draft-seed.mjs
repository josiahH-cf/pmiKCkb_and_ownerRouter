// S284 W12-14, harness only: give the rehearsal one renewal process definition, the Draft with
// placeholder staff that production's process seed (scripts/seed-process-definitions.ts) writes.
// The rehearsal otherwise seeds no process definitions, so a renewal Space would show no run
// control at all. This writes the rehearsal's own Firestore emulator through the served commit's
// own seed writer, in a separate process with the rehearsal's environment by name, under the same
// network boundary (process-draft-seed-run.ts). No route, provider or production store is used.
//
// runProcessHarness makes, the same way, the other starting states the W12-14 candidate checks
// read and no staff control makes (process-draft-seed-run.ts names each operation).
import { spawn } from "node:child_process";
import { join } from "node:path";

const LOOPBACK_HOST = /^127\.0\.0\.1:\d{1,5}$/;
const PRELOAD = "tests/browser/renewal-novdec-journey-network.mjs";
const RUN = "scripts/lib/one-path-rehearsal/process-draft-seed-run.ts";
export const RENEWAL_PROCESS_DRAFTS = Object.freeze([
  "owner-renewal-outreach",
  "tenant-renewal-notice",
  "lease-renewal",
]);
export const PROCESS_HARNESS_OPERATIONS = Object.freeze([
  "seed",
  "record-staff",
  "publish",
  "rollback",
  "earlier-run",
  "retire",
  "card-states",
]);

/** Run the seed process with the rehearsal's environment and one instruction; resolves its JSON. */
async function runSeedProcess(rehearsal, instruction) {
  if (!LOOPBACK_HOST.test(String(rehearsal.firestoreEmulatorHost)))
    throw new Error("The rehearsal's Firestore emulator is not on 127.0.0.1.");
  if (!/^pmi-kc-kb-[a-z0-9-]+-test$/.test(String(rehearsal.projectId)))
    throw new Error("The rehearsal's emulator project is not a rehearsal test project.");
  const output = await new Promise((done, fail) => {
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
        ...instruction,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", fail);
    child.on("exit", (code) =>
      code === 0
        ? done(stdout)
        : fail(new Error(`The process draft seed exited ${code}: ${stderr.slice(-800)}`)),
    );
  });
  return JSON.parse(output.trim().split("\n").at(-1) ?? "{}");
}

/** Write one renewal process Draft; resolves with `{ id, action }` from the seed writer. */
export async function seedRenewalProcessDraft(rehearsal, definitionId) {
  if (!RENEWAL_PROCESS_DRAFTS.includes(definitionId))
    throw new Error(`Choose one of: ${RENEWAL_PROCESS_DRAFTS.join(", ")}.`);
  return runSeedProcess(rehearsal, { ONE_PATH_PROCESS_DRAFT: definitionId });
}

/**
 * One harness operation on the rehearsal's process records, through the served commit's own
 * services: { op: "seed", definitionId, staff: "placeholder" | "real" }, { op: "record-staff",
 * definitionId }, { op: "publish", definitionId }, { op: "rollback", definitionId,
 * targetVersionId }, { op: "earlier-run", definitionId, runId }, { op: "retire", definitionId }
 * or { op: "card-states" }. Resolves with what the operation wrote or read.
 */
export async function runProcessHarness(rehearsal, operation) {
  if (!PROCESS_HARNESS_OPERATIONS.includes(operation?.op))
    throw new Error(`Choose one of: ${PROCESS_HARNESS_OPERATIONS.join(", ")}.`);
  return runSeedProcess(rehearsal, {
    ONE_PATH_PROCESS_OPERATION: JSON.stringify(operation),
  });
}
