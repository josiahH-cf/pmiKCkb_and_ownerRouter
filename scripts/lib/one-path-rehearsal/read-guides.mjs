// S252 R-S252-1 / L24 / L61, harness only: read the served commit's in-app help guides as data.
// It runs read-guides-run.ts with tsx in a child node process of the rehearsal's served tree
// (the starting commit's tree on a `--commit` run). The rehearsal's network boundary loads in
// that process through NODE_OPTIONS, as on the rehearsal server, and the child refuses to read
// anything unless the boundary is active in its own process. Its environment is named variables
// only: no credential, account or provider variable reaches it.
import { spawn } from "node:child_process";
import { join } from "node:path";

const PRELOAD = "tests/browser/renewal-novdec-journey-network.mjs";
const READER = "scripts/lib/one-path-rehearsal/read-guides-run.ts";

/**
 * Run one harness TypeScript file with tsx in a child node process, the rehearsal's network
 * boundary loaded there through NODE_OPTIONS (the child checks it before it does anything), with
 * named variables only. Resolves with the child's last stdout line as JSON.
 */
export function runGuardedTsx(rehearsal, script, extraEnv = {}) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", script], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: join(rehearsal.runDir, "server-home"),
        TMPDIR: process.env.TMPDIR ?? "/tmp",
        LANG: "en_US.UTF-8",
        TZ: "America/Chicago",
        NODE_ENV: "development",
        NODE_OPTIONS: `--import ${join(process.cwd(), PRELOAD)}`,
        NOVDEC_JOURNEY_NETWORK_LOG: rehearsal.files.driverNetworkLog,
        ...extraEnv,
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", fail);
    child.on("exit", (code) => {
      if (code !== 0)
        return fail(new Error(`${script} exited ${code}: ${stderr.slice(-800)}`));
      try {
        done(JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}"));
      } catch (error) {
        fail(error);
      }
    });
  });
}

/** Resolves with { version, guides: [{ id, title, steps: [...] }] } from the served tree. */
export function readServedGuides(rehearsal) {
  return runGuardedTsx(rehearsal, READER);
}

/** One guide step by `guide#step`, or null. */
export function guideStep(manual, ref) {
  const [guideId, stepId] = ref.split("#");
  const guide = manual.guides.find((entry) => entry.id === guideId);
  const step = guide?.steps.find((entry) => entry.id === stepId) ?? null;
  return step ? { ...step, guide: guideId, ref } : null;
}

/**
 * The kickoff as a guide teaches it: the steps of `guideId` from its first step up to and
 * including its first step that sends (effect "explicit-send"). Null when the guide has no send.
 */
export function kickoffSteps(manual, guideId = "work-a-renewal") {
  const guide = manual.guides.find((entry) => entry.id === guideId);
  if (!guide) return null;
  const end = guide.steps.findIndex((step) => step.effect === "explicit-send");
  if (end < 0) return null;
  return guide.steps
    .slice(0, end + 1)
    .map((step) => ({ ...step, guide: guideId, ref: `${guideId}#${step.id}` }));
}
