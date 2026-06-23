// PRINT-ONLY runbook generator for the budget kill switch (infra/budget-guardrail).
//
// This script NEVER executes a gcloud / billing-console command. Creating a budget, deploying the
// function, and granting billing-admin IAM are cost-bearing, billing-console, owner-side actions
// (a governance Hard Stop — see docs/autonomous-agent-runner.md). This emits the exact commands to
// run while authenticated as josiah@pmikcmetro.com, with this project's non-secret identifiers
// filled in. Override any value with --flag=value. Run: `npm run killswitch:plan`.

import { pathToFileURL } from "node:url";

// Non-secret identifiers, already recorded in docs/environment-handoff.md. Override via flags/env.
const DEFAULTS = {
  project: "pmi-kc-kb-prod",
  projectNumber: "558870356522",
  billingAccount: "01A5A3-65CA5A-614D45",
  region: "us-central1",
  topic: "budget-guardrail-topic",
  serviceAccount: "budget-guardrail",
  capUsd: "10",
  source: "infra/budget-guardrail",
  runtime: "nodejs20",
};

export function resolveConfig(argv = process.argv.slice(2), env = process.env) {
  const readArg = (name) => {
    const prefix = `--${name}=`;
    const hit = argv.find((entry) => entry.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : undefined;
  };
  const pick = (name, envName) => readArg(name) ?? (envName ? env[envName] : undefined);

  const project = pick("project", "GCP_PROJECT_ID") ?? DEFAULTS.project;
  const config = {
    project,
    projectNumber: pick("project-number") ?? DEFAULTS.projectNumber,
    billingAccount: pick("billing-account") ?? DEFAULTS.billingAccount,
    region: pick("region", "VERTEX_AI_LOCATION") ?? DEFAULTS.region,
    topic: pick("topic") ?? DEFAULTS.topic,
    serviceAccount: pick("service-account") ?? DEFAULTS.serviceAccount,
    capUsd: pick("cap-usd", "AUTONOMOUS_BUDGET_CAP_USD") ?? DEFAULTS.capUsd,
    source: DEFAULTS.source,
    runtime: DEFAULTS.runtime,
  };
  config.serviceAccountEmail = `${config.serviceAccount}@${config.project}.iam.gserviceaccount.com`;
  config.topicPath = `projects/${config.project}/topics/${config.topic}`;
  return config;
}

export function buildRunbook(c) {
  return [
    {
      title: "0. Authenticate + enable APIs (owner; uses the pmikcmetro.com account)",
      commands: [
        "gcloud auth login",
        `gcloud config set project ${c.project}`,
        `gcloud services enable billingbudgets.googleapis.com cloudbilling.googleapis.com pubsub.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com --project=${c.project}`,
      ],
    },
    {
      title: "1. Create the Pub/Sub topic the budget will publish to",
      commands: [`gcloud pubsub topics create ${c.topic} --project=${c.project}`],
    },
    {
      title:
        "2. Create the function's service account and grant the least-privilege role that can disable billing",
      commands: [
        `gcloud iam service-accounts create ${c.serviceAccount} --display-name="Budget kill switch" --project=${c.project}`,
        `gcloud projects add-iam-policy-binding ${c.project} --member="serviceAccount:${c.serviceAccountEmail}" --role="roles/billing.projectManager"`,
        "# Project Billing Manager is project-scoped and can UNLINK this project's billing (i.e. disable it).",
        "# It does NOT grant billing-account-wide admin. Re-linking a billing account (recovery) stays a human action.",
      ],
    },
    {
      title:
        "3. Deploy the kill-switch function (2nd gen; buildpack runs npm install from package.json)",
      commands: [
        `gcloud functions deploy budget-guardrail --gen2 --runtime=${c.runtime} --region=${c.region} --source=${c.source} --entry-point=budgetGuardrail --trigger-topic=${c.topic} --service-account=${c.serviceAccountEmail} --set-env-vars=KILL_SWITCH_PROJECT_ID=${c.project},KILL_SWITCH_CAP_USD=${c.capUsd} --project=${c.project}`,
      ],
    },
    {
      title:
        "3b. Allow the Eventarc trigger (it runs as the function SA) to invoke the Run service",
      commands: [
        `gcloud run services add-iam-policy-binding budget-guardrail --region=${c.region} --project=${c.project} --member="serviceAccount:${c.serviceAccountEmail}" --role="roles/run.invoker"`,
        "# Needed because the function uses a custom SA; without it the trigger fails with 'lacks run.invoke'.",
      ],
    },
    {
      title: `4. Create the $${c.capUsd} project-scoped budget (the CLI cannot attach the topic — see 4b)`,
      commands: [
        `gcloud billing budgets create --billing-account=${c.billingAccount} --display-name="${c.project} $${c.capUsd} kill switch" --filter-projects="projects/${c.projectNumber}" --budget-amount=${c.capUsd}USD --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0`,
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
        `# Topic to select: ${c.topicPath}`,
      ],
    },
    {
      title:
        "5. SAFE wiring test (no-op against prod) — publish a low-cost notification; the function logs 'no action'",
      commands: [
        "# Run from bash/sh — PowerShell mangles the inner JSON quotes.",
        `gcloud pubsub topics publish ${c.topic} --project=${c.project} --message='{"costAmount":0.01,"budgetAmount":${c.capUsd},"currencyCode":"USD","budgetDisplayName":"wiring-test"}'`,
        `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="budget-guardrail" AND textPayload:"budget-guardrail]"' --project=${c.project} --freshness=5m --limit=5 --format="value(timestamp,textPayload)"`,
      ],
    },
  ];
}

export function renderRunbook(c) {
  const lines = [
    "Budget kill-switch provisioning runbook (PRINT-ONLY — nothing here was executed).",
    "These are billing-console + cost-bearing actions: run them yourself while authed, with approval.",
    "",
    `  project          ${c.project} (number ${c.projectNumber})`,
    `  billing account  ${c.billingAccount}`,
    `  region           ${c.region}`,
    `  topic            ${c.topic}`,
    `  function SA       ${c.serviceAccountEmail}`,
    `  cap              $${c.capUsd}`,
    "",
    "SAFETY: never test the DISABLE path against the production project — step 5 is a no-op wiring",
    "test. To verify an actual disable, deploy + trip a throwaway project. The disable logic itself",
    "is already proven by tests/unit/budget-killswitch.test.mjs.",
    "",
  ];
  for (const step of buildRunbook(c)) {
    lines.push(`# ${step.title}`);
    for (const command of step.commands) lines.push(command);
    lines.push("");
  }
  return lines.join("\n");
}

export function main(argv = process.argv.slice(2), env = process.env) {
  const config = resolveConfig(argv, env);
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ config, steps: buildRunbook(config) }, null, 2));
  } else {
    console.log(renderRunbook(config));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
