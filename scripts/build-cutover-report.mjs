import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  evaluateBudgetGuard,
  readAwayModeStatus,
  readBudgetGuardConfig,
} from "./check-budget-guard.mjs";
import { buildDemoDeployCommand } from "./deploy-demo-cloud-run.mjs";
import {
  buildGcpSetupPlan,
  buildReadiness as buildGcpReadiness,
} from "./preflight-gcp-setup.mjs";
import {
  findGmailCutoverConfigErrors,
  readProductionPreflightEnv,
  validateProductionCutoverConfig,
} from "./preflight-production-cutover.mjs";
import { buildSourceCorpusPlan, readSourceManifest } from "./source-corpus-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const CUTOVER_RUNBOOK = "docs/client-production-cutover.md";
export const DEFAULT_CUTOVER_REGION = "us-central1";
export const DEFAULT_CUTOVER_SERVICE = "pmi-kc-kb-demo";
const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const SERVICE_ACCOUNT_PATTERN =
  /^[a-z][a-z0-9-]{4,28}[a-z0-9]@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/;
const CUTOVER_SEARCH_LOCATION = "us";

function nonempty(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function serviceAccountProject(value) {
  const email = nonempty(value);
  if (!email) return undefined;
  return SERVICE_ACCOUNT_PATTERN.exec(email)?.[1];
}

function requiredServiceAccountProject(value) {
  const email = nonempty(value);
  if (!email) return undefined;
  return serviceAccountProject(email) ?? "<unparseable-service-account>";
}

function firebaseAuthDomainProject(value) {
  const domain = nonempty(value);
  if (!domain) return undefined;
  return /^([a-z][a-z0-9-]{4,28}[a-z0-9])\.firebaseapp\.com$/i.exec(domain)?.[1];
}

function pubsubTopicProject(value) {
  const topic = nonempty(value);
  if (!topic) return undefined;
  return (
    /^projects\/([a-z][a-z0-9-]{4,28}[a-z0-9])\/topics\/[a-z][a-z0-9-]{2,254}$/.exec(
      topic,
    )?.[1] ?? "<unparseable-pubsub-topic>"
  );
}

function reviewedProjectBindings(env) {
  return [
    ["GCP_PROJECT_ID", nonempty(env.GCP_PROJECT_ID)],
    ["FIREBASE_PROJECT_ID", nonempty(env.FIREBASE_PROJECT_ID)],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", nonempty(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)],
    [
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN project",
      firebaseAuthDomainProject(env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    ],
    [
      "CLOUD_RUN_SERVICE_ACCOUNT project",
      requiredServiceAccountProject(env.CLOUD_RUN_SERVICE_ACCOUNT),
    ],
    [
      "SHEETS_IMPERSONATE_SA project",
      requiredServiceAccountProject(env.SHEETS_IMPERSONATE_SA),
    ],
    ["GMAIL_DWD_SA project", requiredServiceAccountProject(env.GMAIL_DWD_SA)],
    [
      "GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT project",
      requiredServiceAccountProject(env.GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT),
    ],
    ["GMAIL_PUBSUB_TOPIC project", pubsubTopicProject(env.GMAIL_PUBSUB_TOPIC)],
  ].filter(([, project]) => project !== undefined);
}

function withoutProjectCommands(plan) {
  return {
    ...plan,
    apis: { ...plan.apis, enable_command: "" },
    firebase: { ...plan.firebase, setup_commands: [] },
    firestore: {
      ...plan.firestore,
      create_command: "",
      deploy_rules_command: "",
      seed_commands: [],
    },
  };
}

const CUTOVER_VALUE_ARGS = new Map([
  ["--env-file", "envFile"],
  ["--location", "location"],
  ["--manifest", "manifest"],
  ["--prior-revision", "priorRevision"],
  ["--project", "project"],
]);
const CUTOVER_FLAG_ARGS = new Map([
  ["--help", "help"],
  ["--json", "json"],
]);

// Keep in sync with the "Production smoke checklist" bullets in
// docs/client-production-cutover.md §7. A doc-sync unit test enforces this.
export const PRODUCTION_SMOKE_CHECKLIST = [
  {
    id: "allowed-domain-sign-in",
    description: "Allowed-domain sign-in reaches `/ask`.",
  },
  {
    id: "wrong-domain-rejected",
    description: "Wrong-domain sign-in is rejected.",
  },
  {
    id: "admin-page",
    description: "Admin page opens for the Admin account.",
  },
  {
    id: "approved-space-records",
    description: "At least one approved Space opens and shows seeded records.",
  },
  {
    id: "ask-verified-source",
    description:
      "Ask returns a cited `Verified Source` answer from an approved production source.",
  },
  {
    id: "ask-no-source",
    description: "Ask returns `No Reliable Source Found` for an unsupported question.",
  },
  {
    id: "editor-cannot-approve",
    description: "User can save or suggest editable records but cannot approve.",
  },
  {
    id: "admin-queue-actions",
    description:
      "Admin can approve, return, assign, snooze, and disable eligible queue items.",
  },
  {
    id: "bulk-actions",
    description:
      "Admin can run Approval Queue bulk actions against real or explicitly approved test queue items, with per-item skipped reasons visible. Do not seed demo queue records in production just to test this path.",
  },
  {
    id: "no-system-of-record-writes",
    description:
      "The app does not write to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets, Gmail inboxes, Drive folders, or Gmail Inbox 0/legacy Owner Router source artifacts.",
  },
];

export function readRunbookSmokeChecklist(runbookPath = join(root, CUTOVER_RUNBOOK)) {
  const text = readFileSync(runbookPath, "utf8");
  const start = text.indexOf("Production smoke checklist:");

  if (start === -1) {
    throw new Error("Production smoke checklist section not found in the runbook.");
  }

  const section = text.slice(start).split(/\n##\s/)[0];
  const items = [];

  for (const line of section.split("\n")) {
    if (/^- /.test(line)) {
      items.push(line.slice(2).trim());
    } else if (/^ {2}\S/.test(line) && items.length > 0) {
      items[items.length - 1] += ` ${line.trim()}`;
    }
  }

  return items;
}

export function parseCutoverReportArgs(argv = process.argv.slice(2)) {
  const parsed = {
    envFile: undefined,
    help: false,
    json: false,
    location: undefined,
    manifest: undefined,
    priorRevision: undefined,
    project: undefined,
  };
  const seen = new Set();

  for (const arg of argv) {
    const [name, ...valueParts] = arg.split("=");
    const valueKey = CUTOVER_VALUE_ARGS.get(name);
    const flagKey = CUTOVER_FLAG_ARGS.get(arg);
    const key = valueKey ?? flagKey;

    if (!key) {
      throw new Error(`Unknown cutover report argument: ${arg}`);
    }
    if (seen.has(key)) {
      throw new Error(`Duplicate cutover report argument: ${name}`);
    }
    if (valueKey && (valueParts.length === 0 || valueParts.join("=").trim() === "")) {
      throw new Error(`Cutover report argument ${name} requires a value.`);
    }
    if (flagKey && valueParts.length > 0) {
      throw new Error(`Cutover report flag ${name} does not accept a value.`);
    }

    seen.add(key);
    parsed[key] = valueKey ? valueParts.join("=") : true;
  }

  return parsed;
}

export function buildRollbackPlan({
  project = "<client-project-id>",
  service = DEFAULT_CUTOVER_SERVICE,
  region = DEFAULT_CUTOVER_REGION,
  priorRevision,
  dataStoreIds = [],
  uploadedUris = [],
  seededSpaceIds = [],
} = {}) {
  const dataStores = dataStoreIds.length > 0 ? dataStoreIds : ["<data-store-id>"];
  const uris =
    uploadedUris.length > 0 ? uploadedUris : ["gs://<client-source-bucket>/<path>.txt"];
  const spaces = seededSpaceIds.length > 0 ? seededSpaceIds : ["<space-id>"];
  const escapedService = service.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const capturedPriorRevision =
    typeof priorRevision === "string" &&
    new RegExp(`^${escapedService}-\\d{5}-[a-z0-9]{3,}$`).test(priorRevision.trim())
      ? priorRevision.trim()
      : undefined;

  return [
    {
      step: 1,
      action: "Restore traffic to the captured prior Cloud Run revision",
      commands: capturedPriorRevision
        ? [
            `gcloud run services update-traffic ${service} --project=${project} --region=${region} --to-revisions=${capturedPriorRevision}=100`,
          ]
        : [],
      note: capturedPriorRevision
        ? `Restore 100% of traffic to the captured prior revision ${capturedPriorRevision}; preserve the service and revision history.`
        : `Capture the currently serving ${service} revision before deployment. No traffic-restore command is generated without an exact revision in the form ${service}-00001-abc.`,
    },
    {
      step: 2,
      action: "Inventory imported Agent Search data stores for separate cleanup review",
      commands: [],
      note: `No deletion command is generated. Candidate data stores: ${dataStores.join(", ")}. Verify provenance and active mappings, then obtain separate per-resource approval after service recovery.`,
    },
    {
      step: 3,
      action: "Inventory uploaded staging copies for separate cleanup review",
      commands: [],
      note: `No storage deletion command is generated. Candidate staging copies: ${uris.join(", ")}. Confirm each object is pipeline-generated and no longer referenced before a separate cleanup action.`,
    },
    {
      step: 4,
      action: "Inventory seeded app-owned metadata for separate cleanup review",
      commands: [],
      note: `No Firestore deletion command is generated. Candidate records include sources_meta entries for the listed staging copies and spaces/${spaces.join(", spaces/")}. Verify ownership and references before a separate cleanup action.`,
    },
    {
      step: 5,
      action: "Review whether Firestore rules or indexes require restoration",
      commands: [],
      note: "No unpinned configuration deploy command is generated. Restore only from a separately reviewed, immutable pre-deploy configuration reference.",
    },
  ];
}

export function buildCutoverReport({
  argv = [],
  env = process.env,
  awayModeActive = readAwayModeStatus() === "ACTIVE",
} = {}) {
  const args = parseCutoverReportArgs(argv);
  const mergedEnv = readProductionPreflightEnv({ env, envFile: args.envFile });
  const blockers = [];
  const warnings = [];
  const projectBindings = reviewedProjectBindings(mergedEnv);
  const configuredProjectId =
    nonempty(mergedEnv.GCP_PROJECT_ID) ||
    nonempty(mergedEnv.FIREBASE_PROJECT_ID) ||
    nonempty(mergedEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  // A CLI flag may confirm the reviewed environment project or fill an otherwise-empty draft, but it
  // can never redirect commands away from the Firebase/runtime/service-account identity boundary.
  const canonicalProjectId = configuredProjectId || args.project;
  if (canonicalProjectId && !PROJECT_ID_PATTERN.test(canonicalProjectId)) {
    blockers.push(`target: canonical project id ${canonicalProjectId} is invalid.`);
  }
  for (const [label, bindingProject] of projectBindings) {
    if (!PROJECT_ID_PATTERN.test(bindingProject)) {
      blockers.push(`target: ${label}=${bindingProject} is not a valid GCP project id.`);
    } else if (canonicalProjectId && bindingProject !== canonicalProjectId) {
      blockers.push(
        `target: ${label}=${bindingProject} conflicts with canonical project ${canonicalProjectId}.`,
      );
    }
  }
  if (args.project && !PROJECT_ID_PATTERN.test(args.project)) {
    blockers.push(`target: --project=${args.project} is not a valid GCP project id.`);
  } else if (args.project && canonicalProjectId && args.project !== canonicalProjectId) {
    blockers.push(
      `target: --project=${args.project} conflicts with canonical project ${canonicalProjectId}; commands remain pinned to ${canonicalProjectId}.`,
    );
  }
  const projectId =
    canonicalProjectId && PROJECT_ID_PATTERN.test(canonicalProjectId)
      ? canonicalProjectId
      : undefined;
  const projectIdentityOk = blockers.length === 0 && projectId !== undefined;
  const searchLocation = nonempty(args.location) ?? CUTOVER_SEARCH_LOCATION;
  const searchLocationOk = searchLocation === CUTOVER_SEARCH_LOCATION;
  if (!searchLocationOk) {
    blockers.push(
      `target: --location must be exactly ${CUTOVER_SEARCH_LOCATION}; no commands were generated.`,
    );
  }
  const gmailCommandErrors = findGmailCutoverConfigErrors(mergedEnv, {
    appBaseUrl: nonempty(mergedEnv.APP_BASE_URL),
    gcpProjectId: projectId,
  });
  const commandInputsOk =
    projectIdentityOk && searchLocationOk && gmailCommandErrors.length === 0;
  // This repository has one reviewed cutover target. A caller may select the
  // project, but cannot redirect deploy/rollback commands to another service
  // or region through report arguments.
  const targetService = DEFAULT_CUTOVER_SERVICE;
  const targetRegion = DEFAULT_CUTOVER_REGION;

  const rawGcpPlan = buildGcpSetupPlan({ projectId, env: mergedEnv, awayModeActive });
  const gcpReadiness = buildGcpReadiness(rawGcpPlan);
  const gcpPlan = commandInputsOk ? rawGcpPlan : withoutProjectCommands(rawGcpPlan);
  blockers.push(...gcpReadiness.blockers.map((blocker) => `gcp: ${blocker}`));
  warnings.push(...gcpReadiness.warnings.map((warning) => `gcp: ${warning}`));

  const productionEnv = validateProductionCutoverConfig(mergedEnv);
  blockers.push(...productionEnv.errors.map((error) => `env: ${error}`));
  warnings.push(...productionEnv.warnings.map((warning) => `env: ${warning}`));

  const budgetConfig = readBudgetGuardConfig(mergedEnv, {});
  const budgetResult = evaluateBudgetGuard(budgetConfig, { awayModeActive });
  const budget = {
    away_mode_active: awayModeActive,
    cap_usd: budgetConfig.budgetCapUsd,
    posture: budgetConfig.askDemoMode ? "demo" : "live",
    ok: budgetResult.ok,
    errors: budgetResult.errors,
    warnings: budgetResult.warnings,
  };

  let corpus;

  if (args.manifest) {
    try {
      const entries = readSourceManifest(args.manifest);
      const plan = buildSourceCorpusPlan(entries, {
        project: projectId,
        location: searchLocationOk ? searchLocation : CUTOVER_SEARCH_LOCATION,
      });
      corpus = {
        evaluated: true,
        manifest: args.manifest,
        readiness: plan.readiness,
        upload_commands: commandInputsOk ? plan.uploadCommands : [],
        import_commands: commandInputsOk ? plan.importCommands : [],
        seed_commands: commandInputsOk ? plan.seedCommands : [],
      };
      blockers.push(...plan.readiness.blockers.map((blocker) => `corpus: ${blocker}`));
      warnings.push(...plan.readiness.warnings.map((warning) => `corpus: ${warning}`));
    } catch (error) {
      corpus = {
        evaluated: false,
        manifest: args.manifest,
        reason: error instanceof Error ? error.message : String(error),
      };
      blockers.push(`corpus: manifest could not be evaluated (${corpus.reason}).`);
    }
  } else {
    corpus = {
      evaluated: false,
      reason:
        "No --manifest provided. Pass --manifest=temp/client-production-source-manifest.json once the reviewed manifest exists.",
    };
    blockers.push(`corpus: ${corpus.reason}`);
  }

  const deployPlan = commandInputsOk
    ? (() => {
        const deploy = buildDemoDeployCommand({
          argv: [
            `--project=${projectId}`,
            `--service=${targetService}`,
            `--region=${targetRegion}`,
            "--allow-multiple-spaces",
          ],
          env: mergedEnv,
          localEnv: {},
        });
        blockers.push(...deploy.errors.map((error) => `deploy: ${error}`));
        return {
          ok: deploy.ok,
          errors: deploy.errors,
          command_preview: [deploy.command, ...deploy.args].join(" "),
        };
      })()
    : {
        ok: false,
        errors: [
          "Reviewed project, search-location, and Gmail transport inputs must be coherent before command generation.",
        ],
        command_preview: "",
      };
  if (!commandInputsOk) {
    blockers.push(`deploy: ${deployPlan.errors[0]}`);
  }

  const corpusEntries = corpus.evaluated ? corpus : undefined;
  const rollback = buildRollbackPlan({
    project: commandInputsOk ? projectId : undefined,
    service: targetService,
    region: targetRegion,
    priorRevision: commandInputsOk ? args.priorRevision : undefined,
    dataStoreIds: corpusEntries
      ? [
          ...new Set(
            corpusEntries.import_commands.map(extractDataStoreId).filter(Boolean),
          ),
        ]
      : [],
    uploadedUris: corpusEntries
      ? corpusEntries.upload_commands.map(extractUploadUri).filter(Boolean)
      : [],
  });
  const rollbackReady = rollback[0].commands.length === 1;
  if (!commandInputsOk) {
    blockers.push(
      "rollback: reviewed project, search-location, and Gmail transport inputs must be coherent before command generation.",
    );
  } else if (!rollbackReady) {
    blockers.push(
      `rollback: --prior-revision=<captured-revision> is required and must match ${targetService}-00001-abc before deployment.`,
    );
  }

  const readiness = {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };

  return {
    generated_at: new Date().toISOString(),
    mode: "dry-run",
    project: { id: projectId ?? null },
    target: { region: targetRegion, service: targetService },
    budget,
    gcp_plan: gcpPlan,
    production_env: productionEnv,
    corpus,
    deploy: deployPlan,
    rollback,
    rollback_ready: rollbackReady,
    smoke_checklist: PRODUCTION_SMOKE_CHECKLIST,
    readiness,
    next_steps: readiness.ok
      ? [
          "Review the deploy command preview and rollback plan with the owner.",
          "Run the §7 production smoke checklist after deploy and record results in docs/status.md.",
        ]
      : [
          "Resolve the readiness blockers (they are prefixed with their section).",
          "Rerun `npm run cutover:report -- --json` until readiness.ok is true before any deploy.",
        ],
  };
}

function extractDataStoreId(importCommand) {
  const match = /--data-store=(\S+)/.exec(importCommand);
  return match ? match[1] : undefined;
}

function extractUploadUri(uploadCommand) {
  const match = /"(gs:\/\/[^"]+)"$/.exec(uploadCommand);
  return match ? match[1] : undefined;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseCutoverReportArgs(argv);

  if (args.help) {
    console.log(cutoverReportUsage());
    return undefined;
  }

  const report = buildCutoverReport({ argv, env });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }

  if (!report.readiness.ok) {
    process.exitCode = 1;
  }

  return report;
}

function cutoverReportUsage() {
  return [
    "Usage: npm run cutover:report -- --env-file=<path> --manifest=<path> --prior-revision=<revision> [options]",
    "Options: --project=<id> --location=<search-location> --json --help",
  ].join("\n");
}

function printHumanReport(report) {
  console.log(
    `Cutover report (${report.mode}) for project: ${report.project.id ?? "<unset>"}`,
  );
  console.log(`- Target: ${report.target.service} (${report.target.region})`);
  console.log(
    `- Budget posture: ${report.budget.posture}; away mode: ${report.budget.away_mode_active ? "active" : "inactive"}; cap: $${report.budget.cap_usd}`,
  );
  console.log(
    `- Production env preflight: ${report.production_env.ok ? "ok" : "failing"}`,
  );
  console.log(
    `- Corpus: ${report.corpus.evaluated ? `evaluated (${report.corpus.readiness.ok ? "ready" : "blocked"})` : `not evaluated — ${report.corpus.reason}`}`,
  );
  console.log(`- Deploy preflight: ${report.deploy.ok ? "ok" : "failing"}`);
  console.log(
    `- Rollback plan: ${report.rollback_ready ? "ready" : "missing captured prior revision"}; ${report.rollback.length} steps`,
  );
  console.log(`- Smoke checklist items: ${report.smoke_checklist.length}`);

  for (const warning of report.readiness.warnings) {
    console.warn(`WARNING: ${warning}`);
  }

  if (report.readiness.ok) {
    console.log("Cutover report has no blockers.");
  } else {
    for (const blocker of report.readiness.blockers) {
      console.error(`BLOCKER: ${blocker}`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
