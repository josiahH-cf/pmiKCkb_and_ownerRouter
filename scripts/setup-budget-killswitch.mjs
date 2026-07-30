// PRINT-ONLY runbook generator for the budget kill switch (infra/budget-guardrail).
//
// This script NEVER executes a gcloud / billing-console command or constructs a cloud client.
// Creating a budget, deploying the function, and granting billing IAM are owner-side actions. The
// planner renders only after the protected S52 ceiling source supplies one exact armed project row
// with non-null, ordered thresholds. Missing or unresolved authority produces no command output.

import { pathToFileURL } from "node:url";

const DEFAULT_PROJECT_ID = "pmi-kc-kb-prod";
const DEFAULTS = Object.freeze({
  billingAccount: "01A5A3-65CA5A-614D45",
  region: "us-central1",
  topic: "budget-guardrail-topic",
  serviceAccount: "budget-guardrail",
  source: "infra/budget-guardrail",
  runtime: "nodejs20",
});
const ALLOWED_VALUE_FLAGS = new Set([
  "project",
  "project-number",
  "region",
  "service-account",
  "topic",
]);
const FORBIDDEN_DOLLAR_FLAG = /(?:alert|budget-amount|cap|ceiling|threshold|usd)/i;
const FORBIDDEN_DOLLAR_ENV =
  /(?:(?:BUDGET|COST|KILL_SWITCH).*(?:ALERT|AMOUNT|CAP|CEILING|THRESHOLD|USD)|(?:ALERT|CAP|CEILING|THRESHOLD).*(?:DOLLAR|USD))/;
const VALIDATED_CONFIGS = new WeakSet();

class BudgetPlanRefusal extends Error {
  constructor(message) {
    super(message);
    this.name = "BudgetPlanRefusal";
  }
}

/**
 * Resolve one exact executable project row. Dollar values never come from argv or env.
 */
export function resolveConfig(
  argv = process.argv.slice(2),
  env = process.env,
  ceilingSource,
) {
  const args = parseArgs(argv);
  assertNoDollarEnvironmentOverride(env);
  const requested = resolveRequestedProject(args.values);
  const source = validateCeilingSource(ceilingSource);
  const row = source.rows.find((candidate) => candidate.projectId === requested.project);
  if (!row) {
    refuse(`project ${requested.project} has no exact COST_CEILING_PROJECTS source row`);
  }
  if (
    requested.projectNumber !== undefined &&
    requested.projectNumber !== row.projectNumber
  ) {
    refuse("the supplied --project and --project-number do not match one source row");
  }
  if (row.posture !== "armed") {
    refuse(
      `project ${row.projectId} is ${row.posture}; only an exact armed row may render a plan`,
    );
  }
  assertOrderedThresholds(row.alertUsd, row.ceilingUsd, "selected project row");
  if (
    row.projectId === DEFAULT_PROJECT_ID &&
    (row.alertUsd !== source.productionAlertUsd ||
      row.ceilingUsd !== source.productionCeilingUsd)
  ) {
    refuse(
      "the Production project row does not match the named Production alert and ceiling exports",
    );
  }

  const region = args.values.get("region") ?? DEFAULTS.region;
  const topic = args.values.get("topic") ?? DEFAULTS.topic;
  const serviceAccount = args.values.get("service-account") ?? DEFAULTS.serviceAccount;
  assertShellSafeConfig({
    billingAccount: DEFAULTS.billingAccount,
    project: row.projectId,
    projectNumber: row.projectNumber,
    region,
    serviceAccount,
    topic,
  });

  const ceilingUsd = canonicalDollar(row.ceilingUsd);
  const alertUsd = canonicalDollar(row.alertUsd);
  const config = Object.freeze({
    project: row.projectId,
    projectNumber: row.projectNumber,
    billingAccount: DEFAULTS.billingAccount,
    region,
    topic,
    serviceAccount,
    serviceAccountEmail: `${serviceAccount}@${row.projectId}.iam.gserviceaccount.com`,
    topicPath: `projects/${row.projectId}/topics/${topic}`,
    alertUsd: row.alertUsd,
    alertUsdText: alertUsd,
    ceilingUsd: row.ceilingUsd,
    ceilingUsdText: ceilingUsd,
    alertThresholdRatio: canonicalRatio(row.alertUsd / row.ceilingUsd),
    safeTestCostUsdText: canonicalDollar(row.alertUsd / 2),
    source: DEFAULTS.source,
    runtime: DEFAULTS.runtime,
  });
  VALIDATED_CONFIGS.add(config);
  return config;
}

export function buildRunbook(config) {
  assertValidatedConfig(config);
  return [
    {
      title: "0. Authenticate + enable APIs (owner; uses the pmikcmetro.com account)",
      commands: [
        "gcloud auth login",
        `gcloud config set project ${config.project}`,
        `gcloud services enable billingbudgets.googleapis.com cloudbilling.googleapis.com pubsub.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com --project=${config.project}`,
      ],
    },
    {
      title: "1. Create the Pub/Sub topic the budget will publish to",
      commands: [
        `gcloud pubsub topics create ${config.topic} --project=${config.project}`,
      ],
    },
    {
      title:
        "2. Create the function's service account and grant the least-privilege role that can disable billing",
      commands: [
        `gcloud iam service-accounts create ${config.serviceAccount} --display-name="Budget kill switch" --project=${config.project}`,
        `gcloud projects add-iam-policy-binding ${config.project} --member="serviceAccount:${config.serviceAccountEmail}" --role="roles/billing.projectManager"`,
        "# Project Billing Manager is project-scoped and can UNLINK this project's billing (i.e. disable it).",
        "# It does NOT grant billing-account-wide admin. Re-linking a billing account (recovery) stays a human action.",
      ],
    },
    {
      title:
        "3. Deploy the kill-switch function (2nd gen; buildpack runs npm install from package.json)",
      commands: [
        `gcloud functions deploy budget-guardrail --gen2 --runtime=${config.runtime} --region=${config.region} --source=${config.source} --entry-point=budgetGuardrail --trigger-topic=${config.topic} --service-account=${config.serviceAccountEmail} --set-env-vars=KILL_SWITCH_PROJECT_ID=${config.project},KILL_SWITCH_ALERT_USD=${config.alertUsdText},KILL_SWITCH_CAP_USD=${config.ceilingUsdText} --project=${config.project}`,
      ],
    },
    {
      title:
        "3b. Allow the Eventarc trigger (it runs as the function SA) to invoke the Run service",
      commands: [
        `gcloud run services add-iam-policy-binding budget-guardrail --region=${config.region} --project=${config.project} --member="serviceAccount:${config.serviceAccountEmail}" --role="roles/run.invoker"`,
        "# Needed because the function uses a custom SA; without it the trigger fails with 'lacks run.invoke'.",
      ],
    },
    {
      title: `4. Create the $${config.ceilingUsdText} project-scoped monthly budget (the CLI cannot attach the topic — see 4b)`,
      commands: [
        `gcloud billing budgets create --billing-account=${config.billingAccount} --display-name="${config.project} $${config.ceilingUsdText} kill switch" --filter-projects="projects/${config.projectNumber}" --budget-amount=${config.ceilingUsdText}USD --threshold-rule=percent=${config.alertThresholdRatio} --threshold-rule=percent=1.0`,
      ],
    },
    {
      title:
        "4b. Attach the topic to the budget in the CLOUD CONSOLE (this auto-grants the publisher role)",
      commands: [
        "# The budgets publisher SA is billing-budget-alert@system.gserviceaccount.com (NOT",
        "# billing-budgets@...). It cannot be bound via gcloud/IAM ('does not exist') — only the Console",
        "# budget->topic connect grants it. Path: Billing > Budgets & alerts > edit the budget > Manage",
        "# notifications > Connect a Pub/Sub topic > switch to THIS project > select the topic > Save.",
        "# If the org enforces domain restricted sharing (iam.allowedPolicyMemberDomains), the connect",
        "# fails until an org-policy admin temporarily relaxes it on this project (allowAll), connects,",
        "# then re-locks. Needs roles/orgpolicy.policyAdmin.",
        `# Topic to select: ${config.topicPath}`,
        "# This readback proves the Cloud Billing budgets publisher binding. The manual publish in",
        "# step 5 proves only the topic-to-function trigger and cannot substitute for this IAM proof.",
        `gcloud pubsub topics get-iam-policy ${config.topic} --project=${config.project} --flatten="bindings[].members" --filter='bindings.role="roles/pubsub.publisher" AND bindings.members="serviceAccount:billing-budget-alert@system.gserviceaccount.com"' --format="value(bindings.members)"`,
      ],
    },
    {
      title:
        "5. SAFE manual trigger test — publish below alert; this does not prove the budgets publisher binding",
      commands: [
        "# Run from bash/sh — PowerShell mangles the inner JSON quotes.",
        `gcloud pubsub topics publish ${config.topic} --project=${config.project} --message='{"costAmount":${config.safeTestCostUsdText},"budgetAmount":${config.ceilingUsdText},"currencyCode":"USD","budgetDisplayName":"wiring-test"}'`,
        `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="budget-guardrail" AND textPayload:"budget-guardrail]"' --project=${config.project} --freshness=5m --limit=5 --format="value(timestamp,textPayload)"`,
      ],
    },
  ];
}

export function renderRunbook(config) {
  assertValidatedConfig(config);
  const lines = [
    "Budget kill-switch provisioning runbook (PRINT-ONLY — nothing here was executed).",
    "These are billing-console + cost-bearing actions: run them yourself while authed, with approval.",
    "",
    `  project          ${config.project} (number ${config.projectNumber})`,
    `  billing account  ${config.billingAccount}`,
    `  region           ${config.region}`,
    `  topic            ${config.topic}`,
    `  function SA       ${config.serviceAccountEmail}`,
    `  alert            $${config.alertUsdText}`,
    `  monthly ceiling  $${config.ceilingUsdText}`,
    "",
    "SAFETY: never test the DISABLE path against a depended-on project — step 5 is below the",
    "selected alert threshold. Actual disable proof belongs only on a throwaway project.",
    "",
  ];
  for (const step of buildRunbook(config)) {
    lines.push(`# ${step.title}`);
    for (const command of step.commands) lines.push(command);
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
  const ceilingSource = Object.prototype.hasOwnProperty.call(
    dependencies,
    "ceilingSource",
  )
    ? dependencies.ceilingSource
    : null;

  let config;
  try {
    config = resolveConfig(argv, env, ceilingSource);
  } catch (error) {
    if (!(error instanceof BudgetPlanRefusal)) throw error;
    stderr(`Budget kill-switch plan refused: ${error.message}.`);
    setExitCode(1);
    return { status: "refused", reason: error.message };
  }

  const output = argv.includes("--json")
    ? JSON.stringify({ config, steps: buildRunbook(config) }, null, 2)
    : renderRunbook(config);
  stdout(output);
  return { status: "rendered", config, output };
}

function parseArgs(argv) {
  const values = new Map();
  let json = false;
  for (const raw of argv) {
    if (raw === "--json") {
      if (json) refuse("--json was supplied more than once");
      json = true;
      continue;
    }
    if (typeof raw !== "string" || !raw.startsWith("--") || !raw.includes("=")) {
      refuse(`unsupported planner argument ${String(raw)}`);
    }
    const separator = raw.indexOf("=");
    const name = raw.slice(2, separator);
    const value = raw.slice(separator + 1).trim();
    if (FORBIDDEN_DOLLAR_FLAG.test(name)) {
      refuse(
        `--${name} is forbidden; dollar values come only from the protected S52 ceiling source`,
      );
    }
    if (!ALLOWED_VALUE_FLAGS.has(name)) {
      refuse(`unsupported planner flag --${name}`);
    }
    if (!value) refuse(`--${name} requires a value`);
    if (values.has(name)) refuse(`--${name} was supplied more than once`);
    values.set(name, value);
  }
  return { json, values };
}

function assertNoDollarEnvironmentOverride(env) {
  for (const [name, value] of Object.entries(env)) {
    if (FORBIDDEN_DOLLAR_ENV.test(name) && cleanOptionalEnv(value) !== undefined) {
      refuse(`${name} cannot override the protected S52 alert or ceiling source`);
    }
  }
}

function resolveRequestedProject(values) {
  const flagProject = values.get("project");
  const flagProjectNumber = values.get("project-number");
  if ((flagProject === undefined) !== (flagProjectNumber === undefined)) {
    refuse("--project and --project-number must be supplied together");
  }
  if (flagProject !== undefined) {
    return { project: flagProject, projectNumber: flagProjectNumber };
  }
  return { project: DEFAULT_PROJECT_ID, projectNumber: undefined };
}

function validateCeilingSource(source) {
  if (!source || typeof source !== "object") {
    refuse("the protected S52 ceiling source is unavailable");
  }
  if (
    !Object.prototype.hasOwnProperty.call(source, "PRODUCTION_MONTHLY_ALERT_USD") ||
    !Object.prototype.hasOwnProperty.call(source, "PRODUCTION_MONTHLY_CEILING_USD") ||
    !Array.isArray(source.COST_CEILING_PROJECTS)
  ) {
    refuse("the protected S52 ceiling source is malformed");
  }
  assertOrderedThresholds(
    source.PRODUCTION_MONTHLY_ALERT_USD,
    source.PRODUCTION_MONTHLY_CEILING_USD,
    "named Production exports",
  );

  const projectIds = new Set();
  const projectNumbers = new Set();
  const rows = source.COST_CEILING_PROJECTS.map((row) => {
    if (!row || typeof row !== "object") {
      refuse("a COST_CEILING_PROJECTS row is malformed");
    }
    if (
      !validProjectId(row.projectId) ||
      !validProjectNumber(row.projectNumber) ||
      !["armed", "pending_verification", "unlinked"].includes(row.posture)
    ) {
      refuse("a COST_CEILING_PROJECTS row has invalid identity or posture");
    }
    if (projectIds.has(row.projectId) || projectNumbers.has(row.projectNumber)) {
      refuse("COST_CEILING_PROJECTS contains a duplicate project identity");
    }
    projectIds.add(row.projectId);
    projectNumbers.add(row.projectNumber);
    if (row.posture === "armed") {
      assertOrderedThresholds(row.alertUsd, row.ceilingUsd, `project ${row.projectId}`);
    } else if (row.alertUsd !== null || row.ceilingUsd !== null) {
      refuse(
        `project ${row.projectId} is ${row.posture} but carries executable dollar values`,
      );
    }
    return row;
  });
  const productionRow = rows.find((row) => row.projectId === DEFAULT_PROJECT_ID);
  if (!productionRow) {
    refuse("COST_CEILING_PROJECTS is missing the Production project row");
  }
  if (
    productionRow.posture !== "armed" ||
    productionRow.alertUsd !== source.PRODUCTION_MONTHLY_ALERT_USD ||
    productionRow.ceilingUsd !== source.PRODUCTION_MONTHLY_CEILING_USD
  ) {
    refuse(
      "the Production project row does not match the named Production alert and ceiling exports",
    );
  }
  return {
    productionAlertUsd: source.PRODUCTION_MONTHLY_ALERT_USD,
    productionCeilingUsd: source.PRODUCTION_MONTHLY_CEILING_USD,
    rows,
  };
}

function assertOrderedThresholds(alertUsd, ceilingUsd, label) {
  if (
    typeof alertUsd !== "number" ||
    typeof ceilingUsd !== "number" ||
    !Number.isFinite(alertUsd) ||
    !Number.isFinite(ceilingUsd) ||
    alertUsd <= 0 ||
    ceilingUsd <= 0 ||
    alertUsd >= ceilingUsd
  ) {
    refuse(`${label} must provide positive finite alert < ceiling values`);
  }
  canonicalDollar(alertUsd);
  canonicalDollar(ceilingUsd);
}

function assertShellSafeConfig(config) {
  if (
    !validProjectId(config.project) ||
    !validProjectNumber(config.projectNumber) ||
    !/^[A-F0-9]{6}-[A-F0-9]{6}-[A-F0-9]{6}$/.test(config.billingAccount) ||
    !/^[a-z]+-[a-z]+[0-9]$/.test(config.region) ||
    !/^[A-Za-z][A-Za-z0-9._~+%-]{2,254}$/.test(config.topic) ||
    !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(config.serviceAccount)
  ) {
    refuse("the selected runbook identifiers are malformed or shell-unsafe");
  }
}

function assertValidatedConfig(config) {
  if (!config || typeof config !== "object" || !VALIDATED_CONFIGS.has(config)) {
    refuse(
      "runbook rendering requires an exact validated S52 source/project configuration",
    );
  }
}

function canonicalDollar(value) {
  const rendered = String(value);
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(rendered)) {
    refuse("S52 dollar values must have a canonical non-exponent decimal form");
  }
  return rendered;
}

function canonicalRatio(value) {
  if (!Number.isFinite(value) || value <= 0 || value >= 1) {
    refuse("the S52 alert threshold ratio is invalid");
  }
  const rendered = value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  const renderedValue = Number(rendered);
  if (
    !/^0\.[0-9]+$/.test(rendered) ||
    !Number.isFinite(renderedValue) ||
    renderedValue <= 0 ||
    renderedValue >= 1
  ) {
    refuse("the S52 alert threshold ratio cannot be rendered safely");
  }
  return rendered;
}

function validProjectId(value) {
  return typeof value === "string" && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value);
}

function validProjectNumber(value) {
  return typeof value === "string" && /^[0-9]{6,20}$/.test(value);
}

function cleanOptionalEnv(value) {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  return normalized || undefined;
}

function refuse(message) {
  throw new BudgetPlanRefusal(message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
