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
  parseReleaseArgs,
} from "./release-candidate.mjs";

function run(command, args, { capture = false } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
      shell: process.platform === "win32",
    });
    let out = "";
    if (capture) child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.on("error", rejectRun);
    child.on("close", (code) =>
      code === 0
        ? resolveRun(out.trim())
        : rejectRun(new Error(`${command} exited with code ${code}.`)),
    );
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
    const prior = await run(deploy.command, buildPriorRevisionQueryPlan(target).args, {
      capture: true,
    });
    const promotion = buildRevisionTrafficCommand({
      argv,
      env,
      revision: args.candidateRevision,
    });
    await run(promotion.command, promotion.args);
    console.log(`\nPromoted ${args.candidateRevision}.`);
    console.log(
      `Rollback: ${formatCommand(
        deploy.command,
        buildRevisionTrafficCommand({ argv, env, revision: prior }).args,
      )}\n`,
    );
    return { promoted: args.candidateRevision, rollbackRevision: prior };
  }

  // Capture the rollback target BEFORE the candidate exists, so the recorded revision is the one
  // that was actually serving rather than whatever the deploy left behind.
  const priorRevision = await run(
    deploy.command,
    buildPriorRevisionQueryPlan(target).args,
    { capture: true },
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
  console.log(
    `Smoke the candidate at its "${candidate.candidateTag}" tag URL, then promote:`,
  );
  console.log(
    `  npm run release -- --environment=${args.environment} --promote --candidate-revision=${deploy.revision}\n`,
  );
  return { candidateRevision: deploy.revision, priorRevision, promoted: false };
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
