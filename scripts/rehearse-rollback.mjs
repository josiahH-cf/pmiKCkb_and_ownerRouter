// PRINT-ONLY S51 blue/green rollback rehearsal generator.
//
// This module validates exact Cloud Run revision targets through the production deploy helper and
// renders the candidate -> rollback -> forward-restoration procedure. It has no execution mode,
// imports no process runner or cloud client, and never performs a network request.

import { pathToFileURL } from "node:url";

import { buildRevisionTrafficCommand } from "./deploy-demo-cloud-run.mjs";

const DEFAULT_PROJECT_ID = "pmi-kc-kb-prod";
const DEFAULT_REGION = "us-central1";
const DEFAULT_SERVICE = "pmi-kc-app";
const MAX_REVISION_NAME_LENGTH = 63;
const ALLOWED_VALUE_FLAGS = new Set([
  "candidate-revision",
  "generated-at",
  "prior-revision",
  "project",
  "region",
  "service",
]);
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const REGION_PATTERN = /^[a-z]+-[a-z]+[0-9]$/;
const SERVICE_PATTERN = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const SHELL_SAFE_ARGUMENT_PATTERN = /^[A-Za-z0-9_./:@%+=,-]+$/;
const VALIDATED_CONFIGS = new WeakSet();
const VALIDATED_PLANS = new WeakSet();

export class RollbackRehearsalRefusal extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RollbackRehearsalRefusal";
    this.code = code;
  }
}

export function resolveRollbackRehearsalConfig(
  argv = process.argv.slice(2),
  { now = new Date() } = {},
) {
  const parsed = parseRollbackArgs(argv);
  const project = parsed.values.get("project") ?? DEFAULT_PROJECT_ID;
  const region = parsed.values.get("region") ?? DEFAULT_REGION;
  const service = parsed.values.get("service") ?? DEFAULT_SERVICE;

  if (!PROJECT_PATTERN.test(project)) {
    refuse("project_invalid", "the project id is malformed or shell-unsafe");
  }
  if (!REGION_PATTERN.test(region)) {
    refuse("region_invalid", "the region is malformed or shell-unsafe");
  }
  if (!SERVICE_PATTERN.test(service)) {
    refuse("service_invalid", "the service name is malformed or shell-unsafe");
  }

  const candidateRevision = requireRevision(
    parsed.values.get("candidate-revision"),
    "candidate",
  );
  const priorRevision = requireRevision(parsed.values.get("prior-revision"), "prior");
  const targetArgv = [
    `--project=${project}`,
    `--region=${region}`,
    `--service=${service}`,
  ];
  validateTrafficTarget({
    argv: targetArgv,
    kind: "candidate",
    revision: candidateRevision,
    service,
  });
  validateTrafficTarget({
    argv: targetArgv,
    kind: "prior",
    revision: priorRevision,
    service,
  });

  if (candidateRevision === priorRevision) {
    refuse(
      "revision_targets_not_distinct",
      "candidate and prior revisions must be different exact targets",
    );
  }

  const generatedAt = resolveGeneratedAt(parsed.values.get("generated-at"), now);
  const config = Object.freeze({
    candidateRevision,
    generatedAt,
    priorRevision,
    project,
    region,
    service,
  });
  VALIDATED_CONFIGS.add(config);
  return config;
}

export function buildRollbackRehearsalPlan(config) {
  assertValidatedConfig(config);

  // Rebuild exact traffic commands from the frozen validated scalar target. Keeping mutable command
  // objects out of the validated configuration prevents post-validation command/target drift.
  const targetArgv = [
    `--project=${config.project}`,
    `--region=${config.region}`,
    `--service=${config.service}`,
  ];
  const candidateTrafficCommand = validateTrafficTarget({
    argv: targetArgv,
    kind: "candidate",
    revision: config.candidateRevision,
    service: config.service,
  });
  const priorTrafficCommand = validateTrafficTarget({
    argv: targetArgv,
    kind: "prior",
    revision: config.priorRevision,
    service: config.service,
  });
  const candidateDescribe = command("gcloud", [
    "run",
    "revisions",
    "describe",
    config.candidateRevision,
    `--project=${config.project}`,
    `--region=${config.region}`,
    "--format=value(metadata.name)",
  ]);
  const trafficReadback = command("gcloud", [
    "run",
    "services",
    "describe",
    config.service,
    `--project=${config.project}`,
    `--region=${config.region}`,
    "--format=json(status.traffic)",
  ]);
  const promoteCandidate = command(
    candidateTrafficCommand.command,
    candidateTrafficCommand.args,
  );
  const rollbackPrior = command(priorTrafficCommand.command, priorTrafficCommand.args);
  const restoreForward = command(
    candidateTrafficCommand.command,
    candidateTrafficCommand.args,
  );
  const steps = [
    {
      id: "resolve_candidate",
      status: "required_before_promotion",
      commands: [candidateDescribe],
      instruction:
        "Read back the exact candidate revision. Refuse if the returned revision is not byte-equal to candidate_revision.",
    },
    {
      id: "capture_prior",
      status: "required_before_promotion",
      commands: [trafficReadback],
      instruction:
        "Before promotion, capture the one serving revision at 100 percent and confirm it is byte-equal to prior_revision.",
    },
    {
      id: "promote_candidate",
      status: "planned",
      commands: [promoteCandidate, trafficReadback],
      instruction:
        "Promote only candidate_revision, then read back traffic and record counts only.",
    },
    {
      id: "verify_candidate",
      status: "planned",
      commands: [],
      instruction:
        "Run the bounded unauthenticated redirect and authenticated shell checks. Record HTTP codes and counts, never response bodies.",
    },
    {
      id: "rollback_prior",
      status: "planned",
      commands: [rollbackPrior, trafficReadback],
      instruction:
        "Restore 100 percent traffic to prior_revision, read back traffic, and repeat the bounded checks.",
    },
    {
      id: "restore_forward",
      status: "planned",
      commands: [restoreForward, trafficReadback],
      instruction:
        "Restore 100 percent traffic to candidate_revision, read back traffic, and repeat the bounded checks.",
    },
  ];
  const commandsPrinted = steps.reduce((count, step) => count + step.commands.length, 0);

  const frozenSteps = Object.freeze(
    steps.map((step) =>
      Object.freeze({
        ...step,
        commands: Object.freeze([...step.commands]),
      }),
    ),
  );
  const plan = Object.freeze({
    evidence: Object.freeze({
      candidate_revision: config.candidateRevision,
      prior_revision: config.priorRevision,
      generated_at: config.generatedAt,
      status: "dry_run",
      http_codes: Object.freeze([]),
      counts: Object.freeze({
        commands_executed: 0,
        commands_printed: commandsPrinted,
        http_codes_recorded: 0,
        traffic_mutations_executed: 0,
      }),
    }),
    steps: frozenSteps,
  });
  VALIDATED_PLANS.add(plan);
  return plan;
}

export function renderRollbackRehearsalPlan(
  config,
  plan = buildRollbackRehearsalPlan(config),
) {
  assertValidatedConfig(config);
  assertValidatedPlan(plan);
  const lines = [
    "S51 blue/green rollback rehearsal (PRINT-ONLY - nothing was executed).",
    "Evidence allowlist: revision names, timestamps, status, HTTP codes, and counts only.",
    "",
    "# Dry-run evidence",
    JSON.stringify(plan.evidence),
    "",
    "# Procedure",
  ];

  for (const [index, step] of plan.steps.entries()) {
    lines.push(`${index + 1}. ${step.id} [${step.status}]`, `# ${step.instruction}`);
    for (const plannedCommand of step.commands) {
      lines.push(renderCommand(plannedCommand));
    }
    lines.push("");
  }

  lines.push(
    "# Completed evidence must keep only the allowlisted fields; do not retain response or log bodies.",
  );
  return lines.join("\n");
}

export function main(argv = process.argv.slice(2), dependencies = {}) {
  const stdout = dependencies.stdout ?? ((value) => console.log(value));
  const stderr = dependencies.stderr ?? ((value) => console.error(value));
  const setExitCode =
    dependencies.setExitCode ??
    ((value) => {
      process.exitCode = value;
    });

  try {
    const config = resolveRollbackRehearsalConfig(argv, {
      now: dependencies.now ?? new Date(),
    });
    const plan = buildRollbackRehearsalPlan(config);
    const output = renderRollbackRehearsalPlan(config, plan);
    stdout(output);
    return { status: "rendered", config, plan, output };
  } catch (error) {
    const refusal = safeRefusal(error);
    stderr(`Rollback rehearsal refused: ${refusal.code}: ${refusal.message}.`);
    setExitCode(1);
    return { status: "refused", ...refusal };
  }
}

function parseRollbackArgs(argv) {
  const values = new Map();
  let dryRun = false;
  for (const raw of argv) {
    if (raw === "--dry-run") {
      if (dryRun) {
        refuse("argument_duplicate", "--dry-run was supplied more than once");
      }
      dryRun = true;
      continue;
    }
    if (typeof raw !== "string" || !raw.startsWith("--") || !raw.includes("=")) {
      refuse(
        "argument_shape_invalid",
        "only exact --name=value arguments and --dry-run are supported",
      );
    }
    const separator = raw.indexOf("=");
    const name = raw.slice(2, separator);
    const value = raw.slice(separator + 1);
    if (!ALLOWED_VALUE_FLAGS.has(name)) {
      refuse("argument_unsupported", "an unsupported rehearsal flag was supplied");
    }
    if (!value) {
      refuse("argument_value_required", `--${name} requires a value`);
    }
    if (values.has(name)) {
      refuse("argument_duplicate", `--${name} was supplied more than once`);
    }
    values.set(name, value);
  }
  return { dryRun, values };
}

function requireRevision(value, kind) {
  if (typeof value !== "string" || value.length === 0) {
    refuse(`${kind}_revision_required`, `an exact ${kind} revision is required`);
  }
  return value;
}

function validateTrafficTarget({ argv, kind, revision, service }) {
  try {
    return buildRevisionTrafficCommand({
      argv,
      env: { GCLOUD_BIN: "gcloud" },
      localEnv: {},
      revision,
    });
  } catch {
    if (revision.length > MAX_REVISION_NAME_LENGTH) {
      refuse(
        `${kind}_revision_too_long`,
        `${kind} revision exceeds the 63-character Cloud Run limit`,
      );
    }
    if (!revision.startsWith(`${service}-`)) {
      refuse(
        `${kind}_revision_service_mismatch`,
        `${kind} revision does not belong to the target service`,
      );
    }
    refuse(
      `${kind}_revision_invalid`,
      `${kind} revision is not a valid exact Cloud Run target`,
    );
  }
}

function resolveGeneratedAt(value, now) {
  if (value !== undefined) {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
      refuse(
        "generated_at_invalid",
        "--generated-at must be an exact ISO-8601 UTC timestamp",
      );
    }
    return value;
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    refuse("generated_at_invalid", "the rehearsal timestamp is invalid");
  }
  return now.toISOString();
}

function command(executable, args) {
  return Object.freeze({
    command: executable,
    args: Object.freeze([...args]),
  });
}

function renderCommand(plannedCommand) {
  return [plannedCommand.command, ...plannedCommand.args]
    .map(renderShellArgument)
    .join(" ");
}

function renderShellArgument(value) {
  if (SHELL_SAFE_ARGUMENT_PATTERN.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function assertValidatedConfig(config) {
  if (!config || typeof config !== "object" || !VALIDATED_CONFIGS.has(config)) {
    refuse(
      "configuration_unvalidated",
      "rehearsal rendering requires an exact validated configuration",
    );
  }
}

function assertValidatedPlan(plan) {
  if (!plan || typeof plan !== "object" || !VALIDATED_PLANS.has(plan)) {
    refuse("plan_unvalidated", "rehearsal output requires a generated value-free plan");
  }
}

function safeRefusal(error) {
  if (error instanceof RollbackRehearsalRefusal) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "rollback_rehearsal_invalid",
    message: "the rehearsal configuration is invalid",
  };
}

function refuse(code, message) {
  throw new RollbackRehearsalRefusal(code, message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
