#!/usr/bin/env node
// Runner-local forward-effect authority. Missing state is a hold; no cloud or auth call occurs here.
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertReleaseProcessLock } from "./release-lock.mjs";
import { isAuthenticationOnlyHold } from "./release-watcher-plan.mjs";

export const RELEASE_PERMIT_SCHEMA = "pmi-kc-release-permit.v1";
export const RELEASE_PREFLIGHT_MAX_AGE_MS = 5 * 60_000;
export const RELEASE_PERMIT_MAX_AGE_MS = 6 * 60 * 60_000;
export const defaultReleaseStateRoot = () =>
  join(homedir(), ".local", "state", "pmi-kc-release");
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHA = /^[a-f0-9]{40}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const KEYS = [
  "schemaVersion",
  "runId",
  "sha",
  "state",
  "preparedAt",
  "expiresAt",
  "admission",
  "reason",
];

export function releaseHead(root = ROOT) {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (!SHA.test(sha)) throw new Error("release_exact_head_required");
  return sha;
}

export function releaseCheckTarget(checkpoint, currentHead) {
  const pinned =
    checkpoint && checkpoint.phase !== "complete" && !checkpoint.terminalFailure
      ? checkpoint
      : null;
  return { sha: pinned?.sha ?? currentHead(), runId: pinned?.runId };
}

export function assertNativeReleaseRuntime(command = process.env.GCLOUD_BIN ?? "gcloud") {
  if (
    process.platform !== "linux" ||
    !process.versions.node.startsWith("22.") ||
    !["gcloud", "/snap/google-cloud-cli/current/bin/gcloud"].includes(command)
  )
    throw new Error("native_release_runtime_required");
  const resolved = execFileSync("which", [command], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (resolved !== "/snap/google-cloud-cli/current/bin/gcloud")
    throw new Error("native_snap_gcloud_required");
}

export function assertReleasePermit(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !KEYS.includes(key)) ||
    KEYS.some((key) => !(key in value)) ||
    value.schemaVersion !== RELEASE_PERMIT_SCHEMA ||
    !UUID.test(value.runId) ||
    !SHA.test(value.sha) ||
    !["prepared", "admitted", "held", "consumed"].includes(value.state) ||
    !Number.isFinite(Date.parse(value.preparedAt)) ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    Date.parse(value.expiresAt) <= Date.parse(value.preparedAt) ||
    Date.parse(value.expiresAt) - Date.parse(value.preparedAt) >
      RELEASE_PERMIT_MAX_AGE_MS ||
    (value.reason !== null &&
      (typeof value.reason !== "string" || value.reason.length > 160)) ||
    (value.admission !== null &&
      (!value.admission ||
        Object.keys(value.admission).sort().join(",") !== "checkedAt,preflightHash" ||
        !Number.isFinite(Date.parse(value.admission.checkedAt)) ||
        !/^[a-f0-9]{64}$/.test(value.admission.preflightHash))) ||
    (value.state === "admitted" && value.admission === null)
  ) {
    throw new Error("release_permit_invalid");
  }
  return Object.freeze(value);
}

export function readReleasePermit(stateRoot = defaultReleaseStateRoot()) {
  try {
    return assertReleasePermit(
      JSON.parse(readFileSync(join(stateRoot, "release-permit.json"), "utf8")),
    );
  } catch {
    throw new Error("release_held_permit_unavailable");
  }
}

/** Atomic durable replacement. Caller owns release.lock for every authority transition. */
export function writeReleasePermit(value, stateRoot = defaultReleaseStateRoot()) {
  assertReleasePermit(value);
  mkdirSync(stateRoot, { recursive: true, mode: 0o700 });
  const path = join(stateRoot, "release-permit.json");
  const temporary = `${path}.${randomUUID()}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  if (process.platform !== "win32") {
    const dir = openSync(stateRoot, "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
  }
  return readReleasePermit(stateRoot);
}

export function prepareReleasePermit(sha, nowMs = Date.now(), runId = randomUUID()) {
  return assertReleasePermit({
    schemaVersion: RELEASE_PERMIT_SCHEMA,
    runId,
    sha,
    state: "prepared",
    preparedAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + RELEASE_PERMIT_MAX_AGE_MS).toISOString(),
    admission: null,
    reason: null,
  });
}

export function assertReleaseAdmission({
  sha,
  runId,
  stateRoot = defaultReleaseStateRoot(),
  nowMs = Date.now(),
  prepared = false,
  permit = readReleasePermit(stateRoot),
}) {
  assertReleasePermit(permit);
  if (permit.sha !== sha || (runId && permit.runId !== runId))
    throw new Error("release_permit_target_mismatch");
  if (
    Date.parse(permit.preparedAt) > nowMs + 30_000 ||
    (permit.state === "prepared" && Date.parse(permit.expiresAt) <= nowMs)
  )
    throw new Error("release_permit_expired");
  if (!(permit.state === "admitted" || (prepared && permit.state === "prepared")))
    throw new Error("release_held_not_admitted");
  return permit;
}

export function admitReleasePermit(permit, preflight, nowMs = Date.now()) {
  assertReleaseAdmission({
    sha: permit.sha,
    runId: permit.runId,
    permit,
    nowMs,
    prepared: true,
  });
  if (
    permit.state !== "prepared" ||
    preflight.verdict !== "go" ||
    preflight.headSha !== permit.sha ||
    preflight.watcherTargetSha !== permit.sha ||
    !Number.isSafeInteger(preflight.batchSize) ||
    preflight.batchSize < 1 ||
    preflight.runId !== permit.runId ||
    !Number.isFinite(Date.parse(preflight.checkedAt)) ||
    Date.parse(preflight.checkedAt) > nowMs ||
    nowMs - Date.parse(preflight.checkedAt) > RELEASE_PREFLIGHT_MAX_AGE_MS ||
    !Array.isArray(preflight.checks) ||
    preflight.checks.length === 0 ||
    preflight.checks.some((check) => check.state !== "ready")
  ) {
    throw new Error("release_fresh_preflight_required");
  }
  return assertReleasePermit({
    ...permit,
    state: "admitted",
    admission: {
      checkedAt: preflight.checkedAt,
      preflightHash: createHash("sha256").update(JSON.stringify(preflight)).digest("hex"),
    },
  });
}

export function consumeReleasePermit({
  sha,
  runId,
  stateRoot = defaultReleaseStateRoot(),
}) {
  const permit = readReleasePermit(stateRoot);
  if (permit.sha !== sha || permit.runId !== runId)
    throw new Error("release_permit_target_mismatch");
  if (permit.state === "consumed") return permit;
  return writeReleasePermit(
    { ...permit, state: "consumed", reason: "run_complete" },
    stateRoot,
  );
}

export async function claimApplicationBuild({
  sha,
  runId,
  revision,
  stateRoot = defaultReleaseStateRoot(),
  assertLock = () => assertReleaseProcessLock({ stateRoot }),
}) {
  assertLock();
  assertReleaseAdmission({ sha, runId, stateRoot });
  assertReleaseCheckpoint({ sha, runId, revision, phases: ["deploy"], stateRoot });
  const { writeReceipt } = await import("./production-assurance-receipts.mjs");
  assertLock();
  writeReceipt(join(stateRoot, `application-build-${runId}.json`), {
    runId,
    sha,
    revision,
    claimedAt: new Date().toISOString(),
  });
}

export function assertReleaseCheckpoint({
  sha,
  runId,
  revision,
  phases,
  stateRoot = defaultReleaseStateRoot(),
}) {
  let checkpoint;
  try {
    checkpoint = JSON.parse(readFileSync(join(stateRoot, "checkpoint.json"), "utf8"));
  } catch {
    throw new Error("exact_batch_checkpoint_required");
  }
  if (
    checkpoint.runId !== runId ||
    checkpoint.sha !== sha ||
    (revision !== undefined && checkpoint.revision !== revision) ||
    !phases.includes(checkpoint.phase) ||
    checkpoint.inFlight !== checkpoint.phase
  )
    throw new Error("exact_batch_checkpoint_required");
  return checkpoint;
}

export async function interruptedPromotionNeedsRecovery(
  checkpoint,
  stateRoot = defaultReleaseStateRoot(),
) {
  if (!checkpoint || checkpoint.phase !== "promote" || checkpoint.inFlight !== "promote")
    return false;
  const { readAssuranceReceiptForRecovery, candidateAssuranceWasClaimed } =
    await import("./production-assurance-receipts.mjs");
  const path = join(stateRoot, `candidate-${checkpoint.revision}.json`);
  try {
    const receipt = readAssuranceReceiptForRecovery(path, {
      expectedCommit: checkpoint.sha,
      expectedRevision: checkpoint.revision,
    });
    return (
      receipt.recoveryBaseline?.runId === checkpoint.runId &&
      candidateAssuranceWasClaimed(receipt)
    );
  } catch {
    return false;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const stateRoot = defaultReleaseStateRoot();
  if (argv.length === 1 && argv[0] === "--check") {
    let checkpoint;
    try {
      checkpoint = JSON.parse(readFileSync(join(stateRoot, "checkpoint.json"), "utf8"));
    } catch {
      /* no recovery authority */
    }
    if (checkpoint?.operatorResumeRequired && !isAuthenticationOnlyHold(checkpoint))
      throw new Error("release_operator_resume_required");
    if (
      checkpoint?.rollback ||
      (await interruptedPromotionNeedsRecovery(checkpoint, stateRoot))
    ) {
      const { readRecoveryBaseline } = await import("./release-recovery.mjs");
      readRecoveryBaseline(checkpoint.recoveryBaseline, {
        runId: checkpoint.runId,
        sha: checkpoint.sha,
      });
      process.stdout.write(
        JSON.stringify({
          state: "receipt_bound_recovery",
          sha: checkpoint.sha,
          runId: checkpoint.runId,
        }) + "\n",
      );
      return;
    }
    const target = releaseCheckTarget(checkpoint, () => releaseHead());
    const permit = assertReleaseAdmission({
      ...target,
      stateRoot,
    });
    process.stdout.write(
      JSON.stringify({ state: permit.state, sha: permit.sha, runId: permit.runId }) +
        "\n",
    );
    return;
  }
  if (
    process.platform !== "linux" ||
    argv.length !== 1 ||
    !["--prepare", "--admit-and-watch", "--resume", "--hold"].includes(argv[0])
  )
    throw new Error("release_control_argument_invalid");
  const { acquireWatcherLock } = await import("./release-lock.mjs");
  const unlock = await acquireWatcherLock(stateRoot);
  try {
    if (argv[0] === "--resume") {
      const checkpoint = JSON.parse(
        readFileSync(join(stateRoot, "checkpoint.json"), "utf8"),
      );
      if (
        !checkpoint.operatorResumeRequired ||
        checkpoint.terminalFailure ||
        checkpoint.phase === "complete"
      )
        throw new Error("release_resume_not_required");
      if (
        checkpoint.rollback ||
        (await interruptedPromotionNeedsRecovery(checkpoint, stateRoot))
      ) {
        const { readRecoveryBaseline } = await import("./release-recovery.mjs");
        readRecoveryBaseline(checkpoint.recoveryBaseline, {
          runId: checkpoint.runId,
          sha: checkpoint.sha,
        });
      } else
        assertReleaseAdmission({
          sha: checkpoint.sha,
          runId: checkpoint.runId,
          stateRoot,
        });
      const { main: watch } = await import("./release-watcher.mjs");
      await watch(["--watch"], { heldUnlock: unlock, operatorResume: true });
      return;
    }
    let permit;
    if (argv[0] === "--prepare") {
      const checkpoint = (() => {
        try {
          return JSON.parse(readFileSync(join(stateRoot, "checkpoint.json"), "utf8"));
        } catch {
          return null;
        }
      })();
      if (checkpoint && checkpoint.phase !== "complete" && !checkpoint.terminalFailure)
        throw new Error("release_inflight_reconciliation_required");
      permit = writeReleasePermit(prepareReleasePermit(releaseHead()), stateRoot);
    } else if (argv[0] === "--hold") {
      permit = readReleasePermit(stateRoot);
      permit = writeReleasePermit(
        { ...permit, state: "held", reason: "operator_hold" },
        stateRoot,
      );
    } else {
      permit = readReleasePermit(stateRoot);
      assertNativeReleaseRuntime();
      const { collectReleasePrerequisites } = await import("./release-prerequisites.mjs");
      const { receipt: prerequisite } = await collectReleasePrerequisites({
        assertHeld: unlock.assertHeld,
        root: ROOT,
        stateDir: stateRoot,
        permit,
      });
      const { evaluateBatchPreflight, gatherBatchPreflight } =
        await import("./release-batch-preflight.mjs");
      // Admission itself reads the live preflight under this lock. A caller cannot submit GO JSON.
      const preflight = evaluateBatchPreflight(
        gatherBatchPreflight({ stateRoot, permit, prerequisite, lockOwned: true }),
      );
      unlock.assertHeld();
      permit = writeReleasePermit(admitReleasePermit(permit, preflight), stateRoot);
    }
    process.stdout.write(
      JSON.stringify({ state: permit.state, sha: permit.sha, runId: permit.runId }) +
        "\n",
    );
    if (argv[0] === "--admit-and-watch") {
      const { main: watch } = await import("./release-watcher.mjs");
      await watch(["--watch"], { heldUnlock: unlock });
    }
  } finally {
    await unlock();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    process.stderr.write("Release held: valid exact-run admission is required.\n");
    process.exitCode = 2;
  });
