import { describe, expect, it } from "vitest";
import { buildCutoverReport } from "../../scripts/build-cutover-report.mjs";
import { buildDemoDeployCommand } from "../../scripts/deploy-demo-cloud-run.mjs";
import { buildGcpSetupPlan } from "../../scripts/preflight-gcp-setup.mjs";
import {
  readProductionPreflightEnv,
  validateProductionCutoverConfig,
} from "../../scripts/preflight-production-cutover.mjs";
import { buildSourceCorpusReadiness } from "../../scripts/source-corpus-readiness.mjs";
import { readSourceManifest } from "../../scripts/source-corpus-manifest.mjs";
import { runCutoverDryRun } from "../../scripts/cutover-dry-run.mjs";

// Relative to the repo root (vitest CWD). Every call passes env:{} + this env file so the
// host's on-disk `.env.local` never leaks into the result and the verdicts stay hermetic.
const GOLDEN_ENV = "tests/fixtures/cutover/golden-production.env.fixture";
const GOLDEN_MANIFEST = "tests/fixtures/cutover/golden-production-source-manifest.json";

const goldenEnv = () => readProductionPreflightEnv({ env: {}, envFile: GOLDEN_ENV });

const expectNoCutoverCommands = (report) => {
  expect(report.gcp_plan.apis.enable_command).toBe("");
  expect(report.gcp_plan.firebase.setup_commands).toEqual([]);
  expect(report.gcp_plan.firestore.create_command).toBe("");
  expect(report.gcp_plan.firestore.deploy_rules_command).toBe("");
  expect(report.gcp_plan.firestore.seed_commands).toEqual([]);
  if (report.corpus.evaluated) {
    expect(report.corpus.upload_commands).toEqual([]);
    expect(report.corpus.import_commands).toEqual([]);
    expect(report.corpus.seed_commands).toEqual([]);
  }
  expect(report.deploy.command_preview).toBe("");
  expect(report.rollback.flatMap((step) => step.commands)).toEqual([]);
  expect(report.rollback_ready).toBe(false);
};

describe("golden production fixtures pass every cutover gate", () => {
  it("source corpus manifest is import-ready", () => {
    const readiness = buildSourceCorpusReadiness(readSourceManifest(GOLDEN_MANIFEST));

    expect(readiness.ok).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.counts.entries).toBe(3);
  });

  it("production env preflight passes with no errors", () => {
    const result = validateProductionCutoverConfig(goldenEnv());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("deploy command preview is clean", () => {
    const deploy = buildDemoDeployCommand({
      argv: ["--allow-multiple-spaces", "--project=sample-kb-fixture-prod"],
      env: goldenEnv(),
      localEnv: {},
    });

    expect(deploy.ok).toBe(true);
    expect(deploy.errors).toEqual([]);
    const command = [deploy.command, ...deploy.args].join(" ");
    expect(command).toContain("run deploy");
    // Dev↔prod parity: the non-secret live-connection identifiers are forwarded as env vars, and the
    // RentVine credentials are wired via Secret Manager (--set-secrets), never inlined as env values.
    expect(command).toContain("RENTVINE_API_BASE_URL=https://pmikcmetro.rentvine.com");
    expect(command).toContain("SHEETS_DWD_SUBJECT=kb-reader@pmikcmetro.com");
    expect(command).toContain(
      "GMAIL_PUBSUB_TOPIC=projects/sample-kb-fixture-prod/topics/gmail-workflow-events",
    );
    const secretsFlag = deploy.args.find((arg) => arg.startsWith("--set-secrets"));
    expect(secretsFlag).toBeDefined();
    expect(secretsFlag).toContain("RENTVINE_API_KEY=RENTVINE_API_KEY:latest");
    expect(secretsFlag).toContain("RENTVINE_API_SECRET=RENTVINE_API_SECRET:latest");
  });

  it("GCP infra plan is ready with notification delivery disabled", () => {
    const plan = buildGcpSetupPlan({
      projectId: "sample-kb-fixture-prod",
      env: goldenEnv(),
      awayModeActive: false,
      rulesFileExists: true,
      definedIndexCount: 1,
    });

    expect(plan.firestore.rules_file_exists).toBe(true);
    expect(plan.firestore.defined_index_count).toBe(1);
    expect(plan.blockers).toEqual([]);
    expect(plan.warnings).toEqual([]);
  });
});

describe("cutover report on golden fixtures", () => {
  const report = () =>
    buildCutoverReport({
      argv: [
        `--env-file=${GOLDEN_ENV}`,
        `--manifest=${GOLDEN_MANIFEST}`,
        "--project=sample-kb-fixture-prod",
        "--location=us",
        "--prior-revision=pmi-kc-kb-demo-00001-prior",
      ],
      env: {},
      awayModeActive: false,
    });

  it("greens every section without enabling approval-email delivery", () => {
    const r = report();

    expect(r.production_env.ok).toBe(true);
    expect(r.corpus.evaluated).toBe(true);
    expect(r.corpus.readiness.ok).toBe(true);
    expect(r.deploy.ok).toBe(true);
    expect(r.corpus.upload_commands.length).toBe(3);
    expect(r.rollback_ready).toBe(true);
    expect(r.target).toEqual({
      region: "us-central1",
      service: "pmi-kc-kb-demo",
    });
    expect(r.deploy.command_preview).toContain("run deploy pmi-kc-kb-demo");
    expect(r.deploy.command_preview).toContain("--region=us-central1");
    expect(r.rollback[0].commands[0]).toContain(
      "--to-revisions=pmi-kc-kb-demo-00001-prior=100",
    );
    expect(r.rollback[0].commands[0]).toContain("services update-traffic pmi-kc-kb-demo");
    expect(r.rollback[0].commands[0]).toContain("--region=us-central1");
    expect(r.rollback.slice(1).every((step) => step.commands.length === 0)).toBe(true);
    expect(JSON.stringify(r.rollback)).not.toContain("confirm-delete");
    expect(JSON.stringify(r.rollback)).not.toContain("gcloud storage rm");
    expect(JSON.stringify(r.rollback)).not.toContain("firebase -- deploy");
    expect(JSON.stringify(r.rollback)).not.toContain("services delete");
    expect(r.readiness.blockers).toEqual([]);
    expect(r.readiness.ok).toBe(true);
  });

  it("blocks an otherwise green report when no source manifest is provided", () => {
    const r = buildCutoverReport({
      argv: [
        `--env-file=${GOLDEN_ENV}`,
        "--project=sample-kb-fixture-prod",
        "--prior-revision=pmi-kc-kb-demo-00001-prior",
      ],
      env: {},
      awayModeActive: false,
    });

    expect(r.readiness.ok).toBe(false);
    expect(r.readiness.blockers).toContain(
      "corpus: No --manifest provided. Pass --manifest=temp/client-production-source-manifest.json once the reviewed manifest exists.",
    );
  });

  it("rejects a cross-project CLI override and keeps every command on the reviewed project", () => {
    const r = buildCutoverReport({
      argv: [
        `--env-file=${GOLDEN_ENV}`,
        `--manifest=${GOLDEN_MANIFEST}`,
        "--project=other-project",
        "--location=us",
        "--prior-revision=pmi-kc-kb-demo-00001-prior",
      ],
      env: {},
      awayModeActive: false,
    });

    expect(r.readiness.ok).toBe(false);
    expect(r.readiness.blockers.some((blocker) => blocker.startsWith("target:"))).toBe(
      true,
    );
    const commands = JSON.stringify({
      gcp: r.gcp_plan,
      corpus: r.corpus,
      deploy: r.deploy,
      rollback: r.rollback,
    });
    expect(commands).not.toContain("other-project");
    expect(r.project.id).toBe("sample-kb-fixture-prod");
    expectNoCutoverCommands(r);
  });

  it.each([
    {
      label: "Sheets service account",
      override: {
        SHEETS_IMPERSONATE_SA: "kb-sheets-reader@other-project.iam.gserviceaccount.com",
      },
    },
    {
      label: "Firebase auth domain",
      override: { NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "other-project.firebaseapp.com" },
    },
    {
      label: "Gmail DWD service account",
      override: {
        GMAIL_DWD_SA: "workflow-mail@other-project.iam.gserviceaccount.com",
      },
    },
    {
      label: "Gmail Pub/Sub push service account",
      override: {
        GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT:
          "gmail-pubsub-push@other-project.iam.gserviceaccount.com",
      },
    },
    {
      label: "Gmail Pub/Sub topic",
      override: {
        GMAIL_PUBSUB_TOPIC: "projects/other-project/topics/gmail-workflow-events",
      },
    },
  ])("rejects a mismatched $label even without a CLI project flag", ({ override }) => {
    const r = buildCutoverReport({
      argv: [
        `--manifest=${GOLDEN_MANIFEST}`,
        "--location=us",
        "--prior-revision=pmi-kc-kb-demo-00001-prior",
      ],
      env: { ...goldenEnv(), ...override },
      awayModeActive: false,
    });

    expect(r.readiness.ok).toBe(false);
    expect(
      r.readiness.blockers.some(
        (blocker) => blocker.startsWith("target:") && blocker.includes("other-project"),
      ),
    ).toBe(true);
    const commands = JSON.stringify({
      gcp: r.gcp_plan,
      corpus: r.corpus,
      deploy: r.deploy,
      rollback: r.rollback,
    });
    expect(commands).not.toContain("other-project");
    expect(r.project.id).toBe("sample-kb-fixture-prod");
    expect(r.deploy.command_preview).toBe("");
    expect(r.corpus.upload_commands).toEqual([]);
    expect(r.corpus.import_commands).toEqual([]);
    expect(r.corpus.seed_commands).toEqual([]);
    expect(r.rollback.flatMap((step) => step.commands)).toEqual([]);
  });

  it.each([
    {
      label: "unbound default-compute Sheets identity",
      override: {
        SHEETS_IMPERSONATE_SA: "1234567890@developer.gserviceaccount.com",
      },
    },
    {
      label: "malformed Cloud Run identity",
      override: {
        CLOUD_RUN_SERVICE_ACCOUNT:
          "kb-runtime;Write-Output-INJECTED@sample-kb-fixture-prod.iam.gserviceaccount.com",
      },
    },
    {
      label: "malformed Gmail DWD identity",
      override: { GMAIL_DWD_SA: "not-a-service-account@example.invalid" },
    },
    {
      label: "malformed Gmail Pub/Sub push identity",
      override: {
        GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT: "not-a-service-account@example.invalid",
      },
    },
    {
      label: "malformed Gmail Pub/Sub topic",
      override: { GMAIL_PUBSUB_TOPIC: "topics/gmail-workflow-events" },
    },
  ])("rejects an $label before command generation", ({ override }) => {
    const r = buildCutoverReport({
      argv: [
        `--manifest=${GOLDEN_MANIFEST}`,
        "--location=us",
        "--prior-revision=pmi-kc-kb-demo-00001-prior",
      ],
      env: { ...goldenEnv(), ...override },
      awayModeActive: false,
    });

    expect(r.readiness.ok).toBe(false);
    expect(
      r.readiness.blockers.some(
        (blocker) =>
          blocker.startsWith("target:") && blocker.includes("not a valid GCP project id"),
      ),
    ).toBe(true);
    expectNoCutoverCommands(r);
  });

  it.each([
    "GMAIL_DWD_SA",
    "GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT",
    "GMAIL_PUBSUB_TOPIC",
    "GMAIL_PUBSUB_AUDIENCE",
  ])("suppresses every command when %s is missing", (name) => {
    const r = buildCutoverReport({
      argv: [
        `--manifest=${GOLDEN_MANIFEST}`,
        "--location=us",
        "--prior-revision=pmi-kc-kb-demo-00001-prior",
      ],
      env: { ...goldenEnv(), [name]: "" },
      awayModeActive: false,
    });

    expect(r.readiness.ok).toBe(false);
    expect(
      r.readiness.blockers.some((blocker) => blocker.includes(`${name} must be set`)),
    ).toBe(true);
    expectNoCutoverCommands(r);
  });

  it("rejects an unsafe search location before command generation", () => {
    const unsafeLocation = "us;Write-Output-INJECTED";
    const r = buildCutoverReport({
      argv: [
        `--manifest=${GOLDEN_MANIFEST}`,
        `--location=${unsafeLocation}`,
        "--prior-revision=pmi-kc-kb-demo-00001-prior",
      ],
      env: goldenEnv(),
      awayModeActive: false,
    });

    expect(r.readiness.ok).toBe(false);
    expect(r.readiness.blockers).toContain(
      "target: --location must be exactly us; no commands were generated.",
    );
    expect(JSON.stringify(r)).not.toContain(unsafeLocation);
    expectNoCutoverCommands(r);
  });

  it("rejects an invalid selected project before command generation", () => {
    const r = buildCutoverReport({
      argv: [
        "--env-file=tests/fixtures/empty-env.fixture",
        `--manifest=${GOLDEN_MANIFEST}`,
        "--project=INVALID_PROJECT",
        "--prior-revision=pmi-kc-kb-demo-00001-prior",
      ],
      env: {},
      awayModeActive: false,
    });

    expect(r.readiness.ok).toBe(false);
    expect(
      r.readiness.blockers.some((blocker) => blocker.includes("not a valid GCP project")),
    ).toBe(true);
    expect(
      JSON.stringify({ corpus: r.corpus, deploy: r.deploy, rollback: r.rollback }),
    ).not.toContain("INVALID_PROJECT");
  });
});

describe("cutover dry-run rehearsal", () => {
  it("passes on the golden fixtures with no unexpected blockers", () => {
    const result = runCutoverDryRun();

    expect(result.ok).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.gates).toEqual({
      productionEnv: true,
      corpus: true,
      deploy: true,
      rollback: true,
      noBlockers: true,
    });
  });
});

describe("production env preflight rejects broken configs", () => {
  const withEnv = (overrides) =>
    validateProductionCutoverConfig({ ...goldenEnv(), ...overrides });
  const hasError = (result, needle) =>
    result.errors.some((error) => error.includes(needle));

  it("rejects ASK_DEMO_MODE=true", () => {
    expect(
      hasError(withEnv({ ASK_DEMO_MODE: "true" }), "ASK_DEMO_MODE must be false"),
    ).toBe(true);
  });

  it("rejects an explicitly named Console test deployment", () => {
    expect(
      hasError(
        withEnv({ CONSOLE_TEST_DEPLOYMENT_NAME: "test-staging-1" }),
        "CONSOLE_TEST_DEPLOYMENT_NAME must be empty",
      ),
    ).toBe(true);
  });

  it("rejects a non-https APP_BASE_URL", () => {
    expect(
      hasError(
        withEnv({ APP_BASE_URL: "http://kb.sample-kb-fixture.example" }),
        "APP_BASE_URL must be an https URL",
      ),
    ).toBe(true);
  });

  it("rejects a demo project id", () => {
    expect(
      hasError(
        withEnv({ GCP_PROJECT_ID: "pmikckb-test" }),
        "must not point at demo project",
      ),
    ).toBe(true);
  });

  it("rejects a missing Firebase api key", () => {
    expect(
      hasError(
        withEnv({ NEXT_PUBLIC_FIREBASE_API_KEY: "" }),
        "NEXT_PUBLIC_FIREBASE_API_KEY must be set",
      ),
    ).toBe(true);
  });

  it.each([
    "GMAIL_DWD_SA",
    "GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT",
    "GMAIL_PUBSUB_TOPIC",
    "GMAIL_PUBSUB_AUDIENCE",
  ])("rejects a missing %s", (name) => {
    expect(hasError(withEnv({ [name]: "" }), `${name} must be set`)).toBe(true);
  });

  it.each([
    "http://kb.sample-kb-fixture.example/api/gmail-hub/pubsub",
    "https://wrong.example.invalid/api/gmail-hub/pubsub",
    "https://kb.sample-kb-fixture.example/wrong-path",
  ])("rejects Gmail Pub/Sub audience drift: %s", (audience) => {
    expect(
      hasError(
        withEnv({ GMAIL_PUBSUB_AUDIENCE: audience }),
        "GMAIL_PUBSUB_AUDIENCE must exactly equal the production push endpoint",
      ),
    ).toBe(true);
  });

  it("allows an app-plane deploy with notifications disabled and warns clearly", () => {
    const result = withEnv({
      KB_APPROVAL_NOTIFICATIONS_ENABLED: "false",
      KB_APPROVAL_RECIPIENTS: "",
      KB_APPROVAL_SENDER: "",
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain(
      "KB approval email notifications remain disabled. App-plane production deployment is allowed, but notification delivery is not part of this cutover.",
    );
  });

  it("rejects a non-pmikcmetro approval recipient", () => {
    expect(
      hasError(
        withEnv({
          KB_APPROVAL_NOTIFICATIONS_ENABLED: "true",
          KB_APPROVAL_SENDER: "kb-bot@pmikcmetro.com",
          KB_APPROVAL_RECIPIENTS: "ops@gmail.com",
        }),
        "must use only pmikcmetro.com email addresses",
      ),
    ).toBe(true);
  });

  it("rejects a wrong allowed hosted domain", () => {
    expect(
      hasError(
        withEnv({ ALLOWED_HD: "example.com" }),
        "ALLOWED_HD must be pmikcmetro.com",
      ),
    ).toBe(true);
  });

  it("rejects a missing maintenance photo Drive folder (prod forces the Drive image store)", () => {
    // Clearing the dedicated var with no legacy SPACE_DRIVE_FOLDER_IDS fallback leaves the photo store
    // with nowhere to upload, which would 503 every field-photo upload in production.
    expect(
      hasError(
        withEnv({ MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: "" }),
        "a maintenance photo Drive folder is required",
      ),
    ).toBe(true);
  });

  it("rejects a gs:// Cloud Storage URI for the maintenance photo folder", () => {
    expect(
      hasError(
        withEnv({ MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: "gs://bucket/maintenance/" }),
        "must be a Google Drive folder id, not a Cloud Storage (gs://) URI",
      ),
    ).toBe(true);
  });

  it("accepts the legacy SPACE_DRIVE_FOLDER_IDS fallback for the maintenance photo folder", () => {
    // Back-compat: a folder in the legacy map key still satisfies the requirement. Co-locating it in the
    // KB-source map also requires its Vertex data store (the cross-link), so configure both here.
    const result = withEnv({
      MAINTENANCE_PHOTO_DRIVE_FOLDER_ID: "",
      SPACE_DRIVE_FOLDER_IDS:
        '{"lease-renewals":"fixture-drive-folder-lease-renewals","maintenance-work-order-intake":"legacy-maint-folder"}',
      SPACE_VERTEX_DATA_STORE_IDS:
        '{"lease-renewals":"kb-lease-renewals-fixture-txt","maintenance-work-order-intake":"kb-maintenance-fixture-txt"}',
    });

    expect(hasError(result, "a maintenance photo Drive folder is required")).toBe(false);
    expect(result.ok).toBe(true);
  });

  it("rejects a missing RentVine tenant base URL (dev↔prod parity)", () => {
    expect(
      hasError(
        withEnv({ RENTVINE_API_BASE_URL: "" }),
        "RENTVINE_API_BASE_URL must be set",
      ),
    ).toBe(true);
  });

  it("rejects a RentVine base URL for the wrong tenant account", () => {
    expect(
      hasError(
        withEnv({
          RENTVINE_API_BASE_URL: "https://someoneelse.rentvine.com/api/manager",
        }),
        'is not the expected "pmikcmetro"',
      ),
    ).toBe(true);
  });

  it("rejects a non-RentVine host for the RentVine base URL", () => {
    expect(
      hasError(
        withEnv({ RENTVINE_API_BASE_URL: "https://pmikcmetro.example.com/api" }),
        "must be a RentVine tenant host",
      ),
    ).toBe(true);
  });

  it("rejects a missing renewal sheet id", () => {
    expect(
      hasError(withEnv({ RENEWAL_SHEET_ID: "" }), "RENEWAL_SHEET_ID must be set"),
    ).toBe(true);
  });

  it("rejects a non-service-account Sheets DWD impersonation identity", () => {
    expect(
      hasError(
        withEnv({ SHEETS_IMPERSONATE_SA: "kb-reader@pmikcmetro.com" }),
        "SHEETS_IMPERSONATE_SA must be a GCP service account",
      ),
    ).toBe(true);
  });

  it("rejects a non-pmikcmetro Sheets DWD subject (identity rule)", () => {
    expect(
      hasError(
        withEnv({ SHEETS_DWD_SUBJECT: "reader@gmail.com" }),
        "SHEETS_DWD_SUBJECT must use only pmikcmetro.com email addresses",
      ),
    ).toBe(true);
  });
});

describe("source corpus readiness rejects broken manifests", () => {
  const withEntry0 = (overrides) => {
    const entries = readSourceManifest(GOLDEN_MANIFEST);
    entries[0] = { ...entries[0], ...overrides };
    return buildSourceCorpusReadiness(entries);
  };
  const hasBlocker = (readiness, needle) =>
    readiness.blockers.some((blocker) => blocker.includes(needle));

  it("rejects an unapproved entry", () => {
    expect(
      hasBlocker(
        withEntry0({ approval_status: "Unreviewed" }),
        "production import requires Approved",
      ),
    ).toBe(true);
  });

  it("rejects an unreplaced bucket placeholder", () => {
    expect(
      hasBlocker(
        withEntry0({ gcs_uri: "gs://<client-source-bucket>/x.txt" }),
        "must be replaced with a real production value",
      ),
    ).toBe(true);
  });

  it("rejects a placeholder data store id", () => {
    expect(
      hasBlocker(
        withEntry0({ data_store_id: "<data-store-id>" }),
        "must be replaced with a real production value",
      ),
    ).toBe(true);
  });

  it("rejects a High sensitivity source", () => {
    expect(
      hasBlocker(
        withEntry0({ sensitivity: "High" }),
        "High sensitivity and must not be imported",
      ),
    ).toBe(true);
  });
});
