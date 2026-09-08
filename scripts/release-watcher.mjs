#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { GoogleAuth } from "google-auth-library";
import { ensureAuthenticated } from "./auth/ensure.mjs";
import { resolveMonitoringConfig } from "./setup-monitoring.mjs";
import { resolveBrowserExecutable } from "./lib/browser-executable.mjs";
import {
  advanceRelease,
  evaluateRelease,
  browserEnrollmentChanged,
} from "./release-watcher-plan.mjs";
import { browserEnrollmentVersion } from "./auth/browser-enrollment.mjs";
import {
  readCandidateAssuranceReceipt,
  readPromotionReceipt,
} from "./production-assurance-receipts.mjs";
import { createDeployRevisionSuffix } from "./deploy-demo-cloud-run.mjs";
import { terminateReleaseProcessTree } from "./release.mjs";

const SOURCE = dirname(dirname(fileURLToPath(import.meta.url)));
const REPOSITORY = "josiahH-cf/pmiKCkb_and_ownerRouter";
const PROJECT = "pmi-kc-kb-prod",
  REGION = "us-central1",
  SERVICE = "pmi-kc-app";
const CANONICAL = "https://pmi-kc-app-kq6wuvpiva-uc.a.run.app";
const INITIAL_CANDIDATE_HOST =
  "cand-rmtq71kjl-bff41bbdb5fa---pmi-kc-app-kq6wuvpiva-uc.a.run.app";
const COORDINATES = [
  `--project=${PROJECT}`,
  `--region=${REGION}`,
  `--service=${SERVICE}`,
];
const GH = existsSync("/mnt/c/Program Files/GitHub CLI/gh.exe")
  ? "/mnt/c/Program Files/GitHub CLI/gh.exe"
  : "gh";

// Child output is held only in memory. No provider body, build environment, or credential is logged.
export function command(
  bin,
  args,
  { cwd = SOURCE, env = process.env, timeoutMs = 120_000 } = {},
) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(bin, args, {
      cwd,
      env: { ...env, CLOUDSDK_CORE_DISABLE_PROMPTS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let stdout = "",
      settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult(result);
    };
    const timer = setTimeout(async () => {
      try {
        await terminateReleaseProcessTree(child);
      } catch {
        /* exact provider readback decides */
      }
      finish({ status: null, stdout: "", timedOut: true });
    }, timeoutMs);
    child.stdout.on("data", (data) => {
      if (stdout.length < 16 * 1024 * 1024) stdout += data;
    });
    child.stderr.resume();
    child.on("error", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error("release_command_unavailable"));
      }
    });
    child.on("close", (status) => finish({ status, stdout }));
  });
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("release_readback_invalid");
  }
}
function writeState(path, state) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, path);
}
function readState(path) {
  return existsSync(path) ? parseJson(readFileSync(path, "utf8")) : null;
}
// flock is released by the kernel on exit/reboot, including an interrupted watcher. No PID
// guessing or stale-lock deletion can let two release processes run together.
export async function acquireWatcherLock(root) {
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return new Promise((resolveLock, reject) => {
    const child = spawn(
      "flock",
      [
        "--nonblock",
        join(root, "release.lock"),
        process.execPath,
        "-e",
        'process.stdout.write("locked"); process.stdin.resume();',
      ],
      { stdio: ["pipe", "pipe", "ignore"] },
    );
    let locked = false;
    child.once("error", () => reject(new Error("release_lock_unavailable")));
    child.once("close", () => {
      if (!locked) reject(new Error("release_watcher_already_running"));
    });
    child.stdout.once("data", () => {
      locked = true;
      resolveLock(
        () =>
          new Promise((resolveUnlock) => {
            child.once("close", resolveUnlock);
            child.stdin.end();
          }),
      );
    });
  });
}

function traffic(service) {
  return (service.status?.traffic ?? [])
    .filter((x) => (x.percent ?? 0) > 0)
    .map((x) => ({ revision: x.revisionName, percent: x.percent }))
    .sort((a, b) => a.revision.localeCompare(b.revision));
}
function sameTraffic(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// The alert recipient is deployment configuration, independent of CLI/ADC identity.
// Read only this key; do not import application configuration into the watcher process.
export function resolveWatcherMonitoringConfig(source = SOURCE, env = process.env) {
  const file = join(source, ".env.local");
  const configured = existsSync(file)
    ? parseEnv(readFileSync(file, "utf8")).MONITORING_OPERATOR_EMAIL
    : undefined;
  return resolveMonitoringConfig(configured ? [`--operator-email=${configured}`] : [], {
    MONITORING_OPERATOR_EMAIL: env.MONITORING_OPERATOR_EMAIL,
  });
}

export function createDriver({
  source = SOURCE,
  stateRoot,
  checkpointPath,
  adminProfile,
  editorProfile,
  operatorEmail,
  runCommand = command,
  ensureAuth = ensureAuthenticated,
  fetchImpl = fetch,
  browserExecutable = resolveBrowserExecutable,
}) {
  const monitoring = resolveMonitoringConfig(
    operatorEmail ? [`--operator-email=${operatorEmail}`] : [],
    {},
  );
  const gitRoot = join(stateRoot, "repository");
  let cloudClient;
  const checked = async (bin, args, options) => {
    const result = await runCommand(bin, args, options);
    if (result.status !== 0) throw new Error("release_command_failed");
    return result.stdout.trim();
  };
  const cloud = async (args) => parseJson(await checked("gcloud", args));
  const serviceRead = () =>
    cloud([
      "run",
      "services",
      "describe",
      SERVICE,
      `--project=${PROJECT}`,
      `--region=${REGION}`,
      "--format=json",
    ]);
  const identityConfig = async (method = "GET", data) => {
    cloudClient ??= await new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    }).getClient();
    return (
      await cloudClient.request({
        method,
        url: `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT}/config${method === "PATCH" ? "?updateMask=authorizedDomains" : ""}`,
        ...(data ? { data } : {}),
        timeout: 30_000,
      })
    ).data;
  };
  const checkout = (cp) => join(stateRoot, "checkouts", cp.sha);
  const runScript = (cp, script, args = [], timeoutMs = 30 * 60_000) =>
    runCommand(
      process.execPath,
      [
        join(checkout(cp), "node_modules", "tsx", "dist", "cli.mjs"),
        join(checkout(cp), "scripts", script),
        ...args,
      ],
      {
        cwd: checkout(cp),
        timeoutMs,
        env: {
          ...process.env,
          ENVIRONMENT_KIND: "production",
          DATA_CONTEXT: "live",
          PLAYWRIGHT_CHROME_PATH: browserExecutable(),
          VITEST_MAX_WORKERS: "2",
        },
      },
    );
  const assuranceArgs = (cp, origin = cp.candidateOrigin) => [
    "--live",
    `--base-url=${origin}`,
    `--expected-commit=${cp.sha}`,
    `--expected-revision=${cp.revision}`,
    `--expected-config-fingerprint=${cp.fingerprint}`,
    ...COORDINATES,
    `--operator-email=${monitoring.operatorEmail}`,
    `--admin-profile=${adminProfile}`,
    `--editor-profile=${editorProfile}`,
  ];
  const candidateReceipt = (cp) => join(stateRoot, `candidate-${cp.revision}.json`);
  const promotionReceipt = (cp) => join(stateRoot, `promotion-${cp.revision}.json`);
  const readVersion = async (origin) => {
    const response = await fetchImpl(`${origin}/api/version`, {
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error("version_read_failed");
    const value = await response.json();
    return { commit: value.commit, revision: value.revision, service: value.service };
  };
  return {
    save: async (cp) => writeState(checkpointPath, cp),
    authenticate: async () =>
      (
        await ensureAuth({
          need: ["gcloud", "adc", "gh"],
          unattended: true,
          root: source,
        })
      ).exitCode === 0,
    hasExactReceipt: async (cp) => {
      try {
        const receipt = readCandidateAssuranceReceipt(candidateReceipt(cp), {
          project: PROJECT,
          region: REGION,
          service: SERVICE,
          expectedCommit: cp.sha,
          expectedRevision: cp.revision,
        });
        return receipt.expectedConfigurationFingerprint === cp.fingerprint;
      } catch {
        if (cp.inFlight !== "promote") return false;
        try {
          const receipt = readPromotionReceipt(promotionReceipt(cp), {
            expectedCommit: cp.sha,
            expectedRevision: cp.revision,
          });
          return receipt.expectedConfigurationFingerprint === cp.fingerprint;
        } catch {
          return false;
        }
      }
    },
    async inspect(checkpoint) {
      const mainSha = (
        await checked("git", [
          "ls-remote",
          `https://github.com/${REPOSITORY}.git`,
          "refs/heads/main",
        ])
      ).split(/\s/)[0];
      const sha =
        checkpoint && checkpoint.phase !== "complete" && !checkpoint.terminalFailure
          ? checkpoint.sha
          : mainSha;
      const runs = parseJson(
        await checked(GH, [
          "run",
          "list",
          "--repo",
          REPOSITORY,
          "--workflow",
          "ci.yml",
          "--branch",
          "main",
          "--commit",
          sha,
          "--json",
          "databaseId,headSha,headBranch,event,status,conclusion",
          "--limit",
          "10",
        ]),
      );
      const ci = runs.find(
        (r) => r.event === "push" && r.headSha === sha && r.headBranch === "main",
      );
      if (ci?.status !== "completed" || ci?.conclusion !== "success")
        return { sha, ci, changedPaths: [], foundationPresent: false };
      // A disposable Git database, never fetch/reset/pull the development worktree.
      if (!existsSync(gitRoot))
        await checked("git", [
          "clone",
          "--bare",
          "--single-branch",
          "--branch",
          "main",
          `https://github.com/${REPOSITORY}.git`,
          gitRoot,
        ]);
      await checked("git", ["fetch", "origin", "main"], { cwd: gitRoot });
      const baseline =
        checkpoint?.lastDeployedSha || (await readVersion(CANONICAL)).commit;
      const changedPaths = (
        await checked("git", ["diff", "--name-only", baseline, sha], { cwd: gitRoot })
      )
        .split(/\r?\n/)
        .filter(Boolean);
      const foundation = await runCommand(
        "git",
        ["cat-file", "-e", `${sha}:lib/auth/canary-policy.ts`],
        { cwd: gitRoot },
      );
      return { sha, ci, changedPaths, foundationPresent: foundation.status === 0 };
    },
    async prepare(cp) {
      await checked(GH, [
        "run",
        "watch",
        String(cp.ciRunId),
        "--repo",
        REPOSITORY,
        "--exit-status",
      ]);
      mkdirSync(dirname(checkout(cp)), { recursive: true });
      if (!existsSync(checkout(cp)))
        await checked("git", ["worktree", "add", "--detach", checkout(cp), cp.sha], {
          cwd: gitRoot,
        });
      if (
        (await checked("git", ["rev-parse", "HEAD"], { cwd: checkout(cp) })) !== cp.sha ||
        (await checked("git", ["status", "--porcelain"], { cwd: checkout(cp) }))
      )
        throw new Error("clean_exact_checkout_required");
      await checked("npm", ["ci", "--no-audit", "--no-fund"], {
        cwd: checkout(cp),
        timeoutMs: 15 * 60_000,
      });
      const baseline = traffic(await serviceRead());
      if (baseline.length !== 1 || baseline[0].percent !== 100)
        throw new Error("exact_serving_baseline_required");
      return {
        verified: true,
        patch: { baselineTraffic: baseline, predecessor: baseline[0].revision },
      };
    },
    async deploy(cp) {
      const before = await serviceRead();
      if (!sameTraffic(traffic(before), cp.baselineTraffic))
        return { verified: false, reason: "serving_traffic_changed" };
      const readRevision = () =>
        runCommand("gcloud", [
          "run",
          "revisions",
          "describe",
          cp.revision,
          `--project=${PROJECT}`,
          `--region=${REGION}`,
          "--format=json",
        ]);
      let revision = await readRevision();
      if (revision.status !== 0) {
        if (cp.inFlight === "deploy")
          return { verified: false, reason: "deployment_outcome_unresolved" };
        const result = await runScript(cp, "release.mjs", [
          "--environment=production",
          "--execute",
          "--budget-confirmed",
          "--allow-multiple-spaces",
          `--revision-suffix=${cp.suffix}`,
          `--env-file=${join(source, ".env.production.local")}`,
        ]);
        revision = await readRevision();
        if (revision.status !== 0)
          return {
            verified: false,
            reason:
              result.status === 0
                ? "deployment_readback_unavailable"
                : "deployment_outcome_unresolved",
          };
      }
      const observed = parseJson(revision.stdout);
      const values = observed.spec?.containers?.[0]?.env ?? [];
      if (
        observed.metadata?.name !== cp.revision ||
        !values.some((x) => x.name === "APP_COMMIT_SHA" && x.value === cp.sha)
      )
        throw new Error("candidate_revision_identity_mismatch");
      const after = await serviceRead();
      const tag = after.status?.traffic?.find(
        (x) => x.tag === cp.tag && x.revisionName === cp.revision && !(x.percent > 0),
      );
      if (!tag?.url || !sameTraffic(traffic(after), cp.baselineTraffic))
        return { verified: false, reason: "candidate_traffic_readback_failed" };
      return { verified: true, patch: { candidateOrigin: new URL(tag.url).origin } };
    },
    async smoke(cp) {
      const result = await runScript(cp, "smoke-release-candidate.mjs", [
        `--base-url=${cp.candidateOrigin}`,
        `--expected-commit=${cp.sha}`,
        `--expected-revision=${cp.revision}`,
        `--expected-tag=${cp.tag}`,
        `--expected-service=${SERVICE}`,
      ]);
      return { verified: result.status === 0 };
    },
    async fingerprint(cp) {
      const result = await runScript(cp, "observe-production-release.ts", [
        "--capture-config-fingerprint",
        "--live",
        `--expected-revision=${cp.revision}`,
        ...COORDINATES,
      ]);
      const fingerprint = result.stdout
        .trim()
        .split(/\r?\n/)
        .find((x) => /^sha256:[a-f0-9]{64}$/.test(x));
      return {
        verified: result.status === 0 && Boolean(fingerprint),
        patch: { fingerprint },
      };
    },
    async domains(cp) {
      const current = await identityConfig();
      const prior = current.authorizedDomains;
      if (
        !/^cand-[a-z0-9-]+---pmi-kc-app-kq6wuvpiva-uc\.a\.run\.app$/.test(
          cp.supersededCandidateHost,
        )
      ) {
        throw new Error("superseded_candidate_host_invalid");
      }
      if (!Array.isArray(prior)) throw new Error("authorized_domain_readback_failed");
      const nextHost = new URL(cp.candidateOrigin).hostname;
      if (!nextHost.startsWith(`${cp.tag}---${SERVICE}-`))
        throw new Error("candidate_host_mismatch");
      const next = [
        ...new Set([...prior.filter((x) => x !== cp.supersededCandidateHost), nextHost]),
      ];
      if (!sameTraffic(traffic(await serviceRead()), cp.baselineTraffic))
        throw new Error("serving_traffic_changed");
      if (JSON.stringify([...prior].sort()) !== JSON.stringify([...next].sort()))
        await identityConfig("PATCH", { authorizedDomains: next });
      const observed = (await identityConfig()).authorizedDomains;
      return {
        verified:
          Array.isArray(observed) &&
          JSON.stringify([...observed].sort()) === JSON.stringify([...next].sort()) &&
          sameTraffic(traffic(await serviceRead()), cp.baselineTraffic),
      };
    },
    async assurance(cp) {
      if (await this.hasExactReceipt(cp)) return { verified: true };
      if (existsSync(candidateReceipt(cp)))
        return { verified: false, reason: "candidate_receipt_expired_or_invalid" };
      const enrollmentVersion = browserEnrollmentVersion([adminProfile, editorProfile]);
      if (!browserEnrollmentChanged(cp, enrollmentVersion))
        return { verified: false, reason: "managed_browser_enrollment_required" };
      const sessions = await ensureAuth({
        need: ["canary"],
        unattended: true,
        canary: [
          { label: "admin", profile: adminProfile, email: "canary-admin@pmikcmetro.com" },
          {
            label: "editor",
            profile: editorProfile,
            email: "canary-editor@pmikcmetro.com",
          },
        ].flatMap((profile) =>
          [CANONICAL, cp.candidateOrigin].map((origin) => ({ ...profile, origin })),
        ),
        root: checkout(cp),
      });
      if (sessions.exitCode !== 0)
        return {
          verified: false,
          reason: "managed_browser_enrollment_required",
          patch: { browserEnrollmentVersion: enrollmentVersion },
        };
      const result = await runScript(cp, "observe-production-release.ts", [
        "--prepare-candidate-receipt",
        ...assuranceArgs(cp),
        `--candidate-assurance-receipt=${candidateReceipt(cp)}`,
      ]);
      return { verified: result.status === 0 && (await this.hasExactReceipt(cp)) };
    },
    async promote(cp) {
      const current = traffic(await serviceRead());
      if (sameTraffic(current, [{ revision: cp.revision, percent: 100 }])) {
        try {
          readPromotionReceipt(promotionReceipt(cp), {
            expectedCommit: cp.sha,
            expectedRevision: cp.revision,
          });
          return { verified: true };
        } catch {
          return { verified: false, reason: "promotion_receipt_missing" };
        }
      }
      if (cp.inFlight === "promote" || !sameTraffic(current, cp.baselineTraffic))
        return { verified: false, reason: "promotion_outcome_unresolved" };
      const result = await runScript(cp, "release.mjs", [
        "--environment=production",
        "--promote",
        `--candidate-revision=${cp.revision}`,
        `--candidate-assurance-receipt=${candidateReceipt(cp)}`,
        `--promotion-receipt=${promotionReceipt(cp)}`,
        `--env-file=${join(source, ".env.production.local")}`,
        "--allow-multiple-spaces",
        ...assuranceArgs(cp).filter((x) =>
          /^(--operator-email|--admin-profile|--editor-profile)=/.test(x),
        ),
      ]);
      if (result.status !== 0)
        return { verified: false, reason: "promotion_outcome_unresolved" };
      readPromotionReceipt(promotionReceipt(cp), {
        expectedCommit: cp.sha,
        expectedRevision: cp.revision,
      });
      return {
        verified: sameTraffic(traffic(await serviceRead()), [
          { revision: cp.revision, percent: 100 },
        ]),
      };
    },
    async observe(cp) {
      if (cp.rollback) return this.recoverRollback(cp);
      const reportPath = join(stateRoot, `observation-${cp.revision}-${Date.now()}.json`);
      const result = await runScript(cp, "observe-production-release.ts", [
        ...assuranceArgs(cp, CANONICAL),
        `--promotion-receipt=${promotionReceipt(cp)}`,
        `--report=${reportPath}`,
      ]);
      const report = readState(reportPath);
      if (!report) return { verified: false, reason: "observation_unavailable" };
      if (
        report.phase !== "post_promotion" ||
        report.expectedCommit !== cp.sha ||
        report.expectedRevision !== cp.revision
      )
        return { verified: false, reason: "observation_identity_mismatch" };
      if (report.observation?.decision === "rollback_required") {
        if (report.observation.rollbackRevision !== cp.predecessor)
          throw new Error("rollback_binding_invalid");
        const recovery = { ...cp, rollback: { revision: cp.predecessor } };
        await this.save(recovery);
        return this.recoverRollback(recovery);
      }
      const version = await readVersion(CANONICAL);
      return {
        verified:
          result.status === 0 &&
          report.verdict === "passed" &&
          report.observation?.decision === "passed" &&
          report.observation?.elapsedMs >= 300_000 &&
          version.commit === cp.sha &&
          version.revision === cp.revision &&
          sameTraffic(traffic(await serviceRead()), [
            { revision: cp.revision, percent: 100 },
          ]),
        patch: { lastDeployedSha: cp.sha },
      };
    },
    async recoverRollback(cp) {
      if (cp.rollback?.revision !== cp.predecessor)
        throw new Error("rollback_binding_invalid");
      const patch = { rollback: cp.rollback };
      const current = traffic(await serviceRead());
      if (!sameTraffic(current, cp.baselineTraffic)) {
        if (!sameTraffic(current, [{ revision: cp.revision, percent: 100 }]))
          return { verified: false, reason: "rollback_traffic_changed", patch };
        // The rollback target was durably recorded before dispatch. A lost command response is
        // resolved from exact traffic, and a resumed rollback never overwrites another release.
        await runCommand("gcloud", [
          "run",
          "services",
          "update-traffic",
          SERVICE,
          `--project=${PROJECT}`,
          `--region=${REGION}`,
          `--to-revisions=${cp.predecessor}=100`,
          "--quiet",
        ]);
        if (!sameTraffic(traffic(await serviceRead()), cp.baselineTraffic))
          return { verified: false, reason: "rollback_traffic_unverified", patch };
      }
      const recovered = await runScript(cp, "observe-production-release.ts", [
        "--verify-rollback-recovery",
        "--live",
        `--recovery-receipt=${promotionReceipt(cp)}`,
        `--operator-email=${monitoring.operatorEmail}`,
        `--admin-profile=${adminProfile}`,
        `--editor-profile=${editorProfile}`,
      ]);
      return {
        verified: false,
        reason:
          recovered.status === 0
            ? "rolled_back_verified"
            : "rollback_recovery_unverified",
        patch: { ...patch, terminalFailure: recovered.status === 0 },
      };
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  if (process.platform !== "linux") throw new Error("watcher_requires_this_wsl_host");
  const watch = argv.includes("--watch"),
    dryRun = argv.includes("--dry-run");
  if (argv.some((x) => !["--watch", "--once", "--dry-run"].includes(x)))
    throw new Error("watcher_argument_invalid");
  const stateRoot = join(homedir(), ".local", "state", "pmi-kc-release");
  const checkpointPath = join(stateRoot, "checkpoint.json");
  const unlock = await acquireWatcherLock(stateRoot);
  let lastStatus = "";
  try {
    const driver = createDriver({
      stateRoot,
      checkpointPath,
      adminProfile: join(homedir(), "pmi-assurance", "canary-admin"),
      editorProfile: join(homedir(), "pmi-assurance", "canary-editor"),
      operatorEmail: resolveWatcherMonitoringConfig().operatorEmail,
    });
    do {
      let cp = readState(checkpointPath);
      try {
        const observed = await driver.inspect(cp);
        const decision = evaluateRelease({ ...observed, checkpoint: cp });
        if (dryRun || !["release", "resume"].includes(decision.state)) {
          const status = JSON.stringify({ ...decision, sha: observed.sha, dryRun });
          if (status !== lastStatus) console.log(status);
          lastStatus = status;
        } else {
          if (!cp || cp.phase === "complete" || cp.terminalFailure) {
            const suffix = createDeployRevisionSuffix();
            cp = {
              sha: observed.sha,
              ciRunId: observed.ci.databaseId,
              phase: "prepare",
              suffix,
              revision: `${SERVICE}-${suffix}`,
              tag: `cand-${suffix}`,
              lastDeployedSha: cp?.lastDeployedSha,
              supersededCandidateHost: cp?.candidateOrigin
                ? new URL(cp.candidateOrigin).hostname
                : INITIAL_CANDIDATE_HOST,
            };
            await driver.save(cp);
          }
          while (cp.phase !== "complete") {
            cp = await advanceRelease(cp, driver);
            await driver.save(cp);
            const status = JSON.stringify({
              sha: cp.sha,
              phase: cp.phase,
              blocked: cp.blocked,
            });
            if (status !== lastStatus) console.log(status);
            lastStatus = status;
            if (cp.blocked) break;
          }
        }
      } catch {
        const status = JSON.stringify({
          sha: cp?.sha ?? null,
          phase: cp?.phase ?? "inspect",
          blocked: "release_phase_unverified",
        });
        if (status !== lastStatus) console.log(status);
        lastStatus = status;
      }
      if (watch && !dryRun)
        await new Promise((resolveWait) => setTimeout(resolveWait, 60_000));
    } while (watch && !dryRun);
  } finally {
    await unlock();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(
      "Release watcher refused; inspect its local checkpoint and authentication status.",
    );
    process.exitCode = 2;
  });
}
