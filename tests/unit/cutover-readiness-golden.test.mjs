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
import {
  EXPECTED_RESIDUAL_BLOCKER,
  runCutoverDryRun,
} from "../../scripts/cutover-dry-run.mjs";

// Relative to the repo root (vitest CWD). Every call passes env:{} + this env file so the
// host's on-disk `.env.local` never leaks into the result and the verdicts stay hermetic.
const GOLDEN_ENV = "tests/fixtures/cutover/golden-production.env.fixture";
const GOLDEN_MANIFEST = "tests/fixtures/cutover/golden-production-source-manifest.json";

const goldenEnv = () => readProductionPreflightEnv({ env: {}, envFile: GOLDEN_ENV });

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
    const secretsFlag = deploy.args.find((arg) => arg.startsWith("--set-secrets"));
    expect(secretsFlag).toBeDefined();
    expect(secretsFlag).toContain("RENTVINE_API_KEY=RENTVINE_API_KEY:latest");
    expect(secretsFlag).toContain("RENTVINE_API_SECRET=RENTVINE_API_SECRET:latest");
  });

  it("GCP infra plan is ready except the documented notification-send approval", () => {
    const plan = buildGcpSetupPlan({
      projectId: "sample-kb-fixture-prod",
      env: goldenEnv(),
      awayModeActive: false,
      rulesFileExists: true,
      definedIndexCount: 1,
    });

    expect(plan.firestore.rules_file_exists).toBe(true);
    expect(plan.firestore.defined_index_count).toBe(1);
    // The only GCP-plan blocker is the budget guard refusing the live notification send; every
    // structural setup item (project, rules, indexes) is clean.
    expect(plan.blockers).toHaveLength(1);
    expect(plan.blockers[0]).toContain("KB approval Gmail notifications are enabled");
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
      ],
      env: {},
      awayModeActive: false,
    });

  it("greens every section except the one expected residual blocker", () => {
    const r = report();

    expect(r.production_env.ok).toBe(true);
    expect(r.corpus.evaluated).toBe(true);
    expect(r.corpus.readiness.ok).toBe(true);
    expect(r.deploy.ok).toBe(true);
    expect(r.corpus.upload_commands.length).toBe(3);
    // Locks the load-bearing interaction: a production-valid env requires notifications enabled,
    // so the report's ONLY residual blocker is the approval-gated live send. If a future change
    // leaks another blocker (or resolves this one without an approval path), this fails loudly.
    expect(r.readiness.blockers).toEqual([EXPECTED_RESIDUAL_BLOCKER]);
    expect(r.readiness.ok).toBe(false);
  });
});

describe("cutover dry-run rehearsal", () => {
  it("passes on the golden fixtures with no unexpected blockers", () => {
    const result = runCutoverDryRun();

    expect(result.ok).toBe(true);
    expect(result.residualBlockers).toEqual([]);
    expect(result.gates).toEqual({
      productionEnv: true,
      corpus: true,
      deploy: true,
      onlyExpectedResidual: true,
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
        withEnv({ KB_APPROVAL_RECIPIENTS: "ops@gmail.com" }),
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
