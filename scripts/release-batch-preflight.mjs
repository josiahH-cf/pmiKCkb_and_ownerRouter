#!/usr/bin/env node
// Read-only readiness check for the ONE batched release that ships every queued feature.
//
//   npm run release:batch-preflight            # human checklist + verdict
//   npm run release:batch-preflight -- --json  # same result as JSON
//
// It runs no cloud command, changes no state, and never prints a secret value: it reads local git,
// the two ignored env files (two flag values only), the watcher checkpoint, the WSL enrollment
// marker and the Awaiting release queue in docs/loop-state.md. Billing is the owner's readback and
// is always reported as an owner step, never inferred.
//
// The decisive check is `watcher_target`: the watcher deploys the SHA its checkpoint names while
// that checkpoint is unfinished, so a stale checkpoint silently ships one old queue item instead of
// the whole batch. This reuses the watcher's own `evaluateRelease`, so the two cannot drift.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseEnv } from "node:util";

import { evaluateRelease } from "./release-watcher-plan.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHEET_WRITEBACK_FLAG = "LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED";
const REPOSITORY = "josiahH-cf/pmiKCkb_and_ownerRouter";
/** The watcher uses the Windows GitHub CLI from WSL when it is present; match it. */
const GH_BIN = existsSync("/mnt/c/Program Files/GitHub CLI/gh.exe")
  ? "/mnt/c/Program Files/GitHub CLI/gh.exe"
  : "gh";
const DEMO_FLAG = "ASK_DEMO_MODE";
/** Re-enrollment is owner-only and has been observed to expire under nine hours. */
export const ENROLLMENT_BUDGET_HOURS = 7;

export const PREFLIGHT_STATES = ["ready", "owner_action", "blocked", "unknown"];

/**
 * The watcher takes `checkpoint.sha` while that checkpoint is neither complete nor terminal. This
 * mirrors `inspect()` in scripts/release-watcher.mjs; the batch depends on it resolving to HEAD.
 */
export function watcherTargetSha(checkpoint, headSha) {
  return checkpoint && checkpoint.phase !== "complete" && !checkpoint.terminalFailure
    ? checkpoint.sha
    : headSha;
}

/** Parse the numbered Awaiting release queue; returns [{ position, suite, approval }]. */
export function parseAwaitingReleaseQueue(loopState) {
  const section = loopState.split(/^## Awaiting release[^\n]*$/m)[1];
  if (!section) return [];
  const rows = [];
  for (const line of section.split("\n")) {
    if (line.startsWith("## ")) break;
    const match = /^(\d+)\.\s+(S\d+)\s+\((F\d+)\)/.exec(line);
    if (match)
      rows.push({ position: Number(match[1]), suite: match[2], approval: match[3] });
  }
  return rows;
}

function check(id, state, summary, detail, ownerAction = null) {
  return { id, state, summary, detail, ownerAction };
}

/**
 * Pure verdict over gathered inputs. `billingReEnabled` is the owner's own readback: undefined means
 * unknown, which keeps the verdict at owner_action rather than guessing that production can deploy.
 */
export function evaluateBatchPreflight(input) {
  const {
    headSha,
    treeClean,
    ci,
    checkpoint,
    changedPaths,
    foundationPresent = true,
    queue = [],
    envFlags = {},
    enrolledAtIso,
    nowIso,
    billingReEnabled,
  } = input;
  const checks = [];

  checks.push(
    /^[0-9a-f]{40}$/.test(headSha ?? "")
      ? check(
          "main_head",
          treeClean ? "ready" : "blocked",
          `Main head ${headSha.slice(0, 8)}${treeClean ? "" : " with an unclean tree"}`,
          treeClean
            ? "The candidate is built from the working tree, so it must match this exact head."
            : "Commit or stash every tracked change: the candidate uploads the working tree.",
        )
      : check(
          "main_head",
          "blocked",
          "No exact main head",
          "Resolve main to a 40-character SHA.",
        ),
  );

  const ciGreen =
    ci &&
    ci.headSha === headSha &&
    ci.headBranch === "main" &&
    ci.event === "push" &&
    ci.status === "completed" &&
    ci.conclusion === "success";
  checks.push(
    check(
      "exact_sha_ci",
      ci === undefined ? "owner_action" : ciGreen ? "ready" : "blocked",
      ciGreen
        ? `Exact-SHA CI ${ci.databaseId ?? "run"} passed on main`
        : ci === undefined
          ? "Exact-SHA CI could not be read from here"
          : "Exact-SHA CI is not a green push run on main",
      "The watcher refuses any head without its own green push run on main.",
      ci === undefined
        ? "Confirm the exact-SHA CI run is green before starting: gh run list --commit <head>."
        : ciGreen
          ? null
          : "Push a head whose own CI run passed; never start on a red or missing run.",
    ),
  );

  const target = watcherTargetSha(checkpoint, headSha);
  const decision = evaluateRelease({
    sha: target,
    ci: ci && target === headSha ? ci : ci && { ...ci, headSha: target },
    changedPaths,
    checkpoint,
    foundationPresent,
  });
  const targetsHead = target === headSha;
  checks.push(
    check(
      "watcher_target",
      targetsHead ? "ready" : "owner_action",
      targetsHead
        ? `The next pass targets ${headSha.slice(0, 8)}, the whole batch`
        : `A stale checkpoint pins the next pass to ${String(target).slice(0, 8)}`,
      targetsHead
        ? `Watcher decision: ${decision.state}.`
        : `The checkpoint is unfinished at ${String(target).slice(0, 8)} (phase ${checkpoint?.phase}${checkpoint?.blocked ? `, blocked ${checkpoint.blocked}` : ""}), so the watcher would deploy that commit and carry only the features it contains.`,
      targetsHead
        ? null
        : "Archive the unfinished checkpoint so the watcher seeds a fresh one at the current head (see docs/release-batch-runbook.md, step 2).",
    ),
  );

  checks.push(
    check(
      "batch_scope",
      queue.length > 0 ? "ready" : "unknown",
      `${queue.length} queued feature${queue.length === 1 ? "" : "s"} ride this one candidate`,
      queue.length
        ? `${queue.map((row) => row.suite).join(", ")}. One Cloud Build and one candidate replace ${queue.length} separate release cycles.`
        : "No Awaiting release queue was parsed from docs/loop-state.md.",
    ),
  );

  const paused = Object.entries(envFlags)
    .filter(([name]) => name.endsWith(SHEET_WRITEBACK_FLAG))
    .map(([name, value]) => [name, String(value).trim() !== "true"]);
  const allPaused = paused.length > 0 && paused.every(([, safe]) => safe);
  checks.push(
    check(
      "sheet_pause",
      paused.length === 0 ? "unknown" : allPaused ? "ready" : "blocked",
      allPaused
        ? "The operating-Sheet pause (S128) is staged false everywhere it is read"
        : "An env file would ship the operating-Sheet write flag enabled",
      paused.length
        ? paused
            .map(([name, safe]) => `${name}: ${safe ? "paused" : "ENABLED"}`)
            .join("; ")
        : "Neither ignored env file was readable from this host.",
      allPaused ? null : `Set ${SHEET_WRITEBACK_FLAG}=false before any deploy.`,
    ),
  );

  const demo = Object.entries(envFlags).filter(([name]) => name.endsWith(DEMO_FLAG));
  const demoOff =
    demo.length > 0 && demo.every(([, value]) => String(value).trim() !== "true");
  checks.push(
    check(
      "demo_mode",
      demo.length === 0 ? "unknown" : demoOff ? "ready" : "blocked",
      demoOff ? "Demo answering stays off" : "An env file would ship demo answering on",
      demo.map(([name, value]) => `${name}: ${value}`).join("; ") || "Not readable.",
    ),
  );

  let enrollmentState = "unknown";
  let enrollmentSummary = "WSL enrollment age unknown";
  let enrollmentDetail = "No enrollment marker was readable on this host.";
  if (enrolledAtIso && nowIso) {
    const hours = (Date.parse(nowIso) - Date.parse(enrolledAtIso)) / 3_600_000;
    const fresh = Number.isFinite(hours) && hours >= 0 && hours < ENROLLMENT_BUDGET_HOURS;
    enrollmentState = fresh ? "ready" : "owner_action";
    enrollmentSummary = fresh
      ? `WSL enrollment is ${hours.toFixed(1)} h old`
      : `WSL enrollment is ${hours.toFixed(1)} h old, past the ${ENROLLMENT_BUDGET_HOURS} h budget`;
    enrollmentDetail = `A release runs about 45 to 60 minutes and the session has expired under nine hours; an expiry mid-observation pauses a rollback on authentication_required.`;
  }
  checks.push(
    check(
      "auth_enrollment",
      enrollmentState,
      enrollmentSummary,
      enrollmentDetail,
      enrollmentState === "ready"
        ? null
        : "Re-enroll in WSL: npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com",
    ),
  );

  checks.push(
    check(
      "billing",
      billingReEnabled === true ? "ready" : "owner_action",
      billingReEnabled === true
        ? "Billing is re-enabled on pmi-kc-kb-prod (owner readback)"
        : "Billing on pmi-kc-kb-prod is the owner's readback and is not assumed here",
      "Every deploy fails BILLING_DISABLED and the canonical origin returns 503 until the owner re-enables it. The runner never changes billing.",
      billingReEnabled === true
        ? null
        : "Review spend, re-enable billing, and confirm the guardrail cap is still 100 before starting.",
    ),
  );

  const blocked = checks.filter((row) => row.state === "blocked");
  const ownerActions = checks.filter((row) => row.state === "owner_action");
  const verdict = blocked.length
    ? "not_ready"
    : ownerActions.length
      ? "owner_action_required"
      : "go";
  return {
    verdict,
    headSha,
    watcherTargetSha: target,
    batchSize: queue.length,
    checks,
    ownerActions: [...blocked, ...ownerActions]
      .map((row) => row.ownerAction)
      .filter(Boolean),
  };
}

/* ------------------------------------------------------------------------------------------------
 * Local, read-only gathering
 * ---------------------------------------------------------------------------------------------- */

function git(args, cwd = ROOT) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Only the two flags this release depends on; no other value from an ignored env file is read. */
function readEnvFlags(root) {
  const flags = {};
  for (const file of [".env.local", ".env.production.local"]) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    let parsed;
    try {
      parsed = parseEnv(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    for (const name of [SHEET_WRITEBACK_FLAG, DEMO_FLAG])
      if (parsed[name] !== undefined) flags[`${file}:${name}`] = parsed[name];
  }
  return flags;
}

/** The exact-SHA push run on main, read through gh. Returns undefined when gh cannot answer. */
export function readExactShaCi(headSha, { gh = GH_BIN, cwd = ROOT } = {}) {
  if (!headSha) return undefined;
  try {
    const runs = JSON.parse(
      execFileSync(
        gh,
        [
          "run",
          "list",
          "--repo",
          REPOSITORY,
          "--workflow",
          "ci.yml",
          "--branch",
          "main",
          "--commit",
          headSha,
          "--json",
          "databaseId,headSha,headBranch,event,status,conclusion",
          "--limit",
          "10",
        ],
        { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ),
    );
    return runs.find(
      (run) =>
        run.event === "push" && run.headSha === headSha && run.headBranch === "main",
    );
  } catch {
    return undefined;
  }
}

export function gatherBatchPreflight({
  root = ROOT,
  stateRoot = join(homedir(), ".local", "state", "pmi-kc-release"),
  enrollmentPath = join(homedir(), ".config", "gcloud", "pmi-local-enrollment.json"),
  nowIso = new Date().toISOString(),
  ci,
  billingReEnabled,
} = {}) {
  const headSha = git(["rev-parse", "HEAD"], root);
  const exactCi = ci === undefined ? readExactShaCi(headSha, { cwd: root }) : ci;
  const checkpoint = readJson(join(stateRoot, "checkpoint.json"));
  const baseline = checkpoint?.lastDeployedSha;
  const target = watcherTargetSha(checkpoint, headSha);
  const diff = baseline ? git(["diff", "--name-only", baseline, target], root) : null;
  const loopState = existsSync(join(root, "docs", "loop-state.md"))
    ? readFileSync(join(root, "docs", "loop-state.md"), "utf8")
    : "";
  return {
    headSha,
    treeClean:
      (git(["status", "--porcelain", "--untracked-files=no"], root) ?? "x") === "",
    ci: exactCi,
    checkpoint,
    changedPaths: diff ? diff.split(/\r?\n/).filter(Boolean) : ["lib/unknown"],
    foundationPresent: true,
    queue: parseAwaitingReleaseQueue(loopState),
    envFlags: readEnvFlags(root),
    enrolledAtIso: readJson(enrollmentPath)?.enrolledAt ?? null,
    nowIso,
    billingReEnabled,
  };
}

const STATE_LABELS = {
  ready: "READY",
  owner_action: "OWNER",
  blocked: "BLOCK",
  unknown: "  ?  ",
};

export function renderBatchPreflight(result) {
  const lines = [
    `Batched release preflight: ${result.verdict.toUpperCase().replace(/_/g, " ")}`,
    `Head ${result.headSha ?? "unknown"} carries ${result.batchSize} queued feature${result.batchSize === 1 ? "" : "s"} in one candidate.`,
    "",
  ];
  for (const row of result.checks) {
    lines.push(`[${STATE_LABELS[row.state] ?? row.state}] ${row.summary}`);
    lines.push(`        ${row.detail}`);
  }
  if (result.ownerActions.length) {
    lines.push("", "Before you start:");
    for (const action of result.ownerActions) lines.push(`  - ${action}`);
  } else {
    lines.push(
      "",
      "Nothing is outstanding here. Start the watcher per docs/release-batch-runbook.md.",
    );
  }
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const billingFlag = process.argv.includes("--billing-re-enabled")
    ? true
    : process.argv.includes("--billing-disabled")
      ? false
      : undefined;
  const result = evaluateBatchPreflight(
    gatherBatchPreflight({ billingReEnabled: billingFlag }),
  );
  process.stdout.write(
    process.argv.includes("--json")
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${renderBatchPreflight(result)}\n`,
  );
  process.exitCode = result.verdict === "not_ready" ? 1 : 0;
}
