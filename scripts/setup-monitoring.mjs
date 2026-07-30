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
const VALIDATED_PLANS = new WeakSet();
const PROJECT_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const REGION_PATTERN = /^[a-z]+-[a-z]+[0-9]$/;
const SERVICE_PATTERN = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const INTERNAL_EMAIL_PATTERN = /^[a-z0-9][a-z0-9._%+-]{0,63}@pmikcmetro\.com$/i;
const SHELL_VARIABLE_PATTERN = /^\$[A-Z][A-Z0-9_]*$/;
const SHELL_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const PREFLIGHT_READY_VARIABLE = "S51_MONITORING_PREFLIGHT_READY";
const PREFLIGHT_FAILED_VARIABLE = "S51_MONITORING_PREFLIGHT_FAILED";
const MUTATION_FAILED_VARIABLE = "S51_MONITORING_MUTATION_FAILED";

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
  const directLogViewerMember = `user:${config.operatorEmail}`;
  const directUnconditionalLogViewerFilter =
    `bindings.role="roles/logging.viewer" AND ` +
    `bindings.members="${directLogViewerMember}" AND ` +
    `-bindings.condition:*`;
  const managedResourceFilter =
    'userLabels.managed_by="pmi_kc" AND userLabels.suite="s51"';
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
    mutationMarker: `MONITORING_POLICY_${policy.key.toUpperCase()}_CREATED_BY_THIS_RUN`,
    requireNonemptyCapture: true,
  }));

  const plan = [
    {
      title: "1. Read-only fresh-setup and before-state preflight (no cloud mutation)",
      notes: [
        "Every capture is checked independently. A failed read is never treated as an empty result. Fresh setup refuses if an S51 managed channel, policy, or the fixed A2 metric already exists; run monitoring:verify and use a separately reviewed manual recovery instead.",
        "All five captures and the final readiness marker must run in this shell before any setup mutation. Every later mutation checks that marker again.",
      ],
      commands: [
        {
          kind: "preflight-start",
        },
        {
          kind: "checked-capture",
          capture: "MONITORING_CHANNELS_BEFORE",
          command: "gcloud",
          args: [
            "beta",
            "monitoring",
            "channels",
            "list",
            `--project=${config.project}`,
            `--filter=${managedResourceFilter}`,
            "--format=value(name)",
          ],
          captureRule: "must-be-empty",
          failureCode: "managed_channel_inventory_unreadable",
          conflictCode: "managed_channel_already_exists",
        },
        {
          kind: "checked-capture",
          capture: "MONITORING_POLICIES_BEFORE",
          command: "gcloud",
          args: [
            "monitoring",
            "policies",
            "list",
            `--project=${config.project}`,
            `--filter=${managedResourceFilter}`,
            "--format=value(name)",
          ],
          captureRule: "must-be-empty",
          failureCode: "managed_policy_inventory_unreadable",
          conflictCode: "managed_policy_already_exists",
        },
        {
          kind: "checked-capture",
          capture: "MONITORING_METRIC_BEFORE",
          command: "gcloud",
          args: [
            "logging",
            "metrics",
            "list",
            `--project=${config.project}`,
            `--filter=name="${metric.metricId}"`,
            "--format=value(name)",
          ],
          captureRule: "must-be-empty",
          failureCode: "managed_metric_inventory_unreadable",
          conflictCode: "managed_metric_already_exists",
        },
        {
          kind: "checked-capture",
          capture: "LOG_BUCKET_RETENTION_DAYS_BEFORE",
          command: "gcloud",
          args: [
            "logging",
            "buckets",
            "describe",
            "_Default",
            `--project=${config.project}`,
            "--location=global",
            "--format=value(retentionDays)",
          ],
          captureRule: "positive-integer",
          failureCode: "log_retention_before_state_unreadable",
          conflictCode: "log_retention_before_state_invalid",
        },
        {
          kind: "checked-capture",
          capture: "LOG_VIEWER_BINDING_BEFORE",
          command: "gcloud",
          args: [
            "projects",
            "get-iam-policy",
            config.project,
            "--flatten=bindings[].members",
            `--filter=${directUnconditionalLogViewerFilter}`,
            "--format=value(bindings.role)",
          ],
          captureRule: "empty-or-exact-log-viewer",
          failureCode: "log_viewer_before_state_unreadable",
          conflictCode: "log_viewer_before_state_invalid",
        },
        {
          kind: "preflight-finalize",
        },
      ],
    },
    {
      title:
        "2. Create the one internal operator notification channel and verify its address",
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
          mutationMarker: "MONITORING_CHANNEL_CREATED_BY_THIS_RUN",
          requireNonemptyCapture: true,
        },
      ],
    },
    {
      title: "3. Create the A2 value-free counter metric",
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
          mutationMarker: "MONITORING_METRIC_CREATED_BY_THIS_RUN",
        },
      ],
    },
    {
      title: "4. Create and attach the four alert policies",
      commands: policyCommands,
    },
    {
      title:
        "5. Set explicit log retention and grant only a missing direct log-viewer binding",
      notes: [
        "The checked preflight already captured both before-states. The IAM mutation runs only when that successful capture proved the exact unconditional binding absent. A conditional binding does not count as the unconditional binding setup adds.",
        "This grants only roles/logging.viewer. It does not grant private-log access and does not remove or narrow any inherited or primitive project role.",
      ],
      commands: [
        {
          command: "gcloud",
          args: [
            "logging",
            "buckets",
            "update",
            "_Default",
            `--project=${config.project}`,
            "--location=global",
            "--retention-days=30",
          ],
          mutationMarker: "LOG_RETENTION_CHANGED_BY_THIS_RUN",
        },
        {
          command: "gcloud",
          args: [
            "projects",
            "add-iam-policy-binding",
            config.project,
            `--member=${directLogViewerMember}`,
            "--role=roles/logging.viewer",
            "--condition=None",
          ],
          mutationMarker: "LOG_VIEWER_BINDING_ADDED_BY_THIS_RUN",
          whenCaptureEmpty: "LOG_VIEWER_BINDING_BEFORE",
        },
      ],
    },
    {
      title: "6. Read back the managed resources and log-hygiene settings",
      commands: [
        {
          command: "gcloud",
          args: [
            "beta",
            "monitoring",
            "channels",
            "list",
            `--project=${config.project}`,
            `--filter=${managedResourceFilter}`,
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
            `--filter=${managedResourceFilter}`,
            "--format=value(name,displayName,enabled)",
          ],
        },
        {
          command: "gcloud",
          args: [
            "logging",
            "buckets",
            "describe",
            "_Default",
            `--project=${config.project}`,
            "--location=global",
            "--format=value(name,retentionDays)",
          ],
        },
        {
          command: "gcloud",
          args: [
            "projects",
            "get-iam-policy",
            config.project,
            "--flatten=bindings[].members",
            `--filter=${directUnconditionalLogViewerFilter}`,
            "--format=value(bindings.role,bindings.members)",
          ],
        },
      ],
    },
    {
      title:
        "Rollback only if the newly created monitoring and log-hygiene changes must be removed",
      notes: [
        "Do not run this section during setup. Every rollback mutation is guarded by a marker set only after this shell successfully created or changed that exact resource. An empty or failed before-state capture never authorizes removal.",
      ],
      commands: [
        {
          command: "gcloud",
          args: [
            "logging",
            "buckets",
            "update",
            "_Default",
            `--project=${config.project}`,
            "--location=global",
            "--retention-days",
            "$LOG_BUCKET_RETENTION_DAYS_BEFORE",
          ],
          rollbackMarker: "LOG_RETENTION_CHANGED_BY_THIS_RUN",
        },
        {
          command: "gcloud",
          args: [
            "projects",
            "remove-iam-policy-binding",
            config.project,
            `--member=${directLogViewerMember}`,
            "--role=roles/logging.viewer",
            "--condition=None",
          ],
          rollbackMarker: "LOG_VIEWER_BINDING_ADDED_BY_THIS_RUN",
        },
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
          rollbackMarker: `MONITORING_POLICY_${policy.key.toUpperCase()}_CREATED_BY_THIS_RUN`,
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
          rollbackMarker: "MONITORING_METRIC_CREATED_BY_THIS_RUN",
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
          rollbackMarker: "MONITORING_CHANNEL_CREATED_BY_THIS_RUN",
        },
      ],
    },
  ];
  const frozenPlan = Object.freeze(
    plan.map((step) =>
      Object.freeze({
        ...step,
        notes: Object.freeze([...(step.notes ?? [])]),
        commands: Object.freeze(
          step.commands.map((command) =>
            Object.freeze({
              ...command,
              ...(command.args ? { args: Object.freeze([...command.args]) } : {}),
            }),
          ),
        ),
      }),
    ),
  );
  VALIDATED_PLANS.add(frozenPlan);
  return frozenPlan;
}

export function renderMonitoringPlan(config, plan = buildMonitoringPlan(config)) {
  assertValidatedConfig(config);
  if (!plan || typeof plan !== "object" || !VALIDATED_PLANS.has(plan)) {
    refuse("monitoring rendering requires a generated plan");
  }
  const lines = [
    "# S51 production monitoring runbook (PRINT-ONLY - nothing here was executed).",
    "# Owner-run cloud resource creation. Review the full plan before running any command.",
    "",
    `# project  ${config.project}`,
    `# region   ${config.region}`,
    `# service  ${config.service}`,
    "# channel  one internal pmikcmetro.com operator address supplied at runtime",
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
  if (command?.kind === "preflight-start") {
    return [
      `${PREFLIGHT_READY_VARIABLE}=0`,
      `${PREFLIGHT_FAILED_VARIABLE}=0`,
      `${MUTATION_FAILED_VARIABLE}=0`,
    ].join("\n");
  }
  if (command?.kind === "checked-capture") {
    return renderCheckedCapture(command);
  }
  if (command?.kind === "preflight-finalize") {
    return [
      `if test "\${${PREFLIGHT_FAILED_VARIABLE}:-1}" = 0; then`,
      `  ${PREFLIGHT_READY_VARIABLE}=1`,
      `  printf '%s\\n' 'S51 monitoring preflight ready: fresh setup may proceed.'`,
      "else",
      `  ${PREFLIGHT_READY_VARIABLE}=0`,
      `  printf '%s\\n' 'S51 monitoring preflight refused: run monitoring:verify and use reviewed manual recovery; no setup mutation is allowed.' >&2`,
      "  false",
      "fi",
    ].join("\n");
  }

  if (!command || typeof command !== "object") {
    refuse("monitoring plan contains an invalid command");
  }
  if (command.mutationMarker && command.rollbackMarker) {
    refuse("monitoring command cannot be both a setup mutation and a rollback");
  }

  const rendered = [command.command, ...command.args].map(renderShellArgument).join(" ");
  const invocation = command.capture ? `${command.capture}="$(${rendered})"` : rendered;
  if (command.mutationMarker) {
    return renderGuardedMutation(command, invocation);
  }
  if (command.rollbackMarker) {
    return renderGuardedRollback(command, invocation);
  }
  return invocation;
}

function renderCheckedCapture(command) {
  const capture = assertShellName(command.capture, "preflight capture");
  const rendered = [command.command, ...command.args].map(renderShellArgument).join(" ");
  const failureLine = renderRefusalLine(command.failureCode);
  const conflictLine = renderRefusalLine(command.conflictCode);
  const lines = [`if ${capture}="$(${rendered})"; then`];

  if (command.captureRule === "must-be-empty") {
    lines.push(
      `  if test -n "$${capture}"; then`,
      `    ${PREFLIGHT_FAILED_VARIABLE}=1`,
      `    ${conflictLine}`,
      "  fi",
    );
  } else if (command.captureRule === "positive-integer") {
    lines.push(
      `  case "$${capture}" in`,
      '    ""|0|*[!0-9]*)',
      `      ${PREFLIGHT_FAILED_VARIABLE}=1`,
      `      ${conflictLine}`,
      "      ;;",
      "  esac",
    );
  } else if (command.captureRule === "empty-or-exact-log-viewer") {
    lines.push(
      `  case "$${capture}" in`,
      '    ""|roles/logging.viewer) ;;',
      "    *)",
      `      ${PREFLIGHT_FAILED_VARIABLE}=1`,
      `      ${conflictLine}`,
      "      ;;",
      "  esac",
    );
  } else {
    refuse("monitoring preflight capture has an invalid rule");
  }

  lines.push(
    "else",
    `  unset ${capture}`,
    `  ${PREFLIGHT_FAILED_VARIABLE}=1`,
    `  ${failureLine}`,
    "fi",
  );
  return lines.join("\n");
}

function renderGuardedMutation(command, invocation) {
  const marker = assertShellName(command.mutationMarker, "mutation marker");
  const capture = command.capture
    ? assertShellName(command.capture, "mutation capture")
    : undefined;
  const whenCaptureEmpty = command.whenCaptureEmpty
    ? assertShellName(command.whenCaptureEmpty, "mutation before-state capture")
    : undefined;
  if (command.requireNonemptyCapture && !capture) {
    refuse("monitoring mutation requires a capture before checking it");
  }

  const successLines = command.requireNonemptyCapture
    ? [
        `if ${invocation}; then`,
        `  if test -n "$${capture}"; then`,
        `    ${marker}=1`,
        "  else",
        `    ${MUTATION_FAILED_VARIABLE}=1`,
        `    ${PREFLIGHT_READY_VARIABLE}=0`,
        `    printf '%s\\n' 'S51 monitoring setup refused: created resource name was empty; use reviewed manual recovery.' >&2`,
        "    false",
        "  fi",
        "else",
        `  unset ${capture}`,
        `  ${MUTATION_FAILED_VARIABLE}=1`,
        `  ${PREFLIGHT_READY_VARIABLE}=0`,
        `  printf '%s\\n' 'S51 monitoring setup mutation failed; use reviewed manual recovery.' >&2`,
        "  false",
        "fi",
      ]
    : [
        `if ${invocation}; then`,
        `  ${marker}=1`,
        "else",
        `  ${MUTATION_FAILED_VARIABLE}=1`,
        `  ${PREFLIGHT_READY_VARIABLE}=0`,
        `  printf '%s\\n' 'S51 monitoring setup mutation failed; use reviewed manual recovery.' >&2`,
        "  false",
        "fi",
      ];

  const guardedSuccessLines = whenCaptureEmpty
    ? [
        `if test -z "$${whenCaptureEmpty}"; then`,
        ...successLines.map((line) => `  ${line}`),
        "else",
        `  printf '%s\\n' 'S51 monitoring setup note: the exact unconditional log-viewer binding already existed; no IAM mutation was made.'`,
        "fi",
      ]
    : successLines;

  return [
    `if test "\${${PREFLIGHT_READY_VARIABLE}:-0}" = 1 && test "\${${MUTATION_FAILED_VARIABLE}:-0}" = 0 && test "\${${marker}:-0}" = 0; then`,
    ...guardedSuccessLines.map((line) => `  ${line}`),
    "else",
    `  printf '%s\\n' 'S51 monitoring setup refused: checked preflight is unavailable, a prior mutation failed, or this mutation already ran.' >&2`,
    "  false",
    "fi",
  ].join("\n");
}

function renderGuardedRollback(command, invocation) {
  const marker = assertShellName(command.rollbackMarker, "rollback marker");
  return [
    `if test "\${${marker}:-0}" = 1; then`,
    `  if ${invocation}; then`,
    `    ${marker}=0`,
    `    ${PREFLIGHT_READY_VARIABLE}=0`,
    "  else",
    `    printf '%s\\n' 'S51 monitoring rollback mutation failed; keep the run marker and use reviewed manual recovery.' >&2`,
    "    false",
    "  fi",
    "fi",
  ].join("\n");
}

function renderRefusalLine(code) {
  if (typeof code !== "string" || !/^[a-z0-9_]+$/.test(code)) {
    refuse("monitoring preflight refusal code is invalid");
  }
  return `printf '%s\\n' 'S51 monitoring preflight refused: ${code}. Run monitoring:verify and use reviewed manual recovery; no setup mutation is allowed.' >&2`;
}

function assertShellName(value, label) {
  if (typeof value !== "string" || !SHELL_NAME_PATTERN.test(value)) {
    refuse(`monitoring ${label} is invalid`);
  }
  return value;
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
