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
  readProductionPreflightEnv,
  validateProductionCutoverConfig,
} from "./preflight-production-cutover.mjs";
import { buildSourceCorpusPlan, readSourceManifest } from "./source-corpus-manifest.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export const CUTOVER_RUNBOOK = "docs/client-production-cutover.md";

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
  const readArg = (name) => {
    const match = argv.find((arg) => arg.startsWith(`--${name}=`));
    return match ? match.slice(name.length + 3) : undefined;
  };

  return {
    envFile: readArg("env-file"),
    json: argv.includes("--json"),
    location: readArg("location"),
    manifest: readArg("manifest"),
    project: readArg("project"),
    service: readArg("service"),
  };
}

export function buildRollbackPlan({
  project = "<client-project-id>",
  service = "pmi-kc-kb",
  region = "us-central1",
  location = "us",
  dataStoreIds = [],
  uploadedUris = [],
  seededSpaceIds = [],
} = {}) {
  const dataStores = dataStoreIds.length > 0 ? dataStoreIds : ["<data-store-id>"];
  const uris =
    uploadedUris.length > 0 ? uploadedUris : ["gs://<client-source-bucket>/<path>.txt"];
  const spaces = seededSpaceIds.length > 0 ? seededSpaceIds : ["<space-id>"];

  return [
    {
      step: 1,
      action: "Remove or roll back the Cloud Run service",
      commands: [
        `gcloud run services delete ${service} --project=${project} --region=${region} --quiet`,
      ],
      note: "Only delete a newly created service. For an existing service, redeploy the previous revision instead: `gcloud run services update-traffic`.",
    },
    {
      step: 2,
      action: "Delete imported Agent Search data stores",
      commands: dataStores.flatMap((dataStoreId) => [
        `npm run delete:agent-search-data-store -- --project=${project} --location=${location} --data-store=${dataStoreId} --dry-run`,
        `npm run delete:agent-search-data-store -- --project=${project} --location=${location} --data-store=${dataStoreId} --confirm-delete=${dataStoreId}`,
      ]),
      note: "The delete script refuses data stores still mapped in SPACE_VERTEX_DATA_STORE_IDS; clear the env map first.",
    },
    {
      step: 3,
      action: "Remove uploaded staging copies from Cloud Storage",
      commands: uris.map((uri) => `gcloud storage rm "${uri}"`),
      note: "Only removes the generated `.txt` staging copies; original client sources are never touched by the pipeline.",
    },
    {
      step: 4,
      action: "Remove seeded app-owned metadata",
      commands: [],
      note: `Delete the seeded Firestore documents: sources_meta entries for the removed URIs and spaces/${spaces.join(", spaces/")} if they should not persist. These are app-owned metadata records, not client data.`,
    },
    {
      step: 5,
      action: "Revert Firestore rules/indexes if they changed",
      commands: [
        `npm exec firebase -- deploy --only firestore:rules,firestore:indexes --project ${project}`,
      ],
      note: "Check out the previous firestore.rules / firestore.indexes.json from git history before redeploying.",
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
  const projectId =
    args.project || mergedEnv.GCP_PROJECT_ID || mergedEnv.FIREBASE_PROJECT_ID;
  const blockers = [];
  const warnings = [];

  const gcpPlan = buildGcpSetupPlan({ projectId, env: mergedEnv, awayModeActive });
  const gcpReadiness = buildGcpReadiness(gcpPlan);
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
        location: args.location,
      });
      corpus = {
        evaluated: true,
        manifest: args.manifest,
        readiness: plan.readiness,
        upload_commands: plan.uploadCommands,
        import_commands: plan.importCommands,
        seed_commands: plan.seedCommands,
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
    warnings.push(`corpus: ${corpus.reason}`);
  }

  const deployArgs = [
    ...(projectId ? [`--project=${projectId}`] : []),
    ...(args.service ? [`--service=${args.service}`] : []),
    "--allow-multiple-spaces",
  ];
  const deploy = buildDemoDeployCommand({
    argv: deployArgs,
    env: mergedEnv,
    localEnv: {},
  });
  const deployPlan = {
    ok: deploy.ok,
    errors: deploy.errors,
    command_preview: [deploy.command, ...deploy.args].join(" "),
  };
  blockers.push(...deploy.errors.map((error) => `deploy: ${error}`));

  const corpusEntries = corpus.evaluated ? corpus : undefined;
  const rollback = buildRollbackPlan({
    project: projectId ?? undefined,
    service: args.service ?? undefined,
    location: args.location ?? undefined,
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

  const readiness = {
    ok: blockers.length === 0,
    blockers,
    warnings,
  };

  return {
    generated_at: new Date().toISOString(),
    mode: "dry-run",
    project: { id: projectId ?? null },
    budget,
    gcp_plan: gcpPlan,
    production_env: productionEnv,
    corpus,
    deploy: deployPlan,
    rollback,
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

function printHumanReport(report) {
  console.log(
    `Cutover report (${report.mode}) for project: ${report.project.id ?? "<unset>"}`,
  );
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
  console.log(`- Rollback steps: ${report.rollback.length}`);
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
