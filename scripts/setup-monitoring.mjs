// PRINT-ONLY S51 monitoring runbook generator.
//
// This module validates committed definitions and renders owner-run commands. It never imports a
// cloud client or command runner, never opens a socket, and never executes any printed command.

import { pathToFileURL } from "node:url";

import {
  MONITORING_MANIFEST,
  loadMonitoringBundle,
  renderMonitoringBundle,
} from "../infra/monitoring/manifest.mjs";

const ALLOWED_VALUE_FLAGS = new Set(["operator-email", "project", "region", "service"]);
const VALIDATED_CONFIGS = new WeakSet();
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const REGION_PATTERN = /^[a-z]+-[a-z]+[0-9]$/;
const SERVICE_PATTERN = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const INTERNAL_EMAIL_PATTERN = /^[a-z0-9][a-z0-9._%+-]{0,63}@pmikcmetro\.com$/i;
const SHELL_VARIABLE_PATTERN = /^\$[A-Z][A-Z0-9_]*$/;

export class MonitoringPlanRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = "MonitoringPlanRefusal";
  }
}

export function resolveMonitoringConfig(
  argv = process.argv.slice(2),
  env = process.env,
  manifest = MONITORING_MANIFEST,
) {
  const parsed = parseMonitoringArgs(argv);
  const flagEmail = cleanOptional(parsed.values.get("operator-email"));
  const envEmail = cleanOptional(env.MONITORING_OPERATOR_EMAIL);
  if (flagEmail && envEmail && flagEmail.toLowerCase() !== envEmail.toLowerCase()) {
    refuse(
      "--operator-email and MONITORING_OPERATOR_EMAIL disagree; use one exact internal address",
    );
  }
  const operatorEmail = (flagEmail ?? envEmail)?.toLowerCase();
  if (!operatorEmail) {
    refuse(
      "an operator address is required through --operator-email or MONITORING_OPERATOR_EMAIL",
    );
  }
  if (!INTERNAL_EMAIL_PATTERN.test(operatorEmail)) {
    refuse("the operator address must be one exact pmikcmetro.com email address");
  }

  const project = parsed.values.get("project") ?? manifest.defaults.project;
  const region = parsed.values.get("region") ?? manifest.defaults.region;
  const service = parsed.values.get("service") ?? manifest.defaults.service;
  if (!PROJECT_PATTERN.test(project)) {
    refuse("the monitoring project id is malformed or shell-unsafe");
  }
  if (!REGION_PATTERN.test(region)) {
    refuse("the monitoring region is malformed or shell-unsafe");
  }
  if (!SERVICE_PATTERN.test(service)) {
    refuse("the Cloud Run service name is malformed or shell-unsafe");
  }

  const config = Object.freeze({
    json: parsed.json,
    operatorEmail,
    project,
    region,
    service,
  });
  VALIDATED_CONFIGS.add(config);
  return config;
}

export function buildMonitoringPlan(config, bundle = loadMonitoringBundle()) {
  assertValidatedConfig(config);
  const rendered = renderMonitoringBundle(bundle, config);
  const channel = bundle.manifest.channel;
  const metric = rendered.logMetrics[0];
  const policyCommands = rendered.policies.map((policy) => ({
    capture: `MONITORING_POLICY_${policy.key.toUpperCase()}_NAME`,
    command: "gcloud",
    args: [
      "monitoring",
      "policies",
      "create",
      `--project=${config.project}`,
      `--policy=${JSON.stringify(policy.definition)}`,
      "--notification-channels",
      "$MONITORING_CHANNEL_NAME",
      "--format=value(name)",
    ],
  }));

  return [
    {
      title:
        "1. Create the one internal operator notification channel and verify its address",
      notes: [
        "The named operator must complete Google's email verification before the channel can deliver. The read-only verifier requires verificationStatus=VERIFIED.",
      ],
      commands: [
        {
          capture: "MONITORING_CHANNEL_NAME",
          command: "gcloud",
          args: [
            "beta",
            "monitoring",
            "channels",
            "create",
            `--project=${config.project}`,
            `--display-name=${channel.displayName}`,
            `--type=${channel.type}`,
            `--channel-labels=email_address=${config.operatorEmail}`,
            `--user-labels=${renderLabels(channel.userLabels)}`,
            "--format=value(name)",
          ],
        },
        {
          command: "test",
          args: ["-n", "$MONITORING_CHANNEL_NAME"],
        },
      ],
    },
    {
      title: "2. Create the A2 value-free counter metric",
      commands: [
        {
          command: "gcloud",
          args: [
            "logging",
            "metrics",
            "create",
            metric.metricId,
            `--project=${config.project}`,
            `--description=${metric.definition.description}`,
            `--log-filter=${metric.definition.filter}`,
          ],
        },
      ],
    },
    {
      title: "3. Create and attach the four alert policies",
      commands: policyCommands,
    },
    {
      title: "4. Read back the managed resources",
      commands: [
        {
          command: "gcloud",
          args: [
            "beta",
            "monitoring",
            "channels",
            "list",
            `--project=${config.project}`,
            '--filter=userLabels.managed_by="pmi_kc" AND userLabels.suite="s51"',
            "--format=value(name,displayName,type,enabled,verificationStatus)",
          ],
        },
        {
          command: "gcloud",
          args: [
            "logging",
            "metrics",
            "describe",
            metric.metricId,
            `--project=${config.project}`,
            "--format=json",
          ],
        },
        {
          command: "gcloud",
          args: [
            "monitoring",
            "policies",
            "list",
            `--project=${config.project}`,
            '--filter=userLabels.managed_by="pmi_kc" AND userLabels.suite="s51"',
            "--format=value(name,displayName,enabled)",
          ],
        },
      ],
    },
    {
      title: "Rollback only if the newly created monitoring bundle must be removed",
      commands: [
        ...[...rendered.policies].reverse().map((policy) => ({
          command: "gcloud",
          args: [
            "monitoring",
            "policies",
            "delete",
            `$MONITORING_POLICY_${policy.key.toUpperCase()}_NAME`,
            `--project=${config.project}`,
            "--quiet",
          ],
        })),
        {
          command: "gcloud",
          args: [
            "logging",
            "metrics",
            "delete",
            metric.metricId,
            `--project=${config.project}`,
            "--quiet",
          ],
        },
        {
          command: "gcloud",
          args: [
            "beta",
            "monitoring",
            "channels",
            "delete",
            "$MONITORING_CHANNEL_NAME",
            `--project=${config.project}`,
            "--quiet",
          ],
        },
      ],
    },
  ];
}

export function renderMonitoringPlan(config, plan = buildMonitoringPlan(config)) {
  assertValidatedConfig(config);
  const lines = [
    "S51 production monitoring runbook (PRINT-ONLY - nothing here was executed).",
    "Owner-run cloud resource creation. Review the full plan before running any command.",
    "",
    `  project  ${config.project}`,
    `  region   ${config.region}`,
    `  service  ${config.service}`,
    "  channel  one internal pmikcmetro.com operator address supplied at runtime",
    "",
  ];
  for (const step of plan) {
    lines.push(`# ${step.title}`);
    for (const note of step.notes ?? []) lines.push(`# NOTE: ${note}`);
    for (const command of step.commands) lines.push(renderCommand(command));
    lines.push("");
  }
  return lines.join("\n");
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  dependencies = {},
) {
  const stdout = dependencies.stdout ?? ((value) => console.log(value));
  const stderr = dependencies.stderr ?? ((value) => console.error(value));
  const setExitCode =
    dependencies.setExitCode ??
    ((value) => {
      process.exitCode = value;
    });

  try {
    const config = resolveMonitoringConfig(argv, env, dependencies.manifest);
    const bundle = dependencies.bundle ?? loadMonitoringBundle();
    const plan = buildMonitoringPlan(config, bundle);
    const output = config.json
      ? JSON.stringify(
          {
            mode: "print-only",
            target: {
              project: config.project,
              region: config.region,
              service: config.service,
            },
            channel: { type: "email", domain: "pmikcmetro.com" },
            steps: plan,
          },
          null,
          2,
        )
      : renderMonitoringPlan(config, plan);
    stdout(output);
    return { status: "rendered", config, plan, output };
  } catch (error) {
    const reason = safeErrorMessage(error);
    stderr(`Monitoring plan refused: ${reason}.`);
    setExitCode(1);
    return { status: "refused", reason };
  }
}

function parseMonitoringArgs(argv) {
  const values = new Map();
  let json = false;
  for (const raw of argv) {
    if (raw === "--json") {
      if (json) refuse("--json was supplied more than once");
      json = true;
      continue;
    }
    if (typeof raw !== "string" || !raw.startsWith("--") || !raw.includes("=")) {
      refuse("unsupported monitoring planner argument shape");
    }
    const separator = raw.indexOf("=");
    const name = raw.slice(2, separator);
    const value = raw.slice(separator + 1).trim();
    if (!ALLOWED_VALUE_FLAGS.has(name)) {
      refuse("unsupported monitoring planner flag");
    }
    if (!value) refuse(`--${name} requires a value`);
    if (values.has(name)) refuse(`--${name} was supplied more than once`);
    values.set(name, value);
  }
  return { json, values };
}

function renderCommand(command) {
  const rendered = [command.command, ...command.args].map(renderShellArgument).join(" ");
  return command.capture ? `${command.capture}="$(${rendered})"` : rendered;
}

function renderShellArgument(value) {
  if (SHELL_VARIABLE_PATTERN.test(value)) return `"${value}"`;
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function renderLabels(labels) {
  return Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

function assertValidatedConfig(config) {
  if (!config || typeof config !== "object" || !VALIDATED_CONFIGS.has(config)) {
    refuse("monitoring rendering requires an exact validated configuration");
  }
}

function cleanOptional(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function safeErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message.replace(/[\r\n]+/g, " ").slice(0, 300)
    : "monitoring configuration is invalid";
}

function refuse(message) {
  throw new MonitoringPlanRefusal(message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Monitoring plan failed unexpectedly.");
    process.exitCode = 1;
  });
}
