#!/usr/bin/env node
// S40 blue/green release wrapper. Delivery is three separate, individually reviewable invocations:
//
//   npm run release -- --environment=production --plan-only        # prints; never runs gcloud
//   npm run release -- --environment=production --execute          # candidate at ZERO traffic
//   npm run release -- --environment=production --promote --candidate-revision=<exact>
//
// The candidate deploy deliberately STOPS after creating the zero-traffic revision. Promotion is a
// separate command that names the exact revision, because the whole point of a candidate is that a
// human (or a green smoke) decides whether it should serve. The legacy
// scripts/deploy-demo-cloud-run.mjs promotes in the same breath as it deploys, which is why D07 does
// not accept it.

import { spawn } from "node:child_process";
import { accessSync, constants, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative } from "node:path";

import {
  buildDemoDeployCommand,
  buildRevisionTrafficCommand,
  createDeployRevisionSuffix,
} from "./deploy-demo-cloud-run.mjs";
import {
  buildCandidateDeployPlan,
  buildPriorRevisionQueryPlan,
  buildReleasePlan,
  formatCommand,
  parseServingRevision,
  parseReleaseArgs,
} from "./release-candidate.mjs";
import {
  buildPromotionReceipt,
  claimCandidateAssuranceReceipt,
  commitReservedReceipt,
  discardReceiptReservation,
  exactExternalReceiptPath,
  readCandidateAssuranceReceipt,
  reserveReceipt,
} from "./production-assurance-receipts.mjs";

// A release step must FAIL rather than wait. Two properties make that true, and this cutover proved
// both are needed: on 2026-08-01 a real run sat for 89 minutes with zero output while the same
// `gcloud` invocation errors in under a second when run directly.
//
// 1. stdin is "ignore", never "inherit". An inherited stdin in an unattended or backgrounded run is
//    a handle that never delivers EOF, so any provider prompt blocks forever instead of erroring.
//    A deploy path that can silently wait on a human is worse than one that fails: the operator
//    reads no output as progress, which is exactly what happened.
// 2. Every step is bounded. A hang that outlives its own timeout is reported as a hang, naming the
//    command, so the failure is diagnosable instead of looking like a slow build.
export const RELEASE_STEP_TIMEOUT_MS = 30 * 60 * 1000;
export const RELEASE_TREE_TERMINATION_TIMEOUT_MS = 10_000;

/**
 * Kill the whole process group, not only the shell returned by `spawn`. A timed-out gcloud shell
 * can otherwise leave a grandchild applying traffic after the release harness starts rollback.
 */
export function terminateReleaseProcessTree(
  child,
  {
    platform = process.platform,
    killProcess = process.kill,
    spawnTreeKiller = spawn,
    timeoutMs = RELEASE_TREE_TERMINATION_TIMEOUT_MS,
  } = {},
) {
  return new Promise((resolveTermination, rejectTermination) => {
    let settled = false;
    let treeKiller = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off?.("close", childClosed);
      fn(value);
    };
    const childClosed = () => finish(resolveTermination);
    const timer = setTimeout(() => {
      try {
        treeKiller?.kill?.("SIGKILL");
      } catch {
        // Surface the bounded, non-secret failure below.
      }
      try {
        child.kill?.("SIGKILL");
      } catch {
        // Surface the bounded, non-secret failure below.
      }
      finish(
        rejectTermination,
        new Error("release_process_tree_termination_unconfirmed"),
      );
    }, timeoutMs);
    child.once?.("close", childClosed);

    const pid = Number(child.pid);
    if (platform === "win32" && Number.isSafeInteger(pid) && pid > 0) {
      try {
        treeKiller = spawnTreeKiller("taskkill", ["/PID", String(pid), "/T", "/F"], {
          stdio: "ignore",
          shell: false,
          windowsHide: true,
        });
        treeKiller.once("error", () => {
          try {
            child.kill?.("SIGKILL");
          } catch {
            // The confirmation timeout remains authoritative.
          }
        });
        treeKiller.once("close", (code) => {
          if (code === 0) finish(resolveTermination);
        });
        return;
      } catch {
        // Fall through to the direct last-resort kill and bounded close confirmation.
      }
    }

    if (platform !== "win32" && Number.isSafeInteger(pid) && pid > 0) {
      try {
        // Non-Windows release children are detached process-group leaders (see `run`).
        killProcess(-pid, "SIGKILL");
        return;
      } catch (error) {
        if (error?.code === "ESRCH") {
          finish(resolveTermination);
          return;
        }
      }
    }
    try {
      child.kill?.("SIGKILL");
    } catch {
      // The confirmation timeout remains authoritative.
    }
  });
}

export function run(
  command,
  args,
  {
    capture = false,
    timeoutMs = RELEASE_STEP_TIMEOUT_MS,
    spawnFn = spawn,
    terminateTreeFn = terminateReleaseProcessTree,
  } = {},
) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawnFn(command, args, {
      // stdin is ignored deliberately; see (1) above. Never change this to "inherit".
      stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
      shell: process.platform === "win32",
      // Creates a killable process group on POSIX. Windows uses taskkill /T above.
      detached: process.platform !== "win32",
    });
    let out = "";
    let settled = false;
    let timedOut = false;
    const timeoutError = new Error(
      `${command} produced no result within ${Math.round(timeoutMs / 60000)} minutes and was killed. ` +
        `A release step must never wait on input; check for a provider prompt or a stalled build.`,
    );
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      void Promise.resolve(terminateTreeFn(child)).then(
        () => finish(rejectRun, timeoutError),
        () =>
          finish(
            rejectRun,
            new Error(
              `${timeoutError.message} Process-tree termination could not be confirmed; provider state is ambiguous and must be read back.`,
            ),
          ),
      );
    }, timeoutMs);
    if (capture) child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.on("error", (error) => {
      if (!timedOut) finish(rejectRun, error);
    });
    child.on("close", (code) => {
      if (timedOut) return;
      if (code === 0) finish(resolveRun, out.trim());
      else finish(rejectRun, new Error(`${command} exited with code ${code}.`));
    });
  });
}

function printPlan(plan, { revisionName, environment }) {
  console.log(`\nRelease plan — ${environment} — candidate revision ${revisionName}`);
  console.log(`Candidate tag: ${plan.candidateTag}`);
  console.log(
    `Descriptor: ${Object.entries(plan.descriptor)
      .map(([key, value]) => `${key}=${value}`)
      .join(" ")}\n`,
  );
  for (const [index, step] of plan.steps.entries()) {
    console.log(`${index + 1}. ${step.name} — ${step.description}`);
    console.log(`   ${step.command}\n`);
  }
  console.log(
    "Nothing above has run. Re-invoke with --execute to deploy the zero-traffic candidate.\n",
  );
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseReleaseArgs(argv);
  // Argument errors are decided before ANY environment work, so a malformed invocation cannot be
  // reported as a configuration failure and cannot reach an execution branch.
  if (args.errors.length > 0) {
    throw new Error(`Release refused:\n- ${args.errors.join("\n- ")}`);
  }
  const revisionSuffix = createDeployRevisionSuffix();
  const deploy = buildDemoDeployCommand({ argv, env, revisionSuffix });

  // The exact map that `--set-env-vars` will REPLACE the revision's environment with. Parsing it
  // back out is deliberate: it is what actually reaches the service, so it — not the ambient shell —
  // is the authoritative input to the local-only refusal.
  const resolvedDeployEnv = Object.fromEntries(
    deploy.args
      .filter((arg) => arg.startsWith("--set-env-vars="))
      .flatMap((arg) => arg.slice("--set-env-vars=".length).split(","))
      .map((pair) => {
        const at = pair.indexOf("=");
        return at === -1 ? [pair, ""] : [pair.slice(0, at), pair.slice(at + 1)];
      }),
  );

  const target = {
    project: readFlag(deploy.args, "--project"),
    region: readFlag(deploy.args, "--region"),
    service: deploy.args[2],
  };

  const plan = buildReleasePlan({
    ambientEnv: env,
    args: { ...args, ...target },
    command: deploy.command,
    deployArgs: deploy.args,
    resolvedEnv: resolvedDeployEnv,
    revisionName: deploy.revision,
    revisionSuffix,
  });
  for (const warning of plan.warnings ?? []) {
    console.warn(`warning: ${warning}`);
  }

  // The plan branch returns BEFORE any eligibility check and before any spawn, so `--plan-only` is a
  // guarantee rather than a convention. It makes no --budget-confirmed claim.
  if (args.planOnly) {
    if (plan.errors.length > 0) {
      throw new Error(`Release plan refused:\n- ${plan.errors.join("\n- ")}`);
    }
    printPlan(plan, { environment: args.environment, revisionName: deploy.revision });
    return { planned: true, steps: plan.steps };
  }

  if (plan.errors.length > 0) {
    throw new Error(`Release preflight failed:\n- ${plan.errors.join("\n- ")}`);
  }
  if (!deploy.ok) {
    throw new Error(`Deploy preflight failed:\n- ${deploy.errors.join("\n- ")}`);
  }

  if (args.promote) {
    const candidateReceipt =
      args.environment === "production"
        ? readCandidateAssuranceReceipt(args.candidateAssuranceReceipt, {
            project: target.project,
            region: target.region,
            service: target.service,
            expectedRevision: args.candidateRevision,
          })
        : null;
    if (candidateReceipt) {
      const result = await promoteProductionCandidate({
        candidateReceipt,
        candidateReceiptPath: args.candidateAssuranceReceipt,
        candidateRevision: args.candidateRevision,
        deployCommand: deploy.command,
        env,
        promotionReceiptPath: args.promotionReceipt,
        target,
        argv,
        verifyRecovery: () =>
          runPredecessorRecoveryGate({
            argv,
            candidateReceiptPath: args.candidateAssuranceReceipt,
          }),
      });
      console.log(`\nPromoted ${args.candidateRevision}.`);
      console.log(
        `Rollback: ${formatCommand(
          deploy.command,
          buildRevisionTrafficCommand({
            argv,
            env,
            revision: result.rollbackRevision,
          }).args,
        )}\n`,
      );
      return {
        promoted: args.candidateRevision,
        rollbackRevision: result.rollbackRevision,
        promotionReceipt: args.promotionReceipt,
      };
    }

    const prior = parseServingRevision(
      await run(deploy.command, buildPriorRevisionQueryPlan(target).args, {
        capture: true,
      }),
    );
    const promotion = buildRevisionTrafficCommand({
      argv,
      env,
      revision: args.candidateRevision,
    });
    await run(promotion.command, promotion.args);
    const promoted = parseServingRevision(
      await run(deploy.command, buildPriorRevisionQueryPlan(target).args, {
        capture: true,
      }),
    );
    if (promoted !== args.candidateRevision) {
      throw new Error("Promotion readback did not return the exact candidate revision.");
    }
    console.log(`\nPromoted ${args.candidateRevision}.`);
    console.log(
      `Rollback: ${formatCommand(
        deploy.command,
        buildRevisionTrafficCommand({ argv, env, revision: prior }).args,
      )}\n`,
    );
    return {
      promoted: args.candidateRevision,
      rollbackRevision: prior,
      promotionReceipt: null,
    };
  }

  // Capture the rollback target BEFORE the candidate exists, so the recorded revision is the one
  // that was actually serving rather than whatever the deploy left behind.
  const priorRevision = parseServingRevision(
    await run(deploy.command, buildPriorRevisionQueryPlan(target).args, {
      capture: true,
    }),
  );
  const candidate = buildCandidateDeployPlan({
    baseArgs: deploy.args,
    environment: args.environment,
    revisionSuffix,
    tag: args.tag,
  });
  await run(deploy.command, candidate.args);

  console.log(`\nCandidate ${deploy.revision} deployed at ZERO traffic.`);
  console.log(`Prior serving revision (rollback target): ${priorRevision}`);
  if (args.environment === "production") {
    console.log(
      `Smoke the candidate at its "${candidate.candidateTag}" tag URL, then run the complete candidate assurance gate:`,
    );
    console.log(
      `  npm run assure:production-observation -- --prepare-candidate-receipt --live --base-url=<candidate-tag-origin> --expected-commit=<git-commit> --expected-revision=${deploy.revision} --expected-config-fingerprint=<verified-config-fingerprint> --project=${target.project} --region=${target.region} --service=${target.service} --operator-email=<managed-operator> --admin-profile=<admin-profile-path> --editor-profile=<editor-profile-path> --candidate-assurance-receipt=<new-candidate-assurance-receipt-path>`,
    );
    console.log(
      "Promote only with that fresh receipt and reserve a new promotion receipt:",
    );
    console.log(
      `  npm run release -- --environment=production --promote --candidate-revision=${deploy.revision} --candidate-assurance-receipt=<candidate-assurance-receipt-path> --promotion-receipt=<new-promotion-receipt-path> --operator-email=<managed-operator> --admin-profile=<admin-profile-path> --editor-profile=<editor-profile-path>\n`,
    );
  } else {
    console.log(
      `Smoke the candidate at its "${candidate.candidateTag}" tag URL, then promote:`,
    );
    console.log(
      `  npm run release -- --environment=${args.environment} --promote --candidate-revision=${deploy.revision}\n`,
    );
  }
  return { candidateRevision: deploy.revision, priorRevision, promoted: false };
}

export async function runPredecessorRecoveryGate({
  argv,
  candidateReceiptPath,
  runCommand = run,
}) {
  const required = ["--operator-email", "--admin-profile", "--editor-profile"]
    .map((name) => argv.find((entry) => entry.startsWith(`${name}=`)))
    .filter(Boolean);
  if (required.length !== 3) throw new Error("predecessor_recovery_inputs_required");
  await runCommand(process.platform === "win32" ? "npm.cmd" : "npm", [
    "run",
    "assure:production-observation",
    "--",
    "--verify-rollback-recovery",
    "--live",
    `--recovery-receipt=${candidateReceiptPath}`,
    ...required,
  ]);
}

function resolveRecoveryProfile(path, repositoryRoot) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw new Error("managed_profile_required");
  }
  let profile;
  let root;
  try {
    profile = realpathSync(path);
    root = realpathSync(repositoryRoot);
    if (!statSync(profile).isDirectory()) throw new Error("managed_profile_invalid");
    accessSync(profile, constants.R_OK | constants.W_OK);
  } catch (error) {
    if (error instanceof Error && error.message === "managed_profile_invalid") {
      throw error;
    }
    throw new Error("managed_profile_required");
  }
  const fromRoot = relative(root, profile);
  if (fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))) {
    throw new Error("managed_profile_must_be_outside_repository");
  }
  return profile;
}

/**
 * Prove that rollback can at least start before any traffic command is attempted. The full live
 * recovery gate still runs after a rollback; these local checks prevent a known-bad operator or
 * missing/shared browser profile from making recovery impossible after mutation.
 */
export function preflightProductionPromotionRecovery({
  argv,
  candidateReceiptPath,
  promotionReceiptPath,
  repositoryRoot = process.cwd(),
}) {
  const operatorEmail = readFlag(argv, "--operator-email")?.trim().toLowerCase();
  if (
    !operatorEmail ||
    !/^[a-z0-9][a-z0-9._%+-]{0,63}@pmikcmetro\.com$/i.test(operatorEmail)
  ) {
    throw new Error("internal_operator_required");
  }
  const adminProfile = resolveRecoveryProfile(
    readFlag(argv, "--admin-profile"),
    repositoryRoot,
  );
  const editorProfile = resolveRecoveryProfile(
    readFlag(argv, "--editor-profile"),
    repositoryRoot,
  );
  if (adminProfile === editorProfile) {
    throw new Error("distinct_managed_profiles_required");
  }

  const candidatePath = exactExternalReceiptPath(candidateReceiptPath, repositoryRoot);
  exactExternalReceiptPath(promotionReceiptPath, repositoryRoot);
  try {
    if (!statSync(candidatePath).isFile()) throw new Error("candidate_receipt_invalid");
    accessSync(candidatePath, constants.R_OK);
  } catch {
    throw new Error("candidate_receipt_invalid");
  }
  return Object.freeze({ adminProfile, editorProfile, operatorEmail });
}

/** Verify that the identity which will invoke gcloud is the managed recovery operator named. */
export async function verifyPromotionOperatorAccount({
  deployCommand,
  operatorEmail,
  runCommand = run,
}) {
  const raw = await runCommand(
    deployCommand,
    ["auth", "list", "--filter=status:ACTIVE", "--format=value(account)"],
    { capture: true, timeoutMs: 30_000 },
  );
  const accounts = String(raw)
    .split(/\r?\n/u)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (accounts.length !== 1 || accounts[0] !== operatorEmail) {
    throw new Error("promotion_operator_identity_mismatch");
  }
}

/**
 * Execute the production traffic mutation as one compensating transaction. Once the provider says
 * the mutation returned, every later failure restores and reads back the exact captured predecessor
 * before the original promotion failure is surfaced.
 */
export async function promoteProductionCandidate({
  candidateReceipt,
  candidateReceiptPath,
  candidateRevision,
  deployCommand,
  env,
  promotionReceiptPath,
  target,
  argv,
  runCommand = run,
  verifyCandidate = verifyCandidateReceiptVersion,
  reserveReceiptOutput = reserveReceipt,
  commitReceiptOutput = commitReservedReceipt,
  discardReceiptOutput = discardReceiptReservation,
  buildTrafficCommand = buildRevisionTrafficCommand,
  claimCandidateReceipt = claimCandidateAssuranceReceipt,
  preflightRecovery = preflightProductionPromotionRecovery,
  verifyOperatorAccount = verifyPromotionOperatorAccount,
  verifyRecovery = async () => {
    throw new Error("predecessor_recovery_gate_required");
  },
  now = Date.now,
}) {
  const recoveryReadiness = await preflightRecovery({
    argv,
    candidateReceiptPath,
    promotionReceiptPath,
  });
  await verifyOperatorAccount({
    deployCommand,
    operatorEmail: recoveryReadiness.operatorEmail,
    runCommand,
  });
  const reservation = reserveReceiptOutput(promotionReceiptPath);
  let prior = null;
  let trafficMutationAttempted = false;
  let promotionStartedAtMs = null;
  try {
    prior = parseServingRevision(
      await runCommand(deployCommand, buildPriorRevisionQueryPlan(target).args, {
        capture: true,
      }),
    );
    if (prior !== candidateReceipt.predecessorRevision) {
      throw new Error("Candidate assurance receipt predecessor no longer serves.");
    }
    await verifyCandidate(candidateReceipt);
    const promotion = buildTrafficCommand({
      argv,
      env,
      revision: candidateRevision,
    });
    // Candidate evidence is consumed durably at the last safe boundary before a traffic attempt.
    // A failed or ambiguous attempt can never reuse it, while preflight failures consume nothing.
    claimCandidateReceipt(candidateReceiptPath, candidateReceipt, now());
    promotionStartedAtMs = now();
    trafficMutationAttempted = true;
    await runCommand(promotion.command, promotion.args);
    const promoted = parseServingRevision(
      await runCommand(deployCommand, buildPriorRevisionQueryPlan(target).args, {
        capture: true,
      }),
    );
    if (promoted !== candidateRevision) {
      throw new Error("Promotion readback did not return the exact candidate revision.");
    }
    const promotionReceipt = buildPromotionReceipt(
      candidateReceipt,
      promotionStartedAtMs,
      now(),
    );
    commitReceiptOutput(reservation, promotionReceipt);
    return { rollbackRevision: prior, promotionReceipt };
  } catch (error) {
    if (!trafficMutationAttempted) {
      discardReceiptOutput(reservation);
      throw error;
    }

    let rollbackCommandError = false;
    try {
      const rollback = buildTrafficCommand({ argv, env, revision: prior });
      await runCommand(rollback.command, rollback.args);
    } catch {
      rollbackCommandError = true;
    }
    let restored;
    try {
      restored = parseServingRevision(
        await runCommand(deployCommand, buildPriorRevisionQueryPlan(target).args, {
          capture: true,
        }),
      );
    } catch {
      throw new Error(
        "Production promotion failed after traffic mutation and predecessor restoration could not be verified.",
      );
    }
    if (restored !== prior) {
      throw new Error(
        "Production promotion failed after traffic mutation and predecessor restoration could not be verified.",
      );
    }
    try {
      await verifyRecovery(candidateReceipt.predecessorBaseline);
    } catch {
      throw new Error(
        "Production promotion failed after traffic mutation and predecessor recovery gate did not pass.",
      );
    }
    try {
      discardReceiptOutput(reservation);
    } catch {
      throw new Error(
        "Production promotion failed after traffic mutation; exact predecessor restored but receipt cleanup failed.",
      );
    }
    const rollbackQualifier = rollbackCommandError
      ? " despite an ambiguous rollback command result"
      : "";
    throw new Error(
      `Production promotion failed after traffic mutation; exact predecessor restored and recovery verified${rollbackQualifier}.`,
    );
  }
}

export async function verifyCandidateReceiptVersion(receipt, fetchFn = fetch) {
  let response;
  try {
    response = await fetchFn(`${receipt.candidateOrigin}/api/version`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Candidate receipt version read failed.");
  }
  if (!response?.ok) throw new Error("Candidate receipt version read failed.");
  const body = await response.json().catch(() => null);
  if (
    !body ||
    body.commit !== receipt.expectedCommit ||
    body.revision !== receipt.expectedRevision ||
    body.service !== receipt.service ||
    body.environment !== "production"
  ) {
    throw new Error("Candidate assurance receipt no longer matches the candidate.");
  }
}

function readFlag(args, name) {
  const prefix = `${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("release.mjs");
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
